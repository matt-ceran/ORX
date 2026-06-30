import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, extname, join, posix, relative, resolve } from "node:path";
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
  importsTruncated: boolean;
  symbols: CodeMapSymbol[];
}

export interface CodeMapSymbol {
  name: string;
  kind: "export";
  path: string;
  language: string;
  line: number;
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

export interface CodeSymbolIndexOptions extends CodeMapOptions {
  query?: string;
  maxSymbols?: number;
}

export interface CodeSymbolIndex {
  root: string;
  query?: string;
  symbols: CodeMapSymbol[];
  totalSymbols: number;
  omittedSymbols: number;
  omissions: CodeMapOmission[];
  truncated: boolean;
}

export interface CodeReferenceIndexOptions extends CodeMapOptions {
  query?: string;
  maxReferences?: number;
}

export interface CodeReferenceIndex {
  root: string;
  query?: string;
  references: CodeReference[];
  totalReferences: number;
  omittedReferences: number;
  omissions: CodeMapOmission[];
  truncated: boolean;
}

export interface CodeReference {
  query: string;
  path: string;
  language: string;
  line: number;
  column: number;
  excerpt: string;
}

export interface CodeImportGraphOptions extends CodeMapOptions {
  query?: string;
  maxEdges?: number;
}

export interface CodeImportGraph {
  root: string;
  query?: string;
  edges: CodeImportEdge[];
  totalEdges: number;
  omittedEdges: number;
  filesWithImports: number;
  localEdges: number;
  externalImports: number;
  unresolvedLocalImports: number;
  omissions: CodeMapOmission[];
  truncated: boolean;
}

export interface CodeImportEdge {
  from: string;
  to?: string;
  specifier: string;
  kind: "local" | "external" | "unresolved_local";
  language: string;
}

interface ExtractedExportSymbol {
  name: string;
  line: number;
}

interface KeywordStatement {
  text: string;
  line: number;
}

interface ExtractedImports {
  imports: string[];
  truncated: boolean;
}

type LexicalState = "code" | "blockComment" | "template" | "singleQuote" | "doubleQuote";

const DEFAULT_MAX_FILES = 160;
const DEFAULT_MAX_ENTRIES = 8192;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_SOURCE_BYTES = 512 * 1024;
const DEFAULT_MAX_SYMBOL_INDEX_RESULTS = 120;
const DEFAULT_MAX_REFERENCE_INDEX_RESULTS = 120;
const DEFAULT_MAX_IMPORT_GRAPH_EDGES = 160;
const MAX_SYMBOLS_PER_FILE = 24;
const MAX_IMPORTS_PER_FILE = 24;
const MAX_RENDERED_SOURCE_FILES = 24;
const MAX_RENDERED_IMPORTS = 8;
const MAX_RENDERED_SYMBOLS = 10;
const MAX_RENDERED_OMISSIONS = 12;
const MAX_RENDERED_CODE_SYMBOLS = 80;
const MAX_RENDERED_CODE_REFERENCES = 80;
const MAX_RENDERED_IMPORT_GRAPH_EDGES = 100;
const MAX_REFERENCE_EXCERPT_CHARS = 160;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const EXPORT_DECLARATION_PATTERN =
  /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/g;
const NAMED_EXPORT_PATTERN = /\bexport\s*\{([^}]{1,1000})\}/g;
const DEFAULT_EXPORT_PATTERN = /\bexport\s+default\b/g;
const IMPORT_FROM_PATTERN = /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
const EXPORT_FROM_PATTERN = /\bexport\s+(?:type\s+)?(?:\*|\*\s+as\s+[A-Za-z_$][\w$]*|\{[^}]{0,1000}\})\s+from\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
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
const SOURCE_EXTENSION_RESOLUTION_ORDER = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
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

export function createCodeSymbolIndex(options: CodeSymbolIndexOptions = {}): CodeSymbolIndex {
  const map = createCodeMap(options);
  const query = options.query?.trim();
  const normalizedQuery = query?.toLowerCase();
  const maxSymbols = Math.max(0, options.maxSymbols ?? DEFAULT_MAX_SYMBOL_INDEX_RESULTS);
  const symbols = map.sourceFiles
    .flatMap((file) => file.symbols)
    .sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.name.localeCompare(right.name));
  const filteredSymbols = normalizedQuery
    ? symbols.filter((symbol) =>
        symbol.name.toLowerCase().includes(normalizedQuery) ||
        symbol.path.toLowerCase().includes(normalizedQuery) ||
        symbol.language.toLowerCase().includes(normalizedQuery))
    : symbols;
  const renderedSymbols = filteredSymbols.slice(0, maxSymbols);
  return {
    root: map.root,
    query: query || undefined,
    symbols: renderedSymbols,
    totalSymbols: filteredSymbols.length,
    omittedSymbols: Math.max(0, filteredSymbols.length - renderedSymbols.length),
    omissions: map.omissions,
    truncated: map.truncated,
  };
}

