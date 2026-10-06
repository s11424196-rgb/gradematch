import * as pdfEngineModule from './pdf-engine.js';
import { DEMO_DOCUMENT, detectPdf, fitText, makePdf } from './pdf-core.js';
import { icon } from './icons.js';

// This project ships ES modules directly, without a CSS bundler.
const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = new URL('./style.css', import.meta.url).href;
document.head.append(stylesheet);

const engine = pdfEngineModule.default || pdfEngineModule;
const $ = (selector) => document.querySelector(selector);
const app = $('#app');

/*
 * The engine is deliberately kept behind these small adapters.  The browser
 * UI should not need to know whether the engine is backed by MuPDF, PDF.js,
 * or a worker, and this also keeps the editor usable across the two engine
 * builds used by the demo.
 */
const findEngineFunction = (names, target = engine) => names.map((name) => target?.[name]).find((fn) => typeof fn === 'function');
const asBytes = (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
};
const copyBytes = (bytes) => bytes ? new Uint8Array(bytes) : bytes;

const state = {
  document: structuredClone(DEMO_DOCUMENT),
  engineDocument: null,
  sourceBytes: null,
  file: null,
  page: 0,
  selected: { start: 42, end: 54 },
  action: 'replace',
  replacement: '15 March 2025',
  addPosition: 'before',
  gap: 'blank',
  pending: null,
  history: [],
  future: [],
  zoom: 100,
  sidebar: true,
  busy: false,
  loading: true,
  rendered: new Map(),
  renderRevision: 0,
  warnings: [],
  lastRemovalVerification: null,
  removals: [],
  error: '',
  notice: null,
};

const docPage = () => state.document.pages[state.page] || { text: '', words: [] };
const selectedText = () => docPage().text.slice(state.selected.start, state.selected.end);
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

function textFromPage(page) {
  if (typeof page?.text === 'string') return page.text;
  if (typeof page?.textContent === 'string') return page.textContent;
  const items = page?.textContent?.items || page?.items || page?.textItems || [];
  return items.map((item) => item.str ?? item.text ?? item.content ?? '').join('');
}

function itemPosition(item, page) {
  const transform = item?.transform || item?.matrix;
  const x = Number(item?.x ?? item?.left ?? transform?.[4] ?? 0);
  const y = Number(item?.top ?? item?.y ?? (transform ? (page.height || 792) - transform[5] : 0));
  const width = Number(item?.width ?? Math.max(1, String(item?.str ?? item?.text ?? '').length * 6));
  const height = Number(item?.height ?? Math.abs(transform?.[3] || transform?.[0] || 12));
  return { x, y, width, height };
}

function pageWords(rawPage, text) {
  const source = rawPage?.words || rawPage?.textItems || rawPage?.items || rawPage?.textContent?.items || [];
  const words = [];
  let cursor = 0;
  for (const item of source) {
    const value = String(item?.text ?? item?.str ?? item?.content ?? '');
    if (!value) continue;
    const explicitStart = Number.isFinite(item?.start) ? item.start : Number.isFinite(item?.startOffset) ? item.startOffset : null;
    const start = explicitStart === null ? Math.max(0, text.indexOf(value, cursor)) : explicitStart;
    const safeStart = start < 0 ? cursor : start;
    const explicitEnd = Number.isFinite(item?.end) ? item.end : Number.isFinite(item?.endOffset) ? item.endOffset : null;
    const end = explicitEnd === null ? safeStart + value.length : explicitEnd;
    const position = itemPosition(item, rawPage);
    // Text items are often lines. Split them so every clickable span still
    // contains exact offsets while preserving the engine's geometry.
    const pieces = [...value.matchAll(/\S+/g)];
    if (!pieces.length) { cursor = Math.max(cursor, end); continue; }
    for (const piece of pieces) {
      const localStart = piece.index ?? 0;
      const word = piece[0];
      const ratio = value.length ? localStart / value.length : 0;
      const widthRatio = value.length ? word.length / value.length : 1;
      words.push({
        text: word,
        start: safeStart + localStart,
        end: safeStart + localStart + word.length,
        x: position.x + position.width * ratio,
        y: position.y,
        width: Math.max(1, position.width * widthRatio),
        height: position.height,
      });
    }
    cursor = Math.max(cursor, end);
  }
  if (words.length) return words;
  let match;
  const regex = /\S+/g;
  while ((match = regex.exec(text))) words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  return words;
}

function normalizePage(rawPage, index) {
  const text = textFromPage(rawPage);
  const width = Number(rawPage?.width || rawPage?.viewBox?.[2] || 612);
  const height = Number(rawPage?.height || rawPage?.viewBox?.[3] || 792);
  const words = pageWords({ ...rawPage, width, height }, text);
  const lines = text.match(/[^\n]{1,90}/g) || [];
  return {
    enginePage: rawPage,
    text,
    words,
    width,
    height,
    kicker: rawPage?.kicker || rawPage?.header || (index === 0 ? 'PDF DOCUMENT' : `PAGE ${index + 1}`),
    title: rawPage?.title || lines[0] || `Page ${index + 1}`,
    lead: rawPage?.lead || '',
    footer: rawPage?.footer || String(index + 1),
    lines: lines.slice(0, 5),
  };
}

