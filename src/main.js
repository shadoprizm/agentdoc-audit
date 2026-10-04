import {analyzeDocs, buildMarkdownReport} from "./analyzer.js";
import {includePath, needsContent} from "./inventory.js";

const $ = (id) => document.getElementById(id);
let repositoryFiles, documentPath = "README.md", fileRevision = 0, repositoryRevision = 0;
const sample = "# Widget API\n\n## Quickstart\n```bash\nnpm install\nnpm run dev\n```\n\n## Installation\nRequires Node 22. Set WIDGET_API_KEY using .env.example.\n\n## Example\nInput: {\"name\":\"demo\"}\nOutput: {\"id\":\"w_123\"}\n\n## Known limits\nThe local preview cannot send notifications.\n";

function element(tag, text) {const node = document.createElement(tag); node.textContent = text; return node;}
function analysis() {return analyzeDocs($("docInput").value, {files: repositoryFiles, documentPath});}
function runAudit() {
  const result = analysis();
  $("findingCount").textContent = String(result.issues.length);
  $("checkMode").textContent = result.repositoryChecked ? "Repository files loaded" : "Text checks only";
  $("stats").replaceChildren(...Object.entries(result.stats).map(([label, count]) => element("span", `${count} ${label}`)));
  $("checks").replaceChildren();
  for (const check of result.results) {
    const item = document.createElement("li"); item.className = check.status === "needs-review" ? "fail" : "pass";
    const body = document.createElement("div");
    body.append(element("strong", `${check.label}${check.line ? ` — line ${check.line}` : ""}`), element("small", `${check.status}: ${check.detail}`));
    item.append(element("span", check.status === "needs-review" ? "!" : check.status === "verified" ? "✓" : "·"), body);
    $("checks").append(item);
  }
  $("coverage").replaceChildren(...result.notEvaluated.map((text) => element("p", text)));
  $("repairPlan").replaceChildren(...result.repairPlan.map((text) => element("li", text)));
  $("commands").replaceChildren(...result.commandEntries.map((entry) => element("code", `Line ${entry.line}: ${entry.command}`)));
  if (!result.commandEntries.length) $("commands").append(element("p", "No supported command lines were extracted."));
  $("reportOutput").value = buildMarkdownReport($("docTitle").value, result);
  $("downloadBtn").disabled = !$("docInput").value.trim();
}

$("sampleBtn").addEventListener("click", () => {fileRevision++; $("docTitle").value = "Widget API"; $("docInput").value = sample; documentPath = "README.md"; runAudit();});
$("auditBtn").addEventListener("click", runAudit);
$("clearBtn").addEventListener("click", () => {fileRevision++; $("docTitle").value = ""; $("docInput").value = ""; runAudit();});
for (const id of ["docInput", "docTitle"]) $(id).addEventListener("input", () => {fileRevision++; runAudit();});
$("fileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  const revision = ++fileRevision;
  if (!/\.(?:md|markdown|txt)$/i.test(file.name) || file.size > 1000000) {$("fileStatus").textContent = "Choose a Markdown or text file up to 1 MB."; return;}
  try {
    const text = await file.text(); if (revision !== fileRevision) return;
    $("docTitle").value = file.name; $("docInput").value = text;
    documentPath = file.webkitRelativePath?.split("/").slice(1).join("/") || file.name;
    $("fileStatus").textContent = "Document loaded locally."; runAudit();
  } catch {if (revision === fileRevision) $("fileStatus").textContent = "Could not read this file.";}
});
$("repositoryInput").addEventListener("change", async (event) => {
  const selected = [...event.target.files]; if (!selected.length) return;
  const revision = ++repositoryRevision;
  repositoryFiles = undefined; runAudit();
  $("repositoryStatus").textContent = "Reading the selected local file inventory…";
  try {
    const files = Object.create(null);
    for (const file of selected) {
      const path = file.webkitRelativePath.split("/").slice(1).join("/");
      if (!path || !includePath(path)) continue;
      if (Object.keys(files).length >= 10000) throw new Error("Select a smaller folder (up to 10,000 files).");
      if (needsContent(path) && file.size > 1000000) throw new Error(`${path} exceeds 1 MB.`);
      files[path] = needsContent(path) ? await file.text() : "";
    }
    if (revision !== repositoryRevision) return;
    repositoryFiles = files;
    $("repositoryStatus").textContent = `${Object.keys(files).length} local file names loaded. Only package manifests, Makefiles and .env.example contents were read. Commands are not executed.`;
    runAudit();
  } catch (error) {
    if (revision === repositoryRevision) {repositoryFiles = undefined; $("repositoryStatus").textContent = error.message; runAudit();}
  }
});
$("clearRepository").addEventListener("click", () => {repositoryRevision++; repositoryFiles = undefined; $("repositoryInput").value = ""; $("repositoryStatus").textContent = "No repository loaded."; runAudit();});
$("downloadBtn").addEventListener("click", () => {
  if (!$("docInput").value.trim()) return;
  const report = buildMarkdownReport($("docTitle").value, analysis());
  const url = URL.createObjectURL(new Blob([report], {type: "text/markdown;charset=utf-8"}));
  const link = document.createElement("a"); link.href = url;
  link.download = `${$("docTitle").value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agentdoc-audit"}-report.md`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
runAudit();
