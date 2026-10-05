import * as THREE from 'three';

/**
 * Dükkân kişiselleştirme: tabela yazısı, duvar posterleri, bitkiler ve radyo istasyonu.
 * Hepsi kozmetiktir (denge etkisi yok). Kayıt: `state.decor = { owned, posters, radio, sign }`.
 */
export const MAX_POSTERS = 3;
export const SIGN_MAX = 18;

export const DECOR = [
  { id: 'sign', kind: 'sign', icon: '🪧', name: 'Özel Tabela Yazısı', cost: 120, desc: 'Dükkânının adını sen koy. Her seviyedeki tabelada görünür.' },
  { id: 'p_classic', kind: 'poster', icon: '🖼', name: 'Klasik Araba Posteri', cost: 80, desc: 'Retro bir araç silueti.' },
  { id: 'p_sunset', kind: 'poster', icon: '🌅', name: 'Gün Batımı Posteri', cost: 80, desc: 'Turuncu-mor bir ufuk.' },
  { id: 'p_bubble', kind: 'poster', icon: '🫧', name: 'Baloncuk Posteri', cost: 100, desc: 'Köpük ve baloncuklar.' },
  { id: 'p_photo', kind: 'poster', icon: '📜', name: 'Eski Fotoğraf', gift: 'Hasan Amca', desc: 'Milano ve 30 yıl önceki parıltı.' },
  { id: 'p_child', kind: 'poster', icon: '🖍', name: 'Çocuk Resmi', gift: 'Zehra Öğretmen', desc: 'Güneş, dükkân ve baloncuklar.' },
  { id: 'p_race', kind: 'poster', icon: '🏁', name: 'Yarış Posteri', gift: 'Selim Bey', desc: 'Damalı bayrak.' },
  { id: 'plant1', kind: 'plant', icon: '🪴', name: 'Saksı Bitkisi', cost: 60, desc: 'Köşeye küçük bir yeşillik.' },
  { id: 'plant2', kind: 'plant', icon: '🌴', name: 'Palmiye', cost: 140, desc: 'Karşı köşeye uzun bir palmiye.' },
  { id: 'cat', kind: 'prop', icon: '🐈', name: 'Dükkân Kedisi', cost: 150, desc: 'Minderinde uyur. Yanına gidip E ile sevebilirsin.' },
  { id: 'tea', kind: 'prop', icon: '🫖', name: 'Çay Köşesi', cost: 100, desc: 'Semaver, tulip bardaklar ve küçük bir masa.' },
  { id: 'lights', kind: 'prop', icon: '💡', name: 'Işık Dizisi', cost: 70, desc: 'Duvar boyunca sıcak, hafif titreyen ampuller.' },
  { id: 'neon', kind: 'neon', icon: '🪩', name: 'Neon "AÇIK" Tabelası', cost: 90, desc: 'Sağ duvarda yanan tabela; rengini seçebilirsin.' },
  { id: 'albumwall', kind: 'prop', icon: '📸', name: 'Albüm Duvarı', cost: 90, desc: 'Albümdeki en iyi 3 işin fotoğrafı çerçeveli asılır.' },
  { id: 'clock', kind: 'prop', icon: '🕰', name: 'Duvar Saati', cost: 60, desc: 'Sağ duvarda, gerçek saati gösterir.' },
  { id: 'm_hasan', kind: 'memory', icon: '🚗', name: 'Oyuncak Milano', gift: 'Hasan Amca', desc: 'Anı rafı: 1995 model Milano’nun minyatürü.' },
  { id: 'm_zehra', kind: 'memory', icon: '🍎', name: 'Kitaplar ve Elma', gift: 'Zehra Öğretmen', desc: 'Anı rafı: öğretmenin klasik hediyesi.' },
  { id: 'm_riza', kind: 'memory', icon: '🔧', name: 'Rıza Usta’nın Anahtarı', gift: 'Rıza Usta', desc: 'Anı rafı: eski bir lokma anahtarı.' },
  { id: 'm_nuri', kind: 'memory', icon: '🍅', name: 'Domates Sepeti', gift: 'Nuri Dede', desc: 'Anı rafı: pazardan taze domatesler.' },
  { id: 'm_defne', kind: 'memory', icon: '🎓', name: 'Mezuniyet Şapkası', gift: 'Defne', desc: 'Anı rafı: püsküllü bir kep.' },
  { id: 'm_selim', kind: 'memory', icon: '🏆', name: 'Yarış Kupası', gift: 'Selim Bey', desc: 'Anı rafı: parlatılmış altın kupa.' },
  { id: 'm_yusuf', kind: 'memory', icon: '🫙', name: 'Memleket Reçeli', gift: 'Kamyoncu Yusuf', desc: 'Anı rafı: annesinin yaptığı reçel.' },
  { id: 'radio_sunday', kind: 'radio', icon: '☀️', name: 'Pazar Sabahı Radyosu', cost: 100, desc: 'Daha aydınlık, majör akorlu lo-fi.' },
  { id: 'radio_night', kind: 'radio', icon: '🌙', name: 'Gece Yarısı Radyosu', cost: 100, desc: 'Daha loş, minör akorlu lo-fi.' },
];
export const RADIOS = [
  { id: 'lofi', name: 'Klasik Lo-fi', need: null },
  { id: 'sunday', name: 'Pazar Sabahı', need: 'radio_sunday' },
  { id: 'night', name: 'Gece Yarısı', need: 'radio_night' },
];
export const NEON_COLORS = {
  pink: { name: 'Pembe', css: '#ff6fd8', glow: '#ff2fc4' },
  cyan: { name: 'Camgöbeği', css: '#7ff3ff', glow: '#12c8ff' },
  amber: { name: 'Kehribar', css: '#ffd27a', glow: '#ff9a1f' },
};
export const SIGN_PRESETS = ['MAHALLE YIKAMA', 'BALONCUK GARAJ', 'USTA ELİ', 'PIRIL PIRIL'];

