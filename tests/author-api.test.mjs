import test from 'node:test';
import assert from 'node:assert/strict';

// Load the API in a published-site context. A browser flag alone cannot grant access.
globalThis.location = {hostname:'kaban.blog'};
const {AuthorAPI,validPath} = await import('../src/scripts/author-api.js');
const response = (data,status=200) => ({ok:status>=200&&status<300,status,json:async()=>data});
test('entry paths cannot escape the blog directory',()=>{
  assert.equal(validPath('src/content/blog/italian/index.md'),true);
  for(const path of ['../secrets','src/content/blog/../index.md','src/content/blog/a/b/index.md','src/content/blog/a/index.mdx']) assert.equal(validPath(path),false);
});
test('a forged local session is rejected on the published site',async()=>{
  await assert.rejects(new AuthorAPI({type:'local'}).verify(),/Локальный режим недоступен/);
});
test('GitHub visitors with repository access still cannot impersonate the owner',async()=>{
  globalThis.fetch=async url=>response(url.endsWith('/user')?{login:'other-user'}:{permissions:{push:true}});
  await assert.rejects(new AuthorAPI({type:'github',token:'test-token'}).verify(),/только владельцу/);
});
test('owner must have write permission',async()=>{
  globalThis.fetch=async url=>response(url.endsWith('/user')?{login:'Maligrond'}:{permissions:{push:false}});
  await assert.rejects(new AuthorAPI({type:'github',token:'test-token'}).verify(),/только владельцу/);
});
test('expired credentials fail without granting author access',async()=>{
  globalThis.fetch=async()=>response({},401);
  await assert.rejects(new AuthorAPI({type:'github',token:'expired'}).verify(),/Войди снова/);
});
test('stale content is rejected before any GitHub mutation',async()=>{
  const mutations=[];
  globalThis.fetch=async(url,options)=>{
    if(options.method!=='GET')mutations.push(url);
    if(url.endsWith('/user'))return response({login:'Maligrond'});
    if(url.endsWith('/repos/Maligrond/kaban.blog'))return response({permissions:{push:true}});
    if(url.includes('/git/ref/'))return response({},404);
    return response({sha:'new-sha',content:Buffer.from('new content').toString('base64')});
  };
  await assert.rejects(new AuthorAPI({type:'github',token:'test'}).save('src/content/blog/italian/index.md','changed',{sha:'old-sha'},[],false),/другом окне/);
  assert.deepEqual(mutations,[]);
});
