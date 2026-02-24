# Server Architecture

> Bun-native game server: REST API, WebSocket multiplayer, SQLite persistence.
> Source: `server/src/` (15 TypeScript files, ~6,100 lines).
>
> For REST endpoints, WS message shapes, session model, and wire protocol → see `client-server.md`.

---

## Entry Point

`server/src/dev.ts` — bootstraps the server:
1. Loads drop pools + item names from `resourcesv3/` WZ data
2. Creates an `InMemoryDataProvider` (legacy asset API — mostly unused now)
3. Calls `createServer(provider, config)` → `start()` on port 5200

```bash
bun run server              # starts game server on :5200
bun run create-gm NAME PASS # create/update GM account
bun run make-gm NAME        # toggle GM flag
```

---

## File Map

| File | Lines | Role |
|------|-------|------|
| `server.ts` | 692 | HTTP server factory, route dispatch, WebSocket upgrade, CORS, metrics |
| `ws.ts` | ~1,800 | Room manager, WS message handler, map transitions, drops, mob state + combat |
| `db.ts` | 505 | SQLite schema, session/character CRUD, credentials, JQ leaderboard, action logs |
| `character-api.ts` | 337 | REST `/api/character/*` — create, load, save, claim, login |
| `admin-api.ts` | 467 | REST `/api/admin/*` — GM-only DB dashboard (tables, rows, SQL, CSV export) |
| `pow.ts` | 222 | Proof-of-Work session acquisition — challenge/verify, session validation |
| `map-data.ts` | 556 | Lazy WZ map parser — portals, NPCs, mobs, footholds, mob stats, findGroundY |
| `reactor-system.ts` | 576 | Destroyable reactors — HP, cooldowns, loot tables, mob/reactor drop rolls, respawn timers |
| `wz-xml.ts` | 170 | Server-side WZ XML parser — converts `.img.xml` to JSON node format |
| `data-provider.ts` | 89 | In-memory DataProvider (legacy asset API interface) |
| `dev.ts` | 21 | Dev entry point (loads WZ data from `resourcesv3/`, starts server) |
| `create-gm.ts` | 64 | CLI: create GM account with credentials |
| `make-gm.ts` | 34 | CLI: toggle GM flag on existing character |
| `ws.test.ts` | 790 | WebSocket integration tests (27 tests) |
| `admin-api.test.ts` | 188 | Admin API tests (8 tests) |
| `character-api.test.ts` | 387 | Character API tests (24 tests) |
| `shared-logic.test.ts` | 695 | Client pure-logic unit tests (45 tests) |

---

## Server Factory (`server.ts`)

### `createServer(provider, config) → { start, metrics }`

`start()` initializes:
1. SQLite database (`initDatabase()`)
2. Admin API handler (if `adminUiEnabled`)
3. PoW table + hourly session purge
4. `RoomManager` for WebSocket multiplayer
5. Drop sweep (5s interval) + reactor tick (1s interval)
6. Returns `Bun.serve()` instance

### Config Defaults
```typescript
port: 5200, host: "0.0.0.0", dataDir: "./data",
debug: false, maxBatchSize: 50, compression: true,
adminUiEnabled: true, adminSessionTtlMs: 8h
```

### Route Dispatch (priority order)
1. `OPTIONS` → CORS preflight
2. `/api/admin/*` → admin API
3. `/api/pow/*` → PoW challenge/verify
4. `/api/character/*` → character CRUD
5. `/api/leaderboard`, `/api/jq/leaderboard` → JQ leaderboard
6. `/api/online` → player count
7. `/health`, `/ready` → health check
8. `/metrics` → server metrics
9. `/api/v1/*` → legacy asset API
10. Else → 404

### WebSocket Upgrade (`/ws`)
Captures client IP from `X-Forwarded-For` or direct connection.
First message must be `{ type: "auth", session_id }` — see `client-server.md` for full WS lifecycle and close codes.

---

## Room Manager (`ws.ts`)

### Core State
```typescript
rooms: Map<mapId, Map<sessionId, WSClient>>   // map-scoped rooms
allClients: Map<sessionId, WSClient>           // all connected players
mapDrops: Map<mapId, Map<drop_id, MapDrop>>    // server-authoritative drops
mobAuthority: Map<mapId, sessionId>            // mob AI controller per map
```

