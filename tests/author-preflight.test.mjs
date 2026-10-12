import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationAddress,checkPublicationPhoto} from '../src/scripts/author-preflight.js';

test('publication addresses match all editable public routes',()=>{
  assert.equal(publicationAddress('blog','italian'),'https://kaban.blog/blog/italian/');
  assert.equal(publicationAddress('books','solaris'),'https://kaban.blog/books/solaris/');
  assert.equal(publicationAddress('games','portal'),'https://kaban.blog/games/portal/');
  assert.equal(publicationAddress('countries','rapallo'),'https://kaban.blog/countries/rapallo/');
  assert.equal(publicationAddress('pages','now'),'https://kaban.blog/now/');
  assert.match(publicationAddress('blog','тест'),/%D1%82/);
});
test('photo check rejects missing, failed and stalled sources, accepts decoded photo',async()=>{
  globalThis.Image=class {
    set src(value) {this.naturalWidth=value==='good'?100:0;queueMicrotask(()=>value==='good'?this.onload?.():this.onerror?.());}
  };
  assert.equal(await checkPublicationPhoto(async()=>null),false);
  assert.equal(await checkPublicationPhoto(async()=>{throw new Error('Missing file');}),false);
  assert.equal(await checkPublicationPhoto(async()=>'bad'),false);
  assert.equal(await checkPublicationPhoto(async()=>'good'),true);
  assert.equal(await checkPublicationPhoto(()=>new Promise(()=>{}),10),false);
});
