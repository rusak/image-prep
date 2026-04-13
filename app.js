import { removeBackground } from "https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const grid = document.getElementById("grid");

const bgMode = document.getElementById("bgMode");
const enhanceInput = document.getElementById("enhance");
const wrinkleInput = document.getElementById("wrinkle");

const previewModal = document.getElementById("previewModal");
const previewImage = document.getElementById("previewImage");

let processedImages = [];

/* Upload */

dropzone.onclick = () => fileInput.click();
fileInput.onchange = e => processQueue([...e.target.files], 3);

dropzone.ondragover = e => e.preventDefault();
dropzone.ondrop = e => {
  e.preventDefault();
  processQueue([...e.dataTransfer.files], 3);
};

/* Queue */

async function processQueue(files, limit = 3) {
  const queue = [...files];
  const workers = Array.from({ length: limit }, async () => {
    while (queue.length) {
      await processImage(queue.shift());
    }
  });
  await Promise.all(workers);
}

/* Bounding box (FIXED threshold) */

function getBoundingBox(ctx, w, h) {
  const data = ctx.getImageData(0,0,w,h).data;
  let t=h,l=w,r=0,b=0;

  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const a=data[(y*w+x)*4+3];
      if(a > 80){ // 🔥 FIXED
        if(x<l)l=x;
        if(x>r)r=x;
        if(y<t)t=y;
        if(y>b)b=y;
      }
    }
  }
  return {top:t,left:l,right:r,bottom:b};
}

/* 🔥 TRUE FLOOR DETECTION */

function getRealBottom(ctx, w, h) {
  const data = ctx.getImageData(0,0,w,h).data;

  for (let y = h - 1; y >= 0; y--) {
    let count = 0;

    for (let x = 0; x < w; x++) {
      const alpha = data[(y*w + x)*4 + 3];
      if (alpha > 100) count++;
    }

    if (count > w * 0.1) {
      return y;
    }
  }

  return h;
}

/* 🔥 SHADOW */

function drawShadow(ctx, cx, y, sw, sh) {

  // contact
  ctx.beginPath();
  ctx.ellipse(cx, y + 1, sw * 0.22, sh * 0.025, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fill();

  // soft
  const g = ctx.createRadialGradient(cx, y + 2, 1, cx, y + 2, sw * 0.35);
  g.addColorStop(0, "rgba(0,0,0,0.25)");
  g.addColorStop(0.5, "rgba(0,0,0,0.12)");
  g.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, y + 2, sw * 0.35, sh * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
}

/* 🔥 SUBJECT-ONLY ENHANCEMENT */

function enhanceSubject(ctx, w, h) {
  const img = ctx.getImageData(0,0,w,h);
  const d = img.data;
  const s = enhanceInput.value / 100;

  for(let i=0;i<d.length;i+=4){
    if(d[i+3] > 50){ // only subject pixels
      d[i] *= 1 + 0.1*s;
      d[i+1] *= 1 + 0.1*s;
      d[i+2] *= 1 + 0.1*s;
    }
  }

  ctx.putImageData(img,0,0);
}

function wrinkle(ctx,w,h){
  const d=ctx.getImageData(0,0,w,h);
  const data=d.data;
  const s=wrinkleInput.value/100;

  for(let i=0;i<data.length;i+=4){
    if(data[i+3] > 50){
      const avg=(data[i]+data[i+1]+data[i+2])/3;
      data[i]+= (data[i]-avg)*s;
      data[i+1]+= (data[i+1]-avg)*s;
      data[i+2]+= (data[i+2]-avg)*s;
    }
  }
  ctx.putImageData(d,0,0);
}

/* Process */

async function processImage(file){
  const card=document.createElement("div");
  card.className="card";
  card.innerHTML="<div class='loader'>Processing...</div>";
  grid.appendChild(card);

  const blob=await removeBackground(file);
  const img=await load(blob);

  const temp=document.createElement("canvas");
  const tctx=temp.getContext("2d");
  temp.width=img.width;
  temp.height=img.height;
  tctx.drawImage(img,0,0);

  const box=getBoundingBox(tctx,temp.width,temp.height);
  const realBottom=getRealBottom(tctx,temp.width,temp.height);

  const sw=box.right-box.left;
  const sh=realBottom-box.top;

  const pad=sw*0.05;

  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d");

  canvas.width=sw+pad*2;
  canvas.height=sh+pad*2;

  // background (FIXED)
  ctx.fillStyle = bgMode.value==="white" ? "#ffffff" : "#f2f2f2";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const cx = canvas.width/2;
  const subjectBottomY = pad + sh;

  drawShadow(ctx, cx, subjectBottomY, sw, sh);

  ctx.drawImage(temp, box.left, box.top, sw, sh, pad, pad, sw, sh);

  enhanceSubject(ctx, canvas.width, canvas.height);
  wrinkle(ctx, canvas.width, canvas.height);

  card.innerHTML="";
  card.appendChild(canvas);

  canvas.onclick=()=>{
    previewImage.src=canvas.toDataURL();
    previewModal.style.display="flex";
  };

  previewModal.onclick=()=>previewModal.style.display="none";

  const btn=document.createElement("button");
  btn.textContent="Download";
  btn.onclick=()=>{
    const a=document.createElement("a");
    a.href=canvas.toDataURL();
    a.download=file.name+"_pro.png";
    a.click();
  };

  card.appendChild(btn);

  processedImages.push({
    name:file.name+"_pro.png",
    dataUrl:canvas.toDataURL()
  });
}

function load(src){
  return new Promise(res=>{
    const i=new Image();
    i.onload=()=>res(i);
    i.src=URL.createObjectURL(src);
  });
}

/* ZIP */

document.getElementById("downloadAll").onclick=async()=>{
  const zip=new JSZip();
  processedImages.forEach(img=>{
    zip.file(img.name,img.dataUrl.split(",")[1],{base64:true});
  });
  const blob=await zip.generateAsync({type:"blob"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="images.zip";
  a.click();
};

