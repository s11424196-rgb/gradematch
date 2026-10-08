import { DEFAULT_SETTINGS, estimateSettings, generateCube } from './color.js';
import { downloadBlob, exportJpeg, loadPhoto, renderPhoto, samplePhoto } from './imaging.js';
import { icon } from './icons.js';

const app = document.querySelector('#app');

const css = `
:root{--gm-ink:#1c2b26;--gm-muted:#718079;--gm-faint:#9aa9a1;--gm-line:#dfe8e2;--gm-panel:#fff;--gm-soft:#f1f6f2;--gm-green:#2f765a;--gm-dark:#20533f;--gm-orange:#bf7138;--gm-shadow:0 18px 55px rgba(29,61,45,.12)}
*{box-sizing:border-box}body{margin:0;min-width:320px;background:#f5f8f5;color:var(--gm-ink);font-family:'DM Sans',system-ui,sans-serif;font-synthesis:none}button,input{font:inherit;color:inherit}button{border:0;background:none;cursor:pointer}button:focus-visible,input:focus-visible{outline:3px solid #a5cdb5;outline-offset:2px}h1,h2,h3,p{margin:0}h1,h2,h3{font-family:Manrope,'DM Sans',sans-serif}.gm-app{min-height:100vh;display:flex;flex-direction:column}.gm-topbar{height:72px;display:flex;align-items:center;gap:24px;padding:0 30px;background:#fbfdfb;border-bottom:1px solid var(--gm-line)}.gm-brand{display:flex;align-items:center;gap:10px;min-width:210px}.gm-mark{display:flex;align-items:center;gap:3px;transform:rotate(-8deg)}.gm-mark i{display:block;width:6px;border-radius:5px;background:#b0cdb8}.gm-mark i:nth-child(1){height:16px}.gm-mark i:nth-child(2){height:27px;background:var(--gm-green)}.gm-mark i:nth-child(3){height:20px;background:#77a98a}.gm-brand strong{font:800 19px Manrope,sans-serif;letter-spacing:-1px}.gm-brand small{display:block;color:var(--gm-faint);font-size:9px;letter-spacing:.5px}.gm-local{display:flex;align-items:center;gap:7px;color:#567364;font-size:11px}.gm-local .icon{color:var(--gm-green);width:16px}.gm-top-actions{display:flex;align-items:center;gap:9px;margin-left:auto}.gm-button,.gm-ghost,.gm-icon-button{border:1px solid var(--gm-line);border-radius:8px;background:#fff;padding:9px 13px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:7px}.gm-button{background:var(--gm-green);border-color:var(--gm-green);color:#fff;box-shadow:0 5px 15px #2f765a25}.gm-button:hover{background:var(--gm-dark)}.gm-ghost:hover,.gm-icon-button:hover{border-color:#9bb9a5;background:var(--gm-soft)}.gm-icon-button{padding:8px}.gm-icon-button .icon,.gm-button .icon,.gm-ghost .icon{width:15px}.gm-body{display:grid;grid-template-columns:245px minmax(0,1fr) 326px;flex:1;min-height:calc(100vh - 72px)}.gm-sidebar,.gm-inspector{background:rgba(255,255,255,.72)}.gm-sidebar{border-right:1px solid var(--gm-line);padding:28px 20px;display:flex;flex-direction:column;gap:22px}.gm-eyebrow{display:block;color:#91a198;font:600 9px 'DM Mono',monospace;letter-spacing:1.3px;text-transform:uppercase}.gm-sidebar h2,.gm-inspector h2{font-size:16px;letter-spacing:-.3px;margin-top:6px}.gm-upload-card{border:1px dashed #b9cabd;border-radius:12px;padding:15px;background:#fbfefb}.gm-upload-card h3{font-size:12px;margin:10px 0 4px}.gm-upload-card p{font-size:10px;color:var(--gm-muted);line-height:1.45}.gm-upload-card .gm-button{width:100%;margin-top:13px}.gm-thumb{width:100%;height:75px;display:block;border-radius:7px;object-fit:cover;background:linear-gradient(135deg,#dce9df,#eef3ee);border:1px solid var(--gm-line)}.gm-sidebar-foot{margin-top:auto;border-top:1px solid var(--gm-line);padding-top:16px;color:var(--gm-muted);font-size:10px;line-height:1.5;display:flex;gap:8px}.gm-sidebar-foot .icon{color:var(--gm-green);width:16px}.gm-workspace{min-width:0;padding:24px 28px 35px;display:flex;flex-direction:column;align-items:center}.gm-toolbar{width:min(100%,980px);display:flex;align-items:center;gap:12px;margin-bottom:18px}.gm-match-state{font-size:12px;color:var(--gm-muted);display:flex;align-items:center;gap:8px}.gm-match-state strong{color:var(--gm-green)}.gm-match-dot{width:8px;height:8px;border-radius:50%;background:#c5d0ca}.gm-match-dot.is-ready{background:#64a97d;box-shadow:0 0 0 4px #64a97d22}.gm-view-buttons{margin-left:auto;display:flex;gap:3px;padding:3px;border:1px solid var(--gm-line);background:#fff;border-radius:8px}.gm-view-button{padding:6px 8px;border-radius:5px;font-size:10px;color:var(--gm-muted)}.gm-view-button.active{background:var(--gm-soft);color:var(--gm-dark);font-weight:700}.gm-preview-frame{width:min(100%,980px);padding:14px;background:#e9efea;border:1px solid #d6e1d8;border-radius:14px;box-shadow:var(--gm-shadow)}.gm-preview{position:relative;overflow:hidden;background:#19241f;border-radius:8px;min-height:260px;aspect-ratio:16/10}.gm-preview canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.gm-preview #original{opacity:1}.gm-preview #graded{clip-path:inset(0 0 0 50%)}.gm-preview.after-only #original{display:none}.gm-preview.after-only #graded{clip-path:none}.gm-preview.before-only #graded{display:none}.gm-preview.before-only #original{display:block}.gm-divider{position:absolute;top:0;bottom:0;width:2px;background:#fff;box-shadow:0 0 0 1px #19302655;left:50%;transform:translateX(-1px);pointer-events:none}.gm-divider::before{content:'↔';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;color:var(--gm-dark);border-radius:50%;width:25px;height:25px;display:grid;place-items:center;font-size:12px;box-shadow:0 2px 8px #132c2055}.gm-preview.before-only .gm-divider,.gm-preview.after-only .gm-divider{display:none}.gm-preview-caption{display:flex;justify-content:space-between;align-items:center;color:#718179;font-size:10px;padding:10px 3px 1px}.gm-divider-control{width:180px;accent-color:var(--gm-green)}.gm-hint{margin-top:12px;color:var(--gm-faint);font-size:10px;text-align:center}.gm-inspector{border-left:1px solid var(--gm-line);padding:27px 22px;overflow:auto}.gm-inspector-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:21px}.gm-help{color:var(--gm-green);font-size:10px;display:flex;align-items:center;gap:5px}.gm-help .icon{width:14px}.gm-settings-group{border-top:1px solid var(--gm-line);padding:18px 0 4px}.gm-settings-group:first-of-type{border-top:0;padding-top:0}.gm-group-title{display:flex;align-items:center;gap:7px;margin-bottom:13px}.gm-group-title .icon{width:15px;color:var(--gm-green)}.gm-group-title strong{font-size:11px}.gm-control{margin:0 0 13px}.gm-control-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:5px}.gm-control label{font-size:10px;color:#53655c}.gm-value{font:600 10px 'DM Mono',monospace;color:var(--gm-green);min-width:42px;text-align:right}.gm-control input[type=range]{display:block;width:100%;height:4px;margin:0;accent-color:var(--gm-green);cursor:pointer}.gm-check-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0 3px;font-size:10px;color:#53655c}.gm-check-row label{display:flex;align-items:center;gap:8px}.gm-check-row input{accent-color:var(--gm-green);width:15px;height:15px}.gm-match-button{width:100%;margin:10px 0 12px}.gm-secondary-actions{display:flex;gap:8px}.gm-secondary-actions button{flex:1}.gm-export-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.gm-export-row button{font-size:10px;padding:9px 4px}.gm-privacy-note{display:flex;gap:7px;color:var(--gm-muted);font-size:10px;line-height:1.45;border-top:1px solid var(--gm-line);padding-top:15px;margin-top:18px}.gm-privacy-note .icon{color:var(--gm-green);width:15px}.gm-toast{position:fixed;bottom:22px;left:50%;z-index:20;transform:translateX(-50%);padding:11px 16px;border-radius:8px;background:#20372c;color:#fff;font-size:11px;box-shadow:0 9px 30px #14271c44}.gm-error{color:#a65b39;font-size:10px;line-height:1.4;margin:0 0 12px}.gm-dialog{border:0;border-radius:14px;padding:25px;max-width:430px;color:var(--gm-ink);box-shadow:0 20px 70px #19312640}.gm-dialog::backdrop{background:#17332666}.gm-dialog h2{font-size:18px;margin:7px 0 10px}.gm-dialog p,.gm-dialog li{font-size:12px;line-height:1.6;color:var(--gm-muted)}.gm-dialog ol{padding-left:20px}.gm-dialog .dialog-close{position:absolute;right:12px;top:10px;padding:5px}.gm-dialog .dialog-close .icon{width:17px}.gm-dialog-icon{color:var(--gm-green)}
@media(max-width:1080px){.gm-body{grid-template-columns:210px minmax(0,1fr)}.gm-inspector{grid-column:1/-1;border-left:0;border-top:1px solid var(--gm-line);display:grid;grid-template-columns:1fr 1fr;gap:0 28px}.gm-inspector-head,.gm-match-button,.gm-secondary-actions,.gm-export-row,.gm-privacy-note{grid-column:1/-1}.gm-settings-group{border-top:0}.gm-brand{min-width:180px}}
@media(max-width:700px){.gm-topbar{height:62px;padding:0 16px}.gm-brand{min-width:0}.gm-brand small,.gm-local{display:none}.gm-top-actions{gap:5px}.gm-top-actions .gm-ghost{font-size:0;padding:8px}.gm-top-actions .gm-ghost .icon{width:16px}.gm-body{display:flex;flex-direction:column;min-height:0}.gm-sidebar{border-right:0;border-bottom:1px solid var(--gm-line);padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px}.gm-sidebar>div:first-child,.gm-sidebar-foot{grid-column:1/-1}.gm-sidebar-foot{margin-top:0}.gm-upload-card{padding:10px}.gm-upload-card h3{margin:7px 0 2px}.gm-upload-card p{display:none}.gm-upload-card .gm-button{margin-top:9px;padding:8px;font-size:10px}.gm-thumb{height:55px}.gm-workspace{padding:17px 12px 25px}.gm-toolbar{margin-bottom:12px;flex-wrap:wrap}.gm-view-buttons{margin-left:auto}.gm-preview-frame{padding:8px;border-radius:10px}.gm-preview{min-height:190px}.gm-inspector{display:block;padding:22px 16px}.gm-inspector-head{margin-bottom:18px}.gm-settings-group{border-top:1px solid var(--gm-line);padding-top:16px}}
@media(max-width:410px){.gm-brand strong{font-size:17px}.gm-top-actions .gm-button{font-size:0;padding:9px}.gm-top-actions .gm-button .icon{width:16px}.gm-match-state{font-size:10px}.gm-view-button{padding:6px 5px}.gm-preview{min-height:160px}}
`;
const style = document.createElement('style');
style.dataset.gradematch = 'true';
style.textContent = css;
document.head.append(style);

