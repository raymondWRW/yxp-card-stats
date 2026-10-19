/* Shared card scene renderer. All text consists of exported TMP glyph pixels. */
(function(global){
'use strict';
const images=new Map(),tinted=new Map(),composed=new Map();
function tintedAtlas(image,key,color,local){
  if(local.has(key))return local.get(key);
  let canvas=global.NO_TINT_CACHE?null:tinted.get(key);
  if(!canvas){
    canvas=surface(image.width,image.height);
    const ctx=canvas.getContext('2d');
    ctx.drawImage(image,0,0);
    ctx.globalCompositeOperation='source-in';
    ctx.fillStyle=`rgb(${color.join(',')})`;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!global.NO_TINT_CACHE)tinted.set(key,canvas);
  }
  // Even the no-cache benchmark only tints each sheet/color once per render.
  local.set(key,canvas);return canvas;
}
function load(url){
  if(!images.has(url)) images.set(url,typeof Image==='undefined'?fetch(url).then(r=>{if(!r.ok)throw new Error(`Card sprite HTTP ${r.status}`);return r.blob();}).then(createImageBitmap):new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{images.delete(url);reject(new Error(`Card sprite failed: ${url}`));};image.src=url;
  }));
  while(images.size>128)images.delete(images.keys().next().value);
  return images.get(url).catch(error=>{images.delete(url);throw error;});
}
function leaves(node,out=new Set()){
  if(node[0]==='i')out.add(node[1]);
  else if(node[0]==='g')node[3].forEach(part=>leaves(part[2],out));
  else if(node[0]==='t')leaves(node[7],out);
  else if(node[0]==='x')leaves(node[3],out);
  else if(node[0]==='m'){leaves(node[3],out);leaves(node[4],out);}
  else throw new Error(`Invalid card scene ${node[0]}`);
  return out;
}
function surface(w,h){if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(w,h);const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function size(n){return n[0]==='i'?n.slice(2,4):n.slice(1,3);}
function draw(ctx,node,assets){
  const op=node[0],w=op==='i'?node[2]:node[1],h=op==='i'?node[3]:node[2];
  ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
  if(op==='i'){
    const a=assets.get(node[1]);
    if(Array.isArray(a))ctx.drawImage(a[0],a[1],a[2],w,h,0,0,w,h);
    else ctx.drawImage(a,0,0);
  }else if(op==='g'){
    for(const [x,y,child] of node[3]){ctx.save();ctx.translate(x,y);draw(ctx,child,assets);ctx.restore();}
  }else if(op==='t'){
    const child=node[7], dims=size(child), layer=surface(...dims),lc=layer.getContext('2d',{willReadFrequently:true});draw(lc,child,assets);
    const scaled=surface(w,h);scaled.getContext('2d').putImageData(CardResample(lc.getImageData(0,0,...dims),w,h,...node.slice(3,7),node[8]),0,0);ctx.drawImage(scaled,0,0);
  }else if(op==='x'){
    ctx.translate(w,0);ctx.scale(-1,1);draw(ctx,node[3],assets);
  }else if(op==='m'){
    const layer=surface(w,h),lc=layer.getContext('2d');draw(lc,node[3],assets);const mask=surface(w,h);draw(mask.getContext('2d'),node[4],assets);const pixels=lc.getImageData(0,0,w,h),alpha=mask.getContext('2d').getImageData(0,0,w,h).data;for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=alpha[i];lc.putImageData(pixels,0,0);ctx.drawImage(layer,0,0);
  }
  ctx.restore();
}
async function render(scene,base,atlas,virtual={}){
  async function asset(name){
    if(!virtual[name])return load(base+name);
    const key=base+name;
    if(!composed.has(key)){const spec=virtual[name];composed.set(key,render(spec.n,base,spec.s).catch(e=>{composed.delete(key);throw e}));}
    const promise=composed.get(key);
    while(composed.size>128)composed.delete(composed.keys().next().value);
    return promise;
  }
  const prepStart=performance.now();
  const assets=new Map(),localTints=new Map();
  await Promise.all([...leaves(scene)].map(async id=>{
    if(atlas){const a=atlas[id];if(!a)throw new Error(`Missing sprite ${id}`);const image=await asset(a[0]);
      if(a[5]){
        const key=base+a[0]+':'+a[5].join(',');
        const sheet=tintedAtlas(image,key,a[5],localTints);
        assets.set(id,[sheet,a[1],a[2]]);
      }else assets.set(id,[image,a[1],a[2]]);}
    else assets.set(id,await load(`${base}sprites/${id}.webp`));
  }));
  render.lastPrepareMs=performance.now()-prepStart;
  const canvas=surface(...size(scene)),start=performance.now();draw(canvas.getContext('2d'),scene,assets);render.lastDrawMs=performance.now()-start;return canvas;
}
global.CardScene={render,leaves,surface};
})(globalThis);
