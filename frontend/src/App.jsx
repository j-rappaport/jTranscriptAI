import { useState, useEffect } from "react"
import ReviewPage from "./ReviewPage"

const API = import.meta.env.VITE_API_URL

// ---- Outside App() ---- pure utility functions that don't need state ----

function formatDuration(ms) {
  if (!ms) return "—"
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  })
}

// ---- App() ---- everything that touches state lives inside ----

export default function App() {
  const [file, setFile] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [jobs, setJobs] = useState([])
  const [authed, setAuthed] = useState(() => !!sessionStorage.getItem("auth"))
  const [loginUser, setLoginUser] = useState(() => sessionStorage.getItem("user") || "")
  const [loginPass, setLoginPass] = useState(() => sessionStorage.getItem("pass") || "")
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    if (authed) fetchJobs()
  }, [authed])

  function authHeaders() {
    return {
      "Authorization": "Basic " + btoa(`${loginUser}:${loginPass}`)
    }
  }

  async function handleLogin() {
    setLoginLoading(true)
    setLoginError(null)
    try {
      const res = await fetch(`${API}/jobs`, {
        headers: authHeaders()
      })
      if (res.ok) {
          sessionStorage.setItem("auth", "true")
          sessionStorage.setItem("user", loginUser)
          sessionStorage.setItem("pass", loginPass)
          setAuthed(true)
      } else {
        setLoginError("Invalid username or password")
      }
    } catch (e) {
      setLoginError("Could not connect to server")
    } finally {
      setLoginLoading(false)
    }
  }

  async function fetchJobs() {
    try {
      const res = await fetch(`${API}/jobs`, { headers: authHeaders() })
      const data = await res.json()
      setJobs(data)
    } catch (e) {
      console.error("Failed to fetch the jobs", e)
    }
  }

  function handleFile(f) {
    if (!f) return
    setFile(f)
    setJobId(null)
    setStatus(null)
    setError(null)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`${API}/jobs`, {
        method: "POST",
        headers: authHeaders(),
        body: formData
      })
      const data = await res.json()
      setJobId(data.job_id)
      setStatus("pending")
      poll(data.job_id)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  function poll(id) {
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`${API}/jobs/${id}`, { headers: authHeaders() })
        const data = await res.json()
        setStatus(data.status)
        if (data.status === "done" || data.status === "error") {
          clearInterval(iv)
          if (data.status === "error") setError(data.error)
          fetchJobs()
        }
      } catch (e) {
        clearInterval(iv)
        setError(e.message)
      }
    }, 3000)
  }

  function openReview(id) {
    setJobId(id)
    setReviewing(true)
  }

  // ---- Render: review page ----
  if (reviewing && jobId) {
    return <ReviewPage
      jobId={jobId}
      authHeaders={authHeaders}
      onBack={() => {
        setReviewing(false)
        setStatus(null)
        setJobId(null)
        setFile(null)
        fetchJobs()
      }}
    />
  }

  // ---- Render: login page ----
  if (!authed) {
    return (
      <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 380, margin: "120px auto", padding: "0 20px" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500&display=swap" rel="stylesheet" />

        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 32 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, letterSpacing: "-0.5px" }}>
            j<span style={{ color: "#185FA5" }}>Transcript</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", border: "0.5px solid #ddd", padding: "3px 8px", borderRadius: 4 }}>
            Court Edition
          </div>
        </div>

        <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 20 }}>Sign in</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Username</div>
            <input
              value={loginUser}
              onChange={e => setLoginUser(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 8, border: "0.5px solid #ddd", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Password</div>
            <input
              type="password"
              value={loginPass}
              onChange={e => setLoginPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              style={{ width: "100%", padding: "8px 12px", fontSize: 14, borderRadius: 8, border: "0.5px solid #ddd", boxSizing: "border-box" }}
            />
          </div>

          {loginError && (
            <div style={{ fontSize: 13, color: "#A32D2D", marginBottom: 12 }}>{loginError}</div>
          )}

          <button
            onClick={handleLogin}
            disabled={!loginUser || !loginPass || loginLoading}
            style={{
              width: "100%", padding: 13, borderRadius: 8, border: "none",
              background: (!loginUser || !loginPass || loginLoading) ? "#f0f0f0" : "#185FA5",
              color: (!loginUser || !loginPass || loginLoading) ? "#aaa" : "white",
              fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 500,
              cursor: (!loginUser || !loginPass || loginLoading) ? "not-allowed" : "pointer"
            }}
          >
            {loginLoading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </div>
    )
  }

  // ---- Render: main upload page ----
  const statusColor = { pending: "#185FA5", transcribing: "#185FA5", done: "#3B6D11", error: "#A32D2D" }
  const statusBg = { pending: "#E6F1FB", transcribing: "#E6F1FB", done: "#EAF3DE", error: "#FCEBEB" }

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", maxWidth: 660, margin: "48px auto", padding: "0 20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 32 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, letterSpacing: "-0.5px" }}>
          j<span style={{ color: "#185FA5" }}>Transcript</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888", border: "0.5px solid #ddd", padding: "3px 8px", borderRadius: 4 }}>
          Court Edition
        </div>
      </div>

      <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById("fileinput").click()}
          style={{
            border: `1.5px dashed ${dragging ? "#185FA5" : "#ccc"}`,
            borderRadius: 8, padding: "36px 24px", textAlign: "center", cursor: "pointer",
            background: dragging ? "#E6F1FB" : "transparent", transition: "all 0.15s"
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Drop audio file here</div>
          <div style={{ fontSize: 13, color: "#888" }}>
            or <span style={{ color: "#185FA5", fontWeight: 500 }}>browse to upload</span>
          </div>
          <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>MP3 · WAV · M4A · MP4 · AAC · FLAC</div>
          <input id="fileinput" type="file" accept=".mp3,.wav,.m4a,.mp4,.aac,.flac"
            style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
        </div>

        {file && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f7f7f7", borderRadius: 8, marginTop: 12 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, flex: 1 }}>{file.name}</span>
            <span style={{ fontSize: 12, color: "#888" }}>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
          </div>
        )}

        <button onClick={handleUpload} disabled={!file || uploading}
          style={{
            width: "100%", padding: 13, marginTop: 14, borderRadius: 8, border: "none",
            background: (!file || uploading) ? "#f0f0f0" : "#185FA5",
            color: (!file || uploading) ? "#aaa" : "white",
            fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 500,
            cursor: (!file || uploading) ? "not-allowed" : "pointer"
          }}>
          {uploading ? "Uploading…" : "Transcribe"}
        </button>

        {status && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, marginTop: 10, background: statusBg[status], color: statusColor[status], fontSize: 13 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor[status], flexShrink: 0 }} />
            {status === "done"
              ? <span>Done — <span onClick={() => setReviewing(true)} style={{ textDecoration: "underline", cursor: "pointer", fontWeight: 500 }}>Review transcript →</span></span>
              : status === "error" ? `Error: ${error}`
              : `Status: ${status}…`
            }
          </div>
        )}
      </div>

      {jobs.length > 0 && (
        <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "0.5px solid #f0f0f0" }}>
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#aaa" }}>
              Recent jobs
            </span>
          </div>
          {jobs.map((job, i) => (
            <div key={job.id} style={{
              display: "grid", gridTemplateColumns: "1fr 80px 80px auto",
              gap: 12, padding: "10px 16px", alignItems: "center",
              borderBottom: i < jobs.length - 1 ? "0.5px solid #f0f0f0" : "none",
              background: i % 2 === 0 ? "white" : "#fafafa"
            }}>
              <span style={{ fontSize: 13, color: "#222", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {job.filename}
              </span>
              <span style={{ fontSize: 12, color: "#888" }}>{formatDuration(job.audio_duration_ms)}</span>
              <span style={{ fontSize: 12, color: "#888" }}>{formatDate(job.created_at)}</span>
              {job.status === "done"
                ? <button
                    onClick={() => openReview(job.id)}
                    style={{
                      fontSize: 12, padding: "4px 12px", borderRadius: 6,
                      border: `0.5px solid ${job.audio_available ? "#185FA5" : "#ddd"}`,
                      background: "white",
                      color: job.audio_available ? "#185FA5" : "#aaa",
                      cursor: "pointer"
                    }}
                  >
                    {job.audio_available ? "Review" : "Review (no audio)"}
                  </button>
                : <span style={{
                    fontSize: 11, padding: "3px 8px", borderRadius: 4, fontWeight: 500,
                    background: job.status === "error" ? "#FCEBEB" : "#E6F1FB",
                    color: job.status === "error" ? "#A32D2D" : "#185FA5"
                  }}>
                    {job.status}
                  </span>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  )
}