import * as THREE from 'three';
import { PART } from './CarParts.js';

/**
 * Araç-yerel 3D kir hacmi.
 *
 * GLB modelleri paylaşılan bir renk atlası UV'si kullandığı için kir maskesini
 * UV'ye değil, aracın yerel uzayındaki bir voxel ızgarasına yazıyoruz. Böylece
 * boyanan nokta sadece o noktanın çevresini etkiler ve sistem her modelle çalışır.
 *
 * Doku 0 (RGBA8):  R = çamur · G = leke · B = ıslaklık · A = köpük
 * Doku 1 (RGBA8):  R = fren tozu (jant) · G = lastik matlığı · B = cam filmi · A = cila
 * Doku 2 (RGBA8):  R = kuş pisliği · G = böcek lekesi · B, A = boş (ileride kil bar / katran için)
 *
 * Doku 2'deki noktasal kirler gürültüyle değil, `addSpot()` ile tek tek eklenir; ilerlemeleri
 * yüzey örneklerinden değil, eklenirken kaydedilen voxel listesinden (`spotIdx`) hesaplanır.
 *
 * Detay katmanları hacmin her yerinde tutulur; hangi parçada geçerli oldukları
 * shader'da köşe başına `aPart` niteliğiyle (bkz. CarParts.js) belirlenir.
 */

export const CLEAN_THRESHOLD = 38; // 0-255: bu değerin altı "temiz" sayılır
const POLISHED = 190; // cila bu değerin üstündeyse "parlatıldı"
// Kuş pisliği bu değerin üstündeyse kuru/sert kabuk: su çok yavaş söker, köpük bu değere kadar yumuşatır
export const BIRD_SOFT = 120;
const BIRD_HARD_RATE = 0.05; // sert kabukta suyun sökme çarpanı

// ------------------------------------------------------------------ JS gürültü
function hash3(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const c000 = hash3(ix, iy, iz, seed), c100 = hash3(ix + 1, iy, iz, seed);
  const c010 = hash3(ix, iy + 1, iz, seed), c110 = hash3(ix + 1, iy + 1, iz, seed);
  const c001 = hash3(ix, iy, iz + 1, seed), c101 = hash3(ix + 1, iy, iz + 1, seed);
  const c011 = hash3(ix, iy + 1, iz + 1, seed), c111 = hash3(ix + 1, iy + 1, iz + 1, seed);
  const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}