const clone = value => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
const state = {
  reference: null,
  target: null,
  settings: clone(DEFAULT_SETTINGS),
  extractedSettings: clone(DEFAULT_SETTINGS),
  view: 'split',
  divider: 50,
  status: 'Loading local demo…',
  error: '',
  busy: false,
  toastTimer: null,
};

const settingGroups = [
  { title: 'Tone', icon: 'sun', keys: ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'] },
  { title: 'Colour', icon: 'palette', keys: ['temperature', 'tint', 'saturation'] },
  { title: 'Blend', icon: 'sliders', keys: ['strength'] },
];
const controlMeta = {
  exposure: { label: 'Exposure', min: -3, max: 3, step: .01, digits: 2 },
  contrast: { label: 'Contrast', min: -100, max: 100, step: 1 },
  highlights: { label: 'Highlights', min: -100, max: 100, step: 1 },
  shadows: { label: 'Shadows', min: -100, max: 100, step: 1 },
  whites: { label: 'Whites', min: -100, max: 100, step: 1 },
  blacks: { label: 'Blacks', min: -100, max: 100, step: 1 },
  temperature: { label: 'Temperature', min: -100, max: 100, step: 1 },
  tint: { label: 'Tint', min: -100, max: 100, step: 1 },
  saturation: { label: 'Saturation', min: -100, max: 100, step: 1 },
  strength: { label: 'Match strength', min: 0, max: 100, step: 1, unsigned: true },
  skinStrength: { label: 'Protection amount', min: 0, max: 100, step: 1, unsigned: true },
};

function formatValue(key, value) {
  const meta = controlMeta[key];
  if (meta?.digits) return `${value >= 0 ? '+' : ''}${Number(value).toFixed(meta.digits)}`;
  return meta?.unsigned ? `${Math.round(value)}%` : `${value > 0 ? '+' : ''}${Math.round(value)}`;
}

function settingControl(key) {
  const meta = controlMeta[key];
  return `<div class="gm-control"><div class="gm-control-head"><label for="${key}">${meta.label}</label><output class="gm-value" id="${key}-value">${formatValue(key, state.settings[key])}</output></div><input id="${key}" data-setting="${key}" type="range" min="${meta.min}" max="${meta.max}" step="${meta.step}" value="${state.settings[key]}" aria-label="${meta.label}"></div>`;
}

function settingsMarkup() {
  return `${settingGroups.map(group => `<section class="gm-settings-group"><div class="gm-group-title">${icon(group.icon)}<strong>${group.title}</strong></div>${group.keys.map(settingControl).join('')}</section>`).join('')}<section class="gm-settings-group"><div class="gm-group-title">${icon('shield')}<strong>Skin protection</strong></div><div class="gm-check-row"><label for="skin-protection"><input id="skin-protection" type="checkbox" ${state.settings.skinProtection ? 'checked' : ''}>Protect skin tones</label><span class="gm-value">${state.settings.skinProtection ? 'ON' : 'OFF'}</span></div>${settingControl('skinStrength')}</section>`;
}

function shell() {
  const refName = state.reference?.name || 'Reference photo';
  const targetName = state.target?.name || 'Target photo';
  app.innerHTML = `<div class="gm-app"><header class="gm-topbar"><div class="gm-brand"><div class="gm-mark"><i></i><i></i><i></i></div><div><strong>gradematch</strong><small>LOCAL PHOTO MATCHER</small></div></div><div class="gm-local">${icon('lock')} All processing stays on this device</div><div class="gm-top-actions"><button class="gm-ghost" id="privacy-button">${icon('shield')} Privacy</button><button class="gm-ghost" id="how-button">${icon('info')} How it works</button><button class="gm-button" id="jpg-button">${icon('download')} Export JPG</button></div></header><main class="gm-body"><aside class="gm-sidebar"><div><span class="gm-eyebrow">Photos</span><h2>Build your match</h2></div><div class="gm-upload-card"><img class="gm-thumb" id="reference-thumb" alt="${refName}" ${state.reference?.url ? `src="${state.reference.url}"` : ''}><h3>Reference look</h3><p>Colours and tone to match.</p><button class="gm-button" data-upload="reference">${icon('upload')} Choose reference</button><input id="reference-input" type="file" accept="image/jpeg,image/png,image/webp" hidden></div><div class="gm-upload-card"><img class="gm-thumb" id="target-thumb" alt="${targetName}" ${state.target?.url ? `src="${state.target.url}"` : ''}><h3>Target photo</h3><p>The photo that receives the grade.</p><button class="gm-button" data-upload="target">${icon('upload')} Choose target</button><input id="target-input" type="file" accept="image/jpeg,image/png,image/webp" hidden></div><div class="gm-sidebar-foot">${icon('leaf')}<span><b>Private by design.</b><br>Photos never leave your browser.</span></div></aside><section class="gm-workspace"><div class="gm-toolbar"><div class="gm-match-state"><span class="gm-match-dot ${state.status === 'Look matched' ? 'is-ready' : ''}"></span><span id="match-state">${state.status}</span></div><div class="gm-view-buttons" role="tablist"><button class="gm-view-button ${state.view === 'before' ? 'active' : ''}" data-view="before">Before</button><button class="gm-view-button ${state.view === 'split' ? 'active' : ''}" data-view="split">Split</button><button class="gm-view-button ${state.view === 'after' ? 'active' : ''}" data-view="after">After</button></div></div><div class="gm-preview-frame"><div id="preview-image" class="gm-preview ${state.view === 'after' ? 'after-only' : state.view === 'before' ? 'before-only' : ''}"><canvas id="original" aria-label="Original target preview"></canvas><canvas id="graded" aria-label="Matched target preview"></canvas><div class="gm-divider" style="left:${state.divider}%"></div></div><div class="gm-preview-caption"><span>Target preview</span><label>Divider <input id="divider" class="gm-divider-control" type="range" min="0" max="100" value="${state.divider}" aria-label="Before and after divider"></label></div></div><p class="gm-hint">Compare the original and matched look, then export a full-resolution JPG or a .cube LUT.</p></section><aside class="gm-inspector"><div class="gm-inspector-head"><div><span class="gm-eyebrow">Match controls</span><h2>Shape the look</h2></div><button class="gm-help" id="inspector-help">${icon('info')} Help</button></div>${state.error ? `<p class="gm-error" role="alert">${escapeHtml(state.error)}</p>` : ''}<button class="gm-button gm-match-button" id="match-button" ${!state.reference || !state.target || state.busy ? 'disabled' : ''}>${icon('sparkles')} Match photos</button><div class="gm-secondary-actions"><button class="gm-ghost" id="reset-button" ${state.busy ? 'disabled' : ''}>${icon('reset')} Reset to match</button><button class="gm-ghost" id="lut-button" ${!state.target || state.busy ? 'disabled' : ''}>${icon('cube')} Export .cube</button></div>${settingsMarkup()}<div class="gm-privacy-note">${icon('shield')}<span>Matching uses local canvas pixels. No photo, setting, or export is uploaded.</span></div></aside></main><div class="gm-toast" id="toast" hidden></div><dialog class="gm-dialog" id="help-dialog"><button class="dialog-close" aria-label="Close">${icon('close')}</button><div class="gm-dialog-icon">${icon('sparkles')}</div><h2>Match a look in seconds</h2><p>Choose a reference and target photo, then press Match photos. GradeMatch estimates tone and colour from local pixels and gives you editable controls for the final look.</p><ol><li>Use Before, Split, or After to inspect the result.</li><li>Adjust any slider and use Reset to return to the extracted match.</li><li>Export a full-resolution JPG or a portable .cube LUT.</li></ol></dialog><dialog class="gm-dialog" id="privacy-dialog"><button class="dialog-close" aria-label="Close">${icon('close')}</button><div class="gm-dialog-icon">${icon('shield')}</div><h2>Your photos stay local</h2><p>Images are decoded and processed with browser APIs on this device. GradeMatch has no upload endpoint, account, analytics, or remote processing service.</p></dialog></div>`;
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]); }

