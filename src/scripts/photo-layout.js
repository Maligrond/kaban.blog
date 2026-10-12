export function layoutPreviewPhotos(root) {
  root.querySelectorAll('p').forEach(p => {
    const children=Array.from(p.childNodes);
    const images=Array.from(p.querySelectorAll(':scope > img'));
    if(!images.length || !children.every(node=>node.nodeType===3 && !node.textContent.trim() || node.nodeType===1 && ['IMG','BR'].includes(node.nodeName)))return;
    if(images.length===1 && !images[0].title)return;
    const figures=images.map(img=>{
      const figure=document.createElement('figure'); figure.className='post-photo';
      const caption=img.title; img.removeAttribute('title'); figure.append(img);
      if(caption) {const label=document.createElement('figcaption');label.textContent=caption;figure.append(label);}
      return figure;
    });
    if(figures.length===1)p.replaceWith(figures[0]);
    else {const gallery=document.createElement('div');gallery.className='post-gallery';gallery.dataset.gallery='';gallery.append(...figures);p.replaceWith(gallery);}
  });
}
export function initializeGalleries(root = document) {
  root.querySelectorAll('[data-gallery]').forEach(gallery=>{
    if(gallery.querySelector('.gallery-track'))return;
    const figures=Array.from(gallery.children);
    const track=document.createElement('div');track.className='gallery-track';
    track.tabIndex=0;track.setAttribute('aria-label','Галерея фотографий');
    track.append(...figures);
    figures.forEach(figure=>{
      const image=figure.querySelector('img');
      if(!image)return;
      const size=()=>{const width=Number(image.getAttribute('width')) || image.naturalWidth;const height=Number(image.getAttribute('height')) || image.naturalHeight;if(width && height)figure.style.setProperty('--photo-ratio',String(width/height));};
      size();
      if(image.complete)size();else image.addEventListener('load',size,{once:true});
    });
    track.addEventListener('keydown',event=>{
      if(event.target!==track || !['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      const index=figures.reduce((best,figure,i)=>Math.abs(figure.offsetLeft-track.scrollLeft)<Math.abs(figures[best].offsetLeft-track.scrollLeft)?i:best,0);
      const target=figures[Math.max(0,Math.min(figures.length-1,index+(event.key==='ArrowLeft'?-1:1)))];
      track.scrollTo({left:target.offsetLeft,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    });
    gallery.append(track);
  });
}
