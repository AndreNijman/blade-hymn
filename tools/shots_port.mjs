// Screenshot harness for the JS port — same scenario as shots_orig.py.
import puppeteer from "puppeteer-core";
import http from "http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { mkdir } from "node:fs/promises";

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
await mkdir("/tmp/opencode/shots", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/var/home/andre/.cache/chrome-devtools-mcp/chrome-for-testing/152.0.7977.82/chrome-linux64/chrome",
  headless: "new", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("[pageerror]", (e.stack || e.message).slice(0, 300)));
await page.setViewport({ width: 900, height: 600 });
await page.goto("http://127.0.0.1:8899/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForFunction(() => document.getElementById("loading").hidden === true, { timeout: 120000 });

const save = async (name) => {
  const dataUrl = await page.evaluate(() => document.getElementById("game-surface").toDataURL("image/png"));
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  await (await import("node:fs/promises")).writeFile(`/tmp/opencode/shots/${name}.png`, Buffer.from(b64, "base64"));
};

// pause the realtime rAF loop so stepping is fully deterministic
await page.evaluate(() => { window.__pause = true; });

// the rAF loop checks the overlay; simplest deterministic switch: stop it by
// overriding requestAnimationFrame-driven loop via the game's step only
// (we just run our own steps; the rAF loop also runs but its steps are the
// same fixed step — to keep frame counts exact we neutralise it)
await page.evaluate(() => {
  // block the rAF loop by hiding the canvas behind the overlay is not needed:
  // instead we replace the loop's entry point
  const g = window.__bladehymn_game;
  g.__originalStep = g.step;
  g.step = () => { /* no-op: we call __originalStep ourselves */ };
});

await page.evaluate(async () => {
  const g = window.__bladehymn_game;
  const input = await import("/js/input.js").then((m) => m.input);
  const steps = (n) => { for (let i = 0; i < n; i++) g.__originalStep(1 / 60); };
  window.__steps = steps;
  window.__input = input;
  window.__snap = () => {};
  steps(180);
});
await save("port-180-menu");

await page.evaluate(() => { window.__bladehymn_game.setStage("spring"); window.__steps(160); });
await save("port-400-spring");

await page.evaluate(() => {
  const input = window.__input;
  const g = window.__bladehymn_game;
  for (let i = 0; i < 360; i++) {
    input.keys.add("ArrowRight");
    if (i % 90 === 0) input.keys.add("Space");
    if (i % 90 === 20) input.keys.delete("Space");
    g.__originalStep(1 / 60);
  }
  input.keys.clear();
});
await save("port-760-spring");

await page.evaluate(() => {
  const input = window.__input;
  const g = window.__bladehymn_game;
  for (let i = 0; i < 180; i++) {
    input.keys.add("ArrowRight");
    input.keys.add("KeyX");
    g.__originalStep(1 / 60);
  }
  input.keys.clear();
});
await save("port-940-spring");

await page.evaluate(() => { window.__bladehymn_game.setStage("winter"); window.__steps(160); });
await save("port-w400-winter");
await page.evaluate(() => {
  const input = window.__input;
  const g = window.__bladehymn_game;
  for (let i = 0; i < 300; i++) {
    input.keys.add("ArrowRight");
    if (i % 90 === 0) input.keys.add("Space");
    if (i % 90 === 20) input.keys.delete("Space");
    g.__originalStep(1 / 60);
  }
  input.keys.clear();
});
await save("port-w700-winter");

await page.evaluate(() => { window.__bladehymn_game.setStage("desert"); window.__steps(160); });
await save("port-d400-desert");
await page.evaluate(() => {
  const input = window.__input;
  const g = window.__bladehymn_game;
  for (let i = 0; i < 300; i++) {
    input.keys.add("ArrowRight");
    if (i % 90 === 0) input.keys.add("Space");
    if (i % 90 === 20) input.keys.delete("Space");
    g.__originalStep(1 / 60);
  }
  input.keys.clear();
});
await save("port-d700-desert");

await browser.close();
server.close();
console.log("done");
