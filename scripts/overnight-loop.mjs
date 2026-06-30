#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultRunDir = join(repoRoot, ".orx", "overnight", "latest");
const nodeBin = process.execPath;
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const cliPath = join(repoRoot, "dist", "cli.js");
const dashboardRefreshMs = 1000;

const defaultSlices = [
  {
    id: "release-polish",
    title: "Finalize v0.1 packaging and release notes",
    goal:
      "Make the current ORX v0.1 baseline easier to install, verify, and hand off with concise release notes and first-run documentation polish.",
    scope:
      "README, package metadata/scripts, release notes or docs, and local memory only unless a focused code fix is required by dogfooding.",
    acceptance: [
      "The first-run path is clear for source install and global install.",
      "Release notes summarize the current CLI surfaces and known optional work.",
      "`npm run verify:release` remains the final local gate.",
      "Memory files identify the next post-v0.1 optional slices.",
    ],
  },
  {
    id: "structured-test-reports",
    title: "Add structured test report ingestion slice",
    goal:
      "Extend the existing test adapter beyond summary-line parsing where a safe framework-native report file can be requested without weakening execution bounds.",
    scope:
      "src/testing, CLI/slash test rendering, focused docs/memory. Avoid broad runner rewrites.",
    acceptance: [
      "One framework-native structured report path is implemented or a narrow no-op planner is added if implementation is not safe.",
      "Runs remain shell-disabled, bounded, and redacted.",
      "Tests cover success, malformed report input, and fallback behavior.",
    ],
  },
  {
    id: "tree-sitter-code-intelligence",
    title: "Tree-sitter code-intelligence spike",
    goal:
      "Add a bounded syntax-aware code intelligence slice beyond the dependency-free lexical maps, or create a documented implementation spike if dependency/runtime constraints block it.",
    scope:
      "src/code-map and docs/memory. Keep dependency changes explicit and justified.",
    acceptance: [
      "A syntax-aware path is operator-invoked, bounded, and not model-autonomous.",
      "Fallback behavior remains available when optional syntax tooling is absent.",
      "Docs distinguish AST-backed behavior from lexical behavior.",
    ],
  },
  {
    id: "sourcegraph-github-readonly",
    title: "Read-only repo provider profile planning",
    goal:
      "Add the next safest read-only provider profile surface for multi-repo navigation, favoring a planner/catalog shape before write-capable operations.",
    scope:
      "MCP/profile catalog docs, provider presets, and read-only planning surfaces. No write-capable GitHub/GitLab actions.",
    acceptance: [
      "Provider scope and auth requirements are visible before enablement.",
      "Read-only model exposure remains separately grant-gated.",
      "No network call occurs during list/inspect/plan commands.",
    ],
  },
];

const contextRules = [
  "Read memory/00_INDEX.md, memory/01_PROJECT_BRIEF.md, and memory/09_CURRENT_CONTEXT.md first.",
  "Use the retrieval map before opening extra memory files.",
  "Keep ORX OpenRouter-native; do not depend on Codex branding, private prompts, exact assets, or private internals.",
  "Use bounded implementor/verifier slices: implement, verify in a separate context, fix findings, then commit/push only after the runner or operator allows it.",
  "Keep local execution surfaces explicit operator commands unless the existing model-tool boundary already allows them.",
  "Preserve YOLO default permission visibility in status surfaces.",
  "Update memory/09_CURRENT_CONTEXT.md and memory/10_BACKLOG.md after meaningful project work.",
  "Run targeted checks first, then broader checks appropriate to risk; prefer npm run verify:release before release-boundary changes.",
  "Do not revert unrelated user changes.",
];

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? "dashboard";

try {
  if (command === "init") {
    runInit(args);
  } else if (command === "run") {
    await runLoop(args);
  } else if (command === "dashboard") {
    await runDashboard(args);
  } else if (command === "event") {
    runEvent(args);
  } else if (command === "help" || command === "--help" || command === "-h") {
    printUsage();
  } else {
    throw new Error(`Unknown overnight command: ${command}`);
  }
} catch (error) {
  process.exitCode = 1;
  console.error(formatError(error));
}

function printUsage() {
  console.log([
    "Usage: node scripts/overnight-loop.mjs <init|run|dashboard|event> [options]",
    "",
    "Commands:",
    "  init                         create .orx/overnight/latest state and prompts",
    "  run                          run implementor -> local checks -> verifier loop",
    "  dashboard                    render a fixed-screen progress dashboard",
    "  event --message <text>        append a manual progress note",
    "",
    "Options:",
    "  --run-dir <path>              override the run directory",
    "  --reset                       clear an existing run directory before init/run",
    "  --slice <id>                  start with one slice id, repeatable",
    "  --max-slices <n>              max slices for run, default 1",
    "  --implementor-cmd <cmd>       command template for implementor",
    "  --verifier-cmd <cmd>          command template for verifier",
    "  --commit                      commit verified slices",
    "  --push                        push after commit",
    "  --require-clean               pause commit-enabled runs if the worktree starts dirty",
    "  --once                        dashboard: render one frame and exit",
    "",
    "Command templates may use {promptFile}, {runDir}, {sliceId}, and {role}.",
    "If no template is provided, run uses built ORX ask via node dist/cli.js ask <prompt>.",
  ].join("\n"));
}

