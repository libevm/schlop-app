# Client-Server Architecture

> Defines the client-server split: character state persistence, real-time multiplayer
> protocol, auth model, V2 map list, and resource pipeline.
> C++ reference: `StatsEntry`, `LookEntry`, `CharEntry`, `Inventory`, `CharStats`, `MapleStat`.

---

## Client Modes

### Online (`bun run client:online`)
- Starts hardened static file server + API proxy + Tailwind CSS watcher + hot-reload
- Designed to run behind Caddy (or similar reverse proxy) for TLS + compression
- Injects `window.__MAPLE_ONLINE__ = true` and `window.__MAPLE_SERVER_URL__` into HTML
- Proxies `/api/*` requests to game server (default `http://127.0.0.1:5200`)
- WebSocket proxy: `/ws` → game server WS (buffered during upstream connect)
- HMR WebSocket: `/__hmr` → dev-only live-reload (CSS hot-swap, JS/HTML full reload)
- Client detects online mode via `window.__MAPLE_ONLINE__` flag
- File: `tools/dev/serve-client-online.mjs`
- Env vars:
  - `CLIENT_WEB_HOST` (default `127.0.0.1`)
  - `CLIENT_WEB_PORT` (default `5173`)
  - `GAME_SERVER_URL` (default `http://127.0.0.1:5200`)
  - `ALLOWED_ORIGIN` (default `""` — reflects request origin; set to lock down CORS)
  - `PROXY_TIMEOUT_MS` (default `10000`)

### Online Production (`bun run client:online --prod`)
- All features of online mode plus:
- **Git hash injection**: `window.__BUILD_GIT_HASH__` resolved from `git rev-parse --short HEAD` at startup (both dev and prod)
- **JS minification** via `Bun.build` (tree-shaken, ESM target)
- **Gzip pre-compression** of all client assets at startup (JS, CSS, HTML)
- **HTML injection** of online config (incl. git hash) + whitespace collapsing
- Assets served from memory (`prodAssets` Map) with `Content-Encoding: gzip`
- ETag-based conditional responses (304 Not Modified)
- Startup logs show per-asset size reduction (raw → min → gz)
- Root scripts: `bun run client:online:prod` or `bun run --cwd client online:prod`

### Production hardening (both online modes):
  - Security headers on all responses (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP)
  - ETag support with 304 Not Modified for conditional requests
  - Cache-control: HTML=no-cache, JS/CSS=1h revalidate, game resources=7d immutable
  - Method allowlist: static routes GET/HEAD only, API routes allow all methods
  - CORS preflight handling with configurable origin
  - Proxy timeout with 504 Gateway Timeout on slow game server
  - Directory listing removed (no longer exposes file trees)
  - Path traversal hardened (null byte rejection, normalize check)
  - No stack traces in error responses

### Admin UI (`bun run client:admin-ui`)
- Serves `client/admin-ui/` as a dedicated GM dashboard frontend
- Proxies `/api/admin/*` to the same game server (`GAME_SERVER_URL`, default `http://127.0.0.1:5200`)
- Default port: 5174 (`ADMIN_UI_PORT` override)
- Requires GM username/password login (claimed account)
- File: `tools/dev/serve-admin-ui.mjs`

### Tailwind CSS Build Pipeline
- Source: `client/src/styles/app.css` — Tailwind v4 imports (theme + utilities, no preflight) + all custom CSS
- Output: `client/web/styles.css` — built by `@tailwindcss/cli`
- `@source` directives scan `client/web/index.html` and `client/web/app.js` for class usage
- Dev mode: Tailwind watcher spawned automatically by `serve-client-online.mjs` (no `--minify`)
- Prod mode: one-shot minified build via `bun run css` before server start
- Scripts: `bun run --cwd client css` (one-shot minified), `bun run --cwd client css:watch` (dev)
- CDN `<script src="https://cdn.tailwindcss.com">` removed from index.html

---

## Session & Auth Model

### Proof-of-Work Session Acquisition
- New visitors must solve a SHA-256 Proof-of-Work challenge before getting a session
- `GET /api/pow/challenge` → `{ challenge (64-char hex), difficulty }` (default 20 bits, env `POW_DIFFICULTY`)
- Client finds `nonce` (max 32 chars) where SHA-256(challenge + nonce) has `difficulty` leading zero bits
- `POST /api/pow/verify { challenge, nonce }` → `{ session_id }` (64-char hex)
- Challenge TTL: 60 seconds. Max pending: 10,000.
- Prevents bot/spam account creation (~1s solve time on modern browser at 20 bits)
- Client shows a sliding progress bar overlay during solving
- **Server-unreachable handling**: if fetch to `/api/pow/challenge` or `/api/pow/verify` fails
  (network error or bad response), the PoW overlay shows "Server is not reachable" with a Retry button.
  User clicks Retry → re-attempts from the top. No uncaught errors, no page reload needed.
  Progress bar track is hidden during error state, restored on retry.
- `valid_sessions` table tracks all server-issued sessions (PoW or login)
- Sessions expire after 7 days of inactivity (`last_used_at` column)
- Server purges expired sessions hourly via `purgeExpiredSessions()`
- WebSocket auth validates session exists in `valid_sessions` before accepting

