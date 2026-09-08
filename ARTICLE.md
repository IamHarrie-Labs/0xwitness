# Why I built a flight recorder instead of another trading bot

When the Binance Agent OS hackathon went live, I knew exactly what most of the submissions were going to look like before a single one was posted. Connect an agent to the MCP server, wire up a strategy, ship a bot that buys BTC when some indicator crosses some threshold. It's the obvious thing to build, which is exactly why I didn't want to build it.

So I sat with the actual constraints for a while instead of opening an editor.

## The part nobody mentions

Agent OS's whole safety pitch is real and I don't want to undersell it. Isolated sub-accounts. No withdrawal scope, ever. Human confirmation on every non-read action. If you're worried about an agent going rogue and draining your account, Binance already solved that problem structurally, not with a promise, with an architecture.

But that's the *authority* problem. It's not the only problem.

Here's the one nobody was talking about: when an AI trading agent loses your money, what do you actually have afterward? A P&L number and a vibe. The market moved, the model is nondeterministic by nature, the prompt might have been tweaked since. There is no way to go back and reconstruct what the agent actually saw, or why it decided what it decided. You're left trusting a system you can't interrogate, based on a track record you can't audit.

That's the gap. Agent OS controls what an agent is *allowed* to do. Nothing controls whether you can *check* what it did and why. Every hackathon entry was going to compete on the first axis. I wanted to build something that answered the second one.

## The idea, stated plainly

Don't trust the screenshot. Replay the trade.

Every decision the agent makes gets sealed into a receipt: the exact market data it saw, frozen at that instant, the exact prompt built from that data, the model's raw output before any parsing, the policy checks it was measured against with their actual arithmetic shown, and the outcome. That receipt gets hashed, signed with an Ed25519 key, and chained to the one before it. Nothing in it can be edited, deleted, or reordered without the chain visibly breaking.

The pitch to a skeptical reader isn't "trust our agent." It's "here's a signed record, go check it yourself." That's a completely different posture from every other submission in this hackathon, and it's the one I actually believe matters once agents start touching real money.

## Designing it so it couldn't cheat

A few decisions came directly out of that posture, not out of taste.

The policy engine that decides whether a trade is allowed to go through is deliberately not an LLM. It's six plain arithmetic checks: notional cap, leverage cap, position concentration, symbol allowlist, open positions, losing streak. An LLM can be talked out of a rule by a sufficiently clever prompt. Arithmetic can't be. If I wanted the safety story to be real rather than aspirational, the thing enforcing the limits had to be something that replays identically forever, not something with judgment that could drift.

I also built the whole pipeline offline-first, with a deterministic momentum strategy and a seeded fixture generator, before I ever touched the live API. That wasn't laziness. It meant I could prove the entire chain of custody, snapshot to decision to policy to signed receipt, with zero network calls and zero API key, and anyone cloning the repo could verify it in under two seconds with no setup at all. If the honesty of the project depended on infrastructure I controlled, it wouldn't really be honest.

## The moment reality stopped cooperating

Here's the part I didn't expect going in. When I finally connected to the real Binance Agent OS MCP server with a live OAuth session, the integration I'd built from reading the documentation was wrong in three separate ways.

The server's own setup instructions describe tool names following a pattern like `create_spot_newOrder`. The actual tool list uses dotted names instead, `spot.newOrder`. The tool list is also paginated, and the page you get by default doesn't include spot trading or wallet tools at all, they're sitting on page two. An integration built from the docs alone, which is the natural first thing anyone would do, calls tool names that don't exist and never discovers that spot trading is even exposed.

And underneath all of that, a much dumber bug: a piece of TypeScript syntax I'd used in the live client doesn't survive Node's type-stripping mode. It would have crashed on import, before a single network call, regardless of whether the tool names were right. If I'd only ever tested the offline path, and I nearly did, that bug would have shipped invisibly. The live integration would have simply never worked, for reasons that had nothing to do with Binance at all.

I found all three because I insisted on actually running it against the real server instead of trusting that careful reading of documentation was equivalent to testing. It wasn't. It's rarely equivalent, and I think that's worth saying out loud more often than people say it.

## The moment that justified the whole thing

Once it was actually fixed and actually running, I got a result better than anything I could have staged.

The agent captured real BTCUSDT, ETHUSDT and SOLUSDT prices, decided the strongest momentum was a sell on SOLUSDT, and proposed a $100 trade. The policy engine blocked it. Not because the strategy was wrong, but because the sub-account had zero equity, so position sizing came back undefined against zero, and the charter refused to let an undefined risk calculation pass as a yes.

