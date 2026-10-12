import { marked } from 'marked';

export function stripCommands(value) {
  return value.replace(/^\.(?:lead|loud|foot)[ \t]*\r?\n/gm, '');
}
function inlineText(tokens = []) {
  return tokens.map(token => {
    if (token.type === 'image' || token.type === 'html') return '';
    if (token.tokens) return inlineText(token.tokens);
    return token.text || (token.type === 'br' ? ' ' : '');
  }).join('');
}
export function postSummary(body, limit = 180) {
  const paragraph = marked.lexer(stripCommands(body || '')).find(token =>
    token.type === 'paragraph' && inlineText(token.tokens).trim() && !/^https?:\/\/\S+$/.test(token.text.trim()));
  const value = inlineText(paragraph?.tokens).replace(/\s+/g, ' ').trim();
  return value.length > limit ? value.slice(0, limit).replace(/\s+\S*$/, '') + '…' : value;
}
export {escapeHTML} from './escape-html.js';
