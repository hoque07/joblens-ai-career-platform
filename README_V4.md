# JobLens AI Version 4 Setup

Version 4 turns JobLens into a Flask-based AI Career Intelligence backend with analytics, event tracking, admin stats, explainable matching, and a modular architecture.

## Main Files

- `app.py` - Flask routes only
- `ai_engine.py` - CV parsing, skill extraction, semantic/fallback matching, roadmap, PDF report
- `database.py` - SQLite by default, PostgreSQL/Supabase through `DATABASE_URL`
- `analytics.py` - sessions, events, analyses, downloads
- `admin.py` - `/admin` dashboard and `/api/admin/stats`
- `schema.sql` - PostgreSQL/Supabase schema
- `templates/index.html` - Flask frontend
- `static/js/main.js` - API calls, session tracking, event logging

## Local Run

```powershell
cd D:\joblens_system
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open:

```text
http://127.0.0.1:5000/
```

Admin dashboard:

```text
http://127.0.0.1:5000/admin
```

## Database

By default, Version 4 creates local SQLite:

```text
joblens_v4.db
```

For Supabase/PostgreSQL, set:

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
python app.py
```

Run `schema.sql` in Supabase SQL editor before using production Postgres.

## API Endpoints

- `POST /api/upload_cv`
- `POST /api/analyze`
- `POST /api/event`
- `GET /api/history?session_id=...`
- `GET /api/admin/stats`
- `POST /download_report_pdf`
- `/process` remains as a legacy alias

## AI Engine

The engine tries Sentence-BERT when installed:

```powershell
pip install sentence-transformers
```

If not installed, it automatically falls back to lightweight cosine matching, so the app still works.

## Privacy Rule

Do not store raw CV files in the database. V4 stores only events, extracted skills, match metadata, and report summaries.

## Deployment Notes

GitHub Pages is static only and cannot run this Flask backend. Deploy Flask to Render, Railway, Fly.io, or a VPS. Keep database credentials in environment variables.

For frontend-only GitHub Pages, point the JS API base URL to the deployed backend.
