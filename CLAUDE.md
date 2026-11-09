# jTranscript AI

Court transcription SaaS. FastAPI backend + React frontend.

## Structure
- `main.py` — FastAPI backend (all API routes, DB, transcription)
- `postprocess.py` — Post-processing rules applied to AssemblyAI output (editable transcript only; add rules to `RULES`). Optional post-processing rules go in `OPTIONAL_RULES` and get a button via `OPTIONAL_POSTPROCESSING` in `frontend/src/review/info.js`
- `frontend/src/App.jsx` — main upload page + login
- `frontend/src/review/` — transcript review UI. `ReviewPage.jsx` loads the job and edits blocks; parts: `BlockRow.jsx` (row + text box), `SpeakerPicker.jsx`, `AudioPanel.jsx`, `TranscriptInfo.jsx`, `HeaderBar.jsx`, `MacroEditor.jsx`, `ErrorCheckPanel.jsx`, `ShortcutsHelp.jsx`; hooks `useBlockSaving` (saves, stale-tab protection), `useUndoHistory`, `useErrorCheck`, `useTranscriptInfo`, `useMacros`
- `frontend/src/checks.js` — Check for errors (spelling with nspell, duplicate speakers)
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