// Web port entry point of Eason-F/Blade-Hymn (code/main.py).
//
// The original runs a while/clock.tick(60) loop; here a fixed 60 Hz update
// step with an accumulator reproduces it deterministically, which is what
// makes the per-level speedrun timer fair.

import { GAME_WIDTH, GAME_HEIGHT, FPS } from "./constants.js";
import { clock } from "./timer.js";
import { loadAssets } from "./assets.js";
import { loadTmx } from "./tmx.js";
import { AudioBank } from "./audio.js";
import { Player } from "./player.js"; // (kept for parity with the import graph)
import { Level } from "./level.js";
import { MainMenu } from "./menu.js";
import { Timer } from "./timer.js";
import { input, attachInput } from "./input.js";
import { loadBinds } from "./settings.js";
import { reseed } from "./random.js";
import { gameHooks } from "./shell.js";

void Player;

class Game {
  constructor() {
    this.master = document.getElementById("game-surface");
    this.master.width = GAME_WIDTH;
    this.master.height = GAME_HEIGHT;
    this.display_ctx = this.master.getContext("2d");
    this.display_ctx.imageSmoothingEnabled = false;

    this.quit_timer = new Timer(2000);

    this.current_stage = null;
    this.stages = {};

    // speedrun timing (per level attempt)
    this.run = { armed: false, running: false, startTicks: 0, finalMs: null };
  }

  async load() {
    const log = (...m) => (window.__loadLog ||= []).push(m.join(" "));
    log("assets");
    this.assets = await loadAssets();
    log("assets ok");
    const folders = this.assets.folders;
    // group("assets/graphics/player") -> { idle: [...], run: [...], ... }
    const group = (prefix) => {
      const out = {};
      for (const [key, frames] of Object.entries(folders)) {
        if (!key.startsWith(prefix + "/")) continue;
        const rest = key.slice(prefix.length + 1);
        if (!rest.includes("/")) out[rest] = frames;
      }
      return out;
    };

    // level frames (mirrors Game.import_assets)
    this.level_frames = {
      sbasic: group("assets/graphics/enemies/sbasic"),
      wbasic: group("assets/graphics/enemies/wbasic"),
      dbasic: group("assets/graphics/enemies/dbasic"),
      samurai: group("assets/graphics/enemies/bossSamurai"),
      archer: group("assets/graphics/enemies/bossArcher"),
      bg_tiles: group("assets/graphics/background"),
    };
    this.player_frames = group("assets/graphics/player");
    this.ui_frames = {
      player: group("assets/graphics/ui/player"),
      archer: group("assets/graphics/ui/bossArcher"),
      samurai: group("assets/graphics/ui/bossSamurai"),
      menu: group("assets/graphics/ui/menu"),
    };

    this.audio = new AudioBank();
    await this.audio.load();
    log("audio ok");

    const attackJson = await (await fetch("data/json/attack_data.json")).json();
    this.attack_impact_frames = attackJson;
    log("attack data ok");

    this.tmx_data = {
      test: await loadTmx("data/tmx/testmap.tmx"),
      spring: await loadTmx("data/tmx/spring.tmx"),
      winter: await loadTmx("data/tmx/winter.tmx"),
      desert: await loadTmx("data/tmx/desert.tmx"),
    };
    log("tmx ok");

    this.stages = {
      main_menu: new MainMenu(this.level_frames.bg_tiles, this.ui_frames, this.audio, this.assets.images),
      test: this.makeLevel("test"),
      spring: this.makeLevel("spring"),
      winter: this.makeLevel("winter"),
      desert: this.makeLevel("desert"),
    };
    log("stages ok");

    this.setStage("main_menu");
  }

  makeLevel(name) {
    const level = new Level(name, this.tmx_data[name], this.ui_frames, this.level_frames,
      this.audio, this.player_frames, this.attack_impact_frames, this.assets.images);
    level.display_ctx = this.display_ctx;
    return level;
  }

