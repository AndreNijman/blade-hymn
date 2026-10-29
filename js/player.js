// code/player.py

import { FRect, Sprite, Vector2, key, time, dist } from "./pg.js";
import { flipX, whiteSilhouette } from "./surface.js";
import { ANIMATION_SPEED, GRAVITY, PlAYER_HEALTH, Z_VALUES } from "./constants.js";
import { binds } from "./settings.js";
import { Timer } from "./timer.js";
import { Hitbox, get_frect } from "./sprite.js";

export class Player extends Sprite {
  constructor(pos, groups, collision_sprites, damage_sprites, frames, sounds, attack_data, level_dim) {
    super(groups);

    // animation
    this.frames = frames; this.frame_index = 0;
    this.state = "idle"; this.direction = 1;
    this.image = this.frames[this.state][this.frame_index];
    this.z = Z_VALUES.player;

    // hitbox rect
    this.rect = get_frect(this.image, { topleft: pos });
    this.hitbox_rect = this.rect.inflate(-72, -32);
    this.prev_rect = this.hitbox_rect.copy();

    this.camera_rect = this.hitbox_rect.copy();

    // movement
    this.gravity = GRAVITY;
    this.friction = 7;
    this.velocity = new Vector2(0, 0);
    this.acceleration = 20;
    this.speed = 60;

    this.is_jumping = false;
    this.jump_height = 300;

    this.dash_distance = this.acceleration * 20;
    this.max_dash_count = 3; this.dash_count = this.max_dash_count;

    this.control_lock = false;

    // attack
    this.attack_data = attack_data;
    this.is_attacking = this.attack_combo = false;
    this.attack_stage = -1; this.attack_stage_count = 3;
    this.can_air_atk = true;
    this.can_atk_boost = true;

    // combat
    this.hp = PlAYER_HEALTH;
    this.max_heal = this.heal_count = 6;
    this.heal_amount = 10 + this.hp / 5;
    this.fallen = false;

    this.knocked_down = false; this.vulnerable = true;
    this.damaging_hitbox = null;

    this.damage_sprites = damage_sprites;

    // collisions
    [this.level_width, this.level_height] = level_dim;
    this.collision_sprites = collision_sprites;
    this.colliding = {
      ground: false,
      hitbox: false,
    };

    // sounds
    this.swing_sound = sounds.swing;
    this.dash_sound = sounds.dash;

    // timers
    this.timers = {
      stun_recovery: new Timer(1500, false, false, true),
      knocked_back: new Timer(300, false, false, true),
      hit_cooldown: new Timer(400, false, false, true),
      dash: new Timer(3000, true, true),
      dash_cooldown: new Timer(300, false, false, true),
      dash_invulnerability: new Timer(250, false, false, true),
      attack_combo: new Timer(200),
      attack: new Timer(200, false, false, true),
      heal_cooldown: new Timer(2000, false, false, true),
      sound: new Timer(200, false, false, true),
    };
  }

  input(dt) {
    const keys = key.get_pressed();
    const movement_vect = new Vector2(0, 0);

    if (!this.control_lock) {
      if (!(this.state.includes("melee") && this.attack_combo)) {
        if (keys[binds.LEFT_KEY]) {
          movement_vect.x -= this.acceleration;
          this.direction = -1;
        }

        if (keys[binds.RIGHT_KEY]) {
          movement_vect.x += this.acceleration;
          this.direction = 1;
        }
      }

      if (!this.is_attacking) {
        if (keys[binds.DASH_KEY]) {
          movement_vect.x = this.dash(movement_vect.x);
        } else if (keys[binds.HEAL_KEY]) {
          this.heal();
        }
      }

      this.velocity.x += movement_vect.x * dt;

      if (this.colliding.ground || this.can_air_atk) {
        if (keys[binds.ATTACK_KEY]) {
          this.attack();
        }
      }
      this.attack_update();

      if (!this.attack_combo && this.colliding.ground) {
        if (keys[binds.JUMP_KEY]) {
          this.is_jumping = true;
          this.can_air_atk = true;
        }
      }
    }
  }

  // input related actions
  dash(speed) {
    if (this.dash_count > 0 && !this.timers.dash_cooldown.active) {
      this.dash_sound.play();
      speed = this.dash_distance * this.direction;

      this.dash_count -= 1;
      this.timers.dash_cooldown.activate();
      this.timers.dash_invulnerability.activate();
    }
    return speed;
  }

  heal() {
    if (!this.timers.heal_cooldown.active && this.heal_count > 0) {
      this.hp = this.hp + this.heal_amount <= PlAYER_HEALTH ? this.hp + this.heal_amount : PlAYER_HEALTH;
      this.heal_count -= 1;
      this.timers.heal_cooldown.activate();
    }
  }

