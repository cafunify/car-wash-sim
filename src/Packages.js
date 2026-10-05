/**
 * Yıkama paketleri ve adım adım görev ilerleyişi.
 * Müşteri bir paket ister; paketin adımlarının hepsi tamamlanınca araç biter.
 * Oyun her zaman sıradaki (ilk tamamlanmamış) adıma yönlendirir.
 */

/**
 * Adım tanımları.
 *   tool       — bu adımda kullanılan alet (Tools.js kimliği)
 *   threshold  — istatistik bu orana ulaşınca adım biter (temiz örnek oranı)
 */
export const STEPS = {
  mud: { label: 'Su', long: 'Su ile çamuru sök', tool: 'hose', color: '#b07a4a', threshold: 0.97 },
  foam: { label: 'Köpük', long: 'Aracı köpükle kapla', tool: 'foam', color: '#f4f7ff', threshold: 0.85 },
  // Kuş pisliği + böcek lekesi: sadece bu kirleri getiren araçlarda pakete girer (bkz. packageFor)
  spots: { label: 'Kuş/Böcek', long: 'Kuş pisliği ve böcek lekelerini köpükle yumuşat, su ile sök', tool: 'hose', color: '#c76bff', threshold: 0.95 },
  rinse: { label: 'Durulama', long: 'Su ile köpüğü ve lekeleri durula', tool: 'hose', color: '#35d0ff', threshold: 0.96 },
  glass: { label: 'Cam', long: 'Camları temizle', tool: 'glass', color: '#8fe3ff', threshold: 0.94 },
  dry: { label: 'Kurulama', long: 'Havluyla su lekelerini kurula', tool: 'towel', color: '#6fc3ff', threshold: 0.95 },
  rims: { label: 'Jant', long: 'Jantlardaki fren tozunu temizle', tool: 'rim', color: '#a9b3c1', threshold: 0.94 },
  tires: { label: 'Lastik', long: 'Lastikleri parlat', tool: 'tire', color: '#7b8391', threshold: 0.94 },
  // Katran/reçine: kil bar gerekir; yalnızca katranlı Detaylı/Premium araçlarda pakete girer (bkz. packageFor)
  tar: { label: 'Katran', long: 'Etek ve kapılardaki katran lekelerini kil barla ov', tool: 'clay', color: '#9aa8ff', threshold: 0.95 },
  polish: { label: 'Cila', long: 'Boyayı cilala', tool: 'polish', color: '#ffd35a', threshold: 0.9 },
};

export const PACKAGES = {
  standart: {
    id: 'standart',
    name: 'Standart Temizlik',
    color: '#35d0ff',
    mult: 1,
    time: 1.6,
    steps: ['mud', 'foam', 'spots', 'rinse'],
    requires: [],
  },
  detayli: {
    id: 'detayli',
    name: 'Detaylı Yıkama',
    color: '#3ee48a',
    mult: 1.7,
    time: 1.5,
    steps: ['mud', 'foam', 'spots', 'rinse', 'glass', 'dry', 'tires'],
    requires: ['glasscleaner', 'tireshine'],
  },
  premium: {
    id: 'premium',
    name: 'Premium Temizlik',
    color: '#ffd35a',
    mult: 2.6,
    time: 2,
    steps: ['mud', 'foam', 'spots', 'rinse', 'glass', 'dry', 'rims', 'tires', 'polish'],
    requires: ['glasscleaner', 'tireshine', 'rimcleaner', 'polisher'],
  },
};

/** Sahip olunan ekipmanlara göre açılmış paketler */
export function availablePackages(owns) {
  return Object.values(PACKAGES).filter((p) => p.requires.every(owns));
}

/**
 * Araca özel paket kopyası: araçta kuş pisliği / böcek lekesi yoksa "Kuş/Böcek" adımı çıkarılır
 * (paket kimliği, adı ve çarpanı aynı kalır).
 */
export function packageFor(pkg, hasSpots, hasTar = false) {
  const steps = pkg.steps.filter((id) => id !== 'tar' && (id !== 'spots' || hasSpots));
  // Katran adımı yalnızca cam adımı olan (Detaylı/Premium) paketlerde, durulamadan sonra
  if (hasTar && steps.includes('glass')) steps.splice(steps.indexOf('rinse') + 1, 0, 'tar');
  return { ...pkg, steps };
}

/** Müşterinin isteyeceği paketi seç (açık olanlardan; rep: 1–5 yıldız itibar) */
export function pickPackage(owns, rep = 3) {
  const list = availablePackages(owns);
  // İtibar yükseldikçe pahalı paketler daha sık istenir
  const k = rep / 3;
  const weights = { standart: 1, detayli: 1.1 * k, premium: 0.9 * k * k };
  let r = Math.random() * list.reduce((a, p) => a + weights[p.id], 0);
  for (const p of list) {
    r -= weights[p.id];
    if (r <= 0) return p;
  }
  return list[0];
}

/**
 * İstatistiklerden paket ilerlemesini hesapla.
 * latch: araç başına durum ({ foam: true } köpük adımı bir kez tamamlandı mı)
 * Dönüş: { steps: {id: 0..1}, current: ilk bitmemiş adım ya da null, total: 0..1, done }
 */
export function packageProgress(pkg, stats, latch) {
  const raw = {
    mud: stats.mud,
    // Köpük adımı: araç yeterince köpüklendiğinde (ya da lekeler zaten söküldüyse) kalıcı olarak biter
    foam: latch.foam ? 1 : Math.max(stats.foamCover, stats.stain >= STEPS.rinse.threshold ? 1 : 0),
    // Durulama: lekeler söküldü ve üzerinde köpük kalmadı
    rinse: latch.foam || stats.stain >= STEPS.rinse.threshold ? Math.min(stats.stain, 1 - stats.foam * 20) : 0,
    // Kuş/Böcek: kayıtlı leke voxellerinin temiz oranı
    spots: stats.spots ?? 1,
    tar: stats.tar ?? 1,
    glass: stats.glass,
    dry: stats.dry,
    rims: stats.rims,
    tires: stats.tires,
    polish: stats.polish,
  };
  const steps = {};
  let sum = 0;
  for (const id of pkg.steps) {
    steps[id] = Math.max(0, Math.min(1, raw[id] / STEPS[id].threshold));
    sum += steps[id];
  }
  if (steps.foam >= 1) latch.foam = true;
  const current = pkg.steps.find((id) => steps[id] < 1) || null;
  return { steps, current, total: sum / pkg.steps.length, done: !current };
}