### Session Identity
- **Session ID**: acquired via PoW challenge or login, stored in `localStorage` as `mapleweb.session`
- **Session ID is a transient auth token** — NOT the permanent identifier
- **Character name is the permanent unique identifier** for all server state
- **Name is NOT stored in the `data` JSON blob** — it lives only in the `characters.name` column
- API load/create responses inject `identity.name` for client compatibility; save handler strips it
- Client `buildCharacterSave()` stores `name` at the top level (for offline compat), not in `identity`
- `sessions` table maps `session_id → character_name` (transient lookup)
- Login generates a **new** session_id each time (old one is effectively abandoned)
- Sent as `Authorization: Bearer <session-id>` header on REST, and as first WS message

### Character Name
- Player picks a name on first session (or uses default `"MapleWeb"`)
- **First-come-first-serve**: server rejects names already claimed by another session
- Name stored in character save, associated with session ID
- Name is immutable once claimed (future: rename token)

### Account Claiming & Login (Implemented)

**Unclaimed accounts** (default): session ID = identity. Anyone with the localStorage token owns the character. No password, zero friction.

**Claiming**: Player can set a password (min 4 chars) via the glowing 🔒 HUD button.
- `POST /api/character/claim` with `{ password }` → bcrypt hashed, stored in `credentials` table
- Once claimed, the HUD button disappears
- Claimed accounts can be logged into from any device/browser

**Login**: Character creation overlay defaults to Login tab (online mode).
- `POST /api/character/login` with `{ name, password }` → bcrypt verify → returns `session_id`
- Client stores returned session ID in localStorage, reloads page
- No auth header needed on login endpoint (it IS the auth)

**Logout**: Settings > Log Out button.
- Dynamic warning text: claimed = "You can log back in", unclaimed = "Character will be lost!"
- Clears localStorage (session, save, settings), disconnects WS, reloads

**DB schema**:
```sql
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  character_name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE credentials (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  claimed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE characters (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  data TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  gm INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE valid_sessions (
  session_id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now')),
  last_used_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE jq_leaderboard (
  player_name TEXT NOT NULL COLLATE NOCASE,
  quest_name TEXT NOT NULL,
  completions INTEGER NOT NULL DEFAULT 0,
  best_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (player_name, quest_name)
);

CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  action TEXT NOT NULL
);
-- Indexes: idx_logs_username (username, timestamp DESC), idx_logs_timestamp (timestamp DESC)
```

### Action Logging

The `logs` table is an **append-only audit trail** of all significant player actions.
The server is solely responsible for writing to this table — clients never write logs directly.

**`appendLog(db, username, action)`** — inserts a row with the current UTC timestamp.
Failures are caught and logged to console (never crashes the server).

**Logged actions:**

| Source | Action format |
|--------|---------------|
| `server.ts` (WS auth) | `connected` |
| `server.ts` (WS close) | `disconnected` |
| `ws.ts` (completeMapChange) | `entered map {mapId}` |
| `ws.ts` (use_portal) | `used portal "{name}" on map {from} → map {to}` |
| `ws.ts` (npc_warp) | `npc_warp via npc#{id} to map {mapId}` |
| `ws.ts` (chat) | `send_message: {text}` (truncated to 200 chars) |
| `ws.ts` (equip_change) | `equip_change: Coat:1040002, Weapon:1302000, ...` |
| `ws.ts` (level_up) | `level_up to {level}` |
| `ws.ts` (die) | `died on map {mapId}` |
| `ws.ts` (drop_item) | `dropped {name} x{qty} on map {mapId}` |
| `ws.ts` (loot_item) | `looted {name} x{qty} on map {mapId}` |
| `ws.ts` (jq_reward) | `completed "{quest}" (#{count}), received {item} x{qty} ({category})` |
| `ws.ts` (jq_reward bonus) | `bonus reward: {name} (Zakum Helmet)` |
| `ws.ts` (hit_reactor destroy) | `destroyed reactor #{idx} on map {mapId}` |
| `ws.ts` (gm_command) | `gm_command: /{cmd} {args}` |
| `character-api.ts` (create) | `character created (gender: male/female)` |
| `character-api.ts` (claim) | `claimed account (set password)` |
| `character-api.ts` (login ok) | `logged in` |
| `character-api.ts` (login fail) | `login failed ({reason})` |

**REST endpoints**:
```
POST /api/character/claim   Body: { password }      Auth: Bearer <session-id>  → 200/400/409
GET  /api/character/claimed                          Auth: Bearer <session-id>  → 200 { claimed: bool }
POST /api/character/login   Body: { name, password } No auth header needed      → 200 { session_id: NEW_UUID } / 401/404
```

### Admin UI Auth Model (GM-only)
- Admin UI authenticates with **character username + password** (must be a claimed account).
- Login verifies:
  1. password hash in `credentials` table
  2. GM flag (`characters.gm = 1`)
- On success, server issues a random bearer token and stores only a token hash in `admin_sessions`.
- All `/api/admin/*` routes require `Authorization: Bearer <admin-token>`.
- Sessions expire (default TTL: 8h) and are touched on each authenticated request.
- Admin login is rate-limited per `IP + username` window to slow brute force attempts.

**Admin session table**:
```sql
CREATE TABLE admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions (expires_at);
```

---

## Character State Groups

