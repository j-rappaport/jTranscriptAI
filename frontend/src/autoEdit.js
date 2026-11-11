// Automatic edits while typing on the Review page: user macros and auto-capitalization.
// Every rule lives here and returns the new text together with the ranges it changed
// ([start, end) character offsets), which the page uses to flash the change, as Word does.
// Nothing happens mid-word: a word is acted on when it's finished (Space, . , ? ! or Enter).

const WORD_END_KEYS = [" ", ".", ",", "?", "!"]

// The cursor is at a sentence start when it follows . ? ! (and maybe a closing quote) and a
// space, unless the period ends an abbreviation that runs on mid-sentence ("6 p.m. we", "e.g. the").
const SENTENCE_START = /[.?!]["”]?\s+$/
const NOT_SENTENCE_END = /\b(?:[ap]\.m|e\.g|i\.e|etc|vs|approx)\.\s+$/i

// The word just finished (before the cursor): a macro expands, kept as written except for a
// capital at a sentence start ("mhm" -> "Mm-hmm"; "(indiscernible)" never changes); otherwise a
// word starting a sentence gets a capital, as does "i" on its own ("i", "i'm", "i'll"...). A
// sentence starts after . ? ! and a space, or at the start of the block (but not after "--"). `key` is what
// finished the word, if typed. Returns { before, changed } or null when nothing applies.
function finishWord(before, after, macros, key) {
  const word = before.match(/(?:^|\s)(\S+)$/)?.[1]
  if (!word) return null
  const head = before.slice(0, before.length - word.length)
  const startsSentence = !head.trim() || (SENTENCE_START.test(head) && !NOT_SENTENCE_END.test(head))
  let expansion = macros?.get(word)
  if (expansion) {
    if (startsSentence && /^[a-z]/.test(expansion)) expansion = expansion[0].toUpperCase() + expansion.slice(1)
    return { before: head + expansion, changed: [head.length, head.length + expansion.length] }
  }
  // First-person "I" (and its contractions), but not the "i" of "i.e." while it's being typed
  const pronoun = word.match(/^["“(]*i(?:['’](?:m|ll|ve|d))?$/)
  const letter = word.match(/^["“(]*([a-z])/)
  const bareI = /^["“(]*i$/.test(word)
  if (letter && (startsSentence || (pronoun && !(bareI && key === ".")))) {
    const at = head.length + letter[0].length - 1
    return { before: before.slice(0, at) + letter[1].toUpperCase() + before.slice(at + 1), changed: [at, at + 1] }
  }
  return null
}

// Capitalizes the first letter of text that now starts a sentence, skipping leading spaces and
// an opening quote. Returns { text, changed } or null.
function capitalizeStart(text) {
  const m = text.match(/^(\s*["“]?)([a-z])/)
  if (!m) return null
  const at = m[1].length
  return { text: text.slice(0, at) + m[2].toUpperCase() + text.slice(at + 1), changed: [at, at + 1] }
}

// What typing `key` with the selection at [s, en) should do when it's more than inserting the
// key: { text, caret, changed } with changed a list of ranges, or null for ordinary typing.
// When Space or . , ? ! is typed:
// - the word just finished is completed (finishWord): "ok" -> "Okay" by macro, "he" -> "He"
// - a new sentence end capitalizes the word already after it: typing "." in "he left, then"
//   (in place of the comma) gives "he left. Then"
// - a space typed after a sentence end does the same: "left.|then" -> "left. Then"
export function typingEdit(value, s, en, key, macros) {
  if (!WORD_END_KEYS.includes(key)) return null
  let before = value.slice(0, s)
  let after = value.slice(en)
  const changed = []
  const finished = s === en ? finishWord(before, after, macros, key) : null
  if (finished) {
    before = finished.before
    changed.push(finished.changed)
  }
  // Not for "..." (an ellipsis runs on) or a period ending an abbreviation like "p.m."
  if (".?!".includes(key) && !before.endsWith(".") && !NOT_SENTENCE_END.test(before + key + " ")) {
    const next = after.match(/^(["”]?\s+)([a-z])/)
    if (next) {
      after = next[1] + next[2].toUpperCase() + after.slice(next[0].length)
      const at = before.length + 1 + next[1].length
      changed.push([at, at + 1])
    }
  }
  if (key === " " && /[.?!]["”]?$/.test(before) && !/\.\.["”]?$/.test(before) && !NOT_SENTENCE_END.test(before + " ")) {
    const next = after.match(/^["“]?[a-z]/)
    if (next) {
      after = next[0].slice(0, -1) + next[0].slice(-1).toUpperCase() + after.slice(next[0].length)
      const at = before.length + next[0].length
      changed.push([at, at + 1])
    }
  }
  return changed.length ? { text: before + key + after, caret: before.length + 1, changed } : null
}

// Ctrl+' with text selected: quotes around it, with its first word capitalized ("go away" ->
// "\"Go away\""). Spaces at the edges of the selection stay outside the quotes. Returns
// { text, caret, changed } with the cursor after the closing quote, or null with no selection.
export function quoteSelection(value, s, en) {
  const selected = value.slice(s, en)
  const inner = selected.trim()
  if (!inner) return null
  const lead = selected.length - selected.trimStart().length
  const quoted = '"' + inner.replace(/^([("“'[]*)([a-z])/, (_, p, letter) => p + letter.toUpperCase()) + '"'
  const start = s + lead
  const text = value.slice(0, start) + quoted + value.slice(start + inner.length)
  return { text, caret: start + quoted.length, changed: [[start, start + quoted.length]] }
}

// Splitting an utterance at `cursor` with Enter: the word before the cursor is finished; if the
// split is mid-sentence (not after . , ? ! or a closing quote), the first part ends with " --",
// court style for speech cut off; and the new utterance's first word gets a capital. Returns
// both halves and the ranges changed in each.
export function splitEdit(value, cursor, macros) {
  const finished = finishWord(value.slice(0, cursor), "", macros)
  let before = finished ? finished.before : value.slice(0, cursor)
  const beforeChanged = finished ? [finished.changed] : []
  const trimmed = before.replace(/\s+$/, "")
  if (trimmed && !/(?:[.,?!"”]|--)$/.test(trimmed)) {
    before = trimmed + " --"
    beforeChanged.push([before.length - 2, before.length])
  }
  const after = value.slice(cursor).replace(/^\s+/, "")  // no leading space on the new utterance
  const started = capitalizeStart(after)
  return {
    before,
    after: started ? started.text : after,
    beforeChanged,
    afterChanged: started ? [started.changed] : [],
  }
}
