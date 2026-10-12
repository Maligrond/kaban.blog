import test from 'node:test';
import assert from 'node:assert/strict';
import {marked} from 'marked';
import {findAuthorLinks,linkAddress,authorLink} from '../src/scripts/author-links.js';

test('page search matches titles, authors and countries, handles ё and excludes current page',()=>{
  const items=[{title:'Рапалло',detail:'Италия',kind:'Город',url:'/countries/rapallo/'},{title:'Солярис',detail:'Станислав Лем',kind:'Книга',url:'/books/solaris/'},{title:'Ёлка',kind:'Пост',url:'/blog/tree/'}];
  assert.equal(findAuthorLinks(items,'италия рапалло')[0].url,'/countries/rapallo/');
  assert.equal(findAuthorLinks(items,'лем')[0].title,'Солярис');
  assert.equal(findAuthorLinks(items,'елка')[0].title,'Ёлка');
  assert.equal(findAuthorLinks(items,'','/books/solaris/').length,2);
});
test('link addresses accept public routes and HTTP but reject script URLs, ambiguous hosts and credentials',()=>{
  assert.equal(linkAddress('/books/solaris/'),'/books/solaris/');
  assert.equal(linkAddress('https://example.com/path?q=one two'),'https://example.com/path?q=one%20two');
  for(const value of ['javascript:alert(1)','data:text/html,test','//evil.example','/\\evil.example','https://user:password@example.com','просто поиск'])assert.equal(linkAddress(value),null);
});
test('inserted Markdown preserves selected words and safely escapes labels and URL parentheses',()=>{
  const result=authorLink('Жил в [Рапалло]','/countries/rapallo/');
  const html=marked.parse(result);
  assert.match(html,/>Жил в \[Рапалло\]<\/a>/);assert.match(html,/href="\/countries\/rapallo\/"/);
  assert.match(authorLink('Книга','https://example.com/book_(1)'),/book_%281%29/);
  assert.throws(()=>authorLink('','/blog/post/'));
  assert.throws(()=>authorLink('Ссылка','javascript:alert(1)'));
});
