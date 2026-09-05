import { readFileSync } from "node:fs";
import type { Snapshot, ProposedOrder, PolicyCheck } from "../receipt/types.ts";
import { canonical, sha256 } from "../receipt/canon.ts";

export interface Charter {
  maxNotionalUsd: number;
  maxLeverage: number;
  allowedSymbols: string[];
  maxPositionPctOfEquity: number;
  maxOpenPositions: number;
  blockAfterConsecutiveLosses: number;
}

export function loadCharter(path = "charter.json"): Charter {
  return JSON.parse(readFileSync(path, "utf8")) as Charter;
}

export function charterHash(c: Charter): string {
  return sha256(canonical(c));
}

// Deterministic, non-negotiable, and entirely outside the model's reach.
// The LLM proposes; these checks dispose. Every one of them is reproducible
// from the receipt alone, which is the point.
export function evaluate(order: ProposedOrder, snap: Snapshot, c: Charter): {
  checks: PolicyCheck[]; verdict: "allow" | "block";
} {
  const checks: PolicyCheck[] = [];
  const add = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

  if (order.action === "hold") {
    add("no-op", true, "agent proposed hold");
    return { checks, verdict: "allow" };
  }

  const equity = Number(snap.account.equityUsd);
  const notional = order.notionalUsd ?? 0;
  const leverage = order.leverage ?? 1;
  const losses = trailingLosses(snap.account.recentPnl);

  add("symbol-allowed", c.allowedSymbols.includes(order.symbol ?? ""),
      `${order.symbol} vs allowed [${c.allowedSymbols.join(", ")}]`);
  add("notional-cap", notional <= c.maxNotionalUsd,
      `$${notional} vs cap $${c.maxNotionalUsd}`);
  add("leverage-cap", leverage <= c.maxLeverage,
      `${leverage}x vs cap ${c.maxLeverage}x`);
  add("position-pct", equity > 0 && (notional / equity) * 100 <= c.maxPositionPctOfEquity,
      `${equity > 0 ? ((notional / equity) * 100).toFixed(1) : "n/a"}% vs cap ${c.maxPositionPctOfEquity}%`);
  add("open-positions", snap.account.positions.length < c.maxOpenPositions,
      `${snap.account.positions.length} open vs max ${c.maxOpenPositions}`);
  add("losing-streak", losses < c.blockAfterConsecutiveLosses,
      `${losses} consecutive losses vs limit ${c.blockAfterConsecutiveLosses}`);

  return { checks, verdict: checks.every((k) => k.pass) ? "allow" : "block" };
}

function trailingLosses(pnl: number[]): number {
  let n = 0;
  for (let i = pnl.length - 1; i >= 0 && pnl[i] < 0; i--) n++;
  return n;
}
