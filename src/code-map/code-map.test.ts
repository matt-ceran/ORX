import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCodeMap,
  parseCodeAstGrepArgs,
  parseCodeTreeSitterArgs,
  createCodeCallGraph,
  createCodeImportGraph,
  createCodeReferenceIndex,
  createCodeSymbolIndex,
  renderCodeAstGrepResult,
  renderCodeMap,
  renderCodeCallGraph,
  renderCodeImportGraph,
  renderCodeReferences,
  renderCodeSymbols,
  renderCodeTreeSitterResult,
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
