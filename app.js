import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const grid = document.getElementById("grid");
const bgMode = document.getElementById("bgMode");
const bgCustomColor = document.getElementById("bgCustomColor");
const enhanceInput = document.getElementById("enhance");
const wrinkleInput = document.getElementById("wrinkle");
const shadowInput = document.getElementById("shadow");
const detailMode = document.getElementById("detailMode");
const previewModal = document.getElementById("previewModal");
const previewImage = document.getElementById("previewImage");

// Each entry: { fileName, canvas, noBgImage, boundingBox, realBottom, isDetail }
const images = [];

/* --- Upload --- */

dropzone.onclick = () => fileInput.click();
fileInput.onchange = (e) => processQueue([...e.target.files], 3);

dropzone.ondragover = (e) => e.preventDefault();
dropzone.ondrop = (e) => {
  e.preventDefault();
  processQueue([...e.dataTransfer.files], 3);
};

/* --- Queue (parallel with concurrency limit) --- */

async function processQueue(files, limit = 3) {
  const queue = [...files];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      await processImage(queue.shift());
    }
  });
  await Promise.all(workers);
}

/* --- Bounding box detection --- */

function getBoundingBox(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  let top = h, left = w, right = 0, bottom = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 80) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return { top, left, right, bottom };
}

/* --- Floor detection (scan from bottom for opaque row) --- */

function getRealBottom(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;

  for (let y = h - 1; y >= 0; y--) {
    let count = 0;
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 100) count++;
    }
    if (count > w * 0.1) return y;
  }
  return h;
}

/* --- Shadow (catalog drop shadow) --- */

