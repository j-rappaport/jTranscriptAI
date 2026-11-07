# jTranscript AI

Court transcription SaaS. FastAPI backend + React frontend.

## Structure
- `main.py` — FastAPI backend (all API routes, DB, transcription)
- `postprocess.py` — Post-processing rules applied to AssemblyAI output (editable transcript only; add rules to `RULES`). Optional post-processing rules go in `OPTIONAL_RULES` and get a button via `OPTIONAL_POSTPROCESSING` in `ReviewPage.jsx`
- `frontend/src/App.jsx` — main upload page + login
- `frontend/src/ReviewPage.jsx` — transcript review UI
- `frontend/src/autoEdit.js` — automatic edits while typing on the Review page (macros, auto-capitalization); each rule returns the new text and the ranges it changed, which the page flashes
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