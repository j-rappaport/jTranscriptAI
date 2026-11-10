import { useState, useEffect } from "react"
import { ClerkProvider, useAuth, SignIn, UserButton } from "@clerk/clerk-react"
import ReviewPage from "./review/ReviewPage"
import FileExplorer from "./home/FileExplorer"
import UploadWindow from "./home/UploadWindow"
import useFolders from "./home/useFolders"
import useUpload from "./home/useUpload"

const API = import.meta.env.VITE_API_URL
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const BRAND_FONT = "'Libre Franklin', Arial, sans-serif"

export function BrandLogo({ onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 13, cursor: onClick ? "pointer" : "default" }}>
      <svg width="35" height="42" viewBox="0 0 100 120" fill="none" style={{ flexShrink: 0 }}>
        <path
          d="M50 6 C72 6 88 14 88 14 L88 55 C88 85 70 108 50 114 C30 108 12 85 12 55 L12 14 C12 14 28 6 50 6 Z"
          fill="white"
        />
        <rect x="25" y="31" width="6" height="18" rx="2" fill="#1a4480" />
        <rect x="36" y="25" width="6" height="30" rx="2" fill="#1a4480" />
        <rect x="47" y="19" width="6" height="42" rx="2" fill="#1a4480" />
        <rect x="58" y="25" width="6" height="30" rx="2" fill="#1a4480" />
        <rect x="69" y="31" width="6" height="18" rx="2" fill="#1a4480" />
      </svg>
      <div style={{ textAlign: "left" }}>
        <div style={{ fontFamily: BRAND_FONT, fontSize: 18, fontWeight: 600, letterSpacing: "0.2px", color: "white" }}>
          Court Record Pro
        </div>
        <div style={{ fontFamily: BRAND_FONT, fontSize: 11, fontWeight: 400, color: "#cdd8e6", marginTop: -3 }}>
          Legal proceeding transcription service
        </div>
      </div>
    </div>
  )
}

function SiteFooter() {
  const col = { fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "#5a5a5a", marginBottom: 7 }
  const link = { fontSize: 10, color: "#1a4480", textDecoration: "none", display: "block", marginBottom: 4 }
  return (
    <div style={{ background: "#f0f0f0", borderTop: "1px solid #c9c9c9", marginTop: 48, padding: "24px 20px" }}>
      <div style={{ maxWidth: "min(1100px, 92vw)", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, textAlign: "left" }}>
        <div>
          <div style={col}>Contact</div>
          <a href="#" style={link}>Support</a>
          <a href="#" style={link}>Contact Us</a>
        </div>
        <div>
          <div style={col}>Resources</div>
          <a href="#" style={link}>Help Center</a>
          <a href="#" style={link}>System Status</a>
        </div>
        <div>
          <div style={col}>Legal</div>
          <a href="#" style={link}>Privacy Policy</a>
          <a href="#" style={link}>Accessibility</a>
        </div>
      </div>
    </div>
  )
}

function SignInPage() {
  return (
    <div style={{ fontFamily: "'Public Sans', Arial, sans-serif" }}>
      <div style={{ background: "#0d2c4f", height: 8 }} />
      <div style={{ background: "#1a4480", padding: "16px 24px" }}>
        <BrandLogo />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 60, padding: "0 20px" }}>
        <SignIn routing="hash" />
      </div>

      <SiteFooter />
    </div>
  )
}

const CREDIT_PACKS = [
  { id: "30m", label: "30 min",   price: "$1"  },
  { id: "5h",  label: "5 hours",  price: "$10" },
  { id: "15h", label: "15 hours", price: "$25" },
  { id: "50h", label: "50 hours", price: "$70" },
]

