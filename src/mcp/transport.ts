import type { Snapshot, ProposedOrder } from "../receipt/types.ts";

// Everything the agent can learn about the world, and everything it can do to it,
// goes through this interface. That is what makes replay possible: swap the
// implementation, keep the agent identical.
export interface Transport {
  readonly kind: "live" | "fixture";
  capture(symbols: string[]): Promise<Snapshot>;
  submit(order: ProposedOrder): Promise<{ orderId?: string; error?: string; note?: string }>;
}
