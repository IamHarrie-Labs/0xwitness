import { appendFileSync, readFileSync, existsSync } from "node:fs";
import type { Receipt } from "./types.ts";
import { hashReceipt } from "./canon.ts";
import { signHash, verifyHash } from "./keys.ts";

const LOG = "data/receipts.jsonl";

export function readAll(path = LOG): Receipt[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Receipt);
}

export function nextSeq(path = LOG): { seq: number; prev: string | null } {
  const all = readAll(path);
  const last = all.at(-1);
  return { seq: all.length, prev: last ? last.hash : null };
}

export function seal(draft: Omit<Receipt, "hash" | "sig">, path = LOG): Receipt {
  const hash = hashReceipt(draft as unknown as Record<string, unknown>);
  const receipt: Receipt = { ...draft, hash, sig: signHash(hash) } as Receipt;
  appendFileSync(path, JSON.stringify(receipt) + "\n");
  return receipt;
}

export interface VerifyResult { seq: number; hashOk: boolean; sigOk: boolean; chainOk: boolean; }

// Three independent properties:
//   hashOk  - contents match their own hash (nothing was edited)
//   sigOk   - hash was signed by the holder of the agent key (nothing was forged)
//   chainOk - prev pointer matches the previous receipt (nothing was deleted or reordered)
export function verifyLog(path = LOG): VerifyResult[] {
  const all = readAll(path);
  return all.map((r, i) => {
    const { hash, sig, ...body } = r;
    const recomputed = hashReceipt(body as unknown as Record<string, unknown>);
    return {
      seq: r.seq,
      hashOk: recomputed === hash,
      sigOk: verifyHash(hash, sig),
      chainOk: i === 0 ? r.prev === null : r.prev === all[i - 1].hash,
    };
  });
}