export const decorById = (id) => DECOR.find((d) => d.id === id);

export function defaultDecor() {
  return { owned: {}, posters: [], radio: 'lofi', sign: '', neon: 'pink' };
}

/** Mağaza "Dekor" sekmesinin HTML'i */
export function renderDecorShop(state) {
  const d = state.decor;
  const hung = d.posters.length;
  const card = (it, body) => `
    <div class="shop-item ${d.owned[it.id] ? 'maxed' : ''}">
      <div class="top"><span class="icon">${it.icon}</span><h3>${it.name}</h3></div>
      <p class="desc">${it.desc}</p>${body}
    </div>`;
  const buy = (it) => (d.owned[it.id]
    ? '<div class="effect">Satın alındı ✓</div>'
    : it.gift
      ? `<div class="effect">🔒 ${it.gift} bir gün hediye edebilir</div>`
      : `<button data-dbuy="${it.id}" ${state.money < it.cost ? 'disabled' : ''}>$${it.cost} — Satın al</button>`);
  return DECOR.map((it) => {
    if (it.kind === 'sign') {
      return card(it, d.owned.sign
        ? `<input id="sign-input" class="sign-input" maxlength="${SIGN_MAX}" value="${d.sign.replace(/"/g, '')}" placeholder="PARILTI">
           <div class="sign-presets">${SIGN_PRESETS.map((p) => `<button class="chip" data-sign="${p}">${p}</button>`).join('')}</div>
           <button data-sign-save>Tabelaya yaz</button>`
        : buy(it));
    }
    if (it.kind === 'poster' && d.owned[it.id]) {
      const on = d.posters.includes(it.id);
      return card(it, `<button data-dhang="${it.id}" class="toggle ${on ? 'on' : ''}" ${!on && hung >= MAX_POSTERS ? 'disabled' : ''}>${on ? 'Duvarda ✓ — indir' : hung >= MAX_POSTERS ? 'Duvar dolu (3)' : 'Duvara as'}</button>`);
    }
    if (it.kind === 'neon' && d.owned[it.id]) {
      return card(it, `<div class="sign-presets">${Object.keys(NEON_COLORS).map((k) => `<button class="chip ${d.neon === k ? 'on' : ''}" data-neon="${k}">${NEON_COLORS[k].name}</button>`).join('')}</div>`);
    }
    if (it.kind === 'radio' && d.owned[it.id]) {
      const id = it.id.replace('radio_', '');
      return card(it, `<button data-radio="${id}" class="toggle ${d.radio === id ? 'on' : ''}">${d.radio === id ? 'Çalıyor ✓' : 'Bu istasyonu çal'}</button>`);
    }
    return card(it, buy(it));
  }).join('') + `<div class="shop-item ${d.radio === 'lofi' ? 'maxed' : ''}">
      <div class="top"><span class="icon">📻</span><h3>Klasik Lo-fi</h3></div>
      <p class="desc">Varsayılan istasyon.</p>
      <button data-radio="lofi" class="toggle ${d.radio === 'lofi' ? 'on' : ''}">${d.radio === 'lofi' ? 'Çalıyor ✓' : 'Bu istasyonu çal'}</button>
    </div>`;
}

