const state = { report: null, selectedIndex: 0, dataset: null, datasetSource: 'built-in' };
const DEFAULT_DATASET_URL = 'assets/full_dataset.json';
const $ = (id) => document.getElementById(id);
const v3StoreKey = "joblens_v3_preview_db";

function v3DefaultDb() {
  return { users: [], analyses: [], events: [] };
}

function v3LoadDb() {
  try {
    return { ...v3DefaultDb(), ...JSON.parse(localStorage.getItem(v3StoreKey) || "{}") };
  } catch {
    return v3DefaultDb();
  }
}

function v3SaveDb(db) {
  localStorage.setItem(v3StoreKey, JSON.stringify(db));
}

function v3Event(type, detail = "") {
  const db = v3LoadDb();
  db.events.unshift({ type, detail, at: new Date().toISOString() });
  db.events = db.events.slice(0, 40);
  v3SaveDb(db);
  v3RenderDashboard();
}

function v3CurrentUser() {
  return {
    name: $("v3UserName")?.value.trim() || "Guest User",
    email: $("v3UserEmail")?.value.trim() || "not-provided",
    city: $("v3UserCity")?.value.trim() || "Not detected",
    targetRole: $("v3TargetRole")?.value.trim() || "Not selected"
  };
}

function v3SaveUser() {
  const user = { ...v3CurrentUser(), updatedAt: new Date().toISOString() };
  const db = v3LoadDb();
  const index = db.users.findIndex((entry) => entry.email === user.email);
  if (index >= 0) db.users[index] = user;
  else db.users.push(user);
  v3SaveDb(db);
  v3Event("profile_saved", `${user.name} targeting ${user.targetRole}`);
}

function v3SaveAnalysis(report, cvName) {
  if (!report) return;
  const top = report.matches?.[0] || {};
  const user = v3CurrentUser();
  const db = v3LoadDb();
  db.analyses.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    user,
    cvName,
    score: Number(top.final_score || 0),
    skillScore: Number(top.skill_match_score || 0),
    topRole: top.title || "Not detected",
    topCompany: top.company || "Not detected",
    missingSkills: top.missing_skills || [],
    location: report.candidate_profile?.location || user.city,
    createdAt: new Date().toISOString()
  });
  db.analyses = db.analyses.slice(0, 25);
  v3SaveDb(db);
  v3Event("analysis_completed", `${user.name}: ${top.title || "No role"} (${percent(top.final_score)})`);
}

