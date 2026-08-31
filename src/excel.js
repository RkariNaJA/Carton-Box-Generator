import * as XLSX from "xlsx";
// xlsx-js-style is a drop-in SheetJS fork that can WRITE cell fills/colors.
// The community "xlsx" build can read styles but not write them, so the output
// step uses this one to reproduce the colored "Note" sheet.
import XLSXStyle from "xlsx-js-style";

// Find the sheet whose header row contains "SKU number" + "Orli code",
// then read the data rows below it.
export function parseWorkbook(wb, defaultQty) {
  let found = null;
  for (const name of wb.SheetNames) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      const rowText = (data[i] || []).map(v => String(v ?? "").toLowerCase()).join(" | ");
      if (rowText.includes("sku number") && rowText.includes("orli code")) {
        found = { name, data, headerRow: i, header: data[i] };
        break;
      }
    }
    if (found) break;
  }

  if (!found) {
    throw new Error('Could not find the data sheet. Expected a header row with "1. SKU number", "3. Orli code", etc. (like sheet "0100000_2026-03-06" in the example file).');
  }

  // Locate the columns by header text (falls back to fixed positions C, D, E, K)
  const findCol = (keyword, fallback) => {
    const idx = found.header.findIndex(v => String(v ?? "").toLowerCase().includes(keyword));
    return idx >= 0 ? idx : fallback;
  };
  const colStyle = findCol("orli code",   2);
  const colColor = findCol("color",       3);
  const colSize  = findCol("size",        4);
  const colQty   = findCol("quantity",   10);
  // Extra columns needed for the per-carton manifest sheet (fixed-position
  // fallbacks match the stable "EAN for BABOLAT" template: B,F,G,H,I,L).
  const colDesig = findCol("designation", 1);
  const colEan   = findCol("ean",         5);
  const colMade  = findCol("made in",     6);
  const colEtd   = findCol("shipping",    7);   // "8. Shipping date" = ETD
  const colPo    = findCol("po.number",   8);   // "9. PO.number" (customer PO)
  const colWork  = findCol("po. number", 11);   // "PO. Number" (Hi-Tech work order)

  const rows = [];
  for (let i = found.headerRow + 1; i < found.data.length; i++) {
    const r = found.data[i] || [];
    const style = r[colStyle], qty = Number(r[colQty]);
    if (style == null || String(style).trim() === "") continue;   // skip blank rows
    if (!qty || qty <= 0) continue;                               // need a quantity
    rows.push({
      style:       String(style).trim(),
      color:       String(r[colColor] ?? "").trim(),
      size:        String(r[colSize]  ?? "").trim(),
      orderQty:    qty,
      qtyPerCtn:   defaultQty,
      designation: String(r[colDesig] ?? "").trim(),
      ean:         String(r[colEan]   ?? "").trim(),
      madeIn:      String(r[colMade]  ?? "").trim(),
      etd:         String(r[colEtd]   ?? "").trim(),
      po:          String(r[colPo]    ?? "").trim(),
      workOrder:   String(r[colWork]  ?? "").trim()
    });
  }

  if (!rows.length) {
    throw new Error('Found sheet "' + found.name + '" but no data rows with a quantity. Please check the file.');
  }

  return { rows: mergeDuplicateRows(rows), sheetName: found.name };
}

// ---------------------------------------------------------------- ETD matching
// Rows only merge when they ship on the same day, so the ETD ("8. Shipping date")
// has to be compared as a date and not as raw text: the template writes
// "01 Nov 2026", but the same column can arrive as a real Excel date cell
// (a serial number) or as "2026-11-01". etdKey() reduces all of those to
// YYYY-MM-DD so day/month/year decide the match, and falls back to the plain
// text when the value is not a date at all (blank, "TBC", …).
const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
const pad2 = n => String(n).padStart(2, "0");
const isoDate = (y, m, d) => y + "-" + pad2(m) + "-" + pad2(d);

