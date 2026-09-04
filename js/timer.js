// Ported from code/timer.py of Eason-F/Blade-Hymn.
//
// The original reads pygame.time.get_ticks(). Here a deterministic game clock
// advances exactly 1000/FPS ms per fixed update step, so timer behaviour (and
// therefore speedrun replays) is identical frame for frame.

export const clock = {
  ticks: 0,
  now() {
    return this.ticks;
  },
  step() {
    this.ticks += 1000 / 60;
  },
};

export class Timer {
  constructor(duration, { auto_start = false, repeat = false, sustained = false } = {}) {
    this.duration = duration;
    this.repeat = repeat;
    this.sustained = sustained;

    this.activated = false;
    this.active = false;
    this.start_time = 0;
    this.time = 0;
    if (auto_start) this.activate();
  }

  activate() {
    this.activated = true;
    this.start_time = clock.now();
    if (this.sustained) this.active = true;
  }

  deactivate() {
    this.activated = false;
    if (this.sustained) this.active = false;
  }

  update() {
    if (!this.sustained) this.active = false;

    const current_time = clock.now();
    this.time = current_time - this.start_time;
    if (this.activated) {
      if (this.time >= this.duration) {
        this.active = true;
        if (this.repeat) this.activate();
        else this.deactivate();
      }
    }
  }
}
