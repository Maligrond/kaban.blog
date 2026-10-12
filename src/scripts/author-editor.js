import {postFormats,postTitle,postLink} from '../lib/post-formats.js';
import {relatedPostsFor} from '../lib/related-posts.js';
import '../styles/related-posts.css';
import {entryPath, shelfNames, shelfValues, shelfStatuses, shelfStatusLabel} from './author-entries.js';
import {publicationAddress, checkPublicationPhoto} from './author-preflight.js';
import {preparePhoto, validatePhoto} from './author-image-upload.js';
import {coverCandidates, applyCover, hasCoverInBody, sameCoverSource, shelfCoverURL} from './author-cover.js';
import {findAuthorLinks, linkAddress, authorLink} from './author-links.js';
import { markdownPhotos, photoMarkdown, replacePhoto, removePhoto, reorderPhotos } from './author-photos.js';
import { postSummary } from '../lib/post-text.js';
import { parseDocument } from 'yaml';
import { renderPostPreview } from '../lib/post-preview.js';
import DOMPurify from 'dompurify';
import NetlifyAuth from 'netlify-auth-providers';
import { AuthorAPI, sessionKey, isLocal, validPath, entryCollection, entrySlug } from './author-api.js';
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
    const collection=document.querySelector('[data-author-collection]')?.getAttribute('data-author-collection');
    if (collection in shelfNames) tools.append(button('Добавить '+shelfNames[collection],()=>openEditor(null,collection),true));
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
    try {
      const notice=sessionStorage.getItem('kaban-local-save-notice');
      if(notice) {
        sessionStorage.removeItem('kaban-local-save-notice');
        tools.after(create('p',{class:'author-status author-save-notice site-container',role:'status'},notice));
      }
    } catch { /* Session storage may be unavailable. */ }
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
      if (parsed && !parsed.doc.get('draft') && !item.workflow) continue;
      count++;
      const kind=entryCollection(item.path);
      const label=(kind in shelfNames ? ({books:'Книга',games:'Игра',countries:'Город'}[kind])+' · ' : '')+(parsed?.doc.get('title') || entrySlug(item.path));
      dialog.append(button(label,()=>{dialog.close(); dialog.remove(); openEditor(item.path);}));
    }
    if (!count) dialog.append(create('p',{},'Пока нет черновиков.'));
    dialog.append(button('Закрыть',()=>{dialog.close();dialog.remove();}));
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    document.body.append(dialog); dialog.showModal();
  } catch(error) { alert(error.message); }
}
async function openEditor(path, collection = path ? entryCollection(path) : 'blog') {
  const isShelf = collection in shelfNames;
  if (activeEditor) return;
  const tools = document.querySelector('.author-tools');
  const loading = create('p',{class:'author-status',role:'status'},'Открываю запись…');
  tools?.append(loading);
  try {
    await api.verify();
    let snapshot = path ? await api.read(path) : {raw:'',sha:null};
    let publishedSnapshot = path ? (snapshot.branch === 'main' ? snapshot : await api.read(path, true)) : null;
    const {doc,body} = splitContent(snapshot.raw);
    const hasCover=['blog','countries','books','games'].includes(collection);
    const shelfCover=collection==='books' || collection==='games';
    const coverKey=collection==='countries'?'photo':'cover';
    const coverAltKey=collection==='countries'?'photoAlt':'coverAlt';
    let coverChoice={src:(shelfCover ? doc.get('coverURL') : '') || doc.get(coverKey) || '',alt:doc.get(coverAltKey) || '',changed:false};
    const coverHistory=coverChoice.src?[{...coverChoice}]:[];
    if(!snapshot.raw && doc.contents)doc.contents.flow=false;
    if(snapshot.commit && snapshot.branch!=='main' && doc.get('draft')===false)snapshot.publication='pending';
    let recoveryKey = `${api.session.type}:${path || (isShelf ? 'new-'+collection : 'new')}`;
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
      draftPhotoURLs.forEach(url=>URL.revokeObjectURL(url));
      flushRecovery = null;
      activeEditor = null; editor.remove(); main.append(original);
      document.dispatchEvent(new Event('kaban:photos-changed'));
    };
    top.append(button('← Закрыть редактор',close),create('span',{class:'author-identity'},api.session.type === 'local' ? 'Сохраняется на этом компьютере' : 'Сохраняется в GitHub'));
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
    let formatField,linkField;
    if(collection==='blog') {
      formatField=field('Формат записи','format','', 'select');
      for(const [value,label] of Object.entries(postFormats))formatField.append(create('option',{value},label));
      formatField.value=doc.get('format') || 'article';title.parentElement.before(formatField.parentElement);
      linkField=field('Адрес ссылки','linkURL',doc.get('linkURL') || '', 'input','url');
      const updateFormat=()=>{
        title.required=formatField.value!=='note';title.parentElement.hidden=formatField.value==='note';
        linkField.parentElement.hidden=formatField.value!=='link';linkField.required=formatField.value==='link';linkField.disabled=formatField.value!=='link';
        formatField.parentElement.title='Все форматы остаются в общей ленте. У короткой записи заголовок не показывается.';
      };
      formatField.addEventListener('change',updateFormat);updateFormat();
    }
    const text = field('Текст','body',body,'textarea'); text.rows=isShelf?5:16;
    if(isShelf)editor.classList.add('author-shelf-editor');
    const meta = create('div',{class:'author-meta-fields'});
    const tags = field('Теги через запятую','tags',(doc.get('tags')?.toJSON?.() || []).join(', '));
    const date = field(isPage ? 'Дата обновления' : 'Дата','date',dateValue(doc.get(isPage ? 'updated' : 'date')),'input','date'); date.required=true;
    const excerpt=field('Вступление для ленты','excerpt',doc.get('excerpt') || '', 'textarea');excerpt.rows=2;
    if(isPage || isShelf)excerpt.parentElement.hidden=true;
    const description = field('Короткое описание','description',doc.get('descriptionAutomatic') ? '' : doc.get('description') || '','textarea'); description.rows=2; description.placeholder=postSummary(body) || 'Заполнится по первому абзацу';
    [tags,date,excerpt,description].forEach(input=>meta.append(input.parentElement));
    const slug = field('Адрес записи','slug',path ? entrySlug(path) : ''); slug.placeholder='Заполнится по заголовку';
    if (path) slug.readOnly=true;
    meta.append(slug.parentElement);
    if(isPage || isShelf) tags.parentElement.hidden=true;
    if(isPage) slug.parentElement.hidden=true;
    if(isShelf) description.parentElement.hidden=true;
    const shelfFields={};
    if(isShelf) {
      const shelfMeta=create('div',{class:'author-meta-fields author-shelf-fields'});
      function shelfField(label,name,type='text') {
        const input=field(label,name,doc.get(name) ?? '', 'input',type);
        shelfFields[name]=input; shelfMeta.append(input.parentElement); return input;
      }
      if(collection==='books') shelfField('Автор книги','author').required=true;
      if(collection==='games') {const year=shelfField('Год выпуска','year','number');year.required=true;year.min='1900';year.max='2100';}
      if(collection==='countries') {
        shelfField('Страна','country').required=true;
        shelfField('Флаг (эмодзи, необязательно)','flag');
        const favorite=shelfField('Любимое место','favorite','checkbox');favorite.checked=!!doc.get('favorite');
      }
      const rating=shelfField('Моя оценка · от 1 до 5','rating','number');rating.value=String(doc.get('rating') || 3);rating.required=true;rating.min='1';rating.max='5';
      if(shelfStatuses[collection]) {
        const select=field('Пометка (необязательно)','status','', 'select');
        select.append(create('option',{value:''},'Без пометки'));
        for(const [value,label] of Object.entries(shelfStatuses[collection]))select.append(create('option',{value},label));
        select.value=doc.get('status') || '';shelfFields.status=select;shelfMeta.append(select.parentElement);
      }
      if(collection!=='countries') shelfField('Ссылка (необязательно)','url','url');
      else shelfMeta.append(create('p',{class:'author-photo-hint'},'Координаты определятся по названию города и стране при следующей сборке сайта.'));
      text.parentElement.before(shelfMeta);
      text.parentElement.querySelector('span').textContent=collection==='countries'?'О городе':'Мои впечатления';
      date.parentElement.querySelector('span').textContent=collection==='countries'?'Дата поездки':collection==='books'?'Дата прочтения':'Дата прохождения';
    }
    const settings = create('details',{class:'author-settings'});
    settings.append(create('summary',{},isPage ? 'Настройки страницы' : isShelf ? 'Дата и адрес' : 'Теги и настройки записи'),meta);
    meta.append(create('p',{class:'author-photo-hint'},isPage ? 'Обнови дату, когда меняешь страницу. Описание используется в поиске и превью ссылки.' : 'Адрес и описание заполняются автоматически. Здесь можно задать свои.'));
    form.append(settings);
    const assets = [];
    const draftPhotoURLs=[];
    const draftPhotoCache=new Map();
    let galleryUpload = false;
    let autosaveTimer;
    let uploading = false;
    let recoveryQueue = Promise.resolve();
    const mediaInput = create('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/avif',multiple:'',hidden:''});
    const formatBar = create('div',{class:'author-format-bar'});
    function insert(value) {
      text.setRangeText(value,text.selectionStart,text.selectionEnd,'end'); text.dispatchEvent(new Event('input',{bubbles:true})); text.focus();
    }
    let linkIndex;
    function insertLink() {
      if(uploading || saving)return;
      const start=text.selectionStart,end=text.selectionEnd,original=text.value;
      const selected=original.slice(start,end);
      const dialog=create('dialog',{class:'author-tag-dialog author-link-dialog','aria-labelledby':'author-link-title'});
      dialog.append(create('h2',{id:'author-link-title'},'Вставить ссылку'));
      function input(label,name,value,type='text') {
        const field=create('label',{class:'author-field'});field.append(create('span',{},label));
        const control=create('input',{type,name});control.value=value;field.append(control);dialog.append(field);return control;
      }
      const query=input('Название на сайте или внешний адрес','link-query','','search');query.placeholder='Например, Рапалло или https://…';
      const results=create('div',{class:'author-link-results','aria-label':'Найденные страницы'});dialog.append(results);
      const label=input('Текст ссылки','link-label',selected);
      const destination=create('p',{class:'author-tag-current'});dialog.append(destination);
      const note=create('p',{class:'author-photo-hint',role:'status'});dialog.append(note);
      let items=[],chosenURL='',labelEdited=!!selected;
      const dismiss=()=>{dialog.close();text.focus();};
      const submit=button('Вставить ссылку',()=>{
        if(text.value!==original){note.textContent='Текст записи изменился. Закрой это окно и выбери ссылку заново.';submit.disabled=true;return;}
        try {
          const markdown=authorLink(label.value,chosenURL);
          text.setRangeText(markdown,start,end,'end');text.dispatchEvent(new Event('input',{bubbles:true}));dismiss();
        } catch(error) {note.textContent=error.message;}
      },true);submit.disabled=true;
      function updateDestination() {
        destination.textContent=chosenURL || 'Выбери страницу из списка или вставь полный адрес.';
        submit.disabled=!chosenURL || !label.value.trim();
      }
      function search() {
        chosenURL=linkAddress(query.value) || '';results.replaceChildren();
        if(chosenURL) {
          if(!labelEdited)label.value=chosenURL.startsWith('/')?'Ссылка':new URL(chosenURL).hostname;
          note.textContent='';updateDestination();return;
        }
        const current=path?publicationAddress(collection,entrySlug(path)).replace('https://kaban.blog',''):null;
        const matches=findAuthorLinks(items,query.value,current);
        matches.forEach(item=>{
          const pick=button(item.title,()=>{
            chosenURL=item.url;query.value=item.title;
            if(!labelEdited)label.value=item.title;
            results.replaceChildren();note.textContent='';updateDestination();label.focus();
          });
          pick.append(create('small',{},`${item.kind}${item.detail?' · '+item.detail:''}`));results.append(pick);
        });
        note.textContent=matches.length?'':items.length?'Ничего не найдено. Для внешней ссылки вставь адрес с https:// или http://.':note.textContent;
        updateDestination();
      }
      query.addEventListener('input',search);
      label.addEventListener('input',()=>{labelEdited=true;updateDestination();});
      dialog.append(create('p',{class:'author-photo-hint'},'Выделенные слова сохранятся. Без выделения можно использовать название страницы.'));
      const actions=create('div',{class:'author-tag-actions'});actions.append(button('Отмена',dismiss),submit);dialog.append(actions);
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.addEventListener('cancel',()=>text.focus());
      editor.append(dialog);dialog.showModal();query.focus();note.textContent='Загружаю список страниц…';updateDestination();
      if(!linkIndex)linkIndex=fetch('/admin/links.json').then(response=>{if(!response.ok)throw new Error('Нет списка');return response.json();}).catch(error=>{linkIndex=null;throw error;});
      linkIndex.then(data=>{if(!dialog.isConnected)return;items=data;note.textContent='';if(!chosenURL)search();}).catch(()=>{if(dialog.isConnected)note.textContent='Не удалось загрузить страницы. Внешнюю ссылку можно вставить по адресу.';});
    }
    formatBar.append(button('Жирный',()=>insert('**текст**')),button('Ссылка',insertLink),button('Фотографии',()=>{galleryUpload=false;mediaInput.click();}),button('Галерея',()=>{galleryUpload=true;mediaInput.click();}));
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
    if(!isShelf)formatBar.after(help);
    const preview = create('section',{class:'author-preview',hidden:'','aria-label':'Предпросмотр записи'});
    const previewHeading = create('div',{class:'post-heading blog-post-heading'});
    const previewTitle = create('h1'); const previewBack=create('a',{class:'back-to-notes',href:isShelf?(collection==='countries'?'/world/':`/about/${collection}/`):isPage?'/about/':'/blog/'},isShelf?'← К подборке':isPage?'← Обо мне':'← Все записи');
    previewHeading.append(previewBack,previewTitle);
    const previewSubtitle=create('p',{class:'review-subtitle'});
    const previewReviewMeta=create('div',{class:'note-meta'});
    if(isShelf) {previewHeading.className='post-heading review-heading';previewHeading.append(previewSubtitle,previewReviewMeta);}
    const previewArticle = create('article',{class:'post-content blog-post-content'});
    const previewBody = create('div',{class:'post-photo-content'});
    const previewMeta = create('div',{class:'post-details post-meta-strip not-prose','aria-label':'Дата и темы записи'});
    const previewLower=create('div',{class:'not-prose'});
    if(isShelf)previewArticle.className='post-content review-content';
    previewArticle.append(previewBody);
    if(!isShelf && !isPage)previewArticle.append(previewMeta,previewLower);
    preview.append(previewHeading,previewArticle);
    const status = create('p',{class:'author-status',role:'status','aria-live':'polite'});
    const photoProgress=create('progress',{class:'author-photo-progress','aria-label':'Подготовка фотографий',hidden:''});
    const preparing=create('div',{class:'author-photo-preparing',hidden:''});
    const preparingStatus=create('p',{class:'author-photo-hint',role:'status'});
    const preparingProgress=create('progress',{class:'author-photo-progress','aria-label':'Обработка фотографий'});
    preparing.append(preparingStatus,preparingProgress);formatBar.after(preparing);
    const recoveryStatus = create('p',{class:'author-status author-recovery-status',role:'status'},'Текст и фотографии автоматически сохраняются в этом браузере.');
    async function persistRecovery() {
      const value = {fields:Object.fromEntries([title,text,tags,date,excerpt,description,slug,...(formatField?[formatField,linkField]:[]),...Object.values(shelfFields)].map(input=>[input.name,input.type==='checkbox'?input.checked:input.value])),
        assets:assets.map(({name,content})=>({name,content})), cover:coverChoice, sha:snapshot.sha, manualSlug:!!slug.dataset.manual, savedAt:Date.now()};
      recoveryQueue = recoveryQueue.catch(()=>{}).then(()=>draftStorage('put',recoveryKey,value));
      try { await recoveryQueue; recoveryStatus.textContent='Сохранено в браузере · ' + new Date().toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'}); }
      catch { recoveryStatus.textContent='Не удалось сохранить в браузере. Сохрани черновик перед закрытием.'; }
    }
    flushRecovery = () => {if(editor.dataset.dirty==='true') {clearTimeout(autosaveTimer);persistRecovery();}};
    const actions = create('div',{class:'author-editor-actions'});
    let imageMap = {};
    let linkPreviews = {};
    let publicPreview = {posts:[],cities:[]};
    fetch('/admin/post-preview.json').then(r=>r.json()).then(data=>{publicPreview=data;if(!preview.hidden)refreshPreview();}).catch(()=>{});
    fetch('/admin/link-previews.json').then(r=>r.json()).then(map=>{linkPreviews=map;if(!preview.hidden)refreshPreview();}).catch(()=>{});
    const mediaReady=fetch('/admin/media.json',{signal:AbortSignal.timeout(10000)}).then(r=>r.json()).then(map=>{imageMap=map;if(!preview.hidden)refreshPreview();}).catch(()=>{});
    async function coverURL(source) {
      const asset=assets.find(item=>item.name===source);
      if(asset)return asset.url;
      if(/^(?:https?:|\/)/i.test(source))return source;
      await mediaReady;
      const target=path || entryPath(collection,slug.value || 'preview');
      const key=decodeURIComponent(new URL(source,'https://preview.invalid/'+target).pathname.slice(1));
      if(imageMap[key] && (!path || snapshot.branch==='main'))return imageMap[key];
      if(!path)return null;
      const photoKey=(snapshot.branch || 'main')+':'+source;
      if(!draftPhotoCache.has(photoKey))draftPhotoCache.set(photoKey,api.readPreviewPhoto(path,source,snapshot.branch || 'main').then(file=>{
        const bytes=Uint8Array.from(atob(file.content),c=>c.charCodeAt(0));
        const url=URL.createObjectURL(new Blob([bytes],{type:file.type}));
        if(activeEditor!==editor){URL.revokeObjectURL(url);return null;}
        draftPhotoURLs.push(url);return url;
      }).catch(()=>null));
      return draftPhotoCache.get(photoKey);
    }
    const coverPanel=create('div',{class:'author-cover-panel'});
    function refreshCoverPanel() {
      if(!hasCover)return;
      coverPanel.replaceChildren();
      const copy=create('div');copy.append(create('p',{class:'author-photo-hint'},collection==='countries'?'Главная фотография города':'Обложка записи'));
      copy.append(create('p',{},coverChoice.src?'Фотография выбрана':collection==='countries'?'Главное фото не выбрано':'Обложка не выбрана'));
      copy.append(button(coverChoice.src?'Заменить фотографию':'Выбрать из фотографий',chooseCover));
      if(shelfCover) {
        const upload=create('input',{type:'file',accept:'image/jpeg,image/png,image/webp,image/avif',hidden:''});
        upload.addEventListener('change',async()=>{
          const file=upload.files?.[0];if(!file || uploading || saving)return;
          uploading=true;status.textContent='Подготавливаю обложку…';
          coverPanel.querySelectorAll('button').forEach(button=>button.disabled=true);
          try {
            validatePhoto(file);const prepared=await preparePhoto(file);
            if(!editor.isConnected)return;
            const asset={name:`cover-${crypto.randomUUID()}.${prepared.extension}`,originalName:file.name,content:prepared.content,url:URL.createObjectURL(prepared.blob)};
            assets.push(asset);selectCover({src:asset.name,alt:title.value.trim()});
          } catch(error) {status.textContent=error.message;} finally {uploading=false;upload.value='';if(editor.isConnected)refreshCoverPanel();}
        });
        copy.append(upload,button('Загрузить обложку',()=>{if(!saving && !uploading)upload.click();}),button('Вставить ссылку на обложку',chooseCoverLink));
        copy.append(create('small',{class:'author-photo-hint'},'Обложка появится на полке. Добавлять её в текст не нужно.'));
      }
      if(coverChoice.src) {
        const image=create('img',{alt:coverChoice.alt || '',class:'author-cover-thumb'});coverPanel.append(image);
        const source=coverChoice.src;
        coverURL(source).then(url=>{if(image.isConnected && url && coverChoice.src===source)image.src=url;}).catch(()=>{});
        copy.append(button(collection==='countries'?'Убрать главное фото':'Убрать обложку',()=>selectCover({src:'',alt:''})));
      }
      coverPanel.append(copy);
    }
    function selectCover(photo) {
      if(coverChoice.src && !coverHistory.some(item=>sameCoverSource(item.src,coverChoice.src)))coverHistory.push({...coverChoice});
      coverChoice={src:photo.src,alt:photo.alt || '',changed:true};
      editor.dataset.dirty='true';persistRecovery();refreshCoverPanel();
      if(!preview.hidden)refreshPreview();
      status.textContent=photo.src?(collection==='countries'?'Главное фото города выбрано. Сохрани изменения.':'Обложка выбрана. Сохрани изменения.'):'Обложка убрана. Сохрани изменения.';
      previewSaveStatus.textContent=status.textContent;
    }
    function chooseCoverLink() {
      if(uploading || saving)return;
      const dialog=create('dialog',{class:'author-tag-dialog','aria-label':'Обложка по ссылке'});
      dialog.append(create('h2',{},'Обложка по ссылке'));
      const label=create('label');label.append(create('span',{},'Адрес изображения'));
      const input=create('input',{type:'url',placeholder:'https://…',class:'author-cover-link-input'});label.append(input);
      const message=create('p',{class:'author-status',role:'status'});
      const use=button('Выбрать обложку',async()=>{
        use.disabled=true;
        try {
          const source=shelfCoverURL(input.value);message.textContent='Проверяю изображение…';
          if(!await checkPublicationPhoto(()=>source))throw new Error('Изображение не загрузилось. Вставь прямую ссылку на JPG, PNG или WebP.');
          if(!dialog.isConnected)return;
          selectCover({src:source,alt:title.value.trim()});dialog.close();
        } catch(error) {message.textContent=error.message;} finally {use.disabled=false;}
      },true);
      dialog.append(label,message,use,button('Отмена',()=>dialog.close()));
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});editor.append(dialog);dialog.showModal();input.focus();
    }
    function chooseCover() {
      if(uploading || saving)return;
      const dialog=create('dialog',{class:'author-photo-dialog','aria-label':'Выбор обложки'});
      dialog.append(create('h2',{},collection==='countries'?'Главное фото города':'Обложка записи'));
      const grid=create('div',{class:'author-cover-grid'});
      const choices=coverCandidates(text.value,coverChoice,[...coverHistory,...assets.map(asset=>({src:asset.name,alt:asset.originalName || ''}))]);
      if(!choices.length)dialog.append(create('p',{class:'author-photo-hint'},shelfCover?'Загрузи обложку или вставь ссылку кнопками под полем текста.':'Сначала добавь фотографию в текст записи — она появится здесь.'));
      choices.forEach((photo,index)=>{
        const pick=button(sameCoverSource(photo.src,coverChoice.src)?'Выбрана':'Выбрать',()=>{selectCover(photo);dialog.close();});
        pick.className='author-cover-option';pick.setAttribute('aria-label',`Выбрать фотографию ${index+1}: ${photo.alt || 'без описания'}`);
        pick.setAttribute('aria-pressed',String(sameCoverSource(photo.src,coverChoice.src)));
        const image=create('img',{alt:photo.alt || ''});pick.prepend(image);pick.disabled=true;
        coverURL(photo.src).then(url=>{if(!pick.isConnected)return;if(!url){pick.append(create('small',{},'Не удалось загрузить фото'));return;}image.onload=()=>pick.disabled=false;image.onerror=()=>pick.append(create('small',{},'Не удалось загрузить фото'));image.src=url;}).catch(()=>{});
        grid.append(pick);
      });
      dialog.append(grid,button('Закрыть',()=>dialog.close()));
      dialog.addEventListener('close',()=>dialog.remove(),{once:true});editor.append(dialog);dialog.showModal();
    }
    if(hasCover){settings.before(coverPanel);refreshCoverPanel();}
    function refreshPreview() {
      previewTitle.textContent=title.value.trim() || 'Без заголовка';
      previewTitle.hidden=formatField?.value==='note';
      previewHeading.querySelector('.post-source-link')?.remove();
      if(formatField?.value==='link')try {const url=postLink(linkField.value);previewHeading.append(create('a',{class:'post-source-link',href:url,target:'_blank',rel:'noopener noreferrer'},new URL(url).hostname+' ↗'));}catch {}
      previewBody.innerHTML = DOMPurify.sanitize(renderPostPreview(text.value));
      if(collection==='countries' && coverChoice.src && !hasCoverInBody(text.value,coverChoice.src)) {
        previewBody.prepend(create('img',{src:coverChoice.src,alt:coverChoice.alt || ''}));
      }
      const sourcePhotos=markdownPhotos(text.value);
      const available=[...sourcePhotos];
      previewBody.querySelectorAll('img').forEach(img=>{
        const match=available.findIndex(photo=>photo.src===img.getAttribute('src'));
        if(match>=0) {const photo=available.splice(match,1)[0];img.dataset.authorPhoto=String(sourcePhotos.indexOf(photo));}
        const src=img.getAttribute('src');
        const asset=assets.find(a=>a.name===src);
        if(asset) {img.src=asset.url;return;}
        if(!src || /^(?:[a-z]+:|\/)/i.test(src)) return;
        const targetPath=path || entryPath(collection,slug.value || 'preview');
        const key=new URL(src,'https://preview.invalid/'+targetPath).pathname.slice(1);
        if(imageMap[decodeURIComponent(key)] && (!path || snapshot.branch==='main')) {img.src=imageMap[decodeURIComponent(key)];return;}
        if(!path)return;
        const photoKey=(snapshot.branch || 'main')+':'+src;
        if(!draftPhotoCache.has(photoKey))draftPhotoCache.set(photoKey,api.readPreviewPhoto(path,src,snapshot.branch || 'main').then(file=>{
          const bytes=Uint8Array.from(atob(file.content),c=>c.charCodeAt(0));
          const url=URL.createObjectURL(new Blob([bytes],{type:file.type}));
          if(activeEditor!==editor) {URL.revokeObjectURL(url);return null;}
          draftPhotoURLs.push(url);return url;
        }).catch(()=>null));
        img.removeAttribute('src');img.setAttribute('aria-busy','true');
        draftPhotoCache.get(photoKey).then(url=>{
          if(!img.isConnected)return;
          img.removeAttribute('aria-busy');
          if(url) {img.src=url;document.dispatchEvent(new Event('kaban:photos-changed'));}
          else img.after(create('small',{class:'author-photo-hint'},'Не удалось загрузить фотографию. Проверь файл черновика.'));
        });
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
      if(editor.dataset.photoEditing==='true') initializePhotoEditing(sourcePhotos);
      if(isShelf) {
        previewSubtitle.textContent=collection==='books'?shelfFields.author.value:collection==='games'?shelfFields.year.value:`${shelfFields.flag.value} ${shelfFields.country.value}`.trim();
        const rating=Math.max(0,Math.min(5,Math.floor(Number(shelfFields.rating.value)||0)));
        const stars=create('span',{class:'rating-stars','aria-hidden':'true'},'★'.repeat(rating));stars.append(create('span',{class:'rating-empty'},'☆'.repeat(5-rating)));
        const ratingLabel=create('span',{class:'review-rating','aria-label':'Моя оценка: '+rating+' из 5'});ratingLabel.append(stars,create('span',{class:'rating-value','aria-hidden':'true'},rating+'/5'));
        previewReviewMeta.replaceChildren(ratingLabel);
        const mark=shelfStatusLabel(collection,shelfFields.status?.value);
        if(mark)previewReviewMeta.append(create('span',{class:'shelf-status'},mark));
        if(previewMeta.firstChild)previewReviewMeta.append(previewMeta.firstChild.cloneNode(true));
        const url=shelfFields.url?.value.trim();
        if(url && /^https?:\/\//i.test(url))previewReviewMeta.append(create('a',{href:url,target:'_blank',rel:'noopener noreferrer'},'Источник ↗'));
      }
      previewArticle.querySelectorAll(':scope > .place-connections').forEach(node=>node.remove());
      previewLower.replaceChildren();
      if(!isShelf && !isPage) {
        const refs=doc.get('cities')?.toJSON?.() || [];
        const cities=publicPreview.cities.filter(city=>refs.includes(city.id));
        if(cities.length) {
          const connections=create('p',{class:'place-connections not-prose'});connections.append(create('span',{},'Города из этой истории: '));
          cities.forEach((city,index)=>{if(index)connections.append(' · ');connections.append(create('a',{href:`/countries/${city.id}/`},city.title));});
          previewMeta.before(connections);
        }
        const related=relatedPostsFor(path?entrySlug(path):slug.value,tags.value.split(',').map(tag=>tag.trim()).filter(Boolean),publicPreview.posts);
        if(related.length) {
          const section=create('section',{class:'further-posts post-extras not-prose'});section.append(create('h2',{},'Дальше'));
          const list=create('ul',{class:'further-grid'+(related.length<=2?' further-grid-few':'')});
          related.forEach((post,index)=>{
            const item=create('li',{class:'further-card'+(index===0?' further-lead':'')});
            const link=create('a',{class:'further-link',href:`/blog/${post.id}/`});
            if(post.photo)link.append(create('img',{class:'further-photo',src:post.photo,alt:'',loading:'lazy'}));
            link.append(create('h3',{},post.title));item.append(link);
            if(index===0 && post.description)item.append(create('p',{class:'further-excerpt'},post.description.length>180?post.description.slice(0,180).replace(/\s+\S*$/,'')+'…':post.description));
            item.append(create('time',{class:'further-date',datetime:post.date},String(new Date(post.date).getUTCFullYear())));list.append(item);
          });section.append(list);previewLower.append(section);
        }
        previewLower.append(create('p',{class:'author-preview-comments'},'Комментарии появятся после публикации.'));
      }
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
        if(hasCover) {
          const coverAction=button(sameCoverSource(photo.src,coverChoice.src)?collection==='countries'?'Выбрано главным фото':'Выбрана обложкой':collection==='countries'?'Сделать главным фото':'Сделать обложкой',()=>selectCover(photo));
          coverAction.disabled=sameCoverSource(photo.src,coverChoice.src) || !coverCandidates(text.value).some(item=>item.src===photo.src);
          tools.append(coverAction);
        }
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
    function showPreview(showing) {
      preview.hidden=!showing; form.hidden=showing; top.hidden=showing;
      editor.dataset.preview=String(showing);
      previewToolbar.hidden=!showing;
      previewSaveStatus.textContent=status.textContent;
      if(showing)refreshPreview();
      (showing?previewReturn:toggle).focus();
      editor.scrollIntoView({block:'start',behavior:'instant'});
    }
    const toggle = button('Посмотреть на сайте',()=>showPreview(true));
    const previewToolbar=create('div',{class:'author-preview-toolbar',hidden:''});
    const previewReturn=button('← К редактированию',()=>showPreview(false));
    const editPhotos=button('Править фотографии',()=>{
      editor.dataset.photoEditing=String(editor.dataset.photoEditing!=='true');
      editPhotos.textContent=editor.dataset.photoEditing==='true'?'Скрыть действия с фото':'Править фотографии';
      refreshPreview();
    });
    const previewSaveStatus=create('p',{class:'author-status',role:'status'});
    previewToolbar.append(previewReturn,editPhotos,create('span',{class:'author-identity'},'Предпросмотр · виден только тебе'),button('Закрыть',close),previewSaveStatus);
    editor.append(previewToolbar);
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
          if(asset.size)inputs.append(create('small',{class:'author-photo-hint'},`${Math.round(asset.originalSize/1024)} КБ → ${Math.round(asset.size/1024)} КБ · готово для блога`));
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
      const additions=[];
      let accepted=false;
      try {
        const chosen=Array.from(files);
        if(!chosen.length) return;
        chosen.forEach(validatePhoto);
        preparingProgress.max=chosen.length;preparingProgress.value=0;preparing.hidden=false;
        for (const [index,file] of chosen.entries()) {
          status.textContent=`Подготавливаю ${index+1} из ${chosen.length} · ${file.name}`;
          preparingStatus.textContent=status.textContent;
          const prepared=await preparePhoto(file);
          const name=`photo-${crypto.randomUUID()}.${prepared.extension}`;
          additions.push({name,originalName:file.name,content:prepared.content,url:URL.createObjectURL(prepared.blob),size:prepared.blob.size,originalSize:file.size});
          preparingProgress.value=index+1;
        }
        preparing.hidden=true;
        status.textContent='Фотографии готовы. Добавь подписи.';
        const details=await photoDetails(additions);
        if(!details) {status.textContent='Добавление фотографий отменено.';return;}
        assets.push(...additions);
        accepted=true;
        text.disabled=false;
        text.setSelectionRange(start,end);
        insert('\n\n'+additions.map((asset,index)=>`![${markdownLabel(details[index].alt)}](${asset.name}${details[index].caption ? ' "'+markdownCaption(details[index].caption)+'"' : ''})`).join(gallery?'\n':'\n\n')+'\n\n');
        status.textContent=gallery?'Галерея добавлена. Подписи видны в предпросмотре.':'Фотографии добавлены. Подписи видны в предпросмотре.';
        await persistRecovery();
      } catch(error) {status.textContent=error.message;}
      finally {if(!accepted)additions.forEach(asset=>URL.revokeObjectURL(asset.url));preparing.hidden=true;uploading=false; text.disabled=false; formatBar.querySelectorAll('button').forEach(btn=>btn.disabled=false);top.querySelectorAll('button').forEach(btn=>btn.disabled=false);}
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
    text.parentElement.append(create('small',{class:'author-photo-hint',id:'author-photo-hint'},'Перетащи фотографии сюда или вставь скриншот через ⌘V / Ctrl+V. Большие снимки уменьшатся автоматически; геометки удалятся. Несколько снимков вместе — галерея.'));
    let saving=false;
    async function save(publish) {
      if(uploading) {status.textContent='Дождись добавления фотографий.';return;}
      if(saving) return;
      const missingTitle=formatField?.value!=='note' && !title.value.trim();
      if(missingTitle || !date.validity.valid) {
        if(!preview.hidden)showPreview(false);
        if(!date.validity.valid)settings.open=true;
        status.textContent=missingTitle?'Заполни заголовок.':'Выбери дату записи.';
        (missingTitle?title:date).focus();return;
      }
      if(!form.checkValidity()) {
        if(!preview.hidden)showPreview(false);
        settings.open=true;status.textContent='Проверь отмеченные поля. Изменения пока не сохранены.';
        form.reportValidity();return;
      }
      if(!slug.value.trim())slug.value=slugify(postTitle(formatField?.value,title.value,text.value));
      let targetPath;
      try {targetPath=path || entryPath(collection,slug.value);} catch(error) {status.textContent=error.message;return;}
      if(!validPath(targetPath)) {status.textContent='Адрес может содержать буквы, цифры и дефисы.';return;}
      saving=true; clearTimeout(autosaveTimer);
      const disabledStates=Array.from(form.querySelectorAll('input,textarea,select,button')).map(input=>[input,input.disabled]);
      disabledStates.forEach(([input])=>input.disabled=true);
      status.textContent=publish?'Публикую…':'Сохраняю черновик…';
      try {
        doc.set('title',postTitle(formatField?.value,title.value,text.value));
        if(formatField){doc.set('format',formatField.value);if(formatField.value==='link')doc.set('linkURL',postLink(linkField.value));else doc.delete('linkURL');}
        doc.set('description',description.value.trim() || postSummary(text.value) || title.value.trim());
        if(!isShelf && !isPage) {if(excerpt.value.trim())doc.set('excerpt',excerpt.value.trim());else doc.delete('excerpt');}
        if(description.value.trim())doc.delete('descriptionAutomatic');else doc.set('descriptionAutomatic',true);
        doc.set(isPage ? 'updated' : 'date',date.value); if(!isPage && !isShelf) doc.set('tags',tags.value.split(',').map(t=>t.trim()).filter(Boolean)); doc.set('draft',!publish);
        if(isShelf) {
          const values=shelfValues(collection,Object.fromEntries(Object.entries(shelfFields).map(([name,input])=>[name,input.type==='checkbox'?input.checked:input.value])));
          for(const [name,value] of Object.entries(values))doc.set(name,value);
          if(collection!=='countries' && !values.url)doc.delete('url');
          if(shelfStatuses[collection] && !values.status)doc.delete('status');
          doc.delete('description');doc.delete('descriptionAutomatic');
        }
        if(hasCover && coverChoice.changed)applyCover(doc,collection,coverChoice);
        const raw=`---\n${doc.toString()}---\n\n${text.value}\n`;
        const usedPhotos=markdownPhotos(text.value);
        const staged=assets.filter(asset=>usedPhotos.some(photo=>photo.src===asset.name) || (hasCover && coverChoice.src===asset.name)).map(asset=>({path:targetPath.slice(0,targetPath.lastIndexOf('/')+1)+asset.name,content:asset.content}));
        snapshot=publish && snapshot.publication==='pending' && editor.dataset.dirty!=='true'
          ? await api.publish(targetPath,snapshot)
          : await api.save(targetPath,raw,snapshot,staged,publish,({completed,total})=>{
            photoProgress.max=total;photoProgress.value=completed;photoProgress.hidden=false;
            status.textContent=completed===total?'Фотографии загружены. Сохраняю запись…':`Сохраняю фотографии · ${completed} из ${total}`;
          });
        if(api.session.type==='local')try {
          sessionStorage.setItem('kaban-local-save-notice',`Сохранено локально: «${postTitle(formatField?.value,title.value,text.value)}». ${publish?'Опубликовано в локальном просмотре.':'Осталось в черновиках.'} На GitHub ничего не отправлено.`);
        } catch { /* The inline status still reports the result. */ }
        path=targetPath; slug.readOnly=true; editor.dataset.dirty='false';
        if(snapshot.branch==='main')publishedSnapshot=snapshot;
        withdrawButton.hidden=!publishedSnapshot?.raw || splitContent(publishedSnapshot.raw).doc.get('draft')===true;
        clearTimeout(autosaveTimer);
        await recoveryQueue.catch(()=>{});
        try { await draftStorage('delete',recoveryKey); } catch { /* A stale recovery copy is harmless. */ }
        recoveryKey=`${api.session.type}:${targetPath}`;
        recoveryStatus.textContent='Сохранено ' + (api.session.type==='local'?'в файле записи.':'в GitHub.');
        publishButton.textContent=snapshot.publication==='pending'?'Повторить публикацию':'Опубликовать';
        status.textContent=snapshot.publication==='pending'
          ? `Черновик сохранён в GitHub. Публикация не завершена: ${snapshot.publicationError} Можно повторить публикацию.`
          : api.session.type==='local'
          ? (publish?'Запись сохранена локально. В режиме разработки обновится автоматически. На GitHub ничего не отправлено.':'Черновик сохранён локально и скрыт с сайта.')
          : (publish?'Изменения отправлены в main. Запись появится после сборки Netlify.':withdrawButton.hidden?'Черновик сохранён в GitHub. Посетители его не видят.':'Изменения сохранены в черновике. Опубликованная версия остаётся на сайте.');
      if(isShelf && snapshot.publication!=='pending')showPreview(true);
      } catch(error) {status.textContent=error.message;}
      finally {photoProgress.hidden=true;saving=false; disabledStates.forEach(([input,disabled])=>{if(input.isConnected)input.disabled=disabled;});}
    }
    let checking=false;
    async function checkPublication() {
      if(checking || saving)return;
      if(uploading) {status.textContent='Дождись добавления фотографий.';return;}
      checking=true;
      const dialog=create('dialog',{class:'author-tag-dialog author-publication-dialog','aria-labelledby':'author-publication-title'});
      dialog.append(create('h2',{id:'author-publication-title'},'Перед публикацией'));
      const address=create('p',{class:'author-tag-current'});
      const results=create('ul',{class:'author-publication-results','aria-live':'polite'});
      const controls=create('div',{class:'author-tag-actions'});
      const dismiss=()=>{dialog.close();dialog.remove();checking=false;publishButton.focus();};
      const go=button('Опубликовать',()=>{dismiss();save(true);},true);go.disabled=true;
      controls.append(button('Вернуться к редактированию',dismiss),go);
      dialog.append(address,results,controls);editor.append(dialog);
      dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
      dialog.showModal();
      try {
      const issues=[];
      if(formatField?.value!=='note' && !title.value.trim())issues.push('Заполни заголовок.');
      if(formatField?.value==='link')try{postLink(linkField.value);}catch(error){issues.push(error.message);}
      if(!date.validity.valid)issues.push('Выбери дату записи.');
      if(!slug.value.trim())slug.value=slugify(postTitle(formatField?.value,title.value,text.value));
      try {if(!isPage)entryPath(collection,slug.value);} catch(error) {issues.push(error.message);}
      if(isShelf)try {shelfValues(collection,Object.fromEntries(Object.entries(shelfFields).map(([name,input])=>[name,input.type==='checkbox'?input.checked:input.value])));} catch(error) {issues.push(error.message);}
      address.textContent=/^[\p{L}\p{N}_-]+$/u.test(slug.value) || isPage ? publicationAddress(collection,slug.value) : 'Адрес появится после заполнения заголовка или поля «Адрес записи».';
      issues.forEach(issue=>results.append(create('li',{},issue)));
      if(!issues.length)results.append(create('li',{},'Обязательные поля заполнены.'));
      if(!text.value.trim())results.append(create('li',{},'Текст пока пустой. Можно опубликовать и так.'));
      const photoStatus=create('li',{},'Проверяю фотографии…');results.append(photoStatus);
      await mediaReady;
      const content=create('div');content.innerHTML=DOMPurify.sanitize(renderPostPreview(text.value));
      const sources=[...new Set([...content.querySelectorAll('img')].map(img=>img.getAttribute('src')).filter(Boolean).concat([hasCover?coverChoice.src:null].filter(value=>typeof value==='string' && value)))];
      const checks=await Promise.all(sources.map(source=>checkPublicationPhoto(async()=>{
        const asset=assets.find(item=>item.name===source);
        if(asset)return asset.url;
        if(/^(?:https?:|data:|blob:|\/)/i.test(source))return source;
        const target=path || entryPath(collection,slug.value);
        const key=decodeURIComponent(new URL(source,'https://preview.invalid/'+target).pathname.slice(1));
        if(imageMap[key] && snapshot.branch==='main')return imageMap[key];
        if(!path)return null;
        const file=await api.readPreviewPhoto(path,source,snapshot.branch || 'main');
        return `data:${file.type};base64,${file.content}`;
      })));
      if(!dialog.isConnected)return;
      const failed=sources.filter((_,index)=>!checks[index]);
      photoStatus.textContent=sources.length ? (failed.length?'Есть фотографии, которые не удалось загрузить:':'Все фотографии загрузились · '+sources.length):'Фотографий нет.';
      failed.forEach(source=>results.append(create('li',{class:'author-publication-error'},source)));
      if(failed.length)results.append(create('li',{},'Проверь файл или ссылку и повтори проверку.'));
      go.disabled=issues.length>0 || failed.length>0;
      if(!go.disabled)go.focus();
      } catch(error) {
        go.disabled=true;results.append(create('li',{class:'author-publication-error'},'Проверка не завершилась: '+error.message+'. Вернись к редактированию и повтори.'));
      }
    }
    const publishButton=button(snapshot.publication==='pending'?'Повторить публикацию':'Опубликовать',checkPublication,true);
    async function withdraw() {
      if(saving || uploading)return;
      if(!confirm('Убрать запись с сайта в черновики? Текст и фотографии сохранятся. Сайт обновится после сборки.'))return;
      saving=true;withdrawButton.disabled=true;
      status.textContent='Снимаю с публикации…';
      try {
        if(editor.dataset.dirty==='true')await persistRecovery();
        const saved=await api.unpublish(path,publishedSnapshot);
        if(saved.publication==='pending') {status.textContent=`Черновик сохранён, но снятие с публикации не завершено: ${saved.publicationError} Нажми «Убрать в черновики» ещё раз.`;return;}
        snapshot=saved;doc.set('draft',true);
        publishedSnapshot=saved;withdrawButton.hidden=true;
        status.textContent=api.session.type==='local'?'Запись убрана в черновики локально. Исчезнет с сайта после сборки; пуш выполняется отдельно.':'Запись убрана в черновики. Исчезнет с сайта после сборки Netlify.';
      } catch(error) {status.textContent=error.message;}
      finally {saving=false;withdrawButton.disabled=false;}
    }
    const withdrawButton=button('Убрать в черновики',withdraw);
    withdrawButton.hidden=!publishedSnapshot?.raw || splitContent(publishedSnapshot.raw).doc.get('draft')===true;
    form.addEventListener('input',()=>{publishButton.textContent='Опубликовать';});
    actions.append(toggle,button('Сохранить черновик',()=>save(false)),publishButton,withdrawButton);
    editor.append(preview);
    form.append(actions,photoProgress,status,recoveryStatus);
    if(cachedDraft?.fields) {
      const notice=create('div',{class:'author-recovery-notice'});
      notice.append(create('p',{},cachedDraft.sha !== snapshot.sha ? 'Есть несохранённая копия. Запись изменилась после её создания — восстановление заменит текст в редакторе.' : 'Есть несохранённая копия этой записи в браузере.'));
      notice.append(button('Восстановить',()=>{
        [title,text,tags,date,excerpt,description,slug,...(formatField?[formatField,linkField]:[]),...Object.values(shelfFields)].forEach(input=>{if(input!==slug || !path){if(input.type==='checkbox')input.checked=cachedDraft.fields[input.name] ?? input.checked;else input.value=cachedDraft.fields[input.name] ?? input.value;}});
        if(!path && cachedDraft.manualSlug)slug.dataset.manual='true';
        if(hasCover && cachedDraft.cover)coverChoice=cachedDraft.cover;
        for(const asset of cachedDraft.assets || []) {
          const bytes=Uint8Array.from(atob(asset.content),c=>c.charCodeAt(0));
          assets.push({...asset,url:URL.createObjectURL(new Blob([bytes]))});
        }
        refreshCoverPanel();
        formatField?.dispatchEvent(new Event('change'));
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