  // attacking
  attack() {
    if (!this.is_attacking) {
      this.attack_stage = (this.attack_stage + 1) % this.attack_stage_count;
      this.frame_index = 0;
      this.can_atk_boost = true;
      this.timers.dash_cooldown.deactivate(); // prevent dash cooldown while attacking
    }

    this.is_attacking = true;
    this.attack_combo = true;
    this.timers.attack_combo.deactivate();
  }

  attack_update() {
    if (this.colliding.ground) {
      this.attack_stage_count = 3;
    } else {
      this.attack_stage_count = 2;
    }

    if (this.colliding.ground) {
      this.can_air_atk = false;
    }

    if (this.state.includes("melee") || this.state.includes("air")) {
      if (this.frame_index >= this.frames[this.state].length) {
        this.is_attacking = false;
        this.timers.attack_combo.activate();

        if (this.attack_stage === 1 && this.state.includes("air")) {
          this.can_air_atk = false;
          this.attack_combo = false;
        }
      }
    }

    if (this.timers.attack_combo.active) {
      this.attack_combo = false;
      this.is_attacking = false;
      this.attack_stage = -1;

      if (this.state === "jump" || this.state === "fall") { // prevent continous air attacks
        this.can_air_atk = false;
      }
    }
  }

  // movement related actions
  move(dt) {
    if (this.state.includes("melee")) { // give slight horizontal boost when attacking
      if (this.can_atk_boost) {
        this.velocity.x = this.direction / 4;
        this.can_atk_boost = false;
      }
    }

    let friction_factor = this.friction * -this.velocity.x;
    this.velocity.x += friction_factor / 2 * dt;
    this.velocity.x = Math.abs(this.velocity.x) < 1000 ? this.velocity.x : 1000;
    this.hitbox_rect.x += this.velocity.x * this.speed * dt;
    this.velocity.x += friction_factor / 2 * dt;
    this.surface_collisions("x");

    if (this.state.includes("air")) { // give slight vertical boost when air attacking
      if (this.can_atk_boost) {
        this.velocity.y = -this.jump_height / 1.7;
        this.can_atk_boost = false;
      }
    }

    this.velocity.y += this.gravity / 2 * dt;
    this.velocity.y = Math.abs(this.velocity.y) < 1000 ? this.velocity.y : 1000;
    this.hitbox_rect.y += this.velocity.y * dt;
    this.velocity.y += this.gravity / 2 * dt;
    this.surface_collisions("y");

    if (this.is_jumping) {
      this.velocity.y = -this.jump_height;
      this.is_jumping = false;
    }

    if (this.timers.dash.active) {
      this.dash_count = this.dash_count < this.max_dash_count ? this.dash_count + 1 : this.max_dash_count;
    }

    this.rect.center = this.hitbox_rect.center;
    this.move_camera();
  }

  check_collisions() {
    const ground_rect = FRect.from(this.hitbox_rect.bottomleft, [this.hitbox_rect.width, 2]);
    const collide_rects = this.collision_sprites.sprites().map((sprite) => sprite.rect);
    const damage_rects = this.damage_sprites.sprites().filter((sprite) => sprite.tag === "enemy");

    this.colliding.ground = ground_rect.collidelist(collide_rects) >= 0;

    this.damaging_hitbox = this.hitbox_rect.collideobjects(damage_rects, (x) => x.rect);
    this.colliding.hitbox = Boolean(this.damaging_hitbox);
  }

  surface_collisions(axis) {
    for (const sprite of this.collision_sprites) {
      if (sprite.rect.colliderect(this.hitbox_rect)) {
        if (axis === "x") { // horizontal
          if (this.hitbox_rect.left <= sprite.rect.right) {
            if (Math.trunc(this.prev_rect.left) >= Math.trunc(sprite.prev_rect.right)) { // left
              this.hitbox_rect.left = sprite.rect.right;
            }
          }

          if (this.hitbox_rect.right >= sprite.rect.left) {
            if (Math.trunc(this.prev_rect.right) <= Math.trunc(sprite.prev_rect.left)) { // right
              this.hitbox_rect.right = sprite.rect.left;
            }
          }
        } else { // vertical
          if (this.hitbox_rect.top <= sprite.rect.bottom) {
            if (Math.trunc(this.prev_rect.top) >= Math.trunc(sprite.prev_rect.bottom)) { // up
              this.hitbox_rect.top = sprite.rect.bottom;
            }
          }

          if (this.hitbox_rect.bottom >= sprite.rect.top) {
            if (Math.trunc(this.prev_rect.bottom) <= Math.trunc(sprite.prev_rect.top)) { // down
              this.hitbox_rect.bottom = sprite.rect.top;
            }
          }
          this.velocity.y = 0;
        }
      }
    }
  }

