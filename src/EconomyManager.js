import { availablePackages, PACKAGES } from './Packages.js';

/**
 * Para, yükseltmeler, müşteri zamanlayıcısı / bahşiş, kayıt ve mağaza arayüzü.
 */

const SAVE_KEY = 'parilti-oto-yikama-v1';
const START_MONEY = 0;

export const SHOP_LEVEL_NAMES = ['Basit Garaj', 'Yenilenmiş Garaj', 'Neon Detailing Stüdyosu'];

const TABLE = {
  hoseRadius: [0.26, 0.34, 0.44, 0.56],
  hosePower: [1, 1.3, 1.65, 2.1],
  shampoo: [1, 1.5, 2.1], // köpüğün leke çözme gücü
  shampooMult: [1, 1.2, 1.4], // kazanç çarpanı
  towelSpeed: [1, 1.6, 2.3],
  towelRadius: [0.28, 0.34, 0.4],
  shopBonus: [0, 0.1, 0.2],
};

export const UPGRADES = [
  {
    id: 'nozzle',
    name: 'Yüksek Basınçlı Nozul',
    icon: '💦',
    desc: 'Hortumun temizlediği alanı ve gücünü artırır.',
    costs: [120, 300, 650],
    effect: (l) => `Yarıçap ${Math.round(TABLE.hoseRadius[l] * 100)} cm · Güç ×${TABLE.hosePower[l]}`,
  },
  {
    // Kayıt uyumluluğu için kimlik 'sponge' olarak kaldı
    id: 'sponge',
    name: 'Premium Şampuan',
    icon: '🧴',
    desc: 'Köpük lekeleri daha hızlı çözer, durulama daha etkili olur. Mutlu müşteri daha çok öder.',
    costs: [200, 500],
    effect: (l) => `Köpük gücü ×${TABLE.shampoo[l]} · Kazanç ×${TABLE.shampooMult[l]}`,
  },
  {
    id: 'pinkfoam',
    name: 'Pembe Nano Köpük',
    icon: '🌸',
    desc: 'Kozmetik: köpük tabancası pembe, yoğun nano köpük sıkar. Satın aldıktan sonra açıp kapatabilirsin.',
    costs: [350],
    cosmetic: true,
    effect: (l) => (l ? 'Satın alındı' : 'Kozmetik'),
  },
  {
    id: 'towel',
    name: 'Mikrofiber Havlu',
    icon: '🧻',
    desc: 'Daha büyük ve emici havlu, aracı hızla kurutur.',
    costs: [100, 280],
    effect: (l) => `Kurutma hızı ×${TABLE.towelSpeed[l]}`,
  },
  {
    id: 'rimcleaner',
    name: 'Jant Temizleyici',
    icon: '🛞',
    desc: 'Demir tozu çözücü + yumuşak fırça. Jantlardaki fren tozunu söker (tozla temas edince morarır).',
    costs: [150],
    effect: (l) => (l ? 'Rafta' : 'Premium Temizlik için gerekli'),
  },
  {
    id: 'tireshine',
    name: 'Lastik Parlatıcı',
    icon: '⚫',
    desc: 'Soluk, grileşmiş lastikleri derin ve ıslak görünümlü siyaha çevirir.',
    costs: [120],
    effect: (l) => (l ? 'Rafta' : 'Detaylı Yıkama için gerekli'),
  },
  {
    id: 'glasscleaner',
    name: 'Cam Temizleyici',
    icon: '🪟',
    desc: 'Camlardaki puslu film ve kireç lekelerini iz bırakmadan siler.',
    costs: [100],
    effect: (l) => (l ? 'Rafta' : 'Detaylı Yıkama için gerekli'),
  },
  {
    id: 'polisher',
    name: 'Cila Makinesi',
    icon: '✨',
    desc: 'Orbital makineyle temiz boyaya cila: ayna gibi parlaklık ve metalik pul ışıltısı.',
    costs: [450],
    effect: (l) => (l ? 'Rafta' : 'Premium Temizlik için gerekli'),
  },
  {
    id: 'shop',
    name: 'Dükkân Genişletme',
    icon: '🏢',
    desc: 'Dükkânını yenile: daha büyük araçlar ve prestij bonusu gelir.',
    costs: [600, 1500],
    effect: (l) => `${SHOP_LEVEL_NAMES[l]} · Bonus +%${Math.round(TABLE.shopBonus[l] * 100)}`,
  },
];

