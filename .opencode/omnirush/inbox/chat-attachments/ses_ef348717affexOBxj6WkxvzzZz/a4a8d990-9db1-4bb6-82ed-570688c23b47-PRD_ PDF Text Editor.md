# Product Requirements Document: PDF Text Editor

**Working title:** PDF Text Editor **Version:** 0.1 (MVP draft) **Status:** Draft for review

---

## 1. Overview

A web tool that lets users edit text in an existing PDF directly: select text, then **replace**, **remove**, or **add** text. Edits are made in place, so everything outside the edited text stays unchanged. No conversion to Word and back.

## 2. Problem

People often need to fix a typo, change a date, or remove a name in a PDF when they don't have the source file. Current options are weak:

- Converting PDF to Word and back to PDF breaks layout, changes fonts, and alters parts of the document the user never touched.
- Many tools "remove" text by covering it with a white box, so the text is still in the file.
- Most tools upload files to a server, which is a problem for sensitive documents.

## 3. Goals and Non-Goals

**Goals**

1. Edit selected text with a result that looks like the original.
2. Leave all untouched content pixel-identical.
3. Remove text for real, and prove it.
4. Keep the interaction simple: select, choose action, confirm.

**Non-goals (v1)**

- Editing scanned or image-only PDFs (OCR comes later)
- Full-page layout editing, moving images, redesigning pages
- Right-to-left and complex scripts (Arabic, Indic)
- Form creation, annotation, merging, or other general PDF tools
- Editing digitally signed regions without warning

## 4. Target Users

| User | Typical task |
| --- | --- |
| Individuals / job seekers | Fix details in a resume, certificate, or ID copy |
| Small business owners, freelancers | Correct an invoice or quote they received as PDF |
| Office and admin staff | Update dates, names, or amounts in contracts and letters |
| Anyone sharing sensitive files | Permanently remove names or numbers before sharing |

**Primary niche for v1:** simple text-based PDFs such as invoices, resumes, certificates, and letters. This is a hypothesis to validate with early users.

## 5. Core User Flow

1. User uploads a PDF. The tool renders it and checks whether it is supported (text-based, not scanned, not signed, not encrypted).
2. User selects text on the page.
3. User picks an action:
   - **Replace:** types the new text.
   - **Remove:** deletes the selection (option: close the gap or leave blank).
   - **Add:** uses **Insert before / Insert after** on the selected text.
4. Tool shows a **live preview** with warnings (font substituted, text overflow).
5. User confirms. The edit is applied and recorded in history.
6. User repeats as needed, then exports the edited PDF.

## 6. Functional Requirements

### P0 (must have for MVP)

| ID | Requirement |
| --- | --- |
| FR-1 | Upload a PDF and render it page by page. |
| FR-2 | Map a mouse text selection to the exact characters and coordinates in the PDF. Snap partial selections to word boundaries. |
| FR-3 | **Replace:** remove selected text and insert new text at the same position, matching font, size, color, spacing, and baseline. |
| FR-4 | **Remove:** delete the selected text from the page content (not covered by a shape), with a setting to close or keep the gap. |
| FR-5 | **Add:** insert new text before or after a selected word, copying the neighboring text's style. |
| FR-6 | **Font matching:** reuse the embedded font if it contains the needed glyphs. Otherwise pick the closest open or system font by name, then by metrics (width, weight, style). Show a "font substituted" indicator. |
| FR-7 | **Fit handling** when new text is longer than the original, in this order: slightly tighten character spacing, slightly reduce font size, wrap within the same text block. If it still doesn't fit, warn the user before applying. |
| FR-8 | Live preview with a confirm or cancel step before any edit is applied. |
| FR-9 | Undo and redo. The original file is never modified. |
| FR-10 | Export the edited PDF. |
| FR-11 | Detect and explain unsupported cases: scanned pages, digitally signed documents, encrypted files. Warn that editing a signed document will invalidate the signature. |
| FR-12 | Preserve links, bookmarks, form fields, and metadata that are not part of the edit. |

### P1 (soon after MVP)

