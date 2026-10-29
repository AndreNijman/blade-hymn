// code/menu.py

import { Group, key, mouse } from "./pg.js";
import { Surface, scale } from "./surface.js";
import { MASTER_DISPLAY, GAME_WIDTH, GAME_HEIGHT } from "./constants.js";
import { Sprite, Transition } from "./sprite.js";
import { MenuSprites, ParallaxSprites, TextSprites } from "./groups.js";
import { Button, SelectionIndicator, Text } from "./ui.js";
import { Timer } from "./timer.js";
import { mixer } from "./audio.js";

export class MainMenu {
  constructor(bg_frames, ui_frames, audio_files, onQuit) {
    this.display_surf = MASTER_DISPLAY;
    this.onQuit = onQuit;

    // groups
    this.sprites = new Group();
    this.bg_sprites = new ParallaxSprites();
    this.button_sprites = new Group();
    this.graphic_sprites = new MenuSprites();
    this.text_sprites = new TextSprites(GAME_WIDTH, GAME_HEIGHT);

    this.timers = {
      button_click: new Timer(200, false, false, true),
    };

    // sound
    this.music = audio_files;

    // input
    this.mouse_pos = [0, 0];
    this.mouse_states = null;
    this.key_states = null;

    // general
    this.button_size = [120, 20];
    this.selection_pos = [0, 0];
    this.selection_indicator = null;

    this.level_selection = "spring"; // number representing dictionary key in level selector
    this.out_transition = new Transition(1000, 255, "black", this.sprites);
    this.in_transition = new Transition(2000, 0, "black", this.sprites);

    // the original rescales the shared background frame lists in place, so
    // the levels built after the menu scale these again (576 -> 466 -> 426)
    for (const name of Object.keys(bg_frames)) {
      bg_frames[name] = bg_frames[name].map((image) => scale(image, GAME_WIDTH + 40, GAME_HEIGHT + 40));
    }
    this.bg_frames = bg_frames;

    this.music[`${this.level_selection}_bgm`].play(-1);
    this.setup(ui_frames.menu);
  }

  setup(ui_frames) {
    new Sprite([20, -5], ui_frames.title[0], [this.sprites, this.graphic_sprites], 99);
    new Text([30, 92], "Ve rdant Begi nni ngs", 11, this.text_sprites);
    new Text([30, 132], "Frosted Path", 11, this.text_sprites);
    new Text([30, 172], "Cri mson Desolation", 11, this.text_sprites);

    ui_frames.level_selection[0] = scale(ui_frames.level_selection[0], ...this.button_size);
    new Button("spring", [20, 100], ui_frames.level_selection[0], [this.sprites, this.button_sprites]);
    new Button("winter", [20, 140], ui_frames.level_selection[0], [this.sprites, this.button_sprites]);
    new Button("desert", [20, 180], ui_frames.level_selection[0], [this.sprites, this.button_sprites]);
    new Button("quit", [400, 20], ui_frames.quit[0], [this.sprites, this.button_sprites]);

    this.selection_pos = [20 + this.button_size[0] / 2, 100];
    this.selection_indicator = new SelectionIndicator(this.selection_pos, this.button_size, 5, [this.sprites, this.graphic_sprites], 1);

    const graphic = new Surface(170, GAME_WIDTH, true); graphic.fill([0, 0, 0, 127]);
    new Sprite([0, 0], graphic, [this.sprites, this.graphic_sprites], 0);

    this.update_bg();
  }

  check_states() {
    for (const button of this.button_sprites) {
      if (button.pressed && !this.timers.button_click.active && !this.out_transition.active) {
        if (this.level_selection === button.tag) {
          this.out_transition.start();
        } else {
          if (this.level_selection !== button.tag && button.tag !== "quit") {
            mixer.stop();
            this.music[`${button.tag}_bgm`].play(-1);
          }

          this.level_selection = button.tag;
          this.selection_pos = button.rect.center;
        }
        this.timers.button_click.activate();
      }
    }

    if (this.level_selection === "quit") {
      // pygame.quit(); sys.exit(): the page shell shows the closed game
      this.onQuit();
      return true;
    }
    return false;
  }

  input() {
    this.mouse_pos = [...mouse.get_pos()];
    this.mouse_states = mouse.get_pressed();
    this.key_states = key.get_pressed();
  }

  // Rebuilt every frame like the original. The original also adds these
  // sprites to self.sprites and never removes them; that list only grows
  // and is never drawn, so the port leaves them out of it.
  update_bg() {
    this.bg_sprites.empty();
    const frames = this.bg_frames[this.level_selection];
    for (let frame = 0; frame < frames.length; frame++) {
      new Sprite([0, 0], frames[frame], this.bg_sprites, frame);
    }
  }

  update_timers() {
    for (const timer of Object.values(this.timers)) {
      timer.update();
    }
  }

  run(dt) {
    this.update_timers();

    this.input();
    this.sprites.update(dt, {
      selection_pos: this.selection_pos,
      mouse_pos: this.mouse_pos,
      mouse_states: this.mouse_states,
      key_states: this.key_states,
    });
    if (this.check_states()) return; // quit ends the frame, as sys.exit does
    this.update_bg();

    this.bg_sprites.draw(this.display_surf, this.mouse_pos);
    this.graphic_sprites.draw(this.display_surf);
    this.button_sprites.draw(this.display_surf);
    this.text_sprites.draw(this.display_surf, [0, GAME_HEIGHT]);

    this.in_transition.draw(this.display_surf);
    this.out_transition.draw(this.display_surf);
  }
}