function fbm(x, y, z, seed, octaves = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x, y, z, seed + i * 17);
    norm += amp;
    x *= 2.03; y *= 2.03; z *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function make3DTexture(data, nx, ny, nz) {
  const t = new THREE.Data3DTexture(data, nx, ny, nz);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ Hacim
const _rp = new THREE.Vector3();

/** Aracın kaba bölgeleri (parça bazlı "temizlendi" geri bildirimi için; araç yerel koordinatı, +Z ön) */
export const REGIONS = [
  { id: 'hood', label: 'Kaput' },
  { id: 'roof', label: 'Tavan' },
  { id: 'trunk', label: 'Bagaj' },
  { id: 'left', label: 'Sol yan' },
  { id: 'right', label: 'Sağ yan' },
  { id: 'front', label: 'Ön tampon' },
  { id: 'back', label: 'Arka tampon' },
];

export class DirtVolume {
  /**
   * @param {THREE.Box3} bounds aracın yerel (root) uzayındaki sınırları
   * @param {object} opts
   */
  constructor(bounds, { maxRes = 104, seed = 1 } = {}) {
    this.seed = seed;
    this.min = bounds.min.clone().subScalar(0.08);
    this.max = bounds.max.clone().addScalar(0.08);
    this.size = new THREE.Vector3().subVectors(this.max, this.min);

    const voxel = Math.max(this.size.x, this.size.y, this.size.z) / maxRes;
    this.voxel = voxel;
    this.nx = Math.max(8, Math.ceil(this.size.x / voxel));
    this.ny = Math.max(8, Math.ceil(this.size.y / voxel));
    this.nz = Math.max(8, Math.ceil(this.size.z / voxel));
    // Izgara tam hücre sayısına otursun diye boyutu yeniden hesapla
    this.size.set(this.nx * voxel, this.ny * voxel, this.nz * voxel);

    const n = this.nx * this.ny * this.nz * 4;
    this.data = new Uint8Array(n);
    this.detail = new Uint8Array(n);
    this.spot = new Uint8Array(n); // doku 2: kuş pisliği · böcek lekesi · (boş) · (boş)
    // Akan su (sadece CPU): su değen yerde köpük aşağı süzülür
    this.flow = new Uint8Array(n / 4);
    this.surface = new Uint8Array(n / 4); // yüzeye yakın voxeller
    this.texture = make3DTexture(this.data, this.nx, this.ny, this.nz);
    this.detailTexture = make3DTexture(this.detail, this.nx, this.ny, this.nz);
    this.spotTexture = make3DTexture(this.spot, this.nx, this.ny, this.nz);

    this.uniforms = {
      uDirtTex: { value: this.texture },
      uDetailTex: { value: this.detailTexture },
      uSpotTex: { value: this.spotTexture },
      uDirtMin: { value: this.min.clone() },
      uDirtSize: { value: this.size.clone() },
      uWorldToCar: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uHighlight: { value: 0 },
      uShine: { value: -100 },
      uReq: { value: new THREE.Vector4() }, // tarayıcının göstereceği detay katmanları (jant, lastik, cam, cila)
      uFoamColor: { value: new THREE.Color(0.94, 0.96, 1.0) },
    };

    this.dirty = false; // doku 0 (çamur/leke/ıslaklık/köpük) değişti
    this.detailDirty = false; // doku 1 (jant/lastik/cam/cila) değişti
    this.spotDirty = false; // doku 2 (kuş pisliği/böcek) değişti
    this.spotIdx = new Uint32Array(0); // noktasal kir voxelleri: bayt indeksi + kanal (0 kuş, 1 böcek)
    this.spotCenters = []; // eksik yer haritası için leke merkezleri: { x, y, z, i, ch }
    this.activeIdx = null; // yüzeye yakın voxeller (kuruma sadece bunlarda hesaplanır)
    this.sampleIdx = null; // yüzey örneklerinin voxel indeksleri
    this.samplePos = null; // yüzey örneklerinin yerel pozisyonları
    this.sampleParts = null;
  }

  index(ix, iy, iz) {
    return ix + this.nx * (iy + this.ny * iz);
  }

  /** Yerel pozisyondan en yakın voxel indeksi */
  voxelIndexAt(x, y, z) {
    const ix = Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.min.x) / this.voxel)));
    const iy = Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.min.y) / this.voxel)));
    const iz = Math.min(this.nz - 1, Math.max(0, Math.floor((z - this.min.z) / this.voxel)));
    return this.index(ix, iy, iz);
  }

  /** Başlangıç kirini üret. profile: { mud: 0..1, stain: 0..1 } */
  generate(profile = { mud: 0.5, stain: 0.5 }, mask = null) {
    const { nx, ny, nz, voxel, min, size, data, detail, seed } = this;

    // Gürültü alçak frekanslı: yarım çözünürlükte hesapla, voxellere üç doğrusal enterpole et
    const S = 2;
    const cx = Math.ceil(nx / S) + 1, cy = Math.ceil(ny / S) + 1, cz = Math.ceil(nz / S) + 1;
    const N1 = new Float32Array(cx * cy * cz);
    const N2 = new Float32Array(cx * cy * cz);
    const N3 = new Float32Array(cx * cy * cz);
    for (let k = 0; k < cz; k++) {
      const z = min.z + (k * S + 0.5) * voxel;
      for (let j = 0; j < cy; j++) {
        const y = min.y + (j * S + 0.5) * voxel;
        for (let i = 0; i < cx; i++) {
          const x = min.x + (i * S + 0.5) * voxel;
          const c = i + cx * (j + cy * k);
          N1[c] = fbm(x * 1.4, y * 1.4, z * 1.4, seed, 3);
          N2[c] = fbm(x * 4.2, y * 4.2, z * 4.2, seed + 99, 3);
          N3[c] = fbm(x * 2.2 + 11, y * 2.2, z * 2.2, seed + 7, 3);
        }
      }
    }
    const sample = (F, gx, gy, gz) => {
      const i = gx | 0, j = gy | 0, k = gz | 0;
      const fx = gx - i, fy = gy - j, fz = gz - k;
      const c = i + cx * (j + cy * k);
      const sy = cx, sz = cx * cy;
      const a = F[c] + (F[c + 1] - F[c]) * fx;
      const b = F[c + sy] + (F[c + sy + 1] - F[c + sy]) * fx;
      const e = F[c + sz] + (F[c + sz + 1] - F[c + sz]) * fx;
      const f = F[c + sz + sy] + (F[c + sz + sy + 1] - F[c + sz + sy]) * fx;
      const ab = a + (b - a) * fy, ef = e + (f - e) * fy;
      return ab + (ef - ab) * fz;
    };

    const active = [];
    for (let iz = 0; iz < nz; iz++) {
      const z = min.z + (iz + 0.5) * voxel;
      const zn = (z - min.z) / size.z; // 0 arka, 1 ön
      const gz = iz / S;
      for (let iy = 0; iy < ny; iy++) {
        const y = min.y + (iy + 0.5) * voxel;
        const h = (y - min.y) / size.y; // 0 alt, 1 üst
        const gy = iy / S;
        for (let ix = 0; ix < nx; ix++) {
          const vi = this.index(ix, iy, iz);
          if (mask && !mask[vi]) continue;
          const i = vi * 4;
          active.push(i);
          this.surface[vi] = 1;
          const gx = ix / S;

          // Çamur: alt kısımlar, tekerlek çevresi ve arka tampon daha çamurlu
          const n1 = sample(N1, gx, gy, gz);
          const n2 = sample(N2, gx, gy, gz);
          const lowBias = smoothstep(0.62, 0.08, h);
          const endBias = Math.max(smoothstep(0.35, 0.0, zn), smoothstep(0.75, 1.0, zn) * 0.6) * 0.25;
          const splash = smoothstep(0.62, 0.8, n2) * 0.7 * smoothstep(0.95, 0.3, h); // yukarı sıçramış çamur
          let mud = lowBias * (0.55 + profile.mud * 0.6) + endBias + (n1 - 0.5) * 1.1 + splash - 0.25 + profile.mud * 0.25;
          mud = clamp01(mud * 1.8);

          // Leke/toz filmi: neredeyse her yeri kaplar, üstte biraz daha yoğun
          const n3 = sample(N3, gx, gy, gz);
          let stain = 0.42 + profile.stain * 0.35 + (n3 - 0.5) * 0.9 + h * 0.15;
          stain = Math.max(0.3, clamp01(stain));

          data[i] = mud * 255;
          data[i + 1] = stain * 255;
          data[i + 2] = 0;
          data[i + 3] = 0;

          // Detay katmanları: jantta fren tozu, lastikte matlık, camda film
          detail[i] = clamp01(0.62 + (n2 - 0.5) * 0.8) * 255;
          detail[i + 1] = clamp01(0.8 + (n1 - 0.5) * 0.5) * 255;
          detail[i + 2] = clamp01(0.5 + (n3 - 0.5) * 0.9 + (1 - h) * 0.15) * 255;
          detail[i + 3] = 0;
        }
      }
    }
    this.activeIdx = new Uint32Array(active);
    this.dirty = this.detailDirty = true;
    this.update();
  }

  /**
   * Küresel yumuşak fırçayla hacmi boya. Oranlar saniye başına (0..1 ölçeğinde).
   *   mud, stain, dust, tire, glass > 0 : söker
   *   wet, foam                        : işaretli (+ ekler, - siler)
   *   shine > 0                         : cila ekler (shineNeedsClean ise sadece temiz yüzeye)
   *   foamBoost                         : köpüklü yüzeyde leke sökme çarpanı
   *   bird > 0                          : kuş pisliği söker (sert kabukta çok yavaş, köpükle yumuşamışta hızlı)
   *   bugs > 0                          : böcek lekesi söker (köpüklü yüzeyde foamBoost ile hızlanır)
   * Dönüş: fırça altındaki ortalama değerler (ipuçları için).
   */
  paint(p, radius, brush, dt) {
    const { voxel, min, nx, ny, nz, data, detail, spot } = this;
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor((p.x - radius - min.x) / voxel));
    const x1 = Math.min(nx - 1, Math.floor((p.x + radius - min.x) / voxel));
    const y0 = Math.max(0, Math.floor((p.y - radius - min.y) / voxel));
    const y1 = Math.min(ny - 1, Math.floor((p.y + radius - min.y) / voxel));
    const z0 = Math.max(0, Math.floor((p.z - radius - min.z) / voxel));
    const z1 = Math.min(nz - 1, Math.floor((p.z + radius - min.z) / voxel));
    if (x0 > x1 || y0 > y1 || z0 > z1) return null;

    const k = dt * 255;
    const mudK = (brush.mud || 0) * k;
    const stainK = (brush.stain || 0) * k;
    const wetK = (brush.wet || 0) * k;
    const foamK = (brush.foam || 0) * k;
    const dustK = (brush.dust || 0) * k;
    const tireK = (brush.tire || 0) * k;
    const glassK = (brush.glass || 0) * k;
    const shineK = (brush.shine || 0) * k;
    const birdK = (brush.bird || 0) * k;
    const bugsK = (brush.bugs || 0) * k;
    const touchSpot = (birdK || bugsK) && this.spotIdx.length > 0;
    const foamBoost = brush.foamBoost || 0;
    const flow = brush.flow || 0;
    const needsClean = !!brush.shineNeedsClean;
    const touchDetail = dustK || tireK || glassK || shineK;

    const sum = new Float64Array(10);
    let count = 0;

    // Stokastik yuvarlama: küçük adımlar da zamanla etkili olsun
    const apply = (v, delta) => {
      const nv = v + delta + (delta >= 0 ? Math.random() : -Math.random());
      return nv < 0 ? 0 : nv > 255 ? 255 : nv | 0;
    };

    for (let iz = z0; iz <= z1; iz++) {
      const dz = min.z + (iz + 0.5) * voxel - p.z;
      for (let iy = y0; iy <= y1; iy++) {
        const dy = min.y + (iy + 0.5) * voxel - p.y;
        for (let ix = x0; ix <= x1; ix++) {
          const dx = min.x + (ix + 0.5) * voxel - p.x;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          let f = 1 - Math.sqrt(d2) / radius;
          f = f * f * (3 - 2 * f);
          const i = (ix + nx * (iy + ny * iz)) * 4;

          sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; sum[3] += data[i + 3];
          sum[4] += detail[i]; sum[5] += detail[i + 1]; sum[6] += detail[i + 2]; sum[7] += detail[i + 3];
          sum[8] += spot[i]; sum[9] += spot[i + 1];
          count++;

          if (mudK) data[i] = apply(data[i], -mudK * f);
          if (stainK) data[i + 1] = apply(data[i + 1], -stainK * f * (1 + foamBoost * (data[i + 3] / 255)));
          if (wetK) data[i + 2] = apply(data[i + 2], wetK * f);
          if (foamK) data[i + 3] = apply(data[i + 3], foamK * f);
          if (flow && f > 0.15) this.flow[i >> 2] = 255;
          if (touchSpot) {
            const b = spot[i];
            if (birdK && b) spot[i] = apply(b, -birdK * f * (b > BIRD_SOFT ? BIRD_HARD_RATE : 1));
            if (bugsK && spot[i + 1]) spot[i + 1] = apply(spot[i + 1], -bugsK * f * (1 + foamBoost * (data[i + 3] / 255)));
          }
          if (!touchDetail) continue;
          if (dustK) detail[i] = apply(detail[i], -dustK * f);
          if (tireK) detail[i + 1] = apply(detail[i + 1], -tireK * f);
          if (glassK) detail[i + 2] = apply(detail[i + 2], -glassK * f);
          if (shineK && (!needsClean || (data[i] < CLEAN_THRESHOLD && data[i + 1] < CLEAN_THRESHOLD))) {
            detail[i + 3] = apply(detail[i + 3], shineK * f);
          }
        }
      }
    }
    if (!count) return null;
    this.dirty = true;
    if (touchDetail) this.detailDirty = true;
    if (touchSpot) this.spotDirty = true;
    const inv = 1 / (count * 255);
    return {
      mud: sum[0] * inv, stain: sum[1] * inv, wet: sum[2] * inv, foam: sum[3] * inv,
      dust: sum[4] * inv, tire: sum[5] * inv, glass: sum[6] * inv, shine: sum[7] * inv,
      bird: sum[8] * inv, bugs: sum[9] * inv,
    };
  }

  /**
   * Köpük yüzeyde beklerken altındaki lekeyi yavaşça çözer (köpük ve su kendiliğinden kaybolmaz:
   * köpük durulanana, su lekeleri havluyla alınana kadar kalır).
   * Kuş pisliğinin sert kabuğunu BIRD_SOFT seviyesine kadar yumuşatır, böcek lekesini de çözer.
   * rate: tam köpükte saniyede sökülen leke oranı
   */
  soak(dt, rate) {
    // Saniyede 4 kez, sadece yüzeye yakın voxellerde
    this.soakT = (this.soakT || 0) + dt;
    if (this.soakT < 0.25) return;
    const k = rate * this.soakT * 255;
    this.soakT = 0;
    const { data, activeIdx } = this;
    let changed = false;
    for (let n = 0; n < activeIdx.length; n++) {
      const i = activeIdx[n];
      const foam = data[i + 3];
      if (foam > 20 && data[i + 1]) {
        data[i + 1] = Math.max(0, data[i + 1] - k * (foam / 255) - Math.random()) | 0;
        changed = true;
      }
    }
    if (changed) this.dirty = true;

    // Noktasal kirler: sadece kayıtlı leke voxellerinde
    const { spot, spotIdx } = this;
    if (!spotIdx.length) return;
    const birdK = k * 4; // tam köpükte sert kabuk birkaç saniyede yumuşar
    const bugK = k * 2;
    let spotChanged = false;
    for (let n = 0; n < spotIdx.length; n++) {
      const j = spotIdx[n];
      const i = j & ~3;
      const foam = data[i + 3];
      if (foam <= 20) continue;
      const ff = foam / 255;
      if ((j & 3) === 0) {
        if (spot[j] > BIRD_SOFT) {
          spot[j] = Math.max(BIRD_SOFT, spot[j] - birdK * ff - Math.random()) | 0;
          spotChanged = true;
        }
      } else if (spot[j]) {
        spot[j] = Math.max(0, spot[j] - bugK * ff - Math.random()) | 0;
        spotChanged = true;
      }
    }
    if (spotChanged) this.spotDirty = true;
  }

  /**
   * Noktasal kir ekle (kuş pisliği ya da böcek lekesi). Yüzeye yakın voxellere yumuşak
   * kenarlı bir küre yazar ve voxelleri ilerleme hesabı için kaydeder.
   * ch: 0 kuş pisliği, 1 böcek lekesi · value: 0..1 merkez yoğunluğu
   * mark: merkez eksik yer haritasında ayrı leke olarak gösterilsin mi
   */
  addSpot(p, radius, ch, value = 1, mark = true) {
    const { voxel, min, nx, ny, nz, spot, surface } = this;
    // Yarıçap en az bir voxel olsun ki küçük lekeler de dokuya düşsün
    const r = Math.max(radius, voxel * 0.9);
    const x0 = Math.max(0, Math.floor((p.x - r - min.x) / voxel));
    const x1 = Math.min(nx - 1, Math.floor((p.x + r - min.x) / voxel));
    const y0 = Math.max(0, Math.floor((p.y - r - min.y) / voxel));
    const y1 = Math.min(ny - 1, Math.floor((p.y + r - min.y) / voxel));
    const z0 = Math.max(0, Math.floor((p.z - r - min.z) / voxel));
    const z1 = Math.min(nz - 1, Math.floor((p.z + r - min.z) / voxel));
    const added = [];
    for (let iz = z0; iz <= z1; iz++) {
      const dz = min.z + (iz + 0.5) * voxel - p.z;
      for (let iy = y0; iy <= y1; iy++) {
        const dy = min.y + (iy + 0.5) * voxel - p.y;
        for (let ix = x0; ix <= x1; ix++) {
          const vi = ix + nx * (iy + ny * iz);
          if (!surface[vi]) continue;
          const dx = min.x + (ix + 0.5) * voxel - p.x;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / r;
          if (d > 1) continue;
          const v = (value * (1 - d * d * 0.6) * 255) | 0;
          const i = vi * 4 + ch;
          if (!spot[i]) added.push(i);
          if (v > spot[i]) spot[i] = v;
        }
      }
    }
    if (added.length) {
      const merged = new Uint32Array(this.spotIdx.length + added.length);
      merged.set(this.spotIdx);
      merged.set(added, this.spotIdx.length);
      this.spotIdx = merged;
    }
    if (mark) this.spotCenters.push({ x: p.x, y: p.y, z: p.z, i: this.voxelIndexAt(p.x, p.y, p.z) * 4 + ch, ch });
    this.spotDirty = true;
  }

  /**
   * Akan su köpüğü aşağı taşır: akış olan yüzey voxelindeki köpüğün bir kısmı altındaki
   * yüzey voxeline geçer, su da onunla birlikte iner. Altında yüzey yoksa köpük damlar.
   * Dönüş: bu adımda bir şey aktı mı
   */
  flowTick(dt) {
    this.flowT = (this.flowT || 0) + dt;
    if (this.flowT < 1 / 12) return false;
    const step = this.flowT;
    this.flowT = 0;
    const { data, flow, surface, activeIdx, nx } = this;
    const layer = nx * this.ny;
    const fade = step * 255 / 1.6; // akış ~1.6 sn'de söner
    let moved = false;
    // Artan indeks = alttan üste: aşağı taşınan köpük aynı adımda tekrar taşınmaz
    for (let n = 0; n < activeIdx.length; n++) {
      const i = activeIdx[n];
      const vi = i >> 2;
      const fl = flow[vi];
      if (!fl) continue;
      flow[vi] = fl > fade ? fl - fade : 0;
      const foam = data[i + 3];
      if (foam < 12) continue;
      // Aşağıdaki yüzey voxeli (dik yüzeyde tam altı, eğimli yüzeyde yan-altı)
      const below = vi - nx;
      let t = -1;
      if (below >= 0) {
        if (surface[below]) t = below;
        else if (surface[below - 1]) t = below - 1;
        else if (surface[below + 1]) t = below + 1;
        else if (surface[below - layer]) t = below - layer;
        else if (surface[below + layer]) t = below + layer;
      }
      const k = fl / 255;
      const amt = (foam * 0.45 * k) | 0;
      if (!amt) continue;
      data[i + 3] = foam - amt;
      // Akan köpükle çözülmüş leke de gider
      if (data[i + 1]) data[i + 1] = Math.max(0, data[i + 1] - ((foam / 255) * k * 4) | 0);
      if (t >= 0) {
        const j = t * 4;
        data[j + 3] = Math.min(255, data[j + 3] + amt * 0.9) | 0;
        data[j + 2] = Math.max(data[j + 2], 180);
        if (flow[t] < fl * 0.9) flow[t] = fl * 0.9;
      }
      moved = true;
    }
    if (moved) this.dirty = true;
    return moved;
  }

  /** Yüzey örneklerini ata (ilerleme yüzdesi için). positions: xyz, parts: PART değerleri */
  setSurfaceSamples(positions, parts, normals = null) {
    const n = positions.length / 3;
    this.samplePos = positions;
    this.sampleParts = parts;
    this.sampleNormals = normals;
    this.sampleIdx = new Uint32Array(n);
    for (let s = 0; s < n; s++) {
      this.sampleIdx[s] = this.voxelIndexAt(positions[s * 3], positions[s * 3 + 1], positions[s * 3 + 2]) * 4;
    }
    // Bölge ataması: kaput/tavan/bagaj (yukarı bakan), yanlar, ön ve arka (boya, cam, trim örnekleri)
    this.sampleRegion = new Int8Array(n).fill(-1);
    this.regionCount = new Int32Array(REGIONS.length);
    this.regionFrac = new Float32Array(REGIONS.length).fill(1);
    this.regionBox = REGIONS.map(() => new THREE.Box3());
    if (normals) {
      for (let s = 0; s < n; s++) {
        const part = parts[s];
        if (part !== PART.PAINT && part !== PART.GLASS && part !== PART.TRIM) continue;
        const nx = normals[s * 3] / 127, ny = normals[s * 3 + 1] / 127, nz = normals[s * 3 + 2] / 127;
        const zn = (positions[s * 3 + 2] - this.min.z) / this.size.z;
        let r = -1;
        if (ny > 0.5) r = zn > 0.62 ? 0 : zn > 0.3 ? 1 : 2;
        else if (nx < -0.6) r = 3;
        else if (nx > 0.6) r = 4;
        else if (nz > 0.6) r = 5;
        else if (nz < -0.6) r = 6;
        if (r < 0) continue;
        this.sampleRegion[s] = r;
        this.regionCount[r]++;
        this.regionBox[r].expandByPoint(_rp.set(positions[s * 3], positions[s * 3 + 1], positions[s * 3 + 2]));
      }
    }
    // Lastik parlatma yalnızca DIŞA bakan yanağı sayar (normaller Int8, ±127): normal aracın yan eksenine
    // yakın ve araç merkezinden uzaklaşan yönde olmalı; iç yanak ve taban sayılmaz
    this.tireSide = null;
    if (normals) {
      const side = new Uint8Array(n);
      const cx = this.min.x + this.size.x * 0.5;
      let count = 0;
      for (let s = 0; s < n; s++) {
        if (parts[s] !== PART.TIRE) continue;
        const nx = normals[s * 3];
        if (Math.abs(nx) > 0.6 * 127 && nx * (positions[s * 3] - cx) > 0) { side[s] = 1; count++; }
      }
      if (count > 20) this.tireSide = side; // dış yanak örneği yoksa tüm lastik sayılır
    }
  }

  /** Temizlik istatistikleri: her katman için temiz örneklerin oranı (parçası olmayan katman = 1) */
  stats() {
    const idx = this.sampleIdx;
    const out = { mud: 1, stain: 1, dry: 1, foam: 0, foamCover: 0, rims: 1, tires: 1, glass: 1, polish: 1, bird: 1, bugs: 1, spots: 1, birdHard: 0 };
    this.spotStats(out);
    if (!idx || !idx.length) return out;
    const { data, detail, sampleParts } = this;
    let mud = 0, stain = 0, dry = 0, foam = 0, cover = 0, body = 0;
    const cnt = [0, 0, 0, 0], ok = [0, 0, 0, 0]; // jant, lastik, cam, boya(cila)
    const rc = this._rc || (this._rc = new Int32Array(REGIONS.length)), rk = this._rk || (this._rk = new Int32Array(REGIONS.length));
    rc.fill(0);
    rk.fill(0);
    const region = this.sampleRegion;
    for (let s = 0; s < idx.length; s++) {
      const i = idx[s];
      if (data[i] < CLEAN_THRESHOLD) mud++;
      if (data[i + 1] < CLEAN_THRESHOLD) stain++;
      if (data[i + 2] < CLEAN_THRESHOLD * 1.6) dry++;
      if (data[i + 3] > CLEAN_THRESHOLD) foam++;
      const part = sampleParts[s];
      const rg = region ? region[s] : -1;
      if (rg >= 0) { rc[rg]++; if (data[i] < CLEAN_THRESHOLD && data[i + 1] < CLEAN_THRESHOLD) rk[rg]++; }
      // Köpük kaplaması: kaporta ve camlar (lastik/jant hariç)
      if (part === PART.PAINT || part === PART.GLASS || part === PART.TRIM) {
        body++;
        if (data[i + 3] > 70) cover++;
      }
      switch (part) {
        case PART.RIM: cnt[0]++; if (detail[i] < CLEAN_THRESHOLD) ok[0]++; break;
        case PART.TIRE:
          if (this.tireSide && !this.tireSide[s]) break;
          cnt[1]++; if (detail[i + 1] < CLEAN_THRESHOLD) ok[1]++;
          break;
        case PART.GLASS: cnt[2]++; if (detail[i + 2] < CLEAN_THRESHOLD) ok[2]++; break;
        case PART.PAINT: cnt[3]++; if (detail[i + 3] > POLISHED) ok[3]++; break;
      }
    }
    const n = idx.length;
    out.mud = mud / n;
    out.stain = stain / n;
    out.dry = dry / n;
    out.foam = foam / n;
    out.foamCover = body ? cover / body : 1;
    out.rims = cnt[0] ? ok[0] / cnt[0] : 1;
    out.tires = cnt[1] ? ok[1] / cnt[1] : 1;
    out.glass = cnt[2] ? ok[2] / cnt[2] : 1;
    out.polish = cnt[3] ? ok[3] / cnt[3] : 1;
    if (region) {
      for (let k = 0; k < REGIONS.length; k++) this.regionFrac[k] = rc[k] ? rk[k] / rc[k] : 1;
      out.regionFrac = this.regionFrac;
    }
    return out;
  }

  /** Noktasal kirlerin temiz oranı (kayıtlı leke voxelleri üzerinden; leke yoksa 1) */
  spotStats(out) {
    const { spot, spotIdx } = this;
    let nb = 0, okb = 0, ng = 0, okg = 0, hard = 0;
    for (let n = 0; n < spotIdx.length; n++) {
      const i = spotIdx[n];
      const v = spot[i];
      if ((i & 3) === 0) {
        nb++;
        if (v < CLEAN_THRESHOLD) okb++;
        else if (v > BIRD_SOFT) hard++;
      } else {
        ng++;
        if (v < CLEAN_THRESHOLD) okg++;
      }
    }
    out.bird = nb ? okb / nb : 1;
    out.bugs = ng ? okg / ng : 1;
    out.spots = nb + ng ? (okb + okg) / (nb + ng) : 1;
    out.birdHard = nb ? hard / nb : 0; // hâlâ sert kabuklu kuş pisliği oranı
    return out;
  }

  /** Leke merkezinde kir kaldı mı (eksik yer haritası için) */
  spotRemains(c) {
    return this.spot[c.i] >= CLEAN_THRESHOLD;
  }

  /** Islak bir yüzey noktası döndür (damla efekti için) */
  randomWetSample(out) {
    const idx = this.sampleIdx;
    if (!idx) return false;
    for (let tries = 0; tries < 6; tries++) {
      const s = (Math.random() * idx.length) | 0;
      if (this.data[idx[s] + 2] > 90) {
        out.set(this.samplePos[s * 3], this.samplePos[s * 3 + 1], this.samplePos[s * 3 + 2]);
        return true;
      }
    }
    return false;
  }

  /** Hepsini temizle (debug). polish: cila katmanını da doldur */
  cleanAll(polish = true) {
    this.data.fill(0);
    this.spot.fill(0);
    this.spotDirty = true;
    for (let i = 0; i < this.detail.length; i += 4) {
      this.detail[i] = this.detail[i + 1] = this.detail[i + 2] = 0;
      if (polish) this.detail[i + 3] = 255;
    }
    this.dirty = this.detailDirty = true;
  }

  update() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
    if (this.detailDirty) {
      this.detailTexture.needsUpdate = true;
      this.detailDirty = false;
    }
    if (this.spotDirty) {
      this.spotTexture.needsUpdate = true;
      this.spotDirty = false;
    }
  }

  dispose() {
    this.texture.dispose();
    this.detailTexture.dispose();
    this.spotTexture.dispose();
  }
}

