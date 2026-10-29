# Bakes everything the browser port loads into data/baked/:
#   atlas.png  - every image the original game loads, packed (exact RGBA)
#   game.json  - atlas rects, frame folders, TMX maps, text bitmaps, attack data
#
# The images, maps and text are produced by pygame-ce and pytmx themselves,
# so the port draws byte-identical pixels without re-implementing PNG
# colour handling, pytmx's tile conversion/flips or SDL_ttf's text layout.
#
# Usage (needs pygame-ce, pytmx, numpy):
#   SDL_VIDEODRIVER=dummy python tools/bake.py

import hashlib, json, os, shutil, struct, tempfile, zlib

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
import numpy as np
import pygame
from pytmx.util_pygame import load_pygame

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "data", "baked")
ATLAS_WIDTH = 2048

pygame.init()
pygame.display.set_mode((1, 1))

# The TMX/TSX files reference "../../Assets/Graphics" and "../../Data" (they
# were authored on a case-insensitive file system), so work on a copy with
# the case variants linked in.
work = tempfile.mkdtemp(prefix="bladehymn-bake-")
shutil.copytree(os.path.join(REPO, "assets", "graphics"), os.path.join(work, "assets", "graphics"))
shutil.copytree(os.path.join(REPO, "data"), os.path.join(work, "data"), ignore=shutil.ignore_patterns("baked"))
os.symlink("assets", os.path.join(work, "Assets"))
os.symlink("graphics", os.path.join(work, "assets", "Graphics"))
os.symlink("data", os.path.join(work, "Data"))


# --- code/utility.py, verbatim behaviour ------------------------------------

def import_folder(*path):
    frames = []
    for folder_path, _, image_names in os.walk(os.path.join(work, *path)):
        image_names = [name for name in image_names if name.endswith(".png")]
        for image_name in sorted(image_names, key=lambda x: int(x.split('.')[0])):
            frames.append(pygame.image.load(os.path.join(folder_path, image_name)).convert_alpha())
    return frames


def import_subfolders(*path):
    frame_dict = {}
    for _, subfolders, _ in os.walk(os.path.join(work, *path)):
        for subfolder in subfolders:
            frame_dict[subfolder] = import_folder(*path, subfolder)
    return frame_dict


# --- image registry ------------------------------------------------------------

images = []          # [(w, h, rgba bytes)]
image_index = {}     # sha1 -> id


def blit_rgba(surf):
    """RGBA exactly as the surface lands when blitted onto the opaque display:
    per-pixel alpha kept, opaque surfaces alpha 255, colorkey pixels alpha 0."""
    w, h = surf.get_size()
    if surf.get_flags() & pygame.SRCALPHA:
        data = bytearray(pygame.image.tobytes(surf, "RGBA"))
    else:
        data = bytearray(pygame.image.tobytes(surf.convert(32), "RGBX"))
        for i in range(3, len(data), 4):
            data[i] = 255
        key = surf.get_colorkey()
        if key is not None:
            for i in range(0, len(data), 4):
                if data[i] == key[0] and data[i + 1] == key[1] and data[i + 2] == key[2]:
                    data[i + 3] = 0
    return w, h, bytes(data)


def register(surf):
    w, h, data = blit_rgba(surf)
    digest = hashlib.sha1(struct.pack("<II", w, h) + data).hexdigest()
    if digest not in image_index:
        image_index[digest] = len(images)
        images.append((w, h, data))
    return image_index[digest]


def register_rgba(w, h, data):
    surf = pygame.image.frombytes(bytes(data), (w, h), "RGBA")
    return register(surf)


def frame_folders(*path):
    return {name: [register(f) for f in frames] for name, frames in import_subfolders(*path).items()}


# --- Game.import_assets ----------------------------------------------------------

