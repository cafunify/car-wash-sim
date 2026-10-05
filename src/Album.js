import { CAR_CATALOG } from './CarModels.js';
import { REGULARS, visitsOf } from './Regulars.js';

/**
 * Garaj albümü: ≥4★ işlerin önce/sonra fotoğrafları (ayrı localStorage anahtarı, ana kaydı şişirmez),
 * yıkanan araç modelleri koleksiyonu ve müdavim kartları.
 */
const ALBUM_KEY = 'parilti-oto-yikama-album';
const MAX_PHOTOS = 18;

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export class Album {
  constructor({ economy, audio }) {
    this.economy = economy;
    this.audio = audio;
    this.photos = this.load();
    this.bind();
  }

  load() {
    try {
      const a = JSON.parse(localStorage.getItem(ALBUM_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }

  save() {
    // Kota dolarsa en eski fotoğrafı atıp tekrar dene; olmazsa sessizce vazgeç
    for (let i = 0; i < 6; i++) {
      try {
        localStorage.setItem(ALBUM_KEY, JSON.stringify(this.photos));
        return;
      } catch {
        if (this.photos.length <= 1) return;
        this.photos.shift();
      }
    }
  }

  /** Teslim edilen araç: modeli koleksiyona yaz, ≥4★ ise fotoğrafı albüme ekle */
  record({ car, res, before, after }) {
    const life = this.economy.state.life;
    if (!life.models.includes(car.def.id)) {
      life.models.push(car.def.id);
      this.economy.save();
    }
    if (res.stars < 4 || !after) return;
    this.photos.push({ id: car.def.id, name: car.def.name, customer: car.customer, stars: res.stars, total: res.total, day: this.economy.state.day, event: car.event?.icon || '', before, after });
    if (this.photos.length > MAX_PHOTOS) {
      // En düşük yıldızlı (eşitse en eski) fotoğraf çıkar
      const min = Math.min(...this.photos.map((p) => p.stars));
      this.photos.splice(this.photos.findIndex((p) => p.stars === min), 1);
    }
    this.save();
    this.onChange?.();
  }

  /** Albüm duvarı için: en yüksek yıldızlı/ücretli 3 işin "sonra" fotoğrafı */
  best(n = 3) {
    return [...this.photos].sort((a, b) => b.stars - a.stars || b.total - a.total).slice(0, n).map((p) => p.after);
  }

  bind() {
    const panel = document.getElementById('album');
    document.querySelectorAll('.open-album').forEach((b) => b.addEventListener('click', () => {
      this.render();
      panel.classList.remove('hidden');
      this.audio.click();
    }));
    document.getElementById('album-close').addEventListener('click', () => {
      panel.classList.add('hidden');
      this.audio.click();
    });
  }

  render() {
    const st = this.economy.state;
    const seen = new Set(st.life.models);
    document.getElementById('album-count').textContent = `${seen.size}/${CAR_CATALOG.length} model · ${this.photos.length} fotoğraf`;
    const photos = this.photos.length
      ? [...this.photos].reverse().map((p) => `
        <figure class="al-photo">
          <div class="al-pair"><img src="${p.before || p.after}" alt=""><img src="${p.after}" alt=""></div>
          <figcaption><b>${p.event} ${p.name}</b><small>${p.customer} · Gün ${p.day} · <span class="al-stars">${stars(p.stars)}</span> · $${p.total}</small></figcaption>
        </figure>`).join('')
      : '<p class="al-empty">Henüz fotoğraf yok. 4★ ve üzeri bir işi teslim edince buraya eklenir.</p>';
    const cars = CAR_CATALOG.map((d) => `<div class="al-car ${seen.has(d.id) ? 'got' : ''}"><span>${seen.has(d.id) ? '🚗' : '🔒'}</span>${seen.has(d.id) ? d.name : '???'}</div>`).join('');
    const regs = REGULARS.map((r) => {
      const n = Math.min(visitsOf(st, r.id), r.story.length);
      const done = n >= r.story.length;
      return `<div class="al-reg ${n ? 'got' : ''}"><b>${n ? r.name : '???'}</b><small>${n ? `${done ? 'Hikâye tamam ✓' : `${n}/${r.story.length} ziyaret`}` : 'Henüz tanışmadın'}</small></div>`;
    }).join('');
    document.getElementById('album-body').innerHTML = `
      <h3>📷 Fotoğraflar</h3><div class="al-photos">${photos}</div>
      <h3>🚗 Araç koleksiyonu</h3><div class="al-cars">${cars}</div>
      <h3>🏘 Müdavimler</h3><div class="al-regs">${regs}</div>`;
  }
}