### 1. `character_identity`

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `name` | string | `"MapleWeb"` | `characters.name` column (not in data blob) |
| `gender` | boolean | `false` (male) | `runtime.player.gender` |
| `skin` | number | `0` | Not yet impl |
| `face_id` | number | `20000` (male) / `21000` (female) | `runtime.player.face_id` |
| `hair_id` | number | `30000` (male) / `31000` (female) | `runtime.player.hair_id` |

> `face_id` and `hair_id` are stored character state, set once at creation based
> on gender, then persisted in save data. They are NOT re-derived from gender —
> they can be changed independently (e.g. hair salon).

### 2. `character_stats`

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `level` | number | `1` | `runtime.player.level` |
| `job` | string | `"Beginner"` | `runtime.player.job` |
| `exp` | number | `0` | `runtime.player.exp` |
| `max_exp` | number | `15` | `runtime.player.maxExp` |
| `hp` | number | `50` | `runtime.player.hp` |
| `max_hp` | number | `50` | `runtime.player.maxHp` |
| `mp` | number | `5` | `runtime.player.mp` |
| `max_mp` | number | `5` | `runtime.player.maxMp` |
| `speed` | number | `100` | `runtime.player.stats.speed` |
| `jump` | number | `100` | `runtime.player.stats.jump` |
| `meso` | number | `0` | Not yet impl |

### 3. `character_location`

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `map_id` | string | `"100000001"` | `runtime.mapId` |
| `spawn_portal` | string \| null | `null` | Closest spawn portal name (not index) |
| `facing` | number | `-1` | `runtime.player.facing` |

### 4. `character_equipment`

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `equipped` | array of `{slot_type, item_id, item_name}` | See below | `playerEquipped` |

Defaults (gender-aware, set at creation):
- Male: Coat:1040002, Pants:1060002, Shoes:1072001, Weapon:1302000
- Female: Coat:1041002, Pants:1061002, Shoes:1072001, Weapon:1302000

### 5. `character_inventory`

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `items` | array of `{item_id, qty, inv_type, slot, category}` | Starter items | `playerInventory` |

Default starter items: Red/Orange/White/Blue Potions, Snail Shells

### 6. `character_achievements` (not yet implemented)

| Field | Type | Default |
|-------|------|---------|
| `mobs_killed` | number | `0` |
| `maps_visited` | string[] | `[]` |
| `portals_used` | number | `0` |
| `items_looted` | number | `0` |
| `max_level_reached` | number | `1` |
| `total_damage_dealt` | number | `0` |
| `deaths` | number | `0` |
| `play_time_ms` | number | `0` |

### NOT server-persisted (localStorage only)
- **`character_keybinds`** — stays in `localStorage` key `mapleweb.keybinds.v1`
- **`character_settings`** — stays in `localStorage` key `mapleweb.settings.v1`
- Rationale: these are client/device preferences, not character state

---

## Persistence Schema

### SQLite Table
```sql
CREATE TABLE characters (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  data TEXT NOT NULL,            -- JSON blob (CharacterSave)
  version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);
-- Session → character lookup (transient auth tokens):
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  character_name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### TypeScript Interface
```typescript
interface CharacterSave {
  identity: {
    name: string;
    gender: boolean;
    skin: number;
    face_id: number;
    hair_id: number;
  };
  stats: {
    level: number;
    job: string;
    exp: number;
    max_exp: number;
    hp: number;
    max_hp: number;
    mp: number;
    max_mp: number;
    speed: number;
    jump: number;
    meso: number;
  };
  location: {
    map_id: string;
    spawn_portal: string | null;
    facing: number;
  };
  equipment: Array<{
    slot_type: string;
    item_id: number;
    item_name: string;
  }>;
  inventory: Array<{
    item_id: number;
    qty: number;
    inv_type: string;
    slot: number;
    category: string | null;
  }>;
  achievements: {
    mobs_killed: number;
    maps_visited: string[];
    portals_used: number;
    items_looted: number;
    max_level_reached: number;
    total_damage_dealt: number;
    deaths: number;
    play_time_ms: number;
  };
  version: number;
  saved_at: string;
}
```

### REST Endpoints
```
POST /api/character/create  Body: { name, gender }  Header: Authorization: Bearer <session-id>  → 201/409
POST /api/character/save    Body: CharacterSave      Header: Authorization: Bearer <session-id>  → 200
GET  /api/character/load                             Header: Authorization: Bearer <session-id>  → 200/404
POST /api/character/name    Body: { name }           Header: Authorization: Bearer <session-id>  → 200/409

