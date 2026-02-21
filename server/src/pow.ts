/**
 * Proof-of-Work session system.
 *
 * Flow:
 *   1. Client calls GET /api/pow/challenge → { challenge, difficulty }
 *   2. Client finds nonce such that SHA-256(challenge + nonce) has `difficulty` leading zero bits
 *   3. Client calls POST /api/pow/verify { challenge, nonce } → { session_id }
 *   4. Server validates the PoW, issues a session_id stored in the DB, and invalidates the challenge
 *
 * Session validity:
 *   - All session IDs must exist in the `valid_sessions` table
 *   - `last_used_at` is updated on each API request
 *   - Sessions unused for 7 days are rejected and cleaned up
 *
 * The difficulty is tuned so solving takes ~3 seconds on a modern browser.
 * Challenges expire after 60 seconds to prevent stockpiling.
 */

import { createHash, randomBytes } from "node:crypto";
import type { Database } from "bun:sqlite";

// ── Configuration ──

/** Number of leading zero bits required in SHA-256(challenge || nonce).
 *  Each +1 bit doubles solve time. ~22 bits ≈ 3s in a browser.
 *  Adjustable via POW_DIFFICULTY env var. */
const DIFFICULTY = Number(process.env.POW_DIFFICULTY ?? "20");

/** How long a challenge stays valid (ms) */
const CHALLENGE_TTL_MS = 60_000;

/** Max pending challenges to prevent memory abuse */
const MAX_PENDING_CHALLENGES = 10_000;

/** Session expiry: 7 days of inactivity */
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── In-memory challenge store ──

interface PendingChallenge {
  difficulty: number;
  createdAt: number;
}

const pendingChallenges = new Map<string, PendingChallenge>();

// Periodic cleanup of expired challenges
setInterval(() => {
  const now = Date.now();
  for (const [key, ch] of pendingChallenges) {
    if (now - ch.createdAt > CHALLENGE_TTL_MS) {
      pendingChallenges.delete(key);
    }
  }
}, 30_000);

// ── DB schema ──

/** Initialize the valid_sessions table. Call once at startup. */
export function initPowTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS valid_sessions (
      session_id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

// ── Session validation ──

/** Check if a session ID is valid (exists and used within the last 7 days). */
export function isSessionValid(db: Database, sessionId: string): boolean {
  const row = db.prepare(
    "SELECT last_used_at FROM valid_sessions WHERE session_id = ?"
  ).get(sessionId) as { last_used_at: string } | null;
  if (!row) return false;

  const lastUsed = new Date(row.last_used_at + "Z").getTime();
  if (Date.now() - lastUsed > SESSION_MAX_AGE_MS) {
    // Expired — clean it up
    db.prepare("DELETE FROM valid_sessions WHERE session_id = ?").run(sessionId);
    return false;
  }
  return true;
}

/** Touch a session's last_used_at timestamp. Call on every authenticated request. */
export function touchSession(db: Database, sessionId: string): void {
  db.prepare(
    "UPDATE valid_sessions SET last_used_at = datetime('now') WHERE session_id = ?"
  ).run(sessionId);
}

/** Register a server-issued session ID in the database. */
export function registerSession(db: Database, sessionId: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO valid_sessions (session_id, created_at, last_used_at) VALUES (?, datetime('now'), datetime('now'))"
  ).run(sessionId);
}

/** Purge sessions unused for more than 7 days. */
export function purgeExpiredSessions(db: Database): number {
  const cutoff = new Date(Date.now() - SESSION_MAX_AGE_MS).toISOString().replace("T", " ").slice(0, 19);
  const result = db.prepare("DELETE FROM valid_sessions WHERE last_used_at < ?").run(cutoff);
  return result.changes;
}

// ── Core PoW functions ──

/** Generate a new challenge. */
function createChallenge(): { challenge: string; difficulty: number } {
  if (pendingChallenges.size >= MAX_PENDING_CHALLENGES) {
    const oldest = pendingChallenges.keys().next().value;
    if (oldest) pendingChallenges.delete(oldest);
  }

  const challenge = randomBytes(32).toString("hex");
  pendingChallenges.set(challenge, {
    difficulty: DIFFICULTY,
    createdAt: Date.now(),
  });

  return { challenge, difficulty: DIFFICULTY };
}

/** Check if hash has at least `bits` leading zero bits. */
function hasLeadingZeroBits(hash: Buffer, bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  const remainBits = bits % 8;

  for (let i = 0; i < fullBytes; i++) {
    if (hash[i] !== 0) return false;
  }

  if (remainBits > 0) {
    const mask = 0xff << (8 - remainBits);
    if ((hash[fullBytes] & mask) !== 0) return false;
  }

  return true;
}

/** Verify a PoW solution. On success, issues and registers a session ID. */
function verifySolution(
  db: Database,
  challenge: string,
  nonce: string,
): { ok: true; session_id: string } | { ok: false; error: string } {
  if (!challenge || typeof challenge !== "string" || challenge.length !== 64) {
    return { ok: false, error: "Invalid challenge" };
  }
  if (!nonce || typeof nonce !== "string" || nonce.length > 32) {
    return { ok: false, error: "Invalid nonce" };
  }

  const pending = pendingChallenges.get(challenge);
  if (!pending) {
    return { ok: false, error: "Challenge not found or already used" };
  }
  pendingChallenges.delete(challenge);

  if (Date.now() - pending.createdAt > CHALLENGE_TTL_MS) {
    return { ok: false, error: "Challenge expired" };
  }

  const input = challenge + nonce;
  const hash = createHash("sha256").update(input).digest();

  if (!hasLeadingZeroBits(hash, pending.difficulty)) {
    return { ok: false, error: "Insufficient proof of work" };
  }

  const session_id = randomBytes(32).toString("hex");
  registerSession(db, session_id);
  return { ok: true, session_id };
}

// ── HTTP handler ──

/** Handle PoW HTTP requests. Returns Response or null if not a PoW route. */
export function handlePowRequest(
  request: Request,
  url: URL,
  db: Database,
): Response | null {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/pow/challenge" && method === "GET") {
    const { challenge, difficulty } = createChallenge();
    return new Response(JSON.stringify({ ok: true, challenge, difficulty }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  if (path === "/api/pow/verify" && method === "POST") {
    return (async () => {
      let body: { challenge?: string; nonce?: string };
      try {
        body = await request.json();
      } catch {
        return new Response(
          JSON.stringify({ ok: false, error: "Invalid JSON body" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const result = verifySolution(db, body.challenge ?? "", body.nonce ?? "");

      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 403,
        headers: { "Content-Type": "application/json" },
      });
    })();
  }

  return null;
}
