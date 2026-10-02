import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAR_CATALOG, prepareGltfCar, buildProceduralCar, recolorPaint } from './CarModels.js';
import { classifyCarParts, PART } from './CarParts.js';
import { PACKAGES, packageFor } from './Packages.js';
import { DirtVolume, applyDirtShader } from './DirtVolume.js';

const CUSTOMERS = [
  'Ayşe Hanım', 'Mehmet Bey', 'Zeynep', 'Can', 'Elif Hanım', 'Burak', 'Deniz', 'Selin',
  'Emre Usta', 'Nazlı', 'Kemal Bey', 'Derya', 'Oğuz', 'Merve', 'Hakan Abi', 'İrem',
];

export const ENTRY_Z = -16;
export const PARK_Z = 0;
export const EXIT_Z = 17;

const SURFACE_SAMPLES = 2600;
const PLAYER_EYE = 1.68;
const REACH_OFFSET = 2.5;
const BIRD_CHANCE = 0.55; // araçta kuş pisliği olma olasılığı
const BUG_CHANCE = 0.6; // araçta böcek lekesi olma olasılığı

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _sp = new THREE.Vector3();
const _sp2 = new THREE.Vector3();
let _part = 0;

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInQuad = (t) => t * t;

/**
 * Araç yaşam döngüsü: gelme → yıkanma → kutlama → gitme.
 * Kir hacmini, raycast'i ve boyamayı yönetir.
 */
export class CarManager {
  constructor(scene, { onArrived, onWashed, onLeft, renderer, camera } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.templates = new Map();
    this.car = null;
    this.lastId = null;
    this.callbacks = { onArrived, onWashed, onLeft };
    this.highlight = 0;
    this.soakRate = 0.1; // köpüğün lekeyi çözme hızı (Premium Şampuan ile artar)
  }

  /**
   * Araç modellerini yükle. İlk müşteri için bir aracı bekler, gerisini arka planda
   * sırayla indirir (GitHub Pages'te açılış hızlı kalsın).
   */
  async preload(maxTier = 0) {
    this.loader = this.loader || new GLTFLoader();
    const first = this.pickFrom(CAR_CATALOG.filter((d) => d.tier <= maxTier));
    await this.loadDef(first);
    this.loadAll = (async () => {
      const rest = CAR_CATALOG.filter((d) => d !== first).sort((a, b) => a.tier - b.tier);
      for (const def of rest) await this.loadDef(def);
    })();
  }

  async loadDef(def) {
    if (!def.glb || this.templates.has(def.id) || this.failed?.has(def.id)) return;
    try {
      const gltf = await this.loader.loadAsync(def.glb);
      this.templates.set(def.id, gltf.scene);
    } catch (err) {
      (this.failed ||= new Set()).add(def.id);
      console.warn(`[CarManager] ${def.glb} yüklenemedi, prosedürel araç kullanılacak.`, err);
    }
  }

