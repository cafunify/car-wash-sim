import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Environment, WALK_BOUNDS } from './Environment.js';
import { CarManager } from './CarManager.js';
import { Effects } from './Particles.js';
import { Tools, TOOL_DEFS } from './Tools.js';
import { EconomyManager, SHOP_LEVEL_NAMES } from './EconomyManager.js';
import { HUD } from './HUD.js';
import { AudioManager } from './Audio.js';

const EYE_HEIGHT = 1.68;
const WALK_SPEED = 3.3;
const RUN_SPEED = 5.6;
const PLAYER_RADIUS = 0.32;

// Katman tamamlanma eşikleri (temiz örnek oranı)
const THRESHOLDS = { mud: 0.97, stain: 0.96, dry: 0.95 };

class Game {
  constructor() {
    this.timer = new THREE.Timer();
    this.debugPlay = false;
    this.time = 0;
    this.keys = new Set();
    this.firing = false;
    this.mouseDist = 0;
    this.mouseSpeed = 0;
    this.velocity = new THREE.Vector3();
    this.statsTimer = 0;
    this.dripTimer = 0;
    this.waitTimer = 0;
    this.lastStats = null;
    this.started = false;
  }

  async init() {
    await document.fonts.ready;

    // ------------------------------------------------ renderer + sahne
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x0a0d18);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // Yedek yansıma; seviye yüklenince garajın kendisinden yakalanır
    scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = (this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 120));
    camera.position.set(0, EYE_HEIGHT, 4.6);
    camera.lookAt(0, 1, 0);
    scene.add(camera); // el modelleri kameranın çocuğu

    this.controls = new PointerLockControls(camera, document.body);

    // ------------------------------------------------ post-processing
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.4, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // ------------------------------------------------ sistemler
    this.hud = new HUD();
    this.audio = new AudioManager();
    this.env = new Environment(scene, renderer);
    this.effects = new Effects(scene);
    this.economy = new EconomyManager(this.hud, this.audio, { onUpgrade: (id, lvl) => this.onUpgrade(id, lvl) });
    this.cars = new CarManager(scene, {
      onArrived: (car) => this.onCarArrived(car),
      onLeft: () => (this.waitTimer = 1.2),
    });
    this.tools = new Tools({
      camera,
      carManager: this.cars,
      effects: this.effects,
      audio: this.audio,
      economy: this.economy,
      hud: this.hud,
    });
    this.hud.buildToolbar(TOOL_DEFS);
    this.hud.setActiveTool(0, this.tools.lockedFlags());
    this.hud.setProgress(0, null, false);

    this.applyLevel(this.economy.shopLevel);
    await this.cars.preload();
    this.cars.spawn(this.economy.shopLevel);
    this.hud.message('Müşteri geliyor…', 2.5);

    this.bindInput();
    document.getElementById('loading').classList.add('hidden');
    renderer.setAnimationLoop(() => this.frame());
    this.exposeDebug();
  }

  // ---------------------------------------------------------------- olaylar
  onCarArrived(car) {
    this.economy.startCustomer(car);
    this.audio.carArrive();
    this.hud.message(`<b>${car.customer}</b> ${car.def.name} ile geldi!<br><small>Önce hortumla çamuru sök</small>`, 3);
  }

  onCarWashed() {
    const car = this.cars.car;
    const res = this.economy.payout();
    this.cars.complete();
    this.audio.complete();
    const box = this.cars.worldBox(new THREE.Box3());
    if (box) this.effects.sparkleBurst(box);
    if (res) this.hud.toast(`+$${res.total}`, res.tip > 0 ? `Bahşiş dahil +$${res.tip} ⏱` : `${car.customer} memnun!`);
    this.hud.setProgress(1, { mud: 1, stain: 1, dry: 1 }, true);
  }

  onUpgrade(id, level) {
    if (id === 'shop' || id === 'reset') this.applyLevel(this.economy.shopLevel, id === 'shop');
    this.hud.setActiveTool(this.tools.index, this.tools.lockedFlags());
    if (id === 'reset' && this.tools.isLocked(this.tools.index)) this.tools.select(0);
    if (id === 'foam') this.hud.toast('Köpük Topu açıldı!', 'Tuş 2 ile seç', 'info');
    if (id === 'shop') this.hud.toast(`${SHOP_LEVEL_NAMES[level]}`, 'Yeni araç tipleri geliyor!', 'info');
  }

  applyLevel(level) {
    this.env.setLevel(level);
    const [strength, radius, threshold] = this.env.fx.bloom;
    this.bloom.strength = strength;
    this.bloom.radius = radius;
    this.bloom.threshold = threshold;
    this.captureReflections();
  }

  /** Garajın o anki halini yansıma haritası olarak yakala (araç ve el modeli hariç) */
  captureReflections() {
    const hidden = [this.tools?.view, this.cars?.car?.root, this.effects?.water.points, this.effects?.foam.points, this.effects?.sparkle.points].filter(Boolean);
    hidden.forEach((o) => (o.visible = false));
    const prevEnv = this.scene.environment;
    this.scene.environment = null;
    const rt = this.pmrem.fromScene(this.scene, 0.015, 0.1, 80, { position: new THREE.Vector3(0, 1.3, 0), size: 256 });
    this.scene.environment = rt.texture;
    this.envTarget?.dispose();
    if (!this.envTarget) prevEnv?.dispose();
    this.envTarget = rt;
    hidden.forEach((o) => (o.visible = true));
  }

  // ---------------------------------------------------------------- girdi
  bindInput() {
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-btn');

    startBtn.addEventListener('click', () => {
      this.audio.init();
      this.requestLock();
    });

    this.controls.addEventListener('lock', () => {
      startScreen.classList.add('hidden');
      this.economy.closeShop();
      this.hud.show();
      this.started = true;
    });
    this.controls.addEventListener('unlock', () => {
      this.firing = false;
      this.keys.clear();
      if (!this.economy.shopOpen) {
        startBtn.textContent = 'Devam Et';
        startScreen.classList.remove('hidden');
      }
    });

    document.getElementById('shop-close').addEventListener('click', () => this.closeShop());
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('Tüm para ve yükseltmeler silinsin mi?')) this.economy.reset();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;

      if (e.code === 'KeyE' || e.code === 'Tab') {
        if (this.economy.shopOpen) this.closeShop();
        else if (this.controls.isLocked) this.openShop();
        return;
      }
      if (!this.controls.isLocked) return;
      this.keys.add(e.code);
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5)) - 1;
        if (n >= 0 && n < TOOL_DEFS.length) this.tools.select(n);
      }
      if (e.code === 'KeyF') {
        this.cars.pulseHighlight();
        this.hud.hint('Kir tarayıcı: turuncu = kir, mavi = ıslak');
      }
      if (e.code === 'KeyM') this.hud.hint(this.audio.toggleMute() ? 'Ses kapalı' : 'Ses açık', 1.2);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.controls.isLocked) this.firing = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.controls.isLocked) return;
      const n = TOOL_DEFS.length;
      let i = this.tools.index;
      for (let k = 0; k < n; k++) {
        i = (i + (e.deltaY > 0 ? 1 : -1) + n) % n;
        if (!this.tools.isLocked(i)) break;
      }
      this.tools.select(i);
    });
    document.addEventListener('mousemove', (e) => {
      if (this.controls.isLocked) this.mouseDist += Math.hypot(e.movementX, e.movementY);
    });

    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.effects.resize(h);
    });
  }

  /** Fare kilidi iste; tarayıcı reddederse oyuncuya söyle */
  requestLock() {
    try {
      const p = document.body.requestPointerLock();
      p?.catch?.(() => this.lockFailed('Fare kilitlenemedi — tekrar tıkla'));
    } catch {
      this.lockFailed('Bu tarayıcı fare kilidini desteklemiyor');
    }
  }

  lockFailed(text) {
    document.getElementById('start-btn').textContent = text;
    document.getElementById('start-screen').classList.remove('hidden');
  }

  openShop() {
    this.economy.openShop();
    this.controls.unlock();
    this.audio.click();
  }

  closeShop() {
    this.economy.closeShop();
    this.audio.click();
    // Tarayıcı hemen tekrar kilitlemeye izin vermeyebilir; başarısız olursa başlangıç ekranı görünür
    this.requestLock();
    setTimeout(() => {
      if (!this.controls.isLocked) {
        document.getElementById('start-btn').textContent = 'Devam Et';
        document.getElementById('start-screen').classList.remove('hidden');
      }
    }, 400);
  }

  // ---------------------------------------------------------------- oyuncu hareketi
  updatePlayer(dt) {
    const k = this.keys;
    const input = new THREE.Vector2(
      (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
    );
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED;
    if (input.lengthSq() > 1) input.normalize();

    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
    const target = new THREE.Vector3().addScaledVector(fwd, input.y * speed).addScaledVector(right, input.x * speed);
    this.velocity.lerp(target, 1 - Math.exp(-dt * 12));

    const pos = this.camera.position;
    pos.addScaledVector(this.velocity, dt);

    // Oda sınırları
    pos.x = THREE.MathUtils.clamp(pos.x, WALK_BOUNDS.minX, WALK_BOUNDS.maxX);
    pos.z = THREE.MathUtils.clamp(pos.z, WALK_BOUNDS.minZ, WALK_BOUNDS.maxZ);

    // Araçla çarpışma (XZ düzleminde AABB itmesi)
    const box = this.cars.worldBox(this._box || (this._box = new THREE.Box3()));
    if (box) {
      const minX = box.min.x - PLAYER_RADIUS, maxX = box.max.x + PLAYER_RADIUS;
      const minZ = box.min.z - PLAYER_RADIUS, maxZ = box.max.z + PLAYER_RADIUS;
      if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
        const pushes = [minX - pos.x, maxX - pos.x, minZ - pos.z, maxZ - pos.z];
        const abs = pushes.map(Math.abs);
        const i = abs.indexOf(Math.min(...abs));
        if (i < 2) pos.x += pushes[i];
        else pos.z += pushes[i];
      }
    }
    pos.y = EYE_HEIGHT;
    this.moving = this.velocity.lengthSq() > 0.5;
  }

  // ---------------------------------------------------------------- ilerleme
  updateProgress(dt) {
    this.statsTimer -= dt;
    if (this.statsTimer > 0 || !this.cars.isWashable) return;
    this.statsTimer = 0.1;
    const s = this.cars.stats();
    if (!s) return;
    const layers = {
      mud: Math.min(1, s.mud / THRESHOLDS.mud),
      stain: Math.min(1, s.stain / THRESHOLDS.stain),
      dry: Math.min(1, s.dry / THRESHOLDS.dry),
    };
    const total = layers.mud * 0.4 + layers.stain * 0.4 + layers.dry * 0.2;
    const done = layers.mud >= 1 && layers.stain >= 1 && layers.dry >= 1 && s.foam < 0.02;
    this.hud.setProgress(total, layers, done);
    this.lastStats = { ...s, layers, total };

    // Bağlamsal yönlendirme
    if (!done && total > 0.93 && !this.nearlyHinted) {
      this.nearlyHinted = true;
      this.hud.hint('Neredeyse bitti! Kalan kiri görmek için F', 3.5);
    }
    if (layers.mud >= 1 && layers.stain >= 1 && layers.dry < 1 && !this.dryHinted) {
      this.dryHinted = true;
      this.hud.hint('Tertemiz! Şimdi havluyla [4] kurula', 3);
    }
    if (s.foam >= 0.02 && layers.mud >= 1 && layers.stain >= 1 && !this.rinseHinted) {
      this.rinseHinted = true;
      this.hud.hint('Köpük kaldı — hortumla durula [1]', 3);
    }
    if (done) this.onCarWashed();
  }

  // ---------------------------------------------------------------- döngü
  frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.time += dt;

    const playing = this.controls.isLocked || this.debugPlay;
    this.mouseSpeed = THREE.MathUtils.lerp(this.mouseSpeed, this.mouseDist / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 10));
    this.mouseDist = 0;

    if (playing) {
      this.updatePlayer(dt);
      this.economy.update(dt);
    }
    this.tools.update(dt, {
      firing: playing && this.firing,
      mouseSpeed: this.mouseSpeed,
      moving: playing && this.moving,
      time: this.time,
    });

    this.cars.update(dt, this.time);
    this.updateProgress(dt);

    // Sıradaki müşteri
    if (!this.cars.car && this.waitTimer > 0) {
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) {
        this.cars.spawn(this.economy.shopLevel);
        this.nearlyHinted = this.dryHinted = this.rinseHinted = false;
        this.hud.setProgress(0, null, false);
        this.hud.message('Yeni müşteri geliyor…', 2);
      }
    }

    // Islak araçtan damlalar
    this.dripTimer -= dt;
    if (this.dripTimer <= 0) {
      this.dripTimer = 0.03;
      const p = this._drip || (this._drip = new THREE.Vector3());
      if (this.cars.randomWetPoint(p)) this.effects.drip(p);
    }

    this.effects.update(dt);
    this.env.update(this.time);
    this.hud.update(dt);
    this.composer.render();
  }

  // ---------------------------------------------------------------- debug
  exposeDebug() {
    window.game = {
      instance: this,
      cleanAll: () => this.cars.cleanAll(),
      addMoney: (n = 1000) => this.economy.addMoney(n),
      setLevel: (l) => this.applyLevel(l),
      stats: () => this.lastStats,
      play: (on = true) => (this.debugPlay = on),
      fire: (on = true) => (this.firing = on),
      tool: (i) => this.tools.select(i),
      teleport: (x, z, lookX = 0, lookY = 1, lookZ = 0) => {
        this.camera.position.set(x, EYE_HEIGHT, z);
        this.camera.lookAt(lookX, lookY, lookZ);
      },
    };
  }
}

new Game().init().catch((err) => {
  console.error(err);
  document.querySelector('#loading p').textContent = 'Bir hata oluştu: ' + err.message;
});
