# Server Architecture

> Bun-native game server: REST API, WebSocket multiplayer, SQLite persistence.
> Source: `server/src/` (15 TypeScript files, ~6,100 lines).

---

## Entry Point

`server/src/dev.ts` — bootstraps the server:
1. Loads drop pools + item names from `resourcesv2/` WZ data
2. Creates an `InMemoryDataProvider` (legacy asset API — mostly unused now)
3. Calls `createServer(provider, config)` → `start()` on port 5200

```bash
bun run server          # starts game server on :5200
bun run create-gm NAME PASS  # create/update GM account
bun run make-gm NAME         # toggle GM flag
```

---

## File Map

| File | Lines | Role |
|------|-------|------|
| `server.ts` | 692 | HTTP server factory, route dispatch, WebSocket upgrade, CORS, metrics |
| `ws.ts` | 1,336 | Room manager, WS message handler, map transitions, drops, mob authority |
| `db.ts` | 505 | SQLite schema, session/character CRUD, credentials, JQ leaderboard, action logs |
| `character-api.ts` | 337 | REST `/api/character/*` — create, load, save, claim, login |
| `admin-api.ts` | 467 | REST `/api/admin/*` — GM-only DB dashboard (tables, rows, SQL, CSV export) |
| `pow.ts` | 222 | Proof-of-Work session acquisition — challenge/verify, session validation |
| `map-data.ts` | 448 | Lazy WZ map parser — portals, NPCs, footholds, NPC script destinations |
| `reactor-system.ts` | 534 | Destroyable reactors — HP, cooldowns, loot tables, respawn timers |
| `data-provider.ts` | 89 | In-memory DataProvider (legacy asset API interface) |
| `dev.ts` | 21 | Dev entry point (loads WZ data, starts server) |
| `create-gm.ts` | 64 | CLI: create GM account with credentials |
| `make-gm.ts` | 34 | CLI: toggle GM flag on existing character |
| `ws.test.ts` | 790 | WebSocket integration tests |
| `admin-api.test.ts` | 188 | Admin API tests |
| `character-api.test.ts` | 387 | Character API tests |

---

## Server Architecture (`server.ts`)

### `createServer(provider, config) → { start, metrics }`

Factory function that returns a `start()` method. Calling `start()`:
1. Initializes SQLite database (`initDatabase()`)
2. Sets up admin API handler if `adminUiEnabled`
3. Initializes PoW table, starts session purge interval (hourly)
4. Creates `RoomManager` for WebSocket multiplayer
5. Starts drop sweep (5s interval) and reactor tick (1s interval)
6. Returns `Bun.serve()` instance

### Config Defaults
```typescript
port: 5200, host: "0.0.0.0", dataDir: "./data",
debug: false, maxBatchSize: 50, compression: true,
adminUiEnabled: true, adminSessionTtlMs: 8h
```

### Route Dispatch (priority order)
1. `OPTIONS` → CORS preflight (204)
2. `/api/admin/*` → admin API handler (GM-only)
3. `/api/pow/*` → PoW challenge/verify
4. `/api/character/*` → character CRUD
5. `/api/leaderboard`, `/api/jq/leaderboard` → JQ leaderboard
6. `/api/online` → player count
7. `/health`, `/ready` → health check
8. `/metrics` → server metrics
9. `/api/v1/*` → legacy asset API (batch, blob, asset)
10. Everything else → 404

### WebSocket Lifecycle (`/ws`)
1. **Upgrade**: captures client IP from `X-Forwarded-For` or direct connection
2. **First message** must be `{ type: "auth", session_id }`:
   - Validates session in `valid_sessions` table (PoW-issued or login-issued)
   - Resolves `session_id → character_name` via `sessions` table
   - Loads character data from `characters` table
   - Rejects duplicate logins (same session or same name already connected → close 4006)
   - Registers client in `RoomManager`, initiates map change to saved map
3. **Subsequent messages**: dispatched to `handleClientMessage()` in `ws.ts`
4. **Close**: persists character state to DB, removes from rooms, logs disconnect

