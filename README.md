# Blade Hymn — browser port

Unofficial browser port of [Blade Hymn](https://github.com/Eason-F/Blade-Hymn),
a platformer / sword-fighting game **made by Eason**. Eason designed and wrote
the original Python/Pygame game; this repository contains a faithful
JavaScript/canvas port of that game plus web-native additions:

- per-stage speedrun leaderboard (persisted in the games-guard D1 database via
  `/_guard/bladehymn-runs`),
- rebindable keys (`js/settings.js`), stored locally and synced to the signed-in
  account profile,
- credit to Eason and the original asset authors (the games frame and the Credits button).

Deployed to GitHub Pages as `bladehymn.andrenijman.com` and proxied by the
[games-site](https://github.com/AndreNijman/games-site) games-guard worker.

## Asset credits (from the original's credits.txt)

- Player assets: https://xzany.itch.io/samurai-2d-pixel-art
- Boss enemy assets: https://craftpix.net/freebies/free-samurai-pixel-art-sprite-sheets
- Parallax backgrounds:
  https://ansimuz.itch.io/mountain-dusk-parallax-background
  https://free-game-assets.itch.io/nature-landscapes-free-pixel-art

## How the port works

`js/` translates the original's `code/` modules line for line (player.js,
enemies.js, level.js, menu.js, ui.js, sprite.js, groups.js, timer.js,
constants.js, text.js, settings.js, main.js). Underneath them:

- `js/pg.js`: the parts of pygame-ce the game uses, with its numbers:
  float32 `FRect`s (including how its setters round), sprite groups, the
  tick clock, keyboard and mouse state, and a seeded RNG.
- `js/surface.js`: a software `Surface` with pygame-ce/SDL's integer
  blending, colour keys, surface alpha, `transform.scale` sampling and
  `flip`. Frames are drawn into one 426×240 buffer and shown with a single
  `putImageData`; the canvas is scaled up with nearest-neighbour CSS.
- `js/font.js`: text drawn from bitmaps that SDL_ttf rendered at bake time.
- `data/baked/`: images, maps and text produced by `tools/bake.py`.

The loop steps a fixed 60 Hz clock with whole-millisecond ticks, so each
frame's `dt` is 16 or 17 ms, as `clock.tick(60)` gives. The same inputs
always play out the same way, and every level start reseeds the RNG, which
keeps the boss AI fair across speedrun attempts.

`tools/parity/` plays a scripted run of about 11,000 frames through the
original game and the port and checks that every frame is pixel-identical
and that the game state matches. See `tools/README.md`.

Behaviour kept from the original: the menu is silent until you pick
another stage. Clicking the selected stage starts it. Holding Esc for two
seconds returns to the menu. Buttons stay pressed if the pointer leaves
them while held. The quit button closes the game (on the web it shows a
"closed" screen with a restart button).

Web additions, all outside the canvas: the speedrun clock and leaderboard,
rebindable keys (the tutorial signs show the bound keys), and fullscreen.

## Development

    npx serve .            # or any static server
    npm test               # frame-time regression (headless Chrome)
    npm run test:parity    # needs a checkout of the original, see tools/README.md
