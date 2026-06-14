const state = { report: null, selectedIndex: 0 };
const $ = (id) => document.getElementById(id);

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const NORMALIZE = {
  reactjs: "react", "react js": "react", "react.js": "react",
  nodejs: "node.js", "node js": "node.js", "rest api": "rest apis",
  "restful api": "rest apis", "restful apis": "rest apis",
  "mongo db": "mongodb", postgres: "postgresql", "postgre sql": "postgresql",
  js: "javascript", html5: "html", css3: "css", dotnet: ".net",
  ".net core": ".net", "c sharp": "c#", "ci cd": "ci/cd"
};

function normalizeSkill(value) {
  const clean = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return NORMALIZE[clean] || clean;
}

function splitSkills(value) {
  return [...new Set(String(value || "").split(/[,;/|]/).map(normalizeSkill).filter(Boolean))].sort();
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function percent(value) { return `${Number(value || 0).toFixed(0)}%`; }
function chip(value, type = "") { return `<span class="chip ${type}">${escapeHtml(value)}</span>`; }
function setStatus(text) { $("topStatus").textContent = text; }
function setError(text = "") { $("errorBox").textContent = text; if (text) setStatus("Needs attention"); }

async function extractPdfText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages.join(" ").replace(/\s+/g, " ").trim();
}

function validateDataset(dataset) {
  const fields = ["Company Name", "Position", "Skills Required", "Experience", "Work Type", "Company Overview"];
  if (!Array.isArray(dataset) || !dataset.length) throw new Error("Dataset must be a non-empty JSON array.");
  const missing = fields.filter((field) => !(field in dataset[0]));
  if (missing.length) throw new Error(`Dataset is missing: ${missing.join(", ")}`);
}

function detectSkills(text, dataset) {
  const catalog = [...new Set(dataset.flatMap((job) => splitSkills(job["Skills Required"])))];
  const source = ` ${text.toLowerCase().replace(/[^a-z0-9.+#/ -]/g, " ").replace(/\s+/g, " ")} `;
  return catalog.filter((skill) => source.includes(` ${skill} `) || source.includes(skill)).sort();
}

function reviewScore(text) {
  const value = String(text || "").toLowerCase();
  const positive = ["good", "great", "excellent", "flexible", "friendly", "growth", "learning", "balance"];
  const negative = ["bad", "poor", "toxic", "delayed", "pressure", "low", "problem"];
  return Math.max(35, Math.min(100, 70 + positive.filter((w) => value.includes(w)).length * 6 - negative.filter((w) => value.includes(w)).length * 8));
}

function analyzeData(text, dataset) {
  const skills = detectSkills(text, dataset);
  const skillSet = new Set(skills);
  const matches = dataset.map((job) => {
    const required = splitSkills(job["Skills Required"]);
    const matched = required.filter((skill) => skillSet.has(skill));
    const missing = required.filter((skill) => !skillSet.has(skill));
    const skillScore = required.length ? matched.length / required.length * 100 : 0;
    const gapScore = required.length ? missing.length / required.length * 100 : 0;
    const companyScore = reviewScore(job["Company Overview"]);
    const experienceScore = 70;
    const workTypeScore = job["Work Type"] ? 100 : 80;
    const finalScore = .6 * skillScore + .2 * experienceScore + .1 * workTypeScore + .1 * companyScore;
    return {
      title: job.Position || "Unknown role", company: job["Company Name"] || "Unknown company",
      required_skills: required, matched_skills: matched, missing_skills: missing,
      skill_match_score: +skillScore.toFixed(2), gap_score: +gapScore.toFixed(2),
      experience_fit_score: experienceScore, work_type_fit_score: workTypeScore,
      company_review_score: companyScore, final_score: +finalScore.toFixed(2), score: +finalScore.toFixed(2),
      experience: job.Experience ?? "", work_type: job["Work Type"] || "",
      company_overview: job["Company Overview"] || "No overview provided.",
      why_recommended: matched.length
        ? `Your CV matches ${matched.slice(0, 4).join(", ")}. ${missing.length ? `Learning ${missing.slice(0, 3).join(", ")} would improve readiness.` : "No major skill gap was found."}`
        : `This role has transferable potential, but the listed technical skills are not yet detected in the CV.`
    };
  }).sort((a, b) => b.final_score - a.final_score).slice(0, 10);

  const missingCounts = new Map();
  matches.forEach((match) => match.missing_skills.forEach((skill) => missingCounts.set(skill, (missingCounts.get(skill) || 0) + 1)));
  const rankedMissing = [...missingCounts].sort((a, b) => b[1] - a[1]);
  const roadmap = rankedMissing.slice(0, 5).map(([skill, count], index) => ({
    skill, priority: index < 2 ? "High" : index < 4 ? "Medium" : "Low",
    reason: `Missing from ${count} recommended role(s).`, estimated_time: index < 2 ? "2-3 weeks" : "1-2 weeks"
  }));
  const top = matches[0] || {};
  const companies = new Set(dataset.map((job) => job["Company Name"]).filter(Boolean));
  const positions = new Set(dataset.map((job) => job.Position).filter(Boolean));
  const allSkills = new Set(dataset.flatMap((job) => splitSkills(job["Skills Required"])));
  const averageReadiness = matches.length ? matches.reduce((sum, match) => sum + match.skill_match_score, 0) / matches.length : 0;
  return {
    candidate_profile: { name: "Browser analysis", experience_level: "Not detected", expected_salary: "Not detected", location: "Not detected", role_direction: top.title || "Not detected", total_skills: skills.length },
    skills,
    skill_gap_overview: { total_candidate_skills: skills.length, average_readiness, most_common_missing_skill: rankedMissing[0]?.[0] || "None", high_priority_missing_skills: rankedMissing.slice(0, 5).map(([skill]) => skill), best_fit_job_family: top.title || "Not detected" },
    matches, career_roadmap: roadmap,
    dataset_intelligence: { total_jobs: dataset.length, unique_companies: companies.size, unique_positions: positions.size, unique_skills: allSkills.size, top_skills: [], work_type_distribution: {} },
    summary: top.company ? `Top company insight: ${top.company}. ${top.company_overview}` : "No company overview available."
  };
}

