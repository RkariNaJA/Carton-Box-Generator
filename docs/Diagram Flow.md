# Diagram Flow

How the Carton Box Generator works, drawn as text diagrams. For the full logic see the [Developer Guide](DEVELOPER-GUIDE.md).

## 1. Overview

What goes in, where it runs, and what comes out. Everything happens in the browser.

```text
┌────────────────────────────┐        ┌────────────────────────────┐        ┌────────────────────────────┐
│ EAN Excel file             │───────▶│ Your browser               │───────▶│ UCC Excel file             │
│ EAN for BABOLAT - ...xlsx  │  drop  │ index.html (one file,      │  save  │ UCC BABOLAT - ...xlsx      │
│                            │        │ works offline, no server)  │        │                            │
│ From the customer.         │        │                            │        │ Sheet 1: per-box list      │
│ Kept in Input/ (local,     │        │ React app: src/App.jsx     │        │ Sheet 2: Note (per SKU)    │
│ not on GitHub)             │        │ Logic:     src/excel.js    │        │                            │
└────────────────────────────┘        └────────────────────────────┘        └────────────────────────────┘
```

## 2. Building index.html

How the React source becomes the single file people open.

```text
┌────────────────────────────────┐                 ┌────────────────────────────────┐
│ src/ (React source)            │────────────────▶│ dist/index.html                │
│ App.jsx · excel.js · style.css │  npm run build  │ everything inlined in one file │
│ components/*.jsx               │                 │ (vite-plugin-singlefile)       │
│ index.html · main.jsx          │                 │                                │
└────────────────────────────────┘                 └───────────────┬────────────────┘
                                                                   │ copied by the build script
                                                                   ▼
                                                   ┌────────────────────────────────┐
                                                   │ index.html (project root)      │
                                                   │ the file people double-click   │
                                                   │ git-ignored (build output)     │
                                                   └────────────────────────────────┘
```

## 3. Reading a dropped file

From the dropped EAN file to the records the app keeps in memory.

```text
┌────────────────────────────────────────────────────────────────┐
│ Dropzone.jsx                                                   │
│ Drop or pick one or more .xlsx / .xls files                    │
└───────────────────────────────┬────────────────────────────────┘
                                │ File objects
                                ▼
┌────────────────────────────────────────────────────────────────┐
│ App.jsx · addFiles()                                           │
│ Per file: FileReader.readAsArrayBuffer → XLSX.read             │
│ New files read with the toolbar Qty/CTN (default 48)           │
└───────────────────────────────┬────────────────────────────────┘
                                │ workbook
                                ▼
┌────────────────────────────────────────────────────────────────┐
│ excel.js · parseWorkbook(wb, defaultQty)                       │
│ 1. Find the sheet whose header row (first 10 rows) has         │
│    "SKU number" + "Orli code"   none? → error                  │
│ 2. Find columns by header text (fallback: C, D, E, K ...)      │
│ 3. Read rows: skip blank Style, skip Qty <= 0                  │
│ 4. No rows left? → error "no data rows with a quantity"        │
└───────────────────────────────┬────────────────────────────────┘
                                │ rows
                                ▼
┌────────────────────────────────────────────────────────────────┐
│ excel.js · mergeDuplicateRows(rows)                            │
│ Key: Style + col. + size + etdKey(ETD)                         │
│ Same key → add Order Qty, mergedCount + 1                      │
│ First row wins for EAN, PO, designation, work order            │
└───────────────────────────────┬────────────────────────────────┘
                                │ { rows, sheetName }
                                ▼
┌────────────────────────────────────────────────────────────────┐
│ App state · files[]                                            │
│ { id, sourceFileName, sheetName, rows, error }                 │
│ FileList.jsx lists each file (errors shown there)              │
└────────────────────────────────────────────────────────────────┘
```

## 4. Carton maths and the on-screen table

How records become carton numbers, and what the filters do.