  setStage(stage) {
    if (this.current_stage instanceof Level) {
      this.current_stage.reset(this.tmx_data[this.current_stage.name], this.level_frames,
        this.audio, this.player_frames, this.attack_impact_frames);
    }

    this.current_stage = this.stages[stage];
    this.current_stage.in_transition.start();

    this.audio.stop();
    if (this.current_stage instanceof Level) {
      this.audio.playBgm(`${this.current_stage.name}_bgm`);
      // every attempt faces identical AI decisions, and the RNG stream starts
      // from the same state the original's first attempt sees
      reseed(0x1337);
      // a fresh attempt: the timer arms when the fade-in finishes
      this.run = { armed: true, running: false, startTicks: 0, finalMs: null };
    }
  }

  checkStage() {
    if (this.current_stage instanceof Level) {
      if (this.current_stage.status === "complete") {
        if (this.run.running) {
          this.run.finalMs = Math.round(clock.ticks - this.run.startTicks);
          this.run.running = false;
          if (gameHooks.onRunComplete) {
            gameHooks.onRunComplete(this.current_stage.name, this.run.finalMs);
          }
        }
        this.setStage("main_menu");
      } else if (this.current_stage.status === "fail") {
        this.setStage(this.current_stage.name);
      }
    } else if (this.current_stage instanceof MainMenu) {
      if (this.current_stage.out_transition.complete) {
        this.setStage(this.current_stage.level_selection);
      }
    }
  }

  returnToMenu() {
    const escapeDown = input.isDown("Escape");
    if (escapeDown && !this.quit_timer.activated) {
      this.quit_timer.activate();
    } else if (!escapeDown) {
      this.quit_timer.deactivate();
    }

    if (this.quit_timer.active) {
      this.setStage("main_menu");
    }
  }

  updateRunTimer() {
    if (this.current_stage instanceof Level && this.run.armed &&
        !this.current_stage.in_transition.active) {
      this.run.armed = false;
      this.run.running = true;
      this.run.startTicks = clock.ticks;
    }
  }

  drawRunTimer() {
    if (!(this.current_stage instanceof Level)) return;
    if (!(this.run.running || this.run.armed)) return;

    const ms = this.run.running ? clock.ticks - this.run.startTicks : 0;
    this.display_ctx.fillStyle = "#000000";
    this.display_ctx.fillRect(GAME_WIDTH - 78, 4, 74, 16);
    this.display_ctx.fillStyle = "#ffffff";
    this.display_ctx.font = "12px PixelifySans, monospace";
    this.display_ctx.textBaseline = "top";
    this.display_ctx.fillText(formatMs(ms), GAME_WIDTH - 74, 6);
  }

  step(dt) {
    clock.step();
    this.quit_timer.update();
    this.updateRunTimer();
    this.current_stage.run(dt, this.display_ctx,
      this.current_stage instanceof MainMenu ? { onStartLevel: undefined } : undefined);
    this.checkStage();
    this.returnToMenu();
    this.drawRunTimer();
  }
}

export function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

async function boot() {
  loadBinds();
  attachInput(document.getElementById("game-surface"));

  const game = new Game();
  window.__bladehymn_game = game; // for the shell (restart, debug)

  gameHooks.startAttempt = () => {
    if (game.current_stage instanceof Level) game.setStage(game.current_stage.name);
  };

  try {
    await game.load();
  } catch (error) {
    console.error(error);
    document.getElementById("loading").textContent =
      "Failed to load the game: " + error.message;
    return;
  }

  document.getElementById("loading").hidden = true;

  const frameMs = 1000 / FPS;
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    // the shell (leaderboard, keybinds, run submit) pauses the simulation
    const overlay = document.getElementById("overlay");
    if (overlay && !overlay.hidden) {
      acc = 0;
      last = now;
      requestAnimationFrame(frame);
      return;
    }
    acc += now - last;
    last = now;
    if (acc > 250) acc = 250; // don't simulate a backlog after a stall
    let steps = 0;
    while (acc >= frameMs && steps < 6) {
      game.step(frameMs / 1000);
      acc -= frameMs;
      steps++;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// resume audio on first gesture (browser autoplay policy)
const unlockOnce = () => {
  window.__bladehymn_game?.audio?.unlock();
};
window.addEventListener("pointerdown", unlockOnce);
window.addEventListener("keydown", unlockOnce);

boot();
