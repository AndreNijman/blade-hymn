# Numeric-parity harness for the original Blade Hymn (Eason-F/Blade-Hymn).
import os, sys, json

REPO = "/tmp/opencode/bh2"
os.chdir(REPO)
sys.path.insert(0, os.path.join(REPO, "code"))

import pygame
pygame.init()

# --- deterministic clock: stepped fake ticks (must precede game imports) ----
state = {"ticks": 0}
pygame.time.get_ticks = lambda: state["ticks"]

# --- deterministic RNG identical to the port's mulberry32 -------------------
class Mulberry32:
    def __init__(self, seed=0x1337):
        self.s = seed & 0xFFFFFFFF
    def next(self):
        t = (self.s + 0x6D2B79F5) & 0xFFFFFFFF
        self.s = t
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    def randint(self, a, b):
        return a + int(self.next() * (b - a + 1))
    def choice(self, seq):
        return seq[int(self.next() * len(seq))]

import random
rng = Mulberry32()
random.randint = rng.randint
random.choice = rng.choice

# --- display: plain 426x240, scale factor 1, patched before game imports ----
import constants
constants.SCALE_FACTOR = 1.0
constants.WINDOW_WIDTH = 426
constants.WINDOW_HEIGHT = 240
orig_set_mode = pygame.display.set_mode
pygame.display.set_mode = lambda size, flags=0, vsync=0: orig_set_mode(size)

# --- scripted mouse ---------------------------------------------------------
mouse = {"pos": (0, 0), "pressed": (0, 0, 0)}
pygame.mouse.get_pos = lambda: mouse["pos"]
pygame.mouse.get_pressed = lambda: mouse["pressed"]

import main as game_module
game = game_module.Game()

DT = 1 / 60
TICK = 1000 / 60.0

held = set()
class FakeKeys:
    def __getitem__(self, key):
        return 1 if key in held else 0
pygame.key.get_pressed = lambda: FakeKeys()
K = pygame.constants
KEYMAP = {"right": K.K_RIGHT, "left": K.K_LEFT, "jump": K.K_SPACE,
          "dash": K.K_LSHIFT, "attack": K.K_x, "heal": K.K_r}

def step():
    state["ticks"] += TICK
    game.quit_timer.update()
    game.current_stage.run(DT)
    game.check_stage()
    game.return_to_menu()

def snapshot():
    st = game.current_stage
    if hasattr(st, "player"):
        p = st.player
        enemies = [s for s in st.all_sprites.sprites() if s is not p and hasattr(s, "hp")]
        return {
            "stage": getattr(st, "name", "menu"),
            "player": [round(p.hitbox_rect.x, 4), round(p.hitbox_rect.y, 4),
                       round(p.velocity.x, 6), round(p.velocity.y, 6),
                       p.hp, p.state, round(p.frame_index, 4),
                       round(p.camera_rect.center[0], 4), round(p.camera_rect.center[1], 4)],
            "enemies": [[type(e).__name__, round(e.hitbox_rect.x, 4), round(e.hitbox_rect.y, 4),
                         round(e.hp, 4), e.state, int(e.timers["fallen"].active)] for e in enemies],
        }
    return {"stage": "menu"}

out = []
for _ in range(180):
    step()
out.append({"t": 180, **snapshot()})

# one click on the selected spring button starts the level
mouse["pos"] = (80, 100)
mouse["pressed"] = (1, 0, 0)
step()
mouse["pressed"] = (0, 0, 0)
for _ in range(90):   # 1s out transition -> level
    step()
for _ in range(130):  # 2s fade-in (2000ms) + margin
    step()
out.append({"t": 400, **snapshot()})

for i in range(360):
    held.add(KEYMAP["right"])
    if i % 90 == 0:
        held.add(KEYMAP["jump"])
    if i % 90 == 20:
        held.discard(KEYMAP["jump"])
    step()
held.clear()
out.append({"t": 760, **snapshot()})

for i in range(180):
    held.add(KEYMAP["right"])
    held.add(KEYMAP["attack"])
    step()
held.clear()
out.append({"t": 940, **snapshot()})

for _ in range(120):
    step()
out.append({"t": 1060, **snapshot()})

# winter + desert coverage (same as the port harness)
game.set_stage("winter")
for _ in range(160):
    step()
out.append({"t": "w400", **snapshot()})
for i in range(300):
    held.add(KEYMAP["right"])
    if i % 90 == 0:
        held.add(KEYMAP["jump"])
    if i % 90 == 20:
        held.discard(KEYMAP["jump"])
    step()
held.clear()
out.append({"t": "w700", **snapshot()})

game.set_stage("desert")
for _ in range(160):
    step()
out.append({"t": "d400", **snapshot()})
for i in range(300):
    held.add(KEYMAP["right"])
    if i % 90 == 0:
        held.add(KEYMAP["jump"])
    if i % 90 == 20:
        held.discard(KEYMAP["jump"])
    step()
held.clear()
out.append({"t": "d700", **snapshot()})

print(json.dumps(out))
