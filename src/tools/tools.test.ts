import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPatchTool,
  gitDiffTool,
  listFilesTool,
  readFileTool,
  searchFilesTool,
  shellTool,
  toolRegistry,
} from "./index.js";
import { ByteAccumulator, truncateText } from "./truncation.js";

test("registry exposes native local coding tools", () => {
  assert.deepEqual(Object.keys(toolRegistry).sort(), [
    "apply_patch",
    "git_diff",
    "list_files",
    "read_file",
    "search_files",
    "shell",
  ]);
});

test("truncation keeps returned text within byte limits for multibyte text", () => {
  const oneByte = truncateText("é", { maxBytes: 1 });
  assert.equal(oneByte.text, "");
  assert.equal(oneByte.truncation.truncated, true);
  assert.equal(oneByte.truncation.returnedBytes, 0);

  const threeBytes = truncateText("éa", { maxBytes: 3 });
  assert.equal(threeBytes.text, "éa");
  assert.equal(threeBytes.truncation.returnedBytes, 3);

  const accumulator = new ByteAccumulator(1);
  accumulator.append("é");
  const accumulated = accumulator.toTruncatedText();
  assert.equal(accumulated.text, "");
  assert.equal(accumulated.truncation.returnedBytes, 0);
  assert.equal(accumulated.truncation.truncated, true);
});

