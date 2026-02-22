# Shared Schema — Wire Protocol & Data Structures

> Source of truth for all messages between client and server.
> Both `client/web/net.js` and `server/src/ws.ts` must conform to these shapes.
> Any field change here must be reflected in both codebases.

---

## CharacterSave (REST persistence)

Used by `POST /api/character/save`, `GET /api/character/load`, and localStorage.

```json
{
  "identity": {
    "name": "string (1-12 chars, alphanumeric + spaces, no leading/trailing spaces)",
    "gender": "boolean (false=male, true=female)",
    "skin": "number (0-11)",
    "face_id": "number (e.g. 20000)",
    "hair_id": "number (e.g. 30000)"
  },
  "stats": {
    "level": "number (1-200)",
    "job": "string (e.g. 'Beginner')",
    "exp": "number (≥0)",
    "max_exp": "number (>0)",
    "hp": "number (≥0)",
    "max_hp": "number (>0)",
    "mp": "number (≥0)",
    "max_mp": "number (>0)",
    "speed": "number (100 default)",
    "jump": "number (100 default)",
    "meso": "number (≥0)"
  },
  "location": {
    "map_id": "string (e.g. '100000001')",
    "spawn_portal": "string | null (portal name, not index)",
    "facing": "number (-1=left, 1=right)"
  },
  "equipment": [
    { "slot_type": "string (Cap|Coat|Pants|Shoes|Weapon|...)", "item_id": "number", "item_name": "string" }
  ],
  "inventory": [
    { "item_id": "number", "qty": "number", "inv_type": "string (EQUIP|USE|SETUP|ETC|CASH)", "slot": "number (0-31)", "category": "string | null" }
  ],
  "achievements": {
    "jq_quests": {
      "Shumi's Lost Coin": "number (completion count)",
      "John's Pink Flower Basket": "number (completion count)"
    }
  },
  "version": 1,
  "saved_at": "ISO 8601 string"
}
```

### Defaults (new character)

```json
{
  "name": "<from characters.name column, not in data blob>",
  "identity": { "gender": false, "skin": 0, "face_id": 20000, "hair_id": 30000 },
  "stats": { "level": 1, "job": "Beginner", "exp": 0, "max_exp": 15, "hp": 50, "max_hp": 50, "mp": 5, "max_mp": 5, "speed": 100, "jump": 100, "meso": 0 },
  "location": { "map_id": "100000001", "spawn_portal": null, "facing": -1 },
  "equipment": [
    { "slot_type": "Coat", "item_id": 1040002, "item_name": "" },
    { "slot_type": "Pants", "item_id": 1060002, "item_name": "" },
    { "slot_type": "Shoes", "item_id": 1072001, "item_name": "" },
    { "slot_type": "Weapon", "item_id": 1302000, "item_name": "" }
  ],
  "inventory": [
    { "item_id": 2000000, "qty": 30, "inv_type": "USE", "slot": 0, "category": null },
    { "item_id": 2000001, "qty": 15, "inv_type": "USE", "slot": 1, "category": null },
    { "item_id": 2000002, "qty": 5,  "inv_type": "USE", "slot": 2, "category": null },
    { "item_id": 2010000, "qty": 10, "inv_type": "USE", "slot": 3, "category": null },
    { "item_id": 4000000, "qty": 8,  "inv_type": "ETC", "slot": 0, "category": null },
    { "item_id": 4000001, "qty": 3,  "inv_type": "ETC", "slot": 1, "category": null }
  ],
  "achievements": {},
  "version": 1
}
```

---

## REST API

### `GET /api/pow/challenge`
- **No auth required**
- **200:** `{ "ok": true, "challenge": "64-char hex string", "difficulty": 20 }`
- Challenge expires after 60s. Max 10,000 pending.
- Cache-Control: no-store

### `POST /api/pow/verify`
- **No auth required**
- **Body:** `{ "challenge": "64-char hex", "nonce": "string (max 32 chars)" }`
- **200:** `{ "ok": true, "session_id": "64-char hex" }`
- **403:** `{ "ok": false, "error": "Challenge not found or already used" | "Challenge expired" | "Insufficient proof of work" }`
- Server registers `session_id` in `valid_sessions` table on success.