// ------------------------------------------------------------------ Shader enjeksiyonu
const DIRT_COMMON = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uDirtTex;
uniform sampler3D uDetailTex;
uniform sampler3D uSpotTex;
uniform vec3 uDirtMin;
uniform vec3 uDirtSize;
uniform float uTime;
uniform float uHighlight;
uniform float uShine;
uniform vec4 uReq;
uniform vec3 uFoamColor;
varying vec3 vCarPos;
varying float vPart;

float dHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float dNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dHash(i), dHash(i + vec3(1, 0, 0)), f.x), mix(dHash(i + vec3(0, 1, 0)), dHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(dHash(i + vec3(0, 0, 1)), dHash(i + vec3(1, 0, 1)), f.x), mix(dHash(i + vec3(0, 1, 1)), dHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
// Not: Windows/ANGLE'da derleme süresi için döngüsüz ve kısa tutuldu
float dFbm(vec3 p) {
  return dNoise(p) * 0.57 + dNoise(p * 2.03 + 7.1) * 0.29 + dNoise(p * 4.1 + 3.3) * 0.14;
}
// Tek hücreli damlacık deseni (her hücrede en fazla bir damla)
float dDrops(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p) - 0.5 - (vec3(dHash(i), dHash(i + 3.1), dHash(i + 7.7)) - 0.5) * 0.5;
  float size = 0.18 + 0.2 * dHash(i + 1.3);
  return (1.0 - smoothstep(0.7, 1.0, length(f) / size)) * step(0.35, dHash(i + 5.9));
}
`;

const PART_DEFINES = Object.entries(PART).map(([k, v]) => `#define PART_${k} ${v}.0`).join('\n');

/**
 * Mevcut bir MeshStandard/MeshPhysical malzemesine kir ve bakım katmanlarını enjekte eder.
 * Aracın orijinal PBR görünümü "temiz" hal olarak korunur.
 * tuneParts: modelin kendi PBR ayarı zayıfsa (atlas renkli low-poly) parçalara göre
 * gerçekçi boya/cam/lastik/jant yüzeyi uygula.
 */
export function applyDirtShader(material, uniforms, { tuneParts = false } = {}) {
  material.userData.dirtUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (tuneParts) shader.defines = { ...(shader.defines || {}), TUNE_PARTS: '' };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform mat4 uWorldToCar;
attribute float aPart;
varying vec3 vCarPos;
varying float vPart;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vCarPos = (uWorldToCar * modelMatrix * vec4(transformed, 1.0)).xyz;
vPart = aPart;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PART_DEFINES}\n${DIRT_COMMON}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
vec3 dUVW = (vCarPos - uDirtMin) / uDirtSize;
vec4 dirt = texture(uDirtTex, dUVW);
vec4 det = texture(uDetailTex, dUVW);
vec4 dSpot = texture(uSpotTex, dUVW); // r = kuş pisliği, g = böcek (b, a boş)
float pPaint = 1.0 - step(0.5, vPart);
float pGlass = step(0.5, vPart) * (1.0 - step(1.5, vPart));
float pTire = step(1.5, vPart) * (1.0 - step(2.5, vPart));
float pRim = step(2.5, vPart) * (1.0 - step(3.5, vPart));
float pDirt = 1.0 - step(4.5, vPart); // iç aksam (5) kirlenmez

float dN = dFbm(vCarPos * 7.0);
float dN2 = dNoise(vCarPos * 31.0);
float mudM = pDirt * smoothstep(0.30, 0.60, dirt.r + (dN - 0.5) * 0.55 + (dN2 - 0.5) * 0.12);
float stainM = pDirt * smoothstep(0.14, 0.55, dirt.g + (dN - 0.5) * 0.35 + (dN2 - 0.5) * 0.2);
float foamM = pDirt * smoothstep(0.12, 0.42, dirt.a + (dNoise(vCarPos * 55.0) - 0.5) * 0.3);
float wetM = pDirt * clamp(dirt.b * 1.3, 0.0, 1.0) * (1.0 - mudM);
float dropM = pDirt * dDrops(vCarPos * 24.0 + 1.7) * smoothstep(0.2, 0.6, dirt.b);

#ifdef TUNE_PARTS
// Atlas renkli modellerde cam koyu ve yansıtıcı, lastik derin siyah olsun
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.22 + vec3(0.01, 0.014, 0.02), pGlass);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.55, pTire);
#endif

