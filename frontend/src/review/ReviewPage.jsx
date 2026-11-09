// The Review page: loads a job, edits its blocks (utterances and metadata), and wires together
// the parts in this folder. Block edits all go through recordHistory (undo) and putBlocks (save).
import { useState, useRef, useEffect, useLayoutEffect } from "react"
import { API } from "./api"
import { META_BLOCKS, metaDefaultText } from "./metaBlocks"
import { blockTextarea, focusElementAt, focusBlockStart, forgetCarets, returnToBlockText, returnToLastText } from "./caret"
import { computeBlockDisplay, transcriptText, blobText, downloadBlob } from "./transcript"
import useBlockSaving from "./useBlockSaving"
import useUndoHistory from "./useUndoHistory"
import useTranscriptInfo from "./useTranscriptInfo"
import useMacros from "./useMacros"
import useErrorCheck from "./useErrorCheck"
import HeaderBar from "./HeaderBar"
import AudioPanel from "./AudioPanel"
import { SPEED_PRESETS } from "./clock"
import TranscriptInfo from "./TranscriptInfo"
import { guessInfo } from "./info"
import BlockRow from "./BlockRow"
import SpeakerPicker from "./SpeakerPicker"
import MacroEditor from "./MacroEditor"
import ErrorCheckPanel from "./ErrorCheckPanel"
import ShortcutsHelp from "./ShortcutsHelp"

