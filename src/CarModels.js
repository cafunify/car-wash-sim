import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PART } from './CarParts.js';

/**
 * Araç kataloğu. `glb` verilirse GLTFLoader ile yüklenir; yüklenemezse
 * `procedural` parametreleriyle primitiflerden araç üretilir.
 *
 * Harici model eklemek için yeni bir kayıt yeterli:
 *   glb        — dosya yolu/URL
 *   autoOrient — uzun ekseni Z'ye, farları +Z'ye çevir (yoksa `rotY` ile elle çevir)
 *   atlas      — 'kenney': renk atlası UV'sinden cam/trim ayrımı
 *   tune       — model PBR açısından zayıfsa parça bazlı gerçekçi yüzey uygula
 * Dokusuz boya malzemesine her müşteride rastgele metalik renk verilir.
 */
/**
 * Gerçekçi araçlar: Daniel Zhabotinsky'nin hayali markalı "low poly" serisi (CC BY 4.0).
 * Künye: public/models/cars/dz/CREDITS.md
 */
const DZ = (id, name, file, extra) => ({
  id, name, glb: `models/cars/dz/${file}.glb`, autoOrient: true,
  procedural: { length: 4.6, width: 1.85, height: 1.45, cabin: 0.48, cabinOffset: -0.05 },
  ...extra,
});

export const CAR_CATALOG = [
  // Modeller kendi gerçek ölçeklerinde (metre) kullanılır; `length` verilirse o boya ölçeklenir.
  DZ('ace11', "Ace '11", 'ace11', { pay: 50, time: 150, tier: 0 }),
  DZ('kiri86', "Kiri '86", 'kiri86', { pay: 55, time: 160, tier: 0 }),
  DZ('asti89', "Asti Stradale '89", 'astistradale89', { pay: 70, time: 160, tier: 1 }),
  DZ('negotiator80', "Negotiator '80", 'negotiator80', { pay: 65, time: 175, tier: 0 }),
  DZ('fairheavensw', "Fairheaven SW '84", 'fairheavensw84', { pay: 75, time: 185, tier: 1 }),
  DZ('illinois90', "Illinois '90", 'illinois90', { pay: 75, time: 185, tier: 1 }),
  DZ('shvan92', "Shvan '92 Minibüs", 'shvan92', { pay: 85, time: 200, tier: 1 }),
  DZ('lct95', "LCT 3000 '95 Kamyonet", 'lct300095', { pay: 100, time: 240, tier: 2 }),
  DZ('lct07', "LCT 3000 '07 Kamyonet", 'lct300007', { pay: 100, time: 240, tier: 2 }),
  DZ('compact07', "Compact '07", 'compact_07', { pay: 45, time: 140, tier: 0 }),
  DZ('kiri10', "Kiri '10", 'kiri_10', { pay: 50, time: 150, tier: 0 }),
  DZ('lolita91', "Lolita '91", 'lolita_91', { pay: 50, time: 150, tier: 0 }),
  DZ('olympic95', "Olympic '95", 'olympic_95', { pay: 55, time: 155, tier: 0 }),
  DZ('chapman73', "Chapman '73", 'chapman_73', { pay: 60, time: 160, tier: 0 }),
  DZ('urban10', "Urban '10", 'urban_10', { pay: 65, time: 165, tier: 0 }),
  DZ('murphy92', "Murphy '92", 'murphy_92', { pay: 65, time: 170, tier: 0 }),
  DZ('milano95', "Milano '95", 'milano_95', { pay: 70, time: 170, tier: 0 }),
  DZ('sigil07', "Sigil '07", 'sigil_07', { pay: 70, time: 170, tier: 0 }),
  DZ('riverside88', "Riverside '88", 'riverside_88', { pay: 72, time: 180, tier: 1 }),
  DZ('tozzo98', "Tozzo '98", 'tozzo_98', { pay: 80, time: 175, tier: 1 }),
  DZ('stinger96', "Stinger '96", 'stinger_96', { pay: 80, time: 175, tier: 1 }),
  DZ('phoenix93', "Phoenix '93", 'phoenix_93', { pay: 85, time: 180, tier: 1 }),
  DZ('roadster00', "Roadster '00", 'roadster_00', { pay: 90, time: 185, tier: 2 }),
  DZ('libeccio91', "Libeccio V6 '91", 'libeccio_v6_91', { pay: 95, time: 190, tier: 2 }),
];

