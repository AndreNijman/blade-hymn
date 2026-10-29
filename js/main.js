// code/main.py. The original runs `dt = clock.tick(60) / 1000`; here the
// loop steps a fixed 60 Hz clock whose ticks are whole milliseconds
// (floor(k * 1000 / 60)), so dt alternates 16/17 ms like clock.tick does and
// every run of the same inputs plays out identically.

import { time, key, mouse, random } from "./pg.js";
import { loadAtlas } from "./surface.js";
import { MASTER_DISPLAY, GAME_WIDTH, GAME_HEIGHT, FPS } from "./constants.js";
import { initFonts } from "./font.js";
import { setSelectionIndicatorImage } from "./ui.js";
import { Timer } from "./timer.js";
import { mixer } from "./audio.js";
import { Level } from "./level.js";
import { MainMenu } from "./menu.js";
import { loadBinds, onBindsChanged } from "./settings.js";

// shell.js sets onRunComplete(level, ms) and onQuit(); boot sets startLevel(name)
export const gameHooks = {};

const SEED = 0x1337;

// every attempt starts from the same RNG state, so boss AI is fair to race
function reseed() {
  random.seed(SEED);
}

// frames in game.json are atlas image ids; fresh lists per load because the
// menu rescales the background lists in place
function resolve(node, images) {
  if (Array.isArray(node)) return node.map((id) => images[id]);
  const out = {};
  for (const [name, child] of Object.entries(node)) out[name] = resolve(child, images);
  return out;
}

class Game {
  constructor(data, images) {
    this.display_surf = MASTER_DISPLAY;
    this.quit_timer = new Timer(2000);

    // assets
    this.images = images;
    this.level_frames = resolve(data.frames.level, images);
    this.player_frames = resolve(data.frames.player, images);
    this.ui_frames = resolve(data.frames.ui, images);
    this.attack_impact_frames = data.attack_data;

    const sound = (path) => mixer.Sound(`assets/audio/${path}`);
    this.audio_files = {
      spring_bgm: sound("bgm/spring_bgm.mp3"),
      winter_bgm: sound("bgm/winter_bgm.mp3"),
      desert_bgm: sound("bgm/desert_bgm.mp3"),
      dash: sound("effects/dash.wav"),
      swing: sound("effects/swing.wav"),
      block: sound("effects/block.wav"),
    };
    this.audio_files.spring_bgm.set_volume(0.2);
    this.audio_files.swing.set_volume(0.5);

    // level data (the original's unreachable "test" stage is left out)
    this.tmx_data = data.maps;

    this.current_stage = null;
    this.stages = {
      main_menu: new MainMenu(this.level_frames.bg_tiles, this.ui_frames, this.audio_files, () => this.quit()),
    };
    for (const name of ["spring", "winter", "desert"]) {
      this.stages[name] = new Level(name, this.tmx_data[name], this.ui_frames, this.level_frames,
        this.audio_files, this.player_frames, this.attack_impact_frames, images);
    }

    // speedrun clock for the current attempt, in ticks (ms)
    this.run_timer = { armed: false, start: 0 };
    this.closed = false;

    this.set_stage("main_menu");
  }

  reset_level(level) {
    level.reset(this.tmx_data[level.name], this.level_frames, this.audio_files, this.player_frames, this.attack_impact_frames);
  }

  set_stage(stage) {
    if (this.current_stage instanceof Level) {
      this.reset_level(this.current_stage);
    }

    this.current_stage = this.stages[stage];
    this.current_stage.in_transition.start();

    mixer.stop();
    if (this.current_stage instanceof Level) {
      this.audio_files[`${this.current_stage.name}_bgm`].play(-1);
      reseed();
      this.run_timer = { armed: true, start: 0 };
    } else {
      this.run_timer = { armed: false, start: 0 };
    }
  }

  check_stage() {
    if (this.current_stage instanceof Level) {
      if (this.current_stage.status === "complete") {
        const level = this.current_stage.name;
        const ms = this.run_timer.armed ? null : time.ticks - this.run_timer.start;
        this.set_stage("main_menu");
        if (ms !== null) gameHooks.onRunComplete?.(level, ms);
      } else if (this.current_stage.status === "fail") {
        this.set_stage(this.current_stage.name);
      }
    } else if (this.current_stage instanceof MainMenu) {
      if (this.current_stage.out_transition.complete) {
        this.set_stage(this.current_stage.level_selection);
      }
    }
  }

  return_to_menu() {
    const escape = key.pressed.Escape;
    if (escape && !this.quit_timer.activated) {
      this.quit_timer.activate();
    } else if (!escape) {
      this.quit_timer.deactivate();
    }

    if (this.quit_timer.active) {
      this.set_stage("main_menu");
    }
  }

  // the run clock starts once the level has faded in
  update_run_timer() {
    const run = this.run_timer;
    if (run.armed && this.current_stage instanceof Level && !this.current_stage.in_transition.active) {
      run.armed = false;
      run.start = time.ticks;
    }
  }

