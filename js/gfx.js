// Small canvas helpers standing in for pygame.Surface operations.

export function surface(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(0, Math.round(w));
  c.height = Math.max(0, Math.round(h));
  return c;
}

// pygame-style blit: truncates the destination to whole pixels like pygame does
// for float positions, and honours an optional per-surface alpha.
export function blit(ctx, image, x, y, alpha = null) {
  if (!image || image.width === 0 || image.height === 0) return;
  const ax = Math.trunc(x);
  const ay = Math.trunc(y);
  if (alpha !== null && alpha !== undefined) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha / 255)) * ctx.globalAlpha;
    ctx.drawImage(image, ax, ay);
    ctx.restore();
  } else {
    ctx.drawImage(image, ax, ay);
  }
}

// pygame.transform.scale — nearest-neighbour rescale onto a new surface.
export function scale(image, w, h) {
  const c = surface(w, h);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  if (w > 0 && h > 0) ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, w, h);
  return c;
}

// pygame.transform.flip horizontally, cached per source image.
const flipCache = new WeakMap();
export function flip(image) {
  let flipped = flipCache.get(image);
  if (!flipped) {
    flipped = surface(image.width, image.height);
    const ctx = flipped.getContext("2d");
    ctx.translate(image.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0);
    flipCache.set(image, flipped);
  }
  return flipped;
}

// pygame.mask.from_surface(...).to_surface() with set_colorkey('black'):
// a solid white silhouette of the sprite's opaque pixels.
const whiteMaskCache = new WeakMap();
export function whiteMask(image) {
  let masked = whiteMaskCache.get(image);
  if (!masked) {
    masked = surface(image.width, image.height);
    const ctx = masked.getContext("2d");
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, image.width, image.height);
    whiteMaskCache.set(image, masked);
  }
  return masked;
}
