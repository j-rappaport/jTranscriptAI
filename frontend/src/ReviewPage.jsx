import { useState, useRef, useEffect } from "react"

const API = import.meta.env.VITE_API_URL

const ABBREVS = /\b(Mr|Mrs|Ms|Dr|Jr|Sr|vs|etc|No|St)\.  /gi

const SHORTCUTS = [
  { keys: "Space",      desc: "Play / Pause" },
  { keys: "← →",       desc: "Skip ±4 seconds" },
  { keys: "↑ ↓",       desc: "Move selection" },
  { keys: "Enter",      desc: "Edit selected block" },
  { keys: "Shift+Enter", desc: "New line while editing" },
  { keys: "Escape",     desc: "Cancel edit" },
  { keys: "x",          desc: "Delete selected block" },
  { keys: "b",          desc: "Insert utterance below" },
  { keys: "n",          desc: "Insert QA toggle below" },
  { keys: "p",          desc: "Play from selected block" },
]

function normalizeSentenceSpacing(text) {
  return text
    .replace(/([.?])\s*/g, "$1  ")
    .replace(ABBREVS, "$1. ")
    .trimEnd()
}

function msToTimecode(ms) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
}

function InsertMenu({ onInsert, onDelete, onClose }) {
  const itemStyle = { display: "block", width: "100%", textAlign: "left", padding: "7px 14px", fontSize: 12, background: "none", border: "none", cursor: "pointer" }
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={onClose} />
      <div style={{
        position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 10,
        background: "white", border: "0.5px solid #ddd", borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)", padding: "4px 0", minWidth: 160
      }}>
        <button onClick={() => onInsert("utterance")} style={{ ...itemStyle, color: "#222" }}
          onMouseEnter={e => e.target.style.background = "#f5f5f5"}
          onMouseLeave={e => e.target.style.background = "none"}>
          Insert Utterance
        </button>
        <button onClick={() => onInsert("qa_toggle")} style={{ ...itemStyle, color: "#222" }}
          onMouseEnter={e => e.target.style.background = "#f5f5f5"}
          onMouseLeave={e => e.target.style.background = "none"}>
          Insert QA Toggle
        </button>
        <div style={{ borderTop: "0.5px solid #f0f0f0", margin: "4px 0" }} />
        <button onClick={onDelete} style={{ ...itemStyle, color: "#ef4444" }}
          onMouseEnter={e => e.target.style.background = "#fef2f2"}
          onMouseLeave={e => e.target.style.background = "none"}>
          Delete
        </button>
      </div>
    </>
  )
}

const ROLE_STYLE = {
  Q: { color: "#185FA5", fontWeight: 600 },
  A: { color: "#dc2626", fontWeight: 600 },
}

function computeBlockDisplay(blocks) {
  let qaOn = false, next = "Q", sectionIdx = 0
  const roles = [], toggleStates = [], sectionIndices = []
  for (const b of blocks) {
    if (b.type === "qa_toggle") {
      qaOn = !qaOn
      if (qaOn) next = "Q"
      roles.push(""); toggleStates.push(qaOn); sectionIndices.push(0)
      sectionIdx = 1
    } else {
      if (b.type === "utterance" && qaOn) {
        const r = next; next = r === "Q" ? "A" : "Q"; roles.push(r)
      } else {
        roles.push("")
      }
      toggleStates.push(null); sectionIndices.push(sectionIdx++)
    }
  }
  return { roles, toggleStates, sectionIndices }
}

