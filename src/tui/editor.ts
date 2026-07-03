import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface EditorCommandResult {
  code: number | null;
  signal?: NodeJS.Signals | null;
}

export interface EditorCommandRunnerOptions {
  env: NodeJS.ProcessEnv;
  stdio: "inherit";
}

export type EditorCommandRunner = (
  command: string,
  args: string[],
  options: EditorCommandRunnerOptions,
) => Promise<EditorCommandResult>;

export type EditorPromptResult =
  | {
      ok: true;
      content: string;
    }
  | {
      ok: false;
      message: string;
      reason: "empty" | "failed" | "unavailable";
    };

export interface OpenPromptInEditorOptions {
  env?: NodeJS.ProcessEnv;
  runner?: EditorCommandRunner;
}

export async function openPromptInEditor({
  env = process.env,
  runner = runEditorCommand,
}: OpenPromptInEditorOptions = {}): Promise<EditorPromptResult> {
  const editor = resolveEditorCommand(env);
  if (!editor) {
    return {
      ok: false,
      reason: "unavailable",
      message: "Set VISUAL or EDITOR to use Ctrl+G editor prompts.",
    };
  }

  let directory: string | undefined;

  try {
    directory = mkdtempSync(join(resolveTempDirectory(env), "orx-editor-"));
    const filePath = join(directory, "prompt.md");
    writeFileSync(filePath, "", { encoding: "utf8", mode: 0o600 });

    const result = await runner(editor.command, [...editor.args, filePath], {
      env,
      stdio: "inherit",
    });
    if (result.signal) {
      return {
        ok: false,
        reason: "failed",
        message: `Editor was interrupted by ${result.signal}.`,
      };
    }

    if (result.code !== 0) {
      return {
        ok: false,
        reason: "failed",
        message: `Editor exited with code ${result.code ?? 1}.`,
      };
    }

    const content = normalizeEditedPrompt(readFileSync(filePath, "utf8"));
    if (!content.trim()) {
      return {
        ok: false,
        reason: "empty",
        message: "Editor prompt was empty.",
      };
    }

    return {
      ok: true,
      content,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: "failed",
      message: `Editor failed: ${message}`,
    };
  } finally {
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

function resolveEditorCommand(env: NodeJS.ProcessEnv): { command: string; args: string[] } | undefined {
  const commandLine = firstNonEmpty(env.VISUAL, env.EDITOR);
  if (!commandLine) {
    return undefined;
  }

  const parts = splitCommandLine(commandLine);
  const command = parts.shift();
  if (!command) {
    return undefined;
  }

  return {
    command,
    args: parts,
  };
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

function splitCommandLine(commandLine: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let escaped = false;

  for (const character of commandLine.trim()) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (escaped) {
    current += "\\";
  }
  if (current) {
    parts.push(current);
  }

  return parts;
}

function resolveTempDirectory(env: NodeJS.ProcessEnv): string {
  return firstNonEmpty(env.TMPDIR, env.TEMP, env.TMP) ?? tmpdir();
}

function normalizeEditedPrompt(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  while (lines.length > 0 && lines[0].trim().length === 0) {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) {
    lines.pop();
  }

  return lines.join("\n");
}

function runEditorCommand(
  command: string,
  args: string[],
  options: EditorCommandRunnerOptions,
): Promise<EditorCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      stdio: options.stdio,
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code, signal });
    });
  });
}
