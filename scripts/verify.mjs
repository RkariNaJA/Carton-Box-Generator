// Verify src/excel.js — run from the project folder:  node scripts/verify.mjs
//
// Three passes, all must be clean for the script to exit 0:
//   [1] REFERENCE  — rebuild each input that has a known-good UCC file next to it
//                    and compare the manifest + Note sheets cell by cell.
//   [2] INVARIANTS — rules that must hold for EVERY input in Input/, even ones
//                    with no reference file (nothing lost, no gaps, no dupes).
//   [3] RULES      — the two logic rules, checked on made-up numbers:
//                    same Style/Color/Size rows merge, last box takes the scrap.
import { readFileSync, readdirSync, existsSync } from "fs";
import * as XLSX from "xlsx";
import { parseWorkbook, computeCartons, buildWorkbook, outputFileName, mergeDuplicateRows } from "../src/excel.js";

let fails = 0, checks = 0;
const is = (cond, msg) => { checks++; if (cond) console.log("   PASS  " + msg); else { fails++; console.log("   FAIL  " + msg); } };
const read = p => XLSX.read(readFileSync(p), { type: "buffer" });
const aoa = (wb, sheet) => XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: null });
// Excel text carries stray leading/trailing spaces the parser strips, so compare trimmed.
const cell = v => String(v ?? "").trim();

// Files are found by their 7-digit PO number, not by full filename — the folder
// gets renamed a lot ("-test", "-Fixed-Case1", …) and hardcoded paths broke this
// script once already. Folders searched:
const SEARCH_DIRS = ["Input", "Input/Prob one", "Output"];

// Per-PO notes and Qty/CTN overrides. Overrides reproduce values the merchandiser
// typed by hand in the reference file (the UI lets him edit any row); default is 48.
const CASE_INFO = {
  "0206370": { note: "268 boxes, every qty divides evenly by 48 — no scrap boxes" },
  "0204601": { note: "70 boxes, also divides evenly" },
  "0206772": { note: "THE tricky one: a duplicate Style/Color/Size to merge AND scrap boxes",
               overrides: { "6MS27123": 12 } },
  "0206740": { note: "25 records, small quantities" }
};

const poOf = name => (name.match(/(\d{7})/) || [])[1] || null;

// Discover the inputs and which of them have a hand-made reference to compare to.
// A hand-made reference is the customer's own workbook (9 sheets); anything our app
// produced has exactly 2 sheets, so using those as "known-good" would be circular.
function discover() {
  const inputs = new Map(), references = new Map(), appOutputs = [];
  for (const dir of SEARCH_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!/\.xlsx?$/i.test(f) || f.startsWith("~$")) continue;   // skip Excel lock files
      const path = dir + "/" + f, po = poOf(f);
      if (!po) continue;
      if (/^EAN for /i.test(f)) inputs.set(po, path);
      else if (/^UCC /i.test(f)) {
        const sheets = XLSX.read(readFileSync(path), { type: "buffer", bookSheets: true }).SheetNames.length;
        if (sheets > 2) references.set(po, path); else appOutputs.push(f);
      }
    }
  }
  return { inputs, references, appOutputs };
}

const { inputs, references, appOutputs } = discover();

// The 13 fully-derived manifest columns. Work order (index 13) is copied from the
// input as-is and the references were hand-edited there, so it is reported only.
const COMPARE = [
  ["Designation", 0], ["Orli code", 1], ["Color", 2], ["Size", 3],
  ["Made in", 4], ["SKU", 5], ["EAN13", 6], ["QTY/Box", 7],
  ["ETD", 8], ["PO.number", 9], ["Parcel", 10], ["128C barcode", 11],
  ["Supplier", 12]
];

// Build our output for one input file, applying any per-style Qty/CTN overrides.
function build(inputPath, overrides = {}) {
  const { rows, sheetName } = parseWorkbook(read(inputPath), 48);
  rows.forEach(r => { if (overrides[r.style]) r.qtyPerCtn = overrides[r.style]; });
  const computed = computeCartons(rows);
  return { rows, computed, sheetName, wb: buildWorkbook(computed, sheetName) };
}

