import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const grid = document.getElementById("grid");

const bgMode = document.getElementById("bgMode");
const enhanceInput = document.getElementById("enhance");
const wrinkleInput = document.getElementById("wrinkle");
const cloudMode = document.getElementById("cloudMode");

let processedImages = [];

/* ---------------------------
   Mobile + Drag Upload
--------------------------- */

dropzone.onclick = () => fileInput.click();

fileInput.onchange = e => {
  processQueue([...e.target.files], 3);
};

dropzone.ondragover = e => e.preventDefault();
dropzone.ondrop = e => {
  e.preventDefault();
  processQueue([...e.dataTransfer.files], 3);
};

/* ---------------------------
   Queue (controlled concurrency)
--------------------------- */

async function processQueue(files, limit = 3) {
  const queue = [...files];

  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      await processImage(queue.shift());
    }
  });

  await Promise.all(workers);
}

/* ---------------------------
   Bounding Box (CRITICAL)
--------------------------- */

function getBoundingBox(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height);

  let top = height, left = width, right = 0, bottom = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 10) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  return { top, left, right, bottom };
}

/* ---------------------------
   FULL AI Enhancement (BEST VERSION)
--------------------------- */

function autoEnhance(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const strength = enhanceInput.value / 100;

  const brightness = 1 + 0.1 * strength;
  const contrast = 1 + 0.2 * strength;
  const saturation = 1 + 0.15 * strength;
  const gamma = 1 - 0.1 * strength;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;

    r = Math.pow(r, gamma);
    g = Math.pow(g, gamma);
    b = Math.pow(b, gamma);

    r *= brightness;
    g *= brightness;
    b *= brightness;

    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    const gray = (r + g + b) / 3;
    r = gray + (r - gray) * saturation;
    g = gray + (g - gray) * saturation;
    b = gray + (b - gray) * saturation;

    data[i]     = Math.min(255, Math.max(0, r * 255));
    data[i + 1] = Math.min(255, Math.max(0, g * 255));
    data[i + 2] = Math.min(255, Math.max(0, b * 255));
  }

  ctx.putImageData(imageData, 0, 0);
}

/* ---------------------------
   Wrinkle Enhancement (Local Contrast)
--------------------------- */

function enhanceDetails(ctx, width, height) {
  const strength = wrinkleInput.value / 100;

  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const avg = (d[i] + d[i+1] + d[i+2]) / 3;

    d[i]     += (d[i] - avg) * strength;
    d[i + 1] += (d[i + 1] - avg) * strength;
    d[i + 2] += (d[i + 2] - avg) * strength;
  }

  ctx.putImageData(img, 0, 0);
}

/* ---------------------------
   Cloud (optional)
--------------------------- */

async function cloudProcess(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("https://your-cloud-endpoint.com/process", {
    method: "POST",
    body: formData
  });

  return await res.blob();
}

/* ---------------------------
   MAIN PIPELINE (CORRECT)
--------------------------- */

async function processImage(file) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div class="loader">Processing...</div>`;
  grid.appendChild(card);

  try {
    let blob = cloudMode.checked
      ? await cloudProcess(file)
      : await removeBackground(file);

    const fgImage = await loadImage(blob);

    // temp canvas for bounding box
    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    tempCanvas.width = fgImage.width;
    tempCanvas.height = fgImage.height;
    tempCtx.drawImage(fgImage, 0, 0);

    const box = getBoundingBox(tempCtx, tempCanvas.width, tempCanvas.height);

    const subjectWidth = box.right - box.left;
    const subjectHeight = box.bottom - box.top;

    const padX = subjectWidth * 0.05;
    const padY = subjectHeight * 0.05;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = subjectWidth + padX * 2;
    canvas.height = subjectHeight + padY * 2;

    // Background
    ctx.fillStyle = bgMode.value === "white" ? "#ffffff" : "#f5f5f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Shadow (adaptive)
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = subjectHeight * 0.08;
    ctx.shadowOffsetY = subjectHeight * 0.06;

    ctx.drawImage(
      tempCanvas,
      box.left,
      box.top,
      subjectWidth,
      subjectHeight,
      padX,
      padY,
      subjectWidth,
      subjectHeight
    );

    ctx.restore();

    // Enhancements
    autoEnhance(ctx, canvas.width, canvas.height);
    enhanceDetails(ctx, canvas.width, canvas.height);

    card.innerHTML = "";
    card.appendChild(canvas);

    const dataUrl = canvas.toDataURL("image/png");

    processedImages.push({
      name: file.name.replace(/\.[^/.]+$/, "") + "_pro.png",
      dataUrl
    });

  } catch (e) {
    console.error(e);
    card.innerHTML = "Error";
  }
}

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = URL.createObjectURL(src);
  });
}


const downloadAllBtn = document.getElementById("downloadAll");

downloadAllBtn.onclick = async () => {
  const zip = new JSZip();

  processedImages.forEach(img => {
    const base64 = img.dataUrl.split(",")[1];
    zip.file(img.name, base64, { base64: true });
  });

  const blob = await zip.generateAsync({ type: "blob" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "processed_images.zip";
  a.click();
};

