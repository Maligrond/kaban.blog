export function findAuthorLinks(items, query, currentURL) {
  const words=query.toLocaleLowerCase('ru').replace(/ё/g,'е').trim().split(/\s+/).filter(Boolean);
  return items.filter(item=>item.url!==currentURL && words.every(word=>`${item.title} ${item.detail || ''} ${item.kind}`.toLocaleLowerCase('ru').replace(/ё/g,'е').includes(word))).slice(0,12);
}
export function linkAddress(value) {
  const input=value.trim();
  if(/^\/(?!\/)/.test(input) && !/[\\\s]/.test(input)) {
    const url=new URL(input,'https://kaban.blog');
    if(url.origin==='https://kaban.blog')return url.pathname+url.search+url.hash;
  }
  try {
    const url=new URL(input);
    if(['https:','http:'].includes(url.protocol) && !url.username && !url.password)return url.href;
  } catch { /* The field can contain a search query instead of a URL. */ }
  return null;
}
export function authorLink(label, address) {
  const url=linkAddress(address);
  if(!label.trim() || !url)throw new Error('Укажи текст и полный адрес ссылки.');
  const text=label.trim().replace(/\\/g,'\\\\').replace(/([\[\]])/g,'\\$1').replace(/\r?\n/g,' ');
  return `[${text}](${url.replace(/[\s()<>]/g,char=>'%'+char.charCodeAt(0).toString(16).padStart(2,'0').toUpperCase())})`;
}
