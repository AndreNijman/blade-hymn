// pygame.font.Font(PixelifySans.ttf, size).render(line, False, "black").
// Every line the game shows with the default binds was baked by SDL_ttf
// itself (tools/bake.py). Other lines (rebound key names) are laid out from
// baked glyphs, advances and kerning pairs.

import { Surface } from "./surface.js";

let fonts = null, images = null;

export function initFonts(textData, atlasImages) {
  fonts = textData;
  images = atlasImages;
}

export class Font {
  constructor(size) {
    this.data = fonts[size];
    this.cache = new Map();
  }

  render(line) {
    let surf = this.cache.get(line);
    if (!surf) {
      const baked = this.data.lines[line];
      surf = baked ? image(baked[0], baked[1], this.data.height) : this.layout(line);
      this.cache.set(line, surf);
    }
    return surf;
  }

  layout(line) {
    const { glyphs, kern, height } = this.data;
    const chars = [...line].map((c) => (glyphs[c] ? c : "?"));
    let width = 0;
    chars.forEach((c, i) => {
      width += glyphs[c][1] + (i + 1 < chars.length ? kern[c + chars[i + 1]] || 0 : 0);
    });
    const surf = new Surface(width, height, true);
    let x = 0;
    chars.forEach((c, i) => {
      if (glyphs[c][0] !== null) surf.blit(images[glyphs[c][0]], x, 0);
      x += glyphs[c][1] + (i + 1 < chars.length ? kern[c + chars[i + 1]] || 0 : 0);
    });
    return surf;
  }
}

function image(id, width, height) {
  return id === null ? new Surface(width, height, true) : images[id];
}
