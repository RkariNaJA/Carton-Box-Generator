import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { parseWorkbook, computeCartons, buildWorkbook, outputFileName, saveWorkbook } from "./excel.js";
import Dropzone from "./components/Dropzone.jsx";
import FileList from "./components/FileList.jsx";
import Toolbar from "./components/Toolbar.jsx";
import SummaryStats from "./components/SummaryStats.jsx";
import ResultTable from "./components/ResultTable.jsx";

let idCounter = 0;
const nextId = () => ++idCounter;

export default function App() {
  // one entry per dropped file: {id, sourceFileName, sheetName, rows, error}
  const [files, setFiles] = useState([]);
  const [defaultQty, setDefaultQty] = useState("48");
  const [filterStyle, setFilterStyle] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [filterSize, setFilterSize] = useState("");
  const [filterFile, setFilterFile] = useState("");

  const withData = files.filter(f => !f.error && f.rows.length > 0);
  const hasData = withData.length > 0;

  // style.css targets body.has-data — keep the stylesheet unchanged
  useEffect(() => {
    document.body.classList.toggle("has-data", hasData);
  }, [hasData]);

  // Parse every dropped/selected file and add each as its own entry.
  function addFiles(fileList) {
    const qty = parseInt(defaultQty, 10) || 48;
    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const id = nextId();
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
          const { rows, sheetName } = parseWorkbook(wb, qty);
          setFiles(prev => [...prev, { id, sourceFileName: file.name, sheetName, rows, error: "" }]);
        } catch (err) {
          const msg = err.message.startsWith("Could not find") || err.message.startsWith("Found sheet")
            ? err.message
            : "Could not read this file as Excel: " + err.message;
          setFiles(prev => [...prev, { id, sourceFileName: file.name, sheetName: "", rows: [], error: msg }]);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function removeFile(id) {
    setFiles(prev => prev.filter(f => f.id !== id));
  }

  // Apply the Qty/CTN in the toolbar to every row of every file.
  function applyToAll() {
    const v = parseInt(defaultQty, 10);
    if (!v || v < 1) return;
    setFiles(prev => prev.map(f =>
      f.error ? f : { ...f, rows: f.rows.map(r => ({ ...r, qtyPerCtn: v })) }));
  }

  // Edit one row's Qty/CTN — identified by which file it belongs to.
  function setRowQty(fileId, rowIdx, v) {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, rows: f.rows.map((r, i) => (i === rowIdx ? { ...r, qtyPerCtn: v } : r)) } : f));
  }

  function downloadFile(f) {
    const wbOut = buildWorkbook(computeCartons(f.rows), f.sheetName);
    saveWorkbook(wbOut, outputFileName(f.sourceFileName));
  }

  function downloadOne(id) {
    const f = files.find(x => x.id === id);
    if (f && f.rows.length) downloadFile(f);
  }

  function downloadAll() {
    withData.forEach(downloadFile);
  }

  // Build one combined list of rows across all files.
  // Carton numbers restart at 00001 within each file (each file = its own output).
  const combined = [];
  withData.forEach(f => {
    computeCartons(f.rows).forEach((r, rowIdx) => {
      combined.push({
        r: { ...r, fileName: f.sourceFileName },
        fileId: f.id,
        rowIdx,
        key: f.id + ":" + rowIdx
      });
    });
  });

  const visible = combined.filter(({ r }) =>
    (filterStyle === "" || r.style === filterStyle) &&
    (filterColor === "" || r.color === filterColor) &&
    (filterSize === "" || r.size === filterSize) &&
    (filterFile === "" || r.fileName === filterFile));
  const filtering = filterStyle !== "" || filterColor !== "" || filterSize !== "" || filterFile !== "";
  const multiFile = withData.length > 1;

  return (
    <>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">▦</span>Carton Box Generator</div>
        <div className="flow">EAN files → Note table → Excel</div>
      </header>

      <main>
        <div className="panel" id="uploadPanel">
          <Dropzone onFiles={addFiles} />
          <FileList files={files} onRemove={removeFile} onDownload={downloadOne} />
        </div>

        {hasData && (
          <div className="panel" id="resultCard">
            <Toolbar
              defaultQty={defaultQty} onDefaultQtyChange={setDefaultQty}
              onApplyAll={applyToAll} onDownload={downloadAll}
              downloadLabel={multiFile ? "⬇ Download all (" + withData.length + ")" : "⬇ Download Excel"}
              styles={[...new Set(combined.map(v => v.r.style))]}
              colors={[...new Set(combined.map(v => v.r.color))]}
              sizes={[...new Set(combined.map(v => v.r.size))]}
              fileNames={withData.map(f => f.sourceFileName)}
              filterStyle={filterStyle} onFilterStyle={setFilterStyle}
              filterColor={filterColor} onFilterColor={setFilterColor}
              filterSize={filterSize} onFilterSize={setFilterSize}
              filterFile={filterFile} onFilterFile={setFilterFile}
            />
            <SummaryStats visible={visible} totalRows={combined.length}
              fileCount={withData.length} filtering={filtering} />
            <ResultTable visible={visible} onRowQtyChange={setRowQty}
              filtering={filtering} showFile={multiFile} />
            <div className="tip">
              Each file downloads as its own <strong>UCC …xlsx</strong> (use ⬇ next to a file, or “Download all”),
              with carton numbers restarting at 00001. Edit the dashed<span className="swatch"></span>Qty/CTN cell of any
              row — carton numbers recalculate automatically. Filters only change what is shown.
            </div>
          </div>
        )}
      </main>

      <footer>HI-TECH APPAREL · FORMING BOX FILE · SHEET "NOTE"</footer>
    </>
  );
}
