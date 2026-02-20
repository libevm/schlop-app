/**
 * Online client server — serves the MapleStory web client with server connectivity.
 * Proxies /api/* and /ws to the game server, serves static files locally.
 *
 * Usage: bun run client:online
 * Env:
 *   CLIENT_WEB_HOST  (default 127.0.0.1)
 *   CLIENT_WEB_PORT  (default 5173)
 *   GAME_SERVER_URL  (default http://127.0.0.1:5200)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const host = process.env.CLIENT_WEB_HOST ?? "127.0.0.1";
const requestedPort = Number(process.env.CLIENT_WEB_PORT ?? "5173");
const gameServerUrl = process.env.GAME_SERVER_URL ?? "http://127.0.0.1:5200";

const repoRoot = normalize(join(import.meta.dir, "..", ".."));
const webRoot = join(repoRoot, "client", "web");
const resourcesRoot = join(repoRoot, "resources");
const resourcesV2Root = join(repoRoot, "resourcesv2");

function getContentType(path) {
  const ext = extname(path).toLowerCase();

  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

function safeJoin(base, relativePath) {
  const resolved = normalize(join(base, relativePath));
  if (!resolved.startsWith(base)) {
    throw new Error("Unsafe path");
  }
  return resolved;
}

function serveFile(path) {
  if (!existsSync(path)) {
    return new Response("Not found", { status: 404 });
  }

  const body = readFileSync(path);
  return new Response(body, {
    headers: {
      "content-type": getContentType(path),
      "cache-control": "no-store",
    },
  });
}

function serveDirectory(dirPath) {
  try {
    const entries = readdirSync(dirPath).sort();
    return new Response(JSON.stringify(entries), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

/** Proxy a request to the game server */
async function proxyToGameServer(request, pathname) {
  const targetUrl = `${gameServerUrl}${pathname}`;
  try {
    const proxyReq = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    });
    const resp = await fetch(proxyReq);
    // Clone response with CORS headers
    const headers = new Headers(resp.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: { code: "SERVER_UNREACHABLE", message: `Game server at ${gameServerUrl} is not reachable` },
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function handleRequest(request) {
  const url = new URL(request.url);

  // Inject online mode flag into the HTML
  if (url.pathname === "/") {
    const htmlPath = join(webRoot, "index.html");
    if (!existsSync(htmlPath)) return new Response("Not found", { status: 404 });
    let html = readFileSync(htmlPath, "utf-8");
    // Inject a script tag that sets the online mode before app.js loads
    html = html.replace(
      "</head>",
      `<script>window.__MAPLE_ONLINE__ = true; window.__MAPLE_SERVER_URL__ = "${gameServerUrl}";</script>\n</head>`
    );
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Proxy API requests to game server
  if (url.pathname.startsWith("/api/")) {
    return proxyToGameServer(request, url.pathname + url.search);
  }

  // Static resources
  if (url.pathname.startsWith("/resources/")) {
    const relativePath = url.pathname.slice("/resources/".length);
    const fullPath = safeJoin(resourcesRoot, relativePath);

    if (url.pathname.endsWith("/") && existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      return serveDirectory(fullPath);
    }

    return serveFile(fullPath);
  }

  if (url.pathname.startsWith("/resourcesv2/")) {
    const relativePath = url.pathname.slice("/resourcesv2/".length);
    const fullPath = safeJoin(resourcesV2Root, relativePath);

    if (url.pathname.endsWith("/") && existsSync(fullPath) && statSync(fullPath).isDirectory()) {
      return serveDirectory(fullPath);
    }

    return serveFile(fullPath);
  }

  // Client static files
  const relativePath = url.pathname.slice(1);
  const filePath = safeJoin(webRoot, relativePath);

  if (existsSync(filePath)) {
    return serveFile(filePath);
  }
  if (!extname(relativePath) && existsSync(filePath + ".html")) {
    return serveFile(filePath + ".html");
  }
  return serveFile(filePath);
}

function startServer(startPort, attempts = 10) {
  let port = startPort;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return Bun.serve({
        hostname: host,
        port,
        fetch(request, server) {
          // WebSocket upgrade for /ws
          const url = new URL(request.url);
          if (url.pathname === "/ws") {
            // For now, proxy WS upgrade is not supported — client connects to game server directly
            return new Response("WebSocket connections go directly to the game server", {
              status: 426,
              headers: { "Content-Type": "text/plain" },
            });
          }

          try {
            return handleRequest(request);
          } catch {
            return new Response("Bad request", { status: 400 });
          }
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
console.log(`🍄 MapleWeb ONLINE client running at http://${host}:${server.port}`);
console.log(`   Mode: online (game server: ${gameServerUrl})`);
console.log("   API proxy: /api/* → game server");
console.log("   Default map: /?mapId=100000001");
