const state = {
  report: null,
  selectedIndex: 0,
};

const $ = (id) => document.getElementById(id);

const fields = {
  cvFile: $("cvFile"),
  navCvFile: $("navCvFile"),
  datasetFile: $("datasetFile"),
  cvName: $("cvName"),
  datasetName: $("datasetName"),
  analyzeBtn: $("analyzeBtn"),
  heroAnalyzeBtn: $("heroAnalyzeBtn"),
  btnIcon: $("btnIcon"),
  btnText: $("btnText"),
  errorBox: $("errorBox"),
  topStatus: $("topStatus"),
  skillsBox: $("skillsBox"),
  skillCount: $("skillCount"),
  matchesBox: $("matchesBox"),
  jobTableBox: $("jobTableBox"),
  roadmapBox: $("roadmapBox"),
  detailBox: $("detailBox"),
  whyBox: $("whyBox"),
  matchedSkillsBox: $("matchedSkillsBox"),
  missingSkillsBox: $("missingSkillsBox"),
  miniSummary: $("miniSummary"),
  summaryBox: $("summaryBox"),
  intelBox: $("intelBox"),
  payloadBox: $("payloadBox"),
  copyBtn: $("copyBtn"),
  downloadBtn: $("downloadBtn"),
  downloadPdfBtn: $("downloadPdfBtn"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(text) {
  fields.topStatus.textContent = text;
}

function setError(message) {
  fields.errorBox.textContent = message || "";
  if (message) setStatus("Needs attention");
}

function setLoading(isLoading) {
  fields.analyzeBtn.disabled = isLoading;
  fields.btnIcon.innerHTML = isLoading ? '<span class="spinner"></span>' : "Analyze";
  fields.btnText.textContent = isLoading ? "Running" : "CV";
  setStatus(isLoading ? "Analyzing CV" : "Ready");
}

function number(value) {
  return Number(value || 0);
}

function percent(value) {
  return `${number(value).toFixed(0)}%`;
}

function chip(value, type = "") {
  return `<span class="chip ${type}">${escapeHtml(value)}</span>`;
}

function scoreBar(value) {
  const safe = Math.max(0, Math.min(100, number(value)));
  return `<div class="mini-bar"><i style="width:${safe}%"></i></div>`;
}

function scoreRow(label, value) {
  const safe = Math.max(0, Math.min(100, number(value)));
  return `
    <div class="score-row">
      <span>${escapeHtml(label)}</span>
      <div class="bar"><i style="width:${safe}%"></i></div>
      <span>${safe.toFixed(0)}%</span>
    </div>
  `;
}

function syncCvFile(source) {
  const file = source.files?.[0];
  if (!file) return;

  if (source === fields.navCvFile) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fields.cvFile.files = dataTransfer.files;
  }
  fields.cvName.textContent = file.name;
}

function renderProfile(profile) {
  $("profileName").textContent = profile.name || "Not detected";
  $("profileExperience").textContent = profile.experience_level || "Not detected";
  $("profileSalary").textContent = profile.expected_salary || "Not detected";
  $("profileLocation").textContent = profile.location || "Not detected";
  $("profileRole").textContent = profile.role_direction || "Not detected";
  $("profileSkills").textContent = profile.total_skills ?? 0;
}

function renderSkills(skills) {
  fields.skillCount.textContent = `(${skills.length || 0})`;
  fields.skillsBox.innerHTML = skills.length
    ? skills.slice(0, 28).map((item) => chip(item)).join("")
    : '<span class="empty">No skills were detected from the CV.</span>';
}

function renderGapOverview(overview) {
  $("gapTotal").textContent = overview.total_candidate_skills ?? 0;
  $("gapReadiness").textContent = percent(overview.average_readiness);
  $("gapCommon").textContent = overview.most_common_missing_skill || "None";
  $("gapFamily").textContent = overview.best_fit_job_family || "Not detected";
  $("priorityMissing").innerHTML = (overview.high_priority_missing_skills || []).length
    ? overview.high_priority_missing_skills.map((item) => chip(item, "bad")).join("")
    : '<span class="empty">No high-priority missing skills.</span>';
}

function renderMetrics(match, report) {
  const matched = match?.matched_skills?.length || 0;
  const missing = match?.missing_skills?.length || 0;
  $("metricMatch").textContent = percent(match?.skill_match_score);
  $("metricMatched").textContent = matched;
  $("metricMissing").textContent = missing;
  $("metricGap").textContent = percent(match?.gap_score);
  $("metricJobs").textContent = report.matches?.length || 0;
  $("metricCompany").textContent = percent(match?.company_review_score);
}

function renderMatches(matches) {
  const visibleMatches = matches.slice(0, 6);
  fields.matchesBox.innerHTML = visibleMatches.length
    ? visibleMatches
        .map((match, index) => {
          const active = index === state.selectedIndex ? " active" : "";
          return `
            <button class="rank-card${active}" type="button" data-index="${index}" title="${escapeHtml(match.title)} at ${escapeHtml(match.company)}">
              <span class="rank-num">${index + 1}</span>
              <span>
                <strong>${escapeHtml(match.title)}</strong>
                <small>${escapeHtml(match.company)}</small>
              </span>
              ${scoreBar(match.final_score)}
              <span class="rank-score">${percent(match.final_score)}</span>
            </button>
          `;
        })
        .join("")
    : '<span class="empty">No matched jobs were found.</span>';

  fields.matchesBox.querySelectorAll(".rank-card").forEach((card) => {
    card.addEventListener("click", () => selectMatch(Number(card.dataset.index)));
  });
}

function renderJobTable(matches) {
  if (!matches.length) {
    fields.jobTableBox.innerHTML = '<span class="empty">Run analysis to view recommended jobs.</span>';
    return;
  }

  fields.jobTableBox.innerHTML = `
    <div class="table-row header">
      <span>Job Title</span><span>Company</span><span>Match</span><span>Gap</span><span>Experience</span>
    </div>
    ${matches
      .slice(0, 5)
      .map(
        (match, index) => `
          <button class="table-row" type="button" data-index="${index}">
            <span title="${escapeHtml(match.title)}">${escapeHtml(match.title)}</span>
            <span title="${escapeHtml(match.company)}">${escapeHtml(match.company)}</span>
            <span>${percent(match.final_score)}</span>
            <span>${percent(match.gap_score)}</span>
            <span>${escapeHtml(match.experience)} yrs</span>
          </button>
        `
      )
      .join("")}
  `;

  fields.jobTableBox.querySelectorAll("button.table-row").forEach((row) => {
    row.addEventListener("click", () => selectMatch(Number(row.dataset.index)));
  });
}

function renderSelectedSkills(match) {
  fields.matchedSkillsBox.innerHTML = match?.matched_skills?.length
    ? match.matched_skills.map((item) => chip(item, "good")).join("")
    : '<span class="empty">No direct matches.</span>';

  fields.missingSkillsBox.innerHTML = match?.missing_skills?.length
    ? match.missing_skills.map((item) => chip(item, "bad")).join("")
    : '<span class="empty">No major missing skills.</span>';
}

function renderRoadmap(items) {
  fields.roadmapBox.innerHTML = items.length
    ? items
        .slice(0, 5)
        .map(
          (item, index) => `
            <div class="roadmap-item">
              <b>${index + 1}</b>
              <span>${escapeHtml(item.skill)}</span>
              <small>${escapeHtml(item.priority)} Priority</small>
            </div>
          `
        )
        .join("")
    : '<span class="empty">No missing roadmap skills detected.</span>';
}

function renderDetail(match) {
  if (!match) return;
  const matched = match.matched_skills?.slice(0, 3).join(", ") || "your current skills";
  const missing = match.missing_skills?.slice(0, 2).join(", ");
  fields.whyBox.textContent = missing
    ? `Strong match for ${matched}. Improve ${missing} to raise readiness.`
    : `Strong match for ${matched}. No major skill gap was found.`;
  fields.detailBox.innerHTML = `
    <h3>Selected Job Detail</h3>
    <p><strong>${escapeHtml(match.title)}</strong> at ${escapeHtml(match.company)}</p>
    <div class="score-breakdown">
      ${scoreRow("Skill Match", match.skill_match_score)}
      ${scoreRow("Experience Fit", match.experience_fit_score)}
      ${scoreRow("Work Type Fit", match.work_type_fit_score)}
      ${scoreRow("Company Fit", match.company_review_score)}
      ${scoreRow("Final Score", match.final_score)}
      ${scoreRow("Gap Score", match.gap_score)}
    </div>
    <p class="subtle" style="margin-top:12px;">${escapeHtml(match.company_overview || "No company overview provided.")}</p>
    <div class="chips compact">
      ${(match.job_roadmap || []).length
        ? match.job_roadmap.map((item) => chip(`${item.skill} - ${item.priority}`, item.priority === "High" ? "bad" : "")).join("")
        : '<span class="empty">No role-specific roadmap needed.</span>'}
    </div>
  `;
}

function renderIntel(intel) {
  const topSkills = (intel.top_skills || [])
    .slice(0, 10)
    .map((item) => `${escapeHtml(item.skill)} (${item.count})`)
    .join(", ");
  const workTypes = Object.entries(intel.work_type_distribution || {})
    .map(([type, count]) => `${escapeHtml(type)}: ${count}`)
    .join(", ");

  fields.intelBox.innerHTML = `
    <div class="stat"><span>Total Jobs</span><strong>${intel.total_jobs || 0}</strong></div>
    <div class="stat"><span>Unique Companies</span><strong>${intel.unique_companies || 0}</strong></div>
    <div class="stat"><span>Unique Positions</span><strong>${intel.unique_positions || 0}</strong></div>
    <div class="stat"><span>Unique Skills</span><strong>${intel.unique_skills || 0}</strong></div>
    <div class="stat"><span>Top Demanded Skills</span><strong>${topSkills || "None"}</strong></div>
    <div class="stat"><span>Work Type Distribution</span><strong>${workTypes || "None"}</strong></div>
  `;
}

function selectMatch(index) {
  state.selectedIndex = index;
  const matches = state.report?.matches || [];
  const match = matches[index];
  renderMatches(matches);
  renderJobTable(matches);
  renderSelectedSkills(match);
  renderDetail(match);
  renderMetrics(match, state.report);
}

function renderReport(report) {
  state.report = report;
  state.selectedIndex = 0;
  const firstMatch = report.matches?.[0] || null;

  renderProfile(report.candidate_profile || {});
  renderSkills(report.skills || []);
  renderGapOverview(report.skill_gap_overview || {});
  renderMatches(report.matches || []);
  renderJobTable(report.matches || []);
  renderSelectedSkills(firstMatch);
  renderRoadmap(report.career_roadmap || []);
  renderDetail(firstMatch);
  renderIntel(report.dataset_intelligence || {});
  renderMetrics(firstMatch, report);

  fields.summaryBox.textContent = report.summary || "No company overview summary available.";
  fields.miniSummary.textContent = report.summary || "No company overview summary available.";
  fields.payloadBox.textContent = JSON.stringify(report.api_payload || report, null, 2);
  setStatus("Analysis complete");
}

async function analyze() {
  setError("");
  const cv = fields.cvFile.files[0];
  const dataset = fields.datasetFile.files[0];

  if (!cv) return setError("Please upload a CV PDF first.");
  if (!dataset) return setError("Please upload a job dataset JSON first.");

  const formData = new FormData();
  formData.append("cvFile", cv);
  formData.append("datasetFile", dataset);
  setLoading(true);

  try {
    const response = await fetch("/process", { method: "POST", body: formData });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `Server error ${response.status}`);
    }
    renderReport(payload);
    document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setError(error.message || "Something went wrong while analyzing the files.");
  } finally {
    setLoading(false);
  }
}

