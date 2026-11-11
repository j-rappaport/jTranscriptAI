// The info card above the transcript: job name, type, county, date, time, case number,
// volume and grand jury number, plus the optional post-processing and Check for errors buttons
import { useState } from "react"
import { INFO_LABEL_STYLE, INFO_INPUT_STYLE, INFO_ROW_STYLE } from "./styles"
import { TRANSCRIPT_TYPES, OPTIONAL_POSTPROCESSING } from "./info"

// The job's name, as on the home page's job list: saved on Enter or leaving the field, Escape reverts
// (keyed by the name, so it starts over with a fresh draft whenever the saved name changes)
function JobNameInput({ name, onRename }) {
  const [draft, setDraft] = useState(name)
  return (
    <input value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={() => { const n = draft.trim(); if (n && n !== name) onRename(n); else setDraft(name) }}
      onKeyDown={e => {
        if (e.key === "Enter") e.target.blur()
        if (e.key === "Escape") { setDraft(name); requestAnimationFrame(() => e.target.blur()) }
      }}
      style={{ ...INFO_INPUT_STYLE, width: 220, fontWeight: 600 }} />
  )
}

export default function TranscriptInfo({ info, onChange, onRunOptional, onCheckErrors, onFind, jobName, onRename }) {
  const field = (label, input) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={INFO_LABEL_STYLE}>{label}</span>
      {input}
    </label>
  )
  const text = (key, width) => (
    <input value={info[key] ?? ""} placeholder="Unspecified" onChange={e => onChange(key, e.target.value)}
      style={{ ...INFO_INPUT_STYLE, width }} />
  )
  return (
    <div data-plain-keys style={{ background: "white", border: "1px solid #c9c9c9", borderRadius: 4, padding: "10px 16px", marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={INFO_ROW_STYLE}>
        {field("Job name", <JobNameInput key={jobName} name={jobName} onRename={onRename} />)}
        {field("Type", (
          <select value={info.type ?? ""} onChange={e => onChange("type", e.target.value)} style={INFO_INPUT_STYLE}>
            <option value="">Unspecified</option>
            {Object.entries(TRANSCRIPT_TYPES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        ))}
        {field("County", text("county", 120))}
      </div>
      <div style={INFO_ROW_STYLE}>
        {field("Date", <input type="date" value={info.date ?? ""} onChange={e => onChange("date", e.target.value)} style={INFO_INPUT_STYLE} />)}
        {field("Time", <input type="time" value={info.time ?? ""} onChange={e => onChange("time", e.target.value)} style={INFO_INPUT_STYLE} />)}
        {field("Case No.", text("case_number", 140))}
        {field("Volume", text("volume", 90))}
        {field("Grand Jury No.", text("gj_number", 90))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {OPTIONAL_POSTPROCESSING.map(p => (
            <button key={p.rule} onClick={() => onRunOptional(p)} style={{ ...INFO_INPUT_STYLE, cursor: "pointer", color: "#1a4480", borderColor: "#1a4480" }}>
              {p.label}
            </button>
          ))}
          <button onClick={onCheckErrors} style={{ ...INFO_INPUT_STYLE, cursor: "pointer", color: "#1a4480", borderColor: "#1a4480" }}>
            Check for errors
          </button>
          <button onClick={onFind} title="Ctrl+F" style={{ ...INFO_INPUT_STYLE, cursor: "pointer", color: "#1a4480", borderColor: "#1a4480" }}>
            Find and replace
          </button>
        </div>
      </div>
    </div>
  )
}
