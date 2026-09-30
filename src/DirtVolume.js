import * as THREE from 'three';

/**
 * Araç-yerel 3D kir hacmi.
 *
 * GLB modelleri paylaşılan bir renk atlası UV'si kullandığı için kir maskesini
 * UV'ye değil, aracın yerel uzayındaki bir voxel ızgarasına yazıyoruz. Böylece
 * boyanan nokta sadece o noktanın çevresini etkiler ve sistem her modelle çalışır.
 *
 * Kanallar (RGBA8):
 *   R = çamur   (hortum söker)
 *   G = leke    (sünger siler, köpük hızlandırır)
 *   B = ıslaklık (hortum/köpük ekler, havlu kurutur)
 *   A = köpük   (köpük topu ekler, hortum durular)
 */

export const CLEAN_THRESHOLD = 38; // 0-255: bu değerin altı "temiz" sayılır

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

// ------------------------------------------------------------------ Hacim
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

    this.data = new Uint8Array(this.nx * this.ny * this.nz * 4);
    this.texture = new THREE.Data3DTexture(this.data, this.nx, this.ny, this.nz);
    this.texture.format = THREE.RGBAFormat;
    this.texture.type = THREE.UnsignedByteType;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = this.texture.wrapT = this.texture.wrapR = THREE.ClampToEdgeWrapping;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;

    this.uniforms = {
      uDirtTex: { value: this.texture },
      uDirtMin: { value: this.min.clone() },
      uDirtSize: { value: this.size.clone() },
      uWorldToCar: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uHighlight: { value: 0 },
      uShine: { value: -100 },
    };

    this.dirty = false;
    this.sampleIdx = null; // yüzey örneklerinin voxel indeksleri
    this.samplePos = null; // yüzey örneklerinin yerel pozisyonları
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
    const { nx, ny, nz, voxel, min, size, data, seed } = this;

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
        }
      }
    }
    this.dirty = true;
    this.update();
  }

  /**
   * Küresel yumuşak fırçayla hacmi boya.
   * brush: { mud, stain, wet, foam, foamBoost } — saniye başına oran (0..1 ölçeğinde).
   *   mud / stain  > 0 : söker
   *   wet / foam      : işaretli (+ ekler, - siler)
   * Dönüş: fırça altındaki ortalama kir değerleri (ipuçları için).
   */
  paint(p, radius, brush, dt) {
    const { voxel, min, nx, ny, nz, data } = this;
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
    const foamBoost = brush.foamBoost || 0;

    let sumMud = 0, sumStain = 0, sumWet = 0, sumFoam = 0, count = 0;

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

          sumMud += data[i]; sumStain += data[i + 1]; sumWet += data[i + 2]; sumFoam += data[i + 3];
          count++;

          if (mudK) data[i] = apply(data[i], -mudK * f);
          if (stainK) {
            const foam = data[i + 3] / 255;
            data[i + 1] = apply(data[i + 1], -stainK * f * (1 + foamBoost * foam));
          }
          if (wetK) data[i + 2] = apply(data[i + 2], wetK * f);
          if (foamK) data[i + 3] = apply(data[i + 3], foamK * f);
        }
      }
    }
    if (!count) return null;
    this.dirty = true;
    const inv = 1 / (count * 255);
    return { mud: sumMud * inv, stain: sumStain * inv, wet: sumWet * inv, foam: sumFoam * inv };
  }

  /** Doğal kuruma / köpüğün yavaşça sönmesi */
  decay(dt, { wet = 0, foam = 0 }) {
    const { data } = this;
    const wetK = wet * dt * 255;
    const foamK = foam * dt * 255;
    if (Math.random() > 0.25) return; // her karede değil, maliyeti düşür
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 2]) data[i + 2] = Math.max(0, data[i + 2] - wetK * 4 - Math.random()) | 0;
      if (data[i + 3]) data[i + 3] = Math.max(0, data[i + 3] - foamK * 4 - Math.random()) | 0;
    }
    this.dirty = true;
  }

  /** Yüzey örneklerini ata (ilerleme yüzdesi için). positions: Float32Array xyz */
  setSurfaceSamples(positions) {
    const n = positions.length / 3;
    this.samplePos = positions;
    this.sampleIdx = new Uint32Array(n);
    for (let s = 0; s < n; s++) {
      this.sampleIdx[s] = this.voxelIndexAt(positions[s * 3], positions[s * 3 + 1], positions[s * 3 + 2]) * 4;
    }
  }

  /** Temizlik istatistikleri: her katman için temiz örneklerin oranı */
  stats() {
    const idx = this.sampleIdx;
    if (!idx || !idx.length) return { mud: 1, stain: 1, dry: 1, foam: 0 };
    const { data } = this;
    let mud = 0, stain = 0, dry = 0, foam = 0;
    for (let s = 0; s < idx.length; s++) {
      const i = idx[s];
      if (data[i] < CLEAN_THRESHOLD) mud++;
      if (data[i + 1] < CLEAN_THRESHOLD) stain++;
      if (data[i + 2] < CLEAN_THRESHOLD * 1.6) dry++;
      if (data[i + 3] > CLEAN_THRESHOLD) foam++;
    }
    const n = idx.length;
    return { mud: mud / n, stain: stain / n, dry: dry / n, foam: foam / n };
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

  /** Hepsini temizle (debug) */
  cleanAll() {
    for (let i = 0; i < this.data.length; i++) this.data[i] = 0;
    this.dirty = true;
  }

  update() {
    if (this.dirty) {
      this.texture.needsUpdate = true;
      this.dirty = false;
    }
  }

  dispose() {
    this.texture.dispose();
  }
}

