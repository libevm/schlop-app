# Recommended Tech Stack (Client + Server JS/TS, **Bun runtime**)

> **⚠️ PARTIALLY STALE** — This was the original recommendation. The actual
> implementation diverged: client is vanilla JS (no Vite, no React), server
> uses raw `Bun.serve()` (no Fastify), and most libraries below were not adopted.
> See "Actual Stack" section at the end for the real current state.

Date: 2026-02-17
Based on:
- `.memory/game-design.md`
- `.memory/half-web-port-architecture-snapshot.md`
- `.memory/cpp-vs-half-web-port-gap-snapshot.md`

## 1) New information we must design around

1. Current web port is a **single client app** (`TypeScript-Client`) with no `client/` + `server/` split yet.
2. Assets are huge and local-static:
   - ~**3.7 GB** under `public/wz_client`
   - ~22k JSON files
3. Client currently uses **path-based WZ fetches** (`WZManager.get("Map.wz/...")`) and in-browser tree cache.
4. Biggest blocker is confirmed: **missing data pipeline + standardized asset API**.
5. Runtime foundation is already usable (map/player/mobs/drops/ui), so we should avoid unnecessary rewrites.

---

## 2) Hard requirements from project goals

- Keep both runtime and platform in **JavaScript/TypeScript**.
- Use **Bun** as the JavaScript runtime.
- Split repository into:
  - `client/`
  - `server/`
  - `tools/build-assets/`
- Build a queryable asset platform:
  - `GET /api/v1/asset/:type/:id`
  - `GET /api/v1/asset/:type/:id/:section`
  - `POST /api/v1/batch`
  - `GET /api/v1/blob/:hash`
- Support map-first lazy loading and strong caching.
- Keep implementation simple and leverage existing libraries.

---

## 3) Recommended stack (simplest + robust)

## A) Monorepo / tooling
- **Bun (latest stable)** as runtime + package manager + script runner
- **Bun workspaces** for monorepo management
- **TypeScript** everywhere
- **Biome** for lint/format
- **Vitest** for tests (excellent with Vite/browser code)

Why: Bun keeps runtime/tooling simple and fast; Vitest remains the most practical test runner for Vite TS client code.

---

## B) Client (`client/`)

- **Vite + TypeScript** (keep; already used)
- **Tailwind CSS v4** via `@tailwindcss/cli` (devDependency)
  - Source: `client/src/styles/app.css` (theme + utilities, no preflight)
  - Output: `client/web/styles.css` (minified)
  - Build: `bun run --cwd client css` / `css:watch`
- Keep current Canvas gameplay architecture initially; refactor incrementally
- Add a dedicated API loader layer replacing direct WZ path fetching

Client libraries:
- **lru-cache**: in-memory doc/blob metadata cache with eviction
- **idb-keyval**: optional persistent browser cache for docs/blobs
- **zod**: runtime validation of API payloads during migration/debug

Why: lowest migration risk while solving current memory/loading pain.

---

## C) Server (`server/`)

- **Fastify + TypeScript** running on **Bun**
- Plugins:
  - `@fastify/cors`
  - `@fastify/compress`
  - `@fastify/etag`
  - `@fastify/static`
  - `@fastify/websocket` (optional first phase)
- **pino** logging
- **zod** for request/response schema validation

Data/index layer:
- **bun:sqlite** (Bun built-in) for index DB (type/id/section -> file/hash)
- docs/blobs remain on disk object-store style

Why: Fastify is proven and simple; Bun’s built-in SQLite removes native addon friction and keeps ops lightweight.

---

## D) Asset pipeline (`tools/build-assets/`)

- Bun-run TS CLI scripts using:
  - **fast-glob** (file discovery)
  - **stream-json** (stream parse huge JSON safely)
  - **p-limit** (controlled concurrency)
  - **xxhash-wasm** (fast content hashing)
  - **zod** (schema validation of produced docs)

Pipeline output:
- `data/docs/<type>/<id>/<section>.json` (or merged docs for small entities)
- `data/blobs/<hash>`
- `data/index.sqlite`