POST /api/admin/auth/login  Body: { username, password }                               → 200/401/403
GET  /api/admin/auth/me     Header: Authorization: Bearer <admin-token>                → 200/401
POST /api/admin/auth/logout Header: Authorization: Bearer <admin-token>                → 200/401
GET  /api/admin/tables      Header: Authorization: Bearer <admin-token>                → 200
GET  /api/admin/table/:t/schema|rows|count Header: Authorization: Bearer <admin-token>
GET  /api/admin/table/:t/export.csv Header: Authorization: Bearer <admin-token>
POST /api/admin/table/:t/insert|update|delete Header: Authorization: Bearer <admin-token>
POST /api/admin/query       Body: { sql } (SELECT/PRAGMA/EXPLAIN only)
```

> Full request/response shapes: **see `.memory/shared-schema.md`**

### Auto-Save Triggers
- Map transition (portal use)
- Equip/unequip item
- Level up
- Loot item from ground
- Drop item on map
- Inventory slot rearrangement
- Periodic timer: every 30 seconds
- Page unload (`beforeunload`)

### Dual-Path Persistence (Online Mode)
When online, `saveCharacter()` sends data via **both** paths:
1. **WebSocket `save_state`**: Sends inventory, equipment, and stats to server via WS.
   Server updates in-memory `WSClient` state AND persists to SQLite immediately.
2. **REST `POST /api/character/save`**: Full CharacterSave JSON blob as backup.

Additionally, the server persists the client's tracked state on **WebSocket disconnect**,
ensuring no data loss if the client crashes without triggering a save.

### Server-Side State Tracking
The `WSClient` struct tracks `inventory: InventoryItem[]` and `stats: PlayerStats`
in memory during the session (initialized from DB on auth, updated by `save_state` messages).
On disconnect, `persistClientState()` builds a full save from tracked state and writes to DB.

### Client Logic
```javascript
if (window.__MAPLE_ONLINE__) {
  // 1. WS: wsSend({ type: "save_state", inventory, equipment, stats })
  // 2. REST: POST /api/character/save with session token
} else {
  // localStorage.setItem("mapleweb.character.v1", JSON.stringify(save))
}
```

---

## WebSocket Real-Time Protocol

> Full message definitions, field types, and examples: **see `.memory/shared-schema.md`**

### Architecture Principles
- **Server is authoritative.** Clients send inputs, server decides outcomes.
- **Periodic snapshots + interpolation.** Server relays position updates at 20 Hz. Client interpolates between snapshots (100–200 ms buffer).
- **Soft-predicted local movement.** Client moves immediately for feel. Server sends authoritative position periodically. Small drift → lerp correction (100–300 ms). Large drift → snap.
- **Proximity culling.** Only relay updates within the same map room.
- **JSON wire format (v1).** All messages include a `type` field.

### Connection Flow (Server-Authoritative)
1. Client sets `_awaitingInitialMap = true` and creates `_initialMapResolve` promise **BEFORE** connecting WS
2. Client opens `ws://<server>/ws`
3. Client sends `{ type: "auth", session_id: "<uuid>" }` as first message
4. Server validates, loads character from DB
5. Server registers client in `allClients` but does **NOT** join any room yet
6. Server sends `change_map { map_id, spawn_portal }` with saved location
7. Client receives `change_map` → resolves `_initialMapResolve` (captured because flag was set in step 1)
8. Client loads the map, sends `map_loaded`
9. Server adds client to room, sends `map_state`, broadcasts `player_enter`
10. Client/server exchange `ping`/`pong` every 10s for keepalive
11. Server disconnects clients with no activity for 30s

**Race condition fix:** `_awaitingInitialMap` must be set BEFORE `connectWebSocketAsync()` because
the server's `change_map` arrives immediately after auth (often before the async connect resolves).
If `_awaitingInitialMap` is false when `change_map` arrives, it falls through to
`handleServerMapChange()` causing a duplicate map load. Same fix applied to duplicate-login retry path.

### Server Room Model
```
rooms: Map<mapId, Map<sessionId, WSClient>>
allClients: Map<sessionId, WSClient>
```

### Map Transitions (Server-Authoritative)

**Portal use (online mode)**:
1. Client near portal, presses up → sends `use_portal { portal_name }`
2. Server validates: portal exists, player within 200px, valid target, destination exists
3. Server removes from old room → broadcasts `player_leave`
4. Server sends `change_map { map_id, spawn_portal }`
5. Client loads map, sends `map_loaded`
6. Server adds to new room → sends `map_state`, broadcasts `player_enter`

**Debug panel warp (online mode)**:
1. Client sends `admin_warp { map_id }`
2. Server validates map exists → same steps 3-6 as portal flow

**NPC travel / taxi (online mode)**:
1. Player selects destination in NPC dialogue → sends `npc_warp { npc_id, map_id }`
2. Server validates: NPC is on current map, NPC has travel script, destination is whitelisted
3. Same steps 3-6 as portal flow

**Jump quest exit NPCs**:
- Scripts: `subway_out` (NPC 1052011), `flower_out` (NPC 1061007), `herb_out` (NPC 1032004), `Zakum06` (NPC 2030010)
- Maps: 103000900-907, 105040310-314, 101000100, 280020000
- Dialogue: confirm prompt ("Are you sure you want to leave?") with Ok/Cancel
- Ok → `npc_warp` to map 100000001 (Mushroom Park)
- Server whitelist: each script allows only `{ mapId: 100000001 }`

**Offline mode**: Client decides portal/NPC target directly, no server involvement.

**Anti-cheat**:
- Server tracks player position from `move` messages (client cannot lie about position)
- Velocity check: moves >1200 px/s are silently dropped (prevents position spoofing)
- `positionConfirmed` required before `use_portal` (prevents default 0,0 exploit)
- NPC warp validates NPC existence on map + destination whitelist
- `admin_warp` only works with `debug: true` server config
- `enter_map` / `leave_map` silently ignored (no bypass)

- Client renders remote players only after receiving `map_state`

