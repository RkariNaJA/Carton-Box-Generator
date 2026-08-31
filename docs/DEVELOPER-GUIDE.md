# Carton Box Generator — Developer Guide

> The technical guide: how the logic works, where everything lives, and how to check it after a
> change. For a short overview of what the project is, see the
> **[README](../README.md)**.

A small web app that turns a customer **EAN Excel file** into a **"Note" carton table** (Style, Color, Size, Total CTN, Star CTN, End CTN, Order Qty, Qty/CTN) and lets you download the result as a new Excel file.

Everything runs in the browser — you drop in the EAN file, adjust the pieces-per-carton if needed, and download the finished `UCC ...` file. No server, no upload.

The on-screen table shows the **ETD** (shipping date) of every record, and can be filtered by
**Style**, **Color**, **Size** and (with several files loaded) **File**. Filters only change what is
shown — the downloaded Excel always contains every row.

```
EAN file  →  "Note" table (auto carton numbering)  →  Excel download
```

---

## How it works (the important logic)

### Step 1 — same product on two lines becomes one record

If the file lists the **same Style + Color + Size shipping on the same date** on more than one
line, those lines are really the same product split across rows. The app **adds their Order Qty
together into a single record first**, before it works out any cartons.

This has to happen first. Two lines of 20 pieces at 48 per carton is **one** carton holding
40 — but if each line were counted on its own it would round up to a carton each, and the
order would ship two half-empty boxes instead of one.

#### The key we combine on

Four things have to match. This is the exact "same product" key (`mergeDuplicateRows` in
`src/excel.js`):

| # | Field | Column in the EAN file | How it is compared |
|---|-------|------------------------|--------------------|
| 1 | **Style** | `3. Orli code` | trimmed, case-insensitive |
| 2 | **Color** | `4. Color and color code` | trimmed, case-insensitive |
| 3 | **Size** | `5. Size` | trimmed, case-insensitive |
| 4 | **ETD** | `8. Shipping date` | as a **date** — day + month + year must all match |

If **any one** of the four differs, the lines stay separate records with separate cartons and
separate parcel numbers.

Fields 1–3 ignore upper/lower case and stray spaces, so `8017 Beach Glass` and
`8017 beach glass ` are the same colour.

#### Why the ETD is in the key

Two lines can be the identical product and still be **two different shipments**. Goods leaving
on 01 Nov and goods leaving on 15 Dec cannot travel in the same box, so they must not be added
together — each date gets its own boxes.

The date is compared as a real date, not as text, because the same day can be written in
several ways depending on how the customer's file was made:

| What is in the cell | Read as |
|---------------------|---------|
| `01 Nov 2026` (the usual template text) | 2026-11-01 |
| `1 november 2026`, `Nov 1, 2026` | 2026-11-01 |
| `2026-11-01` | 2026-11-01 |
| a real Excel date cell (serial number `46327`) | 2026-11-01 |
| the same with a time on it (`46327.75`) | 2026-11-01 — the time is ignored |
| something that is not a date (`TBC`, blank) | compared as plain text — two blanks still match, blank vs. a date does not |

#### Reading the result

Rows that were combined get a small **`+1`** tag next to the Style in the table — hover it to
see how many lines went in. The number is how many *extra* lines were folded in, so `+1`
means two lines became one record, `+2` means three did. The **ETD** column next to `size`
shows the date each record is grouped on, so you can see at a glance why two look-alike rows
did *not* combine.

Everything else on the record (EAN, PO, designation, ETD text) is taken from the **first** of
the combined lines — only the quantity is added up.

### Step 2 — the carton maths

For every product row the app then calculates, exactly like the original Excel formulas:

| Column      | Meaning                          | Formula                              |
|-------------|----------------------------------|--------------------------------------|
| `Total CTN` | how many cartons this row needs  | `ROUNDUP(Order Qty ÷ Qty/CTN)`       |
| `Full CTN`  | how many completely full cartons | `ROUNDDOWN(Order Qty ÷ Qty/CTN)`     |
| `Scrap CTN` | leftover pieces in the last (partial) carton | `Order Qty − Full CTN × Qty/CTN` — blank when it divides evenly |
| `Star CTN`  | first carton number for this row | previous End CTN + 1 (text `00001`)  |
| `End CTN`   | last carton number for this row  | Star CTN + Total CTN − 1 (text)      |

Example: Order Qty **148** at **48** per carton → Total CTN `4`, Full CTN `3`, Scrap CTN `4` (three full cartons + one carton with only 4 pieces).

Carton numbers keep counting across all rows, and are stored as **text** so Excel shows `00001` instead of `1`.