/** Gerçekçi araç boyası renkleri (metalik) */
export const PAINT_COLORS = [
  0xb3121d, 0x0f2a5c, 0x1d1f24, 0xe8e9eb, 0x8a9199, 0x2d4f3a, 0x5b6b7a, 0x7a1f2b,
  0xc9a86a, 0x1f5e8c, 0x3a3d42, 0xd4d7da, 0x6e2c85, 0xd96b1c, 0x264b76, 0x8c8f92,
];

const MAX_HEIGHT = 2.25;
const MAX_WIDTH = 2.15;

function toPhysical(src) {
  if (src.isMeshPhysicalMaterial) return src.clone();
  const m = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(m, src);
  m.defines = { STANDARD: '', PHYSICAL: '' };
  m.type = 'MeshPhysicalMaterial';
  return m;
}

/**
 * GLB sahnesini oyuna hazırlar: yönlendirir, ölçekler, malzemeleri araç boyasına çevirir.
 * Dönüş: Object3D (ön yönü +Z, zemini y=0)
 */
export function prepareGltfCar(template, def) {
  const inner = template.clone(true);
  const pivot = new THREE.Group();
  pivot.add(inner);
  if (def.rotY) inner.rotation.y = def.rotY;
  pivot.updateMatrixWorld(true);
  if (def.autoOrient) autoOrient(pivot, inner);

  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const scale = def.length ? Math.min(def.length / size.z, MAX_HEIGHT / size.y, MAX_WIDTH / size.x) : 1;
  pivot.scale.setScalar(scale);
  pivot.position.set(-(box.min.x + box.max.x) * 0.5 * scale, -box.min.y * scale, -(box.min.z + box.max.z) * 0.5 * scale);

  const mats = new Map();
  pivot.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const isWheel = /wheel|tire|tyre|rim/i.test(o.name) || /wheel/i.test(o.parent?.name || '');
    const src = o.material;
    const key = (isWheel ? 'w:' : 'b:') + src.uuid;
    if (!mats.has(key)) {
      let mat;
      if (def.tune) {
        mat = isWheel
          ? new THREE.MeshStandardMaterial({ map: src.map, color: src.color, roughness: 0.75, metalness: 0.1 })
          : new THREE.MeshPhysicalMaterial({ map: src.map, color: src.color, roughness: 0.3, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.04 });
      } else {
        mat = src.clone();
      }
      mat.name = src.name;
      mats.set(key, mat);
    }
    o.material = mats.get(key);
    o.userData.isWheel = isWheel;
  });

  const root = new THREE.Group();
  root.add(pivot);
  return root;
}

/** Uzun ekseni Z'ye, farların olduğu tarafı +Z'ye çevir */
function autoOrient(pivot, inner) {
  let size = new THREE.Box3().setFromObject(pivot).getSize(new THREE.Vector3());
  if (size.x > size.z) {
    inner.rotation.y += Math.PI / 2;
    pivot.updateMatrixWorld(true);
  }
  let head = null;
  pivot.traverse((o) => {
    if (!head && o.isMesh && /headlight/i.test(o.name + ' ' + (o.parent?.name || '') + ' ' + (o.parent?.parent?.name || ''))) head = o;
  });
  if (!head) return;
  const hc = new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3());
  const bc = new THREE.Box3().setFromObject(pivot).getCenter(new THREE.Vector3());
  if (hc.z < bc.z) {
    inner.rotation.y += Math.PI;
    pivot.updateMatrixWorld(true);
  }
}

/**
 * Sınıflandırmadan sonra boya malzemesine rastgele metalik renk ver
 * (dokusuz boya malzemelerinde; atlas dokulu modeller kendi rengini korur).
 */
export function recolorPaint(meshes, def) {
  const color = new THREE.Color(PAINT_COLORS[(Math.random() * PAINT_COLORS.length) | 0]);
  const done = new Set();
  for (const m of meshes) {
    const part = m.geometry.attributes.aPart?.getX(0);
    const mat = m.material;
    if (part !== PART.PAINT || done.has(mat) || mat.map && !def.recolorTextured) continue;
    if (!mat.isMeshPhysicalMaterial) {
      const phys = toPhysical(mat);
      meshes.forEach((o) => { if (o.material === mat) o.material = phys; });
      mat.dispose();
      done.add(phys);
      paintMaterial(phys, color);
      continue;
    }
    paintMaterial(mat, color);
    done.add(mat);
  }
  return color;
}