function scoreBar(value) { return `<div class="mini-bar"><i style="width:${Math.min(100, Number(value || 0))}%"></i></div>`; }
function scoreRow(label, value) { return `<div class="score-row"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, Number(value || 0))}%"></i></div><span>${percent(value)}</span></div>`; }

function renderSelected(match) {
  if (!match) return;
  $("matchedSkillsBox").innerHTML = match.matched_skills.length ? match.matched_skills.map((s) => chip(s, "good")).join("") : '<span class="empty">No direct matches.</span>';
  $("missingSkillsBox").innerHTML = match.missing_skills.length ? match.missing_skills.map((s) => chip(s, "bad")).join("") : '<span class="empty">No major missing skills.</span>';
  $("whyBox").textContent = match.why_recommended;
  $("detailBox").innerHTML = `<h3>Selected Job Detail</h3><p><strong>${escapeHtml(match.title)}</strong> at ${escapeHtml(match.company)}</p><div class="score-breakdown">${scoreRow("Skill Match", match.skill_match_score)}${scoreRow("Experience Fit", match.experience_fit_score)}${scoreRow("Work Type Fit", match.work_type_fit_score)}${scoreRow("Company Fit", match.company_review_score)}${scoreRow("Final Score", match.final_score)}${scoreRow("Gap Score", match.gap_score)}</div><p class="subtle" style="margin-top:12px">${escapeHtml(match.company_overview)}</p>`;
  $("metricMatch").textContent = percent(match.final_score); $("metricMatched").textContent = match.matched_skills.length;
  $("metricMissing").textContent = match.missing_skills.length; $("metricGap").textContent = percent(match.gap_score);
  $("metricCompany").textContent = percent(match.company_review_score);
}

function selectMatch(index) { state.selectedIndex = index; renderReport(state.report); }

function renderReport(report) {
  state.report = report; const matches = report.matches || []; const selected = matches[state.selectedIndex] || matches[0];
  $("skillCount").textContent = `(${report.skills.length})`; $("skillsBox").innerHTML = report.skills.map((s) => chip(s)).join("") || '<span class="empty">No skills detected.</span>';
  $("matchesBox").innerHTML = matches.slice(0, 6).map((m, i) => `<button class="rank-card${i === state.selectedIndex ? " active" : ""}" data-index="${i}"><span class="rank-num">${i + 1}</span><span><strong>${escapeHtml(m.title)}</strong><small>${escapeHtml(m.company)}</small></span>${scoreBar(m.final_score)}<span class="rank-score">${percent(m.final_score)}</span></button>`).join("");
  $("matchesBox").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => selectMatch(Number(button.dataset.index))));
  $("jobTableBox").innerHTML = `<div class="table-row header"><span>Job Title</span><span>Company</span><span>Match</span><span>Gap</span><span>Experience</span></div>${matches.slice(0, 5).map((m, i) => `<button class="table-row" data-index="${i}"><span>${escapeHtml(m.title)}</span><span>${escapeHtml(m.company)}</span><span>${percent(m.final_score)}</span><span>${percent(m.gap_score)}</span><span>${escapeHtml(m.experience)} yrs</span></button>`).join("")}`;
  $("jobTableBox").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => selectMatch(Number(button.dataset.index))));
  const profile = report.candidate_profile; $("profileName").textContent = profile.name; $("profileExperience").textContent = profile.experience_level; $("profileSalary").textContent = profile.expected_salary; $("profileLocation").textContent = profile.location; $("profileRole").textContent = profile.role_direction; $("profileSkills").textContent = profile.total_skills;
  const gap = report.skill_gap_overview; $("gapTotal").textContent = gap.total_candidate_skills; $("gapReadiness").textContent = percent(gap.average_readiness); $("gapCommon").textContent = gap.most_common_missing_skill; $("gapFamily").textContent = gap.best_fit_job_family; $("priorityMissing").innerHTML = gap.high_priority_missing_skills.map((s) => chip(s, "bad")).join("");
  $("roadmapBox").innerHTML = report.career_roadmap.map((item, i) => `<div class="roadmap-item"><b>${i + 1}</b><span>${escapeHtml(item.skill)}</span><small>${item.priority} Priority</small></div>`).join("") || '<span class="empty">No roadmap gaps detected.</span>';
  const intel = report.dataset_intelligence; $("intelBox").innerHTML = `<div class="stat"><span>Total Jobs</span><strong>${intel.total_jobs}</strong></div><div class="stat"><span>Unique Companies</span><strong>${intel.unique_companies}</strong></div><div class="stat"><span>Unique Positions</span><strong>${intel.unique_positions}</strong></div><div class="stat"><span>Unique Skills</span><strong>${intel.unique_skills}</strong></div>`;
  $("summaryBox").textContent = report.summary; $("miniSummary").textContent = report.summary; $("payloadBox").textContent = JSON.stringify(report, null, 2); $("metricJobs").textContent = matches.length;
  renderSelected(selected); setStatus("Analysis complete");
}

