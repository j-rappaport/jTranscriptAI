// Folders for organizing jobs on the home page, like a file explorer. Kept in the user's settings
// (no database tables yet): folders as [{ id, name, parentId }], and jobFolders mapping a job ID
// to its folder's ID. Anything without a folder (null parent) is at Home.
import { useState, useEffect, useRef } from "react"

const API = import.meta.env.VITE_API_URL

export default function useFolders({ authHeaders, enabled }) {
  const [folders, setFolders] = useState([])
  const [jobFolders, setJobFolders] = useState({})
  const latest = useRef({ folders: [], jobFolders: {} })

  useEffect(() => {
    if (!enabled) return
    ;(async () => {
      const headers = await authHeaders()
      fetch(`${API}/settings`, { headers })
        .then(r => r.json())
        .then(s => apply(s.folders || [], s.job_folders || {}, false))
        .catch(() => {})
    })()
  }, [enabled])  // eslint-disable-line react-hooks/exhaustive-deps

  // Updates the state, and saves both to settings unless just loaded
  async function apply(nextFolders, nextJobFolders, save = true) {
    latest.current = { folders: nextFolders, jobFolders: nextJobFolders }
    setFolders(nextFolders)
    setJobFolders(nextJobFolders)
    if (!save) return
    const headers = await authHeaders()
    fetch(`${API}/settings`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ folders: nextFolders, job_folders: nextJobFolders }),
    }).catch(() => alert("Failed to save folders"))
  }

  // A folder can't move into itself or one of its own subfolders
  function isInside(folderId, ancestorId) {
    for (let f = folderId; f; f = latest.current.folders.find(x => x.id === f)?.parentId) {
      if (f === ancestorId) return true
    }
    return false
  }

  function createFolder(parentId, name = "New folder") {
    const folder = { id: crypto.randomUUID(), name, parentId }
    apply([...latest.current.folders, folder], latest.current.jobFolders)
    return folder.id
  }

  function renameFolder(id, name) {
    apply(latest.current.folders.map(f => f.id === id ? { ...f, name } : f), latest.current.jobFolders)
  }

  // Deleting a folder keeps what was in it: its jobs and subfolders move up to its parent
  function deleteFolder(id) {
    const { folders: fs, jobFolders: jf } = latest.current
    const parentId = fs.find(f => f.id === id)?.parentId ?? null
    const nextJobFolders = Object.fromEntries(Object.entries(jf).map(([job, f]) => [job, f === id ? parentId : f]))
    apply(fs.filter(f => f.id !== id).map(f => f.parentId === id ? { ...f, parentId } : f), nextJobFolders)
  }

  function moveJob(jobId, folderId) {
    apply(latest.current.folders, { ...latest.current.jobFolders, [jobId]: folderId })
  }

  function moveFolder(id, parentId) {
    if (id === parentId || isInside(parentId, id)) return
    apply(latest.current.folders.map(f => f.id === id ? { ...f, parentId } : f), latest.current.jobFolders)
  }

  // A job's folder, or null (Home) when it has none or its folder no longer exists
  function folderOf(jobId) {
    const f = jobFolders[jobId]
    return f && folders.some(x => x.id === f) ? f : null
  }

  // The path from Home to a folder, as folders
  function pathTo(folderId) {
    const path = []
    for (let f = folders.find(x => x.id === folderId); f; f = folders.find(x => x.id === f.parentId)) path.unshift(f)
    return path
  }

  return { folders, folderOf, pathTo, createFolder, renameFolder, deleteFolder, moveJob, moveFolder }
}
