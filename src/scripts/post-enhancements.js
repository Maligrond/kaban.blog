import { standaloneLink, linkCardHTML } from '../lib/link-card.js';
export function youtubeVideo(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    let id;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/)?.[1];
    }
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
export function enhancePost(root, previews = {}) {
  root.querySelectorAll('p').forEach(paragraph => {
    const first = paragraph.firstChild;
    if (first?.nodeType === 3) {
      const match = first.textContent.match(/^\.(lead|loud|foot)\s*\n/);
      if (match) {
        paragraph.classList.add(`post-${match[1]}`);
        first.textContent = first.textContent.slice(match[0].length);
      }
    }
    // Only a standalone URL becomes a player. Links inside prose stay links.
    const children = Array.from(paragraph.childNodes).filter(node => node.nodeType !== 3 || node.textContent.trim());
    if (children.length !== 1) return;
    const child = children[0];
    const value = child.nodeType === 3 ? child.textContent.trim() : child.nodeName === 'A' ? child.getAttribute('href') : '';
    if (child.nodeName === 'A' && child.textContent.trim() !== value) return;
    const id = youtubeVideo(value);
    if (!id) {
      if(child.nodeName !== 'A'||child.childNodes.length!==1||child.firstChild.nodeType!==3) return;
      const url=standaloneLink({type:'element',tagName:'p',children:[{type:'element',tagName:'a',properties:{href:value},children:[{type:'text',value:child.textContent.trim()}]}]});
      if(!url) return;
      const template=document.createElement('template');
      template.innerHTML=linkCardHTML(url,previews[url]);
      paragraph.replaceWith(template.content);
      return;
    }
    const figure = document.createElement('figure'); figure.className = 'post-video';
    const play = document.createElement('button'); play.type = 'button'; play.className = 'post-video-play';
    play.setAttribute('aria-label', 'Смотреть видео на YouTube');
    const image = document.createElement('img'); image.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; image.alt = ''; image.loading = 'lazy';
    const label = document.createElement('span'); label.textContent = '▶ Смотреть видео';
    play.append(image, label);
    const source = document.createElement('a'); source.href = `https://www.youtube.com/watch?v=${id}`; source.textContent = 'Открыть на YouTube ↗';
    source.target = '_blank'; source.rel = 'noopener noreferrer';
    play.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.title = 'Видео YouTube';
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin'; iframe.allowFullscreen = true;
      play.replaceWith(iframe); iframe.focus();
    }, {once:true});
    figure.append(play, source); paragraph.replaceWith(figure);
  });
}
