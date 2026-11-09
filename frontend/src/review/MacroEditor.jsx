import { useState, Fragment } from "react"
import { INFO_LABEL_STYLE, INFO_INPUT_STYLE } from "./styles"

// User macros: typing a trigger then Space in the transcript expands it ("ind" -> "(indiscernible)").
// Triggers are single words (no spaces or . , ? !), matched exactly, capitals included ("mhm" and "Mhm" are separate macros); each user has their own list.
export default function MacroEditor({ macros, onSave, onClose }) {
  const [rows, setRows] = useState(() => macros.length ? macros : [{ trigger: "", expansion: "" }])
  const update = (i, key, value) => setRows(rs => rs.map((r, j) => j === i ? { ...r, [key]: value } : r))
  const cleaned = rows
    .map(r => ({ trigger: r.trigger.replace(/[\s.,?!]+/g, ""), expansion: r.expansion }))
    .filter(r => r.trigger && r.expansion)
  const triggers = cleaned.map(r => r.trigger)
  const duplicate = triggers.find((t, i) => triggers.indexOf(t) !== i)

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div data-plain-keys onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") onClose() }}
        style={{ background: "white", borderRadius: 4, padding: 24, width: 520, maxWidth: "calc(100vw - 32px)", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, color: "#111" }}>User macros</div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Type the short form, then Space or . , ? ! to insert the full text.</div>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 28px", gap: "6px 8px", alignItems: "center" }}>
          <span style={INFO_LABEL_STYLE}>Type</span>
          <span style={INFO_LABEL_STYLE}>Inserts</span>
          <span />
          {rows.map((r, i) => (
            <Fragment key={i}>
              <input value={r.trigger} placeholder="ind" autoFocus={i === rows.length - 1 && !r.trigger}
                onChange={e => update(i, "trigger", e.target.value.replace(/[\s.,?!]+/g, ""))} style={INFO_INPUT_STYLE} />
              <input value={r.expansion} placeholder="(indiscernible)"
                onChange={e => update(i, "expansion", e.target.value)} style={INFO_INPUT_STYLE} />
              <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} title="Delete macro"
                style={{ border: "none", background: "none", color: "#aaa", cursor: "pointer", fontSize: 16 }}>×</button>
            </Fragment>
          ))}
        </div>
        <button onClick={() => setRows(rs => [...rs, { trigger: "", expansion: "" }])}
          style={{ marginTop: 10, fontSize: 12, padding: "4px 10px", borderRadius: 3, border: "1px solid #b0b0b0", background: "white", color: "#555", cursor: "pointer" }}>
          + Add macro
        </button>
        {duplicate && <div style={{ marginTop: 10, fontSize: 12, color: "#b50909" }}>"{duplicate}" is used twice.</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", cursor: "pointer", color: "#222", fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={() => onSave(cleaned)} disabled={!!duplicate}
            style={{ padding: "7px 16px", borderRadius: 4, border: "none", background: duplicate ? "#9aa8bd" : "#1a4480", color: "white", cursor: duplicate ? "default" : "pointer", fontSize: 13 }}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
