import { LofiMusic } from './Music.js';

/**
 * Prosedürel, ASMR tadında yumuşak sesler (ses dosyası yok).
 *
 * - Sert beyaz gürültü yerine pembe/kahverengi gürültü ve yumuşak filtreler
 * - Tüm çıkış alçak geçiren filtre + kompresörden geçer: tiz ve ani sesler kulağı yormaz
 * - Köpük ve süngerde stereo, rastgele küçük kabarcık patlamaları
 * - Islak araçtan düşen damlaların hafif "tık"ları
 *
 * Tarayıcı kısıtı nedeniyle ilk kullanıcı etkileşiminde init() çağrılmalı.
 */

// Döngü tanımları: kaynak gürültü türü, filtre zinciri, en yüksek seviye
const LOOP_DEFS = {
  water: { noise: 'pink', filters: [['highpass', 380], ['bandpass', 1500, 0.35], ['lowpass', 4800]], max: 0.13, wobble: 0.18 },
  splash: { noise: 'brown', filters: [['lowpass', 900, 0.7]], max: 0.3, wobble: 0.35 },
  foam: { noise: 'pink', filters: [['highpass', 2800], ['lowpass', 8500]], max: 0.035, wobble: 0.3 },
  towel: { noise: 'pink', filters: [['bandpass', 1700, 0.6], ['lowpass', 3800]], max: 0.075 },
  brush: { noise: 'white', filters: [['bandpass', 4200, 0.9], ['lowpass', 7500]], max: 0.028 },
  pad: { noise: 'brown', filters: [['bandpass', 600, 1.5]], max: 0.22 },
  spray: { noise: 'pink', filters: [['bandpass', 3000, 0.7], ['lowpass', 6000]], max: 0.07 },
  polisher: { noise: 'pink', filters: [['bandpass', 650, 1.2], ['lowpass', 1000]], max: 0.05, hum: 92 },
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.loops = {};
    this.bubbleRate = 0;
    this.dripRate = 0;
    this.musicOn = true;
    this.station = 'lofi';
    this.sfxVolume = 1;
    this.musicVolume = 1;
  }

  /** Ayarlar: 0..1 */
  setVolumes({ music = this.musicVolume, sfx = this.sfxVolume } = {}) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.music?.setVolume(music);
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    // Ana zincir: ses → yumuşatıcı alçak geçiren → kompresör → çıkış
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 9000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 20;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master.connect(soften);
    soften.connect(comp);
    comp.connect(ctx.destination);
    // Efekt kanalı (ayarlardan ayrı kısılabilir)
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(this.master);

    this.buffers = { white: this.makeNoise('white'), pink: this.makeNoise('pink'), brown: this.makeNoise('brown') };
    for (const [name, def] of Object.entries(LOOP_DEFS)) this.loops[name] = this.makeLoop(def);

    // Oda tonu: çok hafif, derin bir uğultu (sessizlik "ölü" gelmesin)
    const amb = this.makeLoop({ noise: 'brown', filters: [['lowpass', 180]], max: 1 });
    amb.gain.gain.value = 0.035;

    this.music = new LofiMusic(ctx, this.master);
    this.music.setVolume(this.musicVolume);
    this.music.setEnabled(this.musicOn);
    this.music.setStation(this.station);
  }

  /** Radyo istasyonu (lofi / sunday / night) */
  setStation(id) {
    this.station = id;
    this.music?.setStation(id);
  }

  /** Fon müziğini aç/kapat */
  setMusic(on) {
    this.musicOn = on;
    this.music?.setEnabled(on);
    return on;
  }

  makeNoise(type) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w * 0.5;
      else if (type === 'pink') {
        // Paul Kellet'in pembe gürültü filtresi
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // Döngü dikişi duyulmasın diye uçları yumuşat
    const fade = 2048;
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] *= k;
      d[len - 1 - i] *= k;
    }
    return buf;
  }

  makeLoop(def) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers[def.noise];
    src.loop = true;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    let node = src;
    for (const [type, freq, q] of def.filters) {
      const bq = ctx.createBiquadFilter();
      bq.type = type;
      bq.frequency.value = freq;
      if (q) bq.Q.value = q;
      node.connect(bq);
      node = bq;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain);

    // Doğal dalgalanma: yavaş rastgele genlik modülasyonu
    if (def.wobble) {
      const wob = ctx.createGain();
      wob.gain.value = 1;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.4 + Math.random() * 0.6;
      const depth = ctx.createGain();
      depth.gain.value = def.wobble;
      lfo.connect(depth);
      depth.connect(wob.gain);
      lfo.start();
      gain.connect(wob);
      wob.connect(this.sfx);
    } else {
      gain.connect(this.sfx);
    }

    // Cila makinesi: motor uğultusu
    if (def.hum) {
      for (const [f, type, v] of [[def.hum, 'triangle', 0.5], [def.hum * 2, 'sine', 0.25]]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 400;
        const g = ctx.createGain();
        g.gain.value = v;
        osc.connect(lp);
        lp.connect(g);
        g.connect(gain);
        osc.start();
      }
    }
    src.start(0, Math.random() * 3);
    return { gain, max: def.max ?? 1 };
  }

  /** Döngü sesinin seviyesini yumuşakça ayarla (0..1) */
  setLoop(name, level, tau = 0.1) {
    const l = this.loops[name];
    if (!l || !this.ctx) return;
    l.gain.gain.setTargetAtTime(level * l.max, this.ctx.currentTime, tau);
  }

  /** Köpük kabarcığı patlama yoğunluğu (0..1) */
  setBubbles(rate) {
    this.bubbleRate = rate;
  }

  /** Damla sesi yoğunluğu (0..1) */
  setDrips(rate) {
    this.dripRate = rate;
  }

  /** Tek bir minik ses: stereo konumlu, yumuşak zarflı sinüs */
  blip(freq, { start = 0, dur = 0.03, vol = 0.01, slide = 1.3, pan = 0, type = 'sine' } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g);
    g.connect(p);
    p.connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Her kare: kabarcık ve damla seslerini zamanla */
  update(dt) {
    if (!this.ctx || this.muted) return;
    const pops = this.bubbleRate * 45 * dt;
    for (let n = pops + Math.random(); n >= 1; n--) {
      this.blip(1800 + Math.random() * 2600, {
        start: Math.random() * dt, dur: 0.012 + Math.random() * 0.02, vol: 0.004 + Math.random() * 0.009,
        slide: 1.2 + Math.random() * 0.4, pan: (Math.random() - 0.5) * 1.2,
      });
    }
    const drips = this.dripRate * 3 * dt;
    if (Math.random() < drips) {
      this.blip(1300 + Math.random() * 1100, { dur: 0.07, vol: 0.006, slide: 0.75, pan: (Math.random() - 0.5) * 1.4 });
    }
  }

  tone(freq, { type = 'sine', start = 0, dur = 0.2, vol = 0.05, slide = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  softNoise({ start = 0, dur = 0.05, vol = 0.06, freq = 1400 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.pink;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfx);
    src.start(t, Math.random() * 3);
    src.stop(t + dur + 0.02);
  }

  /** Kasa: yumuşak iki çan */
  cash() {
    this.tone(1318, { start: 0, dur: 0.9, vol: 0.045 });
    this.tone(1976, { start: 0.07, dur: 1.1, vol: 0.035 });
    this.tone(2637, { start: 0.14, dur: 1.3, vol: 0.02 });
  }

  /** Araç tamamen temiz — yumuşak pentatonik arpej */
  complete() {
    [523, 659, 784, 988, 1175].forEach((f, i) => this.tone(f, { start: i * 0.08, dur: 0.6, vol: 0.035 }));
  }

  /** Parça/adım bitti: kısa "ding"; step arttıkça pentatonik nota yükselir */
  ding(step = 0) {
    const notes = [1047, 1175, 1319, 1568, 1760, 2093];
    const f = notes[Math.min(step, notes.length - 1)];
    this.tone(f, { dur: 0.45, vol: 0.04 });
    this.tone(f * 2, { start: 0.02, dur: 0.3, vol: 0.014 });
  }

  click() {
    this.tone(1400, { dur: 0.03, vol: 0.02 });
  }

  error() {
    this.tone(260, { dur: 0.16, vol: 0.035, slide: 0.8 });
  }

  upgrade() {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, { start: i * 0.07, dur: 0.35, vol: 0.035 }));
  }

  /** Aleti raftan alma: yumuşak "tak" */
  pickup() {
    this.softNoise({ dur: 0.05, vol: 0.07, freq: 1500 });
    this.tone(190, { dur: 0.08, vol: 0.04 });
  }

  putdown() {
    this.softNoise({ dur: 0.06, vol: 0.06, freq: 1100 });
    this.tone(150, { dur: 0.09, vol: 0.035 });
  }

  /** Araç gelir: uzaktan gelen yumuşak motor sesi */
  carArrive() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(42, t);
    osc.frequency.linearRampToValueAtTime(58, t + 1.2);
    osc.frequency.linearRampToValueAtTime(34, t + 3.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + 3.4);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + 3.5);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.05);
    return this.muted;
  }
}
