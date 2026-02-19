# Client-Server Character State

> Defines all character state that must be persisted to a server (or localStorage fallback).
> C++ reference: `StatsEntry`, `LookEntry`, `CharEntry`, `Inventory`, `CharStats`, `MapleStat`.

## State Groups

### 1. `character_identity` — Who the character is

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `name` | string | `"MapleWeb"` | `runtime.player.name` |
| `gender` | boolean | `false` (male) | Not yet impl (C++ `StatsEntry.female`) |
| `skin` | number | `0` | Not yet impl (C++ `MapleStat::SKIN`) |
| `face_id` | number | `20000` | Hardcoded `Face/00020000.img.json` |
| `hair_id` | number | `30000` | `DEFAULT_HAIR_ID` |

### 2. `character_stats` — Base stats & progression

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
| `str` | number | `4` | Not yet impl (C++ `MapleStat::STR`) |
| `dex` | number | `4` | Not yet impl (C++ `MapleStat::DEX`) |
| `int` | number | `4` | Not yet impl (C++ `MapleStat::INT`) |
| `luk` | number | `4` | Not yet impl (C++ `MapleStat::LUK`) |
| `fame` | number | `0` | Not yet impl (C++ `MapleStat::FAME`) |
| `ap` | number | `0` | Not yet impl (C++ `MapleStat::AP`) |
| `sp` | number | `0` | Not yet impl (C++ `MapleStat::SP`) |
| `meso` | number | `0` | Not yet impl (C++ `Inventory::meso`) |

### 3. `character_location` — Where the character is

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `map_id` | string | `"104040000"` | `runtime.mapId` |
| `spawn_portal` | number | `0` | Portal index (C++ `StatsEntry.portal`) |
| `facing` | number | `-1` | `runtime.player.facing` |

### 4. `character_equipment` — What's equipped

C++ reference: `LookEntry.equips` (map of slot → item ID).

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `equipped` | array of `{slot_type, item_id, item_name}` | See below | `playerEquipped` Map |

Default equipment:
- `Coat`: 1040002
- `Pants`: 1060002
- `Shoes`: 1072001
- `Weapon`: 1302000

### 5. `character_inventory` — Items in bag

C++ reference: `Inventory::inventories` (per-type slot maps).

| Field | Type | Default | Code Source |
|-------|------|---------|-------------|
| `items` | array of `{item_id, qty, inv_type, slot, category}` | See below | `playerInventory` array |

Default starter items:
- 2000000 ×30 (Red Potion, USE, slot 0)
- 2000001 ×15 (Orange Potion, USE, slot 1)
- 2000002 ×5 (White Potion, USE, slot 2)
- 2010000 ×10 (Blue Potion, USE, slot 3)
- 4000000 ×8 (Snail Shell, ETC, slot 0)
- 4000001 ×3 (Blue Snail Shell, ETC, slot 1)

### 6. `character_keybinds` — Key mapping

Already persisted to `localStorage` key `mapleweb.keybinds.v1`.

| Field | Type | Default |
|-------|------|---------|
| `attack` | string | `"KeyC"` |
| `jump` | string | `"Space"` |
| `loot` | string | `"KeyZ"` |
| `equip` | string | `"KeyE"` |
| `inventory` | string | `"KeyI"` |
| `keybinds` | string | `"KeyK"` |
| `face1`–`face9` | string | `"Digit1"`–`"Digit9"` |

### 7. `character_settings` — Client preferences

Already persisted to `localStorage` key `mapleweb.settings.v1`.

| Field | Type | Default |
|-------|------|---------|
| `bgm_enabled` | boolean | `true` |
| `sfx_enabled` | boolean | `true` |
| `fixed_res` | boolean | `true` |
| `minimap_visible` | boolean | `true` |

### 8. `character_achievements` — Progress tracking (not yet implemented)