function drawOriginal(canvas, photo) {
  if (!photo || !canvas) return;
  const max = 1400;
  const scale = Math.min(1, max / Math.max(photo.width, photo.height));
  canvas.width = Math.max(1, Math.round(photo.width * scale));
  canvas.height = Math.max(1, Math.round(photo.height * scale));
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(photo.image, 0, 0, canvas.width, canvas.height);
}

function updatePreview() {
  if (!state.target) return;
  const original = document.querySelector('#original');
  const graded = document.querySelector('#graded');
  try {
    drawOriginal(original, state.target);
    renderPhoto(graded, state.target, state.settings, 1400);
    graded.style.clipPath = state.view === 'split' ? `inset(0 0 0 ${state.divider}%)` : '';
    const preview = document.querySelector('#preview-image');
    if (preview) preview.classList.toggle('after-only', state.view === 'after');
    if (preview) preview.classList.toggle('before-only', state.view === 'before');
    const divider = document.querySelector('.gm-divider');
    if (divider) divider.style.left = `${state.divider}%`;
  } catch (error) {
    state.error = error.message;
    const errorNode = document.querySelector('.gm-error');
    if (errorNode) errorNode.textContent = state.error;
  }
}

function updateControlValues() {
  for (const key of Object.keys(controlMeta)) {
    const input = document.querySelector(`#${key}`);
    const output = document.querySelector(`#${key}-value`);
    if (input) input.value = state.settings[key];
    if (output) output.textContent = formatValue(key, state.settings[key]);
  }
  const checkbox = document.querySelector('#skin-protection');
  if (checkbox) checkbox.checked = state.settings.skinProtection;
  const skinLabel = checkbox?.closest('.gm-check-row')?.querySelector('.gm-value');
  if (skinLabel) skinLabel.textContent = state.settings.skinProtection ? 'ON' : 'OFF';
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
}

