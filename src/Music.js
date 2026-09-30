/**
 * Prosedürel lo-fi fon müziği (ses dosyası yok).
 *
 * 74 BPM, hafif swing: Rhodes benzeri akorlar, yumuşak bas, fırça davul,
 * seyrek zil melodisi, plak cızırtısı ve yankı. İki akor dizisi dönüşümlü çalınır,
 * melodi ve vuruşlarda rastgelelik vardır; böylece döngü sıkıcı hale gelmez.
 */

const BPM = 74;
const STEP = 60 / BPM / 4; // 16'lık nota süresi
const SWING = 0.22; // tek 16'lıkların gecikmesi (STEP oranı)
const LOOKAHEAD = 0.15;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Akorlar: bas notası + Rhodes voicing'i + melodi için uygun notalar (MIDI)
const CHORDS = {
  Fmaj9: { bass: 41, voicing: [57, 60, 64, 67], scale: [69, 72, 74, 76, 79] },
  Em9: { bass: 40, voicing: [55, 59, 62, 66], scale: [67, 71, 74, 76, 78] },
  Dm9: { bass: 38, voicing: [53, 57, 60, 64], scale: [69, 72, 74, 76, 77] },
  Cmaj9: { bass: 36, voicing: [52, 55, 59, 62], scale: [67, 69, 72, 74, 76] },
  Am9: { bass: 45, voicing: [55, 59, 60, 64], scale: [67, 69, 72, 76, 79] },
  G13: { bass: 43, voicing: [53, 57, 59, 64], scale: [67, 71, 74, 76, 79] },
};
const PROGRESSIONS = [
  ['Fmaj9', 'Em9', 'Dm9', 'Cmaj9'],
  ['Am9', 'Dm9', 'G13', 'Cmaj9'],
];

export class LofiMusic {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.enabled = false;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.timer = null;
    this.lastMelody = 2;

    // Müzik zinciri: sesler → sıcak alçak geçiren → kuru + yankı → çıkış
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    const warm = ctx.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 4200;
    warm.connect(this.out);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.reverb.connect(wet);
    wet.connect(this.out);
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(warm);
    this.bus.connect(this.reverb);

    // Rhodes tremolosu ve bant kayması (wow)
    this.epBus = ctx.createGain();
    this.epBus.gain.value = 0.85;
    this.epBus.connect(this.bus);
    const trem = ctx.createOscillator();
    trem.frequency.value = 4.2;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.15;
    trem.connect(tremDepth);
    tremDepth.connect(this.epBus.gain);
    trem.start();
    this.wow = ctx.createOscillator();
    this.wow.frequency.value = 0.35;
    this.wowDepth = ctx.createGain();
    this.wowDepth.gain.value = 7; // cent
    this.wow.connect(this.wowDepth);
    this.wow.start();

    // Melodi yankısı
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2500;
    this.delay.connect(dl);
    dl.connect(fb);
    fb.connect(this.delay);
    dl.connect(this.bus);

