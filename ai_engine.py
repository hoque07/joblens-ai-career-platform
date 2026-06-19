from collections import Counter
from io import BytesIO
from pathlib import Path
import json
import math
import re

import fitz

BASE_DIR = Path(__file__).resolve().parent
REQUIRED_COLUMNS = {"Company Name", "Position", "Skills Required", "Experience", "Work Type", "Company Overview"}

NORMALIZATION_MAP = {
    "reactjs": "react", "react js": "react", "react.js": "react",
    "nodejs": "node.js", "node js": "node.js", "rest api": "rest apis",
    "restful api": "rest apis", "restful apis": "rest apis", "mongo db": "mongodb",
    "postgres": "postgresql", "postgre sql": "postgresql", "js": "javascript",
    "html5": "html", "css3": "css", "dotnet": ".net", ".net core": ".net",
    "c sharp": "c#", "ci cd": "ci/cd", "basic html": "html",
    "figma design": "figma", "ux design": "ux", "ui design": "ui",
}

STOP_SKILLS = {"a", "an", "ar", "arc", "bi", "chai", "ci", "form", "jobs", "lan", "pl", "po", "put", "re", "training", "good", "strong", "knowledge", "experience"}
SHORT_ALLOW = {"ai", "api", "aws", "c", "c#", "c++", "css", "erp", "go", "ip", "js", "ml", "os", "php", "sql", "ui", "ux"}
POSITIVE_WORDS = {"good", "great", "excellent", "flexible", "supportive", "learning", "growth", "friendly", "balance", "talented", "professional", "healthy"}
NEGATIVE_WORDS = {"delayed", "poor", "bad", "toxic", "pressure", "low", "minimal", "problem", "issue", "nothing"}
_MODEL = None
_MODEL_UNAVAILABLE = False


def normalize_skill(skill):
    value = re.sub(r"\s+", " ", str(skill or "").strip().lower())
    return NORMALIZATION_MAP.get(value, value)


def is_meaningful_skill(skill):
    if not skill or skill in STOP_SKILLS or skill.isdigit():
        return False
    if len(skill) <= 2 and skill not in SHORT_ALLOW:
        return False
    if len(skill) == 3 and skill not in SHORT_ALLOW and not re.search(r"[+#.]", skill):
        return False
    return bool(re.search(r"[a-z+#.]", skill))


def split_skills(skill_text):
    if isinstance(skill_text, list):
        skill_text = ", ".join(map(str, skill_text))
    if not isinstance(skill_text, str):
        return []
    skills = [normalize_skill(item) for item in re.split(r"[,;/|]", skill_text) if item.strip()]
    return sorted({skill for skill in skills if is_meaningful_skill(skill)})


def parse_dataset(file_storage=None, path=None):
    if file_storage:
        raw = file_storage.read().decode("utf-8-sig", errors="replace")
    else:
        raw = Path(path or BASE_DIR / "full_dataset.json").read_text(encoding="utf-8-sig")
    raw = raw.replace(": NaN", ": null").replace(": Infinity", ": null").replace(": -Infinity", ": null")
    data = json.loads(raw)
    rows = data if isinstance(data, list) else next((v for v in data.values() if isinstance(v, list)), [])
    return normalize_dataset(rows)


def normalize_dataset(rows):
    aliases = {
        "Company Name": ["company name", "company", "organization", "employer"],
        "Position": ["position", "job title", "title", "role", "designation"],
        "Skills Required": ["skills required", "skills", "required skills", "requirements"],
        "Experience": ["experience", "required experience", "exp"],
        "Work Type": ["work type", "job type", "employment type", "work mode"],
        "Company Overview": ["company overview", "overview", "description", "company profile"],
    }
    clean_rows = []
    for row in rows:
        key_map = {re.sub(r"[^a-z0-9]+", " ", str(k).lower()).strip(): v for k, v in dict(row).items()}
        clean = {}
        for standard, names in aliases.items():
            clean[standard] = next((key_map.get(name) for name in names if key_map.get(name) not in (None, "")), "")
        if clean["Company Name"] or clean["Position"] or clean["Skills Required"]:
            clean_rows.append(clean)
    missing = [field for field in ["Company Name", "Position", "Skills Required"] if not any(row.get(field) for row in clean_rows)]
    if missing:
        raise ValueError(f"Dataset missing required information: {', '.join(missing)}")
    return clean_rows


def extract_pdf_text(file_storage):
    data = file_storage.read()
    doc = fitz.open(stream=data, filetype="pdf")
    text = " ".join(page.get_text("text") for page in doc)
    return re.sub(r"\s+", " ", text).strip()