function downloadReport() {
  if (!state.report) return setError("Run an analysis before downloading a report.");
  const blob = new Blob([JSON.stringify(state.report, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "joblens-report.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function downloadPdfReport() {
  if (!state.report) return setError("Run an analysis before downloading a PDF report.");
  setStatus("Preparing PDF");

  try {
    const response = await fetch("/download_report_pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.report),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `PDF download failed with ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/pdf")) {
      const text = await response.text();
      throw new Error(text || "Server did not return a PDF file.");
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error("The generated PDF was empty.");
    }

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "joblens-analysis-report.pdf";
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus("PDF downloaded");
  } catch (error) {
    setError(error.message || "Could not download the PDF report.");
  }
}

async function copyReport() {
  if (!state.report) return setError("Run an analysis before copying JSON.");
  await navigator.clipboard.writeText(JSON.stringify(state.report, null, 2));
  setStatus("Copied JSON");
}

fields.cvFile.addEventListener("change", () => syncCvFile(fields.cvFile));
fields.navCvFile.addEventListener("change", () => syncCvFile(fields.navCvFile));
fields.datasetFile.addEventListener("change", () => {
  fields.datasetName.textContent = fields.datasetFile.files[0]?.name || "Choose Dataset JSON";
});
fields.analyzeBtn.addEventListener("click", analyze);
fields.heroAnalyzeBtn.addEventListener("click", () => document.querySelector("#demo").scrollIntoView({ behavior: "smooth" }));
fields.downloadBtn.addEventListener("click", downloadReport);
fields.downloadPdfBtn.addEventListener("click", downloadPdfReport);
fields.copyBtn.addEventListener("click", copyReport);