function normalizeDocument(raw, name = state.file?.name || DEMO_DOCUMENT.name) {
  const pages = raw?.pages || raw?.document?.pages || raw?.pdf?.pages || [];
  return {
    name: raw?.name || raw?.filename || name,
    source: state.file ? 'imported' : 'demo',
    pages: pages.map((page, index) => normalizePage(page, index)),
  };
}

function extractBytes(value) {
  if (!value) return null;
  const direct = asBytes(value.bytes || value.data || value.pdfBytes || value.output);
  return direct || asBytes(value);
}

async function loadWithEngine(bytes) {
  const detection = detectPdf(bytes);
  if (!detection.valid) throw new Error(detection.message);
  const loader = findEngineFunction(['loadPdf', 'openPdf', 'loadDocument', 'load', 'parsePdf']);
  if (!loader) throw new Error('The PDF engine does not expose a loader.');
  const result = await loader.call(engine, copyBytes(bytes));
  const loadedDocument = result?.document || result;
  if (!loadedDocument.pages && (loadedDocument.pageCount || loadedDocument.pdf?.numPages)) {
    const count = loadedDocument.pageCount || loadedDocument.pdf.numPages;
    const extract = findEngineFunction(['getPageText', 'extractPageText']);
    if (!extract) throw new Error('The PDF engine does not expose page text extraction.');
    loadedDocument.pages = await Promise.all(Array.from({ length: count }, async (_, index) => {
      const page = await extract.call(engine, loadedDocument, index);
      const viewport = page.page?.getViewport?.({ scale: 1 }) || page.viewport;
      return { ...page, textContent: page.content, width: viewport?.width || page.width || 612, height: viewport?.height || page.height || 792, viewport };
    }));
  }
  return { document: loadedDocument, result, bytes: copyBytes(bytes), warnings: [...new Set([...detection.warnings, ...(result?.warnings || [])])] };
}

async function renderWithEngine(pageIndex, scale = 1, withText = true) {
  const source = state.engineDocument;
  const options = { scale, pageIndex };
  const method = findEngineFunction(['renderPage', 'render']);
  if (method?.length >= 4 || (source?.pdf && method)) {
    const canvas = document.createElement('canvas');
    const layer = withText && source?.pdf ? document.createElement('div') : null;
    if (layer) { layer.className = 'pdf-text-layer textLayer'; layer.style.setProperty('--scale-factor', String(scale)); layer.style.setProperty('--total-scale-factor', String(scale)); }
    const output = await method.call(engine, source, pageIndex, canvas, layer, scale);
    if (layer) decorateTextLayer(layer, output.textContent || docPage().enginePage.content);
    return { canvas, layer, viewport: output.viewport, text: output.text };
  }
  if (method) {
    try {
      return await method.call(engine, source, pageIndex, options);
    } catch (firstError) {
      throw firstError;
    }
  }
  const pageMethod = findEngineFunction(['renderPage', 'render'], state.engineDocument);
  if (pageMethod) return pageMethod.call(state.engineDocument, pageIndex, options);
  throw new Error('The PDF engine does not expose page rendering.');
}

async function exportWithEngine() {
  const exporter = findEngineFunction(['exportPdf', 'savePdf', 'serializePdf', 'toBytes', 'save']);
  if (!exporter && state.sourceBytes) return copyBytes(state.sourceBytes);
  if (!exporter) throw new Error('The PDF engine does not expose PDF export.');
  const result = await exporter.call(engine, state.engineDocument);
  const bytes = extractBytes(result);
  if (!bytes) throw new Error('The PDF engine returned no PDF bytes.');
  return copyBytes(bytes);
}

