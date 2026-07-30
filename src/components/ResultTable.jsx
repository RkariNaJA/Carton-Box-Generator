import { useEffect, useState } from "react";

// Editable Qty/CTN cell — commits on blur or Enter; invalid values snap back
function QtyCell({ value, onCommit }) {
  const [val, setVal] = useState(String(value));
  useEffect(() => { setVal(String(value)); }, [value]);

  const commit = () => {
    const v = parseInt(val, 10);
    if (v >= 1) onCommit(v);
    else setVal(String(value));
  };

  return (
    <input className="qtyctn" type="number" min="1" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
}

export default function ResultTable({ visible, onRowQtyChange, filtering, showFile }) {
  const sumCtn = visible.reduce((s, { r }) => s + r.totalCtn, 0);
  const sumFull = visible.reduce((s, { r }) => s + r.fullCtn, 0);
  const sumQty = visible.reduce((s, { r }) => s + r.orderQty, 0);

  return (
    <div className="table-wrap">
      <table id="resultTable">
        <thead>
          <tr>
            {showFile && <th>File</th>}
            <th>Style</th><th>col.</th><th>size</th><th className="num">Total CTN</th>
            <th className="num">Full CTN</th><th className="num">Scrap CTN</th>
            <th className="mono">Star CTN</th><th className="mono">End CTN</th>
            <th className="num">Order Qty</th><th className="num">Qty/CTN</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(({ r, fileId, rowIdx, key }) => (
            <tr key={key}>
              {showFile && <td className="file-cell" title={r.fileName}>{r.fileName}</td>}
              <td className="strong">{r.style}</td>
              <td>{r.color}</td>
              <td>{r.size}</td>
              <td className="num">{r.totalCtn}</td>
              <td className="num">{r.fullCtn}</td>
              <td className="num">{r.scrapQty > 0 ? r.scrapQty : ""}</td>
              <td className="ctn">{r.startCtn}</td>
              <td className="ctn">{r.endCtn}</td>
              <td className="num">{r.orderQty.toLocaleString()}</td>
              <td className="num">
                <QtyCell value={r.qtyPerCtn} onCommit={v => onRowQtyChange(fileId, rowIdx, v)} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={showFile ? 4 : 3}>Total{filtering ? " (filtered)" : ""}</td>
            <td className="num">{sumCtn.toLocaleString()}</td>
            <td className="num">{sumFull.toLocaleString()}</td>
            <td></td>
            <td></td><td></td>
            <td className="num">{sumQty.toLocaleString()}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
