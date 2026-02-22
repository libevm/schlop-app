# .memory Sync Status

Last synced: 2026-02-22T11:49:00+11:00
Status: ✅ Synced

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
