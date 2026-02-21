/**
 * SQLite database module for character persistence.
 *
 * Tables:
 * - sessions: session_id → character_name (transient auth tokens)
 * - characters: name (NOCASE) → JSON character data
 * - credentials: name (NOCASE) → password_hash (claimed accounts)
 * - jq_leaderboard: (player_name, quest_name) → completions
 * - logs: append-only action log (username, timestamp, action blob)
 *
 * Session IDs are transient auth tokens. Character name is the permanent identifier.
 * On logout the session is destroyed; on login a new session is created.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ─── Default character template (matches shared-schema.md) ─────────

function buildDefaultCharacterSave(name: string, gender: boolean): object {
  const isFemale = gender === true;
  return {
    identity: {
      gender, skin: 0,
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
      { item_id: 3010000, qty: 1, inv_type: "SETUP", slot: 0, category: null },
    ],
    achievements: {},
    version: 1,
    saved_at: new Date().toISOString(),
  };
}

// ─── Database init ──────────────────────────────────────────────────

export function initDatabase(dbPath: string = "./data/maple.db"): Database {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");

  // ── Sessions: transient auth tokens → character name ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      character_name TEXT NOT NULL COLLATE NOCASE,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Characters: keyed by name (permanent identifier) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      data TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      gm INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: add gm column if missing (existing DBs)
  try {
    db.exec("ALTER TABLE characters ADD COLUMN gm INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already exists — ignore
  }

  // ── Credentials: keyed by name ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      claimed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── JQ Leaderboard ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS jq_leaderboard (
      player_name TEXT NOT NULL COLLATE NOCASE,
      quest_name TEXT NOT NULL,
      completions INTEGER NOT NULL DEFAULT 0,
      best_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (player_name, quest_name)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_jq_leaderboard_quest
    ON jq_leaderboard (quest_name, completions DESC)
  `);

  // ── Logs: append-only action log ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      action TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT ''
    )
  `);

  // Migration: add ip column if missing (existing DBs)
  try {
    db.exec("ALTER TABLE logs ADD COLUMN ip TEXT NOT NULL DEFAULT ''");
  } catch {
    // Column already exists — ignore
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_username
    ON logs (username, timestamp DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp
    ON logs (timestamp DESC)
  `);

  // ── Migration: old session_id-keyed schema → name-keyed schema ──
  migrateToNameKeyed(db);

  return db;
}

function migrateToNameKeyed(db: Database): void {
  // Check if old 'names' table exists (indicator of old schema)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
  const hasNamesTable = tables.some(t => t.name === "names");
  if (!hasNamesTable) return;

  // Check if old characters table uses session_id as PK
  const charCols = db.prepare("PRAGMA table_info(characters)").all() as Array<{ name: string; pk: number }>;
  const oldSchema = charCols.some(c => c.name === "session_id" && c.pk === 1);
  if (!oldSchema) {
    // Already migrated or fresh — just drop names table
    db.exec("DROP TABLE IF EXISTS names");
    return;
  }

  // Migrate data: old characters (session_id PK) → new characters (name PK)
  const oldNames = db.prepare("SELECT name, session_id FROM names").all() as Array<{ name: string; session_id: string }>;

  // Create temp new table
  db.exec(`
    CREATE TABLE IF NOT EXISTS characters_new (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      data TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials_new (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      claimed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  for (const row of oldNames) {
    // Migrate character data
    const charRow = db.prepare("SELECT data, version, updated_at FROM characters WHERE session_id = ?").get(row.session_id) as { data: string; version: number; updated_at: string } | null;
    if (charRow) {
      db.prepare("INSERT OR IGNORE INTO characters_new (name, data, version, updated_at) VALUES (?, ?, ?, ?)").run(row.name, charRow.data, charRow.version, charRow.updated_at);
    }

    // Migrate credentials
    const credRow = db.prepare("SELECT password_hash, claimed_at FROM credentials WHERE session_id = ?").get(row.session_id) as { password_hash: string; claimed_at: string } | null;
    if (credRow) {
      db.prepare("INSERT OR IGNORE INTO credentials_new (name, password_hash, claimed_at) VALUES (?, ?, ?)").run(row.name, credRow.password_hash, credRow.claimed_at);
    }

    // Create a session mapping so existing clients can still connect
    db.prepare("INSERT OR IGNORE INTO sessions (session_id, character_name) VALUES (?, ?)").run(row.session_id, row.name);
  }

  // Swap tables
  db.exec("DROP TABLE characters");
  db.exec("ALTER TABLE characters_new RENAME TO characters");
  db.exec("DROP TABLE credentials");
  db.exec("ALTER TABLE credentials_new RENAME TO credentials");
  db.exec("DROP TABLE names");
}

// ─── Session helpers ────────────────────────────────────────────────

/** Resolve a session_id to a character name. Returns null if session doesn't exist. */
export function resolveSession(db: Database, sessionId: string): string | null {
  const row = db.prepare("SELECT character_name FROM sessions WHERE session_id = ?").get(sessionId) as { character_name: string } | null;
  return row?.character_name ?? null;
}

