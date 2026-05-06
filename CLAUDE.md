# jTranscript AI

Court transcription SaaS. FastAPI backend + React frontend.

## Structure
- `main.py` — FastAPI backend (all API routes, DB, transcription)
- `frontend/src/App.jsx` — main upload page + login
- `frontend/src/ReviewPage.jsx` — transcript review UI
- `frontend/dist/` — built frontend (must be committed for deploy)
- `uploads/` — temporary audio files

## Stack
- Backend: FastAPI, psycopg2, AssemblyAI
- Frontend: React + Vite
- Database: Supabase (Postgres)
- Deploy: Railway

## Key facts
- Single user auth via HTTP Basic Auth (credentials in .env)
- Audio files deleted when new job uploaded
- Frontend must be rebuilt (`npm run build` in frontend/) and dist committed on every frontend change
- Local dev: uvicorn on 8000, Vite on 5173
- Production: Railway serves everything from main.py

## Ignore
- frontend/node_modules/
- venv/
- frontend/dist/assets/ (build artifacts)