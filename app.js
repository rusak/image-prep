import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm";

const dropzone = document.getElementById("dropzone");
const grid = document.getElementById("grid");
const downloadAllBtn = document.getElementById("downloadAll");

const bgToneInput = document.getElementById("bgTone");
const shadowInput = document.getElementById("shadow");
const enhanceInput = document.getElementById("enhance");

let processedImages = [];

/* ---------------------------
   Drag & Drop
--------------------------- */

dropzone.addEventListener("dragover", e => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("dragover");

  const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/"));
  processQueue(files, 3);
});

/* ---------------------------
   Controlled Parallelism
--------------------------- */

async function processQueue(files, limit = 3) {
  const queue = [...files];

  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const file = queue.shift();
      await processImage(file);
    }
  });

  await Promise.all(workers);
}

/* ---------------------------
   Bounding Box Detection
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
   AI Auto Enhancement
--------------------------- */

function autoEnhanceImage(ctx, width, height) {
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

    // Gamma
    r = Math.pow(r, gamma);
    g = Math.pow(g, gamma);
    b = Math.pow(b, gamma);

    // Brightness
    r *= brightness;
    g *= brightness;
    b *= brightness;

    // Contrast
    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    // Saturation
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
   Image Processing
--------------------------- */

async function processImage(file) {
  const card = createCard();
  grid.appendChild(card);

  try {
    const blob = await removeBackground(file);
    const fgImage = await loadImage(blob);

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
    const tone = bgToneInput.value;
    ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = subjectHeight * (shadowInput.value / 100);
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

    // ✨ AI Enhancement step
    autoEnhanceImage(ctx, canvas.width, canvas.height);

    card.querySelector(".loader").remove();
    card.appendChild(canvas);

    const dataUrl = canvas.toDataURL("image/png");

    const fileName =
      file.name.replace(/\.[^/.]+$/, "") + "_fb-ready.png";

    processedImages.push({ name: fileName, dataUrl });

    const btn = document.createElement("button");
    btn.textContent = "Download";
    btn.onclick = () => download(dataUrl, fileName);

    card.appendChild(btn);

  } catch (err) {
    console.error(err);
    card.querySelector(".loader").textContent = "Error";
  }
}

/* ---------------------------
   Helpers
--------------------------- */

function createCard() {
  const div = document.createElement("div");
  div.className = "card";

  const loader = document.createElement("div");
  loader.className = "loader";
  loader.textContent = "Processing...";

  div.appendChild(loader);
  return div;
}

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = URL.createObjectURL(src);
  });
}

function download(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/* ---------------------------
   ZIP Download
--------------------------- */

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
