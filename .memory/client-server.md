# Client-Server Communication

> Defines the wire protocol, session model, character persistence, and data flow
> between client (`client/web/`) and server (`server/src/`).

---

## Session Model

### Session Acquisition Flow
```
Client                                Server
  │                                     │
  ├── GET /api/pow/challenge ──────────►│ generate challenge (64-char hex, 20-bit difficulty)
  │◄── { challenge, difficulty } ───────┤
  │                                     │
  │  [solve: SHA-256(challenge+nonce)   │
  │   with N leading zero bits]         │
  │                                     │
  ├── POST /api/pow/verify ────────────►│ validate PoW, register in valid_sessions
  │   { challenge, nonce }              │
  │◄── { session_id } ─────────────────┤ (64-char hex)
  │                                     │
  │  [store in localStorage as          │
  │   "shlop.session"]                  │
```

### Session Lifecycle
- **Acquired via**: PoW challenge or login (`/api/character/login`)
- **Storage**: `localStorage` key `shlop.session`
- **Sent as**: `Authorization: Bearer <session_id>` (REST) or `{ type: "auth", session_id }` (WS first message)
- **Expiry**: 7 days of inactivity (server-side `last_used_at`)
- **Purge**: hourly server-side sweep of expired sessions
- **On login**: new session_id issued, old one abandoned (not revoked)

### Identity Model
- **Session ID** = transient auth token (can change on login)
- **Character name** = permanent unique identifier (case-insensitive)
- `sessions` table: `session_id → character_name`
- Name **not** stored in character data JSON blob — lives only in `characters.name` column
- API responses inject `identity.name` for client compatibility

---

## Character Persistence

### Save Schema (v1)
```json
{
  "identity": {
    "gender": false,          // false=male, true=female
    "skin": 0,
    "face_id": 20000,
    "hair_id": 30000
  },
  "stats": {
    "level": 1, "job": "Beginner",
    "exp": 0, "max_exp": 15,
    "hp": 50, "max_hp": 50,
    "mp": 5, "max_mp": 5,
    "speed": 100, "jump": 100,
    "meso": 0
  },
  "location": {
    "map_id": "100000001",
    "spawn_portal": null,
    "facing": -1
  },
  "equipment": [
    { "slot_type": "Coat", "item_id": 1040002, "item_name": "" }
  ],
  "inventory": [
    { "item_id": 2000000, "qty": 30, "inv_type": "USE", "slot": 0, "category": null }
  ],
  "achievements": {
    "jq_quests": { "Shumi's Lost Coin": 3 }
  },
  "version": 1,
  "saved_at": "2026-02-23T01:00:00.000Z"
}
```

### Persistence Points
- **Server-side `save_state` handler**: client sends full inventory + stats periodically → `persistClientState()` → DB
- **WS disconnect**: server saves current tracked state before removing from rooms
- **REST save**: `POST /api/character/save` — full save JSON (server merges JQ achievements: take max)
- **Client sendBeacon**: `navigator.sendBeacon` on page unload with save data
- **JQ reward**: server updates inventory + achievements → immediate persist

### Achievement Merge Strategy
Server is authoritative for `jq_quests`. On save:
- For each quest key, take `Math.max(server_count, client_count)`
- Prevents client from reducing completion counts

---

## REST API Summary

### Character Endpoints (`/api/character/*`)

| Endpoint | Method | Auth | Body | Response |
|----------|--------|------|------|----------|
| `/create` | POST | Bearer | `{ name, gender }` | `{ ok, data, name }` 201 |
| `/load` | GET | Bearer | — | `{ ok, data, name }` |
| `/save` | POST | Bearer | Save JSON (with `version`) | `{ ok }` |
| `/claim` | POST | Bearer | `{ password }` (min 4) | `{ ok }` |
| `/claimed` | GET | Bearer | — | `{ ok, claimed }` |
| `/login` | POST | None | `{ name, password }` | `{ ok, session_id }` |

### Other Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/pow/challenge` | GET | None | Get PoW challenge |
| `/api/pow/verify` | POST | None | Verify PoW solution → session_id |
| `/api/online` | GET | None | `{ ok, count }` |
| `/api/leaderboard` | GET | None | JQ leaderboards |
| `/api/admin/*` | Various | Admin Bearer | GM-only DB dashboard |

---

## WebSocket Protocol