### Close Codes
| Code | Reason |
|------|--------|
| 4001 | First message not auth |
| 4002 | No character for session |
| 4003 | Inactive (30s heartbeat timeout) |
| 4004 | Replaced by new connection |
| 4005 | No database configured |
| 4006 | Already logged in (duplicate) |
| 4007 | Session invalid/expired |

---

## Room Manager (`ws.ts`)

### Core State
```typescript
rooms: Map<mapId, Map<sessionId, WSClient>>   // map-scoped rooms
allClients: Map<sessionId, WSClient>            // all connected players
mapDrops: Map<mapId, Map<drop_id, MapDrop>>     // server-authoritative drops
mobAuthority: Map<mapId, sessionId>              // mob AI controller per map
```

### Map Transitions (server-authoritative)
All map changes go through `initiateMapChange()`:
1. Remove client from current room
2. Set `pendingMapId`, clear `chairId`
3. Send `change_map { map_id, spawn_portal }` to client
4. Client loads map, sends `map_loaded`
5. Server calls `completeMapChange()`: join new room, send `map_state` snapshot, broadcast `player_enter`

No client-driven `enter_map`/`leave_map` messages accepted (silently ignored).

### Portal Validation (`use_portal`)
Server validates:
- Player position confirmed on current map
- Not already transitioning
- Portal exists, is usable (not spawn type 0)
- Player within 200px of portal (`PORTAL_RANGE_PX`)
- Destination map exists

### NPC Warp Validation (`npc_warp`)
- NPC must be on current map (`isNpcOnMap`)
- Destination must be in NPC's script-defined destinations (`isValidNpcDestination`)
- Destination map must exist

### Mob Authority
- First player in a map becomes mob authority
- Authority runs mob AI locally, sends `mob_state` at 10Hz
- When authority leaves, next player in room takes over
- Non-authority clients receive `mob_state`, skip local AI

### Drop System
- Drops are server-authoritative with auto-incrementing IDs
- `drop_item` → server assigns `drop_id` → `drop_spawn` broadcast to all
- `loot_item` → server validates ownership + inventory capacity → `drop_loot` broadcast
- 5-second loot protection for reactor/mob drops (owner = majority damage dealer)
- 180s drop expiry with server-side sweep (5s interval)
- `canFitItem()` checks stackable vs equip capacity

### Reactor System
- Multi-hit (4 HP), 600ms global cooldown, range-validated
- Destruction broadcasts `reactor_destroy`, rolls random loot → `drop_spawn`
- 10s respawn timer → `reactor_respawn` broadcast
- Loot tables loaded from `resourcesv2/` at startup:
  - Equipment 19% | Use 25% | Etc 50% | Chairs 5% | Cash 2%
- Item blacklist: MISSING NAME, Skill Effect (prefix 160), `expireOnLogout=1`, `quest=1`

### JQ Rewards (`jq_reward`)
- 8 jump quest maps with treasure chest NPCs
- Server validates proximity to NPC, inventory capacity
- Rolls 50/50 equipment or cash equipment
- Increments `jq_leaderboard` table
- Warps player to Mushroom Park (100000001)
- Zakum Helmet bonus: 25% chance on Breath of Lava completion

### Message Types Handled
`ping`, `move`, `chat`, `face`, `attack`, `sit`, `prone`, `climb`, `equip_change`,
`save_state`, `jump`, `use_portal`, `map_loaded`, `npc_warp`, `jq_reward`, `admin_warp`,
`gm_command`, `level_up`, `damage_taken`, `die`, `respawn`, `drop_item`, `mob_state`,
`mob_damage`, `loot_item`, `hit_reactor`

### GM Commands (via `gm_command` message)
- `/map <id>` — warp self to map
- `/teleport <username> <map_id>` — warp another player

---

## Database Schema (`db.ts`)

SQLite with WAL mode. Path: `./data/maple.db`.

