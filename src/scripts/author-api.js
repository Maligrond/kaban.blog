import { parseDocument } from 'yaml';
const REPO = 'Maligrond/kaban.blog';
const OWNER = 'maligrond';
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
export const isLocal = LOCAL;
export const sessionKey = 'kaban-author-session';
export function entryCollection(path) {
  return validPath(path) ? path.split('/')[2] : null;
}
export function entrySlug(path) { return path.split('/')[3].replace(/\.md$/, ''); }
export function validPath(path) {
  return /^src\/content\/(?:books|games|countries)\/[\p{L}\p{N}_-]+\.md$/u.test(path) || path === 'src/content/pages/now/index.md' || /^src\/content\/blog\/[\p{L}\p{N}_-]+\/index\.md$/u.test(path);
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
  branch(path) {
    if (!validPath(path)) throw new Error('Некорректный адрес записи.');
    const collection = entryCollection(path);
    return collection === 'pages' ? 'codex/author-pages/now' : collection === 'blog' ? `codex/author/${entrySlug(path)}` : `codex/author-shelves/${collection}/${entrySlug(path)}`;
  }
  async read(path, published = false) {
    if (!validPath(path)) throw new Error('Некорректный адрес записи.');
    if (this.session.type === 'local') {
      const entry = await this.proxy('getEntry', { path });
      return { raw: entry.data || '', sha: entry.file.id, branch: 'main' };
    }
    const branch = this.branch(path);
    const draft = published ? null : await this.github(`repos/${REPO}/git/ref/heads/${branch}`);
    const ref = draft ? branch : 'main';
    const entry = await this.github(`repos/${REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
    return { raw: entry ? decodeText(entry.content) : '', sha: entry?.sha || null, branch: ref, commit: draft?.object.sha };
  }
  async unpublish(path, snapshot) {
    if (!validPath(path) || !snapshot.sha || snapshot.branch !== 'main') throw new Error('Открой опубликованную запись заново.');
    await this.verify();
    const current = await this.read(path, true);
    if (current.sha !== snapshot.sha) throw new Error('Опубликованная запись изменилась. Открой её заново перед снятием с публикации.');
    const editing = await this.read(path);
    const match = editing.raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) throw new Error('Не удалось прочитать поля записи.');
    const doc = parseDocument(match[1]);
    if (doc.errors.length) throw new Error('Не удалось прочитать поля записи.');
    doc.set('draft', true);
    const raw = `---\n${doc.toString()}---\n${match[2]}`;
    const saved = await this.save(path, raw, editing, [], false);
    if (this.session.type === 'local') return saved;
    // Merge the saved draft revision and clear its workflow branch. Future
    // publication then starts from draft:true in main, so Git's three-way
    // merge cannot silently retain the hidden flag when publishing again.
    return this.publish(path, saved, 'unpublish');
  }

  async readPreviewPhoto(path, source, branch = 'main') {
    if (!validPath(path) || !source || /^(?:[a-z]+:|\/)/i.test(source) || source.includes('\\')) throw new Error('Некорректный адрес фотографии.');
    const folder=path.slice(0,path.lastIndexOf('/')+1);
    let photoPath;
    try {photoPath=decodeURIComponent(new URL(source,'https://preview.invalid/'+path).pathname.slice(1));} catch {throw new Error('Некорректный адрес фотографии.');}
    if (!photoPath.startsWith(folder) || photoPath.split('/').some(part=>part==='.' || part==='..') || !/\.(?:png|jpe?g|webp|avif)$/i.test(photoPath) || !['main',this.branch(path)].includes(branch)) throw new Error('Некорректный адрес фотографии.');
    await this.verify();
    let file=this.session.type==='local'
      ? await this.proxy('getMediaFile',{path:photoPath})
      : await this.github(`repos/${REPO}/contents/${encodePath(photoPath)}?ref=${encodeURIComponent(branch)}`);
    if (file?.size>10*1024*1024) throw new Error('Фотография слишком большая для предпросмотра.');
    if (this.session.type==='github' && file?.encoding==='none' && file.sha) file=await this.github(`repos/${REPO}/git/blobs/${file.sha}`);
    if (!file || file.encoding!=='base64' || !file.content || file.content.length>15*1024*1024) throw new Error('Не удалось загрузить фотографию черновика.');
    const extension=photoPath.split('.').at(-1).toLowerCase();
    return {content:file.content.replace(/\s/g,''),type:'image/'+(extension==='jpg'?'jpeg':extension)};
  }
  async drafts() {
    if (this.session.type === 'local') {
      const items=await this.proxy('entriesByFolder', { folder: 'src/content/blog', extension: 'md', depth: 3 });
      const pages=await this.proxy('entriesByFolder', { folder: 'src/content/pages', extension: 'md', depth: 3 });
      const shelves=(await Promise.all(['books','games','countries'].map(collection=>this.proxy('entriesByFolder',{folder:`src/content/${collection}`,extension:'md',depth:1})))).flat();
      return [...items,...pages,...shelves].map(item=>({path:item.file.path,raw:item.data}));
    }
    // Drafts can already live in main (local authoring/Decap), or in an
    // author's workflow branch. Read both through the authenticated GitHub
    // API; never put unpublished post contents into a public static index.
    const refs = await this.github(`repos/${REPO}/git/matching-refs/heads/codex/author`);
    const workflowPaths = new Set((refs || [])
      .filter(ref => ref.ref.startsWith('refs/heads/codex/author/') || ref.ref.startsWith('refs/heads/codex/author-shelves/') || ref.ref === 'refs/heads/codex/author-pages/now')
      .map(ref => ref.ref === 'refs/heads/codex/author-pages/now' ? 'src/content/pages/now/index.md' : ref.ref.startsWith('refs/heads/codex/author-shelves/') ? `src/content/${ref.ref.split('/').at(-2)}/${ref.ref.split('/').at(-1)}.md` : `src/content/blog/${ref.ref.split('/').at(-1)}/index.md`)
      .filter(validPath));
    const tree = await this.github(`repos/${REPO}/git/trees/main?recursive=1`);
    if (!tree || tree.truncated) throw new Error('Не удалось получить полный список записей из GitHub. Попробуй ещё раз.');
    const paths = [...new Set([
      ...(tree.tree || []).filter(item => item.type === 'blob' && validPath(item.path)).map(item => item.path),
      ...workflowPaths,
    ])];
    const items = new Array(paths.length);
    let next = 0;
    await Promise.all(Array.from({length:Math.min(4, paths.length)}, async () => {
      while (next < paths.length) {
        const index = next++, path = paths[index];
        const workflow = workflowPaths.has(path);
        const ref = workflow ? this.branch(path) : 'main';
        const entry = await this.github(`repos/${REPO}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
        if (entry?.content) items[index] = {path, raw:decodeText(entry.content), workflow};
      }
    }));
    return items.filter(Boolean);
  }
  async save(path, raw, snapshot, assets, publish, onProgress = () => {}) {
    if (!validPath(path)) throw new Error('Некорректный адрес записи.');
    if (assets.some(asset => !asset.path.startsWith(path.slice(0,path.lastIndexOf('/')+1)) || asset.path.split('/').some(part=>part==='.' || part==='..') || !/\.(?:jpg|jpeg|png|webp|avif)$/i.test(asset.path))) throw new Error('Некорректный адрес фотографии.');
    await this.verify();
    const current = await this.read(path);
    if (current.sha !== snapshot.sha) throw new Error('Запись изменилась в другом окне. Скопируй текст перед повторным открытием.');
    if (this.session.type === 'local') {
      if(assets.length)onProgress({completed:0,total:assets.length});
      await this.proxy('persistEntry', { entry: { path, slug: entrySlug(path), raw }, assets: assets.map(({path,content})=>({path,content,encoding:'base64'})), options: { commitMessage: 'Редактор блога', useWorkflow: false, status: publish ? 'published' : 'draft' } });
      if(assets.length)onProgress({completed:assets.length,total:assets.length});
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
    if(assets.length)onProgress({completed:0,total:assets.length});
    for (const [index,asset] of assets.entries()) {
      const blob = await this.github(`repos/${REPO}/git/blobs`, 'POST', { content: asset.content, encoding: 'base64' });
      treeItems.push({ path: asset.path, mode: '100644', type: 'blob', sha: blob.sha });
      onProgress({completed:index+1,total:assets.length});
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
  async publish(path, snapshot, action = 'publish') {
    if (!validPath(path) || this.session.type !== 'github') throw new Error('Некорректный черновик.');
    const pending = { ...snapshot, publication: 'pending', action };
    try {
      await this.verify();
      const branch = this.branch(path);
      const ref = await this.github(`repos/${REPO}/git/ref/heads/${branch}`);
      if (!ref || ref.object.sha !== snapshot.commit) throw new Error('Черновик изменился в другом окне. Открой актуальную запись перед публикацией.');
      // Publish exactly the saved revision, never another editor's new branch head.
      const merged = await this.github(`repos/${REPO}/merges`, 'POST', { base: 'main', head: snapshot.commit, commit_message: `${action === 'unpublish' ? 'Снята с публикации' : 'Опубликована'} запись ${entrySlug(path)}` });
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
    return { ...snapshot, branch: 'main', publication: action === 'unpublish' ? 'withdrawn' : 'published', publicationError: undefined };
  }
}
