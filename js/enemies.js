// Ported from code/enemies.py of Eason-F/Blade-Hymn.

import { GRAVITY, ANIMATION_SPEED, Z_VALUES } from "./constants.js";
import { Timer, clock } from "./timer.js";
import { Sprite, Hitbox, Projectile } from "./sprite.js";
import { flip, whiteMask } from "./gfx.js";
import { random } from "./random.js";

export class Enemy extends Sprite {
  constructor({ pos, hp, groups, collision_sprites, damage_sprites, player, frames, sounds, attack_data }) {
    super(pos, frames.walk[0], groups, Z_VALUES.enemies);
    this.player = player;
    this.player_pos = player.hitbox_rect.center;

    // animation
    this.frames = frames;
    this.frame_index = 0;
    this.state = "walk";
    this.direction = 1;
    this.attack_data = attack_data;

    this.timers = {
      attack_cooldown: new Timer(1200, { sustained: true }),
      attack: new Timer(200, { sustained: true }),
      stun_recovery: new Timer(1000, { sustained: true }),
      knocked_back: new Timer(700, { sustained: true }),
      hit_cooldown: new Timer(250, { sustained: true }),
      fallen: new Timer(2000, { sustained: true }),
      sound: new Timer(500, { sustained: true }),
    };

    // hitbox rect
    this.hitbox_rect = this.rect.inflate(-72, -32);
    this.prev_rect = this.hitbox_rect.copy();

    // movement
    this.gravity = GRAVITY;
    this.friction = 7;
    this.velocity = { x: 0, y: 0 };
    this.speed = 25;

    this.collisions = { right_edge: false, left_edge: false };

    // interaction
    this.collision_sprites = collision_sprites;
    this.damage_sprites = damage_sprites;

    // combat
    this.hp = hp;
    this.player_found = false;
    this.can_attack = false;
    this.is_attacking = false;
    this.attack_stage = 1;
    this.attack_choice = null;

    this.stunned = false;

    // variable
    this.sight_range = null;
    this.attack_range = null;

    // sounds
    this.sounds = sounds;
  }

  // movement
  move(dt) {
    if (!this.timers.knocked_back.active && !this.stunned) {
      this.velocity.x = 0;
      if (this.player_found && !this.is_attacking) {
        this.direction = this.player_pos[0] > this.hitbox_rect.center[0] ? 1 : -1;
        this.move_to_player();
      }
    }

    // prevent enemies from falling off ledge (if/elif, as in the original)
    if (!this.collisions.right_edge) {
      if (this.velocity.x > 0) this.velocity.x = 0;
    } else if (!this.collisions.left_edge) {
      if (this.velocity.x < 0) this.velocity.x = 0;
    }

    // apply friction only when knocked back
    if (this.timers.knocked_back.active) {
      const friction_factor = this.friction * -this.velocity.x;
      this.velocity.x += (friction_factor / 2) * dt;
      this.hitbox_rect.x += this.velocity.x * dt * 10;
      this.velocity.x += (friction_factor / 2) * dt;
    } else { // simple movement when not knocked back
      this.hitbox_rect.x += this.velocity.x * dt;
      this.surface_collisions("x");
    }

    // apply gravity
    this.velocity.y += (this.gravity / 2) * dt;
    this.hitbox_rect.y += this.velocity.y * dt;
    this.velocity.y += (this.gravity / 2) * dt;
    this.surface_collisions("y");

    this.rect.center = this.hitbox_rect.center;
  }

  move_to_player() {
    if (!this.can_attack) {
      this.velocity.x = this.direction * this.speed;
    }
  }

