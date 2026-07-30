"use strict";

let rows = [];          // {style, color, size, orderQty, qtyPerCtn}
let sourceFileName = "";

const dropzone   = document.getElementById("dropzone");
const fileInput  = document.getElementById("fileInput");
const errorMsg   = document.getElementById("errorMsg");

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

document.getElementById("applyAllBtn").addEventListener("click", () => {
  const v = parseInt(document.getElementById("qtyPerCtn").value, 10);
  if (!v || v < 1) return showError("Qty/CTN must be a positive number.");
  rows.forEach(r => r.qtyPerCtn = v);
  renderTable();
});

document.getElementById("downloadBtn").addEventListener("click", downloadExcel);

const filterColor = document.getElementById("filterColor");
const filterSize  = document.getElementById("filterSize");
const clearBtn    = document.getElementById("clearFilters");
filterColor.addEventListener("change", renderTable);
filterSize.addEventListener("change", renderTable);
clearBtn.addEventListener("click", () => {
  filterColor.value = "";
  filterSize.value = "";
  renderTable();
});

function fillFilterOptions() {
  const fill = (sel, values) => {
    sel.innerHTML = '<option value="">All</option>' +
      values.map(v => '<option value="' + esc(v) + '">' + esc(v) + "</option>").join("");
  };
  fill(filterColor, [...new Set(rows.map(r => r.color))]);
  fill(filterSize,  [...new Set(rows.map(r => r.size))]);
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
}
function clearError() {
  errorMsg.style.display = "none";
}

