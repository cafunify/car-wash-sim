import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

/** Oda boyutları (metre) */
export const ROOM = { halfX: 8, halfZ: 7, height: 5, doorWidth: 4.6, doorHeight: 3.7 };

/** Oyuncunun yürüyebileceği alan */
export const WALK_BOUNDS = { minX: -7.4, maxX: 7.4, minZ: -6.4, maxZ: 6.4 };

/** Seviye başına işleme ayarları */
const LEVEL_FX = [
  { bloom: [0.22, 0.35, 0.92], env: 1.0, exposure: 1.15 },
  { bloom: [0.2, 0.35, 0.95], env: 0.9, exposure: 0.92 },
  { bloom: [0.45, 0.25, 0.85], env: 0.45, exposure: 1.0 },
];

// ------------------------------------------------------------------ canvas doku yardımcıları
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  return t;
}

function speckle(g, w, h, count, colors, sizeMin = 1, sizeMax = 3, alpha = 0.5) {
  for (let i = 0; i < count; i++) {
    g.globalAlpha = Math.random() * alpha;
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const s = sizeMin + Math.random() * (sizeMax - sizeMin);
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
}

function blotch(g, x, y, r, color, alpha) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, color.replace('A', alpha));
  grd.addColorStop(1, color.replace('A', 0));
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(x, y, r, r * (0.5 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
  g.fill();
}

/** Zemin dokusu, oda zeminini tek parça kaplar (16x14 m → 2048x1792) */
const FLOOR_PX = 128; // metre başına piksel
function floorTexture(style) {
  const W = ROOM.halfX * 2 * FLOOR_PX, H = ROOM.halfZ * 2 * FLOOR_PX;
  const mx = (x) => (x + ROOM.halfX) * FLOOR_PX;
  const mz = (z) => (z + ROOM.halfZ) * FLOOR_PX;
  return canvasTex(W, H, (g) => {
    if (style === 0) {
      g.fillStyle = '#76746f';
      g.fillRect(0, 0, W, H);
      speckle(g, W, H, 60000, ['#5c5a55', '#8b8983', '#6a6863', '#9a978f'], 1, 4, 0.55);
      for (let i = 0; i < 26; i++) blotch(g, Math.random() * W, Math.random() * H, 60 + Math.random() * 180, 'rgba(40,36,30,A)', 0.25);
      for (let i = 0; i < 8; i++) blotch(g, Math.random() * W, Math.random() * H, 40 + Math.random() * 60, 'rgba(15,14,12,A)', 0.45);
      // Çatlaklar
      g.strokeStyle = 'rgba(30,28,25,0.55)';
      g.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        let x = Math.random() * W, y = Math.random() * H;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 10; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; g.lineTo(x, y); }
        g.stroke();
      }
      // Derz çizgileri
      g.strokeStyle = 'rgba(40,38,35,0.6)';
      g.lineWidth = 3;
      for (let x = -8; x <= 8; x += 4) { g.beginPath(); g.moveTo(mx(x), 0); g.lineTo(mx(x), H); g.stroke(); }
      for (let z = -7; z <= 7; z += 3.5) { g.beginPath(); g.moveTo(0, mz(z)); g.lineTo(W, mz(z)); g.stroke(); }
      // Soluk sarı park alanı
      g.strokeStyle = 'rgba(214,178,52,0.55)';
      g.lineWidth = 14;
      g.setLineDash([60, 22]);
      g.strokeRect(mx(-2.2), mz(-3.8), 4.4 * FLOOR_PX, 7.6 * FLOOR_PX);
      g.setLineDash([]);
    } else if (style === 1) {
      g.fillStyle = '#9da3a9';
      g.fillRect(0, 0, W, H);
      speckle(g, W, H, 90000, ['#ffffff', '#2c3137', '#6d747c', '#c7ccd1', '#4b87c5'], 1, 3, 0.8);
      // Sarı-siyah park şeridi
      g.fillStyle = '#f5c518';
      const band = 0.12 * FLOOR_PX;
      g.fillRect(mx(-2.4), mz(-4.2), band, 8.4 * FLOOR_PX);
      g.fillRect(mx(2.4) - band, mz(-4.2), band, 8.4 * FLOOR_PX);
      // Ok işaretleri
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (const z of [-5.6, 5.0]) {
        g.beginPath();
        g.moveTo(mx(0), mz(z + 0.9));
        g.lineTo(mx(-0.6), mz(z));
        g.lineTo(mx(-0.2), mz(z));
        g.lineTo(mx(-0.2), mz(z - 0.7));
        g.lineTo(mx(0.2), mz(z - 0.7));
        g.lineTo(mx(0.2), mz(z));
        g.lineTo(mx(0.6), mz(z));
        g.closePath();
        g.fill();
      }
    } else {
      g.fillStyle = '#0c0d11';
      g.fillRect(0, 0, W, H);
      // Büyük seramik karolar
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 2;
      for (let x = -8; x <= 8; x += 1.2) { g.beginPath(); g.moveTo(mx(x), 0); g.lineTo(mx(x), H); g.stroke(); }
      for (let z = -7; z <= 7; z += 1.2) { g.beginPath(); g.moveTo(0, mz(z)); g.lineTo(W, mz(z)); g.stroke(); }
      speckle(g, W, H, 20000, ['#1a1c22', '#08090b'], 1, 3, 0.6);
    }
    // Izgara/gider (orta hat boyunca)
    if (style < 2) {
      g.fillStyle = style === 0 ? '#3a3935' : '#50555b';
      g.fillRect(mx(-0.12), mz(-4.5), 0.24 * FLOOR_PX, 9 * FLOOR_PX);
      g.fillStyle = '#16171a';
      for (let z = -4.45; z < 4.5; z += 0.08) g.fillRect(mx(-0.09), mz(z), 0.18 * FLOOR_PX, 0.035 * FLOOR_PX);
    } else {
      g.fillStyle = '#050506';
      g.fillRect(mx(-0.1), mz(-4.5), 0.2 * FLOOR_PX, 9 * FLOOR_PX);
    }
  }, { aniso: 16 });
}

function blockWallTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#b9b7b0';
    g.fillRect(0, 0, w, h);
    const bw = 256, bh = 128;
    for (let row = 0; row < h / bh; row++) {
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        const y = row * bh;
        const v = 175 + Math.random() * 25;
        g.fillStyle = `rgb(${v},${v - 2},${v - 8})`;
        g.fillRect(x + 5, y + 5, bw - 10, bh - 10);
      }
    }
    speckle(g, w, h, 16000, ['#8f8d86', '#d0cec8'], 1, 3, 0.5);
  }, { repeat: [4, 1.25] });
}

function panelWallTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#eceef1';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d5d9de';
    for (let x = 0; x < w; x += 256) g.fillRect(x, 0, 4, h);
    speckle(g, w, h, 4000, ['#c9cdd2'], 1, 2, 0.4);
  }, { repeat: [8, 1] });
}

function slatWallTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#17181c';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = '#23252b';
      g.fillRect(x + 2, 0, 24, h);
      g.fillStyle = 'rgba(255,255,255,0.03)';
      g.fillRect(x + 2, 0, 3, h);
    }
  }, { repeat: [12, 1] });
}

function hazardTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f5c518';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16171a';
    for (let i = -h; i < w + h; i += 64) {
      g.beginPath();
      g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - h, h); g.lineTo(i - h, h);
      g.closePath();
      g.fill();
    }
  }, { repeat: [1, 6] });
}

function textTexture(text, { font = 'bold 120px Rubik, sans-serif', color = '#fff', bg = null, glow = null, w = 1024, h = 256, sub = null } = {}) {
  return canvasTex(w, h, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font;
    if (glow) { g.shadowColor = glow; g.shadowBlur = 30; }
    g.fillStyle = color;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) {
      g.shadowBlur = 0;
      g.font = `600 ${Math.round(h * 0.16)}px Rubik, sans-serif`;
      g.fillText(sub, w / 2, h * 0.8);
    }
  }, { aniso: 4 });
}