function etdToIso(value) {
  if (value == null) return "";
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? "" : isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const s = String(value).trim();
  if (s === "") return "";

  // A bare number is an Excel date serial (days since 1899-12-30). Drop the
  // time part so 46323 and 46323.5 are the same day.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n < 20000 || n > 80000) return "";                  // not a plausible date
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  const parts = s.toLowerCase().match(/[a-z]+|\d+/g) || [];
  const nums = parts.filter(p => /^\d+$/.test(p)).map(Number);
  const monthWord = parts.find(p => /^[a-z]+$/.test(p) && MONTHS[p.slice(0, 3)]);

  // "01 Nov 2026" / "1 November 2026" / "Nov 1, 2026"
  if (monthWord && nums.length >= 2) {
    const year = nums.find(n => n > 31) ?? nums[nums.length - 1];
    const day  = nums.find(n => n <= 31) ?? 1;
    return isoDate(year, MONTHS[monthWord.slice(0, 3)], day);
  }

  if (nums.length >= 3) {
    if (nums[0] > 31) return isoDate(nums[0], nums[1], nums[2]);          // 2026-11-01
    // 01/11/2026 — day/month order is unknown, so keep it as written and only
    // pad it, which still makes "1/11/2026" and "01/11/2026" the same key.
    if (nums[2] > 31) return nums[2] + "-" + pad2(nums[0]) + "-" + pad2(nums[1]);
  }
  return "";
}

