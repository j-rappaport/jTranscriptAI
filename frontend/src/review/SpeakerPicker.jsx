// The speaker picker (F2, or clicking a speaker name). Picking a row (or <NEW>) reassigns just this
// utterance; Edit (or double-clicking a row) renames that speaker everywhere. Speakers are
// identified by speaker_id, so names may repeat ("THE WITNESS" twice).
// onApply({ speakerId, name, renaming }): speakerId is null for a new speaker.
import { useState, useRef, useEffect } from "react"

export default function SpeakerPicker({ blocks, index, onApply, onClose }) {
  const [speakerId, setSpeakerId] = useState(blocks[index].speaker_id)  // null = <NEW>
  const [value, setValue] = useState(blocks[index].speaker)
  const [editing, setEditing] = useState(false)
  const modalRef = useRef(null)
  useEffect(() => { modalRef.current?.focus() }, [])

  // One row per speaker ID, in order of first appearance; names can repeat, so
  // duplicates get a hint (their first words) to tell them apart
  const speakersById = new Map()
  for (const b of blocks) {
    if (b.type === "utterance" && !speakersById.has(b.speaker_id)) {
      speakersById.set(b.speaker_id, { id: b.speaker_id, name: b.speaker, firstWords: b.text.split(/\s+/).slice(0, 6).join(" ") })
    }
  }
  const speakerList = [...speakersById.values()]
  const allSpeakers = speakerList.map(s => s.id)
  const nameCounts = {}
  for (const s of speakerList) nameCounts[s.name] = (nameCounts[s.name] || 0) + 1
  const isAddNew = speakerId === null

  function selectRow(id) {
    setSpeakerId(id)
    setValue(id === null ? "" : speakersById.get(id).name)
    setEditing(false)
  }

  function editRow(id) {
    selectRow(id)
    setEditing(true)
  }

  function apply() {
    const name = value.trim().toUpperCase()
    if (!name) return
    onApply({ speakerId, name, renaming: editing && speakerId !== null })
  }

  function handleModalKey(e) {
    e.stopPropagation()
    if (e.key === "Escape") { onClose(); return }
    if (e.key === "Enter" && !editing) { apply(); return }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const items = [...allSpeakers, null]
      const cur = items.indexOf(speakerId)
      const next = e.key === "ArrowDown" ? Math.min(cur + 1, items.length - 1) : Math.max(cur - 1, 0)
      selectRow(items[next])
      return
    }
    if (!editing && /^[0-9]$/.test(e.key)) {
      const idx = parseInt(e.key)
      if (idx < allSpeakers.length) selectRow(allSpeakers[idx])
    }
  }

  const nameInput = placeholder => (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") apply(); if (e.key === "Escape") onClose() }}
      onBlur={() => modalRef.current?.focus()}
      placeholder={placeholder}
      style={{
        flex: 1, minWidth: 0, padding: "3px 8px", fontSize: 13, fontWeight: 500,
        borderRadius: 3, border: "1.5px solid #1a4480", outline: "none",
        boxSizing: "border-box", color: "#1a4480", background: "white"
      }}
    />
  )

  // Rows are the same height whether showing or editing the name, so the window doesn't resize
  const rowStyle = { display: "flex", alignItems: "center", height: 38, boxSizing: "border-box", padding: "0 14px", fontSize: 13, cursor: "pointer" }
  const buttonStyle = { padding: "7px 16px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", cursor: "pointer", color: "#222", fontSize: 13 }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
    }} onClick={onClose}>
      <div
        ref={modalRef}
        tabIndex={0}
        style={{ background: "white", borderRadius: 4, padding: 24, width: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", outline: "none" }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleModalKey}
      >
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16, color: "#111" }}>
          Select speaker
        </div>
        <div style={{ border: "1px solid #c9c9c9", borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
          {allSpeakers.map(s => {
            const selected = !isAddNew && speakerId === s
            return (
              <div
                key={s}
                onClick={() => selectRow(s)}
                onDoubleClick={() => editRow(s)}
                style={{ ...rowStyle, background: selected ? "#EBF3FB" : "white", borderBottom: "1px solid #f0f0f0" }}
              >
                {selected && editing ? nameInput() : (
                  <>
                    <span style={{ color: selected ? "#1a4480" : "#222", fontWeight: selected ? 600 : 400, whiteSpace: "nowrap" }}>{speakersById.get(s).name}</span>
                    {nameCounts[speakersById.get(s).name] > 1 && (
                      <span style={{ marginLeft: 8, color: "#999", fontSize: 11, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        “{speakersById.get(s).firstWords}…”
                      </span>
                    )}
                  </>
                )}
              </div>
            )
          })}
          <div
            onClick={() => selectRow(null)}
            onDoubleClick={() => editRow(null)}
            style={{ ...rowStyle, background: isAddNew ? "#EBF3FB" : "white" }}
          >
            {isAddNew && editing ? nameInput("New speaker name") : (
              <span style={{ color: isAddNew ? "#1a4480" : "#aaa", fontWeight: isAddNew ? 600 : 400, fontStyle: "italic" }}>
                &lt;NEW&gt;
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => editRow(speakerId)} style={buttonStyle}>Edit</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={buttonStyle}>Cancel</button>
          <button onClick={apply} style={{ ...buttonStyle, border: "none", background: "#1a4480", color: "white" }}>OK</button>
        </div>
      </div>
    </div>
  )
}
