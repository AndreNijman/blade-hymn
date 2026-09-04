# Parity tooling

Regression harnesses that run the ORIGINAL Python game (Eason-F/Blade-Hymn)
and this port side by side:

- `parity_orig.py` / `parity_port.mjs` — deterministic numeric parity: fixed
  60 Hz steps, a stepped fake clock, and an identical mulberry32 seed; dumps
  player/enemy state at fixed checkpoints. Diff the two JSON dumps.
- `shots_orig.py` / `shots_port.mjs` — screenshot parity at the same
  checkpoints (original runs headless via SDL dummy driver).

Running them requires a pygame-ce + pytmx venv and puppeteer-core with a
Chrome binary; paths are hardcoded to /tmp/opencode — adjust before use.

Fidelity details reproduced by the port (verify with the harnesses before
changing rendering code):

- pygame.transform.scale's exact per-pixel sampling (js/scale-maps.json,
  measured per size pair; the original double-scales the level backgrounds
  576→466→426 because its menu mutates the shared frame lists in place)
- the desaturate veil's exact SDL blend (js/veil-lut.json, measured; applied
  once over the level backdrop, once after every menu parallax layer)
- the pygame font quirk that drops 'e' glyphs at sizes ≤12: static texts
  (menu labels, tutorial lines for default binds) are pre-rendered with
  pygame; dynamic text approximates it by dropping 'e'
