// Times shown on the Review page

export const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5]

export function msToTimecode(ms) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
}

// segmentMap entries carry a "floating" local_start_ms (see main.py's read_tloc_local_ms):
// the literal recorded wall-clock digits reinterpreted as UTC, so UTC getters here
// reproduce those same digits regardless of the viewer's own timezone.
export function msToRealClock(ms, segmentMap) {
  const seg = segmentMap.find(s => ms < s.end_ms) || segmentMap[segmentMap.length - 1]
  const d = new Date(seg.local_start_ms + (ms - seg.start_ms))
  const h24 = d.getUTCHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const ampm = h24 < 12 ? "AM" : "PM"
  return `${String(h12).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}:${String(d.getUTCSeconds()).padStart(2,"0")} ${ampm}`
}
