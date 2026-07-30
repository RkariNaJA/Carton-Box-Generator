# Carton Box Generator — React Conversion Design

**Date:** 2026-07-07
**Status:** Approved by user

## Goal

Convert the existing vanilla-JS Carton Box Generator (`index.html` + `app.js` + `style.css`) to a React application, while keeping the user's workflow identical: double-click one `index.html` file, works offline, no server.

Old files are archived into a `Version/` folder.

## Decisions (confirmed with user)

1. **Delivery:** Vite + React project; production build packed into a single self-contained `index.html` at the project root via `vite-plugin-singlefile`. User keeps double-clicking it.
2. **Scope:** Exactly the same look and features as today. No visual or functional changes.
3. **SheetJS:** installed from the official SheetJS CDN tarball at the **same version 0.20.3** currently used, so Excel output is byte-identical in behavior.

## Folder layout after conversion

```
Forming Box File/
├── index.html          ← built single-file React app (the deliverable)
├── Version/            ← archived old app: index.html, app.js, style.css,
│                          style v1/v2/v3 css, xlsx.full.min.js
├── src/                ← React source
│   ├── index.html      (Vite entry)
│   ├── main.jsx
│   ├── App.jsx         (state: rows, default qty, filters)
│   ├── components/     (Dropzone, Toolbar, SummaryStats, ResultTable)
│   ├── excel.js        (pure logic: parse EAN workbook, compute cartons, build UCC workbook)
│   └── style.css       (copied unchanged; `has-data` class still toggled on <body>)
├── package.json, vite.config.js, node_modules/, dist/
└── Input/, Output/     (untouched sample files)
```

## Logic ported 1-to-1 from app.js

- Sheet auto-detected by a header row containing "SKU number" + "Orli code" (first 10 rows of each sheet).
- Columns located by header text with fallbacks: Orli code→C, color→D, size→E, quantity→K.
- Rows skipped when style blank or quantity ≤ 0.
- `Total CTN = ROUNDUP(OrderQty / QtyPerCtn)`; Star/End CTN are running carton numbers zero-padded to 5 digits, **always computed over ALL rows** — color/size filters change only the view, never the export or the numbering.
- Export: sheet "Note", carton numbers written as text cells (`t:"s"`, `z:"@"`), same column widths, filename "EAN for X" → "UCC X".
- `excel.js` is pure (no DOM) so the same code runs in Node for verification.

## Verification

1. Run the ported `excel.js` in Node against `Input/EAN for BABOLAT - 0100000_2026-03-06.xlsx` with Qty/CTN = 48 and compare every cell against `Output/UCC BABOLAT - 0100000_2026-03-06.xlsx` (the check that validated the original app). Must be 0 differences.
2. Build succeeds and produces a single self-contained `index.html` (no external JS/CSS files needed).
3. User performs the final test by double-clicking `index.html` in their browser.

## Rebuilding later

`npm run build` regenerates the root `index.html` from `src/`.