function BlockRow({ block, index, role, toggleState, sectionIndex, isSelected, isEditing, draft, textareaRef, onSelect, onStartEdit, onConfirmEdit, onCancelEdit, onDraftChange, onRenameOne, onRenameAll, audioRef, audioAvailable, insertMenuOpen, onOpenInsertMenu, onInsert, onCloseInsertMenu, onDelete, onUpdateText }) {
  const isInQA = block.type === "qa_toggle" ? toggleState : !!role
  const rowBg = isInQA
    ? (sectionIndex % 2 === 0 ? "#dcfce7" : "#f0fdf4")
    : (sectionIndex % 2 === 0 ? "white" : "#fafafa")

  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "80px 160px 40px 1fr auto",
    gap: 12,
    padding: "10px 16px",
    borderBottom: "0.5px solid #f0f0f0",
    alignItems: "start",
    background: rowBg,
    cursor: "default",
    position: "relative",
    ...(isSelected ? {
      boxShadow: "inset 3px 0 0 #185FA5, 0 2px 10px rgba(24,95,165,0.10)",
      zIndex: 1,
    } : {})
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
        ☰
      </button>
      {insertMenuOpen && <InsertMenu onInsert={onInsert} onDelete={() => { onDelete(); onCloseInsertMenu() }} onClose={onCloseInsertMenu} />}
    </div>
  )


  if (block.type === "qa_toggle") {
    const onColor = "#16a34a", offColor = "#dc2626"
    const color = toggleState ? onColor : offColor
    const bg = toggleState ? "#f0fdf4" : "#fef2f2"
    const border = toggleState ? "#bbf7d0" : "#fecaca"
    return (
      <div style={rowStyle} onClick={onSelect} data-block-index={index}>
        <span />
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#888", fontStyle: "italic" }}>QA Toggle</span>
          <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, border: `0.5px solid ${border}`, borderRadius: 4, padding: "1px 6px" }}>
            {toggleState ? "ON" : "OFF"}
          </span>
        </span>
        <span />
        <span />
        {insertBtn}
      </div>
    )
  }

  function playFrom() {
    if (!audioRef.current) return
    audioRef.current.currentTime = block.start_ms / 1000
    audioRef.current.play()
  }

  return (
    <div style={rowStyle} onClick={onSelect} data-block-index={index}>
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

      <span style={{ fontSize: 12, paddingTop: 2, ...(ROLE_STYLE[role] || {}) }}>
        {role}
      </span>

      <div>
        {isEditing ? (
          <textarea
            ref={textareaRef}
            autoFocus
            value={draft}
            onChange={e => onDraftChange(e.target.value)}
            onBlur={onConfirmEdit}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onConfirmEdit() }
              if (e.key === "Escape") onCancelEdit()
            }}
            style={{
              width: "100%", fontSize: 13, lineHeight: 1.6, fontFamily: "inherit",
              padding: "4px 8px", borderRadius: 6, border: "0.5px solid #185FA5",
              resize: "none", boxSizing: "border-box", overflow: "hidden"
            }}
          />
        ) : (
          <span
            onClick={onStartEdit}
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
        {insertBtn}
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
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [editingIndex, setEditingIndex] = useState(null)
  const [draft, setDraft] = useState("")
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const audioRef = useRef(null)
  const blocksRef = useRef(null)
  const selectedIndexRef = useRef(0)
  const cancelledRef = useRef(false)
  const textareaRef = useRef(null)
  const deleteBlockRef = useRef(null)
  const insertBlockRef = useRef(null)
  useEffect(() => { blocksRef.current = blocks }, [blocks])
  useEffect(() => { selectedIndexRef.current = selectedIndex }, [selectedIndex])
  useEffect(() => {
    if (blocks) setSelectedIndex(i => Math.min(i, Math.max(0, blocks.length - 1)))
  }, [blocks])
  useEffect(() => {
    if (editingIndex !== null && textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px"
    }
  }, [editingIndex, draft])

  useEffect(() => {
    function handleKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex(i => Math.max(0, i - 1))
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex(i => Math.min((blocksRef.current?.length ?? 1) - 1, i + 1))
      } else if (e.key === "Enter") {
        const idx = selectedIndexRef.current
        const block = blocksRef.current?.[idx]
        if (block?.type === "utterance") { e.preventDefault(); cancelledRef.current = false; setDraft(block.text); setEditingIndex(idx) }
      } else if (e.key === "x") {
        deleteBlockRef.current?.(selectedIndexRef.current)
      } else if (e.key === "b") {
        insertBlockRef.current?.(selectedIndexRef.current, "utterance")
      } else if (e.key === "n") {
        insertBlockRef.current?.(selectedIndexRef.current, "qa_toggle")
      } else if (!audioRef.current) {
        return
      } else if (e.key === "p") {
        const block = blocksRef.current?.[selectedIndexRef.current]
        if (block?.start_ms != null) {
          audioRef.current.currentTime = block.start_ms / 1000
          audioRef.current.play()
        }
      } else if (e.key === " ") {
        e.preventDefault()
        audioRef.current.paused ? audioRef.current.play() : audioRef.current.pause()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 4)
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 4)
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [])

  useEffect(() => {
    if (!blocks) return
    const el = document.querySelector(`[data-block-index="${selectedIndex}"]`)
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selectedIndex])

  useEffect(() => {
    async function load() {
      const headers = await authHeaders()
      fetch(`${API}/jobs/${jobId}`, { headers })
        .then(r => r.json())
        .then(data => {
          setBlocks(data.blocks.map(b => b.type ? b : { ...b, type: "utterance" }))
          setLoading(false)
        })
      fetch(`${API}/jobs/${jobId}/audio-available`, { headers })
        .then(r => r.json())
        .then(data => setAudioAvailable(data.available))
    }
    load()
  }, [jobId])

  function openRenameOne(index) {
    setRenameTarget({ index, mode: "one" })
    setRenameValue(blocks[index].speaker)
  }

  function openRenameAll(speaker) {
    setRenameTarget({ speaker, mode: "all" })
    setRenameValue(speaker)
  }

  async function applyRename() {
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
    const headers = await authHeaders()
    fetch(`${API}/jobs/${jobId}/blocks`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: updated }),
    })
  }

  function startEditBlock(index) {
    cancelledRef.current = false
    setDraft(blocks[index].text)
    setEditingIndex(index)
  }

  function cancelEdit() {
    cancelledRef.current = true
    setEditingIndex(null)
  }

  function confirmEdit() {
    if (cancelledRef.current) return
    cancelledRef.current = true
    updateText(editingIndex, draft)
    setEditingIndex(null)
  }

  async function updateText(index, newText) {
    const updated = blocks.map((b, i) => i === index ? { ...b, text: newText } : b)
    setBlocks(updated)
    const headers = await authHeaders()
    fetch(`${API}/jobs/${jobId}/blocks`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: updated }),
    })
  }

  async function deleteBlock(index) {
    const cur = blocksRef.current
    if (!cur) return
    const updated = cur.filter((_, i) => i !== index)
    setBlocks(updated)
    const headers = await authHeaders()
    fetch(`${API}/jobs/${jobId}/blocks`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: updated }),
    })
  }

  async function insertBlock(afterIndex, type) {
    const cur = blocksRef.current
    if (!cur) return
    let newBlock
    if (type === "qa_toggle") {
      newBlock = { type: "qa_toggle" }
    } else {
      newBlock = { ...cur[afterIndex], type: "utterance" }
    }
    const updated = [
      ...cur.slice(0, afterIndex + 1),
      newBlock,
      ...cur.slice(afterIndex + 1)
    ]
    setBlocks(updated)
    setInsertMenuIndex(null)
    const headers = await authHeaders()
    fetch(`${API}/jobs/${jobId}/blocks`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: updated }),
    })
  }

  deleteBlockRef.current = deleteBlock
  insertBlockRef.current = insertBlock

  function saveTranscript() {
    const { roles } = computeBlockDisplay(blocks)
    const lines = []
    let prevRole = ""
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      const role = roles[i]
      if (b.type !== "utterance") continue
      if (role === "Q" && prevRole === "") lines.push(`BY ${b.speaker}:`)
      const text = normalizeSentenceSpacing(b.text)
      lines.push(role ? `\t\t${role}:  ${text}` : `\t${b.speaker}:  ${text}`)
      prevRole = role
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${jobId}_transcript.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const { roles, toggleStates, sectionIndices } = loading ? { roles: [], toggleStates: [], sectionIndices: [] } : computeBlockDisplay(blocks)

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

      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 16px", marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
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
          display: "grid", gridTemplateColumns: "80px 160px 40px 1fr auto",
          gap: 12, padding: "8px 16px",
          background: "#185FA5", color: "white", fontSize: 11,
          fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase"
        }}>
          <span>Time</span>
          <span>Speaker</span>
          <span>Role</span>
          <span>Text</span>
          <span></span>
        </div>

        {blocks.map((block, i) => (
          <BlockRow
            key={i}
            index={i}
            block={block}
            role={roles[i]}
            toggleState={toggleStates[i]}
            sectionIndex={sectionIndices[i]}
            onRenameOne={openRenameOne}
            onRenameAll={openRenameAll}
            audioRef={audioRef}
            audioAvailable={audioAvailable}
            insertMenuOpen={insertMenuIndex === i}
            onOpenInsertMenu={() => setInsertMenuIndex(i)}
            onCloseInsertMenu={() => setInsertMenuIndex(null)}
            onInsert={type => insertBlock(i, type)}
            onDelete={() => deleteBlock(i)}
            isSelected={selectedIndex === i}
            isEditing={editingIndex === i}
            draft={draft}
            textareaRef={editingIndex === i ? textareaRef : null}
            onSelect={() => setSelectedIndex(i)}
            onStartEdit={() => startEditBlock(i)}
            onConfirmEdit={confirmEdit}
            onCancelEdit={cancelEdit}
            onDraftChange={setDraft}
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

      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        {shortcutsOpen && (
          <div style={{ background: "white", border: "0.5px solid #e0e0e0", borderRadius: 10, padding: "12px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#888", marginBottom: 10 }}>Shortcuts</div>
            {SHORTCUTS.map(({ keys, desc }) => (
              <div key={keys} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 6 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 7px", color: "#444", whiteSpace: "nowrap" }}>{keys}</span>
                <span style={{ fontSize: 12, color: "#555" }}>{desc}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setShortcutsOpen(o => !o)}
          title="Keyboard shortcuts"
          style={{ width: 36, height: 36, borderRadius: "50%", border: "0.5px solid #ddd", background: "white", cursor: "pointer", fontSize: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          ⌨
        </button>
      </div>
    </div>
  )
}