  surface_collisions(axis) {
    for (const sprite of this.collision_sprites) {
      if (sprite.rect.colliderect(this.hitbox_rect)) {
        if (axis === "x") { // horizontal
          if (this.hitbox_rect.left <= sprite.rect.right) {
            if (Math.trunc(this.prev_rect.left) >= Math.trunc(sprite.prev_rect.right)) {
              this.hitbox_rect.left = sprite.rect.right;
            }
          }
          if (this.hitbox_rect.right >= sprite.rect.left) {
            if (Math.trunc(this.prev_rect.right) <= Math.trunc(sprite.prev_rect.left)) {
              this.hitbox_rect.right = sprite.rect.left;
            }
          }
        } else { // vertical
          if (this.hitbox_rect.top <= sprite.rect.bottom) {
            if (Math.trunc(this.prev_rect.top) >= Math.trunc(sprite.prev_rect.bottom)) {
              this.hitbox_rect.top = sprite.rect.bottom;
            }
          }
          if (this.hitbox_rect.bottom >= sprite.rect.top) {
            if (Math.trunc(this.prev_rect.bottom) <= Math.trunc(sprite.prev_rect.top)) {
              this.hitbox_rect.bottom = sprite.rect.top;
            }
          }
          this.velocity.y = 0;
        }
      }
    }
  }

  check_collisions() {
    const floor_rect_right = floorProbe(this.hitbox_rect.bottomright, -1, 10);
    const floor_rect_left = floorProbe(this.hitbox_rect.bottomleft, -1, 10);
    const collide_rects = [...this.collision_sprites].map((s) => s.rect);

    this.collisions.right_edge = floor_rect_right.collidelist(collide_rects) >= 0;
    this.collisions.left_edge = floor_rect_left.collidelist(collide_rects) >= 0;
  }

  find_player() {
    const player_dist_x = Math.abs(this.hitbox_rect.center[0] - this.player_pos[0]);
    const player_dist_y = Math.abs(this.hitbox_rect.center[1] - this.player_pos[1]);
    this.player_found = player_dist_x <= this.sight_range && player_dist_y <= 60;

    if (player_dist_x <= this.attack_range) {
      this.can_attack = true;
    } else if (!this.is_attacking) {
      this.can_attack = false;
      this.attack_stage = random.choice(this.attack_choice);
    }
  }

  // animation
  get_state() {
    if (this.timers.fallen.active) this.state = "fallen";
  }

  animate(dt) {
    const frames = this.frames[this.state];
    this.image = frames[Math.trunc(this.frame_index % frames.length)];
    this.image = this.direction > 0 ? this.image : flip(this.image);
    this.frame_index += ANIMATION_SPEED * dt;
  }

  hit_flicker() {
    if (this.timers.hit_cooldown.active && Math.sin(clock.now() / 32) >= 0) {
      this.image = whiteMask(this.image);
    }
  }

  // combat
  knock_back(direction, force) {
    this.velocity.x = direction * force;
    this.timers.knocked_back.activate();
  }

  knock_down(direction, force = 5) {
    if (!this.stunned) {
      this.is_attacking = false;
      this.can_attack = false;

      this.knock_back(direction, force);
      this.velocity.y = -50;
      this.timers.stun_recovery.activate();
    }
  }

  handle_knockdown() {
    this.stunned = this.timers.stun_recovery.active;
  }

  check_damage() {
    const damage_rects = [...this.damage_sprites].filter((s) => s.tag === "player");
    const damaging_hitbox = firstCollide(this.hitbox_rect, damage_rects);
    const is_hit = Boolean(damaging_hitbox);

    if (is_hit && !this.timers.hit_cooldown.active && this.hp > 0) {
      this.timers.hit_cooldown.activate();
      if (damaging_hitbox.stun) {
        this.knock_down(damaging_hitbox.direction, damaging_hitbox.knockback);
      } else {
        this.knock_back(damaging_hitbox.direction, damaging_hitbox.knockback);
      }
      this.timers.attack.deactivate();
      this.counter_attack();
      this.take_damage(damaging_hitbox.damage);
    }

    if (this.state === "fallen" && this.frame_index >= this.frames[this.state].length - 1) {
      if (!this.timers.fallen.active) this.kill();
      this.frame_index = this.frames[this.state].length - 1;
    }
  }

  take_damage(damage) {
    this.hp -= damage;
    if (this.hp <= 0 && !this.timers.fallen.active) {
      this.frame_index = 0;
      this.timers.fallen.activate();
    }
  }