async function applyWithEngine(edit) {
  const native = findEngineFunction(['applyPdfEdit']);
  const method = native || findEngineFunction(['applyEdit', 'editText', 'applyTextEdit']);
  if (!method) throw new Error('The PDF engine does not expose text editing.');
  const payload = {
    pageIndex: state.page,
    start: state.selected.start,
    end: state.selected.end,
    selection: { ...state.selected },
    action: edit.action,
    value: edit.value,
    gap: edit.gap,
    position: edit.position,
    original: selectedText(),
    selectedText: selectedText(),
  };
  if (native) {
    const rects = selectionRects();
    if (!rects.length) throw new Error('The selected text has no editable page geometry.');
    payload.rects = rects;
    payload.coordinateSpace = 'pdf';
    const selectedNode = $('#paper [data-start="' + state.selected.start + '"]');
    const style = selectedNode ? getComputedStyle(selectedNode.parentElement) : null;
    payload.fontSize = parseFloat(style?.fontSize) || 11;
    payload.reflow = edit.action === 'replace';
    if (edit.action === 'add') {
      const rect = rects[0];
      const availableWidth = Math.max(40, edit.value.length * payload.fontSize * 0.55);
      const left = edit.position === 'after' ? rect[2] + 2 : Math.max(0, rect[0] - availableWidth - 2);
      payload.rects = [[left, rect[1], Math.min(docPage().width, left + availableWidth), rect[3] + 3]];
    } else if (edit.action === 'replace') {
      // Keep replacement atomic: MuPDF redacts the selected glyphs and bakes
      // the replacement in the same document operation. The old two-pass
      // remove-then-add flow could leave a visible source glyph behind when
      // an annotation save raced the second pass.
      return method.call(engine, copyBytes(state.sourceBytes), payload);
    } else if (edit.action === 'remove' && edit.gap === 'close') {
      // Reflow the trailing text in the selected PDF.js text item, which is
      // the smallest reliable line boundary exposed by the native engine.
      let offset = 0;
      let itemEnd = 0;
      const item = docPage().enginePage.content?.items?.find((candidate) => {
        const end = offset + (candidate.str || '').length;
        const contains = state.selected.start >= offset && state.selected.end <= end;
        if (contains) itemEnd = end;
        offset = end + (candidate.hasEOL ? 1 : 0);
        return contains;
      });
      if (item && itemEnd > state.selected.end) {
        const tail = docPage().text.slice(state.selected.end, itemEnd).trimStart();
        const tailRects = selectionRects({ start: state.selected.end, end: itemEnd });
        if (tail && tailRects.length) {
          const removed = await method.call(engine, copyBytes(state.sourceBytes), { ...payload, rects: [...rects, ...tailRects] });
          const first = rects[0];
          const right = Math.max(...tailRects.map((rect) => rect[2]));
          return method.call(engine, extractBytes(removed), { ...payload, action: 'add', value: tail, rects: [[first[0], first[1], right, first[3] + 3]] });
        }
      }
    }
    return method.call(engine, copyBytes(state.sourceBytes), payload);
  }
  if (method.length >= 4) return method.call(engine, state.engineDocument, state.page, { ...state.selected }, edit);
  return method.call(engine, state.engineDocument, payload);
}

function decorateTextLayer(layer, content) {
  const items = content?.items || [];
  const spans = Array.from(layer.querySelectorAll('span')).filter((node) => node.textContent && !node.querySelector('span'));
  let offset = 0;
  let spanIndex = 0;
  for (const item of items) {
    const value = item.str || '';
    if (value) {
      const parent = spans[spanIndex++];
      if (parent) parent.innerHTML = wrapWords(value, offset);
    }
    offset += value.length + (item.hasEOL ? 1 : 0);
  }
}

function selectionRects(selection = state.selected) {
  if (!state.engineDocument?.pdf) {
    return docPage().words.filter((word) => word.end > selection.start && word.start < selection.end && Number.isFinite(word.x)).map((word) => [word.x, word.y, word.x + word.width, word.y + word.height]);
  }
  const layer = $('#paper .pdf-text-layer');
  const pageNode = $('#paper .pdf-page');
  if (!layer || !pageNode) return [];
  const pageBounds = pageNode.getBoundingClientRect();
  const scaleX = docPage().width / pageBounds.width;
  const scaleY = docPage().height / pageBounds.height;
  const rects = [];
  for (const word of layer.querySelectorAll('[data-start][data-end]')) {
    if (Number(word.dataset.end) <= selection.start || Number(word.dataset.start) >= selection.end) continue;
    const range = document.createRange(); range.selectNodeContents(word);
    for (const rect of range.getClientRects()) {
      if (rect.width > 0 && rect.height > 0) rects.push([(rect.left - pageBounds.left) * scaleX, (rect.top - pageBounds.top) * scaleY, (rect.right - pageBounds.left) * scaleX, (rect.bottom - pageBounds.top) * scaleY]);
    }
  }
  // MuPDF uses top-left page coordinates. Mark the DOM rectangles as already
  // converted so the engine does not flip the PDF.js viewport a second time.
  return rects;
}

function renderTextLayer(page) {
  const hasGeometry = page.words.some((word) => Number.isFinite(word.x) && Number.isFinite(word.y) && word.x !== 0 && word.y !== 0);
  if (!hasGeometry) return `<div class="pdf-text-fallback">${wrapWords(page.text, 0)}</div>`;
  return `<div class="pdf-text-layer" aria-label="PDF text">${page.words.map((word) => {
    const active = word.start < state.selected.end && word.end > state.selected.start;
    return `<span class="pdf-word${active ? ' pdf-selection' : ''}" data-start="${word.start}" data-end="${word.end}" style="left:${word.x / page.width * 100}%;top:${word.y / page.height * 100}%;width:${word.width / page.width * 100}%;height:${word.height / page.height * 100}%">${safe(word.text)}</span>`;
  }).join('')}</div>`;
}

