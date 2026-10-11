import { satteri } from '@astrojs/markdown-satteri';
import { postFormat } from './post-format.js';
import { preparePostBlocks } from './post-blocks.js';
import { linkCards } from './link-previews.js';
export function postProcessor(){
  const processor=satteri({mdastPlugins:[postFormat],hastPlugins:[linkCards,footnoteLabels]});
  const createRenderer=processor.createRenderer;
  processor.createRenderer=async shared=>{
    const renderer=await createRenderer(shared);
    const render=renderer.render;
    renderer.render=(content,options)=>render(preparePostBlocks(content),options);
    return renderer;
  };
  return processor;
}

const footnoteLabels={name:'russian-footnotes',element:{filter:['h2','a'],visit(node,context){
  if(node.tagName==='h2'&&node.properties?.id==='footnote-label') context.setProperty(node,'children',[{type:'text',value:'Примечания'}]);
  if(node.tagName==='a'&&('dataFootnoteBackref' in (node.properties||{})||'data-footnote-backref' in (node.properties||{}))) context.setProperty(node,'ariaLabel','Вернуться к тексту');
}}};
