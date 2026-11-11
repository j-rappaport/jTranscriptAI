// Find and replace: the floating panel in the top right (same place as Check for errors).
// Enter in Find goes to the next match (Shift+Enter: previous); Enter in Replace replaces it.
// Its buttons don't take focus, so the current match stays selected in the transcript.
import { useRef, useEffect } from "react"
import { INFO_LABEL_STYLE, INFO_INPUT_STYLE } from "./styles"

export default function FindReplacePanel({ query, replacement, options, message, focusRequest, number, total,
  onQuery, onReplacement, onOption, onNext, onPrevious, onReplace, onReplaceAll, onClose }) {
  const findRef = useRef(null)
  useEffect(() => { findRef.current?.focus(); findRef.current?.select() }, [focusRequest])

  const btn = { fontSize: 12, padding: "4px 10px", borderRadius: 3, border: "1px solid #b0b0b0", background: "white", color: "#333", cursor: "pointer" }
  const keepFocus = e => e.preventDefault()
  const input = { ...INFO_INPUT_STYLE, width: "100%", boxSizing: "border-box" }
  const checkbox = (key, label) => (
    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#555", cursor: "pointer" }}>
      <input type="checkbox" checked={options[key]} onChange={e => onOption(key, e.target.checked)} /> {label}
    </label>
  )

  return (
    <div data-plain-keys onKeyDown={e => { if (e.key === "Escape") onClose() }} style={{
      position: "fixed", top: 16, right: 16, zIndex: 260, width: 300, background: "white",
      border: "1px solid #c9c9c9", borderRadius: 4, boxShadow: "0 6px 20px rgba(0,0,0,0.15)", padding: "12px 14px",
      fontFamily: "'Public Sans', Arial, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <span style={{ ...INFO_LABEL_STYLE, color: "#888" }}>Find and replace</span>
        {query && <span style={{ marginLeft: 8, fontSize: 12, color: total ? "#555" : "#b42318" }}>{total ? `${number} / ${total}` : "No matches"}</span>}
        <button onMouseDown={keepFocus} onClick={onClose} title="Close" style={{ marginLeft: "auto", border: "none", background: "none", color: "#999", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
      </div>
      <input ref={findRef} value={query} placeholder="Find" onChange={e => onQuery(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? onPrevious() : onNext() } }}
        style={{ ...input, marginBottom: 6 }} />
      <input value={replacement} placeholder="Replace with" onChange={e => onReplacement(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onReplace() } }}
        style={{ ...input, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
        {checkbox("wholeWord", "Whole word")}
        {checkbox("matchCase", "Match case")}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button onMouseDown={keepFocus} onClick={onReplace} disabled={!total} style={btn}>Replace</button>
        <button onMouseDown={keepFocus} onClick={onReplaceAll} disabled={!total} style={btn}>Replace all</button>
        <button onMouseDown={keepFocus} onClick={onPrevious} disabled={!total} title="Previous match (Shift+Enter)" style={{ ...btn, marginLeft: "auto" }}>↑</button>
        <button onMouseDown={keepFocus} onClick={onNext} disabled={!total} title="Next match (Enter)"
          style={{ ...btn, background: "#1a4480", borderColor: "#1a4480", color: "white" }}>Next ↓</button>
      </div>
      {message && <div style={{ marginTop: 8, fontSize: 12, color: "#166534" }}>{message}</div>}
    </div>
  )
}