  // update
  update_timers() {
    for (const timer of Object.values(this.timers)) timer.update();
  }

  update_hitboxes() {
    if (this.timers.attack.active) {
      new Hitbox("enemy", this.hitbox_rect.center, this.direction,
        this.attack_data[this.state], this.damage_sprites, "yellow");
    }

    new Hitbox("enemy", this.hitbox_rect.center, this.direction,
      this.attack_data.contact, this.damage_sprites, "yellow");
  }

  update(dt) {
    this.prev_rect = this.hitbox_rect.copy();
    this.player_pos = this.player.hitbox_rect.center;
    this.update_timers();

    this.check_collisions();
    this.check_damage();
    this.handle_knockdown();

    if (!this.timers.fallen.active) {
      this.find_player();
      this.move(dt);
      this.attack();
    }

    this.get_state();
    this.animate(dt);
    this.hit_flicker();
  }
}

// pygame FRect(bottomright_point, (-1, 10)): a 1px-wide, 10px-tall probe that
// reaches backwards from the given bottom corner point.
function floorProbe(point, w, h) {
  return {
    x: point[0] + Math.min(0, w), y: point[1],
    w: Math.abs(w), h,
    left: point[0] + Math.min(0, w), right: point[0] + Math.max(0, w),
    top: point[1], bottom: point[1] + h,
    colliderect(o) {
      return this.x < o.x + o.w && o.x < this.x + this.w &&
             this.y < o.y + o.h && o.y < this.y + this.h;
    },
    collidelist(rects) {
      for (let i = 0; i < rects.length; i++) if (this.colliderect(rects[i])) return i;
      return -1;
    },
  };
}

function firstCollide(rect, objects) {
  for (const o of objects) {
    if (rect.colliderect(o.rect)) return o;
  }
  return null;
}

// ---------------------------------------------------------------------------
// BasicSwordsman
// ---------------------------------------------------------------------------

export class BasicSwordsman extends Enemy {
  constructor(options) {
    super(options);

    this.hitbox_rect = this.rect.inflate(-84, -42);
    this.prev_rect = this.hitbox_rect.copy();

    this.speed = 25;
    this.sight_range = 200;
    this.attack_range = 45;
    this.attack_choice = [1, 1, 1, 2];
    this.attack_combo = false;

    this.timers.attack_cooldown = new Timer(1000, { sustained: true });
    this.timers.combo_cooldown = new Timer(400, { sustained: true });
  }

  attack() {
    if (this.can_attack && !(this.timers.attack_cooldown.active || this.timers.combo_cooldown.active)) {
      if (!this.is_attacking) {
        this.frame_index = this.attack_combo ? 3 : 0;
        this.direction = this.player_pos[0] > this.hitbox_rect.center[0] ? 1 : -1;
      }
      this.is_attacking = true;
    }

    if (this.state.includes("melee")) {
      if (this.frame_index >= this.frames[this.state].length) {
        this.is_attacking = false;

        this.timers.attack_cooldown.activate();
        this.timers.combo_cooldown.deactivate();
        this.attack_choice = [1, 1, 1, 2];

        if (random.randint(0, 2) === 1 && this.attack_stage === 1) {
          this.attack_choice = [2];
          this.attack_combo = true;
          this.timers.attack_cooldown.deactivate();
          this.timers.combo_cooldown.activate();
        } else {
          this.attack_combo = false;
        }

        this.attack_stage = random.choice(this.attack_choice);
      }
    }
  }

  counter_attack() {
    if (random.randint(0, 2) === 1) {
      this.attack_stage = 2;
      this.attack_combo = true;
      this.timers.attack_cooldown.deactivate();
      this.timers.combo_cooldown.activate();
    }
  }

  get_state() {
    if (this.is_attacking) this.state = `melee${this.attack_stage}`;
    else this.state = this.velocity.x ? "walk" : "idle";
    super.get_state();
  }