  move_camera() {
    let camera_speed = dist(this.hitbox_rect.center, this.camera_rect.center);
    camera_speed = camera_speed * camera_speed / 10000;
    camera_speed = camera_speed < 100 ? camera_speed : 100;
    this.camera_rect.x += (this.hitbox_rect.x - this.camera_rect.x) * camera_speed;
    this.camera_rect.y += (this.hitbox_rect.y - this.camera_rect.y) * camera_speed - 10;
  }

  check_depth() {
    if (this.hitbox_rect.y >= this.level_height + 500) {
      this.take_damage(999);
    }
  }

  // combat
  knock_back(direction, force) {
    this.velocity.y = -10;
    this.velocity.x = direction * force;

    this.is_attacking = false;
    this.attack_combo = false;

    this.timers.knocked_back.activate();
  }

  knock_down(direction, force = 5) {
    if (!this.knocked_down) {
      this.knocked_down = true;
      this.control_lock = true;

      this.knock_back(direction, force);
      this.velocity.y = -50;
    }
  }

  handle_knockdown() {
    if (this.colliding.ground) {
      if (this.knocked_down) {
        this.timers.stun_recovery.activate();
      }

      this.knocked_down = false;
      this.control_lock = false;
    }

    if (this.timers.stun_recovery.active) {
      this.control_lock = true;
    }

    if (this.timers.knocked_back.active) {
      this.control_lock = true;
    }
  }

  check_damage() {
    this.vulnerable = !(this.timers.hit_cooldown.active || this.timers.dash_invulnerability.active);

    if (this.vulnerable && this.colliding.hitbox) {
      this.timers.hit_cooldown.activate();
      if (this.damaging_hitbox.stun) {
        this.knock_down(this.damaging_hitbox.direction, this.damaging_hitbox.knockback);
      } else {
        this.knock_back(this.damaging_hitbox.direction, this.damaging_hitbox.knockback);
      }
      this.take_damage(this.damaging_hitbox.damage);
    }
  }

  take_damage(damage) {
    this.hp -= damage;
    if (this.hp <= 0) {
      this.fallen = true;
    }
  }

  // animations
  animate(dt) {
    const frames = this.frames[this.state];
    this.image = frames[Math.trunc(this.frame_index % frames.length)];
    this.image = this.direction > 0 ? this.image : flipX(this.image);
    this.frame_index += ANIMATION_SPEED * dt;
  }

  get_state() {
    if (this.colliding.ground) {
      if (this.is_attacking) {
        this.state = `melee${this.attack_stage + 1}`;
      } else {
        this.state = Math.abs(this.velocity.x) < 0.2 ? "idle" : "run";
      }
    } else {
      if (this.is_attacking) {
        if (this.can_air_atk) {
          this.state = `air${this.attack_stage + 1}`;
        }
      } else {
        if (this.velocity.y > 0) {
          this.state = "jump";
        } else {
          this.state = "fall";
        }
      }
    }

    if (this.timers.dash_cooldown.active) {
      this.state = "dash";
    }
  }

  hit_flicker() {
    if (this.timers.hit_cooldown.active && Math.sin(time.get_ticks() / 16) >= 0) {
      this.image = whiteSilhouette(this.image);
    }
  }

  // updates
  update_timers() {
    for (const timer of Object.values(this.timers)) {
      timer.update();
    }
  }

  update_hitboxes() {
    if (this.state.includes("melee") || this.state.includes("air")) {
      if (this.attack_data[this.state].impact.includes(Math.trunc(this.frame_index) + 1)) {
        this.timers.attack.activate();
        if (!this.timers.sound.active) {
          this.swing_sound.play();
          this.timers.sound.activate();
        }
      }
    } else {
      this.timers.attack.deactivate();
    }

    if (this.timers.attack.active) {
      new Hitbox("player",
        this.hitbox_rect.center,
        this.direction,
        this.attack_data[this.state],
        this.damage_sprites);
    }
  }

  update(dt) {
    this.prev_rect = this.hitbox_rect.copy();
    this.update_timers();

    this.check_collisions();
    this.check_damage();
    this.handle_knockdown();

    this.input(dt);
    this.move(dt);
    this.check_depth();

    this.get_state();
    this.animate(dt);
    this.hit_flicker();
  }
}
