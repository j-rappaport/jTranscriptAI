// Saving the transcript's blocks. Saves run one at a time, each sending the version it was based
// on. If the transcript changed elsewhere (another tab, a server-side fix), the server answers 409
// and this tab stops saving rather than overwrite the newer version (`stale` shows a banner).
import { useState, useRef } from "react"
import { API } from "./api"

export default function useBlockSaving({ jobId, authHeaders, blocksRef }) {
  const versionRef = useRef(null)
  const saveChainRef = useRef(Promise.resolve())
  const saveTimerRef = useRef(null)
  const staleRef = useRef(false)
  const [stale, setStale] = useState(false)

  function putBlocks(updated) {
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (staleRef.current) return
      const headers = await authHeaders()
      const res = await fetch(`${API}/jobs/${jobId}/blocks`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: updated, version: versionRef.current }),
      })
      if (res.status === 409) {
        staleRef.current = true
        setStale(true)
      } else if (res.ok) {
        versionRef.current = (await res.json()).version
      }
    }).catch(() => {})
  }

  function saveBlocksNow() {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    if (!blocksRef.current) return
    putBlocks(blocksRef.current)
  }

  // Typing saves a second after the last keystroke
  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(saveBlocksNow, 1000)
  }

  return {
    putBlocks, saveBlocksNow, scheduleSave, stale,
    setVersion: version => { versionRef.current = version },  // the version loaded from the server
    whenSaved: () => saveChainRef.current,                    // resolves once queued saves finish
  }
}
