# Client-Server Communication & Wire Protocol

> Single source of truth for all REST endpoints, WebSocket messages, session model,
> character persistence, and data flow. Both `client/web/net.js` and `server/src/ws.ts`
> must conform to these shapes.

---

## Session Model

### Acquisition
1. `GET /api/pow/challenge` → `{ challenge: 64-char hex, difficulty: 20 }`
2. Client brute-forces nonce: SHA-256(challenge + nonce) with N leading zero bits
3. `POST /api/pow/verify { challenge, nonce }` → `{ session_id: 64-char hex }`
4. Session registered in `valid_sessions` table

- Difficulty: `POW_DIFFICULTY` env (default 20, ~1s solve). Challenge TTL: 60s. Max pending: 10k.
- Also acquirable via `POST /api/character/login` (returns new session_id).

### Lifecycle
- **Storage**: `localStorage` key `shlop.session`
- **Sent as**: `Authorization: Bearer <session_id>` (REST) or `{ type: "auth", session_id }` (WS)
- **Expiry**: 7 days inactivity (`last_used_at`), hourly server purge
- **Identity**: session_id is transient; **character name** is the permanent unique identifier
- `sessions` table: `session_id → character_name` (case-insensitive)
- Name not stored in save JSON — lives only in `characters.name` column

---

## CharacterSave Schema (v1)

Used by REST save/load and `save_state` WS message.

```json
{
  "identity": { "gender": false, "skin": 0, "face_id": 20000, "hair_id": 30000 },
  "stats": { "level": 1, "job": "Beginner", "exp": 0, "max_exp": 15,
             "hp": 50, "max_hp": 50, "mp": 5, "max_mp": 5,
             "speed": 100, "jump": 100, "meso": 0 },
  "location": { "map_id": "100000001", "spawn_portal": null, "facing": -1 },
  "equipment": [{ "slot_type": "Coat", "item_id": 1040002, "item_name": "" }],
  "inventory": [{ "item_id": 2000000, "qty": 30, "inv_type": "USE", "slot": 0, "category": null }],
  "achievements": { "jq_quests": { "Shumi's Lost Coin": 3 } },
  "version": 1, "saved_at": "ISO 8601"
}
```

### Persistence Points
- WS `save_state` → immediate DB persist
- WS disconnect → server saves tracked in-memory state
- REST `POST /api/character/save` → backup path
- Client `sendBeacon` on page unload
- JQ reward → server updates inventory + achievements → immediate persist
- Achievement merge: `Math.max(server_count, client_count)` per quest key

---

## REST API

### PoW (`/api/pow/*`) — no auth

| Method | Path | Body/Response |
|--------|------|---------------|
| GET | `/api/pow/challenge` | → `{ ok, challenge, difficulty }` |
| POST | `/api/pow/verify` | `{ challenge, nonce }` → `{ ok, session_id }` or 403 |

### Character (`/api/character/*`) — Bearer auth (except login)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/create` | `{ name, gender }` | `{ ok, data, name }` 201 / 409 NAME_TAKEN |
| GET | `/load` | — | `{ ok, data, name }` / 404 |
| POST | `/save` | CharacterSave JSON | `{ ok }` |
| POST | `/claim` | `{ password }` (min 4) | `{ ok }` / 409 ALREADY_CLAIMED |
| GET | `/claimed` | — | `{ ok, claimed }` |
| POST | `/login` | `{ name, password }` | `{ ok, session_id }` / 401 (no auth needed) |

### Admin (`/api/admin/*`) — Admin Bearer auth, GM-only

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | `{ username, password }` → `{ ok, token, expires_at }` (rate-limited) |
| GET | `/auth/me` | Current admin session info |
| POST | `/auth/logout` | Revoke admin token |
| GET | `/tables` | List DB tables |
| GET | `/table/:t/schema` | Table schema, indexes, FKs |
| GET | `/table/:t/rows` | Paginated rows (`?limit&offset&search`) |
| GET | `/table/:t/count` | Row count |
| GET | `/table/:t/export.csv` | CSV download (max 5000 rows) |
| POST | `/table/:t/insert` | `{ values }` |
| POST | `/table/:t/update` | `{ original, changes }` |
| POST | `/table/:t/delete` | `{ original }` |
| POST | `/query` | Read-only SQL (`SELECT`/`PRAGMA`/`EXPLAIN` only) |

### Other

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/online` | `{ ok, count }` |
| GET | `/api/jq/leaderboard` | `{ ok, leaderboards }` (or `?quest=X` for single) |
| GET | `/health` | `{ status, ready, ... }` |
| GET | `/metrics` | Server metrics |

---

## WebSocket Protocol

### Connection Flow
```
Client → ws://server/ws
  → { type: "auth", session_id }
  ← { type: "change_map", map_id, spawn_portal, gm }
  → { type: "map_loaded" }
  ← { type: "map_state", players, drops, mob_authority, reactors }
