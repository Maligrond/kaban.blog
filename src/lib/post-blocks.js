import { escapeHTML } from './post-text.js';
// Shared by the static Markdown renderer and the author's preview. Fenced
// code examples are left alone; unmatched blocks stay visible as plain text.
export function preparePostBlocks(source) {
  const lines=source.split('\n');
  let fence=null;
  const stack=[];
  const replacements=new Map();
  for(let i=0;i<lines.length;i++){
    const code=lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
    if(code){if(!fence)fence=code[1];else if(code[1][0]===fence[0]&&code[1].length>=fence.length)fence=null;continue;}
    if(fence||/^ {4}|^\t/.test(lines[i]))continue;
    const open=lines[i].match(/^:::details(?:[ \t]+(.+))?\s*$/);
    if(open)stack.push({index:i,label:open[1]||'Подробнее'});
    else if(/^:::\s*$/.test(lines[i])&&stack.length){const opening=stack.pop();replacements.set(opening.index,`<details class="post-disclosure">\n<summary>${escapeHTML(opening.label)}</summary>\n\n`);replacements.set(i,'\n</details>\n');}
  }
  return lines.map((line,index)=>replacements.get(index)??line).join('\n');
}
