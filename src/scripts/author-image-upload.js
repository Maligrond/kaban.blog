const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export function photoSize(width, height, limit = 2560) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Не удалось прочитать размер фотографии.');
  const scale = Math.min(1, limit / Math.max(width, height));
  return {width:Math.max(1, Math.round(width * scale)), height:Math.max(1, Math.round(height * scale))};
}
export function validatePhoto(file) {
  if (!TYPES.includes(file.type)) throw new Error('Выбери JPG, PNG, WebP или AVIF.');
  if (!file.size || file.size > 40 * 1024 * 1024) throw new Error('Фотография должна быть не больше 40 МБ.');
}
function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось подготовить фотографию.')), type, quality));
}
export async function preparePhoto(file) {
  validatePhoto(file);
  let image;
  let sourceURL;
  const canvas = document.createElement('canvas');
  try {
    if (typeof createImageBitmap === 'function') image = await createImageBitmap(file, {imageOrientation:'from-image'});
    else {
      // Modern image elements also apply EXIF orientation during decoding.
      image = new Image(); sourceURL = URL.createObjectURL(file); image.src = sourceURL;
      await image.decode();
    }
    const width = image.width, height = image.height;
    if (width * height > 80_000_000) throw new Error('Фотография слишком большая. Выбери снимок до 80 мегапикселей.');
    const size = photoSize(width, height);
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не смог подготовить фотографию.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, size.width, size.height);
    // Re-encode pixels even at the original dimensions: never upload EXIF,
    // GPS, XMP or the original file's metadata. PNG screenshots stay lossless.
    const type = file.type === 'image/png' ? 'image/png' : file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    let blob = await canvasBlob(canvas, type, 0.9);
    if (blob.size > 10 * 1024 * 1024 && type === 'image/png') blob = await canvasBlob(canvas, 'image/webp', 0.9);
    if (blob.size > 10 * 1024 * 1024) throw new Error('Не удалось уменьшить фотографию до 10 МБ. Выбери снимок поменьше.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return {blob, content:btoa(binary), extension:blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1], ...size, originalSize:file.size};
  } catch (error) {
    if (error instanceof Error && /^(?:Не удалось|Фотография)/.test(error.message)) throw error;
    throw new Error(`Не удалось открыть «${file.name}». Проверь формат фотографии.`);
  } finally {
    if (image && 'close' in image) image.close();
    if (sourceURL) URL.revokeObjectURL(sourceURL);
    canvas.width = 0; canvas.height = 0;
  }
}
