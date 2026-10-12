import test from 'node:test';
import assert from 'node:assert/strict';
import {postTitle,postLink} from '../src/lib/post-formats.js';
test('titleless notes keep a useful title for search, URLs and RSS',()=>{
 assert.equal(postTitle('note','','Первое предложение.'),'Первое предложение.');
 assert.equal(postTitle('note','Мой заголовок','Текст'),'Мой заголовок');
 assert.equal(postTitle('note','',''),'Короткая запись');
});
test('commented links accept ordinary web addresses and reject credentials and scripts',()=>{
 assert.equal(postLink(' https://example.org/a '),'https://example.org/a');
 for(const link of ['javascript:alert(1)','//example.org','https://user:pass@example.org'])assert.throws(()=>postLink(link));
});
