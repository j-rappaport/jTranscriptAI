import { useState, useRef, useEffect, useMemo, Fragment, memo } from "react"
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

// Meta blocks are free text, edited directly on the Review page; `defaultText` is only the
// starting point on insert. The type just controls .docx formatting (see main.py's generate_docx).
// Transcript info, filled in on the card above the transcript. Blank fields are null
// (unspecified). Use it to tailor the page, e.g. a META_BLOCKS defaultText can be a
// function of info.
const TRANSCRIPT_TYPES = {
  court_proceeding: "Court proceeding",
  grand_jury: "Grand jury",
  interview: "Interview",
}
const EMPTY_INFO = { date: null, time: null, type: null, county: null, case_number: null, volume: null, gj_number: null }

// Guesses for a job whose info hasn't been filled in: TRM recordings carry their real
// local start time (segment_map), names like "GRAND JURY 2" or "GJ 2--Pete" mean a grand
// jury, and "YAMHILL COUNTY ..." names the county.
function guessInfo(filename, segmentMap) {
  const info = { ...EMPTY_INFO, type: "court_proceeding" }
  if (segmentMap?.length) {
    const iso = new Date(segmentMap[0].local_start_ms).toISOString()  // local wall-clock time, stored as UTC
    info.date = iso.slice(0, 10)
    info.time = iso.slice(11, 16)
  }
  const gj = (filename || "").match(/\b(?:grand\s+jury|gj)\b\s*(?:no\.?\s*)?(\d+)?/i)
  if (gj) {
    info.type = "grand_jury"
    info.gj_number = gj[1] ?? null
  }
  const county = (filename || "").match(/\b([a-z]+)\s+county\b/i)
  if (county) info.county = county[1][0].toUpperCase() + county[1].slice(1).toLowerCase()
  return info
}

// defaultText is a string, or a function of the transcript info returning one
function metaDefaultText(type, info) {
  const d = META_BLOCKS[type].defaultText
  return typeof d === "function" ? d(info) : d
}

const INFO_LABEL_STYLE = { fontSize: 11, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#aaa" }
const INFO_INPUT_STYLE = { fontSize: 13, padding: "4px 8px", border: "1px solid #c9c9c9", borderRadius: 3, color: "#222", background: "white", fontFamily: "inherit" }
const INFO_ROW_STYLE = { display: "flex", flexWrap: "wrap", gap: "10px 20px", alignItems: "flex-end" }

// Optional post-processing: rules that run only on demand (OPTIONAL_RULES in postprocess.py),
// one button each in the info card. confirm() is the warning shown before applying.
const OPTIONAL_POSTPROCESSING = [
  {
    rule: "remove_fillers",
    label: "Remove fillers",
    confirm: () => `Remove fillers ("um", "uh")?`,
  },
]

// User macros: typing a trigger then Space in the transcript expands it ("ind" -> "(indiscernible)").
// Triggers are single words (no spaces or . , ? !), matched exactly, capitals included ("mhm" and "Mhm" are separate macros); each user has their own list.
function MacroEditor({ macros, onSave, onClose }) {
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

function TranscriptInfo({ info, onChange, onRunOptional, jobName, onRename }) {
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
        </div>
      </div>
    </div>
  )
}

// Witness blocks: the first line is the witness name (centered + underlined in the .docx).
const META_BLOCKS = {
  witness_sworn: {
    label: "Witness Sworn",
    // Before a grand jury a witness isn't called on behalf of a party
    defaultText: info => info.type === "grand_jury"
      ? "______\nWas thereupon called as a witness; and, having been first duly sworn, was examined and testified as follows:"
      : "______\nWas thereupon called as a witness on behalf of the ____; and, having been first duly sworn, was examined and testified as follows:",
  },
  pause_in_proceedings: {
    label: "Pause in Proceedings",
    defaultText: "(Pause in proceedings, ___ - ___)",
  },
  recess_taken: {
    label: "Recess Taken",
    defaultText: "(Recess taken, ___ - ___)",
  },
  whispered_discussion: {
    label: "Whispered Discussion",
    defaultText: "(Whispered discussion, off the record, ___ - ___)",
  },
  exhibit_received: {
    label: "Exhibit Received",
    defaultText: "(___'s Exhibit No. ___ received.)",
  },
  header: {
    label: "Header",
    defaultText: "",
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
    <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "flex-end", marginBottom: 6 }}>
      {channelMix.map(ch => (
        <span
          key={ch.channel}
          title={`Track ${ch.channel}: ${ch.used ? "used" : "excluded"} (loudest ${ch.rms_peak_db} dB, average ${ch.rms_level_db} dB)`}
          style={{
            fontSize: 9, minWidth: 14, padding: "0 3px", borderRadius: 3, textAlign: "center", cursor: "default",
            border: ch.used ? "1px solid #16a34a" : "1px solid #d0d0d0",
            background: ch.used ? "#dcfce7" : "#f5f5f5",
            color: ch.used ? "#065f46" : "#aaa", fontWeight: ch.used ? 600 : 400,
            textDecoration: ch.used ? "none" : "line-through",
          }}
        >{ch.channel}</span>
      ))}
    </div>
  )
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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

