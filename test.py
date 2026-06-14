from flask import Flask, request, jsonify, make_response
import fitz   # PyMuPDF
import json
import re

app = Flask(__name__)

# ============================================================
#  PDF TEXT EXTRACTION (CLEAN + LOWERCASE)
# ============================================================
def extract_pdf_text(file_storage):
    data = file_storage.read()
    doc = fitz.open(stream=data, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text("text") + " "
    return text.lower()


# ============================================================
#  SKILL & REVIEW PARSING HELPERS
# ============================================================
def split_skills(skill_text):
    """Convert dataset skill string into clean list"""
    if not isinstance(skill_text, str):
        return []
    return [s.strip().lower() for s in skill_text.split(",") if s.strip()]


def split_reviews(text):
    if not isinstance(text, str):
        return []
    parts = [x.strip() for x in text.split(".") if x.strip()]
    return parts if parts else [text]


# ============================================================
#  CLEAN + TOKENIZE PDF TEXT
# ============================================================
def clean_text(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9.+# ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ============================================================
#  BUILD SKILL DICTIONARY FROM DATASET
# ============================================================
def build_skill_dict(dataset):
    skill_set = set()
    for job in dataset:
        for s in split_skills(job.get("Skills Required", "")):
            skill_set.add(s.lower())
    return sorted(skill_set)


# ============================================================
#  ACCURATE SKILL EXTRACTION
# ============================================================
def extract_skills_fixed(cv_text, catalog):
    cv_text = clean_text(cv_text)
    cv_words = set(cv_text.split())

    found = []

    for skill in catalog:

        # MULTI-WORD SKILLS
        if " " in skill:
            if skill in cv_text:
                found.append(skill)
                continue

        # ABBREVIATIONS (OOP, API, ML, NLP)
        if skill.isalpha() and len(skill) <= 4:
            if re.search(rf"\b{skill}\b", cv_text):
                found.append(skill)
                continue

        # EXACT KEYWORD MATCH
        if skill in cv_words:
            found.append(skill)

    return sorted(list(set(found)))


# ============================================================
#  MATCH JOBS
# ============================================================
def match_jobs(cv_skills, dataset):
    cv_set = set(cv_skills)
    results = []

    for job in dataset:

        ds_skills = split_skills(job.get("Skills Required", ""))
        ds_set = set(ds_skills)

        # Avoid division by zero
        if not ds_set:
            score = 0
        else:
            inter = len(cv_set.intersection(ds_set))
            union = len(cv_set.union(ds_set))
            score = (inter / union) if union else 0

        results.append({
            "title": job.get("Position", "Unknown Job"),
            "company": job.get("Company Name", "Unknown Company"),
            "score": round(score * 100, 2),
            "skills": ds_skills,
            "experience": job.get("Experience", ""),
            "work_type": job.get("Work Type", ""),
            "reviews": split_reviews(job.get("Company Overview", "")),
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:10]


# ============================================================
#  SUMMARY
# ============================================================
def summarize_reviews(reviews):
    if not reviews:
        return "No reviews available."
    return ". ".join(reviews[:5]) + "."


# ============================================================
#  FRONTEND HTML (INLINE)
# ============================================================
@app.route("/")
def home():
    html = """
<!DOCTYPE html>
<html>
<head>
    <title>JobLens – CV Matcher</title>
    <style>
        body { background:#0f172a; font-family:Arial; color:white; padding:40px; }
        .container { width:700px; margin:auto; padding:30px; background:#1e293b;
                     border-radius:20px; box-shadow:0 0 20px #000; }
        input, button { width:100%; padding:10px; margin-top:10px; border-radius:8px; }
        button { background:#3b82f6; color:white; border:none; cursor:pointer; }
        .box { padding:12px; background:#0f172a; border-radius:8px; margin-top:10px; }
        h1 { margin-top:0; }
        pre { white-space: pre-wrap; }
    </style>
</head>
<body>

<div class="container">
    <h1>JobLens – CV Matcher</h1>

    <label>Upload CV (PDF)</label>
    <input type="file" id="cvFile" accept="application/pdf">

    <label>Upload Dataset (JSON)</label>
    <input type="file" id="datasetFile" accept="application/json">

    <button onclick="analyze()">Analyze</button>

    <h2>Extracted Skills</h2>
    <div id="skillsBox" class="box"></div>

    <h2>Top Matches</h2>
    <pre id="matchesBox" class="box"></pre>

    <h2>Company Review Summary</h2>
    <div id="summaryBox" class="box"></div>
</div>

<script>
async function analyze() {
    let cv = document.getElementById("cvFile").files[0];
    let ds = document.getElementById("datasetFile").files[0];

    let fd = new FormData();
    fd.append("cvFile", cv);
    fd.append("datasetFile", ds);

    let res = await fetch("/process", { method:"POST", body:fd });
    let data = await res.json();

    // Show Skills
    document.getElementById("skillsBox").innerText = data.skills.join(", ");

    // Show Top Matches
    let text = "";
    data.matches.forEach(m => {
        text += `${m.title} at ${m.company} — ${m.score}%\\n`;
    });
    document.getElementById("matchesBox").innerText = text;

    // Show Summary
    document.getElementById("summaryBox").innerText = data.summary;
}
</script>

</body>
</html>
"""
    return make_response(html)


# ============================================================
#  PROCESS REQUEST
# ============================================================
@app.route("/process", methods=["POST"])
def process():
    cv = request.files.get("cvFile")
    ds = request.files.get("datasetFile")

    if not cv or not ds:
        return jsonify({"error": "Missing files"}), 400

    dataset = json.load(ds)

    # Build clean skill dictionary
    skill_catalog = build_skill_dict(dataset)

    cv_text = extract_pdf_text(cv)

    # Extract skills cleanly
    cv_skills = extract_skills_fixed(cv_text, skill_catalog)

    matches = match_jobs(cv_skills, dataset)
    summary = summarize_reviews(matches[0]["reviews"]) if matches else "No matches."

    return jsonify({
        "skills": cv_skills,
        "matches": matches,
        "summary": summary
    })


if __name__ == "__main__":
    app.run(debug=True)