| ID | Requirement |
| --- | --- |
| FR-13 | **Replace all** occurrences, with a "this one only" option. |
| FR-14 | **Verified removal:** after export, re-extract all text and confirm the removed text is gone from page content, metadata, and hidden layers. Show a pass/fail report. |
| FR-15 | Manual font picker with preview when the automatic match is poor. |
| FR-16 | Multi-line and multi-block selections. |
| FR-17 | Click anywhere to add new text (no selection needed). |

### P2 (later)

- OCR mode for scanned PDFs (clearly labeled as lower quality)
- Form field editing
- Right-to-left and complex script support
- Batch editing and reusable templates
- Optional edit history log

## 7. Non-Functional Requirements

- **Fidelity:** content outside the edit must be unchanged (zero pixel difference in untouched regions).
- **Performance:** a typical 10-page PDF opens in under 3 seconds; preview updates in under 1 second.
- **Privacy:** target is to process files locally in the browser with no upload. If server-side processing is needed, files are encrypted in transit and deleted right after export.
- **Compatibility:** latest Chrome, Edge, Firefox, Safari; usable on tablet, desktop first.
- **Reliability:** an edit either completes correctly or fails with a clear message. It never silently produces a corrupted file.

## 8. Technical Approach (initial)

- **Rendering and selection:** PDF.js, which exposes text positions for mapping selections to characters.
- **Editing engine:** edit the page content stream in place. Candidates: MuPDF (WASM) or pdf-lib for in-browser; PyMuPDF if server-side is needed.
- **Fonts:** font parser to read embedded fonts and subsets; a bundled library of open fonts (Liberation, Noto, Open Sans) for fallback.
- **Verification:** text extraction pass on the exported file for verified removal.
- **Quality testing:** an automated test set of 100 to 200 real PDFs (invoices, resumes, certificates, forms) from different producers (Word, Chrome, InDesign, scanners). Each change is compared by before and after renders.

## 9. Edge Cases and Error Handling

| Case | Behavior |
| --- | --- |
| Scanned / image-only page | Message: "This page is an image." Offer OCR mode when available. |
| Digitally signed PDF | Warn that editing invalidates the signature. Require confirmation. |
| Missing glyphs in subset font | Use closest font match and show the substitution indicator. |
| New text too long | Apply fit handling, then warn before applying. |
| Selection spans multiple lines or blocks | Snap to words (P0), full support in P1. |
| Encrypted / password-protected | Ask for password, or explain the limitation. |
| Text split across separate objects | Group by line and block; fail with a clear message if it can't be edited safely. |

## 10. Success Metrics

| Metric | Target |
| --- | --- |
| Edits judged visually acceptable on the test set | 90% or higher |
| Untouched regions pixel-identical after edit | 100% |
| Verified removal pass rate | 100% |
| Median time from upload to export for one edit | Under 60 seconds |
| Export completion rate (users who start an edit and export) | 60% or higher |
| Week-4 return rate | To be set after beta |

## 11. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Font mismatch makes edits obvious | Strong font matching, substitution indicator, manual picker |
| Crowded market with free competitors | Niche focus, in-place editing, verified removal, local processing |
| Layout breaks on complex PDFs | Support simple PDFs first; detect and warn on unsupported cases |
| **Misuse for forgery** (fake invoices, statements) | Terms of use prohibiting forgery, preserve original metadata where appropriate, consider optional edit log, enforce abuse reporting |
| Technical difficulty of content stream editing | Prototype early with PyMuPDF or MuPDF; validate on the test set before building UI |

## 12. Roadmap

| Phase | Scope |
| --- | --- |
| **0. Prototype** | Script that finds text, removes it, inserts a replacement. Run against test set. |
| **1. MVP** | FR-1 to FR-12 in the browser, simple text PDFs only. |
| **2. Beta** | Replace all, verified removal, font picker, multi-line selection. |
| **3. Expansion** | OCR for scans, forms, more languages, batch and templates. |

## 13. Open Questions

1. Fully client-side processing, or server-side for better edit quality?
2. Which niche first: invoices, resumes, or certificates?
3. Pricing model: free with limits, per-document, or subscription?
4. How strict should the anti-forgery measures be?
5. Does the MVP need accounts, or can it be anonymous?