# Engineering decisions

Every entry here is a real decision made during the build, with the reasoning and,
where one exists, the bug that resulted from getting it wrong. Numbered so other
docs can point at a specific one.

## D-01: The policy engine is arithmetic, not an LLM

`src/agent/policy.ts` has six checks: notional cap, leverage cap, symbol allowlist,
position concentration, open positions, losing streak. Every one is plain
comparison arithmetic on numbers already in the receipt. None of it is a model
call.

The reasoning: an LLM can be talked out of a rule by a sufficiently good prompt.
Arithmetic can't be, and it replays identically forever on any machine, which is
the actual requirement for a receipt to mean anything on replay. If the thing
enforcing the limits had judgment that could drift, "the policy blocked this
trade" would stop being a checkable claim.

## D-02: Offline-first, before the live API was ever touched

The whole pipeline, snapshot capture, prompt construction, the bundled momentum
model, policy evaluation, receipt sealing, was built and proven against a seeded
fixture generator (`src/market/fixture-gen.ts`) before `src/mcp/live.ts` existed
at all.

This wasn't about avoiding the harder work. It meant the entire chain of custody
could be verified with zero network calls and zero API key, by anyone, in under
two seconds, before there was any live infrastructure to depend on or to make the
demo fragile.

## D-03: Tamper-evident, not tamper-proof, and the README says so

The hash chain (`prev` pointer) plus the Ed25519 signature over each receipt's
hash means an edit, deletion, or reorder is detectable. It does not mean the log
cannot be forged by someone holding the private key, who could rewrite history
wholesale and re-sign it. That's a real, stated limit, not a rounding error:
tamper-*proof* would be a false claim about what a hash chain plus a single
signing key can guarantee. See `LIMITATIONS.md`.

## D-04: One `Transport` interface, three implementations

`FixtureTransport`, `LiveTransport`, and the replay path all implement the same
`capture()` / `submit()` shape (`src/mcp/transport.ts`). The agent, the policy
engine, and the receipt logic never know which one they're talking to. Live and
replay differ by exactly one swap, which is what makes "the decision reproduces"
a real claim rather than a description of two separately-maintained code paths
that happen to agree today.

## D-05: `equityUsd` is approximated from the USDT balance, on purpose

Binance's spot `getAccount` endpoint returns a list of per-asset balances, not a
single portfolio-value figure. Since the charter only trades USDT-quoted pairs
(BTCUSDT, ETHUSDT, SOLUSDT), `live.ts` sums the USDT `free` + `locked` balance and
calls that equity. It's a stated simplification, not a full mark-to-market of the
account, documented in `LIMITATIONS.md` rather than silently presented as exact.

## D-06: `fundingRate` is honestly `null` on live snapshots

The original design assumed every symbol would carry a funding rate, copying the
pattern from perpetual futures. Spot trading has no funding rate at all, that's a
futures-only concept. Once the live integration used the real `spot.*` tools, this
became visible immediately: there is no `spot.fundingRate` tool, and inventing a
number would have been worse than admitting the field doesn't apply. `fundingRate`
is `null` on every live spot snapshot, not estimated or defaulted to zero.

## D-07: `entryPrice` is `null` on live positions

Binance's account endpoint reports balances (what you hold), not cost basis (what
you paid for it). Computing a real entry price needs a separate pull of trade
history and a cost-basis calculation this project doesn't do yet. `entryPrice` on
a live position is `null`, and `AccountSnapshot.positions[].entryPrice` was
widened from `string` to `string | null` to make that the type-checked truth
instead of a comment nobody has to obey.

## D-08: `recentPnl` is empty live, and the losing-streak check reads that as permissive

There's no trade-history-derived realized-P&L series wired up for live accounts.
Rather than fake a plausible-looking series, `recentPnl` is an empty array, and the
losing-streak policy check reads zero entries as zero consecutive losses, meaning
it never falsely blocks a trade, but it also isn't measuring real trading
behavior yet. Stated in `LIMITATIONS.md`.

## D-09: The live tool names didn't match the server's own documentation

