import { useState, useRef, useEffect } from "react"
import { BrandLogo } from "./App"

const API = import.meta.env.VITE_API_URL

const ABBREVS = /\b(Mr|Mrs|Ms|Dr|Jr|Sr|vs|etc|No|St)\.  /gi

const SHORTCUTS = [
  { keys: "Tab",        desc: "Play / Pause" },
  { keys: "Scroll Lock (hold)", desc: "Play while held, rewind 4s on release" },
  { keys: "Ctrl+[ ]",   desc: "Skip ±4 seconds" },
  { keys: "Ctrl+- +",   desc: "Slow down / speed up" },
  { keys: "↑ ↓",       desc: "Move selection" },
  { keys: "Enter",      desc: "New utterance at cursor" },
  { keys: "Shift+Enter", desc: "New line within block" },
  { keys: "F2",         desc: "Select speaker" },
  { keys: "Backspace",  desc: "At start: merge into previous block; when empty: delete block" },
  { keys: "Ctrl+Z",     desc: "Undo" },
  { keys: "Ctrl+Y",     desc: "Redo" },
]

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5]

// Meta blocks store their full expanded text in `text`, edited directly on the Review page.
// `template` seeds that text on insert, and upgrades legacy blocks that only stored `fields`.
// Witness blocks: the first line is the witness name (centered + underlined in the .docx).
const META_BLOCKS = {
  witness_sworn: {
    label: "Witness Sworn",
    fields: ["NAME"],
    template: f => {
      const name = (f.NAME || "").trim().toUpperCase() || "______"
      return `${name}\nWas thereupon called as a witness on behalf of the ____; and, having been first duly sworn, was examined and testified as follows:`
    },
  },
  witness_sworn_gj: {
    label: "Witness Sworn (GJ)",
    fields: ["NAME"],
    template: f => {
      const name = (f.NAME || "").trim().toUpperCase() || "______"
      return `${name}\nWas thereupon called as a witness; and, having been first duly sworn, was examined and testified as follows:`
    },
  },
  pause_in_proceedings: {
    label: "Pause in Proceedings",
    fields: ["START", "END"],
    template: f => `(Pause in proceedings, ${f.START || "___"} - ${f.END || "___"})`,
  },
  whispered_discussion: {
    label: "Whispered Discussion",
    fields: ["START", "END"],
    template: f => `(Whispered discussion, off the record, ${f.START || "___"} - ${f.END || "___"})`,
  },
  exhibit_received: {
    label: "Exhibit Received",
    fields: ["ROLE", "NUMBER"],
    template: f => `(${f.ROLE || "___"}'s Exhibit No. ${f.NUMBER || "___"} received.)`,
  },
  header: {
    label: "Header",
    fields: ["TEXT"],
    template: f => f.TEXT || "",
  },
}

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

// segmentMap entries carry a "floating" local_start_ms (see main.py's read_tloc_local_ms):
// the literal recorded wall-clock digits reinterpreted as UTC, so UTC getters here
// reproduce those same digits regardless of the viewer's own timezone.
function msToRealClock(ms, segmentMap) {
  const seg = segmentMap.find(s => ms < s.end_ms) || segmentMap[segmentMap.length - 1]
  const d = new Date(seg.local_start_ms + (ms - seg.start_ms))
  const h24 = d.getUTCHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const ampm = h24 < 12 ? "AM" : "PM"
  return `${String(h12).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}:${String(d.getUTCSeconds()).padStart(2,"0")} ${ampm}`
}

// Which source mic channels went into the mono mixdown sent for transcription (see main.py's merge_audio_files)
function ChannelMixIndicator({ channelMix }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: "#aaa", marginRight: 4 }}>Mixdown tracks</span>
      {channelMix.map(ch => (
        <span
          key={ch.channel}
          title={`Track ${ch.channel}: ${ch.used ? "used" : "excluded"} (loudest ${ch.rms_peak_db} dB, average ${ch.rms_level_db} dB)`}
          style={{
            fontSize: 11, minWidth: 22, padding: "2px 6px", borderRadius: 4, textAlign: "center", cursor: "default",
            border: ch.used ? "1.5px solid #16a34a" : "1px solid #d0d0d0",
            background: ch.used ? "#dcfce7" : "#f5f5f5",
            color: ch.used ? "#065f46" : "#aaa", fontWeight: ch.used ? 600 : 400,
            textDecoration: ch.used ? "none" : "line-through",
          }}
        >{ch.channel}</span>
      ))}
    </div>
  )
}

function focusElementAt(el, pos) {
  if (!el) return false
  el.focus()
  el.setSelectionRange(pos, pos)
  return true
}

function focusBlockText(index, selector) {
  focusElementAt(document.querySelector(`[data-block-index="${index}"] ${selector}`), 0)
}

