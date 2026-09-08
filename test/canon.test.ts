import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, sha256, hashReceipt } from "../src/receipt/canon.ts";

test("canonical() sorts object keys regardless of input order", () => {
  const a = canonical({ b: 1, a: 2, c: 3 });
  const b = canonical({ c: 3, a: 2, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"b":1,"c":3}');
});

test("canonical() is stable through nested objects and arrays", () => {
  const a = canonical({ z: [{ y: 1, x: 2 }], a: { d: 4, c: 3 } });
  const b = canonical({ a: { c: 3, d: 4 }, z: [{ x: 2, y: 1 }] });
  assert.equal(a, b);
});

test("canonical() drops keys whose value is undefined", () => {
  assert.equal(canonical({ a: 1, b: undefined }), '{"a":1}');
});

test("canonical() emits no insignificant whitespace", () => {
  assert.ok(!canonical({ a: [1, 2], b: "x" }).includes(" "));
});

test("sha256() is deterministic for the same input", () => {
  assert.equal(sha256("0xwitness"), sha256("0xwitness"));
});

test("sha256() matches a known digest", () => {
  // node -e "console.log(require('crypto').createHash('sha256').update('0xwitness').digest('hex'))"
  assert.equal(sha256("0xwitness"), "76e925f93ff51c90aa864ff232b7c6f5e7d2288330c1e5ab33e13a5a17e73667");
  assert.match(sha256("0xwitness"), /^[0-9a-f]{64}$/);
});

test("hashReceipt() changes when any hashed field changes", () => {
  const base = { version: 1, seq: 0, note: "a" };
  const h1 = hashReceipt(base);
  const h2 = hashReceipt({ ...base, note: "b" });
  assert.notEqual(h1, h2);
});

test("hashReceipt() ignores hash and sig fields (the preimage excludes them)", () => {
  const base = { version: 1, seq: 0, note: "a" };
  const withHashAndSig = { ...base, hash: "deadbeef", sig: "irrelevant" };
  assert.equal(hashReceipt(base), hashReceipt(withHashAndSig));
});

test("hashReceipt() is order-independent (canonicalization, not insertion order)", () => {
  const r1 = { seq: 0, version: 1, note: "a" };
  const r2 = { note: "a", version: 1, seq: 0 };
  assert.equal(hashReceipt(r1), hashReceipt(r2));
});
