import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Aletler. `unlock` mağazadaki ekipman anahtarıdır (null = başlangıçta var).
 * kind: 'spray' (uzaktan püskürtür) | 'hand' (yüzeye değip ovalar)
 */
export const TOOL_DEFS = [
  { id: 'hose', name: 'Basınçlı Yıkama Tabancası', short: 'Hortum', icon: '💦', range: 7, unlock: null, kind: 'spray' },
  { id: 'foam', name: 'Köpük Tabancası', short: 'Köpük', icon: '🫧', range: 4.5, unlock: 'foam', kind: 'spray' },
  { id: 'sponge', name: 'Yıkama Süngeri', short: 'Sünger', icon: '🧽', range: 2.4, unlock: null, kind: 'hand' },
  { id: 'towel', name: 'Kurulama Havlusu', short: 'Havlu', icon: '🧻', range: 2.4, unlock: null, kind: 'hand' },
  { id: 'rim', name: 'Jant Temizleyici', short: 'Jant', icon: '🛞', range: 2.4, unlock: 'rimcleaner', kind: 'hand' },
  { id: 'tire', name: 'Lastik Parlatıcı', short: 'Lastik', icon: '⚫', range: 2.4, unlock: 'tireshine', kind: 'hand' },
  { id: 'glass', name: 'Cam Temizleyici', short: 'Cam', icon: '🪟', range: 2.4, unlock: 'glasscleaner', kind: 'spray' },
  { id: 'polish', name: 'Cila Makinesi', short: 'Cila', icon: '✨', range: 2.4, unlock: 'polisher', kind: 'hand' },
];

const CENTER = new THREE.Vector2(0, 0);
const UP = new THREE.Vector3(0, 1, 0);

const _tip = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();

const LOOPS = ['water', 'splash', 'foam', 'sponge', 'towel', 'brush', 'pad', 'spray', 'polisher'];

/**
 * Oyuncunun elindeki alet: davranış (kir hacmine fırça) + birinci şahıs model.
 */
export class Tools {
  constructor({ camera, carManager, effects, audio, economy, hud }) {
    Object.assign(this, { camera, carManager, effects, audio, economy, hud });
    this.index = -1; // -1 = eller boş
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 30;
    this.switchT = 1;
    this.scrubPhase = 0;
    this.hintCooldown = 0;
    this.shownHints = new Set();
    this.recoil = 0;
    this.onChange = null;

    this.view = new THREE.Group();
    camera.add(this.view);
    this.models = TOOL_DEFS.map((d) => {
      const m = buildToolModel(d.id);
      m.visible = false;
      m.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      this.view.add(m);
      return m;
    });
    this.handPos = new THREE.Vector3();
    this.handQuat = new THREE.Quaternion();
  }

  get def() {
    return TOOL_DEFS[this.index] || null;
  }

  isLocked(i) {
    const u = TOOL_DEFS[i].unlock;
    return !!u && this.economy.level(u) === 0;
  }

  /** Raftan bir alet al (elindekini rafa bırakır) */
  pickUp(i) {
    if (i === this.index || i < 0 || i >= TOOL_DEFS.length) return false;
    if (this.isLocked(i)) {
      this.hud.hint(`${TOOL_DEFS[i].name} kilitli — Mağaza (Tab)`);
      this.audio.error();
      return false;
    }
    this.index = i;
    this.switchT = 0;
    this.models.forEach((m, k) => (m.visible = k === i));
    const m = this.models[i];
    this.handPos.copy(m.userData.rest).add(_t1.set(0, -0.4, 0));
    this.handQuat.copy(m.userData.restQuat);
    this.audio.pickup();
    this.onChange?.(this.index);
    return true;
  }

  /** Elindekini rafa geri koy */
  putDown() {
    if (this.index < 0) return false;
    this.index = -1;
    this.models.forEach((m) => (m.visible = false));
    for (const k of LOOPS) this.audio.setLoop(k, 0);
    this.audio.putdown();
    this.onChange?.(this.index);
    return true;
  }

  hintOnce(key, text) {
    if (this.hintCooldown > 0) return;
    this.hud.hint(text);
    this.hintCooldown = 3;
    this.shownHints.add(key);
  }

