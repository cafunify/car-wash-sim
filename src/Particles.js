import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
uniform float uSoft;
uniform float uStar;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  float a = 1.0 - smoothstep(1.0 - uSoft, 1.0, d);
  // Yıldız (ışıltı) şekli
  float star = max(1.0 - abs(p.x * p.y) * 18.0 - d * 0.6, 0.0);
  a = mix(a, star, uStar);
  // Su damlası için hafif parlak merkez
  vec3 col = vColor * (1.0 + (1.0 - d) * 0.35);
  if (a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(col, a * vAlpha);
}
`;

/**
 * Havuzlu CPU partikül sistemi (tek draw call, THREE.Points).
 */
export class ParticleSystem {
  constructor(scene, { max = 2000, blending = THREE.NormalBlending, soft = 0.5, star = 0 } = {}) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.baseAlpha = new Float32Array(max);
    this.color = new Float32Array(max * 3);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.onDeath = new Array(max).fill(null);
    this.cursor = 0;
    this.alive = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uScale: { value: window.innerHeight * 0.5 },
        uSoft: { value: soft },
        uStar: { value: star },
      },
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  resize(height) {
    this.material.uniforms.uScale.value = height * 0.5;
  }

  /**
   * @param {THREE.Vector3} p başlangıç
   * @param {THREE.Vector3} v hız
   * @param {object} o { life, size, color:[r,g,b], alpha, gravity, drag, grow, onDeath }
   */
  emit(p, v, o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.life[i] = this.maxLife[i] = o.life;
    this.baseSize[i] = this.size[i] = o.size;
    this.alpha[i] = this.baseAlpha[i] = o.alpha ?? 1;
    const c = o.color;
    this.color[i3] = c[0]; this.color[i3 + 1] = c[1]; this.color[i3 + 2] = c[2];
    this.gravity[i] = o.gravity ?? 9.8;
    this.drag[i] = o.drag ?? 0;
    this.grow[i] = o.grow ?? 0;
    this.onDeath[i] = o.onDeath || null;
  }

  update(dt) {
    const { pos, vel, life, maxLife, size, baseSize, alpha, baseAlpha, gravity, drag, grow } = this;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const i3 = i * 3;
      if (life[i] <= 0 || pos[i3 + 1] < 0.01) {
        const cb = this.onDeath[i];
        life[i] = 0;
        alpha[i] = 0;
        size[i] = 0;
        this.onDeath[i] = null;
        if (cb) cb(pos[i3], Math.max(0.01, pos[i3 + 1]), pos[i3 + 2]);
        continue;
      }
      alive++;
      const dk = 1 - drag[i] * dt;
      vel[i3] *= dk; vel[i3 + 1] = vel[i3 + 1] * dk - gravity[i] * dt; vel[i3 + 2] *= dk;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      const k = life[i] / maxLife[i];
      size[i] = baseSize[i] * (1 + grow[i] * (1 - k));
      alpha[i] = baseAlpha[i] * Math.min(1, k * 4 + 0.2);
    }
    this.alive = alive;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }
}


// ------------------------------------------------------------------ Su / köpük huzmesi
const JET_VERT = /* glsl */ `
uniform float uStart;
uniform float uTime;
uniform float uWobble;
varying float vT;
varying float vAng;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec3 p = position;
  float t = p.y;
  vT = t;
  vAng = atan(p.z, p.x);
  // Nozulda dar, ileride yelpaze gibi açılır; hafif titreme
  float r = mix(uStart, 1.0, pow(t, 0.75));
  p.xz *= r * (1.0 + sin(uTime * 37.0 + t * 11.0) * uWobble * t);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const JET_FRAG = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uOpacity;