function render() {
  state.renderRevision += 1;
  app.innerHTML = `
    <header class="topbar">
      <div class="brand-lockup"><div class="brand-mark"><span></span><span></span><span></span></div><div><div class="brand-name">paperline</div><div class="brand-sub">PDF text editor</div></div></div>
      <div class="document-crumb"><span class="pdf-badge">PDF</span><strong title="${safe(state.document.name)}">${safe(state.document.name)}</strong><span class="saved-dot"></span><span class="saved-label">${state.loading ? 'Opening PDF…' : 'All changes saved locally'}</span></div>
      <div class="top-actions"><span class="privacy-pill">${icon('shield')} Local only</span><button class="icon-button" id="undo" title="Undo" ${state.history.length && !state.busy ? '' : 'disabled'}>${icon('undo')}</button><button class="icon-button" id="redo" title="Redo" ${state.future.length && !state.busy ? '' : 'disabled'}>${icon('redo')}</button><button class="export-button" id="export" ${state.busy || state.loading ? 'disabled' : ''}>${icon('download')} Export PDF</button></div>
    </header>
    <main class="app-shell">
      <aside class="sidebar ${state.sidebar ? '' : 'is-hidden'}"><div class="sidebar-head"><div><span class="eyebrow">DOCUMENT</span><h2>Pages</h2></div><button class="icon-button small" id="toggle-sidebar" title="Hide pages">${icon('panel')}</button></div><div class="page-count">${state.document.pages.length} pages <span>•</span> ${state.file ? 'Imported PDF' : 'Demo document'}</div><div class="thumbnails">${state.document.pages.map((page, index) => `<button class="thumbnail ${index === state.page ? 'active' : ''}" data-page="${index}"><span class="thumb-page-number">${index + 1}</span><span class="thumb-paper"><canvas data-thumb="${index}"></canvas><span class="thumb-copy"><span class="thumb-kicker">${safe(page.kicker)}</span><b>${safe(page.title)}</b>${page.lines.slice(0, 4).map((line) => `<i>${safe(line)}</i>`).join('')}</span></span></button>`).join('')}</div><button class="upload-secondary" id="upload-secondary">${icon('upload')} Open another PDF</button><input id="file-input" type="file" accept="application/pdf,.pdf" hidden /><div class="sidebar-foot"><span class="status-check">${icon('check')}</span><span><b>Original preserved</b><br />Untouched content stays unchanged.</span></div></aside>
      <section class="workspace"><div class="workspace-toolbar"><button class="toolbar-button mobile-pages" id="show-pages">${icon('panel')} Pages</button><div class="selection-status">${icon('cursor')} <span>${state.loading ? 'Loading PDF through the engine' : state.pending ? 'Previewing edit' : 'Select text on the page to begin'}</span></div><div class="zoom-controls"><button class="icon-button small" id="zoom-out" title="Zoom out">${icon('minus')}</button><span>${state.zoom}%</span><button class="icon-button small" id="zoom-in" title="Zoom in">${icon('plus')}</button><span class="toolbar-divider"></span><button class="icon-button small" id="fit" title="Fit to window">${icon('fit')}</button></div></div><div class="canvas-wrap"><div class="canvas-stage" style="--zoom:${state.zoom / 100}"><div class="paper" id="paper">${renderPaper()}</div></div><div class="canvas-hint">${icon('mouse')} Click a word to select it <span>·</span> Changes are applied only after you confirm</div></div></section>
      <aside class="inspector">${renderInspector()}</aside>
    </main><div class="toast" id="toast" hidden></div><dialog id="help-dialog"><button class="dialog-close" id="close-help">${icon('close')}</button><span class="dialog-icon">${icon('sparkles')}</span><h2>Make a precise edit</h2><p>Select a word or phrase in the document, choose what to do with it, then preview before committing. Paperline keeps the original file in memory and records every confirmed edit.</p><ol><li><b>Select.</b> Click any word on the page.</li><li><b>Choose.</b> Replace, remove, or insert text.</li><li><b>Confirm.</b> Export when the preview looks right.</li></ol></dialog>`;
  bindEvents();
  if (state.notice && state.notice.until > Date.now()) showToast(state.notice.message);
  void paintCurrentPage();
  void paintThumbnails();
}