export class EconomyManager {
  constructor(hud, audio, { onUpgrade } = {}) {
    this.hud = hud;
    this.audio = audio;
    this.onUpgrade = onUpgrade;
    this.state = this.load();
    this.customer = null;

    this.shopEl = document.getElementById('shop');
    this.itemsEl = document.getElementById('shop-items');
    this.shopMoneyEl = document.getElementById('shop-money');
    this.itemsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-buy]');
      if (btn) this.buy(btn.dataset.buy);
      const tog = e.target.closest('button[data-toggle]');
      if (tog) {
        const k = tog.dataset.toggle;
        this.setSetting(k, !this.state.settings[k]);
        this.audio.click();
        this.renderShop();
        this.onUpgrade?.(k, this.level(k));
      }
    });
    this.hud.setMoney(this.state.money, false);
    this.hud.setWashed(this.state.washed);
  }

  // ---------------------------------------------------------------- kayıt
  defaultState() {
    return {
      money: START_MONEY, washed: 0, totalEarned: 0,
      levels: { nozzle: 0, sponge: 0, towel: 0, rimcleaner: 0, tireshine: 0, glasscleaner: 0, polisher: 0, pinkfoam: 0, shop: 0 },
      settings: { pinkfoam: true, music: true },
    };
  }

  load() {
    const def = this.defaultState();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return def;
      const s = JSON.parse(raw);
      return { ...def, ...s, levels: { ...def.levels, ...(s.levels || {}) }, settings: { ...def.settings, ...(s.settings || {}) } };
    } catch {
      return def;
    }
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch {
      /* gizli pencere vb. — kayıtsız devam */
    }
  }

  reset() {
    this.state = this.defaultState();
    this.save();
    this.hud.setMoney(0, false);
    this.hud.setWashed(0);
    this.renderShop();
    this.onUpgrade?.('reset', 0);
  }

  // ---------------------------------------------------------------- değerler
  level(id) {
    return this.state.levels[id] || 0;
  }

  get hoseRadius() { return TABLE.hoseRadius[this.level('nozzle')]; }
  get hosePower() { return TABLE.hosePower[this.level('nozzle')]; }
  get shampoo() { return TABLE.shampoo[this.level('sponge')]; }
  get towelSpeed() { return TABLE.towelSpeed[this.level('towel')]; }
  get towelRadius() { return TABLE.towelRadius[this.level('towel')]; }
  get pinkFoam() { return this.level('pinkfoam') > 0 && this.state.settings.pinkfoam; }

  setSetting(key, value) {
    this.state.settings[key] = value;
    this.save();
  }
  get shopLevel() { return this.level('shop'); }

  owns = (key) => this.level(key) > 0;

  /** Bir ekipmanın bir sonraki seviye fiyatı */
  costOf(id) {
    const up = UPGRADES.find((u) => u.id === id);
    return up?.costs[this.level(id)] ?? 0;
  }

  get packages() {
    return availablePackages(this.owns);
  }

  // ---------------------------------------------------------------- müşteri
  startCustomer(car) {
    const pkg = car.package || PACKAGES.standart;
    this.customer = { car, elapsed: 0, target: Math.round(car.def.time * pkg.time) };
    this.hud.setCustomer(car.customer, car.def.name, this.estimatePay(car.def.pay * pkg.mult), pkg);
  }

  get multiplier() {
    return TABLE.shampooMult[this.level('sponge')] * (1 + TABLE.shopBonus[this.shopLevel]);
  }

  estimatePay(base) {
    return Math.round(base * this.multiplier);
  }

  update(dt) {
    if (!this.customer) return;
    this.customer.elapsed += dt;
    const left = Math.max(0, this.customer.target - this.customer.elapsed);
    this.hud.setTimer(left, left / this.customer.target);
  }

  /** Araç bitti: ödeme yap. Dönüş: { total, tip } */
  payout() {
    const c = this.customer;
    if (!c) return null;
    const base = c.car.def.pay * (c.car.package?.mult || 1);
    const timeFrac = Math.max(0, 1 - c.elapsed / c.target);
    const tip = base * 0.35 * timeFrac;
    const mult = this.multiplier;
    const total = Math.round((base + tip) * mult);
    const tipShown = Math.round(tip * mult);

    this.state.money += total;
    this.state.totalEarned += total;
    this.state.washed += 1;
    this.save();
    this.customer = null;

    this.hud.setMoney(this.state.money, true);
    this.hud.setWashed(this.state.washed);
    this.hud.clearCustomer();
    this.audio.cash();
    return { total, tip: tipShown };
  }

  addMoney(n) {
    this.state.money += n;
    this.save();
    this.hud.setMoney(this.state.money, true);
    this.renderShop();
  }

  // ---------------------------------------------------------------- mağaza
  buy(id) {
    const up = UPGRADES.find((u) => u.id === id);
    const lvl = this.level(id);
    const cost = up.costs[lvl];
    if (cost === undefined) return;
    if (this.state.money < cost) {
      this.audio.error();
      return;
    }
    this.state.money -= cost;
    this.state.levels[id] = lvl + 1;
    this.save();
    this.audio.upgrade();
    this.hud.setMoney(this.state.money, false);
    this.renderShop();
    this.onUpgrade?.(id, lvl + 1);
  }

  renderShop() {
    this.shopMoneyEl.textContent = this.state.money.toLocaleString('tr-TR');
    const open = new Set(this.packages.map((p) => p.id));
    const pkgs = Object.values(PACKAGES).map((p) =>
      `<span class="pkg-chip ${open.has(p.id) ? 'on' : ''}" style="--c:${p.color}">${open.has(p.id) ? '✓' : '🔒'} ${p.name} <b>×${p.mult}</b></span>`).join('');
    this.itemsEl.innerHTML = `<div class="shop-packages">${pkgs}</div>` + UPGRADES.map((u) => {
      const lvl = this.level(u.id);
      const max = u.costs.length;
      const maxed = lvl >= max;
      const cost = u.costs[lvl];
      const pips = max > 1 ? `<div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>` : '';
      const next = maxed ? '' : `<div class="effect">Sonraki: ${u.effect(lvl + 1)}</div>`;
      return `
        <div class="shop-item ${maxed ? 'maxed' : ''}">
          <div class="top"><span class="icon">${u.icon}</span><h3>${u.name}</h3></div>
          <p class="desc">${u.desc}</p>
          <div class="effect">Şu an: ${u.effect(lvl)}</div>
          ${next}
          ${pips}
          ${u.cosmetic && maxed
            ? `<button data-toggle="${u.id}" class="toggle ${this.state.settings[u.id] ? 'on' : ''}">${this.state.settings[u.id] ? 'Kullanılıyor ✓ — kapat' : 'Kapalı — kullan'}</button>`
            : `<button data-buy="${u.id}" ${maxed || this.state.money < cost ? 'disabled' : ''}>
            ${maxed ? 'Maksimum ✓' : `$${cost.toLocaleString('tr-TR')} — ${lvl ? 'Yükselt' : 'Satın al'}`}
          </button>`}
        </div>`;
    }).join('');
  }

  openShop() {
    this.renderShop();
    this.shopEl.classList.remove('hidden');
  }

  closeShop() {
    this.shopEl.classList.add('hidden');
  }

  get shopOpen() {
    return !this.shopEl.classList.contains('hidden');
  }
}