### Connection Flow
```
Client                                Server
  │                                     │
  ├── WS connect to /ws ──────────────►│ upgrade, capture IP
  │                                     │
  ├── { type: "auth", session_id } ───►│ validate session + load character
  │                                     │ register client, set pendingMapId
  │◄── { type: "change_map",          │
  │      map_id, spawn_portal, gm } ───┤
  │                                     │
  │  [client loads map assets]          │
  │                                     │
  ├── { type: "map_loaded" } ─────────►│ join room, broadcast player_enter
  │◄── { type: "map_state",           │
  │      players, drops,               │
  │      mob_authority, reactors } ─────┤
  │                                     │
  │  [game loop: send/receive msgs]     │
```

### Client → Server Messages

| Type | Fields | Description |
|------|--------|-------------|
| `ping` | — | Heartbeat (5s interval) |
| `move` | x, y, action, facing | Position update (20 Hz) |
| `chat` | text | Chat message |
| `face` | expression | Facial expression emote |
| `attack` | stance | Attack animation |
| `sit` | active, chair_id | Sit/stand toggle |
| `prone` | active | Prone toggle |
| `climb` | active, action | Rope/ladder toggle |
| `jump` | — | Jump notification |
| `equip_change` | equipment[] | Equipment update |
| `save_state` | inventory[], equipment[], stats, achievements | Periodic full state sync |
| `use_portal` | portal_name | Request portal transition |
| `map_loaded` | — | Confirm map load complete |
| `npc_warp` | npc_id, map_id | NPC travel request |
| `jq_reward` | — | JQ treasure chest claim |
| `admin_warp` | map_id | Debug warp (debug mode only) |
| `gm_command` | command, args[] | GM slash command |
| `level_up` | level | Level up notification |
| `damage_taken` | damage, direction | Hit notification |
| `die` | — | Death notification |
| `respawn` | — | Respawn notification |
| `drop_item` | item_id, name, qty, x, startY, destY, iconKey, category | Drop item to ground |
| `mob_state` | mobs[] | Mob positions (authority only, 10 Hz) |
| `mob_damage` | mob_idx, damage, direction | Hit mob notification |
| `loot_item` | drop_id | Loot request |
| `hit_reactor` | reactor_idx | Attack reactor |

### Server → Client Messages

| Type | Fields | Description |
|------|--------|-------------|
| `pong` | — | Heartbeat response |
| `change_map` | map_id, spawn_portal, gm | Server-initiated map transition |
| `map_state` | players[], drops[], mob_authority, reactors[] | Room snapshot on join |
| `player_enter` | id, name, x, y, action, facing, look, chair_id, achievements | New player in room |
| `player_leave` | id | Player left room |
| `player_move` | id, x, y, action, facing | Position relay |
| `player_chat` | id, name, text | Chat relay |
| `player_face` | id, expression | Expression relay |
| `player_attack` | id, stance | Attack relay |
| `player_sit` | id, active, chair_id | Sit relay |
| `player_prone` | id, active | Prone relay |
| `player_climb` | id, active, action | Climb relay |
| `player_jump` | id | Jump relay |
| `player_equip` | id, equipment[] | Equipment change relay |
| `player_level_up` | id, level | Level up relay |
| `player_damage` | id, damage, direction | Damage relay |
| `player_die` | id | Death relay |
| `player_respawn` | id | Respawn relay |
| `portal_denied` | reason | Portal/warp rejection |
| `global_player_count` | count | Periodic player count (10s) |
| `global_level_up` | name, level | Server-wide level ≥10 announcement |
| `drop_spawn` | drop{} | New ground drop |
| `drop_loot` | drop_id, looter_id, item_id, name, qty, category, iconKey | Loot pickup |
| `drop_expire` | drop_id | Drop expired (server sweep) |
| `loot_failed` | drop_id, reason, owner_id?, remaining_ms? | Loot rejection |
| `mob_state` | mobs[] | Mob positions (from authority) |
| `mob_authority` | active | Mob authority assignment |
| `mob_damage` | attacker_id, mob_idx, damage, direction | Mob hit relay |
| `reactor_hit` | reactor_idx, new_state, new_hp, hitter_id | Reactor damaged |
| `reactor_destroy` | reactor_idx | Reactor destroyed |
| `reactor_respawn` | reactor_idx, reactor_id, x, y | Reactor respawned |
| `gm_response` | ok, text | GM command result |
| `jq_reward` | quest_name, item_id, item_name, item_qty, item_category, completions, bonus_item_id?, bonus_item_name? | JQ reward result |
| `jq_inventory_full` | — | Inventory full on JQ reward |
| `jq_proximity` | npc_id | Too far from JQ NPC |

