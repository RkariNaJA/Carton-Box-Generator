export default function SummaryStats({ visible, totalRows, fileCount, filtering }) {
  const sumCtn = visible.reduce((s, { r }) => s + r.totalCtn, 0);
  const sumQty = visible.reduce((s, { r }) => s + r.orderQty, 0);
  const multiFile = fileCount > 1;
  const range = visible.length
    ? visible[0].r.startCtn + " – " + visible[visible.length - 1].r.endCtn
    : "—";

  return (
    <div id="summary">
      <div className="stat">
        <div className="k">Rows{filtering ? " (shown)" : ""}</div>
        <div className="v">{filtering ? visible.length + " / " + totalRows : totalRows}</div>
      </div>
      <div className="stat"><div className="k">Cartons</div><div className="v">{sumCtn.toLocaleString()}</div></div>
      <div className="stat"><div className="k">Pieces</div><div className="v">{sumQty.toLocaleString()}</div></div>
      <div className="stat">
        <div className="k">{multiFile ? "Files" : "Carton range"}</div>
        <div className="v">{multiFile ? fileCount : range}</div>
      </div>
    </div>
  );
}
