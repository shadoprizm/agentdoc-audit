import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,writeFile,mkdir,rm,symlink,access} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const cli = fileURLToPath(new URL("../bin/audit.mjs",import.meta.url));

test("CLI selects the explicit repository, checks scripts and never executes them",async () => {
  const root=await mkdtemp(path.join(tmpdir(),"agentdoc-cli-"));
  try {
    await writeFile(path.join(root,"package.json"),JSON.stringify({scripts:{test:"touch NEVER_EXECUTE"}}));
    await writeFile(path.join(root,"README.md"),'# Quickstart\n```sh\nnpm run imaginary\nnpm run test\n```');
    await writeFile(path.join(root,".env.local"),"SECRET_DO_NOT_PRINT=secret-value");
    const run=spawnSync(process.execPath,[cli,root,"--json"],{encoding:"utf8"});
    assert.equal(run.status,1); const result=JSON.parse(run.stdout);
    assert.ok(result.issues.some((r) => r.id === "script"));
    assert.ok(result.results.some((r) => r.id === "script" && r.status === "verified"));
    assert.doesNotMatch(run.stdout,/SECRET_DO_NOT_PRINT|secret-value/);
    await assert.rejects(access(path.join(root,"NEVER_EXECUTE")));
  } finally {await rm(root,{recursive:true,force:true});}
});
test("CLI supports nested documents and refuses documents outside the repository",async () => {
  const parent=await mkdtemp(path.join(tmpdir(),"agentdoc-scope-"));
  const root=path.join(parent,"repo");
  try {
    await mkdir(path.join(root,"docs"),{recursive:true});
    await writeFile(path.join(root,"docs/setup.md"),"# Setup\nMeaningful setup details.");
    await writeFile(path.join(parent,"outside.md"),"DO_NOT_PRINT");
    await symlink(path.join(parent,"outside.md"),path.join(root,"outside-link.md"));
    const run=spawnSync(process.execPath,[cli,root,"--doc","docs/setup.md","--json"],{encoding:"utf8"});
    assert.notEqual(run.status,2); assert.equal(JSON.parse(run.stdout).repositoryChecked,true);
    for(const doc of ["../outside.md","outside-link.md"]) {
      const out=spawnSync(process.execPath,[cli,root,"--doc",doc,"--json"],{encoding:"utf8"});
      assert.equal(out.status,2); assert.doesNotMatch(out.stdout,/DO_NOT_PRINT/);
    }
  } finally {await rm(parent,{recursive:true,force:true});}
});

test("CLI enforces byte limits for documents and configuration before reading", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agentdoc-size-"));
  try {
    await writeFile(path.join(root, "README.md"), "é".repeat(500001));
    let run = spawnSync(process.execPath, [cli, root], {encoding: "utf8"});
    assert.equal(run.status, 2); assert.match(run.stderr, /1 MB/); assert.equal(run.stdout, "");
    await writeFile(path.join(root, "README.md"), "# Setup\nMeaningful setup details.");
    await writeFile(path.join(root, "package.json"), " ".repeat(1000001));
    run = spawnSync(process.execPath, [cli, root], {encoding: "utf8"});
    assert.equal(run.status, 2); assert.match(run.stderr, /package\.json.*1 MB/); assert.equal(run.stdout, "");
  } finally {await rm(root, {recursive: true, force: true});}
});