test("read_file returns text with line and byte truncation and clear missing-file errors", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(join(cwd, "sample.txt"), "alpha\nbeta\ngamma\n");

    const lineLimited = await readFileTool({
      cwd,
      path: "sample.txt",
      maxLines: 2,
      maxBytes: 100,
    });

    assert.equal(lineLimited.ok, true);
    if (lineLimited.ok) {
      assert.equal(lineLimited.content, "alpha\nbeta");
      assert.equal(lineLimited.truncation.truncated, true);
      assert.equal(lineLimited.truncation.omittedLines, 1);
    }

    const byteLimited = await readFileTool({
      cwd,
      path: "sample.txt",
      maxBytes: 5,
    });

    assert.equal(byteLimited.ok, true);
    if (byteLimited.ok) {
      assert.equal(byteLimited.content, "alpha");
      assert.equal(byteLimited.truncation.truncated, true);
      assert.equal(byteLimited.truncation.omittedBytes > 0, true);
    }

    const missing = await readFileTool({ cwd, path: "missing.txt" });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.error.code, "ENOENT");
      assert.match(missing.error.message, /no such file/i);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("list_files reports types, sizes, recursion depth, and missing directories", async () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src", "nested"), { recursive: true });
    writeFileSync(join(cwd, "src", "root.txt"), "root");
    writeFileSync(join(cwd, "src", "nested", "child.txt"), "child");

    const listed = await listFilesTool({
      cwd,
      path: "src",
      recursive: true,
      maxDepth: 1,
    });

    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.truncated, false);
      assert.deepEqual(
        listed.entries.map((entry) => [entry.path, entry.type, entry.depth]),
        [
          ["nested", "directory", 1],
          ["root.txt", "file", 1],
        ],
      );
      assert.equal(listed.entries.find((entry) => entry.path === "root.txt")?.sizeBytes, 4);
    }

    const missing = await listFilesTool({ cwd, path: "nope" });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.error.code, "ENOENT");
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("search_files uses fallback search when requested and reports invalid patterns", async () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "one.txt"), "alpha\nneedle here\n");
    writeFileSync(join(cwd, "src", "two.txt"), "no match\nneedle again\n");

    const found = await searchFilesTool({
      cwd,
      path: "src",
      pattern: "needle",
      useRipgrep: false,
      maxMatches: 1,
    });

    assert.equal(found.ok, true);
    if (found.ok) {
      assert.equal(found.engine, "fallback");
      assert.equal(found.truncated, true);
      assert.deepEqual(found.matches, [
        {
          path: "src/one.txt",
          line: 2,
          column: 1,
          text: "needle here",
        },
      ]);
    }

    const invalid = await searchFilesTool({
      cwd,
      path: "src",
      pattern: "[",
      useRipgrep: false,
    });
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.equal(invalid.error.code, "INVALID_PATTERN");
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("search_files passes dash-leading patterns to ripgrep literally when available", async (t) => {
  if (!hasRipgrep()) {
    t.skip("ripgrep is not installed");
    return;
  }

  const cwd = createTempDir();
  try {
    writeFileSync(join(cwd, "sample.txt"), "-needle at start\nnot this -needle\n");

    const found = await searchFilesTool({
      cwd,
      path: ".",
      pattern: "-needle",
      maxMatches: 1,
    });

    assert.equal(found.ok, true);
    if (found.ok) {
      assert.equal(found.engine, "rg");
      assert.deepEqual(found.matches, [
        {
          path: "sample.txt",
          line: 1,
          column: 1,
          text: "-needle at start",
        },
      ]);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("search_files fallback stops traversal after reaching maxMatches", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(join(cwd, "a.txt"), "needle first\n");
    mkdirSync(join(cwd, "z-blocked"));
    writeFileSync(join(cwd, "z-blocked", "hidden.txt"), "needle hidden\n");
    chmodNoAccess(join(cwd, "z-blocked"));

    const found = await searchFilesTool({
      cwd,
      path: ".",
      pattern: "needle",
      useRipgrep: false,
      maxMatches: 1,
    });

    assert.equal(found.ok, true);
    if (found.ok) {
      assert.equal(found.truncated, true);
      assert.deepEqual(found.matches.map((match) => match.path), ["a.txt"]);
    }
  } finally {
    restoreAccess(join(cwd, "z-blocked"));
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("shell captures success, nonzero exit, missing commands, timeout, and output truncation", async () => {
  const success = await shellTool({
    command: process.execPath,
    args: ["-e", "console.log('hello')"],
    shell: false,
  });
  assert.equal(success.ok, true);
  if (success.ok) {
    assert.equal(success.exitCode, 0);
    assert.equal(success.stdout, "hello\n");
    assert.equal(success.stderr, "");
    assert.equal(success.cwd, process.cwd());
  }

  const nonzero = await shellTool({
    command: process.execPath,
    args: ["-e", "console.error('bad'); process.exit(7)"],
    shell: false,
  });
  assert.equal(nonzero.ok, true);
  if (nonzero.ok) {
    assert.equal(nonzero.exitCode, 7);
    assert.equal(nonzero.stderr, "bad\n");
  }

  const missing = await shellTool({
    command: "definitely-not-an-orx-command",
    args: [],
    shell: false,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "ENOENT");
  }

  const truncated = await shellTool({
    command: process.execPath,
    args: ["-e", "process.stdout.write('abcdef')"],
    shell: false,
    maxBytes: 3,
  });
  assert.equal(truncated.ok, true);
  if (truncated.ok) {
    assert.equal(truncated.stdout, "abc");
    assert.equal(truncated.stdoutTruncation.truncated, true);
  }

  const timedOut = await shellTool({
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 1000)"],
    shell: false,
    timeoutMs: 25,
  });
  assert.equal(timedOut.ok, true);
  if (timedOut.ok) {
    assert.equal(timedOut.timedOut, true);
    assert.equal(timedOut.signal, "SIGTERM");
  }
});

test("git_diff shows working tree changes and supports path scoping", async () => {
  const cwd = createGitRepo();
  try {
    writeFileSync(join(cwd, "tracked.txt"), "before\n");
    git(cwd, "add", "tracked.txt");
    git(cwd, "commit", "-m", "initial");

    writeFileSync(join(cwd, "tracked.txt"), "after\n");
    writeFileSync(join(cwd, "other.txt"), "other\n");

    const diff = await gitDiffTool({
      cwd,
      paths: ["tracked.txt"],
    });

    assert.equal(diff.ok, true);
    if (diff.ok) {
      assert.equal(diff.exitCode, 0);
      assert.match(diff.diff, /diff --git a\/tracked\.txt b\/tracked\.txt/);
      assert.match(diff.diff, /-before/);
      assert.match(diff.diff, /\+after/);
      assert.doesNotMatch(diff.diff, /other\.txt/);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("apply_patch applies unified patches and returns changed files", async () => {
  const cwd = createGitRepo();
  try {
    writeFileSync(join(cwd, "hello.txt"), "old\n");
    const patch = [
      "diff --git a/hello.txt b/hello.txt",
      "--- a/hello.txt",
      "+++ b/hello.txt",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "",
    ].join("\n");

    const applied = await applyPatchTool({ cwd, patch });

    assert.equal(applied.ok, true);
    if (applied.ok) {
      assert.deepEqual(applied.changedFiles, ["hello.txt"]);
      assert.equal(readFileSync(join(cwd, "hello.txt"), "utf8"), "new\n");
    }

    const failed = await applyPatchTool({ cwd, patch });
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.error.code, "PATCH_CHECK_FAILED");
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("apply_patch applies structured patches with exact line-block matching", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(join(cwd, "existing.txt"), "alpha\nbeta\n");
    const patch = [
      "*** Begin Patch",
      "*** Update File: existing.txt",
      "@@",
      " alpha",
      "-beta",
      "+gamma",
      "*** Add File: added.txt",
      "+created",
      "*** End Patch",
      "",
    ].join("\n");

    const applied = await applyPatchTool({ cwd, patch });

    assert.equal(applied.ok, true);
    if (applied.ok) {
      assert.deepEqual(applied.changedFiles.sort(), ["added.txt", "existing.txt"]);
      assert.equal(readFileSync(join(cwd, "existing.txt"), "utf8"), "alpha\ngamma\n");
      assert.equal(readFileSync(join(cwd, "added.txt"), "utf8"), "created\n");
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("apply_patch accepts structured update patches with end-of-file marker", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(join(cwd, "existing.txt"), "alpha\nbeta\n");
    const patch = [
      "*** Begin Patch",
      "*** Update File: existing.txt",
      "@@",
      " alpha",
      "-beta",
      "+gamma",
      "*** End of File",
      "*** End Patch",
      "",
    ].join("\n");

    const applied = await applyPatchTool({ cwd, patch });

    assert.equal(applied.ok, true);
    if (applied.ok) {
      assert.deepEqual(applied.changedFiles, ["existing.txt"]);
      assert.equal(readFileSync(join(cwd, "existing.txt"), "utf8"), "alpha\ngamma\n");
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("apply_patch rejects structured patches missing end marker without mutation", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(join(cwd, "existing.txt"), "alpha\nbeta\n");
    const patch = [
      "*** Begin Patch",
      "*** Update File: existing.txt",
      "@@",
      " alpha",
      "-beta",
      "+gamma",
      "",
    ].join("\n");

    const result = await applyPatchTool({ cwd, patch });

    assert.equal(result.ok, false);
    assert.equal(readFileSync(join(cwd, "existing.txt"), "utf8"), "alpha\nbeta\n");
    if (!result.ok) {
      assert.match(result.error.message, /\*\*\* End Patch/);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("apply_patch validates all structured operations before mutating files", async () => {
  const cwd = createTempDir();
  try {
    const patch = [
      "*** Begin Patch",
      "*** Add File: added.txt",
      "+created",
      "*** Update File: missing.txt",
      "@@",
      "-old",
      "+new",
      "*** End Patch",
      "",
    ].join("\n");

    const result = await applyPatchTool({ cwd, patch });

    assert.equal(result.ok, false);
    assert.equal(existsSync(join(cwd, "added.txt")), false);
    if (!result.ok) {
      assert.match(result.error.message, /missing\.txt/);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("apply_patch rejects duplicate structured write targets before mutation", async () => {
  const cwd = createTempDir();
  try {
    const patch = [
      "*** Begin Patch",
      "*** Add File: dup.txt",
      "+first",
      "*** Add File: dup.txt",
      "+second",
      "*** End Patch",
      "",
    ].join("\n");

    const result = await applyPatchTool({ cwd, patch });

    assert.equal(result.ok, false);
    assert.equal(existsSync(join(cwd, "dup.txt")), false);
    if (!result.ok) {
      assert.match(result.error.message, /duplicate write target/);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "orx-tools-"));
}

function createGitRepo(): string {
  const cwd = createTempDir();
  git(cwd, "init");
  git(cwd, "config", "user.email", "orx@example.test");
  git(cwd, "config", "user.name", "ORX Test");
  return cwd;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

function hasRipgrep(): boolean {
  try {
    execFileSync("rg", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function chmodNoAccess(path: string): void {
  try {
    execFileSync("chmod", ["000", path]);
  } catch {
    // Permission bits are best-effort on non-POSIX filesystems.
  }
}

function restoreAccess(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  try {
    execFileSync("chmod", ["700", path]);
  } catch {
    // Best-effort cleanup for non-POSIX filesystems.
  }
}
