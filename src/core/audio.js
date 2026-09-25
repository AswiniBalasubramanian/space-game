// Fully procedural WebAudio: ambient pads, music-box bells, wind, engine and SFX.
// No audio files are loaded — everything is synthesised so the game stays light.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

const MOODS = {
  title:     { chord: [45, 52, 57, 64, 71], scale: [69, 71, 73, 76, 78, 81, 83, 85], wind: 0.0, pad: 0.10, cutoff: 900, bells: 3.6 },
  home:      { chord: [48, 55, 60, 64, 67], scale: [72, 74, 76, 79, 81, 84, 86, 88], wind: 0.015, pad: 0.08, cutoff: 1100, bells: 5.0 },
  space:     { chord: [38, 45, 50, 57, 62], scale: [74, 76, 81, 83, 86, 88, 93], wind: 0.0, pad: 0.12, cutoff: 700, bells: 4.2 },
  farm:      { chord: [43, 50, 55, 59, 62], scale: [67, 69, 71, 74, 76, 79, 81, 83], wind: 0.03, pad: 0.07, cutoff: 1500, bells: 3.2 },
  knowledge: { chord: [41, 48, 53, 57, 64], scale: [65, 67, 69, 71, 72, 76, 77, 79, 83], wind: 0.01, pad: 0.08, cutoff: 1800, bells: 2.6 },
  hunger:    { chord: [40, 47, 52, 55, 59], scale: [64, 67, 69, 71, 74, 76, 79], wind: 0.045, pad: 0.08, cutoff: 800, bells: 5.5 },
  finale:    { chord: [48, 55, 60, 64, 69], scale: [72, 74, 76, 79, 81, 84, 88], wind: 0.01, pad: 0.1, cutoff: 1300, bells: 2.2 },
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mood = null;
    this.layers = [];
    this._bellTimer = 0;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    this.music = ctx.createGain();
    this.music.gain.value = 0.7;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.8;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    this.sfxBus.connect(this.master);
    this.sfxBus.connect(this.reverb);

    this.noiseBuf = this._noiseBuffer(2);

    // engine hum
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const ef = ctx.createBiquadFilter();
    ef.type = 'lowpass';
    ef.frequency.value = 260;
    this.engineFilter = ef;
    this.engineOsc.connect(ef).connect(this.engineGain).connect(this.sfxBus);
    this.engineOsc.start();

    if (this._pendingMood) this.setMood(this._pendingMood);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx, len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; }
    return buf;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.1);
    return this.muted;
  }

  setMood(name) {
    if (!this.ctx) { this._pendingMood = name; return; }
    if (this.mood === name) return;
    this.mood = name;
    const ctx = this.ctx, now = ctx.currentTime;
    for (const l of this.layers) {
      l.gain.gain.cancelScheduledValues(now);
      l.gain.gain.setTargetAtTime(0, now, 1.2);
      setTimeout(() => l.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 6000);
    }
    this.layers = [];
    const m = MOODS[name] || MOODS.home;
    this._moodDef = m;

    // Pad
    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    padGain.gain.setTargetAtTime(m.pad, now + 0.2, 2.5);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = m.cutoff;
    filt.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = m.cutoff * 0.4;
    lfo.connect(lfoAmt).connect(filt.frequency);
    filt.connect(padGain).connect(this.music);
    const nodes = [lfo];
    m.chord.forEach((n, i) => {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = NOTE(n);
        o.detune.value = det + Math.random() * 3;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.5 : 0.22;
        o.connect(g).connect(filt);
        o.start();
        nodes.push(o);
      }
    });
    lfo.start();
    this.layers.push({ gain: padGain, nodes });

    // Wind
    if (m.wind > 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 0.7;
      const wg = ctx.createGain();
      wg.gain.value = 0;
      wg.gain.setTargetAtTime(m.wind, now + 0.2, 2);
      const wl = ctx.createOscillator();
      wl.frequency.value = 0.11;
      const wla = ctx.createGain();
      wla.gain.value = 260;
      wl.connect(wla).connect(bp.frequency);
      src.connect(bp).connect(wg).connect(this.master);
      src.start();
      wl.start();
      this.layers.push({ gain: wg, nodes: [src, wl] });
    }
    this._bellTimer = 1.5;
  }

  bell(midi, vol = 0.07, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const f = NOTE(midi);
    for (const [mult, amp] of [[1, 1], [2.01, 0.25], [3.98, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol * amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6 / mult);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 3);
    }
  }

  update(dt) {
    if (!this.ctx || !this._moodDef) return;
    this._bellTimer -= dt;
    if (this._bellTimer <= 0) {
      const m = this._moodDef;
      this._bellTimer = m.bells * (0.6 + Math.random() * 0.9);
      const s = m.scale;
      const n = s[(Math.random() * s.length) | 0];
      this.bell(n, 0.05);
      if (Math.random() < 0.45) this.bell(s[(Math.random() * s.length) | 0], 0.035, 0.35);
    }
  }

  setEngine(level, pitch = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(level * 0.06, t, 0.15);
    this.engineOsc.frequency.setTargetAtTime(45 + pitch * 50, t, 0.2);
    this.engineFilter.frequency.setTargetAtTime(180 + pitch * 500, t, 0.2);
  }

  duck(on, time = 0.4) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on || this.muted ? 0 : 0.9, this.ctx.currentTime, time);
  }

  _noiseBurst({ dur = 0.3, freq = 800, q = 1, vol = 0.2, type = 'bandpass', sweep = null }) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.1);
  }

  _tone(freq, dur, vol = 0.1, type = 'sine', slide = null, when = 0) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump': this._noiseBurst({ dur: 0.25, freq: 900, q: 0.8, vol: 0.08, sweep: 1800 }); this._tone(300, 0.15, 0.04, 'sine', 520); break;
      case 'land': this._noiseBurst({ dur: 0.18, freq: 300, q: 1, vol: 0.12 }); break;
      case 'blip': this._tone(880, 0.12, 0.05, 'sine', 1320); break;
      case 'type': this._tone(1400 + Math.random() * 300, 0.03, 0.012, 'square'); break;
      case 'pickup': this._tone(660, 0.18, 0.08, 'triangle', 990); this._tone(990, 0.25, 0.06, 'sine', null, 0.08); break;
      case 'deliver': [72, 76, 79, 84].forEach((n, i) => this.bell(n, 0.08, i * 0.09)); break;
      case 'core': [67, 71, 74, 79, 83, 86].forEach((n, i) => this.bell(n, 0.1, i * 0.12)); this._noiseBurst({ dur: 2.5, freq: 3000, q: 0.5, vol: 0.05, type: 'highpass' }); break;
      case 'mission': [64, 67, 72].forEach((n, i) => this.bell(n, 0.09, i * 0.15)); break;
      case 'door': this._noiseBurst({ dur: 0.7, freq: 300, q: 4, vol: 0.12, sweep: 520 }); break;
      case 'chop': this._noiseBurst({ dur: 0.18, freq: 900, q: 2, vol: 0.3 }); this._tone(140, 0.15, 0.12, 'triangle', 90); break;
      case 'stone': this._noiseBurst({ dur: 0.25, freq: 2200, q: 3, vol: 0.18 }); this._tone(420, 0.1, 0.05, 'square', 300); break;
      case 'splash': this._noiseBurst({ dur: 0.6, freq: 1400, q: 0.8, vol: 0.2, sweep: 400 }); break;
      case 'harvest': this._noiseBurst({ dur: 0.25, freq: 2500, q: 1, vol: 0.1 }); this._tone(520, 0.2, 0.06, 'triangle', 780); break;
      case 'engineStart': this._tone(60, 1.2, 0.12, 'sawtooth', 140); this._noiseBurst({ dur: 1.0, freq: 200, q: 1, vol: 0.1, sweep: 900 }); break;
      case 'whoosh': this._noiseBurst({ dur: 1.6, freq: 200, q: 0.6, vol: 0.3, sweep: 4000 }); break;
      case 'warp': this._noiseBurst({ dur: 4.0, freq: 80, q: 0.5, vol: 0.4, type: 'lowpass', sweep: 2600 }); this._tone(40, 4, 0.2, 'sine', 180); break;
      case 'chime': [84, 91].forEach((n, i) => this.bell(n, 0.12, i * 0.2)); break;
      case 'fail': this._tone(330, 0.3, 0.06, 'triangle', 220); break;
      case 'fire': this._noiseBurst({ dur: 1.4, freq: 600, q: 0.4, vol: 0.2, type: 'lowpass', sweep: 200 }); break;
      case 'machine': this._tone(220, 2.2, 0.08, 'sine', 440); [60, 64, 67, 72].forEach((n, i) => this.bell(n, 0.08, 0.5 + i * 0.25)); break;
    }
  }
}
