import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDocument} from 'yaml';
import {coverCandidates,applyCover,hasCoverInBody} from '../src/scripts/author-cover.js';

test('cover candidates deduplicate actual photos and preserve existing cover outside body',()=>{
  const body='![First](a.jpg)\n![Repeated](a.jpg)\n![Remote](https://example.org/b.png)\n`![Code](c.jpg)`\n![New](d.png)';
  assert.deepEqual(coverCandidates(body,{src:'existing.jpg',alt:'Existing'}).map(photo=>photo.src),['existing.jpg','a.jpg','d.png']);
});
test('choosing and removing post cover preserves text fields and disables fallback explicitly',()=>{
  const doc=parseDocument('title: Title\npreviewImage: old.jpg\ncoverDisabled: true\n');
  applyCover(doc,'blog',{src:'new.png',alt:'New'});
  assert.equal(doc.get('cover'),'new.png');assert.equal(doc.get('coverAlt'),'New');assert.equal(doc.has('previewImage'),false);assert.equal(doc.has('coverDisabled'),false);
  applyCover(doc,'blog',{src:'',alt:''});
  assert.equal(doc.has('cover'),false);assert.equal(doc.has('coverAlt'),false);assert.equal(doc.get('coverDisabled'),true);assert.equal(doc.get('title'),'Title');
});
test('city selection writes city photo fields and recognizes same image without duplicating it',()=>{
  const doc=parseDocument('country: Italy\n');
  applyCover(doc,'countries',{src:'photo.jpg',alt:'Rapallo'});
  assert.equal(doc.get('photo'),'photo.jpg');assert.equal(doc.get('photoAlt'),'Rapallo');assert.equal(doc.has('cover'),false);
  assert.equal(hasCoverInBody('![City](./photo.jpg "Caption")','photo.jpg'),true);
  assert.equal(hasCoverInBody('![Another](other.jpg)','photo.jpg'),false);
  applyCover(doc,'countries',{src:''});assert.equal(doc.has('photo'),false);assert.equal(doc.has('coverDisabled'),false);
});
test('uploaded cover-only photos remain selectable and path aliases are not repeated',()=>{
  assert.deepEqual(coverCandidates('![A](a.jpg)',{src:'./a.jpg'},[{src:'a.jpg'},{src:'cover-only.png',alt:'Cover'}]).map(photo=>photo.src),['a.jpg','cover-only.png']);
});

test('shelf cover links replace uploaded covers and removal disables built in fallback',()=>{
 const doc=parseDocument('cover: old.jpg\n');
 applyCover(doc,'books',{src:'https://example.org/cover.jpg',alt:'Book'});
 assert.equal(doc.get('coverURL'),'https://example.org/cover.jpg');assert.equal(doc.has('cover'),false);
 applyCover(doc,'books',{src:'new.jpg'});assert.equal(doc.has('coverURL'),false);assert.equal(doc.get('cover'),'new.jpg');
 applyCover(doc,'books',{src:''});assert.equal(doc.get('coverDisabled'),true);
 for(const src of ['javascript:alert(1)','http://example.org/x.jpg','https://user:pass@example.org/x.jpg'])assert.throws(()=>applyCover(doc,'books',{src}));
});
