import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCodeMap,
  createCodeCallGraph,
  createCodeImportGraph,
  createCodeReferenceIndex,
  createCodeSymbolIndex,
  renderCodeMap,
  renderCodeCallGraph,
  renderCodeImportGraph,
  renderCodeReferences,
  renderCodeSymbols,
} from "./index.js";

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
    mkdirSync(join(cwd, "src", "feature"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "feature", "index.ts"),
      [
        "export const feature = true;",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "src", "feature-user.ts"),
      [
        "import { feature } from './feature';",
        "export const usesFeature = feature;",
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
    writeFileSync(
      join(cwd, "src", "continued-string.ts"),
      [
        "const continued = \"fakeContinuation \\",
        "helper\";",
        "export const realContinuation = helper;",
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
      ["JSON:2", "TypeScript:6"],
    );
    assert.ok(map.keyFiles.includes("package.json"));
    assert.ok(map.keyFiles.includes("tsconfig.json"));
    assert.ok(map.entrypoints.some((entry) => entry.kind === "package" && entry.label === "bin:demo"));
    assert.ok(map.entrypoints.some((entry) => entry.kind === "source" && entry.path === "src/index.ts"));

    const index = map.sourceFiles.find((file) => file.path === "src/index.ts");
    assert.ok(index);
    assert.deepEqual(index.exports, ["renamedHelper", "run"]);
    assert.deepEqual(index.imports, ["./util.js", "node:fs"]);
    assert.deepEqual(
      index.symbols.map((symbol) => `${symbol.name}:${symbol.line}`),
      ["renamedHelper:6", "run:5"],
    );
    assert.ok(!map.sourceFiles.some((file) => file.path.includes("node_modules")));

    const literals = map.sourceFiles.find((file) => file.path === "src/literals.ts");
    assert.ok(literals);
    assert.deepEqual(literals.exports, ["realLiteralExport"]);
    assert.deepEqual(literals.imports, []);
    assert.deepEqual(literals.symbols.map((symbol) => `${symbol.name}:${symbol.line}`), ["realLiteralExport:9"]);

    const truncated = createCodeMap({ cwd, maxFiles: 1 });
    assert.equal(truncated.truncated, true);
    assert.ok(truncated.scannedFiles <= 1);

    const rendered = renderCodeMap(map);
    assert.match(rendered, /Code Map/);
    assert.match(rendered, /TypeScript: 6/);
    assert.match(rendered, /exports="renamedHelper,run"/);
    assert.match(rendered, /imports="\.\/util\.js,node:fs"/);

    const symbolIndex = createCodeSymbolIndex({ cwd, query: "Literal" });
    assert.equal(symbolIndex.totalSymbols, 1);
    assert.deepEqual(symbolIndex.symbols.map((symbol) => symbol.name), ["realLiteralExport"]);
    const renderedSymbols = renderCodeSymbols(symbolIndex);
    assert.match(renderedSymbols, /Code Symbols/);
    assert.match(renderedSymbols, /query: "Literal"/);
    assert.match(renderedSymbols, /name="realLiteralExport"/);
    assert.match(renderedSymbols, /path="src\/literals\.ts"/);
    assert.match(renderedSymbols, /line=9/);

    const limitedSymbols = renderCodeSymbols(createCodeSymbolIndex({ cwd, maxSymbols: 1 }));
    assert.match(limitedSymbols, /symbols: 8/);
    assert.match(limitedSymbols, /7 more symbols omitted/);

    const references = createCodeReferenceIndex({ cwd, query: "helper" });
    assert.equal(references.totalReferences, 6);
    assert.deepEqual(
      references.references.map((reference) => `${reference.path}:${reference.line}:${reference.column}`),
      [
        "src/index.ts:1:10",
        "src/index.ts:5:32",
        "src/index.ts:6:10",
        "src/continued-string.ts:3:33",
        "src/util.ts:1:14",
        "src/util.ts:2:16",
      ].sort(),
    );
    assert.equal(references.references.some((reference) => reference.path === "src/continued-string.ts" && reference.line === 2), false);

    const literalReferences = createCodeReferenceIndex({ cwd, query: "fakeTemplateExport" });
    assert.equal(literalReferences.totalReferences, 0);

    const renderedReferences = renderCodeReferences(createCodeReferenceIndex({ cwd, query: "realLiteralExport" }));
    assert.match(renderedReferences, /Code References/);
    assert.match(renderedReferences, /query: "realLiteralExport"/);
    assert.match(renderedReferences, /path="src\/literals\.ts"/);
    assert.match(renderedReferences, /line=9/);
    assert.match(renderedReferences, /excerpt="export const realLiteralExport = true;"/);

    const importGraph = createCodeImportGraph({ cwd });
    assert.equal(importGraph.totalEdges, 3);
    assert.equal(importGraph.localEdges, 2);
    assert.equal(importGraph.externalImports, 1);
    assert.equal(importGraph.unresolvedLocalImports, 0);
    assert.ok(importGraph.edges.some((edge) =>
      edge.kind === "local" &&
      edge.from === "src/index.ts" &&
      edge.to === "src/util.ts" &&
      edge.specifier === "./util.js"));
    assert.ok(importGraph.edges.some((edge) =>
      edge.kind === "local" &&
      edge.from === "src/feature-user.ts" &&
      edge.to === "src/feature/index.ts" &&
      edge.specifier === "./feature"));
    assert.ok(importGraph.edges.some((edge) =>
      edge.kind === "external" &&
      edge.from === "src/index.ts" &&
      edge.specifier === "node:fs"));

    const filteredGraph = createCodeImportGraph({ cwd, query: "feature" });
    assert.equal(filteredGraph.totalEdges, 1);
    assert.equal(filteredGraph.localEdges, 1);
    assert.equal(filteredGraph.filesWithImports, 1);

    const renderedGraph = renderCodeImportGraph(importGraph);
    assert.match(renderedGraph, /Code Import Graph/);
    assert.match(renderedGraph, /local_edges: 2/);
    assert.match(renderedGraph, /external_imports: 1/);
    assert.match(renderedGraph, /from="src\/feature-user\.ts" to="src\/feature\/index\.ts"/);
    assert.match(renderedGraph, /specifier="\.\/util\.js"/);
    assert.match(renderedGraph, /to="external" specifier="node:fs"/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("import graph includes re-export and dynamic import edges with bounded omissions", () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src", "feature"), { recursive: true });
    writeFileSync(join(cwd, "src", "feature", "index.ts"), "export const feature = true;\n");
    writeFileSync(join(cwd, "src", "reexport.ts"), "export { feature as forwardedFeature } from './feature';\n");
    writeFileSync(
      join(cwd, "src", "lazy.ts"),
      [
        "const ignored = \"import('./not-real')\";",
        "export async function loadFeature() {",
        "  return import('./feature');",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "src", "many-imports.ts"),
      Array.from({ length: 26 }, (_, index) => `import value${index} from './dep-${index}';`).join("\n"),
    );
    for (let index = 0; index < 26; index += 1) {
      writeFileSync(join(cwd, "src", `dep-${index}.ts`), `export const value${index} = ${index};\n`);
    }

    const graph = createCodeImportGraph({ cwd });
    assert.equal(graph.truncated, true);
    assert.ok(graph.omissions.some((omission) =>
      omission.path === "src/many-imports.ts" &&
      omission.reason === "source imports exceeded per-file code-map bounds"));
    assert.ok(graph.edges.some((edge) =>
      edge.kind === "local" &&
      edge.from === "src/reexport.ts" &&
      edge.to === "src/feature/index.ts" &&
      edge.specifier === "./feature"));
    assert.ok(graph.edges.some((edge) =>
      edge.kind === "local" &&
      edge.from === "src/lazy.ts" &&
      edge.to === "src/feature/index.ts" &&
      edge.specifier === "./feature"));
    assert.equal(graph.edges.some((edge) => edge.specifier === "./not-real"), false);

    const rendered = renderCodeImportGraph(graph);
    assert.match(rendered, /imports: \d+ \(truncated\)/);
    assert.match(rendered, /source imports exceeded per-file code-map bounds/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("call graph discovers local definitions and conservative call edges", () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "import { helper } from './util.js';",
        "export function start() {",
        "  return helper(localValue());",
        "}",
        "function localValue() {",
        "  return helper('ok');",
        "}",
        "const arrowValue = () => localValue();",
        "const fake = 'helper()';",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "src", "util.ts"),
      [
        "export function helper(value?: unknown) {",
        "  return value;",
        "}",
        "",
      ].join("\n"),
    );

    const graph = createCodeCallGraph({ cwd });
    assert.equal(graph.totalDefinitions, 4);
    assert.equal(graph.totalEdges, 4);
    assert.equal(graph.totalCallSites, 4);
    assert.equal(graph.ambiguousEdges, 0);
    assert.ok(graph.definitions.some((definition) =>
      definition.name === "arrowValue" &&
      definition.kind === "arrow" &&
      definition.path === "src/index.ts" &&
      definition.line === 8));
    assert.ok(graph.edges.some((edge) =>
      edge.kind === "local" &&
      edge.fromName === "start" &&
      edge.toName === "helper" &&
      edge.toPath === "src/util.ts" &&
      edge.lines.includes(3)));
    assert.ok(graph.edges.some((edge) =>
      edge.kind === "local" &&
      edge.fromName === "start" &&
      edge.toName === "localValue" &&
      edge.toPath === "src/index.ts" &&
      edge.lines.includes(3)));
    assert.ok(graph.edges.some((edge) =>
      edge.kind === "local" &&
      edge.fromName === "arrowValue" &&
      edge.toName === "localValue" &&
      edge.lines.includes(8)));
    assert.equal(graph.edges.some((edge) => edge.lines.includes(9)), false);

    const filtered = createCodeCallGraph({ cwd, query: "helper" });
    assert.equal(filtered.totalDefinitions, 1);
    assert.equal(filtered.totalEdges, 2);
    assert.equal(filtered.totalCallSites, 2);

    const limited = createCodeCallGraph({ cwd, maxEdges: 1 });
    assert.equal(limited.omittedEdges, 3);
    const exactlyLimitedCallSites = createCodeCallGraph({ cwd, maxCallSites: 4 });
    assert.equal(exactlyLimitedCallSites.truncated, false);
    assert.equal(exactlyLimitedCallSites.omissions.some((omission) =>
      omission.reason === "call sites reached global call-graph bounds"), false);
    const truncatedCallSites = createCodeCallGraph({ cwd, maxCallSites: 3 });
    assert.equal(truncatedCallSites.truncated, true);
    assert.ok(truncatedCallSites.omissions.some((omission) =>
      omission.reason === "call sites reached global call-graph bounds"));

    const rendered = renderCodeCallGraph(graph);
    assert.match(rendered, /Code Call Graph/);
    assert.match(rendered, /not AST-backed/);
    assert.match(rendered, /definitions: 4/);
    assert.match(rendered, /call_sites: 4/);
    assert.match(rendered, /from="start" from_path="src\/index\.ts" from_line=2 to="helper" to_path="src\/util\.ts"/);
    assert.match(rendered, /calls=1 lines="3"/);
    assert.match(rendered, /usage: orx code calls \[query\]/);

    const renderedLimited = renderCodeCallGraph(limited);
    assert.match(renderedLimited, /3 more call edges omitted/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("call graph marks duplicate callee names as ambiguous", () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "export function run() {",
        "  return shared();",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(join(cwd, "src", "a.ts"), "export function shared() { return 'a'; }\n");
    writeFileSync(join(cwd, "src", "b.ts"), "export function shared() { return 'b'; }\n");

    const graph = createCodeCallGraph({ cwd });
    assert.equal(graph.ambiguousEdges, 1);
    assert.ok(graph.edges.some((edge) =>
      edge.kind === "ambiguous" &&
      edge.fromName === "run" &&
      edge.toName === "shared" &&
      edge.candidateCount === 2));

    const rendered = renderCodeCallGraph(graph);
    assert.match(rendered, /to="shared" kind=ambiguous candidates=2/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("call graph avoids declaration false positives and keeps caller ranges conservative", () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "export function helper() { return 1; }",
        "interface Api { helper(): number; }",
        "class Example { helper() {} #helper() {} run() { return this.helper(); } }",
        "const object = { helper() {} };",
        "export function run(obj: { helper: () => number }) {",
        "  return helper();",
        "}",
        "export const arrowRun = () =>",
        "  helper();",
        "",
      ].join("\n"),
    );

    const graph = createCodeCallGraph({ cwd, query: "helper" });
    assert.equal(graph.totalDefinitions, 1);
    assert.equal(graph.totalEdges, 2);
    assert.equal(graph.totalCallSites, 2);
    assert.ok(graph.edges.some((edge) =>
      edge.fromName === "run" &&
      edge.fromLine === 5 &&
      edge.toName === "helper" &&
      edge.lines.includes(6)));
    assert.ok(graph.edges.some((edge) =>
      edge.fromName === "arrowRun" &&
      edge.fromLine === 8 &&
      edge.toName === "helper" &&
      edge.lines.includes(9)));
    for (const edge of graph.edges) {
      assert.equal(edge.lines.some((line) => [2, 3, 4, 5, 8].includes(line)), false);
    }

    const rendered = renderCodeCallGraph(graph);
    assert.match(rendered, /from="run" from_path="src\/index\.ts" from_line=5 to="helper"/);
    assert.match(rendered, /from="arrowRun" from_path="src\/index\.ts" from_line=8 to="helper"/);
    assert.doesNotMatch(rendered, /lines="2/);
    assert.doesNotMatch(rendered, /lines="3/);
    assert.doesNotMatch(rendered, /lines="4/);
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
