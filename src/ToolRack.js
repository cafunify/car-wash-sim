import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TOOL_DEFS, buildToolModel } from './Tools.js';

/** Raf yerleşimi (rafın yerel uzayında; +Z oyuncuya bakar) */
const SLOTS = {
  hose: { x: -0.95, y: 1.72, rot: [0, Math.PI / 2, 0], scale: 1.1 },
  foam: { x: -0.3, y: 1.72, rot: [0, Math.PI / 2, 0], scale: 1.1 },
  glass: { x: 0.22, y: 1.5, rot: [0, 0, 0], scale: 1.5 },
  polish: { x: 0.9, y: 1.48, rot: [0, 0.4, 0], scale: 1.4 },
  sponge: { x: -1.05, y: 0.935, rot: [0, 0.3, 0], scale: 1.5 },
  towel: { x: -0.42, y: 0.935, rot: [0, -0.2, 0], scale: 1.4 },
  rim: { x: 0.22, y: 0.935, rot: [0, 0.5, 0], scale: 1.4 },
  tire: { x: 0.85, y: 0.935, rot: [0, 0, 0], scale: 1.6 },
};

const INTERACT_DIST = 3.2;

function labelTexture(title, sub, locked) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 72;
  const g = c.getContext('2d');
  g.fillStyle = locked ? '#2a2d34' : '#f4f5f7';
  g.beginPath();
  g.roundRect(2, 2, 252, 68, 12);
  g.fill();
  g.textAlign = 'center';
  g.fillStyle = locked ? '#ffd35a' : '#1b1e24';
  g.font = '700 28px Rubik, sans-serif';
  g.fillText(title, 128, 32);
  g.font = '500 20px Rubik, sans-serif';
  g.fillStyle = locked ? '#c9ccd3' : '#5b6270';
  g.fillText(sub, 128, 58);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function pegboardTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f47';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1c1f24';
  for (let y = 12; y < 256; y += 24) for (let x = 12; x < 512; x += 24) {
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.2);
  return t;
}

function terminalTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 180;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 180);
  grd.addColorStop(0, '#0b2a3d');
  grd.addColorStop(1, '#081520');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 180);
  g.textAlign = 'center';
  g.fillStyle = '#35d0ff';
  g.font = '800 40px Rubik, sans-serif';
  g.fillText('MAĞAZA', 128, 78);
  g.fillStyle = '#ffd35a';
  g.font = '600 22px Rubik, sans-serif';
  g.fillText('Yükseltmeler · Ekipman', 128, 116);
  g.fillStyle = '#9fb3c8';
  g.font = '500 18px Rubik, sans-serif';
  g.fillText('[E] veya [Tab]', 128, 150);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Aletlerin asılı durduğu raf + mağaza terminali.
 * Oyuncu rafa bakıp E ile alet alır/bırakır.
 */
export class ToolRack {
  constructor(scene, { tools, economy, position = new THREE.Vector3(5.75, 0, -1.2), rotationY = -Math.PI / 2 }) {
    this.tools = tools;
    this.economy = economy;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = rotationY;
    scene.add(this.group);

    this.hitboxes = [];
    this.slots = {};
    this.buildFrame();
    this.buildSlots();
    this.buildTerminal();

    this.group.updateMatrixWorld(true);
    this.lamp.lookAt(this.group.localToWorld(new THREE.Vector3(0, 0.9, 0.05)));
    this.collider = new THREE.Box3().setFromObject(this.frame).expandByScalar(0.05);
    this.refresh();
  }