frames = {
    "level": {
        "sbasic": frame_folders("assets", "graphics", "enemies", "sbasic"),
        "wbasic": frame_folders("assets", "graphics", "enemies", "wbasic"),
        "dbasic": frame_folders("assets", "graphics", "enemies", "dbasic"),
        "samurai": frame_folders("assets", "graphics", "enemies", "bossSamurai"),
        "archer": frame_folders("assets", "graphics", "enemies", "bossArcher"),
        "bg_tiles": frame_folders("assets", "graphics", "background"),
    },
    "player": frame_folders("assets", "graphics", "player"),
    "ui": {
        "player": frame_folders("assets", "graphics", "ui", "player"),
        "archer": frame_folders("assets", "graphics", "ui", "bossArcher"),
        "samurai": frame_folders("assets", "graphics", "ui", "bossSamurai"),
        "menu": frame_folders("assets", "graphics", "ui", "menu"),
    },
}

# --- TMX maps (pytmx.load_pygame, as the original) ---------------------------------


def bake_map(name):
    tmx = load_pygame(os.path.join(work, "data", "tmx", f"{name}.tmx"))
    out = {
        "width": tmx.width,
        "height": tmx.height,
        "properties": dict(tmx.get_layer_by_name("data").properties),
    }
    for layer in ("ground", "barrier", "fg", "bg"):
        out[layer] = [[x, y, register(surf)] for x, y, surf in tmx.get_layer_by_name(layer).tiles()]
    out["player"] = [[obj.x, obj.y] for obj in tmx.get_layer_by_name("player")]
    objects = []
    for obj in tmx.get_layer_by_name("objects"):
        entry = {"name": obj.name, "x": obj.x, "y": obj.y}
        for prop in ("context", "tag", "hp"):
            if prop in obj.properties:
                entry[prop] = obj.properties[prop]
        objects.append(entry)
    out["objects"] = objects
    return out


maps = {name: bake_map(name) for name in ("spring", "winter", "desert")}

# --- text ----------------------------------------------------------------------------
# Text.draw renders font.render(line, False, "black"): a 1-bit glyph mask.
# Every line the game shows with the default key binds is baked exactly; for
# rebound keys (a web addition) the port lays glyphs out with these advances
# and kerning pairs, which matches SDL_ttf for almost every string.

DEFAULT_KEY_NAMES = {
    "RIGHT_KEY": "right", "LEFT_KEY": "left", "JUMP_KEY": "space",
    "DASH_KEY": "left shift", "ATTACK_KEY": "x", "HEAL_KEY": "r",
}
assert DEFAULT_KEY_NAMES == {
    "RIGHT_KEY": pygame.key.name(pygame.K_RIGHT), "LEFT_KEY": pygame.key.name(pygame.K_LEFT),
    "JUMP_KEY": pygame.key.name(pygame.K_SPACE), "DASH_KEY": pygame.key.name(pygame.K_LSHIFT),
    "ATTACK_KEY": pygame.key.name(pygame.K_x), "HEAL_KEY": pygame.key.name(pygame.K_r),
}

# code/text.py with the default names
name = DEFAULT_KEY_NAMES
TEXT_TAGS = {
    "intro": {
        "movement": f"Move with {name['RIGHT_KEY']} and {name['LEFT_KEY']}.",
        "jump": f"Jumping ({name['JUMP_KEY']}) \ncan be used to travel vertically.",
        "dash": f"Dashing ({name['DASH_KEY']}) can be \nused to travel long distances \nand gain damage invulnerability. \n\nA dash consumes a token \nthat regenerates over time.",
        "attack": f"Attack with '{name['ATTACK_KEY']}'.",
        "air_attack": f"Attacking in the air can \nprovide a vertical boost.",
        "heal": f"When damage is taken, '{name['HEAL_KEY']}' can heal you \nand consume a heal charge.",
        "level_end": "To end the level, all enemies must be defeated...",
    }
}
MENU_LABELS = ["Ve rdant Begi nni ngs", "Frosted Path", "Cri mson Desolation"]
FONT = os.path.join(work, "data", "ttf", "PixelifySans.ttf")


def text_image(font, line):
    surf = font.render(line, False, "black")
    w, h = surf.get_size()
    data = bytearray(w * h * 4)
    if w:
        for x in range(w):
            for y in range(h):
                if surf.get_at_mapped((x, y)) == 1:  # palette index 1 = foreground
                    data[(y * w + x) * 4 + 3] = 255
    return register_rgba(w, h, data) if w else None, w


