// Check for errors (checks.js): a floating panel steps through issues one at a time, rows with
// issues are tinted, and the list is rechecked on every change (only changed blocks are re-scanned).
// The current issue is the first at or after the position reached, wrapping to the start.
// Returns null for `panel` while closed.
import { useState, useEffect, useMemo } from "react"
import { loadSpeller, makeIssueFinder, spellingSuggestions, sameSpeakerKey } from "../checks"
import { blockTextarea } from "./caret"

export default function useErrorCheck({ blocks, blocksRef, onReplaceText, onMerge, onChangeSpeaker }) {
  const [errorCheck, setErrorCheck] = useState(null)  // { speller (null while the dictionary loads), pos }
  const [ignoredWords, setIgnoredWords] = useState([])  // ignored until the page is reloaded
  const [ignoredSpeakerPairs, setIgnoredSpeakerPairs] = useState([])  // likewise, by sameSpeakerKey
  const [selectRequest, setSelectRequest] = useState(0)

  const speller = errorCheck?.speller
  const findIssues = useMemo(
    () => speller && makeIssueFinder(speller, new Set(ignoredWords.map(w => w.toLowerCase())), new Set(ignoredSpeakerPairs)),
    [speller, ignoredWords, ignoredSpeakerPairs])
  const issues = useMemo(() => (findIssues && blocks ? findIssues(blocks) : []), [findIssues, blocks])
  const issueRows = useMemo(() => new Set(issues.map(i => i.index)), [issues])
  const pos = errorCheck?.pos ?? { index: 0, start: 0 }
  let currentNumber = issues.findIndex(i => i.index > pos.index || (i.index === pos.index && i.start >= pos.start))
  if (currentNumber === -1 && issues.length) currentNumber = 0
  const current = issues[currentNumber] ?? null
  const suggestions = useMemo(
    () => (speller && current?.check === "spelling" ? spellingSuggestions(speller, current.word) : []),
    [speller, current?.word])  // eslint-disable-line react-hooks/exhaustive-deps

  // Select the current issue's word (after opening the check, Next, or a panel action), so typing replaces it.
  // Not after ordinary typing: fixing a word by hand shouldn't throw the cursor elsewhere.
  useEffect(() => {
    if (!selectRequest || !current) return
    const ta = blockTextarea(current.index)
    if (!ta) return
    ta.closest("[data-block-index]").scrollIntoView({ block: "center", behavior: "smooth" })
    ta.focus({ preventScroll: true })
    ta.setSelectionRange(current.start, current.end)
  }, [selectRequest])  // eslint-disable-line react-hooks/exhaustive-deps

  const selectCurrent = () => setSelectRequest(n => n + 1)

  async function start() {
    setErrorCheck({ speller: null, pos: { index: 0, start: 0 } })
    const loaded = await loadSpeller()
    setErrorCheck(c => c && { ...c, speller: loaded })
    selectCurrent()
  }

  function next() {
    if (!current) return
    setErrorCheck(c => ({ ...c, pos: { index: current.index, start: current.start + 1 } }))
    selectCurrent()
  }

  function replace(replacement) {
    const issue = current
    const text = blocksRef.current[issue.index].text
    onReplaceText(issue.index, text.slice(0, issue.start) + replacement + text.slice(issue.end))
    setErrorCheck(c => ({ ...c, pos: { index: issue.index, start: issue.start + replacement.length } }))
    selectCurrent()
  }

  function ignore() {
    if (current.check === "same_speaker") {
      setIgnoredSpeakerPairs(p => [...p, sameSpeakerKey(blocksRef.current[current.index])])
    } else {
      setIgnoredWords(w => [...w, current.word])
    }
    selectCurrent()
  }

  // The tint for row i: "current" for the issue being fixed, "error" for any other with an issue
  const checkMark = i => !errorCheck ? null : current?.index === i ? "current" : issueRows.has(i) ? "error" : null

  const panel = errorCheck && {
    loading: !speller,
    issue: current,
    number: currentNumber + 1,
    total: issues.length,
    suggestions,
    onReplace: replace,
    onIgnore: ignore,
    onMerge: () => onMerge(current.index),
    onChangeSpeaker: () => onChangeSpeaker(current.index),
    onNext: next,
    onClose: () => setErrorCheck(null),
  }

  return { start, panel, checkMark }
}
