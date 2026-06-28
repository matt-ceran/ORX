import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DelegationStateError,
  addOpenRouterDelegate,
  clearController,
  clearDelegates,
  compactDelegationStateForStorage,
  createEmptyDelegationState,
  deleteSavedDelegationTeam,
  findSavedDelegationTeam,
  getDelegationTeamStatusSummary,
  loadDelegationTeamRegistry,
  getDelegationStatusSummary,
  normalizeDelegationState,
  removeDelegate,
  renderDelegates,
  renderDelegationReadinessPlan,
  renderDelegationTeamInspect,
  renderDelegationTeamList,
  renderDelegationTeamUse,
  renderOrchestratorStatus,
  renderSessionlessDelegationRefusal,
  resolveDelegationTeamRegistryPath,
  saveDelegationTeam,
  setOpenRouterController,
  validateDelegateName,
  validateDelegationTeamId,
  validateOpenRouterModel,
} from "./index.js";

test("delegation state renders an inert empty scaffold", () => {
  const state = createEmptyDelegationState();

  assert.equal(
    renderOrchestratorStatus(state),
    [
      "ORX orchestrator scaffold:",
      "controller: none",
      "delegate_count: 0",
      "execution: disabled",
      "delegate_task: unavailable",
      "network_calls: none",
    ].join("\n"),
  );
  assert.equal(
    renderDelegates(state),
    [
      "ORX delegates scaffold:",
      "execution: disabled",
      "delegate_task: unavailable in this scaffold",
      "delegates: 0",
    ].join("\n"),
  );
  assert.deepEqual(getDelegationStatusSummary(state), {
    controller: "none",
    delegateCount: 0,
    executionEnabled: false,
    delegateTaskAvailable: false,
  });

  assert.equal(
    renderDelegationReadinessPlan(state, { surface: "cli" }),
    [
      "ORX delegation readiness:",
      "controller: none",
      "delegate_count: 0",
      "execution: disabled",
      "delegate_task: unavailable",
      "model_exposure: none",
      "network_calls: none",
      "subprocesses: none",
      "state_scope: cli-saved-teams-available",
      "readiness_blockers:",
      "  - delegate_task schema is intentionally not registered",
      "  - delegate execution policy is not designed",
      "  - budget, timeout, and result-truncation controls are not configured",
      "  - credential forwarding and secret-redaction policy is not implemented",
      "  - delegate result persistence and merge semantics are not implemented",
      "  - noninteractive CLI cannot attach a saved team to a live chat session",
    ].join("\n"),
  );
  assert.match(
    renderSessionlessDelegationRefusal("delegate add reviewer openrouter openrouter/auto"),
    /state_changed: no/,
  );
});

test("controller and delegates mutate only local inert state", () => {
  const withController = setOpenRouterController(undefined, "openrouter/fusion");
  const first = addOpenRouterDelegate(withController, "reviewer", "anthropic/claude-sonnet-4.5");
  const second = addOpenRouterDelegate(first.state, "coder", "openrouter/auto");
  const updated = addOpenRouterDelegate(second.state, "coder", "openai/gpt-5.5");

  assert.equal(withController.controller?.model, "openrouter/fusion");
  assert.equal(first.created, true);
  assert.equal(second.created, true);
  assert.equal(updated.created, false);
  assert.deepEqual(
    updated.state.delegates.map((delegate) => `${delegate.name}:${delegate.model}`),
    ["coder:openai/gpt-5.5", "reviewer:anthropic/claude-sonnet-4.5"],
  );
  assert.equal(updated.state.executionEnabled, false);
  assert.match(renderDelegates(updated.state), /delegate_task: unavailable in this scaffold/);

  const removed = removeDelegate(updated.state, "reviewer");
  assert.equal(removed.removed.name, "reviewer");
  assert.deepEqual(removed.state.delegates.map((delegate) => delegate.name), ["coder"]);

  assert.equal(clearController(removed.state).controller, undefined);
  assert.deepEqual(clearDelegates(removed.state).delegates, []);
});

test("delegation validation rejects unsafe names, control characters, and secrets", () => {
  assert.equal(validateDelegateName("worker_1"), "worker_1");
  assert.equal(validateOpenRouterModel("provider/model:v1"), "provider/model:v1");

  assert.throws(
    () => validateDelegateName("../bad"),
    /Delegate name must match \[a-z\]\[a-z0-9_-\]\{0,31\}/,
  );
  assert.throws(
    () => validateDelegateName("bad\u001bname"),
    /control characters/,
  );
  assert.throws(
    () => validateOpenRouterModel("openrouter/auto\u001b[31m"),
    /control characters/,
  );
  assert.throws(
    () => validateOpenRouterModel("provider/sk-or-v1-secret"),
    /secret-like values/,
  );
  assert.throws(
    () => removeDelegate(createEmptyDelegationState(), "missing"),
    (error) => error instanceof DelegationStateError && /Delegate not found/.test(error.message),
  );
});