function renderPaper() {
  const page = docPage();
  const bounds = state.pending?.rects?.[0];
  const previewStyle = bounds ? `left:${bounds[0] / page.width * 100}%;top:${bounds[1] / page.height * 100}%;min-width:${(bounds[2] - bounds[0]) / page.width * 100}%;` : '';
  const preview = state.pending ? `<div class="engine-preview ${state.pending.action === 'remove' ? 'is-removal' : ''}" style="${previewStyle}" aria-live="polite">${state.pending.action === 'remove' ? '&nbsp;' : safe(state.pending.value)}<span class="change-tag">${state.pending.action === 'remove' ? 'REMOVED' : 'PREVIEW'}</span></div>` : '';
  return `<div class="pdf-page" style="--page-width:${page.width};--page-height:${page.height}"><canvas id="pdf-canvas" width="${page.width}" height="${page.height}"></canvas><img id="pdf-image" alt="Rendered PDF page" hidden />${state.engineDocument?.pdf ? '<div class="pdf-text-layer"></div>' : renderTextLayer(page)}${preview}<div class="pdf-loading" ${state.loading ? '' : 'hidden'}>Rendering page…</div></div>`;
}

function wrapWords(text, offset) {
  let cursor = 0;
  return text.replace(/\S+/g, (word, index) => { const whitespace = safe(text.slice(cursor, index)); cursor = index + word.length; return `${whitespace}<span class="pdf-word" data-start="${offset + index}" data-end="${offset + index + word.length}">${safe(word)}</span>`; }) + safe(text.slice(cursor));
}

function renderInspector() {
  const selected = selectedText();
  const pending = state.pending;
  const fit = pending?.fit || fitText(selected, state.replacement);
  return `<div class="inspector-head"><div><span class="eyebrow">EDIT SELECTION</span><h2>${pending ? 'Preview your change' : 'Ready when you are'}</h2></div><button class="help-button" id="help">${icon('info')} How it works</button></div>${state.warnings.map((warning) => `<div class="warning-box amber">${icon('alert')}<span>${safe(warning)}</span></div>`).join('')}${state.lastRemovalVerification !== null ? `<div class="verification-result ${state.lastRemovalVerification ? '' : 'is-warning'}" role="status">${icon(state.lastRemovalVerification ? 'check' : 'alert')}${state.lastRemovalVerification ? 'Removal verified in exported PDF text.' : 'Removal verification found matching text. Review before sharing.'}</div>` : ''}<div class="selection-card"><div class="selection-card-top"><span class="selection-label">SELECTED TEXT</span><span class="page-chip">Page ${state.page + 1}</span></div><p class="selected-value">${safe(selected || 'Click a word on the page')}</p><p class="selection-meta">${selected.length} characters <span>•</span> ${selected ? 'PDF text layer · exact offsets' : 'No selection yet'}</p></div><div class="action-tabs" role="tablist">${[['replace', 'Replace', '↔'], ['remove', 'Remove', '–'], ['add', 'Add', '+']].map(([value, label, mark]) => `<button class="action-tab ${state.action === value ? 'active' : ''}" data-action="${value}" role="tab"><span>${mark}</span>${label}</button>`).join('')}</div>${renderActionForm(selected, fit, pending)}<div class="inspector-divider"></div><div class="style-row"><div><span class="eyebrow">MATCHING STYLE</span><strong>PDF text style</strong></div><span class="style-swatch">Aa</span><span class="match-good">${icon('check')} Matched</span></div><div class="inspector-note">${icon('shield')} The original PDF stays unchanged. Edits are kept in this browser until you export.</div>`;
}

function renderActionForm(selected, fit, pending) {
  if (!selected) return `<div class="empty-inspector"><div class="empty-icon">${icon('cursor')}</div><h3>Select text to edit</h3><p>Click any word or phrase in the document. The engine reports exact text offsets for each span.</p></div>`;
  if (pending) return `<div class="pending-card"><div class="pending-icon">${pending.action === 'remove' ? icon('eye-off') : icon('sparkles')}</div><div><span class="eyebrow">LIVE PREVIEW</span><h3>${pending.action === 'remove' ? 'Text marked for removal' : 'Replacement looks ready'}</h3></div><p>${pending.action === 'remove' ? 'The selected characters will be removed from the PDF content stream.' : `“${safe(pending.value)}” will inherit the surrounding style.`}</p><div class="pending-actions"><button class="cancel-button" id="cancel-preview">Cancel</button><button class="confirm-button" id="confirm-preview">Confirm edit ${icon('arrow')}</button></div></div>`;
  if (state.action === 'remove') return `<div class="form-section"><label class="field-label">REMOVE TEXT</label><div class="remove-preview">${safe(selected)}<span>${icon('eye-off')} Will be deleted from page content</span></div><label class="radio-row"><input type="radio" name="gap" value="blank" ${state.gap === 'blank' ? 'checked' : ''}><span class="radio-mark"></span><span>Leave blank <small>Preserve the original spacing</small></span></label><label class="radio-row"><input type="radio" name="gap" value="close" ${state.gap === 'close' ? 'checked' : ''}><span class="radio-mark"></span><span>Close the gap <small>Pull the surrounding text together</small></span></label></div><div class="warning-box">${icon('shield')} <span><b>Permanent removal</b><br />The text will be removed from the PDF content stream, not covered with a white shape.</span></div><button class="confirm-button" id="preview">Preview removal ${icon('arrow')}</button>`;
  const label = state.action === 'add' ? 'TEXT TO INSERT' : 'REPLACE WITH';
   return `<div class="form-section"><label class="field-label" for="replacement">${label}</label><textarea id="replacement" rows="2" spellcheck="false">${safe(state.replacement)}</textarea>${state.action === 'add' ? `<div class="position-toggle"><button class="${state.addPosition === 'before' ? 'active' : ''}" data-position="before">Insert before</button><button class="${state.addPosition === 'after' ? 'active' : ''}" data-position="after">Insert after</button></div>` : ''}<div class="fit-row">${icon('sparkles')}<span>Fit to original style</span><b>${fit.label}</b></div></div>${fit.warning ? `<div class="warning-box amber">${icon('alert')} <span><b>Text may overflow</b><br />Following words will reflow within the affected text block.</span></div>` : ''}<button class="confirm-button" id="preview">Preview ${state.action} ${icon('arrow')}</button>`;
}

