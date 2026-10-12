import type {APIRoute, ImageMetadata} from 'astro';
import {getCollection} from 'astro:content';
import {getImage} from 'astro:assets';
const images=import.meta.glob<ImageMetadata>('/src/content/blog/**/*.{jpg,jpeg,png,webp,avif}',{eager:true,import:'default'});
export const GET:APIRoute=async()=>{
  // This file contains only already public recommendations, never draft text.
  const published=(await getCollection('blog')).filter(post=>!post.data.draft);
  const posts=await Promise.all(published.map(async post=>{
    const match=post.body?.match(/!\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))/);
    const source=match?.[1] || match?.[2];
    let image=post.data.cover;
    if(!post.data.coverDisabled && !image && source && !/^(?:[a-z]+:|\/)/i.test(source)) {
      try {image=images[decodeURIComponent(new URL(source,`https://local.invalid/src/content/blog/${post.id}/`).pathname)];} catch { /* No thumbnail. */ }
    }
    const photo=post.data.coverDisabled ? undefined : image ? (await getImage({src:image,width:Math.min(image.width,800),format:'webp'})).src : post.data.previewImage;
    return {id:post.id,title:post.data.title,description:post.data.excerpt || post.data.description,tags:post.data.tags || [],date:post.data.date.toISOString(),photo};
  }));
  const cities=(await getCollection('countries')).filter(city=>!city.data.draft).map(city=>({id:city.id,title:city.data.title}));
  return new Response(JSON.stringify({posts,cities}),{headers:{'Content-Type':'application/json'}});
};
