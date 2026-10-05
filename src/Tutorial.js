/**
 * İlk açılış rehberi: 5 adımlık kontrol listesi. Adımlar oyunun gerçek durumundan (hareket, temizlik adımları,
 * teslim) algılanır; bitince ya da "Atla" ile `state.tutorialDone` kaydedilir. Ayarlar'dan yeniden oynatılabilir.
 */
const STEPS = [
  { id: 'move', text: (t) => (t ? 'Joystick ile yürü, ekranı sürükleyip etrafa bak' : 'WASD ile yürü, fareyle etrafa bak'), done: (c) => c.moved >= 2.5 },
  { id: 'mud', text: (t) => (t ? 'KULLAN ile su tabancasıyla çamuru sök' : 'Sol tık basılı: su tabancasıyla çamuru sök'), done: (c) => c.steps && ((c.steps.mud ?? 0) >= 1 || c.mudGain >= 0.25) },
  { id: 'foam', text: (t) => (t ? 'Köpük düğmesiyle aracı köpükle kapla' : '2 tuşu: köpük tabancasıyla aracı kapla'), done: (c) => (c.steps?.foam ?? 0) >= 1 },
  { id: 'rinse', text: (t) => (t ? 'Su düğmesiyle köpüğü durula' : '1 tuşu: suyla köpüğü durula'), done: (c) => (c.steps?.rinse ?? 0) >= 1 },
  { id: 'deliver', text: (t) => (t ? 'Araç temizlenince teslim olur (erken: T düğmesi)' : 'Temizlenince araç teslim olur (erken: T)'), done: (c) => c.delivered },
];

export class Tutorial {
  constructor({ game }) {
    this.game = game;
    this.el = document.getElementById('tutorial');
    this.list = document.getElementById('tutorial-list');
    this.moved = 0;
    this.delivered = false;
    this.index = 0;
    this.active = false;
    this.last = null;
    document.getElementById('tutorial-skip').addEventListener('click', () => this.finish(false));
    if (!game.economy.state.tutorialDone) this.start();
  }

  start() {
    this.active = true;
    this.index = 0;
    this.moved = 0;
    this.delivered = false;
    this.last = null;
    this.mudBase = null;
    this.el.classList.remove('hidden');
    this.render();
  }

  render() {
    const touch = this.game.touchMode;
    this.list.innerHTML = STEPS.map((s, i) =>
      `<li class="${i < this.index ? 'done' : i === this.index ? 'now' : ''}"><i>${i < this.index ? '✓' : i + 1}</i><span>${s.text(touch)}</span></li>`).join('');
  }

  onDelivered() {
    this.delivered = true;
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const p = g.camera.position;
    if (this.last) this.moved += Math.hypot(p.x - this.last.x, p.z - this.last.z);
    this.last = { x: p.x, z: p.z };
    const steps = g.lastStats?.steps;
    if (steps && this.mudBase == null) this.mudBase = steps.mud ?? 0;
    const ctx = { moved: this.moved, steps, delivered: this.delivered, mudGain: steps ? (steps.mud ?? 0) - (this.mudBase ?? 0) : 0 };
    let changed = false;
    // Teslim edilmiş araç tüm kalan adımları kapatır
    while (this.index < STEPS.length && (this.delivered || STEPS[this.index].done(ctx))) {
      this.index++;
      changed = true;
      g.audio.ding(Math.min(this.index, 5));
    }
    if (changed) {
      if (this.index >= STEPS.length) this.finish(true);
      else this.render();
    }
  }

  finish(completed) {
    this.active = false;
    this.el.classList.add('hidden');
    const st = this.game.economy.state;
    st.tutorialDone = true;
    this.game.economy.save();
    if (completed) {
      this.game.hud.toast('🎓 Rehber tamam', 'Artık hazırsın — iyi işler!');
      this.game.audio.complete();
    }
  }
}
