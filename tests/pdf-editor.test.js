import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, detectPdf, fitText, makePdf, snapSelection } from '../src/pdf-core.js';

test('selection snaps to complete word boundaries', () => {
  const text = 'Fix the contract date today';
  assert.deepEqual(snapSelection(text, 9, 16), { start: 8, end: 16 });
});

test('replace, remove, and add edits operate on the selected range', () => {
  const text = 'Hello world';
  const selection = { start: 6, end: 11 };
  assert.equal(applyEdit(text, selection, { action: 'replace', value: 'Paperline' }), 'Hello Paperline');
  assert.equal(applyEdit(text, selection, { action: 'remove', gap: 'close' }), 'Hello ');
  assert.equal(applyEdit(text, selection, { action: 'remove', gap: 'blank' }), 'Hello      ');
  assert.equal(applyEdit(text, selection, { action: 'add', value: 'kind ', position: 'before' }), 'Hello kind world');
  assert.equal(applyEdit(text, selection, { action: 'add', value: ' again', position: 'after' }), 'Hello world again');
});

test('fit handling escalates for longer replacements', () => {
  assert.equal(fitText('date', 'day').label, 'Fits');
  assert.equal(fitText('date', 'a slightly longer date').warning, true);
  assert.equal(fitText('date', 'a replacement that is extremely long and will not fit').label, 'May overflow');
});

test('PDF support detection identifies invalid, encrypted, and signed files', () => {
  assert.equal(detectPdf(new TextEncoder().encode('not a pdf')).valid, false);
  assert.match(detectPdf(new TextEncoder().encode('%PDF-1.7\n/Encrypt')).warnings[0], /encrypted/i);
  assert.match(detectPdf(new TextEncoder().encode('%PDF-1.7\n/ByteRange')).warnings[0], /signed/i);
});

test('export helper creates a PDF header and preserves page count', () => {
  const bytes = makePdf({ pages: [{ kicker: 'A', title: 'B', lead: 'C', footer: '1', text: 'D' }, { kicker: 'E', title: 'F', lead: 'G', footer: '2', text: 'H' }] });
  const output = new TextDecoder().decode(bytes);
  assert.equal(output.startsWith('%PDF-1.4'), true);
  assert.equal((output.match(/\/Type \/Page /g) || []).length, 2);
});
