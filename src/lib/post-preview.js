import { Marked } from 'marked';
import markedFootnote from 'marked-footnote';
import { preparePostBlocks } from './post-blocks.js';
const parser=new Marked().use(markedFootnote({description:'Примечания',backRefLabel:'Вернуться к тексту'}));
export function renderPostPreview(source){return parser.parse(preparePostBlocks(source),{async:false});}
