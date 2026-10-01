import * as THREE from 'three';

/**
 * Önce / sonra fotoğrafı: aracı sabit bir 3/4 açıdan (raf karşı tarafta, sol önden)
 * çizip küçük bir görsele çevirir. Aynı karede ana çizimden önce çağrılır; WebGL tamponu
 * o JS görevi bitene kadar geçerli olduğu için preserveDrawingBuffer gerekmez.
 */
export class Snapshot {
  constructor(renderer, scene, { width = 360, height = 220 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.width = width;
    this.height = height;
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 60);
  }

  /** hide: fotoğrafa girmemesi gereken nesneler (el modeli, partiküller). Dönüş: data URL */
  capture(car, hide = []) {
    if (!car) return null;
    const r = this.renderer;
    const box = new THREE.Box3().copy(car.bounds).translate(car.root.position);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(size.x, size.z) * 1.05 + 2.2;
    this.camera.position.set(center.x - dist * 0.62, center.y + size.y * 0.55 + 0.5, center.z + dist * 0.78);
    this.camera.lookAt(center.x, center.y - size.y * 0.1, center.z);

    const wasVisible = hide.map((o) => o?.visible);
    hide.forEach((o) => o && (o.visible = false));
    const prevTarget = r.getRenderTarget();
    const canvas = r.domElement;
    const w = canvas.width, h = canvas.height;
    // Fotoğraf oranında bir alanı çiz, sonra oradan kırp
    const vh = Math.min(h, Math.round(w * (this.height / this.width)));
    const vw = Math.round(vh * (this.width / this.height));
    const pr = r.getPixelRatio();
    r.setRenderTarget(null);
    r.setViewport(0, 0, vw / pr, vh / pr);
    r.setScissor(0, 0, vw / pr, vh / pr);
    r.setScissorTest(true);
    r.render(this.scene, this.camera);

    const out = document.createElement('canvas');
    out.width = this.width;
    out.height = this.height;
    // WebGL orijini sol altta, 2D tuvalde sol üstte
    out.getContext('2d').drawImage(canvas, 0, h - vh, vw, vh, 0, 0, this.width, this.height);

    r.setScissorTest(false);
    r.setViewport(0, 0, w / pr, h / pr);
    r.setRenderTarget(prevTarget);
    hide.forEach((o, i) => o && (o.visible = wasVisible[i]));
    try {
      return out.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    }
  }
}
