import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, transformPixel, estimateSettings, applyTransform, generateCube } from '../src/color.js';

const image = pixels => ({ width: pixels.length, height: 1, data: new Uint8ClampedArray(pixels.flatMap(rgb => [...rgb, 255])) });

test('default settings are exact identity across the RGB gamut', () => {
  assert.equal(DEFAULT_SETTINGS.strength, 75);
  assert.equal(DEFAULT_SETTINGS.skinProtection, true);
  assert.equal(DEFAULT_SETTINGS.skinStrength, 70);
  for (const rgb of [[0, 0, 0], [255, 255, 255], [255, 0, 0], [12, 128, 244], [187, 126, 91]]) {
    assert.deepEqual(transformPixel(...rgb, DEFAULT_SETTINGS), rgb);
  }
});

test('zero strength bypasses all adjustments', () => {
  const rgb = [13, 157, 229];
  assert.deepEqual(transformPixel(...rgb, { exposure: 3, tint: -100, saturation: 100, strength: 0 }), rgb);
});

test('constant and fully clipped images yield finite settings and pixels', () => {
  for (const ref of [0, 128, 255]) for (const target of [0, 128, 255]) {
    const result = estimateSettings(image([[ref, ref, ref]]), image([[target, target, target]]), { excludeUniform: true });
    for (const [key, value] of Object.entries(result.settings)) if (key !== 'skinProtection') assert.ok(Number.isFinite(value), key);
    assert.ok(transformPixel(target, target, target, result.settings).every(v => Number.isFinite(v) && v >= 0 && v <= 255));
    assert.equal(result.stats.target.sampleCount, 1);
  }
});

test('monochrome detection produces tone-only matching', () => {
  const ref = image([[60, 60, 60], [160, 160, 160], [220, 220, 220]]);
  const target = image([[40, 40, 40], [110, 110, 110], [180, 180, 180]]);
  const result = estimateSettings(ref, target);
  assert.equal(result.monochrome, true);
  for (const key of ['temperature', 'tint', 'saturation']) assert.equal(result.settings[key], 0);
  assert.deepEqual(result.stats.percentiles, [0.5, 10, 25, 75, 90, 99.5]);
  assert.ok(transformPixel(110, 110, 110, result.settings)[0] > 110);
});

test('identical images estimate identity', () => {
  const input = image([[45, 65, 130], [180, 100, 60], [90, 150, 70]]);
  const { settings, monochrome } = estimateSettings(input, input);
  assert.equal(monochrome, false);
  assert.deepEqual(settings, DEFAULT_SETTINGS);
});

test('LUT has correct dimensions and red-fastest ordering', () => {
  const cube = generateCube({ exposure: 3, strength: 0 }, 3);
  assert.match(cube, /LUT_3D_SIZE 3/);
  const rows = cube.trim().split('\n').slice(4).map(row => row.split(' ').map(Number));
  assert.equal(rows.length, 27);
  assert.deepEqual(rows[0], [0, 0, 0]);
  assert.deepEqual(rows[1], [0.5, 0, 0]);
  assert.deepEqual(rows[3], [0, 0.5, 0]);
  assert.deepEqual(rows[9], [0, 0, 0.5]);
  assert.deepEqual(rows[26], [1, 1, 1]);
  assert.throws(() => generateCube({}, 1), RangeError);
});

test('applyTransform creates a new image and preserves transparency', () => {
  const input = image([[50, 60, 70], [180, 120, 80]]);
  input.data[3] = 17;
  const before = [...input.data];
  const result = applyTransform(input, { exposure: 1 });
  assert.notEqual(result.data, input.data);
  assert.equal(result.width, 2);
  assert.equal(result.height, 1);
  assert.equal(result.data[3], 17);
  assert.deepEqual([...input.data], before);
  assert.ok(result.data[0] > input.data[0]);
});

test('skin protection reduces chromatic changes and extreme controls stay in gamut', () => {
  const rgb = [190, 130, 90];
  const settings = { temperature: 70, tint: 50, saturation: 50, strength: 100, skinStrength: 100 };
  const distance = a => a.reduce((sum, v, i) => sum + (v - rgb[i]) ** 2, 0);
  assert.ok(distance(transformPixel(...rgb, { ...settings, skinProtection: true })) < distance(transformPixel(...rgb, { ...settings, skinProtection: false })));
  const extreme = transformPixel(255, 0, 90, { exposure: 3, contrast: 100, saturation: 100, tint: -100, temperature: 100 });
  assert.ok(extreme.every(v => Number.isFinite(v) && v >= 0 && v <= 255));
});
