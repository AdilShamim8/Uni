import crypto from "crypto";
import fs from "node:fs";

/**
 * YOU credential vault — AES-256-GCM encryption for provider API keys.
 *
 * Master key resolution order:
 *   1. YOU_MASTER_KEY env var (hex or passphrase; recommended for production/self-host)
 *   2. Auto-generated dev key persisted to `.you-master-key` (gitignored) with a warning.
 *
 * Keys are encrypted at rest and decrypted only inside the server-side gateway
 * process. No API ever returns key material — only a masked preview.
 */

const DEV_KEY_PATH = ".you-master-key";

function getMasterKey(): Buffer {
  const env = process.env.YOU_MASTER_KEY;
  if (env && env.length >= 16) {
    // Treat as hex key if it looks like one, otherwise derive deterministically.
    if (/^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
    return crypto.scryptSync(env, "you-master-key-salt", 32);
  }
  // Dev fallback: auto-generate + persist a local key file.
  try {
    if (fs.existsSync(DEV_KEY_PATH)) {
      const hex = fs.readFileSync(DEV_KEY_PATH, "utf8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(DEV_KEY_PATH, key.toString("hex") + "\n", { mode: 0o600 });
    console.warn(
      "[you] WARNING: using an auto-generated development master key (.you-master-key). " +
        "Set YOU_MASTER_KEY for production or persistent self-hosted deployments."
    );
    return key;
  } catch {
    // Ephemeral fallback (keys will not survive restart) — last resort only.
    console.warn("[you] WARNING: ephemeral master key in use. Set YOU_MASTER_KEY.");
    return crypto.scryptSync("you-dev-ephemeral", "salt", 32);
  }
}

let cachedKey: Buffer | null = null;
function masterKey(): Buffer {
  if (!cachedKey) cachedKey = getMasterKey();
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

/** Masked preview safe to return to the client. `sk-abc...wxyz` → `sk-a•••xyz` */
export function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 24))}${key.slice(-4)}`;
}
