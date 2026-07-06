import { analyzeDocs, buildMarkdownReport } from "./analyzer.js";

const sample = `# Widget API

## Overview
Widget API lets teams create and inspect widgets.

## Quickstart
\`\`\`bash
npm install
npm run dev
\`\`\`

## Installation
Requires Node 20 and WIDGET_API_KEY in .env.

## Example
Input:
\`\`\`json
{"name":"demo"}
\`\`\`
Output:
\`\`\`json
{"id":"w_123","status":"created"}
\`\`\`

## Troubleshooting
Back up production data before running migrations.

## Agent Instructions
Canonical command: npm test. Repository: https://example.com/repo. Contact support@example.com.`;

const input = document.querySelector("#docInput");
const titleInput = document.querySelector("#docTitle");
const fileInput = document.querySelector("#fileInput");
const scoreValue = document.querySelector("#scoreValue");
const grade = document.querySelector("#grade");
const stats = document.querySelector("#stats");
const checks = document.querySelector("#checks");
const repairPlan = document.querySelector("#repairPlan");
const commands = document.querySelector("#commands");
const reportOutput = document.querySelector("#reportOutput");

document.querySelector("#sampleBtn").addEventListener("click", () => {
  titleInput.value = "Widget API";
  input.value = sample;
  runAudit();
});

document.querySelector("#auditBtn").addEventListener("click", runAudit);
document.querySelector("#clearBtn").addEventListener("click", () => {
  input.value = "";
  titleInput.value = "";
  renderEmpty();
});

document.querySelector("#downloadBtn").addEventListener("click", () => {
  const analysis = analyzeDocs(input.value);
  const report = buildMarkdownReport(titleInput.value, analysis);
  const blob = new Blob([report], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(titleInput.value || "agentdoc-audit")}-report.md`;
  link.click();
  URL.revokeObjectURL(url);
});

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  titleInput.value = titleInput.value || file.name;
  input.value = await file.text();
  runAudit();
});

input.addEventListener("input", debounce(runAudit, 250));

function runAudit() {
  const analysis = analyzeDocs(input.value);
  renderAnalysis(analysis);
}

function renderAnalysis(analysis) {
  scoreValue.textContent = `${analysis.score}`;
  grade.textContent = analysis.grade;
  grade.className = `grade ${analysis.score >= 85 ? "good" : analysis.score >= 70 ? "ok" : "warn"}`;
  stats.innerHTML = `
    <span>${analysis.stats.words} words</span>
    <span>${analysis.stats.headings} headings</span>
    <span>${analysis.stats.codeBlocks} code blocks</span>
    <span>${analysis.stats.commands} commands</span>
  `;
  checks.innerHTML = analysis.results.map((item) => `
    <li class="${item.passed ? "pass" : "fail"}">
      <span>${item.passed ? "✓" : "!"}</span>
      <div>
        <strong>${item.label}</strong>
        <small>${item.passed ? `+${item.weight} points` : item.fix}</small>
      </div>
    </li>
  `).join("");
  repairPlan.innerHTML = analysis.repairPlan.map((item) => `<li>${item}</li>`).join("");
  commands.innerHTML = analysis.commands.length
    ? analysis.commands.map((cmd) => `<code>${escapeHtml(cmd)}</code>`).join("")
    : "<p>No runnable commands detected yet.</p>";
  reportOutput.value = buildMarkdownReport(titleInput.value, analysis);
}

function renderEmpty() {
  renderAnalysis(analyzeDocs(""));
}

function debounce(fn, delay) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), delay);
  };
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

renderEmpty();
