import { markdownPhotos } from './author-photos.js';
export function sameCoverSource(a, b) {
  return !!a && !!b && new URL(a,'https://photo.invalid/').href===new URL(b,'https://photo.invalid/').href;
}
export function hasCoverInBody(body, source) {
  if(!source)return false;
  return markdownPhotos(body).some(photo=>sameCoverSource(photo.src,source));
}
export function coverCandidates(body, current, uploaded = []) {
  const items=markdownPhotos(body).filter(photo=>photo.src && !/^(?:[a-z]+:|\/)/i.test(photo.src) && /\.(?:jpe?g|png|webp|avif)$/i.test(photo.src));
  items.push(...uploaded.filter(photo=>photo.src && !/^(?:[a-z]+:|\/)/i.test(photo.src) && /\.(?:jpe?g|png|webp|avif)$/i.test(photo.src)));
  if(current?.src && !items.some(photo=>sameCoverSource(photo.src,current.src)))items.unshift({...current});
  return [...new Map(items.map(photo=>[new URL(photo.src,'https://photo.invalid/').href,photo])).values()];
}
export function applyCover(doc, collection, choice) {
  const key=collection==='countries'?'photo':'cover';
  const alt=collection==='countries'?'photoAlt':'coverAlt';
  const shelf=collection==='books' || collection==='games';
  if(shelf && choice.src && /^(?:[a-z]+:|\/\/)/i.test(choice.src)) {doc.set('coverURL',shelfCoverURL(choice.src));doc.set(alt,choice.alt || '');doc.delete('cover');doc.delete('coverDisabled');return;}
  if(shelf)doc.delete('coverURL');
  if(choice.src) {doc.set(key,choice.src);doc.set(alt,choice.alt || '');doc.delete('coverDisabled');}
  else {doc.delete(key);doc.delete(alt);if(collection==='blog' || shelf)doc.set('coverDisabled',true);}
  if(collection==='blog')doc.delete('previewImage');
}

export function shelfCoverURL(value) {
  let url;
  try { url=new URL(value.trim()); } catch { throw new Error('Вставь полный адрес изображения: https://…'); }
  if(url.protocol!=='https:' || url.username || url.password)throw new Error('Обложка должна иметь адрес https:// без логина и пароля.');
  return url.href;
}
