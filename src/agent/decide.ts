import type { Snapshot, ProposedOrder } from "../receipt/types.ts";
import type { Charter } from "./policy.ts";
import { sha256 } from "../receipt/canon.ts";

const MODEL = process.env.BLACKBOX_MODEL ?? "claude-sonnet-5";

export interface Decision {
  model: string; temperature: number;
  prompt: string; promptHash: string;
  rawOutput: string; parsed: ProposedOrder;
}

// The prompt is built purely from the frozen snapshot, so it is a deterministic
// function of the receipt. No clock reads, no ambient state, no live fetches.
export function buildPrompt(snap: Snapshot, c: Charter): string {
  const markets = snap.symbols.map((s) => {
    const closes = s.klines1h.map((k) => Number(k[4]));
    const change24h = closes.length >= 24
      ? (((closes.at(-1)! - closes.at(-24)!) / closes.at(-24)!) * 100).toFixed(2) : "n/a";
    return [
      `${s.symbol}: last=${s.lastPrice} bid=${s.bestBid} ask=${s.bestAsk}`,
      `  24h change: ${change24h}%  funding: ${s.fundingRate ?? "n/a"}`,
      `  1h closes (last 12): ${closes.slice(-12).join(", ")}`,
    ].join("\n");
  }).join("\n");

  return [
    "You are a disciplined crypto trading analyst. Propose at most one action.",
    "",
    "CHARTER (hard limits, enforced separately — do not propose violations):",
    `  max notional $${c.maxNotionalUsd}, max leverage ${c.maxLeverage}x`,
    `  allowed symbols: ${c.allowedSymbols.join(", ")}`,
    "",
    "ACCOUNT:",
    `  equity: $${snap.account.equityUsd}`,
    `  open positions: ${snap.account.positions.length}`,
    `  recent trade PnL: ${snap.account.recentPnl.join(", ") || "none"}`,
    "",
    "MARKETS:",
    markets,
    "",
    'Reply with ONLY a JSON object: {"action":"trade"|"hold","symbol":string,',
    '"side":"BUY"|"SELL","notionalUsd":number,"leverage":number,',
    '"reasoning":string,"confidence":number}',
  ].join("\n");
}

export async function decide(snap: Snapshot, c: Charter, offline: boolean): Promise<Decision> {
  const prompt = buildPrompt(snap, c);
  const base = { prompt, promptHash: sha256(prompt), temperature: 0 };

  if (offline || !process.env.ANTHROPIC_API_KEY) {
    const raw = JSON.stringify(offlineModel(snap, c));
    return { ...base, model: "offline-momentum-v1", rawOutput: raw, parsed: JSON.parse(raw) };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 512, temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const rawOutput = (json.content?.[0]?.text ?? "").trim();
  return { ...base, model: MODEL, rawOutput, parsed: parse(rawOutput) };
}

function parse(raw: string): ProposedOrder {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { action: "hold", reasoning: `unparseable model output: ${raw.slice(0, 120)}`, confidence: 0 };
  try { return JSON.parse(m[0]) as ProposedOrder; }
  catch { return { action: "hold", reasoning: "invalid JSON from model", confidence: 0 }; }
}

// A real, if simple, strategy — and bit-for-bit deterministic, which lets the
// whole pipeline (and the replay demo) run with no API key and no network.
function offlineModel(snap: Snapshot, c: Charter): ProposedOrder {
  let best: { symbol: string; mom: number } | null = null;
  for (const s of snap.symbols) {
    if (!c.allowedSymbols.includes(s.symbol)) continue;
    const closes = s.klines1h.map((k) => Number(k[4]));
    if (closes.length < 12) continue;
    const mom = (closes.at(-1)! - closes.at(-12)!) / closes.at(-12)!;
    if (!best || Math.abs(mom) > Math.abs(best.mom)) best = { symbol: s.symbol, mom };
  }
  if (!best || Math.abs(best.mom) < 0.01) {
    return { action: "hold", reasoning: "no symbol showed 12h momentum above the 1% threshold", confidence: 0.5 };
  }
  return {
    action: "trade", symbol: best.symbol, side: best.mom > 0 ? "BUY" : "SELL",
    notionalUsd: Math.min(100, c.maxNotionalUsd), leverage: 1,
    reasoning: `12h momentum on ${best.symbol} is ${(best.mom * 100).toFixed(2)}%, the strongest in the allowed set`,
    confidence: Math.min(0.9, 0.5 + Math.abs(best.mom) * 10),
  };
}