/** Create a new session for a character. Returns the session_id. */
export function createSession(db: Database, sessionId: string, characterName: string): void {
  // Delete any existing session for this session_id
  db.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
  db.prepare("INSERT INTO sessions (session_id, character_name) VALUES (?, ?)").run(sessionId, characterName);
}

/** Delete a session (logout). */
export function deleteSession(db: Database, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
}

/** Check if a character name is online (has any active WS connection via roomManager). */
function isCharacterOnline(name: string, roomManager?: { getClient(id: string): unknown }, db?: Database): boolean {
  if (!roomManager || !db) return false;
  // Find all sessions for this character name
  const sessions = db.prepare("SELECT session_id FROM sessions WHERE character_name COLLATE NOCASE = ?").all(name) as Array<{ session_id: string }>;
  return sessions.some(s => !!roomManager.getClient(s.session_id));
}

// ─── GM helpers ─────────────────────────────────────────────────────

/** Check if a character has GM privileges. */
export function isGm(db: Database, name: string): boolean {
  const row = db.prepare("SELECT gm FROM characters WHERE name COLLATE NOCASE = ?").get(name) as { gm: number } | null;
  return row?.gm === 1;
}

/** Set or remove GM privileges for a character. */
export function setGm(db: Database, name: string, gm: boolean): void {
  db.prepare("UPDATE characters SET gm = ? WHERE name COLLATE NOCASE = ?").run(gm ? 1 : 0, name);
}

// ─── Character CRUD ─────────────────────────────────────────────────

export function saveCharacterData(db: Database, name: string, data: string): void {
  db.prepare(
    "UPDATE characters SET data = ?, version = 1, updated_at = datetime('now') WHERE name COLLATE NOCASE = ?"
  ).run(data, name);
}

export function insertCharacterData(db: Database, name: string, data: string): void {
  db.prepare(
    "INSERT OR REPLACE INTO characters (name, data, version, updated_at) VALUES (?, ?, 1, datetime('now'))"
  ).run(name, data);
}

