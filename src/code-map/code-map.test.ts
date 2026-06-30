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
        "      name: (identifier [1, 6] - [1, 11])))",
        "  (class_declaration [2, 0] - [2, 48]",
        "    name: (type_identifier [2, 6] - [2, 13])",
        "    body: (class_body [2, 14] - [2, 48]",
        "      (method_definition [2, 16] - [2, 45]",
        "        name: (property_identifier [2, 16] - [2, 19])))))",
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

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "orx-code-map-"));
}
