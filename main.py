import uuid
import os
import threading
import psycopg2
import psycopg2.extras
import assemblyai as aai
import stripe
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from fastapi import Depends
import mimetypes
import httpx
from jose import jwt as jose_jwt, JWTError
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

load_dotenv()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

CREDIT_PACKS = {
    "5h":  {"hours": 5,  "price_cents": 1000, "label": "5 hours"},
    "15h": {"hours": 15, "price_cents": 2500, "label": "15 hours"},
    "50h": {"hours": 50, "price_cents": 7000, "label": "50 hours"},
}

app = FastAPI(title="jTranscript")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_jwks_cache = None

def _get_jwks():
    global _jwks_cache
    if _jwks_cache is None:
        _jwks_cache = httpx.get(os.getenv("CLERK_JWKS_URL")).json()
    return _jwks_cache

def _verify_token(token: str) -> str:
    global _jwks_cache
    jwks = _get_jwks()
    try:
        kid = jose_jwt.get_unverified_header(token).get("kid")
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if key is None:
            _jwks_cache = None
            jwks = _get_jwks()
            key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if key is None:
            raise HTTPException(status_code=401, detail="Unknown signing key")
        payload = jose_jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
        return payload["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication error")

def require_auth(authorization: str = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated",
                            headers={"WWW-Authenticate": "Bearer"})
    return _verify_token(authorization[7:])

aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def db_create_job(job_id: str, filename: str, audio_path: str, user_id: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO jobs (id, status, filename, audio_path, user_id)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (job_id, "pending", filename, audio_path, user_id)
            )


def db_update_status(job_id: str, status: str, error: str = None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET status=%s, error=%s WHERE id=%s",
                (status, error, job_id)
            )


def db_update_done(job_id: str, blocks: list, duration_ms: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                SET status='done', utterances=%s, audio_duration_ms=%s
                WHERE id=%s
                """,
                (psycopg2.extras.Json(blocks), duration_ms, job_id)
            )


def db_get_job(job_id: str) -> dict:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM jobs WHERE id=%s", (job_id,))
            row = cur.fetchone()
            return dict(row) if row else None

def db_update_blocks(job_id: str, blocks: list):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET utterances=%s WHERE id=%s",
                (psycopg2.extras.Json(blocks), job_id)
            )


def db_get_all_jobs(user_id: str) -> list:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, status, filename, audio_duration_ms, created_at, audio_path FROM jobs WHERE user_id=%s ORDER BY created_at DESC",
                (user_id,)
            )
            rows = [dict(row) for row in cur.fetchall()]
            for row in rows:
                row["audio_available"] = bool(row["audio_path"] and os.path.exists(row["audio_path"]))
                del row["audio_path"]
            return rows


def db_get_credits(user_id: str) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT credits_ms FROM user_credits WHERE user_id=%s", (user_id,))
            row = cur.fetchone()
            return row[0] if row else 0

def db_add_credits(user_id: str, ms: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_credits (user_id, credits_ms)
                VALUES (%s, %s)
                ON CONFLICT (user_id) DO UPDATE
                SET credits_ms = user_credits.credits_ms + EXCLUDED.credits_ms
                """,
                (user_id, ms)
            )

def db_deduct_credits(user_id: str, ms: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE user_credits SET credits_ms = credits_ms - %s WHERE user_id = %s",
                (ms, user_id)
            )


