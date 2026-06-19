import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
SQLITE_PATH = Path(os.getenv("JOBLENS_SQLITE_PATH", BASE_DIR / "joblens_v4.db"))

SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id INTEGER NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NULL,
    device TEXT,
    browser TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    event_type TEXT NOT NULL,
    metadata TEXT,
    timestamp TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cv_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    extracted_skills TEXT,
    match_results TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    analysis_id INTEGER NULL,
    file_type TEXT NOT NULL,
    timestamp TEXT NOT NULL
);
"""


def now_iso():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_db():
    if DATABASE_URL.startswith(("postgres://", "postgresql://")):
        try:
            import psycopg
        except ImportError as exc:
            raise RuntimeError("Install psycopg[binary] to use PostgreSQL/Supabase DATABASE_URL.") from exc
        with psycopg.connect(DATABASE_URL) as conn:
            yield conn
    else:
        conn = sqlite3.connect(SQLITE_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


def init_db():
    if DATABASE_URL.startswith(("postgres://", "postgresql://")):
        schema = (BASE_DIR / "schema.sql").read_text(encoding="utf-8")
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(schema)
            conn.commit()
    else:
        with get_db() as conn:
            conn.executescript(SCHEMA_SQLITE)


def execute(sql, params=()):
    with get_db() as conn:
        cur = conn.execute(sql, params)
        return cur


def fetch_one(sql, params=()):
    with get_db() as conn:
        cur = conn.execute(sql, params)
        row = cur.fetchone()
        return dict(row) if row else None


def fetch_all(sql, params=()):
    with get_db() as conn:
        cur = conn.execute(sql, params)
        return [dict(row) for row in cur.fetchall()]


def json_dumps(value):
    return json.dumps(value or {}, ensure_ascii=False)


def upsert_user(name=None, email=None):
    if not email:
        return None
    existing = fetch_one("SELECT id FROM users WHERE email = ?", (email,))
    if existing:
        return existing["id"]
    execute(
        "INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)",
        (name or "Guest User", email, now_iso()),
    )
    row = fetch_one("SELECT id FROM users WHERE email = ?", (email,))
    return row["id"] if row else None
