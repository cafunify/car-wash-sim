/**
 * Tamamen prosedürel sesler (ses dosyası yok).
 * Tarayıcı kısıtı nedeniyle ilk kullanıcı etkileşiminde init() çağrılmalı.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.loops = {};
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);

    // 2 sn beyaz gürültü
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Sürekli döngüler: hortum, köpük, sünger, havlu
    this.loops.hose = this.makeLoop([{ type: 'bandpass', frequency: 2400, Q: 0.6 }, { type: 'highshelf', frequency: 5000, gain: 4 }]);
    this.loops.hoseLow = this.makeLoop([{ type: 'lowpass', frequency: 380, Q: 0.8 }]);
    this.loops.foam = this.makeLoop([{ type: 'bandpass', frequency: 900, Q: 1.2 }]);
    this.loops.sponge = this.makeLoop([{ type: 'bandpass', frequency: 650, Q: 2.5 }]);
    this.loops.towel = this.makeLoop([{ type: 'bandpass', frequency: 3200, Q: 1.4 }]);
  }

  makeLoop(filters) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    let node = src;
    for (const f of filters) {
      const bq = ctx.createBiquadFilter();
      bq.type = f.type;
      bq.frequency.value = f.frequency;
      if (f.Q) bq.Q.value = f.Q;
      if (f.gain) bq.gain.value = f.gain;
      node.connect(bq);
      node = bq;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain);
    gain.connect(this.master);
    src.start();
    return gain;
  }

  /** Döngü sesinin seviyesini yumuşakça ayarla (0..1) */
  setLoop(name, level) {
    const g = this.loops[name];
    if (!g) return;
    g.gain.setTargetAtTime(level, this.ctx.currentTime, 0.05);
  }

  tone(freq, { type = 'sine', start = 0, dur = 0.2, vol = 0.2, slide = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noiseBurst({ start = 0, dur = 0.08, vol = 0.2, freq = 3000 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bq = ctx.createBiquadFilter();
    bq.type = 'bandpass';
    bq.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq);
    bq.connect(g);
    g.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  /** Kasa sesi */
  cash() {
    this.noiseBurst({ dur: 0.05, vol: 0.25, freq: 5000 });
    this.tone(1318, { type: 'triangle', start: 0.03, dur: 0.18, vol: 0.18 });
    this.tone(1760, { type: 'triangle', start: 0.1, dur: 0.22, vol: 0.18 });
    this.tone(2637, { type: 'sine', start: 0.17, dur: 0.6, vol: 0.14 });
  }

  /** Araç tamamen temiz — küçük zafer melodisi */
  complete() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => this.tone(f, { type: 'triangle', start: i * 0.09, dur: 0.35, vol: 0.14 }));
  }

  click() {
    this.tone(900, { type: 'square', dur: 0.05, vol: 0.05 });
  }

  error() {
    this.tone(180, { type: 'square', dur: 0.15, vol: 0.08, slide: 0.7 });
  }

  upgrade() {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, { type: 'square', start: i * 0.06, dur: 0.18, vol: 0.06 }));
  }

  /** Araç gelir: motor homurtusu + korna */
  carArrive() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(48, t);
    osc.frequency.linearRampToValueAtTime(70, t + 1.2);
    osc.frequency.linearRampToValueAtTime(38, t + 3.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + 3.4);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 3.5);
    this.tone(415, { type: 'square', start: 3.3, dur: 0.12, vol: 0.05 });
    this.tone(415, { type: 'square', start: 3.5, dur: 0.18, vol: 0.05 });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}
