export function publicationAddress(collection, slug) {
  const route = collection === 'pages' ? 'now' : collection;
  return `https://kaban.blog/${route}/${collection === 'pages' ? '' : encodeURIComponent(slug) + '/'}`;
}

// Bound both fetching a private draft file and decoding the image. A stalled
// remote host should leave the editor usable and never start publication.
export async function checkPublicationPhoto(resolveSource, timeout = 10000) {
  let timer;
  let photo;
  try {
    return await Promise.race([
      (async () => {
        const src = await resolveSource();
        if (!src) return false;
        return new Promise(resolve => {
          photo = new Image();
          photo.onload = () => resolve(photo.naturalWidth > 0);
          photo.onerror = () => resolve(false);
          photo.src = src;
        });
      })(),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), timeout); }),
    ]);
  } catch { return false; }
  finally {
    clearTimeout(timer);
    if (photo) { photo.onload = null; photo.onerror = null; }
  }
}