### Remote Player Rendering (C++ OtherChar parity)
- Movement queue with timer-based consumption (not instant apply)
- Position interpolation: delta per tick (target - current), not lerp
- Animation fully local: uses stance speed (walk=hspeed, climb=vspeed, else 1.0)
- Per-player equip WZ data loaded separately from local player's data
- Correction: <2px ignore, 2-300px smooth lerp, >300px instant snap
- Attack frame delay reads actual WZ data (not hardcoded 120ms)
- Face expressions synced via `player_face`, shown for 2.5s, static frame 0 (no cycling — avoids async decode blink), image pre-warmed on receipt

### Server-Authoritative Item Drops
- Server stores drops per map: `RoomManager.mapDrops: Map<mapId, Map<drop_id, MapDrop>>`
- `MapDrop` fields: `drop_id`, `item_id`, `name`, `qty`, `x`, `startY`, `destY`, `owner_id`, `iconKey`, `category`
- Drop flow: client sends `drop_item` → server assigns unique `drop_id` → broadcasts `drop_spawn` to ALL in room (including dropper to replace temp ID)
- Loot flow: client sends `loot_item { drop_id }` → server removes from state → broadcasts `drop_loot` to ALL (looter adds to inventory, others see pickup animation)
- Loot animation flies toward the looter's position (local player or remote player via `_lootTargetX/Y`)
- `map_state` includes `drops[]` for players entering a map (drops appear already landed)
- Offline mode: drops use negative temp IDs, no server interaction

### Cooldowns
- **Chat**: 1s between messages (`_lastChatSendTime`), silently dropped if too fast
- **Emote**: 1s between expression changes (`_lastEmoteTime`), hotkeys ignored if too fast

### Duplicate Login Blocking
- Server enforces **one connection per character name** (not just per session ID)
- On WS auth, after resolving session → character name, server checks `roomManager.getClientByName(name)`
- If the same session ID is already connected → reject with 4006
- If a **different** session ID is already connected with the same character name → reject with 4006
- The **existing** connection always wins; the new connection is rejected
- WS close code 4006 shows full-screen blocking modal BEFORE map loads
- `connectWebSocketAsync()` returns Promise<boolean>: true on first message (auth accepted), false on 4006
- Boot sequence: connect WS → if 4006 blocked, show overlay + stop → else wait for `change_map` → load map → send `map_loaded`
- Overlay offers Retry (reconnects async, waits for server `change_map`) or Log Out (wipes localStorage, reloads)

### Movement Keybinds
- WASD removed — only configurable movement keys in `runtime.keybinds`
- `moveLeft`, `moveRight`, `moveUp`, `moveDown` (default: arrow keys)
- `getGameplayKeys()` builds key set dynamically from current keybinds
- Online mobile clients (`window.__MAPLE_ONLINE__` + mobile/coarse-pointer detect) spawn an on-screen touch overlay optimized for thumb reach:
  - larger semi-opaque controls (80% opacity, no glass/blur effect),
  - bottom-safe-area positioning with minimal side padding (pushed far left/right),
  - D-pad arrows map to `runtime.input.left/right/up/down`,
  - right-side buttons use classic labels: `A` = jump (larger lower-right), `B` = attack (upper-right).

---

## V2 Map Set

### Default Spawn Map
`100000001` — Henesys Townstreet

### Jump Quest Maps

**Shumi's Lost Coin** (Kerning City)
- `103000900` — B1 Area 1
- `103000901` — B1 Area 2
- `103000902` — B1 Subway Depot

**Shumi's Lost Bundle of Money**
- `103000903` — B2 Area 1
- `103000904` — B2 Area 2
- `103000905` — B2 Subway Depot

**Shumi's Lost Sack of Money**
- `103000906` — B3 Area 1
- `103000907` — B3 Area 2
- `103000908` — B3 Area 3

**John's Pink Flower Basket** (Sleepywood)
- `105040310` — Deep Forest of Patience Step 1
- `105040311` — Deep Forest of Patience Step 2 (reward: NPC 1063000 `viola_pink`)

**John's Present**
- `105040312` — Deep Forest of Patience Step 3
- `105040313` — Deep Forest of Patience Step 4 (reward: NPC 1063001 `viola_blue`)

**John's Last Present**
- `105040314` — Deep Forest of Patience Step 5
- `105040315` — Deep Forest of Patience Step 6 (reward: NPC 1043000 `bush1`)

**The Forest of Patience** (Ellinia)
- `101000100` — Step 1
- `101000101` — Step 2

**Breath of Lava** (Zakum)
- `280020000` — Level 1
- `280020001` — Level 2

### V2 Map Dependencies

**BGM (Sound.wz)**
- `Bgm00/FloralLife`, `Bgm00/SleepyWood`
- `Bgm01/MoonlightShadow`
- `Bgm03/Subway`
- `Bgm05/HellGate`

**Mobs (Mob.wz)** — 7 unique
- `1210103` Bubbling
- `3230101` Jr. Wraith
- `3230300` Jr. Boogie 1
- `5100002` Firebomb
- `9100000` Super Slime
- `9100001` Super Jr. Necki
- `9100002` Super Stirge

**NPCs (Npc.wz)** — 11 unique
- `1012101` Maya
- `1032004` Louis
- `1043000` a pile of flowers
- `1052008` Treasure Chest
- `1052009` Treasure Chest
- `1052011` Exit
- `1061007` Crumbling Statue
- `1063000` a pile of pink flowers
- `1063001` a pile of blue flowers
- `2030010` Amon
- `2032003` Lira

