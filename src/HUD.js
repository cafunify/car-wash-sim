import { STEPS } from './Packages.js';

/**
 * DOM tabanlı HUD: temizlik barı, elindeki alet, müşteri, para, bildirimler.
 */
export class HUD {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.root = this.$('hud');
    this.progressPanel = this.$('progress-panel');
    this.progressPct = this.$('progress-pct');
    this.progressFill = this.$('progress-fill');
    this.layersEl = this.$('layers');
    this.layerEls = {};
    this.stepHintEl = this.$('step-hint');
    this.crosshair = this.$('crosshair');
    this.heldEl = this.$('held-tool');
    this.promptEl = this.$('prompt');
    this.toolHint = this.$('tool-hint');
    this.toasts = this.$('toasts');
    this.centerMsg = this.$('center-msg');
    this.moneyPanel = this.$('money-panel');
    this.moneyEl = this.$('money');
    this.shownMoney = 0;
    this.targetMoney = 0;
    this.hintTimer = 0;
    this.centerTimer = 0;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  // ---------------------------------------------------------------- aletler
  /** def: elindeki alet (TOOL_DEFS öğesi) */
  setHeldTool(def) {
    const sub = def.holster
      ? `Sol tık: kullan · <kbd>1</kbd> Su <kbd>2</kbd> Köpük`
      : 'Sol tık: kullan · <kbd>Q</kbd> rafa bırak';
    this.heldEl.innerHTML = `<span class="icon">${def.icon}</span><span><b>${def.name}</b><small>${sub}</small></span>`;
  }