function InsertMenu({ onInsert, onDelete, onClose, onToggleQa, qaToggleLabel }) {
  const itemStyle = { display: "block", width: "100%", textAlign: "left", padding: "7px 14px", fontSize: 12, background: "none", border: "none", cursor: "pointer" }
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={onClose} />
      <div style={{
        position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 10,
        background: "white", border: "1px solid #b0b0b0", borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)", padding: "4px 0", minWidth: 160
      }}>
        {onToggleQa && (
          <>
            <button onMouseDown={e => e.preventDefault()} onClick={onToggleQa} style={{ ...itemStyle, color: "#222" }}
              onMouseEnter={e => e.target.style.background = "#f5f5f5"}
              onMouseLeave={e => e.target.style.background = "none"}>
              {qaToggleLabel}
            </button>
            <div style={{ borderTop: "1px solid #f0f0f0", margin: "4px 0" }} />
          </>
        )}
        {Object.entries(META_BLOCKS).map(([type, meta]) => (
          <button key={type} onMouseDown={e => e.preventDefault()} onClick={() => onInsert(type)} style={{ ...itemStyle, color: "#222" }}
            onMouseEnter={e => e.target.style.background = "#f5f5f5"}
            onMouseLeave={e => e.target.style.background = "none"}>
            Insert {meta.label}
          </button>
        ))}
        <div style={{ borderTop: "1px solid #f0f0f0", margin: "4px 0" }} />
        <button onMouseDown={e => e.preventDefault()} onClick={onDelete} style={{ ...itemStyle, color: "#ef4444" }}
          onMouseEnter={e => e.target.style.background = "#fef2f2"}
          onMouseLeave={e => e.target.style.background = "none"}>
          Delete
        </button>
      </div>
    </>
  )
}

const ROLE_STYLE = {
  Q: { color: "#1a4480", fontWeight: 600 },
  A: { color: "#dc2626", fontWeight: 600 },
}

function computeBlockDisplay(blocks) {
  let qaOn = false, next = "Q", sectionIdx = 0
  const roles = [], sectionIndices = []
  for (const b of blocks) {
    if (b.type === "utterance") {
      const marked = !!b.qa
      if (marked && !qaOn) next = "Q"
      qaOn = marked
      if (qaOn) {
        const r = next; next = r === "Q" ? "A" : "Q"; roles.push(r)
      } else {
        roles.push("")
      }
    } else {
      roles.push("")
    }
    sectionIndices.push(sectionIdx++)
  }
  return { roles, sectionIndices }
}

function UtteranceText({ index, text, onTextChange, onTextBlur, onSplitHere, onMergeIntoPrevious, onFocusNext, onFocusPrev, onSelect, textareaRef }) {
  const mirrorRef = useRef(null)
  const measureRef = useRef(null)

  const sharedStyle = {
    fontSize: 13, lineHeight: 1.6, fontFamily: "inherit",
    padding: "4px 8px", border: "1px solid transparent",
    boxSizing: "border-box", gridArea: "1 / 1 / 2 / 2", width: "100%",
  }

  function lineCountUpTo(cursorPos) {
    if (!measureRef.current) return 0
    measureRef.current.textContent = text.slice(0, cursorPos) + "​"
    const cs = getComputedStyle(measureRef.current)
    const lineHeightPx = parseFloat(cs.lineHeight) || 1
    const paddingV = (parseFloat(cs.paddingTop) || 0) * 2
    return Math.round((measureRef.current.scrollHeight - paddingV) / lineHeightPx)
  }

  function totalLineCount() {
    if (!mirrorRef.current) return 0
    const cs = getComputedStyle(mirrorRef.current)
    const lineHeightPx = parseFloat(cs.lineHeight) || 1
    const paddingV = (parseFloat(cs.paddingTop) || 0) * 2
    return Math.round((mirrorRef.current.scrollHeight - paddingV) / lineHeightPx)
  }

  return (
    <div style={{ display: "grid" }}>
      <div ref={mirrorRef} style={{
        ...sharedStyle,
        whiteSpace: "pre-wrap", wordWrap: "break-word", visibility: "hidden", alignSelf: "start",
      }}>
        {text + "​"}
      </div>
      <div ref={measureRef} style={{
        ...sharedStyle,
        whiteSpace: "pre-wrap", wordWrap: "break-word", visibility: "hidden", alignSelf: "start",
      }} />
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => onTextChange(e.target.value)}
        onBlur={onTextBlur}
        onFocus={onSelect}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey && onSplitHere) {
            e.preventDefault()
            const cursor = e.target.selectionStart
            onSplitHere(index, e.target.value.slice(0, cursor), e.target.value.slice(cursor))
          } else if ((e.key === "Backspace" || e.key === "Delete") && onMergeIntoPrevious) {
            const { selectionStart: s, selectionEnd: en } = e.target
            const atStart = e.key === "Backspace" && s === en && s === 0
            const nextText = s === en
              ? (e.key === "Backspace" ? text.slice(0, Math.max(0, s - 1)) + text.slice(s) : text.slice(0, s) + text.slice(s + 1))
              : text.slice(0, s) + text.slice(en)
            if (atStart || nextText === "") {
              e.preventDefault()
              onMergeIntoPrevious(index, atStart ? text : nextText)
            }
          } else if (e.key === "ArrowDown") {
            if (lineCountUpTo(e.target.selectionStart) >= totalLineCount()) {
              e.preventDefault()
              onFocusNext()
            }
          } else if (e.key === "ArrowUp") {
            if (lineCountUpTo(e.target.selectionStart) <= 1) {
              e.preventDefault()
              onFocusPrev()
            }
          }
        }}
        style={{
          ...sharedStyle,
          height: "100%", color: "#222",
          borderRadius: 3, background: "transparent",
          resize: "none", overflow: "hidden", outline: "none",
          caretColor: "#dc2626",
        }}
      />
    </div>
  )
}

