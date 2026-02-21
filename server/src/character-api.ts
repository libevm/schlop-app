/**
 * Character API middleware — handles /api/character/* routes.
 *
 * Endpoints:
 * - POST /api/character/create  → create character with name + gender
 * - GET  /api/character/load    → load character data
 * - POST /api/character/save    → save character data
 * - POST /api/character/claim   → set password on character
 * - GET  /api/character/claimed → check if character has a password
 * - POST /api/character/login   → login with name + password → new session
 *
 * Session IDs are transient auth tokens. Character name is the permanent identifier.
 */
import type { Database } from "bun:sqlite";
import type { RoomManager } from "./ws.ts";
import {
  resolveSession,
  createSession,
  saveCharacterData,
  loadCharacterData,
  characterExists,
  createDefaultCharacter,
  isNameAvailable,
  isAccountClaimed,
  claimAccount,
  loginAccount,
  appendLog,
} from "./db.ts";
import { isSessionValid, touchSession, registerSession } from "./pow.ts";

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractClientIp(request: Request): string {
  const fwdFor = request.headers.get("x-forwarded-for");
  return fwdFor ? fwdFor.split(",")[0].trim() : "";
}

function extractSessionId(request: Request, url: URL): string | null {
  const auth = request.headers.get("Authorization");
  if (auth) {
    const parts = auth.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      const token = parts[1].trim();
      if (token.length > 0) return token;
    }
  }
  // Fallback: query param (for sendBeacon)
  const qs = url.searchParams.get("session");
  return qs && qs.length > 0 ? qs : null;
}

// ─── Handler ────────────────────────────────────────────────────────

export async function handleCharacterRequest(
  request: Request,
  url: URL,
  db: Database,
  roomManager?: RoomManager,
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === "OPTIONS" && path.startsWith("/api/character/")) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (!path.startsWith("/api/character/")) return null;

  // Login doesn't require auth
  if (method === "POST" && path === "/api/character/login") {
    return handleLogin(request, db);
  }

  // All other endpoints require a session
  const sessionId = extractSessionId(request, url);
  if (!sessionId) {
    return jsonResponse(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" } },
      401,
    );
  }

  // Validate the session was server-issued and hasn't expired (7-day inactivity)
  if (!isSessionValid(db, sessionId)) {
    return jsonResponse(
      { ok: false, error: { code: "SESSION_EXPIRED", message: "Session invalid or expired — please refresh to get a new session" } },
      401,
    );
  }
  touchSession(db, sessionId);

  // Resolve session → character name (null for new sessions)
  const characterName = resolveSession(db, sessionId);

  // ── POST /api/character/create ──
  if (method === "POST" && path === "/api/character/create") {
    return handleCreate(request, db, sessionId, characterName, roomManager);
  }

  // All remaining endpoints require an existing character
  if (!characterName) {
    return jsonResponse(
      { ok: false, error: { code: "NOT_FOUND", message: "No character found for this session" } },
      404,
    );
  }

  if (method === "GET" && path === "/api/character/load") {
    return handleLoad(db, characterName);
  }
  if (method === "POST" && path === "/api/character/save") {
    return handleSave(request, db, characterName);
  }
  if (method === "POST" && path === "/api/character/claim") {
    return handleClaim(request, db, characterName);
  }
  if (method === "GET" && path === "/api/character/claimed") {
    return jsonResponse({ ok: true, claimed: isAccountClaimed(db, characterName) });
  }

  return null;
}

// ─── Endpoint handlers ──────────────────────────────────────────────

async function handleCreate(
  request: Request,
  db: Database,
  sessionId: string,
  existingName: string | null,
  roomManager?: RoomManager,
): Promise<Response> {
  // Reject if this session already has a character
  if (existingName) {
    return jsonResponse(
      { ok: false, error: { code: "ALREADY_EXISTS", message: "Character already exists for this session" } },
      409,
    );
  }

  let body: { name?: string; gender?: boolean };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
      400,
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const gender = body.gender === true;

  if (name.length < 2 || name.length > 12) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_NAME", message: "Name must be 2-12 characters" } },
      400,
    );
  }

  if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_NAME", message: "Name contains invalid characters" } },
      400,
    );
  }

  if (!isNameAvailable(db, name, roomManager)) {
    return jsonResponse(
      { ok: false, error: { code: "NAME_TAKEN", message: "That name is already taken" } },
      409,
    );
  }

  const save = createDefaultCharacter(db, sessionId, name, gender) as Record<string, any>;
  // Inject name into response identity (not stored in data blob)
  if (save.identity) save.identity.name = name;
  appendLog(db, name, `character created (gender: ${gender ? "female" : "male"})`, extractClientIp(request));
  return jsonResponse({ ok: true, data: save, name }, 201);
}

