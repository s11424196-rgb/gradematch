/*
 * The application deliberately keeps PDF.js and MuPDF as runtime modules.  This
 * means the editor can be served as a static site while still using the same
 * implementation in Node smoke tests.
 */
const PDFJS_BROWSER_MODULE = '/node_modules/pdfjs-dist/build/pdf.mjs';
const MUPDF_BROWSER_MODULE = '/node_modules/mupdf/dist/mupdf.js';
const PDFJS_WORKER_URL = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';

let pdfJsPromise;
let mupdfPromise;

export class PdfEngineError extends Error {
  constructor(message, code, cause) {
    super(message, { cause });
    this.name = 'PdfEngineError';
    this.code = code;
  }
}

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import(isBrowser() ? PDFJS_BROWSER_MODULE : 'pdfjs-dist/build/pdf.mjs').then((module) => {
      // Browsers need the static-site URL. Node's fake-worker fallback resolves
      // workerSrc as a module URL, so use the installed package there.
      module.GlobalWorkerOptions.workerSrc = isBrowser()
        ? PDFJS_WORKER_URL
        : import.meta.resolve('pdfjs-dist/build/pdf.worker.mjs');
      return module;
    });
  }
  return pdfJsPromise;
}

function loadMupdf() {
  if (!mupdfPromise) {
    mupdfPromise = import(isBrowser() ? MUPDF_BROWSER_MODULE : 'mupdf').then((module) => module.default || module);
  }
  return mupdfPromise;
}

export function normalizePdfBytes(bytes) {
  if (bytes instanceof Uint8Array) return new Uint8Array(bytes);
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes.slice(0));
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  throw new TypeError('PDF bytes must be a Uint8Array, ArrayBuffer, or another typed-array view.');
}

function passwordError(error) {
  const code = error?.code;
  const name = error?.name || '';
  if (code === 1 || /password/i.test(name) || /password/i.test(error?.message || '')) {
    return new PdfEngineError(
      code === 2 ? 'The PDF password is incorrect.' : 'This PDF is password-protected. Supply a password to open it.',
      code === 2 ? 'PASSWORD_INVALID' : 'PASSWORD_REQUIRED',
      error,
    );
  }
  if (/invalid|format|pdf/i.test(name) && error) {
    return new PdfEngineError('The file could not be opened as a valid PDF.', 'INVALID_PDF', error);
  }
  return error;
}

/** Load a PDF.js document. `options.password` is optional for encrypted PDFs. */
export async function loadPdf(bytes, options = {}) {
  const data = normalizePdfBytes(bytes);
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({
    // PDF.js can transfer/detach its input to the worker. Retain our own copy
    // for undo, export, and subsequent MuPDF mutations.
    data: new Uint8Array(data),
    password: options.password,
    useWorkerFetch: options.useWorkerFetch,
    isEvalSupported: options.isEvalSupported,
    ...(isBrowser() ? {
      cMapUrl: '/node_modules/pdfjs-dist/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/node_modules/pdfjs-dist/standard_fonts/',
      wasmUrl: '/node_modules/pdfjs-dist/wasm/',
    } : {}),
  });
  try {
    const pdf = await loadingTask.promise;
    return {
      pdf,
      bytes: data,
      pageCount: pdf.numPages,
      getPageText: (pageIndex) => getPageText(pdf, pageIndex),
      destroy: async () => {
        await pdf.cleanup?.();
        await loadingTask.destroy?.();
      },
    };
  } catch (error) {
    try { await loadingTask.destroy(); } catch { /* The original error is more useful. */ }
    throw passwordError(error);
  }
}

function pageFromEngine(engine, pageIndex) {
  if (!engine?.pdf?.getPage) throw new TypeError('Expected an engine returned by loadPdf().');
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= engine.pdf.numPages) {
    throw new RangeError(`PDF page index must be between 0 and ${Math.max(0, engine.pdf.numPages - 1)}.`);
  }
  return engine.pdf.getPage(pageIndex + 1);
}

