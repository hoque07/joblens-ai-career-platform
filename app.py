from collections import Counter
from io import BytesIO
from pathlib import Path
import json
import re

import fitz
from flask import Flask, jsonify, render_template, request, send_file


BASE_DIR = Path(__file__).resolve().parent
REQUIRED_COLUMNS = {
    "Company Name",
    "Position",
    "Skills Required",
    "Experience",
    "Work Type",
    "Company Overview",
}

NORMALIZATION_MAP = {
    "reactjs": "react",
    "react js": "react",
    "react.js": "react",
    "nodejs": "node.js",
    "node js": "node.js",
    "node.js": "node.js",
    "rest api": "rest apis",
    "restful api": "rest apis",
    "restful apis": "rest apis",
    "mongo db": "mongodb",
    "mongodb": "mongodb",
    "postgre sql": "postgresql",
    "postgres": "postgresql",
    "js": "javascript",
    "javascript": "javascript",
    "html5": "html",
    "css3": "css",
    "dotnet": ".net",
    ".net core": ".net",
    "c sharp": "c#",
    "ci cd": "ci/cd",
    "ci/cd": "ci/cd",
}

POSITIVE_WORDS = {
    "good",
    "great",
    "excellent",
    "flexible",
    "supportive",
    "learning",
    "growth",
    "friendly",
    "balance",
    "talented",
    "professional",
    "healthy",
}
NEGATIVE_WORDS = {
    "delayed",
    "poor",
    "bad",
    "toxic",
    "pressure",
    "low",
    "minimal",
    "problem",
    "issue",
    "nothing",
}

app = Flask(__name__)


def normalize_skill(skill):
    value = re.sub(r"\s+", " ", str(skill).strip().lower())
    value = value.replace("restful apis", "rest apis")
    return NORMALIZATION_MAP.get(value, value)


def split_skills(skill_text):
    if not isinstance(skill_text, str):
        return []
    skills = [normalize_skill(item) for item in re.split(r"[,;/|]", skill_text) if item.strip()]
    return sorted(set(skills))


def extract_pdf_text(file_storage):
    data = file_storage.read()
    doc = fitz.open(stream=data, filetype="pdf")
    text = " ".join(page.get_text("text") for page in doc)
    return re.sub(r"\s+", " ", text).strip()


