import * as THREE from 'three';

const KNOB_RANGE = 52; // joystick topuzunun merkezden en fazla uzaklığı (px)
const LOOK_BOOST = 1.7; // parmakla bakış, fare hassasiyetine göre çarpan

/**
 * Dokunmatik arayüz: sol altta sanal joystick (hareket), ekranın geri kalanında sürükleyerek bakış,
 * sağ altta büyük "kullan" düğmesi ve eylem düğmeleri. Yeni oyun mantığı yok; düğmeler Game metotlarını çağırır.
 * Her parmak pointerId ile ayrı izlenir (aynı anda yürü + bak + sık).
 */
export class TouchControls {
  constructor(game) {
    this.game = game;
    this.move = new THREE.Vector2(0, 0);
    this.root = document.getElementById('touch-ui');
    this.joyPointer = null;
    this.lookPointers = new Map();
    this.build();
  }

  build() {
    const g = this.game;
    const root = this.root;
    root.innerHTML = `
      <div class="t-look"></div>
      <div class="t-joy"><i class="t-joy-knob"></i></div>
      <div class="t-top">
        <button class="t-btn t-small" data-act="menu">⏸<small>Menü</small></button>
        <button class="t-btn t-small" data-act="shop">🛒<small>Mağaza</small></button>
      </div>
      <div class="t-tools">
        <button class="t-btn" data-act="water">💦<small>Su</small></button>
        <button class="t-btn" data-act="foam">🫧<small>Köpük</small></button>
      </div>
      <div class="t-actions">
        <button class="t-btn" data-act="interact">E<small>Al</small></button>
        <button class="t-btn" data-act="put">Q<small>Bırak</small></button>
        <button class="t-btn" data-act="crouch">C<small>Çömel</small></button>
        <button class="t-btn" data-act="scan">F<small>Tara</small></button>
        <button class="t-btn" data-act="deliver">T<small>Teslim</small></button>
      </div>
      <button class="t-fire" data-hold="fire">KULLAN</button>
      <div class="t-rotate">📱 Telefonu yatay çevir</div>`;

    const acts = {
      menu: () => g.pauseFree(),
      shop: () => g.openShop(),
      water: () => g.tools.selectGun(0),
      foam: () => g.tools.selectGun(1),
      interact: () => g.interact(),
      put: () => (g.tools.putDown() ? g.hud.hint('Alet rafa bırakıldı', 1.2) : g.hud.hint('Tabancalar belinde — Su / Köpük düğmeleri', 1.8)),
      crouch: () => { g.crouchToggle = !g.crouchToggle; },
      scan: () => {
        g.cars.pulseHighlight();
        g.hud.hint('Kir tarayıcı: turuncu = kir, mor = kuş pisliği/böcek, mavi = ıslak');
      },
      deliver: () => g.deliver(),
    };
    root.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.classList.add('down');
        acts[b.dataset.act]();
      });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });

    // Ateş: basılı tutulduğu sürece
    const fire = root.querySelector('[data-hold="fire"]');
    const fireOn = (on) => (e) => {
      e.preventDefault();
      if (on) fire.setPointerCapture?.(e.pointerId);
      g.firing = on;
      fire.classList.toggle('down', on);
    };
    fire.addEventListener('pointerdown', fireOn(true));
    fire.addEventListener('pointerup', fireOn(false));
    fire.addEventListener('pointercancel', fireOn(false));

    // Joystick
    const joy = root.querySelector('.t-joy');
    const knob = root.querySelector('.t-joy-knob');
    const setKnob = (e) => {
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > KNOB_RANGE) { dx *= KNOB_RANGE / len; dy *= KNOB_RANGE / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const v = Math.hypot(dx, dy) / KNOB_RANGE;
      this.move.set(v < 0.12 ? 0 : dx / KNOB_RANGE, v < 0.12 ? 0 : -dy / KNOB_RANGE);
    };
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.joyPointer = e.pointerId;
      joy.setPointerCapture?.(e.pointerId);
      setKnob(e);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyPointer) setKnob(e);
    });
    const joyEnd = (e) => {
      if (e.pointerId !== this.joyPointer) return;
      this.joyPointer = null;
      knob.style.transform = '';
      this.move.set(0, 0);
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    // Bakış: boş alanda sürükle
    const look = root.querySelector('.t-look');
    look.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      look.setPointerCapture?.(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    look.addEventListener('pointermove', (e) => {
      const p = this.lookPointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      g.touchLook(dx, dy, LOOK_BOOST);
    });
    const lookEnd = (e) => this.lookPointers.delete(e.pointerId);
    look.addEventListener('pointerup', lookEnd);
    look.addEventListener('pointercancel', lookEnd);

    // Tarayıcı kaydırma/yakınlaştırma jestlerini engelle
    root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  /** Oyun girdi alırken görünür */
  setVisible(on) {
    this.root.classList.toggle('show', on);
    if (!on) {
      this.move.set(0, 0);
      this.joyPointer = null;
      this.lookPointers.clear();
    }
  }
}
