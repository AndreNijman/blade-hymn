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

// pygame.transform.scale — rescaled onto a new surface with pygame's exact
// per-destination-pixel source sampling (measured empirically per size pair
// in js/scale-maps.json; canvas drawImage rounds differently, which shifts
// the scaled parallax art by a pixel).
import scaleMaps from "./scale-maps.json" with { type: "json" };

export function scale(image, w, h) {
  w = Math.trunc(w);
  h = Math.trunc(h);
  const c = surface(w, h);
  if (w <= 0 || h <= 0 || image.width === 0 || image.height === 0) return c;
  const map = scaleMaps[`${image.width}x${image.height}->${w}x${h}`];
  if (!map) {
    // fallback: centre sampling (close to pygame, exact for the mapped sizes)
    const sctx = image.getContext ? image.getContext("2d") : null;
    const src = sctx ? sctx.getImageData(0, 0, image.width, image.height) : imageDataFromImage(image);
    const out = c.getContext("2d").createImageData(w, h);
    const sd = src.data, od = out.data;
    for (let y = 0; y < h; y++) {
      const sy = Math.trunc((y + 0.5) * image.height / h);
      const srow = sy * image.width * 4;
      for (let x = 0; x < w; x++) {
        const sx = Math.trunc((x + 0.5) * image.width / w) * 4;
        const si = srow + sx;
        const di = (y * w + x) * 4;
        od[di] = sd[si];
        od[di + 1] = sd[si + 1];
        od[di + 2] = sd[si + 2];
        od[di + 3] = sd[si + 3];
      }
    }
    c.getContext("2d").putImageData(out, 0, 0);
    return c;
  }
  const sctx = image.getContext ? image.getContext("2d") : null;
  const src = sctx ? sctx.getImageData(0, 0, image.width, image.height) : imageDataFromImage(image);
  const out = c.getContext("2d").createImageData(w, h);
  const sd = src.data, od = out.data;
  for (let y = 0; y < h; y++) {
    const sy = map.y[y] * image.width * 4;
    for (let x = 0; x < w; x++) {
      const si = sy + map.x[x] * 4;
      const di = (y * w + x) * 4;
      od[di] = sd[si];
      od[di + 1] = sd[si + 1];
      od[di + 2] = sd[si + 2];
      od[di + 3] = sd[si + 3];
    }
  }
  c.getContext("2d").putImageData(out, 0, 0);
  return c;
}

// pygame's per-pixel alpha blend of a white (255,255,255,50) veil over an
// opaque pixel, measured from the original's blit output (SDL's integer
// rasteriser, not plain rounding). Pure per-channel lookup, and stacking the
// veil composes through the same table, so composites are veiled exactly.
import veilLut from "./veil-lut.json" with { type: "json" };

export const VEIL_LUT = Uint8Array.from(veilLut);

export function blendVeil(canvas) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = VEIL_LUT[d[i]];
    d[i + 1] = VEIL_LUT[d[i + 1]];
    d[i + 2] = VEIL_LUT[d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
}

// pygame blend of the (0,0,0,127) dark panel over a pixel — used for the
// pre-composited menu pieces where the backdrop is static.
export function shadeBlend(image) {
  const w = image.width, h = image.height;
  const c = surface(w, h);
  const ctx = c.getContext("2d");
  const src = imageDataOf(image);
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 255) {
      d[i] = (d[i] * 128 + 127) >> 8;
      d[i + 1] = (d[i + 1] * 128 + 127) >> 8;
      d[i + 2] = (d[i + 2] * 128 + 127) >> 8;
    }
  }
  ctx.putImageData(src, 0, 0);
  return c;
}

function imageDataOf(image) {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height);
}

function imageDataFromImage(image) {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height);
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
