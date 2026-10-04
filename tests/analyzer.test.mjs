import assert from "node:assert/strict";
import test from "node:test";
import {analyzeDocs, buildMarkdownReport} from "../src/analyzer.js";
import {checkRepository, resolvePath} from "../src/repository.js";
import {includePath} from "../src/inventory.js";

const good = '# Product\n\n## Quickstart\n```bash\nnpm install\nnpm run test\n```\n## Installation\nRequires Node 22. Configure API_KEY from .env.example.\n## Example\nInput: a request with a title.\nOutput: a new record with an ID.\n## Limitations\nOffline mode does not support notifications.\n';
const files = {"package.json": JSON.stringify({scripts:{test:"node test.mjs"}}), ".env.example":"API_KEY=example-only\n", "README.md":good, "test.mjs":""};

test("analyzer reports observations with source lines, no readiness score", () => {
  const result = analyzeDocs(good);
  assert.equal(result.score, undefined); assert.equal(result.grade, undefined);
  assert.ok(result.commandEntries.find((e) => e.command === "npm run test" && e.line === 6));
  assert.ok(result.results.every((r) => ["observed","needs-review","verified","not-evaluated"].includes(r.status)));
  assert.ok(result.notEvaluated.some((s) => /never executed/.test(s)));
});
test("placeholder-filled document and destructive instruction remain findings", () => {
  const doc = '# Widget\n## Quickstart\n```sh\nnpm run imaginary-task\n```\n## Installation\nTODO\n## Example\nTODO\n## Limitations\nTODO\nDelete production data immediately.\n';
  const result = analyzeDocs(doc, {files});
  assert.ok(result.issues.some((r) => r.id === "script"));
  assert.ok(result.issues.some((r) => r.id === "placeholder"));
  assert.ok(result.issues.some((r) => r.id === "destructive"));
  assert.ok(result.issues.some((r) => r.id === "install"));
  assert.doesNotMatch(buildMarkdownReport("Widget",result), /Agent-ready|100\/100/);
});
test("production wording is never treated as a passed safety assessment", () => {
  const result = analyzeDocs("Use this in production.");
  assert.ok(result.notEvaluated.some((s) => /Operational safety/.test(s)));
  assert.equal(result.results.filter((r) => r.id === "safety").length, 0);
});
test("npx, make and shell scripts use the same extraction path", () => {
  const result = analyzeDocs('# Quickstart\n~~~sh\nnpx tool\nmake install\n./scripts/check.sh\n~~~');
  assert.deepEqual(result.commands, ["npx tool","make install","./scripts/check.sh"]);
  assert.equal(result.results.find((r) => r.id === "commands").status,"observed");
});
test("JSON and code text cannot impersonate documentation headings", () => {
  const result = analyzeDocs('```json\n# Quickstart\nnpm run test\n```');
  assert.equal(result.commands.length, 0); assert.equal(result.stats.headings, 0);
});
test("unclosed fences are reported and not treated as complete command examples", () => {
  const result = analyzeDocs('# Quickstart\n```sh\nnpm test\n');
  assert.ok(result.issues.some((r) => r.id === "fence")); assert.equal(result.commands.length, 0);
});
test("destructive command is a review item even if backups are mentioned", () => {
  const result = analyzeDocs('# Quickstart\n```sh\nrm -rf ./data\n```\nBack up production first.');
  assert.ok(result.issues.some((r) => r.id === "destructive"));
});
test("repository checks verify defined scripts and report missing ones", () => {
  const result = analyzeDocs(good+'\n```sh\nnpm run imaginary\nnode missing.mjs\n```', {files});
  assert.ok(result.results.some((r) => r.id === "script" && r.status === "verified"));
  assert.ok(result.issues.some((r) => r.id === "script" && /imaginary/.test(r.detail)));
  assert.ok(result.issues.some((r) => r.id === "command-file"));
});
test("nested working directory and Make targets use supplied files", () => {
  const commands = [{command:"cd packages/api",line:2,block:1},{command:"npm run test",line:3,block:1},{command:"make check",line:5,block:4}];
  const results = checkRepository("",commands,{"packages/api/package.json":files["package.json"],"Makefile":"check:\n\tnode test.mjs\n"},"README.md");
  assert.equal(results.find((r) => r.id === "script").status,"verified");
  assert.equal(results.find((r) => r.id === "make").status,"verified");
});
test("compound commands are explicitly not evaluated", () => {
  const result = analyzeDocs('```sh\nnpm run missing && echo success\n```',{files});
  assert.ok(result.results.some((r) => r.id === "command-complex" && r.status === "not-evaluated"));
});
test("local links resolve relative to the document and reject traversal", () => {
  const result = analyzeDocs('[Good](../test.mjs)\n[Missing](missing.md)\n[External](https://example.com)\n[Outside](../../outside)',{files,documentPath:"docs/setup.md"});
  assert.equal(result.results.filter((r) => r.id === "local-link" && r.status === "verified").length,1);
  assert.equal(result.issues.filter((r) => r.id === "local-link").length,2);
  assert.equal(resolvePath("", "../outside"),null); assert.equal(resolvePath("", "/etc/passwd"),null);
});
test("environment checks report missing names without leaking values", () => {
  const result = analyzeDocs(good,{files:{...files,".env.example":"API_KEY=PRIVATE_VALUE\nMISSING_NAME=ANOTHER_PRIVATE_VALUE\n"}});
  assert.ok(result.issues.some((r) => r.id === "env-name" && /MISSING_NAME/.test(r.detail)));
  const report = buildMarkdownReport("test",result);
  assert.doesNotMatch(report,/PRIVATE_VALUE|ANOTHER_PRIVATE_VALUE/);
});
test("projects without environment files are not penalized", () => {
  const result = analyzeDocs(good,{files:{"package.json":files["package.json"]}});
  assert.equal(result.issues.filter((r) => r.id.startsWith("env")).length,0);
});
test("private configuration and dependency files are excluded", () => {
  for(const path of [".env",".env.local","src/.env.production","node_modules/pkg/package.json","private.key",".git/config"]) assert.equal(includePath(path),false,path);
  assert.equal(includePath("src/.env.example"),true);
});
test("report does not invent an AGENTS.md or populate TODO placeholders", () => {
  const report = buildMarkdownReport("Product",analyzeDocs(good,{files}));
  assert.match(report,/\[verified\]/); assert.match(report,/line 6/);
  assert.doesNotMatch(report,/Suggested AGENTS.md|TODO|Grade:|Score:/);
});
