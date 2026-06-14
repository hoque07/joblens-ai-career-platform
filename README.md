# JobLens AI Career Platform

JobLens AI is a research-oriented Flask platform for explainable CV-to-job matching, skill-gap analysis, career-roadmap recommendations, company-review summaries, and downloadable reports.

## Main Features

- PDF CV text and skill extraction
- Explainable job-match scoring
- Matched and missing skill analysis
- Career-roadmap recommendations
- Dataset intelligence and company summaries
- JSON and PDF report export
- Static GitHub Pages product preview

## Research Purpose

The project explores NLP and machine-learning-driven CV mapping and job placement for fresh graduates in Bangladesh. [Read the ResearchGate paper](https://www.researchgate.net/publication/399869629_JobLens_NLP_and_Machine_Learning-Driven_CV_Mapping_and_Job_Placement_Model_for_Fresh_Graduates_in_Bangladesh).

## Tech Stack

- Python, Flask, PyMuPDF
- HTML, CSS, JavaScript
- GitHub Pages for the static preview

## Structure

```text
docs/                 Static GitHub Pages preview
static/               Flask frontend CSS and JavaScript
templates/            Flask HTML template
app.py                Flask backend and PDF report generation
requirements.txt      Backend dependencies
```

## Run Locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000/`.

## GitHub Pages Preview

After Pages is enabled from `main` and `/docs`, open:

https://hoque07.github.io/joblens-ai-career-platform/

## Backend Limitation

GitHub Pages hosts only the static preview. CV analysis, ML prediction, PDF generation, uploads, and notifications require a deployed Flask backend.

## Future Development

- Deploy the Flask API
- Add persistent job and user data
- Connect the static frontend to the hosted API
- Expand model evaluation and recommendation quality

Developed by [TANVIR NIBIR](https://tanvirnibir.com/).