def clean_search_text(text):
    text = str(text or "").lower()
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
        if " " in skill or "." in skill or "#" in skill or "/" in skill:
            if re.search(rf"\b{re.escape(skill)}\b", searchable):
                found.add(skill)
        elif skill in words:
            found.add(skill)
    return sorted(found)


def text_vector(text):
    counts = Counter(re.findall(r"[a-z0-9+#.]+", clean_search_text(text)))
    return counts


def cosine_counts(a, b):
    if not a or not b:
        return 0.0
    dot = sum(a[k] * b.get(k, 0) for k in a)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return dot / (na * nb) if na and nb else 0.0


def semantic_similarity(cv_text, job_text):
    global _MODEL, _MODEL_UNAVAILABLE
    if _MODEL_UNAVAILABLE:
        return cosine_counts(text_vector(cv_text), text_vector(job_text))
    try:
        if _MODEL is None:
            from sentence_transformers import SentenceTransformer
            _MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        embeddings = _MODEL.encode([cv_text[:3000], job_text[:1200]], normalize_embeddings=True)
        return float((embeddings[0] * embeddings[1]).sum())
    except Exception:
        _MODEL_UNAVAILABLE = True
        return cosine_counts(text_vector(cv_text), text_vector(job_text))

def parse_years(value):
    if isinstance(value, (int, float)):
        return float(value or 0)
    match = re.search(r"(\d+(?:\.\d+)?)", str(value or ""))
    return float(match.group(1)) if match else 0.0


def infer_candidate_years(cv_text):
    matches = re.findall(r"(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)", str(cv_text).lower())
    return max([float(item) for item in matches], default=0.0)


def detect_name(cv_text):
    lines = [line.strip() for line in re.split(r"[\r\n]+", cv_text) if line.strip()]
    for line in lines[:8]:
        clean = re.sub(r"[^A-Za-z .'-]", "", line).strip()
        words = clean.split()
        if 2 <= len(words) <= 4 and not re.search(r"email|phone|mobile|address|linkedin|github", line, re.I):
            return clean
    return "Not detected"


def detect_location(cv_text):
    for loc in ["Dhaka", "Chattogram", "Chittagong", "Sylhet", "Rajshahi", "Khulna", "Barishal", "Rangpur", "Mymensingh", "Remote"]:
        if re.search(rf"\b{loc}\b", cv_text, re.I):
            return loc
    return "Not detected"


def detect_salary(cv_text):
    match = re.search(r"(?:expected salary|salary expectation|expected)\D{0,20}(\d[\d,]*(?:\s*(?:bdt|tk|usd|\$))?)", cv_text, re.I)
    return match.group(1).strip() if match else "Not detected"


def review_score(overview):
    words = set(re.findall(r"[a-z]+", str(overview).lower()))
    return max(35, min(100, 70 + len(words & POSITIVE_WORDS) * 6 - len(words & NEGATIVE_WORDS) * 8))


def roadmap_items(counter, limit=5):
    return [{"skill": skill, "priority": "High" if i < 2 else "Medium" if i < 4 else "Low", "reason": f"Missing from {count} recommended role(s).", "estimated_time": "2-3 weeks" if i < 2 else "1-2 weeks"} for i, (skill, count) in enumerate(counter.most_common(limit))]


def build_why(title, company, matched, missing, semantic_score):
    if matched:
        return f"Recommended for {title} at {company} because your CV matches {', '.join(matched[:4])}. Semantic role fit is {semantic_score:.0f}%."
    return f"Recommended as a possible pathway because the role context is semantically related, but key listed skills still need improvement."


def dataset_intelligence(dataset):
    companies = {job.get("Company Name") for job in dataset if job.get("Company Name")}
    positions = {job.get("Position") for job in dataset if job.get("Position")}
    skills = Counter(skill for job in dataset for skill in split_skills(job.get("Skills Required", "")))
    work = Counter(str(job.get("Work Type") or "Unknown") for job in dataset)
    return {"total_jobs": len(dataset), "unique_companies": len(companies), "unique_positions": len(positions), "unique_skills": len(skills), "top_skills": [{"skill": k, "count": v} for k, v in skills.most_common(10)], "work_type_distribution": dict(work)}


