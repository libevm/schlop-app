/**
 * Online client server — serves the MapleStory web client with server connectivity.
 * Proxies /api/* and /ws to the game server, serves static files locally.
 *
 * Designed to run behind Caddy (or similar reverse proxy) which handles TLS
 * and compression. This server adds: security headers, proper cache-control,
 * ETag support, method allowlisting, and hardened error handling.
 *
 * Usage: bun run client:online
 * Env:
 *   CLIENT_WEB_HOST      (default 127.0.0.1)
 *   CLIENT_WEB_PORT      (default 5173)
 *   GAME_SERVER_URL      (default http://127.0.0.1:5200)
 *   ALLOWED_ORIGIN       (default "" — reflect request origin; set to lock down CORS)
 *   PROXY_TIMEOUT_MS     (default 10000)
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

/* ─── Config ──────────────────────────────────────────────────────────────── */

const host = process.env.CLIENT_WEB_HOST ?? "127.0.0.1";
const requestedPort = Number(process.env.CLIENT_WEB_PORT ?? "5173");
const gameServerUrl = process.env.GAME_SERVER_URL ?? "http://127.0.0.1:5200";
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "";
const proxyTimeoutMs = Number(process.env.PROXY_TIMEOUT_MS ?? "10000");

const repoRoot = normalize(join(import.meta.dir, "..", ".."));
const webRoot = join(repoRoot, "client", "web");
const resourcesRoot = join(repoRoot, "resources");
const resourcesV2Root = join(repoRoot, "resourcesv2");

/* ─── Security headers applied to every response ─────────────────────────── */

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
};

function applySecurityHeaders(headers) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
}

/* ─── Content types ───────────────────────────────────────────────────────── */

