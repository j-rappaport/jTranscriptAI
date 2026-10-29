import uuid
import os
import re
import struct
import threading
import time
import asyncio
import shutil
import errno
import io
import zipfile
import psycopg2
import psycopg2.extras
import assemblyai as aai
import stripe
import ffmpeg
from datetime import datetime, timezone, timedelta
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_LINE_SPACING, WD_ALIGN_PARAGRAPH
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from dotenv import load_dotenv
from fastapi import Depends
from typing import List
import mimetypes
import httpx
from jose import jwt as jose_jwt, JWTError
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from postprocess import postprocess_blocks

load_dotenv()

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
AUDIO_BUCKET = "audio"
DEFAULT_AUDIO_RETENTION_DAYS = 1825  # 5 years

CREDIT_PACKS = {
    "30m": {"hours": 0.5, "price_cents": 100,  "label": "30 minutes"},
    "5h":  {"hours": 5,   "price_cents": 1000, "label": "5 hours"},
    "15h": {"hours": 15,  "price_cents": 2500, "label": "15 hours"},
    "50h": {"hours": 50,  "price_cents": 7000, "label": "50 hours"},
}

app = FastAPI(title="jTranscript")

@app.on_event("startup")
async def mark_stuck_jobs():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET status='error', error='Interrupted — server restarted during transcription' "
                "WHERE status IN ('pending', 'transcribing')"
            )
    threading.Thread(target=run_retention_cleanup_loop, daemon=True).start()

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


def db_update_audio_path(job_id: str, audio_path: str):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE jobs SET audio_path=%s WHERE id=%s", (audio_path, job_id))


def db_update_audio_meta(job_id: str, segment_map: list, channel_mix: list):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET segment_map=%s, channel_mix=%s WHERE id=%s",
                (psycopg2.extras.Json(segment_map) if segment_map else None,
                 psycopg2.extras.Json(channel_mix) if channel_mix else None, job_id)
            )


def db_update_status(job_id: str, status: str, error: str = None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE jobs SET status=%s, error=%s WHERE id=%s",
                (status, error, job_id)
            )


def db_update_done(job_id: str, blocks: list, original_blocks: list, duration_ms: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs
                SET status='done', utterances=%s, original_utterances=%s, audio_duration_ms=%s
                WHERE id=%s
                """,
                (psycopg2.extras.Json(blocks), psycopg2.extras.Json(original_blocks), duration_ms, job_id)
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
                row["audio_available"] = bool(row["audio_path"])
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


def db_get_settings(user_id: str) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT settings FROM user_settings WHERE user_id=%s", (user_id,))
            row = cur.fetchone()
            return row[0] if row else {}


def db_update_settings(user_id: str, settings: dict) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_settings (user_id, settings)
                VALUES (%s, %s)
                ON CONFLICT (user_id) DO UPDATE
                SET settings = user_settings.settings || EXCLUDED.settings, updated_at = now()
                RETURNING settings
                """,
                (user_id, psycopg2.extras.Json(settings))
            )
            return cur.fetchone()[0]


def read_tutc_timestamp(data: bytes):
    idx = data.find(b'TUTC')
    if idx >= 0 and idx + 16 <= len(data):
        return struct.unpack('<Q', data[idx+8:idx+16])[0]
    return None

_FILETIME_EPOCH = datetime(1601, 1, 1, tzinfo=timezone.utc)

def read_tloc_local_ms(data: bytes):
    """Read the TRM 'TLOC' chunk (local recording time, Windows FILETIME: 100ns
    ticks since 1601-01-01) and return it as a "floating" epoch-ms value -- i.e.
    the literal wall-clock digits (hour/min/sec) reinterpreted as if UTC, so that
    formatting it with UTC-based methods anywhere reproduces those same digits
    regardless of server/browser timezone. Not a real UTC instant."""
    idx = data.find(b'TLOC')
    if idx < 0 or idx + 16 > len(data):
        return None
    raw = struct.unpack('<Q', data[idx+8:idx+16])[0]
    dt = _FILETIME_EPOCH + timedelta(microseconds=raw / 10)
    return int(dt.timestamp() * 1000)

