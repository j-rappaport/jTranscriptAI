import { useState, useRef, useEffect } from "react"

const API = import.meta.env.VITE_API_URL

function msToTimecode(ms) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
}

function InsertMenu({ onInsert, onClose }) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={onClose} />
      <div style={{
        position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 10,
        background: "white", border: "0.5px solid #ddd", borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)", padding: "4px 0", minWidth: 140
      }}>
        <button
          onClick={() => onInsert("utterance")}
          style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 14px", fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "#222" }}
          onMouseEnter={e => e.target.style.background = "#f5f5f5"}
          onMouseLeave={e => e.target.style.background = "none"}
        >
          Utterance
        </button>
        <button
          onClick={() => onInsert("qa_toggle")}
          style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 14px", fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "#222" }}
          onMouseEnter={e => e.target.style.background = "#f5f5f5"}
          onMouseLeave={e => e.target.style.background = "none"}
        >
          QA Toggle
        </button>
      </div>
    </>
  )
}

function BlockRow({ block, index, onRenameOne, onRenameAll, audioRef, audioAvailable, insertMenuOpen, onOpenInsertMenu, onInsert, onCloseInsertMenu, onDelete, onUpdateText }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")

  function startEdit() { setDraft(block.text); setEditing(true) }
  function cancelEdit() { setEditing(false) }
  function confirmEdit() { onUpdateText(index, draft); setEditing(false) }
  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "80px 160px 1fr auto",
    gap: 12,
    padding: "10px 16px",
    borderBottom: "0.5px solid #f0f0f0",
    alignItems: "start",
    background: index % 2 === 0 ? "white" : "#fafafa"
  }

  const iconBtnStyle = {
    fontSize: 13, width: 26, height: 26, borderRadius: 6, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0
  }

  const insertBtn = (
    <div style={{ position: "relative" }}>
      <button
        onClick={e => { e.stopPropagation(); insertMenuOpen ? onCloseInsertMenu() : onOpenInsertMenu() }}
        title="Insert below"
        style={{ ...iconBtnStyle, border: "0.5px solid #e0e0e0", background: "white", color: "#bbb" }}
      >
        ⊕
      </button>
      {insertMenuOpen && <InsertMenu onInsert={onInsert} onClose={onCloseInsertMenu} />}
    </div>
  )

  const deleteBtn = (
    <button
      onClick={onDelete}
      title="Delete block"
      style={{ ...iconBtnStyle, border: "0.5px solid #fecaca", background: "white", color: "#f87171" }}
    >
      ✕
    </button>
  )

  if (block.type === "qa_toggle") {
    return (
      <div style={rowStyle}>
        <span />
        <span style={{ fontSize: 12, fontWeight: 500, color: "#888", fontStyle: "italic" }}>
          QA Toggle
        </span>
        <span />
        <div style={{ display: "flex", gap: 4 }}>
          {insertBtn}
          {deleteBtn}
        </div>
      </div>
    )
  }

  function playFrom() {
    if (!audioRef.current) return
    audioRef.current.currentTime = block.start_ms / 1000
    audioRef.current.play()
  }

  return (
    <div style={rowStyle}>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#888", paddingTop: 2 }}>
        {msToTimecode(block.start_ms)}
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          onClick={() => onRenameOne(index)}
          style={{ fontSize: 12, fontWeight: 500, color: "#185FA5", cursor: "pointer", lineHeight: 1.3 }}
          title="Rename this utterance"
        >
          {block.speaker}
        </span>
        <span
          onClick={() => onRenameAll(block.speaker)}
          style={{ fontSize: 11, color: "#aaa", cursor: "pointer" }}
          title="Rename all utterances with this speaker"
        >
          rename all
        </span>
      </div>

      <div>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") cancelEdit() }}
              style={{
                width: "100%", fontSize: 13, lineHeight: 1.6, fontFamily: "inherit",
                padding: "4px 8px", borderRadius: 6, border: "0.5px solid #185FA5",
                resize: "vertical", boxSizing: "border-box", minHeight: 60
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={confirmEdit} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "none", background: "#185FA5", color: "white", cursor: "pointer" }}>✓ Save</button>
              <button onClick={cancelEdit} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "0.5px solid #ddd", background: "white", color: "#888", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <span
            onClick={startEdit}
            title="Click to edit"
            style={{ fontSize: 13, color: "#222", lineHeight: 1.6, cursor: "text" }}
          >{block.text}</span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        <button
          onClick={playFrom}
          disabled={!audioAvailable}
          style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 6,
            border: `0.5px solid ${audioAvailable ? "#d1fae5" : "#eee"}`,
            background: audioAvailable ? "#f0fdf4" : "#f9f9f9",
            color: audioAvailable ? "#065f46" : "#bbb",
            cursor: audioAvailable ? "pointer" : "not-allowed",
            whiteSpace: "nowrap"
          }}
        >
          {audioAvailable ? "▶ Play" : "no audio"}
        </button>
        <div style={{ display: "flex", gap: 4 }}>
          {insertBtn}
          {deleteBtn}
        </div>
      </div>
    </div>
  )
}

