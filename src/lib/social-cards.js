import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { parseDocument } from 'yaml';
import { markdownPhotos } from '../scripts/author-photos.js';
import { postSummary } from './post-text.js';

export const socialCardSize = { width:1200, height:630 };
const require=createRequire(import.meta.url);
const root=process.cwd();
const paper='#fffefa', ink='#24221f', muted='#77716a', accent='#a94731';
const element=(type,style,children,props={})=>({type,props:{style,...props,children}});
let resources;
function loadResources(){
  resources ??= Promise.all([
    readFile(resolve(root,'public/android-chrome-192x192.png')),
    ...['latin','cyrillic','cyrillic-ext'].flatMap(subset=>[400,700].map(async weight=>({
      name:`PT Sans ${subset}`,weight,style:'normal',
      data:await readFile(require.resolve(`@fontsource/pt-sans/files/pt-sans-${subset}-${weight}-normal.woff`)),
    }))),
  ]).then(([logo,...fonts])=>({logo:`data:image/png;base64,${logo.toString('base64')}`,fonts}));
  return resources;
}

// Only local image files may be read. External sources fall back to a text card,
// keeping builds independent of third-party image hosts.
export function localSocialPhoto(source,sourceFile,projectRoot=root){
  if(typeof source!=='string' || !source || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(source))return;
  let decoded;
  try {decoded=decodeURIComponent(source.split(/[?#]/)[0]);}catch{return;}
  const file=source.startsWith('/')?resolve(projectRoot,'public',`.${decoded}`):resolve(dirname(sourceFile),decoded);
  const allowed=['src/content','src/images','public'].some(folder=>{
    const path=relative(resolve(projectRoot,folder),file);
    return path!== '..' && !path.startsWith('..'+sep) && !isAbsolute(path);
  });
  if(allowed && /\.(?:png|jpe?g|webp|avif)$/i.test(file))return file;
}

export async function postSocialPhoto(post,projectRoot=root){
  if(post.data.coverDisabled)return;
  const sourceFile=resolve(projectRoot,post.filePath || `src/content/blog/${post.id}/index.md`);
  const raw=await readFile(sourceFile,'utf8');
  const frontmatter=parseDocument(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '{}');
  const firstPhoto=markdownPhotos(post.body || '')[0]?.src;
  const candidates=[frontmatter.get('cover'),frontmatter.get('previewImage'),firstPhoto];
  for(const source of candidates){
    const file=localSocialPhoto(source,sourceFile,projectRoot);
    if(!file)continue;
    try {
      const metadata=await sharp(file).metadata();
      // Portrait covers (e.g. books) remain uncropped; scenery fills its frame.
      return await sharp(file).rotate().resize(480,430,{fit:metadata.width<metadata.height?'contain':'cover',background:paper,position:'attention'})
        .flatten({background:paper}).jpeg({quality:90}).toBuffer();
    }catch { /* Try the next local photo, then render a text card. */ }
  }
}

export async function renderSocialCard({title,description='',photo}){
  const {logo,fonts}=await loadResources();
  const heading=postSummary(title,180) || 'Блог Кабана';
  const subtitle=postSummary(description,photo?110:160);
  const fontSize=photo?(heading.length>85?42:heading.length>50?50:60):(heading.length>110?52:heading.length>65?64:76);
  const header=element('div',{position:'absolute',left:64,top:42,display:'flex',alignItems:'center',gap:12},[
    element('img',{width:48,height:48},undefined,{src:logo}),
    element('div',{display:'flex',fontSize:30,fontWeight:700},['Кабан',element('span',{color:accent},'.')]),
  ]);
  const copy=element('div',{display:'flex',flexDirection:'column',justifyContent:'center',width:photo?544:1072},[
    element('div',{fontSize,fontWeight:700,lineHeight:1.08,letterSpacing:'-0.025em',lineClamp:4,overflow:'hidden',wordBreak:'break-word'},heading),
    ...(subtitle?[element('div',{color:muted,fontSize:25,lineHeight:1.3,marginTop:22,lineClamp:2,overflow:'hidden'},subtitle)]:[]),
  ]);
  const tree=element('div',{...socialCardSize,position:'relative',display:'flex',fontFamily:'PT Sans cyrillic, PT Sans latin, PT Sans cyrillic-ext',backgroundColor:paper,color:ink},[
    header,
    element('div',{position:'absolute',left:64,top:117,width:1072,height:430,display:'flex',alignItems:'center',justifyContent:'space-between',gap:40},[
      copy,
      ...(photo?[element('img',{width:480,height:430},undefined,{src:`data:image/jpeg;base64,${photo.toString('base64')}`})]:[]),
    ]),
    element('div',{position:'absolute',left:64,top:567,width:1072,display:'flex',borderTop:'1px solid #d9d5cd',paddingTop:14,fontSize:22,color:muted},'kaban.blog'),
  ]);
  const svg=await satori(tree,{...socialCardSize,fonts});
  return sharp(Buffer.from(svg)).jpeg({quality:90,mozjpeg:true}).toBuffer();
}
