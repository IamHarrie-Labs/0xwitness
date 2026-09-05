// The receipt is the unit of evidence. One decision in, one receipt out.
// Everything needed to re-derive the decision must live inside it.

export type Kline = [openTime: number, o: string, h: string, l: string, c: string, vol: string];

export interface SymbolSnapshot {
  symbol: string;
  lastPrice: string;
  klines1h: Kline[];        // frozen at capture time, never re-fetched on replay
  fundingRate: string | null;
  bestBid: string;
  bestAsk: string;
}

export interface AccountSnapshot {
  equityUsd: string;
  positions: { symbol: string; qty: string; entryPrice: string; leverage: number }[];
  recentPnl: number[];      // most recent last; drives the losing-streak check
}

export interface Snapshot {
  capturedAt: string;
  source: "live" | "fixture";
  symbols: SymbolSnapshot[];
  account: AccountSnapshot;
}

export interface ProposedOrder {
  action: "trade" | "hold";
  symbol?: string;
  side?: "BUY" | "SELL";
  notionalUsd?: number;
  leverage?: number;
  reasoning: string;
  confidence: number;
}

export interface PolicyCheck { id: string; pass: boolean; detail: string }

export interface Receipt {
  version: 1;
  seq: number;
  prev: string | null;            // hash of receipt seq-1: makes the log append-only
  ts: string;
  agent: { name: string; version: string; charterHash: string };
  snapshot: Snapshot;
  snapshotHash: string;
  decision: {
    model: string;
    temperature: number;
    prompt: string;
    promptHash: string;
    rawOutput: string;
    parsed: ProposedOrder;
  };
  policy: { checks: PolicyCheck[]; verdict: "allow" | "block" };
  outcome: {
    submitted: boolean;
    orderId?: string;
    error?: string;
    note?: string;
  };
  hash: string;                   // sha256 over canonical form of all fields above
  sig: string;                    // ed25519 over hash
}

// Fields excluded from the hash preimage (they are the hash itself).
export const UNHASHED = new Set(["hash", "sig"]);