function drawShadow(ctx, cx, y, sw, sh, intensity) {
  const s = intensity / 100;
  if (s === 0) return;

  ctx.save();

  const layers = [
    { w: sw * 0.50, h: sw * 0.08, opacity: 0.06, offsetY: 4 },
    { w: sw * 0.38, h: sw * 0.05, opacity: 0.10, offsetY: 2 },
    { w: sw * 0.25, h: sw * 0.025, opacity: 0.18, offsetY: 1 },
  ];

  for (const layer of layers) {
    const g = ctx.createRadialGradient(cx, y + layer.offsetY, 0, cx, y + layer.offsetY, layer.w);
    g.addColorStop(0, `rgba(0,0,0,${layer.opacity * s})`);
    g.addColorStop(0.7, `rgba(0,0,0,${layer.opacity * s * 0.3})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(cx, y + layer.offsetY);
    ctx.scale(1, layer.h / layer.w);
    ctx.beginPath();
    ctx.arc(0, 0, layer.w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/* --- Enhancement (brightness boost on subject pixels) --- */

function applyEnhance(ctx, w, h, strength) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const s = strength / 100;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 50) {
      d[i] = Math.min(255, d[i] * (1 + 0.1 * s));
      d[i + 1] = Math.min(255, d[i + 1] * (1 + 0.1 * s));
      d[i + 2] = Math.min(255, d[i + 2] * (1 + 0.1 * s));
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* --- Wrinkle boost (local contrast on subject pixels) --- */

function applyWrinkle(ctx, w, h, strength) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const s = strength / 100;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 50) {
      const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
      d[i] = Math.min(255, Math.max(0, d[i] + (d[i] - avg) * s));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + (d[i + 1] - avg) * s));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + (d[i + 2] - avg) * s));
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* --- Render (re-composites from cached no-bg image) --- */

function drawBackground(ctx, w, h) {
  const bgs = {
    neutral: ["#e6e6e6", "#c8c8c8"],
    white:   ["#ffffff", "#e0e0e0"],
    warm:    ["#ede5da", "#d4c9b8"],
    cool:    ["#e2e6ec", "#c5ccd6"],
    cream:   ["#ede8dc", "#d6cdbc"],
    red:     ["#e8c8c8", "#d4a0a0"],
  };
  let centerColor, edgeColor;
  if (bgMode.value === "custom") {
    centerColor = bgCustomColor.value;
    const r = parseInt(centerColor.slice(1, 3), 16);
    const g = parseInt(centerColor.slice(3, 5), 16);
    const b = parseInt(centerColor.slice(5, 7), 16);
    const darken = (v) => Math.max(0, Math.round(v * 0.85)).toString(16).padStart(2, "0");
    edgeColor = "#" + darken(r) + darken(g) + darken(b);
  } else {
    [centerColor, edgeColor] = bgs[bgMode.value] || bgs.neutral;
  }

  const bg = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.75);
  bg.addColorStop(0, centerColor);
  bg.addColorStop(1, edgeColor);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
}

/* --- Background detection & replacement for detail shots --- */

function sampleBackground(ctx, w, h) {
  const size = Math.floor(Math.min(w, h) * 0.05);
  const corners = [
    ctx.getImageData(0, 0, size, size),
    ctx.getImageData(w - size, 0, size, size),
    ctx.getImageData(0, h - size, size, size),
    ctx.getImageData(w - size, h - size, size, size),
  ];

  let r = 0, g = 0, b = 0, count = 0;
  for (const corner of corners) {
    const d = corner.data;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; g += d[i + 1]; b += d[i + 2];
      count++;
    }
  }

  return { r: r / count, g: g / count, b: b / count };
}

function replaceBackground(ctx, w, h, bgModeValue) {
  const bgColor = sampleBackground(ctx, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const bgs = {
    neutral: [0xe6, 0xe6, 0xe6],
    white:   [0xff, 0xff, 0xff],
    warm:    [0xed, 0xe5, 0xda],
    cool:    [0xe2, 0xe6, 0xec],
    cream:   [0xed, 0xe8, 0xdc],
    red:     [0xe8, 0xc8, 0xc8],
  };
  let tr, tg, tb;
  if (bgModeValue === "custom") {
    const c = bgCustomColor.value;
    tr = parseInt(c.slice(1, 3), 16);
    tg = parseInt(c.slice(3, 5), 16);
    tb = parseInt(c.slice(5, 7), 16);
  } else {
    [tr, tg, tb] = bgs[bgModeValue] || bgs.neutral;
  }
  const tolerance = 40;
  const visited = new Uint8Array(w * h);

  const queue = [];

  for (let x = 0; x < w; x++) {
    queue.push(x);
    queue.push(0);
    queue.push(x);
    queue.push(h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    queue.push(0);
    queue.push(y);
    queue.push(w - 1);
    queue.push(y);
  }

  let qi = 0;
  while (qi < queue.length) {
    const x = queue[qi++];
    const y = queue[qi++];

    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const pi = idx * 4;
    const dr = d[pi] - bgColor.r;
    const dg = d[pi + 1] - bgColor.g;
    const db = d[pi + 2] - bgColor.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist >= tolerance) continue;

    const blend = dist / tolerance;
    d[pi]     = tr + (d[pi] - tr) * blend;
    d[pi + 1] = tg + (d[pi + 1] - tg) * blend;
    d[pi + 2] = tb + (d[pi + 2] - tb) * blend;

    queue.push(x - 1, y);
    queue.push(x + 1, y);
    queue.push(x, y - 1);
    queue.push(x, y + 1);
  }

  ctx.putImageData(img, 0, 0);
}

function render(entry) {
  const { canvas, noBgImage, boundingBox: box, realBottom, isDetail } = entry;
  const ctx = canvas.getContext("2d");

  const sw = box.right - box.left;
  const sh = realBottom - box.top;

  if (isDetail) {
    canvas.width = sw;
    canvas.height = sh;

    ctx.drawImage(noBgImage, box.left, box.top, sw, sh, 0, 0, sw, sh);

    const bgColor = sampleBackground(ctx, sw, sh);
    replaceBackground(ctx, sw, sh, bgMode.value);

    return;
  }

  const pad = sw * 0.05;
  canvas.width = sw + pad * 2;
  canvas.height = sh + pad * 2;

  drawBackground(ctx, canvas.width, canvas.height);

  const shadowStrength = +shadowInput.value / 100;
  if (shadowStrength > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${0.35 * shadowStrength})`;
    ctx.shadowBlur = sw * 0.03;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = sw * 0.01;
    ctx.drawImage(noBgImage, box.left, box.top, sw, sh, pad, pad, sw, sh);
    ctx.restore();
  }

  ctx.drawImage(
    noBgImage,
    box.left, box.top, sw, sh,
    pad, pad, sw, sh
  );

  applyEnhance(ctx, canvas.width, canvas.height, +enhanceInput.value);
  applyWrinkle(ctx, canvas.width, canvas.height, +wrinkleInput.value);
}

/* --- Process single image --- */

async function processImage(file) {
  const card = document.createElement("div");
  card.className = "bg-white rounded-xl border border-slate-200 p-3 relative min-h-[140px]";
  card.innerHTML = '<div class="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center text-sm text-slate-400"><svg class="animate-spin w-5 h-5 mr-2 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>Processing…</div>';
  grid.appendChild(card);

  const isDetail = detailMode.checked;
  let noBgImage, boundingBox, realBottom;

  if (isDetail) {
    noBgImage = await loadImage(file);
    boundingBox = { top: 0, left: 0, right: noBgImage.width, bottom: noBgImage.height };
    realBottom = noBgImage.height;
  } else {
    const blob = await removeBackground(file);
    noBgImage = await loadImage(blob);

    const temp = document.createElement("canvas");
    const tctx = temp.getContext("2d");
    temp.width = noBgImage.width;
    temp.height = noBgImage.height;
    tctx.drawImage(noBgImage, 0, 0);

    boundingBox = getBoundingBox(tctx, temp.width, temp.height);
    realBottom = getRealBottom(tctx, temp.width, temp.height);
  }

  const canvas = document.createElement("canvas");

  const entry = {
    fileName: file.name.replace(/\.[^.]+$/, "") + "_processed.jpg",
    canvas,
    noBgImage,
    boundingBox,
    realBottom,
    isDetail,
  };

  images.push(entry);
  render(entry);

  card.innerHTML = "";
  canvas.className = "w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity";
  card.appendChild(canvas);

  canvas.onclick = () => {
    previewImage.src = canvas.toDataURL("image/jpeg", 0.92);
    previewModal.classList.add("active");
  };

  const btn = document.createElement("button");
  btn.className = "mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-lg transition-colors";
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>Download';
  btn.onclick = () => downloadOne(entry);
  card.appendChild(btn);
}

function loadImage(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = URL.createObjectURL(blob);
  });
}

