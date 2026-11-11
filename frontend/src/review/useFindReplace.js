// Find and replace, stepping through matches one at a time like Check for errors: rows with a
// match are tinted and the matches are found again on every change. The current match is the
// first at or after the position reached, wrapping around. It's highlighted in its row (a
// persistent mark behind the text) rather than selected, so the cursor stays in the Find box:
// moving it into the transcript would let the next Enter split an utterance.
import { useState, useEffect, useMemo } from "react"
import { blockTextarea } from "./caret"

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Whole words only add boundaries where the search starts or ends with a letter or digit. A
// possessive still counts ("Jayden" finds "Jayden's"); other contractions don't ("don" isn't in "don't").
function buildRegExp(query, { wholeWord, matchCase }) {
  if (!query) return null
  let source = escapeRegExp(query)
  if (wholeWord) {
    if (/^\w/.test(query)) source = `(?<![\\w'’])${source}`
    if (/\w$/.test(query)) source = `${source}(?!\\w)(?!['’](?![sS](?!\\w))\\w)`
  }
  return new RegExp(source, matchCase ? "g" : "gi")
}

// With Match case off, the replacement follows the matched text's capitals: "joanna" -> "johanna"
// gives "Johanna" for "Joanna" and "JOHANNA" for "JOANNA"
function adaptCase(found, replacement, matchCase) {
  if (matchCase || !replacement) return replacement
  if (found.length > 1 && found === found.toUpperCase() && found !== found.toLowerCase()) return replacement.toUpperCase()
  if (/^[A-Z]/.test(found)) return replacement[0].toUpperCase() + replacement.slice(1)
  return replacement
}

export default function useFindReplace({ blocks, blocksRef, onReplaceText, onReplaceAll }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [replacement, setReplacement] = useState("")
  const [options, setOptions] = useState({ wholeWord: true, matchCase: false })
  const [pos, setPos] = useState({ index: 0, start: 0 })
  const [message, setMessage] = useState(null)
  const [selectRequest, setSelectRequest] = useState(0)
  const [focusRequest, setFocusRequest] = useState(0)  // put the cursor in the Find box

  const regexp = useMemo(() => buildRegExp(query, options), [query, options])
  const matches = useMemo(() => {
    if (!open || !regexp || !blocks) return []
    return blocks.flatMap((b, index) => typeof b.text === "string" && b.text
      ? [...b.text.matchAll(regexp)].map(m => ({ index, start: m.index, end: m.index + m[0].length }))
      : [])
  }, [open, regexp, blocks])
  const matchRows = useMemo(() => new Set(matches.map(m => m.index)), [matches])
  let currentNumber = matches.findIndex(m => m.index > pos.index || (m.index === pos.index && m.start >= pos.start))
  if (currentNumber === -1 && matches.length) currentNumber = 0
  const current = matches[currentNumber] ?? null

  // Bring the current match into view (after Next, Previous or Replace)
  useEffect(() => {
    if (!selectRequest || !current) return
    blockTextarea(current.index)?.closest("[data-block-index]").scrollIntoView({ block: "center", behavior: "smooth" })
  }, [selectRequest])  // eslint-disable-line react-hooks/exhaustive-deps

  const selectCurrent = () => setSelectRequest(n => n + 1)

  // The current match's highlight, in the form BlockRow takes for a flash (persist: no fading)
  const currentText = current && blocks?.[current.index]?.text
  const highlight = useMemo(
    () => current && { id: "find", text: currentText, ranges: [[current.start, current.end]], persist: true },
    [current?.index, current?.start, current?.end, currentText])  // eslint-disable-line react-hooks/exhaustive-deps

  // Opens the panel, searching for `initial` (selected text) if given
  function start(initial) {
    if (initial) setQuery(initial)
    setOpen(true)
    setMessage(null)
    setFocusRequest(n => n + 1)
  }

  function next() {
    if (!current) return
    setPos({ index: current.index, start: current.start + 1 })
    selectCurrent()
  }

  function previous() {
    if (!matches.length) return
    const before = currentNumber > 0 ? matches[currentNumber - 1] : matches[matches.length - 1]
    setPos({ index: before.index, start: before.start })
    selectCurrent()
  }

  function replace() {
    if (!current) return
    const text = blocksRef.current[current.index].text
    const found = text.slice(current.start, current.end)
    const swapped = adaptCase(found, replacement, options.matchCase)
    onReplaceText(current.index, text.slice(0, current.start) + swapped + text.slice(current.end))
    setPos({ index: current.index, start: current.start + swapped.length })
    setMessage(null)
    selectCurrent()
  }

  function replaceAll() {
    if (!regexp || !matches.length) return
    const count = matches.length
    onReplaceAll(blocksRef.current.map(b => typeof b.text === "string" && b.text
      ? { ...b, text: b.text.replace(regexp, found => adaptCase(found, replacement, options.matchCase)) }
      : b))
    setMessage(`Replaced ${count} match${count === 1 ? "" : "es"}. To undo, click in the transcript and press Ctrl+Z.`)
  }

  // The tint for row i while the panel is open: "find-current" or "find"
  const checkMark = i => !open ? null : current?.index === i ? "find-current" : matchRows.has(i) ? "find" : null

  const panel = open && {
    query, replacement, options, message, focusRequest,
    number: currentNumber + 1, total: matches.length,
    onQuery: q => { setQuery(q); setMessage(null) },
    onReplacement: setReplacement,
    onOption: (key, value) => setOptions(o => ({ ...o, [key]: value })),
    onNext: next, onPrevious: previous, onReplace: replace, onReplaceAll: replaceAll,
    onClose: () => setOpen(false),
  }

  const highlightFor = i => (open && current?.index === i ? highlight : null)

  return { start, close: () => setOpen(false), panel, checkMark, highlightFor }
}
