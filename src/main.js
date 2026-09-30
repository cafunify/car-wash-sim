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
import { ToolRack } from './ToolRack.js';
import { PACKAGES, LAYERS, pickPackage, packageProgress } from './Packages.js';

const EYE_HEIGHT = 1.68;
const WALK_SPEED = 3.3;
const RUN_SPEED = 5.6;
const PLAYER_RADIUS = 0.32;


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
      renderer,
      camera,
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
    this.rack = new ToolRack(scene, { tools: this.tools, economy: this.economy });
    this.tools.onChange = (i) => {
      this.hud.setHeldTool(TOOL_DEFS[i] || null);
      this.rack.refresh();
    };
    this.hud.setHeldTool(null);
    this.knownPackages = new Set(this.economy.packages.map((p) => p.id));

    this.applyLevel(this.economy.shopLevel);
    await this.cars.preload(this.economy.shopLevel);
    this.spawnCar();
    await this.cars.car.ready;
    this.hud.message('Müşteri geliyor…<br><small>Aletler sağdaki rafta — bak ve E ile al</small>', 3.5);

    this.bindInput();
    document.getElementById('loading').classList.add('hidden');
    renderer.setAnimationLoop(() => this.frame());
    this.exposeDebug();
  }

  // ---------------------------------------------------------------- olaylar
  spawnCar() {
    const pkg = pickPackage(this.economy.owns);
    this.cars.spawn(this.economy.shopLevel, pkg);
    this.hud.setPackage(pkg);
    this.hud.setProgress(0, null, false);
    this.hints = new Set();
  }

  onCarArrived(car) {
    this.economy.startCustomer(car);
    this.audio.carArrive();
    const extra = car.package.id === 'standart' ? 'Önce hortumla çamuru sök' : `${car.package.name} istiyor: jant, lastik ve cam da dahil${car.package.id === 'premium' ? ' + cila' : ''}`;
    this.hud.message(`<b>${car.customer}</b> ${car.def.name} ile geldi!<br><small>${extra}</small>`, 3.5);
  }

  onCarWashed() {
    const car = this.cars.car;
    const res = this.economy.payout();
    this.cars.complete();
    this.audio.complete();
    const box = this.cars.worldBox(new THREE.Box3());
    if (box) this.effects.sparkleBurst(box);
    if (res) this.hud.toast(`+$${res.total}`, `${car.package.name}${res.tip > 0 ? ` · bahşiş +$${res.tip} ⏱` : ` · ${car.customer} memnun!`}`);
    this.hud.setProgress(1, Object.fromEntries(car.package.layers.map((l) => [l, 1])), true);
  }

  onUpgrade(id, level) {
    if (id === 'shop' || id === 'reset') this.applyLevel(this.economy.shopLevel);
    if (id === 'reset' && this.tools.index >= 0 && this.tools.isLocked(this.tools.index)) this.tools.putDown();
    this.rack.refresh();
    const tool = TOOL_DEFS.find((t) => t.unlock === id);
    if (tool) this.hud.toast(`${tool.name}`, 'Raftaki yerini aldı', 'info');
    if (id === 'shop') this.hud.toast(`${SHOP_LEVEL_NAMES[level]}`, 'Yeni araç tipleri geliyor!', 'info');
    // Yeni açılan paket duyurusu
    for (const p of this.economy.packages) {
      if (!this.knownPackages.has(p.id)) {
        this.knownPackages.add(p.id);
        setTimeout(() => this.hud.toast(`${p.name} açıldı!`, `Müşteriler artık ×${p.mult} kazançlı paket isteyebilir`, 'info'), 900);
      }
    }
    if (id === 'reset') this.knownPackages = new Set(this.economy.packages.map((p) => p.id));
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
    const wasVisible = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    const prevEnv = this.scene.environment;
    this.scene.environment = null;
    const rt = this.pmrem.fromScene(this.scene, 0.015, 0.1, 80, { position: new THREE.Vector3(0, 1.3, 0), size: 256 });
    this.scene.environment = rt.texture;
    this.envTarget?.dispose();
    if (!this.envTarget) prevEnv?.dispose();
    this.envTarget = rt;
    hidden.forEach((o, i) => (o.visible = wasVisible[i]));
  }

  // ---------------------------------------------------------------- girdi
  /** Oyun girdiyi alıyor mu? (fare kilidi ya da serbest fare modu) */
  get active() {
    return this.controls.isLocked || this.freeActive;
  }

  bindInput() {
    const startBtn = document.getElementById('start-btn');
    this.freeMode = false; // fare kilidi desteklenmiyorsa true
    this.freeActive = false;
    this.looking = false;
    this.aim = new THREE.Vector2(0, 0);
    this.lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    startBtn.addEventListener('click', () => {
      this.audio.init();
      if (this.freeMode) this.enterFree();
      else this.requestLock();
    });

    this.controls.addEventListener('lock', () => {
      this.freeMode = false;
      this.freeActive = false;
      this.aim.set(0, 0);
      this.hud.setCrosshairPos(null);
      document.body.classList.remove('free-mouse');
      this.hideStart();
      this.economy.closeShop();
    });
    this.controls.addEventListener('unlock', () => {
      this.firing = false;
      this.keys.clear();
      if (!this.economy.shopOpen) this.showStart('Devam Et');
    });

    document.getElementById('shop-close').addEventListener('click', () => this.closeShop());
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('Tüm para ve yükseltmeler silinsin mi?')) this.economy.reset();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;

      if (e.code === 'Tab' || (e.code === 'KeyE' && this.economy.shopOpen)) {
        if (this.economy.shopOpen) this.closeShop();
        else if (this.active) this.openShop();
        return;
      }
      if (e.code === 'Escape' && this.freeActive) {
        this.pauseFree();
        return;
      }
      if (!this.active) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyQ' && this.tools.putDown()) this.hud.hint('Alet rafa bırakıldı', 1.2);
      if (e.code === 'KeyF') {
        this.cars.pulseHighlight();
        this.hud.hint('Kir tarayıcı: turuncu = kir, mavi = ıslak');
      }
      if (e.code === 'KeyM') this.hud.hint(this.audio.toggleMute() ? 'Ses kapalı' : 'Ses açık', 1.2);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.firing = false;
      this.looking = false;
      this.keys.clear();
    });

    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (e.button === 0) this.firing = true;
      if (e.button === 2 && this.freeActive) this.looking = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
      if (e.button === 2) this.looking = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.controls.isLocked) {
        this.mouseDist += Math.hypot(e.movementX, e.movementY);
        return;
      }
      if (!this.freeActive) return;
      this.mouseDist += Math.hypot(e.movementX, e.movementY);
      // Serbest fare: araç imlecin gösterdiği yere nişan alır
      this.aim.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.hud.setCrosshairPos(e.clientX, e.clientY);
      // Sağ tuş basılıyken sürükleyerek etrafa bak
      if (this.looking) {
        const q = this.camera.quaternion;
        this.lookEuler.setFromQuaternion(q);
        this.lookEuler.y -= e.movementX * 0.0035;
        this.lookEuler.x = THREE.MathUtils.clamp(this.lookEuler.x - e.movementY * 0.0035, -1.5, 1.5);
        q.setFromEuler(this.lookEuler);
      }
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

  showStart(label) {
    document.getElementById('start-btn').textContent = label;
    document.getElementById('start-screen').classList.remove('hidden');
  }

  hideStart() {
    document.getElementById('start-screen').classList.add('hidden');
    this.hud.show();
    this.started = true;
  }

  /** Fare kilidi iste; ortam desteklemiyorsa serbest fare moduna geç */
  requestLock() {
    const fail = (err) => {
      // Kilitten yeni çıkıldıysa tarayıcı kısa bir süre yeniden kilitlemeye izin vermez
      if (/exited|too soon|before this request/i.test(err?.message || '')) this.showStart('Bir saniye bekle ve tekrar tıkla');
      else this.enterFree(true);
    };
    try {
      const p = document.body.requestPointerLock();
      p?.catch?.(fail);
    } catch (err) {
      fail(err);
    }
  }

  /** Fare kilidi olmadan oyna: sağ tuşla sürükleyerek bak, imleçle nişan al */
  enterFree(announce = false) {
    this.freeMode = true;
    this.freeActive = true;
    document.body.classList.add('free-mouse');
    this.hideStart();
    this.economy.closeShop();
    if (announce) this.hud.message('Fare kilidi kullanılamıyor<br><small>Sağ tuşla sürükleyerek etrafa bak · Sol tık ile temizle · Esc: duraklat</small>', 5);
  }

  pauseFree() {
    this.freeActive = false;
    this.firing = false;
    this.looking = false;
    this.keys.clear();
    this.showStart('Devam Et');
  }

  openShop() {
    this.economy.openShop();
    this.audio.click();
    this.firing = false;
    this.looking = false;
    if (this.controls.isLocked) this.controls.unlock();
    else this.freeActive = false;
  }

  closeShop() {
    this.economy.closeShop();
    this.audio.click();
    if (this.freeMode) {
      this.freeActive = true;
      return;
    }
    // Tarayıcı hemen tekrar kilitlemeye izin vermeyebilir; başarısız olursa başlangıç ekranı görünür
    this.requestLock();
    setTimeout(() => {
      if (!this.active && !this.economy.shopOpen) this.showStart('Devam Et');
    }, 400);
  }

  // ---------------------------------------------------------------- raf etkileşimi
  updateRackHover() {
    const rc = this.tools.raycaster; // Tools bu karede kamera/nişan ışınını kurdu
    const h = this.active || this.debugPlay ? this.rack.raycast(rc) : null;
    this.rackHover = h;
    if (!h) return this.hud.setPrompt(null);
    if (h.shop) return this.hud.setPrompt('<kbd>E</kbd> Mağazayı aç');
    const def = TOOL_DEFS[h.tool];
    if (this.tools.index === h.tool) return this.hud.setPrompt(`<kbd>E</kbd> ${def.short} rafa bırak`);
    if (this.tools.isLocked(h.tool)) return this.hud.setPrompt(`<span class="locked">🔒 ${def.name} — $${this.economy.costOf(def.unlock)} · Mağaza (Tab)</span>`);
    const swap = this.tools.index >= 0 ? ` <small>(${TOOL_DEFS[this.tools.index].short} rafa döner)</small>` : '';
    this.hud.setPrompt(`<kbd>E</kbd> ${def.name} al${swap}`);
  }

  interact() {
    const h = this.rackHover;
    if (!h) {
      if (this.tools.index < 0) this.hud.hint('Aletler aracın yanındaki rafta — rafa bakıp E\'ye bas', 2.5);
      return;
    }
    if (h.shop) return this.openShop();
    if (this.tools.index === h.tool) this.tools.putDown();
    else this.tools.pickUp(h.tool);
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

    // Araç ve rafla çarpışma (XZ düzleminde AABB itmesi)
    const boxes = [this.rack.collider];
    const carBox = this.cars.worldBox(this._box || (this._box = new THREE.Box3()));
    if (carBox) boxes.push(carBox);
    for (const box of boxes) {
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
    const pkg = this.cars.car.package;
    const { layers, total, done } = packageProgress(pkg, s);
    this.hud.setProgress(total, layers, done);
    this.lastStats = { ...s, layers, total };
    this.audio.setDrips(Math.min(1, (1 - s.dry) * 1.5));

    // Bağlamsal yönlendirme (her araçta bir kez)
    const hintOnce = (key, cond, text, dur = 3) => {
      if (cond && !this.hints.has(key)) {
        this.hints.add(key);
        this.hud.hint(text, dur);
      }
    };
    const washed = layers.mud >= 1 && layers.stain >= 1;
    hintOnce('nearly', !done && total > 0.93, 'Neredeyse bitti! Kalan yerleri görmek için F', 3.5);
    hintOnce('rinse', s.foam >= 0.02 && washed, 'Köpük kaldı — hortumla durula');
    hintOnce('dry', washed && layers.dry < 1 && s.foam < 0.02, 'Tertemiz! Şimdi havluyla kurula');
    const details = ['rims', 'tires', 'glass'].filter((l) => l in layers && layers[l] < 1).map((l) => LAYERS[l].label.toLowerCase());
    hintOnce('details', washed && layers.dry >= 1 && details.length, `Sırada detaylar: ${details.join(', ')}`, 3.5);
    hintOnce('polish', 'polish' in layers && washed && layers.dry >= 1 && !details.length && layers.polish < 1, 'Son dokunuş: cila makinesiyle boyayı parlat', 3.5);
    if (done) this.onCarWashed();
  }

  // ---------------------------------------------------------------- döngü
  frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.time += dt;

    const playing = this.active || this.debugPlay;
    this.mouseSpeed = THREE.MathUtils.lerp(this.mouseSpeed, this.mouseDist / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 10));
    this.mouseDist = 0;

    if (playing) {
      this.updatePlayer(dt);
      this.economy.update(dt);
    }
    this.tools.update(dt, {
      firing: playing && this.firing,
      aim: this.freeActive ? this.aim : null,
      mouseSpeed: this.mouseSpeed,
      moving: playing && this.moving,
      time: this.time,
    });

    this.updateRackHover();
    this.cars.update(dt, this.time);
    this.updateProgress(dt);
    this.audio.update(dt);

    // Sıradaki müşteri
    if (!this.cars.car && this.waitTimer > 0) {
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) {
        this.spawnCar();
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
      tool: (i) => this.tools.pickUp(i),
      interact: () => this.interact(),
      unlockAll: () => {
        for (const k of ['foam', 'rimcleaner', 'tireshine', 'glasscleaner', 'polisher']) this.economy.state.levels[k] = 1;
        this.economy.save();
        this.onUpgrade('unlock', 1);
      },
      nextCar: (pkgId) => {
        this.cars.disposeCar();
        const pkg = PACKAGES[pkgId] || pickPackage(this.economy.owns);
        this.cars.spawn(this.economy.shopLevel, pkg);
        this.hud.setPackage(pkg);
        this.hints = new Set();
      },
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
