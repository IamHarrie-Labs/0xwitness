import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, decide } from "../src/agent/decide.ts";
import { sha256, canonical } from "../src/receipt/canon.ts";
import { makeFixture } from "../src/market/fixture-gen.ts";
import type { Charter } from "../src/agent/policy.ts";

const CHARTER: Charter = {
  maxNotionalUsd: 200,
  maxLeverage: 3,
  allowedSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  maxPositionPctOfEquity: 25,
  maxOpenPositions: 3,
  blockAfterConsecutiveLosses: 2,
};

test("makeFixture(seed) is reproducible from the seed alone", () => {
  const a = makeFixture(42);
  const b = makeFixture(42);
  assert.equal(canonical(a), canonical(b));
});

test("different seeds produce different fixtures", () => {
  const a = makeFixture(1);
  const b = makeFixture(2);
  assert.notEqual(canonical(a), canonical(b));
});

test("buildPrompt() is a pure function of the snapshot: no clock, no ambient state", () => {
  const snap = makeFixture(42);
  const p1 = buildPrompt(snap, CHARTER);
  const p2 = buildPrompt(snap, CHARTER);
  assert.equal(p1, p2);
  assert.equal(sha256(p1), sha256(p2));
});

test("buildPrompt() changes when the charter changes, not just the snapshot", () => {
  const snap = makeFixture(42);
  const p1 = buildPrompt(snap, CHARTER);
  const p2 = buildPrompt(snap, { ...CHARTER, maxNotionalUsd: 500 });
  assert.notEqual(p1, p2);
});

test("offline decide() is bit-for-bit deterministic: same snapshot in, identical decision out", async () => {
  const snap = makeFixture(42);
  const d1 = await decide(snap, CHARTER, true);
  const d2 = await decide(snap, CHARTER, true);
  assert.equal(d1.promptHash, d2.promptHash);
  assert.equal(d1.rawOutput, d2.rawOutput);
  assert.equal(canonical(d1.parsed), canonical(d2.parsed));
  assert.equal(d1.model, "offline-momentum-v1");
});

test("offline decide()'s promptHash actually matches sha256 of its own prompt", async () => {
  const snap = makeFixture(7);
  const d = await decide(snap, CHARTER, true);
  assert.equal(d.promptHash, sha256(d.prompt));
});

test("offline model only ever proposes an allowed symbol or a hold", async () => {
  const snap = makeFixture(99);
  const d = await decide(snap, CHARTER, true);
  if (d.parsed.action === "trade") {
    assert.ok(CHARTER.allowedSymbols.includes(d.parsed.symbol!));
    assert.ok((d.parsed.notionalUsd ?? 0) <= CHARTER.maxNotionalUsd);
  } else {
    assert.equal(d.parsed.action, "hold");
  }
});