**Tile Sets (Map.wz/Tile)** — 6
- darkWood, graySubway, moltenRock, rustSubway, woodBridge, woodMarble

**Object Sets (Map.wz/Obj)** — 10
- acc1, acc2, connect, dungeon, dungeon2, house, houseDW, insideGS, prop, trap

**Background Sets (Map.wz/Back)** — 6
- darkWood, grassySoil, metroSubway, metroSubway2, moltenRock, shineWood

### V2 Resource Pipeline (Implemented)

**Extraction script**: `tools/build-assets/extract-v2-maps.mjs`
- Run: `bun run extract:v2`
- Scans all 20 V2 maps for dependencies (tiles, objects, backgrounds, mobs, NPCs, BGM)
- Copies from `resources/` to `resourcesv2/` preserving directory structure
- Also copies shared assets: Character base, UI, Sound, String, Effect, Base
- 90 files extracted, 0 missing

**Client V2 routing**: `cachedFetch()` rewrites `/resources/` → `/resourcesv2/` when V2 active
- Activated by: `?v2=1` query param OR `window.__MAPLE_ONLINE__` flag
- Graceful fallback: if V2 path returns 404, falls back to `/resources/`
- Cache API separates V2 entries naturally (different URL prefix)

**Git**: Extracted WZ files in `resourcesv2/*.wz/` are gitignored (too large).
Manually curated files (`resourcesv2/mob/`, `resourcesv2/sound/`) remain tracked.

---

## Implementation Order

| Step | What | Status |
|------|------|--------|
| **1** | Offline localStorage persistence + name/gender picker | ✅ Done (a88d264) |
| **2** | Server SQLite + REST character API + online client wiring | ✅ Done (6f5cdbd) |
| **3** | WebSocket room manager + message routing | ✅ Done (c4c5ddd) |
| **4** | Client WS connect + remote player rendering | ✅ Done (a9c8147) |
| **5** | V2 resource extraction pipeline for jump quest maps | Pending (parallel) |

---

## Server-Authoritative Reactor System

- **`server/src/reactor-system.ts`** — standalone module for reactor state, hit validation, respawn, loot.
- Map 100000001 has 6 destroyable boxes (**reactor 0002001**, 64×45 wooden box).
- 5 on grass ground at x=-400, 200, 600, 1000, 1500 (y=252, foothold 274); 1 on platform (x=60, y=16, foothold 38).
- Reactor y = footholdY - (spriteHeight - originY) so sprite bottom sits on foothold.
- **4 hits to destroy** (REACTOR_MAX_HP=4). Each hit advances WZ state.
- **600ms global cooldown** between hits on the same reactor (shared across all players).
- **10s respawn** after destruction (REACTOR_RESPAWN_MS=10000).
- **Server-computed loot drops** via `rollReactorLoot()`:
  - 50% ETC, 25% USE, 19% equipment, 5% chairs, 2% cash
  - Pools loaded dynamically from WZ at startup via `loadDropPools(resourceBase)`
  - **Item blacklist** (276 items) filters out at load time:
    - Items with `"MISSING NAME"` or empty name in String.wz (unreleased/placeholder)
    - Prefix 160 weapons (Skill Effect — no stances, uses ring islot, breaks rendering)
    - Equipment with `expireOnLogout=1` (would vanish on disconnect)
    - Equipment with `quest=1` (quest items not usable outside quests)
    - Blacklist built by `buildItemBlacklist()` before pool loading
  - Equipment: `Character.wz/{Cap,Coat,...,Weapon}/` (~4227 items after blacklist)
  - USE: `Item.wz/Consume/` (~2266), ETC: `Item.wz/Etc/` (~2360), Chairs: `Item.wz/Install/` (~249), Cash: `Item.wz/Cash/` (~464)
  - Random item selected from chosen category's filtered WZ pool
- Server broadcasts `reactor_hit`/`reactor_destroy`/`reactor_respawn` to all room clients.
- `map_state` includes `reactors[]` array for late-joining clients.
- Client `performAttack()` finds reactors in range via `findReactorsInRange()`, sends `hit_reactor`.
- **Hit animations**: `reactor_hit` → state 0 shake (2 frames, 400ms); `reactor_destroy` → state 3 break (7 frames, 1400ms).
- **Sounds**: `ReactorHit` (shake) and `ReactorBreak` (destroy) from `Sound.wz/Reactor.img.json > 2000`.
- **CRITICAL**: `updateReactorAnimations(dt)` receives `dt` in **milliseconds** (caller passes `dt * 1000`).
  Do NOT multiply by 1000 again inside the function.
- Client drop landing uses `findFootholdAtXNearY` (same as user drops, -4px offset).
- Reactor respawn fades in (0.5s), destruction fades out (0.33s).

### Loot Ownership (Server-Authoritative)
- `ReactorState.damageBy`: `Map<sessionId, hitCount>` — tracks hits per player.
- On destroy, `hitReactor()` returns `majorityHitter` (player who dealt most hits).
- Drop `owner_id` = majority hitter. Server `loot_item` handler rejects non-owners for 5s.
- **Player-dropped items**: `owner_id = ""` — no loot protection, anyone can pick up.
- Server sends `loot_failed { reason, owner_id, remaining_ms }` on rejection.
- Client pre-checks `drop.ownerId` + `drop.createdAt` (local timestamp) to skip pointless requests.
- `damageBy` cleared on reactor respawn.
- 69 server tests (5 reactor/loot tests: hit, destroy+loot, cooldown, range, loot ownership).

