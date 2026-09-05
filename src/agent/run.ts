import type { Receipt } from "../receipt/types.ts";
import type { Transport } from "../mcp/transport.ts";
import { canonical, sha256 } from "../receipt/canon.ts";
import { seal, nextSeq } from "../receipt/store.ts";
import { loadCharter, charterHash, evaluate } from "./policy.ts";
import { decide } from "./decide.ts";

export const AGENT = { name: "blackbox-momentum", version: "0.1.0" };

export async function runOnce(transport: Transport, opts: { offline: boolean; dryRun: boolean }): Promise<Receipt> {
  const charter = loadCharter();
  const snapshot = await transport.capture(charter.allowedSymbols);
  const decision = await decide(snapshot, charter, opts.offline);
  const policy = evaluate(decision.parsed, snapshot, charter);

  // Blocked proposals are still recorded. A log that only contains the trades
  // you took is a highlight reel, not an audit trail.
  const outcome = policy.verdict === "block"
    ? { submitted: false, note: `blocked: ${policy.checks.filter((c) => !c.pass).map((c) => c.id).join(", ")}` }
    : opts.dryRun
      ? { submitted: false, note: "dry run — not submitted" }
      : { submitted: true, ...(await transport.submit(decision.parsed)) };

  const { seq, prev } = nextSeq();
  return seal({
    version: 1, seq, prev,
    ts: new Date().toISOString(),
    agent: { ...AGENT, charterHash: charterHash(charter) },
    snapshot,
    snapshotHash: sha256(canonical(snapshot)),
    decision,
    policy,
    outcome,
  });
}
