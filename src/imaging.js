import { applyTransform } from './color.js';

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_EXTENSION = /\.(jpe?g|png|webp)$/i;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This image could not be decoded. Try another JPG, PNG, or WebP.'));
    image.src = url;
  });
}

/**
 * Decode on this device. File object URLs stay valid for thumbnails; the caller
 * should revoke photo.url and close photo.image (if supported) when replacing it.
 * Modern HTML image decoding is the EXIF-aware fallback for createImageBitmap.
 */
export async function loadPhoto(fileOrUrl) {
  const isFile = typeof File !== 'undefined' && fileOrUrl instanceof File;
  let url;
  let name;

  if (isFile) {
    if (fileOrUrl.size > MAX_FILE_BYTES) {
      throw new Error('Choose an image that is 30 MB or smaller.');
    }
    if (!fileOrUrl.size) throw new Error('This image file is empty.');
    if (!PHOTO_TYPES.has(fileOrUrl.type.toLowerCase()) &&
        !(fileOrUrl.type === '' && PHOTO_EXTENSION.test(fileOrUrl.name))) {
      throw new Error('Use a JPG, PNG, or WebP image.');
    }
    url = URL.createObjectURL(fileOrUrl);
    name = fileOrUrl.name;
  } else if (typeof fileOrUrl === 'string' && fileOrUrl.trim()) {
    const localUrl = new URL(fileOrUrl, document.baseURI);
    if (localUrl.origin !== window.location.origin ||
        !['http:', 'https:', 'file:'].includes(localUrl.protocol)) {
      throw new Error('Demo images must use a local, same-origin path.');
    }
    url = localUrl.href;
    const basename = localUrl.pathname.split('/').pop() || 'demo-photo';
    try { name = decodeURIComponent(basename); } catch { name = basename; }
  } else {
    throw new Error('Choose an image file or a local demo image.');
  }

  try {
    let image;
    if (isFile && typeof createImageBitmap === 'function') {
      try {
        image = await createImageBitmap(fileOrUrl, { imageOrientation: 'from-image' });
      } catch {
        // Some browsers support bitmap decoding for fewer formats than <img>.
        image = await loadImage(url);
      }
    } else {
      image = await loadImage(url);
    }
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      image.close?.();
      throw new Error('This image has no readable pixels.');
    }
    return { image, width, height, name, url };
  } catch (error) {
    if (isFile) URL.revokeObjectURL(url);
    throw error;
  }
}

function dimensions(photo, maxDimension) {
  if (!photo?.image || !Number.isFinite(photo.width) || !Number.isFinite(photo.height) ||
      photo.width < 1 || photo.height < 1) {
    throw new Error('Load a photo before rendering.');
  }
  if (!Number.isFinite(maxDimension) || maxDimension < 1) {
    throw new Error('The preview size must be a positive number.');
  }
  const scale = Math.min(1, maxDimension / Math.max(photo.width, photo.height));
  return {
    width: Math.max(1, Math.round(photo.width * scale)),
    height: Math.max(1, Math.round(photo.height * scale)),
  };
}

function context2d(canvas) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Your browser could not create an image canvas.');
  return context;
}

function drawPreview(canvas, photo, maxDimension) {
  const { width, height } = dimensions(photo, maxDimension);
  canvas.width = width;
  canvas.height = height;
  const context = context2d(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(photo.image, 0, 0, width, height);
  return context;
}

/** Unmodified, aspect-preserving pixels for image analysis; never upscales. */
export function samplePhoto(photo, maxDimension = 400) {
  const canvas = document.createElement('canvas');
  try {
    const context = drawPreview(canvas, photo, maxDimension);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    canvas.width = canvas.height = 1;
  }
}

/** Synchronous CPU preview, using the exact same transform as JPEG export. */
export function renderPhoto(canvas, photo, settings = {}, maxDimension = 1600) {
  const context = drawPreview(canvas, photo, maxDimension);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const transformed = applyTransform(pixels, settings);
  context.putImageData(transformed || pixels, 0, 0);
  return canvas;
}

const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Export original oriented dimensions, not preview dimensions. Pixel processing
 * yields between strips. JPEG encoding and the full output canvas still require
 * browser memory; transparent pixels are composited on white after grading.
 */
export async function exportJpeg(photo, settings = {}) {
  const { width, height } = dimensions(photo, Math.max(photo?.width || 0, photo?.height || 0));
  // Freeze the settings so adjustments made during export cannot create seams.
  const exportSettings = typeof structuredClone === 'function'
    ? structuredClone(settings)
    : JSON.parse(JSON.stringify(settings));
  const output = document.createElement('canvas');
  const strip = document.createElement('canvas');
  try {
    await yieldToBrowser();
    output.width = width;
    output.height = height;
    const outputContext = context2d(output);
    outputContext.fillStyle = '#fff';
    outputContext.fillRect(0, 0, width, height);
    const stripHeight = Math.max(1, Math.min(256, Math.floor(262144 / width)));
    strip.width = width;
    strip.height = stripHeight;
    const stripContext = context2d(strip);

    for (let y = 0; y < height; y += stripHeight) {
      const rows = Math.min(stripHeight, height - y);
      stripContext.clearRect(0, 0, width, stripHeight);
      stripContext.drawImage(photo.image, 0, y, width, rows, 0, 0, width, rows);
      const pixels = stripContext.getImageData(0, 0, width, rows);
      const transformed = applyTransform(pixels, exportSettings);
      stripContext.putImageData(transformed || pixels, 0, 0);
      outputContext.drawImage(strip, 0, 0, width, rows, 0, y, width, rows);
      await yieldToBrowser();
    }

    return await new Promise((resolve, reject) => {
      output.toBlob(blob => {
        if (blob && blob.type === 'image/jpeg') resolve(blob);
        else reject(new Error('JPEG export failed. This image may exceed your browser’s canvas or memory limit.'));
      }, 'image/jpeg', 0.95);
    });
  } finally {
    output.width = output.height = 1;
    strip.width = strip.height = 1;
  }
}

/** Trigger a local browser download without uploading any image data. */
export function downloadBlob(blob, filename = 'gradematch.jpg') {
  if (!(blob instanceof Blob)) throw new Error('There is no exported file to download.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Safari needs the URL to survive beyond the initiating event loop turn.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
