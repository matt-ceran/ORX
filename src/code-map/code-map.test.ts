import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCodeMap,
  parseCodeJsonArgs,
  parseCodeAstGrepArgs,
  parseCodeTreeSitterArgs,
  createCodeCallGraph,
  createCodeImportGraph,
  createCodeReferenceIndex,
  createCodeSymbolIndex,
  renderCodeAstGrepResult,
  renderCodeMap,
  renderCodeMapJson,
  renderCodeCallGraph,
  renderCodeCallGraphJson,
  renderCodeImportGraph,
  renderCodeImportGraphJson,
  renderCodeReferences,
  renderCodeReferencesJson,
  renderCodeSymbols,
  renderCodeSymbolsJson,
  renderCodeTreeSitterResult,
  renderCodeTreeSitterResultJson,
  runCodeAstGrep,
  runCodeTreeSitter,
  type AstGrepRunner,
  type TreeSitterRunner,
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
    const mapJson = JSON.parse(renderCodeMapJson(map)) as {
      surface: string;
      source_file_count: number;
      language_counts: Array<{ language: string; files: number }>;
      source_files: Array<{ path: string; imports: string[] }>;
    };
    assert.equal(mapJson.surface, "orx.code_map");
    assert.equal(mapJson.source_file_count, 6);
    assert.deepEqual(mapJson.language_counts.find((entry) => entry.language === "TypeScript"), {
      language: "TypeScript",
      files: 6,
    });
    assert.ok(mapJson.source_files.some((file) => file.path === "src/index.ts" && file.imports.includes("./util.js")));

    const symbolIndex = createCodeSymbolIndex({ cwd, query: "Literal" });
    assert.equal(symbolIndex.totalSymbols, 1);
    assert.deepEqual(symbolIndex.symbols.map((symbol) => symbol.name), ["realLiteralExport"]);
    const renderedSymbols = renderCodeSymbols(symbolIndex);
    assert.match(renderedSymbols, /Code Symbols/);
    assert.match(renderedSymbols, /query: "Literal"/);
    assert.match(renderedSymbols, /name="realLiteralExport"/);
    assert.match(renderedSymbols, /path="src\/literals\.ts"/);
    assert.match(renderedSymbols, /line=9/);
    const symbolsJson = JSON.parse(renderCodeSymbolsJson(symbolIndex)) as {
      surface: string;
      query: string;
      symbol_count: number;
      symbols: Array<{ name: string; path: string; line: number }>;
    };
    assert.equal(symbolsJson.surface, "orx.code_symbols");
    assert.equal(symbolsJson.query, "Literal");
    assert.equal(symbolsJson.symbol_count, 1);
    assert.equal(symbolsJson.symbols[0]?.name, "realLiteralExport");
    assert.equal(symbolsJson.symbols[0]?.path, "src/literals.ts");
    assert.equal(symbolsJson.symbols[0]?.line, 9);

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
    const referencesJson = JSON.parse(renderCodeReferencesJson(createCodeReferenceIndex({ cwd, query: "realLiteralExport" }))) as {
      surface: string;
      query: string;
      reference_count: number;
      references: Array<{ path: string; line: number; excerpt: string }>;
    };
    assert.equal(referencesJson.surface, "orx.code_refs");
    assert.equal(referencesJson.query, "realLiteralExport");
    assert.equal(referencesJson.reference_count, 1);
    assert.equal(referencesJson.references[0]?.path, "src/literals.ts");
    assert.equal(referencesJson.references[0]?.line, 9);
    assert.equal(referencesJson.references[0]?.excerpt, "export const realLiteralExport = true;");

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
    const importsJson = JSON.parse(renderCodeImportGraphJson(importGraph)) as {
      surface: string;
      edge_count: number;
      summary: { local_edges: number; external_imports: number };
      edges: Array<{ from: string; to: string | null; specifier: string; kind: string }>;
    };
    assert.equal(importsJson.surface, "orx.code_imports");
    assert.equal(importsJson.edge_count, 3);
    assert.equal(importsJson.summary.local_edges, 2);
    assert.equal(importsJson.summary.external_imports, 1);
    assert.ok(importsJson.edges.some((edge) =>
      edge.from === "src/index.ts" &&
      edge.to === "src/util.ts" &&
      edge.specifier === "./util.js" &&
      edge.kind === "local"));

    assert.deepEqual(parseCodeJsonArgs(["src", "--json"]), { value: "src", json: true });
    assert.deepEqual(parseCodeJsonArgs(["--json", "renderCode"]), { value: "renderCode", json: true });
    assert.deepEqual(parseCodeJsonArgs(["--", "--json"]), { value: "--json", json: false });
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
    assert.match(rendered, /usage: orx code calls \[query\] \[--json\]/);
    const callsJson = JSON.parse(renderCodeCallGraphJson(graph)) as {
      surface: string;
      mode: string;
      ast_backed: boolean;
      semantic_resolution: boolean;
      edge_count: number;
      summary: { call_sites: number; ambiguous_edges: number };
      edges: Array<{ from_name: string; to_name: string; to_path: string | null; lines: number[] }>;
    };
    assert.equal(callsJson.surface, "orx.code_calls");
    assert.equal(callsJson.mode, "conservative_lexical_javascript_typescript_scan");
    assert.equal(callsJson.ast_backed, false);
    assert.equal(callsJson.semantic_resolution, false);
    assert.equal(callsJson.edge_count, 4);
    assert.equal(callsJson.summary.call_sites, 4);
    assert.equal(callsJson.summary.ambiguous_edges, 0);
    assert.ok(callsJson.edges.some((edge) =>
      edge.from_name === "start" &&
      edge.to_name === "helper" &&
      edge.to_path === "src/util.ts" &&
      edge.lines.includes(3)));

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

