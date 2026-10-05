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
  { id: 'radio_sunday', kind: 'radio', icon: '☀️', name: 'Pazar Sabahı Radyosu', cost: 100, desc: 'Daha aydınlık, majör akorlu lo-fi.' },
  { id: 'radio_night', kind: 'radio', icon: '🌙', name: 'Gece Yarısı Radyosu', cost: 100, desc: 'Daha loş, minör akorlu lo-fi.' },
];
export const RADIOS = [
  { id: 'lofi', name: 'Klasik Lo-fi', need: null },
  { id: 'sunday', name: 'Pazar Sabahı', need: 'radio_sunday' },
  { id: 'night', name: 'Gece Yarısı', need: 'radio_night' },
];
export const SIGN_PRESETS = ['MAHALLE YIKAMA', 'BALONCUK GARAJ', 'USTA ELİ', 'PIRIL PIRIL'];

export const decorById = (id) => DECOR.find((d) => d.id === id);

export function defaultDecor() {
  return { owned: {}, posters: [], radio: 'lofi', sign: '' };
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
const _trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 });

function buildPlant(tall) {
  const g = new THREE.Group();
  const h = tall ? 0.55 : 0.36;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.62, h * 0.45, h, 16), _potMat);
  pot.position.y = h / 2;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.58, h * 0.58, 0.03, 16), _soilMat);
  soil.position.y = h;
  g.add(pot, soil);
  if (tall) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 8), _trunkMat);
    trunk.position.y = h + 0.75;
    g.add(trunk);
  }
  const top = tall ? h + 1.5 : h;
  const n = tall ? 8 : 7;
  for (let i = 0; i < n; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), _leafMat);
    leaf.scale.set(tall ? 0.7 : 0.16, tall ? 0.05 : 0.34, tall ? 0.16 : 0.08);
    const a = (i / n) * Math.PI * 2;
    if (tall) {
      leaf.position.set(Math.cos(a) * 0.55, top - 0.05, Math.sin(a) * 0.55);
      leaf.rotation.set(0, -a, -0.35);
    } else {
      leaf.position.set(Math.cos(a) * 0.1, top + 0.22, Math.sin(a) * 0.1);
      leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    }
    g.add(leaf);
  }
  return g;
}

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
  }

  apply(decor) {
    for (const k of Object.keys(this.plants)) this.plants[k].visible = !!decor.owned[k];
    this.posters.forEach((m) => {
      this.group.remove(m);
      m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== _frameMat) o.material.dispose(); } }); // dokular önbellekte kalır
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
}