/* --- Show Apply button when settings change, re-render on click --- */

const applyBtn = document.getElementById("applySettings");

const presetColors = {
  neutral: "#e6e6e6", white: "#ffffff", warm: "#ede5da",
  cool: "#e2e6ec", cream: "#ede8dc", red: "#e8c8c8",
};

bgMode.addEventListener("change", () => {
  if (bgMode.value !== "custom") bgCustomColor.value = presetColors[bgMode.value] || "#e6e6e6";
  if (images.length) applyBtn.hidden = false;
});

bgCustomColor.addEventListener("input", () => {
  bgMode.value = "custom";
  if (images.length) applyBtn.hidden = false;
});

[enhanceInput, wrinkleInput, shadowInput].forEach((el) => {
  el.addEventListener("input", () => {
    if (images.length) applyBtn.hidden = false;
  });
});

applyBtn.onclick = () => {
  applyBtn.disabled = true;
  applyBtn.innerHTML = '<svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>Applying…';

  const cards = grid.querySelectorAll(":scope > div");
  cards.forEach((card) => {
    const overlay = document.createElement("div");
    overlay.className = "apply-overlay absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center z-10";
    overlay.innerHTML = '<svg class="animate-spin w-6 h-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>';
    card.style.position = "relative";
    card.appendChild(overlay);
  });

  requestAnimationFrame(() => {
    setTimeout(() => {
      images.forEach(render);

      grid.querySelectorAll(".apply-overlay").forEach((o) => o.remove());
      applyBtn.hidden = true;
      applyBtn.disabled = false;
      applyBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i>Apply';
      if (window.lucide) lucide.createIcons();
    }, 50);
  });
};

/* --- Preview modal --- */

previewModal.onclick = () => previewModal.classList.remove("active");

/* --- Downloads --- */

function downloadOne(entry) {
  render(entry);
  const a = document.createElement("a");
  a.href = entry.canvas.toDataURL("image/jpeg", 0.92);
  a.download = entry.fileName;
  a.click();
}

document.getElementById("downloadAll").onclick = async () => {
  const zip = new JSZip();
  const usedNames = new Set();
  images.forEach((entry) => {
    render(entry);
    let name = entry.fileName;
    let i = 1;
    while (usedNames.has(name)) {
      name = entry.fileName.replace(".jpg", `_${i++}.png`);
    }
    usedNames.add(name);
    const data = entry.canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
    zip.file(name, data, { base64: true });
  });
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "marketplace_images.zip";
  a.click();
};
