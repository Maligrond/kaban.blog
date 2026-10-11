import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectTags, renameTag, tagPlan, tagFilePath } from '../src/scripts/author-tags.js';
import { readTagEntries, saveTagPlan } from '../src/scripts/author-tags-api.js';

const raw = (tags, extra = '') => `---\ntitle: Поездка\ndate: 2025-03-11\ntags: ${JSON.stringify(tags)}\n${extra}---\n\nТекст с тегом поездки.\n<Custom />\n`;
const entry = (id, tags, extra) => ({ path: `src/content/blog/${id}/index.md`, raw: raw(tags, extra), sha: id });

test('rename and merge preserve body, other metadata, comments and tag order', () => {
  const original = raw(['поездки', 'музыка', 'путешествия', 'музыка'], '# Оставить комментарий\ndraft: true\n');
  const changed = renameTag(original, 'поездки', 'путешествия');
  const metadata = inspectTags(changed);
  assert.deepEqual(metadata.tags, ['путешествия', 'музыка', 'музыка']);
  assert.equal(metadata.draft, true);
  assert.equal(metadata.doc.get('date'), '2025-03-11');
  assert.ok(changed.includes('# Оставить комментарий'));
  assert.equal(changed.slice(changed.indexOf('\n---\n') + 5), original.slice(original.indexOf('\n---\n') + 5));
  assert.equal(renameTag(original, 'отсутствует', 'новое'), original);
});
test('quoted tags and CRLF files remain valid without changing the body', () => {
  const original = raw(['поездки']).replaceAll('\n', '\r\n');
  const changed = renameTag(original, 'поездки', 'Италия: "моя"');
  assert.deepEqual(inspectTags(changed).tags, ['Италия: "моя"']);
  assert.ok(changed.endsWith('\r\n\r\nТекст с тегом поездки.\r\n<Custom />\r\n'));
  assert.equal(changed.replaceAll('\r\n', '').includes('\n'), false);
});
test('plan includes hidden and MDX entries, reports merging, skips unrelated posts', () => {
  const items = [entry('one', ['поездки']), { ...entry('two', ['поездки', 'италия'], 'draft: true\n'), path: 'src/content/blog/two/index.mdx' }, entry('other', ['италия'])];
  const plan = tagPlan(items, 'поездки', 'италия');
  assert.equal(plan.merge, true);
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.changes[1].draft, true);
  assert.throws(() => tagPlan(items, 'поездки', 'поездки'), /совпадает/);
  assert.throws(() => tagPlan(items, 'поездки', 'а,б'), /одно название/);
  assert.throws(() => tagPlan([{ ...items[0], path: '../outside.md' }], 'поездки', 'италия'), /путь/);
  assert.equal(tagFilePath('src/content/blog/../outside.md'), false);
  assert.throws(() => inspectTags('---\ntags: [1]\n---\n'), /списком строк/);
});

function localAPI(items) {
  const state = { items: structuredClone(items), writes: 0, lost: false, partial: false };
  const api = { session: { type: 'local' }, verify: async () => {}, proxy: async (action, params) => {
    if (action === 'entriesByFolder') return state.items.filter(item => item.path.endsWith(`.${params.extension}`)).map(item => ({ file: { path: item.path, id: item.sha }, data: item.raw }));
    assert.equal(action, 'persistEntry');
    assert.equal(params.entry, undefined);
    assert.equal(params.options.status, 'published');
    assert.ok(params.dataFiles.every(file => typeof file.slug === 'string'));
    state.writes++;
    for (const file of params.dataFiles.slice(0, state.partial ? 1 : undefined)) state.items.find(item => item.path === file.path).raw = file.raw;
    if (state.lost || state.partial) throw new Error('Lost response');
    return {};
  } };
  return { api, state };
}
test('local bulk edit updates all intended files and never invokes GitHub', async () => {
  const { api, state } = localAPI([entry('one', ['поездки']), entry('two', ['поездки', 'италия'])]);
  const snapshot = await readTagEntries(api);
  const result = await saveTagPlan(api, snapshot, tagPlan(snapshot.entries, 'поездки', 'италия'));
  assert.deepEqual(result, { count: 2, local: true });
  assert.equal(state.writes, 1);
  for (const item of state.items) assert.deepEqual(inspectTags(item.raw).tags, ['италия']);
});
test('local stale or newly added matching entries reject before writing', async () => {
  for (const conflict of ['edit', 'new']) {
    const { api, state } = localAPI([entry('one', ['поездки'])]);
    const snapshot = await readTagEntries(api);
    if (conflict === 'edit') state.items[0].raw += 'New text';
    else state.items.push(entry('two', ['поездки']));
    await assert.rejects(saveTagPlan(api, snapshot, tagPlan(snapshot.entries, 'поездки', 'италия')), /изменились/);
    assert.equal(state.writes, 0);
  }
});
test('local lost response is verified, partial save is never reported as success', async () => {
  for (const partial of [false, true]) {
    const { api, state } = localAPI([entry('one', ['поездки']), entry('two', ['поездки'])]);
    const snapshot = await readTagEntries(api); state.lost = true; state.partial = partial;
    const promise = saveTagPlan(api, snapshot, tagPlan(snapshot.entries, 'поездки', 'италия'));
    if (partial) await assert.rejects(promise, /Часть файлов/);
    else assert.equal((await promise).count, 2);
  }
});

