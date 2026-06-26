import type { OpenRouterToolDefinition } from "../openrouter/types.js";

type JsonSchema = Record<string, unknown>;

const textLimitProperties: Record<string, JsonSchema> = {
  maxBytes: {
    type: "integer",
    minimum: 0,
    description: "Maximum UTF-8 bytes to return.",
  },
  maxLines: {
    type: "integer",
    minimum: 0,
    description: "Maximum lines to return.",
  },
};

export const nativeToolDefinitions: OpenRouterToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file from the current workspace with bounded output.",
      parameters: objectSchema(
        {
          path: {
            type: "string",
            description: "File path to read. Relative paths resolve from the current working directory.",
          },
          ...textLimitProperties,
        },
        ["path"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories under a path, optionally recursively.",
      parameters: objectSchema(
        {
          path: {
            type: "string",
            description: "Directory path to list. Defaults should be expressed as '.'.",
          },
          recursive: {
            type: "boolean",
            description: "Whether to recursively walk child directories.",
          },
          maxDepth: {
            type: "integer",
            minimum: 1,
            description: "Maximum recursive depth when recursive is true.",
          },
          maxEntries: {
            type: "integer",
            minimum: 1,
            description: "Maximum number of entries to return.",
          },
        },
        ["path"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search files for a pattern, using ripgrep when available and a bounded fallback otherwise.",
      parameters: objectSchema(
        {
          pattern: {
            type: "string",
            description: "Regex or literal-compatible pattern to search for.",
          },
          path: {
            type: "string",
            description: "File or directory to search. Defaults should be expressed as '.'.",
          },
          maxMatches: {
            type: "integer",
            minimum: 1,
            description: "Maximum number of matches to return.",
          },
          useRipgrep: {
            type: "boolean",
            description: "Set false to force the built-in fallback search.",
          },
        },
        ["pattern"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "shell",
      description: "Run a local shell command without approval prompts. Use for tests, builds, git, and inspection.",
      parameters: objectSchema(
        {
          command: {
            type: "string",
            description: "Executable or shell command to run.",
          },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Arguments for the command when shell is false.",
          },
          cwd: {
            type: "string",
            description: "Working directory. Relative paths resolve from ORX's current working directory.",
          },
          timeoutMs: {
            type: "integer",
            minimum: 1,
            description: "Timeout in milliseconds.",
          },
          maxBytes: {
            type: "integer",
            minimum: 0,
            description: "Maximum bytes to retain separately for stdout and stderr.",
          },
          shell: {
            type: "boolean",
            description: "Run through the platform shell. Defaults to true when args are omitted.",
          },
        },
        ["command"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "git_diff",
      description: "Show the current working tree diff, optionally scoped to specific paths.",
      parameters: objectSchema({
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Optional path scopes for git diff.",
        },
        maxBytes: {
          type: "integer",
          minimum: 0,
          description: "Maximum UTF-8 bytes of diff output to return.",
        },
      }),
    },
  },
  {
    type: "function",
    function: {
      name: "apply_patch",
      description: "Apply a unified diff or ORX structured patch to files in the workspace.",
      parameters: objectSchema(
        {
          patch: {
            type: "string",
            description: "Patch text to apply. Unified diffs are checked before apply; structured patches are preflighted.",
          },
        },
        ["patch"],
      ),
    },
  },
];

function objectSchema(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
