// The home page's jobs, organized like a file explorer: a breadcrumb path, folders first, then
// transcripts. Click a folder to open it; drag transcripts and folders onto a folder (or a
// breadcrumb) to move them; double-click a transcript's name, or use a folder's ⋯ menu, to rename.
import { useState, useRef } from "react"
import { formatDuration, formatDate } from "./format"

const GRID = { display: "grid", gridTemplateColumns: "24px 1fr 90px 110px 190px", gap: 12, alignItems: "center", padding: "9px 16px" }
const smallButton = { fontSize: 12, padding: "4px 12px", borderRadius: 3, border: "1px solid #1a4480", background: "white", color: "#1a4480", cursor: "pointer" }

// An inline name editor: Enter or leaving it saves, Escape cancels
function NameEdit({ name, onSave, onCancel }) {
  const [draft, setDraft] = useState(name)
  const cancelledRef = useRef(false)
  return (
    <input
      autoFocus value={draft}
      onChange={e => setDraft(e.target.value)}
      onFocus={e => e.target.select()}
      onClick={e => e.stopPropagation()}
      onBlur={() => { if (cancelledRef.current) return; const n = draft.trim(); n && n !== name ? onSave(n) : onCancel() }}
      onKeyDown={e => {
        if (e.key === "Enter") e.target.blur()
        if (e.key === "Escape") { cancelledRef.current = true; onCancel() }
      }}
      style={{ fontSize: 13, padding: "2px 6px", margin: "-3px 0", minWidth: 0, borderRadius: 3, border: "1.5px solid #1a4480", outline: "none", color: "#222" }}
    />
  )
}

