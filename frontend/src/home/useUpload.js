// Uploading audio for a new transcription, then polling until AssemblyAI is done. Lives in the home
// page (not the upload window), so closing the window doesn't stop a transcription in progress.
import { useState, useEffect } from "react"
import { DEFAULT_BOOST_WORDS } from "./vocabulary"

const API = import.meta.env.VITE_API_URL

// TRM recordings are named like "..._20210315-0936_...": upload them in recording order
function parseFilenameTimestamp(name) {
  const m = name.match(/_(\d{8}-\d{4})_/)
  return m ? m[1] : name
}

export default function useUpload({ authHeaders, onCreated, onFinished, onNoCredits }) {
  const [files, setFiles] = useState([])
  const [jobId, setJobId] = useState(null)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [boostWords, setBoostWords] = useState(() => localStorage.getItem("jt_boost_words") ?? DEFAULT_BOOST_WORDS)

  useEffect(() => { localStorage.setItem("jt_boost_words", boostWords) }, [boostWords])

  function chooseFiles(incoming) {
    if (!incoming || incoming.length === 0) return
    const arr = Array.from(incoming).filter(f => !f.name.toLowerCase().endsWith(".trs"))
    if (arr.length === 0) return
    const sorted = [...arr].sort((a, b) => {
      const ta = parseFilenameTimestamp(a.name)
      const tb = parseFilenameTimestamp(b.name)
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })
    setFiles(sorted)
    setJobId(null)
    setStatus(null)
    setError(null)
  }

  async function upload() {
    if (!files.length) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      for (const f of files) formData.append("files", f)
      formData.append("word_boost", boostWords)
      const headers = await authHeaders()
      const res = await fetch(`${API}/jobs`, { method: "POST", headers, body: formData })
      if (res.status === 402) {
        onNoCredits()
        setError("No credits remaining.")
        return
      }
      if (res.status === 507) {
        setError((await res.json()).detail)
        return
      }
      const data = await res.json()
      setJobId(data.job_id)
      setStatus("pending")
      onCreated(data.job_id)
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
        const headers = await authHeaders()
        const res = await fetch(`${API}/jobs/${id}`, { headers })
        const data = await res.json()
        setStatus(data.status)
        if (data.status === "done" || data.status === "error") {
          clearInterval(iv)
          if (data.status === "error") setError(data.error)
          onFinished()
        }
      } catch (e) {
        clearInterval(iv)
        setError(e.message)
      }
    }, 3000)
  }

  // Ready for another upload (files cleared) unless one is still running
  function reset() {
    if (uploading || status === "pending" || status === "transcribing") return
    setFiles([])
    setJobId(null)
    setStatus(null)
    setError(null)
  }

  return { files, jobId, status, error, uploading, boostWords, setBoostWords, chooseFiles, upload, reset }
}
