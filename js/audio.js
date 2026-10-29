// pygame.mixer for the web: Sound.play(loops), Sound.set_volume and
// mixer.stop(). Effects are decoded into WebAudio buffers so overlapping
// plays mix like mixer channels; the long BGM tracks stream through <audio>
// elements and are only fetched when first played.

const CHANNELS = 8; // pygame.mixer default; play() is dropped when all are busy

let ctx = null;
const playing = new Set(); // { stop() } for every sound on a channel

function context() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) ctx = new AudioCtx();
  }
  return ctx;
}

class EffectSound {
  constructor(url) {
    this.volume = 1;
    this.buffer = null;
    const ac = context();
    if (ac) {
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => ac.decodeAudioData(data))
        .then((buffer) => { this.buffer = buffer; })
        .catch(() => {});
    }
  }

  set_volume(volume) {
    this.volume = volume;
  }

  play(loops = 0) {
    if (!this.buffer || ctx.state !== "running" || playing.size >= CHANNELS) return;
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = loops !== 0;
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    source.connect(gain).connect(ctx.destination);
    const channel = { stop: () => { try { source.stop(); } catch { /* ended */ } } };
    source.onended = () => playing.delete(channel);
    playing.add(channel);
    source.start();
  }
}

class StreamSound {
  constructor(url) {
    this.url = url;
    this.volume = 1;
    this.el = null;
  }

  set_volume(volume) {
    this.volume = volume;
    if (this.el) this.el.volume = volume;
  }

  play(loops = 0) {
    if (playing.size >= CHANNELS) return;
    if (!this.el) {
      this.el = new Audio(this.url);
      this.el.preload = "auto";
    }
    const el = this.el;
    el.loop = loops !== 0;
    el.volume = this.volume;
    el.currentTime = 0;
    const channel = { stop: () => el.pause() };
    el.onended = () => playing.delete(channel);
    playing.add(channel);
    el.play().catch(() => playing.delete(channel));
  }
}

export const mixer = {
  Sound(url) {
    return url.endsWith(".wav") ? new EffectSound(url) : new StreamSound(url);
  },

  stop() {
    for (const channel of playing) channel.stop();
    playing.clear();
  },

  // browsers keep audio suspended until a user gesture
  unlock() {
    const ac = context();
    if (ac && ac.state === "suspended") ac.resume();
  },
};