function bindEvents() {
  document.querySelectorAll('[data-page]').forEach((button) => button.onclick = () => { state.page = Number(button.dataset.page); state.selected = defaultSelection(); state.pending = null; render(); });
  document.querySelectorAll('[data-action]').forEach((button) => button.onclick = () => { state.action = button.dataset.action; state.pending = null; render(); });
  document.querySelectorAll('[data-position]').forEach((button) => button.onclick = () => { state.addPosition = button.dataset.position; render(); });
  $('#paper')?.addEventListener('click', (event) => { const selection = event.target.closest('[data-start][data-end]'); if (!selection) return; state.selected = { start: Number(selection.dataset.start), end: Number(selection.dataset.end) }; state.pending = null; render(); });
  $('#paper')?.addEventListener('mouseup', () => {
    if (state.busy || state.pending) return;
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed) return;
    const anchor = selected.anchorNode?.parentElement?.closest('[data-start][data-end]');
    const focus = selected.focusNode?.parentElement?.closest('[data-start][data-end]');
    if (!anchor || !focus || !$('#paper').contains(anchor) || !$('#paper').contains(focus)) return;
    state.selected = { start: Math.min(Number(anchor.dataset.start), Number(focus.dataset.start)), end: Math.max(Number(anchor.dataset.end), Number(focus.dataset.end)) };
    state.pending = null;
    render();
    selected.removeAllRanges();
  });
  $('#replacement')?.addEventListener('input', (event) => { state.replacement = event.target.value; });
  document.querySelectorAll('input[name="gap"]').forEach((input) => input.onchange = () => { state.gap = input.value; render(); });
  $('#preview')?.addEventListener('click', previewEdit);
  $('#undo')?.addEventListener('click', () => void undo());
  $('#redo')?.addEventListener('click', () => void redo());
  $('#export')?.addEventListener('click', () => void exportPdf());
  $('#zoom-in')?.addEventListener('click', () => { state.zoom = Math.min(140, state.zoom + 10); render(); });
  $('#zoom-out')?.addEventListener('click', () => { state.zoom = Math.max(70, state.zoom - 10); render(); });
  $('#fit')?.addEventListener('click', () => { state.zoom = 100; render(); });
  $('#toggle-sidebar')?.addEventListener('click', () => { state.sidebar = false; render(); });
  $('#show-pages')?.addEventListener('click', () => { state.sidebar = true; render(); });
  $('#upload-secondary')?.addEventListener('click', () => $('#file-input')?.click());
  $('#file-input')?.addEventListener('change', (event) => { if (event.target.files[0]) void importPdf(event.target.files[0]); event.target.value = ''; });
  $('#help')?.addEventListener('click', () => $('#help-dialog')?.showModal());
  $('#close-help')?.addEventListener('click', () => $('#help-dialog')?.close());
  $('#help-dialog')?.addEventListener('click', (event) => { if (event.target.id === 'help-dialog') event.target.close(); });
  $('#confirm-preview')?.addEventListener('click', () => void confirmEdit());
  $('#cancel-preview')?.addEventListener('click', () => { state.pending = null; render(); });
}

function defaultSelection() {
  const page = docPage();
  const word = page.words[0];
  if (word) return { start: word.start, end: word.end };
  return { start: 0, end: Math.min(10, page.text.length) };
}

function previewEdit() {
  if (state.busy || state.loading) return;
  const value = state.action === 'remove' ? selectedText() : state.replacement.trim();
  if (state.action !== 'remove' && !value) return toast('Enter some text before previewing.');
  state.pending = { action: state.action, value, fit: fitText(selectedText(), value), gap: state.gap, position: state.addPosition, rects: selectionRects() };
  render();
  toast('Preview ready — review the highlighted change.');
}

