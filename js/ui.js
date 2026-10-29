// code/ui.py

import { Sprite as PgSprite } from "./pg.js";
import { Surface, scale } from "./surface.js";
import { Font } from "./font.js";
import { Sprite, AnimatedSprite, get_frect } from "./sprite.js";
import { ANIMATION_SPEED, Z_VALUES } from "./constants.js";

// in game
export class HealthBar extends Sprite {
  constructor(pos, max_hp, groups, frames, z = Z_VALUES.ui) {
    super(pos, frames.health[0], groups, z);
    this.rect.midleft = pos;
    this.max_hp = max_hp;
    this.frames = frames.health;

    this.sustained = true;
    this.visible = true;
  }

  update({ hp = 0 } = {}) {
    const ratio = (hp > 0 ? hp : 0) / this.max_hp;
    const scaled_width = this.rect.width * ratio;
    const scaled_bar = scale(this.frames[1], scaled_width, this.rect.height);

    this.image = new Surface(this.rect.width, this.rect.height, true);
    this.image.blit(this.frames[2], 0, 0);
    this.image.blit(scaled_bar, 0, 0);
    this.image.blit(this.frames[0], 0, 0);

    this.rect = get_frect(this.image, { midleft: this.rect.midleft });
    this.prev_rect = this.rect.copy();
  }
}

export class CounterToken extends Sprite {
  constructor(pos, index, surf, max_count, groups, z = Z_VALUES.ui) {
    super(pos, surf[0], groups, z);
    this.padding = 2;
    this.rect = get_frect(this.image, {
      midleft: [pos[0] + index * (this.rect.width + this.padding), pos[1]],
    });

    this.max_count = max_count;
    this.sustained = false;

    this.visible = true;
  }
}

export class Counter extends AnimatedSprite {
  constructor(pos, animation, frame, max_count, groups, z = Z_VALUES.ui) {
    super(pos, frame, groups, z);
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

    this.image = new Surface(this.rect.width, this.rect.height, true);
    this.image.blit(this.frames[Math.trunc(this.frame_index) % this.frames.length], 0, y_offset);
    this.image.blit(this.cover, 0, 0);
    this.image.set_colorkey("black");

    this.rect = get_frect(this.image, { midleft: this.rect.midleft });
    this.prev_rect = this.rect.copy();
  }
}

// menu
export class Text extends PgSprite {
  constructor(pos, text, size, groups = null) {
    super(groups);
    this.font = new Font(size);

    this.text = text.split("\n");
    this.size = size;
    this.pos = pos;
  }

  draw(display_surf, offset) {
    this.text.forEach((line, i) => {
      display_surf.blit(this.font.render(line),
        this.pos[0] + offset.x, this.pos[1] + i * this.size + 1 + offset.y);
    });
  }
}

// the rounded outline it draws with pygame.draw.rect is baked (bake.py)
let indicatorImage = null;
export function setSelectionIndicatorImage(image) {
  indicatorImage = image;
}

export class SelectionIndicator extends Sprite {
  constructor(pos, size, padding, groups = null, z = Z_VALUES.ui) {
    size = [size[0] + padding, size[1] + padding];
    super(pos, new Surface(size[0], size[1], true), groups, z);
    this.rect.center = pos;

    this.padding = padding;
    this.image = indicatorImage;
  }

  update(dt, { selection_pos = [0, 0] } = {}) {
    const target_pos = selection_pos;

    const adjust_speed = 25;
    const x_change = (target_pos[0] - this.rect.center[0]) * adjust_speed * dt;
    const y_change = (target_pos[1] - this.rect.center[1]) * adjust_speed * dt;
    this.rect.center = [
      this.rect.center[0] + (Math.abs(target_pos[0] - this.rect.center[0]) > 1 ? x_change : (target_pos[0] - this.rect.center[0])),
      0.5 + this.rect.center[1] + (Math.abs(target_pos[1] - this.rect.center[1]) > 1 ? y_change : (target_pos[1] - this.rect.center[1])),
    ];
  }
}

export class Button extends Sprite {
  constructor(tag, pos, image, groups = null) {
    super(pos, image, groups);
    this.rect.midleft = pos;

    this.tag = tag; // identification key of button
    this.pressed = false;
  }

  update(dt, { mouse_pos = [0, 0], mouse_states = {} } = {}) {
    if (this.rect.collidepoint(mouse_pos)) {
      if (mouse_states[0]) {
        this.pressed = true;
      } else {
        this.pressed = false;
      }
    }
  }
}