const CONTENT_TYPE_MAP = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function getContentType(path) {
  return CONTENT_TYPE_MAP[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/* ─── Cache policy ────────────────────────────────────────────────────────── */

/**
 * - HTML: must-revalidate every request (always get latest index.html)
 * - Game resources (images, audio, JSON data): immutable game data, cache 7 days
 * - JS/CSS/other static: cache 1 hour with revalidation
 */
function getCacheControl(pathname, ext) {
  if (ext === ".html") return "no-cache";
  if (pathname.startsWith("/resources/") || pathname.startsWith("/resourcesv2/")) {
    return "public, max-age=604800, immutable";
  }
  return "public, max-age=3600, must-revalidate";
}

/* ─── ETag support ────────────────────────────────────────────────────────── */

function makeETag(stat) {
  return `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;
}

/* ─── Path safety ─────────────────────────────────────────────────────────── */

function safeJoin(base, relativePath) {
  // Block null bytes
  if (relativePath.includes("\0")) throw new Error("Unsafe path");
  const resolved = normalize(join(base, relativePath));
  if (!resolved.startsWith(base)) throw new Error("Unsafe path");
  return resolved;
}

/* ─── File serving ────────────────────────────────────────────────────────── */

function serveFile(filePath, pathname, request) {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return notFound();
  }
  if (!stat.isFile()) return notFound();

  const etag = makeETag(stat);
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    const headers = new Headers({ etag });
    applySecurityHeaders(headers);
    return new Response(null, { status: 304, headers });
  }

  const ext = extname(filePath).toLowerCase();
  const headers = new Headers({
    "content-type": getContentType(filePath),
    "content-length": String(stat.size),
    "cache-control": getCacheControl(pathname, ext),
    "etag": etag,
  });
  applySecurityHeaders(headers);

  const body = readFileSync(filePath);
  return new Response(body, { status: 200, headers });
}

/* ─── Standard error responses ────────────────────────────────────────────── */

function notFound() {
  const headers = new Headers({ "content-type": "text/plain" });
  applySecurityHeaders(headers);
  return new Response("Not Found", { status: 404, headers });
}

function badRequest() {
  const headers = new Headers({ "content-type": "text/plain" });
  applySecurityHeaders(headers);
  return new Response("Bad Request", { status: 400, headers });
}

function methodNotAllowed() {
  const headers = new Headers({
    "content-type": "text/plain",
    "allow": "GET, HEAD",
  });
  applySecurityHeaders(headers);
  return new Response("Method Not Allowed", { status: 405, headers });
}

/* ─── API proxy ───────────────────────────────────────────────────────────── */

function resolveOrigin(request) {
  if (allowedOrigin) return allowedOrigin;
  return request.headers.get("origin") ?? "*";
}

async function proxyToGameServer(request, pathname) {
  const targetUrl = `${gameServerUrl}${pathname}`;
  const origin = resolveOrigin(request);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    const headers = new Headers({
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": request.headers.get("access-control-request-headers") ?? "content-type, authorization",
      "access-control-max-age": "86400",
    });
    applySecurityHeaders(headers);
    return new Response(null, { status: 204, headers });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), proxyTimeoutMs);

    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      signal: controller.signal,
    });

    const resp = await fetch(proxyReq);
    clearTimeout(timeout);

    const headers = new Headers(resp.headers);
    headers.set("access-control-allow-origin", origin);
    applySecurityHeaders(headers);

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    });
  } catch (err) {
    const isTimeout = err?.name === "AbortError";
    const status = isTimeout ? 504 : 502;
    const code = isTimeout ? "GATEWAY_TIMEOUT" : "SERVER_UNREACHABLE";
    const message = isTimeout
      ? `Game server did not respond within ${proxyTimeoutMs}ms`
      : `Game server at ${gameServerUrl} is not reachable`;

    const headers = new Headers({
      "content-type": "application/json",
      "access-control-allow-origin": origin,
    });
    applySecurityHeaders(headers);

    return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
      status,
      headers,
    });
  }
}

/* ─── Request handler ─────────────────────────────────────────────────────── */

function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // API proxy — allow all methods
  if (pathname.startsWith("/api/")) {
    return proxyToGameServer(request, pathname + url.search);
  }

  // Everything else is static — only GET and HEAD
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed();
  }

  // index.html — inject online mode config
  if (pathname === "/") {
    const htmlPath = join(webRoot, "index.html");
    if (!existsSync(htmlPath)) return notFound();

    let html = readFileSync(htmlPath, "utf-8");
    html = html.replace(
      "</head>",
      `<script>window.__MAPLE_ONLINE__ = true; window.__MAPLE_SERVER_URL__ = "";</script>\n</head>`
    );

    const headers = new Headers({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    });
    applySecurityHeaders(headers);
    return new Response(html, { headers });
  }

  // Game resources (v1)
  if (pathname.startsWith("/resources/")) {
    const relativePath = pathname.slice("/resources/".length);
    try {
      return serveFile(safeJoin(resourcesRoot, relativePath), pathname, request);
    } catch {
      return notFound();
    }
  }

  // Game resources (v2)
  if (pathname.startsWith("/resourcesv2/")) {
    const relativePath = pathname.slice("/resourcesv2/".length);
    try {
      return serveFile(safeJoin(resourcesV2Root, relativePath), pathname, request);
    } catch {
      return notFound();
    }
  }

  // Client static files (js, css, etc.)
  const relativePath = pathname.slice(1);
  try {
    const filePath = safeJoin(webRoot, relativePath);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return serveFile(filePath, pathname, request);
    }
    if (!extname(relativePath) && existsSync(filePath + ".html")) {
      return serveFile(filePath + ".html", pathname, request);
    }
  } catch {
    // safeJoin threw — path traversal attempt
  }

  return notFound();
}

/* ─── Server bootstrap ────────────────────────────────────────────────────── */

function startServer(startPort, attempts = 10) {
  let port = startPort;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return Bun.serve({
        hostname: host,
        port,
        fetch(request, server) {
          const url = new URL(request.url);

          // WebSocket proxy — upgrade and relay to game server
          if (url.pathname === "/ws") {
            if (server.upgrade(request, { data: {} })) {
              return undefined;
            }
            const headers = new Headers({ "content-type": "text/plain" });
            applySecurityHeaders(headers);
            return new Response("WebSocket upgrade failed", { status: 400, headers });
          }

          try {
            return handleRequest(request);
          } catch {
            return badRequest();
          }
        },
        websocket: {
          open(ws) {
            // Connect to game server WS
            const target = gameServerUrl.replace(/^http/, "ws") + "/ws";
            const upstream = new WebSocket(target);
            ws.data.upstream = upstream;
            ws.data.buffered = [];

            upstream.addEventListener("open", () => {
              // Flush any messages buffered while connecting
              for (const msg of ws.data.buffered) {
                upstream.send(msg);
              }
              ws.data.buffered = null;
            });
            upstream.addEventListener("message", (event) => {
              try { ws.send(event.data); } catch {}
            });
            upstream.addEventListener("close", (event) => {
              // Only forward valid close codes (1000, 3000-4999); otherwise use 1000
              const code = (event.code === 1000 || (event.code >= 3000 && event.code <= 4999)) ? event.code : 1000;
              try { ws.close(code, event.reason || undefined); } catch {}
            });
            upstream.addEventListener("error", () => {
              try { ws.close(1011, "upstream error"); } catch {}
            });
          },
          message(ws, message) {
            const upstream = ws.data.upstream;
            if (!upstream) return;
            if (ws.data.buffered) {
              // Upstream still connecting — buffer
              ws.data.buffered.push(typeof message === "string" ? message : new TextDecoder().decode(message));
            } else if (upstream.readyState === WebSocket.OPEN) {
              upstream.send(typeof message === "string" ? message : new TextDecoder().decode(message));
            }
          },
          close(ws, code, reason) {
            const upstream = ws.data.upstream;
            if (upstream && upstream.readyState === WebSocket.OPEN) {
              const safeCode = (code === 1000 || (code >= 3000 && code <= 4999)) ? code : 1000;
              try { upstream.close(safeCode, reason || undefined); } catch {}
            }
          },
        },
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null ? error.code : undefined;
      const message = error instanceof Error ? error.message : String(error);

      if (code === "EADDRINUSE" || message.includes("EADDRINUSE")) {
        port += 1;
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Unable to bind client web server after ${attempts} attempts.`);
}

const server = startServer(requestedPort);
console.log(`🍄 Schlop ONLINE client running at http://${host}:${server.port}`);
console.log(`   Mode: online (game server: ${gameServerUrl})`);
console.log("   API proxy: /api/* → game server");
console.log(`   WebSocket proxy: /ws → ${gameServerUrl.replace(/^http/, "ws")}/ws`);
console.log(`   Proxy timeout: ${proxyTimeoutMs}ms`);
console.log(`   CORS origin: ${allowedOrigin || "(reflect request origin)"}`);
console.log("   Expects: reverse proxy (Caddy) for TLS + compression");
