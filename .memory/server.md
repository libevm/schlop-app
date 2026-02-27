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
1. Builds attack rect from weapon afterimage range (mirrors C++ `Combat::apply_move`)
2. Finds closest alive mob whose **WZ sprite bounds** overlap the attack rect (mirrors C++ `Mob::is_in_range` — `range.overlaps(mob_sprite_bounds.shift(mob_position))`)
3. Looks up mob stats from WZ via cached `_mapMobIds` → `getMobStats()` (level, maxHP, wdef, eva, pushed, exp)
4. Calculates damage using C++ formula (`calcMobDamage` — mirrors `Mob::calculate_damage`)
5. Applies damage to server-tracked HP
6. Broadcasts `mob_damage_result` to ALL players (damage, critical, miss, killed, knockback, exp)
7. If killed: rolls loot via `rollMobLoot(mobId, mobLevel)` → `LootItem[]`, spawns each drop with X-spread, broadcasts `drop_spawn` per drop
8. Dead mob respawns after `MOB_RESPAWN_DELAY_MS` (30s) via `tickMobRespawns()`, broadcasts `mob_respawn`

**Damage formula** (server-side, mirrors C++ `CharStats::close_totalstats` + `Mob::calculate_damage`):
- Uses actual STR/DEX/INT/LUK from `client.stats` (set via GM commands or level-up)
- Reads actual equipped weapon from `client.look.equipment` (slot_type "Weapon")
- Weapon multiplier from weapon type ID (C++ `get_multiplier`: 1H sword=4.0, 2H sword=4.6, etc.)
- Weapon WATK read from `Character.wz/Weapon/{id}.img.xml` → `info/incPAD` (cached via `_weaponStatsCache`)
- Weapon afterimage name cached via `_weaponAfterimageCache`, afterimage ranges via `_afterimageRangeCache`
- Mob sprite bounds cached via `_mobBoundsCache` (reads Mob.wz stand frame 0 lt/rb per mob ID)
- Mob stats cached via `_mobStatsCache`
- primary = multiplier × STR, secondary = DEX (beginner warrior-style)
- Mastery = 0.5 (C++ beginner default: `set_mastery(0)` → `mastery = 0.5 + 0`)
- Accuracy = DEX × 0.8 + LUK × 0.5 (C++ `calculateaccuracy`)
- Hit chance: `accuracy / ((1.84 + 0.07 * leveldelta) * mobAvoid + 1.0)`
- Damage: `[mindmg, maxdmg]` reduced by mob wdef (×0.6/×0.5), 5% critical (×1.5), cap 999999
- No weapon → bare-handed: 1 damage

**EXP system** (server-side, mirrors Cosmic `ExpTable.java`):
- Full 200-level EXP table from Cosmic `ExpTable.java` (15, 15, 34, 57, ...)
- EXP granted on mob kill (from mob WZ `exp` field)
- Server handles level-up automatically (multi-level supported for high-EXP mobs)
- Level-up: +20 max HP, +10 max MP, full heal
- `stats_update` sent to client after every EXP change
- `player_level_up` broadcast to room on level-up
- EXP and level persist via `persistClientState()`

**Mob respawn** (`mob_respawn`): Server resets mob to spawn position and full HP after 30s. Broadcasts to all clients. Client handles fade-in (C++ `Mob::fadein` + `opacity += 0.025`).

**Client responsibility**: Display damage numbers, play hit/die sounds, show knockback animation, award EXP (from server `exp` field), fade-in on respawn. Client never modifies mob HP directly in online mode.

### Drop System
Server-authoritative with auto-incrementing IDs. 5s loot protection for reactor/mob drops (owner = killer/majority damage dealer). 180s expiry with 5s sweep interval. `canFitItem()` validates inventory capacity. `MapDrop` has `meso: boolean` field.

**Mob drops**: Exact Cosmic parity via `rollMobLoot(mobId, mobLevel)` → `LootItem[]`. Drop tables loaded from `../Cosmic/src/main/resources/db/data/152-drop-data.sql` at startup (21k+ entries, 962 mobs). Mirrors `MapleMap.dropItemsFromMonsterOnMap()`:
1. Entries shuffled (like `Collections.shuffle`)
2. Each entry independently rolled: `Math.floor(Math.random() * 999_999) < chance` (matches `Randomizer.nextInt(999999) < dropChance` with `chRate=1, cardRate=1`)
3. Quantities match Cosmic's Java `nextInt(n)` semantics (`[min, max-1]` not `[min, max]`):
   - Equips (1xxxxxx): always qty 1
   - Non-equips: `max != 1 ? nextInt(max-min)+min : 1`
   - Meso (itemId=0): `nextInt(max-min)+min`
4. X-spread alternates left/right from mob, 25px apart
5. Meso loot adds to `client.stats.meso` directly (no inventory check)
6. Mobs without Cosmic data get no drops (matches Cosmic — no rows = nothing)

**Reactor drops** (`hit_reactor` message): Server validates hit, rolls loot via `rollReactorLoot()`, spawns drop at reactor position. Owner = majority damage dealer.

### GM Commands
- `/map <id>` — warp self
- `/teleport <username> <map_id>` — warp another player
- `/level <1-200>` — set level (scales HP/MP, resets EXP)
- `/str <val>` `/dex <val>` `/int <val>` `/luk <val>` — set base stats
- `/item <item_id> [qty]` — give item to inventory
- `/meso <amount>` — set meso balance

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

## Quest System (`quest-data.ts`)

- Loads Quest.wz/Check.img.xml + Act.img.xml at server startup (`loadQuestData()`)
- `QuestDef`: startNpc, endNpc, lvmin, lvmax, jobs, questPrereqs, endItems
- `QuestReward`: exp, meso, fame, items[] (positive=give, negative=remove)
- `canAcceptQuest(qid, level, jobId, quests)`: validates level, job, prerequisite quests
- `canCompleteQuest(qid, quests, countItemFn)`: validates state=1, checks endItems
- Server handlers: `quest_accept`, `quest_complete`, `quest_forfeit`
- NPC-on-map validation: start NPC must be on player's map for accept, end NPC for complete
- Re-do prevention: completed quests (state=2) cannot be re-accepted
- **CRITICAL**: quest-data.ts must use `__dirname`-relative paths (not `process.cwd()`) — server runs from `server/` CWD via `bun run --cwd server dev`
- `applyQuestReward()`: EXP with level-up, meso, item add/remove
- `quests_update` sent on every map join + after quest actions
- Client falls back to local quest logic when offline

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

---

## Pitfalls & Gotchas

| Issue | Cause | Fix |
|-------|-------|-----|
| **Quest data loads 0 defs** | `process.cwd()` path in quest-data.ts; CWD is `server/` when run via `bun run --cwd server dev` | Use `__dirname`-relative paths (`resolve(__dirname, "../../resourcesv3", rel)`) — matches map-data.ts/ws.ts pattern |
| **Two DB files** | `./data/maple.db` (project root, 4KB stale) vs `./server/data/maple.db` (actual, used by dev.ts `dbPath: "./data/maple.db"` relative to CWD=`server/`) | Always inspect `server/data/maple.db` when debugging server state |
| **Debug log fires before validation** | `quest_accept` debug line prints before `canAcceptQuest()` check | Don't assume log = success — check `quest_result` ok field |
| **`fn.xxx?.()` no-ops before `Object.assign`** | `fn = {}` in state.js; callbacks wired via `Object.assign(fn, { ... })` at bottom of app.js | Call timing is fine (fn wired before first frame), but avoid calling fn in module top-level init |