  // ---------------------------------------------------------------- güncelle
  update(dt, { firing, mouseSpeed, moving, time, aim }) {
    this.hintCooldown -= dt;
    this.switchT = Math.min(1, this.switchT + dt * 3.5);

    this.raycaster.setFromCamera(aim || CENTER, this.camera);
    const def = this.def;
    const hit = def ? this.carManager.raycast(this.raycaster) : null;
    const inRange = !!hit && hit.distance <= def.range;
    this.hud.setCrosshair(!hit ? 'none' : inRange ? 'target' : 'far');

    const loops = {};
    for (const k of LOOPS) loops[k] = 0;
    if (!def) {
      for (const k of LOOPS) this.audio.setLoop(k, 0);
      return;
    }

    const active = firing && this.switchT > 0.6;
    const washable = this.carManager.isWashable;
    const scrub = Math.min(1, mouseSpeed / 350);
    const f = 0.45 + 0.55 * scrub; // ovalama çarpanı
    const model = this.models[this.index];
    const tip = model.userData.tip;
    const touching = active && inRange && washable;
    let bubbleRate = 0;

    const aimFrom = (dist) => {
      tip.getWorldPosition(_tip);
      if (hit && inRange) _target.copy(hit.point);
      else _target.copy(this.raycaster.ray.direction).multiplyScalar(dist).add(this.raycaster.ray.origin);
      _dir.subVectors(_target, _tip).normalize();
    };

    switch (def.id) {
      case 'hose': {
        if (!active) break;
        const power = this.economy.hosePower;
        aimFrom(10);
        this.effects.sprayWater(_tip, _dir, inRange ? hit : null, power, dt);
        this.recoil = 1;
        loops.water = 0.8;
        if (inRange && washable) {
          loops.splash = 1;
          const near = 1 - Math.min(0.55, Math.max(0, (hit.distance - 1.2) / def.range));
          const radius = this.economy.hoseRadius * (1 + hit.distance * 0.05);
          this.carManager.paint(hit.point, radius, { mud: 1.2 * power * near, stain: 0.05 * power, wet: 1.3, foam: -1.8 * power }, dt);
        }
        break;
      }
      case 'foam': {
        if (!active) break;
        aimFrom(5);
        this.effects.sprayFoam(_tip, _dir, inRange ? hit : null, dt);
        this.recoil = 0.5;
        loops.foam = 1;
        bubbleRate = 0.6;
        if (inRange && washable) this.carManager.paint(hit.point, 0.5, { foam: 2.4, wet: 0.35 }, dt);
        break;
      }
      case 'sponge': {
        if (!touching) break;
        const res = this.carManager.paint(hit.point, this.economy.spongeRadius, {
          stain: 1.0 * this.economy.spongeSpeed * f, mud: 0.07, wet: 0.3, foam: -0.3, foamBoost: 2,
        }, dt);
        this.scrubPhase += dt * (4 + scrub * 16);
        loops.sponge = (0.35 + 0.65 * scrub) * (0.6 + 0.4 * Math.abs(Math.sin(this.scrubPhase * 0.5)));
        if (res) {
          this.effects.bubbles(hit.point, hit.normal, 0.5 + res.foam * 2);
          bubbleRate = res.foam * 0.8 * (0.4 + scrub);
          if (res.mud > 0.45) this.hintOnce('mud', 'Kalın çamur! Önce hortumla yıka');
          else if (res.foam < 0.05 && res.stain > 0.25 && this.economy.foamUnlocked && !this.shownHints.has('foam'))
            this.hintOnce('foam', 'İpucu: Köpük tabancası süngeri 3 kat hızlandırır');
        }
        break;
      }
      case 'towel': {
        if (!touching) break;
        const res = this.carManager.paint(hit.point, this.economy.towelRadius, { wet: -2.0 * this.economy.towelSpeed * f, foam: -0.35 }, dt);
        this.scrubPhase += dt * (4 + scrub * 16);
        loops.towel = 0.3 + 0.7 * scrub;
        if (res) {
          if (res.foam > 0.3) this.hintOnce('towel-foam', 'Önce köpüğü hortumla durula');
          else if (res.mud > 0.4) this.hintOnce('towel-mud', 'Burası hâlâ çamurlu — hortumla yıka');
        }
        break;
      }
      case 'rim': {
        if (!touching) break;
        const res = this.carManager.paint(hit.point, 0.2, { dust: 1.15 * f, mud: 0.06, wet: 0.2 }, dt);
        this.scrubPhase += dt * (6 + scrub * 18);
        loops.brush = 0.3 + 0.7 * scrub;
        if (res) {
          // Demir tozu çözücü: temas ettiği tozla mora döner
          this.effects.bubbles(hit.point, hit.normal, 0.6 + res.dust * 2, res.dust > 0.15 ? [0.72, 0.36, 0.95] : [1, 1, 1]);
          bubbleRate = 0.25 * res.dust;
        }
        break;
      }
      case 'tire': {
        if (!touching) break;
        const res = this.carManager.paint(hit.point, 0.22, { tire: 1.1 * f }, dt);
        this.scrubPhase += dt * (4 + scrub * 14);
        loops.pad = 0.3 + 0.7 * scrub;
        if (res && res.mud > 0.4) this.hintOnce('tire-mud', 'Lastik çamurlu — önce hortumla yıka');
        break;
      }
      case 'glass': {
        if (!active) break;
        aimFrom(2.5);
        this.effects.sprayMist(_tip, _dir, inRange ? hit : null, dt);
        this.recoil = 0.25;
        loops.spray = 1;
        if (touching) this.carManager.paint(hit.point, 0.32, { glass: 1.3, wet: 0.05 }, dt);
        break;
      }
      case 'polish': {
        model.userData.spin.rotation.y += dt * (active ? 60 : 0);
        if (active) loops.polisher = touching ? 1 : 0.6;
        if (!touching) break;
        const res = this.carManager.paint(hit.point, 0.3, { shine: 0.85 * f, shineNeedsClean: true }, dt);
        this.scrubPhase += dt * (3 + scrub * 8);
        if (res && (res.mud > 0.2 || res.stain > 0.2)) this.hintOnce('polish-dirty', 'Kirli boya cilalanmaz — önce yıka');
        else if (res && res.wet > 0.35) this.hintOnce('polish-wet', 'İpucu: Cila kuru boyada en iyi sonucu verir');
        break;
      }
    }

    if (firing && hit && !inRange && def.kind === 'hand') this.hintOnce('range', 'Çok uzaktasın — araca yaklaş');

    for (const k of LOOPS) this.audio.setLoop(k, loops[k], k === 'sponge' ? 0.03 : 0.1);
    this.audio.setBubbles(bubbleRate);
    this.animateView(dt, { active, hit: inRange ? hit : null, moving, time });
  }

