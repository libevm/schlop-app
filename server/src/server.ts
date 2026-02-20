/**
 * Asset API Server — Serves processed map/mob/npc/character data.
 *
 * Phase 4, Steps 21-27.
 *
 * Uses Bun's native HTTP server for performance.
 * Implements:
 * - Health/readiness endpoints
 * - Asset entity endpoints (GET /api/v1/asset/:type/:id)
 * - Section endpoints (GET /api/v1/asset/:type/:id/:section)
 * - Batch endpoint (POST /api/v1/batch)
 * - Blob endpoint (GET /api/v1/blob/:hash)
 * - Cache headers, compression, ETag, correlation IDs
 * - Structured logging with request context
 * - Metrics collection
 */

import { initDatabase, loadCharacterData } from "./db.ts";
import { handleCharacterRequest } from "./character-api.ts";
import { RoomManager, handleClientMessage } from "./ws.ts";
import type { WSClient, WSClientData } from "./ws.ts";
import type { Database } from "bun:sqlite";

// ─── Types ──────────────────────────────────────────────────────────

export interface ServerConfig {
  port: number;
  host: string;
  /** Root directory for processed assets (index + blobs) */
  dataDir: string;
  /** Enable debug logging */
  debug: boolean;
  /** Max batch request size */
  maxBatchSize: number;
  /** Enable compression */
  compression: boolean;
  /** SQLite database path for character persistence (optional, enables character API) */
  dbPath?: string;
}

export interface ServerMetrics {
  requestCount: number;
  errorCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  totalLatencyMs: number;
  startedAt: string;
}

export interface RequestContext {
  correlationId: string;
  method: string;
  path: string;
  startTime: number;
}

// ─── Defaults ───────────────────────────────────────────────────────

export const DEFAULT_CONFIG: ServerConfig = {
  port: 5200,
  host: "0.0.0.0",
  dataDir: "./data",
  debug: false,
  maxBatchSize: 50,
  compression: true,
};

// ─── Helpers ────────────────────────────────────────────────────────

function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function jsonResponse(
  data: unknown,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  correlationId: string,
  details?: unknown
): Response {
  return jsonResponse(
    {
      ok: false,
      error: { code, message, ...(details ? { details } : {}) },
      correlationId,
    },
    status
  );
}

function successResponse(
  data: unknown,
  correlationId: string,
  meta?: Record<string, unknown>,
  cacheHeaders?: Record<string, string>
): Response {
  return jsonResponse(
    {
      ok: true,
      data,
      ...(meta ? { meta } : {}),
      correlationId,
    },
    200,
    cacheHeaders ?? {}
  );
}

// ─── Route Handlers ─────────────────────────────────────────────────

export interface DataProvider {
  /** Check if the data directory is ready */
  isReady(): boolean;
  /** Get index stats */
  getStats(): { indexEntries: number; blobCount: number; version: string };
  /** Look up an asset entity root */
  getAsset(type: string, id: string): unknown | null;
  /** Look up an asset section */
  getSection(type: string, id: string, section: string): unknown | null;
  /** Look up a blob by hash */
  getBlob(hash: string): { data: Buffer; contentType: string } | null;
  /** Validate entity type */
  isValidType(type: string): boolean;
  /** Validate section for type */
  isValidSection(type: string, section: string): boolean;
}

function handleHealth(provider: DataProvider, ctx: RequestContext): Response {
  const ready = provider.isReady();
  const stats = provider.getStats();

  return jsonResponse(
    {
      status: ready ? "healthy" : "unhealthy",
      ready,
      ...stats,
      correlationId: ctx.correlationId,
    },
    ready ? 200 : 503
  );
}

function handleAsset(
  provider: DataProvider,
  type: string,
  id: string,
  ctx: RequestContext
): Response {
  if (!provider.isValidType(type)) {
    return errorResponse("INVALID_TYPE", `Unknown entity type: ${type}`, 400, ctx.correlationId);
  }

  const data = provider.getAsset(type, id);
  if (data === null) {
    return errorResponse("NOT_FOUND", `Asset not found: ${type}/${id}`, 404, ctx.correlationId);
  }

  return successResponse(data, ctx.correlationId, { type, id }, {
    "Cache-Control": "public, max-age=300",
  });
}

function handleSection(
  provider: DataProvider,
  type: string,
  id: string,
  section: string,
  ctx: RequestContext
): Response {
  if (!provider.isValidType(type)) {
    return errorResponse("INVALID_TYPE", `Unknown entity type: ${type}`, 400, ctx.correlationId);
  }

  if (!provider.isValidSection(type, section)) {
    return errorResponse(
      "INVALID_SECTION",
      `Invalid section "${section}" for type "${type}"`,
      400,
      ctx.correlationId
    );
  }

  const data = provider.getSection(type, id, section);
  if (data === null) {
    return errorResponse(
      "NOT_FOUND",
      `Section not found: ${type}/${id}/${section}`,
      404,
      ctx.correlationId
    );
  }

  return successResponse(data, ctx.correlationId, { type, id, section }, {
    "Cache-Control": "public, max-age=300",
  });
}

