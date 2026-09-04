// Ported from code/sprite.py of Eason-F/Blade-Hymn (Sprite, Hitbox, Projectile,
// Transition) and the group classes from code/groups.py.

import { GAME_WIDTH, GAME_HEIGHT } from "./constants.js";
import { Timer } from "./timer.js";
import { surface, blit, flip } from "./gfx.js";

// ---------------------------------------------------------------------------
// Rect — float rectangle with the pygame.FRect methods the game relies on.
// ---------------------------------------------------------------------------

export class FRect {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
  }
  copy() { return new FRect(this.x, this.y, this.w, this.h); }
  get left() { return this.x; }
  get right() { return this.x + this.w; }
  get top() { return this.y; }
  get bottom() { return this.y + this.h; }
  get width() { return this.w; }
  get height() { return this.h; }
  get center() { return [this.x + this.w / 2, this.y + this.h / 2]; }
  get topleft() { return [this.x, this.y]; }
  get bottomleft() { return [this.x, this.y + this.h]; }
  get bottomright() { return [this.x + this.w, this.y + this.h]; }
  get midleft() { return [this.x, this.y + this.h / 2]; }
  get midbottom() { return [this.x + this.w / 2, this.y + this.h]; }
  set center([cx, cy]) { this.x = cx - this.w / 2; this.y = cy - this.h / 2; }
  set topleft([x, y]) { this.x = x; this.y = y; }
  set midleft([x, cy]) { this.x = x; this.y = cy - this.h / 2; }
  set midbottom([cx, y]) { this.x = cx - this.w / 2; this.y = y - this.h; }
  set bottomleft([x, y]) { this.x = x; this.y = y - this.h; }
  set bottomright([x, y]) { this.x = x - this.w; this.y = y - this.h; }
  set left(v) { this.x = v; }
  set right(v) { this.x = v - this.w; }
  set top(v) { this.y = v; }
  set bottom(v) { this.y = v - this.h; }

  // pygame FRect.inflate keeps the centre fixed.
  inflate(dw, dh) {
    return new FRect(this.x - dw / 2, this.y - dh / 2, this.w + dw, this.h + dh);
  }

  colliderect(o) {
    return this.x < o.x + o.w && o.x < this.x + this.w &&
           this.y < o.y + o.h && o.y < this.y + this.h;
  }

  collidepoint([px, py]) {
    return this.x <= px && px < this.x + this.w && this.y <= py && py < this.y + this.h;
  }

  collidelist(rects) {
    for (let i = 0; i < rects.length; i++) {
      if (this.colliderect(rects[i])) return i;
    }
    return -1;
  }

  // pygame.FRect(topleft_point, size) equivalent.
  static from_point(point, size) {
    return new FRect(point[0], point[1], size[0], size[1]);
  }
}

// pygame.image.get_frect(topleft=pos) / (center=pos) helpers.
export function frectOf(image, { topleft, center } = {}) {
  const r = new FRect(0, 0, image.width, image.height);
  if (topleft) r.topleft = topleft;
  if (center) r.center = center;
  return r;
}

// pygame.sprite.Sprite equivalent: membership tracked in each group.
let spriteIdCounter = 0;
export class Sprite {
  constructor(pos, image, groups = null, z = 1) {
    this.id = ++spriteIdCounter;
    this.image = image;
    this.z = z;
    this.groupsList = [];
    this.visible = true;
    this.sustained = false;
    this.alpha = null; // pygame per-surface alpha; drawn via ctx.globalAlpha

    this.rect = frectOf(image, { topleft: pos });
    this.prev_rect = this.rect.copy();
    if (groups) {
      // pygame accepts a single Group or a tuple of them
      const groupList = Array.isArray(groups) ? groups : [groups];
      for (const g of groupList) g.add(this);
    }
  }

  kill() {
    for (const g of [...this.groupsList]) g.remove(this);
  }

  groups() {
    return this.groupsList;
  }

  // internal: called by Group.add/remove
  _added(g) { this.groupsList.push(g); }
  _removed(g) {
    const i = this.groupsList.indexOf(g);
    if (i >= 0) this.groupsList.splice(i, 1);
  }
}

