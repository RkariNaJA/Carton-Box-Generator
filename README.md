# Carton Box Generator

A small web app that turns a customer **EAN Excel file** into a **"Note" carton table** (Style, Color, Size, Total CTN, Star CTN, End CTN, Order Qty, Qty/CTN) and lets you download the result as a new Excel file.

Everything runs in the browser — you drop in the EAN file, adjust the pieces-per-carton if needed, and download the finished `UCC ...` file. No server, no upload.

The on-screen table can be filtered by **Style**, **Color**, **Size** and (with several files loaded) **File**. Filters only change what is shown — the downloaded Excel always contains every row.

```
EAN file  →  "Note" table (auto carton numbering)  →  Excel download
```

---

## How it works (the important logic)

For every product row the app calculates, exactly like the original Excel formulas:

| Column      | Meaning                          | Formula                              |
|-------------|----------------------------------|--------------------------------------|
| `Total CTN` | how many cartons this row needs  | `ROUNDUP(Order Qty ÷ Qty/CTN)`       |
| `Full CTN`  | how many completely full cartons | `ROUNDDOWN(Order Qty ÷ Qty/CTN)`     |
| `Scrap CTN` | leftover pieces in the last (partial) carton | `Order Qty − Full CTN × Qty/CTN` — blank when it divides evenly |
| `Star CTN`  | first carton number for this row | previous End CTN + 1 (text `00001`)  |
| `End CTN`   | last carton number for this row  | Star CTN + Total CTN − 1 (text)      |

Example: Order Qty **148** at **48** per carton → Total CTN `4`, Full CTN `3`, Scrap CTN `4` (three full cartons + one carton with only 4 pieces).

Carton numbers keep counting across all rows, and are stored as **text** so Excel shows `00001` instead of `1`.

> `Full CTN` and `Scrap CTN` appear only in the on-screen table — the downloaded Excel file keeps the original "Note" sheet layout (Style … Qty/CTN) so anything that depends on that format keeps working.

The output file is named automatically:
`EAN for BABOLAT - 0100000.xlsx`  →  `UCC BABOLAT - 0100000.xlsx`

---

## File tree

```
Forming Box File/
├── index.html                  ← the finished app (single self-contained file — just open it)
├── package.json                ← project name, dependencies (React + SheetJS), build scripts
├── vite.config.js              ← build settings; bundles everything into one HTML file
│
├── src/                        ← the actual source code (edit these)
│   ├── main.jsx                ← app entry point — mounts React into the page
│   ├── App.jsx                 ← main screen: holds all data, wires the pieces together
│   ├── excel.js                ← ★ core logic: read EAN file, compute cartons, build/name output
│   ├── style.css               ← all the styling (the current design)
│   ├── index.html              ← the page shell React loads into (dev)
│   └── components/             ← the visual building blocks
│       ├── Dropzone.jsx        ← the drag-and-drop / click-to-choose file box
│       ├── Toolbar.jsx         ← Qty/CTN input, "Apply to all", Style/Color/Size filters, Download button
│       ├── SummaryStats.jsx    ← the top stat cards (rows, cartons, pieces, carton range)
│       └── ResultTable.jsx     ← the results table with the editable Qty/CTN cell
│
├── scripts/
│   └── verify.mjs              ← test: checks src/excel.js output matches the known-good Output file, cell by cell
│
├── Input/                      ← example input (a real EAN file)
│   └── EAN for BABOLAT - 0100000_2026-03-06.xlsx
├── Output/                     ← the matching correct result, used by verify.mjs
│   └── UCC BABOLAT - 0100000_2026-03-06.xlsx
│
├── dist/                       ← build output folder (generated — don't edit)
│   └── index.html
│
├── Version/                    ← older / alternative versions kept for reference
│   ├── app.js                  ← the original plain-JavaScript version (no React)
│   ├── index.html              ← its page
│   ├── style.css               ← its current style
│   ├── style v1 industrial.css ← design backup: "industrial" look
│   ├── style v2 swiss.css      ← design backup: "swiss" look
│   ├── style v3 dark console.css ← design backup: "dark console" look
│   └── xlsx.full.min.js        ← the SheetJS Excel library (local copy)
│
├── docs/                       ← notes / specs
└── node_modules/               ← installed libraries (generated — don't edit)
```

### The three files that matter most

- **`src/excel.js`** — all the real work: finds the right sheet (looks for the "SKU number" + "Orli code" header), reads the rows, runs the carton math, builds the `Note` sheet, and decides the output file name.
- **`src/App.jsx`** — the screen you see: keeps the loaded rows in memory, handles the file drop, filters, per-row edits, and the download.
- **`index.html`** (root) — the built, ready-to-use app. Double-click it to run without installing anything.

---

## Running it

**Just use it:** open `index.html` in a browser.

**Develop / change it:**

```bash
npm install       # first time only — installs React + SheetJS
npm run dev        # live preview at http://localhost:5174
npm run build      # rebuild the single-file index.html
node scripts/verify.mjs   # check the carton logic still matches the known-good file
```
