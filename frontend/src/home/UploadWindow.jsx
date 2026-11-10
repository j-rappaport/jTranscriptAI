// The "New transcription" window: choose audio files, adjust the vocabulary, Transcribe. The upload
// itself (useUpload) runs in the home page, so closing this window doesn't stop it.
import { useState } from "react"

const statusColor = { pending: "#1a4480", transcribing: "#1a4480", done: "#3B6D11", error: "#A32D2D" }
const statusBg = { pending: "#e7ecf1", transcribing: "#e7ecf1", done: "#EAF3DE", error: "#FCEBEB" }
const bigButton = {
  width: "100%", padding: 13, marginTop: 14, borderRadius: 4, border: "none",
  fontFamily: "'Public Sans', Arial, sans-serif", fontSize: 15, fontWeight: 500,
}

export default function UploadWindow({ upload, destination, onReview, onClose }) {
  const [dragging, setDragging] = useState(false)
  const [vocabOpen, setVocabOpen] = useState(false)
  const { files, jobId, status, error, uploading, boostWords, setBoostWords, chooseFiles } = upload
  const busy = uploading || status === "pending" || status === "transcribing"

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") onClose() }}
        style={{ background: "white", borderRadius: 4, padding: 24, width: 560, maxWidth: "calc(100vw - 32px)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>New transcription</div>
          <div style={{ marginLeft: 10, fontSize: 12, color: "#888" }}>saves to {destination}</div>
          <button onClick={onClose} title={busy ? "Close (the transcription keeps going)" : "Close"}
            style={{ marginLeft: "auto", border: "none", background: "none", color: "#999", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); chooseFiles(e.dataTransfer.files) }}
          onClick={() => document.getElementById("fileinput").click()}
          style={{
            border: `1.5px dashed ${dragging ? "#1a4480" : "#adadad"}`,
            borderRadius: 4, padding: "36px 24px", textAlign: "center", cursor: "pointer",
            background: dragging ? "#e7ecf1" : "transparent", transition: "all 0.15s"
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Drop audio file(s) here</div>
          <div style={{ fontSize: 13, color: "#888" }}>
            or <span style={{ color: "#1a4480", fontWeight: 500 }}>browse to upload</span>
          </div>
          <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>MP3 · TRM</div>
          <input id="fileinput" type="file" multiple accept=".mp3,.wav,.m4a,.mp4,.aac,.flac,.trm,.trs"
            style={{ display: "none" }} onChange={e => chooseFiles(e.target.files)} />
        </div>

        {files.length > 0 && (
          <div style={{ marginTop: 12, borderRadius: 4, overflow: "hidden", border: "1px solid #dadada" }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: i % 2 === 0 ? "#f7f7f7" : "#f0f0f0" }}>
                <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span style={{ fontSize: 11, color: "#888", flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
            ))}
            {files.length > 1 && (
              <div style={{ padding: "6px 14px", background: "#e8e8e8", fontSize: 11, color: "#666" }}>
                {files.length} files · {(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB total
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 14, border: "1px solid #dadada", borderRadius: 4, overflow: "hidden" }}>
          <div
            onClick={() => setVocabOpen(v => !v)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", cursor: "pointer", background: "#fafafa" }}
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: "#555" }}>Vocabulary</span>
            <span style={{ fontSize: 11, color: "#aaa" }}>
              {boostWords.split("\n").filter(w => w.trim()).length} words {vocabOpen ? "▲" : "▼"}
            </span>
          </div>
          {vocabOpen && (
            <div style={{ padding: "8px 14px", borderTop: "1px solid #dadada" }}>
              <textarea
                value={boostWords}
                onChange={e => setBoostWords(e.target.value)}
                rows={10}
                style={{
                  width: "100%", fontSize: 13, fontFamily: "'Public Sans', Arial, sans-serif",
                  border: "1px solid #b0b0b0", borderRadius: 3, padding: "8px 10px",
                  boxSizing: "border-box", resize: "vertical", lineHeight: 1.6,
                  color: "#333", background: "white"
                }}
              />
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>One word or phrase per line · improves transcription accuracy</div>
            </div>
          )}
        </div>

        {/* Once transcription finishes, the same button opens the review; choosing new files brings Transcribe back */}
        {status === "done" && jobId ? (
          <button onClick={() => onReview(jobId)} style={{ ...bigButton, background: "#1a4480", color: "white", cursor: "pointer" }}>
            Review transcript →
          </button>
        ) : (
          <button onClick={upload.upload} disabled={!files.length || busy}
            style={{
              ...bigButton,
              background: !files.length || busy ? "#f0f0f0" : "#1a4480",
              color: !files.length || busy ? "#aaa" : "white",
              cursor: !files.length || busy ? "not-allowed" : "pointer",
            }}>
            {uploading ? "Uploading…" : "Transcribe"}
          </button>
        )}

        {(status || error) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 4, marginTop: 10, background: statusBg[status ?? "error"], color: statusColor[status ?? "error"], fontSize: 13 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor[status ?? "error"], flexShrink: 0 }} />
            {status === "done" ? "Transcription complete."
              : status === "error" || !status ? `Error: ${error}`
              : `Status: ${status}… You can close this window; it keeps going.`}
          </div>
        )}
      </div>
    </div>
  )
}
