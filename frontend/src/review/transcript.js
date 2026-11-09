// The transcript as text: Q/A labels, and the .txt and blob downloads
import { META_BLOCKS } from "./metaBlocks"

// Q/A role of each block ("Q", "A" or "") and its position, for alternating row shading.
// Q/A runs over contiguous qa-marked utterances, restarting at Q (main.py's _compute_roles mirrors this).
export function computeBlockDisplay(blocks) {
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

const ABBREVS = /\b(Mr|Mrs|Ms|Dr|Jr|Sr|vs|etc|No|St)\.  /gi

function normalizeSentenceSpacing(text) {
  return text
    .replace(/([.?])\s*/g, "$1  ")
    .replace(ABBREVS, "$1. ")
    .trimEnd()
}

// Plain-text transcript in the same layout as the .docx: BY lines, Q/A tabs, metadata blocks
export function transcriptText(blocks) {
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
  return lines.join("\n")
}

// All the spoken text run together, no speakers or layout
export function blobText(blocks) {
  return blocks
    .filter(b => b.type === "utterance")
    .map(b => normalizeSentenceSpacing(b.text))
    .join("  ")
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