// The ⋯ button on a row and its menu: [{ label, onClick, danger }]
function RowMenu({ open, onToggle, onClose, items, title }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", position: "relative" }}>
      <button onClick={e => { e.stopPropagation(); onToggle() }} title={title}
        style={{ border: "1px solid #e0e0e0", background: "white", borderRadius: 3, color: "#888", cursor: "pointer", width: 28, height: 24 }}>⋯</button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 9 }} onClick={e => { e.stopPropagation(); onClose() }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 28, zIndex: 10, background: "white", border: "1px solid #b0b0b0", borderRadius: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", padding: "4px 0", minWidth: 120 }}>
            {items.map(({ label, onClick, danger }) => (
              <button key={label} onClick={() => { onClose(); onClick() }} style={{ ...menuItem, color: danger ? "#ef4444" : "#222" }}>{label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="#c9d6e8" stroke="#1a4480" strokeWidth="1.2" />
    </svg>
  )
}

function TranscriptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 3h8l4 4v14H6z" fill="white" stroke="#888" strokeWidth="1.2" />
      <path d="M9 11h6M9 14h6M9 17h4" stroke="#aaa" strokeWidth="1.2" />
    </svg>
  )
}

export default function FileExplorer({ jobs, folders, currentFolder, onOpenFolder, onOpenJob, onRenameJob, onDeleteJob, onNewTranscription }) {
  const [renaming, setRenaming] = useState(null)  // { kind: "folder" | "job", id }
  const [openMenu, setOpenMenu] = useState(null)  // id of the folder or transcript whose ⋯ menu is open
  const [dropTarget, setDropTarget] = useState(undefined)  // folder id (null = Home) being dragged over

  const path = folders.pathTo(currentFolder)
  const subfolders = folders.folders.filter(f => (f.parentId ?? null) === currentFolder).sort((a, b) => a.name.localeCompare(b.name))
  const here = jobs.filter(j => folders.folderOf(j.id) === currentFolder)
  const itemCount = id => folders.folders.filter(f => f.parentId === id).length + jobs.filter(j => folders.folderOf(j.id) === id).length

  // Drag and drop: rows carry { kind, id }; folders and breadcrumbs accept them
  const dragProps = (kind, id) => ({
    draggable: renaming?.id !== id,
    onDragStart: e => { e.dataTransfer.setData("application/x-jt-item", JSON.stringify({ kind, id })); e.dataTransfer.effectAllowed = "move" },
  })
  const dropProps = folderId => ({
    onDragOver: e => { if (e.dataTransfer.types.includes("application/x-jt-item")) { e.preventDefault(); setDropTarget(folderId) } },
    onDragLeave: () => setDropTarget(t => (t === folderId ? undefined : t)),
    onDrop: e => {
      e.preventDefault()
      setDropTarget(undefined)
      const item = JSON.parse(e.dataTransfer.getData("application/x-jt-item") || "null")
      if (!item) return
      if (item.kind === "job") folders.moveJob(item.id, folderId)
      else folders.moveFolder(item.id, folderId)
    },
  })
  const dropHighlight = folderId => (dropTarget === folderId ? { background: "#dbe7f5", outline: "2px solid #1a4480", outlineOffset: -2 } : {})

  function newFolder() {
    const id = folders.createFolder(currentFolder)
    setRenaming({ kind: "folder", id })
  }

  function deleteFolder(f) {
    const parent = path.length > 0 ? path[path.length - 1].name : "Home"
    const n = itemCount(f.id)
    if (!window.confirm(`Delete the folder "${f.name}"?${n ? ` Its ${n} item${n === 1 ? "" : "s"} will move to ${parent}.` : ""}`)) return
    folders.deleteFolder(f.id)
  }

  function deleteJob(job) {
    if (job.status === "pending" || job.status === "transcribing") { alert("This transcription is still in progress."); return }
    if (!window.confirm(`Delete the transcript "${job.filename}"? This can't be undone.`)) return
    onDeleteJob(job.id)
  }

  const crumb = (label, folderId, last) => (
    <span key={folderId ?? "home"} {...dropProps(folderId)} onClick={() => !last && onOpenFolder(folderId)}
      style={{ padding: "2px 6px", borderRadius: 3, cursor: last ? "default" : "pointer", color: last ? "#111" : "#1a4480", fontWeight: last ? 600 : 400, ...dropHighlight(folderId) }}>
      {label}
    </span>
  )

  return (
    <div style={{ background: "white", border: "1px solid #c9c9c9", borderRadius: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", fontSize: 14, minWidth: 0 }}>
          {crumb("Home", null, path.length === 0)}
          {path.map((f, i) => (
            <span key={f.id} style={{ display: "flex", alignItems: "center" }}>
              <span style={{ color: "#aaa", margin: "0 2px" }}>›</span>
              {crumb(f.name, f.id, i === path.length - 1)}
            </span>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={newFolder} style={{ ...smallButton, padding: "6px 12px" }}>New folder</button>
          <button onClick={onNewTranscription} style={{ ...smallButton, padding: "6px 14px", background: "#1a4480", color: "white", fontWeight: 500 }}>+ New transcription</button>
        </div>
      </div>

      <div style={{ ...GRID, padding: "6px 16px", fontSize: 11, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#aaa", borderBottom: "1px solid #f0f0f0" }}>
        <span /><span>Name</span><span>Length</span><span>Date</span><span />
      </div>

      {subfolders.map(f => (
        <div key={f.id} {...dragProps("folder", f.id)} {...dropProps(f.id)}
          onClick={() => renaming?.id !== f.id && onOpenFolder(f.id)}
          style={{ ...GRID, cursor: "pointer", borderBottom: "1px solid #f0f0f0", position: "relative", ...dropHighlight(f.id) }}
          onMouseEnter={e => { if (dropTarget === undefined) e.currentTarget.style.background = "#f5f8fc" }}
          onMouseLeave={e => { if (dropTarget === undefined) e.currentTarget.style.background = "" }}>
          <FolderIcon />
          {renaming?.id === f.id
            ? <NameEdit name={f.name} onSave={n => { folders.renameFolder(f.id, n); setRenaming(null) }} onCancel={() => setRenaming(null)} />
            : <span style={{ fontSize: 13, fontWeight: 500, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>}
          <span style={{ fontSize: 12, color: "#888" }}>{itemCount(f.id)} item{itemCount(f.id) === 1 ? "" : "s"}</span>
          <span />
          <RowMenu open={openMenu === f.id} onToggle={() => setOpenMenu(openMenu === f.id ? null : f.id)} onClose={() => setOpenMenu(null)}
            title="Folder options" items={[
              { label: "Rename", onClick: () => setRenaming({ kind: "folder", id: f.id }) },
              { label: "Delete", onClick: () => deleteFolder(f), danger: true },
            ]} />
        </div>
      ))}

      {here.map((job, i) => (
        <div key={job.id} {...dragProps("job", job.id)}
          style={{ ...GRID, borderBottom: i < here.length - 1 ? "1px solid #f0f0f0" : "none", background: i % 2 === 0 ? "white" : "#fafafa", cursor: "grab" }}>
          <TranscriptIcon />
          {renaming?.id === job.id
            ? <NameEdit name={job.filename} onSave={n => { onRenameJob(job.id, n); setRenaming(null) }} onCancel={() => setRenaming(null)} />
            : <span onDoubleClick={() => setRenaming({ kind: "job", id: job.id })} title="Double-click to rename; drag onto a folder to move"
                style={{ fontSize: 13, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text" }}>{job.filename}</span>}
          <span style={{ fontSize: 12, color: "#888" }}>{formatDuration(job.audio_duration_ms)}</span>
          <span style={{ fontSize: 12, color: "#888" }}>{formatDate(job.created_at)}</span>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
            {job.status === "done"
              ? <button onClick={() => onOpenJob(job.id)} style={{ ...smallButton, borderColor: job.audio_available ? "#1a4480" : "#b0b0b0", color: job.audio_available ? "#1a4480" : "#aaa" }}>
                  {job.audio_available ? "Review" : "Review (no audio)"}
                </button>
              : <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, fontWeight: 500, background: job.status === "error" ? "#FCEBEB" : "#e7ecf1", color: job.status === "error" ? "#A32D2D" : "#1a4480" }}>
                  {job.status}
                </span>}
            <RowMenu open={openMenu === job.id} onToggle={() => setOpenMenu(openMenu === job.id ? null : job.id)} onClose={() => setOpenMenu(null)}
              title="Transcript options" items={[
                { label: "Rename", onClick: () => setRenaming({ kind: "job", id: job.id }) },
                { label: "Delete", onClick: () => deleteJob(job), danger: true },
              ]} />
          </div>
        </div>
      ))}

      {subfolders.length === 0 && here.length === 0 && (
        <div style={{ padding: "36px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>
          {currentFolder === null && jobs.length === 0
            ? "No transcriptions yet. Start one with + New transcription."
            : "This folder is empty. Drag transcripts here, or start a new one."}
        </div>
      )}
    </div>
  )
}

const menuItem = { display: "block", width: "100%", textAlign: "left", padding: "7px 14px", fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "#222" }
