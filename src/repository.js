export function resolvePath(base, relative) {
  if (/^(?:[/\\]|[A-Za-z]:)|\$|[~*]/.test(relative)) return null;
  const parts = base ? base.split("/").filter(Boolean) : [];
  for (const part of relative.replace(/\\/g, "/").split("/")) {
    if (part === "..") {if (!parts.length) return null; parts.pop();}
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

export function checkRepository(text, commands, files, documentPath) {
  const results = [];
  const add = (id, label, status, detail, line) => results.push({id, label, status, detail, line});
  const has = (path) => Object.hasOwn(files, path);
  const packages = new Map();
  for (const [path, content] of Object.entries(files)) {
    if (path === "package.json" || path.endsWith("/package.json")) {
      try {packages.set(path, JSON.parse(content));}
      catch {add("package-invalid", "Invalid package manifest", "needs-review", `${path} could not be parsed. Script checks for this package are unavailable.`);}
    }
  }
  let cwd = "", block;
  for (const entry of commands) {
    if (entry.block !== block) {cwd = ""; block = entry.block;}
    // Only simple root-relative shell commands are verified; compound commands remain explicit.
    if (/[;&|`]|\$\(|\\$/.test(entry.command)) {add("command-complex", "Compound command", "not-evaluated", "Split compound shell commands into separate lines for repository checks.", entry.line); continue;}
    const words = entry.command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((w) => w.replace(/^['"]|['"]$/g, "")) || [];
    if (words[0] === "cd") {
      cwd = words.length === 2 && cwd !== null ? resolvePath(cwd, words[1]) : null;
      if (cwd === null) add("command-cwd", "Working directory not resolved", "not-evaluated", "This directory change cannot be resolved within the supplied repository.", entry.line);
      continue;
    }
    if (cwd === null) {add("command-cwd", "Command location unavailable", "not-evaluated", "Resolve the earlier directory change before checking this command.", entry.line); continue;}
    const manifestPath = cwd ? `${cwd}/package.json` : "package.json";
    let script;
    if (["npm", "pnpm", "yarn", "bun"].includes(words[0])) {
      if (["run", "run-script"].includes(words[1])) script = words[2];
      else if (["test", "start", "dev", "build", "lint", "check"].includes(words[1])) script = words[1];
    }
    if (script) {
      const manifest = packages.get(manifestPath);
      if (!manifest) add("script-unavailable", "Package script not checked", "not-evaluated", `${manifestPath} is unavailable or invalid.`, entry.line);
      else add("script", `Package script: ${script}`, Object.hasOwn(manifest.scripts || {}, script) ? "verified" : "needs-review",
        Object.hasOwn(manifest.scripts || {}, script) ? `${manifestPath} defines this script. Its execution is not tested.` : `${manifestPath} does not define a ${script} script.`, entry.line);
    } else if (words[0] === "make" && words[1] && !words[1].startsWith("-")) {
      const path = cwd ? `${cwd}/Makefile` : "Makefile";
      if (!has(path)) add("make", "Make target", "not-evaluated", `${path} was not supplied.`, entry.line);
      else {
        const targets = String(files[path]).split("\n").filter((l) => !/^\s|^#/.test(l)).flatMap((l) => l.split(":")[0].split(/\s+/));
        add("make", `Make target: ${words[1]}`, targets.includes(words[1]) ? "verified" : "needs-review", targets.includes(words[1]) ? `${path} defines this target; execution is untested.` : `${path} does not define this target.`, entry.line);
      }
    } else if (/^\.\.?\//.test(words[0]) || ["node", "python", "python3", "bash", "sh"].includes(words[0]) && words[1] && !words[1].startsWith("-")) {
      const target = resolvePath(cwd, /^\.\.?\//.test(words[0]) ? words[0] : words[1]);
      add("command-file", "Command file", target && has(target) ? "verified" : "needs-review", target && has(target) ? `${target} exists; execution is untested.` : "The referenced file is outside the repository or is not in the supplied file inventory.", entry.line);
    } else add("command-other", "Command behavior", "not-evaluated", "This command is extracted but its behavior is not verified.", entry.line);
  }
  const base = documentPath.split("/").slice(0, -1).join("/");
  for (const match of text.matchAll(/(?<!!)\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(raw)) continue;
    let relative;
    try {relative = decodeURIComponent(raw.split(/[?#]/)[0]);} catch {relative = null;}
    const target = relative === null ? null : resolvePath(base, relative);
    const line = text.slice(0, match.index).split("\n").length;
    add("local-link", "Local document link", target && (has(target) || Object.keys(files).some((p) => p.startsWith(`${target}/`))) ? "verified" : "needs-review", target && has(target) ? `${target} exists. Link fragments are not validated.` : target && Object.keys(files).some((p) => p.startsWith(`${target}/`)) ? `${target} is a directory in the inventory.` : `${raw} does not resolve to a supplied repository file or directory.`, line);
  }
  const envFiles = Object.entries(files).filter(([path]) => /(^|\/)\.env\.example$/.test(path));
  for (const [path, content] of envFiles) {
    for (const match of String(content).matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z\d_]*)\s*=/gm)) {
      const name = match[1];
      const documented = new RegExp(`\\b${name}\\b`).test(text);
      add("env-name", `Environment name: ${name}`, documented ? "verified" : "needs-review", documented ? `${name} appears in ${path} and the documentation. Values and required/optional status are not verified.` : `${path} defines ${name}, but this name is absent from the documentation.`);
    }
  }
  if (!envFiles.length) add("env-unavailable", "Environment inventory", "not-evaluated", "No .env.example was supplied. This check does not require a project to use environment variables.");
  return results;
}
