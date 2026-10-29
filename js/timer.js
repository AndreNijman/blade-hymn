// code/timer.py

import { time } from "./pg.js";

export class Timer {
  constructor(duration, auto_start = false, repeat = false, sustained = false) {
    this.duration = duration;
    this.repeat = repeat;
    this.sustained = sustained;

    this.activated = false;

    this.active = false;
    this.start_time = 0;
    if (auto_start) {
      this.activate();
    }

    this.time = 0;
  }

  activate() {
    this.activated = true;
    this.start_time = time.get_ticks();
    if (this.sustained) {
      this.active = true;
    }
  }

  deactivate() {
    this.activated = false;
    if (this.sustained) {
      this.active = false;
    }
  }

  update() {
    if (!this.sustained) {
      this.active = false;
    }

    const current_time = time.get_ticks();
    this.time = current_time - this.start_time;
    if (this.activated) {
      if (this.time >= this.duration) {
        this.active = true;

        if (this.repeat) {
          this.activate();
        } else {
          this.deactivate();
        }
      }
    }
  }
}
