// Procedural WebAudio SFX + one licensed music track (see MUSIC_URL).
// Music: "Deep Ocean" by MeditationSpiritual (Pixabay, royalty-free).
// File: audio/deep-ocean.mp3 — bundled locally, copied to dist/ by render.yaml.
const MUSIC_URL = 'audio/deep-ocean.mp3';
const MUSIC_VOLUME = 0.6; // 60%, as requested

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.music = null;
    this.musicOn = true;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this._startAmbience();
    this.startMusic();
  }

  // Background music: a plain <audio> element at exactly 60% volume, so
  // the requested loudness is honoured literally (not scaled again by the
  // SFX master gain). Starts on the first user gesture (init runs from
  // unlockAudio), loops forever. A missing file just never plays — the
  // game never breaks on it.
  startMusic() {
    if (this.music) { this._playMusic(); return; }
    const el = new Audio(MUSIC_URL);
    el.loop = true;
    el.volume = MUSIC_VOLUME;
    el.preload = 'auto';
    el.addEventListener('error', () => { this.music = null; });
    this.music = el;
    this._playMusic();
  }
  _playMusic() {
    if (!this.music || !this.musicOn) return;
    const p = this.music.play();
    if (p) p.catch(() => { /* autoplay blocked until a gesture; next gesture retries */ });
  }
  // Returns the new state (true = playing). Only the music track is
  // affected; the procedural SFX keep their own muted flag.
  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (!this.music) { if (this.musicOn) this.startMusic(); return this.musicOn; }
    if (this.musicOn) this._playMusic(); else this.music.pause();
    return this.musicOn;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noiseBuffer(seconds = 2) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // brown-ish noise: deeper, less hiss
      last = (last + Math.random() * 2 - 1) * 0.5;
      data[i] = last;
    }
    return buf;
  }

  _startAmbience() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(4);
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.22;
    src.connect(lp).connect(gain).connect(this.master);
    src.start();
    this.ambience = { src, gain, lp };

    // slow swell
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
  }

  _tone({ type = 'sine', from, to, dur = 0.2, gain = 0.2, filter = null }) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    let node = osc;
    if (filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      f.Q.value = filter.q ?? 1;
      node = node.connect(f);
    }
    node.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  shot() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.4);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, now);
    bp.frequency.exponentialRampToValueAtTime(260, now + 0.28);
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + 0.32);
  }

  hit() {
    this._tone({ type: 'triangle', from: 880, to: 1500, dur: 0.16, gain: 0.3 });
    this._tone({ type: 'sine', from: 220, to: 120, dur: 0.22, gain: 0.2 });
  }

  reload() {
    this._tone({ type: 'square', from: 300, to: 520, dur: 0.1, gain: 0.08, filter: { type: 'lowpass', freq: 1200 } });
  }

  alarm() {
    this._tone({ type: 'square', from: 940, to: 940, dur: 0.12, gain: 0.12 });
  }

  refill() {
    this._tone({ type: 'sine', from: 200, to: 900, dur: 0.7, gain: 0.18 });
    this._tone({ type: 'triangle', from: 100, to: 400, dur: 0.9, gain: 0.1 });
  }

  // Depth muffling: deep water swallows the high end of the ambience bed.
  setDepth(depth) {
    if (!this.ctx || !this.ambience) return;
    const d = Math.min(1, Math.max(0, depth / 33));
    const freq = 620 - d * 380;
    this.ambience.lp.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.8);
    this.ambience.gain.gain.setTargetAtTime(0.16 + d * 0.1, this.ctx.currentTime, 0.8);
  }

  ui() {
    this._tone({ type: 'sine', from: 620, to: 880, dur: 0.08, gain: 0.1 });
  }

  coin() {
    this._tone({ type: 'triangle', from: 900, to: 1320, dur: 0.14, gain: 0.16 });
    this._tone({ type: 'sine', from: 1320, to: 1760, dur: 0.18, gain: 0.1 });
  }

  cameraShutter() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.2);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    src.connect(hp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + 0.14);
  }

  sonar() {
    this._tone({ type: 'sine', from: 1500, to: 480, dur: 0.9, gain: 0.16 });
  }

  unlockSound() {
    this._tone({ type: 'triangle', from: 440, to: 660, dur: 0.12, gain: 0.14 });
    this._tone({ type: 'triangle', from: 660, to: 990, dur: 0.16, gain: 0.12 });
  }

  death() {
    this._tone({ type: 'sawtooth', from: 300, to: 40, dur: 1.4, gain: 0.3, filter: { type: 'lowpass', freq: 900 } });
  }

  dispose() {
    if (this.music) { try { this.music.pause(); } catch {} this.music = null; }
    if (!this.ctx) return;
    try { this.ambience?.src.stop(); } catch {}
    this.ctx.close();
    this.ctx = null;
  }
}