function runInit(options) {
  const runDir = resolveRunDir(options);
  if (options.reset) {
    resetRunDir(runDir);
  }
  const state = createInitialState(runDir, selectSlices(options));
  writePromptsForState(state);
  saveState(runDir, state);
  appendEvent(runDir, "init", `Initialized overnight run with ${state.slices.length} slice(s).`);
  console.log(`overnight_run_dir=${runDir}`);
  console.log(`dashboard=npm run overnight:dashboard`);
}

async function runLoop(options) {
  const runDir = resolveRunDir(options);
  if (options.reset) {
    resetRunDir(runDir);
  }
  if (options.reset || !existsSync(statePath(runDir))) {
    const state = createInitialState(runDir, selectSlices(options));
    writePromptsForState(state);
    saveState(runDir, state);
    appendEvent(runDir, "init", `Initialized overnight run with ${state.slices.length} slice(s).`);
  }

  let state = loadState(runDir);
  state.status = "running";
  state.options = {
    max_slices: parsePositiveInteger(options["max-slices"], 1),
    commit: Boolean(options.commit),
    push: Boolean(options.push),
    require_clean: Boolean(options["require-clean"]),
    implementor_cmd: options["implementor-cmd"] ?? process.env.ORX_OVERNIGHT_IMPLEMENTOR_CMD ?? "orx-default",
    verifier_cmd: options["verifier-cmd"] ?? process.env.ORX_OVERNIGHT_VERIFIER_CMD ?? "orx-default",
  };
  touchState(runDir, state);

  await ensureBuiltCli(runDir);

  let completed = 0;
  for (const slice of state.slices) {
    if (completed >= state.options.max_slices) {
      break;
    }
    if (slice.status !== "pending") {
      continue;
    }
    completed += 1;
    state = await runSlice(runDir, state, slice, options);
    if (state.status === "failed" || state.status === "paused") {
      break;
    }
  }

  if (!state.slices.some((slice) => slice.status === "pending") && state.status === "running") {
    state.status = "complete";
    appendEvent(runDir, "complete", "All queued slices are complete.");
  } else if (state.status === "running") {
    state.status = "paused";
    appendEvent(runDir, "paused", "Max slice count reached; rerun to continue.");
  }
  touchState(runDir, state);
}