export function loadCharacterData(db: Database, name: string): object | null {
  const row = db.prepare("SELECT data FROM characters WHERE name COLLATE NOCASE = ?").get(name) as { data: string } | null;
  if (!row) return null;
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

/** Check if a character name already exists. */
export function characterExists(db: Database, name: string): boolean {
  const row = db.prepare("SELECT 1 FROM characters WHERE name COLLATE NOCASE = ?").get(name);
  return !!row;
}

/** Create a new character with default equipment/stats. */
export function createDefaultCharacter(
  db: Database,
  sessionId: string,
  name: string,
  gender: boolean,
): object {
  const save = buildDefaultCharacterSave(name, gender);
  insertCharacterData(db, name, JSON.stringify(save));
  createSession(db, sessionId, name);
  return save;
}

// ─── Name availability ──────────────────────────────────────────────

/**
 * Check if a name is available for a new character.
 * A name is taken if a character with that name exists.
 * If the character is unclaimed (no password) and offline, it can be reclaimed.
 */
export function isNameAvailable(
  db: Database,
  name: string,
  roomManager?: { getClient(id: string): unknown },
): boolean {
  if (!characterExists(db, name)) return true;

  // Character exists — check if it's claimable (unclaimed + offline)
  const isClaimed = isAccountClaimed(db, name);
  if (isClaimed) return false;

  const online = isCharacterOnline(name, roomManager, db);
  if (online) return false;

  // Unclaimed + offline → release the character
  db.prepare("DELETE FROM characters WHERE name COLLATE NOCASE = ?").run(name);
  db.prepare("DELETE FROM sessions WHERE character_name COLLATE NOCASE = ?").run(name);
  return true;
}

// ─── JQ Leaderboard ─────────────────────────────────────────────────

export function incrementJqLeaderboard(db: Database, playerName: string, questName: string): void {
  db.prepare(`
    INSERT INTO jq_leaderboard (player_name, quest_name, completions, best_at)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT (player_name, quest_name)
    DO UPDATE SET completions = completions + 1, best_at = datetime('now')
  `).run(playerName, questName);
}

export function getJqLeaderboard(
  db: Database,
  questName: string,
  limit: number = 50,
): Array<{ name: string; completions: number }> {
  return db.prepare(`
    SELECT player_name AS name, completions
    FROM jq_leaderboard
    WHERE quest_name = ?
    ORDER BY completions DESC, best_at ASC
    LIMIT ?
  `).all(questName, limit) as Array<{ name: string; completions: number }>;
}

export function getAllJqLeaderboards(
  db: Database,
  limitPerQuest: number = 50,
): Record<string, Array<{ name: string; completions: number }>> {
  const rows = db.prepare(`
    SELECT quest_name, player_name AS name, completions
    FROM jq_leaderboard
    ORDER BY quest_name, completions DESC, best_at ASC
  `).all() as Array<{ quest_name: string; name: string; completions: number }>;

  const result: Record<string, Array<{ name: string; completions: number }>> = {};
  for (const row of rows) {
    if (!result[row.quest_name]) result[row.quest_name] = [];
    if (result[row.quest_name].length < limitPerQuest) {
      result[row.quest_name].push({ name: row.name, completions: row.completions });
    }
  }
  return result;
}

// ─── Action Logging ─────────────────────────────────────────────────

/**
 * Append an action to the logs table (append-only audit trail).
 *
 * @param db       Database instance
 * @param username Character name performing the action
 * @param action   Freeform action description (e.g. "entered map 100000001",
 *                 "dropped Red Potion x5", "completed Shumi's Lost Coin")
 * @param ip       IP address of the client (empty string if unknown)
 */
export function appendLog(db: Database, username: string, action: string, ip: string = ""): void {
  try {
    db.prepare(
      "INSERT INTO logs (username, timestamp, action, ip) VALUES (?, datetime('now'), ?, ?)"
    ).run(username, action, ip);
  } catch (e) {
    // Never let logging failures crash the server
    console.error(`[logs] Failed to append log for ${username}: ${e}`);
  }
}

// ─── Account claim / login ──────────────────────────────────────────

export function isAccountClaimed(db: Database, name: string): boolean {
  const row = db.prepare("SELECT 1 FROM credentials WHERE name COLLATE NOCASE = ?").get(name);
  return !!row;
}

export async function claimAccount(
  db: Database,
  name: string,
  password: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!password || password.length < 4) {
    return { ok: false, reason: "password_too_short" };
  }
  if (isAccountClaimed(db, name)) {
    return { ok: false, reason: "already_claimed" };
  }
  const hash = await Bun.password.hash(password, "bcrypt");
  db.prepare("INSERT INTO credentials (name, password_hash) VALUES (?, ?)").run(name, hash);
  return { ok: true };
}

export async function loginAccount(
  db: Database,
  name: string,
  password: string,
): Promise<{ ok: true; session_id: string } | { ok: false; reason: string }> {
  // Check character exists
  if (!characterExists(db, name)) {
    return { ok: false, reason: "invalid_credentials" };
  }
  // Check credentials
  const credRow = db.prepare("SELECT password_hash FROM credentials WHERE name COLLATE NOCASE = ?").get(name) as { password_hash: string } | null;
  if (!credRow) {
    return { ok: false, reason: "not_claimed" };
  }
  const valid = await Bun.password.verify(password, credRow.password_hash);
  if (!valid) {
    return { ok: false, reason: "invalid_credentials" };
  }
  // Generate a new session_id for this login and register it as valid
  const { registerSession } = await import("./pow.ts");
  const newSessionId = crypto.randomUUID();
  registerSession(db, newSessionId);
  createSession(db, newSessionId, name);
  return { ok: true, session_id: newSessionId };
}
