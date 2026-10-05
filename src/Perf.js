/** Cihaza göre grafik seviyesi: GPU/CPU sezgisi + kısa ölçüm. Seviyeler: low < medium < high */
export const LEVELS = ['low', 'medium', 'high'];
export const LEVEL_NAMES = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };

const lower = (a, b) => (LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b);
const down = (l) => LEVELS[Math.max(0, LEVELS.indexOf(l) - 1)];

/** WebGL bağlamından GPU adı (maskelenmemiş, yoksa genel) */
export function gpuName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch {
    return '';
  }
}

/**
 * GPU adı ve cihaz bilgisinden en yüksek önerilen seviye (saf fonksiyon, test edilebilir).
 * Dönüş: { level, reason }
 */
export function classifyGpu(gpu, { cores = 4, memory = null, coarse = false } = {}) {
  const r = String(gpu || '').toLowerCase();
  let level = 'medium';
  let reason = 'bilinmeyen GPU';
  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic|basic render/.test(r)) {
    level = 'low'; reason = 'yazılımsal çizim';
  } else if (/geforce (mx|gt) ?\d|gtx ?(5|6|7)\d\d\b/.test(r)) {
    level = 'medium'; reason = 'eski/giriş seviyesi ekran kartı';
  } else if (/rtx|gtx|geforce|radeon rx|radeon pro|quadro|titan|apple m\d|arc a\d|arc\(tm\)|rx ?\d{3,4}/.test(r)) {
    level = 'high'; reason = 'güçlü ekran kartı';
  } else if (/iris xe|iris\(r\) xe|apple gpu|radeon\(tm\) graphics|radeon graphics|vega \d/.test(r)) {
    level = 'medium'; reason = 'orta seviye entegre GPU';
  } else if (/adreno.*\b[67]\d\d\b/.test(r)) {
    level = 'medium'; reason = 'güçlü mobil GPU';
  } else if (/intel|uhd|hd graphics|mali|adreno|powervr|videocore|vivante/.test(r)) {
    level = 'low'; reason = 'entegre/mobil GPU';
  }
  if (cores <= 2 || (memory !== null && memory <= 2)) { level = down(level); reason += ' + zayıf CPU/RAM'; }
  if (coarse) level = lower(level, 'medium');
  return { level, reason };
}

/** Ölçülen kare süresine göre seviye düşür: ≤17 ms aynı, ≤34 ms bir kademe, daha yavaş iki kademe */
export function levelFromMs(level, ms) {
  if (ms <= 17) return level;
  if (ms <= 34) return down(level);
  return down(down(level));
}

/** renderFn'i birkaç kez çağırıp medyan kare süresini (ms) döndür; GPU'yu gl.finish() ile bekler */
export function benchmarkMs(renderFn, gl, frames = 10) {
  const times = [];
  for (let i = 0; i < frames + 2; i++) {
    const t = performance.now();
    renderFn();
    gl.finish();
    if (i >= 2) times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1];
}

export function deviceInfo() {
  return {
    cores: navigator.hardwareConcurrency || 4,
    memory: navigator.deviceMemory ?? null,
    coarse: !!globalThis.matchMedia?.('(pointer: coarse)').matches,
  };
}
