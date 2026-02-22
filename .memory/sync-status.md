# .memory Sync Status

Last synced: 2026-02-22T15:45:00+11:00
Status: ✅ Synced

## 2026-02-22 update (inventory full loot/JQ guard)
- **Server (`ws.ts`)**: Added `inventoryTypeByItemId()`, `hasInventorySpace()`, `canFitItem()` helpers.
  - `loot_item` handler now checks `canFitItem()` before removing drop; sends `loot_failed { reason: "inventory_full" }` if tab is full.
  - `jq_reward` handler checks inventory capacity (EQUIP + CASH tabs) before rolling reward; sends `jq_inventory_full` if full. Player stays on map, no warp.
  - Zakum Helmet bonus only awarded if EQUIP tab has room.
- **Client (`app.js`)**:
  - `tryLootDrop()` pre-checks inventory capacity before sending `loot_item` to server; shows system chat message if full.
  - `lootDropLocally()` shows system chat message when tab is full (both full-reject and partial-pickup cases).
  - `loot_failed` handler handles `"inventory_full"` reason with system chat message.
  - New `jq_inventory_full` WS handler shows "Your inventory is full! Please drop an item to make room for your reward."
- Updated `.memory/inventory-system.md`, `.memory/shared-schema.md`, `.memory/client-server.md`.

## 2026-02-22 update (character-anchored remote chat bubble + git hash log)
- `drawRemotePlayerChatBubble`: removed viewport clamping (`clampedX`), bubble now centered
  on character anchor and clips naturally at canvas edges. Tail always points to character.
  Only fully-off-screen bubbles are skipped.
- `drawRemotePlayerNameLabel`: removed screen-space guard, let canvas clip naturally.
- `tools/dev/serve-client-online.mjs`: injects `window.__BUILD_GIT_HASH__` at startup.
- `client/web/app.js`: logs `[boot] Build: <hash>` at startup.

## 2026-02-22 update (remote off-screen chat bubble culling)
- Updated `client/web/app.js` in `drawRemotePlayerChatBubble(rp)`:
  - added viewport visibility guard (`isWorldRectVisible(rp.renderX, rp.renderY, 1, 1, 0)`),
  - remote chat bubbles no longer render when the speaking character is off-screen.
- Updated `.memory/canvas-rendering.md` with the new remote bubble visibility rule.
- Added reference scan snapshot: `.memory/reference-scan-2026-02-22-chat-bubble-offscreen.md`.

## 2026-02-22 update (logs table: send_message action)
- Updated server chat logging in `server/src/ws.ts`:
  - chat events now append `send_message: {text}` to `logs` table.
- Updated `.memory/client-server.md` action log table to match the new action format.

## 2026-02-22 update (mobile controls explicit 25px cluster margins)
- Refined edge spacing in `client/web/app.js` to explicit per-cluster margins:
  - D-pad uses `margin-left: 25px`
  - A/B cluster uses `margin-right: 25px`
- Overlay container horizontal padding reset to `0` so margin is controlled directly by control clusters.

## 2026-02-22 update (mobile controls side margin tweak)
- Adjusted touch overlay horizontal padding in `client/web/app.js` to `25px` per side.
- Result: both D-pad (left cluster) and A/B buttons (right cluster) keep ~25px margin from screen edges.

## 2026-02-22 update (mobile layout follow-up: lower D-pad, raise A/B, hide indicators)
- Updated mobile touch controls in `client/web/app.js`:
  - pushed D-pad as low as possible (lower overlay anchor + stronger negative D-pad bottom margin),
  - raised right action cluster (A/B) upward using extra bottom margin,
  - removed visible button indicators/text from on-screen controls (kept `aria-label` for accessibility).

## 2026-02-22 update (mobile transparency + lower D-pad tweak)
- Updated mobile touch controls in `client/web/app.js`:
  - moved D-pad further downward (`overlay bottom` lowered + larger negative D-pad bottom margin),
  - set button fills to ~90% transparent (idle alpha ~0.10; pressed alpha ~0.20).

