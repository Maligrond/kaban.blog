import type { APIRoute } from 'astro';
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

// Existing Markdown uses images relative to its own directory.
// Give the CMS the same optimized assets as the static site.
const images = import.meta.glob<ImageMetadata>('/src/content/blog/**/*.{png,jpg,jpeg,webp,avif}', { eager: true, import: 'default' });
export const GET: APIRoute = async () => {
  const entries = await Promise.all(Object.entries(images).map(async ([path, image]) => {
    const optimized = await getImage({ src: image, width: Math.min(image.width, 1600), format: 'webp' });
    return [path.replace(/^\//, ''), optimized.src];
  }));
  return new Response(JSON.stringify(Object.fromEntries(entries)), { headers: { 'Content-Type': 'application/json' } });
};
