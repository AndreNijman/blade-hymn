// Frame-by-frame parity check: plays a scenario through the original pygame
// game (tools/parity/orig.py) and through this port in headless Chrome, and
// compares a CRC of every frame plus a state dump.
//
//   BLADE_HYMN_ORIG=/path/to/Blade-Hymn BLADE_HYMN_PYTHON=/path/to/python \
//     node tools/parity/run.mjs [scenario.json] [out dir]
//
// The python needs pygame-ce and pytmx. On the first differing frame both
// renders are saved as PNGs next to the logs.

import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { openGame } from "../browser.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const scenarioPath = resolve(process.argv[2] || `${here}/scenario.json`);
const outDir = resolve(process.argv[3] || `${tmpdir()}/blade-hymn-parity`);
const origRepo = process.env.BLADE_HYMN_ORIG;
const python = process.env.BLADE_HYMN_PYTHON || "python3";
if (!origRepo) {
  console.error("set BLADE_HYMN_ORIG to a checkout of github.com/Eason-F/Blade-Hymn");
  process.exit(2);
}
await mkdir(outDir, { recursive: true });
const scenario = JSON.parse(await readFile(scenarioPath, "utf8"));

function runOrig(png) {
  const file = `${outDir}/scenario-orig.json`;
  return writeFile(file, JSON.stringify({ ...scenario, png })).then(() => {
    const r = spawnSync(python, ["-I", `${here}/orig.py`, origRepo, file, outDir], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`orig.py failed:\n${r.stderr}`);
  });
}

async function runPort(png) {
  const { page, errors, close } = await openGame();
  try {
    const { lines, images } = await page.evaluate(async (scenario, png) => {
      const { key, mouse } = await import("/js/pg.js");
      const { MASTER_DISPLAY } = await import("/js/constants.js");
      const { Level } = await import("/js/level.js");
      const game = window.__bladehymn_game;
      const KEYS = { right: "ArrowRight", left: "ArrowLeft", jump: "Space", dash: "ShiftLeft", attack: "KeyX", heal: "KeyR", escape: "Escape" };

      const table = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
      }
      const crcRGB = (px) => {
        let c = -1;
        for (let i = 0; i < px.length; i++) {
          const p = px[i];
          c = table[(c ^ p) & 255] ^ (c >>> 8);
          c = table[(c ^ (p >>> 8)) & 255] ^ (c >>> 8);
          c = table[(c ^ (p >>> 16)) & 255] ^ (c >>> 8);
        }
        return (c ^ -1) >>> 0;
      };
      const state = () => {
        const stage = game.current_stage;
        if (!(stage instanceof Level)) {
          return { stage: "main_menu", sel: stage.level_selection, ind: [...stage.selection_indicator.rect.center] };
        }
        const p = stage.player;
        return {
          stage: stage.name, status: stage.status,
          p: [p.hitbox_rect.x, p.hitbox_rect.y, p.hp, p.heal_count, p.dash_count, p.state],
          e: stage.attacking_sprites.sprites().filter((e) => e !== p).map((e) => [e.hitbox_rect.x, e.hitbox_rect.y, e.rect.x, e.rect.y, e.hp]),
          dmg: stage.damage_sprites.length,
        };
      };
      const snapshot = () => {
        const c = document.createElement("canvas");
        c.width = 426; c.height = 240;
        c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(MASTER_DISPLAY.px.slice().buffer), 426, 240), 0, 0);
        return c.toDataURL().split(",")[1];
      };

      const lines = [], images = {}, wanted = new Set(png);
      let frame = 0;
      for (const seg of scenario.segments) {
        if (seg.stage) game.set_stage(seg.stage);
        if (seg.teleport) {
          const p = game.current_stage.player;
          p.hitbox_rect.topleft = seg.teleport;
          p.prev_rect = p.hitbox_rect.copy();
          p.rect.center = p.hitbox_rect.center;
          p.camera_rect.center = p.hitbox_rect.center;
        }
        if (seg.mouse) mouse.pos = [...seg.mouse];
        mouse.buttons[0] = !!seg.click;
        for (let i = 0; i < seg.frames; i++) {
          for (const code of Object.keys(key.pressed)) delete key.pressed[code];
          for (const k of seg.keys || []) key.pressed[KEYS[k]] = true;
          for (const [k, [period, length]] of Object.entries(seg.pulse || {})) {
            if (i % period < length) key.pressed[KEYS[k]] = true;
          }
          game.advance(1);
          frame++;
          lines.push(JSON.stringify({ f: frame, crc: crcRGB(MASTER_DISPLAY.px), s: state() }));
          if (wanted.has(frame)) images[frame] = snapshot();
        }
      }
      return { lines, images };
    }, scenario, png);
    if (errors.length) throw new Error(`page errors: ${errors.join("\n")}`);
    await writeFile(`${outDir}/port.jsonl`, lines.join("\n") + "\n");
    for (const [frame, b64] of Object.entries(images)) {
      await writeFile(`${outDir}/port-${frame}.png`, Buffer.from(b64, "base64"));
    }
    return lines;
  } finally {
    await close();
  }
}

const png = scenario.png || [];
await runOrig(png);
const portLines = await runPort(png);
const origLines = (await readFile(`${outDir}/orig.jsonl`, "utf8")).trim().split("\n");

let firstPixel = null, firstState = null;
for (let i = 0; i < Math.max(origLines.length, portLines.length); i++) {
  const o = origLines[i] ? JSON.parse(origLines[i]) : null;
  const p = portLines[i] ? JSON.parse(portLines[i]) : null;
  if (!o || !p) { firstState ??= { frame: i + 1, orig: o, port: p }; break; }
  if (firstState === null && JSON.stringify(o.s) !== JSON.stringify(p.s)) firstState = { frame: o.f, orig: o.s, port: p.s };
  if (firstPixel === null && o.crc !== p.crc) firstPixel = o.f;
  if (firstPixel !== null && firstState !== null) break;
}

console.log(`${origLines.length} frames`);
if (firstState) console.log("first state difference:", JSON.stringify(firstState, null, 1));
if (firstPixel !== null) {
  console.log(`first pixel difference at frame ${firstPixel}; saving both renders to ${outDir}`);
  await runOrig([firstPixel]);
  await runPort([firstPixel]);
}
if (firstState || firstPixel !== null) process.exit(1);
console.log("identical: every frame and state matches the original");