// Reference manifests have notes above the header and trailing blanks below the
// data, so find the header row instead of assuming a fixed offset.
function referenceManifestRows(wbExp, sheetName) {
  const all = aoa(wbExp, sheetName);
  const headerRow = all.findIndex(r => (r || []).some(v => cell(v).startsWith("1. Designation")));
  if (headerRow < 0) throw new Error(`No "1. Designation" header found in reference sheet "${sheetName}"`);
  return all.slice(headerRow + 1).filter(r => cell(r?.[1]) !== "");   // rows with an Orli code
}

// ---------------------------------------------------------------- [1] REFERENCE
console.log("[1] REFERENCE FILES — rebuilt output vs the hand-made file, cell by cell");
console.log(`    found ${inputs.size} input(s), ${references.size} hand-made reference(s)`);
if (appOutputs.length) console.log(`    ignoring ${appOutputs.length} app-generated UCC file(s): ${appOutputs.join(", ")}`);
is(references.size > 0, "at least one hand-made reference file is available to compare against");

for (const [po, expectPath] of [...references].sort()) {
  const inputPath = inputs.get(po);
  const info = CASE_INFO[po] || {};
  if (!inputPath) {
    checks++; fails++;
    console.log(`\n  PO ${po}\n   FAIL  reference ${expectPath.split("/").pop()} has no matching "EAN for …${po}…" input file`);
    continue;
  }
  const { rows, computed, sheetName, wb } = build(inputPath, info.overrides);
  const wbExp = read(expectPath);
  const merged = rows.filter(r => r.mergedCount > 1);
  console.log(`\n  PO ${po}  ${inputPath.split("/").pop()}`);
  console.log(`  vs ${expectPath.split("/").pop()}`);
  if (info.note) console.log(`  ${info.note}`);
  if (info.overrides) console.log(`  Qty/CTN set by hand: ${JSON.stringify(info.overrides)}`);
  console.log(`  sheet "${sheetName}" — ${rows.length} records (${merged.length} merged), ${computed.reduce((s, r) => s + r.totalCtn, 0)} boxes`);
  merged.forEach(m => console.log(`      merged: ${m.style} / ${m.color} / ${m.size} -> ${m.orderQty} pcs from ${m.mergedCount} rows`));

  // ---- Note sheet: compare all 8 columns ----
  {
    const got = aoa(wb, "Note");
    const exp = aoa(wbExp, "Note").filter(r => cell(r?.[0]) !== "");
    let diffs = 0;
    for (let i = 0; i < Math.max(got.length, exp.length); i++)
      for (let j = 0; j < 8; j++)
        if (cell(got[i]?.[j]) !== cell(exp[i]?.[j])) {
          if (++diffs <= 5) console.log(`      Note row ${i + 1} col ${j + 1}: got ${JSON.stringify(cell(got[i]?.[j]))} exp ${JSON.stringify(cell(exp[i]?.[j]))}`);
        }
    is(diffs === 0, `Note sheet — ${exp.length - 1} data rows, 8 columns${diffs ? ` (${diffs} diffs)` : ""}`);
  }

  // ---- Manifest sheet: compare the 13 derived columns ----
  {
    const got = aoa(wb, sheetName).slice(1);
    const exp = referenceManifestRows(wbExp, sheetName);
    is(got.length === exp.length, `manifest box count — got ${got.length}, reference ${exp.length}`);

    let diffs = 0;
    const colFails = {};
    for (let i = 0; i < Math.max(got.length, exp.length); i++)
      for (const [label, col] of COMPARE) {
        const g = cell(got[i]?.[col]), e = cell(exp[i]?.[col]);
        if (g !== e) {
          colFails[label] = (colFails[label] || 0) + 1;
          if (++diffs <= 8) console.log(`      box ${i + 1} [${label}]: got ${JSON.stringify(g)} exp ${JSON.stringify(e)}`);
        }
      }
    is(diffs === 0, `manifest — 13 derived columns${diffs ? ` (${diffs} diffs: ${JSON.stringify(colFails)})` : ""}`);

    // The 128C barcode is the whole point of the file — call it out on its own.
    const n = Math.min(got.length, exp.length);
    let barOK = 0;
    for (let i = 0; i < n; i++) if (cell(got[i]?.[11]) === cell(exp[i]?.[11])) barOK++;
    is(barOK === n && n === got.length, `128C barcode — ${barOK}/${n} match the reference exactly`);

    // Work order is copied from the input; references were hand-edited. Informational.
    let woOK = 0;
    for (let i = 0; i < n; i++) if (cell(got[i]?.[13]) === cell(exp[i]?.[13])) woOK++;
    console.log(`   note  work-order PO ${woOK}/${n} equal reference (copied from input; reference hand-edited, diffs expected)`);
  }

  const outName = outputFileName(inputPath.split("/").pop());
  is(outName.startsWith("UCC ") && !/EAN for/i.test(outName) && outName.includes(po),
     `output filename — ${outName}`);
}

