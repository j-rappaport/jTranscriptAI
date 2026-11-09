// The sticky player panel: which mic tracks went into the mixdown, the audio player, playback
// speed, and the real clock time. It owns the playback position, so the clock ticking during
// playback re-renders only this panel, not the whole page.
import { useState, useEffect } from "react"
import { SPEED_PRESETS, msToRealClock } from "./clock"


// Which source mic channels went into the mono mixdown sent for transcription (see main.py's merge_audio_files)
function ChannelMixIndicator({ channelMix }) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "flex-end", marginBottom: 6 }}>
      {channelMix.map(ch => (
        <span
          key={ch.channel}
          title={`Track ${ch.channel}: ${ch.used ? "used" : "excluded"} (loudest ${ch.rms_peak_db} dB, average ${ch.rms_level_db} dB)`}
          style={{
            fontSize: 9, minWidth: 14, padding: "0 3px", borderRadius: 3, textAlign: "center", cursor: "default",
            border: ch.used ? "1px solid #16a34a" : "1px solid #d0d0d0",
            background: ch.used ? "#dcfce7" : "#f5f5f5",
            color: ch.used ? "#065f46" : "#aaa", fontWeight: ch.used ? 600 : 400,
            textDecoration: ch.used ? "none" : "line-through",
          }}
        >{ch.channel}</span>
      ))}
    </div>
  )
}

export default function AudioPanel({ audioRef, audioAvailable, audioUrl, channelMix, segmentMap, playbackRate, onPlaybackRate }) {
  const [currentMs, setCurrentMs] = useState(0)
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = playbackRate }, [playbackRate, audioRef])
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTimeUpdate = () => setCurrentMs(el.currentTime * 1000)
    el.addEventListener("timeupdate", onTimeUpdate)
    return () => el.removeEventListener("timeupdate", onTimeUpdate)
  }, [audioAvailable, audioRef])

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "white", border: "1px solid #c9c9c9", borderRadius: 4, padding: "12px 16px", marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      {channelMix && <ChannelMixIndicator channelMix={channelMix} />}
      {audioAvailable
        ? <audio ref={audioRef} controls src={audioUrl} style={{ width: "100%" }} />
        : <div style={{ fontSize: 13, color: "#aaa", padding: "8px 0" }}>Audio not available</div>}
      {audioAvailable && (
        <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#aaa", marginRight: 4 }}>Speed</span>
          {SPEED_PRESETS.map(r => (
            <button
              key={r}
              onMouseDown={e => e.preventDefault()}
              onClick={() => onPlaybackRate(r)}
              style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                border: playbackRate === r ? "1.5px solid #1a4480" : "1px solid #b0b0b0",
                background: playbackRate === r ? "#e7ecf1" : "white",
                color: playbackRate === r ? "#1a4480" : "#555", fontWeight: playbackRate === r ? 600 : 400
              }}
            >{r}×</button>
          ))}
          {segmentMap && (
            <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12, color: "#555" }}>
              {msToRealClock(currentMs, segmentMap)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
