// Audio for the web port of Eason-F/Blade-Hymn.
//
// pygame.mixer.Sound.play(-1) for BGM, one-shot wav effects, and
// pygame.mixer.stop() on every stage change.

export class AudioBank {
  constructor() {
    this.bgm = {};      // name -> { el, volume }
    this.sfx = {};      // name -> AudioBuffer
    this.ctx = null;
    this.sources = new Set();
    this._started = new Set();
  }

  async load() {
    const loadBgm = async (name, file, volume) => {
      const el = new Audio(file);
      el.loop = true;
      el.preload = "auto";
      el.volume = volume;
      this.bgm[name] = { el, volume };
    };
    await Promise.all([
      loadBgm("spring_bgm", "assets/audio/bgm/spring_bgm.mp3", 0.2),
      loadBgm("winter_bgm", "assets/audio/bgm/winter_bgm.mp3", 1),
      loadBgm("desert_bgm", "assets/audio/bgm/desert_bgm.mp3", 1),
      this.loadSfx("dash", "assets/audio/effects/dash.wav"),
      this.loadSfx("swing", "assets/audio/effects/swing.wav", 0.5),
      this.loadSfx("block", "assets/audio/effects/block.wav"),
    ]);
  }

  async loadSfx(name, file, volume = 1) {
    // AudioContext is created lazily; decoding waits until a real context
    // exists (retry on first unlock).
    this.sfx[name] = { file, volume, buffer: null };
  }

  // Must be called from a user gesture handler at least once.
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      for (const name of Object.keys(this.sfx)) {
        const entry = this.sfx[name];
        if (!entry.buffer) {
          fetch(entry.file)
            .then((r) => r.arrayBuffer())
            .then((ab) => this.ctx.decodeAudioData(ab))
            .then((buffer) => { entry.buffer = buffer; })
            .catch(() => {});
        }
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  play(name) {
    const entry = this.sfx[name];
    if (!entry || !entry.buffer || !this.ctx || this.ctx.state !== "running") return;
    const source = this.ctx.createBufferSource();
    source.buffer = entry.buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = entry.volume;
    source.connect(gain).connect(this.ctx.destination);
    source.onended = () => this.sources.delete(source);
    source.start();
    this.sources.add(source);
  }

  playBgm(name) {
    const entry = this.bgm[name];
    if (!entry) return;
    this.unlock();
    if (!entry.el.paused) return;
    entry.el.currentTime = 0;
    entry.el.play().catch(() => {});
  }

  // pygame.mixer.stop(): everything stops, now.
  stop() {
    for (const entry of Object.values(this.bgm)) {
      entry.el.pause();
    }
    for (const source of this.sources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.sources.clear();
  }
}
