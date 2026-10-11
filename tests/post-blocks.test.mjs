import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {preparePostBlocks} from '../src/lib/post-blocks.js';
import {renderPostPreview} from '../src/lib/post-preview.js';
import {postProcessor} from '../src/lib/post-processor.js';
import {standaloneLink,linkCardHTML} from '../src/lib/link-card.js';
import {extractMetadata,publicAddress} from '../src/lib/link-previews.js';
const render=async source=>(await (await postProcessor().createRenderer({syntaxHighlight:false})).render(source)).code;
test('details render Markdown in both the build and preview; labels cannot inject HTML',async()=>{
  const source=':::details <img onerror="alert(1)">\n\n**Внутри**\n\n:::';
  for(const html of [await render(source),renderPostPreview(source)]){
    const {document}=parseHTML(html);
    assert.equal(document.querySelector('details summary').textContent,'<img onerror="alert(1)">');
    assert.equal(document.querySelector('details strong').textContent,'Внутри');
    assert.equal(document.querySelector('img'),null);
  }
});
test('code examples and unmatched disclosure delimiters stay unchanged',()=>{
  const source='```markdown\n:::details Пример\n\nТекст\n\n:::\n```\n\n:::details Без конца';
  assert.equal(preparePostBlocks(source),source);
});
test('nested disclosures remain balanced',async()=>{
  const {document}=parseHTML(await render(':::details Один\n\n:::details Два\n\nТекст\n\n:::\n\n:::'));
  assert.equal(document.querySelectorAll('details').length,2);
  assert.equal(document.querySelectorAll('details details').length,1);
});
test('repeated footnotes have distinct return destinations in build and preview',async()=>{
  const source='Один[^n] два[^n].\n\n[^n]: Пояснение.';
  for(const html of [await render(source),renderPostPreview(source)]){
    const {document}=parseHTML(html);
    const refs=[...document.querySelectorAll('[data-footnote-ref]')];
    assert.equal(refs.length,2);
    assert.equal(new Set(refs.map(ref=>ref.id)).size,2);
    for(const ref of refs)assert.ok(document.getElementById(ref.getAttribute('href').slice(1)));
    for(const ref of document.querySelectorAll('[data-footnote-backref]'))assert.ok(document.getElementById(ref.getAttribute('href').slice(1)));
    assert.equal(document.querySelector('#footnote-label').textContent,'Примечания');
  }
});
test('only standalone HTTP links become cards; named links and video links stay alone',()=>{
  const node=(href,text=href)=>({tagName:'p',children:[{tagName:'a',properties:{href},children:[{type:'text',value:text}]}]});
  assert.equal(standaloneLink(node('https://example.com')),'https://example.com/');
  assert.equal(standaloneLink(node('https://example.com','Пример')),null);
  assert.equal(standaloneLink(node('javascript:alert(1)')),null);
  assert.equal(standaloneLink(node('https://youtu.be/abcdefghijk')),null);
  const {document}=parseHTML(linkCardHTML('https://example.com/',{title:'<script>x</script>',description:'<img src=x>'}));
  assert.equal(document.querySelector('script,img'),null);
});
test('metadata falls back to HTML title; missing or unsafe images stay absent',()=>{
  assert.deepEqual(extractMetadata('<title> Пример </title><meta name="description" content="Текст">','https://example.com/'),{title:'Пример',description:'Текст',image:null});
  assert.equal(extractMetadata('<meta property="og:image" content="https://127.0.0.1/a.jpg">','https://example.com/').image,null);
  assert.equal(extractMetadata('<meta property="og:image" content="/cover.jpg">','https://example.com/').image,'https://example.com/cover.jpg');
});
test('private addresses are blocked and unavailable metadata does not break rendering',async()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','192.168.1.1','169.254.1.1','172.16.1.1','::1','fe80::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false);
  assert.equal(publicAddress('93.184.216.34'),true);
  assert.match(await render('https://127.0.0.1/'),/class="post-link-card"/);
});
