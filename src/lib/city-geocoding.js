import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cacheFile = new URL('../../node_modules/.cache/kaban-city-coordinates-v1.json', import.meta.url);
const normalize = value => String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const countryNames = new Intl.DisplayNames(['ru', 'en'], { type: 'region' });
const countryCodes = new Map([['сша','US'],['соединенные штаты','US'],['россия','RU'],['рф','RU'],['великобритания','GB'],['южная корея','KR']]);
for (let a=65;a<=90;a++) for(let b=65;b<=90;b++) {
  const code=String.fromCharCode(a,b);
  const name=countryNames.of(code);
  if(name && name!==code)countryCodes.set(normalize(name),code);
}
export function countryCode(country) {
  if(/^[a-z]{2}$/i.test(country))return country.toUpperCase();
  return countryCodes.get(normalize(country));
}
export function validCoordinates(value) {
  return Array.isArray(value) && value.length===2 && value.every(Number.isFinite) && Math.abs(value[0])<=90 && Math.abs(value[1])<=180;
}

// Never take a result in another country or an arbitrary fuzzy prefix match.
export function chooseLocation(results, title, country) {
  const code=countryCode(country);
  const candidates=(results || []).filter(place=>
    (code ? place.country_code===code : normalize(place.country)===normalize(country)) &&
    /^PPL/.test(place.feature_code || '') && validCoordinates([place.latitude,place.longitude]));
  const exact=candidates.filter(place=>normalize(place.name)===normalize(title));
  const ranked=(exact.length ? exact : candidates).sort((a,b)=>(b.population || 0)-(a.population || 0));
  if(!ranked.length)return null;
  // A single match can have a localized name; several uncertain matches
  // should be resolved by an author rather than silently guessed.
  if(!exact.length && ranked.length>1)return null;
  if(ranked.length>1 && (ranked[0].population || 0)<(ranked[1].population || 0)*3)return null;
  return [ranked[0].latitude,ranked[0].longitude];
}

export async function resolveCityCoordinates(cities, options={}) {
  const path=options.cacheFile || cacheFile;
  const request=options.fetch || globalThis.fetch;
  const warn=options.warn || console.warn;
  let cache={};
  try{const saved=JSON.parse(await readFile(path,'utf8'));if(saved && typeof saved==='object' && !Array.isArray(saved))cache=saved;}catch{/* Empty or missing cache simply requires a lookup. */}
  let changed=false;
  const located=[];
  for(const city of cities){
    if(city.data.draft)continue;
    if(validCoordinates(city.data.coordinates)){located.push(city);continue;}
    const {title,country}=city.data;
    const key=JSON.stringify([normalize(title),normalize(country)]);
    let coordinates=cache[key];
    if(!validCoordinates(coordinates)){
      const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
      const code=countryCode(country);
      url.searchParams.set('name',code?title:`${title}, ${country}`);
      url.searchParams.set('language','ru');
      url.searchParams.set('count','100');
      if(code)url.searchParams.set('countryCode',code);
      try{
        const response=await request(url,{signal:AbortSignal.timeout(8000)});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const body=await response.json();
        coordinates=chooseLocation(body.results,title,country);
        if(coordinates){cache[key]=coordinates;changed=true;}
        else warn(`[Карта] Не удалось однозначно найти «${title}, ${country}». Уточни название или укажи coordinates в записи города.`);
      }catch(error){warn(`[Карта] Поиск «${title}, ${country}» недоступен: ${error.message}. Город останется в списке; поиск повторится при следующей сборке.`);}
    }
    if(validCoordinates(coordinates))located.push({...city,data:{...city.data,coordinates}});
  }
  // Cache only successful lookups. New names/countries use new keys, and a
  // temporarily unavailable geocoder never makes the whole blog unbuildable.
  if(changed)try{await mkdir(dirname(path instanceof URL?fileURLToPath(path):path),{recursive:true});await writeFile(path,JSON.stringify(cache,null,2)+'\n');}catch(error){warn(`[Карта] Не удалось сохранить кеш координат: ${error.message}`);}
  return located;
}
