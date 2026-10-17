import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { localSocialPhoto,postSocialPhoto,renderSocialCard } from '../src/lib/social-cards.js';

test('card photos resolve encoded local names without reading arbitrary files or remote URLs',()=>{
  const root='/project';const source='/project/src/content/blog/trip/index.md';
  assert.equal(localSocialPhoto('вид%20из%20окна.jpg?v=2',source,root),'/project/src/content/blog/trip/вид из окна.jpg');
  assert.equal(localSocialPhoto('/cover.png',source,root),'/project/public/cover.png');
  for(const value of ['https://example.com/photo.jpg','//example.com/photo.jpg','data:image/png;base64,x','../../../../../private.jpg','/../../private.jpg','bad%xx.jpg','notes.md'])assert.equal(localSocialPhoto(value,source,root),undefined);
});

test('cover selection respects coverDisabled and falls back from a missing cover to the first Markdown photo',async()=>{
  const root=await mkdtemp(join(tmpdir(),'kaban-social-'));
  try{
    const directory=join(root,'src/content/blog/trip');await mkdir(directory,{recursive:true});
    const image=color=>sharp({create:{width:40,height:60,channels:3,background:color}}).png().toBuffer();
    await writeFile(join(directory,'cover.png'),await image('#ff0000'));
    await writeFile(join(directory,'photo.png'),await image('#0000ff'));
    const source=cover=>writeFile(join(directory,'index.md'),`---\ncover: ${cover}\n---\n`);
    const post={id:'trip',data:{},body:'![View](photo.png)'};
    await source('cover.png');
    const cover=await postSocialPhoto(post,root);
    const coverStats=await sharp(cover).stats();assert.ok(coverStats.channels[0].mean>coverStats.channels[2].mean);
    assert.equal(await postSocialPhoto({...post,data:{coverDisabled:true}},root),undefined);
    await source('missing.png');
    const fallback=await postSocialPhoto(post,root);
    const fallbackStats=await sharp(fallback).stats();assert.ok(fallbackStats.channels[2].mean>fallbackStats.channels[0].mean);
    assert.equal(await postSocialPhoto({...post,body:''},root),undefined);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('long Cyrillic and Latin titles produce a standard static JPEG with or without a photo',async()=>{
  const title='Как я сделал свой блог на Astro: путешествия, фотографии и заметки о жизни. '.repeat(5);
  const photo=await sharp({create:{width:480,height:430,channels:3,background:'#ddeeff'}}).jpeg().toBuffer();
  for(const source of [undefined,photo]){
    const image=await renderSocialCard({title,description:'Кириллица, Latin и символы « & < > »',photo:source});
    const metadata=await sharp(image).metadata();
    assert.equal(metadata.format,'jpeg');assert.equal(metadata.width,1200);assert.equal(metadata.height,630);
    assert.ok(image.length<500_000);
  }
});