export default function ReviewPage({ jobId, onBack, authHeaders }) {
  const [blocks, setBlocks] = useState(null)
  const [loading, setLoading] = useState(true)
  const [audioAvailable, setAudioAvailable] = useState(true)
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState("")
  const [insertMenuIndex, setInsertMenuIndex] = useState(null)
  const audioRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/jobs/${jobId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        setBlocks(data.blocks.map(b => b.type ? b : { ...b, type: "utterance" }))
        setLoading(false)
      })

    fetch(`${API}/jobs/${jobId}/audio-available`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setAudioAvailable(data.available))

  }, [jobId])

  function openRenameOne(index) {
    setRenameTarget({ index, mode: "one" })
    setRenameValue(blocks[index].speaker)
  }

  function openRenameAll(speaker) {
    setRenameTarget({ speaker, mode: "all" })
    setRenameValue(speaker)
  }

  function applyRename() {
    const newName = renameValue.trim().toUpperCase()
    if (!newName) return
    const updated = blocks.map((b, i) => {
      if (b.type !== "utterance") return b
      if (renameTarget.mode === "one" && i === renameTarget.index)
        return { ...b, speaker: newName }
      if (renameTarget.mode === "all" && b.speaker === renameTarget.speaker)
        return { ...b, speaker: newName }
      return b
    })
    setBlocks(updated)
    setRenameTarget(null)
    fetch(`${API}/jobs/${jobId}/blocks`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: updated }),
    })
  }

  function updateText(index, newText) {
    const updated = blocks.map((b, i) => i === index ? { ...b, text: newText } : b)
    setBlocks(updated)
    fetch(`${API}/jobs/${jobId}/blocks`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: updated }),
    })
  }

  function deleteBlock(index) {
    const updated = blocks.filter((_, i) => i !== index)
    setBlocks(updated)
    fetch(`${API}/jobs/${jobId}/blocks`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: updated }),
    })
  }

  function insertBlock(afterIndex, type) {
    let newBlock
    if (type === "qa_toggle") {
      newBlock = { type: "qa_toggle" }
    } else {
      newBlock = { ...blocks[afterIndex], type: "utterance" }
    }
    const updated = [
      ...blocks.slice(0, afterIndex + 1),
      newBlock,
      ...blocks.slice(afterIndex + 1)
    ]
    setBlocks(updated)
    setInsertMenuIndex(null)
    fetch(`${API}/jobs/${jobId}/blocks`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: updated }),
    })
  }

  function saveTranscript() {
    const text = blocks
      .filter(b => b.type === "utterance")
      .map(b => `${b.speaker}:  ${b.text}`)
      .join("\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${jobId}_transcript.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 900, margin: "48px auto", padding: "0 20px" }}>
      <p style={{ color: "#888" }}>Loading transcript…</p>
    </div>
  )

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 900, margin: "48px auto", padding: "0 20px", textAlign: "left" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, letterSpacing: "-0.5px" }}>
            j<span style={{ color: "#185FA5" }}>Transcript</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", border: "0.5px solid #ddd", padding: "3px 8px", borderRadius: 4 }}>
            Review
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onBack} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, border: "0.5px solid #ddd", background: "white", cursor: "pointer", color: "#555" }}>
            ← New job
          </button>
          <button onClick={saveTranscript} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, border: "none", background: "#185FA5", color: "white", cursor: "pointer" }}>
            💾 Save .txt
          </button>
        </div>
      </div>

      <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
{audioAvailable
  ? <audio
      ref={audioRef}
      controls
      src={`${API}/jobs/${jobId}/audio`}
      style={{ width: "100%" }}
    />
  : <div style={{ fontSize: 13, color: "#aaa", padding: "8px 0" }}>Audio not available</div>
}
      </div>

      <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "80px 160px 1fr auto",
          gap: 12, padding: "8px 16px",
          background: "#185FA5", color: "white", fontSize: 11,
          fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase"
        }}>
          <span>Time</span>
          <span>Speaker</span>
          <span>Text</span>
          <span></span>
        </div>

        {blocks.map((block, i) => (
          <BlockRow
            key={i}
            index={i}
            block={block}
            onRenameOne={openRenameOne}
            onRenameAll={openRenameAll}
            audioRef={audioRef}
            audioAvailable={audioAvailable}
            insertMenuOpen={insertMenuIndex === i}
            onOpenInsertMenu={() => setInsertMenuIndex(i)}
            onCloseInsertMenu={() => setInsertMenuIndex(null)}
            onInsert={type => insertBlock(i, type)}
            onDelete={() => deleteBlock(i)}
            onUpdateText={updateText}
          />
        ))}
      </div>

      {renameTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div style={{ background: "white", borderRadius: 12, padding: 24, width: 360 }}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
              {renameTarget.mode === "all" ? `Rename all "${renameTarget.speaker}"` : "Rename this speaker"}
            </div>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") applyRename(); if (e.key === "Escape") setRenameTarget(null) }}
              style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 8, border: "0.5px solid #ddd", boxSizing: "border-box", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setRenameTarget(null)} style={{ padding: "7px 16px", borderRadius: 8, border: "0.5px solid #ddd", background: "white", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={applyRename} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#185FA5", color: "white", cursor: "pointer" }}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
