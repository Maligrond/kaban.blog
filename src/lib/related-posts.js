/**
 * @template {{id:string,tags?:string[],date:string}} T
 * @param {string} currentId
 * @param {string[]} currentTags
 * @param {T[]} posts
 * @returns {T[]}
 */
export function relatedPostsFor(currentId, currentTags, posts) {
  const tags = new Set(currentTags.map(tag=>tag.trim().toLocaleLowerCase('ru')));
  return posts.filter(post=>post.id!==currentId)
    .map(post=>({post,score:(post.tags || []).filter(tag=>tags.has(tag.trim().toLocaleLowerCase('ru'))).length}))
    .filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score || new Date(b.post.date)-new Date(a.post.date) || a.post.id.localeCompare(b.post.id))
    .slice(0,4).map(item=>item.post);
}
