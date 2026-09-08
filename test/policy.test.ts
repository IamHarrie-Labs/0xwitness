import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, type Charter } from "../src/agent/policy.ts";
import type { Snapshot, ProposedOrder } from "../src/receipt/types.ts";

const CHARTER: Charter = {
  maxNotionalUsd: 200,
  maxLeverage: 3,
  allowedSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  maxPositionPctOfEquity: 25,
  maxOpenPositions: 3,
  blockAfterConsecutiveLosses: 2,
};

function snap(overrides: Partial<Snapshot["account"]> = {}): Snapshot {
  return {
    capturedAt: "2026-01-01T00:00:00.000Z",
    source: "fixture",
    symbols: [],
    account: { equityUsd: "1000", positions: [], recentPnl: [], ...overrides },
  };
}

function order(overrides: Partial<ProposedOrder> = {}): ProposedOrder {
  return {
    action: "trade", symbol: "BTCUSDT", side: "BUY",
    notionalUsd: 100, leverage: 1, reasoning: "test", confidence: 0.8,
    ...overrides,
  };
}

test("a hold proposal always allows, skipping every other check", () => {
  const { checks, verdict } = evaluate(order({ action: "hold" }), snap(), CHARTER);
  assert.equal(verdict, "allow");
  assert.equal(checks.length, 1);
  assert.equal(checks[0].id, "no-op");
});

test("a fully compliant trade passes all six checks", () => {
  const { checks, verdict } = evaluate(order(), snap({ equityUsd: "1000" }), CHARTER);
  assert.equal(verdict, "allow");
  assert.equal(checks.length, 6);
  assert.ok(checks.every((c) => c.pass));
});

test("symbol-allowed blocks a symbol outside the charter", () => {
  const { checks, verdict } = evaluate(order({ symbol: "DOGEUSDT" }), snap(), CHARTER);
  assert.equal(verdict, "block");
  assert.equal(checks.find((c) => c.id === "symbol-allowed")?.pass, false);
});

test("notional-cap passes exactly at the cap and fails one dollar over", () => {
  const atCap = evaluate(order({ notionalUsd: 200 }), snap(), CHARTER);
  assert.equal(atCap.checks.find((c) => c.id === "notional-cap")?.pass, true);

  const overCap = evaluate(order({ notionalUsd: 200.01 }), snap(), CHARTER);
  assert.equal(overCap.checks.find((c) => c.id === "notional-cap")?.pass, false);
  assert.equal(overCap.verdict, "block");
});

test("leverage-cap passes exactly at the cap and fails just over it", () => {
  const atCap = evaluate(order({ leverage: 3 }), snap(), CHARTER);
  assert.equal(atCap.checks.find((c) => c.id === "leverage-cap")?.pass, true);

  const overCap = evaluate(order({ leverage: 3.01 }), snap(), CHARTER);
  assert.equal(overCap.checks.find((c) => c.id === "leverage-cap")?.pass, false);
});

test("position-pct blocks on zero equity rather than dividing by zero silently", () => {
  const { checks, verdict } = evaluate(order({ notionalUsd: 1 }), snap({ equityUsd: "0" }), CHARTER);
  const check = checks.find((c) => c.id === "position-pct");
  assert.equal(check?.pass, false);
  assert.match(check!.detail, /n\/a/);
  assert.equal(verdict, "block");
});

test("position-pct passes exactly at the cap and fails just over it", () => {
  // $250 of $1000 equity = 25%, exactly the cap
  const atCap = evaluate(order({ notionalUsd: 250 }), snap({ equityUsd: "1000" }), CHARTER);
  assert.equal(atCap.checks.find((c) => c.id === "position-pct")?.pass, true);

  const overCap = evaluate(order({ notionalUsd: 251 }), snap({ equityUsd: "1000" }), CHARTER);
  assert.equal(overCap.checks.find((c) => c.id === "position-pct")?.pass, false);
});

test("open-positions blocks once the book is at the max", () => {
  const threeOpen = snap({
    positions: [
      { symbol: "BTCUSDT", qty: "1", entryPrice: "1", leverage: 1 },
      { symbol: "ETHUSDT", qty: "1", entryPrice: "1", leverage: 1 },
      { symbol: "SOLUSDT", qty: "1", entryPrice: "1", leverage: 1 },
    ],
  });
  const { checks, verdict } = evaluate(order(), threeOpen, CHARTER);
  assert.equal(checks.find((c) => c.id === "open-positions")?.pass, false);
  assert.equal(verdict, "block");
});

test("losing-streak counts only the trailing run of losses, and blocks at the limit", () => {
  // a win breaks the streak: only the last two losses count, not three
  const brokenStreak = evaluate(order(), snap({ recentPnl: [-5, 10, -3, -2] }), CHARTER);
  assert.equal(brokenStreak.checks.find((c) => c.id === "losing-streak")?.pass, false); // 2 trailing losses hits the limit of 2
  assert.equal(brokenStreak.verdict, "block");

  const oneLoss = evaluate(order(), snap({ recentPnl: [10, -3] }), CHARTER);
  assert.equal(oneLoss.checks.find((c) => c.id === "losing-streak")?.pass, true);
});

test("the real live receipt's block is reproducible: zero equity vetoes a $100 SOLUSDT sell", () => {
  // Same shape as the actual production receipt captured 2026-09-08 against
  // live Agent OS: sub-account unfunded, proposal blocked on position-pct.
  const { verdict, checks } = evaluate(
    order({ symbol: "SOLUSDT", side: "SELL", notionalUsd: 100 }),
    snap({ equityUsd: "0" }),
    CHARTER,
  );
  assert.equal(verdict, "block");
  assert.equal(checks.find((c) => c.id === "position-pct")?.pass, false);
  assert.ok(checks.filter((c) => c.id !== "position-pct").every((c) => c.pass));
});
