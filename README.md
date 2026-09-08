# 0xWitness

[![test](https://github.com/IamHarrie-Labs/0xwitness/actions/workflows/test.yml/badge.svg)](https://github.com/IamHarrie-Labs/0xwitness/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A flight recorder for AI trading agents on Binance Agent OS.**

Every other agent asks you to trust it. This one hands you the evidence — signed,
so it can testify for itself.

Each decision emits a signed, hash-chained **receipt** containing the exact market
snapshot the agent saw, the exact prompt it was given, the model output, the policy
checks, and the outcome. Anyone can clone this repo and re-derive the decision from
the receipt alone — no API key, no network, no trusting our screenshots.

**Live site:** [0xwitness.vercel.app](https://0xwitness.vercel.app) · [docs](https://0xwitness.vercel.app/docs.html)

```
npx --yes . demo        # or: npm run keys && npm run fixture && npm run run -- --offline
```

## Why this exists

When an AI agent loses your money, you get a P&L number and a vibe. The market has
moved, the model is nondeterministic, the prompt may have changed. There is no way
to reconstruct what it saw or why it acted — which is exactly why nobody sensible
hands one real size.

Agent OS solves the *authority* problem well: isolated sub-accounts, no withdrawal
scope, human confirmation on every action. It does not solve the *evidence* problem.
That is the gap this fills.

## Verify it yourself

```bash
npm run keys                       # generate the signing keypair
npm run fixture                    # deterministic market data, fixed seed
npm run run -- --offline           # one decision cycle -> receipt #0
npm run verify                     # hashes, signatures, chain
npm run replay -- --offline        # re-derive the decision from the receipt
```

Replay prints `IDENTICAL`. Now break it:

```bash
npm run tamper -- --seq 0          # edit one close price inside a sealed receipt
npm run verify                     # hash=bad — the record no longer matches its hash
npm run replay -- --seq 0 --offline # ALTERED, and the decision visibly changes
```

That is the whole claim, and you just checked it without trusting us.

## What a receipt contains

| Field | Why it is in there |
|---|---|
| `snapshot` | Every kline, funding rate and book level the agent saw, frozen. Replay never re-fetches. |
| `snapshotHash` | Detects edits to the market data. |
| `decision.prompt` + `promptHash` | The literal prompt. Built purely from the snapshot — no clock, no ambient state. |
| `decision.rawOutput` | What the model actually said, before parsing. |
| `policy.checks` | Each deterministic charter check with its arithmetic shown. |
| `outcome` | Submitted or blocked, and why. **Blocked proposals are recorded too** — a log of only the trades you took is a highlight reel, not an audit trail. |
| `prev` + `hash` + `sig` | Hash chain plus ed25519 signature: nothing can be edited, deleted, reordered or forged. |

## Architecture

```
  Agent OS MCP ─┐
                ├─► Transport ─► Snapshot ─► Prompt ─► Model ─► Proposal
  Fixture ──────┘                   │                              │
                                    │                              ▼
                                    │                     Policy engine
                                    │                  (deterministic, outside
                                    │                    the model's reach)
                                    ▼                              │
                                 Receipt ◄────────────────────────┘
                                    │
                            hash → sign → append
```

The agent reaches the world only through `Transport`. Live and replay differ by
one swap, so reproduction is exact, not approximate.

The policy engine is deliberately *not* an LLM. Charter limits — notional, leverage,
symbol scope, position concentration, losing-streak — are arithmetic, so they replay
identically forever and cannot be argued out of by a persuasive prompt.

## What this does not claim

**Bit-determinism from hosted LLMs.** They batch nondeterministically, so temperature 0 isn't
a guarantee. What's actually guaranteed: the *inputs* are reconstructed exactly, and any output
divergence gets surfaced instead of hidden. With the built-in offline model, replay is exact.
With a hosted model, a non-empty diff is a real measurement of how stable the agent's judgment
is, which is worth knowing on its own.

**That the agent predicts markets.** The bundled strategy is a plain momentum rule, nothing
more. The contribution here is the evidence layer, not the alpha.

**A tamper-proof log.** It's tamper-evident. Someone holding the private key could still
rewrite history wholesale. Anchoring the chain head periodically would close that gap, and
the hash chain is already shaped for it.

**Custody of any kind.** Agent OS gives agents no withdrawal scope. Neither does this.

**Financial advice, or a way around Agent OS's own confirmation step.** The bundled strategy
exists to give the receipt something real to record, not to signal what you should trade.
`--submit` still surfaces the order for approval in your own Agent OS client; this code can't
execute anything by itself. And it's market orders only for now, no limit, stop-loss or
take-profit types wired up yet.

**A full live account picture.** `equityUsd` on live snapshots is the USDT balance, not a
true portfolio value across every asset. `recentPnl` is always empty live — there's no
trade-history-derived P&L series wired up yet, so the losing-streak check reads it as zero
consecutive losses (permissive, never a false block, but not a real behavioral read either).
`entryPrice` on live positions is `null` for the same reason: Binance's account endpoint
reports balances, not cost basis.

## Running against live Agent OS

```bash
export BINANCE_MCP_TOKEN=...        # from the Agent OS OAuth flow
npm run run -- --live               # propose only
npm run run -- --live --submit      # submit for confirmation in your client
```

Trades execute in your Agentic sub-account, which you fund manually and can revoke at
any time. `src/mcp/live.ts` is the only file that talks to Binance; everything else is
transport-agnostic.

**Verified 2026-09-08** against the real server (`Binance-MCP-Server` v1.1.0) with a live
OAuth session: real klines and prices for BTCUSDT/ETHUSDT/SOLUSDT, a real decision, and a
real policy block (the sub-account was unfunded, so `position-pct` correctly read `n/a`
against zero equity and refused the trade rather than passing it). Spot has no funding
rate — `fundingRate` is honestly `null` on live snapshots, not estimated. `equityUsd` is
approximated from the USDT balance, since spot accounts report balances, not a single
equity figure.

## Layout

```
src/receipt/   types, canonical JSON, sha256, ed25519, append-only store
src/mcp/       transport interface, live Agent OS client, fixture replay
src/agent/     policy engine, decision layer, run loop, replay+diff
src/market/    seeded fixture generator
src/cli/       run | replay | verify | tamper | keys | fixture
site/          static marketing site (index.html + docs.html, no build step)
test/          canon, policy, decision determinism, hash-chain tamper detection
```

`site/index.html` is the landing page; `site/docs.html` covers the same ground as
this README in a browsable form; `site/verify.html` re-derives a receipt's hash,
signature and decision entirely in the browser via WebCrypto, no server involved.
Serve the folder with anything static, `npx serve site` works with no setup.

```bash
npm test
```

34 tests, Node's built-in test runner, no new dependency. Covers canonical JSON
ordering, every policy check at its exact boundary (not just pass/fail, the actual
threshold), offline decision determinism, and the hash-chain claim directly: sealing
a receipt, tampering with it, and asserting hashOk flips to false while sigOk stays
true, exactly the property the CLI's own tamper demo shows on screen. One test
reproduces the real live receipt's block (zero equity vetoing a $100 SOLUSDT sell)
as a plain assertion, not just a screenshot of it happening once.

Zero runtime dependencies. Node 22.6+ runs the TypeScript directly.

## Notes for the Agent OS team

Found while wiring up `src/mcp/live.ts` against the real server, in case it's useful:

- The `initialize` response's own instructions describe tool names as a
  `{verb}_{product}_{operation}` pattern (e.g. `create_spot_newOrder`,
  `get_futures_usds_accountBalance`). The actual `tools/list` response uses dotted
  names instead (`spot.newOrder`, `futures_usds.futuresAccountBalanceV3`). An
  integration built from the prose description alone — which is the natural first
  thing to do — will call tool names that don't exist.
- `tools/list` is paginated (`nextCursor`), and it's not obvious from the first
  page: page one returns `analysis`, `convert`, `futures_coin`, `futures_usds` and
  part of `margin` — 50 tools, no `spot` or `wallet` anywhere in it. Page two is
  where `spot.*` and `wallet.*` actually live. An integration that lists once and
  stops (a reasonable thing to do) will conclude spot trading isn't exposed at all.
- Errors come back in the top-level JSON-RPC `error` field, not a per-call
  `isError` flag on the result — and `error.message` is itself a JSON string in
  Binance's own REST error format (`{"code":-1121,"msg":"Invalid symbol."}`), so
  it needs a second parse to read programmatically.
- Response shape isn't consistent across tools: some calls return `structuredContent`
  (pre-parsed JSON) alongside `content[0].text`; others (e.g. `spot.klines`) return
  only the text form, with no `structuredContent` at all. A client has to handle
  both.

MIT.