def analyze_jobs(cv_text, dataset, target_role=""):
    catalog = build_skill_catalog(dataset)
    candidate_skills = extract_skills(cv_text, catalog)
    candidate_set = set(candidate_skills)
    candidate_years = infer_candidate_years(cv_text)
    matches = []
    all_missing = Counter()
    for job in dataset:
        required = split_skills(job.get("Skills Required", ""))
        required_set = set(required)
        matched = sorted(candidate_set & required_set)
        missing = sorted(required_set - candidate_set)
        skill_score = round((len(matched) / len(required_set)) * 100, 2) if required_set else 0
        exp_req = parse_years(job.get("Experience"))
        exp_score = 100 if exp_req <= 0 or candidate_years >= exp_req else round(max(35, candidate_years / exp_req * 100), 2)
        semantic_text = f"{job.get('Position')} {job.get('Skills Required')} {job.get('Company Overview')} {target_role}"
        sem_score = round(semantic_similarity(cv_text, semantic_text) * 100, 2)
        company_score = review_score(job.get("Company Overview"))
        work_score = 100 if str(job.get("Work Type") or "").strip() else 80
        gap = round((len(missing) / len(required_set)) * 100, 2) if required_set else 0
        final = round(0.45 * skill_score + 0.25 * sem_score + 0.15 * exp_score + 0.08 * work_score + 0.07 * company_score, 2)
        all_missing.update(missing)
        title = job.get("Position") or "Unknown Job"
        company = job.get("Company Name") or "Unknown Company"
        matches.append({"title": title, "company": company, "required_skills": required, "matched_skills": matched, "missing_skills": missing, "skill_match_score": skill_score, "semantic_match_score": sem_score, "gap_score": gap, "experience_fit_score": exp_score, "work_type_fit_score": work_score, "company_review_score": company_score, "final_score": final, "score": final, "experience": job.get("Experience", ""), "work_type": job.get("Work Type", ""), "company_overview": job.get("Company Overview", "No overview provided."), "why_recommended": build_why(title, company, matched, missing, sem_score), "job_roadmap": roadmap_items(Counter(missing), 3)})
    top = sorted(matches, key=lambda item: item["final_score"], reverse=True)[:10]
    top_missing = Counter(skill for match in top for skill in match["missing_skills"])
    avg = round(sum(match["final_score"] for match in top) / len(top), 2) if top else 0
    role = top[0]["title"] if top else "Not detected"
    report = {"candidate_profile": {"name": detect_name(cv_text), "experience_level": "Senior" if candidate_years >= 5 else "Mid-level" if candidate_years >= 2 else "Junior" if candidate_years > 0 else "Not detected", "expected_salary": detect_salary(cv_text), "location": detect_location(cv_text), "role_direction": role, "total_skills": len(candidate_skills)}, "skills": candidate_skills, "skill_gap_overview": {"total_candidate_skills": len(candidate_skills), "average_readiness": avg, "most_common_missing_skill": top_missing.most_common(1)[0][0] if top_missing else "None", "high_priority_missing_skills": [s for s, _ in top_missing.most_common(5)], "best_fit_job_family": role}, "matches": top, "career_roadmap": roadmap_items(top_missing, 5), "dataset_intelligence": dataset_intelligence(dataset), "summary": f"Top recommendation: {role} at {top[0]['company']}. {top[0]['company_overview']}" if top else "No company overview available."}
    report["api_payload"] = {"candidate_profile": report["candidate_profile"], "skill_gap_overview": report["skill_gap_overview"], "top_match": top[0] if top else None, "career_roadmap": report["career_roadmap"]}
    return report


def build_report_pdf(report):
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 42
    page.insert_text((40, y), "JobLens AI V4 Analysis Report", fontsize=20, color=(0.03, 0.13, 0.28)); y += 28
    top = (report.get("matches") or [{}])[0]
    lines = [
        f"Candidate: {report.get('candidate_profile', {}).get('name', 'Not detected')}",
        f"Top match: {top.get('title', 'None')} at {top.get('company', '')}",
        f"Match: {top.get('final_score', 0)}% | Semantic fit: {top.get('semantic_match_score', 0)}% | Gap: {top.get('gap_score', 0)}%",
        "Skills: " + ", ".join(report.get("skills") or ["None"]),
        "Missing skills: " + ", ".join(top.get("missing_skills") or ["None"]),
        "Why: " + top.get("why_recommended", "No explanation."),
    ]
    for line in lines:
        for chunk in re.findall(r".{1,92}(?:\s+|$)", line):
            page.insert_text((45, y), chunk.strip(), fontsize=10, color=(0.12, 0.18, 0.28)); y += 15
        y += 4
    page.insert_text((45, y), "Career Roadmap", fontsize=15, color=(0.08, 0.28, 0.62)); y += 22
    for item in report.get("career_roadmap", [])[:6]:
        page.insert_text((55, y), f"- {item['skill']} ({item['priority']}): {item['estimated_time']}", fontsize=10); y += 15
    pdf = BytesIO(doc.tobytes()); doc.close(); pdf.seek(0); return pdf