  pickFrom(pool) {
    // Yeni açılan (üst seviye) araçlar biraz daha sık gelsin
    const weights = pool.map((d) => 1 + d.tier * 0.5);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  pickDef(maxTier, forceId) {
    const forced = forceId && CAR_CATALOG.find((d) => d.id === forceId);
    if (forced) return forced;
    const allowed = CAR_CATALOG.filter((d) => d.tier <= maxTier && d.id !== this.lastId);
    // Önce modeli inmiş olanlardan seç; hiçbiri inmediyse (ya da hepsi başarısızsa) prosedürel
    const ready = allowed.filter((d) => this.templates.has(d.id));
    return this.pickFrom(ready.length ? ready : allowed);
  }

  spawn(maxTier = 0, pkg = PACKAGES.standart, forceId) {
    const def = this.pickDef(maxTier, forceId);
    this.lastId = def.id;

    const template = this.templates.get(def.id);
    const object = template ? prepareGltfCar(template, def) : buildProceduralCar(def.procedural);

    const root = new THREE.Group();
    root.name = 'car';
    root.add(object);
    root.updateMatrixWorld(true);

    const meshes = classifyCarParts(root, { atlas: def.atlas });
    recolorPaint(meshes, def);
    const materials = new Set(meshes.map((m) => m.material));
    const wheels = [];
    root.traverse((o) => /wheel/i.test(o.name) && wheels.push(o));
    const surface = collectTriangles(meshes);

    const bounds = new THREE.Box3().setFromObject(root);
    const volume = new DirtVolume(bounds, { seed: (Math.random() * 1e6) | 0 });
    const dirtiness = Math.random();
    volume.generate({ mud: 0.25 + dirtiness * 0.75, stain: Math.random() }, surfaceMask(volume, surface));
    materials.forEach((m) => applyDirtShader(m, volume.uniforms, { tuneParts: !!def.tune }));
    const samples = sampleReachable(surface);
    volume.setSurfaceSamples(samples.positions, samples.parts, samples.normals);
    // Kuş pisliği ve böcek lekesi her araçta yok; olmayan araçta "Kuş/Böcek" adımı paketten çıkar
    scatterSpots(volume, {
      bird: Math.random() < BIRD_CHANCE ? 1 + ((Math.random() * 4) | 0) : 0,
      bugs: Math.random() < BUG_CHANCE ? 25 + ((Math.random() * 35) | 0) : 0,
    });
    pkg = packageFor(pkg, volume.spotCenters.length > 0);
    const req = (id) => (pkg.steps.includes(id) ? 1 : 0);
    volume.uniforms.uReq.value.set(req('rims'), req('tires'), req('glass'), req('polish'));

    root.position.z = ENTRY_Z;
    // Shader'ları arka planda derle; derleme bitene kadar araç görünmez ve beklemede kalır
    root.visible = false;
    this.scene.add(root);

    this.car = {
      def,
      root,
      volume,
      meshes,
      materials,
      wheels,
      bounds,
      surface,
      package: pkg,
      latch: {},
      customer: CUSTOMERS[(Math.random() * CUSTOMERS.length) | 0],
      state: 'compiling',
      t: 0,
    };
    const car = this.car;
    const ready = () => {
      if (this.car !== car) return;
      root.visible = true;
      car.state = 'arriving';
      car.t = 0;
    };
    car.ready = this.renderer
      ? this.renderer.compileAsync(root, this.camera, this.scene).then(ready, ready)
      : Promise.resolve(ready());
    return car;
  }

  get isWashable() {
    return this.car?.state === 'washing';
  }

  /** Aracı teslim et: tam temizse kutlama → çıkış, eksikse doğrudan çıkış */
  complete(celebrate = true) {
    if (!this.car || this.car.state !== 'washing') return;
    this.car.state = celebrate ? 'celebrate' : 'leaving';
    this.car.t = 0;
  }

  update(dt, time) {
    const car = this.car;
    if (!car) return;
    const { root, volume } = car;
    volume.uniforms.uTime.value = time;

    car.t += dt;
    switch (car.state) {
      case 'compiling':
        break;
      case 'arriving': {
        const k = Math.min(1, car.t / 3.4);
        const e = easeOutCubic(k);
        const prevZ = root.position.z;
        root.position.z = ENTRY_Z + (PARK_Z - ENTRY_Z) * e;
        this.spinWheels(root.position.z - prevZ);
        // Fren yaparken hafif öne eğilme
        root.rotation.x = Math.sin(k * Math.PI) * 0.012 * (1 - k);
        if (k >= 1) {
          root.rotation.x = 0;
          car.state = 'washing';
          car.t = 0;
          this.callbacks.onArrived?.(car);
        }
        break;
      }
      case 'washing':
        volume.soak(dt, this.soakRate);
        volume.flowTick(dt);
        break;
      case 'celebrate': {
        // Işıltı bandı aracın üzerinden süpürülür
        const k = car.t / 1.7;
        volume.uniforms.uShine.value = -4 + k * 9;
        if (k >= 1) {
          volume.uniforms.uShine.value = -100;
          car.state = 'leaving';
          car.t = 0;
        }
        break;
      }
      case 'leaving': {
        const prevZ = root.position.z;
        root.position.z = PARK_Z + easeInQuad(car.t / 3.2) * (EXIT_Z - PARK_Z);
        this.spinWheels(root.position.z - prevZ);
        if (root.position.z >= EXIT_Z) {
          this.disposeCar();
          this.callbacks.onLeft?.();
          return;
        }
        break;
      }
    }

    // Kir tarayıcı vurgusu
    this.highlight = Math.max(0, this.highlight - dt * 0.35);
    volume.uniforms.uHighlight.value = Math.min(1, this.highlight);

    root.updateMatrixWorld(true);
    volume.uniforms.uWorldToCar.value.copy(root.matrixWorld).invert();
    volume.update();
  }

  spinWheels(dz) {
    // Kir araç çerçevesine sabit olduğundan sadece prosedürel tekerlek grupları döner
    for (const w of this.car.wheels) {
      if (w.isGroup) w.rotation.x += dz / 0.4;
    }
  }

  /** Kamera ışınıyla araç yüzeyini bul */
  raycast(raycaster) {
    if (!this.car) return null;
    const hit = raycaster.intersectObjects(this.car.meshes, false)[0];
    if (!hit) return null;
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    return { point: hit.point, normal, distance: hit.distance };
  }

  /** Dünya koordinatındaki noktada kir hacmini boya */
  paint(worldPoint, radius, brush, dt) {
    if (!this.isWashable) return null;
    const local = this.car.root.worldToLocal(_v.copy(worldPoint));
    return this.car.volume.paint(local, radius, brush, dt);
  }

  stats() {
    return this.car ? this.car.volume.stats() : null;
  }

  pulseHighlight() {
    this.highlight = 2.2;
  }

  /** Damla efekti için ıslak bir yüzey noktası (dünya koordinatı) */
  randomWetPoint(out) {
    if (!this.car || !this.car.volume.randomWetSample(out)) return false;
    out.applyMatrix4(this.car.root.matrixWorld);
    return true;
  }

  /**
   * Havlu gibi yüzeye serilen nesneler için hızlı ışın testi (dünya koordinatı).
   * Dönüş: çarpma uzaklığı ya da maxT
   */
  surfaceRay(origin, dir, maxT) {
    const car = this.car;
    if (!car) return maxT;
    const p = car.root.position;
    return firstHit(car.surface, origin.x - p.x, origin.y - p.y, origin.z - p.z, dir.x, dir.y, dir.z, maxT);
  }

  /** Oyuncu çarpışması için dünya uzayındaki kutu */
  worldBox(out) {
    if (!this.car) return null;
    return out.copy(this.car.bounds).translate(this.car.root.position);
  }

  /**
   * Debug: aktif araca kuş pisliği / böcek lekesi ekle. Paket "Kuş/Böcek" adımını içermiyorsa
   * köpükten sonraya eklenir. Dönüş: paket değişti mi (HUD adım listesi yenilenmeli)
   */
  addSpots(bird = 4, bugs = 40) {
    const car = this.car;
    if (!car || !scatterSpots(car.volume, { bird, bugs })) return false;
    const steps = car.package.steps;
    if (steps.includes('spots')) return false;
    steps.splice(Math.max(0, steps.indexOf('foam')) + 1, 0, 'spots');
    return true;
  }

  cleanAll() {
    this.car?.volume.cleanAll(this.car.package.steps.includes('polish'));
  }

  disposeCar() {
    const car = this.car;
    if (!car) return;
    this.scene.remove(car.root);
    car.volume.dispose();
    car.materials.forEach((m) => m.dispose());
    car.root.traverse((o) => {
      // Şablondan klonlanan geometriler paylaşılır; sadece prosedürel olanları at
      if (o.isMesh && !this.templates.get(car.def.id)) o.geometry.dispose();
    });
    this.car = null;
  }
}

// ------------------------------------------------------------------ yüzey yardımcıları

/** Tüm üçgenleri (araç-yerel koordinatta) düz diziye topla; alan ağırlıklı örnekleme için kümülatif alan. */
function collectTriangles(meshes) {
  const tris = [];
  const cum = [];
  const parts = [];
  let total = 0;
  for (const mesh of meshes) {
    // İç aksam: ne örneklenir ne de havlu ona değer
    if (mesh.geometry.attributes.aPart?.getX(0) === PART.INTERIOR) continue;
    const pos = mesh.geometry.attributes.position;
    const partAttr = mesh.geometry.attributes.aPart;
    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      _a.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      _b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
      _c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
      _ab.subVectors(_b, _a);
      _ac.subVectors(_c, _a);
      const area = _n.crossVectors(_ab, _ac).length() * 0.5;
      if (area < 1e-6) continue;
      tris.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
      parts.push(partAttr ? partAttr.getX(index ? index.getX(i) : i) : 0);
      total += area;
      cum.push(total);
    }
  }
  const tf = new Float32Array(tris);
  // Üçgen başına AABB (ışın testinde hızlı eleme için)
  const boxes = new Float32Array((tf.length / 9) * 6);
  for (let t = 0, b = 0; t < tf.length; t += 9, b += 6) {
    boxes[b] = Math.min(tf[t], tf[t + 3], tf[t + 6]);
    boxes[b + 1] = Math.min(tf[t + 1], tf[t + 4], tf[t + 7]);
    boxes[b + 2] = Math.min(tf[t + 2], tf[t + 5], tf[t + 8]);
    boxes[b + 3] = Math.max(tf[t], tf[t + 3], tf[t + 6]);
    boxes[b + 4] = Math.max(tf[t + 1], tf[t + 4], tf[t + 7]);
    boxes[b + 5] = Math.max(tf[t + 2], tf[t + 5], tf[t + 8]);
  }
  return { tris: tf, boxes, parts: new Uint8Array(parts), cum: new Float32Array(cum), total };
}

