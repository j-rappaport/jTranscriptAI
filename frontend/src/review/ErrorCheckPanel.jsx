import { INFO_LABEL_STYLE } from "./styles"

// Check for errors: the floating panel in the top right, stepping through every kind of issue
// (checks.js) in transcript order, with the actions that fit each. Its buttons don't take
// focus, so a misspelled word stays selected in the transcript and typing replaces it.
const CHECK_LABELS = { spelling: "Spelling", same_speaker: "Duplicate speaker" }

export default function ErrorCheckPanel({ loading, issue, number, total, suggestions, onReplace, onIgnore, onMerge, onChangeSpeaker, onNext, onClose }) {
  const btn = { fontSize: 12, padding: "4px 10px", borderRadius: 3, border: "1px solid #b0b0b0", background: "white", color: "#333", cursor: "pointer" }
  const keepFocus = e => e.preventDefault()
  const next = <button onMouseDown={keepFocus} onClick={onNext} style={{ ...btn, marginLeft: "auto", background: "#1a4480", borderColor: "#1a4480", color: "white" }}>Next →</button>
  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 260, width: 290, background: "white",
      border: "1px solid #c9c9c9", borderRadius: 4, boxShadow: "0 6px 20px rgba(0,0,0,0.15)", padding: "12px 14px",
      fontFamily: "'Public Sans', Arial, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <span style={{ ...INFO_LABEL_STYLE, color: "#888" }}>{issue ? CHECK_LABELS[issue.check] : "Errors"}</span>
        {!loading && total > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>{number} / {total}</span>}
        <button onMouseDown={keepFocus} onClick={onClose} title="Close" style={{ marginLeft: "auto", border: "none", background: "none", color: "#999", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: "#888" }}>Loading dictionary…</div>
      ) : !issue ? (
        <div style={{ fontSize: 13, color: "#166534" }}>No errors found.</div>
      ) : issue.check === "same_speaker" ? (
        <>
          <div style={{ display: "flex", gap: 4 }}>
            <button onMouseDown={keepFocus} onClick={onMerge} title="Join this utterance onto the previous one" style={btn}>Merge</button>
            <button onMouseDown={keepFocus} onClick={onChangeSpeaker} style={btn}>Change speaker</button>
            <button onMouseDown={keepFocus} onClick={onIgnore} title="Ignore until the page is reloaded" style={btn}>Ignore</button>
            {next}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#b42318", marginBottom: 8 }}>{issue.word}</div>
          {suggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {suggestions.map(sug => (
                <button key={sug} onMouseDown={keepFocus} onClick={() => onReplace(sug)} style={{ ...btn, borderColor: "#1a4480", color: "#1a4480" }}>{sug}</button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 4 }}>
            <button onMouseDown={keepFocus} onClick={onIgnore} title="Ignore this word until the page is reloaded" style={btn}>Ignore</button>
            {next}
          </div>
        </>
      )}
    </div>
  )
}