## 2026-02-22 update (mobile button label fix)
- Fixed mobile action button labels in `client/web/app.js`:
  - jump button now displays `A`,
  - attack button now displays `B`.

## 2026-02-22 update (mobile overlay placement/transparency tweak)
- Tuned mobile touch overlay in `client/web/app.js`:
  - moved D-pad lower on screen (`bottom` reduced + D-pad negative bottom margin),
  - increased transparency of button fills (idle ~55% alpha, pressed ~65% alpha).
- Change targets thumb comfort and better world visibility through controls.

## 2026-02-22 update (mobile touch overlay style/layout follow-up)
- Updated mobile online controls per request:
  - controls now semi-opaque at ~80% (no glass/blur effect),
  - overlay anchored with minimal horizontal padding to push controls far left/right,
  - right action buttons relabeled and remapped to `A` (jump) and `B` (attack).
- Updated `README.md` control hint and `.memory/client-server.md` movement-touch description.

## 2026-02-22 update (mobile touch overlay UX pass)
- Optimized `client:online` mobile touch controls for thumb reach in `client/web/app.js`:
  - moved overlay lower with safe-area-aware bottom offset,
  - increased D-pad and action button sizes,
  - stacked action cluster on right (`A` above, larger `J` below),
  - added pressed-state visual feedback (scale + tint).
- Updated control visuals to be more semi-transparent:
  - translucent navy background,
  - subtle border + shadow,
  - backdrop blur.
- Updated `.memory/client-server.md` to reflect refined mobile input UX.

## 2026-02-22 update (mobile online touch controls)
- Added automatic mobile touch controls for `client:online` in `client/web/app.js`.
- Detection: online flag (`window.__MAPLE_ONLINE__`) + mobile/coarse-pointer check.
- New on-screen overlay controls:
  - D-pad arrows for movement (`left/right/up/down`),
  - `J` jump button,
  - `A` attack button.
- `up` touch press triggers portal attempt (`tryUsePortal(true)`) like keyboard up.
- Updated `README.md` controls section and `.memory/client-server.md` movement input notes.