async function runSlice(runDir, state, slice, options) {
  slice.status = "running";
  slice.started_at = now();
  state.current_slice = slice.id;
  state.current_phase = "implementor";

  if (state.options.commit && state.options.require_clean) {
    state.current_phase = "preflight";
    touchState(runDir, state);
    const preflight = await ensureCleanWorkingTree(runDir, slice);
    if (!preflight.ok) {
      state.status = "paused";
      slice.status = "needs_review";
      appendEvent(runDir, "needs_review", `Working tree is dirty before ${slice.id}; review ${relativePath(preflight.logPath)}.`);
      return touchState(runDir, state);
    }
    state.current_phase = "implementor";
  }
  if (state.options.commit) {
    slice.baseline = await captureCommitBaseline();
    appendEvent(
      runDir,
      "commit-baseline",
      `${slice.id} baseline has ${slice.baseline.changed_paths.length} existing changed path(s).`,
    );
  }

  setPhase(slice, "implementor", "running");
  touchState(runDir, state);
  appendEvent(runDir, "implementor", `Starting implementor for ${slice.id}.`);

  const implementor = await runAgentCommand({
    runDir,
    slice,
    role: "implementor",
    options,
    commandTemplate: options["implementor-cmd"] ?? process.env.ORX_OVERNIGHT_IMPLEMENTOR_CMD,
  });
  slice.logs.implementor = implementor.logPath;
  slice.exit_codes.implementor = implementor.exitCode;
  setPhase(slice, "implementor", implementor.exitCode === 0 ? "complete" : "failed");
  touchState(runDir, state);
  if (implementor.exitCode !== 0) {
    state.status = "failed";
    slice.status = "failed";
    appendEvent(runDir, "failed", `Implementor failed for ${slice.id} with exit ${implementor.exitCode}.`);
    return touchState(runDir, state);
  }

  state.current_phase = "local_checks";
  setPhase(slice, "local_checks", "running");
  touchState(runDir, state);
  appendEvent(runDir, "checks", `Running local checks for ${slice.id}.`);
  const checks = await runLocalChecks(runDir, slice);
  slice.logs.local_checks = checks.logPath;
  slice.exit_codes.local_checks = checks.exitCode;
  setPhase(slice, "local_checks", checks.exitCode === 0 ? "complete" : "failed");
  touchState(runDir, state);
  if (checks.exitCode !== 0) {
    state.status = "failed";
    slice.status = "failed";
    appendEvent(runDir, "failed", `Local checks failed for ${slice.id} with exit ${checks.exitCode}.`);
    return touchState(runDir, state);
  }

  state.current_phase = "verifier";
  setPhase(slice, "verifier", "running");
  touchState(runDir, state);
  appendEvent(runDir, "verifier", `Starting verifier for ${slice.id}.`);
  const verifier = await runAgentCommand({
    runDir,
    slice,
    role: "verifier",
    options,
    commandTemplate: options["verifier-cmd"] ?? process.env.ORX_OVERNIGHT_VERIFIER_CMD,
  });
  slice.logs.verifier = verifier.logPath;
  slice.exit_codes.verifier = verifier.exitCode;
  slice.verdict = readVerdict(verifier.logPath);
  setPhase(slice, "verifier", verifier.exitCode === 0 && slice.verdict === "PASS" ? "complete" : "needs_review");
  touchState(runDir, state);

  if (verifier.exitCode !== 0 || slice.verdict !== "PASS") {
    state.status = "paused";
    slice.status = "needs_review";
    appendEvent(
      runDir,
      "needs_review",
      `Verifier did not return VERDICT: PASS for ${slice.id}; review ${relativePath(verifier.logPath)}.`,
    );
    return touchState(runDir, state);
  }

  if (state.options.commit) {
    state.current_phase = "commit";
    setPhase(slice, "commit", "running");
    touchState(runDir, state);
    const commit = await runCommit(runDir, slice, state.options.push);
    slice.logs.commit = commit.logPath;
    slice.exit_codes.commit = commit.exitCode;
    slice.commit = commit.commit;
    setPhase(slice, "commit", commit.exitCode === 0 ? "complete" : "failed");
    if (commit.exitCode !== 0) {
      state.status = "failed";
      slice.status = "failed";
      appendEvent(runDir, "failed", `Commit/push failed for ${slice.id}.`);
      return touchState(runDir, state);
    }
  }

  slice.status = "verified";
  slice.finished_at = now();
  appendEvent(runDir, "verified", `Slice ${slice.id} verified.`);
  return touchState(runDir, state);
}

async function runDashboard(options) {
  const runDir = resolveRunDir(options);
  if (!existsSync(statePath(runDir))) {
    const state = createInitialState(runDir, selectSlices(options));
    writePromptsForState(state);
    saveState(runDir, state);
    appendEvent(runDir, "init", "Initialized dashboard state.");
  }

  if (options.once || !process.stdout.isTTY) {
    console.log(renderDashboardFrame(runDir));
    return;
  }

  let stopped = false;
  const cleanup = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    process.stdout.write("\x1b[?25h\x1b[?1049l");
  };

  process.stdout.write("\x1b[?1049h\x1b[?25l");
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      if (text === "q" || text === "\u0003") {
        cleanup();
        process.exit(0);
      }
    });
  }
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("exit", cleanup);

  while (!stopped) {
    process.stdout.write("\x1b[H\x1b[2J");
    process.stdout.write(renderDashboardFrame(runDir, terminalSize()));
    await sleep(dashboardRefreshMs);
  }
}

function runEvent(options) {
  const runDir = resolveRunDir(options);
  const message = options.message ?? options._.slice(1).join(" ").trim();
  if (!message) {
    throw new Error("event requires --message <text> or trailing text.");
  }
  const state = existsSync(statePath(runDir))
    ? loadState(runDir)
    : createInitialState(runDir, selectSlices(options));
  state.status = state.status === "initialized" ? "running" : state.status;
  touchState(runDir, state);
  appendEvent(runDir, "note", message);
  console.log(`event=${singleLine(message)}`);
}

function createInitialState(runDir, slices) {
  const runId = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "Z");
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  mkdirSync(join(runDir, "prompts"), { recursive: true, mode: 0o700 });
  mkdirSync(join(runDir, "logs"), { recursive: true, mode: 0o700 });
  writeFileSync(runMarkerPath(runDir), "orx overnight run directory\n", { mode: 0o600 });
  return {
    schema_version: 1,
    run_id: runId,
    created_at: now(),
    updated_at: now(),
    repo_root: repoRoot,
    run_dir: runDir,
    status: "initialized",
    current_slice: slices[0]?.id ?? null,
    current_phase: "idle",
    options: {},
    slices: slices.map((slice, index) => ({
      ...slice,
      order: index + 1,
      status: "pending",
      phases: {
        implementor: "pending",
        local_checks: "pending",
        verifier: "pending",
        commit: "pending",
      },
      prompts: {},
      logs: {},
      exit_codes: {},
      verdict: null,
      commit: null,
      baseline: null,
      started_at: null,
      finished_at: null,
    })),
  };
}

