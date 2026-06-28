import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";

export interface CodeMapOptions {
  cwd?: string;
  targetPath?: string;
  maxFiles?: number;
  maxEntries?: number;
  maxDepth?: number;
  maxSourceBytes?: number;
}

export interface CodeMap {
  root: string;
  scannedFiles: number;
  sourceFiles: CodeMapSourceFile[];
  languageCounts: CodeMapLanguageCount[];
  keyFiles: string[];
  entrypoints: CodeMapEntrypoint[];
  omissions: CodeMapOmission[];
  truncated: boolean;
}

export interface CodeMapLanguageCount {
  language: string;
  files: number;
}

export interface CodeMapSourceFile {
  path: string;
  language: string;
  bytes: number;
  exports: string[];
  imports: string[];
}

export interface CodeMapEntrypoint {
  kind: "package" | "script" | "config" | "source";
  label: string;
  path: string;
}

export interface CodeMapOmission {
  path?: string;
  reason: string;
}

const DEFAULT_MAX_FILES = 160;
const DEFAULT_MAX_ENTRIES = 8192;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_SOURCE_BYTES = 512 * 1024;
const MAX_SYMBOLS_PER_FILE = 24;
const MAX_IMPORTS_PER_FILE = 24;
const MAX_RENDERED_SOURCE_FILES = 24;
const MAX_RENDERED_IMPORTS = 8;
const MAX_RENDERED_SYMBOLS = 10;
const MAX_RENDERED_OMISSIONS = 12;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const EXPORT_DECLARATION_PATTERN =
  /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/g;
const NAMED_EXPORT_PATTERN = /\bexport\s*\{([^}]{1,1000})\}/g;
const DEFAULT_EXPORT_PATTERN = /\bexport\s+default\b/g;
const IMPORT_FROM_PATTERN = /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
const REQUIRE_PATTERN = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
const SINGLE_LINE_EXPORT_START_PATTERN =
  /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum|default)\b/;

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".orx",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
  "dist",
  "build",
  "out",
  "node_modules",
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".cjs": "JavaScript",
  ".cts": "TypeScript",
  ".css": "CSS",
  ".go": "Go",
  ".html": "HTML",
  ".java": "Java",
  ".js": "JavaScript",
  ".jsx": "JavaScript JSX",
  ".json": "JSON",
  ".md": "Markdown",
  ".mjs": "JavaScript",
  ".mts": "TypeScript",
  ".py": "Python",
  ".rs": "Rust",
  ".sh": "Shell",
  ".tsx": "TypeScript TSX",
  ".ts": "TypeScript",
  ".toml": "TOML",
  ".yaml": "YAML",
  ".yml": "YAML",
};

const SOURCE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const KEY_FILE_NAMES = new Set([
  "AGENTS.md",
  "README.md",
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "next.config.js",
  "eslint.config.js",
  "vitest.config.ts",
  "jest.config.js",
  "playwright.config.ts",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
]);

export function createCodeMap(options: CodeMapOptions = {}): CodeMap {
  const cwd = resolve(options.cwd ?? process.cwd());
  const root = resolve(cwd, options.targetPath ?? ".");
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
  const sourceFiles: CodeMapSourceFile[] = [];
  const keyFiles: string[] = [];
  const omissions: CodeMapOmission[] = [];
  const languageCounts = new Map<string, number>();
  let entriesSeen = 0;
  let scannedFiles = 0;
  let truncated = false;

  if (!existsSync(root)) {
    return {
      root,
      scannedFiles: 0,
      sourceFiles: [],
      languageCounts: [],
      keyFiles: [],
      entrypoints: [],
      omissions: [{ path: safeRelativePath(cwd, root), reason: "target path does not exist" }],
      truncated: false,
    };
  }

  const queue: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    let stat;
    try {
      stat = lstatSync(current.path);
    } catch {
      omissions.push({ path: safeRelativePath(root, current.path), reason: "path could not be inspected" });
      continue;
    }

    if (stat.isSymbolicLink()) {
      omissions.push({ path: safeRelativePath(root, current.path), reason: "symbolic link skipped" });
      continue;
    }

    if (stat.isFile()) {
      entriesSeen += 1;
      if (entriesSeen > maxEntries || scannedFiles >= maxFiles) {
        truncated = true;
        break;
      }
      scannedFiles += 1;
      recordFile(current.path, stat.size, {
        root,
        sourceFiles,
        keyFiles,
        languageCounts,
        omissions,
        maxSourceBytes,
      });
      continue;
    }

    if (!stat.isDirectory()) {
      continue;
    }
    if (current.depth > 0 && shouldSkipDirectory(basename(current.path))) {
      continue;
    }
    if (current.depth >= maxDepth) {
      truncated = true;
      continue;
    }

    let entries;
    try {
      entries = readdirSync(current.path, { withFileTypes: true });
    } catch {
      omissions.push({ path: safeRelativePath(root, current.path), reason: "directory could not be read" });
      continue;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      entriesSeen += 1;
      if (entriesSeen > maxEntries) {
        truncated = true;
        break;
      }
      if (entry.isDirectory() && shouldSkipDirectory(entry.name)) {
        continue;
      }
      queue.push({ path: join(current.path, entry.name), depth: current.depth + 1 });
    }
    if (truncated) {
      break;
    }
  }

  const sortedSourceFiles = sourceFiles.sort((left, right) => sortSourceFiles(left, right));
  return {
    root,
    scannedFiles,
    sourceFiles: sortedSourceFiles,
    languageCounts: Array.from(languageCounts.entries())
      .map(([language, files]) => ({ language, files }))
      .sort((left, right) => right.files - left.files || left.language.localeCompare(right.language)),
    keyFiles: keyFiles.sort((left, right) => left.localeCompare(right)),
    entrypoints: discoverEntrypoints(root, sortedSourceFiles, keyFiles),
    omissions,
    truncated,
  };
}

