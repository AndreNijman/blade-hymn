# Blade Hymn — browser port

Unofficial browser port of [Blade Hymn](https://github.com/Eason-F/Blade-Hymn),
a platformer / sword-fighting game **made by Eason**. Eason designed and wrote
the original Python/Pygame game; this repository contains a faithful
JavaScript/canvas port of that game plus web-native additions:

- per-stage speedrun leaderboard (persisted in the games-guard D1 database via
  `/_guard/bladehymn-runs`),
- rebindable keys (`js/settings.js`), stored locally and synced to the signed-in
  account profile,
- credit to Eason and the original asset authors (see the page footer).

Deployed to GitHub Pages as `bladehymn.andrenijman.com` and proxied by the
[games-site](https://github.com/AndreNijman/games-site) games-guard worker.

## Asset credits (from the original's credits.txt)

- Player assets: https://xzany.itch.io/samurai-2d-pixel-art
- Boss enemy assets: https://craftpix.net/freebies/free-samurai-pixel-art-sprite-sheets
- Parallax backgrounds:
  https://ansimuz.itch.io/mountain-dusk-parallax-background
  https://free-game-assets.itch.io/nature-landscapes-free-pixel-art

## Structure

- `js/` — the port. Files mirror the original's `code/` modules 1:1
  (player.js, enemies.js, level.js, menu.js, ui.js, sprite.js, groups.js,
  timer.js, constants.js, text.js, settings.js) with the web shell in
  shell.js/leaderboard logic and the fixed-timestep loop in main.js.
- `assets/`, `data/` — unmodified assets and TMX maps from the original repo.
- `js/asset-manifest.json` — generated frame listing (numeric sort, as the
  original's import_folder does). Regenerate after adding animations.