def clean_search_text(text):
    text = text.lower()
    for variant, normalized in NORMALIZATION_MAP.items():
        text = re.sub(rf"\b{re.escape(variant)}\b", normalized, text)
    text = re.sub(r"[^a-z0-9.+#/\- ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def build_skill_catalog(dataset):
    skills = set()
    for job in dataset:
        skills.update(split_skills(job.get("Skills Required", "")))
    return sorted(skills)


def extract_skills(cv_text, catalog):
    searchable = clean_search_text(cv_text)
    words = set(searchable.split())
    found = set()

    for skill in catalog:
        normalized = normalize_skill(skill)
        if " " in normalized or "." in normalized or "#" in normalized or "/" in normalized:
            if re.search(rf"\b{re.escape(normalized)}\b", searchable):
                found.add(normalized)
        elif normalized in words:
            found.add(normalized)

    return sorted(found)


def parse_years(value):
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return 0.0
    match = re.search(r"(\d+(?:\.\d+)?)", value)
    return float(match.group(1)) if match else 0.0


def infer_candidate_years(cv_text):
    matches = re.findall(r"(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)", cv_text.lower())
    return max([float(item) for item in matches], default=0.0)


def infer_experience_level(years):
    if years >= 5:
        return "Senior"
    if years >= 2:
        return "Mid-level"
    if years > 0:
        return "Junior"
    return "Not detected"


def detect_name(cv_text):
    private_markers = ("email", "phone", "mobile", "address", "linkedin", "github")
    lines = [line.strip() for line in re.split(r"[\r\n]+", cv_text) if line.strip()]
    for line in lines[:8]:
        clean = re.sub(r"[^A-Za-z .'-]", "", line).strip()
        words = clean.split()
        if 2 <= len(words) <= 4 and not any(marker in line.lower() for marker in private_markers):
            if all(word[:1].isupper() for word in words if word):
                return clean
    return "Not detected"


def detect_salary(cv_text):
    patterns = [
        r"(?:expected salary|salary expectation|expected)\D{0,20}(\d[\d,]*(?:\s*(?:bdt|tk|usd|\$))?)",
        r"(\d[\d,]*)\s*(?:bdt|tk)\s*(?:expected|salary)?",
    ]
    for pattern in patterns:
        match = re.search(pattern, cv_text, re.I)
        if match:
            return match.group(1).strip()
    return "Not detected"


def detect_location(cv_text):
    known_locations = [
        "Dhaka",
        "Chattogram",
        "Chittagong",
        "Sylhet",
        "Rajshahi",
        "Khulna",
        "Barishal",
        "Rangpur",
        "Mymensingh",
        "Remote",
    ]
    lowered = cv_text.lower()
    for location in known_locations:
        if re.search(rf"\b{re.escape(location.lower())}\b", lowered):
            return location
    return "Not detected"


def review_score(overview):
    words = set(re.findall(r"[a-z]+", str(overview).lower()))
    positives = len(words.intersection(POSITIVE_WORDS))
    negatives = len(words.intersection(NEGATIVE_WORDS))
    score = 70 + positives * 6 - negatives * 8
    return max(35, min(100, score))


def experience_fit(candidate_years, required_years):
    if required_years <= 0:
        return 100
    if candidate_years >= required_years:
        return 100
    return round(max(35, (candidate_years / required_years) * 100), 2)


def work_type_fit(work_type):
    return 100 if str(work_type).strip() else 80


def priority_for(rank):
    if rank <= 2:
        return "High"
    if rank <= 4:
        return "Medium"
    return "Low"


def learning_time(priority):
    return {"High": "2-3 weeks", "Medium": "1-2 weeks", "Low": "3-5 days"}[priority]


def build_why(title, company, matched, missing):
    matched_text = ", ".join(matched[:4]) if matched else "your current transferable skills"
    missing_text = ", ".join(missing[:3]) if missing else "no major required skills"
    if missing:
        return (
            f"You are recommended for {title} at {company} because your CV matches {matched_text}. "
            f"Learning {missing_text} would improve your readiness for this role."
        )
    return (
        f"You are recommended for {title} at {company} because your CV already covers the main "
        f"required skills, including {matched_text}."
    )


def roadmap_items(missing_counter, limit=5):
    items = []
    for index, (skill, count) in enumerate(missing_counter.most_common(limit), start=1):
        priority = priority_for(index)
        items.append(
            {
                "skill": skill,
                "priority": priority,
                "reason": f"Appears as a missing requirement in {count} recommended role(s).",
                "estimated_time": learning_time(priority),
            }
        )
    return items


def dataset_intelligence(dataset):
    companies = set()
    positions = set()
    skills = Counter()
    work_types = Counter()

    for job in dataset:
        companies.add(str(job.get("Company Name", "")).strip())
        positions.add(str(job.get("Position", "")).strip())
        work_type = str(job.get("Work Type", "")).strip() or "Not specified"
        work_types[work_type] += 1
        for skill in split_skills(job.get("Skills Required", "")):
            skills[skill] += 1

    return {
        "total_jobs": len(dataset),
        "unique_companies": len([item for item in companies if item]),
        "unique_positions": len([item for item in positions if item]),
        "unique_skills": len(skills),
        "top_skills": [{"skill": skill, "count": count} for skill, count in skills.most_common(10)],
        "work_type_distribution": dict(work_types),
    }


def readable_summary(matches):
    if not matches:
        return "No matching company overview was available."

    top = matches[0]
    overview = top.get("company_overview") or "No company overview was provided."
    overview = re.sub(r"\s+", " ", overview).strip()
    overview = overview[:260] + ("..." if len(overview) > 260 else "")

    positives = []
    concerns = []
    for match in matches[:5]:
        text = str(match.get("company_overview", "")).lower()
        if any(word in text for word in ("good", "flexible", "balance", "growth", "learning")):
            positives.append(match["company"])
        if any(word in text for word in ("delayed", "poor", "pressure", "low", "toxic")):
            concerns.append(match["company"])

    lines = [
        f"Top company insight: {top['company']} describes the role environment as: {overview}",
    ]
    if positives:
        lines.append(f"Positive signals appear in reviews for {', '.join(sorted(set(positives))[:3])}.")
    if concerns:
        lines.append(f"Some reviews mention concerns for {', '.join(sorted(set(concerns))[:3])}; review these before applying.")
    return " ".join(lines)


def validate_dataset(dataset):
    if not isinstance(dataset, list) or not dataset:
        return "Dataset must be a non-empty JSON array of job objects."
    missing = REQUIRED_COLUMNS.difference(dataset[0].keys())
    if missing:
        return "Dataset is missing required column(s): " + ", ".join(sorted(missing))
    return None


def analyze_jobs(cv_text, dataset):
    catalog = build_skill_catalog(dataset)
    candidate_skills = extract_skills(cv_text, catalog)
    candidate_years = infer_candidate_years(cv_text)
    candidate_skill_set = set(candidate_skills)
    matches = []
    all_missing = Counter()

    for job in dataset:
        required_skills = split_skills(job.get("Skills Required", ""))
        required_set = set(required_skills)
        matched_skills = sorted(candidate_skill_set.intersection(required_set))
        missing_skills = sorted(required_set.difference(candidate_skill_set))
        required_count = len(required_set)
        skill_score = round((len(matched_skills) / required_count) * 100, 2) if required_count else 0
        gap_score = round((len(missing_skills) / required_count) * 100, 2) if required_count else 0
        exp_score = experience_fit(candidate_years, parse_years(job.get("Experience", "")))
        work_score = work_type_fit(job.get("Work Type", ""))
        company_score = review_score(job.get("Company Overview", ""))
        final_score = round(
            0.60 * skill_score + 0.20 * exp_score + 0.10 * work_score + 0.10 * company_score,
            2,
        )
        all_missing.update(missing_skills)
        title = job.get("Position", "Unknown Job")
        company = job.get("Company Name", "Unknown Company")
        job_missing_counter = Counter(missing_skills)

        matches.append(
            {
                "title": title,
                "company": company,
                "required_skills": required_skills,
                "matched_skills": matched_skills,
                "missing_skills": missing_skills,
                "skill_match_score": skill_score,
                "gap_score": gap_score,
                "experience_fit_score": exp_score,
                "work_type_fit_score": work_score,
                "company_review_score": company_score,
                "final_score": final_score,
                "score": final_score,
                "experience": job.get("Experience", ""),
                "work_type": job.get("Work Type", ""),
                "company_overview": job.get("Company Overview", "No overview provided."),
                "why_recommended": build_why(title, company, matched_skills, missing_skills),
                "job_roadmap": roadmap_items(job_missing_counter, 3),
            }
        )

    matches.sort(key=lambda item: item["final_score"], reverse=True)
    top_matches = matches[:10]
    top_missing = Counter()
    for match in top_matches:
        top_missing.update(match["missing_skills"])

    role_direction = top_matches[0]["title"] if top_matches else "Not detected"
    average_readiness = (
        round(sum(match["skill_match_score"] for match in top_matches) / len(top_matches), 2)
        if top_matches
        else 0
    )
    most_common_missing = top_missing.most_common(1)[0][0] if top_missing else "None"

    profile = {
        "name": detect_name(cv_text),
        "experience_level": infer_experience_level(candidate_years),
        "expected_salary": detect_salary(cv_text),
        "location": detect_location(cv_text),
        "role_direction": role_direction,
        "total_skills": len(candidate_skills),
    }
    overview = {
        "total_candidate_skills": len(candidate_skills),
        "average_readiness": average_readiness,
        "most_common_missing_skill": most_common_missing,
        "high_priority_missing_skills": [skill for skill, _ in top_missing.most_common(5)],
        "best_fit_job_family": role_direction,
    }

    return {
        "candidate_profile": profile,
        "skills": candidate_skills,
        "skill_gap_overview": overview,
        "matches": top_matches,
        "career_roadmap": roadmap_items(top_missing, 5),
        "dataset_intelligence": dataset_intelligence(dataset),
        "summary": readable_summary(top_matches),
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/process", methods=["POST"])
def process():
    cv_file = request.files.get("cvFile")
    dataset_file = request.files.get("datasetFile")

    if not cv_file:
        return jsonify({"error": "Missing CV file. Please upload a PDF CV."}), 400
    if not dataset_file:
        return jsonify({"error": "Missing dataset file. Please upload a JSON dataset."}), 400

    try:
        dataset = json.load(dataset_file)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid JSON dataset. Please upload a valid JSON file."}), 400

    dataset_error = validate_dataset(dataset)
    if dataset_error:
        return jsonify({"error": dataset_error}), 400

    try:
        cv_text = extract_pdf_text(cv_file)
    except Exception as exc:
        return jsonify({"error": f"Could not read PDF text: {exc}"}), 400

    if not cv_text:
        return jsonify({"error": "The uploaded PDF did not contain readable text."}), 400

    result = analyze_jobs(cv_text, dataset)
    if not result["matches"]:
        return jsonify({"error": "No matched jobs were found in the dataset."}), 404

    result["api_payload"] = {
        "candidate_profile": result["candidate_profile"],
        "skill_gap_overview": result["skill_gap_overview"],
        "top_match": result["matches"][0] if result["matches"] else None,
        "career_roadmap": result["career_roadmap"],
        "dataset_intelligence": result["dataset_intelligence"],
    }
    return jsonify(result)


def draw_wrapped_text(page, text, x, y, width, fontsize=10, color=(0.1, 0.15, 0.23)):
    words = str(text).split()
    line = ""
    line_height = fontsize + 5
    for word in words:
        candidate = f"{line} {word}".strip()
        if fitz.get_text_length(candidate, fontsize=fontsize) <= width:
            line = candidate
        else:
            page.insert_text((x, y), line, fontsize=fontsize, color=color)
            y += line_height
            line = word
    if line:
        page.insert_text((x, y), line, fontsize=fontsize, color=color)
        y += line_height
    return y


def add_pdf_section(page, title, y):
    page.insert_text((44, y), title, fontsize=15, color=(0.08, 0.28, 0.62))
    page.draw_line((44, y + 7), (552, y + 7), color=(0.78, 0.84, 0.92), width=0.8)
    return y + 24


def build_report_pdf(report):
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 44

    page.insert_text((40, y), "JobLens AI - Offline Analysis Report", fontsize=20, color=(0.03, 0.13, 0.28))
    y += 22
    page.insert_text((40, y), "CV match accuracy, skill gaps, company summary and roadmap for offline analysis.", fontsize=10, color=(0.35, 0.43, 0.55))
    y += 24

    profile = report.get("candidate_profile", {})
    overview = report.get("skill_gap_overview", {})
    matches = report.get("matches", [])
    top = matches[0] if matches else {}

    y = add_pdf_section(page, "Candidate Summary", y)
    summary_items = [
        ("Name", profile.get("name", "Not detected")),
        ("Experience", profile.get("experience_level", "Not detected")),
        ("Location", profile.get("location", "Not detected")),
        ("Role Direction", profile.get("role_direction", "Not detected")),
        ("Total Skills", profile.get("total_skills", 0)),
    ]
    for label, value in summary_items:
        page.insert_text((54, y), f"{label}: {value}", fontsize=9.5, color=(0.12, 0.18, 0.28))
        y += 14

    y += 4
    y = add_pdf_section(page, "Accuracy and Score Breakdown", y)
    score_items = [
        ("Final Match Accuracy", top.get("final_score", 0)),
        ("Skill Match", top.get("skill_match_score", 0)),
        ("Experience Fit", top.get("experience_fit_score", 0)),
        ("Work Type Fit", top.get("work_type_fit_score", 0)),
        ("Company Review Fit", top.get("company_review_score", 0)),
        ("Gap Score", top.get("gap_score", 0)),
        ("Average Readiness", overview.get("average_readiness", 0)),
    ]
    for label, value in score_items:
        page.insert_text((54, y), f"{label}: {float(value or 0):.1f}%", fontsize=9.5, color=(0.12, 0.18, 0.28))
        y += 14

    y += 4
    y = add_pdf_section(page, "Top Recommended Jobs", y)
    for index, match in enumerate(matches[:8], start=1):
        line = (
            f"{index}. {match.get('title', 'Unknown role')} at {match.get('company', 'Unknown company')} "
            f"- Accuracy {float(match.get('final_score', 0)):.1f}%, Gap {float(match.get('gap_score', 0)):.1f}%"
        )
        y = draw_wrapped_text(page, line, 54, y, 486, fontsize=9)
        y += 1

    if y > 620:
        page = doc.new_page(width=595, height=842)
        y = 44
    else:
        y += 4

    y = add_pdf_section(page, "Matched and Missing Skills", y)
    y = draw_wrapped_text(page, "Matched Skills: " + ", ".join(top.get("matched_skills", []) or ["None"]), 54, y, 486, fontsize=9)
    y += 3
    y = draw_wrapped_text(page, "Missing Skills: " + ", ".join(top.get("missing_skills", []) or ["None"]), 54, y, 486, fontsize=9)
    y += 8

    y = add_pdf_section(page, "Career Roadmap", y)
    for item in report.get("career_roadmap", [])[:5]:
        line = f"{item.get('skill')} ({item.get('priority')}): {item.get('reason')} Estimated time: {item.get('estimated_time')}."
        y = draw_wrapped_text(page, line, 54, y, 486, fontsize=9)
        y += 2

    y += 4
    y = add_pdf_section(page, "Company Review Summary", y)
    y = draw_wrapped_text(page, report.get("summary", "No summary available."), 54, y, 486, fontsize=10.5)

    pdf_bytes = doc.tobytes()
    doc.close()
    pdf = BytesIO(pdf_bytes)
    pdf.seek(0)
    return pdf


@app.route("/download_report_pdf", methods=["POST"])
def download_report_pdf():
    report = request.get_json(silent=True)
    if not report:
        return jsonify({"error": "No report data was provided for PDF download."}), 400

    pdf = build_report_pdf(report)
    return send_file(
        pdf,
        mimetype="application/pdf",
        as_attachment=True,
        download_name="joblens-analysis-report.pdf",
        max_age=0,
    )


if __name__ == "__main__":
    app.run(debug=True)
