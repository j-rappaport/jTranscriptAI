// The ⌨ button in the bottom right and its list of keyboard shortcuts
import { useState } from "react"

const SHORTCUTS = [
  { keys: "Tab",        desc: "Play / Pause" },
  { keys: "Scroll Lock (hold)", desc: "Play while held, rewind 4s on release" },
  { keys: "Ctrl+[ ]",   desc: "Skip ±4 seconds" },
  { keys: "Ctrl+- +",   desc: "Slow down / speed up" },
  { keys: "↑ ↓",       desc: "Move selection" },
  { keys: "Enter",      desc: "New utterance at cursor" },
  { keys: "Shift+Enter", desc: "New line within block" },
  { keys: "F2",         desc: "Select speaker" },
  { keys: "Ctrl+'",     desc: "Put quotes around the selected text" },
  { keys: "Backspace",  desc: "At start: merge into previous block; when empty: delete block" },
  { keys: "Ctrl+Z",     desc: "Undo" },
  { keys: "Ctrl+Y",     desc: "Redo" },
]

export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false)
  return (
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        {open && (
          <div style={{ background: "white", border: "1px solid #e0e0e0", borderRadius: 4, padding: "12px 16px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#888", marginBottom: 10 }}>Shortcuts</div>
            {SHORTCUTS.map(({ keys, desc }) => (
              <div key={keys} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 6 }}>
                <span style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 11, background: "#f5f5f5", border: "1px solid #b0b0b0", borderRadius: 4, padding: "2px 7px", color: "#444", whiteSpace: "nowrap" }}>{keys}</span>
                <span style={{ fontSize: 12, color: "#555" }}>{desc}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => setOpen(o => !o)}
          title="Keyboard shortcuts"
          style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #b0b0b0", background: "white", cursor: "pointer", fontSize: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          ⌨
        </button>
      </div>
  )
}
