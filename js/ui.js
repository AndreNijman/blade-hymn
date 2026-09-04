// Ported from code/ui.py of Eason-F/Blade-Hymn.

import { Z_VALUES, ANIMATION_SPEED } from "./constants.js";
import { Sprite, AnimatedSprite } from "./sprite.js";
import { surface, scale, blit } from "./gfx.js";

// pygame Surface.set_colorkey('black'): pure-black pixels become transparent.
function colorkeyBlack(canvas) {
  const ctx = canvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) data[i + 3] = 0;
  }
  ctx.putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// in game
// ---------------------------------------------------------------------------

export class HealthBar extends Sprite {
  constructor(pos, max_hp, groups, frames, z = Z_VALUES.ui) {
    super(pos, frames.health[0], groups, z);
    this.rect = this.rect.copy();
    this.rect.midleft = pos;
    this.max_hp = max_hp;
    this.frames = frames.health;

    this.sustained = true;
    this.visible = true;
  }

  update({ hp = 0 } = {}) {
    const bar_scale = (hp > 0 ? hp : 0) / this.max_hp;
    const scaled_width = this.rect.width * bar_scale;

    const image = surface(this.rect.width, this.rect.height);
    const ctx = image.getContext("2d");
    ctx.drawImage(this.frames[2], 0, 0);
    if (scaled_width > 0) {
      ctx.drawImage(scale(this.frames[1], scaled_width, this.rect.height), 0, 0);
    }
    ctx.drawImage(this.frames[0], 0, 0);
    this.image = image;

    this.prev_rect = this.rect.copy();
  }
}

export class CounterToken extends Sprite {
  constructor(pos, index, surf, max_count, groups, z = Z_VALUES.ui) {
    super(pos, surf[0], groups, z);
    this.padding = 2;
    this.rect = this.rect.copy();
    this.rect.midleft = [pos[0] + index * (this.rect.width + this.padding), pos[1]];

    this.max_count = max_count;
    this.sustained = false;

    this.visible = true;
  }
}

export class Counter extends AnimatedSprite {
  constructor(pos, animation, frame, max_count, groups, z = Z_VALUES.ui) {
    super(pos, frame, groups, z);
    this.rect = this.rect.copy();
    this.rect.midleft = [pos[0], pos[1] - 6];
    this.max_count = max_count;
    this.cover = frame[0];
    this.frames = animation;

    this.sustained = true;
    this.visible = true;
  }

  update({ count = 0, dt = 0 } = {}) {
    const multiplier = (count > 0 ? count : 0) / this.max_count;
    const y_offset = (this.rect.height - 48) * (1 - multiplier);

    this.frame_index += ANIMATION_SPEED * dt;

    const image = surface(this.rect.width, this.rect.height);
    const ctx = image.getContext("2d");
    ctx.drawImage(this.frames[Math.trunc(this.frame_index) % this.frames.length], 0, y_offset);
    ctx.drawImage(this.cover, 0, 0);
    this.image = colorkeyBlack(image);

    this.prev_rect = this.rect.copy();
  }
}

// ---------------------------------------------------------------------------
// menu
// ---------------------------------------------------------------------------

export class Text extends Sprite {
  constructor(pos, text, size, groups = null) {
    super(pos, surface(0, 0), groups, 0);
    this.text = Text.gameText(text, size).split("\n");
    this.size = size;
    this.pos = pos;
    this.customDraw = true;
  }

  // pygame's font rasteriser (SDL_ttf, the version the original game ships
  // with) renders 'e' with zero ink and zero advance at these small sizes;
  // the game's tutorial text ships looking like "Mov with RIGHT and L FT."
  // — reproduce that quirk so the port is indistinguishable.
  static gameText(text, size) {
    if (size > 12) return text;
    return text.replace(/e/g, "");
  }

  draw(ctx, offset) {
    ctx.fillStyle = "#000000";
    ctx.font = `${this.size}px PixelifySans, monospace`;
    ctx.textBaseline = "top";
    this.text.forEach((line, i) => {
      ctx.fillText(line, this.pos[0] + offset[0], this.pos[1] + i * this.size + 1 + offset[1]);
    });
  }
}

// Static label bitmap pre-rendered with pygame (menu stage labels).
export class TextSpriteLabel extends Sprite {
  constructor(pos, image, groups = null, z = 0) {
    super(pos, image, groups, z);
    this.pos = pos;
    this.customDraw = true;
  }

  draw(ctx, offset) {
    blit(ctx, this.image, this.pos[0] + offset[0], this.pos[1] + offset[1]);
  }
}

export class SelectionIndicator extends Sprite {
  constructor(pos, size, padding, groups = null, z = Z_VALUES.ui) {
    size = [size[0] + padding, size[1] + padding];
    super(pos, selectionSurface(size), groups, z);
    this.rect = this.rect.copy();
    this.rect.center = pos;
  }

  update(dt, { selection_pos = [0, 0] } = {}) {
    const adjust_speed = 25;
    const x_change = (selection_pos[0] - this.rect.center[0]) * adjust_speed * dt;
    const y_change = (selection_pos[1] - this.rect.center[1]) * adjust_speed * dt;
    this.rect.center = [
      this.rect.center[0] + (Math.abs(selection_pos[0] - this.rect.center[0]) > 1 ? x_change : selection_pos[0] - this.rect.center[0]),
      0.5 + this.rect.center[1] + (Math.abs(selection_pos[1] - this.rect.center[1]) > 1 ? y_change : selection_pos[1] - this.rect.center[1]),
    ];
  }
}

function selectionSurface(size) {
  const c = surface(size[0], size[1]);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, c.width, c.height);
  // white 1px rounded border, radius 10 (pygame.draw.rect border_radius=10)
  ctx.beginPath();
  ctx.moveTo(0.5 + 10, 0.5);
  ctx.arcTo(0.5 + size[0] - 1, 0.5, 0.5 + size[0] - 1, 0.5 + size[1] - 1, 10);
  ctx.arcTo(0.5 + size[0] - 1, 0.5 + size[1] - 1, 0.5, 0.5 + size[1] - 1, 10);
  ctx.arcTo(0.5, 0.5 + size[1] - 1, 0.5, 0.5, 10);
  ctx.arcTo(0.5, 0.5, 0.5 + size[0] - 1, 0.5, 10);
  ctx.closePath();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.stroke();
  // set_colorkey('black'): only the outline survives
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) data[i + 3] = 0;
  }
  ctx.putImageData(new ImageData(data, c.width, c.height), 0, 0);
  return c;
}

export class Button extends Sprite {
  constructor(tag, pos, image, groups = null) {
    super(pos, image, groups);
    this.rect = this.rect.copy();
    this.rect.midleft = pos;

    this.tag = tag; // identification key of button
    this.pressed = false;
  }

  update(dt, { mouse_pos = [0, 0], mouse_states = [] } = {}) {
    if (this.rect.collidepoint(mouse_pos)) {
      this.pressed = Boolean(mouse_states[0]);
    } else {
      this.pressed = false;
    }
  }
}