  // ---------------------------------------------------------------- el animasyonu
  animateView(dt, { active, hit, moving, time }) {
    const model = this.models[this.index];
    const { rest, restQuat } = model.userData;
    const def = this.def;
    const k = 1 - Math.exp(-dt * 16);
    this.recoil = Math.max(0, this.recoil - dt * 6);

    const bob = moving ? Math.sin(time * 9) * 0.012 : Math.sin(time * 1.6) * 0.004;
    const bobX = moving ? Math.cos(time * 4.5) * 0.01 : 0;

    if (def.kind === 'hand' && active && hit) {
      // Yüzeyin üzerinde dairesel ovalama (cila makinesi daha küçük daireler çizer)
      _t1.crossVectors(hit.normal, Math.abs(hit.normal.y) > 0.9 ? _t2.set(1, 0, 0) : UP).normalize();
      _t2.crossVectors(hit.normal, _t1).normalize();
      const r = def.id === 'polish' ? 0.025 : 0.05;
      _target.copy(hit.point)
        .addScaledVector(hit.normal, model.userData.thickness)
        .addScaledVector(_t1, Math.cos(this.scrubPhase) * r)
        .addScaledVector(_t2, Math.sin(this.scrubPhase) * r);
      this.camera.worldToLocal(_target);
      _q.setFromUnitVectors(UP, hit.normal);
      _q2.copy(this.camera.quaternion).invert().multiply(_q);
      this.handPos.lerp(_target, k);
      this.handQuat.slerp(_q2, k);
    } else {
      _target.copy(rest);
      _target.y += bob;
      _target.x += bobX;
      _target.z += this.recoil * 0.025 + (Math.random() - 0.5) * this.recoil * 0.006;
      this.handPos.lerp(_target, k);
      this.handQuat.slerp(restQuat, k);
    }
    model.position.copy(this.handPos);
    model.quaternion.copy(this.handQuat);
  }
}

