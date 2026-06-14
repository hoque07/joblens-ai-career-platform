const $ = (id) => document.getElementById(id);
const cvFile = $("cvFile");
const navCvFile = $("navCvFile");
const datasetFile = $("datasetFile");
const message = "This GitHub Pages site is a static preview. Clone the repository and run Flask for real CV analysis and PDF reports.";

function showFile(input, target) {
  const file = input.files && input.files[0];
  if (file) $(target).textContent = file.name;
}

function showDemo() {
  $("errorBox").textContent = message;
  $("topStatus").textContent = "Static preview";
  document.querySelector("#results").scrollIntoView({ behavior: "smooth" });
}

cvFile.addEventListener("change", () => showFile(cvFile, "cvName"));
navCvFile.addEventListener("change", () => showFile(navCvFile, "cvName"));
datasetFile.addEventListener("change", () => showFile(datasetFile, "datasetName"));
$("analyzeBtn").addEventListener("click", showDemo);
$("heroAnalyzeBtn").addEventListener("click", () => document.querySelector("#demo").scrollIntoView({ behavior: "smooth" }));
$("downloadPdfBtn").addEventListener("click", showDemo);
$("downloadBtn").addEventListener("click", showDemo);
$("copyBtn").addEventListener("click", showDemo);
