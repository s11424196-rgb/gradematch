# Paperline

A browser-first PDF text editor prototype based on the supplied PRD. It demonstrates the core flow locally: open a PDF, select text, replace/remove/add text, preview the change, confirm it, undo/redo, and export an edited PDF.

## Run

Requires Node 20 or newer. No package installation is needed.

```sh
npm run dev        # http://localhost:5173
npm test           # core editor and existing unit tests
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Included MVP flow

- Three-page demo agreement with page thumbnails and local-only status.
- Word-boundary selection snapping, replace/remove/add actions, and live preview.
- Remove mode distinguishes a real content removal from a visual white overlay.
- Fit warnings for longer replacements and style-match status in the inspector.
- Confirm/cancel, undo/redo, zoom controls, imported-PDF validation, and PDF export.
- No accounts, uploads, analytics, or runtime processing service.

The current build provides a focused editing prototype and a small in-browser PDF writer for the demo/content model. Full fidelity content-stream editing for arbitrary producer PDFs, OCR, and deep metadata/form preservation remain engineering work for the next implementation phase.
