import type {APIRoute} from 'astro';
import {getCollection} from 'astro:content';
export const GET:APIRoute=async()=>{
  // Public titles and routes only. This index is fetched lazily by the author's
  // link picker; drafts and post bodies never enter a public search index.
  const [posts,cities,books,games]=await Promise.all([
    getCollection('blog',({data})=>!data.draft),getCollection('countries',({data})=>!data.draft),
    getCollection('books',({data})=>!data.draft),getCollection('games',({data})=>!data.draft),
  ]);
  const entries=[
    ...posts.sort((a,b)=>b.data.date.valueOf()-a.data.date.valueOf()).map(post=>({title:post.data.title,url:`/blog/${post.id}/`,kind:'Пост',detail:(post.data.tags || []).join(', ')})),
    ...cities.map(city=>({title:city.data.title,url:`/countries/${city.id}/`,kind:'Город',detail:city.data.country})),
    ...books.map(book=>({title:book.data.title,url:`/books/${book.id}/`,kind:'Книга',detail:book.data.author})),
    ...games.map(game=>({title:game.data.title,url:`/games/${game.id}/`,kind:'Игра',detail:String(game.data.year)})),
  ];
  return new Response(JSON.stringify(entries),{headers:{'Content-Type':'application/json'}});
};