function writePromptsForState(state) {
  for (const slice of state.slices) {
    const implementorPrompt = buildPrompt(slice, "implementor");
    const verifierPrompt = buildPrompt(slice, "verifier");
    const implementorPath = join(defaultPromptsDir(state), `${slice.order}-${slice.id}-implementor.md`);
    const verifierPath = join(defaultPromptsDir(state), `${slice.order}-${slice.id}-verifier.md`);
    writeFileSync(implementorPath, `${implementorPrompt}\n`, { mode: 0o600 });
    writeFileSync(verifierPath, `${verifierPrompt}\n`, { mode: 0o600 });
    slice.prompts.implementor = implementorPath;
    slice.prompts.verifier = verifierPath;
  }
}

function buildPrompt(slice, role) {
  if (role === "implementor") {
    return [
      `# ORX Implementor Slice: ${slice.title}`,
      "",
      `Slice id: ${slice.id}`,
      "",
      "## Goal",
      slice.goal,
      "",
      "## Scope",
      slice.scope,
      "",
      "## Context Rules",
      ...contextRules.map((rule) => `- ${rule}`),
      "",
      "## Acceptance Criteria",
      ...slice.acceptance.map((item) => `- ${item}`),
      "",
      "## Work Rules",
      "- You are not alone in the codebase. Do not revert unrelated edits.",
      "- Make a narrow, reviewable patch.",
      "- Do not commit or push; the runner/operator owns commit and push.",
      "- Update README and repo memory only when the implementation reality changes.",
      "- End with changed files, checks run, and known residual risk.",
    ].join("\n");
  }

  return [
    `# ORX Verifier Slice: ${slice.title}`,
    "",
    `Slice id: ${slice.id}`,
    "",
    "You are the independent verifier. Do not edit files. Do not commit. Do not push.",
    "",
    "## Context Rules",
    ...contextRules.map((rule) => `- ${rule}`),
    "",
    "## Verification Focus",
    ...slice.acceptance.map((item) => `- ${item}`),
    "- Inspect the implementation diff, docs, memory, and tests.",
    "- Run focused checks that fit the slice; run broader checks when risk warrants it.",
    "- Report findings by severity with file/line references.",
    "",
    "## Required Final Line",
    "End with exactly one final verdict line:",
    "- `VERDICT: PASS` if there are no blocking findings.",
    "- `VERDICT: FAIL` if fixes are required before commit/push.",
  ].join("\n");
}

async function runAgentCommand({ runDir, slice, role, options, commandTemplate }) {
  const promptFile = slice.prompts[role];
  const promptText = readFileSync(promptFile, "utf8");
  const logPath = join(runDir, "logs", `${slice.order}-${slice.id}-${role}.log`);
  const command = buildAgentCommand({
    role,
    promptFile,
    promptText,
    runDir,
    sliceId: slice.id,
    template: commandTemplate,
  });
  appendEvent(runDir, role, `${role} command: ${formatCommand(command.command, command.args)}`);
  return runCommand(command.command, command.args, {
    cwd: repoRoot,
    input: command.input,
    logPath,
    env: isolatedAgentEnv(runDir, role),
  });
}

function buildAgentCommand({ role, promptFile, promptText, runDir, sliceId, template }) {
  if (!template) {
    return {
      command: nodeBin,
      args: [cliPath, "ask", "--max-tool-iterations", "32", promptText],
    };
  }
  const parts = splitCommandTemplate(template).map((part) => part
    .replaceAll("{promptFile}", promptFile)
    .replaceAll("{runDir}", runDir)
    .replaceAll("{sliceId}", sliceId)
    .replaceAll("{role}", role));
  if (parts.length === 0) {
    throw new Error(`${role} command template is empty`);
  }
  const hasPromptToken = template.includes("{promptFile}");
  return {
    command: parts[0],
    args: parts.slice(1),
    input: hasPromptToken ? undefined : promptText,
  };
}

async function runLocalChecks(runDir, slice) {
  const logPath = join(runDir, "logs", `${slice.order}-${slice.id}-local-checks.log`);
  const commands = [
    [npmBin, ["run", "typecheck"]],
    ["git", ["diff", "--check"]],
  ];
  let combinedExit = 0;
  writeFileSync(logPath, "", { mode: 0o600 });
  for (const [command, args] of commands) {
    appendFileSync(logPath, `$ ${formatCommand(command, args)}\n`);
    const result = await runCommand(command, args, {
      cwd: repoRoot,
      logPath,
      append: true,
      env: localEnv(),
    });
    appendFileSync(logPath, `exit=${result.exitCode}\n\n`);
    if (result.exitCode !== 0) {
      combinedExit = result.exitCode;
      break;
    }
  }
  return { logPath, exitCode: combinedExit };
}

