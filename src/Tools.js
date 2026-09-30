import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const TOOL_DEFS = [
  { id: 'hose', short: 'Hortum', icon: '💦', range: 7 },
  { id: 'foam', short: 'Köpük', icon: '🫧', range: 4.5 },
  { id: 'sponge', short: 'Sünger', icon: '🧽', range: 2.4 },
  { id: 'towel', short: 'Havlu', icon: '🧻', range: 2.4 },
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

/**
 * Oyuncu araçları: davranış (boyama fırçaları) + birinci şahıs el modeli.
 */
export class Tools {
  constructor({ camera, carManager, effects, audio, economy, hud }) {
    Object.assign(this, { camera, carManager, effects, audio, economy, hud });
    this.index = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 30;
    this.switchT = 1;
    this.scrubPhase = 0;
    this.hintCooldown = 0;
    this.shownHints = new Set();
    this.lastHit = null;
    this.recoil = 0;

    this.view = new THREE.Group();
    camera.add(this.view);
    this.models = [this.buildHose(), this.buildFoamGun(), this.buildSponge(), this.buildTowel()];
    this.models.forEach((m, i) => {
      m.visible = i === 0;
      m.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      this.view.add(m);
    });
    // Sünger/havlu yüzeye giderken kullanılan yumuşak hedef
    this.handPos = new THREE.Vector3();
    this.handQuat = new THREE.Quaternion();
  }

  get def() {
    return TOOL_DEFS[this.index];
  }

  isLocked(i) {
    return TOOL_DEFS[i].id === 'foam' && !this.economy.foamUnlocked;
  }

  lockedFlags() {
    return TOOL_DEFS.map((_, i) => this.isLocked(i));
  }

  select(i) {
    if (i === this.index || i < 0 || i >= TOOL_DEFS.length) return;
    if (this.isLocked(i)) {
      this.hud.hint('Köpük Topu kilitli — mağazadan al (E)');
      this.audio.error();
      return;
    }
    this.index = i;
    this.switchT = 0;
    this.models.forEach((m, k) => (m.visible = k === i));
    const m = this.models[i];
    this.handPos.copy(m.userData.rest);
    this.handQuat.copy(m.userData.restQuat);
    this.hud.setActiveTool(i, this.lockedFlags());
    this.audio.click();
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
    this.switchT = Math.min(1, this.switchT + dt * 4);

    this.raycaster.setFromCamera(aim || CENTER, this.camera);
    const hit = this.carManager.raycast(this.raycaster);
    const def = this.def;
    const inRange = !!hit && hit.distance <= def.range;
    this.hud.setCrosshair(!hit ? 'none' : inRange ? 'target' : 'far');

    const active = firing && this.switchT > 0.6;
    const washable = this.carManager.isWashable;
    const scrub = Math.min(1, mouseSpeed / 350);
    let loops = { hose: 0, hoseLow: 0, foam: 0, sponge: 0, towel: 0 };

    const model = this.models[this.index];
    const tip = model.userData.tip;

    switch (def.id) {
      case 'hose': {
        if (!active) break;
        const power = this.economy.hosePower;
        tip.getWorldPosition(_tip);
        if (hit && inRange) _target.copy(hit.point);
        else _target.copy(this.raycaster.ray.direction).multiplyScalar(10).add(this.raycaster.ray.origin);
        _dir.subVectors(_target, _tip).normalize();
        this.effects.sprayWater(_tip, _dir, inRange ? hit : null, power, dt);
        this.recoil = 1;
        loops.hose = 0.5;
        if (inRange && washable) {
          loops.hoseLow = 0.45;
          const near = 1 - Math.min(0.55, Math.max(0, (hit.distance - 1.2) / def.range));
          const radius = this.economy.hoseRadius * (1 + hit.distance * 0.05);
          this.carManager.paint(hit.point, radius, {
            mud: 1.2 * power * near,
            stain: 0.05 * power,
            wet: 1.3,
            foam: -1.8 * power,
          }, dt);
        }
        break;
      }
      case 'foam': {
        if (!active) break;
        tip.getWorldPosition(_tip);
        if (hit && inRange) _target.copy(hit.point);
        else _target.copy(this.raycaster.ray.direction).multiplyScalar(5).add(this.raycaster.ray.origin);
        _dir.subVectors(_target, _tip).normalize();
        this.effects.sprayFoam(_tip, _dir, inRange ? hit : null, dt);
        this.recoil = 0.5;
        loops.foam = 0.35;
        if (inRange && washable) {
          this.carManager.paint(hit.point, 0.5, { foam: 2.4, wet: 0.35 }, dt);
        }
        break;
      }
      case 'sponge': {
        if (!(active && inRange && washable)) break;
        const f = 0.45 + 0.55 * scrub;
        const res = this.carManager.paint(hit.point, this.economy.spongeRadius, {
          stain: 1.0 * this.economy.spongeSpeed * f,
          mud: 0.07,
          wet: 0.3,
          foam: -0.3,
          foamBoost: 2,
        }, dt);
        loops.sponge = 0.2 + 0.5 * scrub;
        this.scrubPhase += dt * (4 + scrub * 16);
        if (res) {
          this.effects.bubbles(hit.point, hit.normal, 0.5 + res.foam * 2);
          if (res.mud > 0.45) this.hintOnce('mud', 'Kalın çamur! Önce hortumla yıka [1]');
          else if (res.foam < 0.05 && res.stain > 0.25 && this.economy.foamUnlocked && !this.shownHints.has('foam'))
            this.hintOnce('foam', 'İpucu: Köpük [2] süngeri 3 kat hızlandırır');
        }
        break;
      }
      case 'towel': {
        if (!(active && inRange && washable)) break;
        const f = 0.45 + 0.55 * scrub;
        const res = this.carManager.paint(hit.point, this.economy.towelRadius, {
          wet: -2.0 * this.economy.towelSpeed * f,
          foam: -0.35,
        }, dt);
        loops.towel = 0.12 + 0.35 * scrub;
        this.scrubPhase += dt * (4 + scrub * 16);
        if (res) {
          if (res.foam > 0.3) this.hintOnce('towel-foam', 'Önce köpüğü hortumla durula [1]');
          else if (res.mud > 0.4) this.hintOnce('towel-mud', 'Burası hâlâ çamurlu — hortum [1]');
        }
        break;
      }
    }

    if (firing && hit && !inRange && (def.id === 'sponge' || def.id === 'towel')) {
      this.hintOnce('range', 'Çok uzaktasın — araca yaklaş');
    }

    for (const k in loops) this.audio.setLoop(k, loops[k]);
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
    const drop = (1 - easeOut(this.switchT)) * -0.45;

    const handTool = def.id === 'sponge' || def.id === 'towel';
    if (handTool && active && hit) {
      // Yüzeyin üzerinde dairesel ovalama
      _t1.crossVectors(hit.normal, Math.abs(hit.normal.y) > 0.9 ? _t2.set(1, 0, 0) : UP).normalize();
      _t2.crossVectors(hit.normal, _t1).normalize();
      const r = 0.05;
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
      _target.y += bob + drop;
      _target.x += bobX;
      _target.z += this.recoil * 0.025 + (Math.random() - 0.5) * this.recoil * 0.006;
      this.handPos.lerp(_target, k);
      this.handQuat.slerp(restQuat, k);
    }
    model.position.copy(this.handPos);
    model.quaternion.copy(this.handQuat);
  }

  // ---------------------------------------------------------------- modeller
  finish(group, rest, euler, extra = {}) {
    group.userData.rest = rest;
    group.userData.restQuat = new THREE.Quaternion().setFromEuler(euler);
    Object.assign(group.userData, extra);
    group.position.copy(rest);
    group.quaternion.copy(group.userData.restQuat);
    return group;
  }

  buildHose() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.5, metalness: 0.3 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.45 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.25, metalness: 1 });
    const red = new THREE.MeshStandardMaterial({ color: 0xe0342b, roughness: 0.4 });

    const body = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.1, 0.2, 3, 0.02), yellow);
    const grip = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.16, 0.065, 3, 0.02), dark);
    grip.position.set(0, -0.1, 0.06);
    grip.rotation.x = -0.35;
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.02), red);
    trigger.position.set(0, -0.06, -0.01);
    const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 12), steel);
    lance.rotation.x = Math.PI / 2;
    lance.position.set(0, 0.02, -0.37);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.07, 12), red);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0.02, -0.66);
    const hoseIn = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 8, 20, Math.PI), dark);
    hoseIn.position.set(0, -0.2, 0.12);
    hoseIn.rotation.y = Math.PI / 2;
    const tip = new THREE.Object3D();
    tip.position.set(0, 0.02, -0.71);
    g.add(body, grip, trigger, lance, nozzle, hoseIn, tip);
    g.scale.setScalar(0.8);
    return this.finish(g, new THREE.Vector3(0.24, -0.23, -0.4), new THREE.Euler(0.04, 0.1, 0), { tip });
  }

  buildFoamGun() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.5, metalness: 0.3 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2f86ff, roughness: 0.4 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd4a84a, roughness: 0.3, metalness: 1 });
    const bottle = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.3 });
    const soap = new THREE.MeshStandardMaterial({ color: 0xff6ad5, roughness: 0.3, emissive: 0x551144, emissiveIntensity: 0.4 });

    const body = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.09, 0.18, 3, 0.02), blue);
    const grip = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.15, 0.065, 3, 0.02), dark);
    grip.position.set(0, -0.1, 0.05);
    grip.rotation.x = -0.35;
    const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 20), bottle);
    bot.position.set(0, -0.07, -0.15);
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 20), soap);
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
    return this.finish(g, new THREE.Vector3(0.24, -0.22, -0.42), new THREE.Euler(0.05, 0.1, 0), { tip });
  }

  buildSponge() {
    const g = new THREE.Group();
    const sponge = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.95 });
    const pad = new THREE.MeshStandardMaterial({ color: 0x2aa3ff, roughness: 1 });
    const a = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.06, 0.11, 4, 0.025), sponge);
    a.position.y = 0.045;
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.025, 0.11, 3, 0.01), pad);
    b.position.y = 0.01;
    g.add(a, b);
    const tip = new THREE.Object3D();
    g.add(tip);
    return this.finish(g, new THREE.Vector3(0.24, -0.26, -0.55), new THREE.Euler(0.45, 0.35, -0.15), { tip, thickness: 0.004 });
  }

  buildTowel() {
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3fb6ff, roughness: 1 });
    const cloth2 = new THREE.MeshStandardMaterial({ color: 0x2d8fe0, roughness: 1 });
    const a = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.025, 0.15, 3, 0.01), cloth);
    a.position.y = 0.0125;
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.02, 0.14, 3, 0.009), cloth2);
    b.position.set(0.005, 0.034, 0.004);
    b.rotation.y = 0.05;
    // Sarkan uç
    const flapGeo = new THREE.PlaneGeometry(0.2, 0.12, 6, 6);
    const p = flapGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getY(i) + 0.06) * 12) * 0.012);
    flapGeo.computeVertexNormals();
    const flap = new THREE.Mesh(flapGeo, new THREE.MeshStandardMaterial({ color: 0x3fb6ff, roughness: 1, side: THREE.DoubleSide }));
    flap.position.set(0, -0.05, 0.075);
    flap.rotation.x = 0.2;
    g.add(a, b, flap);
    const tip = new THREE.Object3D();
    g.add(tip);
    return this.finish(g, new THREE.Vector3(0.24, -0.26, -0.55), new THREE.Euler(0.45, 0.35, -0.15), { tip, thickness: 0.004 });
  }
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}
