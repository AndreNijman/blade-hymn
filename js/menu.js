// Ported from code/menu.py of Eason-F/Blade-Hymn.
//
// Differences from the original, both web-motivated: the desktop 'quit'
// button is omitted (a browser tab has its own close button), and stage
// selection is the hook for the speedrun features around the game.

import { GAME_WIDTH, GAME_HEIGHT } from "./constants.js";
import { Timer } from "./timer.js";
import { Sprite, Transition } from "./sprite.js";
import { Group, MenuSprites, ParallaxSprites } from "./groups.js";
import { Text, Button, SelectionIndicator } from "./ui.js";
import { surface } from "./gfx.js";
import { input } from "./input.js";

export class MainMenu {
  constructor(bg_frames, ui_frames, audio_files) {
    // groups
    this.sprites = new Group();
    this.bg_sprites = new ParallaxSprites();
    this.button_sprites = new Group();
    this.graphic_sprites = new MenuSprites();
    this.text_sprites = new TextSpritesWrapper(GAME_WIDTH, GAME_HEIGHT);

    this.timers = {
      button_click: new Timer(200, { sustained: true }),
    };

    // sound
    this.music = audio_files;

    // input
    this.mouse_pos = [0, 0];
    this.mouse_states = [false, false, false];
    this.key_states = null;

    // general
    this.button_size = [120, 20];
    this.selection_pos = [0, 0];
    this.selection_indicator = null;

    this.level_selection = "spring";
    this.out_transition = new Transition(1000, 255, "black", [this.sprites]);
    this.in_transition = new Transition(2000, 0, "black", [this.sprites]);

    this.bg_frames = {};
    for (const [name, scene] of Object.entries(bg_frames)) {
      this.bg_frames[name] = scene.map((image) => surfaceScaled(image, GAME_WIDTH + 40, GAME_HEIGHT + 40));
    }

    this.music.playBgm(`${this.level_selection}_bgm`);
    this.setup(ui_frames.menu);
  }

  setup(ui_frames) {
    new Sprite([20, -5], ui_frames.title[0], [this.sprites, this.graphic_sprites], 99);
    new Text([30, 92], "Ve rdant Begi nni ngs", 11, [this.text_sprites]);
    new Text([30, 132], "Frosted Path", 11, [this.text_sprites]);
    new Text([30, 172], "Cri mson Desolation", 11, [this.text_sprites]);

    const button_image = surfaceScaled(ui_frames.level_selection[0], this.button_size[0], this.button_size[1]);
    new Button("spring", [20, 100], button_image, [this.sprites, this.button_sprites]);
    new Button("winter", [20, 140], button_image, [this.sprites, this.button_sprites]);
    new Button("desert", [20, 180], button_image, [this.sprites, this.button_sprites]);

    this.selection_pos = [20 + this.button_size[0] / 2, 100];
    this.selection_indicator = new SelectionIndicator(
      this.selection_pos, this.button_size, 5, [this.sprites, this.graphic_sprites], 1);

    const graphic = surface(170, GAME_WIDTH);
    graphic.getContext("2d").fillStyle = "rgba(0, 0, 0, 127 / 255)";
    graphic.getContext("2d").fillRect(0, 0, 170, GAME_WIDTH);
    new Sprite([0, 0], graphic, [this.sprites, this.graphic_sprites], 0);

    this.update_bg();
  }

  check_states(onStartLevel) {
    for (const button of this.button_sprites) {
      if (button.pressed && !this.timers.button_click.active && !this.out_transition.active) {
        if (this.level_selection === button.tag) {
          this.out_transition.start();
          if (onStartLevel) onStartLevel(this.level_selection);
        } else {
          this.music.stop();
          this.music.playBgm(`${button.tag}_bgm`);
          this.level_selection = button.tag;
          this.selection_pos = button.rect.center;
        }
        this.timers.button_click.activate();
      }
    }
  }

  input() {
    this.mouse_pos = input.mousePos;
    this.mouse_states = input.mouseStates;
    this.key_states = null;
  }

  update_bg() {
    this.bg_sprites.empty();
    const frames = this.bg_frames[this.level_selection];
    for (let frame = 0; frame < frames.length; frame++) {
      new Sprite([0, 0], frames[frame], [this.sprites, this.bg_sprites], frame);
    }
  }

  update_timers() {
    for (const timer of Object.values(this.timers)) timer.update();
  }

  run(dt, display_ctx, { onStartLevel } = {}) {
    this.display_ctx = display_ctx;
    this.update_timers();

    this.input();
    this.sprites.update(dt, {
      selection_pos: this.selection_pos,
      mouse_pos: this.mouse_pos,
      mouse_states: this.mouse_states,
      key_states: this.key_states,
    });
    this.check_states(onStartLevel);
    this.update_bg();

    this.bg_sprites.draw(display_ctx, this.mouse_pos);
    this.graphic_sprites.draw(display_ctx);
    for (const button of this.button_sprites) {
      display_ctx.drawImage(button.image, Math.trunc(button.rect.x), Math.trunc(button.rect.y));
    }
    this.text_sprites.draw(display_ctx, [0, GAME_HEIGHT]);

    this.in_transition.draw(display_ctx, [0, 0]);
    this.out_transition.draw(display_ctx, [0, 0]);
  }
}

// TextSprites for the menu — camera is clamped to a screen-sized world, which
// cancels the offset out entirely (verified against the original constraint
// arithmetic), so it draws at raw positions.
class TextSpritesWrapper extends Group {
  draw(ctx, target_pos) {
    for (const sprite of this) {
      sprite.draw(ctx, [0, 0]);
    }
  }
}

function surfaceScaled(image, w, h) {
  const c = surface(w, h);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, w, h);
  return c;
}
