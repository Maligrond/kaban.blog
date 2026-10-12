export function photoTransform(scale, x, y, width, height) {
  scale = Math.max(1, Math.min(4, scale));
  const maxX = Math.max(0, (width * (scale - 1)) / 2),
    maxY = Math.max(0, (height * (scale - 1)) / 2);
  return {
    scale,
    x: Math.max(-maxX, Math.min(maxX, x)) || 0,
    y: Math.max(-maxY, Math.min(maxY, y)) || 0,
  };
}
export function photoSwipe(dx, dy, duration, scale, pinched = false) {
  if (
    scale > 1.01 ||
    pinched ||
    duration > 650 ||
    Math.abs(dx) < 55 ||
    Math.abs(dx) < Math.abs(dy) * 1.5
  )
    return 0;
  return dx < 0 ? 1 : -1;
}
