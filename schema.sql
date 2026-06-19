CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    device TEXT,
    browser TEXT
);
CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT REFERENCES sessions(session_id),
    event_type TEXT NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cv_analyses (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT REFERENCES sessions(session_id),
    extracted_skills JSONB,
    match_results JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS downloads (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT REFERENCES sessions(session_id),
    analysis_id BIGINT REFERENCES cv_analyses(id),
    file_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