### Map Transitions (`initiateMapChange`)
Server-authoritative — no client-driven enter/leave accepted.
See `client-server.md § Map Transition Protocol` for the full 4-step flow.

Portal validation: portal exists, usable type (not 0/6), within 200px, destination exists.
NPC warp validation: NPC on current map, destination in script whitelist, map exists.

### Mob System (server-authoritative)
Server owns mob lifetime, state, and combat. Clients only render.

**Lifecycle**: Mob states initialized when first player joins a map (`initMapMobStates` → parses map WZ life section). Cleared when last player leaves. Server tracks per-mob: HP, position, alive/dead, respawn timer.

**Movement**: Mob authority client (first player in map) runs AI + physics, sends `mob_state` at 10Hz. Server updates its tracked mob positions from these messages (for range checks). On disconnect, next player promoted via `mob_authority` message. Non-authority clients render received state, skip AI.

**Combat** (`character_attack`): Client sends `{ type: "character_attack", stance, degenerate, x, y, facing }`. Server:
1. Finds closest alive mob in range (ATTACK_RANGE_X=120, ATTACK_RANGE_Y=50) using attack position
2. Looks up mob stats from WZ via cached `_mapMobIds` → `getMobStats()` (level, maxHP, wdef, eva, pushed, exp)
3. Calculates damage using C++ formula (`calcMobDamage` — mirrors `Mob::calculate_damage`)
4. Applies damage to server-tracked HP
5. Broadcasts `mob_damage_result` to ALL players (damage, critical, miss, killed, knockback, exp)
6. If killed: rolls loot via `rollMobLoot()`, spawns drop, broadcasts `drop_spawn`
7. Dead mob respawns after `MOB_RESPAWN_DELAY_MS` (30s) via `tickMobRespawns()`, broadcasts `mob_respawn`

**Damage formula** (server-side, mirrors C++ `CharStats::close_totalstats` + `Mob::calculate_damage`):
- Reads actual equipped weapon from `client.look.equipment` (slot_type "Weapon")
- Weapon multiplier from weapon type ID (C++ `get_multiplier`: 1H sword=4.0, 2H sword=4.6, etc.)
- Weapon WATK read from `Character.wz/Weapon/{id}.img.xml` → `info/incPAD` (cached)
- Mastery = 0.5 (C++ beginner default: `set_mastery(0)` → `mastery = 0.5 + 0`)
- Accuracy = DEX × 0.8 + LUK × 0.5 (C++ `calculateaccuracy`)
- Hit chance: `accuracy / ((1.84 + 0.07 * leveldelta) * mobAvoid + 1.0)`
- Damage: `[mindmg, maxdmg]` reduced by mob wdef (×0.6/×0.5), 5% critical (×1.5), cap 999999
- No weapon → bare-handed: 1 damage

**Mob respawn** (`mob_respawn`): Server resets mob to spawn position and full HP after 30s. Broadcasts to all clients. Client handles fade-in (C++ `Mob::fadein` + `opacity += 0.025`).

**Client responsibility**: Display damage numbers, play hit/die sounds, show knockback animation, award EXP (from server `exp` field), fade-in on respawn. Client never modifies mob HP directly in online mode.

### Drop System
Server-authoritative with auto-incrementing IDs. 5s loot protection for reactor/mob drops (owner = killer/majority damage dealer). 180s expiry with 5s sweep interval. `canFitItem()` validates inventory capacity.

**Mob drops**: Server rolls via `rollMobLoot()` (40% no-drop, 5% equip, 25% use 1-3, 70% etc 1-5) on mob kill. Landing Y from `findGroundY()`. Drop owner = attacker.

**Reactor drops** (`hit_reactor` message): Server validates hit, rolls loot via `rollReactorLoot()`, spawns drop at reactor position. Owner = majority damage dealer.

### GM Commands
- `/map <id>` — warp self
- `/teleport <username> <map_id>` — warp another player

### Velocity Check
`MAX_MOVE_SPEED_PX_PER_S = 1200` — moves exceeding this speed silently dropped.
`positionConfirmed` required before portal use.

---

## Database Schema (`db.ts`)

SQLite WAL mode. Path: `./data/maple.db`.