async function analyze() {
  setError(); const cv = $("cvFile").files[0]; const datasetFile = $("datasetFile").files[0];
  if (!cv) return setError("Please select a CV PDF."); if (!datasetFile) return setError("Please select the JSON dataset.");
  $("analyzeBtn").disabled = true; setStatus("Analyzing in browser");
  try { const [text, dataset] = await Promise.all([extractPdfText(cv), datasetFile.text().then(JSON.parse)]); if (!text) throw new Error("The PDF has no readable text."); validateDataset(dataset); state.selectedIndex = 0; renderReport(analyzeData(text, dataset)); document.querySelector("#results").scrollIntoView({ behavior: "smooth" }); }
  catch (error) { setError(error.message || "Analysis failed."); }
  finally { $("analyzeBtn").disabled = false; }
}

function downloadJson() { if (!state.report) return setError("Run analysis first."); const url = URL.createObjectURL(new Blob([JSON.stringify(state.report, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "joblens-v2-report.json"; a.click(); URL.revokeObjectURL(url); }
function printReport() { if (!state.report) return setError("Run analysis first."); const top = state.report.matches[0] || {}; const win = window.open("", "_blank"); win.document.write(`<title>JobLens V2 Report</title><style>body{font-family:Arial;padding:32px;color:#172033}h1,h2{color:#2563eb}li{margin:7px 0}</style><h1>JobLens V2 Analysis Report</h1><h2>Accuracy</h2><p>Final match: ${percent(top.final_score)} | Skill match: ${percent(top.skill_match_score)} | Gap: ${percent(top.gap_score)}</p><h2>Top Job</h2><p>${escapeHtml(top.title || "None")} at ${escapeHtml(top.company || "")}</p><h2>Detected Skills</h2><p>${state.report.skills.map(escapeHtml).join(", ")}</p><h2>Career Roadmap</h2><ol>${state.report.career_roadmap.map((item) => `<li>${escapeHtml(item.skill)} - ${item.priority}</li>`).join("")}</ol><h2>Company Summary</h2><p>${escapeHtml(state.report.summary)}</p>`); win.document.close(); win.focus(); setTimeout(() => win.print(), 300); }

$("cvFile").addEventListener("change", () => { if ($("cvFile").files[0]) $("cvName").textContent = $("cvFile").files[0].name; });
$("navCvFile").addEventListener("change", () => { const file = $("navCvFile").files[0]; if (file) { const transfer = new DataTransfer(); transfer.items.add(file); $("cvFile").files = transfer.files; $("cvName").textContent = file.name; } });
$("datasetFile").addEventListener("change", () => { if ($("datasetFile").files[0]) $("datasetName").textContent = $("datasetFile").files[0].name; });
$("analyzeBtn").addEventListener("click", analyze); $("heroAnalyzeBtn").addEventListener("click", () => document.querySelector("#demo").scrollIntoView({ behavior: "smooth" }));
$("downloadBtn").addEventListener("click", downloadJson); $("downloadPdfBtn").addEventListener("click", printReport); $("copyBtn").addEventListener("click", async () => { if (!state.report) return setError("Run analysis first."); await navigator.clipboard.writeText(JSON.stringify(state.report, null, 2)); setStatus("JSON copied"); });