// The value two rows must share to be treated as the same shipping date.
export function etdKey(value) {
  return etdToIso(value) || String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Same Style + Color + Size + ETD = the same SKU on the same shipment, so two
// (or more) lines for it are really one order line split across rows. Add their
// quantities together into a single record BEFORE any carton maths, otherwise
// each partial line would round up to its own carton and we would ship
// half-empty boxes. Rows that match on Style/Color/Size but ship on a different
// date stay separate — they are different shipments and cannot share a box.
// The first row wins for every other field (EAN, PO, …); only Order Qty is
// summed. mergedCount records how many source rows went into the record.
export function mergeDuplicateRows(rows) {
  const byKey = new Map();
  const merged = [];
  rows.forEach(r => {
    const key = [r.style, r.color, r.size].map(v => String(v ?? "").trim().toLowerCase())
      .concat(etdKey(r.etd)).join("~|~");
    const hit = byKey.get(key);
    if (hit) {
      hit.orderQty += r.orderQty;
      hit.mergedCount += 1;
    } else {
      const rec = { ...r, mergedCount: 1 };
      byKey.set(key, rec);
      merged.push(rec);
    }
  });
  return merged;
}

// Compute Total CTN + running Star/End carton numbers (same as the Excel formulas:
// D = ROUNDUP(G/H,0), E = TEXT(SUM(D above)+1,"00000"), F = TEXT(E+D-1,"00000"))
export function computeCartons(rows) {
  let running = 0;
  return rows.map(r => {
    const totalCtn = Math.ceil(r.orderQty / r.qtyPerCtn);
    const fullCtn = Math.floor(r.orderQty / r.qtyPerCtn);
    const scrapQty = r.orderQty % r.qtyPerCtn;
    const start = running + 1;
    const end = running + totalCtn;
    running = end;
    return {
      ...r,
      totalCtn,
      fullCtn,
      scrapQty,
      startCtn: String(start).padStart(5, "0"),
      endCtn:   String(end).padStart(5, "0")
    };
  });
}

// Fill colors copied from the reference "UCC BABOLAT …" Note sheet.
// Header: Style/col./size + Order Qty = blue, the three CTN columns = yellow,
// Qty/CTN = orange. Data rows are zebra-striped light/dark peach.
const HEADER_FILLS = ["5B9BD5", "5B9BD5", "5B9BD5", "FFFF00", "FFFF00", "FFFF00", "5B9BD5", "ED7D31"];
const ROW_FILL_LIGHT = "FBE5D6";
const ROW_FILL_DARK  = "F8CBAD";
const solidFill = rgb => ({ fill: { patternType: "solid", fgColor: { rgb } } });

// Manifest sheet colors (same palette as Note): the columns that concatenate
// into the 128C barcode (SKU, QTY/Box, PO.number, Parcel) are yellow, the
// finished barcode is orange, everything else is blue.
const MANIFEST_HEADER_BLUE  = "5B9BD5";
const MANIFEST_HEADER_FILLS = { 5: "FFFF00", 7: "FFFF00", 9: "FFFF00", 10: "FFFF00", 11: "ED7D31" };
const BORDER_RGB = "D9D9D9";
const thinBorder = () => {
  const side = { style: "thin", color: { rgb: BORDER_RGB } };
  return { top: side, bottom: side, left: side, right: side };
};
const headerCellStyle = fill => ({
  fill: { patternType: "solid", fgColor: { rgb: fill } },
  font: { bold: true, color: { rgb: fill === "FFFF00" ? "000000" : "FFFFFF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: thinBorder()
});

// Build the colored "Note" summary sheet (one row per SKU) — carton numbers
// kept as text so Excel shows "00001" not 1, and cells colored like the reference.
function buildNoteSheet(computed) {
  const aoa = [["Style ", "col.", "size", "Total CTN", "Star CTN", "End CTN", "Order Qty", "Qty/CTN"]];
  computed.forEach(r => {
    aoa.push([r.style, r.color, r.size, r.totalCtn, r.startCtn, r.endCtn, r.orderQty, r.qtyPerCtn]);
  });

  const ws = XLSXStyle.utils.aoa_to_sheet(aoa);

  // Keep Star/End CTN as text so leading zeros are preserved ("00001").
  for (let i = 2; i <= aoa.length; i++) {
    ["E", "F"].forEach(col => {
      const cell = ws[col + i];
      if (cell) { cell.t = "s"; cell.z = "@"; }
    });
  }

  // Color the header row and zebra-stripe the data rows to match the reference.
  for (let c = 0; c < 8; c++) {
    const head = ws[XLSXStyle.utils.encode_cell({ r: 0, c })];
    if (head) head.s = solidFill(HEADER_FILLS[c]);
    for (let dataIdx = 0; dataIdx < computed.length; dataIdx++) {
      const cell = ws[XLSXStyle.utils.encode_cell({ r: dataIdx + 1, c })];
      if (cell) cell.s = solidFill(dataIdx % 2 === 0 ? ROW_FILL_LIGHT : ROW_FILL_DARK);
    }
  }

  ws["!cols"] = [{wch:12},{wch:21.5},{wch:12},{wch:10},{wch:10},{wch:10},{wch:10},{wch:9}];
  return ws;
}

// Header labels + column widths copied from the reference "0100000…" sheet.
const MANIFEST_HEADER = [
  "1. Designation", "2. Orli code", "3. Color code and color name", "4. Size",
  "5. Made in Thailand", "6. SKU number", "7. Barcode EAN 13 of Gencod", "8. QTY/Box",
  "9. ETD", "10. PO.number", "11. Parcel Number", "12. 128C Bar code", "13. Supplier", "PO"
];
const MANIFEST_COLS = [44.17,25.67,32.67,10,33.67,20.67,35.67,23.67,23.67,29.33,29.33,36,20.67,30];
// Columns (0-based) that must stay text so leading zeros survive:
// SKU, EAN, QTY/Box, PO.number, Parcel, 128C barcode, Work order.
const MANIFEST_TEXT_COLS = [5, 6, 7, 9, 10, 11, 13];

// Pull the 6 SKU digits out of the EAN barcode — same as MID(ean, LEN-6, 6).
function skuFromEan(ean) {
  const s = String(ean ?? "").replace(/\s/g, "");
  return s.length >= 7 ? s.slice(s.length - 7, s.length - 1) : s;
}

// Legal Excel sheet name: strip []:*?/\, trim, cap at 31 chars.
function safeSheetName(name, fallback) {
  const s = String(name ?? "").replace(/[\\/?*[\]:]/g, " ").trim();
  return (s || fallback || "Sheet1").slice(0, 31);
}

// Build the per-carton manifest sheet: one row per physical box, with an
// incrementing Parcel Number and the 128C barcode (PO + Parcel + SKU + QTY/Box).
// Parcel Numbers reuse the Note sheet's carton numbering so the two sheets align.
function buildManifestSheet(computed) {
  const aoa = [MANIFEST_HEADER.slice()];
  computed.forEach(r => {
    const sku = skuFromEan(r.ean);
    const po = String(r.po ?? "").trim();
    const start = Number(r.startCtn);   // numeric first carton for this SKU
    for (let k = 0; k < r.totalCtn; k++) {
      // Every box holds a full Qty/CTN except the last one when the order does
      // not divide evenly — that box carries the leftover pieces (the "scrap"
      // carton), so QTY/Box and the 128C barcode state what is really inside.
      const isScrapBox = r.scrapQty > 0 && k === r.totalCtn - 1;
      const qtyBox = String(isScrapBox ? r.scrapQty : r.qtyPerCtn).padStart(5, "0");
      const parcel = String(start + k).padStart(6, "0");
      const barcode = po + parcel + sku + qtyBox;
      aoa.push([
        r.designation, r.style, r.color, r.size, r.madeIn || "Made in Thailand",
        sku, r.ean, qtyBox, r.etd, po, parcel, barcode, "Hi-Tech", r.workOrder
      ]);
    }
  });

  const ws = XLSXStyle.utils.aoa_to_sheet(aoa);
  const nCols = MANIFEST_HEADER.length;

  // Header: colored fills + bold text, matching the Note palette.
  for (let c = 0; c < nCols; c++) {
    const cell = ws[XLSXStyle.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = headerCellStyle(MANIFEST_HEADER_FILLS[c] || MANIFEST_HEADER_BLUE);
  }

  // Data rows: zebra-striped peach fills + thin borders. Leading-zero columns
  // stay text so "000001"/"00048" keep their zeros.
  for (let rowIdx = 1; rowIdx < aoa.length; rowIdx++) {
    const rowFill = rowIdx % 2 === 1 ? ROW_FILL_LIGHT : ROW_FILL_DARK;
    for (let c = 0; c < nCols; c++) {
      const cell = ws[XLSXStyle.utils.encode_cell({ r: rowIdx, c })];
      if (!cell) continue;
      cell.s = { ...solidFill(rowFill), border: thinBorder() };
      if (MANIFEST_TEXT_COLS.includes(c)) { cell.t = "s"; cell.z = "@"; }
    }
  }

  ws["!cols"] = MANIFEST_COLS.map(wch => ({ wch }));
  ws["!rows"] = [{ hpt: 30 }];   // taller header row for the wrapped labels
  return ws;
}

// Build the output workbook: sheet 1 = per-carton manifest (named after the
// input sheet, e.g. "0100000_2026-03-06"), sheet 2 = the "Note" summary.
export function buildWorkbook(computed, sheetName) {
  const wbOut = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wbOut, buildManifestSheet(computed), safeSheetName(sheetName, "Manifest"));
  XLSXStyle.utils.book_append_sheet(wbOut, buildNoteSheet(computed), "Note");
  return wbOut;
}

// Write the workbook to a file, preserving the cell fills.
export function saveWorkbook(wb, fileName) {
  XLSXStyle.writeFile(wb, fileName);
}

// "EAN for BABOLAT - 0100000.xlsx" -> "UCC BABOLAT - 0100000.xlsx"
export function outputFileName(sourceFileName) {
  let outName = sourceFileName.replace(/\.(xlsx|xls)$/i, "");
  outName = /EAN for /i.test(outName) ? outName.replace(/EAN for /i, "UCC ") : "UCC " + outName;
  return outName + ".xlsx";
}
