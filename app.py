from flask import Flask, jsonify, render_template, request, send_file

from admin import admin_bp
from ai_engine import analyze_jobs, build_report_pdf, extract_pdf_text, parse_dataset
from analytics import history_for_session, save_analysis, save_download, track_event
from database import init_db

app = Flask(__name__)
app.register_blueprint(admin_bp)
init_db()


def session_id_from_request():
    return request.form.get("session_id") or request.headers.get("X-JobLens-Session") or request.json.get("session_id") if request.is_json and request.json else "anonymous"


@app.route("/")
def index():
    return render_template("index.html")


@app.post("/api/event")
def api_event():
    payload = request.get_json(silent=True) or {}
    session_id = payload.get("session_id") or "anonymous"
    event_type = payload.get("event_type") or "unknown"
    metadata = payload.get("metadata") or {}
    track_event(session_id, event_type, metadata)
    return jsonify({"ok": True})


@app.post("/api/upload_cv")
def api_upload_cv():
    cv_file = request.files.get("cvFile")
    session_id = request.form.get("session_id", "anonymous")
    if not cv_file:
        return jsonify({"error": "Missing CV file."}), 400
    try:
        text = extract_pdf_text(cv_file)
    except Exception as exc:
        return jsonify({"error": f"Could not read PDF: {exc}"}), 400
    if not text:
        return jsonify({"error": "The PDF did not contain readable text."}), 400
    track_event(session_id, "cv_uploaded", {"filename": cv_file.filename, "text_length": len(text)})
    return jsonify({"ok": True, "text_length": len(text), "preview": text[:400]})


@app.post("/api/analyze")
def api_analyze():
    session_id = request.form.get("session_id", "anonymous")
    target_role = request.form.get("target_role", "")
    cv_file = request.files.get("cvFile")
    dataset_file = request.files.get("datasetFile")
    if not cv_file:
        return jsonify({"error": "Missing CV file. Please upload a PDF CV."}), 400
    track_event(session_id, "analysis_started", {"target_role": target_role})
    try:
        cv_text = extract_pdf_text(cv_file)
    except Exception as exc:
        return jsonify({"error": f"Could not read PDF text: {exc}"}), 400
    if not cv_text:
        return jsonify({"error": "The uploaded PDF did not contain readable text."}), 400
    try:
        dataset = parse_dataset(dataset_file) if dataset_file else parse_dataset()
    except Exception as exc:
        return jsonify({"error": f"Dataset could not be loaded: {exc}"}), 400
    result = analyze_jobs(cv_text, dataset, target_role=target_role)
    if not result["matches"]:
        return jsonify({"error": "No matched jobs were found in the dataset."}), 404
    analysis_id = save_analysis(session_id, result.get("skills", []), result)
    result["analysis_id"] = analysis_id
    track_event(session_id, "analysis_completed", {"analysis_id": analysis_id, "top_role": result["matches"][0]["title"], "score": result["matches"][0]["final_score"]})
    return jsonify(result)


@app.get("/api/history")
def api_history():
    session_id = request.args.get("session_id", "anonymous")
    return jsonify({"history": history_for_session(session_id)})


@app.post("/download_report_pdf")
def download_report_pdf():
    report = request.get_json(silent=True) or {}
    if not report:
        return jsonify({"error": "No report data was provided for PDF download."}), 400
    session_id = request.headers.get("X-JobLens-Session", "anonymous")
    save_download(session_id, report.get("analysis_id"), "pdf")
    track_event(session_id, "pdf_downloaded", {"analysis_id": report.get("analysis_id")})
    return send_file(build_report_pdf(report), mimetype="application/pdf", as_attachment=True, download_name="joblens-v4-analysis-report.pdf", max_age=0)


@app.post("/process")
def process_legacy_alias():
    return api_analyze()


if __name__ == "__main__":
    app.run(debug=True)
