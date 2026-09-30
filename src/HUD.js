/**
 * DOM tabanlı HUD: temizlik barı, araç çubuğu, müşteri, para, bildirimler.
 */
export class HUD {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.root = this.$('hud');
    this.progressPanel = this.$('progress-panel');
    this.progressPct = this.$('progress-pct');
    this.progressFill = this.$('progress-fill');
    this.layerEls = {
      mud: this.progressPanel.querySelector('[data-layer="mud"]'),
      stain: this.progressPanel.querySelector('[data-layer="stain"]'),
      dry: this.progressPanel.querySelector('[data-layer="dry"]'),
    };
    this.crosshair = this.$('crosshair');
    this.toolbar = this.$('toolbar');
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

  // ---------------------------------------------------------------- araçlar
  buildToolbar(tools) {
    this.toolbar.innerHTML = tools
      .map((t, i) => `<div class="tool-slot" data-i="${i}"><span class="key">${i + 1}</span><span class="icon">${t.icon}</span><span class="name">${t.short}</span></div>`)
      .join('');
    this.slots = [...this.toolbar.children];
  }

  setActiveTool(index, lockedFlags) {
    this.slots.forEach((el, i) => {
      el.classList.toggle('active', i === index);
      el.classList.toggle('locked', !!lockedFlags[i]);
    });
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
  /** layers: { mud, stain, dry } ilerleme (0..1, eşiğe göre normalize) */
  setProgress(total, layers, complete) {
    const pct = Math.floor(total * 100);
    this.progressPct.textContent = `${pct}%`;
    this.progressFill.style.width = `${total * 100}%`;
    this.progressFill.style.backgroundPosition = `${-(1 - total) * 300}px 0`;
    this.progressPanel.classList.toggle('complete', !!complete);
    for (const k of ['mud', 'stain', 'dry']) {
      const el = this.layerEls[k];
      const v = layers ? layers[k] : 0;
      el.querySelector('b').textContent = `${Math.floor(v * 100)}%`;
      el.classList.toggle('done', v >= 1);
    }
  }

  // ---------------------------------------------------------------- müşteri
  setCustomer(name, carName, pay) {
    this.$('customer-name').textContent = `${name} · ${carName}`;
    this.$('customer-pay').textContent = `~$${pay}`;
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