/** Render a page and its selectable PDF.js text layer into supplied DOM nodes. */
export async function renderPage(engine, pageIndex, canvas, textLayer, scale = 1) {
  if (!canvas?.getContext) throw new TypeError('renderPage requires a canvas element.');
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('PDF render scale must be greater than zero.');
  const page = await pageFromEngine(engine, pageIndex);
  const viewport = page.getViewport({ scale: Number(scale) || 1 });
  const context = canvas.getContext('2d');
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  canvas.width = Math.ceil(viewport.width * ratio);
  canvas.height = Math.ceil(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const renderViewport = ratio === 1 ? viewport : page.getViewport({ scale: (Number(scale) || 1) * ratio });
  const renderTask = page.render({ canvasContext: context, viewport: renderViewport });
  const textContent = await page.getTextContent();
  if (textLayer) {
    prepareTextLayer(textLayer, viewport);
    textLayer.replaceChildren?.();
    textLayer.textContent = '';
    const pdfjs = await loadPdfJs();
    if (typeof pdfjs.TextLayer === 'function') {
      const layer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayer, viewport });
      await layer.render();
      let offset = 0;
      layer.textDivs.forEach((span, index) => {
        span.dataset.start = String(offset);
        offset += layer.textContentItemsStr[index].length;
        span.dataset.end = String(offset);
        const item = textContent.items.filter((entry) => typeof entry.str === 'string')[index];
        if (item?.hasEOL) offset += 1;
      });
    } else {
      // A small fallback keeps the engine usable with older PDF.js builds.
      renderFallbackTextLayer(textLayer, textContent, viewport);
    }
  }
  await renderTask.promise;
  return { page, viewport, textContent, text: textContentToText(textContent) };
}

function prepareTextLayer(container, viewport) {
  const doc = container.ownerDocument;
  if (!doc.getElementById('paperline-pdf-text-layer-style')) {
    const style = doc.createElement('style');
    style.id = 'paperline-pdf-text-layer-style';
    // Only the PDF.js text-layer rules are needed, not its entire viewer UI.
    style.textContent = `
      .paperline-pdf-text-layer { position:absolute; inset:0; overflow:clip; text-align:initial; line-height:1; letter-spacing:normal; word-spacing:normal; text-size-adjust:none; transform-origin:0 0; --min-font-size:1; --text-scale-factor:calc(var(--total-scale-factor) * var(--min-font-size)); --min-font-size-inv:calc(1 / var(--min-font-size)); }
      .paperline-pdf-text-layer :is(span,br) { color:transparent; position:absolute; white-space:pre; cursor:text; transform-origin:0 0; user-select:text; }
      .paperline-pdf-text-layer > :not(.markedContent), .paperline-pdf-text-layer .markedContent span:not(.markedContent) { --font-height:0; font-size:calc(var(--text-scale-factor) * var(--font-height)); --scale-x:1; --rotate:0deg; transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv)); }
      .paperline-pdf-text-layer .markedContent { display:contents; }
      .paperline-pdf-text-layer[data-main-rotation="90"] { transform:rotate(90deg) translateY(-100%); }
      .paperline-pdf-text-layer[data-main-rotation="180"] { transform:rotate(180deg) translate(-100%,-100%); }
      .paperline-pdf-text-layer[data-main-rotation="270"] { transform:rotate(270deg) translateX(-100%); }
      .paperline-pdf-text-layer ::selection { background:rgba(55,135,96,.3); }
    `;
    doc.head.append(style);
  }
  container.classList.add('paperline-pdf-text-layer');
  container.style.setProperty('--total-scale-factor', viewport.scale);
  container.style.setProperty('--scale-round-x', '1px');
  container.style.setProperty('--scale-round-y', '1px');
}

function renderFallbackTextLayer(container, textContent, viewport) {
  for (const item of textContent.items || []) {
    if (!item.str) continue;
    const span = container.ownerDocument.createElement('span');
    const rect = itemRect(item, viewport);
    span.textContent = item.str;
    span.style.position = 'absolute';
    span.style.left = `${rect[0]}px`;
    span.style.top = `${rect[1]}px`;
    span.style.width = `${Math.max(0, rect[2] - rect[0])}px`;
    span.style.height = `${Math.max(1, rect[3] - rect[1])}px`;
    container.append(span);
  }
}

function contentItems(textContent) {
  return Array.isArray(textContent) ? textContent : textContent?.items || [];
}

/** Convert PDF.js text items into the same string PDF.js displays. */
export function textContentToText(textContent) {
  return contentItems(textContent).map((item) => `${item.str || ''}${item.hasEOL ? '\n' : ''}`).join('');
}

/** Extract one zero-based page's text and its PDF.js content items. */
export async function getPageText(engineOrPdf, pageIndex) {
  const pdf = engineOrPdf?.pdf || engineOrPdf;
  if (!pdf?.getPage) throw new TypeError('Expected a PDF.js document or engine.');
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pdf.numPages) throw new RangeError('Invalid PDF page index.');
  const page = await pdf.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  return { pageIndex, page, content, viewport: page.getViewport({ scale: 1 }), items: content.items || [], text: textContentToText(content) };
}

