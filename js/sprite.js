// code/sprite.py

import { FRect, Sprite as PgSprite, Vector2 } from "./pg.js";
import { Surface, flipX } from "./surface.js";
import { ANIMATION_SPEED, GAME_WIDTH, GAME_HEIGHT } from "./constants.js";
import { Timer } from "./timer.js";

// surface.get_frect(topleft=... / center=... / midleft=...)
export function get_frect(image, anchor) {
  const r = new FRect(0, 0, image.width, image.height);
  if (anchor.topleft) r.topleft = anchor.topleft;
  if (anchor.center) r.center = anchor.center;
  if (anchor.midleft) r.midleft = anchor.midleft;
  return r;
}

export class Sprite extends PgSprite {
  constructor(pos, surf, groups = null, z = 1) {
    super(groups);
    this.image = surf;
    this.z = z;

    this.rect = get_frect(this.image, { topleft: pos });
    this.prev_rect = this.rect.copy();
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

// enemy interaction + combat
export class Hitbox extends Sprite {
  constructor(tag, pos, direction, data, groups = null, colour = "red", z = 10) {
    const surf = new Surface(data.size[0], data.size[1]);
    surf.fill(colour);

    pos = [pos[0] + data.rel_pos[0] * direction, pos[1] + data.rel_pos[1]];
    super(pos, surf, groups, z);

    this.rect = get_frect(this.image, { center: pos });
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
  constructor(tag, pos, direction, data, image, collision_rects, groups = null, z = 10) {
    super(tag, pos, direction, data, groups, "red", z);
    this.image = this.direction > 0 ? image : flipX(image);
    this.rect = get_frect(this.image, { center: pos });
    this.prev_rect = this.rect.copy();

    this.visible = true;
    this.sustained = true;

    this.data = data;
    this.velocity = new Vector2(data.velocity[0] * direction, data.velocity[1]);

    this.collision_rects = collision_rects;
    this.timer = new Timer(1000, false, false, true);
    this.timer.activate();

    this.hitbox = null;
  }

  update(dt) {
    this.hitbox = new Hitbox("enemy", this.rect.center, this.direction, this.data, this.groups(), "blue");

    this.timer.update();
    if (this.hitbox.rect.collidelist(this.collision_rects) >= 0) {
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

// effects
export class Transition extends Sprite {
  constructor(duration, target, colour = "black", groups = null) {
    super([0, 0], new Surface(GAME_WIDTH * 5, GAME_HEIGHT * 5, true), groups, 99);

    this.image.fill(colour);
    this.target_alpha = target;
    this.image.set_alpha(0);

    this.timer = new Timer(duration, false, false, true);
    this.active = false;

    this.complete = false;
  }

  start() {
    this.active = true;
    this.complete = false;

    this.image.set_alpha(255 - this.target_alpha);
    this.timer.deactivate();
    this.timer.activate();
  }

  update(dt) {
    if (this.active) {
      const change = (this.target_alpha - this.image.get_alpha()) / this.timer.duration * 5000;
      this.timer.update();
      this.image.set_alpha(this.image.get_alpha() + (change * dt));

      if (!this.timer.active) {
        this.complete = true;
        this.active = false;
      }
    } else {
      this.complete = false;
    }
  }

  draw(surface) {
    if (this.active) {
      surface.blit(this.image, this.rect.x, this.rect.y);
    }
  }
}