| Table | Primary Key | Description |
|-------|-------------|-------------|
| `sessions` | `session_id` | Transient auth tokens → character name |
| `characters` | `name (NOCASE)` | JSON save data + version + GM flag |
| `credentials` | `name (NOCASE)` | bcrypt password hash (claimed accounts) |
| `valid_sessions` | `session_id` | PoW/login-issued session tracking + `last_used_at` |
| `jq_leaderboard` | `(player_name, quest_name)` | JQ completion counts |
| `logs` | `id (autoincrement)` | Append-only audit trail (username, timestamp, action, IP) |
| `admin_sessions` | `id (autoincrement)` | Admin bearer token hashes + expiry |

### New Character Defaults
- **Default spawn map**: `100000002` (An Empty House, Henesys area — has mobs for immediate combat testing)
- Level 1, Beginner, basic equips (coat, pants, shoes, weapon), 30 HP potions + 15 MP potions

### Account Model
- **Unclaimed**: character exists, no password — reclaimable if not connected
- **Claimed**: has bcrypt password in `credentials` table
- Names are case-insensitive (`COLLATE NOCASE`)

### Action Logging
`appendLog(db, username, action, ip)` — fire-and-forget, never crashes.
18 action points: connect, disconnect, enter map, use portal, npc warp, chat, equip change, level up, die, drop item, loot item, JQ completion, reactor destroy, GM commands, character creation, account claim, login.

---

## Reactor System (`reactor-system.ts`)

- Multi-hit: 4 HP, 600ms global cooldown, range-validated (120px X, 60px Y)
- Destruction → rolls loot → `drop_spawn` broadcast
- 10s respawn timer → `reactor_respawn` broadcast
- Loot tables loaded from `resourcesv3/` at startup:
  Equipment 19% | Use 25% | Etc 50% | Chairs 5% | Cash 2%
- Item blacklist: MISSING NAME, Skill Effect (prefix 160), `expireOnLogout=1`, `quest=1`

### JQ Rewards (`jq_reward`)
- 8 jump quest maps with treasure chest NPCs
- Server validates: NPC proximity, inventory capacity
- Rolls 50/50 equipment or cash equipment
- Increments `jq_leaderboard`, warps player to Mushroom Park
- Zakum Helmet: 25% chance on Breath of Lava completion

---

## Map Data (`map-data.ts`)

Lazy-loads WZ XML from `resourcesv3/Map.wz/Map/MapN/NNNNNNNNN.img.xml` via `wz-xml.ts` parser.

### Parsed Data
- **Portals**: index, name, type, x/y, target map + portal name
- **NPCs**: id, x, cy, foothold
- **Footholds**: id, x1/y1/x2/y2

### NPC Script Destinations (server-authoritative)
- Victoria Island taxis (6 NPCs → `VICTORIA_TOWNS`)
- Ossyria taxi, Aqua taxi
- Spinel world trip → `ALL_MAJOR_TOWNS` (17 destinations)
- JQ challenge NPC → 8 jump quest maps
- JQ exit NPCs → Mushroom Park

### Validation Functions
`isNpcOnMap()`, `isValidNpcDestination()`, `isOnSamePlatform()`, `isUsablePortal()`, `hasValidTarget()`, `distance()`

---

## Admin API Internals (`admin-api.ts`)

GM-only bearer auth. Login rate-limited per IP+username (8 attempts per 5 min).
Sessions: 8-hour TTL, SHA-256 hashed tokens in `admin_sessions` table.
Read-only SQL runner restricted to SELECT/PRAGMA/EXPLAIN.
CSV export: max 5000 rows.

---

## Test Suite

`cd server && bun test src/` — 103 tests, 4 files.

| File | Tests | Scope |
|------|-------|-------|
| `character-api.test.ts` | 24 | REST character CRUD, auth, claim, login, CORS |
| `admin-api.test.ts` | 8 | GM auth, table browse, SQL guard, CSV, rate limit |
| `ws.test.ts` | 27 | WS auth, rooms, move/chat relay, portal/NPC validation, save_state, reactors, loot |
| `shared-logic.test.ts` | 45 | Client pure-logic parity: WZ node navigation, UOL resolution, path helpers, equip/inventory ID mapping, anchor math, canvas meta extraction, default character template |

All tests use `POW_DIFFICULTY=1` and in-memory SQLite for speed.
`ws.test.ts` loads real drop pools from `resourcesv3/` at startup.
`shared-logic.test.ts` re-implements client pure functions (from `util.js`/`save.js`) in TypeScript for DOM-free unit testing.
