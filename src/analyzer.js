const CHECKS = [
  {
    id: "quickstart",
    label: "Copy-paste quickstart",
    weight: 15,
    test: (doc) => hasAny(doc, ["quickstart", "quick start", "getting started"]) && hasFence(doc),
    fix: "Add a Quickstart section with one copy-pasteable command block."
  },
  {
    id: "install",
    label: "Install and prerequisites",
    weight: 12,
    test: (doc) => hasAny(doc, ["install", "installation", "requirements", "prerequisites", "dependencies"]),
    fix: "State required runtime versions, package manager, environment variables, and install commands."
  },
  {
    id: "commands",
    label: "Runnable commands",
    weight: 12,
    test: (doc) => countMatches(doc, /```[\s\S]*?(npm|pnpm|yarn|python|pip|docker|curl|git|node|bun)\b[\s\S]*?```/gi) >= 1,
    fix: "Put commands in fenced code blocks so agents can extract and run them safely."
  },
  {
    id: "env",
    label: "Environment variable clarity",
    weight: 9,
    test: (doc) => hasAny(doc, [".env", "environment variable", "api key", "secret", "token"]) && /[A-Z][A-Z0-9_]{3,}/.test(doc),
    fix: "List every env var by exact name and mark optional versus required."
  },
  {
    id: "examples",
    label: "Input/output examples",
    weight: 10,
    test: (doc) => hasAny(doc, ["example", "sample", "input", "output"]) && countMatches(doc, /```/g) >= 2,
    fix: "Add a realistic example with input, command, and expected output."
  },
  {
    id: "structure",
    label: "Scannable heading structure",
    weight: 9,
    test: (doc) => countMatches(doc, /^#{1,3}\s+\S.+$/gm) >= 4,
    fix: "Use clear H2/H3 sections for overview, setup, usage, configuration, troubleshooting, and limits."
  },
  {
    id: "scope",
    label: "Known limits and non-goals",
    weight: 8,
    test: (doc) => hasAny(doc, ["limitations", "known issues", "non-goals", "not supported", "troubleshooting"]),
    fix: "Tell agents what not to attempt and what failure modes are expected."
  },
  {
    id: "machine",
    label: "Machine-readable summary",
    weight: 10,
    test: (doc) => hasAny(doc, ["llms.txt", "agents.md", "agent instructions", "machine-readable", "json schema", "yaml"]),
    fix: "Add an AGENTS.md or llms.txt style summary with canonical commands and constraints."
  },
  {
    id: "links",
    label: "Canonical links and ownership",
    weight: 7,
    test: (doc) => /https?:\/\/\S+/.test(doc) && hasAny(doc, ["support", "contact", "repository", "license", "owner"]),
    fix: "Include source repo, support/contact path, license, and canonical docs URL."
  },
  {
    id: "safety",
    label: "Safety and destructive-action warnings",
    weight: 8,
    test: (doc) => hasAny(doc, ["warning", "caution", "backup", "destructive", "delete", "production"]),
    fix: "Flag destructive commands, production caveats, permissions, and backup expectations."
  }
];

export function analyzeDocs(rawText) {
  const text = normalize(rawText);
  const totalWeight = CHECKS.reduce((sum, check) => sum + check.weight, 0);
  const results = CHECKS.map((check) => {
    const passed = check.test(text);
    return {
      id: check.id,
      label: check.label,
      passed,
      weight: check.weight,
      score: passed ? check.weight : 0,
      fix: check.fix
    };
  });
  const score = Math.round((results.reduce((sum, item) => sum + item.score, 0) / totalWeight) * 100);
  const headings = [...text.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].trim());
  const commands = extractCommands(text);
  const issues = results.filter((item) => !item.passed);
  const grade = score >= 85 ? "Agent-ready" : score >= 70 ? "Needs light repair" : score >= 50 ? "Agent-fragile" : "Agent-hostile";

  return {
    score,
    grade,
    passed: results.filter((item) => item.passed).length,
    total: results.length,
    results,
    issues,
    headings,
    commands,
    stats: {
      words: text ? text.split(/\s+/).filter(Boolean).length : 0,
      headings: headings.length,
      codeBlocks: countMatches(text, /```/g) / 2,
      commands: commands.length
    },
    repairPlan: buildRepairPlan(issues)
  };
}

export function buildMarkdownReport(title, analysis) {
  const lines = [
    `# AgentDoc Audit Report: ${title || "Untitled docs"}`,
    "",
    `Score: ${analysis.score}/100`,
    `Grade: ${analysis.grade}`,
    "",
    "## Passed Checks",
    ...analysis.results.filter((item) => item.passed).map((item) => `- ${item.label}`),
    "",
    "## Repairs",
    ...(analysis.issues.length ? analysis.issues.map((item) => `- ${item.fix}`) : ["- No critical repairs found."]),
    "",
    "## Detected Commands",
    ...(analysis.commands.length ? analysis.commands.map((cmd) => `- \`${cmd}\``) : ["- None detected."]),
    "",
    "## Suggested AGENTS.md Block",
    "```markdown",
    "## Agent Notes",
    "- Canonical setup command: TODO",
    "- Validation command: TODO",
    "- Required env vars: TODO",
    "- Known limits: TODO",
    "- Avoid destructive actions unless explicitly approved.",
    "```"
  ];
  return lines.join("\n");
}

function buildRepairPlan(issues) {
  if (!issues.length) {
    return ["Publish an AGENTS.md or llms.txt companion file so AI tools can find the canonical path."];
  }
  return issues.slice(0, 5).map((item, index) => `${index + 1}. ${item.fix}`);
}

function extractCommands(doc) {
  const commands = [];
  const fences = doc.match(/```[\s\S]*?```/g) || [];
  for (const fence of fences) {
    const body = fence.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, "").trim();
    for (const line of body.split("\n")) {
      const cleaned = line.replace(/^\$\s*/, "").trim();
      if (/^(npm|pnpm|yarn|python|pip|docker|curl|git|node|bun|npx)\b/.test(cleaned)) {
        commands.push(cleaned);
      }
    }
  }
  return [...new Set(commands)].slice(0, 12);
}

function normalize(rawText) {
  return String(rawText || "").replace(/\r\n/g, "\n").trim();
}

function hasAny(doc, terms) {
  const lower = doc.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function hasFence(doc) {
  return /```[\s\S]+```/.test(doc);
}

function countMatches(doc, regex) {
  return (doc.match(regex) || []).length;
}
