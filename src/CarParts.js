import * as THREE from 'three';

/**
 * Araç parçalarını sınıflandırır ve her köşeye `aPart` niteliği yazar.
 * Kir shader'ı ve ilerleme hesabı hangi katmanın nerede geçerli olduğunu buradan bilir.
 */
export const PART = { PAINT: 0, GLASS: 1, TIRE: 2, RIM: 3, TRIM: 4 };

const RX = {
  steering: /steering|direksiyon/i,
  glass: /glass|window|windshield|windscreen|cam\b|screen/i,
  tire: /tire|tyre|rubber|lastik/i,
  rim: /\brim|hub|disc|jant|alloy/i,
  wheel: /wheel|tekerlek/i,
  paintMat: /bodymat|body_mat|carpaint|car_paint|paint/i,
  trim: /light|lamp|head|tail|blinker|reverse|indicator|plate|badge|grill|grille|interior|seat|exhaust|chrome|bumper|trim|black|plastic|bottom|suspension|inner/i,
  paint: /body|kaporta|main/i,
};

// Doku piksellerini okumak için önbellek (aynı atlas birçok araçta paylaşılır)
const texCache = new WeakMap();
function readTexture(tex) {
  const img = tex?.image;
  if (!img || !img.width) return null;
  if (texCache.has(img)) return texCache.get(img);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = { w: c.width, h: c.height, px: g.getImageData(0, 0, c.width, c.height).data, flipY: tex.flipY };
  texCache.set(img, data);
  return data;
}

function texel(t, u, v) {
  u = u - Math.floor(u);
  v = v - Math.floor(v);
  if (t.flipY) v = 1 - v;
  const x = Math.min(t.w - 1, (u * t.w) | 0);
  const y = Math.min(t.h - 1, (v * t.h) | 0);
  const i = (y * t.w + x) * 4;
  return [t.px[i] / 255, t.px[i + 1] / 255, t.px[i + 2] / 255];
}

function namesOf(mesh) {
  let s = `${mesh.name} ${mesh.material?.name || ''}`;
  for (let p = mesh.parent; p && !p.userData.isCarRoot; p = p.parent) s += ` ${p.name}`;
  return s;
}

function meshArea(mesh) {
  const pos = mesh.geometry.attributes.position;
  const idx = mesh.geometry.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  const n = idx ? idx.count : pos.count;
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, idx ? idx.getX(i) : i);
    b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1);
    c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2);
    area += b.sub(a).cross(c.sub(a)).length() * 0.5;
  }
  const s = mesh.getWorldScale(new THREE.Vector3());
  return area * s.x * s.y;
}

/**
 * @param {THREE.Object3D} root araç kökü
 * @param {object} opts { atlas: 'kenney' | undefined }
 */
export function classifyCarParts(root, { atlas } = {}) {
  root.userData.isCarRoot = true;
  const meshes = [];
  root.traverse((o) => o.isMesh && meshes.push(o));

  // 1) İsim ve malzeme özelliklerinden mesh başına tahmin
  const guess = new Map();
  for (const m of meshes) {
    const n = namesOf(m);
    const mat = m.material;
    let part = null;
    if (RX.steering.test(n)) part = PART.TRIM;
    // Tekerlek mesh'i lastik+jant içerebilir: köşe bazında dokudan ayrılır
    else if (RX.wheel.test(n) || m.userData.isWheel) part = 'wheel';
    else if (RX.glass.test(n) || mat.transparent && mat.opacity < 0.95 || mat.transmission > 0) part = PART.GLASS;
    else if (RX.tire.test(n)) part = PART.TIRE;
    else if (RX.rim.test(n)) part = PART.RIM;
    else if (RX.paintMat.test(mat.name || '')) part = PART.PAINT;
    else if (RX.trim.test(n)) part = PART.TRIM;
    else if (RX.paint.test(n)) part = PART.PAINT;
    guess.set(m, part);
  }

  // 2) Hiçbir mesh "boya" olarak adlandırılmamışsa en geniş tanımsız malzeme boyadır
  if (![...guess.values()].includes(PART.PAINT)) {
    const byMat = new Map();
    for (const m of meshes) {
      if (guess.get(m) !== null) continue;
      byMat.set(m.material, (byMat.get(m.material) || 0) + meshArea(m));
    }
    let best = null, bestArea = 0;
    byMat.forEach((a, mat) => { if (a > bestArea) { best = mat; bestArea = a; } });
    for (const m of meshes) if (guess.get(m) === null) guess.set(m, m.material === best ? PART.PAINT : PART.TRIM);
  }

  // 3) Köşe başına nitelik yaz
  for (const m of meshes) {
    const geo = m.geometry;
    if (geo.userData.partsDone) continue;
    const count = geo.attributes.position.count;
    const parts = new Float32Array(count);
    const g = guess.get(m) ?? PART.TRIM;
    const uv = geo.attributes.uv;
    const tex = uv && m.material.map ? readTexture(m.material.map) : null;
    const tint = m.material.color;

    if (g === 'wheel') {
      // Tekerlek tek mesh: koyu pikseller lastik, açıklar jant
      for (let i = 0; i < count; i++) {
        let lum;
        if (tex) {
          const c = texel(tex, uv.getX(i), uv.getY(i));
          lum = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * (tint.r * 0.3 + tint.g * 0.59 + tint.b * 0.11);
        } else lum = tint.r * 0.3 + tint.g * 0.59 + tint.b * 0.11;
        parts[i] = lum < 0.3 ? PART.TIRE : PART.RIM;
      }
    } else if (atlas === 'kenney' && tex && g === PART.PAINT) {
      // Kenney atlası: sol üst açık mavi hücre cam, koyu griler trim
      for (let i = 0; i < count; i++) {
        const u = uv.getX(i) - Math.floor(uv.getX(i));
        const v = uv.getY(i) - Math.floor(uv.getY(i));
        if (u < 0.125 && v < 0.25) parts[i] = PART.GLASS;
        else if (u > 0.125 && u < 0.75 && v > 0.5 && v < 0.75) parts[i] = PART.TRIM;
        else parts[i] = PART.PAINT;
      }
    } else {
      parts.fill(g);
    }
    geo.setAttribute('aPart', new THREE.BufferAttribute(parts, 1));
    geo.userData.partsDone = true;
  }
  return meshes;
}
