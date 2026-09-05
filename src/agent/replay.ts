import type { Receipt } from "../receipt/types.ts";
import { FixtureTransport } from "../mcp/fixture.ts";
import { canonical, sha256 } from "../receipt/canon.ts";
import { loadCharter, charterHash, evaluate } from "./policy.ts";
import { decide } from "./decide.ts";

export interface Diff { field: string; recorded: string; replayed: string }

// Re-derives the decision from the receipt's own frozen snapshot.
//
// Honest scope: we guarantee the INPUTS are reconstructed exactly and any
// divergence in the output is surfaced. We do not claim hosted LLMs are
// bit-deterministic — they are not. With the offline model, replay is exact;
// with a hosted model, a non-empty diff is a real measurement of how stable
// the agent's judgment actually is.
export async function replay(r: Receipt, offline: boolean): Promise<{ diffs: Diff[]; snapshotOk: boolean }> {
  const charter = loadCharter();
  const snapshotOk = sha256(canonical(r.snapshot)) === r.snapshotHash;

  const transport = new FixtureTransport(r.snapshot);
  const snapshot = await transport.capture();
  const decision = await decide(snapshot, charter, offline);
  const policy = evaluate(decision.parsed, snapshot, charter);

  const diffs: Diff[] = [];
  const cmp = (field: string, a: unknown, b: unknown) => {
    const [x, y] = [canonical(a), canonical(b)];
    if (x !== y) diffs.push({ field, recorded: x, replayed: y });
  };

  cmp("charterHash", r.agent.charterHash, charterHash(charter));
  cmp("decision.promptHash", r.decision.promptHash, decision.promptHash);
  cmp("decision.parsed", r.decision.parsed, decision.parsed);
  cmp("policy.verdict", r.policy.verdict, policy.verdict);
  cmp("policy.checks", r.policy.checks, policy.checks);

  return { diffs, snapshotOk };
}