export function renderCodeMap(map: CodeMap): string {
  const lines = [
    "Code Map",
    `  root: ${sanitizeInline(map.root)}`,
    `  scanned_files: ${map.scannedFiles}${map.truncated ? " (truncated)" : ""}`,
    `  source_files: ${map.sourceFiles.length}`,
    "  languages:",
  ];

  if (map.languageCounts.length === 0) {
    lines.push("    - none");
  } else {
    for (const entry of map.languageCounts) {
      lines.push(`    - ${sanitizeInline(entry.language)}: ${entry.files}`);
    }
  }

  lines.push("  key_files:");
  if (map.keyFiles.length === 0) {
    lines.push("    - none");
  } else {
    for (const file of map.keyFiles.slice(0, 20)) {
      lines.push(`    - ${sanitizeInline(file)}`);
    }
  }

  lines.push("  entrypoints:");
  if (map.entrypoints.length === 0) {
    lines.push("    - none");
  } else {
    for (const entrypoint of map.entrypoints.slice(0, 20)) {
      lines.push(
        `    - kind=${entrypoint.kind} label=${JSON.stringify(sanitizeInline(entrypoint.label))} path=${JSON.stringify(sanitizeInline(entrypoint.path))}`,
      );
    }
  }

  lines.push("  source_files:");
  if (map.sourceFiles.length === 0) {
    lines.push("    - none");
  } else {
    for (const file of map.sourceFiles.slice(0, MAX_RENDERED_SOURCE_FILES)) {
      lines.push(
        [
          `    - path=${JSON.stringify(sanitizeInline(file.path))}`,
          `language=${JSON.stringify(sanitizeInline(file.language))}`,
          `bytes=${file.bytes}`,
          formatListField("exports", file.exports, MAX_RENDERED_SYMBOLS),
          formatListField("imports", file.imports, MAX_RENDERED_IMPORTS),
        ].join(" "),
      );
    }
    if (map.sourceFiles.length > MAX_RENDERED_SOURCE_FILES) {
      lines.push(`    - ${map.sourceFiles.length - MAX_RENDERED_SOURCE_FILES} more source files omitted`);
    }
  }

  if (map.omissions.length > 0) {
    lines.push("  omitted:");
    for (const omission of map.omissions.slice(0, MAX_RENDERED_OMISSIONS)) {
      lines.push(
        [
          `    - reason=${JSON.stringify(sanitizeInline(omission.reason))}`,
          omission.path ? `path=${JSON.stringify(sanitizeInline(omission.path))}` : undefined,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    }
    if (map.omissions.length > MAX_RENDERED_OMISSIONS) {
      lines.push(`    - ${map.omissions.length - MAX_RENDERED_OMISSIONS} more omissions omitted`);
    }
  }

  lines.push("  usage: orx code map [path]");
  return lines.join("\n");
}

function recordFile(
  path: string,
  size: number,
  state: {
    root: string;
    sourceFiles: CodeMapSourceFile[];
    keyFiles: string[];
    languageCounts: Map<string, number>;
    omissions: CodeMapOmission[];
    maxSourceBytes: number;
  },
): void {
  const extension = extname(path).toLowerCase();
  const language = LANGUAGE_BY_EXTENSION[extension];
  const relativePath = safeRelativePath(state.root, path);
  if (KEY_FILE_NAMES.has(basename(path))) {
    state.keyFiles.push(relativePath);
  }
  if (language) {
    state.languageCounts.set(language, (state.languageCounts.get(language) ?? 0) + 1);
  }
  if (!SOURCE_EXTENSIONS.has(extension)) {
    return;
  }
  if (size <= 0 || size > state.maxSourceBytes) {
    state.omissions.push({ path: relativePath, reason: "source file size is outside code-map bounds" });
    return;
  }

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    state.omissions.push({ path: relativePath, reason: "source file could not be read" });
    return;
  }

  state.sourceFiles.push({
    path: relativePath,
    language,
    bytes: size,
    exports: extractExports(text),
    imports: extractImports(text),
  });
}

function discoverEntrypoints(
  root: string,
  sourceFiles: CodeMapSourceFile[],
  keyFiles: string[],
): CodeMapEntrypoint[] {
  const entrypoints: CodeMapEntrypoint[] = [];
  const packageJsonPath = join(root, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown;
      if (isPlainObject(parsed)) {
        if (typeof parsed.main === "string") {
          entrypoints.push({ kind: "package", label: "main", path: parsed.main });
        }
        if (typeof parsed.module === "string") {
          entrypoints.push({ kind: "package", label: "module", path: parsed.module });
        }
        if (typeof parsed.bin === "string") {
          entrypoints.push({ kind: "package", label: "bin", path: parsed.bin });
        } else if (isPlainObject(parsed.bin)) {
          for (const [name, pathValue] of Object.entries(parsed.bin).slice(0, 8)) {
            if (typeof pathValue === "string") {
              entrypoints.push({ kind: "package", label: `bin:${name}`, path: pathValue });
            }
          }
        }
        if (isPlainObject(parsed.scripts)) {
          for (const name of ["dev", "start", "build", "test"]) {
            if (typeof parsed.scripts[name] === "string") {
              entrypoints.push({ kind: "script", label: name, path: "package.json" });
            }
          }
        }
      }
    } catch {
      entrypoints.push({ kind: "config", label: "package.json invalid", path: "package.json" });
    }
  }

  for (const keyFile of keyFiles) {
    if (keyFile.endsWith("config.ts") || keyFile.endsWith("config.js") || keyFile === "tsconfig.json") {
      entrypoints.push({ kind: "config", label: basename(keyFile), path: keyFile });
    }
  }

  for (const file of sourceFiles) {
    if (/(^|\/)(index|main|cli|server|app)\.(?:[cm]?[jt]sx?)$/i.test(file.path)) {
      entrypoints.push({ kind: "source", label: basename(file.path), path: file.path });
    }
  }

  return uniqueEntrypoints(entrypoints).slice(0, 32);
}