That's not a failure. That's the entire thesis of the project working, on the first real attempt, on the actual exchange, with nobody's money at risk. A system that only ever demos the happy path hasn't proven its safety claims. A system that shows you its own brakes actually working, on camera, on a real account, has.

## Making "trust me" unnecessary

The receipt and replay mechanism proves a decision was reproducible if you're willing to clone a repository and run eight commands. Most people who'd benefit from that proof never will.

So the last piece was removing that barrier entirely. There's a page that runs the identical verification, hash check, signature check, full decision replay, directly in a browser using the Web Crypto API. Nothing is sent anywhere. It loads with a genuine receipt from that real blocked trade already verified. You can edit a single number in the visible JSON and watch the signature check catch it, live, with no install and no terminal.

I keep coming back to why that specific detail matters. Almost anyone can be shown a screenshot of a passing test. Very few things let a stranger break your claim themselves, in fifteen seconds, using nothing but their own browser. That's a different, much harder kind of credibility to fake, and it's the only kind I actually wanted to offer.

## What I didn't want to claim

I spent real time on the list of things this project explicitly does not do, and I think that list is as important as anything it does do. It doesn't claim hosted LLMs are bit-deterministic, because they aren't. It doesn't claim the bundled momentum strategy predicts markets, it's a plain rule, the contribution is the evidence layer, not the alpha. It doesn't claim to be tamper-*proof*, only tamper-*evident*, someone holding the private key could still rewrite history wholesale. It doesn't touch custody, Agent OS gives agents no withdrawal scope and neither does this.

A project that only tells you what it can do is marketing. A project that's equally clear about what it can't do is closer to engineering. I wanted this to read like the second thing.

## The second time reality caught something

I added an automated test suite late, thirty-four of them, covering the canonical JSON logic, every policy check at its exact numeric boundary, and the hash-chain claim itself as a direct assertion: seal a receipt, tamper with it, prove the hash check fails while the signature still checks out clean. All thirty-four passed immediately on my machine. I wired up CI to run them on every push anyway, mostly so the README could say "continuously verified" instead of "passed once."

The very first CI run failed. Not one of the thirty-four tests I'd written carefully, a setup step nobody thinks about: the folder that holds the signing key doesn't exist on a truly fresh clone, because it's gitignored entirely, not just its contents. My machine had that folder lying around from every previous test run I'd ever done, so the bug was invisible to me no matter how many times I ran the suite locally. A stranger cloning the repo for the first time and following the README's own first instruction would have hit an error before writing a single byte.

That's twice now. Once with the live Binance integration, once with a folder that doesn't exist. Both times the bug was invisible on my machine and would have been immediately visible to anyone else's. I'm starting to think "works on my machine" isn't a joke about a specific kind of bug, it's a description of the only kind of bug that survives contact with someone who isn't you. CI existing at all, not the tests I wrote, is what caught this one.

## Why this isn't also an MCP server

Partway through, I considered making 0xWitness expose itself as an MCP server too, not just a client of Binance's. Other entries in this hackathon did exactly that, and on its face it looks like more surface area, more ambition, more to demo.

I talked myself out of it, and I think the reasoning is worth keeping. Binance's Agent OS MCP server already is the shared thing every Track A entry is supposed to build on top of. If 0xWitness also became a server, it wouldn't be adding a capability to that ecosystem, it would be standing next to Binance's own server offering a parallel surface for the same underlying exchange functions. That's not a new idea, it's the same idea wearing a second hat. It makes sense for a project whose actual product is something worth calling, propose a hedge, execute it, unwind it. It doesn't make sense for a project whose job is to watch, record, and prove. There's nothing on 0xWitness that another agent needs to call when the receipt log and a browser verifier already say everything there is to say.

Scope discipline doesn't demo as well as a bigger feature list. I think it's usually the better call anyway.

## Why this matters past one hackathon

AI agents are being handed real authority over real consequences faster than anyone is building the tooling to check their work. Trading is the visible case here because Agent OS made it concrete, but the same gap exists anywhere an agent acts on your behalf with money, infrastructure, or anything else you can't easily undo. "It probably did the right thing" is not an answer that scales, and it's not one I'm willing to accept from systems I don't control.

Signed, replayable, independently checkable receipts aren't a hackathon gimmick. They're the missing piece between "an agent can act" and "you can trust that it acted correctly," and I think that piece is going to matter a lot more over the next few years than another trading strategy ever would.

---

**Repo:** github.com/IamHarrie-Labs/0xwitness
**Live site:** 0xwitness.vercel.app
**Try it yourself:** 0xwitness.vercel.app/verify
**Tests, running continuously:** github.com/IamHarrie-Labs/0xwitness/actions
