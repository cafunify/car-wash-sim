import { LAYERS } from './Packages.js';

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
  /** def: elindeki alet (TOOL_DEFS öğesi) ya da null */
  setHeldTool(def) {
    this.heldEl.innerHTML = def
      ? `<span class="icon">${def.icon}</span><span><b>${def.name}</b><small>Sol tık: kullan · Q: rafa bırak</small></span>`
      : `<span class="icon empty">✋</span><span><b>Elin boş</b><small>Aracın yanındaki raftan bir alet al (E)</small></span>`;
    this.heldEl.classList.toggle('empty', !def);
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
  /** Paketin katmanlarına göre temizlik göstergelerini kur */
  setPackage(pkg) {
    this.layersEl.innerHTML = pkg.layers
      .map((id) => `<div class="layer" data-layer="${id}"><i style="background:${LAYERS[id].color}"></i><span>${LAYERS[id].label}</span><b>0%</b></div>`)
      .join('');
    this.layerEls = {};
    for (const el of this.layersEl.children) this.layerEls[el.dataset.layer] = el;
    this.layersEl.classList.toggle('many', pkg.layers.length > 4);
  }

  /** layers: { katman: 0..1 } (eşiğe göre normalize) */
  setProgress(total, layers, complete) {
    const pct = Math.floor(total * 100);
    this.progressPct.textContent = `${pct}%`;
    this.progressFill.style.width = `${total * 100}%`;
    this.progressFill.style.backgroundPosition = `${-(1 - total) * 300}px 0`;
    this.progressPanel.classList.toggle('complete', !!complete);
    for (const [k, el] of Object.entries(this.layerEls)) {
      const v = layers ? layers[k] ?? 0 : 0;
      el.querySelector('b').textContent = `${Math.floor(v * 100)}%`;
      el.classList.toggle('done', v >= 1);
    }
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