function githubAPI({ stale = false, draft = false, lost = false, concurrent = false } = {}) {
  const changes = [entry('one', ['поездки']), entry('two', ['поездки'])];
  const state = { calls: [], updated: false };
  const api = { session: { type: 'github' }, verify: async () => {}, github: async (route, method = 'GET', body) => {
    state.calls.push({ route, method, body });
    if (route.endsWith('/git/ref/heads/main')) return { object: { sha: stale ? 'different' : 'base' } };
    if (route.includes('matching-refs')) return draft ? [{ ref: 'refs/heads/codex/author/one', object: { sha: 'draft' } }] : [];
    if (route.includes('/compare/')) return { status: state.updated ? 'behind' : 'ahead' };
    if (route.endsWith('/git/blobs')) return { sha: 'blob' };
    if (route.endsWith('/git/trees')) return { sha: 'tree' };
    if (route.endsWith('/git/commits')) return { sha: 'new-commit' };
    if (method === 'PATCH') { if (concurrent) throw new Error('Conflict'); state.updated = true; if (lost) throw new Error('Lost response'); return {}; }
    throw new Error('Unexpected request ' + route);
  } };
  return { api, state, snapshot: { entries: changes, head: 'base', tree: 'base-tree' }, plan: tagPlan(changes, 'поездки', 'италия') };
}
test('GitHub changes all files in one commit with a non-forced main update', async () => {
  const { api, state, snapshot, plan } = githubAPI();
  assert.equal((await saveTagPlan(api, snapshot, plan)).count, 2);
  assert.equal(state.calls.find(call => call.route.endsWith('/git/trees')).body.tree.length, 2);
  assert.deepEqual(state.calls.find(call => call.method === 'PATCH').body, { sha: 'new-commit', force: false });
  assert.deepEqual(state.calls.find(call => call.route.endsWith('/git/commits')).body.parents, ['base']);
});
test('GitHub stale snapshot or affected open draft blocks mutations', async () => {
  for (const options of [{ stale: true }, { draft: true }]) {
    const { api, state, snapshot, plan } = githubAPI(options);
    await assert.rejects(saveTagPlan(api, snapshot, plan), /изменился|черновик/);
    assert.equal(state.calls.filter(call => call.method !== 'GET').length, 0);
  }
});
test('GitHub lost update response is confirmed but a concurrent change is not overwritten', async () => {
  const success = githubAPI({ lost: true });
  assert.equal((await saveTagPlan(success.api, success.snapshot, success.plan)).count, 2);
  const conflict = githubAPI({ concurrent: true });
  await assert.rejects(saveTagPlan(conflict.api, conflict.snapshot, conflict.plan), /Conflict/);
});
test('tag changes require owner verification before reads or writes', async () => {
  const { api, snapshot, plan, state } = githubAPI();
  api.verify = async () => { throw new Error('Owner only'); };
  await assert.rejects(readTagEntries(api), /Owner only/);
  await assert.rejects(saveTagPlan(api, snapshot, plan), /Owner only/);
  assert.equal(state.calls.length, 0);
});
