import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm";

const dropzone = document.getElementById("dropzone");
const grid = document.getElementById("grid");
const downloadAllBtn = document.getElementById("downloadAll");

const bgToneInput = document.getElementById("bgTone");
const shadowInput = document.getElementById("shadow");

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
  handleFiles(files);
});

/* ---------------------------
   Main Handler
--------------------------- */

async function handleFiles(files) {
  const promises = files.map(file => processImage(file));
  await Promise.all(promises);
}

/* ---------------------------
   Image Processing Pipeline
--------------------------- */

async function processImage(file) {
  const card = createCard(file.name);
  grid.appendChild(card);

  try {
    const img = await loadImage(file);

    // Step 1: Remove Background
    const blob = await removeBackground(file);
    const fgImage = await loadImage(blob);

    // Step 2: Canvas setup
    const paddingRatio = 0.05;
    const padX = img.width * paddingRatio;
    const padY = img.height * paddingRatio;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = img.width + padX * 2;
    canvas.height = img.height + padY * 2;

    // Step 3: Background
    const tone = bgToneInput.value;
    ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Step 4: Shadow
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = parseInt(shadowInput.value);
    ctx.shadowOffsetY = 10;

    // Step 5: Draw subject
    ctx.drawImage(fgImage, padX, padY, img.width, img.height);

    // Reset shadow
    ctx.shadowColor = "transparent";

    // Attach canvas
    card.querySelector(".loader").remove();
    card.appendChild(canvas);

    // Export
    const dataUrl = canvas.toDataURL("image/png", 1.0);

    const fileName = file.name.replace(/\.[^/.]+$/, "") + "_processed.png";

    processedImages.push({ name: fileName, dataUrl });

    // Download button
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

function createCard(name) {
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
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = typeof src === "string" ? src : URL.createObjectURL(src);
  });
}

function download(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/* ---------------------------
   Download All (ZIP)
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

