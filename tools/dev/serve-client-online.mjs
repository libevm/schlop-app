/**
 * Online client server — serves the MapleStory web client with server connectivity.
 * Proxies /api/* and /ws to the game server, serves static files locally.
 *
 * Designed to run behind Caddy (or similar reverse proxy) which handles TLS
 * and compression. This server adds: security headers, proper cache-control,
 * ETag support, method allowlisting, and hardened error handling.
 *
 * Usage: bun run client
 * Env:
 *   CLIENT_WEB_HOST      (default 127.0.0.1)
 *   CLIENT_WEB_PORT      (default 5173)
 *   GAME_SERVER_URL      (default http://127.0.0.1:5200)
 *   ALLOWED_ORIGIN       (default "" — reflect request origin; set to lock down CORS)
 *   PROXY_TIMEOUT_MS     (default 10000)
 */
import { existsSync, readFileSync, readdirSync, statSync, watch } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { extname, join, normalize, relative } from "node:path";
import { gzipSync } from "node:zlib";

/* ─── Config ──────────────────────────────────────────────────────────────── */

const isProd = process.argv.includes("--prod");
const host = process.env.CLIENT_WEB_HOST ?? "127.0.0.1";
const requestedPort = Number(process.env.CLIENT_WEB_PORT ?? "5173");
const gameServerUrl = process.env.GAME_SERVER_URL ?? "http://127.0.0.1:5200";
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "";
const proxyTimeoutMs = Number(process.env.PROXY_TIMEOUT_MS ?? "10000");

const repoRoot = normalize(join(import.meta.dir, "..", ".."));
const webRoot = join(repoRoot, "client", "web");
const resourcesV3Root = join(repoRoot, "resourcesv3");
const publicRoot = join(repoRoot, "client", "public");

/* ─── Hot-reload (dev mode only) ───────────────────────────────────────────── */

/** @type {Set<import("bun").ServerWebSocket>} */
const hmrClients = new Set();
const HMR_WATCH_EXTENSIONS = new Set([".js", ".css", ".html"]);

/** Debounced file-change → reload broadcast */
let _hmrTimeout = null;
function scheduleHmrReload(filePath) {
  if (_hmrTimeout) clearTimeout(_hmrTimeout);
  _hmrTimeout = setTimeout(() => {
    _hmrTimeout = null;
    const ext = extname(filePath).toLowerCase();
    const payload = JSON.stringify({ type: "reload", file: relative(webRoot, filePath), ext });
    for (const ws of hmrClients) {
      try { ws.send(payload); } catch { hmrClients.delete(ws); }
    }
    if (hmrClients.size > 0) {
      console.log(`   🔄 ${relative(webRoot, filePath)} changed → ${hmrClients.size} client(s) reloading`);
    }
  }, 80); // 80ms debounce — batch rapid saves
}

if (!isProd) {
  // Watch client/web/ for .js/.css/.html changes (recursive)
  try {
    const watcher = watch(webRoot, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const ext = extname(filename).toLowerCase();
      if (!HMR_WATCH_EXTENSIONS.has(ext)) return;
      scheduleHmrReload(join(webRoot, filename));
    });
    // Prevent watcher from keeping process alive if everything else closes
    watcher.unref?.();
  } catch (err) {
    console.warn("   ⚠️  File watcher failed (hot-reload disabled):", err.message);
  }

  // Tailwind CSS watcher — regenerates web/styles.css on source changes.
  // The file watcher above detects that and hot-swaps CSS in the browser.
  const cssIn = join(repoRoot, "client", "src", "styles", "app.css");
  const cssOut = join(webRoot, "styles.css");
  const twBin = join(repoRoot, "client", "node_modules", ".bin", "tailwindcss");
  const tw = spawn(twBin, ["-i", cssIn, "-o", cssOut, "--watch"], {
    stdio: ["ignore", "ignore", "inherit"],  // suppress stdout (noisy), show stderr (errors)
    cwd: repoRoot,
  });
  tw.unref();
  process.on("exit", () => { try { tw.kill(); } catch {} });
}

