import type { Snapshot, ProposedOrder, Kline } from "../receipt/types.ts";
import type { Transport } from "./transport.ts";

// Binance Agent OS MCP endpoint. Agents act inside an isolated Agentic sub-account:
// no withdrawal scope, read-only main account, user funds it manually.
const ENDPOINT = process.env.BINANCE_MCP_URL ?? "https://agent.binance.com/mcp/agentic";

// DAY-0 SPIKE: confirm the OAuth flow and the exact tool names before building on this.
// Everything downstream is transport-agnostic, so a change here costs nothing elsewhere.
export class LiveTransport implements Transport {
  readonly kind = "live" as const;
  constructor(private token = process.env.BINANCE_MCP_TOKEN ?? "") {
    if (!this.token) throw new Error("BINANCE_MCP_TOKEN not set — run the OAuth flow first");
  }

  private async call(tool: string, args: Record<string, unknown>): Promise<any> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: Date.now(),
        method: "tools/call", params: { name: tool, arguments: args },
      }),
    });
    if (!res.ok) throw new Error(`${tool}: ${res.status} ${await res.text()}`);
    const json = await res.json();
    if (json.error) throw new Error(`${tool}: ${JSON.stringify(json.error)}`);
    return json.result;
  }

  async capture(symbols: string[]): Promise<Snapshot> {
    const perSymbol = await Promise.all(symbols.map(async (symbol) => {
      const [ticker, klines, book, funding] = await Promise.all([
        this.call("get_ticker", { symbol }),
        this.call("get_klines", { symbol, interval: "1h", limit: 48 }),
        this.call("get_order_book", { symbol, limit: 5 }),
        this.call("get_funding_rate", { symbol }).catch(() => null),
      ]);
      return {
        symbol,
        lastPrice: String(ticker.lastPrice),
        klines1h: klines as Kline[],
        fundingRate: funding ? String(funding.fundingRate) : null,
        bestBid: String(book.bids?.[0]?.[0] ?? "0"),
        bestAsk: String(book.asks?.[0]?.[0] ?? "0"),
      };
    }));

    const acct = await this.call("get_account", {});
    return {
      capturedAt: new Date().toISOString(),
      source: "live",
      symbols: perSymbol,
      account: {
        equityUsd: String(acct.totalEquityUsd ?? "0"),
        positions: (acct.positions ?? []).map((p: any) => ({
          symbol: p.symbol, qty: String(p.qty),
          entryPrice: String(p.entryPrice), leverage: Number(p.leverage ?? 1),
        })),
        recentPnl: (acct.recentPnl ?? []) as number[],
      },
    };
  }

  // Agent OS requires explicit user confirmation for every non-read action.
  // This call surfaces the proposal; the human approves it in their client.
  async submit(order: ProposedOrder) {
    if (order.action !== "trade") return { note: "hold — nothing submitted" };
    try {
      const r = await this.call("place_order", {
        symbol: order.symbol, side: order.side,
        type: "MARKET", quoteOrderQty: order.notionalUsd,
      });
      return { orderId: String(r.orderId ?? r.id ?? "unknown") };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}