function openDialog(id) {
  const dialog = document.querySelector(id);
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function bindEvents() {
  document.querySelectorAll('[data-upload]').forEach(button => {
    button.addEventListener('click', () => document.querySelector(`#${button.dataset.upload}-input`)?.click());
  });
  for (const kind of ['reference', 'target']) {
    document.querySelector(`#${kind}-input`)?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void loadUploaded(kind, file);
    });
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === state.view));
    updatePreview();
  }));
  document.querySelector('#divider')?.addEventListener('input', event => {
    state.divider = Number(event.target.value);
    updatePreview();
  });
  document.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('input', event => {
    state.settings[event.target.dataset.setting] = Number(event.target.value);
    const output = document.querySelector(`#${event.target.dataset.setting}-value`);
    if (output) output.textContent = formatValue(event.target.dataset.setting, state.settings[event.target.dataset.setting]);
    updatePreview();
  }));
  document.querySelector('#skin-protection')?.addEventListener('change', event => {
    state.settings.skinProtection = event.target.checked;
    const label = event.target.closest('.gm-check-row')?.querySelector('.gm-value');
    if (label) label.textContent = state.settings.skinProtection ? 'ON' : 'OFF';
    updatePreview();
  });
  document.querySelector('#match-button')?.addEventListener('click', () => void matchPhotos());
  document.querySelector('#reset-button')?.addEventListener('click', resetMatch);
  document.querySelector('#jpg-button')?.addEventListener('click', () => void exportPhoto());
  document.querySelector('#lut-button')?.addEventListener('click', exportLut);
  document.querySelector('#how-button')?.addEventListener('click', () => openDialog('#help-dialog'));
  document.querySelector('#inspector-help')?.addEventListener('click', () => openDialog('#help-dialog'));
  document.querySelector('#privacy-button')?.addEventListener('click', () => openDialog('#privacy-dialog'));
  document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close?.()));
}