function extractExports(text: string): string[] {
  const exports = new Set<string>();
  for (const statement of collectKeywordStatements(text, "export")) {
    collectRegexMatches(statement, EXPORT_DECLARATION_PATTERN, exports, MAX_SYMBOLS_PER_FILE);
    for (const match of statement.matchAll(NAMED_EXPORT_PATTERN)) {
      const names = String(match[1] ?? "")
        .split(",")
        .map((entry) => entry.trim().split(/\s+as\s+/i).at(-1)?.trim())
        .filter((entry): entry is string => Boolean(entry && /^[A-Za-z_$][\w$]*$/.test(entry)));
      for (const name of names) {
        exports.add(name);
        if (exports.size >= MAX_SYMBOLS_PER_FILE) {
          return Array.from(exports).sort((left, right) => left.localeCompare(right));
        }
      }
    }
    DEFAULT_EXPORT_PATTERN.lastIndex = 0;
    if (DEFAULT_EXPORT_PATTERN.test(statement)) {
      exports.add("default");
    }
    if (exports.size >= MAX_SYMBOLS_PER_FILE) {
      return Array.from(exports).sort((left, right) => left.localeCompare(right));
    }
  }
  return Array.from(exports).sort((left, right) => left.localeCompare(right));
}

function extractImports(text: string): string[] {
  const imports = new Set<string>();
  for (const statement of collectKeywordStatements(text, "import")) {
    collectRegexMatches(statement, IMPORT_FROM_PATTERN, imports, MAX_IMPORTS_PER_FILE);
    if (imports.size >= MAX_IMPORTS_PER_FILE) {
      return Array.from(imports).sort((left, right) => left.localeCompare(right));
    }
  }

  for (const line of text.split(/\r?\n/)) {
    const statement = line.trim();
    if (!statement || statement.startsWith("//") || statement.startsWith("*")) {
      continue;
    }
    if (statement.includes("require(") && !statement.startsWith("\"") && !statement.startsWith("'")) {
      collectRegexMatches(statement, REQUIRE_PATTERN, imports, MAX_IMPORTS_PER_FILE);
    }
    if (imports.size >= MAX_IMPORTS_PER_FILE) {
      return Array.from(imports).sort((left, right) => left.localeCompare(right));
    }
  }
  return Array.from(imports).sort((left, right) => left.localeCompare(right));
}