async function runCommit(runDir, slice, push) {
  const logPath = join(runDir, "logs", `${slice.order}-${slice.id}-commit.log`);
  writeFileSync(logPath, "", { mode: 0o600 });
  appendFileSync(logPath, "$ git status --short\n");
  const status = await runCommand("git", ["status", "--short"], {
    cwd: repoRoot,
    logPath,
    append: true,
    env: localEnv(),
  });
  if (status.exitCode !== 0) {
    return { logPath, exitCode: status.exitCode, commit: null };
  }
  if (!status.stdout.trim()) {
    appendFileSync(logPath, "No working tree changes to commit.\n");
    return { logPath, exitCode: 0, commit: null };
  }
  const baselinePaths = new Set(slice.baseline?.changed_paths ?? []);
  const currentPaths = await currentChangedPaths();
  const commitPaths = currentPaths.filter((path) => !baselinePaths.has(path));
  appendFileSync(logPath, `baseline_paths=${baselinePaths.size}\n`);
  appendFileSync(logPath, `new_paths=${commitPaths.length}\n`);
  if (commitPaths.length === 0) {
    appendFileSync(logPath, "No new verified paths to commit; pre-existing changes were left untouched.\n");
    return { logPath, exitCode: 0, commit: null };
  }
  appendFileSync(logPath, `$ git add -- ${commitPaths.map(quoteLogPath).join(" ")}\n`);
  const addResult = await runCommand("git", ["add", "--", ...commitPaths], {
    cwd: repoRoot,
    logPath,
    append: true,
    env: localEnv(),
  });
  if (addResult.exitCode !== 0) {
    return { logPath, exitCode: addResult.exitCode, commit: null };
  }
  const message = `Complete ${slice.title}`;
  appendFileSync(logPath, `$ git commit --only -m ${JSON.stringify(message)} -- ${commitPaths.map(quoteLogPath).join(" ")}\n`);
  const commitResult = await runCommand("git", ["commit", "--only", "-m", message, "--", ...commitPaths], {
    cwd: repoRoot,
    logPath,
    append: true,
    env: localEnv(),
  });
  if (commitResult.exitCode !== 0) {
    return { logPath, exitCode: commitResult.exitCode, commit: null };
  }
  const rev = await captureCommand("git", ["rev-parse", "--short", "HEAD"]);
  if (push) {
    const pushResult = await runCommand("git", ["push", "origin", "main"], {
      cwd: repoRoot,
      logPath,
      append: true,
      env: localEnv(),
    });
    if (pushResult.exitCode !== 0) {
      return { logPath, exitCode: pushResult.exitCode, commit: rev.trim() };
    }
  }
  return { logPath, exitCode: status.exitCode, commit: rev.trim() };
}

async function captureCommitBaseline() {
  return {
    changed_paths: await currentChangedPaths(),
  };
}

async function currentChangedPaths() {
  const tracked = await capturePathList("git", ["diff", "--name-only", "-z", "HEAD", "--"]);
  const untracked = await capturePathList("git", ["ls-files", "--others", "--exclude-standard", "-z"]);
  return [...new Set([...tracked, ...untracked].filter(isSafeRepoPath))].sort();
}

