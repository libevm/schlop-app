import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listMarkdownDocs, normalizeDocPath } from "./docs-utils.mjs";
import { renderMarkdown } from "./markdown.mjs";

const docsRoot = join(process.cwd(), "docs");
const host = process.env.DOCS_HOST ?? "127.0.0.1";
const port = Number(process.env.DOCS_PORT ?? "4173");

const docsList = listMarkdownDocs(docsRoot);

function navHtml(currentDocPath = "") {
  const links = docsList
    .map((docPath) => {
      const selected = docPath === currentDocPath ? ' class="active"' : "";
      return `<li${selected}><a href="/doc/${encodeURIComponent(docPath)}">${docPath}</a></li>`;
    })
    .join("\n");

  return `<ul>${links}</ul>`;
}

function shell({ title, content, currentDocPath = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#111827" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0b1020; color: #e5e7eb; }
    .layout { display: grid; grid-template-columns: 320px 1fr; min-height: 100vh; }
    aside { border-right: 1px solid #26304a; padding: 16px; background: #0f172a; overflow: auto; }
    main { padding: 24px; max-width: 960px; }
    h1, h2, h3 { color: #f8fafc; }
    a { color: #7dd3fc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { padding-left: 20px; }
    li.active > a { color: #facc15; font-weight: 600; }
    pre { background: #111827; border: 1px solid #26304a; padding: 12px; border-radius: 8px; overflow-x: auto; }
    code { background: #1f2937; padding: 2px 6px; border-radius: 4px; }
    blockquote { margin: 0; padding: 8px 12px; border-left: 4px solid #38bdf8; background: #0f2036; }
    .top { margin-bottom: 12px; }
    .chip { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #1e293b; border: 1px solid #334155; font-size: 12px; }
    @media (max-width: 960px) { .layout { grid-template-columns: 1fr; } aside { max-height: 35vh; } }
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="top">
        <h2>Docs Browser</h2>
        <div class="chip">Progressive Web Docs</div>
        <p><a href="/">Home</a></p>
      </div>
      ${navHtml(currentDocPath)}
    </aside>
    <main>
      ${content}
    </main>
  </div>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  </script>
</body>
</html>`;
}

function homePage() {
  const content = `
    <h1>Maple Web Documentation</h1>
    <p>This docs site is browser-friendly and can be started via <code>bun run docs</code>.</p>
    <p>Use the left navigation to browse markdown docs, including <strong>PWA findings</strong>.</p>
    <h2>Quick links</h2>
    <ul>
      <li><a href="/doc/${encodeURIComponent("pwa-findings.md")}">pwa-findings.md</a></li>
      <li><a href="/doc/${encodeURIComponent("process/definition-of-done.md")}">process/definition-of-done.md</a></li>
      <li><a href="/doc/${encodeURIComponent("process/logging-conventions.md")}">process/logging-conventions.md</a></li>
      <li><a href="/doc/${encodeURIComponent("process/debug-flags.md")}">process/debug-flags.md</a></li>
      <li><a href="/doc/${encodeURIComponent("process/debug-panel-requirements.md")}">process/debug-panel-requirements.md</a></li>
    </ul>
  `;

  return shell({ title: "Maple Web Docs", content });
}

function docPage(pathname) {
  const docPath = normalizeDocPath(pathname.replace("/doc/", ""));
  const absolutePath = join(docsRoot, docPath);

  if (!existsSync(absolutePath)) {
    return new Response(
      shell({
        title: "Not Found",
        content: `<h1>404</h1><p>Document not found: <code>${docPath}</code></p>`,
      }),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const markdown = readFileSync(absolutePath, "utf8");
  const html = renderMarkdown(markdown);

  return new Response(
    shell({
      title: `Docs • ${docPath}`,
      content: `<h1>${docPath}</h1>${html}`,
      currentDocPath: docPath,
    }),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function manifest() {
  return new Response(
    JSON.stringify(
      {
        name: "Maple Web Docs",
        short_name: "MapleDocs",
        start_url: "/",
        display: "standalone",
        background_color: "#0b1020",
        theme_color: "#111827",
      },
      null,
      2,
    ),
    { headers: { "content-type": "application/manifest+json" } },
  );
}

function serviceWorker() {
  const script = `
const CACHE = 'shlop-docs-v1';
const PRELOAD = ['/', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRELOAD)));
});
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
`;
  return new Response(script, { headers: { "content-type": "application/javascript" } });
}

function startDocsServer(startPort, attempts = 10) {
  let currentPort = startPort;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return Bun.serve({
        hostname: host,
        port: currentPort,
        fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/") {
            return new Response(homePage(), { headers: { "content-type": "text/html; charset=utf-8" } });
          }
          if (url.pathname.startsWith("/doc/")) return docPage(url.pathname);
          if (url.pathname === "/manifest.webmanifest") return manifest();
          if (url.pathname === "/sw.js") return serviceWorker();

          return new Response("Not found", { status: 404 });
        },
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null ? error.code : undefined;
      const message = error instanceof Error ? error.message : String(error);

      if (code === "EADDRINUSE" || message.includes("port") || message.includes("EADDRINUSE")) {
        currentPort += 1;
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Unable to bind docs server after ${attempts} attempts starting at port ${startPort}`);
}

const server = startDocsServer(port);
console.log(`📘 Docs server running at http://${host}:${server.port}`);
console.log("Open in browser and navigate docs from sidebar.");