function HomePage() {
  const { getToken, isSignedIn, isLoaded } = useAuth()
  const [jobId, setJobId] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const [jobs, setJobs] = useState([])
  const [credits, setCredits] = useState(null)
  const [showBuyCredits, setShowBuyCredits] = useState(false)
  const [buyingPack, setBuyingPack] = useState(null)
  const [paymentNotice, setPaymentNotice] = useState(null)
  const [currentFolder, setCurrentFolder] = useState(null)  // the folder being viewed; null = Home
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFolder, setUploadFolder] = useState(null)  // where the upload in progress will be filed

  async function authHeaders() {
    const token = await getToken()
    return { Authorization: `Bearer ${token}` }
  }
  async function fetchJobs() {
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API}/jobs`, { headers })
      const data = await res.json()
      setJobs(data)
    } catch (e) {
      console.error("Failed to fetch jobs", e)
    }
  }
  async function fetchCredits() {
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API}/credits`, { headers })
      const data = await res.json()
      setCredits(data)
    } catch (e) {
      console.error("Failed to fetch credits", e)
    }
  }

  const folders = useFolders({ authHeaders, enabled: isSignedIn })
  const upload = useUpload({
    authHeaders,
    onCreated: id => { folders.moveJob(id, uploadFolder); fetchJobs() },
    onFinished: fetchJobs,
    onNoCredits: () => setShowBuyCredits(true),
  })

  useEffect(() => {
    const syncFromUrl = () => {
      const job = new URLSearchParams(window.location.search).get("job")
      if (job) { setJobId(job); setReviewing(true) }
      else { setReviewing(false); setJobId(null) }
    }
    syncFromUrl()
    window.addEventListener("popstate", syncFromUrl)
    return () => window.removeEventListener("popstate", syncFromUrl)
  }, [])

  useEffect(() => {
    if (isSignedIn) {
      fetchJobs()
      fetchCredits()
      const params = new URLSearchParams(window.location.search)
      if (params.get("payment") === "success") {
        setPaymentNotice("success")
        window.history.replaceState({}, "", "/")
        setTimeout(fetchCredits, 2000) // give webhook a moment
      } else if (params.get("payment") === "cancelled") {
        setPaymentNotice("cancelled")
        window.history.replaceState({}, "", "/")
      }
    }
  }, [isSignedIn])


  async function renameJob(id, filename) {
    const job = jobs.find(j => j.id === id)
    if (!job) return
    setJobs(js => js.map(j => j.id === id ? { ...j, filename } : j))
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API}/jobs/${id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      })
      if (!res.ok) throw new Error(res.status)
    } catch (e) {
      console.error("Failed to rename job", e)
      setJobs(js => js.map(j => j.id === id ? { ...j, filename: job.filename } : j))
    }
  }

  async function deleteJob(id) {
    const before = jobs
    setJobs(js => js.filter(j => j.id !== id))
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API}/jobs/${id}`, { method: "DELETE", headers })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail || res.status)
    } catch (e) {
      setJobs(before)
      alert(`Failed to delete the transcript: ${e.message}`)
    }
  }

  async function handleBuyCredits(packId) {
    setBuyingPack(packId)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API}/billing/checkout`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packId }),
      })
      const data = await res.json()
      window.location.href = data.url
    } catch (e) {
      console.error("Checkout failed", e)
      setBuyingPack(null)
    }
  }

  // A new transcription is filed in the folder being viewed when its window opens
  function openUploadWindow() {
    upload.reset()
    setUploadFolder(currentFolder)
    setUploadOpen(true)
  }

  function openReview(id) {
    setUploadOpen(false)
    setJobId(id)
    setReviewing(true)
    window.history.pushState({}, "", `/?job=${id}`)
  }

  if (!isLoaded) return null

  if (!isSignedIn) return <SignInPage />

  if (reviewing && jobId) {
    return <ReviewPage
      jobId={jobId}
      authHeaders={authHeaders}
      onBack={() => {
        setReviewing(false)
        setJobId(null)
        upload.reset()
        fetchJobs()
        window.history.pushState({}, "", "/")
      }}
    />
  }

  const creditsHours = credits?.credits_hours ?? null
  const lowCredits = creditsHours !== null && creditsHours < 0.5
  const destination = ["Home", ...folders.pathTo(uploadFolder).map(f => f.name)].join(" › ")

  return (
    <div style={{ fontFamily: "'Public Sans', Arial, sans-serif" }}>
      <div style={{ background: "#0d2c4f", height: 8 }} />
      <div style={{ background: "#1a4480", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BrandLogo onClick={() => window.location.reload()} />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {creditsHours !== null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <div style={{ fontSize: 12, color: lowCredits ? "#ffb4b4" : "#cdd8e6" }}>
                  {creditsHours.toFixed(1)} hrs remaining
                </div>
                <button
                  onClick={() => setShowBuyCredits(v => !v)}
                  style={{
                    fontSize: 12, padding: "6px 12px", borderRadius: 3,
                    border: "1px solid rgba(255,255,255,0.6)", background: "transparent",
                    color: "white", cursor: "pointer"
                  }}
                >
                  Buy credits
                </button>
              </div>
            )}
            <UserButton />
          </div>
      </div>

      <div style={{ maxWidth: "min(1100px, 92vw)", margin: "32px auto 48px", padding: "0 20px" }}>

      {paymentNotice === "success" && (
        <div style={{ marginBottom: 16, padding: "10px 16px", background: "#EAF3DE", color: "#3B6D11", borderRadius: 4, fontSize: 13 }}>
          Payment successful — your credits have been added.{" "}
          <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setPaymentNotice(null)}>Dismiss</span>
        </div>
      )}
      {paymentNotice === "cancelled" && (
        <div style={{ marginBottom: 16, padding: "10px 16px", background: "#FFF8E6", color: "#7A5800", borderRadius: 4, fontSize: 13 }}>
          Payment cancelled — no charges were made.{" "}
          <span style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setPaymentNotice(null)}>Dismiss</span>
        </div>
      )}

      {showBuyCredits && (
        <div style={{ background: "white", border: "1px solid #c9c9c9", borderRadius: 4, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, color: "#222" }}>Purchase transcription hours</div>
          <div style={{ display: "flex", gap: 10 }}>
            {CREDIT_PACKS.map(pack => (
              <button
                key={pack.id}
                onClick={() => handleBuyCredits(pack.id)}
                disabled={buyingPack === pack.id}
                style={{
                  flex: 1, padding: "12px 8px", borderRadius: 4,
                  border: "1px solid #b0b0b0", background: buyingPack === pack.id ? "#f0f0f0" : "white",
                  cursor: buyingPack === pack.id ? "wait" : "pointer",
                  textAlign: "center"
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, color: "#1a4480" }}>{pack.label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, margin: "4px 0" }}>{pack.price}</div>
                <div style={{ fontSize: 11, color: "#aaa" }}>
                  {pack.id === "30m" ? "$2.00/hr" : pack.id === "5h" ? "$2.00/hr" : pack.id === "15h" ? "$1.67/hr" : "$1.40/hr"}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <FileExplorer
        jobs={jobs}
        folders={folders}
        currentFolder={currentFolder}
        onOpenFolder={setCurrentFolder}
        onOpenJob={openReview}
        onRenameJob={renameJob}
        onDeleteJob={deleteJob}
        onNewTranscription={openUploadWindow}
      />
      </div>

      {uploadOpen && <UploadWindow upload={upload} destination={destination} onReview={openReview} onClose={() => setUploadOpen(false)} />}

      <SiteFooter />
    </div>
  )
}

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} appearance={{
      variables: { colorPrimary: "#1a4480" },
      elements: {
        avatarBox: { backgroundColor: "#1a4480" },
        userButtonAvatarBox: { backgroundColor: "#1a4480" },
      },
    }}>
      <HomePage />
    </ClerkProvider>
  )
}