  /** Adım tamamlanınca adım çipi kısa süre parlar */
  pulseStep(id) {
    const el = this.layerEls[id];
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  /** Nişangâhın altında etkileşim ipucu; null gizler */
  setPrompt(html) {
    if (html === this.lastPrompt) return;
    this.lastPrompt = html;
    this.promptEl.innerHTML = html || '';
    this.promptEl.classList.toggle('show', !!html);
  }

  setCrosshair(state) {
    this.crosshair.classList.toggle('on-target', state === 'target');
    this.crosshair.classList.toggle('out-of-range', state === 'far');
  }

  /** Serbest fare modunda nişangâh imleci izler; null → ekran ortası */
  setCrosshairPos(x, y) {
    this.crosshair.style.left = x == null ? '' : `${x}px`;
    this.crosshair.style.top = y == null ? '' : `${y}px`;
  }

  hint(text, duration = 2.2) {
    this.toolHint.textContent = text;
    this.toolHint.classList.add('show');
    this.hintTimer = duration;
  }

  message(text, duration = 2.5) {
    this.centerMsg.innerHTML = text;
    this.centerMsg.classList.add('show');
    this.centerTimer = duration;
  }

  // ---------------------------------------------------------------- ilerleme
  /** Paketin adımlarını sıralı görev listesi olarak kur */
  setPackage(pkg) {
    this.layersEl.innerHTML = pkg.steps
      .map((id, i) => `<div class="step" data-step="${id}" style="--c:${STEPS[id].color}"><i>${i + 1}</i><span>${STEPS[id].label}</span><b>0%</b></div>`)
      .join('<em>➔</em>');
    this.layerEls = {};
    for (const el of this.layersEl.querySelectorAll('.step')) this.layerEls[el.dataset.step] = el;
    this.setStepHint('');
  }

  /** steps: { adım: 0..1 }, current: sıradaki adım */
  setProgress(total, steps, current, complete) {
    const pct = Math.floor(total * 100);
    this.progressPct.textContent = `${pct}%`;
    this.progressFill.style.width = `${total * 100}%`;
    this.progressFill.style.backgroundPosition = `${-(1 - total) * 300}px 0`;
    this.progressPanel.classList.toggle('complete', !!complete);
    for (const [k, el] of Object.entries(this.layerEls)) {
      const v = steps ? steps[k] ?? 0 : 0;
      el.querySelector('b').textContent = v >= 1 ? '✓' : `${Math.floor(v * 100)}%`;
      el.classList.toggle('done', v >= 1);
      el.classList.toggle('current', k === current);
    }
    if (complete) this.setStepHint('Tertemiz! Müşteri aracını teslim alıyor ✨');
  }

  setStepHint(html) {
    if (html === this.lastStepHint) return;
    this.lastStepHint = html;
    this.stepHintEl.innerHTML = html ? `<span class="arrow">▶</span> ${html}` : '';
  }

  // ---------------------------------------------------------------- müşteri
  setCustomer(name, carName, pay, pkg) {
    this.$('customer-name').textContent = `${name} · ${carName}`;
    this.$('customer-pay').textContent = `~$${pay}`;
    const badge = this.$('customer-pkg');
    badge.textContent = pkg.name;
    badge.style.setProperty('--c', pkg.color);
    badge.classList.remove('hidden');
  }

  setTimer(secondsLeft, frac) {
    const s = Math.ceil(secondsLeft);
    this.$('customer-time').textContent = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Bitti';
    const fill = this.$('timer-fill');
    fill.style.width = `${frac * 100}%`;
    fill.classList.toggle('expired', s <= 0);
  }

  clearCustomer() {
    this.$('customer-name').textContent = 'Müşteri bekleniyor…';
    this.$('customer-pay').textContent = '—';
    this.$('customer-time').textContent = '—';
    this.$('timer-fill').style.width = '100%';
    this.$('customer-pkg').classList.add('hidden');
  }

  // ---------------------------------------------------------------- para
  setMoney(value, animate) {
    this.targetMoney = value;
    if (!animate) {
      this.shownMoney = value;
      this.moneyEl.textContent = value.toLocaleString('tr-TR');
    } else {
      this.moneyPanel.classList.remove('bump');
      void this.moneyPanel.offsetWidth;
      this.moneyPanel.classList.add('bump');
    }
  }

  setWashed(n) {
    this.$('washed-count').textContent = n;
  }

  // ---------------------------------------------------------------- gün / itibar
  setDay(day, cars, perDay, rep) {
    this.$('day-label').textContent = `Gün ${day}`;
    this.$('day-cars').textContent = `${cars}/${perDay} araç`;
    this.$('rep-stars').innerHTML = starBar(rep);
    this.$('rep-value').textContent = rep.toFixed(1);
  }

  /** Teslimde önce/sonra fotoğrafı, puan ve müşteri yorumu (oyunu durdurmaz) */
  showDelivery({ before, after, customer, carName, stars, comment, total, tip, repDelta }) {
    const card = this.$('delivery-card');
    const photo = card.querySelector('.dc-photo');
    photo.classList.toggle('no-photo', !before || !after);
    card.querySelector('.dc-before').src = before || '';
    card.querySelector('.dc-after').src = after || '';
    card.querySelector('.dc-name').textContent = `${customer} · ${carName}`;
    card.querySelector('.dc-stars').innerHTML = starBar(stars, true);
    card.querySelector('.dc-comment').textContent = `“${comment}”`;
    card.querySelector('.dc-pay').innerHTML = `+$${total}${tip > 0 ? ` <small>bahşiş $${tip}</small>` : ''}`;
    const rd = card.querySelector('.dc-rep');
    rd.textContent = `İtibar ${repDelta >= 0 ? '▲' : '▼'} ${Math.abs(repDelta).toFixed(2)}`;
    rd.className = `dc-rep ${repDelta >= 0 ? 'up' : 'down'}`;
    // Animasyonu baştan oynat
    card.classList.add('hidden');
    void card.offsetWidth;
    card.classList.remove('hidden');
    clearTimeout(this.deliveryTimer);
    this.deliveryTimer = setTimeout(() => card.classList.add('hidden'), 7000);
  }

  /** Gün sonu raporu; entries: [{ after, customer, carName, stars, total, pkg }] */
  showDayReport({ day, today, rep, entries, perDay }) {
    const avg = today.stars.length ? today.stars.reduce((a, b) => a + b, 0) / today.stars.length : 0;
    const delta = rep - today.repStart;
    const perfect = today.stars.filter((s) => s === 5).length;
    this.$('report-title').textContent = `Gün ${day} tamamlandı`;
    this.$('report-rep-stars').innerHTML = starBar(rep);
    const rd = this.$('report-rep-delta');
    rd.textContent = `İtibar ${rep.toFixed(1)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`;
    rd.className = delta >= 0 ? 'up' : 'down';
    this.$('report-stats').innerHTML = [
      ['💵', 'Kazanç', `$${today.earned.toLocaleString('tr-TR')}`],
      ['⏱', 'Bahşiş', `$${today.tips.toLocaleString('tr-TR')}`],
      ['🚗', 'Araç', `${today.cars}/${perDay}`],
      ['⭐', 'Ortalama puan', avg.toFixed(1)],
      ['✨', 'Kusursuz iş', `${perfect}`],
    ].map(([i, l, v]) => `<div><span>${i}</span><small>${l}</small><b>${v}</b></div>`).join('');
    this.$('report-cars').innerHTML = entries.map((e) => `
      <figure>
        ${e.after ? `<img src="${e.after}" alt="" />` : '<div class="ph"></div>'}
        <figcaption><b>${e.customer}</b><span style="color:${e.pkg.color}">${e.pkg.name}</span>
        <em>${starBar(e.stars, true)}</em><i>+$${e.total}</i></figcaption>
      </figure>`).join('');
    const tip = avg >= 4.5 ? 'Harika bir gün! Yüksek itibar daha pahalı paketler ve daha yüksek ücret getirir.'
      : avg >= 3.5 ? 'İyi iş. Bahşiş süresi dolmadan eksiksiz teslim 5 yıldız getirir.'
      : 'Erken teslim ve gecikmeler itibarını düşürüyor — eksik yer haritasına göz at.';
    this.$('report-tip').textContent = tip;
    this.$('day-report').classList.remove('hidden');
  }

  hideDayReport() {
    this.$('day-report').classList.add('hidden');
  }

  get reportOpen() {
    return !this.$('day-report').classList.contains('hidden');
  }

  toast(text, sub = '', cls = '') {
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.toasts.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  update(dt) {
    if (this.shownMoney !== this.targetMoney) {
      const diff = this.targetMoney - this.shownMoney;
      const step = Math.sign(diff) * Math.max(1, Math.abs(diff) * dt * 4);
      this.shownMoney = Math.abs(step) >= Math.abs(diff) ? this.targetMoney : Math.round(this.shownMoney + step);
      this.moneyEl.textContent = this.shownMoney.toLocaleString('tr-TR');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.toolHint.classList.remove('show');
    }
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) this.centerMsg.classList.remove('show');
    }
  }
}

/** 1–5 arası (kesirli) puanı yıldız dizisine çevir */
function starBar(value, whole = false) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const fill = whole ? (value >= i ? 1 : 0) : Math.max(0, Math.min(1, value - (i - 1)));
    html += `<i class="star" style="--f:${Math.round(fill * 100)}%">★</i>`;
  }
  return html;
}