```text
┌────────────────────────────────────────────────────────────────┐
│ App state · files[] + Qty/CTN                                  │
│ Toolbar: default Qty/CTN · "Apply to all"                      │
│ ResultTable: edit any row's Qty/CTN (dashed cell)              │
└───────────────────────────────┬────────────────────────────────┘
                                │ each file's rows
                                ▼
┌────────────────────────────────────────────────────────────────┐
│ excel.js · computeCartons(rows)                                │
│ Total CTN = ROUNDUP(Order Qty / Qty/CTN)                       │
│ scrapQty  = Order Qty mod Qty/CTN (last box)                   │
│ Star / End CTN = running numbers "00001" ...                   │
│ Numbering restarts at 00001 for every file                     │
└───────────────────────────────┬────────────────────────────────┘
                                │ combined rows
                                ▼
┌────────────────────────────────────────────────────────────────┐
│ Filters (Toolbar.jsx): Style · Color · Size · File             │
│ Only change what is shown, never the numbers                   │
└───────────────────────────────┬────────────────────────────────┘
                                │
               ┌────────────────┴─────────────────┐
               │ visible rows                     │ visible rows
               ▼                                  ▼
 ┌────────────────────────────┐     ┌────────────────────────────┐
 │ SummaryStats.jsx           │     │ ResultTable.jsx            │
 │ Rows · Cartons · Pieces    │     │ one row per record + ETD   │
 │ Carton range (or Files)    │     │ +n tag = merged lines      │
 └────────────────────────────┘     └────────────────────────────┘
```

## 5. Downloading the UCC file

How one file's records become the 2-sheet Excel download.

```text
             ┌────────────────────────────────────────────────────────────────┐
             │ Download button                                                │
             │ Toolbar "Download Excel / all" or the FileList button          │
             │ App.jsx · downloadFile(f), once per file                       │
             └───────────────────────────────┬────────────────────────────────┘
                                             │ all rows (filters ignored)
                                             ▼
             ┌────────────────────────────────────────────────────────────────┐
             │ computeCartons(f.rows) → buildWorkbook(computed, sheetName)    │
             └───────────────────────────────┬────────────────────────────────┘
                                             │
                      ┌──────────────────────┴──────────────────────────┐
                      │ sheet 1                                         │ sheet 2
                      ▼                                                 ▼
 ┌──────────────────────────────────────────┐      ┌──────────────────────────────────────────┐
 │ buildManifestSheet · one row per box     │      │ buildNoteSheet · one row per SKU         │
 │ Named after the input sheet              │      │ Sheet name: Note                         │
 │ Parcel  = running box no. (000001)       │      │ Style · col. · size · Total CTN          │
 │ QTY/Box = Qty/CTN, last box = scrap      │      │ Star CTN · End CTN (text, 00001)         │
 │ 128C    = PO + Parcel + SKU + QTY/Box    │      │ Order Qty · Qty/CTN                      │
 │ SKU     = 6 digits from the EAN          │      │ Colored like the reference file          │
 └────────────────────┬─────────────────────┘      └────────────────────┬─────────────────────┘
                      └──────────────────────┬──────────────────────────┘
                                             ▼
             ┌────────────────────────────────────────────────────────────────┐
             │ saveWorkbook() · xlsx-js-style writeFile (keeps colors)        │
             │ outputFileName(): "EAN for X.xlsx" → "UCC X.xlsx"              │
             └────────────────────────────────────────────────────────────────┘
```

## 6. Checking a change

How `scripts/verify.mjs` tests the logic against real files.

```text
┌──────────────────────────────────────────────┐        ┌────────────────────────────────────┐
│ node scripts/verify.mjs                      │───────▶│ Excel files (local only)           │
│ Imports src/excel.js, no browser needed      │ reads  │ Input/ · Input/Prob one/ · Output/ │
│                                              │        │                                    │
│ [1] REFERENCE  rebuild + compare cell by     │        │ Found by 7-digit PO number,        │
│                cell with a hand-made UCC     │        │ so renamed files still match       │
│ [2] INVARIANTS nothing lost, no gaps/dupes   │        └────────────────────────────────────┘
│ [3] RULES      ETD merge + scrap box         │
└──────────────────────┬───────────────────────┘
                       │ result
                       ▼
┌──────────────────────────────────────────────┐
│ PASS / FAIL per check                        │
│ exit 0 only when every check passes          │
└──────────────────────────────────────────────┘
```
