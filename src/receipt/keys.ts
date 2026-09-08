import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const PRIV = "data/agent.key";
const PUB = "agent.pub";   // committed to the repo so anyone can verify

export function generateKeys(): void {
  // data/ is entirely gitignored (not just its contents), so a fresh clone
  // has no data/ directory at all until something creates it. Caught by CI
  // on a genuinely clean checkout; invisible on any machine that already
  // had the directory from an earlier run.
  mkdirSync(dirname(PRIV), { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(PRIV, privateKey.export({ type: "pkcs8", format: "pem" }));
  writeFileSync(PUB, publicKey.export({ type: "spki", format: "pem" }));
  console.log(`private key -> ${PRIV} (gitignored)\npublic key  -> ${PUB} (commit this)`);
}

export function signHash(hashHex: string): string {
  if (!existsSync(PRIV)) throw new Error(`missing ${PRIV} — run: npm run keys`);
  const key = createPrivateKey(readFileSync(PRIV));
  return sign(null, Buffer.from(hashHex, "hex"), key).toString("base64");
}

// Verification needs only the public key, so a judge can check the log
// without any secret and without contacting us.
export function verifyHash(hashHex: string, sigB64: string): boolean {
  if (!existsSync(PUB)) throw new Error(`missing ${PUB}`);
  const key = createPublicKey(readFileSync(PUB));
  try {
    return verify(null, Buffer.from(hashHex, "hex"), key, Buffer.from(sigB64, "base64"));
  } catch { return false; }
}
