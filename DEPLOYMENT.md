# Deployment Guide

## Push Updates

```powershell
git add .
git commit -m "Describe your update"
git push origin main
```

## Enable GitHub Pages

1. Open the repository on GitHub.
2. Go to **Settings > Pages**.
3. Select **Deploy from a branch**.
4. Choose branch `main` and folder `/docs`.
5. Save and wait for deployment.

## What Works on GitHub Pages

- Responsive product preview
- Demo upload interface
- Skill, gap, roadmap, course, job, XAI, report, admin, research, dataset, and model sections

## What Requires Backend Hosting

- Real CV/PDF upload and extraction
- Flask API routes and matching logic
- PDF report generation
- ML prediction, database, and admin notifications

## Recommended Backend Hosting

Deploy Flask to Render, Railway, Fly.io, or another Python host. Store secrets in host environment variables and keep private datasets outside the public repository.

## Connect Frontend Later

Replace demo actions in `docs/assets/app.js` with `fetch()` calls to the deployed API URL and configure CORS on Flask.