# Multichannel mixdown. Courtroom recorders (e.g. .trm, 8 channels) give each mic its own
# channel, and how many are wired up, live, or just room noise varies job to job. Without
# explicit handling ffmpeg guesses a surround layout and downmixes by surround rules, which
# drops some mics into one ear only. Instead, measure every channel and mix only the live ones.
DEAD_CHANNEL_DB = 30      # loudest moment this far below the loudest channel's -> dead/unused mic
NOISE_ONLY_RANGE_DB = 5   # loudest moment this close to the channel's average -> steady hum, no speech

def _audio_stream(paths: list):
    inputs = [ffmpeg.input(p).audio for p in paths]
    return inputs[0] if len(inputs) == 1 else ffmpeg.concat(*inputs, v=0, a=1)

def measure_channels(paths: list) -> dict:
    """Per-channel stats (dB) over the whole job: {channel_number: {"RMS level", "RMS peak", "Peak level"}}.
    "RMS peak" is the loudest 0.5s window, so a mic used only briefly still registers as live."""
    _, err = (_audio_stream(paths)
              .filter('astats', length=0.5, measure_overall='none',
                      measure_perchannel='RMS_level+RMS_peak+Peak_level')
              .output('-', format='null')
              .run(quiet=True))
    stats, ch = {}, None
    for line in err.decode(errors='replace').splitlines():
        if m := re.search(r"Channel: (\d+)", line):
            ch = int(m.group(1))
            stats[ch] = {}
        elif ch is not None and (m := re.search(r"(RMS level|RMS peak|Peak level) dB: (\S+)", line)):
            stats[ch][m.group(1)] = max(float(m.group(2)), -200.0)
    return stats

def pick_live_channels(stats: dict) -> list:
    loudest = max(s["RMS peak"] for s in stats.values())
    audible = [c for c, s in stats.items() if s["RMS peak"] >= loudest - DEAD_CHANNEL_DB]
    speech = [c for c in audible if stats[c]["RMS peak"] - stats[c]["RMS level"] >= NOISE_ONLY_RANGE_DB]
    return speech or audible

def merge_audio_files(paths: list, output_path: str):
    """Returns the per-channel mix decision for multichannel input (None for mono):
    [{"channel", "used", "rms_peak_db", "rms_level_db"}, ...]"""
    stream = _audio_stream(paths)
    channel_mix = None
    probe = ffmpeg.probe(paths[0])
    channels = next(s["channels"] for s in probe["streams"] if s["codec_type"] == "audio")
    if channels > 1:
        stats = measure_channels(paths)
        live = pick_live_channels(stats)
        # Equal-weight sum; scale down only if the live channels' combined peaks could clip
        peak_sum = sum(10 ** (stats[c]["Peak level"] / 20) for c in live)
        gain = min(1.0, 0.95 / peak_sum) if peak_sum > 0 else 1.0
        channel_mix = [{"channel": c, "used": c in live,
                        "rms_peak_db": round(s["RMS peak"], 1), "rms_level_db": round(s["RMS level"], 1)}
                       for c, s in sorted(stats.items())]
        print(f"Audio mixdown: {channels} channels, mixing {live}, gain {gain:.2f}")
        # pan's "<" averages the channels (ffmpeg-python would escape the "=" form); volume restores the sum
        stream = (stream
                  .filter('pan', 'mono|c0<' + '+'.join(f'c{c - 1}' for c in live))
                  .filter('volume', round(len(live) * gain, 4)))
    (stream
     .output(output_path, acodec='libmp3lame', audio_bitrate='192k')
     .run(overwrite_output=True, quiet=True))
    return channel_mix