async function confirmEdit() {
  if (!state.pending || state.busy) return;
  const edit = state.pending;
  state.busy = true;
  const beforeBytes = copyBytes(state.sourceBytes);
  const beforePage = state.page;
  const beforeSelected = { ...state.selected };
  try {
    const result = await applyWithEngine(edit);
    const resultBytes = extractBytes(result);
    const bytes = resultBytes || await exportWithEngine();
    const loaded = await loadWithEngine(bytes);
    state.engineDocument = loaded.document;
    state.sourceBytes = copyBytes(bytes);
    state.document = normalizeDocument(loaded.document, state.document.name);
    state.warnings = loaded.warnings || [];
    state.rendered.clear();
    const beforeRemovals = [...state.removals];
    if (edit.action === 'remove') state.removals.push(edit.value);
    state.lastRemovalVerification = await verifyRemovals(bytes);
    state.history.push({ bytes: beforeBytes, removals: beforeRemovals, page: beforePage, selected: beforeSelected, label: `${edit.action[0].toUpperCase()}${edit.action.slice(1)} “${edit.value.slice(0, 22)}${edit.value.length > 22 ? '…' : ''}”` });
    state.future = [];
    state.pending = null;
    state.selected = defaultSelection();
    toast(edit.action === 'remove' ? (state.lastRemovalVerification ? 'Edit applied. Removal verified in the engine output.' : 'Edit applied, but removal could not be verified.') : 'Edit applied and rendered again from engine output.');
  } catch (error) {
    toast(`Could not apply edit: ${error.message}`);
  } finally {
    state.busy = false;
    render();
  }
}

async function restoreSnapshot(snapshot, message) {
  if (!snapshot || state.busy) return;
  state.busy = true;
  try {
    const loaded = await loadWithEngine(snapshot.bytes);
    state.engineDocument = loaded.document;
    state.sourceBytes = copyBytes(snapshot.bytes);
    state.document = normalizeDocument(loaded.document, state.document.name);
    state.page = Math.min(snapshot.page, Math.max(0, state.document.pages.length - 1));
    state.selected = snapshot.selected || defaultSelection();
    state.pending = null;
    state.rendered.clear();
    state.removals = [...(snapshot.removals || [])];
    state.lastRemovalVerification = await verifyRemovals(state.sourceBytes);
    toast(message);
    return true;
  } catch (error) { toast(`Could not restore PDF: ${error.message}`); return false; }
  finally { state.busy = false; render(); }
}

async function undo() {
  if (state.busy) return;
  const entry = state.history.pop();
  if (!entry) return;
  state.future.push({ bytes: copyBytes(state.sourceBytes), removals: [...state.removals], page: state.page, selected: { ...state.selected } });
  if (!await restoreSnapshot(entry, 'Undid last edit.')) { state.future.pop(); state.history.push(entry); render(); }
}

async function redo() {
  if (state.busy) return;
  const entry = state.future.pop();
  if (!entry) return;
  state.history.push({ bytes: copyBytes(state.sourceBytes), removals: [...state.removals], page: state.page, selected: { ...state.selected }, label: 'Redo edit' });
  if (!await restoreSnapshot(entry, 'Redid edit.')) { state.history.pop(); state.future.push(entry); render(); }
}

function showToast(message) { const element = $('#toast'); if (!element) return; element.textContent = message; element.hidden = false; window.clearTimeout(window.__paperlineToast); window.__paperlineToast = window.setTimeout(() => { element.hidden = true; state.notice = null; }, 4200); }
function toast(message) { state.notice = { message, until: Date.now() + 4200 }; showToast(message); }

async function verifyRemovals(bytes) {
  if (!state.removals.length) return null;
  const verify = findEngineFunction(['verifyRemoval']);
  if (!verify) return false;
  try {
    const results = await Promise.all(state.removals.map((text) => verify.call(engine, copyBytes(bytes), text)));
    return results.every((result) => result === true || result?.verified === true);
  } catch {
    state.warnings = [...new Set([...state.warnings, 'Removal verification is unavailable for this PDF.'])];
    return false;
  }
}

async function importPdf(file) {
  if (state.busy || state.loading) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return toast('Please choose a PDF file.');
  state.loading = true; render();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const loaded = await loadWithEngine(bytes);
    state.file = file; state.engineDocument = loaded.document; state.sourceBytes = copyBytes(bytes); state.document = normalizeDocument(loaded.document, file.name);
    state.history = []; state.future = []; state.page = 0; state.selected = defaultSelection(); state.pending = null; state.warnings = loaded.warnings || []; state.removals = []; state.lastRemovalVerification = null; state.rendered.clear();
    toast(state.warnings[0] || 'PDF opened locally. Engine text layer ready for editing.');
  } catch (error) { toast(`Could not open PDF: ${error.message}`); }
  finally { state.loading = false; render(); }
}