test("delegation state bounds delegate count for commands and persisted state", () => {
  let state = createEmptyDelegationState();
  for (let index = 0; index < 16; index += 1) {
    state = addOpenRouterDelegate(state, `agent${index}`, "openrouter/auto").state;
  }

  assert.equal(state.delegates.length, 16);
  assert.throws(
    () => addOpenRouterDelegate(state, "agent16", "openrouter/auto"),
    /Delegate limit reached; maximum is 16/,
  );

  const normalized = normalizeDelegationState({
    delegates: Array.from({ length: 40 }, (_unused, index) => ({
      name: `d${String(index).padStart(2, "0")}`,
      provider: "openrouter",
      model: "openrouter/auto",
      execution: "disabled",
    })),
    executionEnabled: true,
  });

  assert.equal(normalized.delegates.length, 16);
  assert.equal(normalized.delegates[0].name, "d00");
  assert.equal(normalized.delegates[15].name, "d15");
  assert.equal(normalized.executionEnabled, false);
});

test("persisted delegation state is sanitized and compacted", () => {
  const normalized = normalizeDelegationState({
    controller: {
      provider: "openrouter",
      model: "openrouter/auto",
      execution: "disabled",
    },
    delegates: [
      {
        name: "unsafe\u001b",
        provider: "openrouter",
        model: "openrouter/fusion",
        execution: "disabled",
      },
      {
        name: "valid",
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4.5",
        execution: "disabled",
      },
      {
        name: "valid",
        provider: "openrouter",
        model: "openai/gpt-5.5",
        execution: "disabled",
      },
      {
        name: "exec",
        provider: "openrouter",
        model: "openai/gpt-5.5",
        execution: "enabled",
      },
    ],
    executionEnabled: true,
  });

  assert.equal(normalized.controller?.model, "openrouter/auto");
  assert.equal(normalized.executionEnabled, false);
  assert.deepEqual(normalized.delegates, [
    {
      name: "valid",
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4.5",
      execution: "disabled",
    },
  ]);
  assert.equal(compactDelegationStateForStorage(createEmptyDelegationState()), undefined);
  assert.deepEqual(compactDelegationStateForStorage(normalized), normalized);
});