  // ms on the current attempt's clock, or null outside a level
  run_ms() {
    if (!(this.current_stage instanceof Level)) return null;
    return this.run_timer.armed ? 0 : time.ticks - this.run_timer.start;
  }

  // the restart button in the page bar
  restart_attempt() {
    if (this.current_stage instanceof Level) this.set_stage(this.current_stage.name);
  }

  quit() {
    if (this.closed) return;
    this.closed = true;
    mixer.stop();
    gameHooks.onQuit?.();
  }

  // one pass of the original's while loop
  step(dt) {
    this.quit_timer.update();
    this.update_run_timer();
    this.current_stage.run(dt);
    this.check_stage();
    this.return_to_menu();
  }
}

// ---------------------------------------------------------------------------
// input: pygame.key.get_pressed() and pygame.mouse in game coordinates
// ---------------------------------------------------------------------------

const GAME_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab", "Escape"]);

function typing(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

function attachInput(canvas, paused) {
  window.addEventListener("keydown", (e) => {
    mixer.unlock();
    if (paused() || typing(e.target)) return;
    key.pressed[e.code] = true;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    delete key.pressed[e.code];
  });
  const release = () => {
    for (const code of Object.keys(key.pressed)) delete key.pressed[code];
    mouse.buttons[0] = mouse.buttons[1] = mouse.buttons[2] = false;
  };
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", release);

  // pygame keeps the last position when the pointer leaves the window
  const track = (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    mouse.pos = [
      Math.min(Math.max((e.clientX - r.left) * GAME_WIDTH / r.width, 0), GAME_WIDTH - 1),
      Math.min(Math.max((e.clientY - r.top) * GAME_HEIGHT / r.height, 0), GAME_HEIGHT - 1),
    ];
  };
  // pygame order: left, middle, right; DOM e.buttons bits: left 1, right 2, middle 4
  const buttons = (e) => {
    mouse.buttons[0] = (e.buttons & 1) !== 0;
    mouse.buttons[1] = (e.buttons & 4) !== 0;
    mouse.buttons[2] = (e.buttons & 2) !== 0;
  };
  window.addEventListener("pointermove", track);
  canvas.addEventListener("pointerdown", (e) => {
    mixer.unlock();
    if (paused()) return;
    track(e);
    buttons(e);
  });
  window.addEventListener("pointerup", buttons);
  window.addEventListener("pointercancel", release);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}

// ---------------------------------------------------------------------------
// boot + loop
// ---------------------------------------------------------------------------

async function boot() {
  const canvas = document.getElementById("game-surface");
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });

  const overlay = document.getElementById("overlay");
  const paused = () => (overlay && !overlay.hidden) || document.hidden;

  loadBinds();
  attachInput(canvas, paused);

  const data = await (await fetch("data/baked/game.json")).json();
  const images = await loadAtlas("data/baked/atlas.png", data.images);
  initFonts(data.text, images);
  setSelectionIndicatorImage(images[data.selection_indicator]);

  const game = new Game(data, images);
  window.__bladehymn_game = game;
  gameHooks.startLevel = (name) => game.set_stage(name);

  // tutorial signs spell out the bound keys; rebuild levels not being played
  // (the current attempt picks the new names up on its next restart)
  onBindsChanged(() => {
    for (const stage of Object.values(game.stages)) {
      if (stage instanceof Level && stage !== game.current_stage) game.reset_level(stage);
    }
  });

  let frame = 0; // frames simulated; time.ticks = floor(frame * 1000 / FPS)
  const timerEl = document.getElementById("run-timer");
  let shownMs;

  function present() {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(MASTER_DISPLAY.px.buffer), GAME_WIDTH, GAME_HEIGHT), 0, 0);
    const ms = game.run_ms();
    if (ms !== shownMs && timerEl) {
      shownMs = ms;
      timerEl.hidden = ms === null;
      if (ms !== null) timerEl.textContent = formatMs(ms);
    }
  }

  function tick() {
    const prev = time.ticks;
    frame += 1;
    time.ticks = Math.floor(frame * 1000 / FPS);
    game.step((time.ticks - prev) / 1000);
  }

  // test hook: advance n frames synchronously
  game.advance = (n = 1) => {
    for (let i = 0; i < n; i++) tick();
    present();
  };

  document.getElementById("loading").hidden = true;

  const frameMs = 1000 / FPS;
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    if (game.closed) return;
    if (paused()) {
      acc = 0;
    } else {
      acc = Math.min(acc + now - last, 250); // no catch-up burst after a stall
      let stepped = false;
      while (acc >= frameMs) {
        tick();
        acc -= frameMs;
        stepped = true;
      }
      if (stepped) present();
    }
    last = now;
    requestAnimationFrame(loop);
  }
  present();
  requestAnimationFrame(loop);
}

export function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

boot().catch((error) => {
  console.error(error);
  const loading = document.getElementById("loading");
  loading.hidden = false;
  loading.textContent = `Failed to load the game: ${error.message}`;
});