    this.noise = this.makeNoise();
    this.startVinyl();
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeImpulse(seconds) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * seconds;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  /** Plak cızırtısı: sürekli hafif hışırtı + rastgele tıkırtılar */
  startVinyl() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 3500;
    hp.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.012;
    src.connect(hp);
    hp.connect(g);
    g.connect(this.out);
    src.start();
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0.5;
    this.crackleGain.connect(this.out);
  }

  setVolume(v) {
    this.volume = v;
    if (this.enabled) this.out.gain.setTargetAtTime(0.32 * v, this.ctx.currentTime, 0.1);
  }

  setEnabled(on) {
    this.enabled = on;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(on ? 0.32 * (this.volume ?? 1) : 0, t, on ? 1.2 : 0.3);
    if (on && !this.timer) {
      this.nextTime = t + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    }
    if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  schedule() {
    const now = this.ctx.currentTime;
    // Sekme arka plandayken birikmiş gecikmeyi at
    if (this.nextTime < now - 0.5) this.nextTime = now + 0.05;
    while (this.nextTime < now + LOOKAHEAD) {
      const swing = this.step % 2 ? STEP * SWING : 0;
      this.playStep(this.step, this.nextTime + swing);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  get chord() {
    const prog = PROGRESSIONS[Math.floor(this.bar / 8) % PROGRESSIONS.length];
    return CHORDS[prog[this.bar % 4]];
  }

  playStep(s, t) {
    const ch = this.chord;
    const r = Math.random;

    // Davul (boom-bap, yumuşak)
    if (s === 0 || s === 10 || (s === 7 && r() < 0.35)) this.kick(t, s === 7 ? 0.5 : 1);
    if (s === 4 || s === 12) this.snare(t, 0.9 + r() * 0.2);
    if (s % 2 === 0 && r() > 0.12) this.hat(t, s % 4 === 0 ? 0.55 : 0.35);
    if (s === 15 && r() < 0.25) this.hat(t, 0.25);

    // Akorlar
    if (s === 0) this.chordHit(ch, t, STEP * 10, 1);
    if (s === 6 && r() < 0.55) this.chordHit(ch, t, STEP * 4, 0.55);
    if (s === 11 && r() < 0.4) this.chordHit({ ...ch, voicing: ch.voicing.slice(1) }, t, STEP * 5, 0.5);

    // Bas
    if (s === 0) this.bass(mtof(ch.bass), t, STEP * 7);
    if (s === 8) this.bass(mtof(ch.bass + (r() < 0.4 ? 7 : 0)), t, STEP * 5);
    if (s === 14 && r() < 0.35) this.bass(mtof(ch.bass + (r() < 0.5 ? -2 : 5)), t, STEP * 2, 0.6);

    // Seyrek melodi: komşu notalara yürüyen yumuşak zil
    if (s % 4 === 2 && r() < 0.3) {
      this.lastMelody = Math.max(0, Math.min(ch.scale.length - 1, this.lastMelody + Math.round((r() - 0.5) * 3)));
      this.bell(mtof(ch.scale[this.lastMelody]), t, 0.8);
    }

    // Plak tıkırtıları
    if (r() < 0.25) this.crackle(t + r() * STEP);
  }

  env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  chordHit(ch, t, dur, vel) {
    ch.voicing.forEach((m, i) => this.ep(mtof(m), t + i * 0.012 * Math.random(), dur, vel * (0.85 + Math.random() * 0.3)));
  }

  /** Rhodes benzeri elektrik piyano: sinüs + bir oktav üst üçgen + kısa çan tınısı */
  ep(f, t, dur, vel) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.055 * vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.024 * vel, t + 0.5);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600 + vel * 600;
    lp.connect(g);
    g.connect(this.epBus);
    const parts = [[f, 'sine', 1], [f * 2, 'triangle', 0.12], [f * 3.01, 'sine', 0.05]];
    for (const [freq, type, amp] of parts) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = (Math.random() - 0.5) * 10;
      this.wowDepth.connect(o.detune);
      o.onended = () => this.wowDepth.disconnect(o.detune);
      const a = ctx.createGain();
      a.gain.value = amp;
      if (amp < 0.1) this.env(a, t, amp, 0.005, 0.4); // çan tınısı çabuk söner
      o.connect(a);
      a.connect(lp);
      o.start(t);
      o.stop(t + dur + 1.6);
    }
  }

  bass(f, t, dur, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.015);
    g.gain.setTargetAtTime(0.09 * vel, t + 0.05, 0.3);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.12);
    o.connect(lp);
    o2.connect(g2);
    g2.connect(lp);
    lp.connect(g);
    g.connect(this.bus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.8);
    o2.stop(t + dur + 0.8);
  }

  kick(t, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(115, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    const g = ctx.createGain();
    this.env(g, t, 0.32 * vel, 0.004, 0.32);
    o.connect(g);
    g.connect(this.bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  snare(t, vel) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    const g = ctx.createGain();
    this.env(g, t, 0.075 * vel, 0.003, 0.2);
    src.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(this.bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.3);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const og = ctx.createGain();
    this.env(og, t, 0.04 * vel, 0.003, 0.1);
    o.connect(og);
    og.connect(this.bus);
    o.start(t);
    o.stop(t + 0.15);
  }

  hat(t, vel) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    this.env(g, t, 0.022 * vel, 0.002, 0.045);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.08);
  }

  bell(f, t, vel) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 2.76;
    const g2 = ctx.createGain();
    this.env(g2, t, 0.012 * vel, 0.003, 0.3);
    const g = ctx.createGain();
    this.env(g, t, 0.035 * vel, 0.006, 1.4);
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(this.bus);
    g.connect(this.delay);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.6);
    o2.stop(t + 1.6);
  }

  crackle(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2000 + Math.random() * 3000;
    const g = ctx.createGain();
    this.env(g, t, 0.02 + Math.random() * 0.04, 0.0005, 0.006);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.crackleGain);
    src.start(t, Math.random() * 1.8);
    src.stop(t + 0.02);
  }
}
