import * as THREE from 'three';

const NX = 9; // bez ızgarası (genişlik yönünde köşe sayısı)
const NY = 7;
const W = 0.5; // metre
const H = 0.36;
const LIFT = 0.25; // ışının yüzeyden ne kadar dışarıdan başlayacağı
const GAP = 0.006; // bezin boyadan uzaklığı (z-fighting olmasın)

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

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
    }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.local = [];
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) this.local.push([(i / (NX - 1) - 0.5) * W, (j / (NY - 1) - 0.5) * H]);
    this.angle = 0;
  }

  hide() {
    this.mesh.visible = false;
  }

  /** hit: {point, normal} — bezin merkezi ve yönü; spin: ovalama sırasında hafif dönüş */
  place(hit, spin, time) {
    const n = hit.normal;
    _t1.crossVectors(n, Math.abs(n.y) > 0.9 ? _t2.set(1, 0, 0) : UP).normalize();
    _t2.crossVectors(n, _t1).normalize();
    // Ovalarken bez hafifçe döner
    this.angle = spin * 0.35;
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);

    const pos = this.mesh.geometry.attributes.position;
    for (let k = 0; k < this.local.length; k++) {
      const [lu, lv] = this.local[k];
      const u = lu * ca - lv * sa;
      const v = lu * sa + lv * ca;
      _p.copy(hit.point).addScaledVector(_t1, u).addScaledVector(_t2, v);
      _o.copy(_p).addScaledVector(n, LIFT);
      _d.copy(n).negate();
      const t = this.cars.surfaceRay(_o, _d, LIFT * 2.4);
      if (t < LIFT * 2.4) {
        _p.copy(_o).addScaledVector(_d, t - GAP);
      } else {
        // Yüzeyin dışına taşan kenar: yerçekimiyle sarkar ve hafif dalgalanır
        const edge = Math.hypot(lu / W, lv / H);
        _p.addScaledVector(UP, -0.12 * edge - 0.02).addScaledVector(n, -0.02);
        _p.y += Math.sin(time * 3 + lu * 20) * 0.004;
      }
      pos.setXYZ(k, _p.x, _p.y, _p.z);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.visible = true;
  }
}
