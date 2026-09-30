import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Araç kataloğu. `glb` verilirse GLTFLoader ile yüklenir; yüklenemezse
 * `procedural` parametreleriyle primitiflerden araç üretilir.
 * Harici bir model eklemek için yeni bir kayıt ekleyip `glb` alanına URL vermek yeterli.
 */
export const CAR_CATALOG = [
  { id: 'hatch', name: 'Hatchback', glb: 'models/cars/hatchback-sports.glb', length: 4.0, pay: 50, time: 150, tier: 0,
    procedural: { length: 4.0, width: 1.8, height: 1.5, cabin: 0.55, cabinOffset: -0.15, color: 0xd9442b } },
  { id: 'sedan', name: 'Sedan', glb: 'models/cars/sedan.glb', length: 4.6, pay: 60, time: 165, tier: 0,
    procedural: { length: 4.6, width: 1.85, height: 1.45, cabin: 0.48, cabinOffset: -0.05, color: 0x2f6fd6 } },
  { id: 'sedan-sports', name: 'Spor Sedan', glb: 'models/cars/sedan-sports.glb', length: 4.6, pay: 65, time: 165, tier: 0,
    procedural: { length: 4.6, width: 1.9, height: 1.35, cabin: 0.42, cabinOffset: -0.1, color: 0xf2c230 } },
  { id: 'suv', name: 'SUV', glb: 'models/cars/suv.glb', length: 4.7, pay: 80, time: 190, tier: 1,
    procedural: { length: 4.7, width: 1.95, height: 1.8, cabin: 0.62, cabinOffset: -0.12, color: 0x3f8f5a } },
  { id: 'suv-luxury', name: 'Lüks SUV', glb: 'models/cars/suv-luxury.glb', length: 4.9, pay: 90, time: 200, tier: 1,
    procedural: { length: 4.9, width: 2.0, height: 1.8, cabin: 0.6, cabinOffset: -0.1, color: 0x1d1f24 } },
  { id: 'van', name: 'Minibüs', glb: 'models/cars/van.glb', length: 5.0, pay: 95, time: 215, tier: 1,
    procedural: { length: 5.0, width: 2.0, height: 2.1, cabin: 0.85, cabinOffset: 0.05, color: 0xeeeeee } },
  { id: 'truck', name: 'Pikap', glb: 'models/cars/truck.glb', length: 5.2, pay: 95, time: 205, tier: 2,
    procedural: { length: 5.2, width: 2.0, height: 1.85, cabin: 0.35, cabinOffset: 0.2, color: 0x8a2be2 } },
  { id: 'delivery', name: 'Kargo Kamyoneti', glb: 'models/cars/delivery.glb', length: 5.4, pay: 100, time: 230, tier: 2,
    procedural: { length: 5.4, width: 2.05, height: 2.3, cabin: 0.95, cabinOffset: 0.0, color: 0xf07c1a } },
  { id: 'race', name: 'Yarış Arabası', glb: 'models/cars/race.glb', length: 4.4, pay: 100, time: 170, tier: 2,
    procedural: { length: 4.4, width: 1.95, height: 1.2, cabin: 0.3, cabinOffset: -0.05, color: 0xff2d55 } },
];

const MAX_HEIGHT = 2.25;
const MAX_WIDTH = 2.15;

/**
 * GLB sahnesini oyuna hazırlar: ölçekler, malzemeleri araç boyasına çevirir.
 * Dönüş: Object3D (ön yönü +Z, zemini y=0)
 */