function paintMaterial(mat, color) {
  mat.color.copy(color);
  mat.metalness = Math.max(mat.metalness, 0.55);
  mat.roughness = Math.min(mat.roughness, 0.32);
  mat.clearcoat = 1;
  mat.clearcoatRoughness = 0.03;
}

/**
 * Primitiflerden araç. Harici modeller yüklenemezse devreye girer.
 * Mesh adları parça sınıflandırması için anlamlıdır (paint/glass/tire/rim/trim).
 */
export function buildProceduralCar(p) {
  const root = new THREE.Group();
  const L = p.length, W = p.width, H = p.height;
  const wheelR = Math.min(0.42, H * 0.24);
  const bodyH = H * 0.45;
  const bodyY = wheelR * 0.9;

  const paint = new THREE.MeshPhysicalMaterial({ name: 'paint', color: 0x888888, roughness: 0.3, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.03 });
  const glass = new THREE.MeshPhysicalMaterial({ name: 'glass', color: 0x0c1420, roughness: 0.03, metalness: 0.1, clearcoat: 1 });
  const black = new THREE.MeshStandardMaterial({ name: 'trim', color: 0x15171b, roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ name: 'rim', color: 0xdddddd, roughness: 0.18, metalness: 1 });
  const tireMat = new THREE.MeshStandardMaterial({ name: 'tire', color: 0x1a1a1a, roughness: 0.9 });
  const headMat = new THREE.MeshStandardMaterial({ name: 'light', color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ name: 'light', color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.9 });

  const add = (geo, mat, x, y, z, name = mat.name) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  };

  add(new RoundedBoxGeometry(W, bodyH, L, 4, 0.18), paint, 0, bodyY + bodyH / 2, 0);
  const cabinL = L * p.cabin;
  const cabinH = H - bodyY - bodyH;
  const cabinZ = L * p.cabinOffset;
  add(new RoundedBoxGeometry(W * 0.86, cabinH, cabinL, 4, 0.2), paint, 0, bodyY + bodyH + cabinH / 2 - 0.04, cabinZ);
  const gy = bodyY + bodyH + cabinH * 0.48;
  add(new THREE.BoxGeometry(W * 0.87, cabinH * 0.6, cabinL * 0.8), glass, 0, gy, cabinZ);
  add(new THREE.BoxGeometry(W * 0.78, cabinH * 0.62, 0.04), glass, 0, gy, cabinZ + cabinL / 2 + 0.005);
  add(new THREE.BoxGeometry(W * 0.78, cabinH * 0.62, 0.04), glass, 0, gy, cabinZ - cabinL / 2 - 0.005);
  add(new RoundedBoxGeometry(W * 1.02, 0.22, 0.2, 2, 0.06), black, 0, bodyY + 0.12, L / 2 - 0.05);
  add(new RoundedBoxGeometry(W * 1.02, 0.22, 0.2, 2, 0.06), black, 0, bodyY + 0.12, -L / 2 + 0.05);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.38, 0.12, 0.05), headMat, s * W * 0.33, bodyY + bodyH * 0.7, L / 2 + 0.005);
    add(new THREE.BoxGeometry(0.34, 0.1, 0.05), tailMat, s * W * 0.34, bodyY + bodyH * 0.72, -L / 2 - 0.005);
    add(new RoundedBoxGeometry(0.1, 0.12, 0.2, 2, 0.03), paint, s * (W / 2 + 0.05), bodyY + bodyH + 0.08, cabinZ + cabinL / 2 - 0.1);
  }
  add(new THREE.BoxGeometry(W * 0.4, bodyH * 0.35, 0.04), chrome, 0, bodyY + bodyH * 0.45, L / 2 + 0.01, 'grille');

  const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.28, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const wz = L * 0.33;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rimGeo = new THREE.CylinderGeometry(wheelR * 0.6, wheelR * 0.6, 0.3, 16);
      rimGeo.rotateZ(Math.PI / 2);
      const wheel = new THREE.Group();
      wheel.name = 'wheel';
      wheel.position.set(sx * (W / 2 - 0.12), wheelR, sz * wz);
      const t = new THREE.Mesh(tireGeo.clone(), tireMat);
      t.name = 'tire';
      const r = new THREE.Mesh(rimGeo, chrome);
      r.name = 'rim';
      t.castShadow = r.castShadow = true;
      wheel.add(t, r);
      root.add(wheel);
    }
  }
  return root;
}