---

## Map Transition Protocol

### Portal Usage
```
Client                                Server
  │                                     │
  ├── { type: "use_portal",           │
  │     portal_name: "p1" } ──────────►│ validate: position, portal type,
  │                                     │   proximity, destination exists
  │                                     │
  │  [if valid:]                        │
  │◄── { type: "change_map",          │ remove from old room
  │      map_id: "102000000",          │
  │      spawn_portal: "sp" } ─────────┤
  │                                     │
  │  [client loads new map]             │
  │                                     │
  ├── { type: "map_loaded" } ─────────►│ join new room
  │◄── { type: "map_state", ... } ─────┤ snapshot of new room
  │                                     │
  │  [if invalid:]                      │
  │◄── { type: "portal_denied",        │
  │      reason: "Too far..." } ────────┤
```

### Anti-Cheat: Portal Proximity
Server tracks player position from `move` messages. Portal use requires:
- `positionConfirmed = true` (at least one valid move on current map)
- Distance to portal ≤ 200px (`PORTAL_RANGE_PX`)
- Move speed ≤ 1200 px/s (`MAX_MOVE_SPEED_PX_PER_S`)

---

## Multiplayer State Sync

### Remote Player Rendering
- Server relays `player_move` to room (excludes sender)
- Client buffers snapshots with timestamps (max 20 per player)
- Render 100ms in the past, lerp between bracketing snapshots
- Teleport detection: >300px gap → instant snap
- Animation runs locally per remote player (frame timers independent)

### Mob Authority
- First player in map = mob authority
- Authority runs local AI, sends `mob_state` at 10 Hz
- Non-authority clients receive + render, skip AI/physics
- On authority disconnect, next player in room promoted

### Drop Ownership
- Server tracks `owner_id` per drop (majority damage dealer for reactor drops)
- 5-second loot protection: only owner can loot during first 5s
- Server validates inventory capacity before allowing loot
- Stackable items: checks existing stack space + free slots

---

## Data Types

### PlayerLook (WS auth + relay)
```typescript
{
  gender: boolean,        // false=male, true=female
  face_id: number,
  hair_id: number,
  skin: number,
  equipment: Array<{ slot_type: string, item_id: number }>
}
```

### InventoryItem (save_state + persistence)
```typescript
{
  item_id: number,
  qty: number,
  inv_type: "EQUIP" | "USE" | "SETUP" | "ETC" | "CASH",
  slot: number,           // 0-31 within tab
  category: string | null // WZ category for equips
}
```

### MapDrop (server state, broadcast via drop_spawn)
```typescript
{
  drop_id: number,        // server-assigned unique ID
  item_id: number,
  name: string,
  qty: number,
  x: number,
  startY: number,         // drop arc start Y
  destY: number,          // landing Y (foothold)
  owner_id: string,       // session ID for loot priority
  iconKey: string,        // client icon cache key
  category: string | null,
  created_at: number      // Date.now() timestamp
}
```

---

## Offline Mode Support

Client can function without server:
- No WebSocket connection → skip multiplayer features
- Character data saved to `localStorage` (`shlop.character.v1`)
- Map loading works directly from `/resourcesv2/` paths
- Online mode detected via `window.__MAPLE_ONLINE__` flag

---

## Resource Pipeline

### Asset Path Format
- Maps: `/resourcesv2/Map.wz/Map/MapN/NNNNNNNNN.img.json`
- Characters: `/resourcesv2/Character.wz/{type}/{id}.img.json`
- NPCs: `/resourcesv2/Npc.wz/{id}.img.json`
- Mobs: `/resourcesv2/Mob.wz/{id}.img.json`
- Sounds: `/resourcesv2/Sound.wz/{name}.img.json`
- Items: `/resourcesv2/Item.wz/{category}/{group}.img.json`
- UI: `/resourcesv2/UI.wz/{element}.img.json`
- Strings: `/resourcesv2/String.wz/{type}.img.json`

### V2 Map Set (server-validated)
Maps are loaded from `resourcesv2/Map.wz/Map/MapN/`. Server validates existence
via `mapExists()` before allowing transitions. NPC destinations hard-coded in
`map-data.ts` with server-side validation.
