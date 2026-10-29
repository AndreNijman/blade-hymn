# Tools

## `bake.py` — build `data/baked/`

The port does not decode the game's PNGs, TMX maps or font at runtime. This
script loads them with pygame-ce, pytmx and SDL_ttf exactly as the original
does and writes:

- `data/baked/atlas.png`: every image the game uses, packed, with exact RGBA
- `data/baked/game.json`: atlas rects, the frame folders (in `os.walk` /
  numeric order), the three maps as tile and object lists, the text bitmaps
  for every line the game shows with the default keys, and per-glyph
  advances and kerning pairs for lines built from rebound key names

Run it after changing anything in `assets/graphics/`, `data/tmx|tsx/`,
`data/ttf/` or `data/json/`. Output is deterministic.

    SDL_VIDEODRIVER=dummy python -I tools/bake.py   # pygame-ce 2.5.8, pytmx, numpy

## `parity/` — frame-by-frame comparison with the original

`run.mjs` plays `scenario.json` through the original game (`orig.py`, under
the SDL dummy drivers) and through the port in headless Chrome, then
compares a CRC32 of every 426×240 frame and a dump of the player, enemies and
stage state. Both sides use the same stand-ins: whole-millisecond ticks of
`floor(frame * 1000 / 60)`, mulberry32 reseeded on each level start, and
scripted keys and mouse.

    git clone https://github.com/Eason-F/Blade-Hymn /path/to/orig
    cd /path/to/orig && ln -s assets Assets && ln -s graphics assets/Graphics && ln -s data Data
    BLADE_HYMN_ORIG=/path/to/orig BLADE_HYMN_PYTHON=/path/to/venv/bin/python npm run test:parity

The symlinks are needed because the original's tilesets reference
`../../Assets/Graphics` (it was written on a case-insensitive file system).
The scenario covers the menu (switching stage, parallax, sticky buttons),
all three stages, both bosses, dashing, healing, two deaths with restarts,
a stage clear and holding Esc. Expected output:

    10943 frames
    identical: every frame and state matches the original

On a difference the script prints the first differing state and saves both
renders of the first differing frame.

## `perf-regression.mjs`

Times 600 frames each of the menu and the three stages in headless Chrome
and fails on page errors, growing sprite groups, or a p95 frame time over
8 ms (`PERF_BUDGET_MS`). `browser.mjs` is the shared Chrome launcher
(`CHROME_BIN` overrides the binary).