// Jant: fren tozu (kahverengi-gri, mat)
float dustM = pRim * smoothstep(0.14, 0.5, det.r + (dN - 0.5) * 0.4);
diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.15, 0.11, 0.08), vec3(0.32, 0.26, 0.2), dN2), dustM * 0.92);
// Lastik: soluk gri-kahve ↔ parlatılmış derin siyah
float tireDull = pTire * smoothstep(0.1, 0.5, det.g);
float tireGloss = pTire * (1.0 - smoothstep(0.1, 0.5, det.g));
diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(0.34, 0.31, 0.28), 0.6), tireDull);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, tireGloss);
// Cam: puslu film ve kireç lekeleri
float glassM = pGlass * smoothstep(0.12, 0.5, det.b + (dN2 - 0.5) * 0.3);
float glassSpots = smoothstep(0.58, 0.7, dNoise(vCarPos * 16.0 + 2.0));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46, 0.48, 0.46) * (0.75 + 0.35 * glassSpots), glassM * 0.55);
// Cila: boyada daha derin, doygun renk
float shineM = pPaint * det.a;
diffuseColor.rgb = mix(diffuseColor.rgb, pow(diffuseColor.rgb, vec3(1.12)) * 1.05, shineM);

// Leke: toz filmi + aşağı akan kir izleri + su lekeleri
float streak = dNoise(vCarPos * vec3(7.0, 0.9, 7.0) + 5.0);
float grime = dNoise(vCarPos * vec3(5.0, 2.5, 5.0));
float spots = smoothstep(0.7, 0.78, dNoise(vCarPos * 20.0 + 9.0));
vec3 stainCol = mix(vec3(0.30, 0.27, 0.20), vec3(0.55, 0.50, 0.40), grime);
stainCol = mix(stainCol, vec3(0.22, 0.19, 0.14), smoothstep(0.55, 0.8, streak) * 0.8);
stainCol = mix(stainCol, vec3(0.70, 0.67, 0.60), spots * 0.6);
float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
vec3 faded = mix(diffuseColor.rgb, vec3(lum), 0.55) * 0.5 + stainCol * 0.5;
diffuseColor.rgb = mix(diffuseColor.rgb, faded, stainM * (0.75 + 0.25 * grime));

