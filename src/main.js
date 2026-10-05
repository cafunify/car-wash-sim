import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Environment, WALK_BOUNDS, ROOM } from './Environment.js';
import { REGIONS } from './DirtVolume.js';
import { WEATHERS } from './Weather.js';
import { classifyGpu, gpuName, levelFromMs, benchmarkMs, deviceInfo, LEVEL_NAMES, LEVELS } from './Perf.js';
import { CarManager } from './CarManager.js';
import { CAR_CATALOG } from './CarModels.js';
import { Effects } from './Particles.js';
import { Tools, TOOL_DEFS, toolIndex } from './Tools.js';
import { DecorView, decorById } from './Decor.js';
import { Album } from './Album.js';
import { pickRegular, recordVisit, lineFor } from './Regulars.js';
import { EconomyManager, SHOP_LEVEL_NAMES, CARS_PER_DAY } from './EconomyManager.js';
import { HUD } from './HUD.js';
import { AudioManager } from './Audio.js';
import { ToolRack } from './ToolRack.js';
import { Snapshot } from './Snapshot.js';
import { LoadScreen, fitStartScreen } from './LoadScreen.js';
import { TouchControls } from './TouchControls.js';
import { Progress } from './Progress.js';
import { Tutorial } from './Tutorial.js';
import { PACKAGES, STEPS, pickPackage, packageProgress } from './Packages.js';

const _regionBox = new THREE.Box3();
const EYE_HEIGHT = 1.68;
const CROUCH_HEIGHT = 1.02;
const WALK_SPEED = 3.3;
const RUN_SPEED = 5.6;
const PLAYER_RADIUS = 0.32;
// Kuş pisliği bu kadar saniye araçta kalırsa kurur: teslimde müşteri puanı 1 yıldız düşer
const BIRD_ETCH_TIME = 90;


/** Grafik kalitesi ön ayarları */
const QUALITY = {
  low: { pixelRatio: 0.7, shadows: 0, bloom: false, reflections: false, particles: 0.4, note: 'Gölge, parlama ve yansıma kapalı, düşük çözünürlük — zayıf ekran kartları için' },
  medium: { pixelRatio: 1, shadows: 1024, bloom: true, reflections: false, particles: 0.7, note: 'Dengeli: gölge ve parlama açık, yansıtıcı zemin kapalı' },
  high: { pixelRatio: Math.min(window.devicePixelRatio, 1.75), shadows: 2048, bloom: true, reflections: true, particles: 1, note: 'Tüm efektler açık — güçlü ekran kartları için' },
};

class Game {
  constructor() {
    this.timer = new THREE.Timer();
    this.debugPlay = false;
    this.time = 0;
    this.keys = new Set();
    this.deliverArmed = 0; // T ile teslim onayı için ilk basış zamanı
    this.crouchToggle = false; // C bir kez basınca çömelir, tekrar basınca kalkar
    this.firing = false;
    this.mouseDist = 0;
    this.mouseSpeed = 0;
    this.touchMode = false;
    this.touch = null;
    this.velocity = new THREE.Vector3();
    this.statsTimer = 0;
    this.dripTimer = 0;
    this.waitTimer = 0;
    this.lastStats = null;
    this.started = false;
    this.eye = EYE_HEIGHT;
  }

