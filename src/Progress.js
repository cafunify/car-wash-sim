/**
 * Günlük hedefler ve başarımlar. Sayaçlar `economy.state.life`, açılan başarımlar `state.ach`,
 * günlük hedef `state.goal` içinde saklanır (eski kayıtlar varsayılanlarla birleşir).
 */
export const GOALS = [
  { id: 'stars4', text: '3 müşteriye en az 4★ aldır', target: 3, reward: 40, hit: (d) => d.stars >= 4 },
  { id: 'perfect', text: '2 kusursuz (5★) iş çıkar', target: 2, reward: 50, hit: (d) => d.stars === 5 },
  { id: 'tips', text: '3 teslimde bahşiş kazan', target: 3, reward: 40, hit: (d) => d.tip > 0 },
  { id: 'spots', text: '2 kuş/böcekli aracı temizle', target: 2, reward: 50, hit: (d) => d.hadSpots && d.complete },
  { id: 'cars', text: 'Günün 6 müşterisini tamamla', target: 6, reward: 60, hit: () => true },
];

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🚗', name: 'İlk müşteri', desc: 'İlk aracı teslim et', test: (s) => s.life.cars >= 1 },
  { id: 'star5', icon: '⭐', name: 'Beş yıldız', desc: 'İlk kez 5★ al', test: (s) => s.life.perfect >= 1 },
  { id: 'ten', icon: '🧽', name: 'Çırak çıktı', desc: '10 araç yıka', test: (s) => s.life.cars >= 10 },
  { id: 'fifty', icon: '🏁', name: 'Usta eli', desc: '50 araç yıka', test: (s) => s.life.cars >= 50 },
  { id: 'perfect5', icon: '✨', name: 'Kusursuz', desc: '5 kusursuz (5★) iş çıkar', test: (s) => s.life.perfect >= 5 },
  { id: 'bird', icon: '🐦', name: 'Kuş pisliği ustası', desc: '5 kuş/böcekli aracı temizle', test: (s) => s.life.spots >= 5 },
  { id: 'tar', icon: '🛠', name: 'Katran avcısı', desc: '5 katranlı aracı temizle', test: (s) => s.life.tar >= 5 },
  { id: 'tipper', icon: '💸', name: 'Bahşiş avcısı', desc: '10 teslimde bahşiş kazan', test: (s) => s.life.tipCars >= 10 },
  { id: 'rich', icon: '💰', name: 'Cep dolusu', desc: 'Toplam $2000 kazan', test: (s) => s.totalEarned >= 2000 },
  { id: 'rep', icon: '🌟', name: 'Mahallenin gözdesi', desc: 'İtibarını 4.5★ yap', test: (s) => s.rep >= 4.5 },
  { id: 'streak', icon: '🔥', name: 'Seri', desc: 'Üst üste 3 müşteriye ≥4★ aldır', test: (s) => s.life.bestStreak >= 3 },
  { id: 'upgrade', icon: '🛠', name: 'Yatırımcı', desc: 'İlk yükseltmeni al', test: (s) => Object.values(s.levels).some((v) => v > 0) },
  { id: 'day', icon: '🌇', name: 'Gün sonu', desc: 'Bir günü tamamla', test: (s) => s.life.days >= 1 },
];

export class Progress {
  constructor({ economy, hud, audio }) {
    this.economy = economy;
    this.hud = hud;
    this.audio = audio;
    this.ensureGoal();
    this.renderGoal();
    this.bindPanel();
  }

  get state() {
    return this.economy.state;
  }

  /** Günün hedefini seç (gün değiştiyse ya da hedef yoksa) */
  ensureGoal() {
    const st = this.state;
    if (st.goal && st.goal.day === st.day) return;
    const g = GOALS[(Math.random() * GOALS.length) | 0];
    st.goal = { id: g.id, day: st.day, progress: 0, done: false };
    this.economy.save();
    this.renderGoal();
  }

  renderGoal() {
    const g = this.state.goal;
    const def = GOALS.find((x) => x.id === g?.id);
    if (!def) return this.hud.setGoal('', false);
    this.hud.setGoal(`🎯 ${def.text} · ${g.done ? 'tamam ✓' : `${g.progress}/${def.target}`}`, g.done);
  }

  /** Teslimden sonra: sayaçlar, günlük hedef, başarımlar. d: { stars, tip, complete, hadSpots } */
  onDelivery(d) {
    const st = this.state;
    const life = st.life;
    life.cars += 1;
    if (d.stars === 5) life.perfect += 1;
    if (d.tip > 0) life.tipCars += 1;
    if (d.hadSpots && d.complete) life.spots += 1;
    if (d.hadTar && d.complete) life.tar += 1;
    life.streak = d.stars >= 4 ? life.streak + 1 : 0;
    life.bestStreak = Math.max(life.bestStreak, life.streak);

    const g = st.goal;
    const def = GOALS.find((x) => x.id === g?.id);
    if (def && !g.done && def.hit(d)) {
      g.progress = Math.min(def.target, g.progress + 1);
      if (g.progress >= def.target) {
        g.done = true;
        this.economy.addMoney(def.reward);
        this.audio.upgrade();
        this.hud.toast('🎯 Günlük hedef tamam', `+$${def.reward} · ${def.text}`);
      }
    }
    this.renderGoal();
    this.check();
  }

  onDayEnd() {
    this.state.life.days += 1;
    this.check();
  }

  /** Yeni açılan başarımları ver */
  check() {
    const st = this.state;
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (st.ach[a.id] || !a.test(st)) continue;
      st.ach[a.id] = true;
      any = true;
      this.hud.toast(`🏆 Başarım: ${a.name}`, a.desc);
      this.audio.upgrade();
    }
    if (any) this.economy.save();
  }

  // ---------------------------------------------------------------- başarım paneli
  bindPanel() {
    const panel = document.getElementById('ach');
    document.querySelectorAll('.open-ach').forEach((b) => b.addEventListener('click', () => {
      this.renderList();
      panel.classList.remove('hidden');
      this.audio.click();
    }));
    document.getElementById('ach-close').addEventListener('click', () => {
      panel.classList.add('hidden');
      this.audio.click();
    });
  }

  renderList() {
    const st = this.state;
    const n = ACHIEVEMENTS.filter((a) => st.ach[a.id]).length;
    document.getElementById('ach-count').textContent = `${n}/${ACHIEVEMENTS.length}`;
    document.getElementById('ach-list').innerHTML = ACHIEVEMENTS.map((a) => `
      <div class="ach-item ${st.ach[a.id] ? 'got' : ''}">
        <span class="ach-icon">${st.ach[a.id] ? a.icon : '🔒'}</span>
        <div><b>${a.name}</b><small>${a.desc}</small></div>
      </div>`).join('');
  }
}
