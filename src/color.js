/** GradeMatch's dependency-free sRGB / CIELAB colour engine. */
export const DEFAULT_SETTINGS = Object.freeze({
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temperature: 0, tint: 0, saturation: 0, strength: 75,
  skinProtection: true, skinStrength: 70,
});

const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const PERCENTILES = [0.5, 10, 25, 75, 90, 99.5];
const TONE_KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'];
const decode = n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
const encode = n => n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055;
const labF = n => n > 216 / 24389 ? Math.cbrt(n) : n * 841 / 108 + 4 / 29;
const labInv = n => n > 6 / 29 ? n ** 3 : (n - 4 / 29) * 108 / 841;

function normalize(settings = {}) {
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(out)) {
    if (key === 'skinProtection') {
      out[key] = settings[key] === undefined ? out[key] : Boolean(settings[key]);
    } else {
      const limit = key === 'exposure' ? 3 : 100;
      const lower = key === 'strength' || key === 'skinStrength' ? 0 : -limit;
      out[key] = clamp(finite(settings[key], out[key]), lower, limit);
    }
  }
  return out;
}

function toLab(r, g, b) {
  r = decode(r / 255); g = decode(g / 255); b = decode(b / 255);
  const x = labF((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = labF(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = labF((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function fromLab(l, a, b) {
  const fy = (l + 16) / 116;
  const x = 0.95047 * labInv(fy + a / 500);
  const y = labInv(fy);
  const z = 1.08883 * labInv(fy - b / 200);
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ].map(n => 255 * clamp(encode(n)));
}

function tone(l, s) {
  // Exposure is measured in linear-light stops, before perceptual tone shaping.
  const exposed = clamp(116 * labF(labInv((l + 16) / 116) * 2 ** s.exposure) - 16, 0, 100);
  const t = exposed / 100;
  const low = 1 - t;
  return clamp(exposed + s.contrast * (t - 0.5) * 0.6
    + s.highlights * 0.32 * t * t
    + s.shadows * 0.32 * low * low
    + s.whites * 0.22 * t ** 8
    + s.blacks * 0.22 * low ** 8, 0, 100);
}

function skinWeight(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 1 || max === 0) return 0;
  let hue = max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  const distance = Math.min(Math.abs(hue - 28), 360 - Math.abs(hue - 28));
  // Broad red/orange hue mask, feathered by saturation and brightness.
  return clamp(1 - distance / 35) * clamp((d / max - 0.06) / 0.2) * clamp(max / 45);
}

function transform(r, g, b, s) {
  r = clamp(finite(r), 0, 255); g = clamp(finite(g), 0, 255); b = clamp(finite(b), 0, 255);
  if (!s.strength || [...TONE_KEYS, 'temperature', 'tint', 'saturation'].every(key => s[key] === 0)) return [r, g, b];
  const [l, a, labB] = toLab(r, g, b);
  const protection = s.skinProtection ? 1 - skinWeight(r, g, b) * s.skinStrength / 100 : 1;
  const saturation = 1 + s.saturation / 100 * protection;
  const adjusted = fromLab(tone(l, s), a * saturation + s.tint * 0.18 * protection,
    labB * saturation + s.temperature * 0.22 * protection);
  const amount = s.strength / 100;
  return adjusted.map((n, i) => clamp([r, g, b][i] + (n - [r, g, b][i]) * amount, 0, 255));
}

/** Input and output channels are sRGB values in [0,255] (not necessarily integers). */
export function transformPixel(r, g, b, settings = DEFAULT_SETTINGS) {
  return transform(r, g, b, normalize(settings));
}

/** Returns a fresh RGBA image; preserves alpha and never modifies the source. */
export function applyTransform(imageData, settings = DEFAULT_SETTINGS) {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const s = normalize(settings);
  for (let i = 0; i < data.length; i += 4) {
    const rgb = transform(data[i], data[i + 1], data[i + 2], s);
    output[i] = rgb[0]; output[i + 1] = rgb[1]; output[i + 2] = rgb[2]; output[i + 3] = data[i + 3];
  }
  return typeof ImageData !== 'undefined' ? new ImageData(output, width, height) : { data: output, width, height };
}

function quantile(sorted, p) {
  if (!sorted.length) return 0;
  const at = p / 100 * (sorted.length - 1), lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

function collect(image, options) {
  const { data, width } = image;
  const count = Math.floor(data.length / 4), stride = Math.max(1, Math.ceil(count / 24000));
  const all = [], selected = [];
  for (let pixel = 0; pixel < count; pixel += stride) {
    const i = pixel * 4;
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lab = toLab(r, g, b);
    const sample = { lab, saturation: max ? (max - min) / max : 0 };
    all.push(sample);
    if (options.ignoreClipped && (min <= 2 || max >= 253)) continue;
    if (options.excludeUniform && width > 1) {
      const neighbours = [];
      if (pixel % width > 0) neighbours.push(i - 4);
      if (pixel % width < width - 1 && pixel + 1 < count) neighbours.push(i + 4);
      if (pixel >= width) neighbours.push(i - width * 4);
      if (pixel + width < count) neighbours.push(i + width * 4);
      if (neighbours.length && neighbours.every(j => Math.max(...[0, 1, 2].map(c => Math.abs(data[i + c] - data[j + c]))) < 3)) continue;
    }
    selected.push(sample);
  }
  // Filtering should never turn a constant/clipped image into an invalid fit.
  const samples = selected.length ? selected : all;
  const luminance = samples.map(s => s.lab[0]).sort((a, b) => a - b);
  const meanLab = [0, 0, 0];
  let averageSaturation = 0, averageChroma = 0;
  for (const s of samples) {
    for (let c = 0; c < 3; c++) meanLab[c] += s.lab[c];
    averageSaturation += s.saturation;
    averageChroma += Math.hypot(s.lab[1], s.lab[2]);
  }
  const n = samples.length || 1;
  return {
    sampleCount: samples.length,
    percentiles: Object.fromEntries(PERCENTILES.map(p => [p, quantile(luminance, p)])),
    meanLab: meanLab.map(v => v / n), averageSaturation: averageSaturation / n,
    averageChroma: averageChroma / n,
  };
}

/** Estimate a target→reference look using six robust L* percentile anchors. */
export function estimateSettings(referenceImageData, targetImageData, options = {}) {
  const opts = { ignoreClipped: true, excludeUniform: false, ...options };
  const reference = collect(referenceImageData, opts), target = collect(targetImageData, opts);
  const monochrome = reference.averageSaturation < 0.05 || target.averageSaturation < 0.05;
  const settings = { ...DEFAULT_SETTINGS };
  if (reference.sampleCount && target.sampleCount) {
    const source = PERCENTILES.map(p => target.percentiles[p]);
    const desired = PERCENTILES.map(p => reference.percentiles[p]);
    const spread = source[5] - source[0];
    // A constant source has no contrast distribution to fit. Use only exposure
    // and a shadow offset, which also permits lifting a completely black image.
    const keys = spread < 0.1 ? ['exposure', 'shadows'] : TONE_KEYS;
    const loss = candidate => source.reduce((sum, l, i) => sum + (tone(l, candidate) - desired[i]) ** 2, 0)
      + TONE_KEYS.reduce((sum, key) => sum + (candidate[key] / (key === 'exposure' ? 0.03 : 1)) ** 2 * 0.002, 0);
    let best = loss(settings);
    for (let step = 16; step >= 0.0625; step /= 2) {
      for (let pass = 0; pass < 32; pass++) {
        let improved = false;
        for (const key of keys) {
          const original = settings[key], limit = key === 'exposure' ? 3 : 100;
          let chosen = original;
          for (const direction of [-1, 1]) {
            settings[key] = clamp(original + direction * step * (key === 'exposure' ? 0.03 : 1), -limit, limit);
            const score = loss(settings);
            if (score < best) { best = score; chosen = settings[key]; improved = true; }
          }
          settings[key] = chosen;
        }
        if (!improved) break;
      }
    }
    if (!monochrome) {
      const ratio = target.averageChroma > 0.1 ? clamp(reference.averageChroma / target.averageChroma, 0, 2) : 1;
      settings.saturation = (ratio - 1) * 100;
      settings.temperature = clamp((reference.meanLab[2] - target.meanLab[2] * ratio) / 0.22, -100, 100);
      settings.tint = clamp((reference.meanLab[1] - target.meanLab[1] * ratio) / 0.18, -100, 100);
    }
  }
  return { settings, monochrome, stats: { reference, target, percentiles: [...PERCENTILES] } };
}

/** Standard .cube LUT, blue outermost and red changing fastest. */
export function generateCube(settings = DEFAULT_SETTINGS, size = 33) {
  if (!Number.isInteger(size) || size < 2 || size > 128) throw new RangeError('LUT size must be an integer between 2 and 128');
  const s = normalize(settings);
  const lines = ['TITLE "GradeMatch"', `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0'];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    lines.push(transform(r * 255 / (size - 1), g * 255 / (size - 1), b * 255 / (size - 1), s)
      .map(n => (n / 255).toFixed(6)).join(' '));
  }
  return `${lines.join('\n')}\n`;
}
