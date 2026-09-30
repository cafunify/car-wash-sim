/**
 * Yıkama paketleri ve temizlik katmanları.
 * Müşteri bir paket ister; paketin katmanlarının hepsi tamamlanınca araç biter.
 */

/** Katman tanımları: HUD etiketi, rengi, tamamlanma eşiği (temiz örnek oranı), ağırlığı */
export const LAYERS = {
  mud: { label: 'Çamur', color: '#b07a4a', threshold: 0.97, weight: 1 },
  stain: { label: 'Leke', color: '#d6c56d', threshold: 0.96, weight: 1 },
  dry: { label: 'Kuruluk', color: '#6fc3ff', threshold: 0.95, weight: 0.5 },
  rims: { label: 'Jant', color: '#a9b3c1', threshold: 0.94, weight: 0.6 },
  tires: { label: 'Lastik', color: '#7b8391', threshold: 0.94, weight: 0.6 },
  glass: { label: 'Cam', color: '#8fe3ff', threshold: 0.94, weight: 0.6 },
  polish: { label: 'Cila', color: '#ffd35a', threshold: 0.9, weight: 1 },
};

export const PACKAGES = {
  standart: {
    id: 'standart',
    name: 'Standart Yıkama',
    short: 'Standart',
    color: '#35d0ff',
    mult: 1,
    time: 1,
    layers: ['mud', 'stain', 'dry'],
    requires: [],
  },
  detayli: {
    id: 'detayli',
    name: 'Detaylı Yıkama',
    short: 'Detaylı',
    color: '#3ee48a',
    mult: 1.7,
    time: 1.45,
    layers: ['mud', 'stain', 'dry', 'rims', 'tires', 'glass'],
    requires: ['rimcleaner', 'tireshine', 'glasscleaner'],
  },
  premium: {
    id: 'premium',
    name: 'Premium Detailing',
    short: 'Premium',
    color: '#ffd35a',
    mult: 2.6,
    time: 1.9,
    layers: ['mud', 'stain', 'dry', 'rims', 'tires', 'glass', 'polish'],
    requires: ['rimcleaner', 'tireshine', 'glasscleaner', 'polisher'],
  },
};

/** Sahip olunan ekipmanlara göre açılmış paketler */
export function availablePackages(owns) {
  return Object.values(PACKAGES).filter((p) => p.requires.every(owns));
}

/** Müşterinin isteyeceği paketi seç (açık olanlardan, üst paketler biraz daha nadir) */
export function pickPackage(owns) {
  const list = availablePackages(owns);
  const weights = { standart: 1, detayli: 1.1, premium: 0.9 };
  let r = Math.random() * list.reduce((a, p) => a + weights[p.id], 0);
  for (const p of list) {
    r -= weights[p.id];
    if (r <= 0) return p;
  }
  return list[0];
}

/**
 * İstatistiklerden paket ilerlemesini hesapla.
 * Dönüş: { layers: {id: 0..1}, total: 0..1, done }
 */
export function packageProgress(pkg, stats) {
  const layers = {};
  let sum = 0, wsum = 0;
  for (const id of pkg.layers) {
    const L = LAYERS[id];
    const v = Math.min(1, stats[id] / L.threshold);
    layers[id] = v;
    sum += v * L.weight;
    wsum += L.weight;
  }
  const done = pkg.layers.every((id) => layers[id] >= 1) && stats.foam < 0.02;
  return { layers, total: sum / wsum, done };
}