// Çamur: kahverengi, lekeli, kurumuş kenarlar
float mudDetail = dFbm(vCarPos * 19.0 + 3.0);
vec3 mudCol = mix(vec3(0.13, 0.085, 0.045), vec3(0.36, 0.26, 0.15), mudDetail);
mudCol = mix(mudCol, vec3(0.45, 0.36, 0.24), smoothstep(0.35, 0.0, abs(mudM - 0.55)) * 0.35);
diffuseColor.rgb = mix(diffuseColor.rgb, mudCol, mudM);

// Kuş pisliği: beyazımsı-gri, düzensiz kenarlı, içinde koyu benekler; köpükle yumuşamışı daha soluk ve ıslak
float birdN = dNoise(vCarPos * 38.0 + 4.0);
// Gürültü çarpımsal: leke olmayan yerde (r = 0) hiç görünmez
float birdM = pDirt * smoothstep(0.16, 0.38, dSpot.r * (0.7 + birdN * 0.6 + (dN2 - 0.5) * 0.2));
vec3 birdCol = mix(vec3(0.88, 0.87, 0.82), vec3(0.6, 0.58, 0.53), birdN);
birdCol = mix(birdCol, vec3(0.2, 0.19, 0.15), smoothstep(0.66, 0.8, dNoise(vCarPos * 85.0 + 1.0)) * 0.7);
float birdSoft = 1.0 - smoothstep(0.45, 0.6, dSpot.r);
diffuseColor.rgb = mix(diffuseColor.rgb, birdCol, birdM * (0.95 - birdSoft * 0.3));

