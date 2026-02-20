/**
 * SQLite database module for character persistence.
 *
 * Tables:
 * - characters: session_id → JSON character data
 * - names: name → session_id (unique names)
 * - credentials: session_id → password_hash (claimed accounts)
 * - names: case-insensitive name → session_id (first-come-first-serve)
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ─── Default character template (matches shared-schema.md) ─────────

function buildDefaultCharacterSave(name: string, gender: boolean): object {
  const isFemale = gender === true;
  return {
    identity: {
      name, gender, skin: 0,
      face_id: isFemale ? 21000 : 20000,
      hair_id: isFemale ? 31000 : 30000,
    },
    stats: {
      level: 1, job: "Beginner", exp: 0, max_exp: 15,
      hp: 50, max_hp: 50, mp: 5, max_mp: 5,
      speed: 100, jump: 100, meso: 0,
    },
    location: { map_id: "100000001", spawn_portal: null, facing: -1 },
    equipment: [
      { slot_type: "Coat", item_id: isFemale ? 1041002 : 1040002, item_name: "" },
      { slot_type: "Pants", item_id: isFemale ? 1061002 : 1060002, item_name: "" },
      { slot_type: "Shoes", item_id: 1072001, item_name: "" },
      { slot_type: "Weapon", item_id: 1302000, item_name: "" },
    ],
    inventory: [
      { item_id: 2000000, qty: 30, inv_type: "USE", slot: 0, category: null },
      { item_id: 2000001, qty: 15, inv_type: "USE", slot: 1, category: null },
      { item_id: 2000002, qty: 5, inv_type: "USE", slot: 2, category: null },
      { item_id: 2010000, qty: 10, inv_type: "USE", slot: 3, category: null },
      { item_id: 4000000, qty: 8, inv_type: "ETC", slot: 0, category: null },
      { item_id: 4000001, qty: 3, inv_type: "ETC", slot: 1, category: null },
    ],
    achievements: {
      mobs_killed: 0, maps_visited: [], portals_used: 0, items_looted: 0,
      max_level_reached: 1, total_damage_dealt: 0, deaths: 0, play_time_ms: 0,
    },
    version: 1,
    saved_at: new Date().toISOString(),
  };
}

// ─── Database init ──────────────────────────────────────────────────

export function initDatabase(dbPath: string = "./data/maple.db"): Database {
  // Ensure directory exists
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      session_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS names (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      session_id TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      session_id TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      claimed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return db;
}

// ─── Helpers ────────────────────────────────────────────────────────

export function saveCharacterData(db: Database, sessionId: string, data: string): void {
  // UPDATE only — new characters must go through createDefaultCharacter + reserveName
  db.prepare(
    "UPDATE characters SET data = ?, version = 1, updated_at = datetime('now') WHERE session_id = ?"
  ).run(data, sessionId);
}

/** Insert or replace a character row. Only called from createDefaultCharacter. */
export function insertCharacterData(db: Database, sessionId: string, data: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO characters (session_id, data, version, updated_at) VALUES (?, ?, 1, datetime('now'))"
  ).run(sessionId, data);
}

export function loadCharacterData(db: Database, sessionId: string): object | null {
  const row = db.prepare("SELECT data FROM characters WHERE session_id = ?").get(sessionId) as { data: string } | null;
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

export function reserveName(
  db: Database,
  sessionId: string,
  name: string
): { ok: true } | { ok: false; reason: string } {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 12) {
    return { ok: false, reason: "invalid_name" };
  }

  const existing = db.prepare("SELECT session_id FROM names WHERE name = ?").get(trimmed) as { session_id: string } | null;
  if (existing) {
    if (existing.session_id === sessionId) {
      return { ok: true }; // re-reserving own name
    }
    return { ok: false, reason: "name_taken" };
  }

  // Delete any previous name this session had
  db.prepare("DELETE FROM names WHERE session_id = ?").run(sessionId);
  db.prepare("INSERT INTO names (name, session_id) VALUES (?, ?)").run(trimmed, sessionId);
  return { ok: true };
}

/**
 * Release a name if the holder is unclaimed (no password) AND offline (no active WS).
 * Deletes the name reservation + character data for the old session.
 * Returns true if the name was freed, false if it's still protected.
 */
export function releaseUnclaimedName(
  db: Database,
  name: string,
  roomManager?: { getClient(id: string): unknown },
): boolean {
  const nameRow = db.prepare("SELECT session_id FROM names WHERE name = ?").get(name) as { session_id: string } | null;
  if (!nameRow) return false; // name doesn't exist

  const holderId = nameRow.session_id;

  // Check if the holder has claimed their account (has a password)
  const claimed = db.prepare("SELECT 1 FROM credentials WHERE session_id = ?").get(holderId);
  if (claimed) return false; // claimed accounts are permanently protected

  // Check if the holder is currently online
  if (roomManager && roomManager.getClient(holderId)) return false; // online — can't take

  // Unclaimed + offline → release the name + delete their character data
  db.prepare("DELETE FROM names WHERE session_id = ?").run(holderId);
  db.prepare("DELETE FROM characters WHERE session_id = ?").run(holderId);
  return true;
}

export function getNameBySession(db: Database, sessionId: string): string | null {
  const row = db.prepare("SELECT name FROM names WHERE session_id = ?").get(sessionId) as { name: string } | null;
  return row?.name ?? null;
}

export function createDefaultCharacter(
  db: Database,
  sessionId: string,
  name: string,
  gender: boolean
): object {
  const save = buildDefaultCharacterSave(name, gender);
  insertCharacterData(db, sessionId, JSON.stringify(save));
  reserveName(db, sessionId, name);
  return save;
}

// ─── Account claim / login ──────────────────────────────────────────

export function isAccountClaimed(db: Database, sessionId: string): boolean {
  const row = db.prepare("SELECT 1 FROM credentials WHERE session_id = ?").get(sessionId);
  return !!row;
}

export async function claimAccount(
  db: Database,
  sessionId: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!password || password.length < 4) {
    return { ok: false, reason: "password_too_short" };
  }
  if (isAccountClaimed(db, sessionId)) {
    return { ok: false, reason: "already_claimed" };
  }
  const hash = await Bun.password.hash(password, "bcrypt");
  db.prepare("INSERT INTO credentials (session_id, password_hash) VALUES (?, ?)").run(sessionId, hash);
  return { ok: true };
}

export async function loginAccount(
  db: Database,
  name: string,
  password: string,
): Promise<{ ok: true; session_id: string } | { ok: false; reason: string }> {
  const nameRow = db.prepare("SELECT session_id FROM names WHERE name = ?").get(name) as { session_id: string } | null;
  if (!nameRow) {
    return { ok: false, reason: "invalid_credentials" };
  }
  const credRow = db.prepare("SELECT password_hash FROM credentials WHERE session_id = ?").get(nameRow.session_id) as { password_hash: string } | null;
  if (!credRow) {
    return { ok: false, reason: "not_claimed" };
  }
  const valid = await Bun.password.verify(password, credRow.password_hash);
  if (!valid) {
    return { ok: false, reason: "invalid_credentials" };
  }
  return { ok: true, session_id: nameRow.session_id };
}
