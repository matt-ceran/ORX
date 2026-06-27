import test from "node:test";
import assert from "node:assert/strict";
import { getContextState } from "../agent/index.js";
import {
  emptySessionCostMeterState,
  formatContextUsageMeter,
  formatCreditsUsageMeter,
  formatSessionCostMeter,
  recordSessionTurnCost,
} from "./meters.js";

test("context meter labels local approximate bytes against configured budget", () => {
  const state = getContextState([{ role: "user", content: "hello" }], {
    maxBytes: 1024,
    maxMessages: 8,
  });

  const output = formatContextUsageMeter(state);
  assert.match(output, /^\[[#-]{12}\] \d+\.\d% approx_local_bytes=\d+B\/1024B/);
  assert.match(output, /messages=1\/8/);
  assert.match(output, /compacted=no/);
});

test("cost meter reports only OpenRouter metadata ORX has observed", () => {
  const withCost = recordSessionTurnCost(emptySessionCostMeterState(), {
    requestedModel: "openrouter/auto",
    cost: 0.001,
  });
  const withMissingCost = recordSessionTurnCost(withCost, {
    requestedModel: "openrouter/auto",
  });

  assert.match(formatSessionCostMeter(emptySessionCostMeterState()), /metadata_coverage=n\/a/);
  assert.match(formatSessionCostMeter(withCost), /metadata_coverage=1\/1 turns/);
  assert.match(formatSessionCostMeter(withCost), /latest_turn=\$0\.001000/);
  assert.match(formatSessionCostMeter(withCost), /known_session=\$0\.001000/);
  assert.match(formatSessionCostMeter(withMissingCost), /metadata_coverage=1\/2 turns/);
  assert.match(formatSessionCostMeter(withMissingCost), /latest_turn=n\/a/);
  assert.match(formatSessionCostMeter(withMissingCost), /known_session=\$0\.001000/);
});

test("credits meter uses live OpenRouter credits fields when available", () => {
  const output = formatCreditsUsageMeter({
    totalCredits: 20,
    totalUsage: 5,
    remainingCredits: 15,
    percentUsed: 25,
  });

  assert.match(output, /^\[###---------\] 25\.00%/);
  assert.match(output, /used=\$5\.000000/);
  assert.match(output, /total=\$20\.000000/);
  assert.match(output, /remaining=\$15\.000000/);
});