// Böcek lekesi: küçük koyu sarı / siyah noktacıklar
float bugCell = dHash(floor(vCarPos * 95.0));
float bugDots = smoothstep(0.6, 0.72, dNoise(vCarPos * 95.0 + 2.0));
float bugM = pDirt * smoothstep(0.1, 0.35, dSpot.g) * bugDots;
vec3 bugCol = mix(vec3(0.05, 0.04, 0.02), vec3(0.62, 0.5, 0.1), step(0.55, bugCell));
diffuseColor.rgb = mix(diffuseColor.rgb, bugCol, bugM * 0.92);

// Islaklık: renk koyulaşır
diffuseColor.rgb *= 1.0 - wetM * 0.25 - dropM * 0.1;

// Köpük: beyaz, kabarcıklı
float bubbles = dNoise(vCarPos * 70.0);
vec3 foamCol = uFoamColor * (0.82 + 0.18 * bubbles);
diffuseColor.rgb = mix(diffuseColor.rgb, foamCol, foamM);
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
#ifdef TUNE_PARTS
roughnessFactor = mix(roughnessFactor, 0.3, pPaint);
roughnessFactor = mix(roughnessFactor, 0.03, pGlass);
roughnessFactor = mix(roughnessFactor, 0.86, pTire);
roughnessFactor = mix(roughnessFactor, 0.2, pRim);
#endif
roughnessFactor = mix(roughnessFactor, 0.9, dustM);
roughnessFactor = mix(roughnessFactor, 0.26, tireGloss);
roughnessFactor = mix(roughnessFactor, 0.55, glassM);
roughnessFactor *= 1.0 - shineM * 0.65;
roughnessFactor = mix(roughnessFactor, max(roughnessFactor, 0.78), stainM * 0.85);
roughnessFactor = mix(roughnessFactor, 0.97, mudM);
roughnessFactor = mix(roughnessFactor, 0.88 - birdSoft * 0.4, birdM);
roughnessFactor = mix(roughnessFactor, 0.55, bugM);
roughnessFactor = mix(roughnessFactor, 0.05, max(wetM * 0.55, dropM) * (1.0 - foamM));
roughnessFactor = mix(roughnessFactor, 0.62, foamM);
`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        /* glsl */ `#include <metalnessmap_fragment>
#ifdef TUNE_PARTS
metalnessFactor = mix(metalnessFactor, 0.45, pPaint);
metalnessFactor = mix(metalnessFactor, 0.0, clamp(pGlass + pTire, 0.0, 1.0));
metalnessFactor = mix(metalnessFactor, 0.95, pRim);
#endif
metalnessFactor *= 1.0 - max(max(mudM, foamM), max(dustM * 0.8, birdM));
`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
float remain = pDirt * max(step(0.12, dirt.r), step(0.12, dirt.g));
remain = max(remain, uReq.x * pRim * step(0.15, det.r));
remain = max(remain, uReq.y * pTire * step(0.15, det.g));
remain = max(remain, uReq.z * pGlass * step(0.15, det.b));
float needPolish = uReq.w * pPaint * (1.0 - step(0.75, det.a)) * (1.0 - remain);
float pulse = 0.55 + 0.45 * sin(uTime * 7.0);
vec3 hl = remain * vec3(1.0, 0.42, 0.05) + needPolish * vec3(1.0, 0.8, 0.15)
        + pDirt * step(0.18, dirt.b) * (1.0 - remain) * (1.0 - needPolish) * vec3(0.1, 0.55, 1.0);
// Kuş pisliği ve böcek lekesi mor vurgulanır
float spotRemain = pDirt * max(step(0.12, dSpot.r), step(0.12, dSpot.g));
hl = mix(hl, vec3(0.8, 0.3, 1.0), spotRemain);
totalEmissiveRadiance += uHighlight * hl * pulse * 0.9;
totalEmissiveRadiance += dropM * (1.0 - foamM) * vec3(0.022, 0.026, 0.03);
// Cilalı boyada metalik pul parıltısı
float flake = step(0.9975, dHash(floor(vCarPos * 300.0)));
totalEmissiveRadiance += flake * shineM * (1.0 - mudM) * (1.0 - stainM) * vec3(0.05, 0.048, 0.045);
float band = exp(-pow((vCarPos.z * 0.9 + vCarPos.y * 0.5 - uShine) * 2.6, 2.0));
totalEmissiveRadiance += band * vec3(1.0, 0.97, 0.9) * 1.4;
`,
      );

    // Clearcoat: temiz boya parlasın, kir matlaştırsın, cila aynaya çevirsin
    if (shader.fragmentShader.includes('#include <lights_physical_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat *= 1.0 - max(max(mudM, stainM * 0.85), max(foamM, birdM));
  material.clearcoat = mix(material.clearcoat, 1.0, shineM * (1.0 - mudM) * (1.0 - stainM));
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.0, shineM);
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.02, dropM);
#endif
`,
      );
    }

    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `dirt-v5-${material.type}-${tuneParts ? 1 : 0}`;
  material.needsUpdate = true;
}