def build_segment_map(sorted_file_data):
    """Map each source file's position in the merged audio to its real-world local
    start time, from the (ts, local_ms, filename, path) tuples in merge order.
    Returns None if any file lacks a TLOC timestamp -- a partial map isn't useful."""
    if any(d[1] is None for d in sorted_file_data):
        return None
    segments = []
    cursor_ms = 0
    for _ts, local_ms, _filename, path in sorted_file_data:
        probe = ffmpeg.probe(path)
        duration_ms = int(float(probe['format']['duration']) * 1000)
        segments.append({"start_ms": cursor_ms, "end_ms": cursor_ms + duration_ms, "local_start_ms": local_ms})
        cursor_ms += duration_ms
    return segments

def extract_case_name(filename: str) -> str:
    m = re.match(r'^(.+?)_\d{8}-\d{4}_', filename)
    return m.group(1) if m else os.path.splitext(filename)[0]


# ---------------------------------------------------------------------------
# Supabase Storage (audio)
# ---------------------------------------------------------------------------

def _storage_headers():
    return {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }


def storage_upload(key: str, local_path: str):
    mime_type, _ = mimetypes.guess_type(local_path)
    with open(local_path, "rb") as f:
        resp = httpx.post(
            f"{SUPABASE_URL}/storage/v1/object/{AUDIO_BUCKET}/{key}",
            headers={**_storage_headers(), "Content-Type": mime_type or "application/octet-stream"},
            content=f.read(),
            timeout=120,
        )
    resp.raise_for_status()


def storage_sign_url(key: str, expires_in: int = 3600) -> str:
    resp = httpx.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/{AUDIO_BUCKET}/{key}",
        headers={**_storage_headers(), "Content-Type": "application/json"},
        json={"expiresIn": expires_in},
        timeout=30,
    )
    resp.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1{resp.json()['signedURL']}"


def storage_delete(key: str):
    resp = httpx.delete(
        f"{SUPABASE_URL}/storage/v1/object/{AUDIO_BUCKET}/{key}",
        headers=_storage_headers(),
        timeout=30,
    )
    resp.raise_for_status()


def cleanup_expired_audio():
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, user_id, audio_path, created_at FROM jobs WHERE audio_path IS NOT NULL")
            jobs = cur.fetchall()

    for job in jobs:
        retention_days = db_get_settings(job["user_id"]).get("audio_retention_days", DEFAULT_AUDIO_RETENTION_DAYS)
        if retention_days is None:
            continue  # explicit "keep forever"
        age_days = (datetime.now(timezone.utc) - job["created_at"]).days
        if age_days <= retention_days:
            continue
        try:
            storage_delete(job["audio_path"])
        except Exception as e:
            print(f"Retention cleanup: failed to delete audio for job {job['id']}: {e}")
            continue
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE jobs SET audio_path=NULL WHERE id=%s", (job["id"],))


def run_retention_cleanup_loop():
    while True:
        try:
            cleanup_expired_audio()
        except Exception as e:
            print(f"Retention cleanup loop failed: {e}")
        time.sleep(24 * 60 * 60)


# ---------------------------------------------------------------------------
# Docx generation
# ---------------------------------------------------------------------------

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "templates", "Transcript.dotm")
_W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
_ABBREV_RE = re.compile(r"\b(Mr|Mrs|Ms|Dr|Jr|Sr|vs|etc|No|St)\.  ", re.IGNORECASE)

def _open_dotm():
    with open(TEMPLATE_PATH, "rb") as f:
        data = f.read()
    inp = zipfile.ZipFile(io.BytesIO(data))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as out:
        for item in inp.infolist():
            content = inp.read(item.filename)
            if item.filename == "[Content_Types].xml":
                content = content.replace(
                    b"application/vnd.ms-word.template.macroEnabledTemplate.main+xml",
                    b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
                )
            out.writestr(item, content)
    buf.seek(0)
    return Document(buf)

def _normalize(text):
    text = re.sub(r"([.?])\s*", r"\1  ", text)
    text = _ABBREV_RE.sub(r"\1. ", text)
    return text.rstrip()

def _compute_roles(blocks):
    qa_on, next_role, roles = False, "Q", []
    for b in blocks:
        if b.get("type") == "utterance":
            marked = bool(b.get("qa"))
            if marked and not qa_on:
                next_role = "Q"
            qa_on = marked
            if qa_on:
                r = next_role
                next_role = "A" if r == "Q" else "Q"
                roles.append(r)
            else:
                roles.append("")
        else:
            roles.append("")
    return roles

