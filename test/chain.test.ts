import { test, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeys, signHash, verifyHash } from "../src/receipt/keys.ts";
import { seal, verifyLog, readAll } from "../src/receipt/store.ts";
import { hashReceipt } from "../src/receipt/canon.ts";
import type { Receipt } from "../src/receipt/types.ts";

// seal()/verifyHash() sign and verify against the fixed data/agent.key +
// agent.pub locations (not parameterized). Generating keys here matches the
// documented setup step (`npm run keys`) exactly -- it's not test-only
// scaffolding, it's the same call the CLI makes -- and only runs if no key
// exists yet, so it never clobbers a real local identity that's already there.
before(() => {
  if (!existsSync("data/agent.key")) generateKeys();
});

function draftReceipt(seq: number, prev: string | null, note: string): Omit<Receipt, "hash" | "sig"> {
  return {
    version: 1, seq, prev, ts: "2026-01-01T00:00:00.000Z",
    agent: { name: "test", version: "0.0.0", charterHash: "x" },
    snapshot: { capturedAt: "2026-01-01T00:00:00.000Z", source: "fixture", symbols: [], account: { equityUsd: "0", positions: [], recentPnl: [] } },
    snapshotHash: "x",
    decision: { model: "test", temperature: 0, prompt: note, promptHash: "x", rawOutput: "{}", parsed: { action: "hold", reasoning: note, confidence: 1 } },
    policy: { checks: [], verdict: "allow" },
    outcome: { submitted: false, note },
  };
}

function tempLog(): string {
  return join(mkdtempSync(join(tmpdir(), "0xwitness-test-")), "receipts.jsonl");
}

test("signHash/verifyHash round-trip: a hash signed by the agent key verifies against agent.pub", () => {
  const hash = hashReceipt({ a: 1 });
  const sig = signHash(hash);
  assert.equal(verifyHash(hash, sig), true);
});

test("verifyHash rejects a signature over a different hash", () => {
  const sig = signHash(hashReceipt({ a: 1 }));
  assert.equal(verifyHash(hashReceipt({ a: 2 }), sig), false);
});

test("verifyHash rejects a corrupted signature rather than throwing", () => {
  const hash = hashReceipt({ a: 1 });
  const sig = signHash(hash);
  const corrupted = sig.slice(0, -4) + (sig.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
  assert.equal(verifyHash(hash, corrupted), false);
});

test("seal() produces a receipt that verifies clean: hashOk, sigOk and chainOk all true", () => {
  const path = tempLog();
  seal(draftReceipt(0, null, "first"), path);
  const [result] = verifyLog(path);
  assert.equal(result.hashOk, true);
  assert.equal(result.sigOk, true);
  assert.equal(result.chainOk, true);
});

test("a second sealed receipt correctly chains to the first via prev", () => {
  const path = tempLog();
  const r0 = seal(draftReceipt(0, null, "first"), path);
  seal(draftReceipt(1, r0.hash, "second"), path);

  const results = verifyLog(path);
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.hashOk && r.sigOk && r.chainOk));
});

test("tampering with sealed content flips hashOk to false while sigOk stays true", () => {
  // This is the core claim of the whole project: the signature proves the
  // STORED hash was genuinely signed by the key holder; it says nothing
  // about whether the content still matches that hash. Only hashOk does.
  const path = tempLog();
  seal(draftReceipt(0, null, "original"), path);

  const lines = readFileSync(path, "utf8").trim().split("\n");
  const receipt = JSON.parse(lines[0]);
  receipt.outcome.note = "tampered";
  writeFileSync(path, JSON.stringify(receipt) + "\n");

  const [result] = verifyLog(path);
  assert.equal(result.hashOk, false);
  assert.equal(result.sigOk, true);
});

test("breaking the prev pointer flips chainOk to false without touching hashOk", () => {
  const path = tempLog();
  const r0 = seal(draftReceipt(0, null, "first"), path);
  seal(draftReceipt(1, r0.hash, "second"), path);

  const lines = readFileSync(path, "utf8").trim().split("\n");
  const second = JSON.parse(lines[1]);
  second.prev = "0000000000000000000000000000000000000000000000000000000000000000";
  // Re-sign so hashOk still passes -- this isolates chainOk as the one
  // property this specific tamper should break, not hashOk incidentally.
  const { hash: _h, sig: _s, ...body } = second;
  const newHash = hashReceipt(body);
  writeFileSync(
    path,
    lines[0] + "\n" + JSON.stringify({ ...body, hash: newHash, sig: signHash(newHash) }) + "\n",
  );

  const results = verifyLog(path);
  assert.equal(results[1].hashOk, true);
  assert.equal(results[1].sigOk, true);
  assert.equal(results[1].chainOk, false);
});

test("readAll() returns an empty array for a log that doesn't exist yet", () => {
  assert.deepEqual(readAll(join(tmpdir(), "0xwitness-test-nonexistent", "receipts.jsonl")), []);
});
