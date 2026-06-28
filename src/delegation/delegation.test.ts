import test from "node:test";
import assert from "node:assert/strict";
import {
  DelegationStateError,
  addOpenRouterDelegate,
  clearController,
  clearDelegates,
  compactDelegationStateForStorage,
  createEmptyDelegationState,
  getDelegationStatusSummary,
  normalizeDelegationState,
  removeDelegate,
  renderDelegates,
  renderDelegationReadinessPlan,
  renderOrchestratorStatus,
  renderSessionlessDelegationRefusal,
  setOpenRouterController,
  validateDelegateName,
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
      "state_scope: cli-sessionless-readonly",
      "readiness_blockers:",
      "  - delegate_task schema is intentionally not registered",
      "  - delegate execution policy is not designed",
      "  - budget, timeout, and result-truncation controls are not configured",
      "  - credential forwarding and secret-redaction policy is not implemented",
      "  - delegate result persistence and merge semantics are not implemented",
      "  - noninteractive CLI has no delegation state store",
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
