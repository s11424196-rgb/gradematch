import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSelectionGeometry,
  normalizePdfBytes,
  rectToQuad,
  textContentToText,
  toPdfRect,
  unionRects,
} from '../src/pdf-engine.js';

test('PDF engine text helpers preserve PDF.js line endings and ranges', () => {
  const content = { items: [
    { str: 'Hello ', transform: [1, 0, 0, 10, 20, 100], width: 30, height: 10 },
    { str: 'world', hasEOL: true, transform: [1, 0, 0, 10, 50, 100], width: 25, height: 10 },
  ] };
  assert.equal(textContentToText(content), 'Hello world\n');
  const geometry = getSelectionGeometry(content, 6, 11);
  assert.equal(geometry.text, 'world');
  assert.equal(geometry.pdfRects.length, 1);
});

test('PDF engine geometry helpers normalize and convert rectangles', () => {
  assert.deepEqual(normalizePdfBytes(new Uint8Array([1, 2])), new Uint8Array([1, 2]));
  assert.deepEqual(rectToQuad([1, 2, 3, 4]), [1, 2, 3, 2, 1, 4, 3, 4]);
  assert.deepEqual(unionRects([[1, 2, 5, 6], [0, 4, 8, 9]]), [0, 2, 8, 9]);
  assert.deepEqual(toPdfRect([10, 20, 30, 40], [0, 0, 100, 200], 'viewport', 2), [5, 10, 15, 20]);
});
