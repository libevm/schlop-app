# Reference Scan Snapshot — 2026-02-22 (Admin UI planning)

## Why this scan
Required pre-work scan before planning implementation for GM-only database admin UI command.

## Read-only references checked

### 1) Legacy web-port reference path from AGENTS
- Expected: `/home/k/Development/Libevm/MapleWeb`
- Result: path not present on this machine (`No such file or directory`).

### 2) C++ reference client path from AGENTS
- Expected: `/home/k/Development/Libevm/MapleStory-Client`
- Result: path not present on this machine (`No such file or directory`).

### 3) Available sibling project inspected as substitute context
- Path: `/Users/k/Development/Libevm/shlop-web`
- Observed files:
  - `serve.ts`
  - `site.md`
  - `package.json`
- Relevance to admin DB tooling: minimal (no direct SQLite admin dashboard implementation found).

## Current repo scan findings (relevant to requested work)

1. Existing admin dashboard implementation already exists:
   - `server/src/admin-ui.ts`
2. Existing admin UI capabilities:
   - table listing
   - schema introspection
   - paginated row browsing + search
   - insert/update/delete rows
   - read-only SQL (`SELECT/PRAGMA/EXPLAIN`)
3. Existing non-locking strategy already implemented in admin UI:
   - WAL enabled
   - separate writer + readonly query-only reader connections
   - busy timeout
   - short auto-commit writes
4. Missing from current admin UI:
   - no authentication gate
   - no GM-only restriction
   - no root script command `server:admin-ui`

## Files to modify in implementation phase
- `package.json` (root script)
- `server/package.json` (admin-ui script)
- `server/src/admin-ui.ts` (GM auth + route protection + niceties)
- `README.md` (new command usage)
- `.memory/*` docs after implementation

## Planning output produced
- `.memory/admin-ui-implementation-plan.md`

---

## 2026-02-22 follow-up scan (client:admin-ui + server support request)

### Requested reference paths re-checked
- `/home/k/Development/Libevm/MapleWeb` → unavailable
- `/home/k/Development/Libevm/MapleStory-Client` → unavailable
- `/Users/k/Development/Libevm/MapleWeb` → unavailable
- `/Users/k/Development/Libevm/MapleStory-Client` → unavailable

### Current repo capability snapshot (relevant)
- Existing standalone admin tool found: `server/src/admin-ui.ts`
- Existing features already include: table list, schema, paginated browse/search, insert/update/delete, read-only SQL runner
- Existing lock-contention mitigation already present in standalone tool:
  - WAL
  - separate reader (`readonly + query_only`) and writer connections
  - short writes + busy timeout
- Missing for requested architecture:
  - no GM-only auth gate in admin UI tool
  - no `client:admin-ui` root command
  - no integrated `/api/admin/*` surface on `bun run server`

### Plan artifact updated
- `.memory/admin-ui-implementation-plan.md` rewritten to target:
  - `bun run client:admin-ui` frontend command,
  - `/api/admin/*` on same game server,
  - GM username/password login and session middleware,
  - non-locking DB strategy, tests, and docs sync.