function skylineTexture() {
  return canvasTex(2048, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#0a1024');
    grd.addColorStop(0.55, '#26305a');
    grd.addColorStop(0.8, '#e0875a');
    grd.addColorStop(1, '#f2b37a');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h * 0.4, 400, ['#ffffff'], 1, 2, 0.8);
    let x = 0;
    while (x < w) {
      const bw = 40 + Math.random() * 110;
      const bh = 60 + Math.random() * 220;
      g.fillStyle = `rgb(${14 + Math.random() * 10},${16 + Math.random() * 10},${30 + Math.random() * 12})`;
      g.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 10; wy < h - 8; wy += 14) {
        for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
          if (Math.random() < 0.3) {
            g.fillStyle = Math.random() < 0.8 ? '#ffd98a' : '#8ad8ff';
            g.globalAlpha = 0.5 + Math.random() * 0.5;
            g.fillRect(wx, wy, 5, 7);
          }
        }
      }
      g.globalAlpha = 1;
      x += bw + Math.random() * 12;
    }
  }, { repeat: [1, 1] });
}

// ------------------------------------------------------------------ Ortam
export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.level = -1;
    this.levels = [];
    this.animated = [];
    RectAreaLightUniformsLib.init();

    this.buildOutside();
    this.levels = [this.buildLevel0(), this.buildLevel1(), this.buildLevel2()];
    this.levels.forEach((l) => { l.visible = false; scene.add(l); });

    // Paylaşılan ışıklar
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3530, 0.35);
    scene.add(hemi);
    this.hemi = hemi;

    // Gölge veren tepe spot ışığı (RectAreaLight gölge üretmez)
    const spot = new THREE.SpotLight(0xffffff, 60, 14, Math.PI / 4.2, 0.7, 1.4);
    spot.position.set(0.8, 4.8, 0.5);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    spot.shadow.radius = 6;
    scene.add(spot, spot.target);
    this.spot = spot;
  }

  get fx() {
    return LEVEL_FX[this.level];
  }

  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    this.levels.forEach((l, i) => (l.visible = i === level));
    this.scene.environmentIntensity = LEVEL_FX[level].env;
    this.renderer.toneMappingExposure = LEVEL_FX[level].exposure;
    this.spot.color.set(level === 2 ? 0xe8f0ff : level === 1 ? 0xffffff : 0xfff1dc);
    this.spot.intensity = level === 2 ? 28 : level === 1 ? 32 : 30;
  }

  update(time) {
    for (const a of this.animated) a(time);
  }

  // ---------------------------------------------------------------- ortak parçalar
  box(parent, w, h, d, mat, x, y, z, { shadow = true, rounded = 0 } = {}) {
    const geo = rounded ? new RoundedBoxGeometry(w, h, d, 3, rounded) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /** Zemin, kapı boşluklu duvarlar ve tavan */
  buildShell(g, { floor, wall, ceiling, frame }) {
    const { halfX, halfZ, height, doorWidth, doorHeight } = ROOM;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), floor);
    f.rotation.x = -Math.PI / 2;
    f.receiveShadow = true;
    g.add(f);
    g.userData.floor = f;

    const c = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), ceiling);
    c.rotation.x = Math.PI / 2;
    c.position.y = height;
    g.add(c);

    const t = 0.3;
    // Yan duvarlar
    this.box(g, t, height, halfZ * 2, wall, -halfX - t / 2, height / 2, 0, { shadow: false });
    this.box(g, t, height, halfZ * 2, wall, halfX + t / 2, height / 2, 0, { shadow: false });
    // Ön/arka duvarlar (kapı boşluklu)
    const side = (halfX * 2 - doorWidth) / 2;
    for (const sz of [-1, 1]) {
      const z = sz * (halfZ + t / 2);
      this.box(g, side, height, t, wall, -halfX + side / 2, height / 2, z, { shadow: false });
      this.box(g, side, height, t, wall, halfX - side / 2, height / 2, z, { shadow: false });
      this.box(g, doorWidth, height - doorHeight, t, wall, 0, doorHeight + (height - doorHeight) / 2, z, { shadow: false });
      // Kapı kasası + sarılı kepenk kutusu
      this.box(g, 0.18, doorHeight, 0.4, frame, -doorWidth / 2 - 0.09, doorHeight / 2, sz * halfZ, { shadow: false });
      this.box(g, 0.18, doorHeight, 0.4, frame, doorWidth / 2 + 0.09, doorHeight / 2, sz * halfZ, { shadow: false });
      this.box(g, doorWidth + 0.4, 0.45, 0.5, frame === this._hazard ? this._steel : frame, 0, doorHeight + 0.22, sz * (halfZ - 0.1), { shadow: false });
    }
  }

  buildOutside() {
    const g = new THREE.Group();
    const asphalt = new THREE.MeshStandardMaterial({
      map: canvasTex(512, 512, (c, w, h) => {
        c.fillStyle = '#2a2b2e';
        c.fillRect(0, 0, w, h);
        speckle(c, w, h, 20000, ['#3a3b3f', '#1c1d20', '#4a4b50'], 1, 3, 0.7);
      }, { repeat: [12, 16] }),
      roughness: 0.92,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), asphalt);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    ground.receiveShadow = true;
    g.add(ground);
    // Yol çizgileri
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d0 });
    for (let z = -30; z < 30; z += 3) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 1.5), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(-12, 0.002, z);
      g.add(l);
    }
    // Ufuk
    const sky = new THREE.Mesh(
      new THREE.CylinderGeometry(38, 38, 26, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: skylineTexture(), side: THREE.BackSide, fog: false }),
    );
    sky.position.y = 9;
    g.add(sky);
    // Sokak lambaları
    const pole = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.6, metalness: 0.5 });
    const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 2) });
    for (const [x, z] of [[-6, -14], [6, -20], [-6, 15], [6, 21]]) {
      this.box(g, 0.14, 5, 0.14, pole, x, 2.5, z, { shadow: false });
      this.box(g, 0.6, 0.12, 0.3, bulb, x - Math.sign(x) * 0.3, 5, z, { shadow: false });
      const pl = new THREE.PointLight(0xffc98a, 18, 12, 1.6);
      pl.position.set(x - Math.sign(x) * 0.3, 4.8, z);
      g.add(pl);
    }
    this.scene.add(g);
  }

  /** Floresan/LED tüp armatür + gerçek alan ışığı */
  lightFixture(g, { x, z, w, d, color, intensity, emissive, housing }) {
    const y = ROOM.height - 0.25;
    if (housing) this.box(g, w + 0.12, 0.1, d + 0.12, housing, x, y + 0.08, z, { shadow: false });
    const tube = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), new THREE.MeshBasicMaterial({ color: emissive }));
    tube.position.set(x, y, z);
    g.add(tube);
    const rl = new THREE.RectAreaLight(color, intensity, w, d);
    rl.position.set(x, y - 0.03, z);
    rl.lookAt(x, 0, z);
    g.add(rl);
    return rl;
  }

  // ---------------------------------------------------------------- Seviye 0: Basit Garaj
  buildLevel0() {
    const g = new THREE.Group();
    g.name = 'level0';
    this._steel = new THREE.MeshStandardMaterial({ color: 0x5c626b, roughness: 0.5, metalness: 0.6 });
    this._hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 });
    const floor = new THREE.MeshStandardMaterial({ map: floorTexture(0), roughness: 0.82 });
    const wall = new THREE.MeshStandardMaterial({ map: blockWallTexture(), roughness: 0.95 });
    const ceiling = new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 1 });
    this.buildShell(g, { floor, wall, ceiling, frame: this._hazard });

    // Alt duvar boyası
    const paint = new THREE.MeshStandardMaterial({ color: 0x4d6a85, roughness: 0.8 });
    this.box(g, 0.02, 1.1, ROOM.halfZ * 2, paint, -ROOM.halfX + 0.01, 0.55, 0, { shadow: false });
    this.box(g, 0.02, 1.1, ROOM.halfZ * 2, paint, ROOM.halfX - 0.01, 0.55, 0, { shadow: false });

    // Çelik kirişler
    for (let z = -5.5; z <= 5.5; z += 2.75) this.box(g, ROOM.halfX * 2, 0.3, 0.18, this._steel, 0, ROOM.height - 0.15, z, { shadow: false });

    // Floresan armatürler
    const housing = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.5 });
    for (const z of [-3.2, 0, 3.2]) {
      for (const x of [-1.6, 1.6]) {
        this.lightFixture(g, { x, z, w: 0.22, d: 2.2, color: 0xe6efff, intensity: 4, emissive: new THREE.Color(2.2, 2.3, 2.5), housing });
      }
    }

    // Raf + kovalar + şişeler (sol duvar)
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.85 });
    for (const y of [0.5, 1.2, 1.9]) this.box(g, 0.5, 0.05, 3, wood, -7.65, y, -3.2);
    for (const z of [-4.7, -1.7]) for (const x of [-7.88, -7.42]) this.box(g, 0.05, 2.1, 0.05, this._steel, x, 1.05, z);
    const colors = [0xe03b3b, 0x2f86ff, 0xffc21a, 0x3ecf6e, 0xffffff];
    for (let i = 0; i < 14; i++) {
      const r = 0.06 + Math.random() * 0.05;
      const h = 0.15 + Math.random() * 0.2;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.5 }));
      const shelf = [0.5, 1.2, 1.9][i % 3];
      m.position.set(-7.65 + (Math.random() - 0.5) * 0.25, shelf + h / 2 + 0.025, -4.5 + Math.random() * 2.6);
      m.castShadow = true;
      g.add(m);
    }
    // Kovalar
    const bucketMat = new THREE.MeshStandardMaterial({ color: 0x2f86ff, roughness: 0.5 });
    for (const [x, z] of [[-7.2, 1.2], [-7.0, 1.8]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.34, 20, 1, true), bucketMat);
      b.position.set(x, 0.17, z);
      b.castShadow = true;
      g.add(b);
    }
    // Lastik yığını (sağ arka köşe)
    const tire = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.14, 12, 24), tire);
      t.rotation.x = Math.PI / 2;
      t.position.set(7.1 + (Math.random() - 0.5) * 0.06, 0.14 + i * 0.27, -5.9);
      t.castShadow = true;
      g.add(t);
    }
    // Tezgâh + takım çantası (sağ duvar)
    this.box(g, 0.8, 0.08, 2.4, wood, 7.5, 0.95, 2.4);
    for (const z of [1.3, 3.5]) this.box(g, 0.7, 0.9, 0.08, this._steel, 7.5, 0.45, z);
    this.box(g, 0.35, 0.22, 0.6, new THREE.MeshStandardMaterial({ color: 0xc92a2a, roughness: 0.4, metalness: 0.3 }), 7.5, 1.1, 2.0, { rounded: 0.03 });
    // Hortum makarası (sağ duvar)
    const reel = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.08, 10, 28), new THREE.MeshStandardMaterial({ color: 0x1f5f2f, roughness: 0.7 }));
    reel.position.set(7.9, 1.6, -2);
    reel.rotation.y = Math.PI / 2;
    g.add(reel);
    // Koniler
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 });
    for (const [x, z] of [[-3, -6.2], [3, -6.2]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 16), coneMat);
      c.position.set(x, 0.25, z);
      c.castShadow = true;
      g.add(c);
    }
    // Duvar tabelası
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 1),
      new THREE.MeshStandardMaterial({ map: textTexture('PARILTI OTO YIKAMA', { font: 'bold 96px Rubik, sans-serif', color: '#1c2a3a', bg: '#e8e2d0' }), roughness: 0.8 }),
    );
    sign.position.set(-ROOM.halfX + 0.03, 3.2, 2.5);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    return g;
  }

  // ---------------------------------------------------------------- Seviye 1: Yenilenmiş Garaj
  buildLevel1() {
    const g = new THREE.Group();
    g.name = 'level1';
    const floor = new THREE.MeshStandardMaterial({ map: floorTexture(1), roughness: 0.3, metalness: 0.05 });
    const wall = new THREE.MeshStandardMaterial({ map: panelWallTexture(), roughness: 0.7 });
    const ceiling = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.9 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.4, metalness: 0.6 });
    this.buildShell(g, { floor, wall, ceiling, frame });

    // Mavi aksan şeridi
    const accent = new THREE.MeshStandardMaterial({ color: 0x1f6fe0, roughness: 0.5 });
    for (const sx of [-1, 1]) this.box(g, 0.03, 0.35, ROOM.halfZ * 2, accent, sx * (ROOM.halfX - 0.015), 1.25, 0, { shadow: false });
    // Süpürgelik
    const base = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 });
    for (const sx of [-1, 1]) this.box(g, 0.04, 0.15, ROOM.halfZ * 2, base, sx * (ROOM.halfX - 0.02), 0.075, 0, { shadow: false });

    // LED paneller
    const housing = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (const z of [-3.4, 0, 3.4]) {
      for (const x of [-2.2, 2.2]) {
        this.lightFixture(g, { x, z, w: 1.2, d: 1.2, color: 0xffffff, intensity: 5, emissive: new THREE.Color(2.6, 2.6, 2.6), housing });
      }
    }
    // Ortada uzun LED hat
    this.lightFixture(g, { x: 0, z: 0, w: 0.25, d: 8, color: 0xf2f6ff, intensity: 7, emissive: new THREE.Color(3, 3, 3.2), housing });

    // Kırmızı takım dolapları (sağ duvar)
    const red = new THREE.MeshPhysicalMaterial({ color: 0xd42a2a, roughness: 0.3, metalness: 0.4, clearcoat: 1 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1 });
    for (let i = 0; i < 3; i++) {
      const z = 1.2 + i * 1.05;
      this.box(g, 0.7, 1.05, 1.0, red, 7.6, 0.525, z, { rounded: 0.02 });
      for (let d = 0; d < 4; d++) this.box(g, 0.02, 0.02, 0.6, chrome, 7.24, 0.2 + d * 0.23, z, { shadow: false });
    }
    this.box(g, 0.75, 0.04, 3.2, new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.3, metalness: 0.5 }), 7.6, 1.07, 2.25);

    // Ürün rafı (sol duvar) — renkli şampuan şişeleri
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0xf5f6f8, roughness: 0.5 });
    for (const y of [1.0, 1.55, 2.1]) this.box(g, 0.35, 0.04, 3.2, shelfMat, -7.8, y, -3);
    const cols = [0xff4fa0, 0x35d0ff, 0xffd35a, 0x7cff6a, 0xa66bff, 0xff7a3a];
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 9; i++) {
        const b = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.24, 0.08, 2, 0.02), new THREE.MeshPhysicalMaterial({ color: cols[(i + s) % cols.length], roughness: 0.25, clearcoat: 1 }));
        b.position.set(-7.8, [1.0, 1.55, 2.1][s] + 0.14, -4.4 + i * 0.34);
        b.castShadow = true;
        g.add(b);
      }
    }
    // Havlu askısı
    const towelCols = [0x3fb6ff, 0xffd23f, 0x3ecf6e, 0xff6ad5];
    this.box(g, 0.05, 0.05, 1.8, chrome, -7.75, 1.7, 1.8, { shadow: false });
    towelCols.forEach((c, i) => this.box(g, 0.03, 0.6, 0.36, new THREE.MeshStandardMaterial({ color: c, roughness: 1 }), -7.72, 1.38, 1.1 + i * 0.45));
    // Saksı bitkileri
    const pot = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f9a4a, roughness: 0.8, flatShading: true });
    for (const [x, z] of [[-7.3, 5.9], [7.3, 5.9], [-7.3, -6.0]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.55, 16), pot);
      p.position.set(x, 0.275, z);
      p.castShadow = true;
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), leaf);
      l.position.set(x, 1.0, z);
      l.scale.y = 1.3;
      l.castShadow = true;
      g.add(p, l);
    }
    // Duvar logosu
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.1),
      new THREE.MeshStandardMaterial({ map: textTexture('PARILTI', { font: '800 150px Rubik, sans-serif', color: '#1f6fe0', sub: 'OTO YIKAMA & BAKIM', w: 1024, h: 256 }), transparent: true, roughness: 0.6 }),
    );
    logo.position.set(-ROOM.halfX + 0.03, 3.4, 2.2);
    logo.rotation.y = Math.PI / 2;
    g.add(logo);
    return g;
  }

  // ---------------------------------------------------------------- Seviye 2: Neon Detailing Stüdyosu
  buildLevel2() {
    const g = new THREE.Group();
    g.name = 'level2';

    // Yansıtıcı zemin: Reflector üstünde yarı saydam parlak karo
    const reflector = new Reflector(new THREE.PlaneGeometry(ROOM.halfX * 2, ROOM.halfZ * 2), {
      textureWidth: Math.min(1024, window.innerWidth * 0.5),
      textureHeight: Math.min(1024, window.innerHeight * 0.5),
      color: 0x8a8a8a,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -0.002;
    g.add(reflector);

    const floor = new THREE.MeshStandardMaterial({ map: floorTexture(2), roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.8 });
    const wall = new THREE.MeshStandardMaterial({ map: slatWallTexture(), roughness: 0.75 });
    const ceiling = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.3, metalness: 0.7 });
    this.buildShell(g, { floor, wall, ceiling, frame });

    // Altıgen LED tavan ızgarası
    this.buildHexGrid(g);
    // Aracı aydınlatan geniş alan ışığı + yan renkli dolgu
    const top = new THREE.RectAreaLight(0xffffff, 1.3, 6, 9);
    top.position.set(0, ROOM.height - 0.4, 0);
    top.lookAt(0, 0, 0);
    g.add(top);

    // Neon şeritler
    const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 1.5, 2.0) });
    const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.2, 1.5) });
    for (const sx of [-1, 1]) {
      this.box(g, 0.04, 0.04, ROOM.halfZ * 2, cyan, sx * (ROOM.halfX - 0.05), 0.12, 0, { shadow: false });
      this.box(g, 0.04, 0.04, ROOM.halfZ * 2, pink, sx * (ROOM.halfX - 0.05), ROOM.height - 0.1, 0, { shadow: false });
    }
    for (const sz of [-1, 1]) {
      const side = (ROOM.halfX * 2 - ROOM.doorWidth) / 2;
      for (const sx of [-1, 1]) this.box(g, side, 0.04, 0.04, cyan, sx * (ROOM.halfX - side / 2), 0.12, sz * (ROOM.halfZ - 0.05), { shadow: false });
      // Kapı çevresinde neon çerçeve
      this.box(g, 0.05, ROOM.doorHeight, 0.05, pink, -ROOM.doorWidth / 2 - 0.2, ROOM.doorHeight / 2, sz * (ROOM.halfZ - 0.22), { shadow: false });
      this.box(g, 0.05, ROOM.doorHeight, 0.05, pink, ROOM.doorWidth / 2 + 0.2, ROOM.doorHeight / 2, sz * (ROOM.halfZ - 0.22), { shadow: false });
    }

    // Aracın iki yanında dikey ışık sütunları
    const pillarLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.9) });
    const pillarBase = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.3, metalness: 0.8 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * 4.3, z = sz * 3.2;
        this.box(g, 0.22, 2.6, 0.22, pillarBase, x, 1.3, z);
        this.box(g, 0.06, 2.3, 0.24, pillarLight, x - sx * 0.1, 1.3, z, { shadow: false });
        const rl = new THREE.RectAreaLight(0xdfe9ff, 4, 0.1, 2.3);
        rl.position.set(x - sx * 0.14, 1.3, z);
        rl.lookAt(0, 1.0, z * 0.6);
        g.add(rl);
      }
    }
    // Renkli dolgu ışıkları
    const fillL = new THREE.RectAreaLight(0x35d0ff, 1.5, 10, 0.3);
    fillL.position.set(-ROOM.halfX + 0.2, 0.3, 0);
    fillL.lookAt(0, 0.5, 0);
    const fillR = new THREE.RectAreaLight(0xff4fd8, 1.5, 10, 0.3);
    fillR.position.set(ROOM.halfX - 0.2, 0.3, 0);
    fillR.lookAt(0, 0.5, 0);
    g.add(fillL, fillR);

    // Neon tabela (sol duvar)
    const signTex = textTexture('PARILTI', { font: '800 170px Rubik, sans-serif', color: '#ffe6fb', glow: '#ff4fd8', sub: 'DETAILING STUDIO', w: 1024, h: 320 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.56), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, color: new THREE.Color(1.5, 1.5, 1.5) }));
    sign.position.set(-ROOM.halfX + 0.05, 3.1, 1.8);
    sign.rotation.y = Math.PI / 2;
    g.add(sign);
    this.animated.push((t) => {
      if (!g.visible) return;
      // Hafif neon titremesi
      const flick = Math.sin(t * 23) > 0.97 ? 0.6 : 1;
      sign.material.color.setScalar(1.5 * flick);
    });

    // Lounge köşesi: koltuk + sehpa (sağ ön)
    const leather = new THREE.MeshStandardMaterial({ color: 0x2a2230, roughness: 0.55 });
    this.box(g, 0.9, 0.45, 2.6, leather, 7.35, 0.225, 3.8, { rounded: 0.08 });
    this.box(g, 0.3, 0.9, 2.6, leather, 7.75, 0.45, 3.8, { rounded: 0.08 });
    this.box(g, 0.6, 0.35, 1.0, new THREE.MeshPhysicalMaterial({ color: 0x0f1014, roughness: 0.1, clearcoat: 1 }), 6.5, 0.175, 3.8, { rounded: 0.04 });
    // Parlayan ürün vitrini (sağ arka)
    const glassShelf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.25 });
    for (const y of [0.9, 1.5, 2.1]) this.box(g, 0.4, 0.03, 3, glassShelf, 7.7, y, -3.5, { shadow: false });
    const glowCols = [[3, 0.4, 2.6], [0.3, 2.4, 3.2], [3.2, 2.4, 0.4]];
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 8; i++) {
        const c = glowCols[(i + s) % 3];
        const b = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.24, 0.08, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(c[0] * 0.25, c[1] * 0.25, c[2] * 0.25), roughness: 0.2 }));
        b.position.set(7.7, [0.9, 1.5, 2.1][s] + 0.135, -4.7 + i * 0.34);
        g.add(b);
      }
    }
    return g;
  }

  buildHexGrid(g) {
    const s = 0.62; // kenar uzunluğu
    const edges = new Map();
    const w = Math.sqrt(3) * s;
    for (let col = -8; col <= 8; col++) {
      for (let row = -8; row <= 8; row++) {
        const cx = col * 1.5 * s;
        const cz = (row + (col & 1 ? 0.5 : 0)) * w;
        if (Math.abs(cx) > 3.4 || Math.abs(cz) > 4.6) continue;
        for (let k = 0; k < 6; k++) {
          const a0 = (Math.PI / 3) * k, a1 = (Math.PI / 3) * (k + 1);
          const x0 = cx + Math.cos(a0) * s, z0 = cz + Math.sin(a0) * s;
          const x1 = cx + Math.cos(a1) * s, z1 = cz + Math.sin(a1) * s;
          const key = `${Math.round((x0 + x1) * 50)},${Math.round((z0 + z1) * 50)}`;
          if (!edges.has(key)) edges.set(key, [(x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(z1 - z0, x1 - x0)]);
        }
      }
    }
    const geo = new THREE.BoxGeometry(s * 0.92, 0.04, 0.06);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.7) });
    const mesh = new THREE.InstancedMesh(geo, mat, edges.size);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let i = 0;
    for (const [x, z, a] of edges.values()) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      m.compose(new THREE.Vector3(x, ROOM.height - 0.55, z), q, one);
      mesh.setMatrixAt(i++, m);
    }
    g.add(mesh);
    // Izgara çerçevesi
    const frame = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.4, metalness: 0.8 });
    this.box(g, 8, 0.08, 10.4, frame, 0, ROOM.height - 0.48, 0, { shadow: false });
  }
}