def _add_para(doc, text=""):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    pf.line_spacing = 1.9
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    if text:
        run = p.add_run(text)
        run.font.name = "Courier New"
        run.font.size = Pt(12)
    return p

def generate_docx(blocks):
    doc = _open_dotm()

    # Keep first 4 preamble paragraphs, drop the rest
    body = doc.element.body
    paras = body.findall(f"{{{_W_NS}}}p")
    for p in paras[4:]:
        body.remove(p)

    roles = _compute_roles(blocks)
    prev_role = ""

    for i, block in enumerate(blocks):
        btype = block.get("type", "utterance")
        role = roles[i]

        if btype == "utterance":
            text = _normalize(block.get("text", ""))
            if role == "Q" and prev_role == "":
                _add_para(doc, f"BY {block['speaker']}:")
            line = f"\t{role}\t{text}" if role else f"\t\t{block['speaker']}:  {text}"
            _add_para(doc, line)
            prev_role = role
            continue

        # Meta blocks always break the Q/A "BY" header chain
        prev_role = ""

        lines = block.get("text", "").split("\n")

        if btype in ("witness_sworn", "witness_sworn_gj"):
            # First line is the witness name (centered, underlined, italic); the rest is body text
            p = _add_para(doc)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run(lines[0])
            run.font.name = "Courier New"
            run.font.size = Pt(12)
            run.underline = True
            run.italic = True
            for line in lines[1:]:
                _add_para(doc, line)

        elif btype == "header":
            for line in lines:
                if not line:
                    continue
                p = _add_para(doc)
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = p.add_run(line)
                run.font.name = "Courier New"
                run.font.size = Pt(12)
                run.underline = True

        elif btype in ("pause_in_proceedings", "whispered_discussion", "exhibit_received"):
            for line in lines:
                p = _add_para(doc, line)
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.post("/jobs")
async def create_job(files: List[UploadFile] = File(...), word_boost: str = Form(default=""), user: str = Depends(require_auth)):
    if db_get_credits(user) <= 0:
        raise HTTPException(status_code=402, detail="No credits remaining. Please purchase more to continue.")

    audio_files = [f for f in files if not f.filename.lower().endswith('.trs')]
    if not audio_files:
        raise HTTPException(status_code=400, detail="No audio files provided.")

    free_bytes = shutil.disk_usage(UPLOAD_DIR).free
    if free_bytes < 150 * 1024 * 1024:
        raise HTTPException(status_code=507, detail="Server storage is full — contact administrator.")

    job_id = str(uuid.uuid4())

    needs_ffmpeg = len(audio_files) > 1 or any(f.filename.lower().endswith('.trm') for f in audio_files)

    try:
        if needs_ffmpeg:
            file_data = []
            for i, f in enumerate(audio_files):
                content = await f.read()
                ext = os.path.splitext(f.filename)[1]
                temp_path = os.path.join(UPLOAD_DIR, f"{job_id}_{i}{ext}")
                with open(temp_path, "wb") as fp:
                    fp.write(content)
                ts = read_tutc_timestamp(content[:512])
                local_ms = read_tloc_local_ms(content[:512])
                file_data.append((ts if ts is not None else float('inf'), local_ms, f.filename, temp_path))

            file_data.sort(key=lambda x: (x[0], x[2]))
            sorted_paths = [d[3] for d in file_data]

            audio_path = os.path.join(UPLOAD_DIR, f"{job_id}.mp3")
            channel_mix = await asyncio.to_thread(merge_audio_files, sorted_paths, audio_path)
            segment_map = await asyncio.to_thread(build_segment_map, file_data)

            for p in sorted_paths:
                if os.path.exists(p):
                    os.remove(p)

            filename = extract_case_name(file_data[0][2])
        else:
            f = audio_files[0]
            content = await f.read()
            ext = os.path.splitext(f.filename)[1]
            audio_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")
            with open(audio_path, "wb") as fp:
                fp.write(content)
            filename = f.filename
            segment_map = channel_mix = None
    except OSError as e:
        if e.errno == errno.ENOSPC:
            raise HTTPException(status_code=507, detail="Server storage is full — contact administrator.")
        raise

    storage_key = f"{user}/{job_id}{os.path.splitext(audio_path)[1]}"
    db_create_job(job_id, filename, None, user)
    if segment_map or channel_mix:
        db_update_audio_meta(job_id, segment_map, channel_mix)

    boost_words = [w.strip() for w in word_boost.splitlines() if w.strip()]

    threading.Thread(
        target=run_transcription,
        args=(job_id, audio_path, storage_key, user, boost_words),
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
    if not job["audio_path"]:
        raise HTTPException(status_code=404, detail="Audio not available")
    return RedirectResponse(storage_sign_url(job["audio_path"]))

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


@app.get("/jobs/{job_id}/docx")
def get_docx(job_id: str, user: str = Depends(require_auth)):
    job = db_get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    blocks = job.get("utterances") or []
    base = os.path.splitext(job.get("filename", "transcript"))[0]
    buf = generate_docx(blocks)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{base}_transcript.docx"'},
    )


