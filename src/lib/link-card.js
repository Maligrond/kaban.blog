import { escapeHTML } from './escape-html.js';
export function standaloneLink(node){
  if(node.tagName!=='p')return null;
  const children=node.children?.filter(child=>child.type!=='text'||child.value.trim());
  if(children?.length!==1||children[0].tagName!=='a')return null;
  const link=children[0],url=link.properties?.href;
  if(typeof url!=='string'||link.children?.length!==1||link.children[0].value!==url)return null;
  try{const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return null;
    if(/(^|\.)(youtube\.com|youtu\.be)$/.test(parsed.hostname))return null;return parsed.href;
  }catch{return null;}
}
export function linkCardHTML(url,metadata={}){
  const parsed=new URL(url);
  const host=parsed.hostname.replace(/^www\./,'');
  return `<aside class="post-link-card"><a href="${escapeHTML(url)}" rel="noopener noreferrer"><span class="post-link-copy"><span class="post-link-host">${escapeHTML(host)}</span><strong>${escapeHTML(metadata.title||'Открыть страницу ↗')}</strong>${metadata.description?`<span class="post-link-description">${escapeHTML(metadata.description)}</span>`:''}</span>${metadata.image?`<img src="${escapeHTML(metadata.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`:''}</a></aside>`;
}
