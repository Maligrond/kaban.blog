import type { Map as LeafletMap, Marker } from 'leaflet';
type Place = {id:string; title:string; country:string; coordinates:[number,number]; rating:number; summary:string; href:string; photo:string|null; photoAlt:string; stories:{title:string;href:string}[]};

// Content is inserted as text nodes, never interpreted as popup HTML.
function placeCard(place: Place) {
  const card=document.createElement('div'); card.className='travel-map-card';
  const add=(tag:string,text:string,className='')=>{const node=document.createElement(tag);node.textContent=text;node.className=className;card.append(node);return node;};
  if(place.photo){const image=document.createElement('img');image.src=place.photo;image.alt=place.photoAlt;image.width=220;image.height=130;card.append(image);}
  add('h3',place.title);
  add('p',`${place.country} · ${place.rating} из 5`,'travel-map-meta');
  if(place.summary)add('p',place.summary);
  const link=add('a','О городе →') as HTMLAnchorElement;link.href=place.href;
  for(const story of place.stories){const link=add('a',story.title,'travel-map-story') as HTMLAnchorElement;link.href=story.href;}
  return card;
}
export function setupTravelMap(){
  document.querySelectorAll<HTMLDetailsElement>('[data-travel-map]').forEach(details=>{
    if(details.dataset.ready)return;
    details.dataset.ready='true';
    const canvas=details.querySelector<HTMLElement>('[data-map-canvas]')!;
    const status=details.querySelector<HTMLElement>('[data-map-status]')!;
    const select=details.querySelector<HTMLSelectElement>('[data-map-city]')!;
    const places:Place[]=JSON.parse(details.querySelector('[data-map-places]')!.textContent!);
    let map:LeafletMap|undefined, initializing=false;
    const markers=new globalThis.Map<string,Marker>();
    const regions=details.querySelectorAll<HTMLButtonElement>('[data-region]');
    const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function region(name:string){
      if(!map)return;
      map.closePopup();select.value='';
      markers.forEach(marker=>marker.getElement()?.classList.remove('is-selected'));
      const subset=places.filter(place=>name==='world'||(name==='america'?place.coordinates[1]<-30:name==='japan'?place.country==='Япония':place.coordinates[1]>-30&&place.coordinates[1]<60));
      if(subset.length)map.fitBounds(subset.map(place=>place.coordinates),{padding:[28,28],maxZoom:6,animate:!reduceMotion});
      regions.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.region===name)));
    }
    regions.forEach(button=>button.addEventListener('click',()=>region(button.dataset.region!)));
    select.addEventListener('change',()=>{
      const place=places.find(place=>place.id===select.value);
      if(!map||!place)return;
      regions.forEach(button=>button.setAttribute('aria-pressed','false'));
      // Open only after the view is set: simultaneous pan animations can
      // otherwise leave a tall photo card clipped above the map on phones.
      map.setView(place.coordinates,8,{animate:false});markers.get(place.id)?.openPopup();
    });
    details.addEventListener('toggle',async()=>{
      if(!details.open)return;
      if(map){map.invalidateSize();return;}
      if(initializing)return;
      initializing=true;status.textContent='Загружаю карту…';
      try{
        const [module]=await Promise.all([import('leaflet'),import('leaflet/dist/leaflet.css')]);
        if(!details.open)return;
        const L=module.default;
        map=L.map(canvas,{scrollWheelZoom:false, worldCopyJump:true, maxZoom:16});
        const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
        tiles.on('tileerror',()=>{status.textContent='Подложка карты недоступна. Точки городов и выбор из списка продолжают работать.';});
        tiles.on('load',()=>{status.textContent='Нажми на точку, чтобы посмотреть город.';});
        const icon=L.divIcon({className:'travel-map-point',iconSize:[24,24],iconAnchor:[12,12]});
        for(const place of places){
          const marker=L.marker(place.coordinates,{icon,title:place.title,alt:place.title,keyboard:true}).addTo(map).bindPopup(()=>placeCard(place),{maxWidth:250,autoPanPadding:[12,12],keepInView:true});
          markers.set(place.id,marker);
          marker.on('popupopen',()=>{select.value=place.id;marker.getElement()?.classList.add('is-selected');});
          marker.on('popupclose',()=>{marker.getElement()?.classList.remove('is-selected');});
        }
        region('world');status.textContent='Нажми на точку, чтобы посмотреть город.';
      }catch(error){map?.remove();map=undefined;markers.clear();status.textContent='Не удалось загрузить карту. Закрой и открой её, чтобы попробовать снова. Список городов доступен ниже.';}
      finally{initializing=false;}
    });
  });
}