| Table | Primary Key | Description |
|-------|-------------|-------------|
| `sessions` | `session_id` | Transient auth tokens → character name |
| `characters` | `name (NOCASE)` | JSON save data + version + GM flag |
| `credentials` | `name (NOCASE)` | bcrypt password hash (claimed accounts) |
| `valid_sessions` | `session_id` | PoW/login-issued session tracking + `last_used_at` |
| `jq_leaderboard` | `(player_name, quest_name)` | JQ completion counts |
| `logs` | `id (autoincrement)` | Append-only audit trail (username, timestamp, action, IP) |
| `admin_sessions` | `id (autoincrement)` | Admin bearer token hashes + expiry |

### Default Character Template
Created on first login — includes starter equipment (gender-variant tops/bottoms),
3 potion types, 2 etc items, 1 chair. Spawns at map `100000001`.

### Account System
- **Unclaimed**: character exists but no password — can be reclaimed if offline
- **Claimed**: has bcrypt password in `credentials` table
- **Login**: verifies password → issues new `session_id` via `registerSession()`
- Names are case-insensitive (`COLLATE NOCASE`)

### Action Logging
`appendLog(db, username, action, ip)` — fire-and-forget, never crashes server.
18 action points wired: connect, disconnect, enter map, use portal, npc warp,
chat, equip change, level up, die, drop item, loot item, JQ completion, reactor destroy,
GM commands, character creation, account claim, login.

---

## Auth: Proof-of-Work (`pow.ts`)

### Flow
1. `GET /api/pow/challenge` → `{ challenge: 64-char hex, difficulty: 20 }`
2. Client brute-forces nonce where SHA-256(challenge + nonce) has N leading zero bits
3. `POST /api/pow/verify { challenge, nonce }` → `{ session_id: 64-char hex }`
4. Session registered in `valid_sessions` table

### Config
- Difficulty: `POW_DIFFICULTY` env var (default 20, ~1s solve time)
- Challenge TTL: 60 seconds
- Max pending challenges: 10,000
- Session expiry: 7 days of inactivity

---

## Character API (`character-api.ts`)

All except `/login` require `Authorization: Bearer <session_id>`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/character/create` | POST | Create with `{ name, gender }`. Name 2-12 chars, alphanumeric + spaces. |
| `/api/character/load` | GET | Load save data. Injects `identity.name` from DB key. |
| `/api/character/save` | POST | Save full character JSON. Strips `identity.name`. Merges JQ achievements (take max). |
| `/api/character/claim` | POST | Set password `{ password }` (min 4 chars). |
| `/api/character/claimed` | GET | Check if account has password. |
| `/api/character/login` | POST | `{ name, password }` → new session_id. |

---

## Admin API (`admin-api.ts`)

GM-only bearer auth. Login rate-limited per IP+username (8 attempts per 5 min window).

- **Auth**: login/logout/me
- **Tables**: list, schema, rows (paginated + search), count, export CSV
- **Mutations**: insert, update (PK match), delete
- **SQL**: read-only query runner (SELECT/PRAGMA/EXPLAIN only)
- Sessions: 8-hour TTL, SHA-256 hashed tokens in `admin_sessions` table

---

## Map Data (`map-data.ts`)

Lazy-loads WZ JSON from `resourcesv2/Map.wz/Map/MapN/NNNNNNNNN.img.json`.

### Parsed Data
- **Portals**: index, name, type, x/y, target map + portal name
- **NPCs**: id, x, cy, foothold
- **Footholds**: id, x1/y1/x2/y2

### NPC Script Destinations
Server-authoritative travel destinations per NPC script ID:
- Victoria Island taxis (6 NPCs → `VICTORIA_TOWNS`)
- Ossyria taxi, Aqua taxi
- Spinel world trip → `ALL_MAJOR_TOWNS` (17 destinations)
- JQ challenge NPC → 8 jump quest maps
- JQ exit NPCs → Mushroom Park

### Validation Functions
`isNpcOnMap()`, `isValidNpcDestination()`, `isOnSamePlatform()`,
`isUsablePortal()`, `hasValidTarget()`, `distance()`

---

## Velocity Check (Anti-Cheat)

`MAX_MOVE_SPEED_PX_PER_S = 1200` — moves exceeding this speed are silently dropped.
Position not confirmed until first valid move on each map.
