// Frame-time check in headless Chrome: 600 frames each of the idle menu, the
// menu with a moving pointer, and every stage with scripted play. Fails on
// page errors, on sprite groups that grow without bound, or when a frame's
// p95 goes over the budget. Pixel-exactness is tools/parity/run.mjs's job.
//
//   node tools/perf-regression.mjs        (PERF_BUDGET_MS overrides 8 ms)

import assert from "node:assert/strict";
import { openGame } from "./browser.mjs";

const budget = Number(process.env.PERF_BUDGET_MS || 8);
const game = await openGame();
try {
  const result = await game.page.evaluate(async () => {
    const { key, mouse } = await import("/js/pg.js");
    const g = window.__bladehymn_game;
    const scenarios = [];
    for (const name of ["menu-idle", "menu-moving", "spring", "winter", "desert"]) {
      for (const code of Object.keys(key.pressed)) delete key.pressed[code];
      if (!name.startsWith("menu")) g.set_stage(name);
      const times = [];
      let sprites = 0;
      for (let i = 0; i < 600; i++) {
        if (name === "menu-moving") mouse.pos = [i % 426, (i * 7) % 240];
        if (!name.startsWith("menu") && i >= 160) {
          key.pressed.ArrowRight = true;
          key.pressed.Space = i % 90 < 20;
          key.pressed.KeyX = i % 130 < 40;
          key.pressed.ShiftLeft = i % 160 === 0;
        }
        const start = performance.now();
        g.advance(1); // one simulated frame plus putImageData
        times.push(performance.now() - start);
        if (i === 100) sprites = g.current_stage.sprites?.length ?? g.current_stage.all_sprites.length;
      }
      times.sort((a, b) => a - b);
      scenarios.push({
        name,
        meanMs: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(3),
        p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(3),
        maxMs: +times.at(-1).toFixed(3),
        spritesAt100: sprites,
        spritesAt600: g.current_stage.sprites?.length ?? g.current_stage.all_sprites.length,
      });
    }
    return scenarios;
  });
  console.table(result);
  assert.deepEqual(game.errors, [], "no browser exceptions");
  for (const s of result) {
    assert.ok(s.spritesAt600 <= s.spritesAt100 + 20, `${s.name}: sprite groups keep growing`);
    assert.ok(s.p95Ms < budget, `${s.name}: p95 ${s.p95Ms} ms is over the ${budget} ms budget`);
  }
  console.log("ok");
} finally {
  await game.close();
}
