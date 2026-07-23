import { randomBytes } from "node:crypto";

/**
 * In-memory, single-use, short-lived nonce store for the "sign in with your
 * own wallet" challenge. Fine for a single backend instance -- doesn't
 * survive a restart, which just means an in-flight login has to restart
 * from GET /nonce (no real consequence, nothing is persisted mid-flow).
 */
const NONCE_TTL_MS = 5 * 60 * 1000;
const nonces = new Map<string, { nonce: string; expiresAt: number }>();

export function buildLoginMessage(address: string, nonce: string): string {
  return `Sign in to LuckySplit\n\nAddress: ${address}\nNonce: ${nonce}`;
}

export function issueNonce(address: string): { message: string } {
  const nonce = randomBytes(16).toString("hex");
  nonces.set(address.toLowerCase(), { nonce, expiresAt: Date.now() + NONCE_TTL_MS });
  return { message: buildLoginMessage(address, nonce) };
}

/** One-time use: deletes the nonce on read so a signature can't be replayed. */
export function consumeNonce(address: string): string | null {
  const key = address.toLowerCase();
  const entry = nonces.get(key);
  if (!entry) return null;
  nonces.delete(key);
  if (entry.expiresAt < Date.now()) return null;
  return entry.nonce;
}