def delete_old_audio():
    """Delete audio files from all previous jobs."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT audio_path FROM jobs WHERE audio_path IS NOT NULL")
            rows = cur.fetchall()
            for row in rows:
                path = row[0]
                if path and os.path.exists(path):
                    os.remove(path)
# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.post("/jobs")
async def create_job(file: UploadFile = File(...), user: str = Depends(require_auth)):
    if db_get_credits(user) <= 0:
        raise HTTPException(status_code=402, detail="No credits remaining. Please purchase more to continue.")

    delete_old_audio()  # clean up previous audio
    job_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    audio_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")

    with open(audio_path, "wb") as f:
        content = await file.read()
        f.write(content)

    db_create_job(job_id, file.filename, audio_path, user)

    threading.Thread(
        target=run_transcription,
        args=(job_id, audio_path, user),
        daemon=True
    ).start()

    return {"job_id": job_id, "status": "pending"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, user: str = Depends(require_auth)):
    job = db_get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job["blocks"] = job.pop("utterances")
    return job


@app.get("/jobs/{job_id}/audio")
def get_audio(job_id: str):
    job = db_get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    path = job["audio_path"]
    mime_type, _ = mimetypes.guess_type(path)
    print(f"Serving audio: {path}, mime: {mime_type}")
    return FileResponse(path, media_type=mime_type or "audio/mpeg")

@app.get("/jobs")
def get_all_jobs(user: str = Depends(require_auth)):
    return db_get_all_jobs(user)


@app.put("/jobs/{job_id}/blocks")
def update_blocks(job_id: str, body: dict, user: str = Depends(require_auth)):
    job = db_get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db_update_blocks(job_id, body["blocks"])
    return {"ok": True}


@app.get("/jobs/{job_id}/audio-available")
def audio_available(job_id: str, user: str = Depends(require_auth)):
    job = db_get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    path = job["audio_path"]
    return {"available": bool(path and os.path.exists(path))}


@app.get("/health")
def health():
    return {
        "clerk_jwks_url_set": bool(os.getenv("CLERK_JWKS_URL")),
        "stripe_key_set": bool(os.getenv("STRIPE_SECRET_KEY")),
        "app_url_set": bool(os.getenv("APP_URL")),
    }

@app.get("/credits")
def get_credits(user: str = Depends(require_auth)):
    ms = db_get_credits(user)
    return {"credits_ms": ms, "credits_hours": round(ms / 3_600_000, 2)}


@app.post("/billing/checkout")
async def create_checkout(body: dict, user: str = Depends(require_auth)):
    pack = CREDIT_PACKS.get(body.get("pack"))
    if not pack:
        raise HTTPException(status_code=400, detail="Invalid pack")
    app_url = os.getenv("APP_URL", "http://localhost:5173")
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "product_data": {"name": f"jTranscript — {pack['label']} transcription credit"},
                "unit_amount": pack["price_cents"],
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"{app_url}/?payment=success",
        cancel_url=f"{app_url}/?payment=cancelled",
        client_reference_id=user,
        metadata={"user_id": user, "credits_ms": str(pack["hours"] * 3_600_000)},
    )
    return {"url": session.url}


@app.post("/billing/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(
            payload, sig, os.getenv("STRIPE_WEBHOOK_SECRET")
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session["metadata"]["user_id"]
        credits_ms = int(session["metadata"]["credits_ms"])
        db_add_credits(user_id, credits_ms)
    return {"ok": True}

# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------

def run_transcription(job_id: str, audio_path: str, user_id: str):
    try:
        db_update_status(job_id, "transcribing")

        # Note: speech_models takes a list, not speech_model
        config = aai.TranscriptionConfig(
            speaker_labels=True,
            speech_models=[aai.SpeechModel.universal]
        )
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(audio_path, config=config)

        if transcript.status == aai.TranscriptStatus.error:
            raise RuntimeError(transcript.error)

        blocks = [
            {
                "type": "utterance",
                "speaker": f"SPEAKER {u.speaker}",
                "text": u.text,
                "start_ms": u.start,
                "end_ms": u.end
            }
            for u in transcript.utterances
        ]

        duration_ms = int(transcript.audio_duration * 1000)
        db_update_done(job_id, blocks, duration_ms)
        db_deduct_credits(user_id, duration_ms)

    except Exception as e:
        db_update_status(job_id, "error", str(e))

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

@app.get("/")
async def serve_root():
    with open(os.path.join(FRONTEND_DIST, "index.html")) as f:
        return HTMLResponse(f.read())

@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_frontend(full_path: str):
    with open(os.path.join(FRONTEND_DIST, "index.html")) as f:
        return HTMLResponse(f.read())