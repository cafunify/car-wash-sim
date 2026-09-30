import { STEPS } from './Packages.js';
import { PART } from './CarParts.js';
import { CLEAN_THRESHOLD } from './DirtVolume.js';

const T = CLEAN_THRESHOLD;
const W = 300;
const H = 170;
const DPR = Math.min(2, window.devicePixelRatio || 1);

/**
 * Eksik yer haritası: aracın sol, sağ ve üst görünüşünde, paketin adımlarına göre
 * henüz tamamlanmamış her yüzey noktasını o adımın rengiyle gösterir.
 * Oyuncunun konumu üst görünüşte ok olarak işaretlenir.
 */
export class Minimap {
  constructor() {
    this.root = document.getElementById('minimap');
    this.canvas = this.root.querySelector('canvas');
    this.canvas.width = W * DPR;
    this.canvas.height = H * DPR;
    this.canvas.style.width = `${W}px`;
    this.canvas.style.height = `${H}px`;
    this.g = this.canvas.getContext('2d');
    this.g.scale(DPR, DPR);
    this.legend = this.root.querySelector('.mm-legend');
    this.timer = 0;
    this.visible = true;
  }

  setVisible(on) {
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
  }

  /** Bir örnek noktanın takıldığı ilk adım (paketin sırasına göre) ya da null */
  issueOf(i, part, pkg, latch, volume) {
    const d = volume.data, e = volume.detail;
    for (const id of pkg.steps) {
      switch (id) {
        case 'mud': if (d[i] >= T) return id; break;
        case 'foam':
          if (!latch.foam && (part === PART.PAINT || part === PART.GLASS || part === PART.TRIM) && d[i + 3] <= 70) return id;
          break;
        case 'rinse': if (d[i + 1] >= T || d[i + 3] > T) return id; break;
        case 'glass': if (part === PART.GLASS && e[i + 2] >= T) return id; break;
        case 'dry': if (d[i + 2] >= T * 1.6) return id; break;
        case 'rims': if (part === PART.RIM && e[i] >= T) return id; break;
        case 'tires': if (part === PART.TIRE && e[i + 1] >= T) return id; break;
        case 'polish': if (part === PART.PAINT && e[i + 3] <= 190) return id; break;
      }
    }
    return null;
  }

  /** player: {x, z, yaw} dünya; car: CarManager.car */
  update(dt, car, player) {
    this.timer -= dt;
    if (this.timer > 0 || !this.visible) return;
    this.timer = 0.25;
    const g = this.g;
    g.clearRect(0, 0, W, H);
    if (!car || !car.volume.sampleIdx) {
      this.legend.textContent = '';
      return;
    }
    const v = car.volume;
    const { min, size } = v;
    const pos = v.samplePos, idx = v.sampleIdx, parts = v.sampleParts, nrm = v.sampleNormals;

    // Yerleşim: solda iki yan görünüş (üstte sol, altta sağ taraf), sağda üst görünüş
    const sideW = 190, sideH = 72, gap = 10;
    const sx = (sideW - 10) / size.z;
    const sy = sideH / Math.max(size.y, 1);
    const side = Math.min(sx, sy * 1.0);
    const topX0 = sideW + gap, topW = W - topX0;
    const top = Math.min((H - 16) / size.z, (topW - 10) / size.x);

    const views = [
      { label: 'Sol', ox: 5, oy: 14, filter: (nx) => nx < 0.25, map: (x, y, z) => [(z - min.z) * side, sideH - (y - min.y) * side] },
      { label: 'Sağ', ox: 5, oy: 14 + sideH + 12, filter: (nx) => nx > -0.25, map: (x, y, z) => [(min.z + size.z - z) * side, sideH - (y - min.y) * side] },
      { label: 'Üst', ox: topX0 + (topW - size.x * top) / 2, oy: 12, filter: (nx, ny) => ny > 0.2, map: (x, y, z) => [(min.x + size.x - x) * top, (min.z + size.z - z) * top] },
    ];

    g.font = '600 10px Rubik, sans-serif';
    g.fillStyle = 'rgba(200,210,230,0.55)';
    for (const view of views) g.fillText(view.label, view.ox, view.oy - 3);

    const counts = {};
    const issues = [];
    // Önce temiz noktalar (soluk), sonra eksikler (renkli) üste
    for (let s = 0; s < idx.length; s++) {
      const x = pos[s * 3], y = pos[s * 3 + 1], z = pos[s * 3 + 2];
      const nx = nrm ? nrm[s * 3] / 127 : 0, ny = nrm ? nrm[s * 3 + 1] / 127 : 0;
      const issue = this.issueOf(idx[s], parts[s], car.package, car.latch, v);
      if (issue) {
        counts[issue] = (counts[issue] || 0) + 1;
        issues.push(s, issue);
      }
      g.fillStyle = 'rgba(120,200,150,0.22)';
      for (const view of views) {
        if (!view.filter(nx, ny)) continue;
        const [px, py] = view.map(x, y, z);
        g.fillRect(view.ox + px - 1, view.oy + py - 1, 2, 2);
      }
    }
    for (let k = 0; k < issues.length; k += 2) {
      const s = issues[k];
      const color = STEPS[issues[k + 1]].color;
      const x = pos[s * 3], y = pos[s * 3 + 1], z = pos[s * 3 + 2];
      const nx = nrm ? nrm[s * 3] / 127 : 0, ny = nrm ? nrm[s * 3 + 1] / 127 : 0;
      g.fillStyle = color;
      for (const view of views) {
        if (!view.filter(nx, ny)) continue;
        const [px, py] = view.map(x, y, z);
        g.fillRect(view.ox + px - 1.5, view.oy + py - 1.5, 3, 3);
      }
    }

    // Oyuncu: üst görünüşte ok
    if (player) {
      const lx = player.x - car.root.position.x, lz = player.z - car.root.position.z;
      const [px, py] = views[2].map(lx, 0, lz);
      const cx = Math.max(topX0 + 4, Math.min(W - 4, views[2].ox + px));
      const cy = Math.max(6, Math.min(H - 4, views[2].oy + py));
      g.save();
      g.translate(cx, cy);
      g.rotate(-player.yaw + Math.PI); // üst görünüşte ön taraf yukarıda
      g.fillStyle = '#35d0ff';
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 5);
      g.lineTo(0, 2);
      g.lineTo(-5, 5);
      g.closePath();
      g.fill();
      g.restore();
    }

    const order = car.package.steps.filter((id) => counts[id]);
    this.legend.innerHTML = order.length
      ? order.map((id) => `<span><i style="background:${STEPS[id].color}"></i>${STEPS[id].label} ${Math.round((counts[id] / idx.length) * 100) || '<1'}%</span>`).join('')
      : '<span class="ok">Eksik yer yok ✓</span>';
  }
}