async function exportPdf() {
  if (state.pending) return toast('Confirm or cancel the preview before exporting.');
  if (state.loading || state.busy) return;
  state.busy = true;
  try {
    const bytes = await exportWithEngine();
    state.lastRemovalVerification = await verifyRemovals(bytes);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = state.document.name.replace(/\.pdf$/i, '') + '-edited.pdf'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    render();
    toast(state.lastRemovalVerification === null ? 'Edited PDF exported.' : state.lastRemovalVerification ? 'Edited PDF exported. Removal verified in the current PDF bytes.' : 'Edited PDF exported. Removal verification found matching text.');
  } catch (error) { toast(`Could not export PDF: ${error.message}`); }
  finally { state.busy = false; render(); }
}

async function paintTarget(target, output) {
  if (!target || !output) return;
  const canvas = output.canvas || output;
  const image = output.image || output.bitmap;
  if (canvas && typeof target.getContext === 'function' && (canvas.width || canvas.videoWidth)) {
    target.width = canvas.width; target.height = canvas.height; target.getContext('2d').drawImage(canvas, 0, 0); target.closest('.thumb-paper')?.classList.add('is-rendered'); return;
  }
  const dataUrl = output.dataUrl || output.dataURL || (typeof output === 'string' ? output : null);
  if (dataUrl) { const img = target.parentElement?.querySelector('img') || target; if (img instanceof HTMLImageElement) { img.src = dataUrl; img.hidden = false; target.hidden = true; } return; }
  if (image && typeof target.getContext === 'function') { target.width = image.width; target.height = image.height; target.getContext('2d').drawImage(image, 0, 0); }
}

async function paintCurrentPage() {
  if (!state.engineDocument || !docPage()) return;
  const index = state.page;
  const revision = state.renderRevision;
  try {
    if (!state.rendered.has(index)) state.rendered.set(index, renderWithEngine(index));
    const output = await state.rendered.get(index);
    if (revision !== state.renderRevision) return;
    const pageElement = $('#pdf-canvas');
    await paintTarget(pageElement, output);
    if (output.layer) {
      const layer = output.layer.cloneNode(true);
      layer.style.width = `${docPage().width}px`; layer.style.height = `${docPage().height}px`;
      layer.style.transform = `scale(${$('#paper .pdf-page').clientWidth / docPage().width})`;
      $('#paper .pdf-text-layer')?.replaceWith(layer);
      for (const word of layer.querySelectorAll('[data-start][data-end]')) word.classList.toggle('pdf-selection', Number(word.dataset.start) < state.selected.end && Number(word.dataset.end) > state.selected.start);
    }
    $('.pdf-loading')?.setAttribute('hidden', '');
  } catch (error) { state.rendered.delete(index); if (!state.loading) toast(`Could not render page: ${error.message}`); }
}

async function paintThumbnails() {
  if (!state.engineDocument) return;
  const revision = state.renderRevision;
  await Promise.all(state.document.pages.map(async (_, index) => {
    try {
      if (!state.rendered.has(index)) state.rendered.set(index, renderWithEngine(index));
      const output = await state.rendered.get(index);
      if (revision !== state.renderRevision) return;
      const target = document.querySelector(`[data-thumb="${index}"]`);
      if (target) await paintTarget(target, output);
    } catch { /* The full page reports render failures; thumbnails remain textual. */ }
  }));
}

async function initialise() {
  state.document = normalizeDocument(DEMO_DOCUMENT, DEMO_DOCUMENT.name);
  render();
  try {
    const suppliedDemo = pdfEngineModule.DEMO_PDF_BYTES || pdfEngineModule.demoPdfBytes || (findEngineFunction(['createDemoPdf']) && await findEngineFunction(['createDemoPdf']).call(engine));
    const bytes = asBytes(suppliedDemo) || makePdf(DEMO_DOCUMENT);
    const loaded = await loadWithEngine(bytes);
    state.engineDocument = loaded.document; state.sourceBytes = copyBytes(bytes); state.document = normalizeDocument(loaded.document, DEMO_DOCUMENT.name); state.warnings = loaded.warnings || [];
  } catch (error) { toast(`Could not load the demo PDF: ${error.message}`); }
  state.loading = false; state.selected = defaultSelection(); render();
}

app.addEventListener('click', (event) => { if (state.busy) { event.preventDefault(); event.stopPropagation(); } }, true);
window.addEventListener('resize', () => { const layer = $('#paper .pdf-text-layer'); const pageNode = $('#paper .pdf-page'); if (layer && pageNode && state.engineDocument?.pdf) layer.style.transform = `scale(${pageNode.clientWidth / docPage().width})`; });
void initialise();
