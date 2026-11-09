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
  // A possessive of a known or ignored word ("Jayden's" once "Jayden" is ignored)
  if (/'s$/i.test(w)) return isKnown(speller, w.slice(0, -2), accepted)
  // A hyphenated word is fine when each part is ("well-known", "Vargas-Bermudez" once both names are accepted)
  return w.includes("-") && w.split("-").every(part => isKnown(speller, part, accepted))
}

// `accepted`: lowercase words the user chose to ignore
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

// The same speaker twice in a row: usually one turn split in two, or a mislabeled speaker. Only
// directly adjacent utterances count (a pause or other block between them is fine). An ignored
// pair is remembered by its key, which survives edits to the text.
export function sameSpeakerKey(block) {
  return `${block.speaker_id}@${block.start_ms}`
}

function isSameSpeakerAgain(blocks, index, ignoredPairs) {
  const block = blocks[index], prev = blocks[index - 1]
  return index > 0 && block.type === "utterance" && prev.type === "utterance"
    && block.speaker_id === prev.speaker_id && !ignoredPairs.has(sameSpeakerKey(block))
}

// All issues in the transcript, in order, as { check, index, start, end, word? }:
// check "spelling" (a word), or "same_speaker" (the utterance repeating the speaker before it).
// Blocks keep their identity until edited, so spelling results are cached per block and only
// changed blocks are checked again.
export function makeIssueFinder(speller, accepted, ignoredPairs) {
  const cache = new WeakMap()
  return blocks => blocks.flatMap((block, index) => {
    const found = []
    if (isSameSpeakerAgain(blocks, index, ignoredPairs)) found.push({ check: "same_speaker", index, start: 0, end: 0 })
    if (typeof block.text === "string" && block.text) {
      let words = cache.get(block)
      if (!words) {
        words = spellingIssues(block.text, speller, accepted)
        cache.set(block, words)
      }
      found.push(...words.map(issue => ({ ...issue, check: "spelling", index })))
    }
    return found
  })
}
