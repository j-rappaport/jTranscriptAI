// One transcript row: time and play button, speaker, Q/A role, and the editable text
// (UtteranceText), plus the ☰ menu for inserting or deleting blocks
import { useRef, memo } from "react"
import { typingEdit, splitEdit, quoteSelection } from "../autoEdit"
import { META_BLOCKS } from "./metaBlocks"
import { msToTimecode, msToRealClock } from "./clock"
import { rememberCaret, returnToBlockText } from "./caret"


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

function UtteranceText({ index, text, onTextChange, onAutoEdit, flash, onFlashEnd, onTextBlur, onSplitHere, onMergeIntoPrevious, onFocusNext, onFocusPrev, onSelect, textareaRef, macros }) {
  const mirrorRef = useRef(null)
  const measureRef = useRef(null)
  const lastAutoEditRef = useRef(null)  // the automatic change just made, until the next key: { text, caret, plain }

  // The textarea and its layout copies (line counting, flash) must lay text out identically.
  // Textareas don't inherit the page's letter-spacing, so it's set here for all of them.
  const sharedStyle = {
    fontSize: 13, lineHeight: 1.6, fontFamily: "inherit", letterSpacing: "normal",
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

  // A brief highlight behind text changed automatically (autoEdit.js), as Word does, so it reads
  // as a separate action: an invisible copy of the text, laid out exactly like the textarea,
  // with the changed characters marked. Shown only while the text is still what was flashed.
  function renderFlash() {
    if (!flash || flash.text !== text) return null
    const pieces = []
    let pos = 0
    flash.ranges.forEach(([a, b], i) => {
      pieces.push(text.slice(pos, a))
      pieces.push(
        // persist: a highlight that stays (the current Find match) rather than a fading flash
        <mark key={`${flash.id}-${i}`} onAnimationEnd={i === 0 && !flash.persist ? onFlashEnd : undefined} style={{
          color: "transparent", borderRadius: 3,
          ...(flash.persist ? { background: "#f5d76e" } : { background: "#bcd3f0", animation: "autoFixFlash 0.7s ease-out forwards" }),
        }}>{text.slice(a, b)}</mark>
      )
      pos = b
    })
    pieces.push(text.slice(pos))
    return (
      <div aria-hidden style={{
        ...sharedStyle, whiteSpace: "pre-wrap", wordWrap: "break-word", alignSelf: "start",
        color: "transparent", pointerEvents: "none",
      }}>{pieces}</div>
    )
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
      {renderFlash()}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => onTextChange(e.target.value)}
        onBlur={e => { rememberCaret(index, e.target.selectionStart); onTextBlur() }}
        onFocus={onSelect}
        onKeyDown={e => {
          const ta = e.target
          if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return  // pressing Ctrl on its way to Ctrl+Z
          const lastAuto = lastAutoEditRef.current
          lastAutoEditRef.current = null
          if (e.ctrlKey && (e.key === "z" || e.key === "Z") && lastAuto && ta.value === lastAuto.text && ta.selectionStart === lastAuto.caret) {
            // As in Word: Ctrl+Z right after an automatic change (capital, macro) undoes just
            // that change and keeps the key as typed. The page-wide undo isn't reached.
            e.preventDefault()
            e.stopPropagation()
            onTextChange(lastAuto.plain.text)
            requestAnimationFrame(() => ta.setSelectionRange(lastAuto.plain.caret, lastAuto.plain.caret))
            return
          }
          if (e.ctrlKey && e.key === "'") {
            // Ctrl+' quotes the selected text (autoEdit.js); Ctrl+Z right after puts it back as it was
            e.preventDefault()
            const { selectionStart: s, selectionEnd: en } = ta
            const edit = quoteSelection(ta.value, s, en)
            if (edit) {
              lastAutoEditRef.current = { text: edit.text, caret: edit.caret, plain: { text: ta.value, caret: en } }
              onAutoEdit(edit.text, edit.changed)
              requestAnimationFrame(() => ta.setSelectionRange(edit.caret, edit.caret))
            }
            return
          }
          if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            const { selectionStart: s, selectionEnd: en } = ta
            const edit = typingEdit(ta.value, s, en, e.key, macros)
            if (edit) {
              e.preventDefault()
              lastAutoEditRef.current = { text: edit.text, caret: edit.caret, plain: { text: ta.value.slice(0, s) + e.key + ta.value.slice(en), caret: s + 1 } }
              onAutoEdit(edit.text, edit.changed)
              requestAnimationFrame(() => ta.setSelectionRange(edit.caret, edit.caret))
              return
            }
          }
          if (e.key === "Enter" && !e.shiftKey && onSplitHere) {
            e.preventDefault()
            // Enter finishes the word before the cursor and starts the new utterance (autoEdit.js)
            onSplitHere(index, splitEdit(e.target.value, e.target.selectionStart, macros))
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
          height: "100%", color: "#222", position: "relative",  // drawn above the flash
          borderRadius: 3, background: "transparent",
          resize: "none", overflow: "hidden", outline: "none",
          caretColor: "#dc2626",
        }}
      />
    </div>
  )
}

// Memoized: a row redraws only when its own props change (see rowHandlers in ReviewPage)
const BlockRow = memo(function BlockRow({ block, index, role, sectionIndex, isSelected, onSelect, onTextChange, onTextBlur, onRenameOne, onSplitHere, onMergeIntoPrevious, onFocusNext, onFocusPrev, audioRef, audioAvailable, insertMenuOpen, onOpenInsertMenu, onInsert, onCloseInsertMenu, onDelete, onToggleQa, segmentMap, textareaRef, macros, flash, onAutoEdit, onFlashEnd, checkMark }) {
  // checkMark: "error" while Check for errors finds an issue here, "current" for the one being fixed;
  // "find" / "find-current" likewise for Find and replace matches
  const rowBg = checkMark === "current" ? "#fbd0d0" : checkMark === "error" ? "#fdeeee"
    : checkMark === "find-current" ? "#fdf0c4" : checkMark === "find" ? "#fefae8"
    : isSelected ? "#dcfce7" : (sectionIndex % 2 === 0 ? "white" : "#fafafa")

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
        onClick={() => { onSelect(); returnToBlockText(index) }}
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
            onAutoEdit={(value, ranges) => onAutoEdit(index, value, ranges)}
            flash={flash}
            onFlashEnd={() => onFlashEnd(index)}
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
      onClick={() => { onSelect(); returnToBlockText(index) }}
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
          onAutoEdit={(value, ranges) => onAutoEdit(index, value, ranges)}
          flash={flash}
          onFlashEnd={() => onFlashEnd(index)}
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

export default BlockRow
