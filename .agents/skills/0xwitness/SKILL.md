---
name: 0xwitness
description: Signed, hash-chained receipts for AI trading agents on Binance Agent OS. Runs a decision cycle against a fixture or the live Binance MCP server, verifies the receipt log (hash, signature, chain), and replays any receipt to re-derive its decision from the frozen snapshot alone. Use when a trade decision needs to be recorded as evidence, checked for tampering, or reproduced independently of the original run.
version: 0.1.0
license: MIT
metadata:
  author: IamHarrie Labs
  homepage: https://0xwitness.vercel.app
  repository: https://github.com/IamHarrie-Labs/0xwitness
---

# 0xWitness

Every decision an agent makes against Binance Agent OS can be sealed into a signed,
hash-chained receipt: the exact market snapshot it saw, the exact prompt built from
that snapshot, the raw model output, each policy check with its arithmetic, and the
outcome. Anyone holding `agent.pub` can verify a receipt without a network call and
without trusting the agent that produced it.

Full explanation: [README.md](../../../README.md). Live tool: <https://0xwitness.vercel.app/verify>
(runs the identical check in a browser, no install).

## Setup

Zero runtime dependencies. Requires Node 22.6+.

```bash
git clone https://github.com/IamHarrie-Labs/0xwitness.git && cd 0xwitness
npm run keys       # generates data/agent.key (gitignored) and agent.pub (commit this)
```

## Commands

| Command | What it does | Needs a key first? |
|---|---|---|
| `npm run keys` | Generate the ed25519 signing keypair. | — |
| `npm run fixture` | Write a deterministic, seeded market snapshot to `fixtures/market.json`. No network. | no |
| `npm run run -- --offline` | One decision cycle against the fixture, sealed as receipt #N. No API key, no network. | yes |
| `npm run run -- --live` | One decision cycle against the real Binance Agent OS MCP server (propose only). Needs `BINANCE_MCP_TOKEN` from the Agent OS OAuth flow. | yes |
| `npm run run -- --live --submit` | Same as above, but the order is also submitted for confirmation in your own Agent OS client. Nothing executes without that confirmation. | yes |
| `npm run verify` | Check every sealed receipt's hash, signature and chain link. Prints `VALID`/`INVALID` per receipt. | yes |
| `npm run replay -- --offline` | Re-derive the most recent decision purely from its receipt's frozen snapshot. Prints `IDENTICAL` or a field-by-field diff. | yes |
| `npm run replay -- --seq N --offline` | Same, for a specific receipt by sequence number. | yes |
| `npm run tamper -- --seq N` | Demo aid: edits one close price inside an already-sealed receipt, so the next `verify`/`replay` can be watched catching it. | yes |

`npm test` runs the automated suite (34 tests, `node:test`, no new dependency):
canonical JSON, every policy check at its exact boundary, decision-layer
determinism, and the hash-chain tamper-detection claim itself as a direct
assertion. [![test](https://github.com/IamHarrie-Labs/0xwitness/actions/workflows/test.yml/badge.svg)](https://github.com/IamHarrie-Labs/0xwitness/actions/workflows/test.yml)

## What a receipt is good for

Point an agent's decisions through 0xWitness when you need to answer, after the
fact and without trusting the agent, exactly what it saw and why it acted:

- **Audit a losing trade.** The receipt has the frozen snapshot, so `replay` shows
  whether the same inputs still produce the same decision.
- **Prove a safety block was real.** `policy.checks` shows the actual arithmetic
  (e.g. `position-pct: n/a% vs cap 25%`), not just a pass/fail flag.
- **Detect a tampered record.** `verify` reports `hashOk`, `sigOk` and `chainOk`
  independently: a tampered receipt shows `hashOk: false` while `sigOk` stays
  `true`, since the signature only proves the *stored* hash was genuinely signed,
  not that the content still matches it.

## Honest limits

Not a claim of bit-determinism from hosted LLMs (the bundled offline model is
deterministic; a hosted model's divergence is measured, not hidden). Not a trading
signal, the bundled strategy is a plain momentum rule. Not custody, Agent OS gives
agents no withdrawal scope and neither does this. Full list:
[README.md § What this does not claim](../../../README.md#what-this-does-not-claim).
