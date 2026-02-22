# Admin UI Implementation Plan (GM-only, `bun run client:admin-ui`)

> Goal: add a new admin dashboard command (`bun run client:admin-ui`) that connects to the same game server (`bun run server`), supports safe DB browsing/editing, and requires GM username+password login.

---

## 0) Pre-flight and scope lock

1. Confirm runtime targets:
   - Game server: `bun run server` (port 5200 by default).
   - Admin UI frontend: `bun run client:admin-ui` (new command).
2. Confirm DB path source of truth remains server config (`dbPath`, default `./data/maple.db`).
3. Keep existing multiplayer gameplay endpoints unchanged.
4. Define admin API prefix: `/api/admin/*`.

---

## 1) Command wiring (`client:admin-ui`)

1. Add root script in `package.json`:
   - `"client:admin-ui": "bun run --cwd client admin-ui"`
2. Add client workspace script in `client/package.json`:
   - `"admin-ui": "bun run ../tools/dev/serve-admin-ui.mjs"`
3. Create `tools/dev/serve-admin-ui.mjs`:
   - Serve `client/admin-ui/` static files.
   - Proxy `/api/admin/*` to `GAME_SERVER_URL` (default `http://127.0.0.1:5200`).
   - Proxy timeout + CORS behavior consistent with `serve-client-online.mjs`.
4. Add startup log output showing:
   - Admin UI URL
   - Upstream game server URL

---

## 2) Server support in `bun run server` (admin backend)

1. Add `server/src/admin-api.ts` module for all admin routes.
2. Wire admin router into `server/src/server.ts` route path handling:
   - Handle `/api/admin/*` before generic asset routes.
3. Add server config toggles (with safe defaults):
   - `adminUiEnabled` (default `true` when DB is enabled)
   - `adminSessionTtlMs` (default e.g. 8h)
4. Ensure all admin responses include correlation ID and JSON error shape.

---

## 3) GM-only auth model (username + password)

1. Add admin login endpoint: `POST /api/admin/auth/login`.
2. Request body: `{ username, password }`.
3. Validation flow:
   - Resolve character by `username` (NOCASE).
   - Verify account is claimed (`credentials` row exists).
   - Verify password via `Bun.password.verify` against `credentials.password_hash`.
   - Verify GM flag via `isGm(db, username)`.
   - Reject non-GM with 403 (`GM_ONLY`).
4. Create admin session token (random 256-bit string), store hashed token server-side.
5. Return token via HTTP-only cookie (`admin_session`) and JSON `{ ok: true }`.
6. Add `POST /api/admin/auth/logout` to revoke current admin session.
7. Add `GET /api/admin/auth/me` to return current admin identity.
8. Add middleware `requireAdminAuth` for all non-auth admin routes.

---

## 4) Admin session persistence + security

1. Add SQLite table `admin_sessions`:
   - `id`, `username`, `token_hash`, `created_at`, `expires_at`, `ip`, `user_agent`.
2. Indexes:
   - `token_hash` unique
   - `expires_at`
3. Session rules:
   - Sliding expiration on activity (optional) or fixed expiry.
   - Re-check GM privilege on each request (if GM removed, session invalid).
4. Security controls:
   - Rate-limit `/api/admin/auth/login` (per IP + username).
   - CSRF protection if cookie auth is used (same-site strict + origin check).
   - No stack traces in response bodies.

---

## 5) Non-locking DB strategy (must not block gameplay)

1. Reuse WAL mode (already enabled in DB init).
2. For admin API, open dedicated connections:
   - Read connection: `readonly + query_only`.
   - Write connection: short auto-commit writes only.
3. Set conservative `busy_timeout` values and return clear `DB_BUSY` errors.
4. Keep writes granular (single statement per request).
5. Add row limits/pagination defaults to prevent huge scans.
6. For SQL runner, allow read-only statements only (`SELECT`, `PRAGMA`, `EXPLAIN`).

---

## 6) Admin API feature set (basic + useful niceties)

1. `GET /api/admin/tables`
   - list non-system tables.
2. `GET /api/admin/table/:table/schema`
   - columns, PKs, indexes, foreign keys.
3. `GET /api/admin/table/:table/rows?limit&offset&search&sort`
   - paginated browse with simple text search.
4. `POST /api/admin/table/:table/insert`
5. `POST /api/admin/table/:table/update`
6. `POST /api/admin/table/:table/delete`
7. `POST /api/admin/query` (read-only SQL).
8. Niceties:
   - `GET /api/admin/table/:table/count`
   - `GET /api/admin/table/:table/export.csv?limit...`
   - prebuilt quick links for high-value tables (`characters`, `sessions`, `credentials`, `logs`, `jq_leaderboard`).

---

## 7) Admin UI frontend (new client surface)

1. Create `client/admin-ui/index.html` + minimal JS/CSS.
2. Build login screen first:
   - username, password, submit
   - clear errors for invalid creds/non-GM.
3. After login, render dashboard:
   - sidebar table list
   - main grid (rows)
   - row edit/create/delete dialogs
   - schema panel
   - read-only SQL runner output.
4. UX niceties:
   - table search box
   - rows-per-page selector
   - copy cell value button
   - JSON pretty view modal for blob fields.
5. Add a top banner showing server URL + logged-in GM name.
6. Add logout button (clears cookie/session).

---

## 8) Test plan

1. Unit/integration tests in server:
   - GM login success
   - non-GM login rejected
   - bad password rejected
   - expired session rejected
   - CRUD endpoints require auth
   - read-only SQL guard rejects UPDATE/DELETE/INSERT.
2. Concurrency smoke test:
   - gameplay writes + admin reads in parallel.
   - verify no long lock stalls; admin returns retryable `DB_BUSY` when needed.
3. Manual e2e:
   - Terminal A: `bun run server`
   - Terminal B: `bun run client:admin-ui`
   - login as GM, browse/edit tables, run query, logout.

---

## 9) Documentation updates (same PR)

1. Update `README.md` with:
   - `bun run client:admin-ui`
   - required env vars (`GAME_SERVER_URL`, admin host/port if configurable)
   - GM requirement for login.
2. Update `.memory/client-server.md` with admin API/auth architecture.
3. Update `.memory/shared-schema.md` with `/api/admin/*` request/response shapes.
4. Update `.memory/sync-status.md` with implementation progress.
5. Add concise entry to `docs/pwa-findings.md` (chronological).

---

## 10) Delivery sequence (small PR-sized chunks)

1. **PR A**: command wiring + static admin UI shell + server route stub.
2. **PR B**: GM auth + admin session table + protected middleware.
3. **PR C**: browse/schema/rows endpoints + frontend table browser.
4. **PR D**: edit/insert/delete + SQL runner safeguards + CSV export.
5. **PR E**: tests, hardening, docs + `.memory` final sync.

---

## Acceptance criteria

- `bun run client:admin-ui` launches the admin dashboard.
- Dashboard talks to the same `bun run server` process via `/api/admin/*`.
- Login requires valid username/password and `gm=1`.
- Non-GM users cannot access admin routes.
- Admin reads/writes do not stall gameplay DB operations under normal load.
- Table browse/view/edit/delete + read-only SQL are working.
- README + `.memory` docs updated.