  async init() {
    const load = (this.load = new LoadScreen());
    load.step(0.04, 'Yazı tipleri yükleniyor…');
    await document.fonts.ready;
    load.step(0.1, 'Sahne kuruluyor…');

    // ------------------------------------------------ renderer + sahne
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false; // efekt geçişleri dahil kare başına toplam çizim sayısı
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
    load.step(0.18, 'Garaj kuruluyor…');
    this.hud = new HUD();
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.audio = new AudioManager();
    this.env = new Environment(scene, renderer);
    this.effects = new Effects(scene);
    this.economy = new EconomyManager(this.hud, this.audio, { onUpgrade: (id, lvl) => this.onUpgrade(id, lvl) });
    this.autoQualityPick(); // sahne kurulmadan önce GPU/CPU sezgisiyle başlangıç seviyesi
    this.cars = new CarManager(scene, {
      renderer,
      camera,
      onArrived: (car) => this.onCarArrived(car),
      onLeft: () => this.onCarLeft(),
    });
    // İlk araç modelini garaj kurulurken paralel indir
    const preloading = this.cars.preload(this.economy.shopLevel);
    load.step(0.4, 'Aletler ve raf hazırlanıyor…');
    this.snapshot = new Snapshot(renderer, scene);
    this.dayEntries = [];
    this.pendingShot = null;
    this.progress = new Progress({ economy: this.economy, hud: this.hud, audio: this.audio });
    // Gün bitmiş ama rapor kapatılmadan sayfa yenilendiyse yeni güne geç
    if (this.economy.dayOver) this.economy.startNextDay();
    this.tools = new Tools({
      camera,
      scene,
      carManager: this.cars,
      effects: this.effects,
      audio: this.audio,
      economy: this.economy,
      hud: this.hud,
    });
    this.rack = new ToolRack(scene, { tools: this.tools, economy: this.economy });
    this.tools.onChange = (i) => {
      this.hud.setHeldTool(TOOL_DEFS[i]);
      this.rack.refresh();
    };
    this.hud.setHeldTool(TOOL_DEFS[this.tools.index]);
    this.audio.musicOn = this.economy.state.settings.music;
    this.applyCosmetics();
    this.applySettings();
    this.knownPackages = new Set(this.economy.packages.map((p) => p.id));

    load.step(0.6, 'Garaj ışıkları yerleştiriliyor…');
    this.applyLevel(this.economy.shopLevel);
    load.step(0.7, 'Cihaz ölçülüyor…');
    this.probeQuality();
    load.step(0.75, 'Araç modeli indiriliyor…');
    await preloading;
    load.step(0.88, 'Boya ve ışıklar derleniyor…');
    this.spawnCar();
    await this.cars.car.ready;
    this.hud.message('Müşteri geliyor…<br><small>Su ve köpük tabancası belinde (1/2) · diğer aletler sağdaki rafta</small>', 4);

    this.bindInput();
    this.bindSettings();
    this.decor = new DecorView(scene, ROOM.halfX);
    this.album = new Album({ economy: this.economy, audio: this.audio });
    this.album.onChange = () => this.decor.setPhotos(this.album.best());
    this.applyDecor();
    this.tutorial = new Tutorial({ game: this });
    load.done();
    this.showAutoNote();
    renderer.setAnimationLoop(() => this.frame());
    this.exposeDebug();
  }

