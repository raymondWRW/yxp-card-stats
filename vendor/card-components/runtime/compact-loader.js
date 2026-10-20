/* Load one consistent immutable metadata snapshot, then byte slices of bundles. */
(function(g){
'use strict';
function create(base){
 let snapshot;
 const bundles=new Map();
 async function bytes(path,revalidate=false){const r=await fetch(new URL(path,base),revalidate?{cache:'no-cache'}:undefined);if(!r.ok)throw Error(`Card instructions HTTP ${r.status}: ${path}`);return new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())}
 function metadata(){
  if(!snapshot)snapshot=(async()=>{
   const r=await fetch(new URL('compact/active.json',base),{cache:'no-cache'});if(!r.ok)throw Error('Missing compact card manifest');const active=await r.json();if(active.format!==1)throw Error('Unsupported compact card manifest');
   const [tableBytes,locationBytes]=await Promise.all([bytes(active.table),bytes(active.locations)]);
   const table=CompactInstructions.table(tableBytes),locations=new Map();
   for(const [file,entries]of Object.entries(JSON.parse(new TextDecoder().decode(locationBytes))))for(const [key,offset,length]of entries){if(locations.has(key))throw Error('Duplicate card location');locations.set(key,{file,offset,length})}
   const art=active.art?JSON.parse(new TextDecoder().decode(await bytes(active.art))):{};
   return {table,locations,art};
  })().catch(e=>{snapshot=null;throw e});
  return snapshot;
 }
 async function load(key){
  const {table,locations,art}=await metadata(),location=locations.get(key);if(!location)throw Error(`Missing compact card ${key}`);
  const {file,offset,length}=location;
  if(!bundles.has(file)){const promise=bytes(file).catch(e=>{bundles.delete(file);throw e});bundles.set(file,promise)}
  const buffer=await bundles.get(file);
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<1||offset+length>buffer.length)throw Error('Invalid compact card range');
  // Leave enough room for a typical page and dynamic replay navigation.
  while(bundles.size>16)bundles.delete(bundles.keys().next().value);
  const recipe=CompactInstructions.card(buffer.subarray(offset,offset+length),table);
  recipe.v=Object.fromEntries(recipe.s.filter(a=>art[a[0]]).map(a=>[a[0],art[a[0]]]));
  return recipe;
 }
 return {load};
}
g.CompactCardLoader={create};
})(globalThis);
