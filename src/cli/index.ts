import { writeFileSync } from "node:fs";
import { generateKeys } from "../receipt/keys.ts";
import { readAll, verifyLog } from "../receipt/store.ts";
import { FixtureTransport } from "../mcp/fixture.ts";
import { runOnce } from "../agent/run.ts";
import { replay } from "../agent/replay.ts";
import { makeFixture } from "../market/fixture-gen.ts";

const args = process.argv.slice(2);
const cmd = args[0];
const has = (f: string) => args.includes(f);
const val = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const g = (s: string) => `\x1b[32m${s}\x1b[0m`;
const r = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

switch (cmd) {
  case "keys": generateKeys(); break;

  case "fixture": {
    const path = val("--out") ?? "fixtures/market.json";
    writeFileSync(path, JSON.stringify(makeFixture(Number(val("--seed") ?? 42)), null, 2));
    console.log(`wrote ${path}`);
    break;
  }

  case "run": {
    const offline = has("--offline");
    let transport;
    if (has("--live")) {
      const { LiveTransport } = await import("../mcp/live.ts");
      transport = new LiveTransport();
    } else {
      transport = FixtureTransport.fromFile(val("--fixture") ?? "fixtures/market.json");
    }
    const receipt = await runOnce(transport, { offline, dryRun: !has("--submit") });
    const p = receipt.decision.parsed;
    console.log(`\nreceipt #${receipt.seq}  ${dim(receipt.hash.slice(0, 16))}`);
    console.log(`  model     ${receipt.decision.model}`);
    console.log(`  proposal  ${p.action === "hold" ? "HOLD" : `${p.side} ${p.symbol} $${p.notionalUsd} @ ${p.leverage}x`}`);
    console.log(`  reasoning ${p.reasoning}`);
    for (const c of receipt.policy.checks) console.log(`  ${c.pass ? g("PASS") : r("FAIL")}  ${c.id.padEnd(18)} ${dim(c.detail)}`);
    console.log(`  verdict   ${receipt.policy.verdict === "allow" ? g("ALLOW") : r("BLOCK")}`);
    console.log(`  outcome   ${receipt.outcome.note ?? receipt.outcome.orderId ?? receipt.outcome.error}\n`);
    break;
  }

  case "replay": {
    const all = readAll();
    const target = val("--seq") ? all.find((x) => x.seq === Number(val("--seq"))) : all.at(-1);
    if (!target) { console.error("no such receipt"); process.exit(1); }
    const { diffs, snapshotOk } = await replay(target, has("--offline"));
    console.log(`\nreplaying receipt #${target.seq}  ${dim(target.hash.slice(0, 16))}`);
    console.log(`  snapshot integrity  ${snapshotOk ? g("OK") : r("ALTERED")}`);
    if (!diffs.length) console.log(`  decision            ${g("IDENTICAL")} — replay reproduced the recorded decision\n`);
    else {
      console.log(`  decision            ${r(`${diffs.length} divergence(s)`)}`);
      for (const d of diffs) {
        console.log(`\n    ${d.field}`);
        console.log(`      recorded: ${d.recorded.slice(0, 160)}`);
        console.log(`      replayed: ${d.replayed.slice(0, 160)}`);
      }
      console.log();
    }
    break;
  }

  case "verify": {
    const results = verifyLog();
    if (!results.length) { console.log("no receipts yet"); break; }
    console.log();
    for (const v of results) {
      const ok = v.hashOk && v.sigOk && v.chainOk;
      console.log(`  #${String(v.seq).padStart(3)}  ${ok ? g("VALID") : r("INVALID")}  ` +
        `hash=${v.hashOk ? g("ok") : r("bad")} sig=${v.sigOk ? g("ok") : r("bad")} chain=${v.chainOk ? g("ok") : r("bad")}`);
    }
    const bad = results.filter((v) => !(v.hashOk && v.sigOk && v.chainOk)).length;
    console.log(`\n  ${results.length} receipts, ${bad ? r(`${bad} invalid`) : g("all valid")}\n`);
    break;
  }

  // Demo aid: edit one number inside a sealed receipt, then run `verify` and
  // `replay` to watch both catch it. This is the moment the judge believes you.
  case "tamper": {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const seq = Number(val("--seq") ?? 0);
    const lines = readFileSync("data/receipts.jsonl", "utf8").split("\n").filter(Boolean);
    const idx = lines.findIndex((l) => JSON.parse(l).seq === seq);
    if (idx < 0) { console.error("no such receipt"); process.exit(1); }
    const rec = JSON.parse(lines[idx]);
    const before = rec.snapshot.symbols[0].klines1h.at(-1)[4];
    rec.snapshot.symbols[0].klines1h.at(-1)[4] = String(Number(before) * 1.15);
    lines[idx] = JSON.stringify(rec);
    writeFileSync("data/receipts.jsonl", lines.join("\n") + "\n");
    console.log(`\ntampered receipt #${seq}: ${rec.snapshot.symbols[0].symbol} last close ${before} -> ${rec.snapshot.symbols[0].klines1h.at(-1)[4]}`);
    console.log(dim(`now run:  npm run verify   and   npm run replay -- --seq ${seq} --offline\n`));
    break;
  }

  default:
    console.log(`
blackbox — flight recorder for AI trading agents

  npm run keys                          generate the signing keypair
  npm run fixture                       write a deterministic market fixture
  npm run run -- --offline              one decision cycle, no API key needed
  npm run run -- --live --submit        against Binance Agent OS (needs OAuth token)
  npm run replay -- --offline           re-derive the last decision from its receipt
  npm run verify                        check hashes, signatures and chain
  npm run tamper -- --seq 0             alter a sealed receipt, then verify/replay
`);
}