@app.get("/jobs/{job_id}/audio-available")
def audio_available(job_id: str, user: str = Depends(require_auth)):
    job = db_get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"available": bool(job["audio_path"])}


@app.get("/credits")
def get_credits(user: str = Depends(require_auth)):
    ms = db_get_credits(user)
    return {"credits_ms": ms, "credits_hours": round(ms / 3_600_000, 2)}


@app.get("/settings")
def get_settings(user: str = Depends(require_auth)):
    return db_get_settings(user)


@app.put("/settings")
def update_settings(body: dict, user: str = Depends(require_auth)):
    return db_update_settings(user, body)


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
        metadata={"user_id": user, "credits_ms": str(int(pack["hours"] * 3_600_000))},
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

def run_transcription(job_id: str, audio_path: str, storage_key: str, user_id: str, boost_words: list = []):
    try:
        storage_upload(storage_key, audio_path)
        db_update_audio_path(job_id, storage_key)
    except Exception as e:
        db_update_status(job_id, "error", f"Audio upload failed: {e}")
        if os.path.exists(audio_path):
            os.remove(audio_path)
        return

    try:
        db_update_status(job_id, "transcribing")

        config = aai.TranscriptionConfig(
            speaker_labels=True,
            speech_models=["universal-3-5-pro", "universal-3-pro", "universal-2"],
            word_boost=boost_words if boost_words else None,
            # prompt=(
            #     "Always: Transcribe speech exactly as heard. If uncertain or audio is unclear, mark as (indiscernible). "
            #     "After the first output, review the transcript again. Pay close attention to hallucinations, misspellings, or errors, "
            #     "and revise them like a computer performing spell and grammar checks. "
            #     "Ensure words and phrases make grammatical sense in sentences. "
            #     "When a voice says \"Okay\" as a brief acknowledgment or interruption of another speaker, treat it as the start of a new speaker turn."
            # ),
        )
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(audio_path, config=config)

        if transcript.status == aai.TranscriptStatus.error:
            raise RuntimeError(transcript.error)

        # Speakers are identified by speaker_id; "speaker" is only the display name and may repeat
        speaker_ids = {label: str(uuid.uuid4()) for label in {u.speaker for u in transcript.utterances}}
        blocks = [
            {
                "type": "utterance",
                "speaker_id": speaker_ids[u.speaker],
                "speaker": f"SPEAKER {u.speaker}",
                "text": u.text,
                "start_ms": u.start,
                "end_ms": u.end
            }
            for u in transcript.utterances
        ]

        duration_ms = int(transcript.audio_duration * 1000)
        db_update_done(job_id, postprocess_blocks(blocks), blocks, duration_ms)
        db_deduct_credits(user_id, duration_ms)

    except Exception as e:
        db_update_status(job_id, "error", str(e))
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

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