### `GET /api/jq/leaderboard`
- **No auth required**
- **Query:** `?quest=Breath%20of%20Lava` (optional — omit for all quests)
- **200 (single quest):** `{ "ok": true, "quest": "Breath of Lava", "entries": [{ "name": "Player1", "completions": 3 }] }`
- **200 (all quests):** `{ "ok": true, "leaderboards": { "Breath of Lava": [...], "Shumi's Lost Coin": [...] } }`


### `POST /api/character/create`
- **Header:** `Authorization: Bearer <session_id>`
- **Body:** `{ "name": "string", "gender": boolean }`
- **201:** `{ "ok": true, "data": <CharacterSave> }`
- **409:** `{ "ok": false, "error": { "code": "NAME_TAKEN", "message": "..." } }`
- **401:** Missing/invalid Authorization header

### `GET /api/character/load`
- **Header:** `Authorization: Bearer <session_id>`
- **200:** `{ "ok": true, "data": <CharacterSave> }`
- **404:** No character for this session

### `POST /api/character/save`
- **Header:** `Authorization: Bearer <session_id>`
- **Body:** `<CharacterSave>`
- **200:** `{ "ok": true }`

### `POST /api/character/name`
- **Header:** `Authorization: Bearer <session_id>`
- **Body:** `{ "name": "string" }`
- **200:** `{ "ok": true }`
- **409:** `{ "ok": false, "error": { "code": "NAME_TAKEN" } }`

### `POST /api/admin/auth/login`
- **No gameplay auth required**
- **Body:** `{ "username": "string", "password": "string" }`
- **200:** `{ "ok": true, "token": "opaque bearer token", "username": "GMName", "expires_at": "ISO" }`
- **401:** `{ "ok": false, "error": { "code": "INVALID_CREDENTIALS" } }`
- **403:** `{ "ok": false, "error": { "code": "GM_ONLY" } }`
- **429:** `{ "ok": false, "error": { "code": "RATE_LIMITED", "message": "Too many login attempts..." } }`

### `GET /api/admin/auth/me`
- **Header:** `Authorization: Bearer <admin_token>`
- **200:** `{ "ok": true, "user": { "username": "GMName", "expires_at": "ISO" } }`
- **401:** missing/expired token

### `POST /api/admin/auth/logout`
- **Header:** `Authorization: Bearer <admin_token>`
- **200:** `{ "ok": true }`

### `GET /api/admin/tables`
- **Header:** `Authorization: Bearer <admin_token>`
- **200:** `{ "ok": true, "tables": ["characters", "sessions", ...] }`

### `GET /api/admin/table/:table/schema`
- **Header:** `Authorization: Bearer <admin_token>`
- **200:** `{ "ok": true, "table": "characters", "columns": [...], "foreignKeys": [...], "indexes": [...] }`

### `GET /api/admin/table/:table/rows`
- **Header:** `Authorization: Bearer <admin_token>`
- **Query:** `limit`, `offset`, `search`
- **200:** `{ "ok": true, "table": "characters", "total": 123, "rows": [...] }`

### `GET /api/admin/table/:table/count`
- **Header:** `Authorization: Bearer <admin_token>`
- **200:** `{ "ok": true, "table": "characters", "total": 123 }`

### `GET /api/admin/table/:table/export.csv`
- **Header:** `Authorization: Bearer <admin_token>`
- **Query:** `limit` (max 5000), `offset`
- **200:** CSV download (`text/csv`) with table columns as header row

### `POST /api/admin/table/:table/insert`
- **Header:** `Authorization: Bearer <admin_token>`
- **Body:** `{ "values": { "col": "value" } }`

### `POST /api/admin/table/:table/update`
- **Header:** `Authorization: Bearer <admin_token>`
- **Body:** `{ "original": { ... }, "changes": { ... } }`

### `POST /api/admin/table/:table/delete`
- **Header:** `Authorization: Bearer <admin_token>`
- **Body:** `{ "original": { ... } }`

### `POST /api/admin/query`
- **Header:** `Authorization: Bearer <admin_token>`
- **Body:** `{ "sql": "SELECT ..." }`
- **Guard:** only `SELECT`, `PRAGMA`, `EXPLAIN` allowed.

---

