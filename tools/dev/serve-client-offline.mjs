/**
 * Offline client server — serves the standalone MapleStory web client
 * with no server dependency. All game state is local (localStorage + in-memory).
 *
 * Usage: bun run client:offline
 * Env:   CLIENT_WEB_HOST (default 127.0.0.1), CLIENT_WEB_PORT (default 5173)
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const host = process.env.CLIENT_WEB_HOST ?? "127.0.0.1";
const requestedPort = Number(process.env.CLIENT_WEB_PORT ?? "5173");

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

function handleRequest(request) {
  const url = new URL(request.url);

  if (url.pathname === "/") {
    return serveFile(join(webRoot, "index.html"));
  }

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
        fetch(request) {
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
console.log(`🍄 Shlop OFFLINE client running at http://${host}:${server.port}`);
console.log("   Mode: offline (no server, all state local)");
console.log("   Default map: /?mapId=100000001");