// ------------------------------------------------------------------ Shader enjeksiyonu
const DIRT_COMMON = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uDirtTex;
uniform vec3 uDirtMin;
uniform vec3 uDirtSize;
uniform float uTime;
uniform float uHighlight;
uniform float uShine;
varying vec3 vCarPos;

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
float dFbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * dNoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
// Hücresel damlacık deseni
float dDrops(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d = 1.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + vec3(dHash(i + o), dHash(i + o + 3.1), dHash(i + o + 7.7)) - f;
    float size = 0.25 + 0.45 * dHash(i + o + 1.3);
    d = min(d, length(r) / size);
  }
  return 1.0 - smoothstep(0.4, 0.62, d);
}
`;

/**
 * Mevcut bir MeshStandard/MeshPhysical malzemesine kir katmanlarını enjekte eder.
 * Aracın orijinal PBR görünümü "temiz" hal olarak korunur.
 */
export function applyDirtShader(material, uniforms) {
  material.userData.dirtUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform mat4 uWorldToCar;
varying vec3 vCarPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vCarPos = (uWorldToCar * modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DIRT_COMMON}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
vec4 dirt = texture(uDirtTex, (vCarPos - uDirtMin) / uDirtSize);
float dN = dFbm(vCarPos * 7.0);
float dN2 = dNoise(vCarPos * 31.0);
float mudM = smoothstep(0.30, 0.60, dirt.r + (dN - 0.5) * 0.55 + (dN2 - 0.5) * 0.12);
float stainM = smoothstep(0.14, 0.55, dirt.g + (dN - 0.5) * 0.35 + (dN2 - 0.5) * 0.2);
float foamM = smoothstep(0.12, 0.42, dirt.a + (dNoise(vCarPos * 55.0) - 0.5) * 0.3);
float wetM = clamp(dirt.b * 1.3, 0.0, 1.0) * (1.0 - mudM);
float dropM = dDrops(vCarPos * 24.0 + 1.7) * smoothstep(0.2, 0.6, dirt.b) * step(0.35, dHash(floor(vCarPos * 24.0 + 1.7)));

// Leke: toz filmi + aşağı akan kir izleri + su lekeleri
float streak = dFbm(vCarPos * vec3(7.0, 0.9, 7.0) + 5.0);
float grime = dFbm(vCarPos * vec3(5.0, 2.5, 5.0));
float spots = smoothstep(0.66, 0.74, dFbm(vCarPos * 20.0 + 9.0));
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

// Islaklık: renk koyulaşır
diffuseColor.rgb *= 1.0 - wetM * 0.25 - dropM * 0.1;

// Köpük: beyaz, kabarcıklı
float bubbles = dNoise(vCarPos * 90.0) * 0.6 + dNoise(vCarPos * 40.0) * 0.4;
vec3 foamCol = vec3(0.94, 0.96, 1.0) * (0.82 + 0.18 * bubbles);
diffuseColor.rgb = mix(diffuseColor.rgb, foamCol, foamM);
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, max(roughnessFactor, 0.78), stainM * 0.85);
roughnessFactor = mix(roughnessFactor, 0.97, mudM);
roughnessFactor = mix(roughnessFactor, 0.05, max(wetM * 0.55, dropM) * (1.0 - foamM));
roughnessFactor = mix(roughnessFactor, 0.62, foamM);
`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        /* glsl */ `#include <metalnessmap_fragment>
metalnessFactor *= 1.0 - max(mudM, foamM);
`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
float remain = max(step(0.12, dirt.r), step(0.12, dirt.g));
float pulse = 0.55 + 0.45 * sin(uTime * 7.0);
vec3 hl = remain * vec3(1.0, 0.42, 0.05) + step(0.18, dirt.b) * (1.0 - remain) * vec3(0.1, 0.55, 1.0);
totalEmissiveRadiance += uHighlight * hl * pulse * 0.9;
totalEmissiveRadiance += dropM * (1.0 - foamM) * vec3(0.022, 0.026, 0.03);
float band = exp(-pow((vCarPos.z * 0.9 + vCarPos.y * 0.5 - uShine) * 2.6, 2.0));
totalEmissiveRadiance += band * vec3(1.0, 0.97, 0.9) * 1.4;
`,
      );

    // Clearcoat: temiz boya parlasın, kir matlaştırsın
    if (shader.fragmentShader.includes('#include <lights_physical_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
  material.clearcoat *= 1.0 - max(max(mudM, stainM * 0.85), foamM);
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.02, dropM);
#endif
`,
      );
    }

    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => 'dirt-v1-' + material.type;
  material.needsUpdate = true;
}
