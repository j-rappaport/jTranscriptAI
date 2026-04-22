import uuid
import os
import threading
import psycopg2
import psycopg2.extras
import assemblyai as aai
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from fastapi import Depends
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets
import mimetypes
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

load_dotenv()

app = FastAPI(title="jTranscript")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBasic()

def require_auth(credentials: HTTPBasicCredentials = Depends(security)):
    correct_username = secrets.compare_digest(
        credentials.username, os.getenv("APP_USERNAME")
    )
    correct_password = secrets.compare_digest(
        credentials.password, os.getenv("APP_PASSWORD")
    )
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def db_create_job(job_id: str, filename: str, audio_path: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO jobs (id, status, filename, audio_path)
                VALUES (%s, %s, %s, %s)
                """,
                (job_id, "pending", filename, audio_path)
            )


def db_update_status(job_id: str, status: str, error: str = None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET status=%s, error=%s WHERE id=%s",
                (status, error, job_id)
            )


def db_update_done(job_id: str, utterances: list, duration_ms: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                SET status='done', utterances=%s, audio_duration_ms=%s
                WHERE id=%s
                """,
                (psycopg2.extras.Json(utterances), duration_ms, job_id)
            )


def db_get_job(job_id: str) -> dict:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM jobs WHERE id=%s", (job_id,))
            row = cur.fetchone()
            return dict(row) if row else None

def db_get_all_jobs() -> list:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, status, filename, audio_duration_ms, created_at, audio_path FROM jobs ORDER BY created_at DESC")
            rows = [dict(row) for row in cur.fetchall()]
            # Add audio_available flag, don't expose the path itself
            for row in rows:
                row["audio_available"] = bool(row["audio_path"] and os.path.exists(row["audio_path"]))
                del row["audio_path"]
            return rows


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

@app.get("/")
def root():
    return {"status": "ok"}


@app.post("/jobs")
async def create_job(file: UploadFile = File(...), user: str = Depends(require_auth)):
    delete_old_audio()  # clean up previous audio
    job_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    audio_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")

    with open(audio_path, "wb") as f:
        content = await file.read()
        f.write(content)

    db_create_job(job_id, file.filename, audio_path)

    threading.Thread(
        target=run_transcription,
        args=(job_id, audio_path),
        daemon=True
    ).start()

    return {"job_id": job_id, "status": "pending"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, user: str = Depends(require_auth)):
    job = db_get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
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
    return db_get_all_jobs()


@app.get("/jobs/{job_id}/audio-available")
def audio_available(job_id: str, user: str = Depends(require_auth)):
    job = db_get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    path = job["audio_path"]
    return {"available": bool(path and os.path.exists(path))}

# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------

def run_transcription(job_id: str, audio_path: str):
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

        utterances = [
            {
                "speaker": f"SPEAKER {u.speaker}",
                "text": u.text,
                "start_ms": u.start,
                "end_ms": u.end
            }
            for u in transcript.utterances
        ]

        duration_ms = int(transcript.audio_duration * 1000)
        db_update_done(job_id, utterances, duration_ms)

    except Exception as e:
        db_update_status(job_id, "error", str(e))


FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_frontend(full_path: str):
    with open(os.path.join(FRONTEND_DIST, "index.html")) as f:
        return f.read()