## WebSocket Protocol

### Connection Flow

1. Client acquires `session_id` via PoW (`/api/pow/challenge` → solve → `/api/pow/verify`) or login (`/api/character/login`)
2. Client opens `ws://<server>/ws`
3. Client sends auth message (must be first message):
   ```json
   { "type": "auth", "session_id": "<64-char hex or uuid>" }
   ```
4. Server validates session exists in `valid_sessions` table and hasn't expired (7 days). If invalid → close `4007`.
5. Server resolves `session_id → character_name` via `sessions` table, loads character by name
6. If session has no character mapping → close `4002`. If already connected → close `4006`.
7. If valid → registers client, sends `change_map`, waits for `map_loaded`, then sends `map_state` + broadcasts `player_enter`
8. Subsequent messages are game messages (see below)

### PlayerLook (sub-object used in several messages)

```json
{
  "face_id": 20000,
  "hair_id": 30000,
  "skin": 0,
  "equipment": [
    { "slot_type": "Coat", "item_id": 1040002 },
    { "slot_type": "Weapon", "item_id": 1302000 }
  ]
}
```

---

## Client → Server Messages

Every message has a `type` string field.

### `move` — Position update (sent at 20 Hz while client is active)
```json
{ "type": "move", "x": 1234, "y": 567, "action": "walk1", "facing": -1 }
```
- `x`, `y`: integer world coordinates
- `action`: current stance string (stand1, walk1, jump, prone, sit, ladder, rope, etc.)
- `facing`: -1 (left) or 1 (right)
- Note: no `frame` — remote clients run local animation timers

### `chat` — Chat message
```json
{ "type": "chat", "text": "Hello!" }
```

### `face` — Face expression change
```json
{ "type": "face", "expression": "smile" }
```

### `attack` — Attack started
```json
{ "type": "attack", "stance": "swingO1" }
```

### `sit` — Sit state changed
```json
{ "type": "sit", "active": true }
```

### `prone` — Prone state changed
```json
{ "type": "prone", "active": true }
```

### `climb` — Climb state changed
```json
{ "type": "climb", "active": true, "action": "ladder" }
```

### `equip_change` — Equipment changed
```json
{ "type": "equip_change", "equipment": [{ "slot_type": "Weapon", "item_id": 1302000 }] }
```

### `jump` — Jump started
```json
{ "type": "jump" }
```

