import { parseDocument } from 'yaml';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import NetlifyAuth from 'netlify-auth-providers';
import { AuthorAPI, sessionKey, isLocal, validPath } from './author-api.js';
import '../styles/author.css';

let api;
let activeEditor;
let pending = false;
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
    const main = document.querySelector('main');
    const original = document.createDocumentFragment();
    while (main.firstChild) original.append(main.firstChild);
    loading.remove();
    const editor = create('section',{class:'author-editor site-container','data-pagefind-ignore':''});
    activeEditor = editor;
    const top = create('div',{class:'author-editor-top'});
    const close = () => {
      if (editor.dataset.dirty === 'true' && !confirm('Закрыть редактор без сохранения изменений?')) return;
      assets.forEach(asset=>URL.revokeObjectURL(asset.url));
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
    const mediaInput = create('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/avif',multiple:'',hidden:''});
    const formatBar = create('div',{class:'author-format-bar'});
    function insert(value) {
      text.setRangeText(value,text.selectionStart,text.selectionEnd,'end'); text.dispatchEvent(new Event('input',{bubbles:true})); text.focus();
    }
    formatBar.append(button('Жирный',()=>insert('**текст**')),button('Ссылка',()=>insert('[текст](https://)')),button('Фотографии',()=>mediaInput.click()));
    text.parentElement.before(formatBar); formatBar.append(mediaInput);
    const preview = create('div',{class:'author-preview post-content blog-post-content',hidden:''});
    const status = create('p',{class:'author-status',role:'status','aria-live':'polite'});
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
    }
    const toggle = button('Предпросмотр',()=>{
      const showing = preview.hidden;
      preview.hidden=!showing; text.parentElement.hidden=showing; formatBar.hidden=showing;
      toggle.textContent=showing?'Редактировать текст':'Предпросмотр';
      if(showing) refreshPreview();
    });
    form.addEventListener('input',()=>{editor.dataset.dirty='true'; if(!preview.hidden)refreshPreview();});
    title.addEventListener('input',()=>{if(!path && !slug.dataset.manual)slug.value=slugify(title.value);});
    slug.addEventListener('input',()=>{slug.dataset.manual='true';});
    mediaInput.addEventListener('change',async()=>{
      try {
        for (const file of mediaInput.files) {
          if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type) || file.size>10*1024*1024) throw new Error('Выбери JPG, PNG, WebP или AVIF до 10 МБ.');
          const extension=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];
          const name=`photo-${crypto.randomUUID()}.${extension}`;
          const bytes=new Uint8Array(await file.arrayBuffer());
          let binary=''; for(const byte of bytes)binary+=String.fromCharCode(byte);
          assets.push({name,content:btoa(binary),url:URL.createObjectURL(file)});
          insert(`\n![Описание фотографии](${name})\n`);
        }
      } catch(error) {status.textContent=error.message;}
      mediaInput.value='';
    });
    let saving=false;
    async function save(publish) {
      if(saving || !form.reportValidity()) return;
      if(!title.value.trim() || !description.value.trim()) {status.textContent='Заполни заголовок и короткое описание.';return;}
      const targetPath=path || `src/content/blog/${slug.value}/index.md`;
      if(!validPath(targetPath)) {status.textContent='Адрес может содержать буквы, цифры и дефисы.';return;}
      saving=true; actions.querySelectorAll('button').forEach(btn=>btn.disabled=true);
      status.textContent=publish?'Публикую…':'Сохраняю черновик…';
      try {
        doc.set('title',title.value.trim()); doc.set('description',description.value.trim());
        doc.set('date',date.value); doc.set('tags',tags.value.split(',').map(t=>t.trim()).filter(Boolean)); doc.set('draft',!publish);
        const raw=`---\n${doc.toString()}---\n\n${text.value}\n`;
        const staged=assets.map(asset=>({path:targetPath.slice(0,targetPath.lastIndexOf('/')+1)+asset.name,content:asset.content}));
        snapshot=await api.save(targetPath,raw,snapshot,staged,publish);
        path=targetPath; slug.readOnly=true; editor.dataset.dirty='false';
        status.textContent=api.session.type==='local'
          ? (publish?'Запись сохранена локально. На сайте появится после сборки; пуш выполняется отдельно.':'Черновик сохранён локально и скрыт с сайта.')
          : (publish?'Изменения отправлены в main. Запись появится после сборки Netlify.':'Черновик сохранён в GitHub. Посетители его не видят.');
      } catch(error) {status.textContent=error.message;}
      finally {saving=false; actions.querySelectorAll('button').forEach(btn=>btn.disabled=false);}
    }
    actions.append(toggle,button('Сохранить черновик',()=>save(false)),button('Опубликовать',()=>save(true),true));
    text.parentElement.after(preview);
    form.append(actions,status); form.addEventListener('submit',e=>e.preventDefault());
    editor.append(form); main.append(editor);
    document.querySelectorAll(".site-header a").forEach(link=>link.setAttribute("data-astro-reload", ""));
    title.focus();
  } catch(error) {loading.textContent=error.message;}
}
window.addEventListener('beforeunload',event=>{
  if(activeEditor?.dataset.dirty==='true') {event.preventDefault();event.returnValue='';}
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
document.addEventListener('astro:before-swap',()=>{activeEditor=null;});