function collectKeywordStatements(text: string, keyword: "import" | "export"): string[] {
  const statements: string[] = [];
  let current: string | undefined;
  let lexicalState: "code" | "blockComment" | "template" = "code";
  for (const line of text.split(/\r?\n/)) {
    const stateAtLineStart = lexicalState;
    lexicalState = advanceLexicalState(line, lexicalState);
    if (stateAtLineStart !== "code") {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) {
      continue;
    }

    if (current !== undefined) {
      current = `${current} ${trimmed}`;
      if (trimmed.includes(";")) {
        statements.push(current);
        current = undefined;
      }
      continue;
    }

    if (trimmed.startsWith(`${keyword} `) || trimmed.startsWith(`${keyword}{`)) {
      if (shouldCaptureImmediateStatement(keyword, trimmed)) {
        statements.push(trimmed);
      } else {
        current = trimmed;
      }
    }
  }
  if (current !== undefined) {
    statements.push(current);
  }
  return statements;
}

function shouldCaptureImmediateStatement(keyword: "import" | "export", statement: string): boolean {
  return statement.includes(";") || (keyword === "export" && SINGLE_LINE_EXPORT_START_PATTERN.test(statement));
}

function advanceLexicalState(
  line: string,
  initialState: "code" | "blockComment" | "template",
): "code" | "blockComment" | "template" {
  let state = initialState;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (state === "blockComment") {
      if (char === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }

    if (state === "template") {
      if (char === "\\") {
        index += 1;
      } else if (char === "`") {
        state = "code";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      break;
    }
    if (char === "/" && next === "*") {
      state = "blockComment";
      index += 1;
      continue;
    }
    if (char === "`") {
      state = "template";
      continue;
    }
    if (char === "\"" || char === "'") {
      index = skipQuotedString(line, index, char);
    }
  }
  return state;
}

function skipQuotedString(line: string, startIndex: number, quote: "\"" | "'"): number {
  for (let index = startIndex + 1; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === quote) {
      return index;
    }
  }
  return line.length - 1;
}

function collectRegexMatches(
  text: string,
  pattern: RegExp,
  target: Set<string>,
  limit: number,
): void {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const value = String(match[1] ?? "").trim();
    if (value) {
      target.add(value);
    }
    if (target.size >= limit) {
      return;
    }
  }
}

function formatListField(name: string, values: string[], limit: number): string {
  if (values.length === 0) {
    return `${name}=none`;
  }
  const rendered = values.slice(0, limit).map((value) => sanitizeInline(value));
  const suffix = values.length > limit ? `,+${values.length - limit}` : "";
  return `${name}=${JSON.stringify(rendered.join(",") + suffix)}`;
}

function uniqueEntrypoints(entrypoints: CodeMapEntrypoint[]): CodeMapEntrypoint[] {
  const seen = new Set<string>();
  const unique: CodeMapEntrypoint[] = [];
  for (const entrypoint of entrypoints) {
    const key = `${entrypoint.kind}\0${entrypoint.label}\0${entrypoint.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push({
      kind: entrypoint.kind,
      label: sanitizeInline(entrypoint.label),
      path: sanitizeInline(entrypoint.path),
    });
  }
  return unique;
}

function sortSourceFiles(left: CodeMapSourceFile, right: CodeMapSourceFile): number {
  const leftScore = sourceFileScore(left);
  const rightScore = sourceFileScore(right);
  return rightScore - leftScore || left.path.localeCompare(right.path);
}

function sourceFileScore(file: CodeMapSourceFile): number {
  let score = file.exports.length * 4 + file.imports.length;
  if (/(^|\/)(index|main|cli|server|app)\./i.test(file.path)) {
    score += 20;
  }
  if (file.path.includes("/test") || file.path.endsWith(".test.ts") || file.path.endsWith(".test.js")) {
    score -= 10;
  }
  return score;
}

function safeRelativePath(root: string, path: string): string {
  const relativePath = relative(root, path).split(/[\\/]/g).join("/");
  return relativePath || ".";
}

function shouldSkipDirectory(name: string): boolean {
  return SKIPPED_DIRECTORIES.has(name);
}

function sanitizeInline(value: string): string {
  const stripped = value.replace(ANSI_PATTERN, "").replace(CONTROL_CHAR_PATTERN, "");
  const redacted = redactSecrets(stripped);
  const text = typeof redacted === "string" ? redacted : stripped;
  return text.trim().slice(0, 240) || "[redacted]";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
