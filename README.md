# Paperline

A browser-first PDF text editor based on the supplied PRD. PDF.js provides the selectable text model and MuPDF.js provides local rendering, redaction, annotation baking, and export.

## Run

Requires Node 20 or newer.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # core editor and existing unit tests
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Included MVP flow

- Three-page demo agreement with page thumbnails and local-only status.
- Word-boundary selection snapping, replace/remove/add actions, and live preview.
- Remove mode distinguishes a real content removal from a visual white overlay.
- Fit warnings for longer replacements, affected-block reflow, and style-match status in the inspector.
- Confirm/cancel, undo/redo, zoom controls, imported-PDF validation, and PDF export.
- No accounts, uploads, analytics, or runtime processing service.
- PDF.js and MuPDF runtime assets are copied into `dist/` for static hosting.

Confirmed remove edits use MuPDF redaction and are re-extracted for verification; replace/add edits use baked FreeText with automatic fit warnings. OCR, complex-script layout, and deep font-substitution matching remain intentionally limited to the MVP boundary.