---

## C++ Reference Mapping

| Web State Group | C++ Struct / System |
|-----------------|---------------------|
| identity | `StatsEntry.name`, `LookEntry.female/skin/faceid/hairid` |
| stats | `StatsEntry.stats` (EnumMap of `MapleStat::Id`), `StatsEntry.exp` |
| location | `StatsEntry.mapid`, `StatsEntry.portal` |
| equipment | `LookEntry.equips` (map<int8_t, int32_t>) |
| inventory | `Inventory::inventories` (per-type slot→item maps) |
| keybinds | `UIKeyConfig` (localStorage only — not server-persisted) |
| settings | Client-side config (localStorage only) |
| achievements | Not in C++ client (custom addition) |

---

## Combat & Equipment Rendering

### Weapon Stance Adjustment (C++ CharEquips::adjust_stance)
- Two-handed weapons (staff, 2H sword/axe/mace, spear, polearm, crossbow) use stand2/walk2
- `adjustStanceForWeapon(action)` reads weapon WZ `info/stand` and `info/walk`
- Applied in `getCharacterFrameData`, animation timer, remote player rendering

### Attack Stances (C++ CharLook::getattackstance)
- Attack type read from weapon WZ `info/attack` ($short): 1-9
- Each type has normal and degenerate stance arrays (`ATTACK_STANCES_BY_TYPE`, `DEGEN_STANCES_BY_TYPE`)
- `getWeaponAttackStances(degenerate)` filters to stances with body frame data

### Ranged Ammo Check (C++ RegularAttack::can_use)
- Bow/Crossbow without arrows (206xxxx), Claw without stars (207xxxx), Gun without bullets (233xxxx) → attack blocked
- `hasProjectileAmmo()` scans USE inventory for matching `WEAPON_AMMO_PREFIXES`
- Blocked attacks show grey system chat message ("Please equip throwing stars first." etc.)
- Prone attacks bypass ammo check (always melee proneStab)
- Degenerate flag now only applies when prone (damage /= 10)

### Equipment Slot Types (16 total)
Cap, FaceAcc, EyeAcc, Earrings, Pendant, Cape, Coat, Longcoat, Shield, Glove, Pants, Shoes, Weapon, Ring, Belt, Medal

### Overall (Longcoat) Handling
- `hasOverallEquipped()` → hides Coat + Pants in rendering
- Separate slot from Coat (C++ CharEquips::has_overall: id/10000 == 105)

### Face Accessory Rendering
- Uses face expression as stance (not body action), frame 0
- Falls back to "default" expression; handles flat canvas children (no frame sub-nodes)

---

## Jump Quest Treasure Chest Reward System

### Server (`ws.ts` → `jq_reward` handler)
- `JQ_TREASURE_CHESTS` map: `"103000902"` → `{ npcId: "1052008", questName: "Shumi's Lost Coin", requirePlatform: false }`
- **Kerning City Subway**: 103000902 (NPC 1052008), 103000905 (NPC 1052009), 103000909 (NPC 1052010)
- **Forest of Patience**: 105040311 (NPC 1063000 `viola_pink`), 105040313 (NPC 1063001 `viola_blue`), 105040315 (NPC 1043000 `bush1`)
- Validates player is on the correct map, not already transitioning
- **Proximity check**: `requirePlatform: true` maps check Euclidean distance between player and NPC
  - Default range: 200px. Per-map override via `proximityRange` field (e.g. 105040315 → 500px due to wide platform)
  - Server uses `getNpcOnMap()` + `distance()` from `map-data.ts`
  - Client pre-checks in `buildScriptDialogue()` before showing reward option
  - Rejection sends `jq_proximity` message → client shows random "come closer" phrase
- **Inventory capacity check**: before rolling reward, server checks `hasInventorySpace(client, "EQUIP")` and `hasInventorySpace(client, "CASH")`. If both tabs are full, sends `jq_inventory_full` and does NOT warp. Player stays on map and can drop items to make room.
- After capacity check passes, also checks the specific reward tab (EQUIP or CASH) has room.
- `rollJqReward()` (reactor-system.ts): 50/50 regular equip or cash equip (equipable items with `cash=1` in WZ info), qty 1. `CASH_EQUIP_DROPS` pool built during `loadDropPools()` by scanning Character.wz equip dirs for items with `cash=1`.
- Adds item to `client.inventory`, increments `client.achievements.jq_quests[questName]`
- Persists immediately via `persistClientState()`
- Sends `{ type: "jq_reward", quest_name, item_id, item_name, item_qty, item_category, completions }`
- Then calls `roomManager.initiateMapChange()` → warps player to `100000001`
- Zakum Helmet bonus (25% on Breath of Lava): only awarded if EQUIP tab has room (`hasInventorySpace`)