function BlockRow({ block, index, role, sectionIndex, isSelected, onSelect, onTextChange, onTextBlur, onRenameOne, onSplitHere, onMergeIntoPrevious, onFocusNext, onFocusPrev, audioRef, audioAvailable, insertMenuOpen, onOpenInsertMenu, onInsert, onCloseInsertMenu, onDelete, onToggleQa, segmentMap, textareaRef }) {
  const rowBg = isSelected ? "#dcfce7" : (sectionIndex % 2 === 0 ? "white" : "#fafafa")

  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "110px 160px 40px 1fr",
    gap: 12,
    padding: "10px 16px",
    borderBottom: "1px solid #f0f0f0",
    alignItems: "start",
    background: rowBg,
    cursor: "default",
    position: "relative",
    ...(isSelected ? {
      boxShadow: "inset 3px 0 0 #16a34a",
      zIndex: 1,
    } : {})
  }

  const iconBtnStyle = {
    fontSize: 13, width: 26, height: 26, borderRadius: 3, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0
  }

  function renderInsertBtn(includeQaToggle) {
    return (
      <div style={{ position: "relative" }}>
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={e => { e.stopPropagation(); insertMenuOpen ? onCloseInsertMenu() : onOpenInsertMenu() }}
          title="Insert below"
          style={{ ...iconBtnStyle, border: "1px solid #e0e0e0", background: "white", color: "#bbb" }}
        >
          ☰
        </button>
        {insertMenuOpen && (
          <InsertMenu
            onInsert={onInsert}
            onDelete={() => { onDelete(); onCloseInsertMenu() }}
            onClose={onCloseInsertMenu}
            onToggleQa={includeQaToggle ? () => { onToggleQa(index); onCloseInsertMenu() } : null}
            qaToggleLabel="Toggle Q/A"
          />
        )}
      </div>
    )
  }

  const meta = META_BLOCKS[block.type]
  if (meta) {
    return (
      <div
        style={rowStyle}
        onClick={() => { onSelect(); focusBlockText(index, "textarea") }}
        data-block-index={index}
      >
        <div>{renderInsertBtn(false)}</div>
        <div style={{ gridColumn: "2 / -1" }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", fontStyle: "italic", marginBottom: 4 }}>
            {meta.label}
          </div>
          <UtteranceText
            index={index}
            text={block.text ?? ""}
            onTextChange={value => onTextChange(index, value)}
            onTextBlur={onTextBlur}
            onFocusNext={onFocusNext}
            onFocusPrev={onFocusPrev}
            onSelect={onSelect}
          />
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
    <div
      style={rowStyle}
      onClick={() => { onSelect(); focusBlockText(index, "textarea") }}
      data-block-index={index}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12, color: "#888" }}>
          {segmentMap ? msToRealClock(block.start_ms, segmentMap) : msToTimecode(block.start_ms)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={playFrom}
            disabled={!audioAvailable}
            title={audioAvailable ? "Play from here" : "No audio available"}
            style={{
              ...iconBtnStyle,
              border: `1px solid ${audioAvailable ? "#d1fae5" : "#dadada"}`,
              background: audioAvailable ? "#f0fdf4" : "#f9f9f9",
              color: audioAvailable ? "#065f46" : "#bbb",
              cursor: audioAvailable ? "pointer" : "not-allowed",
            }}
          >
            ▶
          </button>
          {renderInsertBtn(true)}
        </div>
      </div>

      <span
        onClick={e => { e.stopPropagation(); onRenameOne(index) }}
        style={{ fontSize: 12, fontWeight: 500, color: "#1a4480", cursor: "pointer", lineHeight: 1.3 }}
        title="Rename speaker"
      >
        {block.speaker}
      </span>

      <span style={{ fontSize: 12, paddingTop: 3, ...(ROLE_STYLE[role] || {}) }}>
        {role}
      </span>

      <div style={{ minHeight: 28 }} onClick={e => e.stopPropagation()}>
        <UtteranceText
          index={index}
          text={block.text}
          onTextChange={value => onTextChange(index, value)}
          onTextBlur={onTextBlur}
          onSplitHere={onSplitHere}
          onMergeIntoPrevious={onMergeIntoPrevious}
          onFocusNext={onFocusNext}
          onFocusPrev={onFocusPrev}
          onSelect={onSelect}
          textareaRef={textareaRef}
        />
      </div>
    </div>
  )
}