test("ast-grep adapter builds bounded local search and rewrite preview commands", () => {
  const cwd = createTempDir();
  const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
  const runner: AstGrepRunner = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    if (args.includes("--version")) {
      return { status: command === "sg" ? 0 : 1, signal: null, stdout: "ast-grep 0.0.0\n", stderr: "" };
    }
    return {
      status: 0,
      signal: null,
      stdout: "src/index.ts:3:export function start() { return logger(value); }\n",
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "index.ts"), "export function start() { return value; }\n");

    const parsed = parseCodeAstGrepArgs([
      "console.log($A)",
      "src",
      "--lang",
      "ts",
      "--rewrite",
      "logger($A)",
      "--preview",
    ]);
    if (!parsed.ok) {
      assert.fail(parsed.message);
    }

    const result = runCodeAstGrep({
      ...parsed.args,
      cwd,
      env: {
        PATH: "/usr/bin",
        OPENROUTER_API_KEY: "sk-or-v1-secret",
      },
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.equal(result.command, "sg");
    assert.deepEqual(calls[1]?.args, [
      "run",
      "--pattern",
      "console.log($A)",
      "--color",
      "never",
      "--heading",
      "never",
      "--lang",
      "ts",
      "--rewrite",
      "logger($A)",
      "src",
    ]);
    assert.equal(calls[1]?.cwd, cwd);
    assert.equal(calls[1]?.env.OPENROUTER_API_KEY, undefined);
    assert.equal(calls[1]?.env.PATH, "/usr/bin");

    const rendered = renderCodeAstGrepResult(result);
    assert.match(rendered, /Code ast-grep/);
    assert.match(rendered, /mode: rewrite_preview/);
    assert.match(rendered, /mutation: none/);
    assert.match(rendered, /command: "sg" "run" "--pattern" "console\.log\(\$A\)" "--color" "never"/);
    assert.match(rendered, /src\/index\.ts:3:export function start/);

    const dashTarget = parseCodeAstGrepArgs(["pattern", "--", "--update-all"]);
    assert.equal(dashTarget.ok, false);
    if (!dashTarget.ok) {
      assert.match(dashTarget.message, /path must not start with a dash/);
    }

    const dashPattern = parseCodeAstGrepArgs(["--", "--update-all"]);
    assert.equal(dashPattern.ok, false);
    if (!dashPattern.ok) {
      assert.match(dashPattern.message, /pattern must not start with a dash/);
    }

    const dashRewrite = parseCodeAstGrepArgs(["pattern", "--rewrite", "--update-all"]);
    assert.equal(dashRewrite.ok, false);
    if (!dashRewrite.ok) {
      assert.match(dashRewrite.message, /rewrite must not start with a dash/);
    }

    const dashRewriteEquals = parseCodeAstGrepArgs(["pattern", "--rewrite=--update-all"]);
    assert.equal(dashRewriteEquals.ok, false);
    if (!dashRewriteEquals.ok) {
      assert.match(dashRewriteEquals.message, /rewrite must not start with a dash/);
    }

    const dashLang = parseCodeAstGrepArgs(["pattern", "--lang", "--update-all"]);
    assert.equal(dashLang.ok, false);
    if (!dashLang.ok) {
      assert.match(dashLang.message, /lang must not start with a dash/);
    }

    const normalizedDashTarget = runCodeAstGrep({
      cwd,
      pattern: "pattern",
      targetPath: "./--update-all",
      json: false,
      preview: false,
      runner,
    });
    assert.equal(normalizedDashTarget.ok, false);
    assert.equal(normalizedDashTarget.status, "invalid_arguments");
    assert.match(normalizedDashTarget.message ?? "", /dash-prefixed operand/);
    assert.equal(
      calls.some((call) => call.args.includes("--update-all")),
      false,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("ast-grep adapter reports missing tools and guards paths", () => {
  const cwd = createTempDir();
  const calls: Array<{ command: string; args: string[] }> = [];
  const missingRunner: AstGrepRunner = (command, args) => {
    calls.push({ command, args });
    return {
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: Object.assign(new Error("not found"), { code: "ENOENT" }),
    };
  };

  try {
    const missing = runCodeAstGrep({
      cwd,
      pattern: "console.log($A)",
      targetPath: ".",
      json: false,
      preview: false,
      runner: missingRunner,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, "tool_missing");
    assert.equal(calls.length, 2);
    assert.match(renderCodeAstGrepResult(missing), /ast-grep is not installed or not on PATH/);

    const guarded = runCodeAstGrep({
      cwd,
      pattern: "console.log($A)",
      targetPath: "../outside",
      json: false,
      preview: false,
      runner: missingRunner,
    });
    assert.equal(guarded.ok, false);
    assert.equal(guarded.status, "invalid_arguments");
    assert.match(renderCodeAstGrepResult(guarded), /must stay inside the current working directory/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter adapter runs bounded optional AST parse and keeps lexical fallback", () => {
  const cwd = createTempDir();
  const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
  const runner: TreeSitterRunner = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    return {
      status: 0,
      signal: null,
      stdout: [
        "(program [0, 0] - [3, 0]",
        "  (export_statement [0, 0] - [0, 37]",
        "    declaration: (function_declaration [0, 7] - [0, 36]",
        "      name: (identifier [0, 16] - [0, 21])))",
        "  (lexical_declaration [1, 0] - [1, 29]",
        "    (variable_declarator [1, 6] - [1, 27]",
        "      name: (identifier [1, 6] - [1, 11])",
        "      value: (arrow_function [1, 14] - [1, 27]",
        "        body: (call_expression [1, 20] - [1, 27]",
        "          function: (identifier [1, 20] - [1, 25]))))",
        "  (class_declaration [2, 0] - [2, 48]",
        "    name: (type_identifier [2, 6] - [2, 13])",
        "    body: (class_body [2, 14] - [2, 48]",
        "      (method_definition [2, 16] - [2, 45]",
        "        name: (property_identifier [2, 16] - [2, 19])",
        "        body: (statement_block [2, 22] - [2, 45]",
        "          (return_statement [2, 24] - [2, 42]",
        "            (call_expression [2, 31] - [2, 38]",
        "              function: (identifier [2, 31] - [2, 36]))))))",
        "",
      ].join("\n"),
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "export function start() { return 1; }",
        "const value = () => start();",
        "class Example { run() { return value(); } }",
        "",
      ].join("\n"),
    );

    const parsed = parseCodeTreeSitterArgs(["src/index.ts"]);
    if (!parsed.ok) {
      assert.fail(parsed.message);
    }
    const jsonParsed = parseCodeTreeSitterArgs(["outline", "src/index.ts", "--json"]);
    if (!jsonParsed.ok) {
      assert.fail(jsonParsed.message);
    }
    assert.equal(jsonParsed.args.json, true);
    const literalJsonParsed = parseCodeTreeSitterArgs(["--", "--json"]);
    assert.equal(literalJsonParsed.ok, false);
    if (!literalJsonParsed.ok) {
      assert.match(literalJsonParsed.message, /file must not start with a dash/);
    }
    const result = runCodeTreeSitter({
      ...parsed.args,
      cwd,
      env: {
        PATH: "/usr/bin",
        OPENROUTER_API_KEY: "sk-or-v1-secret",
      },
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.deepEqual(calls[1]?.args, ["parse", "src/index.ts"]);
    assert.equal(calls[1]?.cwd, cwd);
    assert.equal(calls[1]?.env.OPENROUTER_API_KEY, undefined);
    assert.equal(calls[1]?.env.PATH, "/usr/bin");

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter/);
    assert.match(rendered, /AST-backed local parse/);
    assert.match(rendered, /mutation: none/);
    assert.match(rendered, /fallback: lexical code-map/);
    assert.match(rendered, /\(program/);

    const outlineParsed = parseCodeTreeSitterArgs(["outline", "src/index.ts"]);
    if (!outlineParsed.ok) {
      assert.fail(outlineParsed.message);
    }
    const outline = runCodeTreeSitter({
      ...outlineParsed.args,
      cwd,
      runner,
    });
    assert.equal(outline.ok, true);
    assert.equal(outline.mode, "outline");
    assert.deepEqual(calls.at(-1)?.args, ["parse", "src/index.ts"]);
    assert.deepEqual(
      outline.outline?.entries.map((entry) => `${entry.kind}:${entry.name}:${entry.line}:${entry.column}`),
      [
        "function_declaration:start:1:8",
        "variable_declarator:value:2:7",
        "arrow_function:undefined:2:15",
        "class_declaration:Example:3:1",
        "method_definition:run:3:17",
      ],
    );
    const renderedOutline = renderCodeTreeSitterResult(outline);
    assert.match(renderedOutline, /Code tree-sitter outline/);
    assert.match(renderedOutline, /kind="function_declaration" name="start" line=1 column=8/);
    assert.match(renderedOutline, /kind="variable_declarator" name="value" line=2 column=7/);
    assert.match(renderedOutline, /kind="class_declaration" name="Example" line=3 column=1/);
    assert.match(renderedOutline, /raw_parse: use tree-sitter parse mode for the full AST/);
    const outlineJson = JSON.parse(renderCodeTreeSitterResultJson(outline)) as {
      surface: string;
      execution: string;
      network: string;
      mutation: string;
      model_tool: string;
      mode: string;
      ast_backed: boolean;
      semantic_resolution: boolean;
      outline: { total_entries: number; entries: Array<{ kind: string; name?: string }> };
    };
    assert.equal(outlineJson.surface, "orx.code_tree_sitter");
    assert.equal(outlineJson.execution, "local_tree_sitter_cli");
    assert.equal(outlineJson.network, "none");
    assert.equal(outlineJson.mutation, "none");
    assert.equal(outlineJson.model_tool, "none");
    assert.equal(outlineJson.mode, "outline");
    assert.equal(outlineJson.ast_backed, true);
    assert.equal(outlineJson.semantic_resolution, false);
    assert.equal(outlineJson.outline.total_entries, 5);
    assert.ok(outlineJson.outline.entries.some((entry) => entry.kind === "function_declaration" && entry.name === "start"));

    const callsParsed = parseCodeTreeSitterArgs(["calls", "src/index.ts"]);
    if (!callsParsed.ok) {
      assert.fail(callsParsed.message);
    }
    const callsResult = runCodeTreeSitter({
      ...callsParsed.args,
      cwd,
      runner,
    });
    assert.equal(callsResult.ok, true);
    assert.equal(callsResult.mode, "calls");
    assert.deepEqual(
      callsResult.calls?.edges.map((edge) => `${edge.caller?.name}:${edge.callee}:${edge.line}:${edge.column}`),
      [
        "value:start:2:21",
        "run:value:3:32",
      ],
    );
    const renderedCalls = renderCodeTreeSitterResult(callsResult);
    assert.match(renderedCalls, /Code tree-sitter calls/);
    assert.match(renderedCalls, /AST-backed local single-file call extraction/);
    assert.match(renderedCalls, /caller="value" caller_kind="variable_declarator" caller_line=2 callee="start" line=2 column=21/);
    assert.match(renderedCalls, /caller="run" caller_kind="method_definition" caller_line=3 callee="value" line=3 column=32/);

    const refsParsed = parseCodeTreeSitterArgs(["refs", "src/index.ts", "value"]);
    if (!refsParsed.ok) {
      assert.fail(refsParsed.message);
    }
    const refsResult = runCodeTreeSitter({
      ...refsParsed.args,
      cwd,
      runner,
    });
    assert.equal(refsResult.ok, true);
    assert.equal(refsResult.mode, "refs");
    assert.equal(refsResult.references?.query, "value");
    assert.deepEqual(
      refsResult.references?.matches.map((match) => `${match.role}:${match.kind}:${match.name}:${match.line}:${match.column}`),
      [
        "name:identifier:value:2:7",
        "function:identifier:value:3:32",
      ],
    );
    const renderedRefs = renderCodeTreeSitterResult(refsResult);
    assert.match(renderedRefs, /Code tree-sitter refs/);
    assert.match(renderedRefs, /AST-backed local single-file identifier matches/);
    assert.match(renderedRefs, /not semantic resolution/);
    assert.match(renderedRefs, /role="name" kind="identifier" name="value" line=2 column=7/);
    assert.match(renderedRefs, /role="function" kind="identifier" name="value" line=3 column=32/);

    const truncatedOutline = runCodeTreeSitter({
      ...outlineParsed.args,
      cwd,
      maxBytes: 80,
      runner,
    });
    assert.equal(truncatedOutline.ok, true);
    assert.equal(truncatedOutline.outline?.truncated, true);
    assert.match(
      renderCodeTreeSitterResult(truncatedOutline),
      /tree-sitter parse output was truncated before outline extraction/,
    );

    const defaultOutlineParsed = parseCodeTreeSitterArgs(["src/index.ts"], "Usage: outline", { defaultMode: "outline" });
    if (!defaultOutlineParsed.ok) {
      assert.fail(defaultOutlineParsed.message);
    }
    assert.equal(defaultOutlineParsed.args.mode, "outline");

    const missingQueryParsed = parseCodeTreeSitterArgs(["refs", "src/index.ts"]);
    assert.equal(missingQueryParsed.ok, false);
    if (!missingQueryParsed.ok) {
      assert.match(missingQueryParsed.message, /Usage: orx code tree-sitter/);
    }

    const invalidQueryParsed = parseCodeTreeSitterArgs(["refs", "src/index.ts", "value-name"]);
    assert.equal(invalidQueryParsed.ok, false);
    if (!invalidQueryParsed.ok) {
      assert.match(invalidQueryParsed.message, /identifier-like name/);
    }

    const controlQueryParsed = parseCodeTreeSitterArgs(["refs", "src/index.ts", "value\nname"]);
    assert.equal(controlQueryParsed.ok, false);
    if (!controlQueryParsed.ok) {
      assert.match(controlQueryParsed.message, /control characters/);
    }

    const invalidDirectRefs = runCodeTreeSitter({
      cwd,
      targetPath: "src/index.ts",
      mode: "refs",
      query: "--value",
      runner,
    });
    assert.equal(invalidDirectRefs.ok, false);
    assert.equal(invalidDirectRefs.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(invalidDirectRefs), /query must not start with a dash/);

    const missingRunner: TreeSitterRunner = () => ({
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
      error: Object.assign(new Error("not found"), { code: "ENOENT" }),
    });
    const missing = runCodeTreeSitter({
      cwd,
      targetPath: "src/index.ts",
      runner: missingRunner,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, "tool_missing");
    assert.match(renderCodeTreeSitterResult(missing), /lexical code-map commands still work/);

    const guarded = runCodeTreeSitter({
      cwd,
      targetPath: "../outside.ts",
      runner,
    });
    assert.equal(guarded.ok, false);
    assert.equal(guarded.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(guarded), /must stay inside/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo refs scans bounded source files without semantic overclaim", () => {
  const cwd = createTempDir();
  const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
  const runner: TreeSitterRunner = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/index.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [3, 0]",
          "  (import_statement [0, 0] - [0, 31]",
          "    (import_clause [0, 7] - [0, 17]",
          "      (named_imports [0, 7] - [0, 17]",
          "        name: (identifier [0, 9] - [0, 15]))))",
          "  (export_statement [1, 0] - [1, 48]",
          "    declaration: (function_declaration [1, 7] - [1, 48]",
          "      name: (identifier [1, 16] - [1, 21])",
          "      body: (statement_block [1, 24] - [1, 48]",
          "        (return_statement [1, 27] - [1, 46]",
          "          (call_expression [1, 33] - [1, 47]",
          "            function: (identifier [1, 33] - [1, 39]))))))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    if (args[1] === "src/util.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [2, 0]",
          "  (export_statement [0, 0] - [0, 29]",
          "    declaration: (lexical_declaration [0, 7] - [0, 29]",
          "      (variable_declarator [0, 13] - [0, 28]",
          "        name: (identifier [0, 13] - [0, 19]))))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    return { status: 1, signal: null, stdout: "", stderr: `unexpected file ${args[1]}` };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    mkdirSync(join(cwd, "node_modules", "pkg"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "import { helper } from './util';",
        "export function start() { return helper(value); }",
        "",
      ].join("\n"),
    );
    writeFileSync(join(cwd, "src", "util.ts"), "export const helper = () => 1;\n");
    writeFileSync(join(cwd, "src", "notes.md"), "helper\n");
    writeFileSync(join(cwd, "node_modules", "pkg", "ignored.ts"), "helper();\n");

    const parsed = parseCodeTreeSitterArgs(["repo-refs", "helper", "src"]);
    if (!parsed.ok) {
      assert.fail(parsed.message);
    }
    const result = runCodeTreeSitter({
      ...parsed.args,
      cwd,
      env: {
        PATH: "/usr/bin",
        OPENROUTER_API_KEY: "sk-or-v1-secret",
      },
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "repo-refs");
    assert.equal(result.repoReferences?.query, "helper");
    assert.equal(result.repoReferences?.targetPath, "src");
    assert.equal(result.repoReferences?.filesScanned, 2);
    assert.equal(result.repoReferences?.filesWithMatches, 2);
    assert.equal(result.repoReferences?.totalMatches, 3);
    assert.equal(result.repoReferences?.failedFiles, 0);
    assert.equal(calls[1]?.env.OPENROUTER_API_KEY, undefined);
    assert.deepEqual(
      calls.filter((call) => call.args[0] === "parse").map((call) => call.args[1]),
      ["src/index.ts", "src/util.ts"],
    );
    assert.deepEqual(
      result.repoReferences?.matches.map((match) => `${match.path}:${match.role}:${match.line}:${match.column}`),
      [
        "src/index.ts:name:1:10",
        "src/index.ts:function:2:34",
        "src/util.ts:name:1:14",
      ],
    );

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter repo refs/);
    assert.match(rendered, /not semantic resolution/);
    assert.match(rendered, /files_scanned: 2/);
    assert.match(rendered, /files_with_matches: 2/);
    assert.match(rendered, /matches: 3/);
    assert.match(rendered, /path="src\/index\.ts" role="function" kind="identifier" name="helper" line=2 column=34/);
    assert.doesNotMatch(rendered, /node_modules/);

    const missingQuery = parseCodeTreeSitterArgs(["repo-refs"]);
    assert.equal(missingQuery.ok, false);
    if (!missingQuery.ok) {
      assert.match(missingQuery.message, /Usage: orx code tree-sitter/);
    }

    const invalidTarget = runCodeTreeSitter({
      cwd,
      targetPath: "../outside",
      mode: "repo-refs",
      query: "helper",
      runner,
    });
    assert.equal(invalidTarget.ok, false);
    assert.equal(invalidTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(invalidTarget), /must stay inside/);

    const generatedTarget = runCodeTreeSitter({
      cwd,
      targetPath: "node_modules",
      mode: "repo-refs",
      query: "helper",
      runner,
    });
    assert.equal(generatedTarget.ok, false);
    assert.equal(generatedTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(generatedTarget), /generated or vendor directories/);

    const unsupportedFile = runCodeTreeSitter({
      cwd,
      targetPath: "src/notes.md",
      mode: "repo-refs",
      query: "helper",
      runner,
    });
    assert.equal(unsupportedFile.ok, true);
    assert.equal(unsupportedFile.repoReferences?.filesScanned, 0);
    assert.ok(unsupportedFile.repoReferences?.omissions.some((omission) =>
      omission.path === "src/notes.md" &&
      omission.reason === "source file extension is not supported for tree-sitter repo scan"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo outline scans bounded source files without semantic symbol overclaim", () => {
  const cwd = createTempDir();
  const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
  const runner: TreeSitterRunner = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/index.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [3, 0]",
          "  (export_statement [0, 0] - [0, 44]",
          "    declaration: (function_declaration [0, 7] - [0, 43]",
          "      name: (identifier [0, 16] - [0, 21])))",
          "  (export_statement [1, 0] - [1, 22]",
          "    declaration: (class_declaration [1, 7] - [1, 22]",
          "      name: (type_identifier [1, 13] - [1, 19])))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    if (args[1] === "src/util.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [1, 0]",
          "  (export_statement [0, 0] - [0, 29]",
          "    declaration: (lexical_declaration [0, 7] - [0, 29]",
          "      (variable_declarator [0, 13] - [0, 28]",
          "        name: (identifier [0, 13] - [0, 19]))))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    return { status: 1, signal: null, stdout: "", stderr: `unexpected file ${args[1]}` };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    mkdirSync(join(cwd, "node_modules", "pkg"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "export function start() { return helper(); }",
        "export class Worker {}",
        "",
      ].join("\n"),
    );
    writeFileSync(join(cwd, "src", "util.ts"), "export const helper = () => 1;\n");
    writeFileSync(join(cwd, "src", "notes.md"), "export function ignored() {}\n");
    writeFileSync(join(cwd, "node_modules", "pkg", "ignored.ts"), "export function ignored() {}\n");

    const filesParsed = parseCodeTreeSitterArgs(["repo-files", "src"]);
    if (!filesParsed.ok) {
      assert.fail(filesParsed.message);
    }
    const filesResult = runCodeTreeSitter({
      ...filesParsed.args,
      cwd,
      env: {
        PATH: "/usr/bin",
        OPENROUTER_API_KEY: "sk-or-v1-secret",
      },
      runner,
    });
    assert.equal(filesResult.ok, true);
    assert.equal(filesResult.mode, "repo-files");
    assert.equal(filesResult.repoFiles?.targetPath, "src");
    assert.equal(filesResult.repoFiles?.filesScanned, 2);
    assert.deepEqual(filesResult.repoFiles?.files, ["src/index.ts", "src/util.ts"]);
    assert.equal(calls.length, 0);
    const renderedFiles = renderCodeTreeSitterResult(filesResult);
    assert.match(renderedFiles, /Code tree-sitter repo files/);
    assert.match(renderedFiles, /no parsing or semantic analysis/);
    assert.match(renderedFiles, /files_scanned: 2/);
    assert.match(renderedFiles, /- src\/index\.ts/);
    assert.match(renderedFiles, /parse: use repo-outline, repo-symbols, repo-refs, repo-calls, repo-imports, or repo-deps/);
    assert.doesNotMatch(renderedFiles, /node_modules/);
    const repoFilesJson = JSON.parse(renderCodeTreeSitterResultJson(filesResult)) as {
      surface: string;
      execution: string;
      ast_backed: boolean;
      mode: string;
      repo_files: { files_scanned: number; files: string[] };
    };
    assert.equal(repoFilesJson.surface, "orx.code_tree_sitter");
    assert.equal(repoFilesJson.execution, "local_filesystem_scan_only");
    assert.equal(repoFilesJson.ast_backed, false);
    assert.equal(repoFilesJson.mode, "repo-files");
    assert.equal(repoFilesJson.repo_files.files_scanned, 2);
    assert.deepEqual(repoFilesJson.repo_files.files, ["src/index.ts", "src/util.ts"]);

    const parsed = parseCodeTreeSitterArgs(["repo-outline", "src"]);
    if (!parsed.ok) {
      assert.fail(parsed.message);
    }
    const result = runCodeTreeSitter({
      ...parsed.args,
      cwd,
      env: {
        PATH: "/usr/bin",
        OPENROUTER_API_KEY: "sk-or-v1-secret",
      },
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "repo-outline");
    assert.equal(result.repoOutline?.targetPath, "src");
    assert.equal(result.repoOutline?.filesScanned, 2);
    assert.equal(result.repoOutline?.filesWithOutline, 2);
    assert.equal(result.repoOutline?.totalEntries, 3);
    assert.equal(result.repoOutline?.failedFiles, 0);
    assert.equal(calls[1]?.env.OPENROUTER_API_KEY, undefined);
    assert.deepEqual(
      calls.filter((call) => call.args[0] === "parse").map((call) => call.args[1]),
      ["src/index.ts", "src/util.ts"],
    );
    assert.deepEqual(
      result.repoOutline?.entries.map((entry) => `${entry.path}:${entry.kind}:${entry.name}:${entry.line}:${entry.column}`),
      [
        "src/index.ts:function_declaration:start:1:8",
        "src/index.ts:class_declaration:Worker:2:8",
        "src/util.ts:variable_declarator:helper:1:14",
      ],
    );

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter repo outline/);
    assert.match(rendered, /not semantic symbol resolution/);
    assert.match(rendered, /files_scanned: 2/);
    assert.match(rendered, /files_with_outline: 2/);
    assert.match(rendered, /outline_entries: 3/);
    assert.match(rendered, /path="src\/index\.ts" kind="function_declaration" name="start" line=1 column=8/);
    assert.match(rendered, /path="src\/util\.ts" kind="variable_declarator" name="helper" line=1 column=14/);
    assert.doesNotMatch(rendered, /node_modules/);

    const symbolsParsed = parseCodeTreeSitterArgs(["repo-symbols", "src"]);
    if (!symbolsParsed.ok) {
      assert.fail(symbolsParsed.message);
    }
    const symbolsResult = runCodeTreeSitter({
      ...symbolsParsed.args,
      cwd,
      runner,
    });
    assert.equal(symbolsResult.ok, true);
    assert.equal(symbolsResult.mode, "repo-symbols");
    assert.equal(symbolsResult.repoOutline?.filesScanned, 2);
    assert.equal(symbolsResult.repoOutline?.totalEntries, 3);
    const renderedSymbols = renderCodeTreeSitterResult(symbolsResult);
    assert.match(renderedSymbols, /Code tree-sitter repo symbols/);
    assert.match(renderedSymbols, /not semantic symbol resolution/);
    assert.match(renderedSymbols, /files_with_symbols: 2/);
    assert.match(renderedSymbols, /symbols: 3/);
    assert.match(renderedSymbols, /path="src\/index\.ts" kind="class_declaration" name="Worker" line=2 column=8/);

    const defaultTarget = parseCodeTreeSitterArgs(["repo-outline"]);
    assert.equal(defaultTarget.ok, true);
    if (defaultTarget.ok) {
      assert.equal(defaultTarget.args.targetPath, ".");
      assert.equal(defaultTarget.args.mode, "repo-outline");
    }

    const defaultFilesTarget = parseCodeTreeSitterArgs(["repo-files"]);
    assert.equal(defaultFilesTarget.ok, true);
    if (defaultFilesTarget.ok) {
      assert.equal(defaultFilesTarget.args.targetPath, ".");
      assert.equal(defaultFilesTarget.args.mode, "repo-files");
    }

    const filesAliasTarget = parseCodeTreeSitterArgs(["repo-source-files", "src"]);
    assert.equal(filesAliasTarget.ok, true);
    if (filesAliasTarget.ok) {
      assert.equal(filesAliasTarget.args.targetPath, "src");
      assert.equal(filesAliasTarget.args.mode, "repo-files");
    }

    const aliasTarget = parseCodeTreeSitterArgs(["outlines-all", "src"]);
    assert.equal(aliasTarget.ok, true);
    if (aliasTarget.ok) {
      assert.equal(aliasTarget.args.targetPath, "src");
      assert.equal(aliasTarget.args.mode, "repo-outline");
    }

    const symbolAliasTarget = parseCodeTreeSitterArgs(["symbols-all", "src"]);
    assert.equal(symbolAliasTarget.ok, true);
    if (symbolAliasTarget.ok) {
      assert.equal(symbolAliasTarget.args.targetPath, "src");
      assert.equal(symbolAliasTarget.args.mode, "repo-symbols");
    }

    const invalidTarget = runCodeTreeSitter({
      cwd,
      targetPath: "../outside",
      mode: "repo-outline",
      runner,
    });
    assert.equal(invalidTarget.ok, false);
    assert.equal(invalidTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(invalidTarget), /must stay inside/);

    const generatedTarget = runCodeTreeSitter({
      cwd,
      targetPath: "node_modules",
      mode: "repo-outline",
      runner,
    });
    assert.equal(generatedTarget.ok, false);
    assert.equal(generatedTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(generatedTarget), /generated or vendor directories/);

    const unsupportedFile = runCodeTreeSitter({
      cwd,
      targetPath: "src/notes.md",
      mode: "repo-outline",
      runner,
    });
    assert.equal(unsupportedFile.ok, true);
    assert.equal(unsupportedFile.repoOutline?.filesScanned, 0);
    assert.ok(unsupportedFile.repoOutline?.omissions.some((omission) =>
      omission.path === "src/notes.md" &&
      omission.reason === "source file extension is not supported for tree-sitter repo scan"));

    const unsupportedRepoFilesFile = runCodeTreeSitter({
      cwd,
      targetPath: "src/notes.md",
      mode: "repo-files",
      runner,
    });
    assert.equal(unsupportedRepoFilesFile.ok, true);
    assert.equal(unsupportedRepoFilesFile.repoFiles?.filesScanned, 0);
    assert.ok(unsupportedRepoFilesFile.repoFiles?.warnings.includes("no source files found for bounded tree-sitter repo file scan"));
    assert.ok(unsupportedRepoFilesFile.repoFiles?.omissions.some((omission) =>
      omission.path === "src/notes.md" &&
      omission.reason === "source file extension is not supported for tree-sitter repo scan"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo outline reports file-level parse failures and timeouts", () => {
  const cwd = createTempDir();
  const runner: TreeSitterRunner = (command, args) => {
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/bad.ts") {
      return { status: 1, signal: null, stdout: "", stderr: "parse failed" };
    }
    if (args[1] === "src/slow.ts") {
      return {
        status: null,
        signal: null,
        stdout: "",
        stderr: "slow parse",
        error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
      };
    }
    return {
      status: 0,
      signal: null,
      stdout: [
        "(program [0, 0] - [1, 0]",
        "  (function_declaration [0, 0] - [0, 18]",
        "    name: (identifier [0, 9] - [0, 11]))",
        "",
      ].join("\n"),
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "bad.ts"), "function bad() {}\n");
    writeFileSync(join(cwd, "src", "ok.ts"), "function ok() {}\n");
    writeFileSync(join(cwd, "src", "slow.ts"), "function slow() {}\n");

    const result = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-outline",
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.equal(result.timedOut, true);
    assert.equal(result.repoOutline?.filesScanned, 3);
    assert.equal(result.repoOutline?.filesWithOutline, 1);
    assert.equal(result.repoOutline?.totalEntries, 1);
    assert.equal(result.repoOutline?.failedFiles, 2);
    assert.equal(result.repoOutline?.timedOutFiles, 1);
    assert.equal(result.repoOutline?.omittedFiles, 2);
    assert.ok(result.repoOutline?.warnings.includes("some files could not be parsed by tree-sitter; omissions list includes file-level failures"));
    assert.ok(result.repoOutline?.omissions.some((omission) =>
      omission.path === "src/bad.ts" &&
      omission.reason === "tree-sitter parse failed"));
    assert.ok(result.repoOutline?.omissions.some((omission) =>
      omission.path === "src/slow.ts" &&
      omission.reason === "tree-sitter parse timed out"));

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter repo outline/);
    assert.match(rendered, /omitted_files: 2/);
    assert.match(rendered, /path="src\/bad\.ts" reason="tree-sitter parse failed"/);
    assert.match(rendered, /path="src\/slow\.ts" reason="tree-sitter parse timed out"/);
    assert.match(rendered, /src\/bad\.ts: tree-sitter parse failed: parse failed/);
    assert.match(rendered, /src\/slow\.ts: tree-sitter parse timed out: slow parse/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo imports scans bounded source files without dependency overclaim", () => {
  const cwd = createTempDir();
  const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
  const runner: TreeSitterRunner = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/index.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [4, 0]",
          "  (import_statement [0, 0] - [0, 32]",
          "    source: (string [0, 23] - [0, 31]",
          "      (string_fragment [0, 24] - [0, 30])))",
          "  (export_statement [1, 0] - [1, 32]",
          "    source: (string [1, 23] - [1, 31]",
          "      (string_fragment [1, 24] - [1, 30])))",
          "  (lexical_declaration [2, 0] - [2, 29]",
          "    (variable_declarator [2, 6] - [2, 28]",
          "      value: (call_expression [2, 12] - [2, 28]",
          "        function: (identifier [2, 12] - [2, 19])",
          "        arguments: (arguments [2, 19] - [2, 28]",
          "          (string [2, 20] - [2, 27]",
          "            (string_fragment [2, 21] - [2, 26])))))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    if (args[1] === "src/util.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [1, 0]",
          "  (lexical_declaration [0, 0] - [0, 30]",
          "    (variable_declarator [0, 6] - [0, 29]",
          "      value: (call_expression [0, 13] - [0, 29]",
          "        function: (import [0, 13] - [0, 19])",
          "        arguments: (arguments [0, 19] - [0, 29]",
          "          (string [0, 20] - [0, 28]",
          "            (string_fragment [0, 21] - [0, 27])))))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    return { status: 1, signal: null, stdout: "", stderr: `unexpected file ${args[1]}` };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    mkdirSync(join(cwd, "node_modules", "pkg"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "import { helper } from './util';",
        "export { helper } from './util';",
        "const mod = require(\"./mod\");",
        "",
      ].join("\n"),
    );
    writeFileSync(join(cwd, "src", "util.ts"), "const lazy = import(\"./lazy\");\n");
    writeFileSync(join(cwd, "src", "notes.md"), "import './ignored';\n");
    writeFileSync(join(cwd, "node_modules", "pkg", "ignored.ts"), "import './ignored';\n");

    const parsed = parseCodeTreeSitterArgs(["repo-imports", "src"]);
    if (!parsed.ok) {
      assert.fail(parsed.message);
    }
    const result = runCodeTreeSitter({
      ...parsed.args,
      cwd,
      env: {
        PATH: "/usr/bin",
        OPENROUTER_API_KEY: "sk-or-v1-secret",
      },
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "repo-imports");
    assert.equal(result.repoImports?.targetPath, "src");
    assert.equal(result.repoImports?.filesScanned, 2);
    assert.equal(result.repoImports?.filesWithImports, 2);
    assert.equal(result.repoImports?.totalEdges, 4);
    assert.equal(result.repoImports?.failedFiles, 0);
    assert.equal(calls[1]?.env.OPENROUTER_API_KEY, undefined);
    assert.deepEqual(
      calls.filter((call) => call.args[0] === "parse").map((call) => call.args[1]),
      ["src/index.ts", "src/util.ts"],
    );
    assert.deepEqual(
      result.repoImports?.edges.map((edge) => `${edge.path}:${edge.kind}:${edge.source}:${edge.line}:${edge.column}`),
      [
        "src/index.ts:import:./util:1:1",
        "src/index.ts:reexport:./util:2:1",
        "src/index.ts:require:./mod:3:13",
        "src/util.ts:dynamic_import:./lazy:1:14",
      ],
    );

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter repo imports/);
    assert.match(rendered, /not dependency resolution/);
    assert.match(rendered, /files_scanned: 2/);
    assert.match(rendered, /files_with_imports: 2/);
    assert.match(rendered, /imports: 4/);
    assert.match(rendered, /path="src\/index\.ts" kind="require" source="\.\/mod" line=3 column=13/);
    assert.match(rendered, /path="src\/util\.ts" kind="dynamic_import" source="\.\/lazy" line=1 column=14/);
    assert.doesNotMatch(rendered, /node_modules/);

    const defaultTarget = parseCodeTreeSitterArgs(["repo-imports"]);
    assert.equal(defaultTarget.ok, true);
    if (defaultTarget.ok) {
      assert.equal(defaultTarget.args.targetPath, ".");
      assert.equal(defaultTarget.args.mode, "repo-imports");
    }

    const invalidTarget = runCodeTreeSitter({
      cwd,
      targetPath: "../outside",
      mode: "repo-imports",
      runner,
    });
    assert.equal(invalidTarget.ok, false);
    assert.equal(invalidTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(invalidTarget), /must stay inside/);

    const generatedTarget = runCodeTreeSitter({
      cwd,
      targetPath: "node_modules",
      mode: "repo-imports",
      runner,
    });
    assert.equal(generatedTarget.ok, false);
    assert.equal(generatedTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(generatedTarget), /generated or vendor directories/);

    const unsupportedFile = runCodeTreeSitter({
      cwd,
      targetPath: "src/notes.md",
      mode: "repo-imports",
      runner,
    });
    assert.equal(unsupportedFile.ok, true);
    assert.equal(unsupportedFile.repoImports?.filesScanned, 0);
    assert.ok(unsupportedFile.repoImports?.omissions.some((omission) =>
      omission.path === "src/notes.md" &&
      omission.reason === "source file extension is not supported for tree-sitter repo scan"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo imports reports file-level parse failures and timeouts", () => {
  const cwd = createTempDir();
  const runner: TreeSitterRunner = (command, args) => {
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/bad.ts") {
      return { status: 1, signal: null, stdout: "", stderr: "parse failed" };
    }
    if (args[1] === "src/slow.ts") {
      return {
        status: null,
        signal: null,
        stdout: "",
        stderr: "slow parse",
        error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
      };
    }
    return {
      status: 0,
      signal: null,
      stdout: [
        "(program [0, 0] - [1, 0]",
        "  (import_statement [0, 0] - [0, 19]",
        "    source: (string [0, 7] - [0, 18]",
        "      (string_fragment [0, 8] - [0, 17])))",
        "",
      ].join("\n"),
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "bad.ts"), "import './bad';\n");
    writeFileSync(join(cwd, "src", "ok.ts"), "import './ok';\n");
    writeFileSync(join(cwd, "src", "slow.ts"), "import './slow';\n");

    const result = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-imports",
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.equal(result.timedOut, true);
    assert.equal(result.repoImports?.filesScanned, 3);
    assert.equal(result.repoImports?.filesWithImports, 1);
    assert.equal(result.repoImports?.totalEdges, 1);
    assert.equal(result.repoImports?.failedFiles, 2);
    assert.equal(result.repoImports?.timedOutFiles, 1);
    assert.equal(result.repoImports?.omittedFiles, 2);
    assert.ok(result.repoImports?.warnings.includes("some files could not be parsed by tree-sitter; omissions list includes file-level failures"));
    assert.ok(result.repoImports?.omissions.some((omission) =>
      omission.path === "src/bad.ts" &&
      omission.reason === "tree-sitter parse failed"));
    assert.ok(result.repoImports?.omissions.some((omission) =>
      omission.path === "src/slow.ts" &&
      omission.reason === "tree-sitter parse timed out"));

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter repo imports/);
    assert.match(rendered, /omitted_files: 2/);
    assert.match(rendered, /path="src\/bad\.ts" reason="tree-sitter parse failed"/);
    assert.match(rendered, /path="src\/slow\.ts" reason="tree-sitter parse timed out"/);
    assert.match(rendered, /src\/bad\.ts: tree-sitter parse failed: parse failed/);
    assert.match(rendered, /src\/slow\.ts: tree-sitter parse timed out: slow parse/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo imports reports truncated parse output", () => {
  const cwd = createTempDir();
  const runner: TreeSitterRunner = (command, args) => {
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    return {
      status: 0,
      signal: null,
      stdout: [
        "(program [0, 0] - [2, 0]",
        "  (import_statement [0, 0] - [0, 19]",
        "    source: (string [0, 7] - [0, 18]",
        "      (string_fragment [0, 8] - [0, 17])))",
        "  (comment [1, 0] - [1, 160])",
        "",
      ].join("\n"),
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "ok.ts"), "import './ok';\n");

    const result = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-imports",
      maxBytes: 96,
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.repoImports?.filesScanned, 1);
    assert.equal(result.repoImports?.truncated, true);
    assert.ok(result.repoImports?.omissions.some((omission) =>
      omission.path === "src/ok.ts" &&
      omission.reason === "AST import edges exceeded per-file bounds"));

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /imports: \d+ \(truncated\)/);
    assert.match(rendered, /path="src\/ok\.ts" reason="AST import edges exceeded per-file bounds"/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo deps resolves bounded local relative imports without package overclaim", () => {
  const cwd = createTempDir();
  const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
  const runner: TreeSitterRunner = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/index.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [5, 0]",
          "  (import_statement [0, 0] - [0, 34]",
          "    source: (string [0, 23] - [0, 34]",
          "      (string_fragment [0, 24] - [0, 33])))",
          "  (import_statement [1, 0] - [1, 30]",
          "    source: (string [1, 16] - [1, 30]",
          "      (string_fragment [1, 17] - [1, 29])))",
          "  (lexical_declaration [2, 0] - [2, 37]",
          "    (variable_declarator [2, 6] - [2, 36]",
          "      value: (call_expression [2, 16] - [2, 36]",
          "        function: (identifier [2, 16] - [2, 23])",
          "        arguments: (arguments [2, 23] - [2, 36]",
          "          (string [2, 24] - [2, 35]",
          "            (string_fragment [2, 25] - [2, 34])))))",
          "  (export_statement [3, 0] - [3, 35]",
          "    source: (string [3, 24] - [3, 35]",
          "      (string_fragment [3, 25] - [3, 34])))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    return {
      status: 0,
      signal: null,
      stdout: "(program [0, 0] - [1, 0]\n",
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src", "feature"), { recursive: true });
    mkdirSync(join(cwd, "node_modules", "pkg"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "import { helper } from './util.js';",
        "import pkg from 'external-pkg';",
        "const missing = require(\"./missing\");",
        "export { feature } from './feature';",
        "",
      ].join("\n"),
    );
    writeFileSync(join(cwd, "src", "util.ts"), "export const helper = true;\n");
    writeFileSync(join(cwd, "src", "feature", "index.ts"), "export const feature = true;\n");
    writeFileSync(join(cwd, "node_modules", "pkg", "ignored.ts"), "export const ignored = true;\n");

    const parsed = parseCodeTreeSitterArgs(["repo-deps", "src"]);
    if (!parsed.ok) {
      assert.fail(parsed.message);
    }
    const result = runCodeTreeSitter({
      ...parsed.args,
      cwd,
      env: {
        PATH: "/usr/bin",
        OPENROUTER_API_KEY: "sk-or-v1-secret",
      },
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "repo-deps");
    assert.equal(result.repoDependencies?.targetPath, "src");
    assert.equal(result.repoDependencies?.filesScanned, 3);
    assert.equal(result.repoDependencies?.filesWithDependencies, 1);
    assert.equal(result.repoDependencies?.totalEdges, 4);
    assert.equal(result.repoDependencies?.localDependencies, 2);
    assert.equal(result.repoDependencies?.externalImports, 1);
    assert.equal(result.repoDependencies?.unresolvedLocalImports, 1);
    assert.equal(result.repoDependencies?.failedFiles, 0);
    assert.equal(calls[1]?.env.OPENROUTER_API_KEY, undefined);
    assert.deepEqual(
      calls.filter((call) => call.args[0] === "parse").map((call) => call.args[1]),
      ["src/feature/index.ts", "src/index.ts", "src/util.ts"],
    );
    assert.deepEqual(
      result.repoDependencies?.edges.map((edge) => `${edge.path}:${edge.resolution}:${edge.source}:${edge.to ?? ""}:${edge.line}:${edge.column}`),
      [
        "src/index.ts:local:./util.js:src/util.ts:1:1",
        "src/index.ts:external:external-pkg::2:1",
        "src/index.ts:unresolved_local:./missing::3:17",
        "src/index.ts:local:./feature:src/feature/index.ts:4:1",
      ],
    );

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter repo deps/);
    assert.match(rendered, /local relative imports and safe tsconfig\/jsconfig paths only/);
    assert.match(rendered, /not package or semantic resolution/);
    assert.match(rendered, /files_scanned: 3/);
    assert.match(rendered, /files_with_dependencies: 1/);
    assert.match(rendered, /dependencies: 4/);
    assert.match(rendered, /local_dependencies: 2/);
    assert.match(rendered, /external_imports: 1/);
    assert.match(rendered, /unresolved_local_imports: 1/);
    assert.match(rendered, /from="src\/index\.ts" to="src\/util\.ts" specifier="\.\/util\.js" resolution=local resolution_detail=relative kind="import" line=1 column=1/);
    assert.match(rendered, /from="src\/index\.ts" to="external" specifier="external-pkg" resolution=external kind="import" line=2 column=1/);
    assert.match(rendered, /from="src\/index\.ts" to="unresolved_local" specifier="\.\/missing" resolution=unresolved_local kind="require" line=3 column=17/);
    assert.match(rendered, /from="src\/index\.ts" to="src\/feature\/index\.ts" specifier="\.\/feature" resolution=local resolution_detail=relative kind="reexport" line=4 column=1/);
    assert.doesNotMatch(rendered, /node_modules/);

    const defaultTarget = parseCodeTreeSitterArgs(["repo-deps"]);
    assert.equal(defaultTarget.ok, true);
    if (defaultTarget.ok) {
      assert.equal(defaultTarget.args.targetPath, ".");
      assert.equal(defaultTarget.args.mode, "repo-deps");
    }

    const aliasTarget = parseCodeTreeSitterArgs(["deps", "src"]);
    assert.equal(aliasTarget.ok, true);
    if (aliasTarget.ok) {
      assert.equal(aliasTarget.args.targetPath, "src");
      assert.equal(aliasTarget.args.mode, "repo-deps");
    }

    const invalidTarget = runCodeTreeSitter({
      cwd,
      targetPath: "../outside",
      mode: "repo-deps",
      runner,
    });
    assert.equal(invalidTarget.ok, false);
    assert.equal(invalidTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(invalidTarget), /must stay inside/);

    const generatedTarget = runCodeTreeSitter({
      cwd,
      targetPath: "node_modules",
      mode: "repo-deps",
      runner,
    });
    assert.equal(generatedTarget.ok, false);
    assert.equal(generatedTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(generatedTarget), /generated or vendor directories/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo deps resolves safe tsconfig/jsconfig aliases without package overclaim", () => {
  const cwd = createTempDir();
  const runner: TreeSitterRunner = (command, args) => {
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/index.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [5, 0]",
          "  (import_statement [0, 0] - [0, 31]",
          "    source: (string [0, 20] - [0, 30]",
          "      (string_fragment [0, 21] - [0, 29])))",
          "  (import_statement [1, 0] - [1, 36]",
          "    source: (string [1, 21] - [1, 35]",
          "      (string_fragment [1, 22] - [1, 34])))",
          "  (import_statement [2, 0] - [2, 30]",
          "    source: (string [2, 16] - [2, 29]",
          "      (string_fragment [2, 17] - [2, 28])))",
          "  (import_statement [3, 0] - [3, 26]",
          "    source: (string [3, 18] - [3, 25]",
          "      (string_fragment [3, 19] - [3, 24])))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    return {
      status: 0,
      signal: null,
      stdout: "(program [0, 0] - [1, 0]\n",
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src", "app"), { recursive: true });
    mkdirSync(join(cwd, "src", "lib"), { recursive: true });
    writeFileSync(
      join(cwd, "tsconfig.json"),
      [
        "{",
        "  // JSONC is accepted for root TypeScript config path previews.",
        "  \"compilerOptions\": {",
        "    \"baseUrl\": \".\",",
        "    \"paths\": {",
        "      \"@lib/*\": [\"src/lib/*\"],",
        "      \"@bad/*\": [\"../outside/*\"],",
        "    },",
        "  },",
        "}",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "import { foo } from '@lib/foo';",
        "import { root } from 'src/app/root';",
        "import bad from '@bad/secret';",
        "import react from 'react';",
        "",
      ].join("\n"),
    );
    writeFileSync(join(cwd, "src", "app", "root.ts"), "export const root = true;\n");
    writeFileSync(join(cwd, "src", "lib", "foo.ts"), "export const foo = true;\n");

    const result = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-deps",
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.repoDependencies?.filesScanned, 3);
    assert.equal(result.repoDependencies?.filesWithDependencies, 1);
    assert.equal(result.repoDependencies?.totalEdges, 4);
    assert.equal(result.repoDependencies?.localDependencies, 2);
    assert.equal(result.repoDependencies?.externalImports, 1);
    assert.equal(result.repoDependencies?.unresolvedLocalImports, 1);
    assert.ok(result.repoDependencies?.warnings.some((warning) =>
      warning.includes("TypeScript config path target") && warning.includes("@bad/*")));
    assert.deepEqual(
      result.repoDependencies?.edges.map((edge) =>
        `${edge.path}:${edge.resolution}:${edge.resolutionDetail ?? ""}:${edge.source}:${edge.to ?? ""}`),
      [
        "src/index.ts:local:config_path:@lib/foo:src/lib/foo.ts",
        "src/index.ts:local:config_base_url:src/app/root:src/app/root.ts",
        "src/index.ts:unresolved_local::@bad/secret:",
        "src/index.ts:external::react:",
      ],
    );

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /safe tsconfig\/jsconfig paths only/);
    assert.match(rendered, /specifier="@lib\/foo" resolution=local resolution_detail=config_path/);
    assert.match(rendered, /specifier="src\/app\/root" resolution=local resolution_detail=config_base_url/);
    assert.match(rendered, /specifier="@bad\/secret" resolution=unresolved_local/);
    assert.match(rendered, /specifier="react" resolution=external/);
    assert.match(rendered, /TypeScript config path target/);

    writeFileSync(
      join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: "../outside",
          paths: {
            "@lib/*": ["src/lib/*"],
          },
        },
      }),
    );

    const unsafeBaseUrlResult = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-deps",
      runner,
    });
    assert.equal(unsafeBaseUrlResult.ok, true);
    assert.equal(unsafeBaseUrlResult.repoDependencies?.localDependencies, 0);
    assert.equal(unsafeBaseUrlResult.repoDependencies?.externalImports, 4);
    assert.equal(unsafeBaseUrlResult.repoDependencies?.unresolvedLocalImports, 0);
    assert.ok(unsafeBaseUrlResult.repoDependencies?.warnings.some((warning) =>
      warning.includes("compilerOptions.paths were ignored")));

    mkdirSync(join(cwd, "src", "fallback", "lib"), { recursive: true });
    writeFileSync(join(cwd, "src", "fallback", "lib", "foo.ts"), "export const fallback = true;\n");
    writeFileSync(
      join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@lib/*": ["src/missing/*"],
            "@*": ["src/fallback/*"],
          },
        },
      }),
    );

    const overlappingPathsResult = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-deps",
      runner,
    });
    assert.equal(overlappingPathsResult.ok, true);
    assert.equal(overlappingPathsResult.repoDependencies?.localDependencies, 1);
    assert.equal(overlappingPathsResult.repoDependencies?.externalImports, 1);
    assert.equal(overlappingPathsResult.repoDependencies?.unresolvedLocalImports, 2);
    assert.deepEqual(
      overlappingPathsResult.repoDependencies?.edges.map((edge) =>
        `${edge.resolution}:${edge.resolutionDetail ?? ""}:${edge.source}:${edge.to ?? ""}`),
      [
        "unresolved_local::@lib/foo:",
        "local:config_base_url:src/app/root:src/app/root.ts",
        "unresolved_local::@bad/secret:",
        "external::react:",
      ],
    );
    assert.doesNotMatch(renderCodeTreeSitterResult(overlappingPathsResult), /src\/fallback\/lib\/foo\.ts/);

    rmSync(join(cwd, "tsconfig.json"), { force: true });
    writeFileSync(
      join(cwd, "jsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@lib/*": ["src/lib/*"],
          },
        },
      }),
    );

    const jsconfigResult = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-deps",
      runner,
    });
    assert.equal(jsconfigResult.ok, true);
    assert.equal(jsconfigResult.repoDependencies?.localDependencies, 2);
    assert.equal(jsconfigResult.repoDependencies?.externalImports, 2);
    assert.equal(jsconfigResult.repoDependencies?.unresolvedLocalImports, 0);
    assert.deepEqual(
      jsconfigResult.repoDependencies?.edges.map((edge) =>
        `${edge.resolution}:${edge.resolutionDetail ?? ""}:${edge.source}:${edge.to ?? ""}`),
      [
        "local:config_path:@lib/foo:src/lib/foo.ts",
        "local:config_base_url:src/app/root:src/app/root.ts",
        "external::@bad/secret:",
        "external::react:",
      ],
    );

    mkdirSync(join(cwd, "src", "jsconfig-lib"), { recursive: true });
    writeFileSync(join(cwd, "src", "jsconfig-lib", "foo.ts"), "export const jsconfigFoo = true;\n");
    writeFileSync(
      join(cwd, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@lib/*": ["src/lib/*"],
          },
        },
      }),
    );
    writeFileSync(
      join(cwd, "jsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@lib/*": ["src/jsconfig-lib/*"],
          },
        },
      }),
    );

    const configPrecedenceResult = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-deps",
      runner,
    });
    assert.equal(configPrecedenceResult.ok, true);
    assert.deepEqual(
      configPrecedenceResult.repoDependencies?.edges.map((edge) =>
        `${edge.resolution}:${edge.resolutionDetail ?? ""}:${edge.source}:${edge.to ?? ""}`),
      [
        "local:config_path:@lib/foo:src/lib/foo.ts",
        "local:config_base_url:src/app/root:src/app/root.ts",
        "external::@bad/secret:",
        "external::react:",
      ],
    );
    assert.doesNotMatch(renderCodeTreeSitterResult(configPrecedenceResult), /src\/jsconfig-lib\/foo\.ts/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo deps reports file-level parse failures and timeouts", () => {
  const cwd = createTempDir();
  const runner: TreeSitterRunner = (command, args) => {
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/bad.ts") {
      return { status: 1, signal: null, stdout: "", stderr: "parse failed" };
    }
    if (args[1] === "src/slow.ts") {
      return {
        status: null,
        signal: null,
        stdout: "",
        stderr: "slow parse",
        error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
      };
    }
    return {
      status: 0,
      signal: null,
      stdout: [
        "(program [0, 0] - [1, 0]",
        "  (import_statement [0, 0] - [0, 19]",
        "    source: (string [0, 7] - [0, 18]",
        "      (string_fragment [0, 8] - [0, 17])))",
        "",
      ].join("\n"),
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "bad.ts"), "import './bad';\n");
    writeFileSync(join(cwd, "src", "ok.ts"), "import './missing';\n");
    writeFileSync(join(cwd, "src", "slow.ts"), "import './slow';\n");

    const result = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-deps",
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.equal(result.timedOut, true);
    assert.equal(result.repoDependencies?.filesScanned, 3);
    assert.equal(result.repoDependencies?.filesWithDependencies, 1);
    assert.equal(result.repoDependencies?.totalEdges, 1);
    assert.equal(result.repoDependencies?.unresolvedLocalImports, 1);
    assert.equal(result.repoDependencies?.failedFiles, 2);
    assert.equal(result.repoDependencies?.timedOutFiles, 1);
    assert.equal(result.repoDependencies?.omittedFiles, 2);
    assert.ok(result.repoDependencies?.warnings.includes("some files could not be parsed by tree-sitter; omissions list includes file-level failures"));
    assert.ok(result.repoDependencies?.omissions.some((omission) =>
      omission.path === "src/bad.ts" &&
      omission.reason === "tree-sitter parse failed"));
    assert.ok(result.repoDependencies?.omissions.some((omission) =>
      omission.path === "src/slow.ts" &&
      omission.reason === "tree-sitter parse timed out"));

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter repo deps/);
    assert.match(rendered, /omitted_files: 2/);
    assert.match(rendered, /path="src\/bad\.ts" reason="tree-sitter parse failed"/);
    assert.match(rendered, /path="src\/slow\.ts" reason="tree-sitter parse timed out"/);
    assert.match(rendered, /src\/bad\.ts: tree-sitter parse failed: parse failed/);
    assert.match(rendered, /src\/slow\.ts: tree-sitter parse timed out: slow parse/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo calls scans bounded source files without semantic overclaim", () => {
  const cwd = createTempDir();
  const calls: Array<{ command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
  const runner: TreeSitterRunner = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/index.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [4, 0]",
          "  (import_statement [0, 0] - [0, 31]",
          "    (import_clause [0, 7] - [0, 17]",
          "      (named_imports [0, 7] - [0, 17]",
          "        name: (identifier [0, 9] - [0, 15]))))",
          "  (export_statement [1, 0] - [1, 49]",
          "    declaration: (function_declaration [1, 7] - [1, 49]",
          "      name: (identifier [1, 16] - [1, 21])",
          "      body: (statement_block [1, 24] - [1, 49]",
          "        (return_statement [1, 26] - [1, 46]",
          "          (call_expression [1, 33] - [1, 46]",
          "            function: (identifier [1, 33] - [1, 39])))))",
          "  (expression_statement [2, 0] - [2, 7]",
          "    (call_expression [2, 0] - [2, 6]",
          "      function: (identifier [2, 0] - [2, 4])))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    if (args[1] === "src/util.ts") {
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [2, 0]",
          "  (export_statement [0, 0] - [0, 46]",
          "    declaration: (function_declaration [0, 7] - [0, 46]",
          "      name: (identifier [0, 16] - [0, 22])",
          "      body: (statement_block [0, 25] - [0, 46]",
          "        (return_statement [0, 27] - [0, 44]",
          "          (call_expression [0, 34] - [0, 43]",
          "            function: (identifier [0, 34] - [0, 41]))))))",
          "",
        ].join("\n"),
        stderr: "",
      };
    }
    return { status: 1, signal: null, stdout: "", stderr: `unexpected file ${args[1]}` };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    mkdirSync(join(cwd, "node_modules", "pkg"), { recursive: true });
    writeFileSync(
      join(cwd, "src", "index.ts"),
      [
        "import { helper } from './util';",
        "export function start() { return helper(value); }",
        "boot();",
        "",
      ].join("\n"),
    );
    writeFileSync(join(cwd, "src", "util.ts"), "export function helper() { return compute(); }\n");
    writeFileSync(join(cwd, "src", "notes.md"), "helper();\n");
    writeFileSync(join(cwd, "node_modules", "pkg", "ignored.ts"), "ignored();\n");

    const parsed = parseCodeTreeSitterArgs(["repo-calls", "src"]);
    if (!parsed.ok) {
      assert.fail(parsed.message);
    }
    const result = runCodeTreeSitter({
      ...parsed.args,
      cwd,
      env: {
        PATH: "/usr/bin",
        OPENROUTER_API_KEY: "sk-or-v1-secret",
      },
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "repo-calls");
    assert.equal(result.repoCalls?.targetPath, "src");
    assert.equal(result.repoCalls?.filesScanned, 2);
    assert.equal(result.repoCalls?.filesWithCalls, 2);
    assert.equal(result.repoCalls?.totalEdges, 3);
    assert.equal(result.repoCalls?.failedFiles, 0);
    assert.equal(calls[1]?.env.OPENROUTER_API_KEY, undefined);
    assert.deepEqual(
      calls.filter((call) => call.args[0] === "parse").map((call) => call.args[1]),
      ["src/index.ts", "src/util.ts"],
    );
    assert.deepEqual(
      result.repoCalls?.edges.map((edge) => `${edge.path}:${edge.caller?.name ?? "[top-level]"}:${edge.callee}:${edge.line}:${edge.column}`),
      [
        "src/index.ts:start:helper:2:34",
        "src/index.ts:[top-level]:boot:3:1",
        "src/util.ts:helper:compute:1:35",
      ],
    );

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter repo calls/);
    assert.match(rendered, /not semantic call resolution/);
    assert.match(rendered, /files_scanned: 2/);
    assert.match(rendered, /files_with_calls: 2/);
    assert.match(rendered, /calls: 3/);
    assert.match(rendered, /path="src\/index\.ts" caller="start" caller_kind="function_declaration" caller_line=2 callee="helper" line=2 column=34/);
    assert.match(rendered, /path="src\/util\.ts" caller="helper" caller_kind="function_declaration" caller_line=1 callee="compute" line=1 column=35/);
    assert.doesNotMatch(rendered, /node_modules/);

    const defaultTarget = parseCodeTreeSitterArgs(["repo-calls"]);
    assert.equal(defaultTarget.ok, true);
    if (defaultTarget.ok) {
      assert.equal(defaultTarget.args.targetPath, ".");
      assert.equal(defaultTarget.args.mode, "repo-calls");
    }

    const invalidTarget = runCodeTreeSitter({
      cwd,
      targetPath: "../outside",
      mode: "repo-calls",
      runner,
    });
    assert.equal(invalidTarget.ok, false);
    assert.equal(invalidTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(invalidTarget), /must stay inside/);

    const generatedTarget = runCodeTreeSitter({
      cwd,
      targetPath: "node_modules",
      mode: "repo-calls",
      runner,
    });
    assert.equal(generatedTarget.ok, false);
    assert.equal(generatedTarget.status, "invalid_arguments");
    assert.match(renderCodeTreeSitterResult(generatedTarget), /generated or vendor directories/);

    const unsupportedFile = runCodeTreeSitter({
      cwd,
      targetPath: "src/notes.md",
      mode: "repo-calls",
      runner,
    });
    assert.equal(unsupportedFile.ok, true);
    assert.equal(unsupportedFile.repoCalls?.filesScanned, 0);
    assert.ok(unsupportedFile.repoCalls?.omissions.some((omission) =>
      omission.path === "src/notes.md" &&
      omission.reason === "source file extension is not supported for tree-sitter repo scan"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo calls reports file-level parse failures and timeouts", () => {
  const cwd = createTempDir();
  const runner: TreeSitterRunner = (command, args) => {
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    if (args[1] === "src/bad.ts") {
      return { status: 1, signal: null, stdout: "", stderr: "parse failed" };
    }
    if (args[1] === "src/slow.ts") {
      return {
        status: null,
        signal: null,
        stdout: "",
        stderr: "slow parse",
        error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
      };
    }
    return {
      status: 0,
      signal: null,
      stdout: [
        "(program [0, 0] - [2, 0]",
        "  (export_statement [0, 0] - [0, 41]",
        "    declaration: (function_declaration [0, 7] - [0, 41]",
        "      name: (identifier [0, 16] - [0, 18])",
        "      body: (statement_block [0, 21] - [0, 41]",
        "        (return_statement [0, 23] - [0, 39]",
        "          (call_expression [0, 30] - [0, 38]",
        "            function: (identifier [0, 30] - [0, 34]))))))",
        "",
      ].join("\n"),
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "bad.ts"), "broken();\n");
    writeFileSync(join(cwd, "src", "ok.ts"), "export function ok() { return call(); }\n");
    writeFileSync(join(cwd, "src", "slow.ts"), "slow();\n");

    const result = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-calls",
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.equal(result.timedOut, true);
    assert.equal(result.repoCalls?.filesScanned, 3);
    assert.equal(result.repoCalls?.filesWithCalls, 1);
    assert.equal(result.repoCalls?.totalEdges, 1);
    assert.equal(result.repoCalls?.failedFiles, 2);
    assert.equal(result.repoCalls?.timedOutFiles, 1);
    assert.equal(result.repoCalls?.omittedFiles, 2);
    assert.ok(result.repoCalls?.warnings.includes("some files could not be parsed by tree-sitter; omissions list includes file-level failures"));
    assert.ok(result.repoCalls?.omissions.some((omission) =>
      omission.path === "src/bad.ts" &&
      omission.reason === "tree-sitter parse failed"));
    assert.ok(result.repoCalls?.omissions.some((omission) =>
      omission.path === "src/slow.ts" &&
      omission.reason === "tree-sitter parse timed out"));

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter repo calls/);
    assert.match(rendered, /omitted_files: 2/);
    assert.match(rendered, /path="src\/bad\.ts" reason="tree-sitter parse failed"/);
    assert.match(rendered, /path="src\/slow\.ts" reason="tree-sitter parse timed out"/);
    assert.match(rendered, /src\/bad\.ts: tree-sitter parse failed: parse failed/);
    assert.match(rendered, /src\/slow\.ts: tree-sitter parse timed out: slow parse/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter repo calls reports truncated parse output", () => {
  const cwd = createTempDir();
  const runner: TreeSitterRunner = (command, args) => {
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    return {
      status: 0,
      signal: null,
      stdout: [
        "(program [0, 0] - [2, 0]",
        "  (export_statement [0, 0] - [0, 41]",
        "    declaration: (function_declaration [0, 7] - [0, 41]",
        "      name: (identifier [0, 16] - [0, 18])",
        "      body: (statement_block [0, 21] - [0, 41]",
        "        (return_statement [0, 23] - [0, 39]",
        "          (call_expression [0, 30] - [0, 38]",
        "            function: (identifier [0, 30] - [0, 34]))))))",
        "  (comment [1, 0] - [1, 120])",
        "",
      ].join("\n"),
      stderr: "",
    };
  };

  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(join(cwd, "src", "ok.ts"), "export function ok() { return call(); }\n");

    const result = runCodeTreeSitter({
      cwd,
      targetPath: "src",
      mode: "repo-calls",
      maxBytes: 96,
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.repoCalls?.filesScanned, 1);
    assert.equal(result.repoCalls?.truncated, true);
    assert.ok(result.repoCalls?.omissions.some((omission) =>
      omission.path === "src/ok.ts" &&
      omission.reason === "AST call edges exceeded per-file bounds"));

    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /calls: \d+ \(truncated\)/);
    assert.match(rendered, /path="src\/ok\.ts" reason="AST call edges exceeded per-file bounds"/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter call extraction avoids anonymous nested caller and callee overclaims", () => {
  const cwd = createTempDir();
  const runner: TreeSitterRunner = (command, args) => {
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    return {
      status: 0,
      signal: null,
      stdout: [
        "(program [0, 0] - [2, 0]",
        "  (lexical_declaration [0, 0] - [0, 58]",
        "    (variable_declarator [0, 6] - [0, 55]",
        "      name: (identifier [0, 6] - [0, 11])",
        "      value: (arrow_function [0, 14] - [0, 55]",
        "        body: (statement_block [0, 20] - [0, 55]",
        "          (function_declaration [0, 22] - [0, 39]",
        "            name: (identifier [0, 31] - [0, 36]))",
        "          (return_statement [0, 42] - [0, 54]",
        "            (call_expression [0, 49] - [0, 54]",
        "              function: (identifier [0, 49] - [0, 52]))))))",
        "  (expression_statement [1, 0] - [1, 16]",
        "    (call_expression [1, 0] - [1, 14]",
        "      function: (parenthesized_expression [1, 0] - [1, 12]",
        "        (arrow_function [1, 1] - [1, 11]",
        "          body: (call_expression [1, 7] - [1, 12]",
        "            function: (identifier [1, 7] - [1, 10]))))))",
        "",
      ].join("\n"),
      stderr: "",
    };
  };

  try {
    writeFileSync(
      join(cwd, "example.ts"),
      [
        "const outer = () => { function inner() {} return foo(); };",
        "(() => foo())();",
        "",
      ].join("\n"),
    );

    const parsed = parseCodeTreeSitterArgs(["calls", "example.ts"]);
    if (!parsed.ok) {
      assert.fail(parsed.message);
    }
    const result = runCodeTreeSitter({
      ...parsed.args,
      cwd,
      runner,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.calls?.edges.map((edge) => `${edge.caller?.name ?? "[top-level]"}:${edge.callee ?? "[unknown]"}:${edge.line}:${edge.column}`),
      [
        "outer:foo:1:50",
        "[top-level]:[unknown]:2:1",
        "[top-level]:foo:2:8",
      ],
    );
    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /caller="outer" caller_kind="variable_declarator" caller_line=1 callee="foo" line=1 column=50/);
    assert.doesNotMatch(rendered, /caller="inner"/);
    assert.doesNotMatch(rendered, /caller="\[top-level\]".*callee="foo" line=2 column=1/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tree-sitter import extraction renders single-file import-like edges", () => {
  const cwd = createTempDir();
  const runner: TreeSitterRunner = (command, args) => {
    if (args.includes("--version")) {
      return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
    }
    return {
      status: 0,
      signal: null,
      stdout: [
        "(program [0, 0] - [7, 0]",
        "  (import_statement [0, 0] - [0, 23]",
        "    source: (string [0, 7] - [0, 22]",
        "      (string_fragment [0, 8] - [0, 21])))",
        "  (import_statement [1, 0] - [1, 36]",
        "    source: (string [1, 24] - [1, 35]",
        "      (string_fragment [1, 25] - [1, 34])))",
        "  (export_statement [2, 0] - [2, 34]",
        "    source: (string [2, 23] - [2, 33]",
        "      (string_fragment [2, 24] - [2, 32])))",
        "  (lexical_declaration [3, 0] - [3, 30]",
        "    (variable_declarator [3, 6] - [3, 29]",
        "      name: (identifier [3, 6] - [3, 8])",
        "      value: (call_expression [3, 11] - [3, 29]",
        "        function: (identifier [3, 11] - [3, 18])",
        "        arguments: (arguments [3, 18] - [3, 29]",
        "          (string [3, 19] - [3, 28]",
        "            (string_fragment [3, 20] - [3, 27]))))))",
        "  (lexical_declaration [4, 0] - [4, 38]",
        "    (variable_declarator [4, 6] - [4, 37]",
        "      name: (identifier [4, 6] - [4, 9])",
        "      value: (await_expression [4, 12] - [4, 37]",
        "        (call_expression [4, 18] - [4, 37]",
        "          function: (import [4, 18] - [4, 24])",
        "          arguments: (arguments [4, 24] - [4, 37]",
        "            (string [4, 25] - [4, 36]",
        "              (string_fragment [4, 26] - [4, 35])))))))",
        "  (lexical_declaration [5, 0] - [5, 51]",
        "    (variable_declarator [5, 6] - [5, 50]",
        "      name: (identifier [5, 6] - [5, 12])",
        "      value: (call_expression [5, 15] - [5, 50]",
        "        function: (identifier [5, 15] - [5, 22])",
        "        arguments: (arguments [5, 22] - [5, 50]",
        "          (call_expression [5, 23] - [5, 49]",
        "            function: (identifier [5, 23] - [5, 34])",
        "            arguments: (arguments [5, 34] - [5, 49]",
        "              (string [5, 35] - [5, 48]",
        "                (string_fragment [5, 36] - [5, 47]))))))))",
        "  (lexical_declaration [6, 0] - [6, 49]",
        "    (variable_declarator [6, 6] - [6, 48]",
        "      name: (identifier [6, 6] - [6, 10])",
        "      value: (await_expression [6, 13] - [6, 48]",
        "        (call_expression [6, 19] - [6, 48]",
        "          function: (import [6, 19] - [6, 25])",
        "          arguments: (arguments [6, 25] - [6, 48]",
        "            (call_expression [6, 26] - [6, 47]",
        "              function: (identifier [6, 26] - [6, 33])",
        "              arguments: (arguments [6, 33] - [6, 47]",
        "                (string [6, 34] - [6, 46]",
        "                  (string_fragment [6, 35] - [6, 45])))))))))",
        "",
      ].join("\n"),
      stderr: "",
    };
  };

  try {
    writeFileSync(
      join(cwd, "example.ts"),
      [
        "import \"./side-effect\";",
        "import { feature } from \"./feature\";",
        "export { helper } from \"./helper\";",
        "const fs = require(\"node:fs\");",
        "const mod = await import(\"./dynamic\");",
        "const tricky = require(resolveName(\"./not-literal\"));",
        "const lazy = await import(getName(\"./also-not\"));",
        "",
      ].join("\n"),
    );

    const parsed = parseCodeTreeSitterArgs(["imports", "example.ts"]);
    if (!parsed.ok) {
      assert.fail(parsed.message);
    }
    const result = runCodeTreeSitter({
      ...parsed.args,
      cwd,
      runner,
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, "imports");
    assert.deepEqual(
      result.imports?.edges.map((edge) => `${edge.kind}:${edge.source}:${edge.line}:${edge.column}`),
      [
        "import:./side-effect:1:1",
        "import:./feature:2:1",
        "reexport:./helper:3:1",
        "require:node:fs:4:12",
        "dynamic_import:./dynamic:5:19",
      ],
    );
    const rendered = renderCodeTreeSitterResult(result);
    assert.match(rendered, /Code tree-sitter imports/);
    assert.match(rendered, /AST-backed local single-file import extraction/);
    assert.match(rendered, /kind="import" source="\.\/feature" line=2 column=1/);
    assert.match(rendered, /kind="reexport" source="\.\/helper" line=3 column=1/);
    assert.match(rendered, /kind="require" source="node:fs" line=4 column=12/);
    assert.match(rendered, /kind="dynamic_import" source="\.\/dynamic" line=5 column=19/);
    assert.doesNotMatch(rendered, /not-literal/);
    assert.doesNotMatch(rendered, /also-not/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "orx-code-map-"));
}
