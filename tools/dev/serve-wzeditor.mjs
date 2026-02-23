/**
 * Static file server for the WZ Editor tool.
 * Serves files from client/wzeditor/ on port 5175.
 * NO API endpoints — all WZ parsing happens in the browser.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const host = process.env.WZEDITOR_HOST ?? "127.0.0.1";
const requestedPort = Number(process.env.WZEDITOR_PORT ?? "5175");

const repoRoot = normalize(join(import.meta.dir, "..", ".."));
const webRoot = join(repoRoot, "client", "wzeditor");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function contentType(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function serveFile(filePath) {
  if (!existsSync(filePath)) return new Response("Not Found", { status: 404 });
  const stat = statSync(filePath);
  if (!stat.isFile()) return new Response("Not Found", { status: 404 });
  const body = readFileSync(filePath);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-cache",
    },
  });
}

let port = requestedPort;
let server;
while (true) {
  try {
    server = Bun.serve({
      hostname: host,
      port,
      fetch(request) {
        const url = new URL(request.url);

        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response("Method Not Allowed", { status: 405 });
        }

        if (url.pathname === "/" || url.pathname === "/index.html") {
          return serveFile(join(webRoot, "index.html"));
        }

        const relative = url.pathname.replace(/^\/+/, "");
        const filePath = normalize(join(webRoot, relative));
        if (!filePath.startsWith(webRoot)) {
          return new Response("Bad Request", { status: 400 });
        }

        return serveFile(filePath);
      },
    });
    break;
  } catch {
    port += 1;
  }
}

console.log(`🔧 WZ Editor running at http://${host}:${server.port}`);
console.log(`   Serving static files from ${webRoot}`);
console.log(`   All parsing runs in the browser — no API endpoints.`);
