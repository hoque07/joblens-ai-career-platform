from database import execute, fetch_all, fetch_one, json_dumps, now_iso, upsert_user


def start_session(session_id, user=None, device="", browser=""):
    user_id = upsert_user((user or {}).get("name"), (user or {}).get("email")) if user else None
    existing = fetch_one("SELECT session_id FROM sessions WHERE session_id = ?", (session_id,))
    if existing:
        return
    execute(
        "INSERT INTO sessions (session_id, user_id, start_time, device, browser) VALUES (?, ?, ?, ?, ?)",
        (session_id, user_id, now_iso(), device, browser),
    )


def end_session(session_id):
    execute("UPDATE sessions SET end_time = ? WHERE session_id = ?", (now_iso(), session_id))


def track_event(session_id, event_type, metadata=None):
    if not session_id:
        return
    if event_type == "session_start":
        start_session(session_id, metadata.get("user") if isinstance(metadata, dict) else None,
                      metadata.get("device", "") if isinstance(metadata, dict) else "",
                      metadata.get("browser", "") if isinstance(metadata, dict) else "")
    if event_type == "session_end":
        end_session(session_id)
    execute(
        "INSERT INTO events (session_id, event_type, metadata, timestamp) VALUES (?, ?, ?, ?)",
        (session_id, event_type, json_dumps(metadata), now_iso()),
    )


def save_analysis(session_id, extracted_skills, match_results):
    cur = execute(
        "INSERT INTO cv_analyses (session_id, extracted_skills, match_results, created_at) VALUES (?, ?, ?, ?)",
        (session_id, json_dumps(extracted_skills), json_dumps(match_results), now_iso()),
    )
    return cur.lastrowid


def save_download(session_id, analysis_id=None, file_type="pdf"):
    execute(
        "INSERT INTO downloads (session_id, analysis_id, file_type, timestamp) VALUES (?, ?, ?, ?)",
        (session_id, analysis_id, file_type, now_iso()),
    )


def history_for_session(session_id):
    return fetch_all(
        "SELECT id, extracted_skills, match_results, created_at FROM cv_analyses WHERE session_id = ? ORDER BY id DESC LIMIT 20",
        (session_id,),
    )


def admin_stats():
    totals = {
        "total_users": fetch_one("SELECT COUNT(*) AS value FROM users")["value"],
        "total_sessions": fetch_one("SELECT COUNT(*) AS value FROM sessions")["value"],
        "total_cv_uploads": fetch_one("SELECT COUNT(*) AS value FROM events WHERE event_type = 'cv_uploaded'")["value"],
        "total_downloads": fetch_one("SELECT COUNT(*) AS value FROM downloads")["value"],
        "total_analyses": fetch_one("SELECT COUNT(*) AS value FROM cv_analyses")["value"],
    }
    role_rows = fetch_all("SELECT match_results FROM cv_analyses ORDER BY id DESC LIMIT 200")
    skills = {}
    roles = {}
    scores = []
    import json
    for row in role_rows:
        try:
            payload = json.loads(row.get("match_results") or "{}")
        except json.JSONDecodeError:
            continue
        matches = payload.get("matches") or []
        if matches:
            top = matches[0]
            roles[top.get("title", "Unknown")] = roles.get(top.get("title", "Unknown"), 0) + 1
            scores.append(float(top.get("final_score") or 0))
        for skill in payload.get("skills") or []:
            skills[skill] = skills.get(skill, 0) + 1
    return {
        **totals,
        "most_searched_job_roles": sorted(roles.items(), key=lambda item: item[1], reverse=True)[:10],
        "most_common_skills": sorted(skills.items(), key=lambda item: item[1], reverse=True)[:15],
        "average_match_score": round(sum(scores) / len(scores), 2) if scores else 0,
    }