export class AnimatedSprite extends Sprite {
  constructor(pos, frames, groups = null, z = 1) {
    super(pos, frames[0], groups, z);
    this.frames = frames;
    this.frame_index = 0;
    this.image = this.frames[Math.trunc(this.frame_index) % this.frames.length];
  }

  update(dt) {
    this.prev_rect = this.rect.copy();
    this.frame_index += dt * ANIMATION_SPEED;
    this.image = this.frames[Math.trunc(this.frame_index) % this.frames.length];
  }
}

// ---------------------------------------------------------------------------
// enemy interaction + combat
// ---------------------------------------------------------------------------

export class Hitbox extends Sprite {
  // colour parameter kept for parity; hitboxes are invisible in the original.
  constructor(tag, pos, direction, data, groups = null, colour = "red", z = 10) {
    const surf = surface(data.size[0], data.size[1]);
    pos = [pos[0] + data.rel_pos[0] * direction, pos[1] + data.rel_pos[1]];
    super(pos, surf, groups, z);

    this.rect = frectOf(this.image, { center: pos });
    this.prev_rect = this.rect.copy();

    this.tag = tag;
    this.direction = direction;
    this.damage = data.damage;
    this.knockback = data.knockback;
    this.stun = data.stun;

    this.visible = false;
    this.sustained = false;
  }
}

export class Projectile extends Hitbox {
  constructor({ tag, pos, direction, data, image, collision_rects, groups = null, z = 10 }) {
    super(tag, pos, direction, data, groups, "blue", z);
    this.image = flip(image);
    this.rect = frectOf(this.image, { center: pos });
    this.prev_rect = this.rect.copy();

    this.visible = true;
    this.sustained = true;

    this.data = data;
    this.velocity = { x: data.velocity[0] * direction, y: data.velocity[1] };

    this.collision_rects = collision_rects;
    this.timer = new Timer(1000, { sustained: true });
    this.timer.activate();
  }

  update(dt) {
    // a fresh damaging hitbox is spawned every frame at the arrow's position
    new Hitbox("enemy", this.rect.center, this.direction, this.data,
      this.groupsList.filter((g) => g.isDamageGroup), "blue");

    this.timer.update();
    if (this.rect.collidelist(this.collision_rects) >= 0) {
      this.timer.deactivate();
    }

    if (this.timer.active) {
      this.prev_rect = this.rect.copy();
      this.rect.x += this.velocity.x * dt;
      this.rect.y += this.velocity.y * dt;
    } else {
      this.kill();
    }
  }
}

// ---------------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------------

export class Transition extends Sprite {
  constructor(duration, target, colour = "black", groups = null) {
    // The original uses a (GAME_WIDTH*5, GAME_HEIGHT*5) surface so the fade
    // still covers the viewport when the camera offset pushes the blit left.
    super([0, 0], surface(GAME_WIDTH * 5, GAME_HEIGHT * 5), groups, 99);
    this.colour = colour;
    this.target_alpha = target;
    this.alpha = 0;

    this.timer = new Timer(duration, { sustained: true });
    this.active = false;
    this.complete = false;
    this.customDraw = true; // drawn through its own draw(ctx, offset)
  }

  start() {
    this.active = true;
    this.complete = false;

    this.alpha = 255 - this.target_alpha;
    this.timer.deactivate();
    this.timer.activate();
  }

  update(dt) {
    if (this.active) {
      const change = (this.target_alpha - this.alpha) / this.timer.duration * 5000;
      this.timer.update();
      this.alpha += change * dt;

      if (!this.timer.active) {
        this.complete = true;
        this.active = false;
      }
    } else {
      this.complete = false;
    }
  }

  draw(surfaceCtx, offset) {
    if (!this.active) return;
    const [ox, oy] = offset;
    surfaceCtx.save();
    surfaceCtx.globalAlpha = Math.max(0, Math.min(1, this.alpha / 255));
    surfaceCtx.fillStyle = this.colour;
    surfaceCtx.fillRect(this.rect.x + ox, this.rect.y + oy, this.rect.w, this.rect.h);
    surfaceCtx.restore();
  }
}

// ---------------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------------
