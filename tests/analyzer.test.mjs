import assert from "node:assert/strict";
import { analyzeDocs, buildMarkdownReport } from "../src/analyzer.js";

const strongDoc = `# Product Docs

## Overview
Useful docs.

## Quickstart
\`\`\`bash
npm install
npm test
\`\`\`

## Installation
Requires Node 20 and PRODUCT_API_KEY in .env.

## Example
Input:
\`\`\`json
{"url":"https://example.com"}
\`\`\`
Output:
\`\`\`json
{"ok":true}
\`\`\`

## Limitations
Do not run destructive delete commands in production.

## Agent Instructions
Use AGENTS.md and llms.txt. Repository: https://example.com/repo. Contact support@example.com.
`;

const weakDoc = "This app is nice. Ask Bob how to run it.";

const strong = analyzeDocs(strongDoc);
const weak = analyzeDocs(weakDoc);

assert.ok(strong.score > 75, `expected strong doc score > 75, got ${strong.score}`);
assert.ok(weak.score < 30, `expected weak doc score < 30, got ${weak.score}`);
assert.ok(strong.commands.includes("npm install"));
assert.ok(strong.commands.includes("npm test"));

const report = buildMarkdownReport("Product Docs", strong);
assert.match(report, /AgentDoc Audit Report/);
assert.match(report, /Score:/);

console.log("analyzer tests passed");
