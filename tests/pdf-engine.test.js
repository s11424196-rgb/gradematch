import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPdfEdit,
  getSelectionGeometry,
  getPageText,
  loadPdf,
  normalizePdfBytes,
  rectToQuad,
  textContentToText,
  toPdfRect,
  unionRects,
} from '../src/pdf-engine.js';
import { DEMO_DOCUMENT, makePdf } from '../src/pdf-core.js';

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

test('MuPDF redaction removes selected page content and replacement exports', async () => {
  const source = makePdf(DEMO_DOCUMENT);
  const loaded = await loadPdf(source);
  const page = await getPageText(loaded, 0);
  const start = page.text.indexOf('15 March 2025');
  const geometry = getSelectionGeometry(page.content, start, start + 13, page.viewport);
  const removed = await applyPdfEdit(source, { pageIndex: 0, action: 'remove', original: '15 March 2025', pdfRects: geometry.pdfRects, coordinateSpace: 'page' });
  const removedDoc = await loadPdf(removed);
  assert.equal((await getPageText(removedDoc, 0)).text.includes('15 March 2025'), false);
  const replaced = await applyPdfEdit(source, { pageIndex: 0, action: 'replace', value: '15 April 2025', original: '15 March 2025', pdfRects: geometry.pdfRects, coordinateSpace: 'page', fontSize: 11 });
  const replacedDoc = await loadPdf(replaced);
  const replacedText = (await getPageText(replacedDoc, 0)).text;
  assert.equal(replacedText.includes('15 April'), true);
  assert.equal(replacedText.includes('15 March 2025'), false);
  await loaded.destroy();
  await removedDoc.destroy();
  await replacedDoc.destroy();
});

test('long replacement reflows the affected text block instead of retaining the old glyphs', async () => {
  const source = makePdf(DEMO_DOCUMENT);
  const loaded = await loadPdf(source);
  const page = await getPageText(loaded, 0);
  const start = page.text.indexOf('15 March 2025');
  const geometry = getSelectionGeometry(page.content, start, start + 13, page.viewport);
  const edited = await applyPdfEdit(source, { pageIndex: 0, action: 'replace', value: '15 September 2025', original: '15 March 2025', start, end: start + 13, reflow: true, pdfRects: geometry.pdfRects, coordinateSpace: 'page', fontSize: 11 });
  const result = await loadPdf(edited);
  const text = (await getPageText(result, 0)).text;
  assert.equal(text.includes('15 March 2025'), false);
  assert.equal(text.includes('15 September 2025'), true);
  assert.equal(text.includes('continue through the completion'), true);
  await loaded.destroy();
  await result.destroy();
});
