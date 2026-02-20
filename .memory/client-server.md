# Client-Server Architecture

> Defines the client-server split: character state persistence, real-time multiplayer
> protocol, auth model, V2 map list, and resource pipeline.
> C++ reference: `StatsEntry`, `LookEntry`, `CharEntry`, `Inventory`, `CharStats`, `MapleStat`.

---

## Client Modes

### Offline (`bun run client:offline`)
- Static file server only — no game server dependency
- All state local: in-memory + localStorage
- Serves `client/web/`, `/resources/`, `/resourcesv2/`
- Default port: 5173
- File: `tools/dev/serve-client-offline.mjs`

### Online (`bun run client:online`)
- Static file server + API proxy to game server
- Injects `window.__MAPLE_ONLINE__ = true` and `window.__MAPLE_SERVER_URL__` into HTML
- Proxies `/api/*` requests to game server (default `http://127.0.0.1:5200`)
- Client detects online mode via `window.__MAPLE_ONLINE__` flag
- WebSocket: client connects directly to game server URL
- Env: `GAME_SERVER_URL` (default `http://127.0.0.1:5200`)
- File: `tools/dev/serve-client-online.mjs`

### Legacy (`bun run client:web`)
- Alias for `client:offline` (backward compatible)

---

## Session & Auth Model

### Session Identity
- **Session ID**: random UUID generated on first visit, stored in `localStorage` as `mapleweb.session`
- **Session ID is the primary key** for all server state (character save, WebSocket identity)
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
CREATE TABLE credentials (
  session_id TEXT PRIMARY KEY REFERENCES characters(session_id),
  password_hash TEXT NOT NULL,
  claimed_at TEXT DEFAULT (datetime('now'))
);
```

**REST endpoints**:
```
POST /api/character/claim   Body: { password }      Auth: Bearer <session-id>  → 200/400/409
GET  /api/character/claimed                          Auth: Bearer <session-id>  → 200 { claimed: bool }
POST /api/character/login   Body: { name, password } No auth header needed      → 200/401/404
```

### Name Reservation Table (SQLite)
```sql
CREATE TABLE names (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  session_id TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## Character State Groups

### 1. `character_identity`

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `name` | string | `"MapleWeb"` | `runtime.player.name` |
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
  session_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,            -- JSON blob (CharacterSave)
  version INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
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
```

> Full request/response shapes: **see `.memory/shared-schema.md`**

### Auto-Save Triggers
- Map transition (portal use)
- Equip/unequip item
- Level up
- Periodic timer: every 30 seconds
- Page unload (`beforeunload`)

### Client Logic
```javascript
if (window.__MAPLE_ONLINE__) {
  // POST /api/character/save with session token
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

### Connection Flow
1. Client opens `ws://<server>/ws`
2. Client sends `{ type: "auth", session_id: "<uuid>" }` as first message
3. Server validates, loads character from DB, creates default if needed
4. Server adds client to map room, sends `map_state`, broadcasts `player_enter`
5. Client/server exchange `ping`/`pong` every 10s for keepalive
6. Server disconnects clients with no activity for 30s

### Server Room Model
```
rooms: Map<mapId, Map<sessionId, WSClient>>
allClients: Map<sessionId, WSClient>
```

### Map Enter ACK
- Client sends `leave_map` → server removes from old room
- Client loads map locally (loading screen)
- Client sends `enter_map` → server adds to new room, sends `map_state`
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
- WS close code 4006 now shows full-screen blocking modal BEFORE map loads
- `connectWebSocketAsync()` returns Promise<boolean>: true on first message (auth accepted), false on 4006
- Boot sequence changed to: connect WS first → if blocked, show overlay + stop → else load map + enter_map
- Overlay offers Retry (reconnects async, loads map on success) or Log Out (wipes localStorage, reloads)

### Movement Keybinds
- WASD removed — only configurable movement keys in `runtime.keybinds`
- `moveLeft`, `moveRight`, `moveUp`, `moveDown` (default: arrow keys)
- `getGameplayKeys()` builds key set dynamically from current keybinds

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
- `105040311` — Deep Forest of Patience Step 2

**John's Present**
- `105040312` — Deep Forest of Patience Step 3
- `105040313` — Deep Forest of Patience Step 4

**John's Last Present**
- `105040314` — Deep Forest of Patience Step 5
- `105040315` — Deep Forest of Patience Step 6

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
