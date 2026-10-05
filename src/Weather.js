/** Günlük hava durumu: araç kirinin türünü ve ücreti etkiler. mud/stain: kir üretimi aralıkları (0..1) */
export const WEATHERS = {
  clear: { label: 'Açık', icon: '☀', pay: 1, mud: [0.25, 1], stain: [0, 1], note: '' },
  rain: { label: 'Yağmurlu', icon: '🌧', pay: 1.1, mud: [0.65, 1], stain: [0, 0.6], note: 'Araçlar daha çamurlu · ücret ×1.1' },
  salt: { label: 'Tuzlu kış', icon: '❄', pay: 1.15, mud: [0.1, 0.45], stain: [0.8, 1], note: 'Tuz lekesi çok · ücret ×1.15' },
};

export function pickWeather() {
  const r = Math.random();
  return r < 0.55 ? 'clear' : r < 0.85 ? 'rain' : 'salt';
}

/** Özel müşteri istekleri: süre içinde 5★ ile teslimde bonus (bonus: baz ücretin oranı) */
export const REQUESTS = {
  rush: { id: 'rush', label: '⏱ Acele', desc: 'Süre ×0.6 · 5★ ile bitir: +%40', bonus: 0.4, timeMul: 0.6 },
  perfect: { id: 'perfect', label: '💎 Kusursuz', desc: '5★ ile bitir: +%30', bonus: 0.3, timeMul: 1 },
};
