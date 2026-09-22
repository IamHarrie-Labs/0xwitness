# What's real, and what this deliberately does not claim

## Real

Every command in the README's "verify it yourself" section runs against real
output: the hash chain, the Ed25519 signatures, the deterministic offline model,
the tamper detection. The live section is backed by an actual authenticated
session against `agent.binance.com/mcp/agentic` on 2026-09-08 (server
`Binance-MCP-Server` v1.1.0): real BTCUSDT/ETHUSDT/SOLUSDT prices and klines, a
real proposed trade, and a real policy block, the sub-account had zero equity, so
`position-pct` correctly read `n/a` against it and refused rather than guessing.
That exact receipt is the one loaded by default in the browser verifier at
[0xwitness.vercel.app/verify](https://0xwitness.vercel.app/verify).

## Deliberately not claimed

- **Bit-determinism from hosted LLMs.** They batch nondeterministically, so
  temperature 0 isn't a guarantee. What's actually guaranteed is that the
  *inputs* are reconstructed exactly on replay, and any output divergence is
  surfaced, not hidden. With the built-in offline model, replay is exact. With a
  hosted model, a non-empty diff is a real measurement of how stable the agent's
  judgment is, not a bug.
- **That the agent predicts markets.** The bundled strategy is a plain 12-hour
  momentum rule, nothing more. The contribution is the evidence layer, not the
  alpha, and nobody should size a real position on it.
- **A tamper-proof log.** It's tamper-*evident*. Someone holding the private key
  could still rewrite history wholesale and re-sign it. Anchoring the chain head
  periodically (to a public timestamping service, or on-chain) would close that
  gap; the hash chain is already shaped for it, but it isn't built. See
  [D-03](DECISIONS.md#d-03-tamper-evident-not-tamper-proof-and-the-readme-says-so).
- **Custody of any kind.** Agent OS gives agents no withdrawal scope, ever.
  Neither does this project add any.
- **Financial advice, or a way around Agent OS's own confirmation step.** The
  bundled strategy exists to give the receipt something real to record, not to
  signal what anyone should trade. `--submit` still surfaces the order for
  approval in your own Agent OS client; this code cannot execute anything by
  itself. Market orders only, no limit, stop-loss, or take-profit types wired up
  ([D-15](DECISIONS.md#d-15-market-orders-only-for-now)).
- **A full live account picture.** `equityUsd` on live snapshots is the USDT
  balance, not a mark-to-market of every asset held
  ([D-05](DECISIONS.md#d-05-equityusd-is-approximated-from-the-usdt-balance-on-purpose)).
  `recentPnl` is always empty live, there's no trade-history-derived P&L series
  yet, so the losing-streak check reads it as zero consecutive losses: permissive,
  never a false block, but not a real behavioral read either
  ([D-08](DECISIONS.md#d-08-recentpnl-is-empty-live-and-the-losing-streak-check-reads-that-as-permissive)).
  `entryPrice` on live positions is `null` for the same reason: Binance's account
  endpoint reports balances, not cost basis
  ([D-07](DECISIONS.md#d-07-entryprice-is-null-on-live-positions)).
- **A single point of live verification, not a continuous track record.** The
  live integration has been run and recorded once, on 2026-09-08. That run is
  real and reproducible from its own receipt, but it is one data point, not an
  ongoing operating history. Nothing here claims the live path has been exercised
  repeatedly over time.
- **Every dimension of trading risk.** The policy engine checks six specific
  things ([D-01](DECISIONS.md#d-01-the-policy-engine-is-arithmetic-not-an-llm)).
  It does not model correlation across open positions, market impact or slippage
  beyond what the exchange's own order type provides, or volatility-adjusted
  position sizing. It is a hard floor on the specific risks it names, not a
  general risk model.
- **A build-enforced guarantee that the browser verifier matches the source.**
  `site/verify.html` is a hand-maintained port of the real TypeScript logic to
  vanilla JavaScript
  ([D-14](DECISIONS.md#d-14-the-browser-verifier-ports-the-real-logic-to-vanilla-js-it-doesnt-reuse-the-typescript-via-a-bundler)),
  not a shared compiled artifact. If `canon.ts`, `policy.ts`, or `decide.ts`
  change, the port has to be updated by hand; nothing in CI currently checks that
  the two stay in sync.

## Where to look for more detail

- **Why it's built this way:** [`DECISIONS.md`](DECISIONS.md), the reasoning and
  the bugs behind each real engineering choice.
- **How the pieces fit together:** [`ARCHITECTURE.md`](ARCHITECTURE.md).
- **The build narrative, including the reasoning for staying an MCP client rather
  than also becoming a server:** [`ARTICLE.md`](ARTICLE.md).
