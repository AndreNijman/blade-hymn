# Screenshot harness for the ORIGINAL game (same scenario as parity_orig.py).
import os, sys, json

REPO = "/tmp/opencode/bh2"
os.chdir(REPO)
sys.path.insert(0, os.path.join(REPO, "code"))

import pygame
pygame.init()

state = {"ticks": 0}
pygame.time.get_ticks = lambda: state["ticks"]

import random
class Mulberry32:
    def __init__(self, seed=0x1337): self.s = seed & 0xFFFFFFFF
    def next(self):
        t = (self.s + 0x6D2B79F5) & 0xFFFFFFFF
        self.s = t
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    def randint(self, a, b): return a + int(self.next() * (b - a + 1))
    def choice(self, seq): return seq[int(self.next() * len(seq))]
rng = Mulberry32(); random.randint = rng.randint; random.choice = rng.choice

import constants
constants.SCALE_FACTOR = 1.0
constants.WINDOW_WIDTH = 426
constants.WINDOW_HEIGHT = 240
orig_set_mode = pygame.display.set_mode
pygame.display.set_mode = lambda size, flags=0, vsync=0: orig_set_mode(size)

mouse = {"pos": (0, 0), "pressed": (0, 0, 0)}
pygame.mouse.get_pos = lambda: mouse["pos"]
pygame.mouse.get_pressed = lambda: mouse["pressed"]

import main as game_module
game = game_module.Game()
MASTER = game_module.MASTER_DISPLAY

DT = 1 / 60
held = set()
class FakeKeys:
    def __getitem__(self, key): return 1 if key in held else 0
pygame.key.get_pressed = lambda: FakeKeys()
K = pygame.constants
KEYMAP = {"right": K.K_RIGHT, "left": K.K_LEFT, "jump": K.K_SPACE,
          "dash": K.K_LSHIFT, "attack": K.K_x, "heal": K.K_r}

def step():
    state["ticks"] += 1000 / 60
    game.quit_timer.update()
    game.current_stage.run(DT)
    game.check_stage()
    game.return_to_menu()

def snap(name):
    pygame.image.save(MASTER, f"/tmp/opencode/shots/{name}.png")

os.makedirs("/tmp/opencode/shots", exist_ok=True)

for _ in range(180):
    step()
snap("orig-180-menu")

mouse["pos"] = (80, 100)
mouse["pressed"] = (1, 0, 0)
step()
mouse["pressed"] = (0, 0, 0)
for _ in range(90):
    step()
for _ in range(130):
    step()
snap("orig-400-spring")

for i in range(360):
    held.add(KEYMAP["right"])
    if i % 90 == 0: held.add(KEYMAP["jump"])
    if i % 90 == 20: held.discard(KEYMAP["jump"])
    step()
held.clear()
snap("orig-760-spring")

for i in range(180):
    held.add(KEYMAP["right"]); held.add(KEYMAP["attack"])
    step()
held.clear()
snap("orig-940-spring")

game.set_stage("winter")
for _ in range(160):
    step()
snap("orig-w400-winter")
for i in range(300):
    held.add(KEYMAP["right"])
    if i % 90 == 0: held.add(KEYMAP["jump"])
    if i % 90 == 20: held.discard(KEYMAP["jump"])
    step()
held.clear()
snap("orig-w700-winter")

game.set_stage("desert")
for _ in range(160):
    step()
snap("orig-d400-desert")
for i in range(300):
    held.add(KEYMAP["right"])
    if i % 90 == 0: held.add(KEYMAP["jump"])
    if i % 90 == 20: held.discard(KEYMAP["jump"])
    step()
held.clear()
snap("orig-d700-desert")

print("done")