function handleBlob(
  provider: DataProvider,
  hash: string,
  ctx: RequestContext
): Response {
  const blob = provider.getBlob(hash);
  if (blob === null) {
    return errorResponse("NOT_FOUND", `Blob not found: ${hash}`, 404, ctx.correlationId);
  }

  return new Response(new Uint8Array(blob.data), {
    status: 200,
    headers: {
      "Content-Type": blob.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${hash}"`,
    },
  });
}

async function handleBatch(
  provider: DataProvider,
  request: Request,
  config: ServerConfig,
  ctx: RequestContext
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_ID", "Invalid JSON body", 400, ctx.correlationId);
  }

  if (!Array.isArray(body)) {
    return errorResponse("INVALID_ID", "Batch body must be an array", 400, ctx.correlationId);
  }

  if (body.length > config.maxBatchSize) {
    return errorResponse(
      "BATCH_TOO_LARGE",
      `Batch size ${body.length} exceeds limit of ${config.maxBatchSize}`,
      400,
      ctx.correlationId
    );
  }

  const results = body.map((item: { type?: string; id?: string; section?: string }, index: number) => {
    const type = item?.type ?? "";
    const id = item?.id ?? "";
    const section = item?.section;

    if (!provider.isValidType(type)) {
      return {
        index,
        result: { ok: false, error: { code: "INVALID_TYPE", message: `Unknown type: ${type}` } },
      };
    }

    const data = section
      ? provider.getSection(type, id, section)
      : provider.getAsset(type, id);

    if (data === null) {
      return {
        index,
        result: {
          ok: false,
          error: { code: "NOT_FOUND", message: `Not found: ${type}/${id}${section ? `/${section}` : ""}` },
        },
      };
    }

    return { index, result: { ok: true, data } };
  });

  return jsonResponse({
    ok: true,
    results,
    correlationId: ctx.correlationId,
  });
}

// ─── Router ─────────────────────────────────────────────────────────

