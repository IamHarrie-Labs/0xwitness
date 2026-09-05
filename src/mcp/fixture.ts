import { readFileSync } from "node:fs";
import type { Snapshot, ProposedOrder } from "../receipt/types.ts";
import type { Transport } from "./transport.ts";

// Replays a frozen snapshot. Used both for offline development and, crucially,
// for `replay` — where the snapshot comes straight out of a receipt.
export class FixtureTransport implements Transport {
  readonly kind = "fixture" as const;
  private snapshot: Snapshot;
  constructor(snapshot: Snapshot) { this.snapshot = snapshot; }

  static fromFile(path: string): FixtureTransport {
    return new FixtureTransport(JSON.parse(readFileSync(path, "utf8")) as Snapshot);
  }

  async capture(): Promise<Snapshot> {
    return { ...this.snapshot, source: "fixture" };
  }

  async submit(_order: ProposedOrder) {
    return { note: "fixture transport: order not submitted" };
  }
}
