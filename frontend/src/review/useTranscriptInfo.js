// The transcript info (TranscriptInfo card): edits save to the job half a second after typing stops
import { useState, useRef } from "react"
import { API } from "./api"
import { EMPTY_INFO } from "./info"

export default function useTranscriptInfo({ jobId, authHeaders }) {
  const [info, setInfo] = useState(EMPTY_INFO)
  const infoRef = useRef(EMPTY_INFO)
  const saveTimerRef = useRef(null)

  // The info as loaded with the job (not saved back until edited, or a .docx is downloaded)
  function loadInfo(loaded) {
    infoRef.current = loaded
    setInfo(loaded)
  }

  function updateInfo(key, value) {
    const next = { ...infoRef.current, [key]: value === "" ? null : value }
    infoRef.current = next
    setInfo(next)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(saveInfoNow, 600)
  }

  async function saveInfoNow() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    const headers = await authHeaders()
    await fetch(`${API}/jobs/${jobId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ info: infoRef.current }),
    }).catch(() => {})
  }

  return { info, infoRef, loadInfo, updateInfo, saveInfoNow }
}
