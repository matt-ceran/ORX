import { applyPatchTool } from "./apply-patch.js";
import { gitDiffTool } from "./git-diff.js";
import { listFilesTool } from "./list-files.js";
import { readFileTool } from "./read-file.js";
import { runTestsTool } from "./run-tests.js";
import { searchFilesTool } from "./search-files.js";
import { shellTool } from "./shell.js";

export { applyPatchTool } from "./apply-patch.js";
export type { ApplyPatchOptions, ApplyPatchResult } from "./apply-patch.js";
export { gitDiffTool } from "./git-diff.js";
export type { GitDiffOptions, GitDiffResult } from "./git-diff.js";
export { listFilesTool } from "./list-files.js";
export type { ListedFile, ListFilesOptions, ListFilesResult } from "./list-files.js";
export { readFileTool } from "./read-file.js";
export type { ReadFileOptions, ReadFileResult } from "./read-file.js";
export { runTestsTool } from "./run-tests.js";
export type { RunTestsOptions, RunTestsResult } from "./run-tests.js";
export { searchFilesTool } from "./search-files.js";
export type { SearchFilesOptions, SearchFilesResult, SearchMatch } from "./search-files.js";
export { shellTool } from "./shell.js";
export type { ShellOptions, ShellResult } from "./shell.js";
export {
  DEFAULT_MAX_TEXT_BYTES,
  DEFAULT_MAX_TEXT_LINES,
  truncateText,
} from "./truncation.js";
export type {
  FileType,
  TextTruncation,
  TextTruncationOptions,
  ToolError,
  ToolResult,
  TruncatedText,
} from "./types.js";

export const toolRegistry = {
  read_file: readFileTool,
  list_files: listFilesTool,
  search_files: searchFilesTool,
  run_tests: runTestsTool,
  shell: shellTool,
  git_diff: gitDiffTool,
  apply_patch: applyPatchTool,
} as const;

export type ToolName = keyof typeof toolRegistry;