export default function ReviewPage({ jobId, onBack, authHeaders }) {
  const [blocks, setBlocks] = useState(null)
  const [jobFilename, setJobFilename] = useState("")
  const [segmentMap, setSegmentMap] = useState(null)
  const [channelMix, setChannelMix] = useState(null)
  const [loading, setLoading] = useState(true)
  const [audioAvailable, setAudioAvailable] = useState(true)
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameOriginal, setRenameOriginal] = useState(null)
  const [renameValue, setRenameValue] = useState("")
  const [renameEditing, setRenameEditing] = useState(false)
  const [insertMenuIndex, setInsertMenuIndex] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [menuOpen, setMenuOpen] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const audioRef = useRef(null)
  const blocksRef = useRef(null)
  const selectedIndexRef = useRef(0)
  const saveTimerRef = useRef(null)
  const firstUtteranceRef = useRef(null)
  const modalRef = useRef(null)
  const renameTargetRef = useRef(null)
  const historyRef = useRef({ past: [], future: [] })
  const burstRef = useRef(null)
  const burstTimerRef = useRef(null)
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = playbackRate }, [playbackRate])
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTimeUpdate = () => setCurrentMs(el.currentTime * 1000)
    el.addEventListener("timeupdate", onTimeUpdate)
    return () => el.removeEventListener("timeupdate", onTimeUpdate)
  }, [audioAvailable, loading])
  useEffect(() => { blocksRef.current = blocks }, [blocks])
  useEffect(() => { renameTargetRef.current = renameTarget }, [renameTarget])
  useEffect(() => { if (renameTarget && modalRef.current) modalRef.current.focus() }, [renameTarget])
  useEffect(() => { selectedIndexRef.current = selectedIndex }, [selectedIndex])
  useEffect(() => {
    if (blocks) setSelectedIndex(i => Math.min(i, Math.max(0, blocks.length - 1)))
  }, [blocks])

  useEffect(() => {
    if (!loading) firstUtteranceRef.current?.focus()
  }, [loading])

  useEffect(() => {
    function handleKeyUp(e) {
      if (e.key === "ScrollLock" && audioRef.current) {
        e.preventDefault()
        audioRef.current.pause()
        audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 4)
      }
    }
    function handleKey(e) {
      if (e.key === "ScrollLock" && audioRef.current) {
        e.preventDefault()
        if (!e.repeat) audioRef.current.play()
        return
      }
      if (renameTargetRef.current) return
      if (e.key === "F2") {
        e.preventDefault()
        const idx = selectedIndexRef.current
        const block = blocksRef.current?.[idx]
        if (block?.type === "utterance") openSpeakerPicker(idx, block.speaker)
        return
      }
      if (e.key === "Tab") {
        e.preventDefault()
        if (audioRef.current) audioRef.current.paused ? audioRef.current.play() : audioRef.current.pause()
        return
      }
      if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault()
        undo()
        return
      }
      if (e.ctrlKey && (e.key === "y" || e.key === "Y")) {
        e.preventDefault()
        redo()
        return
      }
      if (e.ctrlKey && (e.key === "[" || e.key === "]") && audioRef.current) {
        e.preventDefault()
        const delta = e.key === "]" ? 4 : -4
        audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration, audioRef.current.currentTime + delta))
        return
      }
      if (e.ctrlKey && (e.key === "+" || e.key === "=" || e.key === "-")) {
        e.preventDefault()
        if (e.key === "-") {
          setPlaybackRate(r => SPEED_PRESETS[Math.max(0, SPEED_PRESETS.indexOf(r) - 1)])
        } else {
          setPlaybackRate(r => SPEED_PRESETS[Math.min(SPEED_PRESETS.length - 1, SPEED_PRESETS.indexOf(r) + 1)])
        }
        return
      }
      const tag = document.activeElement?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.key === "ArrowUp") {
        e.preventDefault()
        focusAdjacentBlock(selectedIndexRef.current, -1)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        focusAdjacentBlock(selectedIndexRef.current, 1)
      }
    }
    document.addEventListener("keydown", handleKey)
    document.addEventListener("keyup", handleKeyUp)
    return () => {
      document.removeEventListener("keydown", handleKey)
      document.removeEventListener("keyup", handleKeyUp)
    }
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
          let qaOn = false
          const migrated = []
          for (const raw of data.blocks) {
            let b = !raw.type ? { ...raw, type: "utterance" } : raw
            if (b.type === "qa_toggle") { qaOn = !qaOn; continue }
            if (META_BLOCKS[b.type] && !b.fields) {
              const { text, ...rest } = b
              b = { ...rest, fields: { [META_BLOCKS[b.type].fields[0]]: text || "" } }
            }
            if (META_BLOCKS[b.type] && b.text === undefined) {
              const { fields, ...rest } = b
              b = { ...rest, text: META_BLOCKS[b.type].template(fields || {}) }
            }
            if (b.type === "utterance" && qaOn) b = { ...b, qa: true }
            migrated.push(b)
          }
          setBlocks(migrated)
          setJobFilename(data.filename ? data.filename.replace(/\.[^.]+$/, "") : jobId)
          setSegmentMap(data.segment_map || null)
          setChannelMix(data.channel_mix || null)
          setLoading(false)
        })
      fetch(`${API}/jobs/${jobId}/audio-available`, { headers })
        .then(r => r.json())
        .then(data => setAudioAvailable(data.available))
    }
    load()
  }, [jobId])

  async function putBlocks(updated) {
    const headers = await authHeaders()
    fetch(`${API}/jobs/${jobId}/blocks`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: updated }),
    })
  }

  const HISTORY_LIMIT = 50

  function pushPast(snapshot) {
    const h = historyRef.current
    h.past.push(snapshot)
    if (h.past.length > HISTORY_LIMIT) h.past.shift()
    h.future = []
  }

  function flushBurst() {
    if (burstTimerRef.current) { clearTimeout(burstTimerRef.current); burstTimerRef.current = null }
    if (burstRef.current) {
      pushPast(burstRef.current)
      burstRef.current = null
    }
  }

  // Call before every blocks-mutating action. burst=true coalesces a run of
  // continuous edits (typing) into a single undo step instead of one per keystroke.
  function recordHistory(burst) {
    const before = blocksRef.current
    if (burst) {
      if (!burstRef.current) burstRef.current = before
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current)
      burstTimerRef.current = setTimeout(flushBurst, 1000)
    } else {
      flushBurst()
      pushPast(before)
    }
  }

  function undo() {
    flushBurst()
    const h = historyRef.current
    if (h.past.length === 0) return
    const prev = h.past.pop()
    h.future.push(blocksRef.current)
    if (h.future.length > HISTORY_LIMIT) h.future.shift()
    setBlocks(prev)
    putBlocks(prev)
  }

  function redo() {
    const h = historyRef.current
    if (h.future.length === 0) return
    const next = h.future.pop()
    h.past.push(blocksRef.current)
    if (h.past.length > HISTORY_LIMIT) h.past.shift()
    setBlocks(next)
    putBlocks(next)
  }

  function openSpeakerPicker(index, speaker) {
    setRenameTarget({ index })
    setRenameOriginal(speaker)
    setRenameValue(speaker)
    setRenameEditing(false)
  }

  function openRenameOne(index) {
    openSpeakerPicker(index, blocks[index].speaker)
  }

  function applyRenameOne() {
    const name = renameValue.trim().toUpperCase()
    if (!name) return
    recordHistory(false)
    const updated = blocks.map((b, i) => {
      if (b.type !== "utterance") return b
      if (renameOriginal && b.speaker === renameOriginal) return { ...b, speaker: name }
      if (i === renameTarget.index) return { ...b, speaker: name }
      return b
    })
    setBlocks(updated)
    setRenameTarget(null)
    putBlocks(updated)
  }

  function saveBlocksNow() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    if (!blocksRef.current) return
    putBlocks(blocksRef.current)
  }

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(saveBlocksNow, 1000)
  }

  function handleTextChange(index, value) {
    recordHistory(true)
    setBlocks(prev => prev.map((b, i) => i === index ? { ...b, text: value } : b))
    scheduleSave()
  }

  function focusAdjacentBlock(fromIndex, direction) {
    const cur = blocksRef.current
    const target = fromIndex + direction
    if (!cur || target < 0 || target >= cur.length) return
    setSelectedIndex(target)

    const el = document.querySelector(`[data-block-index="${target}"] textarea`)
    const landed = el && focusElementAt(el, direction > 0 ? 0 : el.value.length)
    if (!landed) document.activeElement?.blur()
  }

  function deleteBlock(index) {
    const cur = blocksRef.current
    if (!cur) return
    recordHistory(false)
    const updated = cur.filter((_, i) => i !== index)
    setBlocks(updated)
    putBlocks(updated)
  }

  function deleteBlockMerge(index) {
    const cur = blocksRef.current
    if (!cur) return
    recordHistory(false)
    const updated = cur.filter((_, i) => i !== index)
    setBlocks(updated)
    putBlocks(updated)
    setTimeout(() => {
      if (index > 0) focusAdjacentBlock(index, -1)
      else if (updated.length) { setSelectedIndex(0); focusBlockText(0, "textarea") }
    }, 0)
  }

  function mergeIntoPrevious(index, currentText) {
    const cur = blocksRef.current
    if (!cur) return
    const prev = index > 0 ? cur[index - 1] : null
    if (!prev || prev.type !== "utterance") {
      if (currentText === "") deleteBlockMerge(index)
      return
    }
    recordHistory(false)
    const joinPos = prev.text.length
    const updated = cur
      .map((b, i) => i === index - 1 ? { ...b, text: b.text + currentText } : b)
      .filter((_, i) => i !== index)
    setBlocks(updated)
    putBlocks(updated)
    setTimeout(() => {
      setSelectedIndex(index - 1)
      focusElementAt(document.querySelector(`[data-block-index="${index - 1}"] textarea`), joinPos)
    }, 0)
  }

  function guessOtherSpeaker(allBlocks, index) {
    const current = allBlocks[index]?.speaker
    for (let i = index - 1; i >= 0; i--) {
      const b = allBlocks[i]
      if (b.type === "utterance" && b.speaker !== current) return b.speaker
    }
    return "UNKNOWN SPEAKER"
  }

  function splitUtterance(index, beforeText, afterText) {
    recordHistory(false)
    const speaker = guessOtherSpeaker(blocks, index)
    const newBlock = { type: "utterance", speaker, text: afterText, qa: blocks[index]?.qa, start_ms: blocks[index]?.end_ms ?? 0, end_ms: blocks[index]?.end_ms ?? 0 }
    const updated = blocks.map((b, i) => i === index ? { ...b, text: beforeText } : b)
    const withNew = [...updated.slice(0, index + 1), newBlock, ...updated.slice(index + 1)]
    setBlocks(withNew)
    setSelectedIndex(index + 1)
    putBlocks(withNew)
    setTimeout(() => focusBlockText(index + 1, "textarea"), 0)
  }

  function toggleQaFrom(index) {
    const cur = blocksRef.current
    if (!cur) return
    recordHistory(false)
    const turnOn = !cur[index].qa
    const updated = cur.map((b, i) => {
      if (i < index || b.type !== "utterance") return b
      return { ...b, qa: turnOn }
    })
    setBlocks(updated)
    putBlocks(updated)
  }

  function insertBlock(afterIndex, type) {
    const cur = blocksRef.current
    if (!cur) return
    recordHistory(false)
    let newBlock
    if (META_BLOCKS[type]) {
      newBlock = { type, text: META_BLOCKS[type].template({}), start_ms: cur[afterIndex]?.end_ms ?? 0, end_ms: cur[afterIndex]?.end_ms ?? 0 }
    } else {
      newBlock = { type: "utterance", speaker: "UNKNOWN SPEAKER", text: "", start_ms: cur[afterIndex]?.end_ms ?? 0, end_ms: cur[afterIndex]?.end_ms ?? 0 }
    }
    const updated = [
      ...cur.slice(0, afterIndex + 1),
      newBlock,
      ...cur.slice(afterIndex + 1)
    ]
    setBlocks(updated)
    setInsertMenuIndex(null)
    putBlocks(updated)
  }

  function saveTranscript() {
    const { roles } = computeBlockDisplay(blocks)
    const lines = []
    let prevRole = ""
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      const role = roles[i]
      if (META_BLOCKS[b.type]) {
        const text = b.text ?? ""
        if (text) {
          lines.push("")
          for (const line of text.split("\n")) lines.push(line)
          lines.push("")
        }
        prevRole = ""
        continue
      }
      if (b.type !== "utterance") continue
      if (role === "Q" && prevRole === "") lines.push(`BY ${b.speaker}:`)
      const text = normalizeSentenceSpacing(b.text)
      lines.push(role ? `\t${role}:  ${text}` : `\t\t${b.speaker}:  ${text}`)
      prevRole = role
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${jobFilename}_transcript.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function saveDocx() {
    const headers = await authHeaders()
    const res = await fetch(`${API}/jobs/${jobId}/docx`, { headers })
    if (!res.ok) { alert("Failed to generate .docx"); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${jobFilename}_transcript.docx`
    a.click()
    URL.revokeObjectURL(url)
  }

  function saveBlob() {
    const text = blocks
      .filter(b => b.type === "utterance")
      .map(b => normalizeSentenceSpacing(b.text))
      .join("  ")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${jobFilename}_blob.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const { roles, sectionIndices } = loading ? { roles: [], sectionIndices: [] } : computeBlockDisplay(blocks)

  if (loading) return (
    <div style={{ fontFamily: "'Public Sans', Arial, sans-serif", maxWidth: "min(1400px, 92vw)", margin: "48px auto", padding: "0 20px" }}>
      <p style={{ color: "#888" }}>Loading transcript…</p>
    </div>
  )

  const firstUtteranceIndex = blocks.findIndex(b => b.type === "utterance")

  return (
    <div style={{ fontFamily: "'Public Sans', Arial, sans-serif" }}>
      <div style={{ background: "#0d2c4f", height: 8 }} />
      <div style={{ background: "#1a4480", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BrandLogo onClick={onBack} />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={onBack}
              style={{
                fontSize: 12, padding: "6px 12px", borderRadius: 3,
                border: "1px solid rgba(255,255,255,0.6)", background: "transparent",
                color: "white", cursor: "pointer"
              }}
            >
              Home
            </button>
            <div style={{ position: "relative" }}>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => setMenuOpen(v => !v)}
                aria-label="Menu"
                style={{
                  width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
                  border: "1px solid rgba(255,255,255,0.5)", background: "transparent", borderRadius: 3, cursor: "pointer"
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              {menuOpen && (
                <div style={{
                  position: "absolute", top: 38, right: 0, background: "white", border: "1px solid #c9c9c9",
                  borderRadius: 3, boxShadow: "0 4px 10px rgba(0,0,0,0.15)", padding: 12, minWidth: 170, zIndex: 100,
                  display: "flex", flexDirection: "column", gap: 8
                }}>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => { saveBlob(); setMenuOpen(false) }} style={{ fontSize: 13, padding: "7px 10px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", color: "#555", cursor: "pointer", textAlign: "left" }}>
                    💾 Save blob
                  </button>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => { saveDocx(); setMenuOpen(false) }} style={{ fontSize: 13, padding: "7px 10px", borderRadius: 4, border: "1px solid #1a4480", background: "white", color: "#1a4480", cursor: "pointer", fontWeight: 600, textAlign: "left" }}>
                    💾 Save .docx
                  </button>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => { saveTranscript(); setMenuOpen(false) }} style={{ fontSize: 13, padding: "7px 10px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", color: "#555", cursor: "pointer", textAlign: "left" }}>
                    💾 Save .txt
                  </button>
                </div>
              )}
            </div>
          </div>
      </div>

      <div style={{ maxWidth: "min(1400px, 92vw)", margin: "32px auto 48px", padding: "0 20px", textAlign: "left" }}>

      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "white", border: "1px solid #c9c9c9", borderRadius: 4, padding: "12px 16px", marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
        {channelMix && <ChannelMixIndicator channelMix={channelMix} />}
{audioAvailable
  ? <audio
      ref={audioRef}
      controls
      src={`${API}/jobs/${jobId}/audio`}
      style={{ width: "100%" }}
    />
  : <div style={{ fontSize: 13, color: "#aaa", padding: "8px 0" }}>Audio not available</div>
}
        {audioAvailable && (
          <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#aaa", marginRight: 4 }}>Speed</span>
            {SPEED_PRESETS.map(r => (
              <button
                key={r}
                onMouseDown={e => e.preventDefault()}
                onClick={() => setPlaybackRate(r)}
                style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                  border: playbackRate === r ? "1.5px solid #1a4480" : "1px solid #b0b0b0",
                  background: playbackRate === r ? "#e7ecf1" : "white",
                  color: playbackRate === r ? "#1a4480" : "#555", fontWeight: playbackRate === r ? 600 : 400
                }}
              >{r}×</button>
            ))}
            {segmentMap && (
              <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12, color: "#555" }}>
                {msToRealClock(currentMs, segmentMap)}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ background: "white", border: "1px solid #c9c9c9", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "110px 160px 40px 1fr",
          gap: 12, padding: "8px 16px",
          background: "#1a4480", color: "white", fontSize: 11,
          fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase"
        }}>
          <span>Time</span>
          <span>Speaker</span>
          <span>Q/A</span>
          <span>Text</span>
        </div>

        {blocks.map((block, i) => (
          <BlockRow
            key={i}
            index={i}
            block={block}
            role={roles[i]}
            sectionIndex={sectionIndices[i]}
            onRenameOne={openRenameOne}
            onSplitHere={splitUtterance}
            onMergeIntoPrevious={mergeIntoPrevious}
            onFocusNext={() => focusAdjacentBlock(i, 1)}
            onFocusPrev={() => focusAdjacentBlock(i, -1)}
            audioRef={audioRef}
            audioAvailable={audioAvailable}
            insertMenuOpen={insertMenuIndex === i}
            onOpenInsertMenu={() => setInsertMenuIndex(i)}
            onCloseInsertMenu={() => setInsertMenuIndex(null)}
            onInsert={type => insertBlock(i, type)}
            onDelete={() => deleteBlock(i)}
            onToggleQa={toggleQaFrom}
            segmentMap={segmentMap}
            isSelected={selectedIndex === i}
            onSelect={() => setSelectedIndex(i)}
            onTextChange={handleTextChange}
            onTextBlur={saveBlocksNow}
            textareaRef={i === firstUtteranceIndex ? firstUtteranceRef : null}
          />
        ))}
      </div>

      {renameTarget && (() => {
        const allSpeakers = [...new Set(blocks.filter(b => b.type === "utterance").map(b => b.speaker))]
        const isAddNew = renameOriginal === null

        function selectRow(s) {
          setRenameOriginal(s)
          setRenameValue(s ?? "")
          setRenameEditing(false)
        }

        function editRow(s) {
          setRenameOriginal(s)
          setRenameValue(s ?? "")
          setRenameEditing(true)
        }

        function handleModalKey(e) {
          e.stopPropagation()
          if (e.key === "Escape") { setRenameTarget(null); return }
          if (e.key === "Enter" && !renameEditing) { applyRenameOne(); return }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            const items = [...allSpeakers, null]
            const cur = items.indexOf(renameOriginal)
            const next = e.key === "ArrowDown" ? Math.min(cur + 1, items.length - 1) : Math.max(cur - 1, 0)
            selectRow(items[next])
            return
          }
          if (!renameEditing && /^[0-9]$/.test(e.key)) {
            const idx = parseInt(e.key)
            if (idx < allSpeakers.length) selectRow(allSpeakers[idx])
          }
        }

        return (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
          }} onClick={() => setRenameTarget(null)}>
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
                  const selected = !isAddNew && renameOriginal === s
                  const editing = selected && renameEditing
                  return (
                    <div
                      key={s}
                      onClick={() => selectRow(s)}
                      style={{
                        display: "flex", alignItems: "center",
                        padding: editing ? "6px 14px" : "10px 14px",
                        fontSize: 13, cursor: "pointer",
                        background: selected ? "#EBF3FB" : "white",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      {editing ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") applyRenameOne(); if (e.key === "Escape") setRenameTarget(null) }}
                          onBlur={() => modalRef.current?.focus()}
                          style={{
                            flex: 1, padding: "3px 8px", fontSize: 13, fontWeight: 500,
                            borderRadius: 3, border: "1.5px solid #1a4480", outline: "none",
                            boxSizing: "border-box", color: "#1a4480", background: "white"
                          }}
                        />
                      ) : (
                        <span style={{ color: selected ? "#1a4480" : "#222", fontWeight: selected ? 600 : 400 }}>{s}</span>
                      )}
                    </div>
                  )
                })}
                <div
                  onClick={() => selectRow(null)}
                  style={{
                    display: "flex", alignItems: "center",
                    padding: isAddNew && renameEditing ? "6px 14px" : "10px 14px",
                    fontSize: 13, cursor: "pointer",
                    background: isAddNew ? "#EBF3FB" : "white",
                  }}
                >
                  {isAddNew && renameEditing ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") applyRenameOne(); if (e.key === "Escape") setRenameTarget(null) }}
                      onBlur={() => modalRef.current?.focus()}
                      placeholder="New speaker name"
                      style={{
                        flex: 1, padding: "3px 8px", fontSize: 13, fontWeight: 500,
                        borderRadius: 3, border: "1.5px solid #1a4480", outline: "none",
                        boxSizing: "border-box", color: "#1a4480", background: "white"
                      }}
                    />
                  ) : (
                    <span style={{ color: isAddNew ? "#1a4480" : "#aaa", fontWeight: isAddNew ? 600 : 400, fontStyle: "italic" }}>
                      &lt;NEW&gt;
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => editRow(renameOriginal)}
                  style={{ padding: "7px 16px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", cursor: "pointer", color: "#222", fontSize: 13 }}
                >
                  Edit
                </button>
                <div style={{ flex: 1 }} />
                <button onClick={() => setRenameTarget(null)} style={{ padding: "7px 16px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", cursor: "pointer", color: "#222", fontSize: 13 }}>
                  Cancel
                </button>
                <button onClick={applyRenameOne} style={{ padding: "7px 16px", borderRadius: 4, border: "none", background: "#1a4480", color: "white", cursor: "pointer", fontSize: 13 }}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        {shortcutsOpen && (
          <div style={{ background: "white", border: "1px solid #e0e0e0", borderRadius: 4, padding: "12px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#888", marginBottom: 10 }}>Shortcuts</div>
            {SHORTCUTS.map(({ keys, desc }) => (
              <div key={keys} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 6 }}>
                <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 11, background: "#f5f5f5", border: "1px solid #b0b0b0", borderRadius: 4, padding: "2px 7px", color: "#444", whiteSpace: "nowrap" }}>{keys}</span>
                <span style={{ fontSize: 12, color: "#555" }}>{desc}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => setShortcutsOpen(o => !o)}
          title="Keyboard shortcuts"
          style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #b0b0b0", background: "white", cursor: "pointer", fontSize: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          ⌨
        </button>
      </div>
      </div>
    </div>
  )
}