function handleFile(file) {
  clearError();
  sourceFileName = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      parseWorkbook(wb);
    } catch (err) {
      showError("Could not read this file as Excel: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// Find the sheet whose header row contains "SKU number" + "Orli code",
// then read the data rows below it.
function parseWorkbook(wb) {
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
    showError('Could not find the data sheet. Expected a header row with "1. SKU number", "3. Orli code", etc. (like sheet "0100000_2026-03-06" in the example file).');
    return;
  }

  // Locate the columns by header text (falls back to fixed positions C, D, E, K)
  const findCol = (keyword, fallback) => {
    const idx = found.header.findIndex(v => String(v ?? "").toLowerCase().includes(keyword));
    return idx >= 0 ? idx : fallback;
  };
  const colStyle = findCol("orli code", 2);
  const colColor = findCol("color",     3);
  const colSize  = findCol("size",      4);
  const colQty   = findCol("quantity", 10);

  const defaultQty = parseInt(document.getElementById("qtyPerCtn").value, 10) || 48;
  rows = [];
  for (let i = found.headerRow + 1; i < found.data.length; i++) {
    const r = found.data[i] || [];
    const style = r[colStyle], qty = Number(r[colQty]);
    if (style == null || String(style).trim() === "") continue;   // skip blank rows
    if (!qty || qty <= 0) continue;                               // need a quantity
    rows.push({
      style:     String(style).trim(),
      color:     String(r[colColor] ?? "").trim(),
      size:      String(r[colSize]  ?? "").trim(),
      orderQty:  qty,
      qtyPerCtn: defaultQty
    });
  }

  if (!rows.length) {
    showError('Found sheet "' + found.name + '" but no data rows with a quantity. Please check the file.');
    return;
  }

  document.getElementById("fileName").textContent =
    "✔ " + sourceFileName + "  ·  sheet: " + found.name + "  ·  " + rows.length + " rows";
  document.body.classList.add("has-data");
  filterColor.value = "";
  filterSize.value = "";
  fillFilterOptions();
  renderTable();
}

// Compute Total CTN + running Star/End carton numbers (same as the Excel formulas:
// D = ROUNDUP(G/H,0), E = TEXT(SUM(D above)+1,"00000"), F = TEXT(E+D-1,"00000"))
function computeCartons() {
  let running = 0;
  return rows.map(r => {
    const totalCtn = Math.ceil(r.orderQty / r.qtyPerCtn);
    const start = running + 1;
    const end = running + totalCtn;
    running = end;
    return {
      ...r,
      totalCtn,
      startCtn: String(start).padStart(5, "0"),
      endCtn:   String(end).padStart(5, "0")
    };
  });
}

function renderTable() {
  const computed = computeCartons();   // always numbered over ALL rows
  const fc = filterColor.value, fs = filterSize.value;
  const filtering = fc !== "" || fs !== "";
  filterColor.classList.toggle("active", fc !== "");
  filterSize.classList.toggle("active", fs !== "");
  clearBtn.classList.toggle("visible", filtering);

  const visible = computed
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => (fc === "" || r.color === fc) && (fs === "" || r.size === fs));

  const tbody = document.querySelector("#resultTable tbody");
  tbody.innerHTML = "";
  let sumCtn = 0, sumQty = 0;

  visible.forEach(({ r, idx }) => {
    sumCtn += r.totalCtn;
    sumQty += r.orderQty;
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="strong">' + esc(r.style) + "</td>" +
      "<td>" + esc(r.color) + "</td>" +
      "<td>" + esc(r.size) + "</td>" +
      '<td class="num">' + r.totalCtn + "</td>" +
      '<td class="ctn">' + r.startCtn + "</td>" +
      '<td class="ctn">' + r.endCtn + "</td>" +
      '<td class="num">' + r.orderQty.toLocaleString() + "</td>" +
      '<td class="num"><input class="qtyctn" type="number" min="1" value="' + r.qtyPerCtn + '" data-idx="' + idx + '"></td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("input.qtyctn").forEach(inp => {
    inp.addEventListener("change", () => {
      const v = parseInt(inp.value, 10);
      if (v >= 1) { rows[+inp.dataset.idx].qtyPerCtn = v; renderTable(); }
      else inp.value = rows[+inp.dataset.idx].qtyPerCtn;
    });
  });

  document.querySelector("#resultTable tfoot").innerHTML =
    '<tr><td colspan="3">Total' + (filtering ? " (filtered)" : "") +
    '</td><td class="num">' + sumCtn.toLocaleString() +
    '</td><td></td><td></td><td class="num">' + sumQty.toLocaleString() + "</td><td></td></tr>";

  const range = visible.length
    ? visible[0].r.startCtn + " – " + visible[visible.length - 1].r.endCtn
    : "—";
  document.getElementById("summary").innerHTML =
    '<div class="stat"><div class="k">Rows' + (filtering ? " (shown)" : "") + '</div><div class="v">' +
      (filtering ? visible.length + " / " + rows.length : rows.length) + "</div></div>" +
    '<div class="stat"><div class="k">Cartons</div><div class="v">' + sumCtn.toLocaleString() + "</div></div>" +
    '<div class="stat"><div class="k">Pieces</div><div class="v">' + sumQty.toLocaleString() + "</div></div>" +
    '<div class="stat"><div class="k">Carton range</div><div class="v">' + range + "</div></div>";
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function downloadExcel() {
  const computed = computeCartons();
  const aoa = [["Style ", "col.", "size", "Total CTN", "Star CTN", "End CTN", "Order Qty", "Qty/CTN"]];
  computed.forEach(r => {
    aoa.push([r.style, r.color, r.size, r.totalCtn, r.startCtn, r.endCtn, r.orderQty, r.qtyPerCtn]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Keep carton numbers as text so Excel shows "00001" not 1
  for (let i = 2; i <= aoa.length; i++) {
    ["E", "F"].forEach(col => {
      const cell = ws[col + i];
      if (cell) { cell.t = "s"; cell.z = "@"; }
    });
  }
  ws["!cols"] = [{wch:12},{wch:20},{wch:8},{wch:10},{wch:10},{wch:10},{wch:10},{wch:9}];

  const wbOut = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbOut, ws, "Note");

  // "EAN for BABOLAT - 0100000.xlsx" -> "UCC BABOLAT - 0100000.xlsx"
  let outName = sourceFileName.replace(/\.(xlsx|xls)$/i, "");
  outName = /EAN for /i.test(outName) ? outName.replace(/EAN for /i, "UCC ") : "UCC " + outName;
  XLSX.writeFile(wbOut, outName + ".xlsx");
}