export default function ReviewPage({ jobId, onBack, authHeaders }) {
  const [blocks, setBlocks] = useState(null)
  const blocksRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [jobFilename, setJobFilename] = useState("")
  const [segmentMap, setSegmentMap] = useState(null)
  const [channelMix, setChannelMix] = useState(null)
  const originalBlocksRef = useRef(null)
  const [audioAvailable, setAudioAvailable] = useState(true)
  const [audioUrl, setAudioUrl] = useState(null)  // signed storage link, fetched with auth
  const audioRef = useRef(null)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedIndexRef = useRef(0)
  const [insertMenuIndex, setInsertMenuIndex] = useState(null)
  const [speakerPickerIndex, setSpeakerPickerIndex] = useState(null)  // the utterance whose speaker is being picked
  const speakerPickerRef = useRef(null)
  const [macrosOpen, setMacrosOpen] = useState(false)
  const [flashes, setFlashes] = useState({})  // block index -> { id, text, ranges } while an automatic change is flashed
  const flashIdRef = useRef(0)
  const firstUtteranceRef = useRef(null)
  const actionsRef = useRef(null)    // the latest handlers, for stable callers (see rowHandlers)
  const rowHandlersRef = useRef([])  // per-row handler objects, kept between renders

  const { putBlocks, saveBlocksNow, scheduleSave, stale, setVersion, whenSaved } = useBlockSaving({ jobId, authHeaders, blocksRef })
  const { recordHistory, undo, redo } = useUndoHistory({ blocksRef, setBlocks, putBlocks })
  const { info, infoRef, loadInfo, updateInfo, saveInfoNow } = useTranscriptInfo({ jobId, authHeaders })
  const { macros, macroMap, saveMacros } = useMacros({ authHeaders })
  const errorCheck = useErrorCheck({
    blocks, blocksRef,
    onReplaceText: handleTextChange,
    onMerge: index => mergeIntoPrevious(index, " " + blocksRef.current[index].text.trimStart()),  // joined with a space
    onChangeSpeaker: openSpeakerPicker,
  })

  useEffect(() => { blocksRef.current = blocks }, [blocks])
  // Remembered cursor spots are by block index: forget them when blocks are added or removed, or another job opens
  useEffect(() => { forgetCarets() }, [blocks?.length, jobId])
  useEffect(() => { speakerPickerRef.current = speakerPickerIndex }, [speakerPickerIndex])
  useEffect(() => { selectedIndexRef.current = selectedIndex }, [selectedIndex])
  useEffect(() => {
    if (blocks) setSelectedIndex(i => Math.min(i, Math.max(0, blocks.length - 1)))
  }, [blocks])
  useEffect(() => {
    if (!loading) firstUtteranceRef.current?.focus()
  }, [loading])
  useEffect(() => {
    if (!blocks) return
    const el = document.querySelector(`[data-block-index="${selectedIndex}"]`)
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selectedIndex])  // eslint-disable-line react-hooks/exhaustive-deps

  // Page-wide keyboard shortcuts (listed in ShortcutsHelp). Actions go through actionsRef, so
  // this listener, set up once, always calls the current code.
  useEffect(() => {
    const audio = () => audioRef.current
    function handleKeyUp(e) {
      if (e.key === "ScrollLock" && audio()) {
        e.preventDefault()
        audio().pause()
        audio().currentTime = Math.max(0, audio().currentTime - 4)
      }
    }
    function handleKey(e) {
      if (e.key === "ScrollLock" && audio()) {
        e.preventDefault()
        if (!e.repeat) audio().play()
        return
      }
      if (speakerPickerRef.current !== null) return
      // Form areas (info card, macro editor) keep normal keys: Tab moves between fields, Ctrl+Z undoes typing
      if (e.target.closest?.("[data-plain-keys]")) return
      const actions = actionsRef.current
      if (e.key === "F2") {
        e.preventDefault()
        const idx = selectedIndexRef.current
        if (blocksRef.current?.[idx]?.type === "utterance") actions.openSpeakerPicker(idx)
        return
      }
      if (e.key === "Tab") {
        e.preventDefault()
        if (audio()) audio().paused ? audio().play() : audio().pause()
        return
      }
      if (e.ctrlKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault()
        actions.undo()
        return
      }
      if (e.ctrlKey && (e.key === "y" || e.key === "Y")) {
        e.preventDefault()
        actions.redo()
        return
      }
      if (e.ctrlKey && (e.key === "[" || e.key === "]") && audio()) {
        e.preventDefault()
        const delta = e.key === "]" ? 4 : -4
        audio().currentTime = Math.max(0, Math.min(audio().duration, audio().currentTime + delta))
        return
      }
      if (e.ctrlKey && (e.key === "+" || e.key === "=" || e.key === "-")) {
        e.preventDefault()
        const step = e.key === "-" ? -1 : 1
        setPlaybackRate(r => SPEED_PRESETS[Math.max(0, Math.min(SPEED_PRESETS.length - 1, SPEED_PRESETS.indexOf(r) + step))])
        return
      }
      const tag = document.activeElement?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (e.key === "ArrowUp") {
        e.preventDefault()
        actions.focusAdjacentBlock(selectedIndexRef.current, -1)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        actions.focusAdjacentBlock(selectedIndexRef.current, 1)
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
          setVersion(data.blocks_version)
          setBlocks(migrated)
          if (changed) putBlocks(migrated)
          // Strip only an audio file extension: a renamed job like "Smith v. Jones" keeps its period
          setJobFilename(data.filename ? data.filename.replace(/\.(mp3|wav|m4a|mp4|aac|flac|ogg|wma|trm)$/i, "") : jobId)
          // Saved fields win (even ones cleared to null); fields added since it was saved get the guess
          loadInfo({ ...guessInfo(data.filename, data.segment_map), ...data.info })
          setSegmentMap(data.segment_map || null)
          setChannelMix(data.channel_mix || null)
          originalBlocksRef.current = data.original_utterances || null
          setLoading(false)
        })
      fetch(`${API}/jobs/${jobId}/audio-available`, { headers })
        .then(r => r.json())
        .then(data => { setAudioAvailable(data.available); setAudioUrl(data.url) })
    }
    load()
  }, [jobId])  // eslint-disable-line react-hooks/exhaustive-deps

  // --- Speaker picker ---

  function openSpeakerPicker(index) {
    setSpeakerPickerIndex(index)
  }

  // Closing the picker (OK, Cancel, Escape, clicking outside) returns the cursor to the utterance
  function closeSpeakerPicker() {
    const index = speakerPickerRef.current
    setSpeakerPickerIndex(null)
    if (index !== null) setTimeout(() => returnToBlockText(index), 0)
  }

  // Renaming changes that speaker everywhere; otherwise only the picked utterance gets the speaker
  function applySpeaker({ speakerId, name, renaming }) {
    const id = speakerId ?? crypto.randomUUID()
    recordHistory(false)
    const updated = blocks.map((b, i) => {
      if (b.type !== "utterance") return b
      if (renaming ? b.speaker_id === id : i === speakerPickerIndex) return { ...b, speaker_id: id, speaker: name }
      return b
    })
    setBlocks(updated)
    closeSpeakerPicker()
    putBlocks(updated)
  }

  // --- Editing blocks ---

  function handleTextChange(index, value) {
    recordHistory(true)
    setBlocks(prev => prev.map((b, i) => i === index ? { ...b, text: value } : b))
    scheduleSave()
  }

  // Automatic changes (macros, capitals; see autoEdit.js) are typing plus a flash of what changed
  function handleAutoEdit(index, value, ranges) {
    handleTextChange(index, value)
    flashRow(index, value, ranges)
  }

  function flashRow(index, text, ranges) {
    if (!ranges.length) return
    flashIdRef.current += 1
    setFlashes(f => ({ ...f, [index]: { id: flashIdRef.current, text, ranges } }))
  }

  function endFlash(index) {
    setFlashes(f => {
      const rest = { ...f }
      delete rest[index]
      return rest
    })
  }

  function focusAdjacentBlock(fromIndex, direction) {
    const cur = blocksRef.current
    const target = fromIndex + direction
    if (!cur || target < 0 || target >= cur.length) return
    setSelectedIndex(target)
    const el = blockTextarea(target)
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
      else if (updated.length) { setSelectedIndex(0); focusBlockStart(0) }
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
      focusElementAt(blockTextarea(index - 1), joinPos)
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

  // split: from splitEdit (autoEdit.js), which has already finished the word before the cursor
  // and capitalized the new utterance; both changes are flashed
  function splitUtterance(index, { before: beforeText, after: afterText, beforeChanged, afterChanged }) {
    recordHistory(false)
    flashRow(index, beforeText, beforeChanged)
    flashRow(index + 1, afterText, afterChanged)
    const newBlock = { type: "utterance", ...guessOtherSpeaker(blocks, index), text: afterText, qa: blocks[index]?.qa, start_ms: blocks[index]?.end_ms ?? 0, end_ms: blocks[index]?.end_ms ?? 0 }
    const updated = blocks.map((b, i) => i === index ? { ...b, text: beforeText } : b)
    const withNew = [...updated.slice(0, index + 1), newBlock, ...updated.slice(index + 1)]
    setBlocks(withNew)
    setSelectedIndex(index + 1)
    putBlocks(withNew)
    setTimeout(() => focusBlockStart(index + 1), 0)
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

  // Optional post-processing (TranscriptInfo's buttons): the server returns the transcript with the
  // rule applied, unsaved, and it's applied here as one undoable edit after a confirm
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

  // --- Downloads ---

  async function saveDocx() {
    // The .docx is built from what's saved: flush pending edits, and save the info even if
    // it's still the unsaved guess, since its date/time/volume fill the preamble
    saveBlocksNow()
    await Promise.all([whenSaved(), saveInfoNow()])
    const headers = await authHeaders()
    const res = await fetch(`${API}/jobs/${jobId}/docx`, { headers })
    if (!res.ok) { alert("Failed to generate .docx"); return }
    downloadBlob(await res.blob(), `${jobFilename}_transcript.docx`)
  }

  // "original" is the immutable AI transcript (original_utterances); "current" includes unsaved edits
  function saveJson(which) {
    const data = which === "original" ? originalBlocksRef.current : blocks
    if (!data) { alert("No original transcript stored for this job"); return }
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${jobFilename}_${which}.json`)
  }

  const menuItems = [
    { label: "💾 Save blob", onClick: () => downloadBlob(new Blob([blobText(blocks)], { type: "text/plain" }), `${jobFilename}_blob.txt`) },
    { label: "💾 Save .docx", onClick: saveDocx, primary: true },
    { label: "💾 Save .txt", onClick: () => downloadBlob(new Blob([transcriptText(blocks)], { type: "text/plain" }), `${jobFilename}_transcript.txt`) },
    { label: "💾 Save original .json", onClick: () => saveJson("original") },
    { label: "💾 Save current .json", onClick: () => saveJson("current") },
    { label: "⌨ User macros", onClick: () => setMacrosOpen(true) },
  ]

  // --- Rows ---

  const { roles, sectionIndices } = loading ? { roles: [], sectionIndices: [] } : computeBlockDisplay(blocks)

  // Rows re-render only when their own props change (BlockRow is memoized), so typing in one
  // block doesn't redraw hundreds. That needs handlers that keep the same identity across
  // renders: each row's handlers are made once and call the latest code through actionsRef,
  // which is brought up to date after every render, before any event can reach it.
  useLayoutEffect(() => {
    actionsRef.current = {
      openSpeakerPicker, splitUtterance, mergeIntoPrevious, focusAdjacentBlock, setInsertMenuIndex,
      insertBlock, deleteBlock, toggleQaFrom, setSelectedIndex, handleTextChange, saveBlocksNow,
      handleAutoEdit, endFlash, undo, redo,
    }
  })
  function rowHandlers(i) {
    const a = () => actionsRef.current
    return rowHandlersRef.current[i] ??= {
      onRenameOne: (...args) => a().openSpeakerPicker(...args),
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
      onAutoEdit: (...args) => a().handleAutoEdit(...args),
      onFlashEnd: (...args) => a().endFlash(...args),
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
      <HeaderBar onBack={onBack} menuItems={menuItems} />

      <div style={{ maxWidth: "min(1400px, 92vw)", margin: "32px auto 48px", padding: "0 20px", textAlign: "left" }}>
        <AudioPanel
          audioRef={audioRef} audioAvailable={audioAvailable} audioUrl={audioUrl}
          channelMix={channelMix} segmentMap={segmentMap}
          playbackRate={playbackRate} onPlaybackRate={setPlaybackRate}
        />

        <TranscriptInfo info={info} onChange={updateInfo} onRunOptional={runOptionalPostprocessing}
          onCheckErrors={errorCheck.start} jobName={jobFilename} onRename={renameJob} />

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
              flash={flashes[i]}
              checkMark={errorCheck.checkMark(i)}
              isSelected={selectedIndex === i}
              textareaRef={i === firstUtteranceIndex ? firstUtteranceRef : null}
            />
          ))}
        </div>

        {errorCheck.panel && <ErrorCheckPanel {...errorCheck.panel} />}

        {macrosOpen && (
          <MacroEditor
            macros={macros}
            onSave={list => { saveMacros(list); setMacrosOpen(false); setTimeout(returnToLastText, 0) }}
            onClose={() => { setMacrosOpen(false); setTimeout(returnToLastText, 0) }}
          />
        )}

        {speakerPickerIndex !== null && (
          <SpeakerPicker blocks={blocks} index={speakerPickerIndex} onApply={applySpeaker} onClose={closeSpeakerPicker} />
        )}

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

        <ShortcutsHelp />
      </div>
    </div>
  )
}
