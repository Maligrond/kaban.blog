import { parseDocument } from 'yaml';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import NetlifyAuth from 'netlify-auth-providers';
import { AuthorAPI, sessionKey, isLocal, validPath } from './author-api.js';
import '../styles/author.css';
import { draftStorage } from './author-drafts.js';
import { layoutPreviewPhotos, initializeGalleries } from './photo-layout.js';
import { enhancePost } from './post-enhancements.js';

let api;
let activeEditor;
let pending = false;
let flushRecovery;
const create = (tag, attrs = {}, text = '') => {
  const element = document.createElement(tag);
  Object.entries(attrs).forEach(([key,value]) => element.setAttribute(key, value));
  element.textContent = text;
  return element;
};
function splitContent(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  const doc = parseDocument(match ? match[1] : '{}');
  if (doc.errors.length) throw new Error('Не удалось прочитать поля записи. Открой её в резервной админке.');
  return { doc, body: match ? match[2].trimStart() : raw };
}
function dateValue(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.valueOf()) ? new Date().toISOString().slice(0,10) : date.toISOString().slice(0,10);
}
function slugify(title) {
  return title.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,80);
}
function button(label, action, primary = false) {
  const element = create('button', { type:'button', ...(primary ? {class:'author-primary'} : {}) }, label);
  element.addEventListener('click', action);
  return element;
}
function getSession() {
  try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch { return null; }
}
export async function activateAuthor() {
  if (pending || document.querySelector('.author-tools') || activeEditor) return;
  const session = getSession();
  if (!session) return;
  pending = true;
  try {
    api = new AuthorAPI(session);
    await api.verify();
    if (document.querySelector('.author-tools')) return;
    const main = document.querySelector('main');
    if (!main) return;
    const tools = create('div', {class:'author-tools site-container','data-pagefind-ignore':''});
    tools.append(create('span',{class:'author-identity'}, isLocal && session.type === 'local' ? 'Автор · локально' : 'Режим автора'));
    tools.append(button('Новая запись',()=>openEditor(null)));
    const path = document.querySelector('[data-author-path]')?.getAttribute('data-author-path');
    if (path && validPath(path)) tools.append(button('Редактировать',()=>openEditor(path)));
    tools.append(button('Черновики',openDrafts));
    tools.append(button('Выйти',()=>{
      sessionStorage.removeItem(sessionKey); api = null; tools.remove();
    }));
    main.prepend(tools);
  } catch (error) {
    sessionStorage.removeItem(sessionKey);
    document.querySelector('.author-tools')?.remove();
    const status = document.querySelector('#author-login-status');
    if (status) status.textContent = error.message;
  } finally { pending = false; }
}
export function initializeAuthorLogin() {
  const status = document.querySelector('#author-login-status');
  const login = async session => {
    try {
      const candidate = new AuthorAPI(session);
      await candidate.verify();
      sessionStorage.setItem(sessionKey, JSON.stringify(session));
      location.assign('/blog/');
    } catch(error) { status.textContent = error.message; }
  };
  document.querySelector('#author-github-login')?.addEventListener('click',()=>{
    status.textContent = 'Открываю вход через GitHub…';
    // The legacy UMD package is wrapped differently by Vite's dev and build loaders.
    const Authenticator = typeof NetlifyAuth === 'function' ? NetlifyAuth : NetlifyAuth.default;
    const authenticator = new Authenticator({ site_id:'kaban.blog' });
    authenticator.authenticate({ provider:'github',scope:'repo' },(error,data)=>{
      if (error || !data?.token) { status.textContent = 'Вход не завершён. Проверь настройку OAuth в Netlify.'; return; }
      login({type:'github',token:data.token});
    });
  });
  const localButton = document.querySelector('#author-local-login');
  if (isLocal && localButton) {
    localButton.hidden = false;
    localButton.addEventListener('click',()=>login({type:'local'}));
  }
}
async function openDrafts() {
  try {
    const items = await api.drafts();
    const dialog = create('dialog',{class:'author-drafts','aria-label':'Черновики','data-pagefind-ignore':''});
    dialog.append(create('h2',{},'Черновики'));
    let count = 0;
    for (const item of items) {
      if (!validPath(item.path)) continue;
      const parsed = item.raw ? splitContent(item.raw) : null;
      if (parsed && !parsed.doc.get('draft')) continue;
      count++;
      dialog.append(button(parsed?.doc.get('title') || item.path.split('/')[3],()=>{dialog.close(); dialog.remove(); openEditor(item.path);}));
    }
    if (!count) dialog.append(create('p',{},'Пока нет черновиков.'));
    dialog.append(button('Закрыть',()=>{dialog.close();dialog.remove();}));
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    document.body.append(dialog); dialog.showModal();
  } catch(error) { alert(error.message); }
}
async function openEditor(path) {
  if (activeEditor) return;
  const tools = document.querySelector('.author-tools');
  const loading = create('p',{class:'author-status',role:'status'},'Открываю запись…');
  tools?.append(loading);
  try {
    await api.verify();
    let snapshot = path ? await api.read(path) : {raw:'',sha:null};
    const {doc,body} = splitContent(snapshot.raw);
    let recoveryKey = `${api.session.type}:${path || 'new'}`;
    let cachedDraft;
    try { cachedDraft = await draftStorage('get', recoveryKey); } catch { /* Editing stays available if storage is disabled. */ }
    const main = document.querySelector('main');
    const original = document.createDocumentFragment();
    while (main.firstChild) original.append(main.firstChild);
    loading.remove();
    const editor = create('section',{class:'author-editor site-container','data-pagefind-ignore':''});
    activeEditor = editor;
    const top = create('div',{class:'author-editor-top'});
    const close = () => {
      if (editor.dataset.dirty === 'true' && !confirm('Изменения останутся в этом браузере. Закрыть редактор?')) return;
      clearTimeout(autosaveTimer);
      if (editor.dataset.dirty === 'true') persistRecovery();
      assets.forEach(asset=>URL.revokeObjectURL(asset.url));
      flushRecovery = null;
      activeEditor = null; editor.remove(); main.append(original);
    };
    top.append(button('← Вернуться к записи',close),create('span',{class:'author-identity'},api.session.type === 'local' ? 'Сохраняется на этом компьютере' : 'Сохраняется в GitHub'));
    editor.append(top);
    const form = create('form',{class:'author-form'});
    function field(label,name,value,tag='input',type='text') {
      const wrapper = create('label',{class:`author-field author-field-${name}`});
      wrapper.append(create('span',{},label));
      const input = create(tag,{name,...(tag==='input'?{type}:{})}); input.value = value;
      wrapper.append(input); form.append(wrapper); return input;
    }
    const title = field('Заголовок','title',doc.get('title') || ''); title.required=true;
    const text = field('Текст','body',body,'textarea'); text.rows=16;
    const meta = create('div',{class:'author-meta-fields'});
    const tags = field('Теги через запятую','tags',(doc.get('tags')?.toJSON?.() || []).join(', '));
    const date = field('Дата','date',dateValue(doc.get('date')),'input','date'); date.required=true;
    const description = field('Короткое описание','description',doc.get('description') || '','textarea'); description.rows=2; description.required=true;
    [tags,date,description].forEach(input=>meta.append(input.parentElement));
    const slug = field('Адрес записи','slug',path ? path.split('/')[3] : ''); slug.required=true;
    if (path) slug.readOnly=true;
    meta.append(slug.parentElement);
    form.append(meta);
    const assets = [];
    let galleryUpload = false;
    let autosaveTimer;
    let uploading = false;
    let recoveryQueue = Promise.resolve();
    const mediaInput = create('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/avif',multiple:'',hidden:''});
    const formatBar = create('div',{class:'author-format-bar'});
    function insert(value) {
      text.setRangeText(value,text.selectionStart,text.selectionEnd,'end'); text.dispatchEvent(new Event('input',{bubbles:true})); text.focus();
    }
    formatBar.append(button('Жирный',()=>insert('**текст**')),button('Ссылка',()=>insert('[текст](https://)')),button('Фотографии',()=>{galleryUpload=false;mediaInput.click();}),button('Галерея',()=>{galleryUpload=true;mediaInput.click();}));
    text.parentElement.before(formatBar); formatBar.append(mediaInput);
    const help=create('details',{class:'author-format-help'});
    help.append(create('summary',{},'Как оформить текст и добавить видео'));
    help.append(create('p',{},'Поставь команду на отдельной строке перед абзацем. После абзаца оставь пустую строку.'));
    const examples=[
      ['.lead','Вступление — чуть крупнее обычного текста.'],
      ['.loud','Выделенная мысль — крупная и выразительная.'],
      ['.foot','Примечание — небольшой текст под основным абзацем.'],
    ];
    for(const [command,description] of examples) {
      const row=create('div',{class:'author-help-example'});
      row.append(create('p',{},description),create('pre',{},command+'\nТвой текст здесь.'));
      row.append(button('Вставить '+command,()=>insert('\n\n'+command+'\nТвой текст здесь.\n\n')));
      help.append(row);
    }
    help.append(create('p',{},'YouTube: вставь ссылку на ролик отдельным абзацем — в предпросмотре и записи появится плеер. Внутри предложения ссылка останется обычной ссылкой.'));
    help.append(create('pre',{},'https://www.youtube.com/watch?v=…'));
    help.append(create('p',{},'Подпись фотографии пишется в кавычках после адреса. Для галереи расположи снимки на соседних строках без пустой строки между ними.'));
    help.append(create('pre',{},'![Описание](photo.jpg "Подпись фотографии")'));
    formatBar.after(help);
    const preview = create('div',{class:'author-preview post-content blog-post-content post-photo-content',hidden:''});
    const status = create('p',{class:'author-status',role:'status','aria-live':'polite'});
    const recoveryStatus = create('p',{class:'author-status author-recovery-status',role:'status'},'Текст и фотографии автоматически сохраняются в этом браузере.');
    async function persistRecovery() {
      const value = {fields:Object.fromEntries([title,text,tags,date,description,slug].map(input=>[input.name,input.value])),
        assets:assets.map(({name,content})=>({name,content})), sha:snapshot.sha, savedAt:Date.now()};
      recoveryQueue = recoveryQueue.catch(()=>{}).then(()=>draftStorage('put',recoveryKey,value));
      try { await recoveryQueue; recoveryStatus.textContent='Сохранено в браузере · ' + new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}); }
      catch { recoveryStatus.textContent='Не удалось сохранить в браузере. Сохрани черновик перед закрытием.'; }
    }
    flushRecovery = () => {if(editor.dataset.dirty==='true') {clearTimeout(autosaveTimer);persistRecovery();}};
    const actions = create('div',{class:'author-editor-actions'});
    let imageMap = {};
    fetch('/admin/media.json').then(r=>r.json()).then(map=>{imageMap=map;}).catch(()=>{});
    function refreshPreview() {
      preview.innerHTML = DOMPurify.sanitize(marked.parse(text.value,{async:false}));
      preview.querySelectorAll('img').forEach(img=>{
        const src=img.getAttribute('src');
        const asset=assets.find(a=>a.name===src);
        if(asset) {img.src=asset.url;return;}
        if(!src || /^(?:[a-z]+:|\/)/i.test(src)) return;
        const targetPath=path || `src/content/blog/${slug.value}/index.md`;
        const key=new URL(src,'https://preview.invalid/'+targetPath).pathname.slice(1);
        if(imageMap[decodeURIComponent(key)]) img.src=imageMap[decodeURIComponent(key)];
      });
      enhancePost(preview);
      layoutPreviewPhotos(preview); initializeGalleries(preview);
      document.dispatchEvent(new Event('kaban:photos-changed'));
    }
    const toggle = button('Предпросмотр',()=>{
      const showing = preview.hidden;
      preview.hidden=!showing; text.parentElement.hidden=showing; formatBar.hidden=showing;
      toggle.textContent=showing?'Редактировать текст':'Предпросмотр';
      if(showing) refreshPreview();
    });
    form.addEventListener('input',()=>{editor.dataset.dirty='true'; clearTimeout(autosaveTimer); autosaveTimer=setTimeout(persistRecovery,400); if(!preview.hidden)refreshPreview();});
    title.addEventListener('input',()=>{if(!path && !slug.dataset.manual)slug.value=slugify(title.value);});
    slug.addEventListener('input',()=>{slug.dataset.manual='true';});
    async function addPhotos(files, gallery = false) {
      if(uploading || saving) return;
      uploading=true; text.disabled=true;
      formatBar.querySelectorAll('button').forEach(btn=>btn.disabled=true);
      top.querySelectorAll('button').forEach(btn=>btn.disabled=true);
      const start=text.selectionStart, end=text.selectionEnd;
      try {
        const chosen=Array.from(files);
        if(!chosen.length) return;
        if(chosen.some(file=>!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type) || file.size>10*1024*1024)) throw new Error('Выбери JPG, PNG, WebP или AVIF до 10 МБ.');
        status.textContent='Добавляю фотографии…';
        const additions=[];
        for (const file of chosen) {
          const extension=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];
          const name=`photo-${crypto.randomUUID()}.${extension}`;
          const bytes=new Uint8Array(await file.arrayBuffer());
          let binary=''; for(const byte of bytes)binary+=String.fromCharCode(byte);
          additions.push({name,content:btoa(binary),url:URL.createObjectURL(file)});
        }
        assets.push(...additions);
        text.disabled=false;
        text.setSelectionRange(start,end);
        insert('\n\n'+additions.map(asset=>`![Описание фотографии](${asset.name} "")`).join(gallery?'\n':'\n\n')+'\n\n');
        status.textContent=gallery?'Галерея добавлена. Впиши подписи в кавычки после адресов фотографий.':'Фотографии добавлены. Подпись можно вписать в кавычки после адреса.';
        await persistRecovery();
      } catch(error) {status.textContent=error.message;}
      finally {uploading=false; text.disabled=false; formatBar.querySelectorAll('button').forEach(btn=>btn.disabled=false);top.querySelectorAll('button').forEach(btn=>btn.disabled=false);}
    }
    mediaInput.addEventListener('change',async()=>{
      await addPhotos(mediaInput.files,galleryUpload);
      galleryUpload=false; mediaInput.value='';
    });
    text.addEventListener('paste',event=>{
      const files=Array.from(event.clipboardData?.files || []);
      if(!files.length) return;
      event.preventDefault(); addPhotos(files,files.length>1);
    });
    text.addEventListener('dragover',event=>{
      if(!event.dataTransfer?.types.includes('Files'))return;
      event.preventDefault(); text.classList.add('author-drop-target');
    });
    text.addEventListener('dragleave',()=>text.classList.remove('author-drop-target'));
    text.addEventListener('drop',event=>{
      if(!event.dataTransfer?.files.length)return;
      event.preventDefault(); text.classList.remove('author-drop-target');
      addPhotos(event.dataTransfer.files,event.dataTransfer.files.length>1);
    });
    editor.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
    editor.addEventListener('drop',event=>{if(event.dataTransfer?.files.length)event.preventDefault();});
    text.setAttribute('aria-describedby','author-photo-hint');
    text.parentElement.append(create('small',{class:'author-photo-hint',id:'author-photo-hint'},'Перетащи фотографии сюда или вставь скриншот через ⌘V / Ctrl+V. Несколько снимков вместе — галерея.'));
    let saving=false;
    async function save(publish) {
      if(uploading) {status.textContent='Дождись добавления фотографий.';return;}
      if(saving || !form.reportValidity()) return;
      if(!title.value.trim() || !description.value.trim()) {status.textContent='Заполни заголовок и короткое описание.';return;}
      const targetPath=path || `src/content/blog/${slug.value}/index.md`;
      if(!validPath(targetPath)) {status.textContent='Адрес может содержать буквы, цифры и дефисы.';return;}
      saving=true; clearTimeout(autosaveTimer);
      form.querySelectorAll('input,textarea,button').forEach(input=>input.disabled=true);
      status.textContent=publish?'Публикую…':'Сохраняю черновик…';
      try {
        doc.set('title',title.value.trim()); doc.set('description',description.value.trim());
        doc.set('date',date.value); doc.set('tags',tags.value.split(',').map(t=>t.trim()).filter(Boolean)); doc.set('draft',!publish);
        const raw=`---\n${doc.toString()}---\n\n${text.value}\n`;
        const staged=assets.map(asset=>({path:targetPath.slice(0,targetPath.lastIndexOf('/')+1)+asset.name,content:asset.content}));
        snapshot=await api.save(targetPath,raw,snapshot,staged,publish);
        path=targetPath; slug.readOnly=true; editor.dataset.dirty='false';
        clearTimeout(autosaveTimer);
        await recoveryQueue.catch(()=>{});
        try { await draftStorage('delete',recoveryKey); } catch { /* A stale recovery copy is harmless. */ }
        recoveryKey=`${api.session.type}:${targetPath}`;
        recoveryStatus.textContent='Сохранено ' + (api.session.type==='local'?'в файле записи.':'в GitHub.');
        status.textContent=api.session.type==='local'
          ? (publish?'Запись сохранена локально. На сайте появится после сборки; пуш выполняется отдельно.':'Черновик сохранён локально и скрыт с сайта.')
          : (publish?'Изменения отправлены в main. Запись появится после сборки Netlify.':'Черновик сохранён в GitHub. Посетители его не видят.');
      } catch(error) {status.textContent=error.message;}
      finally {saving=false; form.querySelectorAll('input,textarea,button').forEach(input=>input.disabled=false);}
    }
    actions.append(toggle,button('Сохранить черновик',()=>save(false)),button('Опубликовать',()=>save(true),true));
    text.parentElement.after(preview);
    form.append(actions,status,recoveryStatus);
    if(cachedDraft?.fields) {
      const notice=create('div',{class:'author-recovery-notice'});
      notice.append(create('p',{},cachedDraft.sha !== snapshot.sha ? 'Есть несохранённая копия. Запись изменилась после её создания — восстановление заменит текст в редакторе.' : 'Есть несохранённая копия этой записи в браузере.'));
      notice.append(button('Восстановить',()=>{
        [title,text,tags,date,description,slug].forEach(input=>{if(input!==slug || !path)input.value=cachedDraft.fields[input.name] ?? input.value;});
        if(!path)slug.dataset.manual='true';
        for(const asset of cachedDraft.assets || []) {
          const bytes=Uint8Array.from(atob(asset.content),c=>c.charCodeAt(0));
          assets.push({...asset,url:URL.createObjectURL(new Blob([bytes]))});
        }
        editor.dataset.dirty='true'; notice.remove(); persistRecovery();
      }),button('Удалить копию',async()=>{
        try {await draftStorage('delete',recoveryKey);notice.remove();} catch {status.textContent='Не удалось удалить копию.';}
      }));
      top.after(notice);
    } form.addEventListener('submit',e=>e.preventDefault());
    editor.append(form); main.append(editor);
    document.querySelectorAll(".site-header a").forEach(link=>link.setAttribute("data-astro-reload", ""));
    title.focus();
  } catch(error) {loading.textContent=error.message;}
}
window.addEventListener('beforeunload',event=>{
  if(activeEditor?.dataset.dirty==='true') {flushRecovery?.();event.preventDefault();event.returnValue='';}
});
// Intercept links before Astro navigation; native reloads use beforeunload too.
document.addEventListener('click',event=>{
  if(!activeEditor || activeEditor.dataset.dirty!=='true' || !(event.target instanceof Element)) return;
  const link=event.target.closest('a[href]');
  if(!link || link.getAttribute('href').startsWith('#')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if(confirm('Уйти без сохранения изменений?')) {
    activeEditor.dataset.dirty='false';
    location.assign(link.href);
  }
},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushRecovery?.();});
window.addEventListener('pagehide',()=>flushRecovery?.());
document.addEventListener('astro:before-swap',()=>{flushRecovery?.();flushRecovery=null;activeEditor=null;});
