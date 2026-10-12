export const shelfStatuses = {
  books: {reading:'Читаю', rereading:'Перечитываю', favorite:'Любимая', finished:'Прочитал', dropped:'Забросил'},
  games: {playing:'Играю', replaying:'Перепрохожу', favorite:'Любимая', finished:'Прошёл', dropped:'Забросил'},
};
export function shelfStatusLabel(collection, status) { return shelfStatuses[collection]?.[status] || ''; }
// Keep the inline editor limited to the site's existing content schemas.
export const shelfNames = {books:'книгу', games:'игру', countries:'город'};
export function entryPath(collection, slug) {
  if (!/^[\p{L}\p{N}_-]+$/u.test(slug)) throw new Error('Адрес может содержать буквы, цифры и дефисы.');
  if (collection === 'blog') return `src/content/blog/${slug}/index.md`;
  if (!(collection in shelfNames)) throw new Error('Неизвестная подборка.');
  return `src/content/${collection}/${slug}.md`;
}
export function shelfValues(collection, fields) {
  if (!(collection in shelfNames)) throw new Error('Неизвестная подборка.');
  const rating=Number(fields.rating);
  if (!Number.isInteger(rating) || rating<1 || rating>5) throw new Error('Оценка должна быть от 1 до 5.');
  const values={rating};
  if (fields.status) {
    if (!shelfStatuses[collection]?.[fields.status]) throw new Error('Выбери пометку из списка.');
    values.status=fields.status;
  }
  if (collection==='books') {
    if (!fields.author.trim()) throw new Error('Укажи автора книги.');
    values.author=fields.author.trim();
  } else if (collection==='games') {
    const year=Number(fields.year);
    if (!Number.isInteger(year) || year<1900 || year>2100) throw new Error('Укажи год выпуска игры.');
    values.year=year;
  } else {
    if (!fields.country.trim()) throw new Error('Укажи страну.');
    values.country=fields.country.trim(); values.flag=fields.flag.trim(); values.favorite=!!fields.favorite;
  }
  if (collection!=='countries' && fields.url?.trim()) {
    let url;
    try { url=new URL(fields.url.trim()); } catch { throw new Error('Укажи полный адрес ссылки.'); }
    if (!['http:','https:'].includes(url.protocol)) throw new Error('Ссылка должна начинаться с https:// или http://.');
    values.url=url.href;
  }
  return values;
}
