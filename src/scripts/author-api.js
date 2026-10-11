const REPO = 'Maligrond/kaban.blog';
const OWNER = 'maligrond';
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
export const isLocal = LOCAL;
export const sessionKey = 'kaban-author-session';
export function validPath(path) {
  return /^src\/content\/blog\/[\p{L}\p{N}_-]+\/index\.md$/u.test(path);
}
export function encodeText(text) {
  return btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(''));
}
function decodeText(text) {
  return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), char => char.charCodeAt(0)));
}
export class AuthorAPI {
  constructor(session) { this.session = session; }
  async proxy(action, params = {}) {
    if (!LOCAL || this.session.type !== 'local') throw new Error('Локальный режим недоступен.');
    const response = await fetch('http://localhost:8081/api/v1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, params: { branch: 'main', ...params } }) });
    if (!response.ok) throw new Error('Локальный редактор недоступен. Запусти npm run cms.');
    return response.json();
  }
  async github(path, method = 'GET', body) {
    const response = await fetch(`https://api.github.com/${path}`, { method, headers: { Authorization: `Bearer ${this.session.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      if (response.status === 404) return null;
      if ([401,403].includes(response.status)) throw new Error('Нет доступа. Войди снова через GitHub.');
      if ([409,422].includes(response.status)) throw new Error('Запись изменилась или возник конфликт. Скопируй текст и открой редактор заново.');
      throw new Error('GitHub не сохранил изменения. Попробуй ещё раз.');
    }
    return response.status === 204 ? {} : response.json();
  }
  async verify() {
    if (this.session.type === 'local') {
      const info = await this.proxy('info');
      if (info.repo !== 'kaban.blog' || info.type !== 'local_fs') throw new Error('Подключён другой локальный репозиторий.');
      return;
    }
    if (this.session.type !== 'github' || !this.session.token) throw new Error('Нужен вход автора.');
    const user = await this.github('user');
    const repo = await this.github(`repos/${REPO}`);
    if (user?.login?.toLowerCase() !== OWNER || !repo?.permissions?.push) throw new Error('Режим автора доступен только владельцу блога.');
  }
  branch(path) { return `codex/author/${path.split('/')[3]}`; }
  async read(path) {
    if (!validPath(path)) throw new Error('Некорректный адрес записи.');
    if (this.session.type === 'local') {
      const entry = await this.proxy('getEntry', { path });
      return { raw: entry.data || '', sha: entry.file.id, branch: 'main' };
    }
    const branch = this.branch(path);
    const draft = await this.github(`repos/${REPO}/git/ref/heads/${branch}`);
    const ref = draft ? branch : 'main';
    const entry = await this.github(`repos/${REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
    return { raw: entry ? decodeText(entry.content) : '', sha: entry?.sha || null, branch: ref, commit: draft?.object.sha };
  }
  async drafts() {
    if (this.session.type === 'local') return (await this.proxy('entriesByFolder', { folder: 'src/content/blog', extension: 'md', depth: 3 })).map(item => ({path: item.file.path, raw: item.data}));
    const refs = await this.github(`repos/${REPO}/git/matching-refs/heads/codex/author/`);
    return (refs || []).map(ref => ({ path: `src/content/blog/${ref.ref.split('/').at(-1)}/index.md` }));
  }
  async save(path, raw, snapshot, assets, publish) {
    await this.verify();
    const current = await this.read(path);
    if (current.sha !== snapshot.sha) throw new Error('Запись изменилась в другом окне. Скопируй текст перед повторным открытием.');
    if (this.session.type === 'local') {
      await this.proxy('persistEntry', { entry: { path, slug: path.split('/')[3], raw }, assets: assets.map(({path,content})=>({path,content,encoding:'base64'})), options: { commitMessage: 'Редактор блога', useWorkflow: false, status: publish ? 'published' : 'draft' } });
      return this.read(path);
    }
    const branch = this.branch(path);
    let ref = await this.github(`repos/${REPO}/git/ref/heads/${branch}`);
    if (!ref) {
      const main = await this.github(`repos/${REPO}/git/ref/heads/main`);
      ref = await this.github(`repos/${REPO}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha: main.object.sha });
      if (!ref) throw new Error('Не удалось создать ветку черновика.');
    }
    const branchEntry = await this.github(`repos/${REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
    if ((branchEntry?.sha || null) !== snapshot.sha) throw new Error("Запись изменилась во время сохранения. Открой её заново.");
    const head = await this.github(`repos/${REPO}/git/commits/${ref.object.sha}`);
    const contentBlob = await this.github(`repos/${REPO}/git/blobs`, 'POST', { content: raw, encoding: 'utf-8' });
    const treeItems = [{ path, mode: '100644', type: 'blob', sha: contentBlob.sha }];
    for (const asset of assets) {
      const blob = await this.github(`repos/${REPO}/git/blobs`, 'POST', { content: asset.content, encoding: 'base64' });
      treeItems.push({ path: asset.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const tree = await this.github(`repos/${REPO}/git/trees`, 'POST', { base_tree: head.tree.sha, tree: treeItems });
    const commit = await this.github(`repos/${REPO}/git/commits`, 'POST', { message: `${publish ? 'Публикация' : 'Черновик'}: ${path.split('/')[3]}`, tree: tree.sha, parents: [ref.object.sha] });
    const saved = { raw, sha: contentBlob.sha, branch, commit: commit.sha, publication: 'draft' };
    try {
      const updated = await this.github(`repos/${REPO}/git/refs/heads/${branch}`, 'PATCH', { sha: commit.sha, force: false });
      if (!updated) throw new Error('Не удалось сохранить ветку черновика.');
    } catch (error) {
      // A lost response must not make an already saved draft look unsaved.
      let confirmed;
      try { confirmed = await this.github(`repos/${REPO}/git/ref/heads/${branch}`); } catch { /* Keep the browser recovery copy. */ }
      if (confirmed?.object.sha !== commit.sha) throw error;
    }
    return publish ? this.publish(path, saved) : saved;
  }
  async publish(path, snapshot) {
    if (!validPath(path) || this.session.type !== 'github') throw new Error('Некорректный черновик.');
    const pending = { ...snapshot, publication: 'pending' };
    try {
      await this.verify();
      const branch = this.branch(path);
      const ref = await this.github(`repos/${REPO}/git/ref/heads/${branch}`);
      if (!ref || ref.object.sha !== snapshot.commit) throw new Error('Черновик изменился в другом окне. Открой актуальную запись перед публикацией.');
      // Publish exactly the saved revision, never another editor's new branch head.
      const merged = await this.github(`repos/${REPO}/merges`, 'POST', { base: 'main', head: snapshot.commit, commit_message: `Опубликована запись ${path.split('/')[3]}` });
      if (!merged) throw new Error('GitHub не подтвердил публикацию.');
    } catch (error) {
      // The merge may have succeeded even when its response was lost.
      let comparison;
      try { comparison = await this.github(`repos/${REPO}/compare/main...${snapshot.commit}`); } catch { /* Retry remains available. */ }
      if (!comparison || !['identical','behind'].includes(comparison.status)) return { ...pending, publicationError: error.message };
    }
    // Cleanup is optional: failure here must not undo successful publication.
    try {
      const ref = await this.github(`repos/${REPO}/git/ref/heads/${this.branch(path)}`);
      if (ref?.object.sha === snapshot.commit) await this.github(`repos/${REPO}/git/refs/heads/${this.branch(path)}`, 'DELETE');
    } catch { /* The already published revision remains safe in main. */ }
    return { ...snapshot, branch: 'main', publication: 'published', publicationError: undefined };
  }
}
