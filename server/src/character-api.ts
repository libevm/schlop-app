/**
 * Character API middleware — handles /api/character/* routes.
 *
 * Endpoints:
 * - POST /api/character/create  → create character with name + gender
 * - GET  /api/character/load    → load character data
 * - POST /api/character/save    → save character data
 * - POST /api/character/name    → reserve a name
 */
import type { Database } from "bun:sqlite";
import type { RoomManager } from "./ws.ts";
import {
  saveCharacterData,
  loadCharacterData,
  reserveName,
  createDefaultCharacter,
  isAccountClaimed,
  claimAccount,
  loginAccount,
  releaseUnclaimedName,
  getJqLeaderboard,
  getAllJqLeaderboards,
} from "./db.ts";

// ─── Helpers ────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractSessionId(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  const token = parts[1].trim();
  return token.length > 0 ? token : null;
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

  // Only handle /api/character/* routes
  if (!path.startsWith("/api/character/")) return null;

  // Login endpoint doesn't require auth (it IS the auth)
  if (method === "POST" && path === "/api/character/login") {
    // Handled below — skip auth check
  } else {
    // Extract session ID from header or query param (sendBeacon can't set headers)
    const sessionIdCheck = extractSessionId(request) || url.searchParams.get("session");
    if (!sessionIdCheck) {
      return jsonResponse(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" } },
        401,
      );
    }
  }

  // Session ID used by most endpoints (may be null for login)
  const sessionId = extractSessionId(request) || url.searchParams.get("session") || "";

  // ── POST /api/character/create ──
  if (method === "POST" && path === "/api/character/create") {
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

    // Check if name is available — if taken by an unclaimed + offline session, reclaim it
    let nameResult = reserveName(db, sessionId, name);
    if (!nameResult.ok) {
      // Name is taken — check if the holder is unclaimed AND offline
      const released = releaseUnclaimedName(db, name, roomManager);
      if (released) {
        // Name was freed — try reserving again
        nameResult = reserveName(db, sessionId, name);
      }
      if (!nameResult.ok) {
        return jsonResponse(
          { ok: false, error: { code: "NAME_TAKEN", message: "That name is already taken" } },
          409,
        );
      }
    }

    // Create default character
    const save = createDefaultCharacter(db, sessionId, name, gender);
    return jsonResponse({ ok: true, data: save }, 201);
  }

  // ── GET /api/character/load ──
  if (method === "GET" && path === "/api/character/load") {
    const data = loadCharacterData(db, sessionId);
    if (!data) {
      return jsonResponse(
        { ok: false, error: { code: "NOT_FOUND", message: "No character found for this session" } },
        404,
      );
    }
    return jsonResponse({ ok: true, data });
  }

  // ── POST /api/character/save ──
  if (method === "POST" && path === "/api/character/save") {
    let body: unknown;

    // Support both JSON and sendBeacon (which sends text/plain)
    const contentType = request.headers.get("Content-Type") || "";
    try {
      if (contentType.includes("application/json") || contentType.includes("text/plain")) {
        body = await request.json();
      } else {
        // Try parsing as JSON regardless
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

    // Only allow saving if character already exists (created via /api/character/create)
    const existing = loadCharacterData(db, sessionId);
    if (!existing) {
      return jsonResponse(
        { ok: false, error: { code: "NOT_FOUND", message: "No character exists — use /api/character/create first" } },
        404,
      );
    }

    // Preserve server-authoritative achievements — client save must not overwrite them
    const existingData = existing as Record<string, any>;
    const bodyObj = body as Record<string, any>;
    if (existingData.achievements && typeof existingData.achievements === "object") {
      // Merge: keep server jq_quests (take max), preserve client structure
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

    saveCharacterData(db, sessionId, JSON.stringify(bodyObj));
    return jsonResponse({ ok: true });
  }

  // ── POST /api/character/name ──
  if (method === "POST" && path === "/api/character/name") {
    let body: { name?: string };
    try {
      body = await request.json();
    } catch {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_BODY", message: "Invalid JSON body" } },
        400,
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 12) {
      return jsonResponse(
        { ok: false, error: { code: "INVALID_NAME", message: "Name must be 2-12 characters" } },
        400,
      );
    }

    const result = reserveName(db, sessionId, name);
    if (!result.ok) {
      return jsonResponse(
        { ok: false, error: { code: "NAME_TAKEN", message: "That name is already taken" } },
        409,
      );
    }
    return jsonResponse({ ok: true });
  }

  // ── POST /api/character/claim ──
  if (method === "POST" && path === "/api/character/claim") {
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

    const result = await claimAccount(db, sessionId, password);
    if (!result.ok) {
      const msg = result.reason === "already_claimed" ? "Account is already claimed" : "Could not claim account";
      return jsonResponse(
        { ok: false, error: { code: "ALREADY_CLAIMED", message: msg } },
        409,
      );
    }
    return jsonResponse({ ok: true });
  }

  // ── GET /api/character/claimed ──
  if (method === "GET" && path === "/api/character/claimed") {
    return jsonResponse({ ok: true, claimed: isAccountClaimed(db, sessionId) });
  }

  // ── POST /api/character/login (no auth required — this IS the auth) ──
  if (method === "POST" && path === "/api/character/login") {
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
      return jsonResponse(
        { ok: false, error: { code: "INVALID_CREDENTIALS", message: msg } },
        401,
      );
    }
    return jsonResponse({ ok: true, session_id: result.session_id });
  }

  // Unknown /api/character/ route
  return null;
}
