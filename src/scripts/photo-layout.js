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
    const controls=document.createElement('div');controls.className='gallery-controls';
    const previous=document.createElement('button');previous.type='button';previous.textContent='←';previous.setAttribute('aria-label','Предыдущий снимок галереи');
    const next=document.createElement('button');next.type='button';next.textContent='→';next.setAttribute('aria-label','Следующий снимок галереи');
    const position=document.createElement('span');position.setAttribute('aria-live','polite');
    let index=0;
    const update=()=>{
      index=figures.reduce((best,figure,i)=>Math.abs(figure.offsetLeft-track.offsetLeft-track.scrollLeft)<Math.abs(figures[best].offsetLeft-track.offsetLeft-track.scrollLeft)?i:best,0);
      position.textContent=`${index+1} / ${figures.length}`;previous.disabled=index===0;next.disabled=index===figures.length-1;
    };
    const move=step=>{const target=figures[Math.max(0,Math.min(figures.length-1,index+step))];track.scrollTo({left:target.offsetLeft-track.offsetLeft,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
    previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
    track.addEventListener('scroll',update,{passive:true});
    track.addEventListener('keydown',event=>{if(event.target!==track)return;if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}});
    controls.append(previous,position,next);gallery.append(track,controls);update();
  });
}