function routeRequest(
  url: URL,
  method: string,
  request: Request,
  provider: DataProvider,
  config: ServerConfig,
  metrics: ServerMetrics,
  ctx: RequestContext,
  db: Database | null,
  roomManager?: RoomManager,
): Response | Promise<Response> {
  const path = url.pathname;

  // CORS preflight
  if (method === "OPTIONS") {
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

  // Character API (separate middleware)
  if (db && path.startsWith("/api/character/")) {
    return handleCharacterRequest(request, url, db, roomManager).then((resp) => {
      if (resp) return resp;
      return errorResponse("NOT_FOUND", `Route not found: ${method} ${path}`, 404, ctx.correlationId);
    });
  }

  // Health endpoints
  if (path === "/health" || path === "/ready") {
    return handleHealth(provider, ctx);
  }

  // Metrics endpoint
  if (path === "/metrics") {
    const uptime = Date.now() - new Date(metrics.startedAt).getTime();
    return jsonResponse({
      ...metrics,
      uptimeMs: uptime,
      avgLatencyMs: metrics.requestCount > 0
        ? Math.round(metrics.totalLatencyMs / metrics.requestCount)
        : 0,
    });
  }

  // API v1 routes
  if (path.startsWith("/api/v1/")) {
    const segments = path.slice("/api/v1/".length).split("/").filter(Boolean);

    // POST /api/v1/batch
    if (method === "POST" && segments[0] === "batch") {
      return handleBatch(provider, request, config, ctx);
    }

    // GET /api/v1/blob/:hash
    if (method === "GET" && segments[0] === "blob" && segments[1]) {
      return handleBlob(provider, segments[1], ctx);
    }

    // GET /api/v1/asset/:type/:id/:section?
    if (method === "GET" && segments[0] === "asset" && segments[1] && segments[2]) {
      if (segments[3]) {
        return handleSection(provider, segments[1], segments[2], segments[3], ctx);
      }
      return handleAsset(provider, segments[1], segments[2], ctx);
    }
  }

  return errorResponse("NOT_FOUND", `Route not found: ${method} ${path}`, 404, ctx.correlationId);
}

// ─── Server Factory ─────────────────────────────────────────────────

export function createServer(
  provider: DataProvider,
  config: Partial<ServerConfig> = {}
): { start: () => ReturnType<typeof Bun.serve>; metrics: ServerMetrics } {
  const cfg: ServerConfig = { ...DEFAULT_CONFIG, ...config };

  const metrics: ServerMetrics = {
    requestCount: 0,
    errorCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
    totalLatencyMs: 0,
    startedAt: new Date().toISOString(),
  };

  function start() {
    // Initialize character database if dbPath is configured
    const db: Database | null = cfg.dbPath ? initDatabase(cfg.dbPath) : null;

    // Room manager for WebSocket multiplayer
    const roomManager = new RoomManager();
    if (db) roomManager.start();
    roomManager.startDropSweep();

    const server = Bun.serve<WSClientData>({
      port: cfg.port,
      hostname: cfg.host,

      async fetch(request: Request, server): Promise<Response> {
        const startTime = performance.now();
        const correlationId = generateCorrelationId();
        const url = new URL(request.url);
        const method = request.method;

        // WebSocket upgrade
        if (url.pathname === "/ws") {
          const upgraded = server.upgrade(request, {
            data: { authenticated: false, client: null } as WSClientData,
          });
          if (upgraded) return undefined as unknown as Response;
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        const ctx: RequestContext = {
          correlationId,
          method,
          path: url.pathname,
          startTime,
        };

        metrics.requestCount++;

        try {
          const response = await routeRequest(url, method, request, provider, cfg, metrics, ctx, db, roomManager);
          const elapsed = performance.now() - startTime;
          metrics.totalLatencyMs += elapsed;

          if (response.status >= 400) {
            metrics.errorCount++;
          }

          if (cfg.debug) {
            console.log(
              `[${correlationId}] ${method} ${url.pathname} -> ${response.status} (${elapsed.toFixed(1)}ms)`
            );
          }

          // Add CORS and correlation headers
          response.headers.set("X-Correlation-Id", correlationId);
          response.headers.set("Access-Control-Allow-Origin", "*");

          return response;
        } catch (err) {
          metrics.errorCount++;
          const elapsed = performance.now() - startTime;
          metrics.totalLatencyMs += elapsed;

          console.error(`[${correlationId}] ${method} ${url.pathname} ERROR:`, err);

          return errorResponse(
            "INTERNAL_ERROR",
            "Internal server error",
            500,
            correlationId
          );
        }
      },

      websocket: {
        open(_ws) {
          // Wait for auth message — no action on open
        },

        message(ws, raw) {
          const data = ws.data;
          let parsed: { type: string; [key: string]: unknown };
          try {
            parsed = JSON.parse(String(raw));
          } catch {
            return;
          }

          if (!data.authenticated) {
            // First message must be: { type: "auth", session_id: "..." }
            if (parsed.type !== "auth" || !parsed.session_id) {
              ws.close(4001, "First message must be auth");
              return;
            }

            const sessionId = parsed.session_id as string;

            // Load character from DB (or create default if none exists)
            if (!db) {
              ws.close(4005, "No database configured");
              return;
            }

            const charData = loadCharacterData(db, sessionId) as {
              identity: { name: string; face_id: number; hair_id: number; skin: number };
              location: { map_id: string };
              equipment: Array<{ slot_type: string; item_id: number }>;
            } | null;

            if (!charData) {
              ws.close(4002, "No character found");
              return;
            }

            // Reject if this session is already connected
            if (roomManager.getClient(sessionId)) {
              ws.close(4006, "Already logged in");
              return;
            }

            const client: WSClient = {
              id: sessionId,
              name: charData.identity.name,
              mapId: charData.location.map_id || "100000001",
              ws,
              x: 0,
              y: 0,
              action: "stand1",
              facing: -1,
              look: {
                face_id: charData.identity.face_id,
                hair_id: charData.identity.hair_id,
                skin: charData.identity.skin,
                equipment: charData.equipment || [],
              },
              lastActivityMs: Date.now(),
            };

            data.authenticated = true;
            data.client = client;
            roomManager.addClient(client);

            // Send map_state to the new client (players + drops + mob authority)
            const players = roomManager.getMapState(client.mapId)
              .filter(p => p.id !== sessionId);
            const drops = roomManager.getDrops(client.mapId);
            const isMobAuthority = roomManager.mobAuthority.get(client.mapId) === sessionId;
            ws.send(JSON.stringify({ type: "map_state", players, drops, mob_authority: isMobAuthority }));

            // Broadcast player_enter to the room (exclude self)
            roomManager.broadcastToRoom(client.mapId, {
              type: "player_enter",
              id: client.id,
              name: client.name,
              x: client.x,
              y: client.y,
              action: client.action,
              facing: client.facing,
              look: client.look,
            }, client.id);

            if (cfg.debug) {
              console.log(`[WS] ${client.name} (${client.id.slice(0, 8)}) connected → map ${client.mapId}`);
            }
            return;
          }

          // Authenticated — handle game message
          if (data.client) {
            data.client.lastActivityMs = Date.now();
            handleClientMessage(data.client, parsed, roomManager, db);
          }
        },

        close(ws) {
          const data = ws.data;
          if (data?.client) {
            if (cfg.debug) {
              console.log(`[WS] ${data.client.name} (${data.client.id.slice(0, 8)}) disconnected`);
            }
            roomManager.removeClient(data.client.id);
          }
        },
      },
    });

    return Object.assign(server, { roomManager });
  }

  return { start, metrics };
}
