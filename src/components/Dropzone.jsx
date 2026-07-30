import { useRef, useState } from "react";

export default function Dropzone({ onFiles }) {
  const inputRef = useRef(null);
  const [dragover, setDragover] = useState(false);

  return (
    <>
      <div
        id="dropzone"
        className={dragover ? "dragover" : ""}
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragover(true); }}
        onDragLeave={() => setDragover(false)}
        onDrop={e => {
          e.preventDefault();
          setDragover(false);
          if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
        }}
      >
        <div className="dz-icon">[ ▢ ▢ ▢ ]</div>
        <div className="dz-title"><strong>Choose Excel files</strong> or drag &amp;
         drop them here</div>
        <div className="dz-hint">.xlsx / .xls — drop several at once. e.g. EAN for BABOLAT - 0100000_2026-03-06.xlsx</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        id="fileInput"
        accept=".xlsx,.xls"
        multiple
        onChange={e => {
          if (e.target.files.length) onFiles(e.target.files);
          e.target.value = "";   // allow re-selecting the same file(s)
        }}
      />
    </>
  );
}
