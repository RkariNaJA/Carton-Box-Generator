export default function Toolbar({
  defaultQty, onDefaultQtyChange, onApplyAll, onDownload, downloadLabel = "⬇ Download Excel",
  styles, colors, sizes, fileNames, filterStyle, onFilterStyle,
  filterColor, onFilterColor, filterSize, onFilterSize,
  filterFile, onFilterFile
}) {
  const filtering = filterStyle !== "" || filterColor !== "" || filterSize !== "" || filterFile !== "";

  return (
    <div className="toolbar">
      <div className="field">
        <label htmlFor="qtyPerCtn">Qty / CTN</label>
        <input type="number" id="qtyPerCtn" min="1" value={defaultQty}
          onChange={e => onDefaultQtyChange(e.target.value)} />
      </div>
      <button className="btn btn-secondary" onClick={onApplyAll}>Apply to all rows</button>
      {fileNames && fileNames.length > 1 && (
        <div className="field">
          <label htmlFor="filterFile">File</label>
          <select id="filterFile" className={filterFile !== "" ? "active" : ""}
            value={filterFile} onChange={e => onFilterFile(e.target.value)}>
            <option value="">All</option>
            {fileNames.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="filterStyle">Style</label>
        <select id="filterStyle" className={filterStyle !== "" ? "active" : ""}
          value={filterStyle} onChange={e => onFilterStyle(e.target.value)}>
          <option value="">All</option>
          {styles.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="filterColor">Color</label>
        <select id="filterColor" className={filterColor !== "" ? "active" : ""}
          value={filterColor} onChange={e => onFilterColor(e.target.value)}>
          <option value="">All</option>
          {colors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="filterSize">Size</label>
        <select id="filterSize" className={filterSize !== "" ? "active" : ""}
          value={filterSize} onChange={e => onFilterSize(e.target.value)}>
          <option value="">All</option>
          {sizes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <button className={"btn-clear" + (filtering ? " visible" : "")}
        onClick={() => { onFilterStyle(""); onFilterColor(""); onFilterSize(""); onFilterFile(""); }}>
        Clear filters
      </button>
      <button className="btn btn-primary" onClick={onDownload}>{downloadLabel}</button>
    </div>
  );
}
