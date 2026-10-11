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

function publishingAPI({mergeFails=false, mergeLost=false, patchLost=false, cleanupFails=false}={}) {
  const api=new AuthorAPI({type:'github',token:'test'});
  const state={sha:'old',raw:'old',head:'base',hasBranch:true,published:false,calls:[]};
  api.verify=async()=>{};
  api.read=async()=>({sha:state.sha,raw:state.raw});
  api.github=async(route,method='GET',body)=>{
    state.calls.push({route,method,body});
    if(route.includes('/git/ref/heads/'))return state.hasBranch?{object:{sha:state.head}}:null;
    if(route.includes('/contents/'))return {sha:state.sha};
    if(route.endsWith('/git/commits/base'))return {tree:{sha:'tree-base'}};
    if(route.endsWith('/git/blobs')){state.savedRaw=body.content;return {sha:'saved-blob'};}
    if(route.endsWith('/git/trees'))return {sha:'tree-new'};
    if(route.endsWith('/git/commits'))return {sha:'saved-commit'};
    if(method==='PATCH'){
      state.sha='saved-blob';state.raw=state.savedRaw;state.head=body.sha;
      if(patchLost)throw new Error('Network error');
      return {};
    }
    if(route.endsWith('/merges')){
      if(mergeFails)throw new Error('Network error');
      state.published=true;
      if(mergeLost)throw new Error('Lost response');
      return {};
    }
    if(route.includes('/compare/'))return {status:state.published?'behind':'ahead'};
    if(method==='DELETE'){
      if(cleanupFails)throw new Error('Cleanup error');
      state.hasBranch=false;return {};
    }
    throw new Error('Unexpected request '+route);
  };
  return {api,state,allowMerge:()=>{mergeFails=false;}};
}
const entryPath='src/content/blog/italian/index.md';
test('a failed merge returns the saved revision and retries without a second commit',async()=>{
  const {api,state,allowMerge}=publishingAPI({mergeFails:true});
  const saved=await api.save(entryPath,'new',{sha:'old'},[],true);
  assert.equal(saved.publication,'pending');assert.equal(saved.sha,'saved-blob');assert.equal(saved.raw,'new');
  allowMerge();
  const result=await api.publish(entryPath,saved);
  assert.equal(result.publication,'published');
  assert.equal(state.calls.filter(call=>call.route.endsWith('/git/commits')&&call.method==='POST').length,1);
  assert.equal(state.calls.filter(call=>call.route.endsWith('/merges')).at(-1).body.head,'saved-commit');
});
test('a lost branch-update response is recovered by checking the exact commit',async()=>{
  const {api}=publishingAPI({patchLost:true});
  const saved=await api.save(entryPath,'new',{sha:'old'},[],false);
  assert.equal(saved.publication,'draft');assert.equal(saved.commit,'saved-commit');
});
test('a lost merge response is verified before reporting publication failure',async()=>{
  const {api}=publishingAPI({mergeLost:true});
  assert.equal((await api.save(entryPath,'new',{sha:'old'},[],true)).publication,'published');
});
test('branch cleanup failure does not turn publication into a failure',async()=>{
  const {api}=publishingAPI({cleanupFails:true});
  assert.equal((await api.save(entryPath,'new',{sha:'old'},[],true)).publication,'published');
});
test('retry never publishes another editors newer draft',async()=>{
  const {api,state}=publishingAPI({mergeFails:true});
  const saved=await api.save(entryPath,'new',{sha:'old'},[],true);
  state.head='another-commit';const count=state.calls.filter(call=>call.route.endsWith('/merges')).length;
  assert.equal((await api.publish(entryPath,saved)).publication,'pending');
  assert.equal(state.calls.filter(call=>call.route.endsWith('/merges')).length,count);
});