function v3RenderDashboard() {
  if (!$("v3TotalAnalyses")) return;
  const db = v3LoadDb();
  const analyses = db.analyses || [];
  const avg = analyses.length ? analyses.reduce((sum, item) => sum + Number(item.score || 0), 0) / analyses.length : 0;
  const roleCounts = new Map();
  const skillCounts = new Map();
  const cityCounts = new Map();
  analyses.forEach((item) => {
    roleCounts.set(item.topRole, (roleCounts.get(item.topRole) || 0) + 1);
    cityCounts.set(item.location || item.user?.city || "Not detected", (cityCounts.get(item.location || item.user?.city || "Not detected") || 0) + 1);
    (item.missingSkills || []).forEach((skill) => skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1));
  });
  const topRole = [...roleCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || "Not detected";
  $("v3TotalAnalyses").textContent = analyses.length;
  $("v3SavedUsers").textContent = (db.users || []).length;
  $("v3AvgScore").textContent = percent(avg);
  $("v3BestRole").textContent = topRole;
  const current = (db.users || []).at(-1);
  $("v3UserSummary").textContent = current ? `${current.name} from ${current.city} is targeting ${current.targetRole}.` : "No user profile saved yet.";
  $("v3BehaviorLog").innerHTML = (db.events || []).slice(0, 8).map((event) => `<div><b>${escapeHtml(event.type.replaceAll("_", " "))}</b><span>${escapeHtml(event.detail)}</span><small>${new Date(event.at).toLocaleString()}</small></div>`).join("") || '<span class="empty">User behavior appears after interactions.</span>';
  $("v3HistoryList").innerHTML = analyses.slice(0, 6).map((item) => `<button type="button"><b>${escapeHtml(item.topRole)}</b><span>${escapeHtml(item.user.name)} - ${percent(item.score)} at ${escapeHtml(item.topCompany)}</span><small>${new Date(item.createdAt).toLocaleString()}</small></button>`).join("") || '<span class="empty">Run an analysis to save the first report.</span>';
  const topSkill = [...skillCounts].sort((a, b) => b[1] - a[1])[0];
  const topCity = [...cityCounts].sort((a, b) => b[1] - a[1])[0];
  $("v3AdminInsights").innerHTML = `
    <div><b>${escapeHtml(topRole)}</b><span>Most common best-fit role</span></div>
    <div><b>${escapeHtml(topSkill?.[0] || "Not detected")}</b><span>Most common missing skill</span></div>
    <div><b>${escapeHtml(topCity?.[0] || "Not detected")}</b><span>Most active user location</span></div>
    <div><b>${analyses.filter((item) => item.score >= 75).length}</b><span>High-readiness candidates</span></div>
  `;
}

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const NORMALIZE = {
  reactjs: "react", "react js": "react", "react.js": "react",
  nodejs: "node.js", "node js": "node.js", "rest api": "rest apis",
  "restful api": "rest apis", "restful apis": "rest apis",
  "mongo db": "mongodb", postgres: "postgresql", "postgre sql": "postgresql",
  js: "javascript", html5: "html", css3: "css", dotnet: ".net",
  ".net core": ".net", "c sharp": "c#", "ci cd": "ci/cd",
  "basic html": "html", "figma design": "figma", "ux design": "ux",
  "ui design": "ui", "c programming": "c", "mern stack": "mern"
};

const SKILL_STOPWORDS = new Set([
  "a", "an", "and", "ar", "arc", "bi", "chai", "ci", "form", "jobs", "lan",
  "pl", "po", "put", "re", "training", "basic", "advanced", "good", "strong",
  "knowledge", "experience", "using", "with", "in", "of", "for", "to"
]);

const SHORT_SKILL_ALLOWLIST = new Set([
  "ai", "api", "aws", "c", "c#", "c++", "css", "erp", "figma", "git", "go",
  "html", "ip", "java", "js", "ml", "mysql", "oop", "orm", "os", "php",
  "rest", "sql", "ui", "ux"
]);

function normalizeSkill(value) {
  const clean = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return NORMALIZE[clean] || clean;
}

