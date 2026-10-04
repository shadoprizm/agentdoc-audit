#!/usr/bin/env node
import {readdir, readFile, realpath, stat} from "node:fs/promises";
import path from "node:path";
import {analyzeDocs, buildMarkdownReport} from "../src/analyzer.js";
import {includePath, needsContent} from "../src/inventory.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {console.log("Usage: node bin/audit.mjs [repository] [--doc README.md] [--json]\nRead-only checks; documented commands are never executed. Exit 1 means findings need review."); return;}
  const json = args.includes("--json");
  const docIndex = args.indexOf("--doc");
  const documentPath = docIndex >= 0 ? args[docIndex + 1] : "README.md";
  if (!documentPath || documentPath.startsWith("--")) throw new Error("--doc requires a repository-relative document path.");
  const rootArg = args.filter((arg, index) => !arg.startsWith("--") && !(docIndex >= 0 && index === docIndex + 1))[0] || ".";
  const root = await realpath(rootArg);
  const document = await realpath(path.resolve(root, documentPath));
  const relativeDocument = path.relative(root, document);
  if (!relativeDocument || relativeDocument === ".." || relativeDocument.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDocument)) throw new Error("The document must stay inside the selected repository.");
  if (!includePath(path.relative(root, document).split(path.sep).join("/"))) throw new Error("The document path is excluded to protect private configuration.");
  const files = Object.create(null);
  let count = 0;
  async function readBounded(file, label) {
    if ((await stat(file)).size > 1000000) throw new Error(`${label} exceeds the 1 MB file size limit.`);
    return readFile(file, "utf8");
  }
  async function walk(directory, prefix = "") {
    for (const entry of await readdir(directory, {withFileTypes: true})) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!includePath(relative) || entry.isSymbolicLink()) continue;
      if (++count > 10000) throw new Error("Repository exceeds the 10,000-entry limit. Select a smaller package root.");
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (entry.isFile()) {
        files[relative] = "";
        if (needsContent(relative)) {
          const content = await readBounded(path.join(directory, entry.name), relative);
          files[relative] = content;
        }
      }
    }
  }
  await walk(root);
  const text = await readBounded(document, "Document");
  const relativeDoc = path.relative(root, document).split(path.sep).join("/");
  const result = analyzeDocs(text, {files, documentPath: relativeDoc});
  console.log(json ? JSON.stringify(result, null, 2) : buildMarkdownReport(relativeDoc, result));
  process.exitCode = result.issues.length ? 1 : 0;
}
main().catch((error) => {console.error(error.message); process.exitCode = 2;});
