import type {APIRoute} from 'astro';
import {getCollection} from 'astro:content';
import {marked} from 'marked';
import {linkMetadata} from '../../lib/link-previews.js';
import {standaloneLink} from '../../lib/link-card.js';
import {preparePostBlocks} from '../../lib/post-blocks.js';
export const GET:APIRoute=async()=>{
  const posts=(await getCollection('blog')).filter(post=>!post.data.draft);
  const pages=(await getCollection('pages')).filter(page=>!page.data.draft);
  const urls=new Set<string>();
  for(const entry of [...posts,...pages])marked.walkTokens(marked.lexer(preparePostBlocks(entry.body||'')),token=>{
    if(token.type!=='paragraph'||token.tokens?.length!==1||token.tokens[0].type!=='link')return;
    const link=token.tokens[0];
    const url=standaloneLink({tagName:'p',children:[{tagName:'a',properties:{href:link.href},children:[{type:'text',value:link.text}]}]});
    if(url)urls.add(url);
  });
  const data=Object.fromEntries(await Promise.all([...urls].map(async url=>[url,await linkMetadata(url)])));
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