async function loadUploaded(kind, file) {
  state.busy = true;
  state.error = '';
  try {
    const photo = await loadPhoto(file);
    state[kind] = photo;
    state.status = state.reference && state.target ? 'Ready to match' : 'Add both photos to begin';
    shell();
    bindEvents();
    updatePreview();
    showToast(`${kind === 'reference' ? 'Reference' : 'Target'} photo loaded locally.`);
  } catch (error) {
    state.error = error.message;
    shell();
    bindEvents();
  } finally {
    state.busy = false;
    const matchButton = document.querySelector('#match-button');
    if (matchButton && state.reference && state.target) matchButton.removeAttribute('disabled');
  }
}

function matchPhotos() {
  if (!state.reference || !state.target || state.busy) return;
  state.busy = true;
  state.error = '';
  try {
    const result = estimateSettings(samplePhoto(state.reference), samplePhoto(state.target));
    state.settings = { ...result.settings, skinProtection: state.settings.skinProtection, skinStrength: state.settings.skinStrength };
    state.extractedSettings = clone(state.settings);
    state.status = 'Look matched';
    const statusNode = document.querySelector('#match-state');
    if (statusNode) statusNode.textContent = state.status;
    document.querySelector('.gm-match-dot')?.classList.add('is-ready');
    updateControlValues();
    updatePreview();
    showToast('Look matched. Fine-tune any control below.');
  } catch (error) {
    state.error = error.message;
    const errorNode = document.querySelector('.gm-error');
    if (errorNode) errorNode.textContent = error.message;
  } finally {
    state.busy = false;
    document.querySelector('#match-button')?.removeAttribute('disabled');
  }
}

