// Software pygame.Surface. Pixels are RGBA packed little-endian into a
// Uint32Array (the byte order ImageData uses), and every operation follows
// pygame-ce/SDL's integer arithmetic, so frames match the original exactly.

const OPAQUE = 0xff000000;

const NAMED = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], blue: [0, 0, 255], yellow: [255, 255, 0] };

export function rgba(color) {
  let r, g, b, a = 255;
  if (typeof color === "string") {
    if (color[0] === "#") {
      const n = parseInt(color.slice(1), 16);
      [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } else {
      [r, g, b] = NAMED[color];
    }
  } else {
    [r, g, b, a = 255] = color;
  }
  return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
}

export class Surface {
  // srcalpha: pygame.SRCALPHA. Surfaces filled with one colour and never
  // drawn into keep only that colour (`uniform`), and allocate lazily.
  constructor(w, h, srcalpha = false) {
    this.width = Math.max(0, Math.trunc(w));
    this.height = Math.max(0, Math.trunc(h));
    this.srcalpha = srcalpha;
    this.alpha = 255;          // set_alpha
    this.colorkey = null;      // RGB of set_colorkey
    this.uniform = srcalpha ? 0 : OPAQUE;
    this._px = null;
    this.opaque = false;       // every pixel alpha 255 (immutable images only)
  }

  get px() {
    if (!this._px) {
      this._px = new Uint32Array(this.width * this.height);
      if (this.uniform) this._px.fill(this.uniform);
    }
    this.uniform = null;
    return this._px;
  }

  get_width() { return this.width; }
  get_height() { return this.height; }

  fill(color) {
    let c = rgba(color);
    if (!this.srcalpha) c = (c | OPAQUE) >>> 0;
    this._px = null;
    this.uniform = c;
  }

  // pygame-ce: int() then clamp
  set_alpha(value) {
    this.alpha = Math.min(255, Math.max(0, Math.trunc(value)));
  }

  get_alpha() {
    return this.alpha;
  }

  set_colorkey(color) {
    this.colorkey = rgba(color) & 0xffffff;
  }

  // Surface.blit with a float destination: pygame truncates toward zero.
  blit(src, x, y) {
    x = Math.trunc(x);
    y = Math.trunc(y);
    const sw = src.width, sh = src.height;
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + sw), y1 = Math.min(this.height, y + sh);
    if (x0 >= x1 || y0 >= y1 || src.alpha === 0) return;
    if (this.srcalpha) return blitOntoAlpha(this, src, x, y, x0, y0, x1, y1);

    const dst = this.px, dw = this.width;
    // a single colour (veils, fades, panels): one lookup table per channel
    if (src.uniform !== null && src.colorkey === null) {
      const c = src.uniform;
      let a = c >>> 24;
      if (src.alpha !== 255) a = ((a * src.alpha) / 255) | 0;
      if (a === 0) return;
      const lut = blendTable(c & 255, (c >>> 8) & 255, (c >>> 16) & 255, a);
      for (let row = y0; row < y1; row++) {
        for (let i = row * dw + x0, end = row * dw + x1; i < end; i++) {
          const d = dst[i];
          dst[i] = (lut[d & 255] | (lut[256 + ((d >>> 8) & 255)] << 8) | (lut[512 + ((d >>> 16) & 255)] << 16) | OPAQUE) >>> 0;
        }
      }
      return;
    }

    const sp = src.px;
    if (src.opaque && src.alpha === 255 && src.colorkey === null) {
      for (let row = y0; row < y1; row++) {
        const s = (row - y) * sw + (x0 - x);
        dst.set(sp.subarray(s, s + (x1 - x0)), row * dw + x0);
      }
      return;
    }

    const key = src.colorkey, mod = src.alpha;
    for (let row = y0; row < y1; row++) {
      let si = (row - y) * sw + (x0 - x);
      for (let i = row * dw + x0, end = row * dw + x1; i < end; i++, si++) {
        const p = sp[si];
        let a = p >>> 24;
        if (a === 0 || (key !== null && (p & 0xffffff) === key)) continue;
        if (mod !== 255) a = ((a * mod) / 255) | 0;
        if (a === 255) {
          dst[i] = p;
        } else if (a !== 0) {
          dst[i] = (blendRGB(p, dst[i], a) | OPAQUE) >>> 0;
        }
      }
    }
  }
}

// pygame's ALPHA_BLEND_COMP: dC + (((sC - dC) * sA + sC) >> 8)
function blendRGB(s, d, a) {
  const sr = s & 255, sg = (s >>> 8) & 255, sb = (s >>> 16) & 255;
  const dr = d & 255, dg = (d >>> 8) & 255, db = (d >>> 16) & 255;
  return (dr + (((sr - dr) * a + sr) >> 8)) |
    ((dg + (((sg - dg) * a + sg) >> 8)) << 8) |
    ((db + (((sb - db) * a + sb) >> 8)) << 16);
}

const tables = new Map();
function blendTable(r, g, b, a) {
  const k = r | (g << 8) | (b << 16) | (a << 24);
  let lut = tables.get(k);
  if (!lut) {
    lut = new Uint8Array(768);
    for (let d = 0; d < 256; d++) {
      lut[d] = d + (((r - d) * a + r) >> 8);
      lut[256 + d] = d + (((g - d) * a + g) >> 8);
      lut[512 + d] = d + (((b - d) * a + b) >> 8);
    }
    tables.set(k, lut);
  }
  return lut;
}

