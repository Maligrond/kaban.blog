import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { postSocialPhoto,renderSocialCard } from '../../lib/social-cards.js';
import { SITE } from '../../consts';

export async function getStaticPaths(){
  const posts=await getCollection('blog',({data})=>!data.draft);
  return [
    {params:{slug:'site'},props:{title:SITE.TITLE,description:SITE.DESCRIPTION}},
    ...posts.map(post=>({params:{slug:`blog/${post.id}`},props:{title:post.data.title,description:post.data.excerpt || post.data.description,post}})),
  ];
}

export const GET:APIRoute=async({props})=>{
  const photo=props.post?await postSocialPhoto(props.post):undefined;
  const image=await renderSocialCard({title:props.title,description:props.description,photo});
  return new Response(new Uint8Array(image),{headers:{'Content-Type':'image/jpeg'}});
};
