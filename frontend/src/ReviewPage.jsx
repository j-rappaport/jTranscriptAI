import { useState, useRef, useEffect } from "react"

const API = "http://localhost:8000"
const SNIPPET_LEN = 80

function msToTimecode(ms) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
}

function UtteranceRow({ utt, index, onRenameOne, onRenameAll, audioRef, audioAvailable }) {
  const [expanded, setExpanded] = useState(false)
  const needsExpand = utt.text.length > SNIPPET_LEN
  const displayText = needsExpand && !expanded
    ? utt.text.slice(0, SNIPPET_LEN) + "…"
    : utt.text

  function playFrom() {
    if (!audioRef.current) return
    audioRef.current.currentTime = utt.start_ms / 1000
    audioRef.current.play()
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "80px 160px 1fr auto",
      gap: 12,
      padding: "10px 16px",
      borderBottom: "0.5px solid #f0f0f0",
      alignItems: "start",
      background: index % 2 === 0 ? "white" : "#fafafa"
    }}>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#888", paddingTop: 2 }}>
        {msToTimecode(utt.start_ms)}
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          onClick={() => onRenameOne(index)}
          style={{ fontSize: 12, fontWeight: 500, color: "#185FA5", cursor: "pointer", lineHeight: 1.3 }}
          title="Rename this utterance"
        >
          {utt.speaker}
        </span>
        <span
          onClick={() => onRenameAll(utt.speaker)}
          style={{ fontSize: 11, color: "#aaa", cursor: "pointer" }}
          title="Rename all utterances with this speaker"
        >
          rename all
        </span>
      </div>

      <div>
        <span style={{ fontSize: 13, color: "#222", lineHeight: 1.6 }}>{displayText}</span>
        {needsExpand && (
          <span
            onClick={() => setExpanded(!expanded)}
            style={{ fontSize: 11, color: "#185FA5", cursor: "pointer", marginLeft: 8 }}
          >
            {expanded ? "less" : "more"}
          </span>
        )}
      </div>

      <button
        onClick={playFrom}
        disabled={!audioAvailable}
        style={{
          fontSize: 11, padding: "4px 10px", borderRadius: 6,
          border: `0.5px solid ${audioAvailable ? "#d1fae5" : "#eee"}`,
          background: audioAvailable ? "#f0fdf4" : "#f9f9f9",
          color: audioAvailable ? "#065f46" : "#bbb",
          cursor: audioAvailable ? "pointer" : "not-allowed",
          whiteSpace: "nowrap"
        }}
      >
        {audioAvailable ? "▶ Play" : "no audio"}
      </button>
    </div>
  )
}

export default function ReviewPage({ jobId, onBack, authHeaders }) {
  const [utterances, setUtterances] = useState(null)
  const [loading, setLoading] = useState(true)
  const [audioAvailable, setAudioAvailable] = useState(true)
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState("")
  const audioRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/jobs/${jobId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        setUtterances(data.utterances)
        setLoading(false)
      })
  
    fetch(`${API}/jobs/${jobId}/audio-available`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setAudioAvailable(data.available))
  
  }, [jobId])

  function openRenameOne(index) {
    setRenameTarget({ index, mode: "one" })
    setRenameValue(utterances[index].speaker)
  }

  function openRenameAll(speaker) {
    setRenameTarget({ speaker, mode: "all" })
    setRenameValue(speaker)
  }

  function applyRename() {
    const newName = renameValue.trim().toUpperCase()
    if (!newName) return
    const updated = utterances.map((u, i) => {
      if (renameTarget.mode === "one" && i === renameTarget.index)
        return { ...u, speaker: newName }
      if (renameTarget.mode === "all" && u.speaker === renameTarget.speaker)
        return { ...u, speaker: newName }
      return u
    })
    setUtterances(updated)
    setRenameTarget(null)
  }

  function saveTranscript() {
    const text = utterances
      .map(u => `${msToTimecode(u.start_ms)}  ${u.speaker}:  ${u.text}`)
      .join("\n")
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${jobId}_transcript.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 900, margin: "48px auto", padding: "0 20px" }}>
      <p style={{ color: "#888" }}>Loading transcript…</p>
    </div>
  )

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 900, margin: "48px auto", padding: "0 20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, letterSpacing: "-0.5px" }}>
            j<span style={{ color: "#185FA5" }}>Transcript</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", border: "0.5px solid #ddd", padding: "3px 8px", borderRadius: 4 }}>
            Review
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onBack} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, border: "0.5px solid #ddd", background: "white", cursor: "pointer", color: "#555" }}>
            ← New job
          </button>
          <button onClick={saveTranscript} style={{ fontSize: 13, padding: "7px 16px", borderRadius: 8, border: "none", background: "#185FA5", color: "white", cursor: "pointer" }}>
            💾 Save .txt
          </button>
        </div>
      </div>

      <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
{audioAvailable
  ? <audio 
      ref={audioRef} 
      controls 
      src={`${API}/jobs/${jobId}/audio`}
      style={{ width: "100%" }} 
    />
  : <div style={{ fontSize: 13, color: "#aaa", padding: "8px 0" }}>Audio not available</div>
}
      </div>

      <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "80px 160px 1fr auto",
          gap: 12, padding: "8px 16px",
          background: "#185FA5", color: "white", fontSize: 11,
          fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase"
        }}>
          <span>Time</span>
          <span>Speaker</span>
          <span>Text</span>
          <span></span>
        </div>

        {utterances.map((utt, i) => (
          <UtteranceRow
            key={i}
            index={i}
            utt={utt}
            onRenameOne={openRenameOne}
            onRenameAll={openRenameAll}
            audioRef={audioRef}
            audioAvailable={audioAvailable}
          />
        ))}
      </div>

      {renameTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
        }}>
          <div style={{ background: "white", borderRadius: 12, padding: 24, width: 360 }}>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
              {renameTarget.mode === "all" ? `Rename all "${renameTarget.speaker}"` : "Rename this speaker"}
            </div>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") applyRename(); if (e.key === "Escape") setRenameTarget(null) }}
              style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 8, border: "0.5px solid #ddd", boxSizing: "border-box", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setRenameTarget(null)} style={{ padding: "7px 16px", borderRadius: 8, border: "0.5px solid #ddd", background: "white", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={applyRename} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#185FA5", color: "white", cursor: "pointer" }}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}