  // ---------------------------------------------------------------- olaylar
  /** Ağır araç hazırlığından önce geçiş kartını göster (donma hissi yerine animasyon), sonra aracı üret */
  beginArrival() {
    const card = document.getElementById('arrival');
    const shownAt = performance.now();
    card.classList.remove('hidden');
    this.spawning = true;
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      this.spawnCar();
      try { await this.cars.car?.ready; } catch { /* derleme hatası geçişi bloklamaz */ }
      const wait = Math.max(0, 900 - (performance.now() - shownAt));
      setTimeout(() => { card.classList.add('hidden'); this.spawning = false; }, wait);
    }));
  }

  spawnCar() {
    this.lastStats = null;
    const pkg = pickPackage(this.economy.owns, this.economy.state.rep);
    const reg = pickRegular(this.economy.state, this.economy.shopLevel, (id) => this.cars.templates.has(id));
    const car = this.cars.spawn(this.economy.shopLevel, pkg, reg?.car, { tar: this.economy.level('claybar') > 0, weather: this.economy.state.weather, regular: reg });
    this.applyCosmetics();
    // Araca özel paket: kuş pisliği / böcek yoksa "Kuş/Böcek" adımı yok
    this.hud.setPackage(car.package);
    this.hud.setProgress(0, null, car.package.steps[0], false);
    this.hints = new Set();
  }

  /** Pembe nano köpük ve şampuan gücü: aktif araca ve efektlere uygula */
  applyCosmetics() {
    const pink = this.economy.pinkFoam;
    const rgb = pink ? [1.0, 0.55, 0.82] : [0.97, 0.98, 1.0];
    this.effects.setFoamColor(rgb);
    this.cars.car?.volume.uniforms.uFoamColor.value.setRGB(...(pink ? [1.0, 0.58, 0.84] : [0.94, 0.96, 1.0]));
    this.cars.soakRate = 0.04 * this.economy.shampoo;
  }

  onCarArrived(car) {
    this.economy.startCustomer(car);
    this.pendingShot = { kind: 'before', car };
    this.audio.carArrive();
    // F ipucu kutusu ilk araçlarda kısa süre vurgulanır
    if ((this.scanPulses = (this.scanPulses || 0) + 1) <= 2) {
      const hint = document.getElementById('scan-hint');
      hint.classList.remove('pulse');
      void hint.offsetWidth;
      hint.classList.add('pulse');
    }
    const steps = car.package.steps.map((id) => STEPS[id].label).join(' ➔ ');
    const story = car.regular ? lineFor(this.economy.state, car.regular) : null;
    const ev = story ? `🏘 <b>${car.customer}</b> geldi! <small>(${story.visit}. ziyaret)</small><br><small>${story.arrive}</small>` : car.event ? `${car.event.icon} <b>${car.event.name}</b> geldi! (ücret ×${car.event.pay})` : `<b>${car.customer}</b> ${car.def.name} ile geldi!`;
    const rq = this.economy.customer?.req ? `<br><small>İstek: ${this.economy.customer.req.label} — ${this.economy.customer.req.desc}</small>` : '';
    this.hud.message(`${ev}<br><small>${car.package.name}: ${steps}</small>${rq}`, 5);
  }

  /** Aracı teslim et. progress < 1 ise erken teslim: eksik her %1 için 2$ kesilir */
  onCarWashed(progress = 1) {
    const car = this.cars.car;
    this.deliverArmed = 0;
    const res = this.economy.payout(progress, { etched: car?.birdEtched });
    // "Sonra" fotoğrafı bu karenin sonunda çekilir, teslim kartı onunla açılır
    if (res && car?.regular) this.onRegularDelivered(car, res);
    if (res) {
      this.pendingShot = { kind: 'after', car, res };
      this.progress.onDelivery({ stars: res.stars, tip: res.tip, complete: res.complete, hadSpots: !!car?.package.steps.includes('spots'), hadTar: !!car?.package.steps.includes('tar'), eventCar: !!car?.event, bonus: res.bonus });
      this.tutorial?.onDelivered();
    }
    this.rack.setHighlight(null);
    if (res?.complete) {
      this.cars.complete(true);
      this.audio.complete();
      const box = this.cars.worldBox(new THREE.Box3());
      if (box) this.effects.sparkleBurst(box);
      this.hud.toast(`+$${res.total}`, `${car.package.name}${res.tip > 0 ? ` · bahşiş +$${res.tip} ⏱` : ` · ${car.customer} memnun!`}${res.bonus > 0 ? ` · ${res.req.label} bonusu +$${res.bonus}` : ''}`);
      this.hud.setProgress(1, Object.fromEntries(car.package.steps.map((l) => [l, 1])), null, true);
    } else if (res) {
      this.cars.complete(false);
      this.hud.toast(`+$${res.total}`, `Erken teslim · %${100 - res.missing} temiz · kesinti -$${res.penalty}`, 'warn');
      this.hud.setStepHint(`${car.customer} aracını eksik temizlikle teslim aldı`);
    }
  }

  /** Dekor: tabela yazısı, posterler, bitkiler, radyo */
  applyDecor() {
    const d = this.economy.state.decor;
    this.env.setSignText(d.sign);
    this.decor.apply(d);
    this.audio.setStation(d.radio);
    this.decor.setPhotos(this.album?.best() || []);
  }

  /** Müdavim teslimi: hikâye ilerler, ≥3★ ile teşekkür yorumu, son ziyarette hediye */
  onRegularDelivered(car, res) {
    const r = recordVisit(this.economy.state, car.regular);
    if (res.stars >= 3) res.comment = r.thanks;
    if (r.gift) {
      this.economy.addMoney(r.gift);
      const names = [r.decor, r.memory].filter((id) => id && this.economy.giveDecor(id)).map((id) => decorById(id).name);
      const gift = names.length ? ` · ${names.join(' ve ')} dükkânına eklendi` : '';
      this.hud.toast(`🏘 ${car.customer} hikâyesi tamam`, `Küçük bir teşekkür: +$${r.gift}${gift}`);
    }
    this.economy.save();
  }

  /** Kare sonunda (ana çizimden önce) bekleyen önce/sonra fotoğrafını çek */
  takePendingShot() {
    const shot = this.pendingShot;
    if (!shot) return;
    this.pendingShot = null;
    const fx = this.effects;
    const hide = [this.tools.view, this.tools.cloth?.mesh, fx.water.points, fx.foam.points, fx.sparkle.points, fx.waterJet.mesh, fx.foamJet.mesh];
    const img = this.snapshot.capture(shot.car, hide);
    if (shot.kind === 'before') {
      shot.car.beforeShot = img;
      return;
    }
    const { car, res } = shot;
    this.album.record({ car, res, before: car.beforeShot, after: img });
    this.dayEntries.push({ after: img, customer: car.customer, carName: car.def.name, stars: res.stars, total: res.total, pkg: car.package });
    this.hud.showDelivery({
      before: car.beforeShot, after: img, customer: car.customer, carName: car.def.name,
      stars: res.stars, comment: res.comment, total: res.total, tip: res.tip, repDelta: res.repDelta,
    });
  }

  /** Araç çıktı: gün bittiyse rapor, değilse sıradaki müşteri */
  onCarLeft() {
    if (this.economy.dayOver) this.endDay();
    else this.waitTimer = 1.2;
  }

  endDay() {
    this.dayEnded = true;
    this.progress.onDayEnd();
    this.firing = false;
    this.keys.clear();
    this.audio.complete();
    const st = this.economy.state;
    this.hud.showDayReport({ day: st.day, today: st.today, rep: st.rep, entries: this.dayEntries, perDay: CARS_PER_DAY, weather: st.weather });
    if (this.controls.isLocked) this.controls.unlock();
    else this.freeActive = false;
  }

  startNextDay() {
    this.dayEnded = false;
    this.dayEntries = [];
    this.hud.hideDayReport();
    this.economy.startNextDay();
    this.progress.ensureGoal();
    this.audio.click();
    if (this.freeMode) this.enterFree();
    else this.requestLock();
    this.waitTimer = 1.2;
    const w = WEATHERS[this.economy.state.weather];
    this.hud.message(`${w.icon} Gün ${this.economy.state.day} başladı · ${w.label}<br><small>${w.note || `Bugün ${CARS_PER_DAY} müşteri gelecek`} · itibarın ${this.economy.state.rep.toFixed(1)} ★</small>`, 4);
  }

  /** T: teslim (tam temizse hemen; eksikse ilk basışta ücret önizlemesi, ikinci basışta onay) */
  deliver() {
    if (!this.cars.isWashable) return this.hud.hint('Teslim edilecek araç yok', 1.5);
    const progress = this.lastStats?.total ?? 0;
    if (progress >= 0.999) return this.onCarWashed(1);
    const q = this.economy.quote(progress);
    if (this.deliverArmed && this.time - this.deliverArmed < 3.5) return this.onCarWashed(progress);
    this.deliverArmed = this.time;
    this.hud.message(
      `Aracı şimdi teslim et? <b>%${100 - q.missing}</b> temiz<br><small>Eksik %${q.missing} × $2 = <b>-$${q.penalty}</b> kesinti · ödeme <b>$${q.total}</b> · bahşiş yok<br>Onaylamak için <kbd>T</kbd> tuşuna tekrar bas</small>`,
      3.5,
    );
  }

  // ---------------------------------------------------------------- ayarlar
  applySettings() {
    const st = this.economy.state.settings;
    this.audio.setVolumes({ music: st.musicVol / 100, sfx: st.sfxVol / 100 });
    this.controls.pointerSpeed = st.sens / 100;
    this.lookSpeed = 0.0035 * (st.sens / 100);
    this.applyQuality(st.quality);
    document.getElementById('fps').classList.toggle('hidden', !st.fps);
    this.setTouchMode(!!st.touch);
  }

  /** Mobil kontroller: dokunmatik arayüzü aç/kapat (Ayarlar) */
  setTouchMode(on) {
    this.touchMode = on;
    document.body.classList.toggle('touch-mode', on);
    if (on && !this.touch) this.touch = new TouchControls(this);
    if (!on) {
      this.touch?.setVisible(false);
      if (!this.freeActive) this.freeMode = false; // fare kilidi akışına dön
    }
  }

  /** Parmakla bakış (TouchControls): yaw/pitch, hassasiyet ayarıyla ölçeklenir */
  touchLook(dx, dy, boost = 1) {
    const q = this.camera.quaternion;
    this.lookEuler.setFromQuaternion(q);
    this.lookEuler.y -= dx * this.lookSpeed * boost;
    this.lookEuler.x = THREE.MathUtils.clamp(this.lookEuler.x - dy * this.lookSpeed * boost, -1.5, 1.5);
    q.setFromEuler(this.lookEuler);
    this.mouseDist += Math.hypot(dx, dy);
  }

  /** İlk açılışta (otomatik mod): GPU adı + CPU/RAM sezgisiyle seviye seç */
  autoQualityPick() {
    const st = this.economy.state.settings;
    if (!st.qualityAuto || st.qualityProbed) return;
    const gpu = gpuName(this.renderer.getContext());
    const cls = classifyGpu(gpu, deviceInfo());
    st.quality = cls.level;
    st.qualityProbed = { gpu, cap: cls.level, reason: cls.reason, ms: null };
    this.economy.save();
  }

  /** Garaj kurulduktan sonra kısa ölçüm: yavaşsa seviye düşer (zaten düşükse atlanır) */
  probeQuality() {
    const st = this.economy.state.settings;
    const pr = st.qualityProbed;
    if (!st.qualityAuto || !pr || pr.ms != null) return;
    this.applyQuality(st.quality);
    if (st.quality === 'low' && pr.cap === 'low') {
      pr.ms = 0; // en düşük seviyede ölçüm gereksiz
    } else {
      const ms = benchmarkMs(() => this.composer.render(), this.renderer.getContext());
      pr.ms = Math.round(ms * 10) / 10;
      const lvl = levelFromMs(st.quality, ms);
      if (lvl !== st.quality) {
        st.quality = lvl;
        this.applyQuality(lvl);
      }
    }
    this.economy.save();
  }

  /** Giriş ekranında otomatik seçimi bildir */
  showAutoNote() {
    const st = this.economy.state.settings;
    const el = document.getElementById('auto-quality-note');
    if (!el || !st.qualityAuto || !st.qualityProbed) return;
    el.textContent = `⚙ Cihazına göre ${LEVEL_NAMES[st.quality]} grafik seçildi — Ayarlar'dan değiştirebilirsin`;
    el.classList.remove('hidden');
  }

  applyQuality(q) {
    const cfg = QUALITY[q] || QUALITY.medium;
    if (this.quality === q) return;
    this.quality = q;
    const r = this.renderer;
    r.setPixelRatio(cfg.pixelRatio);
    this.composer.setPixelRatio(cfg.pixelRatio);
    r.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    const shadowsOn = cfg.shadows > 0;
    if (r.shadowMap.enabled !== shadowsOn) {
      r.shadowMap.enabled = shadowsOn;
      // Gölge açılıp kapanınca malzemelerin yeniden derlenmesi gerekir
      this.scene.traverse((o) => {
        if (!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
      });
    }
    this.env.setShadows(cfg.shadows);
    this.env.setReflections(cfg.reflections);
    this.bloom.enabled = cfg.bloom;
    this.effects.density = cfg.particles;
    this.effects.resize(window.innerHeight * cfg.pixelRatio / Math.min(window.devicePixelRatio, 1.75));
  }

  bindSettings() {
    const $ = (id) => document.getElementById(id);
    const panel = $('settings');
    const st = this.economy.state.settings;
    const sliders = [['set-music', 'musicVol', '%'], ['set-sfx', 'sfxVol', '%'], ['set-sens', 'sens', '%']];
    const refresh = () => {
      for (const [id, key, unit] of sliders) {
        $(id).value = st[key];
        $(`${id}-v`).textContent = `${st[key]}${unit}`;
      }
      for (const b of $('set-quality').children) b.classList.toggle('on', b.dataset.q === 'auto' ? !!st.qualityAuto : b.dataset.q === st.quality);
      $('set-quality-note').textContent = QUALITY[st.quality].note;
      $('set-fps').checked = st.fps;
      $('set-touch').checked = !!st.touch;
    };
    const commit = () => {
      this.economy.save();
      this.applySettings();
      refresh();
    };
    for (const [id, key] of sliders) {
      $(id).addEventListener('input', (e) => {
        st[key] = Number(e.target.value);
        commit();
      });
    }
    $('set-quality').addEventListener('click', (e) => {
      const q = e.target.closest('button')?.dataset.q;
      if (!q) return;
      if (q === 'auto') {
        // Yeniden ölç: GPU sezgisi + kısa benchmark
        st.qualityAuto = true;
        st.qualityProbed = null;
        this.autoQualityPick();
        this.probeQuality();
        this.showAutoNote();
      } else {
        st.quality = q;
        st.qualityAuto = false; // elle seçim otomatiği kapatır
      }
      commit();
      this.audio.click();
    });
    $('set-fps').addEventListener('change', (e) => { st.fps = e.target.checked; commit(); });
    $('set-tutorial').addEventListener('click', () => {
      st.tutorialDone = false;
      this.economy.save();
      this.tutorial.start();
      panel.classList.add('hidden');
      this.audio.click();
    });
    $('set-touch').addEventListener('change', (e) => { st.touch = e.target.checked; commit(); });
    document.querySelectorAll('.open-settings').forEach((b) => b.addEventListener('click', () => {
      refresh();
      panel.classList.remove('hidden');
      this.audio.init();
    }));
    $('settings-close').addEventListener('click', () => panel.classList.add('hidden'));
    refresh();
  }

  toggleFps() {
    const st = this.economy.state.settings;
    st.fps = !st.fps;
    this.economy.save();
    this.applySettings();
  }

  /** Otomatik moddayken FPS 6 sn boyunca <24 kalırsa seviyeyi bir kademe düşür */
  guardFps(fps) {
    const st = this.economy.state.settings;
    if (!st.qualityAuto || !this.active || this.time < 15 || document.hidden) { this.lowFpsTime = 0; return; }
    this.lowFpsTime = fps < 24 ? (this.lowFpsTime || 0) + 0.5 : 0;
    if (this.lowFpsTime < 6) return;
    this.lowFpsTime = 0;
    const i = LEVELS.indexOf(st.quality);
    if (i <= 0) return;
    st.quality = LEVELS[i - 1];
    this.economy.save();
    this.applyQuality(st.quality);
    this.hud.toast('⚙ Grafik düşürüldü', `Akıcılık için ${LEVEL_NAMES[st.quality]} seviyesine geçildi`, 'warn');
  }

  updateFps(dt) {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 0.5) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.guardFps(fps);
    if (!this.economy.state.settings.fps) return;
    const info = this.renderer.info.render;
    document.getElementById('fps').textContent =
      `${Math.round(fps)} FPS · ${(1000 / fps).toFixed(1)} ms\n${info.calls} çizim · ${(info.triangles / 1000).toFixed(0)}k üçgen · ${this.quality}`;
  }

  onUpgrade(id, level) {
    if (id === 'decor' || id === 'reset') this.applyDecor?.();
    if (id === 'shop' || id === 'reset') this.applyLevel(this.economy.shopLevel);
    if (id === 'reset') this.progress.ensureGoal();
    else this.progress?.check();
    if (id === 'reset' && this.tools.onRack && this.tools.isLocked(this.tools.index)) this.tools.putDown();
    this.rack.refresh();
    this.applyCosmetics();
    if (id === 'pinkfoam' && level) this.hud.toast(this.economy.pinkFoam ? 'Pembe Nano Köpük 🌸' : 'Klasik köpük', this.economy.pinkFoam ? 'Köpük tabancan artık pembe' : '', 'info');
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
      if (this.touchMode) {
        // Dokunmatik: fare kilidi yok; tam ekran + yatay yön (en iyi çabayla)
        document.documentElement.requestFullscreen?.().catch(() => {});
        screen.orientation?.lock?.('landscape').catch(() => {});
        this.enterFree();
      } else if (this.freeMode) this.enterFree();
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
      if (!this.economy.shopOpen && !this.dayEnded) this.showStart('Devam Et');
    });
    document.getElementById('report-next').addEventListener('click', () => this.startNextDay());
    document.getElementById('report-shop').addEventListener('click', () => {
      this.hud.hideDayReport();
      this.economy.openShop();
      this.audio.click();
    });

    document.getElementById('shop-close').addEventListener('click', () => this.closeShop());
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('Tüm para ve yükseltmeler silinsin mi?')) this.economy.reset();
    });

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return; // tabela yazısı yazılırken oyun tuşları çalışmasın
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
      if (e.code === 'KeyC') this.crouchToggle = !this.crouchToggle;
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyQ') {
        if (this.tools.putDown()) this.hud.hint('Alet rafa bırakıldı', 1.2);
        else this.hud.hint('Tabancalar belinde — 1: Su · 2: Köpük', 1.8);
      }
      if (e.code === 'KeyT') this.deliver();
      if (e.code === 'KeyP') this.toggleFps();
      if (e.code === 'Digit1') this.tools.selectGun(0);
      if (e.code === 'Digit2') this.tools.selectGun(1);
      if (e.code === 'KeyN') {
        const on = this.audio.setMusic(!this.audio.musicOn);
        this.economy.setSetting('music', on);
        this.hud.hint(on ? 'Müzik açık 🎵' : 'Müzik kapalı', 1.2);
      }
      if (e.code === 'KeyF') {
        this.cars.pulseHighlight();
        this.hud.hint('Kir tarayıcı: turuncu = kir, mor = kuş pisliği/böcek, mavi = ıslak');
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
      if (!this.active || this.touchMode) return;
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
      if (!this.freeActive || this.touchMode) return;
      this.mouseDist += Math.hypot(e.movementX, e.movementY);
      // Serbest fare: araç imlecin gösterdiği yere nişan alır
      this.aim.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.hud.setCrosshairPos(e.clientX, e.clientY);
      // Sağ tuş basılıyken sürükleyerek etrafa bak
      if (this.looking) {
        const q = this.camera.quaternion;
        this.lookEuler.setFromQuaternion(q);
        this.lookEuler.y -= e.movementX * this.lookSpeed;
        this.lookEuler.x = THREE.MathUtils.clamp(this.lookEuler.x - e.movementY * this.lookSpeed, -1.5, 1.5);
        q.setFromEuler(this.lookEuler);
      }
    });

    window.addEventListener('resize', () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.effects.resize(h * (QUALITY[this.quality]?.pixelRatio ?? 1) / Math.min(window.devicePixelRatio, 1.75));
    });
  }

  showStart(label) {
    document.getElementById('start-btn').textContent = label;
    document.getElementById('start-screen').classList.remove('hidden');
    fitStartScreen();
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
    if (!this.touchMode) document.body.classList.add('free-mouse');
    this.aim.set(0, 0);
    this.hud.setCrosshairPos(null);
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
    // Gün sonu raporundan açıldıysa rapora dön
    if (this.dayEnded) {
      document.getElementById('day-report').classList.remove('hidden');
      return;
    }
    if (this.freeMode) {
      this.freeActive = true;
      return;
    }
    // Tarayıcı hemen tekrar kilitlemeye izin vermeyebilir; başarısız olursa başlangıç ekranı görünür
    this.requestLock();
    setTimeout(() => {
      if (!this.active && !this.economy.shopOpen && !this.dayEnded) this.showStart('Devam Et');
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
    const swap = this.tools.onRack ? ` <small>(${TOOL_DEFS[this.tools.index].short} rafa döner)</small>` : '';
    this.hud.setPrompt(`<kbd>E</kbd> ${def.name} al${swap}`);
  }

  interact() {
    const h = this.rackHover;
    if (!h && this.decor.nearCat(this.camera.position)) {
      this.decor.purr();
      return this.hud.toast('🐈 Mırr…', 'Kedi gözünü bile açmadan mırıldandı', 'info');
    }
    if (!h) return this.hud.hint('Aletler aracın sağındaki rafta — rafa bakıp E\'ye bas', 2.5);
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
    const crouch = this.crouchToggle;
    const tm = this.touchMode && this.touch ? this.touch.move : null;
    if (tm) input.add(tm);
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || (tm && tm.length() > 0.92);
    const speed = crouch ? WALK_SPEED * 0.5 : running ? RUN_SPEED : WALK_SPEED;
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
    // Çömelme: göz hizası yumuşakça iner (etekler, alt kısım ve lastikler için)
    this.eye += ((crouch ? CROUCH_HEIGHT : EYE_HEIGHT) - this.eye) * (1 - Math.exp(-dt * 10));
    pos.y = this.eye;
    this.crouching = crouch;
    this.moving = this.velocity.lengthSq() > 0.5;
  }

  // ---------------------------------------------------------------- ilerleme
  updateProgress(dt) {
    this.statsTimer -= dt;
    if (this.statsTimer > 0 || !this.cars.isWashable) return;
    this.statsTimer = 0.1;
    const s = this.cars.stats();
    if (!s) return;
    const car = this.cars.car;
    const { steps, current, total, done } = packageProgress(car.package, s, car.latch);
    this.hud.setProgress(total, steps, current, done);
    this.lastStats = { ...s, steps, current, total };
    if (!done) this.stepFeedback(car, steps);
    this.regionFeedback(car, s);
    this.audio.setDrips(Math.min(1, (1 - s.dry) * 1.5));
    // Duraklatma ve mağazadayken kuş pisliği kurumaz (müşteri zamanlayıcısı gibi)
    if (this.active || this.debugPlay) this.updateBirdTimer(car, s, 0.1);
    this.guide(current, s);
    if (done) this.onCarWashed();
  }

  /** Adım bitince çip parlar ve "ding" çalar (adım başta zaten bitikse tetiklenmez) */
  stepFeedback(car, steps) {
    const seen = car.stepSeen || (car.stepSeen = {});
    for (const id of Object.keys(steps)) {
      if (steps[id] < 1) seen[id] = 'open';
      else if (seen[id] === 'open') {
        seen[id] = 'done';
        this.hud.pulseStep(id);
        this.audio.ding(3);
      }
    }
  }

  /** Aracın bir bölgesi (kaput, yan, tampon...) temizlenince küçük parıltı + ding + bildirim */
  regionFeedback(car, s) {
    const f = s.regionFrac;
    if (!f) return;
    const v = car.volume;
    const st = car.regionState || (car.regionState = new Array(REGIONS.length).fill(0)); // 0 bekliyor, 1 tamam, 2 baştan temiz
    if (!car.regionInit) {
      car.regionInit = true;
      for (let k = 0; k < REGIONS.length; k++) if (v.regionCount[k] < 25 || f[k] >= 0.8) st[k] = 2;
    }
    for (let k = 0; k < REGIONS.length; k++) {
      if (st[k] !== 0 || f[k] < 0.93) continue;
      st[k] = 1;
      car.regionsDone = (car.regionsDone || 0) + 1;
      this.audio.ding(Math.min(car.regionsDone - 1, 4));
      this.effects.sparkleBurst(_regionBox.copy(v.regionBox[k]).translate(car.root.position), 30);
      this.hud.toast(`✓ ${REGIONS[k].label}`, 'pırıl pırıl', 'region');
    }
  }

  /** Kuş pisliği araçta bekledikçe kurur: önce uyarı, süre dolunca teslimde puan cezası */
  updateBirdTimer(car, s, dt) {
    if (car.birdEtched || s.bird >= STEPS.spots.threshold) return;
    car.birdTime = (car.birdTime || 0) + dt;
    if (!car.birdWarned && car.birdTime > BIRD_ETCH_TIME * 0.65) {
      car.birdWarned = true;
      this.hud.toast('Kuş pisliği kuruyor!', 'Çabuk temizle, yoksa müşteri memnun kalmaz', 'warn');
    }
    if (car.birdTime > BIRD_ETCH_TIME) {
      car.birdEtched = true;
      this.hud.toast('Kuş pisliği kurudu', 'Teslimde müşteri puanı 1 yıldız düşecek', 'warn');
    }
  }

  /** Sıradaki adıma yönlendir: panelde ipucu, gerekli alet rafta parlar */
  guide(current, s) {
    if (!current) return;
    const step = STEPS[current];
    const tool = TOOL_DEFS.find((t) => t.id === step.tool);
    const holding = this.tools.def?.id === tool.id;
    let how;
    if (holding) how = `<b>${tool.name}</b> elinde — sol tık`;
    else if (tool.holster) how = `<kbd>${tool.holster}</kbd> ${tool.name}`;
    else if (this.tools.isLocked(toolIndex(tool.id))) how = `🔒 ${tool.name} — Mağaza`;
    else how = `Raftan <b>${tool.name}</b> al <kbd>E</kbd>`;
    let extra = '';
    if (current === 'rinse' && s.foam < 0.02 && s.stain < STEPS.rinse.threshold) extra = ' · lekeler kaldı: tekrar köpükle';
    if (current === 'dry' && s.foam >= 0.02) extra = ' · önce köpüğü durula';
    if (current === 'tar') extra = ' · temiz, ıslak yüzeyde kille ov (etek ve kapı altı)';
    if (current === 'spots' && s.birdHard > 0.05) extra = ' · kuş pisliği sert: köpükle kapla, biraz beklet';
    if ((current === 'tires' || current === 'rims') && !this.crouching) extra = ' · <kbd>C</kbd> çömel (aç/kapa)';
    this.hud.setStepHint(`${step.long}: ${how}${extra}`);
    this.rack.setHighlight(!tool.holster && !holding ? tool.id : null);
  }

  // ---------------------------------------------------------------- döngü
  frame() {
    this.timer.update();
    this.renderer.info.reset();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.time += dt;

    const playing = this.active || this.debugPlay;
    if (this.touchMode && this.firing) this.mouseDist += 260 * dt; // dokunmatikte ovalama hızı tabanı
    this.touch?.setVisible(this.touchMode && this.active);
    this.mouseSpeed = THREE.MathUtils.lerp(this.mouseSpeed, this.mouseDist / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 10));
    this.mouseDist = 0;

    if (playing) {
      this.tutorial?.update(dt);
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
    this.rack.update(this.time);
    this.decor.update(dt, this.time);
    this.cars.update(dt, this.time);
    this.updateProgress(dt);
    this.audio.update(dt);

    // Sıradaki müşteri
    if (!this.cars.car && this.waitTimer > 0 && !this.spawning) {
      this.waitTimer -= dt;
      if (this.waitTimer <= 0) this.beginArrival();
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
    this.updateFps(dt);
    this.takePendingShot();
    this.composer.render();
  }

  // ---------------------------------------------------------------- debug
  exposeDebug() {
    window.game = {
      instance: this,
      cleanAll: () => this.cars.cleanAll(),
      addMoney: (n = 1000) => this.economy.addMoney(n),
      endDay: () => this.endDay(),
      // Aktif araca kuş pisliği / böcek lekesi ekle (adım yoksa pakete eklenir)
      spots: (bird = 4, bugs = 40) => {
        if (this.cars.addSpots(bird, bugs)) this.hud.setPackage(this.cars.car.package);
        return this.cars.car?.volume.spotCenters.length ?? 0;
      },
      // Kuş pisliği kuruma süresini doldur (teslimde puan cezası)
      etchBird: () => {
        const car = this.cars.car;
        if (car) car.birdTime = BIRD_ETCH_TIME;
      },
      setLevel: (l) => this.applyLevel(l),
      stats: () => this.lastStats,
      play: (on = true) => (this.debugPlay = on),
      fire: (on = true) => (this.firing = on),
      tool: (i) => this.tools.pickUp(i),
      interact: () => this.interact(),
      unlockAll: () => {
        for (const k of ['rimcleaner', 'tireshine', 'glasscleaner', 'polisher', 'claybar', 'pinkfoam']) this.economy.state.levels[k] = 1;
        this.economy.save();
        this.onUpgrade('unlock', 1);
      },
      perf: () => ({ ...this.economy.state.settings.qualityProbed, quality: this.economy.state.settings.quality, auto: this.economy.state.settings.qualityAuto }),
      nextCar: async (pkgId, carId, eventId) => {
        if (carId) await this.cars.loadDef(CAR_CATALOG.find((d) => d.id === carId));
        this.cars.disposeCar();
        const pkg = PACKAGES[pkgId] || pickPackage(this.economy.owns);
        const car = this.cars.spawn(this.economy.shopLevel, pkg, carId, { tar: this.economy.level('claybar') > 0, weather: this.economy.state.weather, event: eventId });
        this.applyCosmetics();
        this.hud.setPackage(car.package);
        this.hints = new Set();
      },
      regular: async (id) => {
        const reg = pickRegular(this.economy.state, this.economy.shopLevel, () => true, id);
        if (!reg) return null;
        await this.cars.loadDef(CAR_CATALOG.find((d) => d.id === reg.car));
        this.cars.disposeCar();
        const car = this.cars.spawn(this.economy.shopLevel, pickPackage(this.economy.owns), reg.car, { weather: this.economy.state.weather, regular: reg });
        this.applyCosmetics();
        this.hud.setPackage(car.package);
        this.hints = new Set();
        return reg.name;
      },
      setWeather: (w) => { this.economy.state.weather = w; this.economy.save(); this.hud.setWeather(w); },
      teleport: (x, z, lookX = 0, lookY = 1, lookZ = 0) => {
        this.camera.position.set(x, this.eye, z);
        this.camera.lookAt(lookX, lookY, lookZ);
      },
    };
  }
}

new Game().init().catch((err) => {
  console.error(err);
  document.getElementById('load-stage').textContent = 'Bir hata oluştu: ' + err.message;
});