`live.ts` was originally written from the Agent OS MCP server's own `initialize`
response, which describes tool names as a `{verb}_{product}_{operation}` pattern
(`create_spot_newOrder`, `get_futures_usds_accountBalance`). Connecting with a
real OAuth session and calling `tools/list` showed the actual names are dotted
(`spot.newOrder`, `futures_usds.futuresAccountBalanceV3`). Every tool name in the
original file was wrong. This is reported to the Agent OS team in `README.md`.

## D-10: `tools/list` is paginated, and page one has no spot or wallet tools

The first page of `tools/list` (50 tools) covers `analysis`, `convert`,
`futures_coin`, `futures_usds`, and part of `margin`. Nothing under `spot` or
`wallet` appears until page two, reached via `nextCursor`. An integration that
lists once and stops, which is a completely reasonable thing to do, would
conclude spot trading isn't exposed by the server at all. Found only by
explicitly paging through the full result.

## D-11: A TypeScript syntax choice crashed the live client on import

`constructor(private token = ...)` is TypeScript's parameter-property shorthand.
Node's `--experimental-strip-types` only strips type annotations, it doesn't
transform syntax sugar, so that line threw `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` at
module load, before a single network call. This meant `--live` could never have
run, for reasons unrelated to Binance, tool names, or anything about the
integration logic. Fixed by using a plain field and an explicit assignment in the
constructor body instead. Found by actually running `--live`, not by reading the
code.

## D-12: The test suite caught a bug its author never would have, by running on a clean machine

34 tests were added late (`test/`), covering canonical JSON, every policy check's
exact numeric boundary, decision-layer determinism, and the hash-chain
tamper-detection claim as a direct assertion. All 34 passed locally on the first
run. The first CI run against a genuinely fresh checkout (`.github/workflows/test.yml`)
failed anyway: `data/` is gitignored entirely, not just its contents, so a truly
fresh clone has no `data/` directory until something creates one, and
`generateKeys()` wrote straight to `data/agent.key` with no `mkdir` first. This was
invisible on the machine that already had the directory from earlier manual runs,
and immediate on CI. Fixed with `mkdirSync(dirname(PRIV), { recursive: true })`,
verified locally by moving `data/` aside and re-running the suite clean.

## D-13: 0xWitness stayed an MCP client, not also a server

Some comparable projects expose themselves as MCP servers in addition to being
clients of Binance's, so other agents can call them. 0xWitness didn't, and the
reasoning is structural, not a time constraint: Binance's Agent OS MCP server is
already the shared thing every integration is supposed to build on top of. A
second server from 0xWitness wouldn't add a new capability to that ecosystem, it
would stand next to Binance's own server offering a parallel surface for the same
underlying exchange functions. That makes sense for a project whose product is
something worth calling (propose a hedge, execute it, unwind it). It doesn't make
sense for a project whose job is to watch, record, and prove: there's nothing on
0xWitness that another agent needs to call when the receipt log and the browser
verifier already say everything there is to say.

## D-14: The browser verifier ports the real logic to vanilla JS, it doesn't reuse the TypeScript via a bundler

`site/verify.html` re-implements `canon.ts`'s canonical JSON, `policy.ts`'s
`evaluate()`, and `decide.ts`'s `buildPrompt()` / offline momentum model directly
in plain JavaScript, using the browser's native WebCrypto for SHA-256 and Ed25519
rather than pulling in a bundler or a crypto library. This keeps the "zero runtime
dependencies" claim true for the verifier too, and means the page works from a
single static file with no build step, matching the rest of the project. The cost
is that the ported logic has to be kept in sync by hand if the TypeScript source
changes; there's no shared build artifact enforcing that today.

## D-15: Market orders only, for now

`submit()` in every transport only constructs `MARKET` orders. Limit orders,
stop-loss, and take-profit order types aren't wired up. This is a stated scope
limit, not an oversight discovered later: the receipt and policy-engine claims
don't depend on order type, and adding the other types is direct plumbing work
against `spot.newOrder`'s existing schema whenever it's needed.
