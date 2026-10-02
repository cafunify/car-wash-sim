import * as THREE from 'three';

const NX = 11; // bez ızgarası (genişlik yönünde köşe sayısı)
const NY = 8;
const W = 0.5; // metre
const H = 0.36;
const LIFT = 0.25; // ışının yüzeyden ne kadar dışarıdan başlayacağı
const GAP = 0.011; // bezin boyadan uzaklığı (kavisli yüzeyde bile içeri girmesin)

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _p = new THREE.Vector3();
const _sweep = new THREE.Vector3();
const _v = new THREE.Vector3();
const _vt = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const REACH = 0.25 * 3.2; // ışın erimi: kıvrımlı yüzeyde de bezin oturması için geniş
const DRAPE = 0.012; // yüzey bitince bezin komşu köşeye göre sarkması
const SWEEP = 0.07; // süpürme genliği (m)

function microfiberTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3aa6f0';
  g.fillRect(0, 0, 256, 256);
  // Mikrofiber doku: ince lif gürültüsü
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(20,90,160,0.35)' : 'rgba(150,215,255,0.3)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1);
  }
  // Dikişli kenar
  g.strokeStyle = '#1f6fb8';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 246);
  g.setLineDash([6, 5]);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2;
  g.strokeRect(14, 14, 228, 228);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Araca serilen kurulama havlusu: her karede köşeler araç yüzeyine ışın atılarak
 * kaportanın kıvrımlarına oturtulur; kenarda yüzey yoksa bez sarkar.
 */
