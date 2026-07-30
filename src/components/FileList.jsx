// The compact list of dropped files shown under the dropzone.
// Each file can be downloaded on its own (⬇) or removed (✕).
export default function FileList({ files, onRemove, onDownload }) {
  if (!files.length) return null;

  return (
    <div className="file-list">
      {files.map(f => (
        <div key={f.id} className={"file-card" + (f.error ? " error" : "")}>
          <span className="fc-name">{f.error ? "✕" : "✔"} {f.sourceFileName}</span>
          <span className="fc-meta">{f.error ? f.error : f.rows.length + " rows"}</span>
          <span className="fc-actions">
            {!f.error && f.rows.length > 0 && (
              <button className="fc-btn" title="Download this file" onClick={() => onDownload(f.id)}>⬇</button>
            )}
            <button className="fc-btn fc-remove" title="Remove this file" onClick={() => onRemove(f.id)}>✕</button>
          </span>
        </div>
      ))}
    </div>
  );
}