export function prepareGltfCar(template, def) {
  const inner = template.clone(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const scale = Math.min(def.length / size.z, MAX_HEIGHT / size.y, MAX_WIDTH / size.x);
  inner.scale.setScalar(scale);
  inner.position.set(-(box.min.x + box.max.x) * 0.5 * scale, -box.min.y * scale, -(box.min.z + box.max.z) * 0.5 * scale);

  const bodyMats = new Map();
  inner.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const isWheel = /wheel/i.test(o.name) || /wheel/i.test(o.parent?.name || '');
    const src = o.material;
    const key = (isWheel ? 'w:' : 'b:') + src.uuid;
    if (!bodyMats.has(key)) {
      const mat = isWheel
        ? new THREE.MeshStandardMaterial({ map: src.map, color: src.color, roughness: 0.75, metalness: 0.1 })
        : new THREE.MeshPhysicalMaterial({
            map: src.map,
            color: src.color,
            roughness: 0.38,
            metalness: 0.15,
            clearcoat: 1,
            clearcoatRoughness: 0.05,
          });
      bodyMats.set(key, mat);
    }
    o.material = bodyMats.get(key);
    o.userData.isWheel = isWheel;
  });

  const root = new THREE.Group();
  root.add(inner);
  return root;
}

/**
 * Primitiflerden stilize araç. Kenney modelleri yoksa devreye girer.
 */
export function buildProceduralCar(p) {
  const root = new THREE.Group();
  const L = p.length, W = p.width, H = p.height;
  const wheelR = Math.min(0.42, H * 0.24);
  const bodyH = H * 0.45;
  const bodyY = wheelR * 0.9;

  const paint = new THREE.MeshPhysicalMaterial({
    color: p.color,
    roughness: 0.32,
    metalness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1420, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.18, metalness: 1 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 1.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.9 });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    return m;
  };

  // Gövde
  add(new RoundedBoxGeometry(W, bodyH, L, 4, 0.18), paint, 0, bodyY + bodyH / 2, 0);
  // Kabin
  const cabinL = L * p.cabin;
  const cabinH = H - bodyY - bodyH;
  const cabinZ = L * p.cabinOffset;
  add(new RoundedBoxGeometry(W * 0.86, cabinH, cabinL, 4, 0.2), paint, 0, bodyY + bodyH + cabinH / 2 - 0.04, cabinZ);
  // Camlar (kabinin biraz dışında ince paneller)
  const gy = bodyY + bodyH + cabinH * 0.48;
  add(new THREE.BoxGeometry(W * 0.87, cabinH * 0.6, cabinL * 0.8), glass, 0, gy, cabinZ);
  add(new THREE.BoxGeometry(W * 0.78, cabinH * 0.62, 0.04), glass, 0, gy, cabinZ + cabinL / 2 + 0.005);
  add(new THREE.BoxGeometry(W * 0.78, cabinH * 0.62, 0.04), glass, 0, gy, cabinZ - cabinL / 2 - 0.005);
  // Tamponlar
  add(new RoundedBoxGeometry(W * 1.02, 0.22, 0.2, 2, 0.06), black, 0, bodyY + 0.12, L / 2 - 0.05);
  add(new RoundedBoxGeometry(W * 1.02, 0.22, 0.2, 2, 0.06), black, 0, bodyY + 0.12, -L / 2 + 0.05);
  // Farlar / stoplar
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.38, 0.12, 0.05), headMat, s * W * 0.33, bodyY + bodyH * 0.7, L / 2 + 0.005);
    add(new THREE.BoxGeometry(0.34, 0.1, 0.05), tailMat, s * W * 0.34, bodyY + bodyH * 0.72, -L / 2 - 0.005);
    // Ayna
    add(new RoundedBoxGeometry(0.1, 0.12, 0.2, 2, 0.03), paint, s * (W / 2 + 0.05), bodyY + bodyH + 0.08, cabinZ + cabinL / 2 - 0.1);
  }
  // Izgara
  add(new THREE.BoxGeometry(W * 0.4, bodyH * 0.35, 0.04), chrome, 0, bodyY + bodyH * 0.45, L / 2 + 0.01);

  // Tekerlekler
  const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.28, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.6, wheelR * 0.6, 0.3, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const wz = L * 0.33;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Group();
      wheel.name = 'wheel';
      wheel.position.set(sx * (W / 2 - 0.12), wheelR, sz * wz);
      const t = new THREE.Mesh(tireGeo, tireMat);
      const r = new THREE.Mesh(rimGeo, chrome);
      t.castShadow = r.castShadow = true;
      t.userData.isWheel = r.userData.isWheel = true;
      wheel.add(t, r);
      root.add(wheel);
    }
  }
  return root;
}
