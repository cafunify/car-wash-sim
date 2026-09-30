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

/**
 * Oyuna özel efektler: su akışı, sıçrama, köpük, damlalar, ışıltı.
 */
export class Effects {
  constructor(scene) {
    this.water = new ParticleSystem(scene, { max: 3500, soft: 0.6 });
    this.foam = new ParticleSystem(scene, { max: 1500, soft: 0.35 });
    this.sparkle = new ParticleSystem(scene, { max: 600, blending: THREE.AdditiveBlending, star: 1 });
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
  sprayWater(from, dir, hit, power, dt) {
    const count = Math.ceil(dt * 900 * (0.8 + power * 0.3));
    const speed = 22;
    const dist = hit ? from.distanceTo(hit.point) : 8;
    for (let i = 0; i < count; i++) {
      const spread = 0.028;
      this._v.set(
        dir.x + (Math.random() - 0.5) * spread,
        dir.y + (Math.random() - 0.5) * spread,
        dir.z + (Math.random() - 0.5) * spread,
      ).normalize().multiplyScalar(speed * (0.92 + Math.random() * 0.16));
      // Karedeki zamana yayılmış başlangıç
      this._p.copy(from).addScaledVector(this._v, Math.random() * dt);
      const life = hit ? dist / speed : 0.5;
      const h = hit;
      this.water.emit(this._p, this._v, {
        life,
        size: 0.028 + Math.random() * 0.02,
        color: [0.72, 0.86, 1.0],
        alpha: 0.75,
        gravity: 1.5,
        onDeath: h && Math.random() < 0.55 ? (x, y, z) => this.splash(x, y, z, h.normal) : null,
      });
    }
  }

  splash(x, y, z, normal) {
    this._p.set(x, y, z);
    const n = 2;
    for (let i = 0; i < n; i++) {
      this._v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.2);
      this._v.addScaledVector(normal, 1.6 + Math.random() * 1.6);
      this.water.emit(this._p, this._v, {
        life: 0.35 + Math.random() * 0.45,
        size: 0.03 + Math.random() * 0.035,
        color: [0.8, 0.9, 1.0],
        alpha: 0.7,
        gravity: 9.8,
        drag: 1.5,
      });
    }
    // Sis
    if (Math.random() < 0.025) {
      this._v.copy(normal).multiplyScalar(0.6).add(this._t.set(Math.random() - 0.5, 0.3, Math.random() - 0.5));
      this.water.emit(this._p, this._v, {
        life: 0.8, size: 0.16, color: [0.8, 0.88, 0.95], alpha: 0.08, gravity: -0.2, drag: 2, grow: 2,
      });
    }
  }

  sprayFoam(from, dir, hit, dt) {
    const count = Math.ceil(dt * 240);
    const speed = 8;
    const dist = hit ? from.distanceTo(hit.point) : 4;
    for (let i = 0; i < count; i++) {
      const spread = 0.12;
      this._v.set(
        dir.x + (Math.random() - 0.5) * spread,
        dir.y + (Math.random() - 0.5) * spread,
        dir.z + (Math.random() - 0.5) * spread,
      ).normalize().multiplyScalar(speed * (0.85 + Math.random() * 0.3));
      this._p.copy(from);
      this.foam.emit(this._p, this._v, {
        life: hit ? dist / speed : 0.5,
        size: 0.05 + Math.random() * 0.05,
        color: [0.97, 0.98, 1.0],
        alpha: 0.9,
        gravity: 1.0,
        grow: 1.2,
      });
    }
  }

  /** Sünger/havlu kullanırken çıkan köpük kabarcıkları */
  bubbles(point, normal, amount = 1) {
    if (Math.random() > 0.35 * amount) return;
    this._v.copy(normal).multiplyScalar(0.4).add(this._t.set(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5));
    this.foam.emit(point, this._v, {
      life: 0.5 + Math.random() * 0.5, size: 0.025 + Math.random() * 0.03, color: [1, 1, 1], alpha: 0.85, gravity: -0.3, drag: 2,
    });
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
    this.water.update(dt);
    this.foam.update(dt);
    this.sparkle.update(dt);
  }
}