/** Yüzeyde rastgele nokta (alan ağırlıklı). Sonuç _v (nokta) ve _n (normal) içinde. */
function randomSurfacePoint({ tris, cum, total, parts }) {
  const r = Math.random() * total;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  const t = lo * 9;
  _part = parts ? parts[lo] : 0;
  _a.set(tris[t], tris[t + 1], tris[t + 2]);
  _ab.set(tris[t + 3] - _a.x, tris[t + 4] - _a.y, tris[t + 5] - _a.z);
  _ac.set(tris[t + 6] - _a.x, tris[t + 7] - _a.y, tris[t + 8] - _a.z);
  let u = Math.random(), v = Math.random();
  if (u + v > 1) { u = 1 - u; v = 1 - v; }
  _n.crossVectors(_ab, _ac).normalize();
  _v.copy(_a).addScaledVector(_ab, u).addScaledVector(_ac, v);
}

/** Möller–Trumbore, çift taraflı: ışının ilk çarptığı üçgene uzaklık (yoksa Infinity) */
function firstHit({ tris, boxes }, ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT;
  const ex = ox + dx * maxT, ey = oy + dy * maxT, ez = oz + dz * maxT;
  const minX = Math.min(ox, ex), minY = Math.min(oy, ey), minZ = Math.min(oz, ez);
  const maxX = Math.max(ox, ex), maxY = Math.max(oy, ey), maxZ = Math.max(oz, ez);
  for (let t = 0, b = 0; t < tris.length; t += 9, b += 6) {
    if (boxes[b] > maxX || boxes[b + 3] < minX || boxes[b + 1] > maxY || boxes[b + 4] < minY || boxes[b + 2] > maxZ || boxes[b + 5] < minZ) continue;
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2];
    const e1x = tris[t + 3] - ax, e1y = tris[t + 4] - ay, e1z = tris[t + 5] - az;
    const e2x = tris[t + 6] - ax, e2y = tris[t + 7] - ay, e2z = tris[t + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-9 && det < 1e-9) continue;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (d > 1e-4 && d < best) best = d;
  }
  return best;
}

