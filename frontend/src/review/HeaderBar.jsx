// The blue bar at the top of the Review page: logo, Home, and the ☰ menu of downloads and tools.
// menuItems: [{ label, onClick, primary }]
import { useState } from "react"
import { BrandLogo } from "../App"

export default function HeaderBar({ onBack, menuItems }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const itemStyle = { fontSize: 13, padding: "7px 10px", borderRadius: 4, border: "1px solid #b0b0b0", background: "white", color: "#555", cursor: "pointer", textAlign: "left" }
  return (
    <>
      <div style={{ background: "#0d2c4f", height: 8 }} />
      <div style={{ background: "#1a4480", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <BrandLogo onClick={onBack} />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={onBack}
            style={{
              fontSize: 12, padding: "6px 12px", borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.6)", background: "transparent",
              color: "white", cursor: "pointer"
            }}
          >
            Home
          </button>
          <div style={{ position: "relative" }}>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => setMenuOpen(v => !v)}
              aria-label="Menu"
              style={{
                width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.5)", background: "transparent", borderRadius: 3, cursor: "pointer"
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16M4 12h16M4 18h16" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            {menuOpen && (
              <div style={{
                position: "absolute", top: 38, right: 0, background: "white", border: "1px solid #c9c9c9",
                borderRadius: 3, boxShadow: "0 4px 10px rgba(0,0,0,0.15)", padding: 12, minWidth: 170, zIndex: 100,
                display: "flex", flexDirection: "column", gap: 8
              }}>
                {menuItems.map(({ label, onClick, primary }) => (
                  <button key={label} onMouseDown={e => e.preventDefault()} onClick={() => { onClick(); setMenuOpen(false) }}
                    style={primary ? { ...itemStyle, border: "1px solid #1a4480", color: "#1a4480", fontWeight: 600 } : itemStyle}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
