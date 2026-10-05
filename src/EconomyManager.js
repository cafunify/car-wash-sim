import { availablePackages, PACKAGES } from './Packages.js';
import { TOWEL_ICON } from './Icons.js';

/**
 * Para, yükseltmeler, müşteri zamanlayıcısı / bahşiş, kayıt ve mağaza arayüzü.
 */

const SAVE_KEY = 'parilti-oto-yikama-v1';
const START_MONEY = 0;
// Tüm müşteri sürelerini orantılı uzatır (bahşiş için daha rahat zaman)
const TIME_SCALE = 1.6;
export const CARS_PER_DAY = 6;
const START_REP = 3;

/** Müşteri yorumları: yıldız sayısına göre */
const COMMENTS = {
  5: ['Vay be, yeni gibi olmuş! ✨', 'Kendi arabamı tanıyamadım!', 'Ayna gibi parlıyor, harika iş!', 'Kesinlikle yine geleceğim.'],
  4: ['Tertemiz olmuş, biraz bekledim ama değdi.', 'Güzel iş, eline sağlık.', 'Gayet iyi, teşekkürler.'],
  3: ['Fena değil ama daha iyisini beklerdim.', 'İdare eder.', 'Biraz uzun sürdü açıkçası.'],
  2: ['Hâlâ kirli yerler var…', 'Bu parayı hak etmedi bence.'],
  1: ['Bu mu yıkandı?! Bir daha gelmem.', 'Hiç memnun kalmadım.'],
};
/** Kuş pisliği kuruyana kadar beklenen araçlar için yorumlar */
const ETCHED_COMMENTS = ['Kuş pisliği kurumuş, boyam ne olacak?', 'Kaputtaki kuş pisliğini neden hemen almadınız?'];

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
    icon: TOWEL_ICON,
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
    this.hud.setDay(this.state.day, this.state.today.cars, CARS_PER_DAY, this.state.rep);
  }

  // ---------------------------------------------------------------- kayıt
  defaultState() {
    return {
      money: START_MONEY, washed: 0, totalEarned: 0,
      rep: START_REP, day: 1, today: this.freshDay(START_REP),
      life: { cars: 0, perfect: 0, tipCars: 0, spots: 0, streak: 0, bestStreak: 0, days: 0 }, ach: {}, goal: null, tutorialDone: false,
      levels: { nozzle: 0, sponge: 0, towel: 0, rimcleaner: 0, tireshine: 0, glasscleaner: 0, polisher: 0, pinkfoam: 0, shop: 0 },
      settings: { pinkfoam: true, music: true, musicVol: 70, sfxVol: 90, sens: 100, quality: 'medium', fps: false, touch: !!globalThis.matchMedia?.('(pointer: coarse)').matches },
    };
  }

  freshDay(rep) {
    return { cars: 0, earned: 0, tips: 0, stars: [], repStart: rep };
  }

  load() {
    const def = this.defaultState();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return def;
      const s = JSON.parse(raw);
      // Rehberden önce oynayan eski kayıtlar rehberi görmez
      if (s.tutorialDone === undefined) s.tutorialDone = true;
      return { ...def, ...s, levels: { ...def.levels, ...(s.levels || {}) }, settings: { ...def.settings, ...(s.settings || {}) }, life: { ...def.life, ...(s.life || {}) }, ach: { ...(s.ach || {}) } };
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
    this.customer = { car, elapsed: 0, target: Math.round(car.def.time * pkg.time * TIME_SCALE) };
    this.hud.setCustomer(car.customer, car.def.name, this.estimatePay(car.def.pay * pkg.mult), pkg);
  }

  /** İtibar (1–5 yıldız) ücreti etkiler: 3 yıldız ×1, 5 yıldız ×1.1, 1 yıldız ×0.9 */
  get repMult() {
    return 0.85 + this.state.rep * 0.05;
  }

  get multiplier() {
    return TABLE.shampooMult[this.level('sponge')] * (1 + TABLE.shopBonus[this.shopLevel]) * this.repMult;
  }

  /** Teslim edilen iş için müşteri puanı (1–5). etched: kuş pisliği kurudu (-1 yıldız) */
  rate(q, etched = false) {
    const c = this.customer;
    let stars;
    if (q.complete) {
      const late = c.elapsed / c.target;
      stars = late <= 1 ? 5 : late <= 1.5 ? 4 : 3;
    } else {
      const clean = 1 - q.missing / 100;
      stars = clean >= 0.9 ? 3 : clean >= 0.7 ? 2 : 1;
    }
    return etched ? Math.max(1, stars - 1) : stars;
  }

  get dayOver() {
    return this.state.today.cars >= CARS_PER_DAY;
  }

  /** Gün sonu raporunu kapat, yeni güne başla */
  startNextDay() {
    this.state.day += 1;
    this.state.today = this.freshDay(this.state.rep);
    this.save();
    this.hud.setDay(this.state.day, 0, CARS_PER_DAY, this.state.rep);
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

  /** Teslim edilince alınacak ücret. progress: 0..1 temizlik oranı */
  quote(progress = 1) {
    const c = this.customer;
    if (!c) return null;
    const complete = progress >= 0.999;
    const base = c.car.def.pay * (c.car.package?.mult || 1);
    // Bahşiş sadece eksiksiz teslimde ve süre dolmadan
    const timeFrac = complete ? Math.max(0, 1 - c.elapsed / c.target) : 0;
    const tip = base * 0.35 * timeFrac;
    const full = Math.round((base + tip) * this.multiplier);
    // Eksik kalan her %1 için 2 dolar kesinti
    const missing = complete ? 0 : Math.ceil((1 - progress) * 100);
    const penalty = missing * 2;
    return { total: Math.max(0, full - penalty), tip: Math.round(tip * this.multiplier), missing, penalty, complete };
  }

  /** Aracı teslim et ve ödemeyi al. etched: kuş pisliği kurudu. Dönüş: quote() */
  payout(progress = 1, { etched = false } = {}) {
    const q = this.quote(progress);
    if (!q) return null;
    q.stars = this.rate(q, etched);
    const pool = etched ? ETCHED_COMMENTS : COMMENTS[q.stars];
    q.comment = pool[(Math.random() * pool.length) | 0];
    const st = this.state;
    const prevRep = st.rep;
    st.rep = Math.min(5, Math.max(1, st.rep + (q.stars - st.rep) * 0.2));
    q.repDelta = st.rep - prevRep;
    st.money += q.total;
    st.totalEarned += q.total;
    st.washed += 1;
    st.today.cars += 1;
    st.today.earned += q.total;
    st.today.tips += q.tip;
    st.today.stars.push(q.stars);
    this.save();
    this.hud.setDay(st.day, st.today.cars, CARS_PER_DAY, st.rep);
    this.customer = null;

    this.hud.setMoney(this.state.money, true);
    this.hud.setWashed(this.state.washed);
    this.hud.clearCustomer();
    if (q.complete) this.audio.cash();
    else this.audio.tone(660, { dur: 0.5, vol: 0.035 });
    return q;
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
