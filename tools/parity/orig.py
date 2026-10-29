"""Run a parity scenario through the ORIGINAL pygame game.

usage: python -I tools/parity/orig.py <Blade-Hymn checkout> <scenario.json> <out dir>

Writes <out>/orig.jsonl (one line per frame: crc32 of the 426x240 RGB frame
plus a state dump) and <out>/orig-<frame>.png for every frame listed in the
scenario's "png" array. The clock, RNG, keyboard and mouse are replaced with
the same deterministic stand-ins the browser port uses (see js/main.js).
"""

import json
import os
import sys
import zlib

orig, scenario_path, out_dir = (os.path.abspath(p) for p in sys.argv[1:4])
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
os.chdir(orig)
sys.path.insert(0, os.path.join(orig, "code"))

import pygame

pygame.init()

clock = {"ticks": 0}
pygame.time.get_ticks = lambda: clock["ticks"]


class Mulberry32:
    # js/pg.js `random`
    def __init__(self):
        self.s = 0x1337

    def seed(self, s):
        self.s = s & 0xFFFFFFFF

    def next(self):
        t = self.s = (self.s + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    def randint(self, a, b):
        return a + int(self.next() * (b - a + 1))

    def choice(self, seq):
        return seq[int(self.next() * len(seq))]


import random

rng = Mulberry32()
random.randint = rng.randint
random.choice = rng.choice

# a 426x240 window: SCALE_FACTOR 1 so mouse coordinates are game coordinates
import constants

constants.SCALE_FACTOR = 1.0
constants.WINDOW_WIDTH, constants.WINDOW_HEIGHT = 426, 240
set_mode = pygame.display.set_mode
pygame.display.set_mode = lambda size, flags=0, vsync=0: set_mode((426, 240))

mouse = {"pos": (0, 0), "pressed": (False, False, False)}
pygame.mouse.get_pos = lambda: mouse["pos"]
pygame.mouse.get_pressed = lambda num_buttons=3: mouse["pressed"]

held = set()


class Keys:
    def __getitem__(self, key):
        return key in held


pygame.key.get_pressed = lambda: Keys()

import main
from level import Level

K = pygame.constants
KEYS = {"right": K.K_RIGHT, "left": K.K_LEFT, "jump": K.K_SPACE, "dash": K.K_LSHIFT,
        "attack": K.K_x, "heal": K.K_r, "escape": K.K_ESCAPE}

game = main.Game()

# web port: every level attempt starts from the same RNG state
set_stage = game.set_stage


def reseeding_set_stage(stage):
    set_stage(stage)
    if isinstance(game.current_stage, Level):
        rng.seed(0x1337)


game.set_stage = reseeding_set_stage

frame = 0


def step():
    global frame
    prev = clock["ticks"]
    frame += 1
    clock["ticks"] = frame * 1000 // 60
    dt = (clock["ticks"] - prev) / 1000
    game.quit_timer.update()
    game.current_stage.run(dt)
    game.check_stage()
    game.return_to_menu()


def state():
    stage = game.current_stage
    if not isinstance(stage, Level):
        menu = stage
        return {"stage": "main_menu", "sel": menu.level_selection,
                "ind": list(menu.selection_indicator.rect.center)}
    p = stage.player
    return {
        "stage": stage.name, "status": stage.status,
        "p": [p.hitbox_rect.x, p.hitbox_rect.y, p.hp, p.heal_count, p.dash_count, p.state],
        "e": [[e.hitbox_rect.x, e.hitbox_rect.y, e.rect.x, e.rect.y, e.hp] for e in stage.attacking_sprites if e is not p],
        "dmg": len(stage.damage_sprites),
    }


scenario = json.load(open(scenario_path))
pngs = set(scenario.get("png", []))
log = open(os.path.join(out_dir, "orig.jsonl"), "w")
master = main.MASTER_DISPLAY

for seg in scenario["segments"]:
    if "stage" in seg:
        game.set_stage(seg["stage"])
    if "teleport" in seg:
        p = game.current_stage.player
        p.hitbox_rect.topleft = seg["teleport"]
        p.prev_rect = p.hitbox_rect.copy()
        p.rect.center = p.hitbox_rect.center
        p.camera_rect.center = p.hitbox_rect.center
    if "mouse" in seg:
        mouse["pos"] = tuple(seg["mouse"])
    mouse["pressed"] = (bool(seg.get("click")), False, False)
    for i in range(seg["frames"]):
        held.clear()
        held.update(KEYS[k] for k in seg.get("keys", []))
        for k, (period, length) in seg.get("pulse", {}).items():
            if i % period < length:
                held.add(KEYS[k])
        step()
        rgb = pygame.image.tobytes(master, "RGB")
        log.write(json.dumps({"f": frame, "crc": zlib.crc32(rgb), "s": state()}) + "\n")
        if frame in pngs:
            pygame.image.save(master, os.path.join(out_dir, f"orig-{frame}.png"))

log.close()
print(frame)
