import type { Snapshot, ProposedOrder, Kline } from "../receipt/types.ts";
import type { Transport } from "./transport.ts";

// Binance Agent OS MCP endpoint. Agents act inside an isolated Agentic sub-account:
// no withdrawal scope, read-only main account, user funds it manually.
const ENDPOINT = process.env.BINANCE_MCP_URL ?? "https://agent.binance.com/mcp/agentic";

// Verified 2026-09-08 against the live server (protocolVersion 2024-11-05,
// serverInfo "Binance-MCP-Server" v1.1.0) with a real OAuth session — tool
// names, input schemas and response shapes below are observed, not guessed.
// Two things that DON'T match the docs' prose description:
//   - Tool names are dotted (`spot.klines`), not the `{verb}_{product}_{op}`
//     pattern the server's own `initialize` instructions describe.
//   - `tools/list` is paginated (nextCursor); spot/wallet tools are on page 2.
export class LiveTransport implements Transport {
  readonly kind = "live" as const;
  private token: string;
  // Not a TS parameter property (`private token = ...` in the constructor
  // signature) on purpose: Node's --experimental-strip-types only strips
  // types, it doesn't transform that syntax sugar, so it hard-crashes at
  // load time. Plain field + explicit assignment works in strip-only mode.
  constructor(token = process.env.BINANCE_MCP_TOKEN ?? "") {
    this.token = token;
    if (!this.token) throw new Error("BINANCE_MCP_TOKEN not set — run the OAuth flow first");
  }

  private async call(tool: string, args: Record<string, unknown>): Promise<any> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: Date.now(),
        method: "tools/call", params: { name: tool, arguments: args },
      }),
    });
    if (!res.ok) throw new Error(`${tool}: ${res.status} ${await res.text()}`);
    const json = await res.json();
    // Errors land in the top-level JSON-RPC `error` field, not a per-call
    // isError flag — and the message is itself a JSON string from Binance's
    // own error format (e.g. {"code":-1121,"msg":"Invalid symbol."}).
    if (json.error) throw new Error(`${tool}: ${json.error.message ?? JSON.stringify(json.error)}`);
    // Some tools return structuredContent (already-parsed JSON); others only
    // return content[0].text (a JSON string) and no structuredContent at all.
    // Prefer structuredContent, fall back to parsing the text.
    const result = json.result;
    if (result?.structuredContent !== undefined) return result.structuredContent;
    return JSON.parse(result.content[0].text);
  }

  async capture(symbols: string[]): Promise<Snapshot> {
    const perSymbol = await Promise.all(symbols.map(async (symbol) => {
      const [ticker, rawKlines, book] = await Promise.all([
        this.call("spot.tickerPrice", { symbol }),
        this.call("spot.klines", { symbol, interval: "1h", limit: 48 }),
        this.call("spot.depth", { symbol, limit: 5 }),
      ]);
      // Real klines carry 12 fields (open/high/low/close/volume, closeTime,
      // quoteVolume, tradeCount, taker-buy base/quote, ignore); our Kline
      // type only needs the first 6.
      const klines1h = (rawKlines as unknown[][]).map((k) => k.slice(0, 6) as Kline);
      return {
        symbol,
        lastPrice: String(ticker.price),
        klines1h,
        // Spot has no funding rate -- that's a perpetual-futures concept
        // (futures_usds/futures_coin tools). Honest null, not a guess.
        fundingRate: null,
        bestBid: String(book.bids?.[0]?.[0] ?? "0"),
        bestAsk: String(book.asks?.[0]?.[0] ?? "0"),
      };
    }));

    const acct = await this.call("spot.getAccount", { omitZeroBalances: true });
    const balances = (acct.balances ?? []) as { asset: string; free: string; locked: string }[];
    // Spot has no single "equity" field. Approximate it from the USDT
    // balance, since the charter trades USDT-quoted pairs -- this is a
    // stated simplification, not a claim of exact portfolio value.
    const usdt = balances.find((b) => b.asset === "USDT");
    const equityUsd = usdt ? String(Number(usdt.free) + Number(usdt.locked)) : "0";
    // Spot balances ARE the positions (no leverage, no separate entry price
    // the way futures reports one). leverage is always 1; entryPrice is
    // unknown without pulling trade history, so it's left null.
    const positions = balances
      .filter((b) => b.asset !== "USDT" && (Number(b.free) + Number(b.locked)) > 0)
      .map((b) => ({
        symbol: b.asset, qty: String(Number(b.free) + Number(b.locked)),
        entryPrice: null, leverage: 1,
      }));

    return {
      capturedAt: new Date().toISOString(),
      source: "live",
      symbols: perSymbol,
      account: {
        equityUsd,
        positions,
        // No trade-history-derived P&L series wired up yet -- an empty list
        // is the honest default (the losing-streak check reads it as zero
        // consecutive losses, i.e. permissive, never a false block).
        recentPnl: [],
      },
    };
  }

  // Agent OS requires explicit user confirmation for every non-read action.
  // This call surfaces the proposal; the human approves it in their client.
  async submit(order: ProposedOrder) {
    if (order.action !== "trade") return { note: "hold — nothing submitted" };
    try {
      const r = await this.call("spot.newOrder", {
        symbol: order.symbol, side: order.side,
        type: "MARKET", quoteOrderQty: order.notionalUsd,
      });
      return { orderId: String(r.orderId ?? r.id ?? "unknown") };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}