// The menu opens below its ☰ button, or above it when it would run off the bottom of the screen
// (and there's more room above)
function openUpwardIfNoRoom(menu) {
  if (!menu) return
  const rect = menu.getBoundingClientRect()
  const buttonTop = rect.top - menu.offsetParent.offsetHeight - 4
  if (rect.bottom > window.innerHeight - 8 && buttonTop > window.innerHeight - rect.top) {
    menu.style.top = "auto"
    menu.style.bottom = "calc(100% + 4px)"
  }
}

function InsertMenu({ onInsert, onDelete, onClose, onToggleQa, qaToggleLabel }) {
  const itemStyle = { display: "block", width: "100%", textAlign: "left", padding: "7px 14px", fontSize: 12, background: "none", border: "none", cursor: "pointer" }
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={onClose} />
      <div ref={openUpwardIfNoRoom} style={{
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

const MACRO_TRIGGER_KEYS = [" ", ".", ",", "?", "!"]

// Auto-capitalization: the cursor is at a sentence start when it follows . ? ! (and maybe a
// closing quote) and a space, unless the period ends an abbreviation that runs on
// mid-sentence ("6 p.m. we", "e.g. the").
const SENTENCE_START = /[.?!]["”]?\s+$/
const NOT_SENTENCE_END = /\b(?:[ap]\.m|e\.g|i\.e|etc|vs|approx)\.\s+$/i

// What typing `key` with the selection at [s, en) should do when it's more than inserting
// the key, as { text, caret }; null means ordinary typing. Three things can happen:
// - a user macro expands: "ind" then Space or . , ? ! gives "(indiscernible)" plus the key
// - a letter starting a sentence is capitalized: "left. he" -> "left. He"
// - a new sentence end capitalizes the word already after it: typing "." in
//   "he left, then" (in place of the comma) gives "he left. Then"
function typingEdit(value, s, en, key, macros) {
  let before = value.slice(0, s)
  let after = value.slice(en)
  if (/^[a-z]$/.test(key)) {
    return SENTENCE_START.test(before) && !NOT_SENTENCE_END.test(before)
      ? { text: before + key.toUpperCase() + after, caret: s + 1 }
      : null
  }
  if (!MACRO_TRIGGER_KEYS.includes(key)) return null
  let changed = false
  const word = s === en && macros?.size ? before.match(/(?:^|\s)(\S+)$/)?.[1] : null
  const expansion = word && macros.get(word)
  if (expansion) {
    before = before.slice(0, before.length - word.length) + expansion
    changed = true
  }
  // Not for "..." (an ellipsis runs on) or a period ending an abbreviation like "p.m."
  if (".?!".includes(key) && !before.endsWith(".") && !NOT_SENTENCE_END.test(before + key + " ")) {
    const next = after.match(/^(["”]?\s+)([a-z])/)
    if (next) {
      after = next[1] + next[2].toUpperCase() + after.slice(next[0].length)
      changed = true
    }
  }
  return changed ? { text: before + key + after, caret: before.length + 1 } : null
}

function UtteranceText({ index, text, onTextChange, onTextBlur, onSplitHere, onMergeIntoPrevious, onFocusNext, onFocusPrev, onSelect, textareaRef, macros }) {
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
          if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            const ta = e.target
            const edit = typingEdit(ta.value, ta.selectionStart, ta.selectionEnd, e.key, macros)
            if (edit) {
              e.preventDefault()
              onTextChange(edit.text)
              requestAnimationFrame(() => ta.setSelectionRange(edit.caret, edit.caret))
              return
            }
          }
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

// Memoized: a row redraws only when its own props change (see rowHandlers in ReviewPage)
const BlockRow = memo(function BlockRow({ block, index, role, sectionIndex, isSelected, onSelect, onTextChange, onTextBlur, onRenameOne, onSplitHere, onMergeIntoPrevious, onFocusNext, onFocusPrev, audioRef, audioAvailable, insertMenuOpen, onOpenInsertMenu, onInsert, onCloseInsertMenu, onDelete, onToggleQa, segmentMap, textareaRef, macros }) {
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
            macros={macros}
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
          macros={macros}
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
})

export default function ReviewPage({ jobId, onBack, authHeaders }) {
  const [blocks, setBlocks] = useState(null)
  const [jobFilename, setJobFilename] = useState("")
  const [segmentMap, setSegmentMap] = useState(null)
  const [channelMix, setChannelMix] = useState(null)
  const originalBlocksRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [audioAvailable, setAudioAvailable] = useState(true)
  const [audioUrl, setAudioUrl] = useState(null)  // signed storage link, fetched with auth
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameSpeakerId, setRenameSpeakerId] = useState(null)
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
  const versionRef = useRef(null)
  const saveChainRef = useRef(Promise.resolve())
  const staleRef = useRef(false)
  const [stale, setStale] = useState(false)
  const [macros, setMacros] = useState([])  // [{ trigger, expansion }], the user's own, from /settings
  const [macrosOpen, setMacrosOpen] = useState(false)
  const actionsRef = useRef(null)    // the latest handlers, for the rows' stable ones (see rowHandlers)
  const rowHandlersRef = useRef([])  // per-row handler objects, kept between renders
  const macroMap = useMemo(() => new Map(macros.map(m => [m.trigger, m.expansion])), [macros])
  const [info, setInfo] = useState(EMPTY_INFO)
  const infoRef = useRef(EMPTY_INFO)
  const infoSaveTimerRef = useRef(null)
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
      // Form areas (info card, macro editor) keep normal keys: Tab moves between fields, Ctrl+Z undoes typing
      if (e.target.closest?.("[data-plain-keys]")) return
      if (e.key === "F2") {
        e.preventDefault()
        const idx = selectedIndexRef.current
        const block = blocksRef.current?.[idx]
        if (block?.type === "utterance") openSpeakerPicker(idx, block)
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
          let changed = false
          const idsByName = {}
          const migrated = []
          for (const raw of data.blocks) {
            let b = !raw.type ? { ...raw, type: "utterance" } : raw
            if (b.type === "qa_toggle") { qaOn = !qaOn; changed = true; continue }
            // The separate GJ witness block was folded into Witness Sworn (its text follows the info type)
            if (b.type === "witness_sworn_gj") { b = { ...b, type: "witness_sworn" }; changed = true }
            if (b.type === "utterance" && qaOn) b = { ...b, qa: true }
            // Older jobs identified speakers by name only: give each distinct name an ID
            if (b.type === "utterance" && !b.speaker_id) {
              b = { ...b, speaker_id: idsByName[b.speaker] ??= crypto.randomUUID() }
              changed = true
            }
            migrated.push(b)
          }
          versionRef.current = data.blocks_version
          setBlocks(migrated)
          if (changed) putBlocks(migrated)
          // Strip only an audio file extension: a renamed job like "Smith v. Jones" keeps its period
          setJobFilename(data.filename ? data.filename.replace(/\.(mp3|wav|m4a|mp4|aac|flac|ogg|wma|trm)$/i, "") : jobId)
          // Saved fields win (even ones cleared to null); fields added since it was saved get the guess
          const loadedInfo = { ...guessInfo(data.filename, data.segment_map), ...data.info }
          infoRef.current = loadedInfo
          setInfo(loadedInfo)
          setSegmentMap(data.segment_map || null)
          setChannelMix(data.channel_mix || null)
          originalBlocksRef.current = data.original_utterances || null
          setLoading(false)
        })
      fetch(`${API}/jobs/${jobId}/audio-available`, { headers })
        .then(r => r.json())
        .then(data => { setAudioAvailable(data.available); setAudioUrl(data.url) })
      fetch(`${API}/settings`, { headers })
        .then(r => r.json())
        .then(settings => setMacros(settings.macros || []))
        .catch(() => {})
    }
    load()
  }, [jobId])

  async function saveMacros(list) {
    setMacros(list)
    setMacrosOpen(false)
    const headers = await authHeaders()
    fetch(`${API}/settings`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ macros: list }),
    }).then(r => { if (!r.ok) throw new Error(r.status) })
      .catch(() => alert("Failed to save macros"))
  }

  function updateInfo(key, value) {
    const next = { ...infoRef.current, [key]: value === "" ? null : value }
    infoRef.current = next
    setInfo(next)
    if (infoSaveTimerRef.current) clearTimeout(infoSaveTimerRef.current)
    infoSaveTimerRef.current = setTimeout(saveInfoNow, 600)
  }

  async function runOptionalPostprocessing({ rule, label, confirm }) {
    const before = blocksRef.current
    if (!before) return
    const headers = await authHeaders()
    const res = await fetch(`${API}/postprocess/${rule}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: before }),
    })
    if (!res.ok) { alert(`${label} failed.`); return }
    const { blocks: updated, changed } = await res.json()
    if (changed === 0) { alert(`${label}: nothing to change.`); return }
    if (!window.confirm(confirm(changed))) return
    if (blocksRef.current !== before) { alert("The transcript changed while this was running. Try again."); return }
    recordHistory(false)
    setBlocks(updated)
    putBlocks(updated)
  }

  async function renameJob(filename) {
    const previous = jobFilename
    setJobFilename(filename)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API}/jobs/${jobId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      })
      if (!res.ok) throw new Error(res.status)
    } catch {
      setJobFilename(previous)
      alert("Failed to rename the job")
    }
  }

  async function saveInfoNow() {
    if (infoSaveTimerRef.current) { clearTimeout(infoSaveTimerRef.current); infoSaveTimerRef.current = null }
    const headers = await authHeaders()
    await fetch(`${API}/jobs/${jobId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ info: infoRef.current }),
    }).catch(() => {})
  }

  // Saves run one at a time, each sending the version it was based on. If the transcript
  // changed elsewhere (another tab, a server-side fix), the server answers 409 and this
  // tab stops saving rather than overwrite the newer version.
  function putBlocks(updated) {
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (staleRef.current) return
      const headers = await authHeaders()
      const res = await fetch(`${API}/jobs/${jobId}/blocks`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: updated, version: versionRef.current }),
      })
      if (res.status === 409) {
        staleRef.current = true
        setStale(true)
      } else if (res.ok) {
        versionRef.current = (await res.json()).version
      }
    }).catch(() => {})
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

  function openSpeakerPicker(index, block) {
    setRenameTarget({ index })
    setRenameSpeakerId(block.speaker_id)
    setRenameValue(block.speaker)
    setRenameEditing(false)
  }

  function openRenameOne(index) {
    openSpeakerPicker(index, blocks[index])
  }

  function applyRenameOne() {
    const name = renameValue.trim().toUpperCase()
    if (!name) return
    // Speakers are identified by speaker_id; names may repeat ("THE WITNESS" twice).
    // Edit renames that speaker everywhere; picking a row (or <NEW>) reassigns only this block.
    const renaming = renameEditing && renameSpeakerId !== null
    const speakerId = renameSpeakerId ?? crypto.randomUUID()
    recordHistory(false)
    const updated = blocks.map((b, i) => {
      if (b.type !== "utterance") return b
      if (renaming ? b.speaker_id === speakerId : i === renameTarget.index) return { ...b, speaker_id: speakerId, speaker: name }
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

  // All "UNKNOWN SPEAKER" placeholders share one ID, so they appear once in the picker
  function unknownSpeaker(allBlocks) {
    const existing = allBlocks.find(b => b.type === "utterance" && b.speaker === "UNKNOWN SPEAKER")
    return { speaker_id: existing?.speaker_id ?? crypto.randomUUID(), speaker: "UNKNOWN SPEAKER" }
  }

  function guessOtherSpeaker(allBlocks, index) {
    const current = allBlocks[index]?.speaker_id
    for (let i = index - 1; i >= 0; i--) {
      const b = allBlocks[i]
      if (b.type === "utterance" && b.speaker_id !== current) return { speaker_id: b.speaker_id, speaker: b.speaker }
    }
    return unknownSpeaker(allBlocks)
  }

  function splitUtterance(index, beforeText, afterText) {
    recordHistory(false)
    const newBlock = { type: "utterance", ...guessOtherSpeaker(blocks, index), text: afterText, qa: blocks[index]?.qa, start_ms: blocks[index]?.end_ms ?? 0, end_ms: blocks[index]?.end_ms ?? 0 }
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
      newBlock = { type, text: metaDefaultText(type, infoRef.current), start_ms: cur[afterIndex]?.end_ms ?? 0, end_ms: cur[afterIndex]?.end_ms ?? 0 }
    } else {
      newBlock = { type: "utterance", ...unknownSpeaker(cur), text: "", start_ms: cur[afterIndex]?.end_ms ?? 0, end_ms: cur[afterIndex]?.end_ms ?? 0 }
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
    downloadBlob(blob, `${jobFilename}_transcript.txt`)
  }

  async function saveDocx() {
    // The .docx is built from what's saved: flush pending edits, and save the info even if
    // it's still the unsaved guess, since its date/time/volume fill the preamble
    saveBlocksNow()
    await Promise.all([saveChainRef.current, saveInfoNow()])
    const headers = await authHeaders()
    const res = await fetch(`${API}/jobs/${jobId}/docx`, { headers })
    if (!res.ok) { alert("Failed to generate .docx"); return }
    const blob = await res.blob()
    downloadBlob(blob, `${jobFilename}_transcript.docx`)
  }

  function saveBlob() {
    const text = blocks
      .filter(b => b.type === "utterance")
      .map(b => normalizeSentenceSpacing(b.text))
      .join("  ")
    const blob = new Blob([text], { type: "text/plain" })
    downloadBlob(blob, `${jobFilename}_blob.txt`)
  }

  // "original" is the immutable AI transcript (original_utterances); "current" includes unsaved edits
  function saveJson(which) {
    const data = which === "original" ? originalBlocksRef.current : blocks
    if (!data) { alert("No original transcript stored for this job"); return }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    downloadBlob(blob, `${jobFilename}_${which}.json`)
  }

  const { roles, sectionIndices } = loading ? { roles: [], sectionIndices: [] } : computeBlockDisplay(blocks)

  // Rows re-render only when their own props change (BlockRow is memoized), so typing in one
  // block doesn't redraw hundreds. That needs handlers that keep the same identity across
  // renders: each row's handlers are made once and call the latest code through actionsRef.
  actionsRef.current = {
    openRenameOne, splitUtterance, mergeIntoPrevious, focusAdjacentBlock, setInsertMenuIndex,
    insertBlock, deleteBlock, toggleQaFrom, setSelectedIndex, handleTextChange, saveBlocksNow,
  }
  function rowHandlers(i) {
    const a = () => actionsRef.current
    return rowHandlersRef.current[i] ??= {
      onRenameOne: (...args) => a().openRenameOne(...args),
      onSplitHere: (...args) => a().splitUtterance(...args),
      onMergeIntoPrevious: (...args) => a().mergeIntoPrevious(...args),
      onFocusNext: () => a().focusAdjacentBlock(i, 1),
      onFocusPrev: () => a().focusAdjacentBlock(i, -1),
      onOpenInsertMenu: () => a().setInsertMenuIndex(i),
      onCloseInsertMenu: () => a().setInsertMenuIndex(null),
      onInsert: type => a().insertBlock(i, type),
      onDelete: () => a().deleteBlock(i),
      onToggleQa: (...args) => a().toggleQaFrom(...args),
      onSelect: () => a().setSelectedIndex(i),
      onTextChange: (...args) => a().handleTextChange(...args),
      onTextBlur: (...args) => a().saveBlocksNow(...args),
    }
  }

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
                  <button onMouseDown={e => e.preventDefault()} onClick={() => { saveJson("original"); setMenuOpen(false) }} style={{ fontSize: 13, padding: "7px 10px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", color: "#555", cursor: "pointer", textAlign: "left" }}>
                    💾 Save original .json
                  </button>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => { saveJson("current"); setMenuOpen(false) }} style={{ fontSize: 13, padding: "7px 10px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", color: "#555", cursor: "pointer", textAlign: "left" }}>
                    💾 Save current .json
                  </button>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => { setMacrosOpen(true); setMenuOpen(false) }} style={{ fontSize: 13, padding: "7px 10px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", color: "#555", cursor: "pointer", textAlign: "left" }}>
                    ⌨ User macros
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
      src={audioUrl}
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

      <TranscriptInfo info={info} onChange={updateInfo} onRunOptional={runOptionalPostprocessing} jobName={jobFilename} onRename={renameJob} />

      {/* No overflow clipping here, so a row's ☰ menu can extend past the last row */}
      <div style={{ background: "white", border: "1px solid #c9c9c9", borderRadius: 4 }}>
        <div style={{
          display: "grid", gridTemplateColumns: "110px 160px 40px 1fr",
          gap: 12, padding: "8px 16px", borderRadius: "3px 3px 0 0",
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
            {...rowHandlers(i)}
            audioRef={audioRef}
            audioAvailable={audioAvailable}
            insertMenuOpen={insertMenuIndex === i}
            segmentMap={segmentMap}
            macros={macroMap}
            isSelected={selectedIndex === i}
            textareaRef={i === firstUtteranceIndex ? firstUtteranceRef : null}
          />
        ))}
      </div>

      {macrosOpen && <MacroEditor macros={macros} onSave={saveMacros} onClose={() => setMacrosOpen(false)} />}

      {stale && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          padding: "10px 16px", background: "#b50909", color: "white", fontSize: 13,
        }}>
          <span>This transcript was changed elsewhere, so your latest edits here weren't saved. Reload to continue with the newest version.</span>
          <button onClick={() => window.location.reload()} style={{ padding: "5px 14px", borderRadius: 4, border: "none", background: "white", color: "#b50909", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Reload
          </button>
        </div>
      )}

      {renameTarget && (() => {
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
        const isAddNew = renameSpeakerId === null

        function selectRow(id) {
          setRenameSpeakerId(id)
          setRenameValue(id === null ? "" : speakersById.get(id).name)
          setRenameEditing(false)
        }

        function editRow(id) {
          selectRow(id)
          setRenameEditing(true)
        }

        function handleModalKey(e) {
          e.stopPropagation()
          if (e.key === "Escape") { setRenameTarget(null); return }
          if (e.key === "Enter" && !renameEditing) { applyRenameOne(); return }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            const items = [...allSpeakers, null]
            const cur = items.indexOf(renameSpeakerId)
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
                  const selected = !isAddNew && renameSpeakerId === s
                  const editing = selected && renameEditing
                  return (
                    <div
                      key={s}
                      onClick={() => selectRow(s)}
                      onDoubleClick={() => editRow(s)}
                      style={{
                        display: "flex", alignItems: "center",
                        height: 38, boxSizing: "border-box", padding: "0 14px",  // same height whether showing or editing the name
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
                          onDoubleClick={e => e.stopPropagation()}
                          onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") applyRenameOne(); if (e.key === "Escape") setRenameTarget(null) }}
                          onBlur={() => modalRef.current?.focus()}
                          style={{
                            flex: 1, minWidth: 0, padding: "3px 8px", fontSize: 13, fontWeight: 500,
                            borderRadius: 3, border: "1.5px solid #1a4480", outline: "none",
                            boxSizing: "border-box", color: "#1a4480", background: "white"
                          }}
                        />
                      ) : (
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
                  style={{
                    display: "flex", alignItems: "center",
                    height: 38, boxSizing: "border-box", padding: "0 14px",
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
                      onDoubleClick={e => e.stopPropagation()}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") applyRenameOne(); if (e.key === "Escape") setRenameTarget(null) }}
                      onBlur={() => modalRef.current?.focus()}
                      placeholder="New speaker name"
                      style={{
                        flex: 1, minWidth: 0, padding: "3px 8px", fontSize: 13, fontWeight: 500,
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
                  onClick={() => editRow(renameSpeakerId)}
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
