import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodeMap, renderCodeMap } from "./index.js";

test("code map discovers languages entrypoints exports and imports", () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        bin: { demo: "./dist/cli.js" },
        main: "./dist/index.js",
        scripts: {
          build: "tsc",
          test: "node --test",
        },
      }),
    );
    writeFileSync(join(cwd, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "import { helper } from './util.js';",
        "import {",
        "  readFileSync,",
        "} from 'node:fs';",
        "export function run() { return helper(fs); }",
        "export { helper as renamedHelper } from './util.js';",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "src", "util.ts"),
      [
        "export const helper = (value: unknown) => value;",
        "export default helper;",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "src", "literals.ts"),
      [
        "const sample = `",
        "export function fakeTemplateExport() {}",
        "import fakeTemplateImport from 'template-only';",
        "`;",
        "/*",
        "export const fakeCommentExport = true;",
        "import fakeCommentImport from 'comment-only';",
        "*/",
        "export const realLiteralExport = true;",
        "",
      ].join("\n"),
    );
    mkdirSync(join(cwd, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(cwd, "node_modules", "pkg", "ignored.ts"), "export const ignored = true;\n");

    const map = createCodeMap({ cwd });
    assert.equal(map.root, cwd);
    assert.ok(map.scannedFiles >= 3);
    assert.deepEqual(
      map.languageCounts.map((entry) => `${entry.language}:${entry.files}`).sort(),
      ["JSON:2", "TypeScript:3"],
    );
    assert.ok(map.keyFiles.includes("package.json"));
    assert.ok(map.keyFiles.includes("tsconfig.json"));
    assert.ok(map.entrypoints.some((entry) => entry.kind === "package" && entry.label === "bin:demo"));
    assert.ok(map.entrypoints.some((entry) => entry.kind === "source" && entry.path === "src/index.ts"));

    const index = map.sourceFiles.find((file) => file.path === "src/index.ts");
    assert.ok(index);
    assert.deepEqual(index.exports, ["renamedHelper", "run"]);
    assert.deepEqual(index.imports, ["./util.js", "node:fs"]);
    assert.ok(!map.sourceFiles.some((file) => file.path.includes("node_modules")));

    const literals = map.sourceFiles.find((file) => file.path === "src/literals.ts");
    assert.ok(literals);
    assert.deepEqual(literals.exports, ["realLiteralExport"]);
    assert.deepEqual(literals.imports, []);

    const truncated = createCodeMap({ cwd, maxFiles: 1 });
    assert.equal(truncated.truncated, true);
    assert.ok(truncated.scannedFiles <= 1);

    const rendered = renderCodeMap(map);
    assert.match(rendered, /Code Map/);
    assert.match(rendered, /TypeScript: 3/);
    assert.match(rendered, /exports="renamedHelper,run"/);
    assert.match(rendered, /imports="\.\/util\.js,node:fs"/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("code map redacts unsafe paths and reports missing targets", () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "sk-or-v1-secretvalue.ts"),
      "export const token = 'safe';\n",
    );

    const rendered = renderCodeMap(createCodeMap({ cwd }));
    assert.doesNotMatch(rendered, /sk-or-v1-secretvalue/);
    assert.match(rendered, /\[redacted\]/);

    const missing = renderCodeMap(createCodeMap({ cwd, targetPath: "missing" }));
    assert.match(missing, /target path does not exist/);
    assert.match(missing, /path="missing"/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "orx-code-map-"));
}
