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

### Auth (Optional, Phase 2)
- **Phase 1**: No auth — session token = identity. Low friction. Anyone with the token owns the character.
- **Phase 2 (recommended)**: Add optional **passphrase** (4-8 word phrase) that the player sets.
  - Used to recover session from another browser: enter name + passphrase → server returns session ID
  - No email, no password complexity, no OAuth — just a memorable phrase
  - Stored as bcrypt hash server-side
  - Players who don't set a passphrase keep the localStorage-only session (no recovery)
- **Why passphrase**: zero friction to start, optional recovery, no email infrastructure,
  memorable enough for the target audience, MapleStory-thematic

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
| `gender` | boolean | `false` (male) | Not yet impl |
| `skin` | number | `0` | Not yet impl |
| `face_id` | number | `20000` | Hardcoded |
| `hair_id` | number | `30000` | `DEFAULT_HAIR_ID` |

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

Default: Coat:1040002, Pants:1060002, Shoes:1072001, Weapon:1302000

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

### V2 Resource Pipeline
- Extract all above dependencies from `resources/` into `resourcesv2/`
- Organize by type: `resourcesv2/Map/`, `resourcesv2/Mob/`, `resourcesv2/Npc/`, `resourcesv2/Sound/`, etc.
- Client in V2 mode references `resourcesv2/` instead of `resources/`
- Simplify JSON: strip unused stances/frames, flatten structure where possible
- Goal: smaller download, faster load, only what's needed for the V2 map set

---

## Implementation Order

| Step | What | Scope |
|------|------|-------|
| **1** | `saveCharacter()`/`loadCharacter()` in `app.js` | Client only |
| **2** | Offline localStorage persistence | Client only — progress survives reload |
| **3** | Server SQLite + `POST/GET /api/character/*` + name reservation | `server/src/` |
| **4** | Wire online `app.js` to server API via `__MAPLE_ONLINE__` | Client + server |
| **5** | WebSocket room manager + message routing | `server/src/ws.ts` |
| **6** | Client WS connect + send position/actions at 50ms | `app.js` |
| **7** | Remote player data model + rendering (reuse character pipeline) | `app.js` |
| **8** | Global broadcasts (level up, achievements, announcements) | Server + client |
| **9** | V2 resource extraction pipeline for jump quest maps | `tools/`, `resourcesv2/` |
| **10** | V2 client loader (reference `resourcesv2/` for V2 maps) | `app.js` |

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
