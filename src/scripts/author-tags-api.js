import { tagFilePath, tagPlan } from './author-tags.js';

const REPO = 'repos/Maligrond/kaban.blog';
const decode = content => new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0)));

export async function readTagEntries(api) {
  await api.verify();
  if (api.session.type === 'local') {
    const entries = [];
    for (const extension of ['md', 'mdx']) {
      const items = await api.proxy('entriesByFolder', { folder: 'src/content/blog', extension, depth: 20 });
      for (const item of items) {
        if (!tagFilePath(item.file.path) || typeof item.data !== 'string') throw new Error('Не удалось прочитать все записи блога.');
        entries.push({ path: item.file.path, raw: item.data, sha: item.file.id });
      }
    }
    return { entries };
  }
  const ref = await api.github(`${REPO}/git/ref/heads/main`);
  const commit = await api.github(`${REPO}/git/commits/${ref.object.sha}`);
  const tree = await api.github(`${REPO}/git/trees/${commit.tree.sha}?recursive=1`);
  if (!tree || tree.truncated) throw new Error('GitHub не вернул полный список файлов. Изменения не сохранены.');
  const files = tree.tree.filter(file => file.type === 'blob' && tagFilePath(file.path));
  const entries = [];
  // Bounded batches avoid flooding GitHub with requests for large blogs.
  for (let i = 0; i < files.length; i += 4) {
    const batch = await Promise.all(files.slice(i, i + 4).map(async file => {
      const blob = await api.github(`${REPO}/git/blobs/${file.sha}`);
      if (!blob || blob.encoding !== 'base64') throw new Error(`Не удалось прочитать ${file.path}.`);
      return { path: file.path, sha: file.sha, raw: decode(blob.content) };
    }));
    entries.push(...batch);
  }
  return { entries, head: ref.object.sha, tree: commit.tree.sha };
}

async function checkDrafts(api, changes) {
  for (const prefix of ['codex/author/', 'cms/blog/']) {
    const refs = await api.github(`${REPO}/git/matching-refs/heads/${prefix}`);
    for (const ref of refs || []) {
      const slug = ref.ref.slice(`refs/heads/${prefix}`.length);
      if (!changes.some(item => item.path === `src/content/blog/${slug}/index.md` || item.path === `src/content/blog/${slug}/index.mdx`)) continue;
      const comparison = await api.github(`${REPO}/compare/main...${ref.object.sha}`);
      if (!comparison || !['identical', 'behind'].includes(comparison.status)) throw new Error(`У записи «${slug}» есть отдельный черновик. Заверши работу с ним перед изменением темы.`);
    }
  }
}

export async function saveTagPlan(api, snapshot, plan) {
  await api.verify();
  // Recompute the plan from the exact preview snapshot; never accept arbitrary file writes.
  const checked = tagPlan(snapshot.entries, plan.from, plan.to);
  if (!checked.changes.length) throw new Error('Нет записей для изменения.');
  const changes = checked.changes;
  if (api.session.type === 'local') {
    const current = await readTagEntries(api);
    const now = new Map(current.entries.map(item => [item.path, item.raw]));
    // Detect both edited entries and newly created posts containing this tag.
    const currentPlan = tagPlan(current.entries, plan.from, plan.to);
    if (currentPlan.changes.length !== changes.length || changes.some(item => now.get(item.path) !== item.raw)) throw new Error('Записи изменились после проверки. Проверь список заново.');
    try {
      await api.proxy('persistEntry', {
        dataFiles: changes.map(item => ({ path: item.path, raw: item.nextRaw, slug: item.path.split('/')[3] })),
        assets: [], options: { useWorkflow: false, status: 'published', commitMessage: `Тема: ${plan.from} → ${plan.to}` },
      });
    } catch (error) {
      // A lost response can still mean every file was saved. Report partial writes explicitly.
      const saved = await readTagEntries(api);
      const raws = new Map(saved.entries.map(item => [item.path, item.raw]));
      if (!changes.every(item => raws.get(item.path) === item.nextRaw)) throw new Error('Сохранение прервалось. Часть файлов могла измениться; проверь список заново.');
    }
    const saved = await readTagEntries(api);
    const raws = new Map(saved.entries.map(item => [item.path, item.raw]));
    if (!changes.every(item => raws.get(item.path) === item.nextRaw)) throw new Error('Не все файлы сохранены. Проверь список заново.');
    return { count: changes.length, local: true };
  }
  const ref = await api.github(`${REPO}/git/ref/heads/main`);
  if (ref.object.sha !== snapshot.head) throw new Error('Блог изменился после проверки. Проверь список заново.');
  await checkDrafts(api, changes);
  const items = [];
  for (const item of changes) {
    const blob = await api.github(`${REPO}/git/blobs`, 'POST', { content: item.nextRaw, encoding: 'utf-8' });
    if (!blob) throw new Error('GitHub не сохранил файл.');
    items.push({ path: item.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const tree = await api.github(`${REPO}/git/trees`, 'POST', { base_tree: snapshot.tree, tree: items });
  const commit = await api.github(`${REPO}/git/commits`, 'POST', { message: `Тема: ${plan.from} → ${plan.to}`, tree: tree.sha, parents: [snapshot.head] });
  try {
    const updated = await api.github(`${REPO}/git/refs/heads/main`, 'PATCH', { sha: commit.sha, force: false });
    if (!updated) throw new Error('GitHub не подтвердил сохранение.');
  } catch (error) {
    const comparison = await api.github(`${REPO}/compare/main...${commit.sha}`);
    if (!comparison || !['identical', 'behind'].includes(comparison.status)) throw error;
  }
  return { count: changes.length, local: false };
}