uniform vec3 uColor;
uniform float uPuff;
varying float vT;
varying float vAng;
varying vec3 vN;
varying vec3 vView;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float t = vT;
  // Akış boyunca kayan su çizgileri
  float s1 = n2(vec2(vAng * 3.0 + t * 2.0, t * 14.0 - uTime * uSpeed));
  float s2 = n2(vec2(vAng * 9.0, t * 42.0 - uTime * uSpeed * 1.8));
  float streak = mix(s1 * s2 * 2.2, s1, uPuff);
  // Kenarlarda ışık kırılması (fresnel)
  float fres = pow(1.0 - abs(dot(normalize(vN), vView)), 1.6);
  float a = (0.22 + 0.7 * streak) * mix(0.55, 1.0, fres);
  // Nozula yakın yumuşak başlangıç, uca doğru damlalara ayrılma
  a *= smoothstep(0.0, 0.05, t);
  float breakup = smoothstep(0.55, 1.0, t);
  a *= 1.0 - breakup * (1.0 - step(0.55 + 0.4 * (1.0 - t), n2(vec2(vAng * 14.0, t * 60.0 - uTime * uSpeed * 2.0))));
  a *= uOpacity;
  if (a < 0.01) discard;
  vec3 col = uColor * (0.75 + 0.55 * s2 + fres * 0.35);
  gl_FragColor = vec4(col, a);
}
`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Tabancadan çıkan hacimli su/köpük huzmesi (açık uçlu, yelpaze şeklinde koni) */
class Jet {
  constructor(scene, { color, opacity, speed, puff = 0, wobble = 0.03 }) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 20, 24, true);
    geo.translate(0, 0.5, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: JET_VERT,
      fragmentShader: JET_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uStart: { value: 0.1 },
        uSpeed: { value: speed },
        uOpacity: { value: opacity },
        uColor: { value: new THREE.Color(...color) },
        uPuff: { value: puff },
        uWobble: { value: wobble },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.used = false;
    scene.add(this.mesh);
    this._q = new THREE.Quaternion();
    this._x = new THREE.Vector3();
    this._w = new THREE.Vector3();
  }

  /** from: nozul, dir: yön, length, halfWidth: yelpaze yarı genişliği, thick: kalınlık, right: yelpazenin açılma ekseni */
  set(from, dir, length, halfWidth, thick, right, nozzle = 0.012) {
    const m = this.mesh;
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(Y_AXIS, dir);
    // Yelpazeyi kameranın sağ eksenine hizala
    this._x.set(1, 0, 0).applyQuaternion(m.quaternion);
    this._w.copy(right).addScaledVector(dir, -right.dot(dir)).normalize();
    this._q.setFromUnitVectors(this._x, this._w);
    m.quaternion.premultiply(this._q);
    m.scale.set(halfWidth, length, thick);
    this.material.uniforms.uStart.value = Math.min(1, nozzle / halfWidth);
    m.visible = true;
    this.used = true;
  }

  update(time) {
    this.material.uniforms.uTime.value = time;
    if (!this.used) this.mesh.visible = false;
    this.used = false;
  }
}

/**
 * Oyuna özel efektler: su akışı, sıçrama, köpük, damlalar, ışıltı.
 */
export class Effects {
  constructor(scene) {
    this.water = new ParticleSystem(scene, { max: 3500, soft: 0.6 });
    this.foam = new ParticleSystem(scene, { max: 1500, soft: 0.35 });
    this.sparkle = new ParticleSystem(scene, { max: 600, blending: THREE.AdditiveBlending, star: 1 });
    this.waterJet = new Jet(scene, { color: [0.78, 0.9, 1.05], opacity: 0.55, speed: 34 });
    this.foamJet = new Jet(scene, { color: [0.97, 0.98, 1.0], opacity: 0.85, speed: 9, puff: 0.85, wobble: 0.08 });
    this.foamColor = [0.97, 0.98, 1.0];
    this.time = 0;
    this.density = 1; // grafik kalitesine göre partikül yoğunluğu
    this._p = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  resize(h) {
    this.water.resize(h);
    this.foam.resize(h);
    this.sparkle.resize(h);
  }

  /**
   * Basınçlı su akışı. from: nozul ucu, dir: normalize yön,
   * hit: {point, normal, distance} ya da null
   */
  sprayWater(from, dir, hit, power, dt, right) {
    const dist = hit ? from.distanceTo(hit.point) : 7;
    // Hacimli huzme: 15° yelpaze, basınç arttıkça biraz daralır
    const spread = 0.13 / (0.85 + power * 0.15);
    this.waterJet.set(from, dir, dist, Math.max(0.02, dist * spread), 0.012 + dist * 0.012, right);

    // Huzme içinde parlayan damlacıklar
    const speed = 24;
    const count = Math.ceil(dt * 260 * this.density);
    for (let i = 0; i < count; i++) {
      const lateral = (Math.random() - 0.5) * 2 * spread;
      this._v.copy(dir).addScaledVector(right, lateral).normalize().multiplyScalar(speed * (0.9 + Math.random() * 0.2));
      this._p.copy(from).addScaledVector(this._v, Math.random() * dt);
      this.water.emit(this._p, this._v, {
        life: hit ? dist / speed : 0.35 + Math.random() * 0.2,
        size: 0.012 + Math.random() * 0.018, color: [0.85, 0.94, 1.0], alpha: 0.6, gravity: 2,
      });
    }
    if (hit) this.impact(hit, dir, power, dt);
  }

  /** Suyun yüzeye çarptığı yer: sıçrama tacı, sis ve aşağı süzülen damlalar */
  impact(hit, dir, power, dt) {
    const n = hit.normal;
    // Yansıyan yön: su yüzeyden sekip yanlara saçılır
    const refl = this._t.copy(dir).addScaledVector(n, -2 * dir.dot(n));
    const crown = Math.ceil(dt * (160 + power * 80) * this.density);
    for (let i = 0; i < crown; i++) {
      this._v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(3.2)
        .addScaledVector(refl, 2 + Math.random() * 2.5).addScaledVector(n, 1.2);
      this._p.copy(hit.point).addScaledVector(n, 0.02);
      this.water.emit(this._p, this._v, {
        life: 0.25 + Math.random() * 0.45, size: 0.018 + Math.random() * 0.04,
        color: [0.82, 0.92, 1.0], alpha: 0.75, gravity: 9.8, drag: 1.2,
      });
    }
    // Sis bulutu
    if (Math.random() < dt * 22) {
      this._v.copy(n).multiplyScalar(0.5);
      this._v.x += Math.random() - 0.5;
      this._v.y += 0.25;
      this._v.z += Math.random() - 0.5;
      this.water.emit(hit.point, this._v, {
        life: 0.9 + Math.random() * 0.5, size: 0.2 + Math.random() * 0.15, color: [0.85, 0.92, 1.0],
        alpha: 0.07, gravity: -0.15, drag: 2.5, grow: 2.5,
      });
    }
    // Yüzeyden aşağı süzülen damlalar
    if (Math.random() < dt * 30) {
      this._v.set((Math.random() - 0.5) * 0.2, -0.6 - Math.random() * 0.6, (Math.random() - 0.5) * 0.2).addScaledVector(n, 0.15);
      this.water.emit(this._p.copy(hit.point).addScaledVector(n, 0.01), this._v, {
        life: 0.8, size: 0.02 + Math.random() * 0.015, color: [0.8, 0.9, 1.0], alpha: 0.8, gravity: 6,
      });
    }
  }

  setFoamColor(rgb) {
    this.foamColor = rgb;
    this.foamJet.material.uniforms.uColor.value.setRGB(...rgb);
  }

  sprayFoam(from, dir, hit, dt, right) {
    const dist = hit ? from.distanceTo(hit.point) : 4;
    // Su tabancası gibi dikey yelpaze: `right` parametresi yelpazenin açıldığı eksendir (kameranın yukarısı)
    const spread = 0.16;
    const w = 0.05 + dist * spread;
    this.foamJet.set(from, dir, dist, w, 0.016 + dist * 0.02, right, 0.03);
    const count = Math.ceil(dt * 160 * this.density);
    const speed = 8;
    for (let i = 0; i < count; i++) {
      const lateral = (Math.random() - 0.5) * 2 * spread;
      this._v.copy(dir).addScaledVector(right, lateral);
      this._v.x += (Math.random() - 0.5) * spread * 0.25;
      this._v.z += (Math.random() - 0.5) * spread * 0.25;
      this._v.normalize().multiplyScalar(speed * (0.85 + Math.random() * 0.3));
      this.foam.emit(from, this._v, {
        life: hit ? dist / speed : 0.5,
        size: 0.035 + Math.random() * 0.04,
        color: this.foamColor.map((c) => c * 0.88),
        alpha: 0.75,
        gravity: 1.0,
        grow: 1.4,
      });
    }
    // Yüzeye yapışan köpük topakları
    if (hit && Math.random() < dt * 40) {
      this._v.copy(hit.normal).multiplyScalar(0.3);
      this.foam.emit(hit.point, this._v, { life: 0.5, size: 0.06, color: this.foamColor.map((c) => c * 0.85), alpha: 0.6, gravity: 0.3, drag: 4, grow: 0.5 });
    }
  }

  /** Fırça kullanırken çıkan köpük kabarcıkları */
  bubbles(point, normal, amount = 1, color = [1, 1, 1]) {
    if (Math.random() > 0.35 * amount) return;
    this._v.copy(normal).multiplyScalar(0.4).add(this._t.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5));
    this.foam.emit(point, this._v, {
      life: 0.5 + Math.random() * 0.5, size: 0.025 + Math.random() * 0.03, color, alpha: 0.85, gravity: -0.3, drag: 2,
    });
  }

  /** Cam temizleyici sprey sisi */
  sprayMist(from, dir, hit, dt) {
    const count = Math.ceil(dt * 160);
    const speed = 5;
    const dist = hit ? from.distanceTo(hit.point) : 1.5;
    for (let i = 0; i < count; i++) {
      const spread = 0.22;
      this._v.set(
        dir.x + (Math.random() - 0.5) * spread,
        dir.y + (Math.random() - 0.5) * spread,
        dir.z + (Math.random() - 0.5) * spread,
      ).normalize().multiplyScalar(speed * (0.8 + Math.random() * 0.4));
      this.water.emit(from, this._v, {
        life: Math.min(0.6, dist / speed + 0.05), size: 0.008 + Math.random() * 0.01, color: [0.7, 0.9, 1.0], alpha: 0.3, gravity: 0.5, drag: 1.5, grow: 1.2,
      });
    }
  }

  /** Islak araçtan düşen damlalar */
  drip(point) {
    this._v.set(0, -0.2, 0);
    this.water.emit(point, this._v, {
      life: 1.4, size: 0.022, color: [0.75, 0.87, 1.0], alpha: 0.8, gravity: 9.8,
    });
  }

  /** Temiz araç kutlaması */
  sparkleBurst(box) {
    const size = box.getSize(this._t);
    for (let i = 0; i < 90; i++) {
      this._p.set(
        box.min.x + Math.random() * size.x,
        box.min.y + Math.random() * size.y,
        box.min.z + Math.random() * size.z,
      );
      this._v.set((Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4);
      this.sparkle.emit(this._p, this._v, {
        life: 0.8 + Math.random() * 1.2,
        size: 0.12 + Math.random() * 0.16,
        color: Math.random() < 0.5 ? [1.4, 1.25, 0.7] : [0.8, 1.2, 1.6],
        gravity: -0.1,
        drag: 1,
      });
    }
  }

  update(dt) {
    this.time += dt;
    this.water.update(dt);
    this.foam.update(dt);
    this.sparkle.update(dt);
    this.waterJet.update(this.time);
    this.foamJet.update(this.time);
  }
}