// --------------------------------------------------------------- [2] INVARIANTS
// These need no reference file, so every input in Input/ gets checked. Drop a new
// EAN file in there and it is covered automatically.
console.log("\n[2] INVARIANTS — must hold for every input file, reference or not");
is(inputs.size > 0, `found ${inputs.size} input file(s) to check`);

for (const [, f] of [...inputs].sort()) {
  const { rows, computed, sheetName, wb } = build(f);
  const man = aoa(wb, sheetName).slice(1);
  const note = aoa(wb, "Note").slice(1);
  const totalCtn = computed.reduce((s, r) => s + r.totalCtn, 0);
  console.log(`\n  ${f.split("/").pop()}  (${rows.length} records, ${man.length} boxes)`);

  const keys = rows.map(r => [r.style, r.color, r.size].join("|").toLowerCase());
  is(new Set(keys).size === keys.length, "no duplicate Style+col.+size survives the merge");
  is(man.length === totalCtn && note.length === rows.length, `manifest ${man.length} == sum Total CTN ${totalCtn}, Note ${note.length} == records ${rows.length}`);

  // The one that matters most: the boxes must add back up to what was ordered.
  let i = 0, bad = 0;
  computed.forEach(r => {
    let packed = 0;
    for (let k = 0; k < r.totalCtn; k++) packed += Number(man[i + k]?.[7]);
    if (packed !== r.orderQty) { bad++; console.log(`      ${r.style}/${r.color}/${r.size}: boxes hold ${packed} but ${r.orderQty} ordered`); }
    i += r.totalCtn;
  });
  is(bad === 0, "sum of QTY/Box per product == its Order Qty (nothing lost or invented)");

  is(man.every(m => Number(m[7]) > 0), "no box is empty or negative");
  is(man.every(m => Number(m[7]) <= Math.max(...computed.map(r => r.qtyPerCtn))), "no box holds more than Qty/CTN");
  is(man.every((m, idx) => Number(m[10]) === idx + 1), `Parcel Numbers run 000001..${String(man.length).padStart(6, "0")} with no gaps or repeats`);
  is(man.every(m => m[11] === m[9] + m[10] + m[5] + m[7]), "128C barcode == PO + Parcel + SKU + QTY/Box on every box");
  is(new Set(man.map(m => m[11])).size === man.length, "every barcode is unique");

  let prevEnd = 0, gaps = 0;
  computed.forEach(r => { if (Number(r.startCtn) !== prevEnd + 1) gaps++; prevEnd = Number(r.endCtn); });
  is(gaps === 0, "Star/End CTN run continuously with no gaps");
}

// -------------------------------------------------------------------- [3] RULES
console.log("\n[3] RULES — the two logic rules on made-up numbers");
const row = (style, color, size, qty, extra = {}) =>
  ({ style, color, size, orderQty: qty, qtyPerCtn: 48, ean: "3324922441251", po: "0206772", ...extra });

