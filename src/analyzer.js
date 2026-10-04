import {checkRepository} from "./repository.js";

export const NOT_EVALUATED = [
  "Commands are extracted, never executed. A matching script or file does not prove that setup works.",
  "Operational safety, permissions, secrets and deployment readiness require human review.",
  "Instruction discovery and precedence depend on the agent, directory and configuration.",
  "Plain text and Markdown are supported; reStructuredText and other markup are not parsed."
];

function meaningful(text) {
  return text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "")
    .split("\n").some((line) => line.trim().length > 12 && !/^\s*(?:#+\s|(?:TODO|TBD|FIXME|coming soon|placeholder)\b)/i.test(line));
}

function parseMarkdown(text) {
  const lines = text.split("\n"), headings = [], fences = [], prose = [];
  let fence;
  lines.forEach((line, index) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})([^\s]*)\s*$/);
    if (fence) {
      if (marker && marker[1][0] === fence.marker[0] && marker[1].length >= fence.marker.length && !marker[2]) {fences.push(fence); fence = null;}
      else fence.body.push({text: line, line: index + 1});
      return;
    }
    if (marker) {fence = {marker: marker[1], language: marker[2].toLowerCase(), line: index + 1, body: []}; return;}
    prose.push({text: line, line: index + 1});
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) headings.push({title: heading[2], level: heading[1].length, line: index + 1});
  });
  const unclosed = fence;
  const sections = headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((h) => h.level <= heading.level);
    const end = next ? next.line - 1 : lines.length;
    return {...heading, text: lines.slice(heading.line, end).join("\n"), end};
  });
  return {lines, headings, sections, fences, prose, unclosed};
}

function commandEntries(fences) {
  const entries = [];
  const known = /^(?:(?:npm|pnpm|yarn|python(?:3)?|pip(?:3)?|docker|curl|git|node|bun|npx|make|cargo|go|uv|bash|sh|cd|rm|rmdir|sudo|psql|mysql)\b|\.\.?\/\S+)/;
  for (const fence of fences.filter((f) => ["", "bash", "sh", "shell", "console", "zsh", "powershell", "ps1"].includes(f.language))) {
    for (const row of fence.body) {
      const command = row.text.replace(/^\s*\$\s*/, "").trim();
      if (known.test(command)) entries.push({command, line: row.line, block: fence.line});
    }
  }
  return entries;
}

export function analyzeDocs(rawText, context = {}) {
  const text = String(rawText || "").replace(/\r\n/g, "\n");
  const parsed = parseMarkdown(text), entries = commandEntries(parsed.fences), results = [];
  const add = (id, label, status, detail, line = null) => results.push({id, label, status, detail, line});
  const section = (pattern) => parsed.sections.find((s) => pattern.test(s.title));
  const quickstart = section(/quick\s*start|getting started|usage/i);
  const quickCommands = quickstart && entries.filter((e) => e.line > quickstart.line && e.line <= quickstart.end);
  add("quickstart", "Quickstart commands", quickCommands?.length ? "observed" : "needs-review",
    quickCommands?.length ? "Commands appear in the quickstart section. Their execution has not been tested." : "Add a quickstart section with explicit setup and validation commands.", quickstart?.line);
  const install = section(/install|requirements|prerequisites|setup/i);
  add("install", "Setup and prerequisites", install && meaningful(install.text) ? "observed" : "needs-review",
    install && meaningful(install.text) ? "Setup guidance is present; verify it against the current runtime and dependencies." : "Describe actual runtime versions, dependencies and setup steps.", install?.line);
  add("commands", "Command extraction", entries.length ? "observed" : "needs-review",
    entries.length ? `${entries.length} command line(s) extracted. Extraction does not establish correctness.` : "Provide commands in fenced shell blocks.", entries[0]?.line);
  const example = section(/example|sample/i);
  add("examples", "Usage examples", example && (meaningful(example.text) || parsed.fences.some((f) => f.line > example.line && f.line <= example.end && f.body.some((r) => r.text.trim()))) ? "observed" : "needs-review",
    example ? "Check example inputs and outputs against actual behavior." : "Add an example with input and expected output.", example?.line);
  const limits = section(/limitations|known issues|non-goals|troubleshooting|known limits/i);
  add("scope", "Limitations and troubleshooting", limits && meaningful(limits.text) ? "observed" : "needs-review",
    limits && meaningful(limits.text) ? "A limitations or troubleshooting section contains guidance." : "Describe actual failure modes and unsupported operations.", limits?.line);
  for (const row of parsed.prose) {
    if (/\b(?:TODO|TBD|FIXME|placeholder|coming soon)\b/i.test(row.text)) add("placeholder", "Unresolved placeholder", "needs-review", row.text.trim(), row.line);
    if (/^\s*(?:delete|drop|erase|wipe)\b.*\b(?:production|database|data|files)\b/i.test(row.text)) add("destructive", "Review destructive instruction", "needs-review", row.text.trim(), row.line);
  }
  for (const entry of entries) {
    if (/\brm\s+(?:-[^\s]+\s+)*|\b(?:drop\s+(?:database|table)|truncate\s+table)|\bgit\s+(?:reset\s+--hard|clean\s+-)/i.test(entry.command)) add("destructive", "Review destructive command", "needs-review", "Verify the target, permission and recovery plan before anyone follows this command.", entry.line);
  }
  if (parsed.unclosed) add("fence", "Unclosed code block", "needs-review", "Close the code fence so later prose is not mistaken for code.", parsed.unclosed.line);
  const repositoryChecks = context.files ? checkRepository(text, entries, context.files, context.documentPath || "README.md") : [];
  results.push(...repositoryChecks);
  const issues = results.filter((r) => r.status === "needs-review");
  return {
    results, issues, commands: [...new Set(entries.map((e) => e.command))], commandEntries: entries,
    notEvaluated: [...NOT_EVALUATED, ...(context.files ? [] : ["Repository scripts, referenced files and documented environment names were not checked. Load a repository or use the CLI."])],
    stats: {words: text.trim() ? text.trim().split(/\s+/).length : 0, headings: parsed.headings.length, codeBlocks: parsed.fences.length, commands: entries.length},
    repairPlan: issues.length ? issues.map((r) => `${r.line ? `Line ${r.line}: ` : ""}${r.detail}`) : ["No findings from the listed checks. Validate the instructions and review the uncovered areas."],
    repositoryChecked: Boolean(context.files)
  };
}

export function buildMarkdownReport(title, analysis) {
  const location = (r) => r.line ? ` (line ${r.line})` : "";
  return [`# AgentDoc Audit: ${String(title || "Untitled documentation").replace(/\n/g, " ")}`, "", `Findings requiring review: ${analysis.issues.length}`, "This is a documentation checklist, not readiness or safety certification.", "", "## Checks",
    ...analysis.results.map((r) => `- [${r.status}] ${r.label}${location(r)}: ${r.detail}`), "", "## Not evaluated", ...analysis.notEvaluated.map((r) => `- ${r}`), "", "## Suggested repairs", ...analysis.repairPlan.map((r) => `- ${r}`), "", "## Extracted commands (not executed)",
    ...analysis.commandEntries.map((e) => `- Line ${e.line}: ${e.command}`)].join("\n");
}