/** Small inline script injected into HTML to connect to the HMR WebSocket */
const hmrClientScript = `
<script>
(function() {
  if (window.__hmrConnected) return;
  window.__hmrConnected = true;
  var retries = 0;
  function connect() {
    var ws = new WebSocket("ws://" + location.host + "/__hmr");
    ws.onmessage = function(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.type === "reload") {
          console.log("[HMR] " + msg.file + " changed, reloading…");
          if (msg.ext === ".css") {
            // Hot-swap CSS without full page reload
            document.querySelectorAll('link[rel="stylesheet"]').forEach(function(link) {
              var href = link.href.split("?")[0];
              link.href = href + "?t=" + Date.now();
            });
          } else {
            location.reload();
          }
        }
      } catch {}
    };
    ws.onopen = function() { retries = 0; console.log("[HMR] connected"); };
    ws.onclose = function() {
      retries++;
      var delay = Math.min(1000 * Math.pow(2, retries), 10000);
      setTimeout(connect, delay);
    };
  }
  connect();
})();
</script>`;

/* ─── Git hash (resolved once at startup) ─────────────────────────────────── */
let gitHash = "unknown";
try { gitHash = execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf-8" }).trim(); } catch {}
const onlineConfigScript = `<script>window.__MAPLE_ONLINE__ = true; window.__MAPLE_SERVER_URL__ = ""; window.__BUILD_GIT_HASH__ = "${gitHash}";</script>`;

/* ─── Production asset minification & gzip pre-compression ────────────────── */
// In --prod mode, all client/web text assets are minified at startup and held
// in memory.  Each entry stores the raw minified buffer AND a gzip-compressed
// copy so the server can respond with Content-Encoding: gzip when accepted.

/** @type {Map<string, { raw: Buffer, gzip: Buffer, contentType: string, etag: string }>} */
const prodAssets = new Map();

if (isProd) {
  console.log("🔧 --prod: minifying client assets…");

  // ── JS via Bun.build ──
  const appJsPath = join(webRoot, "app.js");
  const jsSrcSize = statSync(appJsPath).size;
  const result = await Bun.build({
    entrypoints: [appJsPath],
    minify: true,
    target: "browser",
    format: "esm",
  });
  if (!result.success) {
    console.error("❌ JS minification failed:");
    for (const msg of result.logs) console.error("  ", msg);
    process.exit(1);
  }
  const jsMin = Buffer.from(await result.outputs[0].text());
  const jsGz = gzipSync(jsMin);
  prodAssets.set("/app.js", {
    raw: jsMin,
    gzip: jsGz,
    contentType: "application/javascript; charset=utf-8",
    etag: `"p-${jsMin.length.toString(36)}"`,
  });
  console.log(`   app.js: ${(jsSrcSize / 1024).toFixed(0)} KB → ${(jsMin.length / 1024).toFixed(0)} KB min → ${(jsGz.length / 1024).toFixed(0)} KB gz`);

  // ── CSS — already minified by tailwind, just gzip ──
  const cssPath = join(webRoot, "styles.css");
  if (existsSync(cssPath)) {
    const cssRaw = readFileSync(cssPath);
    const cssGz = gzipSync(cssRaw);
    prodAssets.set("/styles.css", {
      raw: cssRaw,
      gzip: cssGz,
      contentType: "text/css; charset=utf-8",
      etag: `"p-${cssRaw.length.toString(36)}"`,
    });
    console.log(`   styles.css: ${(cssRaw.length / 1024).toFixed(0)} KB → ${(cssGz.length / 1024).toFixed(0)} KB gz`);
  }

  // ── HTML — inject online config + collapse whitespace ──
  const htmlPath = join(webRoot, "index.html");
  if (existsSync(htmlPath)) {
    let html = readFileSync(htmlPath, "utf-8");
    // Inject online mode config (same as dev path)
    html = html.replace("</head>", `${onlineConfigScript}\n</head>`);
    // Collapse runs of whitespace between tags
    html = html.replace(/>\s+</g, "> <").replace(/\n\s*/g, "");
    const htmlBuf = Buffer.from(html, "utf-8");
    const htmlGz = gzipSync(htmlBuf);
    const htmlAsset = {
      raw: htmlBuf,
      gzip: htmlGz,
      contentType: "text/html; charset=utf-8",
      etag: `"p-${htmlBuf.length.toString(36)}"`,
    };
    // Serve for both "/" and "/index.html"
    prodAssets.set("/", htmlAsset);
    prodAssets.set("/index.html", htmlAsset);
    console.log(`   index.html: ${statSync(htmlPath).size} B → ${htmlBuf.length} B min → ${htmlGz.length} B gz`);
  }

  const totalRaw = [...prodAssets.values()].reduce((s, a) => s + a.raw.length, 0);
  const totalGz = [...prodAssets.values()].reduce((s, a) => s + a.gzip.length, 0);
  console.log(`✅ All assets ready: ${(totalRaw / 1024).toFixed(0)} KB raw, ${(totalGz / 1024).toFixed(0)} KB gzipped`);
}

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
  // Dev mode: no caching for JS/CSS so hot-reload always picks up fresh files
  if (!isProd && (ext === ".js" || ext === ".css")) return "no-cache";
  if (pathname.startsWith("/resourcesv3/") || pathname.startsWith("/public/")) {
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
  // In --prod mode, serve pre-minified + gzipped assets from memory
  const prod = prodAssets.get(pathname);
  if (prod) return serveProdAsset(prod, pathname, request);

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

function serveProdAsset(asset, pathname, request) {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === asset.etag) {
    const headers = new Headers({ etag: asset.etag });
    applySecurityHeaders(headers);
    return new Response(null, { status: 304, headers });
  }

  const acceptGzip = (request.headers.get("accept-encoding") ?? "").includes("gzip");
  const body = acceptGzip ? asset.gzip : asset.raw;
  const ext = extname(pathname).toLowerCase();
  const headers = new Headers({
    "content-type": asset.contentType,
    "content-length": String(body.length),
    "cache-control": getCacheControl(pathname, ext),
    "etag": asset.etag,
  });
  if (acceptGzip) headers.set("content-encoding", "gzip");
  applySecurityHeaders(headers);
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
    // In prod, serve from pre-minified + gzipped cache
    if (prodAssets.has("/")) {
      return serveProdAsset(prodAssets.get("/"), "/", request);
    }

    const htmlPath = join(webRoot, "index.html");
    if (!existsSync(htmlPath)) return notFound();

    let html = readFileSync(htmlPath, "utf-8");
    html = html.replace("</head>", `${onlineConfigScript}\n</head>`);
    // Inject HMR client in dev mode
    if (!isProd) {
      html = html.replace("</body>", `${hmrClientScript}\n</body>`);
    }

    const headers = new Headers({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    });
    applySecurityHeaders(headers);
    return new Response(html, { headers });
  }

  // Game resources
  if (pathname.startsWith("/resourcesv3/")) {
    const relativePath = pathname.slice("/resourcesv3/".length);
    try {
      return serveFile(safeJoin(resourcesV3Root, relativePath), pathname, request);
    } catch {
      return notFound();
    }
  }

  // Static public assets (loading screen, login BGM)
  if (pathname.startsWith("/public/")) {
    const relativePath = pathname.slice("/public/".length);
    try {
      return serveFile(safeJoin(publicRoot, relativePath), pathname, request);
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

          // HMR WebSocket (dev mode only)
          if (!isProd && url.pathname === "/__hmr") {
            if (server.upgrade(request, { data: { type: "hmr" } })) {
              return undefined;
            }
            return new Response("HMR WebSocket upgrade failed", { status: 400 });
          }

          // WebSocket proxy — upgrade and relay to game server
          if (url.pathname === "/ws") {
            if (server.upgrade(request, { data: { type: "game" } })) {
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
            if (ws.data.type === "hmr") {
              hmrClients.add(ws);
              return;
            }
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
            if (ws.data.type === "hmr") return; // HMR clients don't send meaningful messages
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
            if (ws.data.type === "hmr") {
              hmrClients.delete(ws);
              return;
            }
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
console.log(`🍄 Shlop ONLINE client running at http://${host}:${server.port}`);
console.log(`   Mode: online${isProd ? " (PRODUCTION — minified + gzip)" : ""} (game server: ${gameServerUrl})`);
if (!isProd) console.log("   🔄 Hot-reload: watching client/web/ for .js/.css/.html changes");
console.log("   API proxy: /api/* → game server");
console.log(`   WebSocket proxy: /ws → ${gameServerUrl.replace(/^http/, "ws")}/ws`);
console.log(`   Proxy timeout: ${proxyTimeoutMs}ms`);
console.log(`   CORS origin: ${allowedOrigin || "(reflect request origin)"}`);
console.log("   Expects: reverse proxy (Caddy) for TLS + compression");
