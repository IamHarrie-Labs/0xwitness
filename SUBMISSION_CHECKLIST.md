# Submission checklist

For anyone reviewing this repo for the Binance Agent OS Mini Hackathon, Track A.

## What's real, and how to check it yourself

| Claim | How to verify it | Verified |
|---|---|---|
| Offline pipeline works end to end | `npm run keys && npm run fixture && npm run run -- --offline` | yes |
| A tampered receipt is caught | `npm run tamper -- --seq 0 && npm run verify` | yes |
| A tampered receipt's decision visibly diverges on replay | `npm run replay -- --seq 0 --offline` | yes |
| Automated test suite passes | `npm test` (34 tests, zero new dependencies) | yes, and [continuously in CI](https://github.com/IamHarrie-Labs/0xwitness/actions/workflows/test.yml) |
| Same verification, no install | <https://0xwitness.vercel.app/verify> | yes |
| Connects to the real Binance Agent OS MCP server | `BINANCE_MCP_TOKEN=... npm run run -- --live` (needs your own OAuth token via `claude mcp login binance`) | yes, [real receipt embedded in the verifier](https://0xwitness.vercel.app/verify) |
| License | [`LICENSE`](LICENSE) (MIT) | yes |

## What this is not

See [README.md § What this does not claim](README.md#what-this-does-not-claim) for the full
list. In short: not a trading signal, not tamper-proof (tamper-*evident*), not custody, not a
bypass of Agent OS's own confirmation step, and not a claim that hosted LLMs are
bit-deterministic.

## Entry mechanics

- [ ] Followed [@Binance](https://x.com/binance) and reposted the announcement
- [ ] Replied with the video/demo and this repo's link
- [ ] Completed the survey
