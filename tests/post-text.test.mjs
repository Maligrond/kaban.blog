import test from 'node:test';
import assert from 'node:assert/strict';
import { postSummary, escapeHTML } from '../src/lib/post-text.js';
import { markdownToHtml } from 'satteri';
import { postFormat } from '../src/lib/post-format.js';
test('automatic descriptions use prose rather than headings, photos, lists or commands',()=>{
  const markdown='# Title\n\n![Lake](lake.jpg "Lake")\n\n- one\n- two\n\n.lead\nFirst **real** paragraph with [a link](https://example.org).\n\nNext paragraph.';
  assert.equal(postSummary(markdown),'First real paragraph with a link.');
  assert.equal(postSummary('![Only photo](photo.jpg)'), '');
});
test('descriptions contain no raw HTML and search HTML is escaped',()=>{
  assert.equal(postSummary('.foot\nHello <script>danger()</script> world.'),'Hello danger() world.');
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('formatting commands are resolved at build time without losing inline formatting',()=>{
  const {html}=markdownToHtml('.lead\nFirst **word**.\n\n```text\n.lead\nExample\n```',{mdastPlugins:[postFormat]});
  assert.match(html, /<p class="post-lead">First <strong>word<\/strong>\.<\/p>/);
  assert.match(html, /\.lead\nExample/);
});