// ------------------------------------------------------------------ posterler (prosedürel)
function posterTexture(id) {
  const W = 256, H = 340;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = (a, b) => { const k = g.createLinearGradient(0, 0, 0, H); k.addColorStop(0, a); k.addColorStop(1, b); g.fillStyle = k; g.fillRect(0, 0, W, H); };
  const car = (x, y, s, col) => {
    g.fillStyle = col;
    g.beginPath(); g.roundRect(x, y + 20 * s, 130 * s, 28 * s, 8 * s); g.fill();
    g.beginPath(); g.moveTo(x + 26 * s, y + 20 * s); g.lineTo(x + 44 * s, y + 2 * s); g.lineTo(x + 92 * s, y + 2 * s); g.lineTo(x + 110 * s, y + 20 * s); g.fill();
    g.fillStyle = '#10151c';
    for (const wx of [30, 100]) { g.beginPath(); g.arc(x + wx * s, y + 48 * s, 11 * s, 0, 7); g.fill(); }
  };
  const label = (t, y = H - 38, col = '#fff') => { g.fillStyle = col; g.font = '800 26px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText(t, W / 2, y); };
  if (id === 'p_classic') {
    grad('#1d6f78', '#0e3a42'); car(60, 130, 1.0, '#e8553d'); g.fillStyle = '#f2e7c9'; g.fillRect(20, 215, 216, 4); label('KLASİK');
  } else if (id === 'p_sunset') {
    grad('#2a1b5c', '#ff8a3d'); g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(W / 2, 190, 52, 0, 7); g.fill();
    g.fillStyle = '#1a1038'; g.fillRect(0, 205, W, 135); for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(255,180,90,${0.5 - i * 0.09})`; g.fillRect(40 + i * 8, 215 + i * 12, W - 80 - i * 16, 4); } label('GÜN BATIMI', H - 30);
  } else if (id === 'p_bubble') {
    grad('#2bb4f0', '#1565c0'); for (let i = 0; i < 26; i++) { const x = (i * 97) % W, y = (i * 61) % (H - 60), r = 6 + (i * 13) % 22; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(x, y + 20, r, 0, 7); g.fill(); g.stroke(); } label('PIRIL PIRIL');
  } else if (id === 'p_photo') {
    grad('#c9b48a', '#8a7451'); g.fillStyle = '#e9dcc0'; g.fillRect(24, 40, W - 48, 200); g.fillStyle = '#9b8560'; g.fillRect(34, 50, W - 68, 180); car(62, 120, 1.0, '#3b4a63'); label('1995', H - 40, '#3a2f1c');
  } else if (id === 'p_child') {
    g.fillStyle = '#fff6df'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(200, 60, 30, 0, 7); g.fill();
    g.strokeStyle = '#ff7043'; g.lineWidth = 6; g.strokeRect(50, 150, 150, 100); g.beginPath(); g.moveTo(40, 150); g.lineTo(125, 100); g.lineTo(210, 150); g.stroke();
    g.strokeStyle = '#42a5f5'; g.lineWidth = 4; for (const [x, y, r] of [[40, 90, 14], [90, 60, 10], [60, 290, 16], [190, 290, 12]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); } label('YIKAMA', H - 36, '#ff7043');
  } else {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; const s = 32;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2 === 0) g.fillRect(x * s, y * s, s, s);
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(0, 118, W, 90); label('P1', 184, '#ffd35a');
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------ sahne nesneleri
const POSTER_SLOTS = [-5.0, -2.9, -0.8]; // sol duvarda z konumları
const _frameMat = new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 0.6 });
const _potMat = new THREE.MeshStandardMaterial({ color: 0xa2573a, roughness: 0.8 });
const _soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 });
const _leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9b4b, roughness: 0.7, side: THREE.DoubleSide });
const _leafMat2 = new THREE.MeshStandardMaterial({ color: 0x2f7d3e, roughness: 0.7, side: THREE.DoubleSide });
const _trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 });

const _mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const _add = (parent, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

function buildPlant(tall) {
  const g = new THREE.Group();
  const h = tall ? 0.6 : 0.4;
  _add(g, new THREE.Mesh(new THREE.CylinderGeometry(h * 0.6, h * 0.42, h, 20), _potMat), 0, h / 2);
  _add(g, new THREE.Mesh(new THREE.TorusGeometry(h * 0.6, 0.02, 8, 24), _potMat), 0, h).rotation.x = Math.PI / 2;
  _add(g, new THREE.Mesh(new THREE.CylinderGeometry(h * 0.56, h * 0.56, 0.03, 20), _soilMat), 0, h - 0.02);
  if (tall) {
    const trunk = _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 1.5, 8), _trunkMat), 0, h + 0.75);
    trunk.rotation.z = 0.05;
    const top = h + 1.5;
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const len = 0.75 + (i % 3) * 0.12;
      const frond = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), i % 2 ? _leafMat : _leafMat2);
      frond.scale.set(len, 0.035, 0.15);
      const pivot = new THREE.Group();
      pivot.position.set(0, top, 0);
      pivot.rotation.y = -a;
      frond.position.set(len * 0.9, -0.1, 0);
      frond.rotation.z = -0.45 - (i % 3) * 0.1; // aşağı sarkan yapraklar
      pivot.add(frond);
      g.add(pivot);
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.3;
      const lean = 0.3 + (i % 4) * 0.2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), i % 2 ? _leafMat : _leafMat2);
      leaf.scale.set(0.07, 0.3 + (i % 3) * 0.06, 0.025);
      const pivot = new THREE.Group();
      pivot.position.set(0, h, 0);
      pivot.rotation.set(0, -a, lean);
      leaf.position.set(0, 0.28, 0);
      pivot.add(leaf);
      g.add(pivot);
    }
  }
  return g;
}

/** Minder üstünde kıvrılıp uyuyan kedi (nefes alır, kuyruk sallanır) */
function buildCat() {
  const g = new THREE.Group();
  const fur = _mat(0xd9893b), belly = _mat(0xf4e6d0), dark = _mat(0x1b1b1f);
  _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.1, 24), _mat(0xa6423a)), 0, 0.05);
  const body = _add(g, new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), fur), 0, 0.26);
  body.scale.set(1.25, 0.8, 1);
  const chest = _add(g, new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), belly), 0.2, 0.2, 0.12);
  const head = _add(g, new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), fur), 0.27, 0.27, 0.08);
  for (const sz of [-1, 1]) {
    const ear = _add(g, new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), fur), 0.27 + 0.01, 0.4, 0.08 + sz * 0.07);
    ear.rotation.x = -sz * 0.25;
    const eye = _add(g, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.04), dark), 0.385, 0.285, 0.08 + sz * 0.05); // kapalı gözler
    eye.rotation.y = 0;
  }
  _add(g, new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), _mat(0xe58aa0)), 0.395, 0.25, 0.08);
  const tail = new THREE.Group();
  tail.position.set(-0.22, 0.16, -0.12);
  for (let i = 0; i < 6; i++) {
    const seg = _add(tail, new THREE.Mesh(new THREE.SphereGeometry(0.045 - i * 0.003, 8, 6), fur), -0.05 * i, 0, i * 0.07);
    seg.scale.set(1.2, 1, 1);
  }
  g.add(tail);
  g.userData = { body, head, chest, tail };
  return g;
}

/** Semaver, iki tulip bardak, masa ve tabure */
function buildTea() {
  const g = new THREE.Group();
  const wood = _mat(0x7a5436), steel = _mat(0xc7ccd4, { metalness: 0.85, roughness: 0.3 }), glass = _mat(0xb5541a, { transparent: true, opacity: 0.75 });
  _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24), wood), 0, 0.72);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.72, 8), wood), Math.cos(a) * 0.3, 0.36, Math.sin(a) * 0.3);
  }
  const body = _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 20), steel), -0.12, 0.9);
  _add(g, new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel), -0.12, 1.05);
  _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 6), steel), -0.12, 1.17);
  const spout = _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.1, 6), steel), -0.12, 0.84, 0.15);
  spout.rotation.x = Math.PI / 2.4;
  for (const [x, z] of [[0.14, 0.08], [0.1, -0.12]]) {
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 16), steel), x, 0.755, z);
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.028, 0.09, 12), glass), x, 0.805, z);
  }
  const stool = _mat(0x3b4a63);
  _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 18), stool), 0.55, 0.43, 0.35);
  _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.42, 8), wood), 0.55, 0.21, 0.35);
  const steam = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    g.add(m);
    steam.push(m);
  }
  g.userData = { steam };
  return g;
}

/** Sıcak renkli ampullü ışık dizisi: iki uç arasında sarkan tel */
function buildLights(halfX) {
  const g = new THREE.Group();
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(0, 0, -6.4 + i * 1.6 + 0))), 40, 0.008, 4), _mat(0x111111));
  g.add(wire);
  const bulbs = [];
  const n = 17;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const z = -6.4 + t * 12.8;
    const sag = Math.sin(((i % 4) / 4) * Math.PI) * 0.0; // dalga aşağıda hesaplanır
    const y = 3.95 - Math.sin(((i % 4 + 0.5) / 4) * Math.PI) * 0.22 + sag;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.25, 0.6) }));
    m.position.set(0, y, z);
    g.add(m);
    bulbs.push(m);
  }
  // Tel: ampullerin üstünden geçen dalgalı çizgi
  wire.geometry.dispose();
  wire.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bulbs.map((b) => new THREE.Vector3(0, b.position.y + 0.06, b.position.z))), 80, 0.006, 4);
  g.position.x = -halfX + 0.12;
  g.userData = { bulbs };
  return g;
}

/** Duvar saati: kadran dokusu + akrep/yelkovan/saniye ibresi (yerel saati gösterir) */
function buildClock() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f4efe2'; x.beginPath(); x.arc(128, 128, 126, 0, 7); x.fill();
  x.fillStyle = '#23262d'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 30px Rubik, sans-serif';
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; x.fillText(String(i), 128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98); }
  for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; x.fillRect(128 + Math.cos(a) * 120 - 1, 128 + Math.sin(a) * 120 - 1, i % 5 ? 2 : 3, i % 5 ? 2 : 3); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _add(g, new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })), 0, 0, 0.012);
  _add(g, new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.025, 10, 40), _mat(0x23262d)), 0, 0, 0.012);
  const hand = (len, w, color) => {
    const pv = new THREE.Group();
    pv.position.z = 0.02;
    _add(pv, new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.006), _mat(color)), 0, len / 2 - 0.03);
    g.add(pv);
    return pv;
  };
  g.userData = { hour: hand(0.17, 0.022, 0x23262d), min: hand(0.26, 0.016, 0x23262d), sec: hand(0.28, 0.006, 0xc0392b) };
  return g;
}

// Anı rafındaki küçük eşyalar (her müdavimin hediyesi)
const MEMORY_BUILDERS = {
  m_hasan() { // oyuncak araba
    const g = new THREE.Group(); const blue = _mat(0x3b6fb5);
    _add(g, new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.06), blue), 0, 0.035);
    _add(g, new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.055), blue), -0.01, 0.065);
    for (const [x, z] of [[-0.05, 0.03], [0.05, 0.03], [-0.05, -0.03], [0.05, -0.03]]) _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10), _mat(0x15151a)), x, 0.016, z).rotation.x = Math.PI / 2;
    return g;
  },
  m_zehra() { // kitaplar ve elma
    const g = new THREE.Group();
    _add(g, new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.1), _mat(0x2f6fb3)), 0, 0.015);
    _add(g, new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.095), _mat(0xc0553b)), 0.005, 0.045);
    _add(g, new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), _mat(0xd3302f)), 0, 0.09);
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 4), _trunkMat), 0, 0.13);
    return g;
  },
  m_riza() { // lokma anahtarı
    const g = new THREE.Group(); const st = _mat(0xaab0ba, { metalness: 0.85, roughness: 0.35 });
    _add(g, new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.03), st), 0, 0.012);
    _add(g, new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 12), st), 0.09, 0.012).rotation.x = Math.PI / 2;
    return g;
  },
  m_nuri() { // domates sepeti
    const g = new THREE.Group();
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.06, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xb98a4e, roughness: 0.9, side: THREE.DoubleSide })), 0, 0.03);
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.01, 12), _mat(0x8a6232)), 0, 0.005);
    for (const [x, z] of [[-0.03, 0], [0.03, 0.01], [0, -0.03]]) _add(g, new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), _mat(0xd8372b)), x, 0.07, z);
    return g;
  },
  m_defne() { // mezuniyet şapkası
    const g = new THREE.Group(); const k = _mat(0x17181c);
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.04, 14), k), 0, 0.02);
    _add(g, new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.15), k), 0, 0.048).rotation.y = Math.PI / 4;
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 4), _mat(0xe6b422)), 0.06, 0.03, 0.06);
    return g;
  },
  m_selim() { // kupa
    const g = new THREE.Group(); const gold = _mat(0xe6b422, { metalness: 0.85, roughness: 0.25 });
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.015, 12), _mat(0x2a2a2f)), 0, 0.008);
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), gold), 0, 0.04);
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.07, 14), gold), 0, 0.1);
    for (const sx of [-1, 1]) _add(g, new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 10), gold), sx * 0.05, 0.1);
    return g;
  },
  m_yusuf() { // reçel kavanozu
    const g = new THREE.Group();
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 14), _mat(0xa5192e, { transparent: true, opacity: 0.9 })), 0, 0.045);
    _add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.02, 14), _mat(0xe7d6a1)), 0, 0.1);
    return g;
  },
};

function neonTexture(color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 150px Rubik, sans-serif';
  g.shadowColor = color.glow; g.shadowBlur = 32;
  g.strokeStyle = color.css; g.lineWidth = 7;
  g.strokeText('AÇIK', 256, 128);
  g.fillStyle = '#fff'; g.shadowBlur = 12;
  g.fillText('AÇIK', 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _photoFrameMat = new THREE.MeshStandardMaterial({ color: 0xe9e1cf, roughness: 0.7 });

/** Sahneye eklenen dekor grubu; kayıttaki duruma göre kendini yeniler */
export class DecorView {
  constructor(scene, halfX) {
    this.halfX = halfX;
    this.group = new THREE.Group();
    this.group.name = 'decor';
    this.posters = [];
    scene.add(this.group);
    this.textures = new Map();
    this.plants = { plant1: buildPlant(false), plant2: buildPlant(true) };
    this.plants.plant1.position.set(-halfX + 0.6, 0, 5.9);
    this.plants.plant2.position.set(-halfX + 0.7, 0, -5.9);
    this.group.add(this.plants.plant1, this.plants.plant2);

    this.cat = buildCat();
    this.cat.position.set(-halfX + 0.8, 0, 2.0);
    this.cat.rotation.y = 0.4;
    this.tea = buildTea();
    this.tea.position.set(-halfX + 0.65, 0, 3.4);
    this.lights = buildLights(halfX);
    this.group.add(this.cat, this.tea, this.lights);

    this.neon = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: new THREE.Color(1.5, 1.5, 1.5) }));
    this.neon.position.set(halfX - 0.04, 2.7, 4.3);
    this.neon.rotation.y = -Math.PI / 2;
    this.group.add(this.neon);

    this.wall = new THREE.Group();
    this.wall.position.set(halfX - 0.04, 1.55, 4.3);
    this.wallPhotos = [];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Group();
      _add(f, new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.86), _photoFrameMat));
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.5), new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 0.6 }));
      pic.rotation.y = -Math.PI / 2;
      pic.position.x = -0.02;
      f.add(pic);
      f.position.z = (i - 1) * 1.0;
      this.wall.add(f);
      this.wallPhotos.push(pic);
    }
    this.group.add(this.wall);
    this.clock = buildClock();
    this.clock.position.set(halfX - 0.05, 3.25, 1.2);
    this.clock.rotation.y = -Math.PI / 2;
    this.group.add(this.clock);

    // Anı rafı: sol duvarda, çay köşesinin yanında
    this.shelf = new THREE.Group();
    this.shelf.position.set(-halfX + 0.08, 1.45, 1.0);
    _add(this.shelf, new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 1.5), _mat(0x7a5436)));
    for (const z of [-0.6, 0.6]) _add(this.shelf, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.03), _mat(0x23262d)), 0, -0.07, z);
    this.memories = {};
    Object.keys(MEMORY_BUILDERS).forEach((id, i) => {
      const m = MEMORY_BUILDERS[id]();
      m.position.set(0, 0.02, -0.64 + i * 0.213);
      m.scale.setScalar(1.35);
      m.rotation.y = Math.PI / 2;
      this.shelf.add(m);
      this.memories[id] = m;
    });
    this.group.add(this.shelf);
    this.loader = new THREE.TextureLoader();
    this.t = 0;
  }

  /** Albümdeki en iyi 3 fotoğraf (data URL) duvara asılır */
  setPhotos(urls) {
    this.wallPhotos.forEach((pic, i) => {
      const url = urls[i];
      pic.parent.visible = !!url;
      if (!url) return;
      this.loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        pic.material.map?.dispose();
        pic.material.map = tex;
        pic.material.color.set(0xffffff);
        pic.material.needsUpdate = true;
      });
    });
  }

  /** Kediye yakın mı (E ile sevmek için) */
  nearCat(pos) {
    if (!this.cat.visible) return false;
    return Math.hypot(pos.x - this.cat.position.x, pos.z - this.cat.position.z) < 2.2;
  }

  purr() { this.purrTime = 2.5; }

  apply(decor) {
    const o = decor.owned;
    for (const k of Object.keys(this.plants)) this.plants[k].visible = !!o[k];
    this.cat.visible = !!o.cat;
    this.tea.visible = !!o.tea;
    this.lights.visible = !!o.lights;
    this.wall.visible = !!o.albumwall;
    this.neon.visible = !!o.neon;
    this.clock.visible = !!o.clock;
    let anyMemory = false;
    for (const id of Object.keys(this.memories)) { this.memories[id].visible = !!o[id]; anyMemory ||= !!o[id]; }
    this.shelf.visible = anyMemory;
    if (o.neon) {
      const col = NEON_COLORS[decor.neon] || NEON_COLORS.pink;
      this.neon.material.map?.dispose();
      this.neon.material.map = neonTexture(col);
      this.neon.material.needsUpdate = true;
    }
    this.posters.forEach((m) => {
      this.group.remove(m);
      m.traverse((x) => { if (x.isMesh) { x.geometry.dispose(); if (x.material !== _frameMat) x.material.dispose(); } }); // dokular önbellekte kalır
    });
    this.posters = [];
    decor.posters.slice(0, MAX_POSTERS).forEach((id, i) => {
      if (!this.textures.has(id)) this.textures.set(id, posterTexture(id));
      const m = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.62, 1.22), _frameMat);
      const art = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshStandardMaterial({ map: this.textures.get(id), roughness: 0.8 }));
      art.rotation.y = Math.PI / 2;
      art.position.x = 0.025;
      m.add(frame, art);
      m.position.set(-this.halfX + 0.05, 2.3, POSTER_SLOTS[i]);
      this.group.add(m);
      this.posters.push(m);
    });
  }

  /** Kare başına hafif hareketler: kedinin nefesi, buhar, ampul titremesi, neon */
  update(dt, time) {
    if (this.cat.visible) {
      const { body, chest, head, tail } = this.cat.userData;
      const breath = Math.sin(time * 1.6) * 0.03;
      body.scale.y = 0.8 + breath;
      chest.scale.y = 1 + breath * 1.5;
      this.purrTime = Math.max(0, (this.purrTime || 0) - dt);
      head.position.y = 0.27 + (this.purrTime > 0 ? Math.sin(time * 40) * 0.004 : 0);
      tail.rotation.y = Math.sin(time * 0.9) * 0.18;
    }
    if (this.tea.visible) {
      this.tea.userData.steam.forEach((m, i) => {
        const k = (time * 0.35 + i / 3) % 1;
        m.position.set(-0.12 + Math.sin(k * 6 + i) * 0.02, 1.2 + k * 0.4, 0);
        m.scale.setScalar(1 + k * 1.6);
        m.material.opacity = Math.sin(k * Math.PI) * 0.22;
      });
    }
    if (this.lights.visible) {
      this.lights.userData.bulbs.forEach((b, i) => {
        const f = 0.85 + Math.sin(time * 2.2 + i * 1.7) * 0.15;
        b.material.color.setRGB(1.8 * f, 1.25 * f, 0.6 * f);
      });
    }
    if (this.clock.visible && time - (this._clockT || -9) >= 1) {
      this._clockT = time;
      const d = new Date();
      const sec = d.getSeconds(), min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
      const { hour, min: mh, sec: sh } = this.clock.userData;
      hour.rotation.z = -(hr / 12) * Math.PI * 2;
      mh.rotation.z = -(min / 60) * Math.PI * 2;
      sh.rotation.z = -(sec / 60) * Math.PI * 2;
    }
    if (this.neon.visible) {
      const flick = Math.sin(time * 31) > 0.985 ? 0.55 : 1;
      this.neon.material.color.setScalar(1.5 * flick);
    }
  }
}