  update_hitboxes() {
    if (this.state.includes("melee")) {
      if (this.attack_data[this.state].impact.includes(Math.trunc(this.frame_index) + 1)) {
        this.timers.attack.activate();
        if (!this.timers.sound.active) {
          this.sounds.play("swing");
          this.timers.sound.activate();
        }
      }
    } else {
      this.timers.attack.deactivate();
    }

    super.update_hitboxes();
  }
}

// ---------------------------------------------------------------------------
// BossSamurai
// ---------------------------------------------------------------------------

export class BossSamurai extends Enemy {
  constructor(options) {
    super(options);

    this.hitbox_rect = this.rect.inflate(-80, -52);
    this.prev_rect = this.hitbox_rect.copy();

    this.speed = 30;
    this.sight_range = 300;
    this.attack_range = 50;

    this.base_attack_choice = [1, 1, 1, 2, 2, 3];
    this.attack_choice = this.base_attack_choice;

    this.timers.attack_cooldown = new Timer(600, { sustained: true });
    this.timers.blocking = new Timer(3000, { sustained: true });
    this.timers.block_duration = new Timer(200, { sustained: true });
  }

  attack() {
    if (this.timers.blocking.active) {
      this.can_attack = false;
      this.is_attacking = true;
    }

    if (!this.timers.attack_cooldown.active) {
      if (this.can_attack) {
        if (!this.is_attacking) {
          this.frame_index = 0;
          this.is_attacking = true;
          this.direction = this.player_pos[0] > this.hitbox_rect.center[0] ? 1 : -1;
          this.block();
        }
      }

      if (this.frame_index >= this.frames[this.state].length) {
        this.frame_index = 0;
        if (this.state.includes("melee")) {
          this.timers.attack_cooldown.activate();
          this.is_attacking = false;

          this.attack_choice = this.base_attack_choice;
          this.attack_stage = random.choice(this.attack_choice);
        }
      }
    }
  }

  block() {
    if (random.randint(0, 4) === 1) this.timers.blocking.activate();
  }

  counter_attack() {
    if (random.randint(0, 2) === 1) {
      this.attack_stage = 3;
      this.timers.attack_cooldown.deactivate();
    }
  }

  take_damage(damage) {
    if (this.timers.blocking.active) {
      this.timers.block_duration.activate();
      this.timers.attack_cooldown.deactivate();
      this.sounds.play("block");
      damage *= 0.5;
    }
    super.take_damage(damage);
  }

  get_state() {
    if (this.timers.blocking.active) this.state = "block";
    else if (this.stunned) this.state = "hurt";
    else if (this.is_attacking) this.state = `melee${this.attack_stage}`;
    else this.state = Math.abs(this.velocity.x) > 0.5 ? "walk" : "idle";

    super.get_state();
  }

  update_hitboxes() {
    if (this.state.includes("melee")) {
      if (this.attack_data[this.state].impact.includes(Math.trunc(this.frame_index) + 1)) {
        this.timers.attack.activate();
        this.timers.block_duration.deactivate();
        if (!this.timers.sound.active) {
          this.sounds.play("swing");
          this.timers.sound.activate();
        }
      }
    } else if (this.state === "block" && this.timers.block_duration.active) {
      this.timers.attack.activate();
      this.timers.blocking.deactivate();
    } else {
      this.timers.attack.deactivate();
    }

    super.update_hitboxes();
  }
}

// ---------------------------------------------------------------------------
// BossArcher
// ---------------------------------------------------------------------------

export class BossArcher extends Enemy {
  constructor(options) {
    super(options);

    this.hitbox_rect = this.rect.inflate(-80, -78);
    this.prev_rect = this.hitbox_rect.copy();

    this.speed = 30;
    this.sight_range = 300;
    this.max_shoot_range = 350;
    this.min_shoot_range = 150;
    this.attack_range = 50;

    this.max_combo_length = 2;
    this.combo_length = 0;

    this.can_shoot = false;
    this.is_shooting = false;
    this.has_shot = true;
    this.max_ammo = 2;
    this.ammo = 2;

    this.base_attack_choice = [1, 1, 1, 2, 2];
    this.attack_choice = this.base_attack_choice;

    this.timers.attack_cooldown = new Timer(1600, { sustained: true });
    this.timers.combo_cooldown = new Timer(200, { sustained: true });
  }

