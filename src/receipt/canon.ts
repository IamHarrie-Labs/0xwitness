import { createHash } from "node:crypto";
import { UNHASHED } from "./types.ts";

// Canonical JSON: object keys sorted recursively, no insignificant whitespace.
// Two structurally-equal receipts must produce byte-identical output on any machine,
// or replay verification is meaningless.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// Hash preimage for a receipt: everything except the hash and signature themselves.
export function receiptPreimage(receipt: Record<string, unknown>): string {
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(receipt)) if (!UNHASHED.has(k)) body[k] = v;
  return canonical(body);
}

export function hashReceipt(receipt: Record<string, unknown>): string {
  return sha256(receiptPreimage(receipt));
}