Why: streaming + hashing + indexed lookup solves current multi-GB path-fetch bottleneck without heavy infrastructure.

---

## 4) Suggested repo structure

```txt
repo/
  client/
    src/
    public/
    package.json
  server/
    src/
    data/               # generated docs/blobs/index for local/dev
    package.json
  tools/
    build-assets/
      src/
      package.json
  packages/
    shared-schemas/     # zod schemas + TS types for asset docs/API
```

---

## 5) Minimal package recommendations

### client
- `typescript`, `vite`
- `lru-cache`
- `idb-keyval`
- `zod`
- `vitest` (dev)

### server
- `fastify`
- `@fastify/cors`, `@fastify/compress`, `@fastify/etag`, `@fastify/static`, `@fastify/websocket`
- `pino`
- `zod`
- `vitest` (dev)

### tools/build-assets
- `fast-glob`
- `stream-json`
- `p-limit`
- `xxhash-wasm`
- `zod`

---

## 6) Implementation approach (practical)

1. **Do not rewrite gameplay first.**
2. First ship pipeline + API + client loader adapter.
3. Keep old `WZManager` behind a compatibility interface while migrating map-first loads.
4. After data/API stabilization, refactor runtime architecture (Stage-like world orchestration, combat extraction, packet expansion).

---

## 7) Why this is the best fit

This stack is the best balance of:
- **Simple**: all TS/JS, Bun runtime, no distributed infra.
- **Robust**: indexed data access, cache headers, hashed blobs, schema validation.
- **Low-risk**: preserves current working client systems and migrates progressively.
- **Aligned to goals**: directly delivers client/server split + standardized query API + scalable asset loading.

---

## 8) Explicitly avoided (for now)

- No Kubernetes/microservices
- No Redis/Kafka dependency
- No framework-heavy frontend rewrite (React/Next) before loader/API completion
- No full engine rewrite before data architecture lands

These can be added later only if profiling proves they are needed.

---

## 9) Actual Stack (as implemented, 2026-02-22)

### Runtime
- **Bun** 1.3.x — runtime, package manager, test runner, bundler (Bun.build for --prod)

### Client (`client/`)
- **Vanilla JavaScript** — single `app.js` (~14,700 lines), no framework
- **Canvas 2D API** — all game rendering (no WebGL)
- **Tailwind CSS v4** via `@tailwindcss/cli` for UI overlays (login, settings, HUD)
- No Vite, no React, no build step for JS (raw script tag, Bun.build only for --prod minification)
- Asset loading: direct fetch to `/resourcesv2/` paths, browser Cache API for persistence

### Server (`server/`)
- **Raw `Bun.serve()`** — no Fastify, no Express
- **Bun WebSocket** — built-in WS with per-message callbacks
- **`bun:sqlite`** — character persistence, sessions, credentials, leaderboards
- **bcrypt** via `Bun.password.hash/verify` — account claiming
- Custom middleware: character-api.ts, pow.ts, map-data.ts, reactor-system.ts

### Client Servers (`tools/dev/`)
- **serve-client-online.mjs** — static files + API/WS proxy to game server
  - `--prod` mode: JS minification (Bun.build), gzip pre-compression, ETag support
  - **Dev mode**: hot-reload via file watcher + `/__hmr` WebSocket
    - Watches `client/web/` for `.js`/`.css`/`.html` changes (80ms debounce)
    - CSS changes: hot-swapped without page reload (stylesheet link cache-bust)
    - JS/HTML changes: full page reload
    - HMR client script auto-injected into HTML, reconnects with exponential backoff
    - JS/CSS served with `no-cache` in dev mode for instant pickup

### Packages
- **`packages/shared-schemas/`** — workspace package (mostly scaffolding, zod schemas not heavily used)
- **No external runtime dependencies** — zero npm packages in production

### Tools
- **`tools/build-assets/`** — WZ extraction scripts (Node.js, fs-based)
- **`tools/workspace/`** — workspace integrity tests
- **`tools/quality/`** — lint/typecheck helpers
- **`tools/docs/`** — markdown docs server