```

### Close Codes
| Code | Reason |
|------|--------|
| 4001 | First message not auth |
| 4002 | No character for session |
| 4003 | Inactive (30s timeout) |
| 4004 | Replaced by new connection |
| 4005 | No database configured |
| 4006 | Already logged in |
| 4007 | Session invalid/expired |

### PlayerLook (sub-object)
```json
{ "gender": false, "face_id": 20000, "hair_id": 30000, "skin": 0,
  "equipment": [{ "slot_type": "Coat", "item_id": 1040002 }] }
```

---

### Client → Server Messages

| Type | Key Fields | Notes |
|------|------------|-------|
| `ping` | — | 5s heartbeat |
| `move` | x, y, action, facing | 20Hz position update |
| `chat` | text | Chat message |
| `face` | expression | Emote |
| `attack` | stance | Attack animation |
| `sit` | active, chair_id | Sit/stand toggle |
| `prone` | active | Prone toggle |
| `climb` | active, action | Rope/ladder toggle |
| `jump` | — | Jump |
| `equip_change` | equipment[] | Equipment update |
| `save_state` | inventory[], equipment[], stats, achievements | Periodic full state sync → DB persist |
| `use_portal` | portal_name | Server validates proximity + destination |
| `map_loaded` | — | Confirm map load (response to `change_map`) |
| `npc_warp` | npc_id, map_id | NPC travel (server validates NPC + destination) |
| `jq_reward` | — | JQ treasure chest claim |
| `admin_warp` | map_id | Debug warp (debug mode only) |
| `gm_command` | command, args[] | GM slash command (`/map`, `/teleport`) |
| `level_up` | level | Level notification |
| `damage_taken` | damage, direction | Hit notification |
| `die` | — | Death |
| `respawn` | — | Respawn |
| `drop_item` | item_id, name, qty, x, startY, destY, iconKey, category | Drop to ground |
| `loot_item` | drop_id | Loot request |
| `mob_state` | mobs[] | Mob positions (authority only, 10Hz) |
| `character_attack` | stance, degenerate, x, y, facing | Attack — server finds mob, calculates damage, spawns drops |
| `hit_reactor` | reactor_idx | Attack reactor |

### Server → Client Messages

| Type | Key Fields | Scope | Notes |
|------|------------|-------|-------|
| `pong` | — | sender | Heartbeat response |
| `change_map` | map_id, spawn_portal, gm | sender | Load this map |
| `map_state` | players[], drops[], mob_authority, reactors[] | sender | Room snapshot on join |
| `portal_denied` | reason | sender | Portal/warp rejected |
| `player_enter` | id, name, x, y, action, facing, look, chair_id, achievements | room-others | New player |
| `player_leave` | id | room-others | Player left |
| `player_move` | id, x, y, action, facing | room-others | Position relay |
| `player_chat` | id, name, text | room-all | Chat relay |
| `player_face` | id, expression | room-others | Expression relay |
| `player_attack` | id, stance | room-others | Attack relay |
| `player_sit` | id, active, chair_id | room-others | Sit relay |
| `player_prone` | id, active | room-others | Prone relay |
| `player_climb` | id, active, action | room-others | Climb relay |
| `player_jump` | id | room-others | Jump relay |
| `player_equip` | id, equipment[] | room-others | Equipment relay |
| `player_level_up` | id, level | room-others | Level relay |
| `player_damage` | id, damage, direction | room-others | Damage relay |
| `player_die` | id | room-others | Death relay |
| `player_respawn` | id | room-others | Respawn relay |
| `drop_spawn` | drop{} | room-all | New ground drop (includes dropper) |
| `drop_loot` | drop_id, looter_id, item_id, name, qty, category, iconKey | room-all | Loot pickup |
| `drop_expire` | drop_id | room-all | Drop expired (180s) |
| `loot_failed` | drop_id, reason, owner_id?, remaining_ms? | sender | Loot rejected |
| `mob_state` | mobs[] | room-others | Mob positions from authority |
| `mob_authority` | active | sender | Authority assignment |
| `mob_damage_result` | attacker_id, mob_idx, damage, critical, miss, killed, direction, new_hp, max_hp, knockback, exp | room-all | Server-calculated damage result |
| `reactor_hit` | reactor_idx, new_state, new_hp, hitter_id | room-all | Reactor damaged |
| `reactor_destroy` | reactor_idx | room-all | Reactor destroyed |
| `reactor_respawn` | reactor_idx, reactor_id, x, y | room-all | Reactor respawned |
| `gm_response` | ok, text | sender | GM command result |
| `jq_reward` | quest_name, item_id, item_name, item_qty, completions, bonus_item_id? | sender | JQ reward |
| `jq_inventory_full` | — | sender | Inventory full on JQ |
| `jq_proximity` | npc_id | sender | Too far from JQ NPC |
| `global_player_count` | count | global | Every 10s |
| `global_level_up` | name, level | global | Level ≥10 celebration |

---

## Map Transition Protocol

All map changes are **server-authoritative** via `initiateMapChange()`:

1. Server removes client from current room → broadcasts `player_leave`
2. Server sends `change_map { map_id, spawn_portal }` (client in limbo)
3. Client loads map, sends `map_loaded`
4. Server joins client to room → sends `map_state`, broadcasts `player_enter`

**Portal validation** (server-side): portal exists, usable type (not 0/6), player within 200px, destination exists.
**NPC warp validation**: NPC on current map, destination in NPC's script whitelist, map exists.
**Velocity check**: moves >1200 px/s silently dropped. `positionConfirmed` required before portal use.

---

## Multiplayer State Sync

### Remote Players
- Snapshot interpolation: 100ms delay buffer, max 20 snapshots, lerp between brackets
- Teleport: >300px gap → instant snap
- Animation runs locally per remote player (frame timers independent of server)

### Mob System
Server owns mob lifetime, HP, combat, and drops. Clients only render.

- **Movement**: Mob authority client (first player in map) runs AI + physics, sends `mob_state` at 10Hz. Server updates tracked positions for range checks. On disconnect, next player promoted.
- **Combat**: Client sends `character_attack` (with position, stance) → server builds weapon-specific hitbox from WZ Afterimage data, finds mob in range, calculates damage using real weapon stats, broadcasts `mob_damage_result` to all. Client displays damage numbers, knockback, death from server data.
- **Spawning**: Server initializes mob states from WZ when first player joins map. Dead mobs respawn after 7s server-side.
- **Drops**: Server rolls loot on mob kill, spawns drop. No client involvement in drop selection.
- **Offline**: Client falls back to local combat (`applyAttackToMob`) with client-side damage + EXP. No drops.

### Drop Ownership
- `owner_id` = attacker (mobs) or majority damage dealer (reactors). 5s loot protection.
- Player-dropped items: no owner, anyone can loot immediately.
- Server validates inventory capacity via `canFitItem()` before allowing loot.

---

## Resource Paths

| Type | Path Pattern |
|------|-------------|
| Maps | `/resourcesv3/Map.wz/Map/MapN/NNNNNNNNN.img.xml` |
| Characters | `/resourcesv3/Character.wz/{type}/{id}.img.xml` |
| NPCs | `/resourcesv3/Npc.wz/{id}.img.xml` |
| Mobs | `/resourcesv3/Mob.wz/{id}.img.xml` |
| Sounds | `/resourcesv3/Sound.wz/{name}.img.xml` |
| Items | `/resourcesv3/Item.wz/{category}/{group}.img.xml` |
| UI | `/resourcesv3/UI.wz/{element}.img.xml` |
| Strings | `/resourcesv3/String.wz/{type}.img.xml` |
| Static assets | `/public/{file}` (login.mp3, mob/orange-mushroom/*) |

### Canvas `basedata` format

XML canvas nodes may carry `basedata` in three formats:

| Format | How to detect | Description |
|--------|--------------|-------------|
| PNG base64 | Starts with `iVB` (base64 for 0x89 0x50), no `wzrawformat` | Legacy Harepacker export. `data:image/png;base64,${basedata}` works directly. |
| Raw WZ bytes (tagged) | `wzrawformat="N"` present | `wz2xml` / new WZ editor export. `basedata` is base64 of raw zlib-compressed pixel data. `N` = pixel format ID (1=BGRA4444, 2=BGRA8888, 513=RGB565, 1026=DXT3, 2050=DXT5). |
| Raw WZ bytes (untagged) | No `wzrawformat`, but starts with `eJ`/`eN`/`eA`/`eF` (base64 for zlib 0x78 header) | Old WZ editor export. Same as tagged but pixel format inferred from decompressed size (2 bpp → BGRA4444, 4 bpp → BGRA8888). |

All parsers (`wz-xml-adapter.js`, `wz-xml.ts`, `wz-xml-parser.js`) propagate the `wzrawformat` attribute. Game client `wz-canvas-decode.js` auto-detects all three formats via `isRawWzCanvas()` (checks both attribute and base64 zlib prefix).