### `use_portal` — Request portal-based map transition (server validates)
```json
{ "type": "use_portal", "portal_name": "out02" }
```
Server validates:
1. Portal exists in client's current map
2. Client position (server-tracked from `move` messages) is within 200px of portal
3. Portal is not a spawn point (type ≠ 0) and not scripted-only (type ≠ 6)
4. Portal has a valid destination (explicit `tm` or map's `returnMap`)
5. Destination map file exists on disk

On success → server sends `change_map`. On failure → server sends `portal_denied`.

### `map_loaded` — Client finished loading the map server told it to load
```json
{ "type": "map_loaded" }
```
Sent after client receives `change_map` and completes `loadMap()`.
Server then adds client to the room, sends `map_state`, broadcasts `player_enter`.

### `admin_warp` — Debug panel teleport request (debug mode only, legacy)
```json
{ "type": "admin_warp", "map_id": "103000900" }
```
**Only allowed when server `debug` config is `true`.** Denied with `portal_denied` otherwise.
Server validates the map exists, then sends `change_map`. No proximity check.
*Note: Debug panel was removed. This handler remains but is never sent by current client.*

### `gm_command` — GM slash command (requires `characters.gm = 1`)
```json
{ "type": "gm_command", "command": "map", "args": ["100000000"] }
{ "type": "gm_command", "command": "teleport", "args": ["Alice", "100000000"] }
```
Server validates `client.gm === true`, then executes command.
Commands: `map` (warp self), `teleport` (warp other online player).
Response: `gm_response` message.

### `gm_response` — Server response to GM command
```json
{ "type": "gm_response", "ok": true, "text": "Warping to map 100000000..." }
{ "type": "gm_response", "ok": false, "text": "Player 'Alice' is not online." }
```
Displayed as grey system chat message on client. `ok` = false shown as error subtype.

### `npc_warp` — NPC travel / taxi map transition (server validates NPC + destination)
```json
{ "type": "npc_warp", "npc_id": "1012000", "map_id": 100000000 }
```
Sent when player selects a destination in NPC dialogue (e.g., Regular Cab, world tour).
Server validates:
1. NPC exists on the client's current map (from WZ life data)
2. NPC has a script with travel destinations (from Npc.wz)
3. Requested destination is in the NPC's allowed destination list (server-side whitelist)
4. Destination map file exists on disk

### `save_state` — Persist inventory, equipment, and stats to server DB
```json
{
  "type": "save_state",
  "inventory": [{ "item_id": 2000000, "qty": 30, "inv_type": "USE", "slot": 0, "category": null }],
  "equipment": [{ "slot_type": "Weapon", "item_id": 1302000 }],
  "stats": { "level": 5, "job": "Warrior", "hp": 100, "max_hp": 100, "mp": 30, "max_mp": 30,
             "exp": 50, "max_exp": 200, "speed": 100, "jump": 100, "meso": 500 }
}
```
Sent by client after any inventory/equipment/stats change (equip, unequip, loot, drop, level up, etc.)
and every 30s auto-save. Server updates in-memory `WSClient` state AND persists to SQLite immediately.
Also sent alongside REST `/api/character/save` as a backup path.

Server also saves state automatically on WebSocket disconnect (using tracked in-memory state).

### `enter_map` — **REMOVED** (silently ignored by server)
```json
{ "type": "enter_map", "map_id": "103000900" }
```

### `leave_map` — **REMOVED** (silently ignored by server)
```json
{ "type": "leave_map" }
```

### `level_up` — Level increased
```json
{ "type": "level_up", "level": 10 }
```

### `damage_taken` — Player took damage
```json
{ "type": "damage_taken", "damage": 25, "direction": 1 }
```

### `die` — Player died
```json
{ "type": "die" }
```

### `respawn` — Player respawned
```json
{ "type": "respawn" }
```

### `drop_item` — Item dropped on map
```json
{
  "type": "drop_item",
  "item_id": 2000000,
  "name": "Red Potion",
  "qty": 5,
  "x": 100,
  "destY": 200,
  "iconKey": "item-icon:2000000",
  "category": null
}
```
Server creates a `MapDrop` with unique `drop_id`, broadcasts `drop_spawn` to ALL in room.

### `loot_item` — Item looted from map
```json
{ "type": "loot_item", "drop_id": 42 }
```
Server removes drop by `drop_id`, broadcasts `drop_loot` to ALL in room (including looter).

### `ping` — Heartbeat
```json
{ "type": "ping" }
```

---

## Server → Client Messages

Every message has a `type` string field.

### Connection-Scoped (sent only to the specific client)

### `change_map` — Server instructs client to load a map
```json
{ "type": "change_map", "map_id": "100000000", "spawn_portal": "out00", "gm": true }
```
- `gm` field included (truthy) only when client has GM privileges; client stores in `runtime.gm`
Sent:
- After auth (initial map from character save)
- After successful `use_portal` validation
- After `admin_warp` / `gm_command` validation
- Server-initiated (e.g., kicked to town)

Client must respond with `map_loaded` after completing `loadMap()`.

### `portal_denied` — Server rejected a portal/warp request
```json
{ "type": "portal_denied", "reason": "Too far from portal (350px > 200px)" }
```
Possible reasons:
- "Invalid request" — missing portal name or no current map
- "Already transitioning" — client has a pending map change
- "Map data not found" — server can't load current map's portal data
- "Portal not found" — portal name doesn't exist in map
- "Not a usable portal" — spawn point or scripted-only portal
- "Too far from portal (Xpx > 200px)" — anti-cheat distance check
- "No valid destination" — portal has no target map or returnMap
- "Destination map not found" — target map file doesn't exist
- "Map not found" — admin_warp target doesn't exist

### Map-Scoped (sent only to players in the same map)

### `map_state` — Full snapshot of all players in the map (sent on join)
```json
{
  "type": "map_state",
  "players": [
    {
      "id": "abc-session-id",
      "name": "Player1",
      "x": 100, "y": 200,
      "action": "stand1",
      "facing": -1,
      "look": { "face_id": 20000, "hair_id": 30000, "skin": 0, "equipment": [...] }
    }
  ],
  "drops": [
    {
      "drop_id": 42,
      "item_id": 2000000,
      "name": "Red Potion",
      "qty": 5,
      "x": 100,
      "destY": 200,
      "owner_id": "abc-session-id",
      "iconKey": "item-icon:2000000",
      "category": null
    }
  ]
}
```

### `player_enter` — New player joined the map
```json
{
  "type": "player_enter",
  "id": "abc", "name": "Player1",
  "x": 100, "y": 200,
  "action": "stand1", "facing": -1,
  "look": { ... }
}
```

### `player_leave` — Player left the map
```json
{ "type": "player_leave", "id": "abc" }
```

### `player_move` — Player position update
```json
{ "type": "player_move", "id": "abc", "x": 1234, "y": 567, "action": "walk1", "facing": -1 }
```

### `player_chat` — Player chat message
```json
{ "type": "player_chat", "id": "abc", "name": "Player1", "text": "Hello!" }
```

### `player_face` — Player face expression
```json
{ "type": "player_face", "id": "abc", "expression": "smile" }
```

### `player_attack` — Player started attack
```json
{ "type": "player_attack", "id": "abc", "stance": "swingO1" }
```

### `player_sit` — Player sit state (with chair)
```json
{ "type": "player_sit", "id": "abc", "active": true, "chair_id": 3010000 }
```
- `chair_id`: item ID of the chair (0 if standing up)
- Remote clients load chair sprite from `Item.wz/Install` on receive

### `hit_reactor` — Client hits a reactor (client → server)
```json
{ "type": "hit_reactor", "reactor_idx": 0 }
```
- Server validates: reactor exists, active, player in range, cooldown elapsed

### `reactor_hit` — Reactor took a hit (server → room)
```json
{ "type": "reactor_hit", "reactor_idx": 0, "new_state": 1, "new_hp": 3, "hitter_id": "abc" }
```

### `reactor_destroy` — Reactor destroyed (server → room)
```json
{ "type": "reactor_destroy", "reactor_idx": 0 }
```
- Followed by `drop_spawn` with server-rolled loot
- `drop_spawn.drop.owner_id` = majority damage dealer (loot priority)

### `loot_failed` — Server rejects loot attempt (server → requester only)
```json
{ "type": "loot_failed", "drop_id": 123, "reason": "owned", "owner_id": "abc", "remaining_ms": 3200 }
{ "type": "loot_failed", "drop_id": 123, "reason": "not_found" }
{ "type": "loot_failed", "drop_id": 123, "reason": "already_looted" }
{ "type": "loot_failed", "drop_id": 123, "reason": "inventory_full" }
```
- `owned`: another player has loot priority, protection hasn't expired
- `not_found` / `already_looted`: client should remove drop from groundDrops
- `inventory_full`: player's inventory tab for this item type has no free slots; drop stays on map

### Loot Ownership Rules
- **Reactor/mob drops**: `owner_id` = majority damage dealer. Owner has 5s exclusive pickup.
- **Player-dropped items**: `owner_id` = `""` (no protection, anyone can loot immediately).
- Server enforces via `loot_item` handler: checks `owner_id` + `created_at` age < 5s.
- Client pre-checks locally to avoid pointless requests (uses `drop.createdAt` local timestamp).

### `reactor_respawn` — Reactor respawned after 10s (server → room)
```json
{ "type": "reactor_respawn", "reactor_idx": 0, "reactor_id": "0002001", "x": -400, "y": 252 }
```

### `map_state` — now includes `reactors` array
```json
{ "type": "map_state", ..., "reactors": [{ "idx": 0, "reactor_id": "0002001", "x": -400, "y": 252, "state": 0, "hp": 4, "active": true }] }
```

### `player_prone` — Player prone state
```json
{ "type": "player_prone", "id": "abc", "active": true }
```

### `player_climb` — Player climb state
```json
{ "type": "player_climb", "id": "abc", "active": true, "action": "ladder" }
```

### `player_equip` — Player equipment changed
```json
{ "type": "player_equip", "id": "abc", "equipment": [{ "slot_type": "Weapon", "item_id": 1302000 }] }
```

### `player_jump` — Player jumped
```json
{ "type": "player_jump", "id": "abc" }
```

### `player_level_up` — Player leveled up (map-scoped)
```json
{ "type": "player_level_up", "id": "abc", "level": 10 }
```

### `player_damage` — Player took damage
```json
{ "type": "player_damage", "id": "abc", "damage": 25, "direction": 1 }
```

### `player_die` — Player died
```json
{ "type": "player_die", "id": "abc" }
```

### `player_respawn` — Player respawned
```json
{ "type": "player_respawn", "id": "abc" }
```

### `drop_spawn` — Item dropped on map (broadcast to ALL in room)
```json
{
  "type": "drop_spawn",
  "drop": {
    "drop_id": 42,
    "item_id": 2000000,
    "name": "Red Potion",
    "qty": 5,
    "x": 100,
    "destY": 200,
    "owner_id": "abc-session-id",
    "iconKey": "item-icon:2000000",
    "category": null
  }
}
```
Sent to ALL players in room (including the dropper so they can replace the local temp ID).

### `drop_loot` — Item looted from map (broadcast to ALL in room)
```json
{
  "type": "drop_loot",
  "drop_id": 42,
  "looter_id": "abc-session-id",
  "item_id": 2000000,
  "name": "Red Potion",
  "qty": 5,
  "category": null,
  "iconKey": "item-icon:2000000"
}
```
Sent to ALL players. Looter adds item to inventory; others animate pickup.

### `drop_expire` — Item expired from map (broadcast to ALL in room)
```json
{ "type": "drop_expire", "drop_id": 42 }
```
Sent when a drop has been on the ground for 180 seconds. Client fades it out over 2s.

### `jq_proximity` — Server rejects JQ reward (player not on NPC's platform)
```json
{ "type": "jq_proximity", "npc_id": "1063000" }
```
Sent when player requests `jq_reward` but is >200px from the reward NPC.
Only applies to `requirePlatform: true` JQ maps (Forest of Patience).
Client shows a random "come closer" phrase in system chat.

### `jq_inventory_full` — Server rejects JQ reward (inventory full)
```json
{ "type": "jq_inventory_full" }
```
Sent when player requests `jq_reward` but their inventory (EQUIP/CASH tab) has no free slots.
Player stays on the current map (no warp). Client shows system chat message telling them to drop items.

### `mob_authority` — Mob authority assignment
```json
{ "type": "mob_authority", "active": true }
```
Sent to the new mob authority when the previous one leaves.

### `mob_state` — Mob positions/states from authority (10Hz, broadcast to non-authority)
```json
{
  "type": "mob_state",
  "mobs": [
    {
      "idx": 0,
      "x": 100, "y": 200,
      "hspeed": 1.5,
      "facing": -1,
      "stance": "move",
      "behavior": "move",
      "hp": 80,
      "dead": false, "dying": false,
      "nameVisible": true,
      "respawnAt": 0
    }
  ]
}
```
Only accepted from the mob authority client. Relayed to all others in the room.

### `mob_damage` — Remote player hit a mob (broadcast to room excluding sender)
```json
{ "type": "mob_damage", "attacker_id": "abc", "mob_idx": 0, "damage": 45, "direction": 1 }
```
Server adds `attacker_id` and relays. Authority applies HP/knockback/death.

### Global (sent to ALL connected players)

### `global_level_up` — Celebration broadcast (level ≥ 10)
```json
{ "type": "global_level_up", "name": "Player1", "level": 30 }
```

### `global_achievement` — Achievement broadcast
```json
{ "type": "global_achievement", "name": "Player1", "achievement": "First Boss Kill" }
```

### `global_announcement` — Server message
```json
{ "type": "global_announcement", "text": "Server maintenance in 10 minutes" }
```

### `global_player_count` — Periodic player count (every 10s)
```json
{ "type": "global_player_count", "count": 42 }
```

### `pong` — Heartbeat response
```json
{ "type": "pong" }
```

---

## Server Room Model

```
rooms: Map<mapId, Map<sessionId, WSClient>>
allClients: Map<sessionId, WSClient>
```

### WSClient State
```
mapId: string         — current room ("" if in limbo during map load)
pendingMapId: string  — map the client is transitioning to (set by server)
pendingSpawnPortal: string — portal name on pending map
```

### Server-Authoritative Map Transitions

**The server decides which map a client is on.** Clients cannot directly enter maps.

#### Auth flow:
1. Client sends `auth { session_id }`
2. Server resolves session → character name, loads character save, creates WSClient with `mapId=""`
3. Server calls `registerClient()` — adds to allClients but NOT to any room
4. Server calls `initiateMapChange()` — sends `change_map { map_id, spawn_portal }`
5. Client loads map, sends `map_loaded`
6. Server calls `completeMapChange()` — joins room, sends `map_state`, broadcasts `player_enter`

#### Portal flow:
1. Client sends `use_portal { portal_name }`
2. Server validates: portal exists, player within 200px, valid target
3. Server removes client from old room → broadcasts `player_leave`
4. Server sends `change_map { map_id, spawn_portal }` (client is in limbo)
5. Client loads map, sends `map_loaded`
6. Server adds to new room → sends `map_state`, broadcasts `player_enter`

#### Admin warp (debug panel):
1. Client sends `admin_warp { map_id }`
2. Server validates map exists
3. Same steps 3-6 as portal flow

#### Disconnect:
- Remove from room → broadcast `player_leave`
- Remove from `allClients`

### Anti-Cheat Validation

**Position tracking:**
- Server tracks `x`, `y` from `move` messages (20Hz from client)
- `positionConfirmed` flag: must receive ≥1 move before portal/NPC warp is allowed
- Velocity check: moves exceeding 1200 px/s are silently dropped (position not updated)
- `lastMoveMs` timestamp resets on map change (new map = fresh position required)

**use_portal validation:**
- `positionConfirmed` must be true
- Portal name must exist in current map's WZ data (`server/src/map-data.ts`)
- Portal type must not be 0 (spawn) or 6 (scripted-only)
- Server-tracked player position must be within 200px of portal
- Target map must have valid WZ data on disk

**npc_warp validation:**
- NPC ID must exist in the `life` section of the client's current map
- NPC must have a script ID (from Npc.wz)
- Requested destination must be in the NPC's server-side destination whitelist
- Destination map file must exist on disk

**admin_warp:** Only available when `debug: true` in server config.

**enter_map / leave_map:** Silently ignored — no bypass.

### Broadcast rules:
- `move` relayed to room, **excluding sender**
- `chat` relayed to room, **including sender** (confirmation)
- All other map-scoped messages relayed to room, **excluding sender**
- Global messages sent to ALL `allClients`

---

## C++ Reference: OtherChar Movement Model

From `MapleStory-Client/Character/OtherChar.cpp`:

```cpp
// Movement queue with timer-based consumption
void OtherChar::send_movement(const vector<Movement>& newmoves) {
    movements.push(newmoves.back());
    if (timer == 0) {
        constexpr uint16_t DELAY = 50;
        timer = DELAY;
    }
}

int8_t OtherChar::update(const Physics& physics) {
    if (timer > 1) timer--;
    else if (timer == 1) {
        if (!movements.empty()) {
            lastmove = movements.front();
            movements.pop();
        } else timer = 0;
    }

    if (!attacking) set_state(lastmove.newstate);

    // Move toward target position (delta = speed)
    phobj.hspeed = lastmove.xpos - phobj.crnt_x();
    phobj.vspeed = lastmove.ypos - phobj.crnt_y();
    phobj.move();

    // ... animation update local
    bool aniend = Char::update(physics, get_stancespeed());
    if (aniend && attacking) attacking = false;
}
```

Key behaviors to replicate:
- **Movement queue** with timer-based consumption (not instant apply)
- **Position = delta per tick** (hspeed = target - current), not lerp
- **Animation is fully local** — uses stance speed (walk=hspeed, climb=vspeed, else 1.0)
- **Attack overrides stance** until animation ends
- **Linear interpolation for rendering** (before/now with alpha)

---

## Correction Thresholds

| Error Distance | Strategy | Duration |
|----------------|----------|----------|
| < 2 px | No correction (within rounding) | — |
| 2-300 px | Smooth lerp toward server position | 100-300 ms |
| > 300 px | Instant snap (teleport/knockback/portal) | 0 ms |