export function renderCodeSymbols(index: CodeSymbolIndex): string {
  const lines = [
    "Code Symbols",
    `  root: ${sanitizeInline(index.root)}`,
    `  symbols: ${index.totalSymbols}${index.truncated ? " (scan truncated)" : ""}`,
  ];
  if (index.query) {
    lines.push(`  query: ${JSON.stringify(sanitizeInline(index.query))}`);
  }

  lines.push("  exports:");
  if (index.symbols.length === 0) {
    lines.push("    - none");
  } else {
    for (const symbol of index.symbols.slice(0, MAX_RENDERED_CODE_SYMBOLS)) {
      lines.push(
        [
          `    - name=${JSON.stringify(sanitizeInline(symbol.name))}`,
          `kind=${symbol.kind}`,
          `path=${JSON.stringify(sanitizeInline(symbol.path))}`,
          `line=${symbol.line}`,
          `language=${JSON.stringify(sanitizeInline(symbol.language))}`,
        ].join(" "),
      );
    }
    const renderedCount = Math.min(index.symbols.length, MAX_RENDERED_CODE_SYMBOLS);
    const omitted = Math.max(0, index.totalSymbols - renderedCount);
    if (omitted > 0) {
      lines.push(`    - ${omitted} more symbols omitted`);
    }
  }

  if (index.omissions.length > 0) {
    lines.push("  omitted:");
    for (const omission of index.omissions.slice(0, MAX_RENDERED_OMISSIONS)) {
      lines.push(
        [
          `    - reason=${JSON.stringify(sanitizeInline(omission.reason))}`,
          omission.path ? `path=${JSON.stringify(sanitizeInline(omission.path))}` : undefined,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    }
    if (index.omissions.length > MAX_RENDERED_OMISSIONS) {
      lines.push(`    - ${index.omissions.length - MAX_RENDERED_OMISSIONS} more omissions omitted`);
    }
  }

  lines.push("  usage: orx code symbols [query]");
  return lines.join("\n");
}

export function createCodeReferenceIndex(options: CodeReferenceIndexOptions = {}): CodeReferenceIndex {
  const map = createCodeMap(options);
  const query = options.query?.trim();
  const maxReferences = Math.max(0, options.maxReferences ?? DEFAULT_MAX_REFERENCE_INDEX_RESULTS);
  if (!query) {
    return {
      root: map.root,
      references: [],
      totalReferences: 0,
      omittedReferences: 0,
      omissions: map.omissions,
      truncated: map.truncated,
    };
  }

  const references: CodeReference[] = [];
  for (const file of map.sourceFiles.sort((left, right) => left.path.localeCompare(right.path))) {
    let text;
    try {
      text = readFileSync(join(map.root, file.path), "utf8");
    } catch {
      continue;
    }
    references.push(...extractCodeReferences(text, query, file));
  }

  const sortedReferences = references.sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.column - right.column ||
    left.query.localeCompare(right.query));
  const renderedReferences = sortedReferences.slice(0, maxReferences);
  return {
    root: map.root,
    query,
    references: renderedReferences,
    totalReferences: sortedReferences.length,
    omittedReferences: Math.max(0, sortedReferences.length - renderedReferences.length),
    omissions: map.omissions,
    truncated: map.truncated,
  };
}

export function renderCodeReferences(index: CodeReferenceIndex): string {
  const lines = [
    "Code References",
    `  root: ${sanitizeInline(index.root)}`,
    `  references: ${index.totalReferences}${index.truncated ? " (scan truncated)" : ""}`,
  ];
  if (index.query) {
    lines.push(`  query: ${JSON.stringify(sanitizeInline(index.query))}`);
  } else {
    lines.push("  query: missing");
  }

  lines.push("  matches:");
  if (!index.query) {
    lines.push("    - none");
  } else if (index.references.length === 0) {
    lines.push("    - none");
  } else {
    for (const reference of index.references.slice(0, MAX_RENDERED_CODE_REFERENCES)) {
      lines.push(
        [
          `    - query=${JSON.stringify(sanitizeInline(reference.query))}`,
          `path=${JSON.stringify(sanitizeInline(reference.path))}`,
          `line=${reference.line}`,
          `column=${reference.column}`,
          `language=${JSON.stringify(sanitizeInline(reference.language))}`,
          `excerpt=${JSON.stringify(sanitizeInline(reference.excerpt))}`,
        ].join(" "),
      );
    }
    const renderedCount = Math.min(index.references.length, MAX_RENDERED_CODE_REFERENCES);
    const omitted = Math.max(0, index.totalReferences - renderedCount);
    if (omitted > 0) {
      lines.push(`    - ${omitted} more references omitted`);
    }
  }

  if (index.omissions.length > 0) {
    lines.push("  omitted:");
    for (const omission of index.omissions.slice(0, MAX_RENDERED_OMISSIONS)) {
      lines.push(
        [
          `    - reason=${JSON.stringify(sanitizeInline(omission.reason))}`,
          omission.path ? `path=${JSON.stringify(sanitizeInline(omission.path))}` : undefined,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    }
    if (index.omissions.length > MAX_RENDERED_OMISSIONS) {
      lines.push(`    - ${index.omissions.length - MAX_RENDERED_OMISSIONS} more omissions omitted`);
    }
  }

  lines.push("  usage: orx code refs <query>");
  return lines.join("\n");
}

export function createCodeImportGraph(options: CodeImportGraphOptions = {}): CodeImportGraph {
  const map = createCodeMap(options);
  const query = options.query?.trim();
  const normalizedQuery = query?.toLowerCase();
  const maxEdges = Math.max(0, options.maxEdges ?? DEFAULT_MAX_IMPORT_GRAPH_EDGES);
  const sourcePaths = new Set(map.sourceFiles.map((file) => file.path));
  const edges = map.sourceFiles.flatMap((file) =>
    file.imports.map((specifier): CodeImportEdge => {
      const resolved = resolveLocalImport(file.path, specifier, sourcePaths);
      if (resolved) {
        return {
          from: file.path,
          to: resolved,
          specifier,
          kind: "local",
          language: file.language,
        };
      }
      return {
        from: file.path,
        specifier,
        kind: isRelativeImport(specifier) ? "unresolved_local" : "external",
        language: file.language,
      };
    }),
  );
  const sortedEdges = edges.sort((left, right) =>
    left.from.localeCompare(right.from) ||
    left.kind.localeCompare(right.kind) ||
    left.specifier.localeCompare(right.specifier) ||
    (left.to ?? "").localeCompare(right.to ?? ""));
  const filteredEdges = normalizedQuery
    ? sortedEdges.filter((edge) =>
        edge.from.toLowerCase().includes(normalizedQuery) ||
        (edge.to ?? "").toLowerCase().includes(normalizedQuery) ||
        edge.specifier.toLowerCase().includes(normalizedQuery) ||
        edge.kind.toLowerCase().includes(normalizedQuery) ||
        edge.language.toLowerCase().includes(normalizedQuery))
    : sortedEdges;
  const renderedEdges = filteredEdges.slice(0, maxEdges);

  return {
    root: map.root,
    query: query || undefined,
    edges: renderedEdges,
    totalEdges: filteredEdges.length,
    omittedEdges: Math.max(0, filteredEdges.length - renderedEdges.length),
    filesWithImports: new Set(filteredEdges.map((edge) => edge.from)).size,
    localEdges: filteredEdges.filter((edge) => edge.kind === "local").length,
    externalImports: filteredEdges.filter((edge) => edge.kind === "external").length,
    unresolvedLocalImports: filteredEdges.filter((edge) => edge.kind === "unresolved_local").length,
    omissions: map.omissions,
    truncated: map.truncated || map.sourceFiles.some((file) => file.importsTruncated),
  };
}

export function renderCodeImportGraph(graph: CodeImportGraph): string {
  const lines = [
    "Code Import Graph",
    `  root: ${sanitizeInline(graph.root)}`,
    `  imports: ${graph.totalEdges}${graph.truncated ? " (truncated)" : ""}`,
  ];
  if (graph.query) {
    lines.push(`  query: ${JSON.stringify(sanitizeInline(graph.query))}`);
  }

  lines.push("  summary:");
  lines.push(`    files_with_imports: ${graph.filesWithImports}`);
  lines.push(`    local_edges: ${graph.localEdges}`);
  lines.push(`    external_imports: ${graph.externalImports}`);
  lines.push(`    unresolved_local_imports: ${graph.unresolvedLocalImports}`);

  lines.push("  edges:");
  if (graph.edges.length === 0) {
    lines.push("    - none");
  } else {
    for (const edge of graph.edges.slice(0, MAX_RENDERED_IMPORT_GRAPH_EDGES)) {
      lines.push(
        [
          `    - from=${JSON.stringify(sanitizeInline(edge.from))}`,
          `to=${JSON.stringify(sanitizeInline(edge.to ?? edge.kind))}`,
          `specifier=${JSON.stringify(sanitizeInline(edge.specifier))}`,
          `kind=${edge.kind}`,
          `language=${JSON.stringify(sanitizeInline(edge.language))}`,
        ].join(" "),
      );
    }
    const renderedCount = Math.min(graph.edges.length, MAX_RENDERED_IMPORT_GRAPH_EDGES);
    const omitted = Math.max(0, graph.totalEdges - renderedCount);
    if (omitted > 0) {
      lines.push(`    - ${omitted} more import edges omitted`);
    }
  }

  if (graph.omissions.length > 0) {
    lines.push("  omitted:");
    for (const omission of graph.omissions.slice(0, MAX_RENDERED_OMISSIONS)) {
      lines.push(
        [
          `    - reason=${JSON.stringify(sanitizeInline(omission.reason))}`,
          omission.path ? `path=${JSON.stringify(sanitizeInline(omission.path))}` : undefined,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    }
    if (graph.omissions.length > MAX_RENDERED_OMISSIONS) {
      lines.push(`    - ${graph.omissions.length - MAX_RENDERED_OMISSIONS} more omissions omitted`);
    }
  }

  lines.push("  usage: orx code imports [query]");
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

  const extractedSymbols = extractExportSymbols(text);
  const extractedImports = extractImports(text);
  if (extractedImports.truncated) {
    state.omissions.push({ path: relativePath, reason: "source imports exceeded per-file code-map bounds" });
  }
  state.sourceFiles.push({
    path: relativePath,
    language,
    bytes: size,
    exports: extractedSymbols.map((symbol) => symbol.name).sort((left, right) => left.localeCompare(right)),
    imports: extractedImports.imports,
    importsTruncated: extractedImports.truncated,
    symbols: extractedSymbols.map((symbol) => ({
      name: symbol.name,
      kind: "export",
      path: relativePath,
      language,
      line: symbol.line,
    })),
  });
}

function resolveLocalImport(
  fromPath: string,
  specifier: string,
  sourcePaths: Set<string>,
): string | undefined {
  if (!isRelativeImport(specifier)) {
    return undefined;
  }
  const basePath = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  if (basePath === "." || basePath.startsWith("../") || basePath.includes("/../")) {
    return undefined;
  }
  for (const candidate of buildLocalImportCandidates(basePath)) {
    if (sourcePaths.has(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function buildLocalImportCandidates(basePath: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const addCandidate = (candidate: string): void => {
    const normalized = posix.normalize(candidate);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      candidates.push(normalized);
    }
  };
  const extension = extname(basePath);

  if (extension) {
    addCandidate(basePath);
    const withoutExtension = basePath.slice(0, -extension.length);
    for (const sourceExtension of SOURCE_EXTENSION_RESOLUTION_ORDER) {
      addCandidate(`${withoutExtension}${sourceExtension}`);
    }
  } else {
    addCandidate(basePath);
    for (const sourceExtension of SOURCE_EXTENSION_RESOLUTION_ORDER) {
      addCandidate(`${basePath}${sourceExtension}`);
    }
  }

  for (const sourceExtension of SOURCE_EXTENSION_RESOLUTION_ORDER) {
    addCandidate(posix.join(basePath, `index${sourceExtension}`));
  }

  return candidates;
}

function isRelativeImport(specifier: string): boolean {
  return specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../");
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

function extractExportSymbols(text: string): ExtractedExportSymbol[] {
  const exports = new Set<string>();
  const symbols: ExtractedExportSymbol[] = [];
  const addSymbol = (name: string, line: number): boolean => {
    if (!name || exports.has(name) || !/^[A-Za-z_$][\w$]*$/.test(name)) {
      return false;
    }
    exports.add(name);
    symbols.push({ name, line });
    return exports.size >= MAX_SYMBOLS_PER_FILE;
  };

  for (const statement of collectKeywordStatements(text, "export")) {
    EXPORT_DECLARATION_PATTERN.lastIndex = 0;
    for (const match of statement.text.matchAll(EXPORT_DECLARATION_PATTERN)) {
      if (addSymbol(String(match[1] ?? "").trim(), statement.line)) {
        return sortExtractedSymbols(symbols);
      }
    }
    NAMED_EXPORT_PATTERN.lastIndex = 0;
    for (const match of statement.text.matchAll(NAMED_EXPORT_PATTERN)) {
      const names = String(match[1] ?? "")
        .split(",")
        .map((entry) => entry.trim().split(/\s+as\s+/i).at(-1)?.trim())
        .filter((entry): entry is string => Boolean(entry && /^[A-Za-z_$][\w$]*$/.test(entry)));
      for (const name of names) {
        if (addSymbol(name, statement.line)) {
          return sortExtractedSymbols(symbols);
        }
      }
    }
    DEFAULT_EXPORT_PATTERN.lastIndex = 0;
    if (DEFAULT_EXPORT_PATTERN.test(statement.text) && addSymbol("default", statement.line)) {
      return sortExtractedSymbols(symbols);
    }
  }
  return sortExtractedSymbols(symbols);
}

function extractImports(text: string): ExtractedImports {
  const imports = new Set<string>();
  let truncated = false;
  for (const statement of collectKeywordStatements(text, "import")) {
    truncated = collectRegexMatches(statement.text, IMPORT_FROM_PATTERN, imports, MAX_IMPORTS_PER_FILE) || truncated;
  }

  for (const statement of collectKeywordStatements(text, "export")) {
    truncated = collectRegexMatches(statement.text, EXPORT_FROM_PATTERN, imports, MAX_IMPORTS_PER_FILE) || truncated;
  }

  let lexicalState: LexicalState = "code";
  for (const line of text.split(/\r?\n/)) {
    const stripped = stripNonCodeSegments(line, lexicalState);
    lexicalState = stripped.nextState;
    const statement = line.trim();
    if (!stripped.code.trim() || !statement || statement.startsWith("//") || statement.startsWith("*")) {
      continue;
    }
    if (/\bimport\s*\(/.test(stripped.code)) {
      truncated =
        collectRegexMatchesAtCodePositions(line, stripped.code, DYNAMIC_IMPORT_PATTERN, "import", imports, MAX_IMPORTS_PER_FILE) ||
        truncated;
    }
    if (/\brequire\s*\(/.test(stripped.code)) {
      truncated =
        collectRegexMatchesAtCodePositions(line, stripped.code, REQUIRE_PATTERN, "require", imports, MAX_IMPORTS_PER_FILE) ||
        truncated;
    }
  }
  return {
    imports: Array.from(imports).sort((left, right) => left.localeCompare(right)),
    truncated,
  };
}

function extractCodeReferences(text: string, query: string, file: CodeMapSourceFile): CodeReference[] {
  const references: CodeReference[] = [];
  const matcher = createReferenceMatcher(query);
  let lexicalState: LexicalState = "code";
  let lineNumber = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNumber += 1;
    const stripped = stripNonCodeSegments(line, lexicalState);
    lexicalState = stripped.nextState;
    if (!stripped.code.trim()) {
      continue;
    }
    for (const column of matcher(stripped.code)) {
      references.push({
        query,
        path: file.path,
        language: file.language,
        line: lineNumber,
        column,
        excerpt: line.trim().slice(0, MAX_REFERENCE_EXCERPT_CHARS),
      });
    }
  }
  return references;
}

function createReferenceMatcher(query: string): (line: string) => number[] {
  const isIdentifierQuery = /^[A-Za-z_$][\w$]*$/.test(query);
  if (isIdentifierQuery) {
    return (line: string): number[] => {
      const columns: number[] = [];
      let index = line.indexOf(query);
      while (index !== -1) {
        const before = index > 0 ? line[index - 1] : "";
        const after = line[index + query.length] ?? "";
        if (!/[A-Za-z0-9_$]/.test(before) && !/[A-Za-z0-9_$]/.test(after)) {
          columns.push(index + 1);
        }
        index = line.indexOf(query, index + Math.max(1, query.length));
      }
      return columns;
    };
  }

  const normalizedQuery = query.toLowerCase();
  return (line: string): number[] => {
    const normalizedLine = line.toLowerCase();
    const columns: number[] = [];
    let index = normalizedLine.indexOf(normalizedQuery);
    while (index !== -1) {
      columns.push(index + 1);
      index = normalizedLine.indexOf(normalizedQuery, index + Math.max(1, normalizedQuery.length));
    }
    return columns;
  };
}

function stripNonCodeSegments(
  line: string,
  initialState: LexicalState,
): { code: string; nextState: LexicalState } {
  let state = initialState;
  let code = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (state === "blockComment") {
      code += " ";
      if (char === "*" && next === "/") {
        state = "code";
        code += " ";
        index += 1;
      }
      continue;
    }

    if (state === "singleQuote" || state === "doubleQuote") {
      code += " ";
      const quote = state === "singleQuote" ? "'" : "\"";
      if (char === "\\") {
        if (index === line.length - 1) {
          continue;
        }
        code += " ";
        index += 1;
      } else if (char === quote) {
        state = "code";
      }
      continue;
    }

    if (state === "template") {
      code += " ";
      if (char === "\\") {
        code += " ";
        index += 1;
      } else if (char === "`") {
        state = "code";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      code += " ".repeat(line.length - index);
      break;
    }
    if (char === "/" && next === "*") {
      state = "blockComment";
      code += "  ";
      index += 1;
      continue;
    }
    if (char === "`") {
      state = "template";
      code += " ";
      continue;
    }
    if (char === "\"" || char === "'") {
      const result = skipQuotedStringSegment(line, index, char);
      code += " ".repeat(result.endIndex - index + 1);
      index = result.endIndex;
      if (!result.closed && line.endsWith("\\")) {
        state = char === "'" ? "singleQuote" : "doubleQuote";
      }
      continue;
    }

    code += char;
  }
  return { code, nextState: state };
}

function skipQuotedStringSegment(
  line: string,
  startIndex: number,
  quote: "\"" | "'",
): { endIndex: number; closed: boolean } {
  for (let index = startIndex + 1; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === quote) {
      return { endIndex: index, closed: true };
    }
  }
  return { endIndex: line.length - 1, closed: false };
}

function collectKeywordStatements(text: string, keyword: "import" | "export"): KeywordStatement[] {
  const statements: KeywordStatement[] = [];
  let current: KeywordStatement | undefined;
  let lexicalState: "code" | "blockComment" | "template" = "code";
  let lineNumber = 0;
  for (const line of text.split(/\r?\n/)) {
    lineNumber += 1;
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
      current = { ...current, text: `${current.text} ${trimmed}` };
      if (trimmed.includes(";")) {
        statements.push(current);
        current = undefined;
      }
      continue;
    }

    if (trimmed.startsWith(`${keyword} `) || trimmed.startsWith(`${keyword}{`)) {
      if (shouldCaptureImmediateStatement(keyword, trimmed)) {
        statements.push({ text: trimmed, line: lineNumber });
      } else {
        current = { text: trimmed, line: lineNumber };
      }
    }
  }
  if (current !== undefined) {
    statements.push(current);
  }
  return statements;
}

function sortExtractedSymbols(symbols: ExtractedExportSymbol[]): ExtractedExportSymbol[] {
  return symbols.sort((left, right) => left.name.localeCompare(right.name) || left.line - right.line);
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
): boolean {
  pattern.lastIndex = 0;
  let truncated = false;
  for (const match of text.matchAll(pattern)) {
    const value = String(match[1] ?? "").trim();
    if (value && target.size < limit) {
      target.add(value);
    }
    if (value && target.size >= limit && !target.has(value)) {
      truncated = true;
    }
  }
  return truncated;
}

function collectRegexMatchesAtCodePositions(
  text: string,
  code: string,
  pattern: RegExp,
  token: string,
  target: Set<string>,
  limit: number,
): boolean {
  pattern.lastIndex = 0;
  let truncated = false;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? -1;
    if (index < 0 || code.slice(index, index + token.length) !== token) {
      continue;
    }
    const value = String(match[1] ?? "").trim();
    if (value && target.size < limit) {
      target.add(value);
    }
    if (value && target.size >= limit && !target.has(value)) {
      truncated = true;
    }
  }
  return truncated;
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