### Client (`app.js`)
- NPC scripts: `subway_get1/2/3` → "Open Chest", `viola_pink`/`viola_blue`/`bush1` → "Claim Reward"
- `requirePlatform` scripts also do client-side Y distance check (>60px → show proximity phrase in NPC dialogue)
- `requestJqReward()`: online sends `{ type: "jq_reward" }`, offline just warps home
- WS `jq_reward` handler: adds item to `playerInventory`, updates `runtime.player.achievements.jq_quests`, shows grey system chat message
- WS `jq_inventory_full` handler: shows system chat "Your inventory is full! Please drop an item to make room for your reward." Player stays on map.
- WS `jq_proximity` handler: shows random "come closer" phrase in system chat
- `handleServerMapChange()` handles the subsequent unsolicited `change_map`

### Item Name Lookup (`reactor-system.ts`)
- `loadItemNames(resourceBase)`: loads names from String.wz (Eqp, Consume, Etc, Ins, Cash)
- `getItemName(itemId)`: returns name or `"Item #${id}"` fallback
- Called at startup in `dev.ts` alongside `loadDropPools()`

### Achievements
- `WSClient.achievements`: `Record<string, any>` — nested object with `jq_quests` sub-key
- `client.achievements.jq_quests[questName]`: number (completion count per JQ)
- Persisted in `buildServerSave()` → `{ ...client.achievements }`
- Default character template: empty `{}` (db.ts `buildDefaultCharacterSave`)
- Client tracks locally in `runtime.player.achievements` — synced via `save_state` (merge: take max per key)
- REST save preserves server-side `jq_quests` (character-api.ts merge logic)
- Character info modal displays only `jq_quests` entries with count > 0

### JQ Leaderboard Table
- `jq_leaderboard`: `(session_id, quest_name)` → `completions`, `best_at`
- Updated via `incrementJqLeaderboard()` on each JQ completion (alongside achievement)
- Indexed by `(quest_name, completions DESC)` for fast per-quest queries
- REST: `GET /api/jq/leaderboard` → all quests; `GET /api/jq/leaderboard?quest=X` → single quest
- Returns `[{ name, completions }]` sorted by completions DESC, best_at ASC
- Backfilled from existing character achievements on table creation

### Debug Log System
- `dlog(category, msg)` — internal ring buffer, 5000-line max, no console output
- `rlog(msg)` — convenience wrapper, routes to `dlog("info", msg)`
- Categories: `info`, `warn`, `error` — each line timestamped `[HH:MM:SS.mmm] [category]`
- Global captures: `window.onerror` and `unhandledrejection` → auto-logged as `[error]`
- All `console.log/warn/error/info` removed from client — zero console output
- Debug panel removed; logs only accessible via Settings > Download
- Settings > Diagnostics > "Download Debug Logs" exports full buffer as `.txt` with header
  (timestamp, user agent, screen size, connection/ping status, map, player, line count)

### Ping HUD
- Settings > Display > "Show Ping" checkbox (`showPing` in `runtime.settings`, persisted)
- Draggable `game-window` element (`#ping-window`)
- Updated on `pong` response (5s interval) and disconnect
- States: "Offline" (grey), "Initializing..." (grey), "{N} ms" (green/yellow/red)
- Ping interval: 5s with immediate first ping on WS connect
- Closing × unchecks setting and saves

### GM System
- `characters.gm` column: `INTEGER NOT NULL DEFAULT 0` (auto-migrated on existing DBs)
- GM management via CLI:
  - `bun run make-gm <username> [--db <path>]` (toggle existing character GM flag)
  - `bun run create-gm <username> <password> --db <path>` (create/update GM account credentials and force GM=true)
- DB helpers: `isGm(db, name)`, `setGm(db, name, gm)`
- `WSClient.gm: boolean` loaded from DB on auth, sent to client via `change_map.gm`
- GM slash commands typed in chat (prefixed `/`), intercepted client-side before `wsSend`
- Slash commands are NOT displayed in world chat or bubbles

**Client-side commands** (no server round-trip):
- `/mousefly` — toggle Ctrl+click fly mode (`runtime.gmMouseFly`)
- `/overlay` — toggle debug overlays (`runtime.gmOverlay`): footholds, ropes, tiles, life markers, hitboxes, portals, reactors, HUD info
- `/help` — list all commands

**Server-side commands** (sent as `gm_command` WS message):
- `/map <map_id>` — warp self to map (server validates map exists)
- `/teleport <username> <map_id>` — warp another online player (server validates both)

**WS messages**:
- `{ type: "gm_command", command: "map"|"teleport", args: string[] }` — client → server
- `{ type: "gm_response", ok: boolean, text: string }` — server → client (shown as grey system chat)

**GM overlay includes**: footholds (green, coords, IDs), ropes (yellow, range, ladder flag), tiles (blue boxes, u:no, origin), NPCs (purple, name, script, pos), mobs (red, name, HP, action, facing, dead/dying), portals (purple boxes, type, destination), reactors (pink, HP, state), player/mob/trap hitboxes, top-left HUD (map ID, player coords, action, camera, counts).

### Chat Message Types
- `type: "system"` — grey text (#9ca3af), italic
- `type: "system", subtype: "welcome"` — yellow (#fbbf24), italic
- `addSystemChatMessage(text, subtype)` — optional subtype parameter
- Welcome phrases: 24 jump-quest-themed sarcastic messages about platforms, falls, ropes, and suffering (randomly selected on map load)