/**
 * Noktasal kirleri erişilebilir yüzey örneklerinin üstüne serp:
 *   kuş pisliği — üst yüzeyler (kaput, tavan, bagaj): yukarı bakan boya
 *   böcek lekesi — ön yüz (tampon, ön cam, aynalar): öne bakan, aracın ön yarısındaki yüzeyler
 * Dönüş: eklenen leke sayısı
 */
function scatterSpots(volume, { bird = 0, bugs = 0 }) {
  const pos = volume.samplePos, nrm = volume.sampleNormals, parts = volume.sampleParts;
  if (!pos || !nrm) return 0;
  const { min, size } = volume;
  const birdAt = [], bugAt = [];
  for (let s = 0; s < parts.length; s++) {
    const part = parts[s];
    const ny = nrm[s * 3 + 1] / 127, nz = nrm[s * 3 + 2] / 127;
    const h = (pos[s * 3 + 1] - min.y) / size.y;
    const zn = (pos[s * 3 + 2] - min.z) / size.z; // 0 arka, 1 ön
    if (part === PART.PAINT && ny > 0.8 && h > 0.4) birdAt.push(s);
    if ((part === PART.PAINT || part === PART.GLASS || part === PART.TRIM) && nz > 0.4 && zn > 0.55) bugAt.push(s);
  }
  let added = 0;
  for (let k = 0; k < bird && birdAt.length; k++, added++) {
    _sp.fromArray(pos, birdAt[(Math.random() * birdAt.length) | 0] * 3);
    volume.addSpot(_sp, 0.05 + Math.random() * 0.04, 0, 1);
    // Çevresine birkaç küçük sıçrama (haritada ayrı leke sayılmaz)
    const extra = 1 + ((Math.random() * 3) | 0);
    for (let e = 0; e < extra; e++) {
      _sp2.set(_sp.x + (Math.random() - 0.5) * 0.18, _sp.y, _sp.z + (Math.random() - 0.5) * 0.18);
      volume.addSpot(_sp2, 0.03, 0, 0.85, false);
    }
  }
  for (let k = 0; k < bugs && bugAt.length; k++, added++) {
    _sp.fromArray(pos, bugAt[(Math.random() * bugAt.length) | 0] * 3);
    volume.addSpot(_sp, 0.03 + Math.random() * 0.035, 1, 0.6 + Math.random() * 0.4);
  }
  return added;
}

