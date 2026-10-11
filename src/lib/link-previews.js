import { parseHTML } from 'linkedom';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { standaloneLink,linkCardHTML } from './link-card.js';
const cachePath=new URL('../../node_modules/.cache/kaban-link-previews-v1.json',import.meta.url);
const pending=new Map();
let cache;
let cacheLoading;
let cacheWriting=Promise.resolve();
export function publicAddress(address){
  const ip=address.toLowerCase();
  if(ip.includes(':'))return !/^(::|fc|fd|fe[89ab]|ff)/.test(ip)&&!ip.includes(':ffff:');
  const [a,b]=ip.split('.').map(Number);
  return isIP(ip)===4&&a!==0&&a!==10&&a!==127&&a<224&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&b===168)&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));
}
async function safeURL(value){
  const url=new URL(value);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)throw Error('Unsupported URL');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal'))throw Error('Private host');
  const addresses=isIP(host)?[{address:host}]:await Promise.race([lookup(host,{all:true}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('DNS timeout')),7000);timer.unref();})]);
  if(!addresses.length||addresses.some(({address})=>!publicAddress(address)))throw Error('Private address');
  return url;
}
export function extractMetadata(html,base){
  const {document}=parseHTML(html);
  const meta=name=>document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute('content');
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const title=clean(meta('og:title')||document.querySelector('title')?.textContent).slice(0,180);
  const description=clean(meta('og:description')||meta('description')).slice(0,230);
  let image=null;
  try{const imageValue=meta('og:image');if(!imageValue)throw Error('No image');const url=new URL(imageValue,base);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!isIP(url.hostname.replace(/^\[|\]$/g,''))&&url.hostname!=='localhost'&&!url.hostname.endsWith('.local')&&!url.hostname.endsWith('.internal'))image=url.href;}catch{}
  return {title,description,image};
}
export async function linkMetadata(value){
  if(pending.has(value))return pending.get(value);
  const work=(async()=>{
    if(!cacheLoading) cacheLoading=(async()=>{try{const saved=JSON.parse(await readFile(cachePath,'utf8'));cache=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch{cache={};}})();
    await cacheLoading;
    if(cache[value])return cache[value];
    try{
      const signal=AbortSignal.timeout(7000);
      let url=await safeURL(value),response;
      for(let i=0;i<4;i++){
        response=await fetch(url,{redirect:'manual',signal,headers:{'User-Agent':'kaban.blog link preview','Accept':'text/html'}});
        if(response.status>=300&&response.status<400){await response.body?.cancel();url=await safeURL(new URL(response.headers.get('location'),url));continue;}
        break;
      }
      if(!response?.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('Not an HTML page');
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>1500000)throw Error('Page too large');chunks.push(chunk);}
      const metadata=extractMetadata(Buffer.concat(chunks).toString('utf8'),url);
      if(!metadata.title)throw Error('No title');
      cache[value]=metadata;
      await mkdir(dirname(fileURLToPath(cachePath)),{recursive:true});
      cacheWriting=cacheWriting.catch(()=>{}).then(()=>writeFile(cachePath,JSON.stringify(cache,null,2)+'\n'));
      await cacheWriting;
      return metadata;
    }catch{console.warn(`[Превью ссылки] ${new URL(value).hostname}: метаданные недоступны, оставляю простую карточку.`);return {};}
  })();pending.set(value,work);return work;
}
export const linkCards={name:'static-link-cards',element:{filter:['p'],async visit(node,context){
  const url=standaloneLink(node);if(!url)return;
  const metadata=await linkMetadata(url);
  // Parse only our escaped markup into HAST-compatible plain nodes.
  const {document}=parseHTML(linkCardHTML(url,metadata));
  const convert=element=>element.nodeType===3?{type:'text',value:element.textContent}:{type:'element',tagName:element.localName,properties:Object.fromEntries(Array.from(element.attributes).map(attr=>[attr.name==='class'?'className':attr.name,attr.name==='class'?attr.value.split(' '):attr.value])),children:Array.from(element.childNodes).map(convert)};
  context.replaceNode(node,convert(document.querySelector('aside')));
}}};
