/** Açılış yükleme göstergesi: aşama bazlı gerçek ilerleme, aşama süreleri ve dönen ipuçları */
const TIPS = [
  '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ile gez, <kbd>Shift</kbd> ile koş.',
  'Su ile çamuru sök ➔ köpükle kapla ➔ su ile durula.',
  'Köpüğü biraz beklet: lekeleri çözer, durulama hepsini götürür.',
  '<kbd>F</kbd> ile kalan kiri gör: turuncu kir, mor kuş pisliği/böcek, mavi ıslaklık.',
  'Kuş pisliği kurumadan söküldüğünde müşteri 5 yıldız verir.',
  'Alt kısımlar için <kbd>C</kbd> ile çömel, tekrar basınca kalk.',
  '<kbd>Tab</kbd> ile mağazayı aç: yeni aletler ve paketler orada.',
  'Aracı erken göndermek için <kbd>T</kbd>; eksik temizlik ücretten kesilir.',
  'İtibarın yükseldikçe ücretler ve premium müşteriler artar.',
];

/** Giriş ekranı içeriği pencereye sığmıyorsa (küçük pencere, tarayıcı yakınlaştırması) orantılı küçült; kaydırma çubuğu çıkmaz */
export function fitStartScreen() {
  const layout = document.querySelector('.start-layout');
  if (!layout || !layout.clientHeight) return;
  let fit = 1;
  layout.style.setProperty('--fit', fit);
  while ((layout.scrollHeight > layout.clientHeight + 1 || layout.scrollWidth > layout.clientWidth + 1) && fit > 0.45) {
    fit = Math.round((fit - 0.04) * 100) / 100;
    layout.style.setProperty('--fit', fit);
  }
}

export class LoadScreen {
  constructor() {
    this.root = document.getElementById('loader');
    this.fill = document.getElementById('load-fill');
    this.pct = document.getElementById('load-pct');
    this.stage = document.getElementById('load-stage');
    this.tip = document.getElementById('load-tip');
    this.startBtn = document.getElementById('start-btn');
    this.t0 = performance.now();
    this.last = this.t0;
    this.tipIndex = Math.floor(Math.random() * TIPS.length);
    this.showTip();
    this.timer = setInterval(() => this.nextTip(), 4200);
    fitStartScreen();
    window.addEventListener('resize', fitStartScreen);
  }

  /** value: 0..1 toplam ilerleme, text: yapılan iş */
  step(value, text) {
    const now = performance.now();
    console.debug(`[yükleme] ${this.stage.textContent} ${(now - this.last).toFixed(0)} ms`);
    this.last = now;
    const v = Math.max(0, Math.min(1, value));
    this.fill.style.width = `${v * 100}%`;
    this.pct.textContent = `${Math.round(v * 100)}%`;
    this.stage.textContent = text;
    this.startBtn.textContent = `Yükleniyor… %${Math.round(v * 100)}`;
  }

  showTip() {
    this.tip.innerHTML = TIPS[this.tipIndex % TIPS.length];
  }

  nextTip() {
    this.tip.classList.add('fade');
    setTimeout(() => {
      this.tipIndex++;
      this.showTip();
      this.tip.classList.remove('fade');
    }, 350);
  }

  /** Her şey hazır: göstergeyi kapat, düğmeleri aç */
  done() {
    clearInterval(this.timer);
    this.step(1, 'Hazır');
    console.debug(`[yükleme] toplam ${(performance.now() - this.t0).toFixed(0)} ms`);
    const screen = document.getElementById('start-screen');
    setTimeout(() => {
      this.root.classList.add('done');
      screen.classList.remove('loading');
      fitStartScreen();
    }, 350);
    setTimeout(fitStartScreen, 900); // yükleme göstergesi kapandıktan sonra yeniden ölç
    this.startBtn.disabled = false;
    this.startBtn.textContent = 'Tıkla ve Başla';
    screen.querySelectorAll('.open-settings, .open-ach, .open-album').forEach((b) => (b.disabled = false));
  }

  fail(message) {
    clearInterval(this.timer);
    this.stage.textContent = 'Bir hata oluştu: ' + message;
    this.stage.style.color = '#ff6b6b';
  }
}
