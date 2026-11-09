// "Check for errors" on the Review page: each check finds issues in a block's text as
// { start, end, word, suggestions }, and the page steps through them one at a time.
// Results are cached per block object, so after a fix only the changed block is checked again.
// Spelling is the first check.
import affUrl from "../node_modules/dictionary-en/index.aff?url"
import dicUrl from "../node_modules/dictionary-en/index.dic?url"

// Words transcripts are full of that the dictionary doesn't know
const TRANSCRIPT_WORDS = [
  "mm-hmm", "uh-huh", "uh-uh", "um-hum", "mm", "hmm", "um", "uh", "okay", "gonna", "wanna", "gotta",
  "kinda", "sorta", "yeah", "yep", "nope", "ya", "y'all", "ain't", "lemme", "gimme", "dunno", "outta",
]

let spellerPromise = null

// The dictionary (about 550 KB) is loaded the first time a check runs, not with the page
export function loadSpeller() {
  return spellerPromise ??= (async () => {
    const [{ default: nspell }, aff, dic] = await Promise.all([
      import("nspell"),
      fetch(affUrl).then(r => r.text()),
      fetch(dicUrl).then(r => r.text()),
    ])
    const speller = nspell(aff, dic)
    TRANSCRIPT_WORDS.forEach(w => speller.add(w))
    return speller
  })()
}

// A word: letters with inner apostrophes or hyphens ("don't", "Vargas-Bermudez"), not touching
// digits ("3rd", "10ish" are skipped)
const WORD = /(?<![\w'’-])[A-Za-z]+(?:['’-][A-Za-z]+)*(?![\w'’])/g

function isKnown(speller, word, accepted) {
  const w = word.replace(/’/g, "'")
  if (w.length < 2 || accepted.has(w.toLowerCase())) return true
  if (speller.correct(w) || (w === w.toUpperCase() && speller.correct(w.toLowerCase()))) return true
  // A possessive of a known word ("Jayden's" once "Jayden" is in the dictionary)
  if (/'s$/i.test(w)) return isKnown(speller, w.slice(0, -2), accepted)
  // A hyphenated word is fine when each part is ("well-known", "Vargas-Bermudez" once both names are accepted)
  return w.includes("-") && w.split("-").every(part => isKnown(speller, part, accepted))
}

// `accepted`: lowercase words the user added to their dictionary or ignored
export function spellingIssues(text, speller, accepted) {
  const issues = []
  for (const m of text.matchAll(WORD)) {
    if (isKnown(speller, m[0], accepted)) continue
    issues.push({ start: m.index, end: m.index + m[0].length, word: m[0] })
  }
  return issues
}

export function spellingSuggestions(speller, word) {
  return speller.suggest(word.replace(/’/g, "'")).slice(0, 4)
}

// All issues in the transcript, in order, as { index, start, end, word }. Blocks keep their
// identity until edited, so cached results are reused for every block that hasn't changed.
export function makeIssueFinder(speller, accepted) {
  const cache = new WeakMap()
  return blocks => blocks.flatMap((block, index) => {
    if (typeof block.text !== "string" || !block.text) return []
    let issues = cache.get(block)
    if (!issues) {
      issues = spellingIssues(block.text, speller, accepted)
      cache.set(block, issues)
    }
    return issues.map(issue => ({ ...issue, index }))
  })
}
