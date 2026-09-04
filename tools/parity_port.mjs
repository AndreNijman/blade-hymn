// Numeric-parity harness for the JS port — same scenario/checkpoints as
// parity_orig.py runs against the original Python game.
import puppeteer from "puppeteer-core";
import http from "http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOT = "/var/home/andre/Projects/site/games.andrenijman.com/blade-hymn";
const MIME = {".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".json":"application/json",".ttf":"font/ttf",".tmx":"text/xml",".tsx":"text/xml",".mp3":"audio/mpeg",".wav":"audio/wav"};
const server = http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, {"Content-Type": MIME[extname(path)] || "application/octet-stream"});
    res.end(data);
  } catch { res.writeHead(404); res.end("nope"); }
});
await new Promise((r) => server.listen(8899, r));

const browser = await puppeteer.launch({
  executablePath: "/var/home/andre/.cache/chrome-devtools-mcp/chrome-for-testing/152.0.7977.82/chrome-linux64/chrome",
  headless: "new", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("[pageerror]", (e.stack || e.message).slice(0, 400)));
await page.goto("http://127.0.0.1:8899/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForFunction(() => document.getElementById("loading").hidden === true, { timeout: 120000 });

const out = await page.evaluate(async () => {
  const g = window.__bladehymn_game;
  const { input } = await import("/js/input.js");

  const snapshot = () => {
    const st = g.current_stage;
    if (st instanceof Object.getPrototypeOf(st).constructor && st.player) {
      void st; // Level only
    }
    if (st.player) {
      const p = st.player;
      const enemies = st.all_sprites.sprites.filter((s) => s !== p && s.hp !== undefined && s.timers);
      return {
        stage: st.name,
        player: [r4(p.hitbox_rect.x), r4(p.hitbox_rect.y), r6(p.velocity.x), r6(p.velocity.y),
                 p.hp, p.state, r4(p.frame_index),
                 r4(p.camera_rect.center[0]), r4(p.camera_rect.center[1])],
        enemies: enemies.map((e) => [e.constructor.name, r4(e.hitbox_rect.x), r4(e.hitbox_rect.y),
                                     r4(e.hp), e.state, Number(e.timers.fallen.active)]),
      };
    }
    return { stage: "menu" };
  };
  const r4 = (v) => Math.round(v * 10000) / 10000;
  const r6 = (v) => Math.round(v * 1e6) / 1e6;

  const out = [];
  const step = () => g.step(1 / 60);
  const steps = (n) => { for (let i = 0; i < n; i++) step(); };

  g.setStage("spring");
  steps(160);
  out.push({ t: 400, ...snapshot() });

  for (let i = 0; i < 360; i++) {
    input.keys.add("ArrowRight");
    if (i % 90 === 0) input.keys.add("Space");
    if (i % 90 === 20) input.keys.delete("Space");
    step();
  }
  input.keys.clear();
  out.push({ t: 760, ...snapshot() });

  for (let i = 0; i < 180; i++) {
    input.keys.add("ArrowRight");
    input.keys.add("KeyX");
    step();
  }
  input.keys.clear();
  out.push({ t: 940, ...snapshot() });

  steps(120);
  out.push({ t: 1060, ...snapshot() });

  // winter + desert short runs for wider coverage
  g.setStage("winter");
  steps(160);
  out.push({ t: "w400", ...snapshot() });
  for (let i = 0; i < 300; i++) {
    input.keys.add("ArrowRight");
    if (i % 90 === 0) input.keys.add("Space");
    if (i % 90 === 20) input.keys.delete("Space");
    step();
  }
  input.keys.clear();
  out.push({ t: "w700", ...snapshot() });

  g.setStage("desert");
  steps(160);
  out.push({ t: "d400", ...snapshot() });
  for (let i = 0; i < 300; i++) {
    input.keys.add("ArrowRight");
    if (i % 90 === 0) input.keys.add("Space");
    if (i % 90 === 20) input.keys.delete("Space");
    step();
  }
  input.keys.clear();
  out.push({ t: "d700", ...snapshot() });

  return out;
});

console.log(JSON.stringify(out, null, 1));
await browser.close();
server.close();