export const extractPageText = getPageText;

function itemPoints(item, start = 0, end = item.str?.length || 0, style = {}) {
  const [a, b, c, d, x, y] = item.transform || [1, 0, 0, 1, 0, 0];
  const length = Math.max(1, item.str?.length || 0);
  const advance = Math.hypot(a, b) || 1;
  const height = Math.hypot(c, d) || Math.abs(item.height || 1);
  const direction = [a / advance, b / advance];
  const vertical = [c / height, d / height];
  const ascent = Number.isFinite(style.ascent) ? style.ascent : 0.8;
  const descent = Number.isFinite(style.descent) ? style.descent : -0.2;
  const width = Math.abs(item.width || 0);
  const from = item.dir === 'rtl' ? 1 - end / length : start / length;
  const to = item.dir === 'rtl' ? 1 - start / length : end / length;
  const point = (fraction, rise) => [x + direction[0] * width * fraction + vertical[0] * height * rise, y + direction[1] * width * fraction + vertical[1] * height * rise];
  return [point(from, ascent), point(to, ascent), point(from, descent), point(to, descent)];
}

function pointsRect(points) {
  return [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
}

function itemRect(item, viewport) {
  const points = itemPoints(item);
  return pointsRect(viewport?.convertToViewportPoint ? points.map(([x, y]) => viewport.convertToViewportPoint(x, y)) : points);
}

function rangeItems(textContent, start, end) {
  let offset = 0;
  const selected = [];
  for (const item of contentItems(textContent)) {
    const value = item.str || '';
    const itemStart = offset;
    const itemEnd = offset + value.length;
    if (itemEnd > start && itemStart < end && value) selected.push({ item, start: itemStart, end: itemEnd });
    offset = itemEnd + (item.hasEOL ? 1 : 0);
  }
  return { text: textContentToText(textContent), selected };
}

/**
 * Get selectable rectangles for a character range. `rects` are viewport/D﻿OM
 * coordinates; `pdfRects` are MuPDF page coordinates and can be passed to an
 * edit without needing to repeat coordinate conversion.
 */
export function getSelectionGeometry(textContent, start, end, viewport) {
  viewport ||= textContent?.viewport;
  textContent = textContent?.content || textContent;
  const { text, selected } = rangeItems(textContent, Math.max(0, start | 0), Math.max(0, end | 0));
  const left = Math.max(0, Math.min(start | 0, text.length));
  const right = Math.max(left, Math.min(end | 0, text.length));
  const pointSets = selected.map(({ item, start: itemStart }) => {
    const points = itemPoints(item, Math.max(0, left - itemStart), Math.min(item.str.length, right - itemStart), textContent?.styles?.[item.fontName]);
    return viewport?.convertToViewportPoint ? points.map(([x, y]) => viewport.convertToViewportPoint(x, y)) : points;
  });
  const rects = pointSets.map(pointsRect);
  // MuPDF uses the rotated, cropped, top-left page coordinate system, just like
  // an unscaled PDF.js viewport. Never confuse this with PDF's bottom-left user
  // space. A viewport is required when passing these rectangles to MuPDF.
  const scale = viewport?.scale || 1;
  const pdfRects = rects.map((rect) => rect.map((value) => value / scale));
  const bounds = unionRects(rects);
  return {
    start: left,
    end: right,
    text: text.slice(left, right),
    rects,
    pdfRects,
    bounds,
    quads: rects.map(rectToQuad),
    pdfQuads: pdfRects.map(rectToQuad),
    coordinateSpace: viewport ? 'page' : 'pdf-user',
  };
}

export const selectionGeometry = getSelectionGeometry;
export const getTextSelectionGeometry = getSelectionGeometry;

export function rectToQuad(rect) {
  const [x0, y0, x1, y1] = rect;
  // MuPDF quads are upper-left, upper-right, lower-left, lower-right.
  return [x0, y0, x1, y0, x0, y1, x1, y1];
}

export function unionRects(rects) {
  if (!rects?.length) return null;
  return rects.reduce((result, rect) => [
    Math.min(result[0], rect[0]), Math.min(result[1], rect[1]),
    Math.max(result[2], rect[2]), Math.max(result[3], rect[3]),
  ], [...rects[0]]);
}

function pageEditRects(edit) {
  const geometry = edit.geometry || edit.selectionGeometry || edit.selection || {};
  if (edit.pdfRect) return { rects: [edit.pdfRect], coordinateSpace: 'pdf' };
  if (edit.rect) return { rects: [edit.rect], coordinateSpace: edit.coordinateSpace || 'viewport' };
  if (edit.pdfRects || geometry.pdfRects) return { rects: edit.pdfRects || geometry.pdfRects, coordinateSpace: geometry.coordinateSpace || 'page' };
  if (edit.rects || geometry.rects) return { rects: edit.rects || geometry.rects, coordinateSpace: edit.coordinateSpace || 'viewport' };
  if (edit.pdfQuads || geometry.pdfQuads) return { quads: edit.pdfQuads || geometry.pdfQuads, coordinateSpace: 'pdf' };
  if (edit.quads || geometry.quads) return { quads: edit.quads || geometry.quads, coordinateSpace: edit.coordinateSpace || 'viewport' };
  return { rects: [], coordinateSpace: edit.coordinateSpace || 'viewport' };
}

function toPdfRect(rect, pageBounds, coordinateSpace, scale = 1, matrix) {
  const [x0, y0, x1, y1] = rect;
  if (coordinateSpace === 'pdf-user') {
    if (!matrix) throw new TypeError('PDF user-space geometry needs a page transformation matrix.');
    return pointsRect([[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(([x,y]) => [matrix[0]*x+matrix[2]*y+matrix[4], matrix[1]*x+matrix[3]*y+matrix[5]]));
  }
  if (coordinateSpace === 'pdf' || coordinateSpace === 'page') return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
  return [Math.min(x0, x1) / scale, Math.min(y0, y1) / scale, Math.max(x0, x1) / scale, Math.max(y0, y1) / scale];
}

export { toPdfRect };

function quadToRect(quad) {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function editRects(edit, page) {
  const source = pageEditRects(edit);
  const pageBounds = page.getBounds();
  const rects = source.rects?.length ? source.rects : (source.quads || []).map(quadToRect);
  if (rects.length) return rects.map((rect) => toPdfRect(rect, pageBounds, source.coordinateSpace, edit.scale || 1, page.getTransform()));
  const needle = edit.original || edit.selectedText || edit.selection?.text;
  if (needle) {
    const hits = page.search(needle, {});
    const occurrence = Number.isInteger(edit.occurrence) ? edit.occurrence : 0;
    if (!hits[occurrence]?.length) throw new PdfEngineError('The selected text was not found on this page.', 'TEXT_NOT_FOUND');
    return hits[occurrence].map(quadToRect);
  }
  throw new PdfEngineError('A PDF edit needs selection geometry or the original text to locate.', 'MISSING_GEOMETRY');
}

function addFreeText(page, rect, value, edit) {
  const annotation = page.createAnnotation('FreeText');
  annotation.setRect(rect);
  annotation.setContents(String(value ?? ''));
  annotation.setDefaultAppearance(edit.fontName || 'Helv', Number(edit.fontSize) || 11, edit.color || [0, 0, 0]);
  annotation.setQuadding(Number.isInteger(edit.quadding) ? edit.quadding : 0);
  annotation.setBorderWidth(0);
  annotation.setColor([]);
  annotation.update();
  return annotation;
}

function makeRedaction(page, rect) {
  const annotation = page.createAnnotation('Redact');
  annotation.setRect(rect);
  annotation.addQuadPoint(rectToQuad(rect));
  annotation.update();
  return annotation;
}

function authenticatedDocument(mupdf, bytes, edit) {
  let doc;
  try {
    doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  } catch (error) {
    throw passwordError(error) || new PdfEngineError('The file could not be opened as a valid PDF.', 'INVALID_PDF', error);
  }
  if (doc.needsPassword()) {
    const password = edit?.password;
    if (!password) {
      doc.destroy();
      throw new PdfEngineError('This PDF is password-protected. Supply edit.password to modify it.', 'PASSWORD_REQUIRED');
    }
    if (!doc.authenticatePassword(password)) {
      doc.destroy();
      throw new PdfEngineError('The PDF password is incorrect.', 'PASSWORD_INVALID');
    }
  }
  if (!doc.isPDF()) {
    doc.destroy();
    throw new PdfEngineError('The file is not a PDF document.', 'INVALID_PDF');
  }
  if (!doc.hasPermission('edit')) {
    doc.destroy();
    throw new PdfEngineError('This encrypted PDF does not permit editing. Open it with its owner password.', 'EDIT_NOT_PERMITTED');
  }
  return doc;
}

function bakeFreeText(doc, pageIndex, annotations) {
  // bake() is document-wide. Temporarily exclude existing annotations so that
  // comments, links, signatures, and form widgets retain their original state.
  const retained = [];
  try {
    for (let index = 0; index < doc.countPages(); index += 1) {
      const pageObject = doc.findPage(index);
      const original = pageObject.get('Annots');
      const originalWasNull = original.isNull();
      const saved = doc.newArray();
      const toBake = doc.newArray();
      for (let annotIndex = 0; annotIndex < original.length; annotIndex += 1) {
        const object = original.get(annotIndex);
        if (index === pageIndex && annotations.some((annot) => annot.getObject().asIndirect() === object.asIndirect())) toBake.push(object);
        else saved.push(object);
      }
      retained.push({ pageObject, saved, originalWasNull });
      if (toBake.length) pageObject.put('Annots', toBake);
      else pageObject.delete('Annots');
    }
    doc.bake(true, false);
  } finally {
    for (const { pageObject, saved, originalWasNull } of retained) {
      if (!originalWasNull || saved.length) pageObject.put('Annots', saved);
      else pageObject.delete('Annots');
    }
  }
}

/** Apply a real MuPDF redaction and/or baked FreeText annotation to a PDF. */
export async function applyPdfEdit(bytes, edit = {}) {
  if (!edit || !['replace', 'remove', 'add'].includes(edit.action)) throw new TypeError('PDF edit action must be replace, remove, or add.');
  const data = normalizePdfBytes(bytes);
  const mupdf = await loadMupdf();
  const doc = authenticatedDocument(mupdf, data, edit);
  let page;
  let output;
  try {
    const pageIndex = Number.isInteger(edit.pageIndex) ? edit.pageIndex : (Number.isInteger(edit.page) ? edit.page : 0);
    if (pageIndex < 0 || pageIndex >= doc.countPages()) throw new RangeError('Invalid PDF page index.');
    page = doc.loadPage(pageIndex);
    const rects = editRects(edit, page);
    if (edit.action === 'remove' || edit.action === 'replace') {
      for (const rect of rects) {
        const redaction = makeRedaction(page, rect);
        // Apply only our redaction; existing pending Redact annotations are
        // user content and must not accidentally remove additional regions.
        redaction.applyRedaction(0, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE);
        redaction.destroy();
      }
    }
    if (edit.action === 'add' || edit.action === 'replace') {
      const value = edit.value ?? edit.text;
      if (!String(value ?? '').length) throw new TypeError('A replacement/addition edit needs text.');
      // One annotation for the selection (not one duplicate per selected word).
      let rect = unionRects(rects);
      if (edit.action === 'add' && edit.position) {
        const width = Number(edit.width) || Math.max(rect[2] - rect[0], String(value).length * (Number(edit.fontSize) || 11) * 0.6);
        rect = edit.position === 'after'
          ? [rect[2], rect[1], rect[2] + width, rect[3]]
          : [rect[0] - width, rect[1], rect[0], rect[3]];
      }
      const annotation = addFreeText(page, rect, value, edit);
      bakeFreeText(doc, pageIndex, [annotation]);
      annotation.destroy();
    }
    // A full, garbage-collected save discards old content-stream objects; an
    // incremental update could otherwise leave the removed text recoverable.
    output = doc.saveToBuffer('garbage=4,compress=yes');
    return output.asUint8Array().slice();
  } finally {
    output?.destroy();
    page?.destroy();
    doc.destroy();
  }
}

/** Verify that selected/original text no longer occurs in the exported PDF. */
export async function verifyRemoval(bytes, original, options = {}) {
  let needle = typeof original === 'string' ? original : original?.text;
  if (original instanceof Uint8Array || original instanceof ArrayBuffer) {
    const source = await loadPdf(original, options);
    const pages = await Promise.all(Array.from({ length: source.pageCount }, (_, index) => getPageText(source, index)));
    needle = pages.map((page) => page.text).join('\n');
    await source.destroy();
  }
  if (!needle) return false;
  const engine = await loadPdf(bytes, options);
  try {
    const pages = await Promise.all(Array.from({ length: engine.pageCount }, (_, index) => getPageText(engine, index)));
    return !pages.some((page) => page.text.includes(needle));
  } finally {
    await engine.destroy();
  }
}

export { PDFJS_WORKER_URL };
