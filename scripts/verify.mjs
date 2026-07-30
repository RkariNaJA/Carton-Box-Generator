// Verify src/excel.js against the known-good Output file, cell by cell.
// Checks BOTH sheets of the new 2-sheet download:
//   sheet 1 = per-carton manifest ("0100000_2026-03-06")
//   sheet 2 = "Note" summary
// Run from the project folder:  node scripts/verify.mjs
import { readFileSync } from "fs";
import * as XLSX from "xlsx";
import { parseWorkbook, computeCartons, buildWorkbook, outputFileName } from "../src/excel.js";

const inputPath  = "Input/EAN for BABOLAT - 0100000_2026-03-06.xlsx";
const expectPath = "Output/UCC BABOLAT - 0100000_2026-03-06.xlsx";

const wbIn = XLSX.read(readFileSync(inputPath), { type: "buffer" });
const { rows, sheetName } = parseWorkbook(wbIn, 48);
console.log("Parsed sheet:", sheetName, "| SKU rows:", rows.length);

const wbOut = buildWorkbook(computeCartons(rows), sheetName);
const wbExp = XLSX.read(readFileSync(expectPath), { type: "buffer" });

let totalDiffs = 0;

// ---- Sheet 2: "Note" summary (unchanged logic) -------------------------------
{
  const got = XLSX.utils.sheet_to_json(wbOut.Sheets["Note"], { header: 1, defval: null });
  const exp = XLSX.utils.sheet_to_json(wbExp.Sheets["Note"], { header: 1, defval: null });
  let diffs = 0;
  const nRows = Math.max(got.length, exp.length);
  for (let i = 0; i < nRows; i++) {
    const g = got[i] || [], e = exp[i] || [];
    const nCols = Math.max(g.length, e.length);
    for (let j = 0; j < nCols; j++) {
      if (String(g[j] ?? null) !== String(e[j] ?? null)) {
        diffs++;
        if (diffs <= 5) console.log(`  NOTE DIFF row ${i + 1} col ${j + 1}: got ${JSON.stringify(g[j] ?? null)} exp ${JSON.stringify(e[j] ?? null)}`);
      }
    }
  }
  totalDiffs += diffs;
  console.log(`[Note sheet]     ${diffs === 0 ? "PASS" : "FAIL " + diffs + " diffs"} across ${nRows} rows`);
}

// ---- Sheet 1: per-carton manifest -------------------------------------------
// My manifest: header at row 0, data at row 1+.  Reference: header at row 2
// (excel row 3), data at row 3+, and shifted one column right (col A is blank).
{
  const got = XLSX.utils.sheet_to_json(wbOut.Sheets[sheetName], { header: 1, defval: null });
  const exp = XLSX.utils.sheet_to_json(wbExp.Sheets["0100000_2026-03-06"], { header: 1, defval: null });

  const gotData = got.slice(1);                                   // my data rows
  // SheetJS left-aligns the reference to its range (starts at column B), so the
  // reference columns land at the SAME indices as my output. Data starts row 3.
  const expData = exp.slice(3).filter(r => r && String(r[0] ?? "").trim() !== "");

  // 13 fully-derived columns compared strictly (Made-in compared trimmed).
  // Work order (col index 13) is copied from the input as-is and only reported.
  const COMPARE = [
    ["Designation", 0], ["Orli code", 1], ["Color", 2], ["Size", 3],
    ["Made in", 4], ["SKU", 5], ["EAN13", 6], ["QTY/Box", 7],
    ["ETD", 8], ["PO.number", 9], ["Parcel", 10], ["128C barcode", 11],
    ["Supplier", 12]
  ];

  console.log(`[Manifest sheet] rows: got ${gotData.length}  vs reference ${expData.length}`);
  let diffs = 0;
  const colFails = {};
  const n = Math.max(gotData.length, expData.length);
  for (let i = 0; i < n; i++) {
    const g = gotData[i] || [], e = expData[i] || [];
    for (const [label, c] of COMPARE) {
      let gv = String(g[c] ?? "");
      let ev = String(e[c] ?? "");
      if (label === "Made in") { gv = gv.trim(); ev = ev.trim(); }
      if (gv !== ev) {
        diffs++;
        colFails[label] = (colFails[label] || 0) + 1;
        if (diffs <= 8) console.log(`  MANIFEST DIFF data-row ${i + 1} [${label}]: got ${JSON.stringify(gv)} exp ${JSON.stringify(ev)}`);
      }
    }
  }
  if (gotData.length !== expData.length) { totalDiffs++; console.log(`  ROW COUNT MISMATCH: ${gotData.length} vs ${expData.length}`); }
  totalDiffs += diffs;
  console.log(`[Manifest sheet] ${diffs === 0 ? "PASS" : "FAIL " + diffs + " diffs " + JSON.stringify(colFails)} on 13 derived columns`);

  // Headline: the 128C barcode is the whole point — report its match rate.
  let barOK = 0, barTotal = Math.min(gotData.length, expData.length);
  for (let i = 0; i < barTotal; i++) if (String(gotData[i]?.[11] ?? "") === String(expData[i]?.[11] ?? "")) barOK++;
  console.log(`[128C barcode]   ${barOK}/${barTotal} match the reference exactly`);

  // Work-order column (copied from input) — informational only.
  let woMatch = 0;
  for (let i = 0; i < barTotal; i++) if (String(gotData[i]?.[13] ?? "") === String(expData[i]?.[13] ?? "")) woMatch++;
  console.log(`[Work-order PO]  ${woMatch}/${barTotal} equal reference (copied from input; reference was hand-edited, so diffs here are expected)`);
}

console.log("Output filename:", outputFileName("EAN for BABOLAT - 0100000_2026-03-06.xlsx"));
console.log("Sheet names in output:", JSON.stringify(wbOut.SheetNames));
console.log(totalDiffs === 0 ? "\nPASS: 0 differences" : "\nFAIL: " + totalDiffs + " differences");
process.exit(totalDiffs === 0 ? 0 : 1);
