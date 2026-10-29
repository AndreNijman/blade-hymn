// code/level.py. `tmx_map` is the map baked from pytmx (tools/bake.py).

import { Group } from "./pg.js";
import { MASTER_DISPLAY, TILE_SIZE, BG_FILL, Z_VALUES, PlAYER_HEALTH } from "./constants.js";
import { TEXT_TAGS } from "./text.js";
import { Sprite, Transition } from "./sprite.js";
import { Player } from "./player.js";
import { BasicSwordsman, BossSamurai, BossArcher } from "./enemies.js";
import { AllSprites, AttackingSprites, HitboxSprites, UISprites, TextSprites } from "./groups.js";
import { HealthBar, CounterToken, Counter, Text } from "./ui.js";

export class Level {
  constructor(name, tmx_map, ui_frames, level_frames, audio_files, player_frames, attack_impact_frames, images) {
    this.display_surf = MASTER_DISPLAY;
    this.name = name;
    this.images = images;

    // entities
    this.player = null;
    this.boss = null;
    this.boss_health_bar = null;

    // properties
    this.status = "normal";
    this.level_width = tmx_map.width * TILE_SIZE;
    this.level_height = tmx_map.height * TILE_SIZE;
    this.level_properties = tmx_map.properties;
    const bg_tiles = level_frames.bg_tiles[this.level_properties.bg];
    const fill_colour = BG_FILL[this.level_properties.bg];

    // groups
    this.all_sprites = new AllSprites(this.level_width, this.level_height, bg_tiles, fill_colour);
    this.ui_sprites = new UISprites();
    this.collision_sprites = new Group();
    this.text_sprites = new TextSprites(this.level_width, this.level_height);

    this.attacking_sprites = new AttackingSprites();
    this.damage_sprites = new HitboxSprites(this.level_width, this.level_height);

    // setup
    this.ui_frames = ui_frames;
    this.reset(tmx_map, level_frames, audio_files, player_frames, attack_impact_frames);

    // transitions
    this.out_transition = new Transition(1000, 255, "black", this.all_sprites);
    this.in_transition = new Transition(2000, 0, "black", this.all_sprites);
  }

  setup(tmx_map, level_frames, audio_files, player_frames, attack_impact_frames) {
    const tile = (id) => this.images[id];
    for (const [x, y, surf] of tmx_map.ground) {
      new Sprite([x * TILE_SIZE, y * TILE_SIZE], tile(surf), [this.all_sprites, this.collision_sprites], Z_VALUES.ground);
    }

    for (const [x, y, surf] of tmx_map.barrier) {
      new Sprite([x * TILE_SIZE, y * TILE_SIZE], tile(surf), this.collision_sprites);
    }

    for (const [x, y, surf] of tmx_map.fg) {
      new Sprite([x * TILE_SIZE, y * TILE_SIZE], tile(surf), this.all_sprites, Z_VALUES.fg);
    }

    for (const [x, y, surf] of tmx_map.bg) {
      new Sprite([x * TILE_SIZE, y * TILE_SIZE], tile(surf), this.all_sprites, Z_VALUES.bg);
    }

    for (const [x, y] of tmx_map.player) {
      this.player = new Player(
        [x, y],
        [this.all_sprites, this.attacking_sprites],
        this.collision_sprites,
        this.damage_sprites,
        player_frames,
        audio_files,
        attack_impact_frames.player,
        [this.level_width, this.level_height],
      );
    }

    const text_tags = TEXT_TAGS();
    for (const obj of tmx_map.objects) {
      const enemy = (EnemyClass, frames, attack_data) => new EnemyClass(
        [obj.x, obj.y],
        obj.hp,
        [this.all_sprites, this.attacking_sprites],
        this.collision_sprites,
        this.damage_sprites,
        this.player,
        frames,
        audio_files,
        attack_data,
      );

      if (obj.name === "text") {
        new Text([obj.x, obj.y], text_tags[obj.context][obj.tag], 12, this.text_sprites);
      } else if (["sbasic", "dbasic", "wbasic"].includes(obj.name)) {
        enemy(BasicSwordsman, level_frames[obj.name], attack_impact_frames.basic);
      } else if (obj.name === "samurai") {
        this.boss = enemy(BossSamurai, level_frames[obj.name], attack_impact_frames[obj.name]);
        this.boss_health_bar = new HealthBar([29, 20], obj.hp, this.ui_sprites, this.ui_frames[obj.name]);
      } else if (obj.name === "archer") {
        this.boss = enemy(BossArcher, level_frames[obj.name], attack_impact_frames[obj.name]);
        this.boss_health_bar = new HealthBar([29, 20], obj.hp, this.ui_sprites, this.ui_frames[obj.name]);
      }
    }

    new HealthBar([10, 190], PlAYER_HEALTH, this.ui_sprites, this.ui_frames.player);
    new Counter([10, 215], this.ui_frames.player.heal, this.ui_frames.player.heal_frame, this.player.max_heal, this.ui_sprites);
  }

  reset(tmx_map, level_frames, audio_files, player_frames, attack_impact_frames) {
    this.all_sprites.empty();
    this.ui_sprites.empty();
    this.collision_sprites.empty();
    this.text_sprites.empty();
    this.attacking_sprites.empty();
    this.damage_sprites.empty();

    this.in_transition = new Transition(2000, 0, "black", this.all_sprites);

    this.boss = null;
    this.boss_health_bar = null;
    this.status = "normal";
    this.setup(tmx_map, level_frames, audio_files, player_frames, attack_impact_frames);
  }

  update_ui(dt) {
    for (const sprite of this.ui_sprites) {
      if (!sprite.sustained) {
        sprite.kill();
      } else {
        sprite.update({
          hp: this.player.hp,
          count: this.player.heal_count,
          dt,
        });
      }
    }

    if (this.boss) {
      this.boss_health_bar.update({ hp: this.boss.hp });
      if (this.boss.player_found && this.boss.hp > 0) {
        this.boss_health_bar.visible = true;
      } else {
        this.boss_health_bar.visible = false;
      }
    }

    for (let count = 0; count < this.player.dash_count; count++) {
      new CounterToken([50, 215], count, this.ui_frames.player.dash, this.player.max_dash_count, this.ui_sprites);
    }
  }

  check_status() {
    if (!this.damage_sprites.length && !this.player.fallen) {
      this.status = "complete";
    } else if (this.player.fallen) {
      this.status = "fail";
    }
  }

  run(dt) {
    this.damage_sprites.empty();

    // update
    if (this.status === "normal") {
      this.attacking_sprites.update();
      this.damage_sprites.update(dt);
      this.all_sprites.update(dt);
    }
    this.update_ui(dt);
    this.check_status();

    // draw
    this.all_sprites.draw(this.display_surf, this.player.camera_rect.center);
    this.damage_sprites.draw(this.display_surf, this.player.camera_rect.center);
    this.ui_sprites.draw(this.display_surf);
    this.text_sprites.draw(this.display_surf, this.player.camera_rect.center);

    this.in_transition.draw(this.display_surf);
    this.out_transition.draw(this.display_surf);
  }
}