> `Full CTN` and `Scrap CTN` appear only in the on-screen table — the `Note` sheet in the downloaded Excel keeps its original layout (Style … Qty/CTN) so anything that depends on that format keeps working.

### Step 3 — what actually goes in each box

The downloaded file's first sheet is the **per-carton manifest**: one row per physical box,
with its own Parcel Number and barcode.

Column `8. QTY/Box` holds the **real number of pieces in that box**. Every box is a full
Qty/CTN except the **last box of each product**, which carries the leftover pieces. The
`12. 128C Bar code` is built from that same number (`PO + Parcel + SKU + QTY/Box`), so a
part-filled box's barcode ends in its real count, not the nominal one.

Example — 20 pieces at 12 per carton:

| Parcel | QTY/Box | |
|--------|---------|---|
| `000001` | `00012` | full box |
| `000002` | `00008` | the leftover |

The quantities across a product's boxes always add back up to its Order Qty, so the packing
list can never claim more or fewer pieces than were ordered.

The output file is named automatically:
`EAN for BABOLAT - 0100000.xlsx`  →  `UCC BABOLAT - 0100000.xlsx`

---

## File tree

```
Forming Box File/
├── index.html                  ← the finished app (single self-contained file — just open it)
├── README.md                   ← the GitHub landing page: what the project does, for anyone
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
│       └── ResultTable.jsx     ← the results table: ETD column + the editable Qty/CTN cell
│
├── scripts/
│   └── verify.mjs              ← the check: `node scripts/verify.mjs` (see "The check" below)
│
├── Input/                      ← example inputs (real EAN files)
│   ├── EAN for BABOLAT - 0204601_2026-03-06.xlsx
│   ├── EAN for BABOLAT - 0206370_2026-03-06.xlsx
│   └── Prob one/            ← the tricky cases used to check the logic
│       ├── EAN for BABOLAT - 0206772_2026-03-18.xlsx   ← has a same Style/Color/Size duplicate
│       └── UCC BABOLAT - 0206772.xlsx                  ← the hand-made correct answer for it
├── Output/                     ← matching correct results
│   └── UCC BABOLAT - 0206370_2026-03-06.xlsx
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
├── docs/
│   └── DEVELOPER-GUIDE.md      ← this file — the full logic, file tree and checks
└── node_modules/               ← installed libraries (generated — don't edit)
```

### The three files that matter most

- **`src/excel.js`** — all the real work: finds the right sheet (looks for the "SKU number" + "Orli code" header), reads the rows, **combines same Style/Color/Size/ETD rows** (`mergeDuplicateRows`, with `etdKey` reading the shipping date), runs the carton math, builds the manifest + `Note` sheets, and decides the output file name.
- **`src/App.jsx`** — the screen you see: keeps the loaded rows in memory, handles the file drop, filters, per-row edits, and the download.
- **`index.html`** (root) — the built, ready-to-use app. Double-click it to run without installing anything.

---

## Running it

**Just use it:** open `index.html` in a browser.

**Develop / change it** — run these from the project folder (`Forming Box File/`, one level up
from this file):

```bash
npm install       # first time only — installs React + SheetJS
npm run dev        # live preview at http://localhost:5174
npm run build      # rebuild the single-file index.html
node scripts/verify.mjs   # check the carton logic is still correct (see below)
```

### The check (`node scripts/verify.mjs`)

Run it after any change to `src/excel.js`. It prints `PASS — all N checks` when everything is
right, or lists exactly what broke. Three passes:

1. **Reference files** — rebuilds the output for every input that has a hand-made `UCC ...`
   file beside it and compares both sheets cell by cell, including all 268 barcodes of the
   big one. Files are matched up by their **7-digit PO number**, so renaming them (`-test`,
   `-Fixed-Case1`, …) will not break the check. Files the app itself produced are ignored as
   references — they have 2 sheets, the customer's own workbooks have 9 — because checking
   our output against our own output would prove nothing.
2. **Invariants** — rules that must hold for **every** file in `Input/`, even ones with no
   reference: no duplicate Style/Color/Size/ETD left over, **the boxes add back up to the Order
   Qty**, parcel numbers with no gaps or repeats, every barcode unique and correctly built.
   Drop a new EAN file into `Input/` and it is covered automatically.
3. **Rules** — the merge, ETD and scrap-box rules on made-up numbers: same date merges,
   a different day / month / year does not, 40 @ 48 → one box of 40, 20 @ 12 → 12 + 8, and so
   on, including the awkward cases. It also checks every ETD spelling in the table above.

The `work-order PO` line is informational, not a failure — that column is copied straight from
the input, and the reference files were edited by hand there.