/** Kir üretimini hızlandırmak için yüzeye yakın voxel maskesi */
function surfaceMask(volume, surface) {
  const { nx, ny, nz } = volume;
  const hit = new Uint8Array(nx * ny * nz);
  const count = Math.min(80000, Math.ceil((surface.total / (volume.voxel * volume.voxel)) * 2.5));
  const marked = [];
  for (let s = 0; s < count; s++) {
    randomSurfacePoint(surface);
    const i = volume.voxelIndexAt(_v.x, _v.y, _v.z);
    if (!hit[i]) { hit[i] = 1; marked.push(i); }
  }
  const mask = new Uint8Array(nx * ny * nz);
  const R = 2;
  for (const i of marked) {
    const ix = i % nx, iy = ((i / nx) | 0) % ny, iz = (i / (nx * ny)) | 0;
    for (let z = Math.max(0, iz - R); z <= Math.min(nz - 1, iz + R); z++)
      for (let y = Math.max(0, iy - R); y <= Math.min(ny - 1, iy + R); y++)
        for (let x = Math.max(0, ix - R); x <= Math.min(nx - 1, ix + R); x++) mask[x + nx * (y + ny * z)] = 1;
  }
  return mask;
}

/** Oyuncunun erişebileceği yüzey noktaları ve parçaları (ilerleme yüzdesi bunlardan hesaplanır) */
function sampleReachable(surface) {
  const out = [];
  const outParts = [];
  const outNormals = [];
  const attempts = SURFACE_SAMPLES * 1.7;
  for (let s = 0; s < attempts && out.length < SURFACE_SAMPLES * 3; s++) {
    randomSurfacePoint(surface);
    // Altta kalan / tabana bakan yüzeyler sayılmaz
    if (_n.y < -0.35 || _v.y < 0.08) continue;
    // Göz hizasının üstündeki yukarı bakan yüzeyleri (yüksek tavanlar) oyuncu göremez
    if (_v.y > PLAYER_EYE - 0.12 && _n.y > 0.45) continue;
    // Erişilebilirlik: normal yönünden bakınca ilk çarpılan yer bu nokta mı?
    const ox = _v.x + _n.x * REACH_OFFSET, oy = _v.y + _n.y * REACH_OFFSET, oz = _v.z + _n.z * REACH_OFFSET;
    const d = firstHit(surface, ox, oy, oz, -_n.x, -_n.y, -_n.z, REACH_OFFSET + 0.1);
    if (REACH_OFFSET - d > 0.05) continue;
    out.push(_v.x, _v.y, _v.z);
    outParts.push(_part);
    outNormals.push(Math.round(_n.x * 127), Math.round(_n.y * 127), Math.round(_n.z * 127));
  }
  return { positions: new Float32Array(out), parts: new Uint8Array(outParts), normals: new Int8Array(outNormals) };
}
