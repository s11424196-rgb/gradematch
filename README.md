# GradeMatch

GradeMatch is a responsive, local-only photo matcher. Load a reference photo and a target photo, estimate a matching look in the browser, fine-tune the tone and colour controls, and export either a full-resolution JPG or a standard `.cube` LUT.

## Run

Requires Node 20 or newer. The application has no runtime dependencies.

```sh
npm run dev        # http://localhost:5173
npm test           # colour engine tests
npm run build      # static output in dist/
npm run preview    # serve dist/ locally
```

## Included flow

- Local demo images load and match automatically.
- Reference and target JPG, PNG, and WebP uploads are validated in the browser.
- Before, split, and after preview modes include an adjustable comparison divider.
- Exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, saturation, strength, and skin-protection controls are editable live.
- Reset restores the extracted match, while help and privacy dialogs explain the workflow.
- JPG and 33-point `.cube` exports are generated locally; no account, upload, analytics, or processing service is used.

The build copies only `index.html`, `src/`, and the local `public/` image/font assets into `dist/`. No PDF engine or PDF runtime assets are required.
