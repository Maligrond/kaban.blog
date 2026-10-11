import { markdownPhotos, photoMarkdown, replacePhoto, removePhoto, reorderPhotos } from './author-photos.js';
import { postSummary } from '../lib/post-text.js';
import { parseDocument } from 'yaml';
import { renderPostPreview } from '../lib/post-preview.js';
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
    const tag = document.querySelector('[data-author-tag]')?.getAttribute('data-author-tag');
    if (tag) tools.append(button('Править тему',async()=>{
      const { openTagEditor } = await import('./author-tag-editor.js');
      await openTagEditor(api, tag);
    }));
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
    if(!snapshot.raw && doc.contents)doc.contents.flow=false;
    if(snapshot.commit && snapshot.branch!=='main' && doc.get('draft')===false)snapshot.publication='pending';
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
      document.dispatchEvent(new Event('kaban:photos-changed'));
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
    const isPage = path === 'src/content/pages/now/index.md';
    const title = field('Заголовок','title',doc.get('title') || ''); title.required=true;
    const text = field('Текст','body',body,'textarea'); text.rows=16;
    const meta = create('div',{class:'author-meta-fields'});
    const tags = field('Теги через запятую','tags',(doc.get('tags')?.toJSON?.() || []).join(', '));
    const date = field(isPage ? 'Дата обновления' : 'Дата','date',dateValue(doc.get(isPage ? 'updated' : 'date')),'input','date'); date.required=true;
    const description = field('Короткое описание','description',doc.get('descriptionAutomatic') ? '' : doc.get('description') || '','textarea'); description.rows=2; description.placeholder=postSummary(body) || 'Заполнится по первому абзацу';
    [tags,date,description].forEach(input=>meta.append(input.parentElement));
    const slug = field('Адрес записи','slug',path ? path.split('/')[3] : ''); slug.placeholder='Заполнится по заголовку';
    if (path) slug.readOnly=true;
    meta.append(slug.parentElement);
    if(isPage) { tags.parentElement.hidden=true; slug.parentElement.hidden=true; }
    const settings = create('details',{class:'author-settings'});
    settings.append(create('summary',{},isPage ? 'Настройки страницы' : 'Теги и настройки записи'),meta);
    meta.append(create('p',{class:'author-photo-hint'},isPage ? 'Обнови дату, когда меняешь страницу. Описание используется в поиске и превью ссылки.' : 'Адрес и описание заполняются автоматически. Здесь можно задать свои.'));
    form.append(settings);
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
    help.append(create('summary',{},'Как оформить текст, ссылки и фотографии'));
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
    for(const [label,example] of [
      ['Подробности: заголовок остаётся видимым, текст раскрывается по нажатию.', ':::details Подробнее\n\nЗдесь можно писать обычный **Markdown**.\n\n:::'],
      ['Сноска: номер в тексте ведёт к пояснению внизу, стрелка возвращает обратно.', 'Текст со сноской[^note].\n\n[^note]: Пояснение.'],
      ['Карточка ссылки: поставь полный адрес отдельным абзацем. Заголовок и картинка подтянутся при сборке; новая ссылка в предпросмотре пока покажет только адрес.', 'https://blogengine.ru/'],
    ]) {
      help.append(create('p',{},label),create('pre',{},example));
    }
    formatBar.after(help);
    const preview = create('section',{class:'author-preview',hidden:'','aria-label':'Предпросмотр записи'});
    const previewHeading = create('div',{class:'post-heading blog-post-heading'});
    const previewTitle = create('h1'); previewHeading.append(previewTitle);
    const previewArticle = create('article',{class:'post-content blog-post-content'});
    const previewBody = create('div',{class:'post-photo-content'});
    const previewMeta = create('div',{class:'post-details post-meta-strip not-prose','aria-label':'Дата и темы записи'});
    previewArticle.append(previewBody,previewMeta); preview.append(previewHeading,previewArticle);
    const status = create('p',{class:'author-status',role:'status','aria-live':'polite'});
    const recoveryStatus = create('p',{class:'author-status author-recovery-status',role:'status'},'Текст и фотографии автоматически сохраняются в этом браузере.');
    async function persistRecovery() {
      const value = {fields:Object.fromEntries([title,text,tags,date,description,slug].map(input=>[input.name,input.value])),
        assets:assets.map(({name,content})=>({name,content})), sha:snapshot.sha, manualSlug:!!slug.dataset.manual, savedAt:Date.now()};
      recoveryQueue = recoveryQueue.catch(()=>{}).then(()=>draftStorage('put',recoveryKey,value));
      try { await recoveryQueue; recoveryStatus.textContent='Сохранено в браузере · ' + new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}); }
      catch { recoveryStatus.textContent='Не удалось сохранить в браузере. Сохрани черновик перед закрытием.'; }
    }
    flushRecovery = () => {if(editor.dataset.dirty==='true') {clearTimeout(autosaveTimer);persistRecovery();}};
    const actions = create('div',{class:'author-editor-actions'});
    let imageMap = {};
    let linkPreviews = {};
    fetch('/admin/link-previews.json').then(r=>r.json()).then(map=>{linkPreviews=map;if(!preview.hidden)refreshPreview();}).catch(()=>{});
    fetch('/admin/media.json').then(r=>r.json()).then(map=>{imageMap=map;if(!preview.hidden)refreshPreview();}).catch(()=>{});
    function refreshPreview() {
      previewTitle.textContent=title.value.trim() || 'Без заголовка';
      previewBody.innerHTML = DOMPurify.sanitize(renderPostPreview(text.value));
      const sourcePhotos=markdownPhotos(text.value);
      const available=[...sourcePhotos];
      previewBody.querySelectorAll('img').forEach(img=>{
        const match=available.findIndex(photo=>photo.src===img.getAttribute('src'));
        if(match>=0) {const photo=available.splice(match,1)[0];img.dataset.authorPhoto=String(sourcePhotos.indexOf(photo));}
        const src=img.getAttribute('src');
        const asset=assets.find(a=>a.name===src);
        if(asset) {img.src=asset.url;return;}
        if(!src || /^(?:[a-z]+:|\/)/i.test(src)) return;
        const targetPath=path || `src/content/blog/${slug.value}/index.md`;
        const key=new URL(src,'https://preview.invalid/'+targetPath).pathname.slice(1);
        if(imageMap[decodeURIComponent(key)]) img.src=imageMap[decodeURIComponent(key)];
      });
      enhancePost(previewBody,linkPreviews);
      layoutPreviewPhotos(previewBody); initializeGalleries(previewBody);
      previewMeta.replaceChildren();
      const chosenDate=new Date(date.value+'T00:00:00Z');
      if(!Number.isNaN(chosenDate.valueOf()))previewMeta.append(create('time',{datetime:chosenDate.toISOString()},new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(chosenDate).replace(/\s*г\.$/,'')));
      const list=create('ul',{class:'post-tags','aria-label':'Темы записи'});
      tags.value.split(',').map(tag=>tag.trim()).filter(Boolean).forEach(tag=>{const item=create('li');item.append(create('span',{class:'post-tag'},tag));list.append(item);});
      if(list.childElementCount)previewMeta.append(list);
      document.dispatchEvent(new Event('kaban:photos-changed'));
      initializePhotoEditing(sourcePhotos);
    }
    function updatePhotoText(value) {
      text.value=value; text.dispatchEvent(new Event('input',{bubbles:true}));
    }
    function initializePhotoEditing(sourcePhotos) {
      previewBody.querySelectorAll('img[data-author-photo]').forEach(image=>{
        const photo=sourcePhotos[Number(image.dataset.authorPhoto)];
        const frame=image.closest('.post-photo') || image.closest('.photo-trigger') || image.closest('a') || image;
        const tools=create('div',{class:'author-photo-tools','aria-label':'Действия с фотографией'});
        tools.append(button('Подпись',async()=>{
          const original=text.value;
          const result=await photoDetails([{url:image.src,alt:photo.alt,caption:photo.caption}],true);
          if(!result)return;
          if(text.value!==original){status.textContent='Текст изменился. Открой подпись заново.';return;}
          updatePhotoText(replacePhoto(original,photo,photoMarkdown({...photo,...result[0]})));
          status.textContent='Подпись обновлена.';
        }),button('Удалить',()=>{
          const original=text.value;
          const removed=removePhoto(original,photo);
          updatePhotoText(removed);
          status.replaceChildren(create('span',{},'Фотография удалена из записи. '),button('Отменить',()=>{
            if(text.value!==removed){status.textContent='Текст уже изменился. Верни фотографию в поле текста.';return;}
            updatePhotoText(original);status.textContent='Фотография возвращена.';
          }));
        }));
        if(frame.classList.contains('post-photo'))frame.append(tools);
        else frame.after(tools);
      });
      previewBody.querySelectorAll('.gallery-track').forEach(track=>{
        const frames=Array.from(track.querySelectorAll(':scope > .post-photo'));
        const photos=frames.map(frame=>sourcePhotos[Number(frame.querySelector('img')?.dataset.authorPhoto)]);
        if(photos.some(photo=>!photo))return;
        let dragged=-1;
        const move=(from,to)=>{updatePhotoText(reorderPhotos(text.value,photos,from,to));status.textContent='Порядок фотографий изменён.';};
        frames.forEach((frame,index)=>{
          const tools=frame.querySelector('.author-photo-tools');
          const handle=create('button',{type:'button',class:'author-photo-move',draggable:'true','aria-label':'Перетащить фотографию'},'Переставить');
          handle.addEventListener('dragstart',event=>{dragged=index;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain','kaban-photo');frame.classList.add('author-photo-dragging');});
          handle.addEventListener('dragend',()=>{dragged=-1;frame.classList.remove('author-photo-dragging');});
          frame.addEventListener('dragover',event=>{if(dragged<0)return;event.preventDefault();event.dataTransfer.dropEffect='move';});
          frame.addEventListener('drop',event=>{if(dragged<0)return;event.preventDefault();event.stopPropagation();const from=dragged;dragged=-1;move(from,index);});
          tools.prepend(handle);
          const previous=button('←',()=>move(index,index-1));previous.setAttribute('aria-label','Переместить фотографию раньше');previous.disabled=index===0;
          const next=button('→',()=>move(index,index+1));next.setAttribute('aria-label','Переместить фотографию позже');next.disabled=index===frames.length-1;
          tools.append(previous,next);
        });
      });
    }
    const toggle = button('Предпросмотр',()=>{
      const showing = preview.hidden;
      preview.hidden=!showing; text.parentElement.hidden=showing; formatBar.hidden=showing;
      title.parentElement.hidden=showing; help.hidden=showing; settings.hidden=showing;
      toggle.textContent=showing?'Вернуться к редактированию':'Предпросмотр';
      toggle.setAttribute('aria-pressed',String(showing));
      if(showing) refreshPreview();
    });
    form.addEventListener('input',()=>{description.placeholder=postSummary(text.value) || 'Заполнится по первому абзацу';editor.dataset.dirty='true'; clearTimeout(autosaveTimer); autosaveTimer=setTimeout(persistRecovery,400); if(!preview.hidden)refreshPreview();});
    title.addEventListener('input',()=>{if(!path && !slug.dataset.manual)slug.value=slugify(title.value);});
    slug.addEventListener('input',()=>{if(slug.value.trim())slug.dataset.manual='true';else {delete slug.dataset.manual;slug.value=slugify(title.value);}});
    function photoDetails(additions, editing = false) {
      return new Promise(resolve=>{
        const dialog=create('dialog',{class:'author-photo-dialog','aria-label':'Подписи фотографий'});
        dialog.append(create('h2',{},editing?'Подпись фотографии':additions.length===1?'Добавить фотографию':'Добавить фотографии'),create('p',{class:'author-photo-hint'},'Подпись появится под снимком. Описание помогает тем, кто пользуется экранным диктором.'));
        const fields=additions.map((asset,index)=>{
          const row=create('div',{class:'author-photo-row'});
          row.append(create('img',{src:asset.url,alt:'',loading:'lazy'}));
          const inputs=create('div');
          function input(label,value) {
            const wrapper=create('label',{class:'author-field'});wrapper.append(create('span',{},label));
            const control=create('input',{type:'text'});control.value=value;wrapper.append(control);inputs.append(wrapper);return control;
          }
          const caption=input('Подпись',asset.caption || '');
          const alt=input('Описание снимка',asset.alt ?? (asset.originalName?.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ') || `Фотография ${index+1}`));
          row.append(inputs);dialog.append(row);return {caption,alt};
        });
        let result=null;
        const actions=create('div',{class:'author-editor-actions'});
        actions.append(button('Отмена',()=>dialog.close()),button(editing?'Сохранить подпись':'Вставить',()=>{result=fields.map(({caption,alt})=>({caption:caption.value.trim(),alt:alt.value.trim()}));dialog.close();},true));
        dialog.append(actions);dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});
        dialog.addEventListener('cancel',()=>{result=null;});
        document.body.append(dialog);dialog.showModal();fields[0]?.caption.focus();
      });
    }
    const markdownLabel = value => value.replace(/\\/g,'\\\\').replace(/([\[\]])/g,'\\$1').replace(/\r?\n/g,' ');
    const markdownCaption = value => value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r?\n/g,' ');
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
          additions.push({name,originalName:file.name,content:btoa(binary),url:URL.createObjectURL(file)});
        }
        const details=await photoDetails(additions);
        if(!details) {additions.forEach(asset=>URL.revokeObjectURL(asset.url));status.textContent='Добавление фотографий отменено.';return;}
        assets.push(...additions);
        text.disabled=false;
        text.setSelectionRange(start,end);
        insert('\n\n'+additions.map((asset,index)=>`![${markdownLabel(details[index].alt)}](${asset.name}${details[index].caption ? ' "'+markdownCaption(details[index].caption)+'"' : ''})`).join(gallery?'\n':'\n\n')+'\n\n');
        status.textContent=gallery?'Галерея добавлена. Подписи видны в предпросмотре.':'Фотографии добавлены. Подписи видны в предпросмотре.';
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
      if(saving) return;
      if(!title.value.trim() || !date.validity.valid) {
        if(!preview.hidden)toggle.click();
        if(!date.validity.valid)settings.open=true;
        status.textContent=!title.value.trim()?'Заполни заголовок.':'Выбери дату записи.';
        (!title.value.trim()?title:date).focus();return;
      }
      if(!form.reportValidity()) return;
      if(!slug.value.trim())slug.value=slugify(title.value);
      const targetPath=path || `src/content/blog/${slug.value}/index.md`;
      if(!validPath(targetPath)) {status.textContent='Адрес может содержать буквы, цифры и дефисы.';return;}
      saving=true; clearTimeout(autosaveTimer);
      const disabledStates=Array.from(form.querySelectorAll('input,textarea,button')).map(input=>[input,input.disabled]);
      disabledStates.forEach(([input])=>input.disabled=true);
      status.textContent=publish?'Публикую…':'Сохраняю черновик…';
      try {
        doc.set('title',title.value.trim()); doc.set('description',description.value.trim() || postSummary(text.value) || title.value.trim());
        if(description.value.trim())doc.delete('descriptionAutomatic');else doc.set('descriptionAutomatic',true);
        doc.set(isPage ? 'updated' : 'date',date.value); if(!isPage) doc.set('tags',tags.value.split(',').map(t=>t.trim()).filter(Boolean)); doc.set('draft',!publish);
        const raw=`---\n${doc.toString()}---\n\n${text.value}\n`;
        const usedPhotos=markdownPhotos(text.value);
        const staged=assets.filter(asset=>usedPhotos.some(photo=>photo.src===asset.name)).map(asset=>({path:targetPath.slice(0,targetPath.lastIndexOf('/')+1)+asset.name,content:asset.content}));
        snapshot=publish && snapshot.publication==='pending' && editor.dataset.dirty!=='true'
          ? await api.publish(targetPath,snapshot)
          : await api.save(targetPath,raw,snapshot,staged,publish);
        path=targetPath; slug.readOnly=true; editor.dataset.dirty='false';
        clearTimeout(autosaveTimer);
        await recoveryQueue.catch(()=>{});
        try { await draftStorage('delete',recoveryKey); } catch { /* A stale recovery copy is harmless. */ }
        recoveryKey=`${api.session.type}:${targetPath}`;
        recoveryStatus.textContent='Сохранено ' + (api.session.type==='local'?'в файле записи.':'в GitHub.');
        publishButton.textContent=snapshot.publication==='pending'?'Повторить публикацию':'Опубликовать';
        status.textContent=snapshot.publication==='pending'
          ? `Черновик сохранён в GitHub. Публикация не завершена: ${snapshot.publicationError} Можно повторить публикацию.`
          : api.session.type==='local'
          ? (publish?'Запись сохранена локально. На сайте появится после сборки; пуш выполняется отдельно.':'Черновик сохранён локально и скрыт с сайта.')
          : (publish?'Изменения отправлены в main. Запись появится после сборки Netlify.':'Черновик сохранён в GitHub. Посетители его не видят.');
      } catch(error) {status.textContent=error.message;}
      finally {saving=false; disabledStates.forEach(([input,disabled])=>{if(input.isConnected)input.disabled=disabled;});}
    }
    const publishButton=button(snapshot.publication==='pending'?'Повторить публикацию':'Опубликовать',()=>save(true),true);
    form.addEventListener('input',()=>{publishButton.textContent='Опубликовать';});
    actions.append(toggle,button('Сохранить черновик',()=>save(false)),publishButton);
    text.parentElement.after(preview);
    form.append(actions,status,recoveryStatus);
    if(cachedDraft?.fields) {
      const notice=create('div',{class:'author-recovery-notice'});
      notice.append(create('p',{},cachedDraft.sha !== snapshot.sha ? 'Есть несохранённая копия. Запись изменилась после её создания — восстановление заменит текст в редакторе.' : 'Есть несохранённая копия этой записи в браузере.'));
      notice.append(button('Восстановить',()=>{
        [title,text,tags,date,description,slug].forEach(input=>{if(input!==slug || !path)input.value=cachedDraft.fields[input.name] ?? input.value;});
        if(!path && cachedDraft.manualSlug)slug.dataset.manual='true';
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
