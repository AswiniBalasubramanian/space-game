// Fully procedural WebAudio: warm pad chords + a gentle music-box melody per
// world, wind bed, and small sound effects. No audio files needed.

const SCALES = {
  entry: { root: 57, chord: [0, 7, 12, 16], scale: [0, 2, 4, 7, 9, 12, 14, 16], tempo: 1.1, wind: 0.05 },
  home: { root: 60, chord: [0, 4, 7, 11], scale: [0, 2, 4, 7, 9, 12, 14, 16], tempo: 0.95, wind: 0.04 },
  space: { root: 50, chord: [0, 7, 14, 19], scale: [0, 2, 7, 9, 12, 14, 19, 21], tempo: 1.7, wind: 0.0 },
  farm: { root: 62, chord: [0, 4, 7, 14], scale: [0, 2, 4, 7, 9, 12, 14, 16], tempo: 0.8, wind: 0.07 },
  knowledge: { root: 64, chord: [0, 7, 11, 16], scale: [0, 2, 4, 6, 7, 11, 12, 14], tempo: 0.7, wind: 0.03 },
  hunger: { root: 57, chord: [0, 3, 7, 10], scale: [0, 3, 5, 7, 10, 12, 15], tempo: 1.3, wind: 0.09 },
  finale: { root: 60, chord: [0, 4, 7, 9, 14], scale: [0, 2, 4, 7, 9, 12, 14, 16, 19], tempo: 0.9, wind: 0.02 },
};

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioSystem {
  constructor() { this.ctx = null; this.muted = false; this.pads = []; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.55;
    this.reverb.connect(this.revGain).connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.5;
    this.music.connect(this.master); this.music.connect(this.reverb);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.6;
    this.sfx.connect(this.master); this.sfx.connect(this.reverb);
    // wind bed
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(4); noise.loop = true;
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    noise.connect(this.windFilter).connect(this.wind).connect(this.master);
    noise.start();
    // engine hum
    this.engOsc = ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 55;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 300;
    this.eng = ctx.createGain(); this.eng.gain.value = 0;
    this.engOsc.connect(this.engFilter).connect(this.eng).connect(this.sfx);
    this.engOsc.start();
    this.nextNote = 0;
    this.timer = setInterval(() => this.tick(), 120);
    if (this.pendingMood) this.setMood(this.pendingMood);
  }

  impulse(sec) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  }

  noiseBuffer(sec) {
    const ctx = this.ctx, len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
    return b;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.1);
    return this.muted;
  }

  setMood(key) {
    if (!this.ctx) { this.pendingMood = key; return; }
    const m = SCALES[key] || SCALES.home;
    this.mood = m;
    const now = this.ctx.currentTime;
    for (const p of this.pads) { p.g.gain.setTargetAtTime(0, now, 1.2); p.o.forEach((o) => o.stop(now + 5)); }
    this.pads = [];
    for (const n of m.chord) {
      const g = this.ctx.createGain(); g.gain.value = 0;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      o1.type = 'sine'; o2.type = 'triangle';
      o1.frequency.value = midi(m.root - 12 + n); o2.frequency.value = midi(m.root - 12 + n) * 1.003;
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = 0.07 + Math.random() * 0.08; lg.gain.value = 0.012;
      lfo.connect(lg).connect(g.gain);
      o1.connect(f); o2.connect(f); f.connect(g).connect(this.music);
      o1.start(); o2.start(); lfo.start();
      g.gain.setTargetAtTime(0.028, now, 2.5);
      this.pads.push({ g, o: [o1, o2, lfo] });
    }
    this.wind.gain.setTargetAtTime(m.wind, now, 1.5);
  }

  tick() {
    if (!this.mood || this.muted || this.silent) return;
    const now = this.ctx.currentTime;
    if (now < this.nextNote) return;
    const m = this.mood;
    const n = m.scale[Math.floor(Math.random() * m.scale.length)];
    this.pluck(midi(m.root + 12 + n), 0.07, 2.4);
    if (Math.random() < 0.3) this.pluck(midi(m.root + n), 0.04, 3);
    this.nextNote = now + m.tempo * (0.5 + Math.random() * 1.1) * (Math.random() < 0.15 ? 3 : 1);
  }

  pluck(freq, vol = 0.1, decay = 1.5, type = 'sine', dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o2.type = 'sine'; o2.frequency.value = freq * 2.01;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); o2.connect(g2).connect(g); g.connect(dest || this.music);
    o.start(t); o2.start(t); o.stop(t + decay + 0.1); o2.stop(t + decay + 0.1);
  }

  chime(good = 1) {
    if (!this.ctx) return;
    const base = good ? 76 : 69;
    [0, 4, 7].forEach((n, i) => setTimeout(() => this.pluck(midi(base + n), 0.08, 1.2, 'sine', this.sfx), i * 70));
  }
  blip() { this.pluck(midi(84 + Math.floor(Math.random() * 3)), 0.025, 0.25, 'sine', this.sfx); }
  pick() { this.pluck(midi(72 + [0, 2, 4, 7][Math.floor(Math.random() * 4)]), 0.09, 0.6, 'triangle', this.sfx); }
  bell() { this.pluck(midi(88), 0.12, 4, 'sine', this.sfx); }
  reward() {
    if (!this.ctx) return;
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => setTimeout(() => this.pluck(midi(67 + n), 0.07, 2.5, 'sine', this.sfx), i * 110));
  }

  whoosh(dur = 2.5, up = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer(dur + 0.5);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(up ? 200 : 2000, t); f.frequency.exponentialRampToValueAtTime(up ? 2400 : 150, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(this.sfx); src.start(t); src.stop(t + dur + 0.2);
  }

  rumble(dur = 3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(38, t); o.frequency.linearRampToValueAtTime(28, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.1);
  }

  // Duck everything for the "silence" beat inside a black hole.
  silence(on) {
    if (!this.ctx) return;
    this.silent = on;
    this.music.gain.setTargetAtTime(on ? 0 : 0.5, this.ctx.currentTime, on ? 0.15 : 1.2);
    this.wind.gain.setTargetAtTime(on ? 0 : this.mood?.wind ?? 0, this.ctx.currentTime, 0.3);
  }

  engine(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.eng.gain.setTargetAtTime(level > 0 ? 0.03 + level * 0.05 : 0, t, 0.2);
    this.engOsc.frequency.setTargetAtTime(50 + level * 70, t, 0.2);
    this.engFilter.frequency.setTargetAtTime(250 + level * 600, t, 0.2);
  }
}
