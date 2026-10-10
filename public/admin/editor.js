/* Decap provides createClass and h for custom preview components. */
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  document.querySelector('#local-notice').hidden = false;
}
CMS.registerPreviewStyle('/admin/preview.css');
CMS.registerPreviewTemplate('blog', createClass({
  render: function () {
    const entry = this.props.entry;
    const data = entry.get('data');
    const date = new Date(data.get('date'));
    const dateText = Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const tags = data.get('tags');
    return h('article', { className: 'note-preview' },
      h('header', {}, h('h1', {}, data.get('title') || 'Без названия'), h('time', {}, dateText)),
      h('div', { className: 'note-body' }, this.props.widgetFor('body')),
      h('footer', {}, h('time', {}, dateText), tags && tags.map(tag => h('span', { key: tag }, tag)))
    );
  }
}));

function updateEditorChrome() {
  document.body.classList.toggle('editing-entry', location.hash.includes('/entries/') || location.hash.endsWith('/new'));
}
updateEditorChrome();
window.addEventListener('hashchange', updateEditorChrome);

// Resolve old, relative photo URLs without rewriting the Markdown content.
fetch('/admin/media.json').then(response => {
  if (!response.ok) throw new Error('Preview assets unavailable');
  return response.json();
}).then(assets => {
  const watched = new WeakSet();
  function resolveImages(root) {
    const match = location.hash.match(/\/collections\/blog\/entries\/(.+)$/);
    if (!match) return;
    const entryPath = decodeURIComponent(match[1]);
    const directory = 'src/content/blog/' + entryPath.slice(0, entryPath.lastIndexOf('/') + 1);
    root.querySelectorAll('img').forEach(img => {
      const source = img.getAttribute('src');
      if (!source || /^(?:[a-z]+:|\/|#)/i.test(source)) return;
      const path = decodeURIComponent(new URL(source, 'https://preview.invalid/' + directory).pathname.slice(1));
      if (assets[path]) img.setAttribute('src', assets[path]);
    });
  }
  function watch(root) {
    if (!root || watched.has(root)) return;
    watched.add(root);
    new MutationObserver(() => resolveImages(root)).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    resolveImages(root);
  }
  const root = document.querySelector('#nc-root');
  watch(root);
  function watchFrames() {
    document.querySelectorAll('iframe').forEach(frame => {
      try { watch(frame.contentDocument); } catch { /* Only same-origin preview frames. */ }
      if (!watched.has(frame)) {
        watched.add(frame);
        frame.addEventListener('load', () => { try { watch(frame.contentDocument); } catch {} });
      }
    });
  }
  new MutationObserver(watchFrames).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => { resolveImages(document); watchFrames(); });
  watchFrames();
}).catch(() => console.warn('Не удалось загрузить фотографии для предпросмотра.'));
