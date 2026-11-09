// Meta blocks are free text, edited directly on the Review page; `defaultText` is only the
// starting point on insert. The type just controls .docx formatting (see main.py's generate_docx).
// Witness blocks: the first line is the witness name (centered + underlined in the .docx).
export const META_BLOCKS = {
  witness_sworn: {
    label: "Witness Sworn",
    // Before a grand jury a witness isn't called on behalf of a party
    defaultText: info => info.type === "grand_jury"
      ? "______\nWas thereupon called as a witness; and, having been first duly sworn, was examined and testified as follows:"
      : "______\nWas thereupon called as a witness on behalf of the ____; and, having been first duly sworn, was examined and testified as follows:",
  },
  pause_in_proceedings: {
    label: "Pause in Proceedings",
    defaultText: "(Pause in proceedings, ___ - ___)",
  },
  recess_taken: {
    label: "Recess Taken",
    defaultText: "(Recess taken, ___ - ___)",
  },
  whispered_discussion: {
    label: "Whispered Discussion",
    defaultText: "(Whispered discussion, off the record, ___ - ___)",
  },
  exhibit_received: {
    label: "Exhibit Received",
    defaultText: "(___'s Exhibit No. ___ received.)",
  },
  header: {
    label: "Header",
    defaultText: "",
  },
}

// defaultText is a string, or a function of the transcript info returning one
export function metaDefaultText(type, info) {
  const d = META_BLOCKS[type].defaultText
  return typeof d === "function" ? d(info) : d
}
