// Placing the cursor in a block's text, by block index (rows carry data-block-index)

export function blockTextarea(index) {
  return document.querySelector(`[data-block-index="${index}"] textarea`)
}

export function focusElementAt(el, pos) {
  if (!el) return false
  el.focus()
  el.setSelectionRange(pos, pos)
  return true
}

export function focusBlockStart(index) {
  focusElementAt(blockTextarea(index), 0)
}

// Where the cursor was in each block's text when it last left, so coming back without clicking
// into the text (clicking the row, closing the speaker picker or macro editor) returns there
// rather than to the start. Keyed by block index, so it's cleared when blocks are added or removed.
const caretMemory = { lastIndex: null, byIndex: new Map() }

export function rememberCaret(index, pos) {
  caretMemory.lastIndex = index
  caretMemory.byIndex.set(index, pos)
}

export function forgetCarets() {
  caretMemory.byIndex.clear()
  caretMemory.lastIndex = null
}

export function returnToBlockText(index) {
  focusElementAt(blockTextarea(index), caretMemory.byIndex.get(index) ?? 0)
}

export function returnToLastText() {
  if (caretMemory.lastIndex !== null) returnToBlockText(caretMemory.lastIndex)
}
