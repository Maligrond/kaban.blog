import { marked } from 'marked';

// Keep source ranges so changing one image never changes another identical one.
export function markdownPhotos(source) {
  const photos=[];
  function scan(tokens, value, base) {
    let cursor=0;
    for(const token of tokens || []) {
      const raw=token.raw || '';
      const offset=value.indexOf(raw,cursor);
      if(offset<0 || !raw)continue;
      cursor=offset+raw.length;
      if(token.type==='image')photos.push({start:base+offset,end:base+cursor,raw,src:token.href,alt:token.text,caption:token.title || ''});
      else if(token.type!=='code' && token.type!=='codespan' && token.type!=='html') {
        if(token.tokens)scan(token.tokens,raw,base+offset);
        else if(token.items)scan(token.items,raw,base+offset);
      }
    }
  }
  scan(marked.lexer(source),source,0);
  return photos;
}
const label = value => value.replace(/\\/g,'\\\\').replace(/([\[\]])/g,'\\$1').replace(/\r?\n/g,' ');
const caption = value => value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r?\n/g,' ');
export function photoMarkdown(photo) {
  const src=photo.src.replace(/[\s()<>]/g,character=>encodeURIComponent(character));
  return `![${label(photo.alt)}](${src}${photo.caption ? ' "'+caption(photo.caption)+'"' : ''})`;
}
export function replacePhoto(source, photo, replacement) {
  if(source.slice(photo.start,photo.end)!==photo.raw)throw new Error('Текст изменился. Открой предпросмотр заново.');
  return source.slice(0,photo.start)+replacement+source.slice(photo.end);
}
export function removePhoto(source, photo) {
  replacePhoto(source,photo,''); // Validate the source range before editing.
  const start=source.lastIndexOf('\n',photo.start-1)+1;
  const next=source.indexOf('\n',photo.end);
  const end=next<0?source.length:next;
  if(!source.slice(start,photo.start).trim() && !source.slice(photo.end,end).trim())
    return source.slice(0,start)+source.slice(next<0?end:end+1);
  return replacePhoto(source,photo,'');
}
export function reorderPhotos(source, photos, from, to) {
  if(from===to || from<0 || to<0 || from>=photos.length || to>=photos.length)return source;
  const ordered=photos.map(photo=>photo.raw);
  ordered.splice(to,0,ordered.splice(from,1)[0]);
  let result=source;
  for(let i=photos.length-1;i>=0;i--)result=replacePhoto(result,photos[i],ordered[i]);
  return result;
}
