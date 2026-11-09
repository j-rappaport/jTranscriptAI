// Transcript info, filled in on the card above the transcript. Blank fields are null
// (unspecified). Use it to tailor the page, e.g. a META_BLOCKS defaultText can be a
// function of info.
export const TRANSCRIPT_TYPES = {
  court_proceeding: "Court proceeding",
  grand_jury: "Grand jury",
  interview: "Interview",
}
export const EMPTY_INFO = { date: null, time: null, type: null, county: null, case_number: null, volume: null, gj_number: null }

// Guesses for a job whose info hasn't been filled in: TRM recordings carry their real
// local start time (segment_map), names like "GRAND JURY 2" or "GJ 2--Pete" mean a grand
// jury, and "YAMHILL COUNTY ..." names the county.
export function guessInfo(filename, segmentMap) {
  const info = { ...EMPTY_INFO, type: "court_proceeding" }
  if (segmentMap?.length) {
    const iso = new Date(segmentMap[0].local_start_ms).toISOString()  // local wall-clock time, stored as UTC
    info.date = iso.slice(0, 10)
    info.time = iso.slice(11, 16)
  }
  const gj = (filename || "").match(/\b(?:grand\s+jury|gj)\b\s*(?:no\.?\s*)?(\d+)?/i)
  if (gj) {
    info.type = "grand_jury"
    info.gj_number = gj[1] ?? null
  }
  const county = (filename || "").match(/\b([a-z]+)\s+county\b/i)
  if (county) info.county = county[1][0].toUpperCase() + county[1].slice(1).toLowerCase()
  return info
}

// Optional post-processing: rules that run only on demand (OPTIONAL_RULES in postprocess.py),
// one button each in the info card. confirm() is the warning shown before applying.
export const OPTIONAL_POSTPROCESSING = [
  {
    rule: "remove_fillers",
    label: "Remove fillers",
    confirm: () => `Remove fillers ("um", "uh")?`,
  },
]