// SRCALPHA destination (HealthBar / Counter composition): pygame's
// ALPHA_BLEND, which also accumulates the destination alpha.
function blitOntoAlpha(dstSurf, src, x, y, x0, y0, x1, y1) {
  const dst = dstSurf.px, dw = dstSurf.width, sp = src.px, sw = src.width;
  const key = src.colorkey;
  for (let row = y0; row < y1; row++) {
    let si = (row - y) * sw + (x0 - x);
    for (let i = row * dw + x0, end = row * dw + x1; i < end; i++, si++) {
      const p = sp[si];
      if (key !== null && (p & 0xffffff) === key) continue;
      const d = dst[i];
      const da = d >>> 24;
      let sa = p >>> 24;
      if (src.alpha !== 255) sa = ((sa * src.alpha) / 255) | 0;
      if (da === 0) {
        dst[i] = ((p & 0xffffff) | (sa << 24)) >>> 0;
      } else {
        const a = sa + da - (((sa * da) / 255) | 0);
        dst[i] = (blendRGB(p, d, sa) | (a << 24)) >>> 0;
      }
    }
  }
}

// pygame.draw.rect(surface, colour, rect) for a filled rect on an opaque
// surface; float coordinates are truncated.
export function drawRect(surface, color, x, y, w, h) {
  x = Math.trunc(x); y = Math.trunc(y); w = Math.trunc(w); h = Math.trunc(h);
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(surface.width, x + w), y1 = Math.min(surface.height, y + h);
  if (x0 >= x1 || y0 >= y1) return;
  const c = (rgba(color) | OPAQUE) >>> 0, px = surface.px;
  for (let row = y0; row < y1; row++) px.fill(c, row * surface.width + x0, row * surface.width + x1);
}

// pygame.transform.scale: nearest neighbour sampling the source at
// ((inc >> 1) + i * inc) >> 16 with inc = (src << 16) / dst, sizes truncated.
export function scale(src, w, h) {
  const out = new Surface(w, h, src.srcalpha);
  const dw = out.width, dh = out.height;
  if (dw === 0 || dh === 0 || src.width === 0 || src.height === 0) return out;
  const xs = stretchMap(src.width, dw), ys = stretchMap(src.height, dh);
  const sp = src.px, op = out.px, sw = src.width;
  for (let row = 0; row < dh; row++) {
    const s = ys[row] * sw, o = row * dw;
    for (let col = 0; col < dw; col++) op[o + col] = sp[s + xs[col]];
  }
  out.colorkey = src.colorkey;
  out.opaque = src.opaque;
  return out;
}

function stretchMap(srcSize, dstSize) {
  const inc = Math.floor((srcSize * 65536) / dstSize);
  const map = new Int32Array(dstSize);
  for (let i = 0; i < dstSize; i++) map[i] = Math.floor(((inc >> 1) + i * inc) / 65536);
  return map;
}

// pygame.transform.flip(image, True, False). Atlas images are never drawn
// into, so the flipped copy is cached rather than rebuilt every frame.
const flipped = new WeakMap();
export function flipX(src) {
  let out = flipped.get(src);
  if (!out) {
    out = new Surface(src.width, src.height, src.srcalpha);
    const sp = src.px, op = out.px, w = src.width;
    for (let row = 0; row < src.height; row++) {
      for (let col = 0; col < w; col++) op[row * w + col] = sp[row * w + (w - 1 - col)];
    }
    out.opaque = src.opaque;
    flipped.set(src, out);
  }
  return out;
}

// mask.from_surface(image).to_surface() with set_colorkey('black'): white
// where alpha > 127, transparent elsewhere.
const masks = new WeakMap();
export function whiteSilhouette(src) {
  let out = masks.get(src);
  if (!out) {
    out = new Surface(src.width, src.height, true);
    const sp = src.px, op = out.px;
    for (let i = 0; i < sp.length; i++) op[i] = (sp[i] >>> 24) > 127 ? 0xffffffff : 0;
    masks.set(src, out);
  }
  return out;
}

// The baked atlas is an RGBA8 PNG decoded here byte-exactly: decoding via an
// <img> and a canvas would premultiply alpha and lose the translucent
// background pixels.
export async function loadAtlas(url, rects) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const view = new DataView(bytes.buffer);
  let pos = 8, width = 0, height = 0;
  const idat = [];
  while (pos < bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const body = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error("atlas must be non-interlaced RGBA8");
    } else if (type === "IDAT") {
      idat.push(body);
    }
    pos += 12 + len;
  }
  const stream = new Blob(idat).stream().pipeThrough(new DecompressionStream("deflate"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());

  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  for (let row = 0; row < height; row++) {
    const ftype = raw[row * (stride + 1)];
    const line = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const out = row * stride, prev = out - stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? pixels[out + i - 4] : 0;
      const b = row ? pixels[prev + i] : 0;
      const c = row && i >= 4 ? pixels[prev + i - 4] : 0;
      let p = 0;
      if (ftype === 1) p = a;
      else if (ftype === 2) p = b;
      else if (ftype === 3) p = (a + b) >> 1;
      else if (ftype === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[out + i] = (line[i] + p) & 255;
    }
  }

  const atlas = new Uint32Array(pixels.buffer);
  return rects.map(([ax, ay, w, h]) => {
    const s = new Surface(w, h, true);
    const px = s.px;
    let opaque = true;
    for (let row = 0; row < h; row++) {
      px.set(atlas.subarray((ay + row) * width + ax, (ay + row) * width + ax + w), row * w);
    }
    for (let i = 0; i < px.length && opaque; i++) opaque = px[i] >>> 24 === 255;
    s.opaque = opaque;
    return s;
  });
}
