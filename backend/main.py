import uuid
import os
import threading
from fastapi import FastAPI, UploadFile, File, HTTPException
from dotenv import load_dotenv
import assemblyai as aai
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

load_dotenv()

app = FastAPI(title="jTranscript")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory job store for now
jobs = {}

aai.settings.api_key = os.getenv("ASSEMBLYAI_API_KEY")

@app.get("/")
def root():
    return {"status": "ok"}

@app.post("/jobs")
async def create_job(file: UploadFile = File(...)):
    job_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    save_path = os.path.join(UPLOAD_DIR, f"{job_id}{ext}")

    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Record job as pending
    jobs[job_id] = {
        "status": "pending",
        "filename": file.filename,
        "audio_path": save_path,
        "utterances": None,
        "error": None
    }

    # Kick off transcription in background thread
    threading.Thread(
        target=run_transcription,
        args=(job_id, save_path),
        daemon=True
    ).start()

    return {"job_id": job_id, "status": "pending"}


@app.get("/jobs/{job_id}/audio")
def get_audio(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    audio_path = jobs[job_id]["audio_path"]
    return FileResponse(audio_path, media_type="audio/mpeg")

def run_transcription(job_id: str, audio_path: str):
    try:
        jobs[job_id]["status"] = "transcribing"
        config = aai.TranscriptionConfig(
            speaker_labels=True,
            speech_models=[aai.SpeechModel.universal]
        )
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(audio_path, config=config)

        if transcript.status == aai.TranscriptStatus.error:
            raise RuntimeError(transcript.error)

        jobs[job_id]["utterances"] = [
            {
                "speaker": f"SPEAKER {u.speaker}",
                "text": u.text,
                "start_ms": u.start,
                "end_ms": u.end
            }
            for u in transcript.utterances
        ]
        jobs[job_id]["status"] = "done"
        jobs[job_id]["audio_duration_ms"] = transcript.audio_duration * 1000

    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]