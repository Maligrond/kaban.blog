import test from 'node:test';
import assert from 'node:assert/strict';
import {entryPath,shelfValues} from '../src/scripts/author-entries.js';
import {relatedPostsFor} from '../src/lib/related-posts.js';
test('inline shelf values match schemas and reject invalid input',()=>{
  assert.deepEqual(shelfValues('books',{author:' Автор ',rating:'4',url:''}),{author:'Автор',rating:4});
  assert.deepEqual(shelfValues('games',{year:'2020',rating:'5',url:'https://example.com/'}),{year:2020,rating:5,url:'https://example.com/'});
  assert.deepEqual(shelfValues('countries',{country:' Италия ',flag:'🇮🇹',rating:'3',favorite:true}),{country:'Италия',flag:'🇮🇹',rating:3,favorite:true});
  assert.throws(()=>shelfValues('books',{author:'',rating:'4'}));
  assert.throws(()=>shelfValues('games',{year:'',rating:'4'}));
  assert.throws(()=>shelfValues('books',{author:'A',rating:'6'}));
  assert.throws(()=>shelfValues('games',{year:'2020',rating:'4',url:'javascript:alert(1)'}));
  assert.throws(()=>entryPath('countries','../secret'));
  assert.throws(()=>entryPath('unknown','example'));
});
test('preview recommendations exclude current entry and prioritize common themes',()=>{
  const posts=[{id:'same',tags:['италия'],date:'2025-01-01'},{id:'unrelated',tags:['игры'],date:'2026-01-01'},{id:'recent',tags:['италия'],date:'2026-01-01'},{id:'best',tags:['Италия','языки'],date:'2024-01-01'}];
  assert.deepEqual(relatedPostsFor('same',['италия','языки'],posts).map(post=>post.id),['best','recent']);
  assert.deepEqual(relatedPostsFor('same',[],posts),[]);
});

test('shelf marks are optional, collection specific, and validated',()=>{
  assert.equal(shelfValues('books',{author:'Автор',rating:'4',status:'rereading'}).status,'rereading');
  assert.equal(shelfValues('games',{year:'2020',rating:'4',status:'playing'}).status,'playing');
  assert.throws(()=>shelfValues('books',{author:'Автор',rating:'4',status:'playing'}));
  assert.throws(()=>shelfValues('games',{year:'2020',rating:'4',status:'unknown'}));
  assert.equal('status' in shelfValues('games',{year:'2020',rating:'4',status:''}),false);
});