function handleLoad(db: Database, characterName: string): Response {
  const data = loadCharacterData(db, characterName) as Record<string, any> | null;
  if (!data) {
    return jsonResponse(
      { ok: false, error: { code: "NOT_FOUND", message: "No character data found" } },
      404,
    );
  }
  // Inject name from DB key (not stored in data blob)
  if (data.identity) data.identity.name = characterName;
  return jsonResponse({ ok: true, data, name: characterName });
}

async function handleSave(request: Request, db: Database, characterName: string): Promise<Response> {
  let body: unknown;
  const contentType = request.headers.get("Content-Type") || "";
  try {
    if (contentType.includes("application/json") || contentType.includes("text/plain")) {
      body = await request.json();
    } else {
      const text = await request.text();
      body = JSON.parse(text);
    }
  } catch {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
      400,
    );
  }

  if (!body || typeof body !== "object" || !("version" in body)) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_BODY", message: "Missing version field" } },
      400,
    );
  }

  // Preserve server-authoritative achievements
  const existing = loadCharacterData(db, characterName);
  if (!existing) {
    return jsonResponse(
      { ok: false, error: { code: "NOT_FOUND", message: "No character exists — use /api/character/create first" } },
      404,
    );
  }

  const existingData = existing as Record<string, any>;
  const bodyObj = body as Record<string, any>;
  if (existingData.achievements && typeof existingData.achievements === "object") {
    if (!bodyObj.achievements || typeof bodyObj.achievements !== "object") bodyObj.achievements = {};
    const serverJq = existingData.achievements.jq_quests;
    const clientJq = bodyObj.achievements.jq_quests;
    if (serverJq && typeof serverJq === "object") {
      if (!clientJq || typeof clientJq !== "object") {
        bodyObj.achievements.jq_quests = { ...serverJq };
      } else {
        for (const [k, v] of Object.entries(serverJq)) {
          const sv = Number(v) || 0;
          const cv = Number(clientJq[k]) || 0;
          bodyObj.achievements.jq_quests[k] = Math.max(sv, cv);
        }
      }
    }
  }

  // Strip name from identity before persisting (name lives in DB key, not data blob)
  if (bodyObj.identity && typeof bodyObj.identity === "object") {
    delete bodyObj.identity.name;
  }

  saveCharacterData(db, characterName, JSON.stringify(bodyObj));
  return jsonResponse({ ok: true });
}

async function handleClaim(request: Request, db: Database, characterName: string): Promise<Response> {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
      400,
    );
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 4) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_PASSWORD", message: "Password must be at least 4 characters" } },
      400,
    );
  }

  const result = await claimAccount(db, characterName, password);
  if (!result.ok) {
    const msg = result.reason === "already_claimed" ? "Account is already claimed" : "Could not claim account";
    return jsonResponse(
      { ok: false, error: { code: "ALREADY_CLAIMED", message: msg } },
      409,
    );
  }
  appendLog(db, characterName, "claimed account (set password)", extractClientIp(request));
  return jsonResponse({ ok: true });
}

async function handleLogin(request: Request, db: Database): Promise<Response> {
  let body: { name?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
      400,
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || !password) {
    return jsonResponse(
      { ok: false, error: { code: "INVALID_BODY", message: "Name and password are required" } },
      400,
    );
  }

  const result = await loginAccount(db, name, password);
  if (!result.ok) {
    const msg = result.reason === "not_claimed"
      ? "This account has not been claimed yet"
      : "Invalid username or password";
    appendLog(db, name, `login failed (${result.reason})`, extractClientIp(request));
    return jsonResponse(
      { ok: false, error: { code: "INVALID_CREDENTIALS", message: msg } },
      401,
    );
  }
  appendLog(db, name, "logged in", extractClientIp(request));
  return jsonResponse({ ok: true, session_id: result.session_id });
}
