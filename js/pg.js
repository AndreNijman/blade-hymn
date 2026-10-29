// The slice of pygame-ce that Blade Hymn uses, with pygame-ce's exact
// numeric behaviour so the game modules can be translated line for line.

const f32 = Math.fround;

// pygame.FRect stores single-precision floats: every write rounds to float32.
// Measured against pygame-ce 2.5.8: `right`/`bottom` return the double sum,
// tuple getters are computed in float, and the center/midleft setters move
// the rect by a float delta (x += c - (x + w/2)) rather than assigning.
export class FRect {
  constructor(x, y, w, h) {
    this._x = f32(x);
    this._y = f32(y);
    this._w = f32(w);
    this._h = f32(h);
  }

  static from(pos, size) {
    return new FRect(pos[0], pos[1], size[0], size[1]);
  }

  copy() {
    return new FRect(this._x, this._y, this._w, this._h);
  }

  inflate(dx, dy) {
    dx = f32(dx);
    dy = f32(dy);
    return new FRect(this._x - dx / 2, this._y - dy / 2, this._w + dx, this._h + dy);
  }

  get x() { return this._x; }
  set x(v) { this._x = f32(v); }
  get y() { return this._y; }
  set y(v) { this._y = f32(v); }
  get width() { return this._w; }
  get height() { return this._h; }

  get left() { return this._x; }
  set left(v) { this._x = f32(v); }
  get top() { return this._y; }
  set top(v) { this._y = f32(v); }
  get right() { return this._x + this._w; }
  set right(v) { this._x = f32(f32(v) - this._w); }
  get bottom() { return this._y + this._h; }
  set bottom(v) { this._y = f32(f32(v) - this._h); }

  get topleft() { return [this._x, this._y]; }
  set topleft(p) { this._x = f32(p[0]); this._y = f32(p[1]); }
  get bottomleft() { return [this._x, f32(this._y + this._h)]; }
  get bottomright() { return [f32(this._x + this._w), f32(this._y + this._h)]; }
  get center() { return [f32(this._x + this._w / 2), f32(this._y + this._h / 2)]; }
  set center(p) {
    this._x = f32(this._x + f32(f32(p[0]) - f32(this._x + this._w / 2)));
    this._y = f32(this._y + f32(f32(p[1]) - f32(this._y + this._h / 2)));
  }
  get midleft() { return [this._x, f32(this._y + this._h / 2)]; }
  set midleft(p) {
    this._x = f32(p[0]);
    this._y = f32(this._y + f32(f32(p[1]) - f32(this._y + this._h / 2)));
  }

  // pygame-ce normalises negative sizes; touching edges do not collide
  colliderect(b) {
    const a = this;
    if (a._w === 0 || a._h === 0 || b._w === 0 || b._h === 0) return false;
    const ax2 = f32(a._x + a._w), ay2 = f32(a._y + a._h);
    const bx2 = f32(b._x + b._w), by2 = f32(b._y + b._h);
    return Math.min(a._x, ax2) < Math.max(b._x, bx2) &&
      Math.min(a._y, ay2) < Math.max(b._y, by2) &&
      Math.max(a._x, ax2) > Math.min(b._x, bx2) &&
      Math.max(a._y, ay2) > Math.min(b._y, by2);
  }

  collidelist(rects) {
    for (let i = 0; i < rects.length; i++) if (this.colliderect(rects[i])) return i;
    return -1;
  }

  collideobjects(objects, key) {
    for (const o of objects) if (this.colliderect(key(o))) return o;
    return null;
  }

  collidepoint(p) {
    const px = f32(p[0]), py = f32(p[1]);
    return px >= this._x && px < f32(this._x + this._w) && py >= this._y && py < f32(this._y + this._h);
  }
}

// pygame.math.Vector2 (double precision)
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

// pygame.sprite: groups keep insertion order (a dict in pygame), and
// iterating or updating a group walks a snapshot of its members.
export class Sprite {
  constructor(groups) {
    this._groups = new Set();
    if (groups) this.add(groups);
  }

  add(groups) {
    for (const g of groups instanceof Group ? [groups] : groups) g.add(this);
  }

  groups() {
    return [...this._groups];
  }

  kill() {
    for (const g of [...this._groups]) g.remove(this);
  }

  update() {}
}

export class Group {
  constructor() {
    this.members = new Set();
  }

  sprites() {
    return [...this.members];
  }

  add(sprite) {
    if (!this.members.has(sprite)) {
      this.members.add(sprite);
      sprite._groups.add(this);
    }
  }

  remove(sprite) {
    if (this.members.delete(sprite)) sprite._groups.delete(this);
  }

  has(sprite) {
    return this.members.has(sprite);
  }

  get length() {
    return this.members.size;
  }

  [Symbol.iterator]() {
    return this.sprites()[Symbol.iterator]();
  }

  update(...args) {
    for (const sprite of this.sprites()) sprite.update(...args);
  }

  empty() {
    for (const sprite of this.sprites()) this.remove(sprite);
  }

  // each image at its rect, in insertion order
  draw(surface) {
    for (const sprite of this.members) surface.blit(sprite.image, sprite.rect.x, sprite.rect.y);
  }
}

// pygame.time.get_ticks(): the main loop advances it once per frame, in
// whole milliseconds like SDL_GetTicks.
export const time = {
  ticks: 0,
  get_ticks() {
    return this.ticks;
  },
};

// pygame.key.get_pressed() indexed by KeyboardEvent.code, and pygame.mouse
// in game-surface coordinates (the original divides by SCALE_FACTOR).
export const key = {
  pressed: Object.create(null),
  get_pressed() {
    return this.pressed;
  },
};

export const mouse = {
  pos: [0, 0],
  buttons: [false, false, false],
  get_pos() {
    return this.pos;
  },
  get_pressed() {
    return this.buttons;
  },
};

// `random` stand-in: mulberry32, reseeded per attempt so every speedrun faces
// the same AI decisions. randint/choice consume one draw each.
let rngState = 0x1337;
export const random = {
  seed(s) {
    rngState = s >>> 0;
  },
  next() {
    let t = (rngState = (rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  randint(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  },
  choice(seq) {
    return seq[Math.floor(this.next() * seq.length)];
  },
};

// math.dist: CPython rounds the Euclidean norm correctly; a double-double
// sum of squares plus one Newton correction does the same.
function split(a) {
  const c = 134217729 * a;
  const hi = c - (c - a);
  return [hi, a - hi];
}

function twoProduct(a, b) {
  const p = a * b;
  const [ah, al] = split(a);
  const [bh, bl] = split(b);
  return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl];
}

export function dist(p, q) {
  const dx = Math.abs(p[0] - q[0]), dy = Math.abs(p[1] - q[1]);
  if (dx === 0 || dy === 0) return dx + dy;
  const [x2, ex] = twoProduct(dx, dx);
  const [y2, ey] = twoProduct(dy, dy);
  const s = x2 + y2;
  const bb = s - x2;
  const lo = ((x2 - (s - bb)) + (y2 - bb)) + ex + ey;
  const h = Math.sqrt(s);
  const [hh, hl] = twoProduct(h, h);
  return h + ((s - hh) - hl + lo) / (2 * h);
}
