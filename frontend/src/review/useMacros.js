// The user's macros (MacroEditor), kept in their settings on the server
import { useState, useEffect, useMemo } from "react"
import { API } from "./api"

export default function useMacros({ authHeaders }) {
  const [macros, setMacros] = useState([])  // [{ trigger, expansion }]
  const macroMap = useMemo(() => new Map(macros.map(m => [m.trigger, m.expansion])), [macros])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const headers = await authHeaders()
      fetch(`${API}/settings`, { headers })
        .then(r => r.json())
        .then(settings => { if (!cancelled) setMacros(settings.macros || []) })
        .catch(() => {})
    })()
    return () => { cancelled = true }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function saveMacros(list) {
    setMacros(list)
    const headers = await authHeaders()
    fetch(`${API}/settings`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ macros: list }),
    }).then(r => { if (!r.ok) throw new Error(r.status) })
      .catch(() => alert("Failed to save macros"))
  }

  return { macros, macroMap, saveMacros }
}