export class ClothTowel {
  constructor(scene, carManager) {
    this.cars = carManager;
    const geo = new THREE.PlaneGeometry(W, H, NX - 1, NY - 1);
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: microfiberTexture(), roughness: 1, metalness: 0, side: THREE.DoubleSide,
      // Derinlik ofseti: bez her zaman kaportanın bir tık önünde çizilir
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.local = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) this.local.push([(i / (NX - 1) - 0.5) * W, (j / (NY - 1) - 0.5) * H]);
    this.angle = 0;
    this.shown = false;
    this.center = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.settle = 1;
    const nv = NX * NY;
    this.heights = new Float32Array(nv);
    this.smooth = new Float32Array(nv);
    this.base = new Float32Array(nv * 3);
    this.ok = new Uint8Array(nv);
  }

  hide() {
    this.mesh.visible = false;
    this.shown = false;
  }

  /**
   * hit: {point, normal} — bezin merkezi ve yönü; phase: ovalama fazı (scrubPhase).
   * Bez eli takip eder: ilk değişte elden yüzeye iner, ovalarken ileri geri süpürür,
   * hareket yönünün arkasındaki kenar sürüklenip kalkar ve kıvrılır.
   */
  place(hit, phase, time, dt = 0.016) {
    const n = hit.normal;
    _t1.crossVectors(n, Math.abs(n.y) > 0.9 ? _t2.set(1, 0, 0) : UP).normalize();
    _t2.crossVectors(n, _t1).normalize();

    // Süpürme: yüzey boyunca ileri geri (t1) ve hafif yan kayma (t2)
    _sweep.copy(hit.point)
      .addScaledVector(_t1, Math.sin(phase) * SWEEP)
      .addScaledVector(_t2, Math.sin(phase * 0.5) * SWEEP * 0.45);

    if (!this.shown) {
      this.center.copy(_sweep);
      this.vel.set(0, 0, 0);
      this.settle = 0;
      this.shown = true;
    }
    // Merkez yumuşakça izler; hız sürüklenme etkisini besler
    const prevX = this.center.x, prevY = this.center.y, prevZ = this.center.z;
    this.center.lerp(_sweep, 1 - Math.exp(-dt * 22));
    const inv = 1 / Math.max(dt, 1e-3);
    _v.set((this.center.x - prevX) * inv, (this.center.y - prevY) * inv, (this.center.z - prevZ) * inv);
    this.vel.lerp(_v, 1 - Math.exp(-dt * 14));
    this.settle = Math.min(1, this.settle + dt * 5);

    // Hızın yüzeye teğet bileşeni
    _vt.copy(this.vel).addScaledVector(n, -this.vel.dot(n));
    const speed = _vt.length();
    if (speed > 1e-3) _vt.multiplyScalar(1 / speed);
    const drag = Math.min(speed * 0.06, 0.05);
    const air = 1 - this.settle * this.settle; // inerken bez havada ve eğik

    // Bez ovalama yönünde hafifçe döner
    this.angle = Math.sin(phase) * 0.25;
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);

    const pos = this.mesh.geometry.attributes.position;
    const hs = this.heights, ok = this.ok, base = this.base;
    // 1) Her köşe için düzlem noktası ve yüzeyin üstündeki yüksekliği (ışın isabeti)
    for (let k = 0; k < this.local.length; k++) {
      const [lu, lv] = this.local[k];
      const u = lu * ca - lv * sa;
      const v = lu * sa + lv * ca;
      _p.copy(this.center).addScaledVector(_t1, u).addScaledVector(_t2, v);
      base[k * 3] = _p.x; base[k * 3 + 1] = _p.y; base[k * 3 + 2] = _p.z;
      _o.copy(_p).addScaledVector(n, LIFT);
      _d.copy(n).negate();
      const t = this.cars.surfaceRay(_o, _d, REACH);
      ok[k] = t < REACH ? 1 : 0;
      hs[k] = ok[k] ? LIFT - t + GAP : 0;
    }
    // 2) Yüzey bulamayan köşeler (kenar, kıvrım) komşularından yükseklik alıp hafifçe sarkar;
    //    böylece bez ayrı parçalara bölünmez, sürekli bir örtü olarak kalır
    for (let pass = 0; pass < NX + NY; pass++) {
      let missing = 0;
      for (let k = 0; k < hs.length; k++) {
        if (ok[k]) continue;
        const i = k % NX, j = (k / NX) | 0;
        let sum = 0, cnt = 0;
        for (let d = 0; d < 4; d++) {
          const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
          const q = nj * NX + ni;
          if (ok[q] === 1) { sum += hs[q]; cnt++; }
        }
        if (cnt) { hs[k] = sum / cnt - DRAPE; ok[k] = 2; } else missing++;
      }
      for (let k = 0; k < hs.length; k++) if (ok[k] === 2) ok[k] = 3; // bu turda dolanlar sonraki turda kaynak olur
      for (let k = 0; k < hs.length; k++) if (ok[k] === 3) ok[k] = 1;
      if (!missing) break;
    }
    // 3) Bir tur yumuşatma: isabet alan köşeler yalnızca yukarı çıkabilir (boyaya girmez)
    for (let k = 0; k < hs.length; k++) {
      const i = k % NX, j = (k / NX) | 0;
      let sum = hs[k] * 2, cnt = 2;
      if (i > 0) { sum += hs[k - 1]; cnt++; }
      if (i < NX - 1) { sum += hs[k + 1]; cnt++; }
      if (j > 0) { sum += hs[k - NX]; cnt++; }
      if (j < NY - 1) { sum += hs[k + NX]; cnt++; }
      this.smooth[k] = Math.max(hs[k], sum / cnt);
    }
    for (let k = 0; k < this.local.length; k++) {
      const [lu, lv] = this.local[k];
      const u = lu * ca - lv * sa;
      const v = lu * sa + lv * ca;
      let lift = this.smooth[k];
      // Sürüklenme: hareketin arkasında kalan kenar kalkar, dalgalanır
      if (speed > 1e-3) {
        const trail = Math.max(0, -(u * _vt.dot(_t1) + v * _vt.dot(_t2)) / (W * 0.5));
        lift += trail * trail * drag * (1 + 0.35 * Math.sin(time * 28 + lu * 26 + lv * 17));
      }
      // Elden iniş: köşeler farklı zamanda yere değer
      lift += air * (0.1 + (lu / W + 0.5) * 0.06);
      _p.set(base[k * 3], base[k * 3 + 1], base[k * 3 + 2]).addScaledVector(n, lift);
      pos.setXYZ(k, _p.x, _p.y, _p.z);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.visible = true;
  }
}
