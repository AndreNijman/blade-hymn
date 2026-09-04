// Deterministic PRNG (mulberry32) standing in for Python's random module.
//
// The original game uses global random for enemy AI choices. Seeding one
// instance per attempt makes every speedrun attempt of a given level face the
// same AI decisions, which keeps leaderboard times comparable.

export class Random {
  constructor(seed = 0x1337) {
    this.state = seed >>> 0;
  }

  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  randint(a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  choice(list) {
    return list[Math.floor(this.next() * list.length)];
  }
}

// The game's single shared RNG, reseeded at the start of each attempt.
export const random = new Random();

export function reseed(seed = 0x1337) {
  random.state = seed >>> 0;
}