test("delegation team registry saves private disabled teams", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-delegation-teams-"));
  const configPath = join(cwd, "delegation", "teams.json");

  try {
    const withController = setOpenRouterController(undefined, "openrouter/fusion");
    const state = addOpenRouterDelegate(
      withController,
      "reviewer",
      "anthropic/claude-sonnet-4.5",
    ).state;

    const saved = saveDelegationTeam("Review-Team", state, {
      configPath,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });

    assert.equal(saved.ok, true);
    assert.equal(saved.team?.id, "review-team");
    assert.equal(saved.team?.delegation.executionEnabled, false);
    assert.equal(saved.team?.delegation.controller?.execution, "disabled");
    assert.equal(saved.team?.delegation.delegates[0].execution, "disabled");
    assert.match(saved.message, /Execution remains disabled/);
    assert.equal(statSync(join(cwd, "delegation")).mode & 0o777, 0o700);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(configPath, "utf8"), /api_key|OPENROUTER_API_KEY/);

    const found = findSavedDelegationTeam("review-team", { configPath });
    assert.ok(found);
    assert.equal(found.delegation.controller?.model, "openrouter/fusion");
    assert.match(renderDelegationTeamList(getDelegationTeamStatusSummary({ configPath })), /saved_teams: 1/);
    assert.match(renderDelegationTeamInspect(found), /delegate_task: unavailable/);
    assert.match(renderDelegationTeamUse(found, { surface: "cli" }), /state_changed: no/);

    const deleted = deleteSavedDelegationTeam("review-team", { configPath });
    assert.equal(deleted.ok, true);
    assert.equal(getDelegationTeamStatusSummary({ configPath }).count, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("delegation team registry sanitizes stored records and bounds count", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-delegation-teams-"));
  const configPath = join(cwd, "teams.json");

  try {
    const teams: Record<string, unknown> = {};
    for (let index = 0; index < 80; index += 1) {
      const id = `team${String(index).padStart(2, "0")}`;
      teams[id] = {
        id,
        delegation: {
          controller: {
            provider: "openrouter",
            model: "openrouter/auto",
            execution: "disabled",
          },
          delegates: [
            {
              name: "valid",
              provider: "openrouter",
              model: "openrouter/fusion",
              execution: "disabled",
            },
            {
              name: "runner",
              provider: "openrouter",
              model: "openrouter/auto",
              execution: "enabled",
            },
          ],
          executionEnabled: true,
        },
        description: "safe metadata",
        createdAt: "2026-06-28T12:00:00.000Z",
        updatedAt: "2026-06-28T12:00:00.000Z",
      };
    }
    teams["bad id"] = {
      id: "bad id",
      delegation: {
        delegates: [],
      },
      createdAt: "2026-06-28T12:00:00.000Z",
      updatedAt: "2026-06-28T12:00:00.000Z",
    };
    writeFileSync(configPath, JSON.stringify({ version: 1, teams }, null, 2));

    const loaded = loadDelegationTeamRegistry({ configPath });
    assert.equal(Object.keys(loaded.teams).length, 64);
    assert.equal(loaded.teams.team00.delegation.executionEnabled, false);
    assert.deepEqual(
      loaded.teams.team00.delegation.delegates.map((delegate) => delegate.name),
      ["valid"],
    );
    assert.equal(loaded.teams.team00.createdAt, "2026-06-28T12:00:00.000Z");
    assert.equal(loaded.teams["bad id"], undefined);
    assert.equal(loaded.teams.team00.description, "safe metadata");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("delegation team registry does not follow symlink paths", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-delegation-team-symlink-"));
  const targetPath = join(cwd, "target.json");
  const configPath = join(cwd, "teams.json");

  try {
    writeFileSync(
      targetPath,
      JSON.stringify({
        version: 1,
        teams: {},
      }),
    );
    chmodSync(targetPath, 0o644);
    symlinkSync(targetPath, configPath);

    assert.deepEqual(loadDelegationTeamRegistry({ configPath }), {
      version: 1,
      teams: {},
    });
    assert.equal(statSync(targetPath).mode & 0o777, 0o644);

    const state = setOpenRouterController(undefined, "openrouter/auto");
    assert.throws(
      () => saveDelegationTeam("safe", state, { configPath }),
      /regular file|ELOOP/,
    );
    assert.equal(statSync(targetPath).mode & 0o777, 0o644);
    assert.equal(readFileSync(targetPath, "utf8"), '{"version":1,"teams":{}}');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("delegation team descriptions strip every control character", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-delegation-team-description-"));
  const configPath = join(cwd, "teams.json");

  try {
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        teams: {
          safe: {
            id: "safe",
            delegation: {
              controller: {
                provider: "openrouter",
                model: "openrouter/auto",
                execution: "disabled",
              },
              delegates: [],
              executionEnabled: false,
            },
            description: "alpha\u001bbeta\u0007gamma",
            createdAt: "2026-06-28T12:00:00.000Z",
            updatedAt: "2026-06-28T12:00:00.000Z",
          },
        },
      }),
    );

    const team = findSavedDelegationTeam("safe", { configPath });
    assert.equal(team?.description, "alpha beta gamma");
    const descriptionLine = renderDelegationTeamInspect(team!)
      .split("\n")
      .find((line) => line.startsWith("description: "));
    assert.equal(descriptionLine, "description: alpha beta gamma");
    assert.doesNotMatch(descriptionLine ?? "", /[\x00-\x1F\x7F-\x9F]/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("saving a new delegation team refuses the registry cap instead of dropping it", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-delegation-team-cap-"));
  const configPath = join(cwd, "teams.json");

  try {
    const state = setOpenRouterController(undefined, "openrouter/auto");
    for (let index = 0; index < 64; index += 1) {
      const saved = saveDelegationTeam(`team${String(index).padStart(2, "0")}`, state, {
        configPath,
        now: () => new Date("2026-06-28T12:00:00.000Z"),
      });
      assert.equal(saved.ok, true);
    }

    const rejected = saveDelegationTeam("team64", state, { configPath });
    assert.equal(rejected.ok, false);
    assert.match(rejected.message, /Delegation team limit reached/);
    assert.equal(findSavedDelegationTeam("team64", { configPath }), undefined);
    assert.equal(getDelegationTeamStatusSummary({ configPath }).count, 64);

    const updated = saveDelegationTeam("team00", state, { configPath });
    assert.equal(updated.ok, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("delegation team ids and paths are sanitized", () => {
  assert.equal(validateDelegationTeamId("Review.Team_1"), "review.team_1");
  assert.throws(() => validateDelegationTeamId("1bad"), /Delegation team id must match/);
  assert.throws(() => validateDelegationTeamId("bad\u001b"), /Delegation team id must match/);
  assert.equal(
    resolveDelegationTeamRegistryPath({
      cwd: "/tmp/work",
      env: {
        ORX_DELEGATION_TEAMS_PATH: "delegation/teams.json",
      },
    }),
    "/tmp/work/delegation/teams.json",
  );
});
