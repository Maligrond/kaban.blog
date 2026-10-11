import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countryCode,chooseLocation,resolveCityCoordinates } from '../src/lib/city-geocoding.js';
const place=(name,country='PT',population=500000)=>({name,country_code:country,country:'Португалия',latitude:38.72509,longitude:-9.1498,feature_code:'PPLC',population});
const city=(title='Лиссабон',country='Португалия',extra={})=>({id:'lisbon',data:{title,country,...extra}});
async function sandbox(run){const dir=await mkdtemp(join(tmpdir(),'kaban-geocoding-'));try{await run(join(dir,'cache.json'));}finally{await rm(dir,{recursive:true,force:true});}}
test('country filter handles Russian names and aliases',()=>{assert.equal(countryCode('Португалия'),'PT');assert.equal(countryCode('США'),'US');assert.equal(countryCode('Германия'),'DE');assert.equal(countryCode('Шри-Ланка'),'LK');});
test('does not choose another country, invalid coordinates or ambiguous cities',()=>{
 assert.equal(chooseLocation([place('Лиссабон','US')],'Лиссабон','Португалия'),null);
 assert.equal(chooseLocation([place('Лиссабон'),place('Лиссабон','PT',400000)],'Лиссабон','Португалия'),null);
 assert.equal(chooseLocation([{...place('Лиссабон'),latitude:100}],'Лиссабон','Португалия'),null);
 assert.deepEqual(chooseLocation([place('Лиссабон'),place('Лиссабон','PT',100)],'Лиссабон','Португалия'),[38.72509,-9.1498]);
});
test('new city is located and cached; repeat builds work without network',()=>sandbox(async cacheFile=>{
 let requests=0;
 const fetch=async url=>{requests++;assert.equal(url.searchParams.get('countryCode'),'PT');assert.equal(url.searchParams.get('name'),'Лиссабон');return {ok:true,json:async()=>({results:[place('Лиссабон')]})};};
 const first=await resolveCityCoordinates([city()],{cacheFile,fetch});assert.equal(requests,1);assert.deepEqual(first[0].data.coordinates,[38.72509,-9.1498]);
 const second=await resolveCityCoordinates([city()],{cacheFile,fetch:async()=>{throw Error('offline');}});assert.deepEqual(second[0].data.coordinates,first[0].data.coordinates);
}));
test('manual coordinates override cache; drafts never trigger a lookup',()=>sandbox(async cacheFile=>{
 const located=await resolveCityCoordinates([city('Лиссабон','Португалия',{coordinates:[1,2]}),city('Секретный город','Португалия',{draft:true})],{cacheFile,fetch:async()=>{assert.fail('unexpected request');}});
 assert.equal(located.length,1);assert.deepEqual(located[0].data.coordinates,[1,2]);
}));
test('outage does not stop build and does not cache a failed lookup',()=>sandbox(async cacheFile=>{
 const warnings=[];const opts={cacheFile,warn:message=>warnings.push(message)};
 assert.deepEqual(await resolveCityCoordinates([city()],{...opts,fetch:async()=>{throw Error('offline');}}),[]);assert.equal(warnings.length,1);
 assert.equal((await resolveCityCoordinates([city()],{...opts,fetch:async()=>({ok:true,json:async()=>({results:[place('Лиссабон')]})})})).length,1);
}));
test('changing country invalidates cached result',()=>sandbox(async cacheFile=>{
 await resolveCityCoordinates([city()],{cacheFile,fetch:async()=>({ok:true,json:async()=>({results:[place('Лиссабон')]})})});
 let requests=0;await resolveCityCoordinates([city('Лиссабон','США')],{cacheFile,warn:()=>{},fetch:async url=>{requests++;assert.equal(url.searchParams.get('countryCode'),'US');return {ok:true,json:async()=>({results:[]})};}});assert.equal(requests,1);
}));