def bake_font(size, lines):
    font = pygame.font.Font(FONT, size)
    chars = [chr(c) for c in range(32, 127)]
    glyphs = {}
    for c in chars:
        glyph, w = text_image(font, c)
        glyphs[c] = [glyph, font.size(c)[0]]
    kern = {}
    for a in chars:
        for b in chars:
            k = font.size(a + b)[0] - glyphs[a][1] - glyphs[b][1]
            if k:
                kern[a + b] = k
    baked = {}
    for line in lines:
        img, w = text_image(font, line)
        baked[line] = [img, w]
    return {"height": font.get_height(), "glyphs": glyphs, "kern": kern, "lines": baked}


level_lines = sorted({line for tags in TEXT_TAGS.values() for text in tags.values() for line in text.split("\n")})
text = {"12": bake_font(12, level_lines), "11": bake_font(11, MENU_LABELS)}

# --- surfaces the original builds procedurally with pygame.draw ----------------------
# ui.SelectionIndicator((size), padding=5) for button_size [120, 20]

size = [120 + 5, 20 + 5]
indicator = pygame.Surface(size, pygame.SRCALPHA)
indicator.fill("black")
pygame.draw.rect(indicator, "white", pygame.FRect(0, 0, *size), width=1, border_radius=10)
indicator.set_colorkey("black")
ind_data = bytearray(pygame.image.tobytes(indicator, "RGBA"))
for i in range(0, len(ind_data), 4):
    if ind_data[i] == 0 and ind_data[i + 1] == 0 and ind_data[i + 2] == 0:
        ind_data[i + 3] = 0
selection_indicator = register_rgba(size[0], size[1], ind_data)

with open(os.path.join(REPO, "data", "json", "attack_data.json")) as f:
    attack_data = json.load(f)

# --- pack ------------------------------------------------------------------------------

order = sorted(range(len(images)), key=lambda i: (-images[i][1], -images[i][0]))
rects = [None] * len(images)
x = y = row_h = 0
for i in order:
    w, h, _ = images[i]
    if x + w > ATLAS_WIDTH:
        x, y, row_h = 0, y + row_h, 0
    rects[i] = [x, y, w, h]
    x += w
    row_h = max(row_h, h)
atlas_h = y + row_h

atlas = bytearray(ATLAS_WIDTH * atlas_h * 4)
for i, (w, h, data) in enumerate(images):
    ax, ay = rects[i][:2]
    for row in range(h):
        start = ((ay + row) * ATLAS_WIDTH + ax) * 4
        atlas[start:start + w * 4] = data[row * w * 4:(row + 1) * w * 4]


def png_rgba(width, height, data):
    """RGBA8 PNG, per-row filter picked by the minimum-sum heuristic."""
    img = np.frombuffer(bytes(data), np.uint8).reshape(height, width * 4).astype(np.int16)
    a = np.zeros_like(img); a[:, 4:] = img[:, :-4]          # left
    b = np.zeros_like(img); b[1:] = img[:-1]                # up
    c = np.zeros_like(img); c[1:, 4:] = img[:-1, :-4]       # up-left
    pa, pb, pc = np.abs(b - c), np.abs(a - c), np.abs(a + b - 2 * c)
    paeth = np.where((pa <= pb) & (pa <= pc), a, np.where(pb <= pc, b, c))
    filtered = [(img - p) & 255 for p in (0, a, b, (a + b) >> 1, paeth)]
    cost = np.stack([np.minimum(f, 256 - f).sum(1) for f in filtered])
    best = cost.argmin(0)
    raw = bytearray()
    for r in range(height):
        raw.append(int(best[r]))
        raw += filtered[best[r]][r].astype(np.uint8).tobytes()

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
            + chunk(b"IEND", b""))


os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "atlas.png"), "wb") as f:
    f.write(png_rgba(ATLAS_WIDTH, atlas_h, atlas))

game = {
    "atlas": {"width": ATLAS_WIDTH, "height": atlas_h},
    "images": rects,
    "frames": frames,
    "maps": maps,
    "text": text,
    "selection_indicator": selection_indicator,
    "attack_data": attack_data,
}
with open(os.path.join(OUT, "game.json"), "w") as f:
    json.dump(game, f, separators=(",", ":"))

shutil.rmtree(work)
print(f"{len(images)} images, atlas {ATLAS_WIDTH}x{atlas_h}")