## 2026-02-22 update (`create-gm` CLI script)
- Added new root command: `bun run create-gm <username> <password> --db <db-path>.
- New script file: `server/src/create-gm.ts`.
  - Creates default character if missing,
  - Upserts bcrypt password in `credentials`,
  - Forces `characters.gm = 1`.
- Updated `README.md` admin UI section with usage/example.
- Updated `.memory/client-server.md` GM CLI docs.

## 2026-02-22 update (admin-ui plan continued)
- Continued implementation toward the full admin-ui plan:
  - Added login rate limiting in `server/src/admin-api.ts` (per `IP+username` window; returns `429 RATE_LIMITED`).
  - Added CSV export endpoint: `GET /api/admin/table/:table/export.csv` (bounded limit/offset).
  - Added admin API test suite: `server/src/admin-api.test.ts` covering auth, GM-only gating, read-only SQL guard, CSV export, and rate-limiting.
  - Added admin dashboard niceties in `client/admin-ui/index.html`:
    - quick table shortcuts,
    - click-to-copy cell values,
    - CSV export button,
    - admin favicon set to `client/admin-ui/sheep.png`.
- Validation snapshot:
  - `bun test server/src/admin-api.test.ts` ✅ (8/8 pass)
  - `bun run --cwd server test` shows admin tests passing; one existing unrelated ws test remains flaky on local resources parse.
- Updated docs/memory schema references:
  - `.memory/shared-schema.md`, `.memory/client-server.md`, `.memory/api-endpoints.md`.

## 2026-02-22 update (admin-ui implementation started)
- Added root/client command wiring for admin dashboard:
  - root `package.json`: `bun run client:admin-ui`
  - `client/package.json`: `admin-ui` script
  - new dev server: `tools/dev/serve-admin-ui.mjs` (serves `client/admin-ui`, proxies `/api/admin/*` to game server)
- Added integrated server admin API support in `bun run server`:
  - new `server/src/admin-api.ts`
  - wired into `server/src/server.ts` as `/api/admin/*`
  - GM-only bearer login via `POST /api/admin/auth/login`
  - protected session endpoints: `/api/admin/auth/me`, `/api/admin/auth/logout`
  - table features: list/schema/rows/count/insert/update/delete + read-only SQL query runner
- Added admin session persistence to SQLite in `server/src/db.ts`:
  - new `admin_sessions` table + expiry index
  - helper functions for create/get/touch/revoke/purge
- Added admin UI frontend at `client/admin-ui/index.html`:
  - GM login screen (username/password)
  - table browser/editor + SQL panel using `/api/admin/*`
- Updated `README.md` with `client:admin-ui` usage and env vars.

## 2026-02-22 update (admin-ui plan rewrite for `client:admin-ui`)
- Rewrote `.memory/admin-ui-implementation-plan.md` to match the requested architecture:
  - `bun run client:admin-ui` command as the admin dashboard entrypoint,
  - admin dashboard connecting to the same `bun run server` backend via `/api/admin/*`,
  - GM-only username/password login and protected admin sessions,
  - non-locking DB strategy (WAL + dedicated reader/writer behavior),
  - incremental PR delivery sequence, tests, and documentation requirements.
- Updated `.memory/reference-scan-2026-02-22-admin-ui.md` with a follow-up scan:
  - confirmed AGENTS reference paths remain unavailable on this machine,
  - documented current standalone admin-ui baseline in `server/src/admin-ui.ts`,
  - documented missing pieces needed for the new integrated server + client admin-ui design.

## 2026-02-22 update (append-only action logs table)
- Added `logs` table to SQLite database (db.ts): `id, username, timestamp, action`
- Added `appendLog(db, username, action)` helper — fire-and-forget, never crashes server
- Wired logging into 18 action points across server.ts, ws.ts, character-api.ts
- Actions logged: connect, disconnect, enter map, use portal, npc warp, chat, equip change,
  level up, die, drop item, loot item, JQ completion + rewards, reactor destroy, GM commands,
  character creation, account claim, login (success + failure)
- Updated .memory/client-server.md with full logs table schema + action format table
- Updated .memory/api-endpoints.md with database tables summary

## 2026-02-22 update (full source code audit + .memory refresh)
- Full audit of all server and client source files against `.memory/` docs.
- Added root `client:online:prod` script to `package.json`.
- Updated `README.DEV.md` with `bun run client:online --prod` in both Running and Production sections.
- Updated `.memory/` docs to reflect all recent features: PoW system, --prod flag, progress bar overlay, chat bubble fix, tab blur fix, Git LFS notes.

## Current authoritative memory files

| File | Purpose |
|------|---------|
| `canvas-rendering.md` | Full canvas rendering pipeline: asset loading, caching, draw order, coordinates, transitions, diagnostics |
| `physics.md` | Physics system: player/mob movement, footholds, gravity, swimming, climbing, AI |
| `physics-units.md` | Physics constant units and tick-rate conversion reference |
| `inventory-system.md` | Inventory tabs, slot layout, drag-drop, ground drops, loot, item icons |
| `equipment-system.md` | Equipment window, equip/unequip flow, dynamic character sprite rendering |
| `client-server.md` | Client-server architecture: session/auth model, character state schema, WebSocket overview, V2 map set, resource pipeline |
| `shared-schema.md` | **Wire protocol source of truth**: all REST and WebSocket message types, fields, examples, room model, C++ parity notes |
| `implementation-plan.md` | **5-phase implementation plan** with step-by-step instructions, code snippets, file paths, test procedures |
| `admin-ui-implementation-plan.md` | Step-by-step implementation plan for GM-only DB admin UI command + auth + non-locking strategy |
| `reference-scan-2026-02-22-admin-ui.md` | Pre-work read-only scan snapshot for admin-ui task (references + current repo findings) |
| `game-design.md` | High-level game design notes and feature goals |
| `tech-stack.md` | Technology choices (partially stale — actual stack is vanilla JS + raw Bun.serve) |
| `cpp-port-architecture-snapshot.md` | C++ reference client architecture snapshot (read-only reference) |
| `api-endpoints.md` | All REST and WS endpoints summary |

## Codebase Metrics
- `client/web/app.js`: ~14,700 lines
- CI: `bun run ci` — tests passing
- Server: 69 tests across 3 files
- `runtime.player.face_id` / `runtime.player.hair_id`: stored character state (not derived from gender)
- FPS counter includes ping display (color-coded, 5s interval)
- Latest commit: `9361f3b` on `origin/main`

## Key Architecture Decisions

### Server-authoritative model
- Server is source of truth for all game state
- Clients send inputs, not state
- Periodic snapshots at 20 Hz with client-side interpolation (100-200ms buffer)
- Soft-predicted local movement: small error → lerp (100-300ms), large error → snap
- Proximity culling: only relay within same map room

### Session & auth model
- **Proof-of-Work session acquisition**: new visitors solve a SHA-256 PoW challenge before getting a session
  - `GET /api/pow/challenge` → `{ challenge, difficulty }` (difficulty default 20 bits, env `POW_DIFFICULTY`)
  - Client finds nonce where SHA-256(challenge+nonce) has `difficulty` leading zero bits
  - `POST /api/pow/verify { challenge, nonce }` → `{ session_id }`
  - Challenge expires after 60s, max 10k pending
  - Prevents bot/spam account creation
  - Client shows a sliding progress bar overlay during PoW solving
- Session ID stored in `localStorage` as `mapleweb.session`
- **Character name** is the permanent unique identifier
- Character creation: Login/Create tabs on first visit (online defaults to Login tab)
- Account claiming: optional password (min 4 chars) via glowing HUD button → bcrypt hashed
- Login: name + password → server returns session_id → client adopts it
- Logout: clears localStorage, warns unclaimed accounts about data loss
- Sessions validated via `valid_sessions` table; unused sessions expire after 7 days
- Periodic session purge every hour on server

### WebSocket protocol
- Auth via `{ type: "auth", session_id: "..." }` (JSON, first message, includes type field)
- 20 Hz position updates (move messages)
- Immediate action events (chat, attack, face, sit, prone, climb, etc.)
- Server-authoritative map transitions: `change_map` → `map_loaded` → `map_state`
- Ping/pong heartbeat every 5s (client sends), 30s disconnect timeout (server checks)
- Default character created on first WS auth if none exists

### Remote player rendering (C++ OtherChar parity)
- **Snapshot interpolation**: buffer received positions with timestamps, render 100ms
  "in the past", lerp between bracketing snapshots
- Constants: `REMOTE_INTERP_DELAY_MS=100`, `REMOTE_SNAPSHOT_MAX=20`
- Teleport detection: >300px between snapshots → instant snap
- Animation fully local: client runs frame timers per remote player
- Per-player equip WZ data storage (separate from local player)
- **Remote attack frame delay**: reads actual WZ delay from body data (not hardcoded)
- **Remote face expressions**: synced via `player_face` message, shown for 2.5s (hit/pain: 500ms), frame 0 only, pre-warmed on receipt
- **Render layer from footholds**: computed client-side from `findFootholdAtXNearY`
- **Look-prefixed image cache keys**: `rp:{face_id}:{hair_id}:{action}:{frame}:{part}`
- **Character info modal**: double-click remote player → draggable HUD modal

### Server-authoritative item drops
- Server stores drops per map: `RoomManager.mapDrops: Map<mapId, Map<drop_id, MapDrop>>`
- Drop flow: client sends `drop_item` → server assigns `drop_id` → broadcasts `drop_spawn` to ALL
- Loot flow: client sends `loot_item { drop_id }` → server removes → broadcasts `drop_loot` to ALL
- 5s loot protection for reactor/mob drops (owner = majority damage dealer)
- `map_state` includes `drops[]` for players entering a map
- Drop expiry: 180s server-side sweep, 2s client fade-out

### Mob authority system
- First player in map becomes mob authority (runs AI locally, sends at 10Hz)
- Authority reassigned when player leaves
- Non-authority clients receive positions, skip local AI/physics
- Mob damage broadcast via `mob_damage` message

### Cooldowns
- **Chat**: 1s cooldown
- **Emote**: 1s cooldown

### Duplicate login blocking
- WS 4006 shows full-screen blocking modal BEFORE map loads
- Overlay has Retry and Log Out options

### Production mode (`--prod` flag)
- `bun run client:online --prod` — minifies JS via Bun.build, gzips all assets at startup
- Pre-compressed assets served from memory with `Content-Encoding: gzip`
- ETag support for conditional requests (304 Not Modified)
- CSS already minified by Tailwind CLI, just gzip-wrapped
- HTML: online config injected + whitespace collapsed + gzipped
- Startup logs show per-asset size reduction

### Online client server hardening
- Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP
- Cache-control: HTML=no-cache, JS/CSS=1h revalidate, game resources=7d immutable
- Method allowlist: static routes GET/HEAD only, API routes all methods
- CORS preflight handling with configurable origin
- Proxy timeout with 504 on slow game server
- Path traversal hardened (null byte rejection, normalize check)
- WebSocket proxy: client→online server→game server relay (Bun WS, buffered during upstream connect)

### Movement keybinds
- Configurable movement keys (default: arrow keys)
- `moveLeft`, `moveRight`, `moveUp`, `moveDown` in `runtime.keybinds`

### GM System
- `characters.gm` column, toggled via `bun run make-gm <username>`
- Client-side: `/mousefly`, `/overlay`, `/help`
- Server-side: `/map <id>`, `/teleport <user> <map_id>`
- GM overlay: footholds, ropes, tiles, NPCs, mobs, portals, reactors, hitboxes, HUD

### Chat system
- `type: "system"` — grey text, italic
- `type: "system", subtype: "welcome"` — yellow, italic
- 24 jump-quest-themed welcome phrases on map load
- Chat bubble text vertically centered (textBaseline middle fix)
- Chat UI hidden until map loads

### Tab/window blur handling
- Player reset to idle (stand) action when tab/window loses focus
- Prevents stuck walking animations when alt-tabbing

### Debug/diagnostic features
- `dlog(category, msg)` — internal ring buffer, 5000-line max
- Settings > Download Debug Logs exports full buffer
- Git LFS pointer detection in loadMap error for clearer diagnostics
- Fatal load failures show error message overlay

## Key Data Structures

```js
_winZCounter = 25                          // increments per bringWindowToFront()
playerInventory[i].slot                    // 0-31, position within tab grid
lifeRuntimeState[i].nameVisible            // false until attacked
RESOURCE_CACHE_NAME = "maple-resources-v1" // Cache API key
SESSION_KEY = "mapleweb.session"
CHARACTER_SAVE_KEY = "mapleweb.character.v1"
SETTINGS_CACHE_KEY = "mapleweb.settings.v1"
KEYBINDS_STORAGE_KEY = "mapleweb.keybinds.v1"
_lastChatSendTime = 0                      // 1s chat cooldown
_lastEmoteTime = 0                         // 1s emote cooldown
_duplicateLoginBlocked = false             // true if 4006 received
// Tooltip z-index: 99990 | Cursor z-index: 999999 | Ghost item: 999998
// Duplicate login overlay z-index: 200000
```
