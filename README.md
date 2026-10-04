# AgentDoc Audit

Local documentation checks with optional evidence from repository files.
AgentDoc extracts commands, flags incomplete guidance and compares documented
scripts, file references and environment names with supplied configuration.
It does not execute commands or certify agent readiness, safety or deployment.

## Quickstart

Requires Node.js 22.12+ or 24+ and npm.

```sh
npm ci
npm start
```

Paste Markdown or upload a `.md`, `.markdown` or `.txt` file. Optionally select a
local repository folder. Everything stays in the browser; no API key, account
or backend is used.

## Repository CLI

```sh
npm run audit -- /path/to/repository
npm run audit -- /path/to/repository --doc docs/setup.md --json
```

Use the CLI for nested documentation paths. Browser uploads use the selected
document's filename; a standalone file upload does not retain its parent path.

Example: if a README contains `npm run verify` but its package.json has no
`verify` script, the report identifies the README line and the missing script.
An existing script is marked `verified` only for its presence in the manifest.
Its behavior is never executed or certified.

The CLI returns 0 when no review findings are reported, 1 when findings need
review, and 2 for invalid inputs or unreadable/oversized files. Exit 0 does not
establish that the repository is ready for an agent or release.

## Checks and scope

- Quickstart, setup, example and limitation sections with actual content.
- Unresolved prose placeholders and selected destructive commands/instructions.
- Fenced shell command extraction, including npx, make and local script paths.
- Simple package-script definitions, Make targets and referenced command files.
- Local Markdown links relative to the selected document (fragments unchecked).
- Exact environment names from `.env.example`, without exporting their values.
- Source line references, JSON output and Markdown reports with explicit limits.

Observed content is a heuristic. Repository checks verify file or definition
presence, not semantic correctness. Compound commands, complex shell context,
dynamic Make targets and unsupported command forms remain not evaluated.
Instructions still require operational and human review. AGENTS.md discovery
depends on the actual agent configuration; mentioning a filename does not
establish that the file will be loaded.

Only Markdown and plain text are supported. References shown inside code blocks
may need manual review. Linked directories can be checked from the inventory;
web URLs and link fragments are not fetched or validated.

## Privacy and limits

Repository mode inventories file names and reads package.json, Makefile and
`.env.example` files. It excludes dependency/build folders, `.git`, `.env` and
other `.env.*` files except `.env.example`, and `.pem`, `.key`, `.p12`, `.pfx`
files. The CLI skips symlinks. Configuration values are not printed in findings.
Keep actual credentials out of `.env.example`.

Select a bounded repository/package: the inventory stops with an error above
10,000 entries. Configuration and document files are limited to 1 MB.
Nothing is uploaded, and no documented command is executed.

## Validation

```sh
npm test
npm run build
```

Tests cover invented commands, placeholders, destructive guidance, code fences,
local links, environment-name checks, nested commands and read-only CLI behavior.
The Vite production bundle is written to `dist/`; Vercel uses `vercel.json`.

Built by North Star Holdings.