function isMeaningfulSkill(skill) {
  if (!skill) return false;
  if (/^\d+$/.test(skill)) return false;
  if (SKILL_STOPWORDS.has(skill)) return false;
  if (skill.length <= 2 && !SHORT_SKILL_ALLOWLIST.has(skill)) return false;
  if (skill.length === 3 && !SHORT_SKILL_ALLOWLIST.has(skill) && !/[+#.]/.test(skill)) return false;
  return /[a-z+#.]/i.test(skill);
}

function splitSkills(value) {
  return [...new Set(String(value || "").split(/[,;/|]/).map(normalizeSkill).filter(isMeaningfulSkill))].sort();
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

const FIELD_ALIASES = {
  "Company Name": ["company name", "company", "companyname", "organization", "employer"],
  Position: ["position", "job title", "job_title", "title", "role", "designation"],
  "Skills Required": ["skills required", "skills", "required skills", "required_skills", "skill required", "requirements"],
  Experience: ["experience", "experience required", "required experience", "exp", "years experience"],
  "Work Type": ["work type", "work_type", "job type", "employment type", "type", "work mode"],
  "Company Overview": ["company overview", "overview", "company description", "description", "about company", "company profile"]
};

function keyToken(value) {
  return String(value || "").toLowerCase().replace(/^\uFEFF/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function pickArrayFromJson(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const directKeys = ["data", "jobs", "records", "dataset", "items", "results"];
  for (const key of directKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  return Object.values(value).find((entry) => Array.isArray(entry) && entry.some((item) => item && typeof item === "object")) || [];
}

async function parseDatasetFile(file) {
  const raw = (await file.text()).replace(/^\uFEFF/, "").trim();
  if (!raw) throw new Error("The selected JSON file is empty.");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const cleaned = raw.replace(/:\s*(?:NaN|Infinity|-Infinity)(?=\s*[,}\]])/g, ": null");
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`Invalid JSON file: ${error.message}`);
    }
  }
}

async function loadBuiltInDataset() {
  if (!$("datasetName")) return;
  setStatus("Loading built-in dataset");
  try {
    const response = await fetch(`${DEFAULT_DATASET_URL}?v=20260619`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Dataset request failed (${response.status})`);
    const rawDataset = await response.json();
    state.dataset = normalizeDataset(rawDataset);
    state.datasetSource = "built-in";
    $("datasetName").textContent = `${state.dataset.length.toLocaleString()} jobs loaded automatically`;
    setStatus("Built-in dataset ready");
    v3Event("dataset_loaded", `${state.dataset.length} built-in job records`);
  } catch (error) {
    state.dataset = null;
    $("datasetName").textContent = "Dataset could not load automatically";
    setError(`Built-in dataset failed to load: ${error.message}. Use the testing upload option.`);
  }
}
function normalizeDataset(input) {
  const rows = pickArrayFromJson(input).filter((row) => row && typeof row === "object");
  if (!rows.length) throw new Error("No job records found in the JSON dataset.");

  const normalized = rows.map((row) => {
    const lookup = new Map(Object.entries(row).map(([key, value]) => [keyToken(key), value]));
    const clean = {};
    for (const [standard, aliases] of Object.entries(FIELD_ALIASES)) {
      const value = aliases.map(keyToken).map((alias) => lookup.get(alias)).find((entry) => entry !== undefined && entry !== null && String(entry).trim() !== "");
      clean[standard] = Array.isArray(value) ? value.join(", ") : (value ?? "");
    }
    return clean;
  });

  const required = ["Company Name", "Position", "Skills Required"];
  const missing = required.filter((field) => !normalized.some((row) => String(row[field] || "").trim()));
  if (missing.length) throw new Error(`Dataset is missing required information: ${missing.join(", ")}`);
  return normalized.filter((row) => row.Position || row["Company Name"] || row["Skills Required"]);
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

function detectProfile(text, fileName, topRole, skillCount) {
  const source = String(text || "");
  const lower = source.toLowerCase();
  const cities = ["Dhaka", "Chattogram", "Chittagong", "Sylhet", "Rajshahi", "Khulna", "Barishal", "Rangpur", "Mymensingh", "Cumilla", "Narayanganj", "Gazipur", "Remote"];
  const location = cities.find((city) => lower.includes(city.toLowerCase())) || "Not detected";
  const years = [...lower.matchAll(/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/g)].map((match) => Number(match[1]));
  const maxYears = years.length ? Math.max(...years) : 0;
  const experienceLevel = maxYears >= 5 ? "Senior" : maxYears >= 2 ? "Mid-level" : maxYears > 0 ? "Junior" : "Not detected";
  const salaryMatch = source.match(/(?:expected salary|salary expectation|expected)\D{0,20}(\d[\d,]*(?:\s*(?:bdt|tk|usd|\$))?)/i);
  const name = String(fileName || "")
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Not detected";
  return {
    name,
    experience_level: experienceLevel,
    expected_salary: salaryMatch ? salaryMatch[1].trim() : "Not detected",
    location,
    role_direction: topRole || "Not detected",
    total_skills: skillCount
  };
}

function analyzeData(text, dataset, fileName) {
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
    candidate_profile: detectProfile(text, fileName, top.title, skills.length),
    skills,
    skill_gap_overview: { total_candidate_skills: skills.length, average_readiness: averageReadiness, most_common_missing_skill: rankedMissing[0]?.[0] || "None", high_priority_missing_skills: rankedMissing.slice(0, 5).map(([skill]) => skill), best_fit_job_family: top.title || "Not detected" },
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
  setError();
  const cv = $("cvFile").files[0];
  if (!cv) return setError("Please select a CV PDF.");
  if (!state.dataset) return setError("The built-in job dataset is still loading. Please wait a moment, or use another dataset for testing.");
  $("analyzeBtn").disabled = true;
  setStatus("Analyzing in browser");
  try {
    const text = await extractPdfText(cv);
    if (!text) throw new Error("The PDF has no readable text.");
    state.selectedIndex = 0;
    const report = analyzeData(text, state.dataset, cv.name);
    renderReport(report);
    v3SaveAnalysis(report, cv.name);
    document.querySelector("#results").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    setError(error.message || "Analysis failed.");
  } finally {
    $("analyzeBtn").disabled = false;
  }
}

function downloadJson() { if (!state.report) return setError("Run analysis first."); const url = URL.createObjectURL(new Blob([JSON.stringify(state.report, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "joblens-v2-report.json"; a.click(); URL.revokeObjectURL(url); }
function printReport() { if (!state.report) return setError("Run analysis first."); const top = state.report.matches[0] || {}; const win = window.open("", "_blank"); win.document.write(`<title>JobLens V2 Report</title><style>body{font-family:Arial;padding:32px;color:#172033}h1,h2{color:#2563eb}li{margin:7px 0}</style><h1>JobLens V2 Analysis Report</h1><h2>Accuracy</h2><p>Final match: ${percent(top.final_score)} | Skill match: ${percent(top.skill_match_score)} | Gap: ${percent(top.gap_score)}</p><h2>Top Job</h2><p>${escapeHtml(top.title || "None")} at ${escapeHtml(top.company || "")}</p><h2>Detected Skills</h2><p>${state.report.skills.map(escapeHtml).join(", ")}</p><h2>Career Roadmap</h2><ol>${state.report.career_roadmap.map((item) => `<li>${escapeHtml(item.skill)} - ${item.priority}</li>`).join("")}</ol><h2>Company Summary</h2><p>${escapeHtml(state.report.summary)}</p>`); win.document.close(); win.focus(); setTimeout(() => win.print(), 300); }

$("cvFile").addEventListener("change", () => { if ($("cvFile").files[0]) { $("cvName").textContent = $("cvFile").files[0].name; v3Event("cv_selected", $("cvFile").files[0].name); } });
$("navCvFile").addEventListener("change", () => { const file = $("navCvFile").files[0]; if (file) { const transfer = new DataTransfer(); transfer.items.add(file); $("cvFile").files = transfer.files; $("cvName").textContent = file.name; } });
$("datasetFile").addEventListener("change", async () => {
  const file = $("datasetFile").files[0];
  if (!file) return;
  try {
    const rawDataset = await parseDatasetFile(file);
    state.dataset = normalizeDataset(rawDataset);
    state.datasetSource = "uploaded";
    $("datasetName").textContent = `${state.dataset.length.toLocaleString()} jobs loaded from custom dataset`;
    if ($("datasetUploadName")) $("datasetUploadName").textContent = file.name;
    setError();
    setStatus("Custom dataset ready");
    v3Event("dataset_selected", file.name);
  } catch (error) {
    setError(error.message || "Dataset could not be loaded.");
  }
});
$("analyzeBtn").addEventListener("click", analyze); $("heroAnalyzeBtn").addEventListener("click", () => document.querySelector("#demo").scrollIntoView({ behavior: "smooth" }));
$("downloadBtn").addEventListener("click", downloadJson); $("downloadPdfBtn").addEventListener("click", printReport); $("copyBtn").addEventListener("click", async () => { if (!state.report) return setError("Run analysis first."); await navigator.clipboard.writeText(JSON.stringify(state.report, null, 2)); setStatus("JSON copied"); });
$("saveV3UserBtn").addEventListener("click", v3SaveUser);
$("resetV3Btn").addEventListener("click", () => { localStorage.removeItem(v3StoreKey); v3RenderDashboard(); setStatus("Version 3 local data reset"); });
v3RenderDashboard();
loadBuiltInDataset();
