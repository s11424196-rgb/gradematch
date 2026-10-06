export const DEMO_DOCUMENT = {
  name: 'service-agreement.pdf',
  source: 'demo',
  pages: [
    { kicker: 'NORTHSTAR STUDIO', title: 'Service agreement', lead: 'A simple agreement for a focused, collaborative project.', footer: '1', text: 'This Service Agreement is entered into by Northstar Studio and Aria Bloom. The services begin on 15 March 2025 and continue through the completion of the project. The client agrees to provide timely feedback and access to the materials needed for delivery.' },
    { kicker: 'SCOPE & DELIVERY', title: 'Project details', lead: 'The work is designed to keep momentum without unnecessary process.', footer: '2', text: 'Northstar Studio will provide the agreed design direction, two rounds of revisions, and final delivery in PDF format. Any additional requests will be discussed and approved in writing before work begins.' },
    { kicker: 'TERMS', title: 'Fees & approval', lead: 'Clear expectations make good work easier for everyone.', footer: '3', text: 'The project fee is due within fourteen days of the final invoice. By signing below, both parties confirm that they have read and agree to the terms described in this document.' },
  ],
};

export function snapSelection(text, start, end) {
  let left = Math.max(0, Math.min(start, text.length));
  let right = Math.max(left, Math.min(end, text.length));
  while (left > 0 && !/\s/.test(text[left - 1])) left -= 1;
  while (right < text.length && !/\s/.test(text[right])) right += 1;
  return { start: left, end: right };
}

export function fitText(original, replacement) {
  const originalWidth = Math.max(1, original.length * 6.2);
  const replacementWidth = replacement.length * 6.2;
  if (replacementWidth <= originalWidth * 1.02) return { label: 'Fits', warning: false, substituted: false };
  if (replacementWidth <= originalWidth * 1.14) return { label: 'Tightened', warning: false, substituted: false };
  if (replacementWidth <= originalWidth * 1.35) return { label: 'Smaller type', warning: true, substituted: false };
  return { label: 'May overflow', warning: true, substituted: true };
}

export function applyEdit(text, selection, edit) {
  const before = text.slice(0, selection.start);
  const after = text.slice(selection.end);
  if (edit.action === 'remove') return edit.gap === 'close' ? before + after : before + ' '.repeat(Math.max(1, selection.end - selection.start)) + after;
  if (edit.action === 'add') return edit.position === 'after' ? before + text.slice(selection.start, selection.end) + edit.value + after : before + edit.value + text.slice(selection.start, selection.end) + after;
  return before + edit.value + after;
}

export function detectPdf(bytes) {
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== '%PDF-') return { valid: false, warnings: [], message: 'That file does not look like a valid PDF.' };
  const sample = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 600000)));
  const warnings = [];
  if (/\/Encrypt\b/.test(sample)) warnings.push('This PDF is encrypted. A password may be required.');
  if (/\/ByteRange\b/.test(sample)) warnings.push('This document is digitally signed. Exporting an edit will invalidate its signature.');
  return { valid: true, warnings, message: '' };
}

function pdfEscape(text) { return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, '?'); }

export function makePdf(document) {
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  const contentIds = [];
  for (const page of document.pages) {
    const lines = [page.kicker, page.title, '', page.lead, '', ...page.text.match(/.{1,88}(?:\s|$)/g) || []];
    const commands = ['BT', `/F1 9 Tf 54 760 Td`, `(${pdfEscape(lines[0])}) Tj`, `/F1 24 Tf 0 -38 Td`, `(${pdfEscape(lines[1])}) Tj`, `/F1 11 Tf 0 -42 Td`];
    for (const line of lines.slice(3)) { commands.push(`(${pdfEscape(line.trim())}) Tj`, '0 -19 Td'); }
    commands.push('ET');
    const content = commands.join('\n');
    contentIds.push(add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    pageIds.push(add('PLACEHOLDER'));
  }
  const pagesId = add('PLACEHOLDER');
  pageIds.forEach((id, index) => { objects[id - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`; });
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  // Keep the generated demo PDF strictly ASCII so xref byte offsets remain
  // correct after TextEncoder serialisation (UTF-8 bytes in the header would
  // otherwise make the file look damaged to PDF.js).
  let pdf = '%PDF-1.4\n% paperline\n';
  const offsets = [0];
  objects.forEach((body, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
