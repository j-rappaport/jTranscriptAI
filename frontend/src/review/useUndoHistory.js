// Undo/redo (Ctrl+Z / Ctrl+Y) as snapshots of the blocks array. Cheap, since every edit builds
// new arrays and unchanged blocks are shared between snapshots. Typing is coalesced into one
// undo step per burst (until a second's pause).
import { useRef } from "react"

const HISTORY_LIMIT = 50

export default function useUndoHistory({ blocksRef, setBlocks, putBlocks }) {
  const historyRef = useRef({ past: [], future: [] })
  const burstRef = useRef(null)
  const burstTimerRef = useRef(null)

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

  return { recordHistory, undo, redo }
}
