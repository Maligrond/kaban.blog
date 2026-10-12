import test from 'node:test';
import assert from 'node:assert/strict';

// Load the API in a published-site context. A browser flag alone cannot grant access.
globalThis.location = {hostname:'kaban.blog'};
const {AuthorAPI,validPath} = await import('../src/scripts/author-api.js');
const response = (data,status=200) => ({ok:status>=200&&status<300,status,json:async()=>data});
test('entry paths are limited to blog posts and the known now page',()=>{
  assert.equal(validPath('src/content/blog/italian/index.md'),true);
  assert.equal(validPath('src/content/pages/now/index.md'),true);
  assert.equal(validPath('src/content/pages/other/index.md'),false);
  const api=new AuthorAPI({type:'github'});
  assert.equal(api.branch('src/content/pages/now/index.md'),'codex/author-pages/now');
  assert.equal(api.branch('src/content/blog/now/index.md'),'codex/author/now');
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

test('GitHub drafts combine main files and workflow branches, with the branch taking precedence',async()=>{
  const api=new AuthorAPI({type:'github',token:'test'});
  const requests=[];
  const mainDraft='src/content/blog/how-this-blog-works/index.md';
  const existing='src/content/blog/italian/index.md';
  const newDraft='src/content/blog/new-story/index.md';
  const now='src/content/pages/now/index.md';
  api.github=async route=>{
    requests.push(route);
    if(route.includes('/matching-refs/'))return [
      {ref:'refs/heads/codex/author/italian'},
      {ref:'refs/heads/codex/author/new-story'},
      {ref:'refs/heads/codex/author-pages/now'},
      {ref:'refs/heads/codex/author-unrelated/ignore'},
    ];
    if(route.includes('/git/trees/'))return {truncated:false,tree:[mainDraft,existing,now,'src/content/movies/example.md','src/content/blog/example/index.mdx'].map(path=>({type:'blob',path}))};
    const branch=route.includes('ref=codex%2F');
    return {content:Buffer.from(branch?'---\ntitle: Из ветки\ndraft: false\n---\nНовая версия':'---\ntitle: Из main\ndraft: true\n---\nЧерновик').toString('base64')};
  };
  const items=await api.drafts();
  assert.equal(items.length,4);
  assert.equal(items.find(item=>item.path===mainDraft).workflow,false);
  assert.match(items.find(item=>item.path===mainDraft).raw,/Черновик/);
  assert.match(items.find(item=>item.path===existing).raw,/Новая версия/);
  assert.equal(items.find(item=>item.path===existing).workflow,true);
  assert.equal(items.find(item=>item.path===newDraft).workflow,true);
  assert.equal(items.find(item=>item.path===now).workflow,true);
  assert.equal(requests.filter(route=>route.includes('/contents/')).length,4);
  assert.ok(!requests.some(route=>route.includes('countries')||route.includes('index.mdx')));
});
test('a truncated GitHub tree reports a retrieval failure rather than an empty drafts list',async()=>{
  const api=new AuthorAPI({type:'github',token:'test'});
  api.github=async route=>route.includes('/matching-refs/')?[]:{truncated:true,tree:[]};
  await assert.rejects(api.drafts(),/полный список/);
});

test('shelf paths are limited and isolated from post workflow branches',()=>{
  const api=new AuthorAPI({type:'github'});
  for(const collection of ['books','games','countries']) {
    assert.equal(validPath(`src/content/${collection}/example.md`),true);
    assert.equal(api.branch(`src/content/${collection}/example.md`),`codex/author-shelves/${collection}/example`);
  }
  for(const path of ['src/content/books/../secret.md','src/content/books/a/b.md','src/content/books/a.mdx','src/content/movies/a.md','public/a.md'])assert.equal(validPath(path),false);
});
test('shelf workflow drafts override main entries and unsupported branches are ignored',async()=>{
  const api=new AuthorAPI({type:'github'});
  api.github=async route=>{
    if(route.includes('matching-refs'))return [{ref:'refs/heads/codex/author-shelves/books/new-book'},{ref:'refs/heads/codex/author-shelves/movies/invalid'}];
    if(route.includes('/trees/'))return {truncated:false,tree:[{type:'blob',path:'src/content/books/new-book.md'}]};
    assert.ok(route.includes('ref=codex%2Fauthor-shelves%2Fbooks%2Fnew-book'));
    return {content:Buffer.from('draft').toString('base64')};
  };
  assert.deepEqual(await api.drafts(),[{path:'src/content/books/new-book.md',raw:'draft',workflow:true}]);
});
test('invalid shelf or photo path is rejected before GitHub writes',async()=>{
  const api=new AuthorAPI({type:'github'});
  api.verify=async()=>assert.fail('must reject before verification');
  await assert.rejects(api.save('src/content/books/../secret.md','raw',{},[],false));
  await assert.rejects(api.save('src/content/books/a.md','raw',{},[{path:'src/content/books/../secret.jpg'}],false));
});

test('draft photos come from the exact workflow branch, including larger GitHub blobs',async()=>{
  const api=new AuthorAPI({type:'github'});api.verify=async()=>{};
  const routes=[];
  api.github=async route=>{routes.push(route);return route.includes('/contents/')?{encoding:'none',sha:'photo',size:2000000}:{encoding:'base64',content:Buffer.from('image').toString('base64')};};
  const photo=await api.readPreviewPhoto('src/content/blog/new-story/index.md','photo.jpg','codex/author/new-story');
  assert.equal(photo.type,'image/jpeg');assert.equal(Buffer.from(photo.content,'base64').toString(),'image');
  assert.match(routes[0],/ref=codex%2Fauthor%2Fnew-story/);assert.match(routes[1],/git\/blobs\/photo/);
});
test('draft photo reads reject traversal, unsafe formats and unrelated branches',async()=>{
  const api=new AuthorAPI({type:'github'});api.verify=async()=>assert.fail('invalid photo must not be read');
  for(const [source,branch] of [['../secret.jpg','main'],['..%2Fsecret.jpg','main'],['https://example.com/a.jpg','main'],['a.svg','main'],['a.jpg','other-branch']])await assert.rejects(api.readPreviewPhoto('src/content/books/book.md',source,branch));
});

test('unpublishing changes draft flag, preserves workflow text and merges exactly saved commit',async()=>{
  const {api,state}=publishingAPI();
  const published={branch:'main',sha:'published',raw:'---\ntitle: Italy\ndraft: false\n---\nPublished text\n'};
  const editing={branch:'codex/author/italian',sha:'old',raw:'---\ntitle: Italy\ndraft: true\n---\nSaved draft text with ![](photo.jpg)\n'};
  api.read=async(_path,main)=>main?published:{...editing,sha:state.sha};
  const result=await api.unpublish(entryPath,published);
  assert.match(state.savedRaw,/draft: true/);
  assert.match(state.savedRaw,/Saved draft text with !\[\]\(photo.jpg\)/);
  assert.equal(result.publication,'withdrawn');
  assert.equal(result.branch,'main');
  assert.equal(state.calls.find(call=>call.route.endsWith('/merges')).body.head,'saved-commit');
  assert.match(state.calls.find(call=>call.route.endsWith('/merges')).body.commit_message,/Снята с публикации/);
  assert.equal(state.hasBranch,false);
});
test('unpublishing refuses stale main and never writes',async()=>{
  const {api,state}=publishingAPI();
  api.read=async()=>({branch:'main',sha:'new',raw:'---\ntitle: Italy\n---\nChanged'});
  await assert.rejects(api.unpublish(entryPath,{branch:'main',sha:'old'}),/Опубликованная запись изменилась/);
  assert.equal(state.calls.length,0);
});
test('unpublishing does not report a failed merge as success and recovers a lost response',async()=>{
  for(const options of [{mergeFails:true},{mergeLost:true}]) {
    const {api,state}=publishingAPI(options);
    const main={branch:'main',sha:'old',raw:'---\ntitle: Italy\ndraft: false\n---\nBody\n'};
    api.read=async()=>({...main,sha:state.sha});
    const result=await api.unpublish(entryPath,main);
    assert.equal(result.publication,options.mergeFails?'pending':'withdrawn');
    if(options.mergeFails)assert.equal(result.action,'unpublish');
  }
});

test('photo upload progress advances only after each GitHub blob succeeds',async()=>{
  const {api,state}=publishingAPI();const progress=[];
  await api.save(entryPath,'post',{sha:'old'},[
    {path:'src/content/blog/italian/first.jpg',content:'YQ=='},
    {path:'src/content/blog/italian/second.png',content:'Yg=='},
  ],false,value=>progress.push(value));
  assert.deepEqual(progress,[{completed:0,total:2},{completed:1,total:2},{completed:2,total:2}]);
  assert.equal(state.calls.filter(call=>call.route.endsWith('/git/blobs')).length,3);
});