async function capturePathList(command, args) {
  const result = await runCommand(command, args, {
    cwd: repoRoot,
    env: localEnv(),
  });
  if (result.exitCode !== 0) {
    throw new Error(`${formatCommand(command, args)} failed while reading git paths.`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

function resetRunDir(runDir) {
  const resolvedRunDir = resolve(runDir);
  const defaultResolved = resolve(defaultRunDir);
  if (!existsSync(resolvedRunDir)) {
    return;
  }
  if (
    resolvedRunDir === "/"
    || resolvedRunDir === repoRoot
    || resolvedRunDir === dirname(repoRoot)
  ) {
    throw new Error(`Refusing to reset unsafe overnight run directory: ${resolvedRunDir}`);
  }
  if (lstatSync(resolvedRunDir).isSymbolicLink()) {
    throw new Error(`Refusing to reset symlink overnight run directory: ${resolvedRunDir}`);
  }
  if (resolvedRunDir !== defaultResolved && !existsSync(runMarkerPath(resolvedRunDir))) {
    throw new Error(`Refusing to reset unmarked overnight run directory: ${resolvedRunDir}`);
  }
  rmSync(resolvedRunDir, { recursive: true, force: true });
}

async function ensureCleanWorkingTree(runDir, slice) {
  const logPath = join(runDir, "logs", `${slice.order}-${slice.id}-preflight.log`);
  writeFileSync(logPath, "$ git status --short\n", { mode: 0o600 });
  const status = await runCommand("git", ["status", "--short"], {
    cwd: repoRoot,
    logPath,
    append: true,
    env: localEnv(),
  });
  if (status.exitCode !== 0) {
    return { ok: false, logPath };
  }
  return { ok: status.stdout.trim().length === 0, logPath };
}

function runCommand(command, args, options) {
  return new Promise((resolvePromise) => {
    const logPath = options.logPath;
    if (logPath && !options.append) {
      writeFileSync(logPath, "", { mode: 0o600 });
    }
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? localEnv(),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const write = (chunk) => {
      if (logPath) {
        appendFileSync(logPath, chunk);
      }
    };
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      write(text);
    });
    child.stdin.on("error", (error) => {
      if (error.code !== "EPIPE") {
        write(`\nstdin_error: ${error.message}\n`);
      }
    });
    child.on("error", (error) => {
      write(`\nprocess_error: ${error.message}\n`);
      resolvePromise({ exitCode: 127, stdout, stderr: `${stderr}${error.message}`, logPath });
    });
    child.on("close", (code) => {
      resolvePromise({ exitCode: code ?? 1, stdout, stderr, logPath });
    });
    if (options.input) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

async function captureCommand(command, args) {
  const result = await runCommand(command, args, {
    cwd: repoRoot,
    env: localEnv(),
  });
  return result.stdout.trim();
}

async function ensureBuiltCli(runDir) {
  if (existsSync(cliPath)) {
    return;
  }
  appendEvent(runDir, "build", "dist/cli.js missing; running npm run build.");
  const logPath = join(runDir, "logs", "build.log");
  const result = await runCommand(npmBin, ["run", "build"], {
    cwd: repoRoot,
    env: localEnv(),
    logPath,
  });
  if (result.exitCode !== 0) {
    throw new Error(`npm run build failed before overnight run; see ${relativePath(logPath)}.`);
  }
}

function renderDashboardFrame(runDir, size = terminalSize()) {
  const state = existsSync(statePath(runDir)) ? loadState(runDir) : undefined;
  const width = size.columns;
  const frameSize = { columns: width, rows: size.rows };
  const events = readEvents(runDir);
  const lines = [];

  lines.push(pairLine("ORX Overnight Agent Loop", state ? state.status.toUpperCase() : "NO STATE", width));
  lines.push(rule(width));
  if (!state) {
    lines.push(labelLine("Run dir", runDir, width));
    lines.push("No state file yet. Start with: npm run overnight:init");
    return boundFrame(lines, frameSize);
  }

  const doneCount = state.slices.filter((slice) => ["verified", "skipped"].includes(slice.status)).length;
  const current = state.slices.find((slice) => slice.id === state.current_slice) ?? state.slices[0];
  lines.push(pairLine(`Run ${state.run_id}`, `Updated ${formatClock(state.updated_at)}`, width));
  lines.push(pairLine(`Repo ${compactPath(state.repo_root, Math.max(20, width - 20))}`, `Runner ${readRunnerStatus(runDir)}`, width));
  lines.push(pairLine(`Active ${state.current_slice ?? "none"}`, `Phase ${state.current_phase ?? "idle"}`, width));
  lines.push(`Progress ${progressBar(doneCount, state.slices.length, Math.min(24, Math.max(10, width - 18)))} ${doneCount}/${state.slices.length}`);
  lines.push("");

  lines.push(sectionLine("Queue", width));
  for (const slice of state.slices) {
    lines.push(sliceRow(slice, slice.id === state.current_slice, width));
  }

  if (current) {
    lines.push("");
    lines.push(sectionLine("Current", width));
    lines.push(labelLine("Slice", `${current.order}. ${current.id} (${current.status})`, width));
    lines.push(labelLine("Title", current.title, width));
    lines.push(labelLine("Goal", current.goal, width));
    lines.push(labelLine("Started", current.started_at ? formatClock(current.started_at) : "not started", width));
    lines.push(labelLine("Exit", exitSummary(current), width));
    lines.push(labelLine("Verdict", current.verdict ?? "pending", width));
    if (current.commit) {
      lines.push(labelLine("Commit", current.commit, width));
    }

    const logPath = currentLogPath(runDir, current, state.current_phase);
    lines.push(labelLine("Log", logPath ? relativePath(logPath) : "not created yet", width));
    const attention = latestAttention(events);
    if (attention || ["failed", "needs_review", "paused"].includes(state.status)) {
      lines.push("");
      lines.push(sectionLine("Attention", width));
      lines.push(truncate(attention ? `${formatClock(attention.at)} ${attention.kind}: ${attention.message}` : state.status, width));
    }
    const tail = readLogTail(logPath, availableLogTailRows(size.rows, lines.length));
    if (tail.length > 0) {
      lines.push("");
      lines.push(sectionLine("Log Tail", width));
      for (const line of tail) {
        lines.push(truncate(`  ${line}`, width));
      }
    }
  }

  lines.push("");
  lines.push(sectionLine("Recent Events", width));
  if (events.length === 0) {
    lines.push("no events yet");
  } else {
    for (const event of events.slice(-5)) {
      lines.push(truncate(`${formatClock(event.at)} ${padRight(event.kind, 15)} ${event.message}`, width));
    }
  }
  lines.push("");
  lines.push("q quits dashboard | state: .orx/overnight/latest");
  return boundFrame(lines, frameSize);
}

function pairLine(left, right, width) {
  const safeLeft = singleLine(left);
  const safeRight = singleLine(right);
  const gap = width - safeLeft.length - safeRight.length;
  if (gap < 2) {
    return truncate(`${safeLeft} ${safeRight}`, width);
  }
  return `${safeLeft}${" ".repeat(gap)}${safeRight}`;
}

function sectionLine(text, width) {
  const label = ` ${singleLine(text)} `;
  const fill = "-".repeat(Math.max(0, width - label.length));
  return `${label}${fill}`.slice(0, width);
}

function rule(width) {
  return "-".repeat(Math.max(0, width));
}

function labelLine(label, value, width) {
  const prefix = `${padRight(label, 8)} `;
  return `${prefix}${truncate(value, Math.max(10, width - prefix.length))}`;
}

function sliceRow(slice, active, width) {
  const marker = active ? ">" : " ";
  const nameWidth = Math.max(12, width - 42);
  return truncate(
    `${marker} ${String(slice.order).padStart(2)} ${padRight(slice.id, nameWidth)} ${padRight(slice.status, 12)} ${phaseSummary(slice)}`,
    width,
  );
}

function phaseSummary(slice) {
  return [
    ["I", slice.phases.implementor],
    ["C", slice.phases.local_checks],
    ["V", slice.phases.verifier],
    ["G", slice.phases.commit],
  ].map(([label, status]) => `${label}:${phaseMark(status)}`).join(" ");
}

function phaseMark(status) {
  if (status === "complete") return "ok";
  if (status === "running") return "run";
  if (status === "failed") return "fail";
  if (status === "needs_review") return "wait";
  return "--";
}

function exitSummary(slice) {
  const entries = Object.entries(slice.exit_codes ?? {});
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([phase, code]) => `${phase}=${code}`).join(" ");
}

function currentLogPath(runDir, slice, phase) {
  const logs = slice.logs ?? {};
  if (phase && logs[phase]) {
    return logs[phase];
  }
  for (const key of ["commit", "verifier", "local_checks", "implementor"]) {
    if (logs[key]) {
      return logs[key];
    }
  }
  if (!phase || phase === "idle") {
    return null;
  }
  const filenamePhase = phase === "local_checks" ? "local-checks" : phase;
  const candidate = join(runDir, "logs", `${slice.order}-${slice.id}-${filenamePhase}.log`);
  return existsSync(candidate) ? candidate : null;
}

function readLogTail(logPath, maxLines) {
  if (!logPath || maxLines <= 0 || !existsSync(logPath)) {
    return [];
  }
  const text = readFileSync(logPath, "utf8").slice(-12000);
  return text
    .split(/\r?\n/)
    .map((line) => singleLine(line).trimEnd())
    .filter(Boolean)
    .slice(-maxLines);
}

function availableLogTailRows(totalRows, usedRows) {
  const remaining = Math.max(0, totalRows - usedRows - 9);
  return Math.min(8, Math.max(0, remaining));
}

function latestAttention(events) {
  return [...events].reverse().find((event) => ["failed", "needs_review", "paused"].includes(event.kind));
}

function readRunnerStatus(runDir) {
  const exitPath = join(runDir, "runner.exit");
  if (existsSync(exitPath)) {
    return `exit ${truncate(readFileSync(exitPath, "utf8").trim(), 8)}`;
  }
  const pidPath = join(runDir, "runner.pid");
  if (!existsSync(pidPath)) {
    return "not tracked";
  }
  const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return "bad pid";
  }
  try {
    process.kill(pid, 0);
    return `pid ${pid}`;
  } catch {
    return `stopped ${pid}`;
  }
}

function padRight(value, width) {
  return singleLine(value).padEnd(width).slice(0, width);
}

function boundFrame(lines, size) {
  const rows = Math.max(10, size.rows);
  return lines.slice(0, rows - 1).map((line) => truncate(line, size.columns)).join("\n");
}

function progressBar(done, total, width) {
  const safeTotal = Math.max(1, total);
  const filled = Math.round((done / safeTotal) * width);
  return `[${"#".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}]`;
}

function setPhase(slice, phase, status) {
  slice.phases[phase] = status;
}

function readVerdict(logPath) {
  if (!logPath || !existsSync(logPath)) {
    return null;
  }
  const text = readFileSync(logPath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => stripAnsi(line).trim())
    .filter(Boolean);
  const match = /^VERDICT:\s*(PASS|FAIL)$/i.exec(lines.at(-1) ?? "");
  return match ? match[1].toUpperCase() : null;
}

function selectSlices(options) {
  const selected = asArray(options.slice);
  if (selected.length === 0) {
    return defaultSlices;
  }
  return selected.map((id) => {
    const slice = defaultSlices.find((candidate) => candidate.id === id);
    if (!slice) {
      throw new Error(`Unknown slice id: ${id}. Available: ${defaultSlices.map((item) => item.id).join(", ")}`);
    }
    return slice;
  });
}

function saveState(runDir, state) {
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  state.updated_at = now();
  const path = statePath(runDir);
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

function touchState(runDir, state) {
  saveState(runDir, state);
  return state;
}

function loadState(runDir) {
  return JSON.parse(readFileSync(statePath(runDir), "utf8"));
}

function appendEvent(runDir, kind, message) {
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  appendFileSync(
    eventsPath(runDir),
    `${JSON.stringify({ at: now(), kind: singleLine(kind), message: singleLine(message) })}\n`,
    { mode: 0o600 },
  );
}

function readEvents(runDir) {
  if (!existsSync(eventsPath(runDir))) {
    return [];
  }
  return readFileSync(eventsPath(runDir), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { at: "unknown", kind: "malformed", message: line.slice(0, 200) };
      }
    });
}

function resolveRunDir(options) {
  return resolve(options["run-dir"] ?? process.env.ORX_OVERNIGHT_RUN_DIR ?? defaultRunDir);
}

function statePath(runDir) {
  return join(runDir, "state.json");
}

function eventsPath(runDir) {
  return join(runDir, "events.jsonl");
}

function runMarkerPath(runDir) {
  return join(runDir, ".orx-overnight-run");
}

function defaultPromptsDir(state) {
  return join(state.run_dir ?? join(state.repo_root, ".orx", "overnight", "latest"), "prompts");
}

function isolatedAgentEnv(runDir, role) {
  return {
    ...localEnv(),
    ORX_SESSION_DIR: join(runDir, "sessions", role),
    ORX_CHAT_HISTORY_PATH: join(runDir, `${role}-history.json`),
  };
}

function localEnv() {
  return {
    ...process.env,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
  };
}

function parseArgs(rawArgs) {
  const parsed = { _: [] };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--") {
      parsed._.push(...rawArgs.slice(index + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const key = arg.slice(2, eq === -1 ? undefined : eq);
    if (eq !== -1) {
      assignArg(parsed, key, arg.slice(eq + 1));
      continue;
    }
    const next = rawArgs[index + 1];
    if (next && !next.startsWith("--")) {
      assignArg(parsed, key, next);
      index += 1;
    } else {
      assignArg(parsed, key, true);
    }
  }
  return parsed;
}

function assignArg(target, key, value) {
  if (target[key] === undefined) {
    target[key] = value;
  } else if (Array.isArray(target[key])) {
    target[key].push(value);
  } else {
    target[key] = [target[key], value];
  }
}

function splitCommandTemplate(value) {
  const parts = [];
  let current = "";
  let quote;
  let escaping = false;
  for (const char of value.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) {
    throw new Error("Unterminated quote in command template.");
  }
  if (escaping) {
    current += "\\";
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function asArray(value) {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function terminalSize() {
  const requestedColumns = Number.parseInt(process.env.ORX_DASHBOARD_COLUMNS ?? "", 10);
  const requestedRows = Number.parseInt(process.env.ORX_DASHBOARD_ROWS ?? "", 10);
  return {
    columns: clampNumber(requestedColumns, 60, 120, Math.min(process.stdout.columns || 80, 80)),
    rows: clampNumber(requestedRows, 18, 80, process.stdout.rows || 32),
  };
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

function truncate(value, width) {
  const safeWidth = Math.max(10, width);
  const text = singleLine(value);
  return text.length <= safeWidth ? text : `${text.slice(0, safeWidth - 3)}...`;
}

function singleLine(value) {
  return stripAnsi(String(value)).replace(/[\x00-\x1F\x7F]/g, " ");
}

function stripAnsi(value) {
  return String(value).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function isSafeRepoPath(value) {
  const text = String(value);
  return text.length > 0
    && !text.startsWith("/")
    && !text.split(/[\\/]+/).includes("..")
    && !/[\x00-\x1F\x7F]/.test(text);
}

function quoteLogPath(path) {
  return JSON.stringify(path);
}

function formatClock(value) {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return truncate(value, 19);
  }
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function compactPath(value, width) {
  const text = singleLine(value);
  if (text.length <= width) {
    return text;
  }
  const tailWidth = Math.max(10, width - 3);
  return `...${text.slice(-tailWidth)}`;
}

function formatCommand(command, args) {
  return [command, ...args].map((part) => (/[\s"]/g.test(part) ? JSON.stringify(part) : part)).join(" ");
}

function relativePath(path) {
  if (!path) {
    return "none";
  }
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