// ------------------------------------------------------------------ modeller
const M = {
  dark: () => new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.5, metalness: 0.3 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.25, metalness: 1 }),
  plastic: (c, r = 0.45) => new THREE.MeshStandardMaterial({ color: c, roughness: r }),
};

function finish(group, rest, euler, extra = {}) {
  group.userData.rest = rest;
  group.userData.restQuat = new THREE.Quaternion().setFromEuler(euler);
  Object.assign(group.userData, extra);
  group.position.copy(rest);
  group.quaternion.copy(group.userData.restQuat);
  return group;
}

const HAND_REST = [new THREE.Vector3(0.24, -0.26, -0.55), new THREE.Euler(0.45, 0.35, -0.15)];

/** Alet modeli (el için ve raf görüntüsü için aynı fonksiyon) */
export function buildToolModel(id) {
  switch (id) {
    case 'hose': {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.1, 0.2, 3, 0.02), M.plastic(0xffc21a));
      const grip = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.16, 0.065, 3, 0.02), M.dark());
      grip.position.set(0, -0.1, 0.06);
      grip.rotation.x = -0.35;
      const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.02), M.plastic(0xe0342b));
      trigger.position.set(0, -0.06, -0.01);
      const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 12), M.steel());
      lance.rotation.x = Math.PI / 2;
      lance.position.set(0, 0.02, -0.37);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.07, 12), M.plastic(0xe0342b));
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 0.02, -0.66);
      const hoseIn = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 8, 20, Math.PI), M.dark());
      hoseIn.position.set(0, -0.2, 0.12);
      hoseIn.rotation.y = Math.PI / 2;
      const tip = new THREE.Object3D();
      tip.position.set(0, 0.02, -0.71);
      g.add(body, grip, trigger, lance, nozzle, hoseIn, tip);
      g.scale.setScalar(0.8);
      return finish(g, new THREE.Vector3(0.24, -0.23, -0.4), new THREE.Euler(0.04, 0.1, 0), { tip });
    }
    case 'foam': {
      const g = new THREE.Group();
      const brass = new THREE.MeshStandardMaterial({ color: 0xd4a84a, roughness: 0.3, metalness: 1 });
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.09, 0.18, 3, 0.02), M.plastic(0x2f86ff, 0.4));
      const grip = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.15, 0.065, 3, 0.02), M.dark());
      grip.position.set(0, -0.1, 0.05);
      grip.rotation.x = -0.35;
      const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 20),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.3 }));
      bot.position.set(0, -0.07, -0.15);
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 20),
        new THREE.MeshStandardMaterial({ color: 0xff6ad5, roughness: 0.3, emissive: 0x551144, emissiveIntensity: 0.4 }));
      liquid.position.set(0, -0.095, -0.15);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 12), brass);
      neck.rotation.x = Math.PI / 2;
      neck.position.set(0, 0.02, -0.2);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.02, 0.08, 16, 1, true), brass);
      bell.rotation.x = -Math.PI / 2;
      bell.position.set(0, 0.02, -0.33);
      const tip = new THREE.Object3D();
      tip.position.set(0, 0.02, -0.38);
      g.add(body, grip, bot, liquid, neck, bell, tip);
      g.scale.setScalar(0.85);
      return finish(g, new THREE.Vector3(0.24, -0.22, -0.42), new THREE.Euler(0.05, 0.1, 0), { tip });
    }
    case 'sponge': {
      const g = new THREE.Group();
      const a = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.06, 0.11, 4, 0.025), M.plastic(0xffd23f, 0.95));
      a.position.y = 0.045;
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.025, 0.11, 3, 0.01), M.plastic(0x2aa3ff, 1));
      b.position.y = 0.01;
      const tip = new THREE.Object3D();
      g.add(a, b, tip);
      return finish(g, ...HAND_REST, { tip, thickness: 0.004 });
    }
    case 'towel': {
      const g = new THREE.Group();
      const a = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.025, 0.15, 3, 0.01), M.plastic(0x3fb6ff, 1));
      a.position.y = 0.0125;
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.02, 0.14, 3, 0.009), M.plastic(0x2d8fe0, 1));
      b.position.set(0.005, 0.034, 0.004);
      b.rotation.y = 0.05;
      const flapGeo = new THREE.PlaneGeometry(0.2, 0.12, 6, 6);
      const p = flapGeo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) + 0.06) * 12) * 0.012);
      flapGeo.computeVertexNormals();
      const flap = new THREE.Mesh(flapGeo, new THREE.MeshStandardMaterial({ color: 0x3fb6ff, roughness: 1, side: THREE.DoubleSide }));
      flap.position.set(0, -0.05, 0.075);
      flap.rotation.x = 0.2;
      const tip = new THREE.Object3D();
      g.add(a, b, flap, tip);
      return finish(g, ...HAND_REST, { tip, thickness: 0.004 });
    }
    case 'rim': {
      // Yumuşak kıllı jant fırçası: kıllar y=0'dan yukarı, sap arkaya doğru
      const g = new THREE.Group();
      const bristle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 20), M.plastic(0xffe14d, 1));
      bristle.position.y = 0.045;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), M.plastic(0x2257d6, 0.4));
      cap.position.y = 0.1;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.26, 12), M.plastic(0x2257d6, 0.4));
      handle.position.set(0, 0.16, 0.11);
      handle.rotation.x = 1.0;
      const tip = new THREE.Object3D();
      g.add(bristle, cap, handle, tip);
      return finish(g, ...HAND_REST, { tip, thickness: 0.002 });
    }
    case 'tire': {
      // Lastik parlatıcı aplikatörü: siyah köpük disk + tutma kulpu
      const g = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 24), M.plastic(0x16171a, 0.9));
      pad.position.y = 0.0175;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.012, 24), M.plastic(0x1f9bff, 0.4));
      base.position.y = 0.041;
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 8, 20, Math.PI), M.plastic(0x1f9bff, 0.4));
      loop.position.y = 0.047;
      const tip = new THREE.Object3D();
      g.add(pad, base, loop, tip);
      return finish(g, ...HAND_REST, { tip, thickness: 0.002 });
    }
    case 'glass': {
      // Sprey şişe
      const g = new THREE.Group();
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.15, 20),
        new THREE.MeshStandardMaterial({ color: 0x5fd0ff, roughness: 0.15, transparent: true, opacity: 0.55 }));
      bottle.position.y = -0.06;
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.034, 0.1, 20), M.plastic(0x1aa7ff, 0.2));
      liquid.position.y = -0.08;
      const head = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.05, 0.08, 3, 0.012), M.plastic(0xf2f4f7, 0.4));
      head.position.set(0, 0.035, -0.015);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.03, 10), M.plastic(0x333333, 0.5));
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(0, 0.045, -0.065);
      const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.012), M.plastic(0x1f9bff, 0.4));
      trigger.position.set(0, 0.0, -0.04);
      trigger.rotation.x = 0.3;
      const tip = new THREE.Object3D();
      tip.position.set(0, 0.045, -0.085);
      g.add(bottle, liquid, head, nozzle, trigger, tip);
      g.scale.setScalar(0.8);
      return finish(g, new THREE.Vector3(0.22, -0.2, -0.42), new THREE.Euler(0.05, 0.12, 0), { tip });
    }
    case 'polish': {
      // Orbital cila makinesi: sarı köpük ped y=0'da, motor gövdesi üstte
      const g = new THREE.Group();
      const spin = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.03, 28), M.plastic(0xffc233, 0.9));
      pad.position.y = 0.015;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, 6, 28), M.plastic(0xe0a21a, 0.9));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.0305;
      spin.add(pad, ring);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.012, 28), M.dark());
      plate.position.y = 0.037;
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.2, 20), M.plastic(0x2b2f36, 0.35));
      motor.rotation.z = Math.PI / 2;
      motor.position.set(0.02, 0.085, 0);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0415, 0.0415, 0.04, 20), M.plastic(0xff4f5a, 0.4));
      stripe.rotation.z = Math.PI / 2;
      stripe.position.set(0.02, 0.085, 0);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 20, Math.PI), M.dark());
      handle.position.set(-0.02, 0.12, 0);
      const tip = new THREE.Object3D();
      g.add(spin, plate, motor, stripe, handle, tip);
      return finish(g, ...HAND_REST, { tip, spin, thickness: 0.003 });
    }
  }
  throw new Error('Bilinmeyen alet: ' + id);
}
