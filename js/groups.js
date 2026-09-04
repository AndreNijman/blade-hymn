// Ported from code/groups.py of Eason-F/Blade-Hymn.

import { GAME_WIDTH, GAME_HEIGHT } from "./constants.js";
import { surface, blit, scale, blendVeil } from "./gfx.js";

// Base sprite container preserving pygame.Group semantics: insertion order,
// add/remove/empty/update, sprites know their groups.
export class Group {
  constructor() {
    this.spritesList = [];
    this.isDamageGroup = false;
  }

  add(sprite) {
    if (!this.spritesList.includes(sprite)) {
      this.spritesList.push(sprite);
      sprite._added(this);
    }
  }

  // pygame Group.update: only sprites that define update() are called.
  update(...args) {
    for (const sprite of [...this.spritesList]) {
      if (typeof sprite.update === "function") sprite.update(...args);
    }
  }

  remove(sprite) {
    const i = this.spritesList.indexOf(sprite);
    if (i >= 0) {
      this.spritesList.splice(i, 1);
      sprite._removed(this);
    }
  }

  get length() {
    return this.spritesList.length;
  }

  *[Symbol.iterator]() {
    yield* this.spritesList;
  }

  get sprites() {
    return this.spritesList;
  }

  empty() {
    for (const s of [...this.spritesList]) this.remove(s);
  }

  has(sprite) {
    return this.spritesList.includes(sprite);
  }
}

export class CameraLockedSprites extends Group {
  constructor(width, height) {
    super();
    this.offset = { x: 0, y: 0 };
    this.width = width;
    this.height = height;
  }

  handle_offset(target_pos) {
    this.offset.x = -(target_pos[0] - GAME_WIDTH / 2);
    this.offset.y = -(target_pos[1] - GAME_HEIGHT / 2);
  }

  camera_constraint() {
    this.offset.x = this.offset.x < 0 ? this.offset.x : 0;
    this.offset.x = this.offset.x > -this.width + GAME_WIDTH ? this.offset.x : -this.width + GAME_WIDTH;
    this.offset.y = this.offset.y > -this.height + GAME_HEIGHT ? this.offset.y : -this.height + GAME_HEIGHT;
  }

  update_offset(target_pos) {
    this.handle_offset(target_pos);
    this.camera_constraint();
  }
}

export class AllSprites extends CameraLockedSprites {
  constructor(width, height, bg_tiles, colour) {
    super(width, height);
    this.bg_tiles = bg_tiles.map((tile) => scale(tile, GAME_WIDTH, GAME_HEIGHT));
    this.colour = colour;
    this.tile_width = GAME_WIDTH;
    this.tiles = 5;
  }

  draw_bg(ctx) {
    const { x, y } = this.offset;
    for (let tile = 0; tile < this.tiles; tile++) {
      for (let i = 0; i < this.bg_tiles.length; i++) {
        blit(ctx, this.bg_tiles[i],
          this.tile_width * tile + (x * (i / 25)),
          (y * (i / 25)) - 5);
      }
    }

    const bottom = (y * ((this.bg_tiles.length - 1) / 25)) - 5 + GAME_HEIGHT;
    ctx.fillStyle = this.colour;
    ctx.fillRect(0, bottom, GAME_WIDTH, GAME_HEIGHT);
    // the original's desaturate_surf veil over the composed backdrop
    blendVeil(ctx.canvas);
  }

  draw(ctx, target_pos) {
    this.update_offset(target_pos);
    this.draw_bg(ctx);
    const sorted = [...this.spritesList].sort((a, b) => a.z - b.z);
    for (const sprite of sorted) {
      if (sprite.customDraw) {
        sprite.draw(ctx, [this.offset.x, this.offset.y]);
      } else {
        blit(ctx, sprite.image, sprite.rect.x + this.offset.x, sprite.rect.y + this.offset.y, sprite.alpha);
      }
    }
  }
}

export class TextSprites extends CameraLockedSprites {
  constructor(width, height) {
    super(width, height);
  }

  draw(ctx, target_pos) {
    this.update_offset(target_pos);
    for (const sprite of this) {
      sprite.draw(ctx, [this.offset.x, this.offset.y]);
    }
  }
}

export class HitboxSprites extends CameraLockedSprites {
  constructor(width, height) {
    super(width, height);
    this.isDamageGroup = true;
  }

  // pygame Group.empty() removes everything; the game overrides it for the
  // damage group so sustained sprites (arrows) survive between frames.
  empty() {
    for (const s of [...this.spritesList]) {
      if (!s.sustained) this.remove(s);
    }
  }

  draw(ctx, target_pos) {
    this.update_offset(target_pos);
    for (const sprite of this) {
      if (sprite.visible) {
        blit(ctx, sprite.image, sprite.rect.x + this.offset.x, sprite.rect.y + this.offset.y, sprite.alpha);
      }
    }
  }
}

// AttackingSprites.update(): calls update_hitboxes on every member and reports
// whether any produced a freeze frame (unused by the original).
export class AttackingSprites extends Group {
  update() {
    let freeze = false;
    for (const sprite of this) {
      if (sprite.update_hitboxes()) freeze = true;
    }
    return freeze;
  }
}

export class UISprites extends Group {
  draw(ctx) {
    for (const sprite of this) {
      if (sprite.visible) {
        blit(ctx, sprite.image, sprite.rect.x, sprite.rect.y, sprite.alpha);
      }
    }
  }
}

export class MenuSprites extends Group {
  draw(ctx) {
    const sorted = [...this.spritesList].sort((a, b) => a.z - b.z);
    for (const sprite of sorted) {
      blit(ctx, sprite.image, sprite.rect.x, sprite.rect.y, sprite.alpha);
    }
  }
}

// Menu parallax: reacts to the mouse position, each layer moving at z/50.
// pygame blits the desaturate veil after every layer, so the composite is
// rebuilt (with the exact veil LUT) whenever the parallax offset changes.
export class ParallaxSprites extends CameraLockedSprites {
  constructor() {
    super(GAME_WIDTH, GAME_HEIGHT);
    this.tile_width = GAME_WIDTH;
    this.composite = surface(GAME_WIDTH, GAME_HEIGHT);
    this.lastOffset = null;
    this.dirty = true;
  }

  invalidate() {
    this.dirty = true;
  }

  draw(ctx, target_pos) {
    this.handle_offset(target_pos);
    const key = `${this.offset.x}|${this.offset.y}|${this.dirty}`;
    if (this.lastOffset !== key) {
      const cctx = this.composite.getContext("2d");
      cctx.fillStyle = "#000000"; // pygame's MASTER_DISPLAY starts opaque black
      cctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      const sorted = [...this.spritesList].sort((a, b) => a.z - b.z);
      for (const sprite of sorted) {
        const speed = sprite.z / 50;
        cctx.drawImage(sprite.image,
          Math.trunc(this.offset.x * speed - 20), Math.trunc(this.offset.y * speed - 10));
        // pygame blits desaturate_surf after every parallax layer
        blendVeil(this.composite);
      }
      this.lastOffset = key;
      this.dirty = false;
    }
    ctx.drawImage(this.composite, 0, 0);
  }
}

function scaleSurface(image, w, h) {
  return scale(image, w, h);
}
void scaleSurface;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
