// code/groups.py

import { Group, Vector2 } from "./pg.js";
import { Surface, scale, drawRect } from "./surface.js";
import { GAME_WIDTH, GAME_HEIGHT } from "./constants.js";

const byZ = (a, b) => a.z - b.z; // Array.sort is stable, like sorted()

export class CameraLockedSprites extends Group {
  constructor(width, height) {
    super();
    this.offset = new Vector2(0, 0);
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

  draw(surface, target_pos) {
    this.update_offset(target_pos);
  }
}

export class AllSprites extends CameraLockedSprites {
  constructor(width, height, bg_tiles, colour) {
    super(width, height);
    this.bg_tiles = bg_tiles.map((tile) => scale(tile, GAME_WIDTH, GAME_HEIGHT));
    this.colour = colour;
    this.tile_width = GAME_WIDTH;
    this.tiles = 5;

    this.desaturate_surf = new Surface(GAME_WIDTH, GAME_HEIGHT, true);
    this.desaturate_surf.fill([255, 255, 255, 50]);
  }

  draw_bg(surface) {
    for (let tile = 0; tile < this.tiles; tile++) {
      for (let i = 0; i < this.bg_tiles.length; i++) {
        const bg = this.bg_tiles[i];
        surface.blit(bg,
          this.tile_width * tile + (this.offset.x * (i / 25)),
          (this.offset.y * (i / 25)) - 5);
      }
    }

    const bottom = (this.offset.y * ((this.bg_tiles.length - 1) / 25)) - 5 + GAME_HEIGHT;
    drawRect(surface, this.colour, 0, bottom, GAME_WIDTH, GAME_HEIGHT);
    surface.blit(this.desaturate_surf, 0, 0);
  }

  draw(surface, target_pos) {
    super.draw(surface, target_pos);
    this.draw_bg(surface);
    for (const sprite of this.sprites().sort(byZ)) {
      surface.blit(sprite.image, sprite.rect.x + this.offset.x, sprite.rect.y + this.offset.y);
    }
  }
}

export class TextSprites extends CameraLockedSprites {
  draw(surface, target_pos) {
    super.draw(surface, target_pos);
    for (const sprite of this) {
      sprite.draw(surface, this.offset);
    }
  }
}

export class HitboxSprites extends CameraLockedSprites {
  empty() {
    for (const sprite of this.sprites()) {
      if (!sprite.sustained) this.remove(sprite);
    }
  }

  draw(surface, target_pos) {
    super.draw(surface, target_pos);
    for (const sprite of this) {
      if (sprite.visible) {
        surface.blit(sprite.image, sprite.rect.x + this.offset.x, sprite.rect.y + this.offset.y);
      }
    }
  }
}

export class AttackingSprites extends Group {
  update() {
    const freeze_frame = this.sprites().map((sprite) => sprite.update_hitboxes());
    return freeze_frame.some(Boolean);
  }
}

export class UISprites extends Group {
  draw(surface) {
    for (const sprite of this.sprites().filter((s) => s.visible)) {
      surface.blit(sprite.image, sprite.rect.x, sprite.rect.y);
    }
  }
}

export class MenuSprites extends Group {
  draw(surface) {
    for (const sprite of this.sprites().sort(byZ)) {
      surface.blit(sprite.image, sprite.rect.x, sprite.rect.y);
    }
  }
}

export class ParallaxSprites extends CameraLockedSprites {
  constructor() {
    super(GAME_WIDTH, GAME_HEIGHT);
    this.tile_width = GAME_WIDTH;

    this.desaturate_surf = new Surface(GAME_WIDTH, GAME_HEIGHT, true);
    this.desaturate_surf.fill([255, 255, 255, 50]);
  }

  draw(surface, target_pos) {
    this.handle_offset(target_pos);
    for (const sprite of this.sprites().sort(byZ)) {
      const speed = sprite.z / 50;
      surface.blit(sprite.image, this.offset.x * speed - 20, this.offset.y * speed - 10);
      surface.blit(this.desaturate_surf, 0, 0);
    }
  }
}