function resetMatch() {
  state.settings = clone(state.extractedSettings);
  updateControlValues();
  updatePreview();
  showToast('Reset to the extracted match.');
}

async function exportPhoto() {
  if (!state.target || state.busy) return;
  state.busy = true;
  try {
    const blob = await exportJpeg(state.target, state.settings);
    downloadBlob(blob, `${state.target.name.replace(/\.[^.]+$/, '') || 'gradematch'}-matched.jpg`);
    showToast('Full-resolution JPG exported locally.');
  } catch (error) { state.error = error.message; showToast(error.message); }
  finally { state.busy = false; }
}

function exportLut() {
  if (!state.target || state.busy) return;
  const blob = new Blob([generateCube(state.settings)], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, 'gradematch.cube');
  showToast('.cube LUT exported locally.');
}

async function initialise() {
  shell();
  bindEvents();
  try {
    const [reference, target] = await Promise.all([loadPhoto('/images/reference.jpg'), loadPhoto('/images/alpine.jpg')]);
    state.reference = reference;
    state.target = target;
    shell();
    bindEvents();
    matchPhotos();
  } catch (error) {
    state.status = 'Add photos to begin';
    state.error = `Demo images could not load: ${error.message}`;
    shell();
    bindEvents();
  }
}

void initialise();
