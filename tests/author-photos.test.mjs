import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownPhotos,photoMarkdown,replacePhoto,removePhoto,reorderPhotos} from '../src/scripts/author-photos.js';
test('photo ranges ignore code and distinguish repeated images',()=>{
 const photo='![A](a.jpg "Caption")';
 const source='```md\n'+photo+'\n```\n\n`'+photo+'`\n\n'+photo+'\n'+photo+'\n';
 const photos=markdownPhotos(source);
 assert.equal(photos.length,2);
 assert.equal(source.slice(photos[0].start,photos[0].end),photo);
 const result=replacePhoto(source,photos[1],photoMarkdown({...photos[1],caption:'Changed "quote"'}));
 assert.equal(markdownPhotos(result)[0].caption,'Caption');
 assert.equal(markdownPhotos(result)[1].caption,'Changed "quote"');
});
test('reordering preserves prose and separators without losing photos',()=>{
 const source='Before\n\n![A](a.jpg)\n![B](b.jpg)\n![C](c.jpg)\n\nAfter';
 const result=reorderPhotos(source,markdownPhotos(source),0,2);
 assert.equal(result,'Before\n\n![B](b.jpg)\n![C](c.jpg)\n![A](a.jpg)\n\nAfter');
});
test('stale edits are rejected and deletion leaves neighbouring text intact',()=>{
 const source='Before ![A](a.jpg) after';const photo=markdownPhotos(source)[0];
 assert.equal(replacePhoto(source,photo,''),'Before  after');
 assert.throws(()=>replacePhoto('Changed '+source,photo,''),/Текст изменился/);
});

test('deleting the middle photograph keeps the remaining gallery together',()=>{
 const source='Before\n\n![A](a.jpg)\n![B](b.jpg)\n![C](c.jpg)\n\nAfter';
 assert.equal(removePhoto(source,markdownPhotos(source)[1]),'Before\n\n![A](a.jpg)\n![C](c.jpg)\n\nAfter');
});
