import crypto from "crypto";
import fs from "node:fs";

/**
 * ReWoo credential vault — AES-256-GCM encryption for provider API keys.
 *
 * Master key resolution order:
 *   1. REWOO_MASTER_KEY env var (hex or passphrase; recommended for production/self-host)
 *      — the legacy YOU_MASTER_KEY name is still honored for pre-rebrand deployments
 *   2. Auto-generated dev key persisted to `.rewoo-master-key` (gitignored) with a warning
 *      — a legacy `.you-master-key` file is read and migrated if present
 *
 * Keys are encrypted at rest and decrypted only inside the server-side gateway
 * process. No API ever returns key material — only a masked preview.
 *
 * KDF parameters (scrypt salt, ephemeral fallback) are deliberately unchanged from
 * the pre-rebrand implementation so existing ciphertexts continue to decrypt.
 */

const DEV_KEY_PATH = ".rewoo-master-key";
const LEGACY_DEV_KEY_PATH = ".you-master-key";

/** Where the master key came from — reported by /api/health (never the key itself). */
export type MasterKeySource = "env" | "file" | "ephemeral";
let cachedSource: MasterKeySource | null = null;

function getMasterKey(): Buffer {
  const env = process.env.REWOO_MASTER_KEY ?? process.env.YOU_MASTER_KEY;
  if (env && env.length >= 16) {
    cachedSource = "env";
    // Treat as hex key if it looks like one, otherwise derive deterministically.
    if (/^[0-9a-fA-F]{64}$/.test(env)) return Buffer.from(env, "hex");
    return crypto.scryptSync(env, "you-master-key-salt", 32);
  }
  // Dev fallback: auto-generate + persist a local key file.
  try {
    // Migrate a legacy key file if present so stored credentials keep working.
    if (!fs.existsSync(DEV_KEY_PATH) && fs.existsSync(LEGACY_DEV_KEY_PATH)) {
      const legacy = fs.readFileSync(LEGACY_DEV_KEY_PATH, "utf8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(legacy)) {
        fs.writeFileSync(DEV_KEY_PATH, legacy + "\n", { mode: 0o600 });
        try {
          fs.rmSync(LEGACY_DEV_KEY_PATH);
          console.warn("[rewoo] Migrated legacy .you-master-key to .rewoo-master-key.");
        } catch {
          /* best-effort cleanup; the legacy file is gitignored and harmless */
        }
      }
    }
    if (fs.existsSync(DEV_KEY_PATH)) {
      const hex = fs.readFileSync(DEV_KEY_PATH, "utf8").trim();
      if (/^[0-9a-fA-F]{64}$/.test(hex)) {
        cachedSource = "file";
        return Buffer.from(hex, "hex");
      }
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(DEV_KEY_PATH, key.toString("hex") + "\n", { mode: 0o600 });
    cachedSource = "file";
    console.warn(
      "[rewoo] WARNING: using an auto-generated development master key (.rewoo-master-key). " +
        "Set REWOO_MASTER_KEY for production or persistent self-hosted deployments."
    );
    return key;
  } catch {
    // Ephemeral fallback (keys will not survive restart) — last resort only.
    // Typical on serverless platforms (Vercel) where the filesystem is
    // read-only: set the REWOO_MASTER_KEY environment variable there.
    console.warn(
      "[rewoo] WARNING: could not persist a development master key (read-only filesystem?). " +
        "Falling back to an ephemeral key — stored provider keys will NOT decrypt after a restart. " +
        "Set REWOO_MASTER_KEY (openssl rand -hex 32) for production or hosted deployments."
    );
    cachedSource = "ephemeral";
    return crypto.scryptSync("you-dev-ephemeral", "salt", 32);
  }
}

let cachedKey: Buffer | null = null;
function masterKey(): Buffer {
  if (!cachedKey) cachedKey = getMasterKey();
  return cachedKey;
}

/** Reports where the master key was resolved from ("env" | "file" | "ephemeral"). */
export function masterKeySource(): MasterKeySource {
  if (!cachedKey) masterKey();
  return cachedSource ?? "ephemeral";
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