  buildFrame() {
    const f = (this.frame = new THREE.Group());
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.35, metalness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.6, metalness: 0.4 });
    const board = new THREE.MeshStandardMaterial({ map: pegboardTexture(), roughness: 0.8 });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      f.add(m);
      return m;
    };
    // Dikmeler, delikli pano, raf, taban
    for (const x of [-1.5, 1.5]) add(new THREE.BoxGeometry(0.07, 2.2, 0.07), steel, x, 1.1, -0.05);
    add(new THREE.BoxGeometry(3.0, 1.35, 0.04), board, 0, 1.45, -0.08);
    add(new THREE.BoxGeometry(3.06, 0.05, 0.5), steel, 0, 0.9, 0.12);
    add(new THREE.BoxGeometry(3.06, 0.05, 0.5), steel, 0, 0.1, 0.12);
    add(new THREE.BoxGeometry(3.1, 0.12, 0.08), dark, 0, 2.18, -0.05);
    // Üst LED aydınlatma: panoyu ve rafı aydınlatır
    const led = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.3) }));
    led.position.set(0, 2.12, 0.08);
    f.add(led);
    this.lamp = new THREE.RectAreaLight(0xf2f6ff, 7, 2.8, 0.25);
    this.lamp.position.set(0, 2.1, 0.35);
    this.group.add(this.lamp);
    // Alt rafta yedek şişeler ve kova
    const cols = [0xff6ad5, 0x35d0ff, 0xffd35a, 0x3ee48a, 0xffffff];
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.22, 0.07, 2, 0.02),
        new THREE.MeshPhysicalMaterial({ color: cols[i % cols.length], roughness: 0.25, clearcoat: 1 }));
      b.position.set(-1.3 + i * 0.12, 0.235, 0.05 + (i % 2) * 0.08);
      b.castShadow = true;
      f.add(b);
    }
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.3, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2f86ff, roughness: 0.5, side: THREE.DoubleSide }));
    bucket.position.set(0.9, 0.275, 0.12);
    const suds = new THREE.Mesh(new THREE.CircleGeometry(0.165, 20), new THREE.MeshStandardMaterial({ color: 0xf4f7ff, roughness: 0.9 }));
    suds.rotation.x = -Math.PI / 2;
    suds.position.set(0.9, 0.39, 0.12);
    f.add(bucket, suds);
    // Basınçlı yıkama makinesi (sol yanda)
    const machine = new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.55, 0.4, 3, 0.05),
      new THREE.MeshPhysicalMaterial({ color: 0xd42a2a, roughness: 0.35, clearcoat: 1 }));
    machine.position.set(-1.85, 0.3, 0.15);
    machine.castShadow = true;
    const reel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 10, 24), dark);
    reel.position.set(-1.85, 0.72, 0.15);
    reel.rotation.y = Math.PI / 2;
    f.add(machine, reel);
    this.group.add(f);
  }

  buildSlots() {
    TOOL_DEFS.forEach((def, index) => {
      const s = SLOTS[def.id];
      const slot = new THREE.Group();
      slot.position.set(s.x, s.y, 0.06);
      const model = buildToolModel(def.id);
      model.position.set(0, 0, 0);
      model.rotation.set(...s.rot);
      model.scale.multiplyScalar(s.scale);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.material.userData.base = { opacity: o.material.opacity, transparent: o.material.transparent };
      });
      slot.add(model);

      // Askı çengeli (üst sıra) — raf tabanı alt sırada zaten var
      if (s.y > 1.2) {
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.3, metalness: 1 }));
        hook.position.set(0, 0.12, -0.08);
        hook.rotation.z = Math.PI;
        slot.add(hook);
      }

      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.124), new THREE.MeshBasicMaterial({ transparent: true }));
      label.position.set(0, s.y > 1.2 ? -0.42 : 0.26, -0.055);
      if (s.y < 1.2) label.position.set(0, -0.09, 0.4);
      if (s.y < 1.2) label.rotation.x = -0.5;
      slot.add(label);

      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.45), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, s.y > 1.2 ? -0.1 : 0.12, 0.1);
      hit.userData.rackTool = index;
      slot.add(hit);
      this.hitboxes.push(hit);

      this.group.add(slot);
      this.slots[def.id] = { model, label, index, lastKey: '' };
    });
  }

  buildTerminal() {
    const t = new THREE.Group();
    t.position.set(1.85, 0, 0.1);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.4, metalness: 0.6 }));
    post.position.y = 0.6;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.04, 20),
      new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.4, metalness: 0.6 }));
    base.position.y = 0.02;
    const screen = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.36, 0.04, 3, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.3, metalness: 0.5 }));
    screen.position.y = 1.32;
    screen.rotation.x = -0.35;
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.32),
      new THREE.MeshBasicMaterial({ map: terminalTexture(), color: new THREE.Color(1.3, 1.3, 1.3) }));
    display.position.set(0, 1.32 + 0.0075, 0.021);
    display.rotation.x = -0.35;
    display.translateZ(0.001);
    t.add(post, base, screen, display);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.3;
    hit.userData.rackShop = true;
    t.add(hit);
    this.hitboxes.push(hit);
    this.group.add(t);
  }

  /** Raftaki görüntüleri güncelle: elde olan gizli, kilitli olan etiketli */
  refresh() {
    for (const def of TOOL_DEFS) {
      const slot = this.slots[def.id];
      const locked = this.tools.isLocked(slot.index);
      const held = this.tools.index === slot.index;
      slot.model.visible = !held;
      slot.model.traverse((o) => {
        if (!o.isMesh) return;
        const base = o.material.userData.base;
        o.material.transparent = locked || base.transparent;
        o.material.opacity = locked ? 0.25 : base.opacity;
      });
      const cost = locked ? this.economy.costOf(def.unlock) : 0;
      const sub = held ? 'Elinde' : locked ? `🔒 $${cost} · Mağaza` : '[E] Al';
      const key = `${sub}`;
      if (key !== slot.lastKey) {
        slot.label.material.map?.dispose();
        slot.label.material.map = labelTexture(def.short, sub, locked);
        slot.label.material.needsUpdate = true;
        slot.lastKey = key;
      }
    }
  }

  /** Oyuncunun baktığı raf öğesi: { tool: index } | { shop: true } | null */
  raycast(raycaster) {
    const hit = raycaster.intersectObjects(this.hitboxes, false)[0];
    if (!hit || hit.distance > INTERACT_DIST) return null;
    if (hit.object.userData.rackShop) return { shop: true };
    return { tool: hit.object.userData.rackTool };
  }
}