| Field | Type | Default |
|-------|------|---------|
| `mobs_killed` | number | `0` |
| `maps_visited` | string[] | `[]` |
| `npcs_talked` | string[] | `[]` |
| `portals_used` | number | `0` |
| `items_looted` | number | `0` |
| `items_dropped` | number | `0` |
| `max_level_reached` | number | `1` |
| `total_exp_earned` | number | `0` |
| `total_damage_dealt` | number | `0` |
| `total_damage_taken` | number | `0` |
| `deaths` | number | `0` |
| `play_time_ms` | number | `0` |

## TypeScript Schema

```typescript
interface CharacterSave {
  // 1. Identity
  identity: {
    name: string;
    gender: boolean;       // false=male, true=female
    skin: number;
    face_id: number;
    hair_id: number;
  };

  // 2. Stats
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
    str: number;
    dex: number;
    int: number;
    luk: number;
    fame: number;
    ap: number;
    sp: number;
    meso: number;
  };

  // 3. Location
  location: {
    map_id: string;
    spawn_portal: number;
    facing: number;
  };

  // 4. Equipment
  equipment: Array<{
    slot_type: string;     // "Cap"|"Coat"|"Pants"|"Shoes"|"Weapon"|etc.
    item_id: number;
    item_name: string;
  }>;

  // 5. Inventory
  inventory: Array<{
    item_id: number;
    qty: number;
    inv_type: string;      // "EQUIP"|"USE"|"SETUP"|"ETC"|"CASH"
    slot: number;          // 0-31
    category: string | null;
  }>;

  // 6. Keybinds
  keybinds: Record<string, string>;  // action → event.code

  // 7. Settings
  settings: {
    bgm_enabled: boolean;
    sfx_enabled: boolean;
    fixed_res: boolean;
    minimap_visible: boolean;
  };

  // 8. Achievements
  achievements: {
    mobs_killed: number;
    maps_visited: string[];
    npcs_talked: string[];
    portals_used: number;
    items_looted: number;
    items_dropped: number;
    max_level_reached: number;
    total_exp_earned: number;
    total_damage_dealt: number;
    total_damage_taken: number;
    deaths: number;
    play_time_ms: number;
  };

  // Meta
  version: number;         // schema version for migrations
  saved_at: string;        // ISO timestamp
}
```

## Current Persistence Status

| State Group | Persisted Where | Status |
|-------------|-----------------|--------|
| identity | — | ❌ Hardcoded defaults only |
| stats | — | ❌ Resets on page reload |
| location | — | ❌ Uses URL param `?mapId=` or default |
| equipment | — | ❌ Resets to DEFAULT_EQUIPS |
| inventory | — | ❌ Resets to starter items |
| keybinds | localStorage | ✅ `mapleweb.keybinds.v1` |
| settings | localStorage | ✅ `mapleweb.settings.v1` |
| achievements | — | ❌ Not yet implemented |

## Implementation Plan

1. Add `saveCharacter()` — serializes all 8 groups into `CharacterSave` JSON
2. Add `loadCharacter()` — deserializes and applies to runtime state
3. Fallback: `localStorage` key `mapleweb.character.v1` when no server
4. Server endpoint (future): `POST /api/character/save`, `GET /api/character/load`
5. Auto-save triggers: map transition, equip change, level up, periodic timer
6. Schema version field enables forward-compatible migrations

## C++ Reference Mapping

| Web State Group | C++ Struct / System |
|-----------------|---------------------|
| identity | `StatsEntry.name`, `LookEntry.female/skin/faceid/hairid` |
| stats | `StatsEntry.stats` (EnumMap of `MapleStat::Id`), `StatsEntry.exp` |
| location | `StatsEntry.mapid`, `StatsEntry.portal` |
| equipment | `LookEntry.equips` (map<int8_t, int32_t>) |
| inventory | `Inventory::inventories` (per-type slot→item maps) |
| keybinds | `UIKeyConfig` (keyboard mapping UI) |
| settings | Client-side config (not in C++ server protocol) |
| achievements | Not in C++ client (server-tracked in live game) |
