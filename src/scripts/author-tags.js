import { isSeq, isScalar, parseDocument } from 'yaml';

export const tagFilePath = path => /^src\/content\/blog\/(?:[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+\.mdx?$/u.test(path) && !path.split('/').some(part => part === '.' || part === '..');

export function tagName(value) {
  const name = value.trim();
  if (!name || /[,\r\n\u0000-\u001f]/u.test(name)) throw new Error('Введи одно название темы без запятых и переносов строк.');
  return name;
}

export function inspectTags(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { tags: [], title: '', draft: false };
  const doc = parseDocument(match[1]);
  if (doc.errors.length) throw new Error('Ошибка в полях записи. Исправь YAML перед изменением тегов.');
  const tags = doc.get('tags');
  if (tags && (!isSeq(tags) || tags.items.some(item => !isScalar(item) || typeof item.value !== 'string'))) throw new Error('Теги записи должны быть списком строк.');
  return { tags: tags?.toJSON() || [], title: String(doc.get('title') || ''), draft: doc.get('draft') === true, doc, header: match[0] };
}

export function renameTag(raw, from, to) {
  from = tagName(from); to = tagName(to);
  const parsed = inspectTags(raw);
  if (from === to || !parsed.tags.includes(from)) return raw;
  const tags = parsed.doc.get('tags');
  const seen = new Set();
  tags.items = tags.items.filter(item => {
    if (item.value === from) item.value = to;
    if (item.value === to && seen.has(to)) return false;
    if (item.value === to) seen.add(to);
    return true;
  });
  const newline = parsed.header.includes('\r\n') ? '\r\n' : '\n';
  const header = parsed.doc.toString().replace(/\r?\n/g, newline);
  // Preserve the post body byte for byte, including MDX and trailing whitespace.
  const ending = parsed.header.endsWith('\n') ? newline : '';
  return `---${newline}${header}---${ending}${raw.slice(parsed.header.length)}`;
}

export function tagPlan(entries, from, to) {
  from = tagName(from); to = tagName(to);
  if (from === to) throw new Error('Новое название совпадает с текущим.');
  const changes = [];
  const allTags = new Set();
  for (const entry of entries) {
    if (!tagFilePath(entry.path)) throw new Error('Некорректный путь записи.');
    let parsed;
    try { parsed = inspectTags(entry.raw); } catch (error) { throw new Error(`${entry.path}: ${error.message}`); }
    parsed.tags.forEach(tag => allTags.add(tag));
    if (parsed.tags.includes(from)) changes.push({ ...entry, title: parsed.title, draft: parsed.draft, nextRaw: renameTag(entry.raw, from, to) });
  }
  return { from, to, changes, merge: allTags.has(to) };
}
