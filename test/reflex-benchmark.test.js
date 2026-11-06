import test from "node:test";
import assert from "node:assert/strict";
import { compareSamples, parseOptions } from "../scripts/reflex-benchmark.mjs";

test("benchmark requires bounded pairs and an explicit live model", () => {
  assert.throws(() => parseOptions(["--pairs", "0"]), /between 1 and 30/);
  assert.throws(() => parseOptions(["--pairs", "NaN"]), /between 1 and 30/);
  assert.throws(() => parseOptions(["--live"]), /requires --model/);
  assert.throws(() => parseOptions(["--output"]), /Missing value/);
  assert.equal(parseOptions(["--live", "--model", "example", "--pairs", "2"]).pairs, 2);
});

test("benchmark separates measured differences from causal savings and missing tokens", () => {
  const base = { hookProcessMs: [], elapsedMs: 100, orientationOperations: 1, actualReuse: 0,
    injectedFacts: 0, hintBytes: 0, inputTokens: null, outputTokens: null };
  const samples = [{ ...base, mode: "off", toolCalls: 2 }, { ...base, mode: "inject", toolCalls: 0 }];
  assert.equal(compareSamples(samples, false).observedToolCallDifference, null);
  const live = compareSamples(samples, true);
  assert.equal(live.observedToolCallDifference, 2);
  assert.equal(live.estimatedChecksAvoided, null);
  assert.equal(live.off.inputTokens, null);
  assert.equal(live.off.medianHookProcessMs, null);
});
