/* Preserve ordinary <img> layout, accessibility, hover and image saving while
 * composing shared card components lazily in a worker. */
(function(){
'use strict';
const runtimeURL=new URL(document.currentScript.src),runtimeVersion=runtimeURL.searchParams.get('v')||'unversioned';
const base=new URL('.',runtimeURL).href;
function runtimeFile(name){const url=new URL(name,base);url.searchParams.set('v',runtimeVersion);return url;}
const assets=new URL('../',base).href;
const blank='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22308%22 height=%22508%22/%3E';
const cache=new Map(),pending=new Map(),queue=[];let running=0,sequence=0,worker;
const stats={rendered:0,failed:0,cacheHits:0,drawMs:[]};
function source(key){const image=key.startsWith('KeYinCard_')?blank.replace('308','352').replace('508','620'):blank;return image+'#yxp-card='+encodeURIComponent(key);}
function keyFor(url){
  const marker=String(url).match(/#yxp-card=([^&]+)/);if(marker)return decodeURIComponent(marker[1]);
  const card=String(url).match(/\/assets\/cards\/(-?\d+_(?:en|zh))\.(?:png|webp)(?:\?|$)/);if(card)return card[1];
  const sigil=String(url).match(/\/assets\/sigils\/(?:en|zh)\/(KeYinCard_\d+_(?:en|zh))\.(?:png|webp)(?:\?|$)/);if(sigil)return sigil[1];
  const heart=String(url).match(/\/clear-heart\/((?:embryo|formation)-[^/]+_(?:en|zh))\.webp(?:\?|$)/);if(heart)return 'heart-'+heart[1];
  return null;
}
function fallback(key){
  if(key.startsWith('KeYinCard_'))return new URL(`../../sigils/${key.split('_').at(-1)}/${key}.webp`,base).href;
  if(key.startsWith('heart-'))return new URL(`../../recordings/clear-heart/${key.slice(6)}.webp`,base).href;
  return (/(^|\.)github\.io$|^localhost$|^127\.|^$/.test(location.hostname)?'https://sharpobject.github.io/yxp_wiki/assets/cards/':'/yxp_wiki/assets/cards/')+key+'.webp';
}
function sourceUrl(url){const key=keyFor(url);return key?source(key):url;}
function getWorker(){
  if(!worker){
    worker=new Worker(runtimeFile('worker.js'));
    worker.onmessage=({data})=>{const item=pending.get(data.id);if(!item)return;pending.delete(data.id);if(data.drawMs!=null)stats.drawMs.push(data.drawMs);if(stats.drawMs.length>128)stats.drawMs.shift();data.error?item.reject(new Error(data.error)):item.resolve(data.blob);};
    worker.onerror=error=>{for(const item of pending.values())item.reject(new Error(error.message));pending.clear();worker.terminate();worker=null;};
  }
  return worker;
}
let storedFaces,compactLoader;
function faceStore(){
  if(!storedFaces)storedFaces=(async()=>{
    if(!globalThis.caches)return null;
    const name='yxp-card-faces-'+runtimeVersion;
    const store=await caches.open(name);
    // The runtime hash invalidates pixels only when the renderer changes.
    caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('yxp-card-faces-')&&n!==name).map(n=>caches.delete(n)))).catch(()=>{});
    return store;
  })().catch(()=>null);
  return storedFaces;
}
async function compose(key){
  if(!/^[\w-]+$/.test(key))throw new Error('Invalid card key');
  if(!window.CompactCardLoader){await script('decode.js');await script('compact-loader.js');}
  if(!compactLoader)compactLoader=CompactCardLoader.create(assets);
  const recipe=await compactLoader.load(key);
  // Hash the resolved per-card recipe, so a sibling's change does not evict this face.
  const text=JSON.stringify(recipe);
  const digest=globalThis.crypto?.subtle?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join(''):null;
  const store=digest?await faceStore():null,storedUrl=new URL(`rendered/${key}/${digest}.png`,base).href;
  const saved=store?await store.match(storedUrl).catch(()=>null):null;
  if(saved){stats.rendered++;stats.cacheHits++;return URL.createObjectURL(await saved.blob());}
  let blob;
  if(typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'){
    blob=await new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});getWorker().postMessage({id,recipe,base:assets});});
  }else{
    if(!window.CardScene){await script('resample.js');await script('render.js');}
    const canvas=await CardScene.render(recipe.n,assets,recipe.s,recipe.v);
    blob=canvas.convertToBlob?await canvas.convertToBlob({type:'image/png'}):await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  }
  if(store)store.put(storedUrl,new Response(blob,{headers:{'Content-Type':'image/png'}})).then(async()=>{
    const keys=await store.keys();await Promise.all(keys.slice(0,Math.max(0,keys.length-192)).map(k=>store.delete(k)));
  }).catch(()=>{});
  stats.rendered++;return URL.createObjectURL(blob);
}
const scripts=new Map();
function script(name){if(!scripts.has(name))scripts.set(name,new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=runtimeFile(name);el.onload=resolve;el.onerror=reject;document.head.append(el);}));return scripts.get(name);}
function pump(){
  while(running<8&&queue.length){const job=queue.shift();running++;compose(job.key).then(job.resolve,job.reject).finally(()=>{running--;pump();});}
}
function render(key){
  if(!cache.has(key)){
    const promise=new Promise((resolve,reject)=>{queue.push({key,resolve,reject});pump();});
    cache.set(key,{promise,url:null});
    promise.then(url=>{const item=cache.get(key);if(item)item.url=url;},()=>cache.delete(key));
  }
  return cache.get(key).promise;
}
function trim(){
  if(cache.size<=96)return;
  const visible=new Set([...document.images].map(im=>im.currentSrc||im.src));
  for(const [key,item]of cache){if(cache.size<=96)break;if(item.url&&!visible.has(item.url)){URL.revokeObjectURL(item.url);cache.delete(key);}}
}
const states=new WeakMap();
function hydrate(im){
  const key=im.dataset.cardKey||keyFor(im.getAttribute('src')||'');
  if(!key)return;
  const old=states.get(im);if(old?.key===key)return;
  states.set(im,{key,started:false});
  if(observer)observer.observe(im);else start(im);
}
function start(im){
  const state=states.get(im);if(!state||state.started)return;state.started=true;observer?.unobserve(im);
  render(state.key).then(url=>{
    if(states.get(im)!==state)return;
    im.src=url;im.dataset.cardRendered=state.key;im.classList.remove('asset-missing');setTimeout(trim,0);
  }).catch(error=>{if(states.get(im)!==state)return;stats.failed++;im.dataset.cardError=state.key;console.warn('Shared card failed; using preserved WebP',error);im.src=fallback(state.key);});
}
const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)start(e.target);},{rootMargin:'350px'}):null;
function scan(root){if(root instanceof HTMLImageElement)hydrate(root);root.querySelectorAll?.('img').forEach(hydrate);}
const mutations=new MutationObserver(entries=>{
 for(const e of entries){if(e.type==='attributes')hydrate(e.target);else for(const node of e.addedNodes)if(node.nodeType===1)scan(node);}
});
mutations.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-card-key']});
scan(document);
Object.defineProperties(stats,{queued:{get:()=>queue.length},running:{get:()=>running}});
window.YxpCards={source,sourceUrl,render,stats};
})();