console.log("\n  merging same Style + Color + Size");
{
  let m = mergeDuplicateRows([row("A", "BLUE", "M", 30), row("A", "blue ", "m", 30), row("A", " BLUE", "M", 20)]);
  is(m.length === 1 && m[0].orderQty === 80 && m[0].mergedCount === 3, "case and stray spaces still merge (30+30+20 = 80, count 3)");

  m = mergeDuplicateRows([row("A", "BLUE", "M", 10), row("A", "BLUE", "L", 10), row("A", "RED", "M", 10), row("B", "BLUE", "M", 10)]);
  is(m.length === 4, "different style OR colour OR size stay separate");

  m = mergeDuplicateRows([row("A", "BLUE", "L", 5), row("B", "RED", "M", 5), row("A", "BLUE", "L", 5)]);
  is(m.length === 2 && m[0].style === "A" && m[1].style === "B", "row order preserved; merged record keeps the first position");

  m = mergeDuplicateRows([row("A", "BLUE", "M", 10, { ean: "FIRST", po: "P1" }), row("A", "BLUE", "M", 10, { ean: "SECOND", po: "P2" })]);
  is(m[0].ean === "FIRST" && m[0].po === "P1", "first row wins for EAN / PO — only quantity is added up");

  const src = [row("A", "BLUE", "M", 10), row("A", "BLUE", "M", 10)];
  const before = JSON.stringify(src);
  mergeDuplicateRows(src);
  is(JSON.stringify(src) === before, "input rows are not modified");

  m = mergeDuplicateRows([row("A", "", "", 10), row("A", "", "", 10)]);
  is(m.length === 1 && m[0].orderQty === 20, "rows with blank colour/size still merge");
}

console.log("\n  last box carries the scrap");
{
  const boxes = (qty, per) => {
    const c = computeCartons([row("A", "C", "S", qty, { qtyPerCtn: per, mergedCount: 1 })]);
    const man = aoa(buildWorkbook(c, "S"), "S").slice(1);
    return { qtys: man.map(r => r[7]).join(","), packed: man.reduce((s, r) => s + Number(r[7]), 0), count: man.length };
  };
  let b = boxes(40, 48);  is(b.count === 1 && b.qtys === "00040", `40 pcs @48 -> one box of 00040  [${b.qtys}]`);
  b = boxes(20, 12);      is(b.qtys === "00012,00008", `20 pcs @12 -> 00012 + 00008  [${b.qtys}]`);
  b = boxes(49, 48);      is(b.qtys === "00048,00001", `49 pcs @48 -> 00048 + 00001  [${b.qtys}]`);
  b = boxes(1, 48);       is(b.qtys === "00001", `1 pc @48 -> one box of 00001  [${b.qtys}]`);
  b = boxes(96, 48);      is(b.qtys === "00048,00048", `96 pcs @48 -> exactly 2 full boxes, no phantom third  [${b.qtys}]`);
  b = boxes(480, 48);     is(b.count === 10 && !b.qtys.includes("0000"), "480 pcs @48 -> 10 full boxes, no scrap box");

  const combos = [[40, 48], [20, 12], [49, 48], [1, 48], [96, 48], [480, 48], [100, 7], [333, 17], [100, 1]];
  const off = combos.filter(([q, p]) => boxes(q, p).packed !== q);
  is(off.length === 0, `boxes add back up to the order qty for all ${combos.length} combinations tested`);
}

console.log("\n  merge + scrap together (the 0206772 case)");
{
  const merged = mergeDuplicateRows([
    row("6MS27061", "8017 Beach Glass", "L", 20),
    row("6MS27061", "8017 Beach Glass", "L", 20)
  ]);
  const computed = computeCartons(merged);
  const man = aoa(buildWorkbook(computed, "S"), "S").slice(1);
  is(computed[0].totalCtn === 1, "two rows of 20 -> merged 40 -> ONE carton (was two before the fix)");
  is(man.length === 1 && man[0][7] === "00040", "that carton's QTY/Box is 00040, not the nominal 00048");
  is(man[0][11] === "020677200000124412500040", "its barcode ends in the real 00040");
}

console.log("\n" + "=".repeat(60));
console.log(fails === 0 ? `PASS — all ${checks} checks` : `FAIL — ${fails} of ${checks} checks failed`);
console.log("=".repeat(60));
process.exit(fails === 0 ? 0 : 1);