  find_player() {
    super.find_player();
    const player_dist_x = Math.abs(this.hitbox_rect.center[0] - this.player_pos[0]);
    this.can_shoot = this.min_shoot_range < player_dist_x && player_dist_x < this.max_shoot_range && this.player_found;
  }

  move_to_player() {
    if (!(this.can_attack || this.is_shooting)) {
      this.velocity.x = this.direction * this.speed;
    }
  }

  attack() {
    if (this.ammo <= 0) this.can_shoot = false;

    if (!(this.timers.attack_cooldown.active || this.timers.combo_cooldown.active)) {
      if (this.can_shoot) {
        if (!this.is_shooting && !this.is_attacking) {
          this.frame_index = 0;
          this.is_shooting = true;
          this.is_attacking = false;
        }
      } else if (this.can_attack) {
        if (!this.is_attacking) {
          this.frame_index = 0;
          this.is_attacking = true;
          this.is_shooting = false;
          this.combo_length += 1;
          this.direction = this.player_pos[0] > this.hitbox_rect.center[0] ? 1 : -1;
        }
      }

      if (this.frame_index >= this.frames[this.state].length) {
        this.frame_index = 0;
        if (this.state === "shoot" || this.state.includes("melee")) {
          this.timers.attack_cooldown.activate();
        }

        if (this.state.includes("melee")) {
          this.is_attacking = false;

          this.attack_choice = this.base_attack_choice;
          this.chain_attacks();
          this.attack_stage = random.choice(this.attack_choice);

          this.ammo = this.ammo < this.max_ammo ? this.ammo + 1 : this.ammo;
        } else if (this.state.includes("shoot")) {
          this.is_shooting = false;
          this.ammo -= 1;
        }
      }
    }
  }

  chain_attacks() {
    if (this.combo_length < this.max_combo_length && random.randint(0, 1) === 1) {
      this.attack_choice = [1, 2];
      this.timers.attack_cooldown.deactivate();
      this.timers.combo_cooldown.activate();
    } else {
      this.combo_length = 0;
      this.attack_choice = [3];
    }
  }

  counter_attack() {
    if (random.randint(0, 3) === 1) {
      this.attack_stage = random.choice([2, 2, 3]);
      this.ammo = this.ammo < this.max_ammo ? this.ammo + 1 : this.ammo;
      this.timers.attack_cooldown.deactivate();
      this.frame_index = 3;
    }
  }

  get_state() {
    if (this.stunned) this.state = "hurt";
    else if (this.is_attacking && this.can_attack) this.state = `melee${this.attack_stage}`;
    else if (this.is_shooting) this.state = "shoot";
    else this.state = Math.abs(this.velocity.x) > 0.5 ? "walk" : "idle";

    super.get_state();
  }

  update_hitboxes() {
    if (this.state.includes("melee")) {
      if (this.attack_data[this.state].impact.includes(Math.trunc(this.frame_index) + 1)) {
        this.timers.attack.activate();
        if (!this.timers.sound.active) {
          this.sounds.play("swing");
          this.timers.sound.activate();
        }
      }
    } else if (this.state === "shoot") {
      if (this.attack_data[this.state].impact.includes(Math.trunc(this.frame_index) + 1)) {
        this.has_shot = false;
        this.frame_index += 1;
      }
    } else {
      this.timers.attack.deactivate();
    }

    if (!this.has_shot) {
      this.has_shot = true;
      new Projectile({
        tag: "enemy",
        pos: this.hitbox_rect.center,
        direction: this.direction,
        data: this.attack_data[this.state],
        image: this.frames.arrow[0],
        collision_rects: [...this.collision_sprites].map((s) => s.rect),
        groups: this.damage_sprites,
      });
    }

    super.update_hitboxes();
  }
}
