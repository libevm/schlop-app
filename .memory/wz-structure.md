# WZ File Structure Reference

> **Purpose:** Instruct AI agents on how to read, navigate, and edit the extracted WZ data files used by this MapleStory web client.  
> **Location:** `resourcesv3/<Name>.wz/`  
> **Format:** All data is pre-extracted from binary `.wz` archives into **Harepacker Classic XML files** (`.img.xml`). The client's `wz-xml-adapter.js` converts these to JSON nodes at fetch time so all consumer code uses the same `$imgdir`/`$$`/`$int`/etc. convention.

---

## 1. Node Convention

Every `.img.xml` file is Harepacker Classic XML. The client's `wz-xml-adapter.js` converts these to JSON nodes at fetch time. All client code navigates the JSON convention described below.

### 1.1 Node Types

| JSON key prefix | Meaning | Value fields |
|---|---|---|
| `$imgdir` | Directory/group node | `$$` array of children |
| `$int` | 32-bit integer property | `value` (string-encoded int) |
| `$short` | 16-bit integer property | `value` |
| `$float` | Float property | `value` (string-encoded float) |
| `$string` | String property | `value` |
| `$vector` | 2D point | `x`, `y` (string-encoded ints) |
| `$canvas` | Image/sprite | `width`, `height`, `basedata` (base64 PNG), `$$` children |
| `$sound` | Audio data | `basedata` (base64 audio) |
| `$uol` | UOL (symlink/reference) | `value` (relative path like `../0/0`) |
| `$null` | Null/marker node | (name only, no value) |

### 1.2 Example Node

```json
{
  "$imgdir": "100000000.img",
  "$$": [
    { "$imgdir": "info", "$$": [
      { "$int": "version", "value": "10" },
      { "$string": "bgm", "value": "Bgm00/FloralLife" },
      { "$int": "town", "value": "1" }
    ]},
    { "$imgdir": "portal", "$$": [ ... ] }
  ]
}
```

### 1.3 How to Read a Property

To find a property by name, iterate the `$$` array and match the value of the type-key (`$int`, `$string`, etc.). The name IS the value of that key:

```js
// Find "town" in info section:
info.$$. find(n => n.$int === "town")   // → { "$int": "town", "value": "1" }
```

### 1.4 How to Edit a Property

Find the node in the `$$` array and change its `value` field. To add a new property, push a new node object into `$$`. To remove, splice it out.

```js
// Change town flag to 0:
node.value = "0";

// Add a new int property:
info.$$.push({ "$int": "fieldLimit", "value": "0" });
```

---

## 2. WZ File Inventory

| WZ Archive | Files | Description |
|---|---|---|
| `Base.wz` | 3 | Draw-order maps (zmap, smap), StandardPDD |
| `Character.wz` | ~7,200 | Body skins, equipment sprites (by slot subfolder) |
| `Effect.wz` | 17 | Visual effects (skills, items, map, pets, summons) |
| `Etc.wz` | 24 | Lookup tables (commodities, quest categories, NPC locations, etc.) |
| `Item.wz` | ~155 | Item definitions by category subfolder |
| `Map.wz` | ~5,600 | Maps, backgrounds, objects, tiles, world maps |
| `Mob.wz` | ~1,570 | Monster sprites and stats |
| `Morph.wz` | 42 | Morph/transformation sprites |
| `Npc.wz` | ~6,960 | NPC sprites and actions |
| `Quest.wz` | 6 | Quest definitions (checks, actions, info, dialogue) |
| `Reactor.wz` | ~420 | Reactor (interactive object) sprites and states |
| `Skill.wz` | 76 | Skill definitions, icons, effects, level data |
| `Sound.wz` | 44 | BGM and SFX (base64-encoded audio blobs) |
| `String.wz` | 20 | Localized name/description strings for all game entities |
| `TamingMob.wz` | 7 | Mount/riding sprites |
| `UI.wz` | 19 | UI element sprites (status bar, login, chat, etc.) |

---

## 3. Base.wz — Draw Order & Body Part Maps

**Path:** `resources/Base.wz/`

| File | Purpose |
|---|---|
| `zmap.img.xml` | **Z-order list** — defines the draw order of all character layers (body, arm, hair, face, cap, weapon, shield, cape, shoes, etc.). Each entry is a `$null` node whose name is a draw layer. Layers at the top draw in front. |
| `smap.img.xml` | **Slot map** — maps each z-layer name to equipment slot codes (e.g., `"Wp"` for weapon, `"Bd"` for body, `"Gl"` for glove). Used to determine which equipment sprite file provides art for each layer. |
| `StandardPDD.img.xml` | **PDD (Physical Defense) lookup tables** by job class and level. |

### Editing Notes
- To change draw order, reorder the `$null` entries in `zmap.img.xml`.
- To change which slot renders at a layer, edit the `$string` value in `smap.img.xml`.

---

## 4. Map.wz — Maps, Backgrounds, Objects, Tiles

**Path:** `resources/Map.wz/`

### 4.1 Directory Structure

```
Map.wz/
├── Back/                    # Background sprite sets (e.g., grassySoil.img.xml)
├── Map/
│   ├── AreaCode.img.xml    # Area code lookups
│   ├── Map0/                # Maps 000000000–000999999
│   ├── Map1/                # Maps 100000000–199999999  (Victoria Island)
│   ├── Map2/                # Maps 200000000–299999999  (Ossyria)
│   ├── Map3/                # Maps 300000000–...
│   ├── Map5/ through Map9/  # Other regions
├── Obj/                     # Map object sprite sets
├── Tile/                    # Tile sprite sets
└── WorldMap/                # World map overlays
```

### 4.2 Map File Structure (`XXXXXXXXX.img.xml`)

Each map is identified by its 9-digit ID (e.g., `100000000` = Henesys).

**Top-level sections:**

| Section | Type | Description |
|---|---|---|
| `info` | `$imgdir` | Map metadata |
| `back` | `$imgdir` | Background layers (indexed `0`, `1`, `2`…) |
| `0`–`7` | `$imgdir` | **Map layers** (each has `info`, `tile`, `obj`) |
| `life` | `$imgdir` | NPCs and monsters spawned on this map |
| `reactor` | `$imgdir` | Reactors placed on this map |
| `foothold` | `$imgdir` | Foothold collision data (grouped → chained → segments) |
| `ladderRope` | `$imgdir` | Ladders and ropes |
| `seat` | `$vector` entries | Sittable positions |
| `portal` | `$imgdir` | Portals (map transitions, spawn points) |
| `miniMap` | `$imgdir` | Minimap image and bounds |
| `ToolTip` | `$imgdir` | Tooltip regions |

#### 4.2.1 `info` Section

```json
{ "$int": "town", "value": "1" },
{ "$string": "bgm", "value": "Bgm00/FloralLife" },
{ "$int": "returnMap", "value": "100000000" },
{ "$float": "mobRate", "value": "1.0" },
{ "$string": "mapMark", "value": "Henesys" },
{ "$int": "forcedReturn", "value": "999999999" },
{ "$int": "fieldLimit", "value": "0" },
{ "$int": "swim", "value": "0" },
{ "$int": "fly", "value": "0" }
```

- `bgm` format: `"BgmXX/TrackName"` — references `Sound.wz/BgmXX.img.xml` → entry named `TrackName`.
- `returnMap` / `forcedReturn`: map IDs for return scroll / forced return.
- `fieldLimit`: bitmask controlling allowed actions (e.g., no teleport, no summoning).

#### 4.2.2 `back` Section — Backgrounds

Each entry defines one background layer:

| Property | Type | Description |
|---|---|---|
| `bS` | string | Background set name (references `Back/<name>.img.xml`) |
| `no` | int | Sprite index within the set |
| `x`, `y` | int | Position offset |
| `rx`, `ry` | int | Parallax range |
| `type` | int | Scroll type (0=normal, 1=htile, 2=vtile, 3=htile+vtile, 4=hscroll, 5=vscroll, 6=hscroll+vscroll, 7=custom) |
| `cx`, `cy` | int | Tiling dimensions (0 = use sprite size) |
| `a` | int | Alpha (0–255) |
| `front` | int | 1 = draw in front of map objects |
| `ani` | int | 1 = animated background |
| `f` | int | 1 = flipped horizontally |

#### 4.2.3 Map Layers (`0`–`7`) — Tiles & Objects

Each layer has:
- `info` → `tS` (tile set name, references `Tile/<tS>.img.xml`)
- `tile` → array of tile placements
- `obj` → array of object placements

**Tile entry:**
```json
{ "$int": "x", "value": "3915" },
{ "$int": "y", "value": "270" },
{ "$string": "u", "value": "bsc" },     // tile category (bsc, edD, enH0, etc.)
{ "$int": "no", "value": "1" },          // sprite index
{ "$int": "zM", "value": "4" }           // z-layer within the layer
```

**Object entry:**
```json
{ "$string": "oS", "value": "acc1" },     // object set (references Obj/<oS>.img.xml)
{ "$string": "l0", "value": "grassySoil" }, // category level 0
{ "$string": "l1", "value": "artificiality" }, // category level 1
{ "$string": "l2", "value": "3" },        // category level 2
{ "$int": "x", "value": "..." },
{ "$int": "y", "value": "..." },
{ "$int": "z", "value": "0" },
{ "$int": "f", "value": "0" },            // flipped
{ "$int": "zM", "value": "..." }
```

Object sprite path: `Obj/<oS>.img.xml` → `<l0>` → `<l1>` → `<l2>` → frame `0`, `1`, etc.

#### 4.2.4 `life` Section — NPCs & Monsters

```json
{
  "$imgdir": "2", "$$": [
    { "$string": "type", "value": "n" },   // "n" = NPC, "m" = monster
    { "$string": "id", "value": "1012000" }, // NPC/mob ID
    { "$int": "x", "value": "149" },
    { "$int": "y", "value": "267" },
    { "$int": "fh", "value": "126" },       // foothold ID
    { "$int": "cy", "value": "274" },       // cy position
    { "$int": "rx0", "value": "99" },       // patrol range left
    { "$int": "rx1", "value": "199" },      // patrol range right
    { "$int": "f", "value": "0" }           // facing (0=right, 1=left) [optional]
  ]
}
```

#### 4.2.5 `foothold` Section

Three-level hierarchy: **group → chain → segment**.

```
foothold/
├── <groupId>/          # layer group
│   ├── <chainId>/      # connected chain
│   │   ├── <fhId>/     # individual foothold segment
│   │   │   ├── x1, y1  # start point
│   │   │   ├── x2, y2  # end point
│   │   │   ├── prev    # previous foothold ID in chain (0 = start)
│   │   │   └── next    # next foothold ID in chain (0 = end)
```

#### 4.2.6 `ladderRope` Section

```json
{ "$int": "l", "value": "1" },    // 1 = ladder, 0 = rope
{ "$int": "uf", "value": "1" },   // usable from above
{ "$int": "x", "value": "5370" },
{ "$int": "y1", "value": "156" }, // top
{ "$int": "y2", "value": "399" }, // bottom
{ "$int": "page", "value": "2" }  // associated layer
```

#### 4.2.7 `portal` Section

```json
{ "$string": "pn", "value": "sp" },   // portal name ("sp" = spawn point)
{ "$int": "pt", "value": "0" },       // portal type (0=spawn, 1=visible, 2=hidden, etc.)
{ "$int": "x", "value": "112" },
{ "$int": "y", "value": "197" },
{ "$int": "tm", "value": "999999999" }, // target map (999999999 = same map)
{ "$string": "tn", "value": "" }       // target portal name
```

Portal types: 0=spawn, 1=visible, 2=hidden, 3=touch-trigger, 7=scripted, etc.

#### 4.2.8 `seat` Section

Simple vector entries:
```json
{ "$vector": "0", "x": "4909", "y": "-120" }
```

---

## 5. Character.wz — Body & Equipment Sprites

**Path:** `resources/Character.wz/`

### 5.1 Directory Structure

```
Character.wz/
├── 0000XXXX.img.xml       # Body skins (skin color variants)
├── 0001XXXX.img.xml       # Head skins
├── Accessory/              # Face accessories, eye accessories, earrings
├── Cap/                    # Hats
├── Cape/                   # Capes
├── Coat/                   # Tops
├── Face/                   # Face expressions
├── Glove/                  # Gloves
├── Hair/                   # Hairstyles
├── Longcoat/               # Overalls
├── Pants/                  # Bottoms
├── PetEquip/               # Pet equipment
├── Ring/                   # Rings
├── Shield/                 # Shields
├── Shoes/                  # Shoes
├── TamingMob/              # Mount equips
├── Weapon/                 # Weapons
├── Afterimage/             # Weapon swing afterimage effects
└── Dragon/                 # Evan dragon sprites
```

### 5.2 ID Ranges

| Range | Slot |
|---|---|
| `0002xxx` | Body skins |
| `0012xxx` | Head skins |
| `0100xxxx` | Hats (Cap) |
| `0101xxxx` | Face Accessory |
| `0102xxxx` | Eye Accessory |
| `0103xxxx` | Earrings |
| `0104xxxx` | Coats |
| `0105xxxx` | Overalls (Longcoat) |
| `0106xxxx` | Pants |
| `0107xxxx` | Shoes |
| `0108xxxx` | Gloves |
| `0109xxxx` | Shields |
| `0110xxxx` | Capes |
| `0112xxxx` | Rings |
| `013xxxxx` | Weapons (by weapon type) |

### 5.3 Equipment File Structure

Each file contains:

1. **`info`** — metadata: `islot` (item slot code), `vslot` (visual slot code), `cash` flag
2. **Action directories** — `walk1`, `stand1`, `alert`, `jump`, `prone`, etc.
   - Each action contains **frame directories** (`0`, `1`, `2`, …)
   - Each frame contains **part canvases** (`body`, `arm`, `hand`, `lHand`, `rHand`, etc.)

**Frame structure:**
```json
{
  "$canvas": "body", "width": 27, "height": 32,
  "basedata": "<base64 PNG>",
  "$$": [
    { "$vector": "origin", "x": "19", "y": "32" },
    { "$imgdir": "map", "$$": [
      { "$vector": "neck", "x": "-4", "y": "-32" },
      { "$vector": "navel", "x": "-6", "y": "-20" }
    ]},
    { "$string": "z", "value": "body" },      // z-layer name (matches zmap)
    { "$string": "group", "value": "skin" }    // recolor group
  ]
}
```

- **`origin`**: the anchor point for positioning.
- **`map`**: named anchor points (`neck`, `navel`, `hand`, `handMove`) used to align parts.
- **`z`**: references `Base.wz/zmap.img.xml` for draw order.
- **`delay`**: frame display duration in ms (in the frame directory, not the canvas).

### 5.4 Editing Tips

- **Change a sprite:** Replace the `basedata` with a new base64-encoded PNG. Update `width`/`height`.
- **Change anchor points:** Edit the `origin` or `map` vectors.
- **Add/remove animation frames:** Add/remove numbered `$imgdir` entries in the action.

---

## 6. Mob.wz — Monster Data

**Path:** `resources/Mob.wz/`

Files: `XXXXXXX.img.xml` (7-digit mob ID, e.g., `0100100` = Snail).

### 6.1 Structure

| Section | Description |
|---|---|
| `info` | Stats: `level`, `maxHP`, `maxMP`, `speed`, `PADamage`, `PDDamage`, `MADamage`, `MDDamage`, `acc`, `eva`, `exp`, `undead`, `bodyAttack`, `pushed`, `fs` (fly speed), `summonType`, `mobType` |
| `stand` | Standing animation frames |
| `move` | Walking animation frames |
| `hit1` | Hit reaction frames |
| `die1` | Death animation frames |
| `attack1`, `attack2` | Attack animation frames |
| `regen` | Regen animation |
| `jump` | Jump animation |

### 6.2 Animation Frame Structure

```json
{
  "$canvas": "0", "width": 37, "height": 26,
  "basedata": "<base64 PNG>",
  "$$": [
    { "$vector": "origin", "x": "18", "y": "26" },
    { "$vector": "lt", "x": "-18", "y": "-26" },  // hit-box top-left
    { "$vector": "rb", "x": "19", "y": "0" },      // hit-box bottom-right
    { "$vector": "head", "x": "-13", "y": "-24" },  // head position (for effects)
    { "$int": "delay", "value": "180" }
  ]
}
```

- `lt`/`rb`: define the collision/hit rectangle.
- `move` section may have `{ "$int": "zigzag", "value": "1" }` for patrol behavior.

### 6.3 QuestCountGroup

`Mob.wz/QuestCountGroup/` — groups mobs for quest kill-count purposes.

---

## 7. Npc.wz — NPC Sprites

**Path:** `resources/Npc.wz/`

Files: `XXXXXXX.img.xml` (7-digit NPC ID).

### Structure

| Section | Description |
|---|---|
| `info` | NPC metadata (e.g., `speak` dialog set references) |
| `stand` | Default standing animation |
| `finger`, `wink`, etc. | Named action animations |

Each action contains numbered frame canvases with `origin`, `delay`, and optionally `lt`/`rb` for clickable area.

---

## 8. Item.wz — Item Definitions

**Path:** `resources/Item.wz/`

### 8.1 Subdirectories

| Dir | Item Type | ID Range |
|---|---|---|
| `Cash/` | Cash shop items | `05xxxxx` |
| `Consume/` | Use items (potions, scrolls) | `02xxxxx` |
| `Etc/` | Etc items (quest items, ores) | `04xxxxx` |
| `Install/` | Setup items (chairs, etc.) | `03xxxxx` |
| `Pet/` | Pets | `05000xx` |
| `Special/` | Special items | — |

### 8.2 File Naming

Files are grouped by prefix: e.g., `0200.img.xml` contains items `02000000`–`02009999`.

### 8.3 Item Entry Structure

```json
{ "$imgdir": "02000000", "$$": [
  { "$imgdir": "info", "$$": [
    { "$canvas": "icon", ... },
    { "$canvas": "iconRaw", ... },
    { "$int": "price", "value": "25" }
  ]},
  { "$imgdir": "spec", "$$": [
    { "$int": "hp", "value": "50" }
  ]}
]}
```

- `info/icon`: inventory icon sprite.
- `info/iconRaw`: raw icon (without background).
- `info/price`: NPC sell price.
- `spec`: item effects (e.g., `hp`, `mp`, `speed`, `attack`, etc.).

---

## 9. Skill.wz — Skill Definitions

**Path:** `resources/Skill.wz/`

Files named by job ID: `000.img.xml` (Beginner), `100.img.xml` (Warrior 1st job), `110.img.xml` (Fighter), etc.

### Structure

```json
{ "$imgdir": "000.img", "$$": [
  { "$imgdir": "info", "$$": [
    { "$canvas": "icon", ... }       // Job icon
  ]},
  { "$imgdir": "skill", "$$": [
    { "$imgdir": "0001003", "$$": [   // Skill ID
      { "$canvas": "icon", ... },
      { "$canvas": "iconMouseOver", ... },
      { "$canvas": "iconDisabled", ... },
      { "$int": "invisible", "value": "1" },
      { "$imgdir": "level", "$$": [
        { "$imgdir": "1", "$$": [ ... ] }   // Level data
      ]},
      { "$imgdir": "effect", "$$": [
        { "$canvas": "0", ... },             // Effect animation frames
      ]}
    ]}
  ]}
]}
```

- Skill ID format: `JJJSSSS` where `JJJ` = job prefix, `SSSS` = skill index.
- `level/<N>`: per-level stats (damage, duration, MP cost, etc.).
- `effect`: skill visual effect animation frames.

---

## 10. Sound.wz — Audio

**Path:** `resources/Sound.wz/`

| File Pattern | Content |
|---|---|
| `Bgm00`–`Bgm21.img.xml` | Background music tracks |
| `BgmEvent`, `BgmGL`, `BgmJp`, etc. | Regional/event BGM |
| `BgmUI.img.xml` | UI music |
| `Game.img.xml` | General game SFX |
| `Mob.img.xml` | Monster SFX |
| `Skill.img.xml` | Skill SFX |
| `Field.img.xml` | Field/ambient SFX |
| `UI.img.xml` | UI SFX |
| `Item.img.xml`, `Weapon.img.xml` | Item/weapon SFX |

### Structure

Each file's `$$` array contains `$sound` entries:
```json
{ "$sound": "FloralLife", "basedata": "<base64 audio>" }
```

**Map BGM reference format:** A map's `info.bgm` value like `"Bgm00/FloralLife"` means: open `Sound.wz/Bgm00.img.xml`, find the `$sound` entry named `"FloralLife"`.

### Editing Notes
- To replace audio, encode the new file as base64 and replace `basedata`.
- Audio format is typically MP3 or OGG encoded.

---

## 11. String.wz — Localization Strings

**Path:** `resources/String.wz/`

These files provide human-readable names and descriptions for all game entities.

| File | Contents |
|---|---|
| `Map.img.xml` | Map names: `streetName`, `mapName`, `mapDesc` — keyed by map ID |
| `Mob.img.xml` | Monster names — keyed by mob ID (without leading zeros) |
| `Npc.img.xml` | NPC names — keyed by NPC ID |
| `Eqp.img.xml` | Equipment names/descriptions — nested by slot category |
| `Consume.img.xml` | Use item names |
| `Etc.img.xml` | Etc item names |
| `Skill.img.xml` | Skill names and descriptions |
| `Cash.img.xml` | Cash item names |
| `Pet.img.xml` | Pet names |
| `Ins.img.xml` | Setup/install item names |

### Example — Map Names

```json
{ "$imgdir": "maple", "$$": [
  { "$imgdir": "0", "$$": [
    { "$string": "streetName", "value": "Maple Road" },
    { "$string": "mapName", "value": "Entrance - Mushroom Town Training Camp" }
  ]},
]}
```

Map IDs are grouped under region keys: `maple` (0–9M), `victoria` (100M), `ossyria` (200M), etc.

### Example — Mob Names

```json
{ "$imgdir": "100100", "$$": [
  { "$string": "name", "value": "Snail" }
]}
```

---

## 12. UI.wz — User Interface Elements

**Path:** `resources/UI.wz/`

| File | Purpose |
|---|---|
| `StatusBar.img.xml` | HP/MP bars, EXP bar, level display, quickslots |
| `UIWindow.img.xml` | Inventory, equipment, stat, skill windows |
| `Basic.img.xml` | Basic UI elements (cursors, scroll bars, buttons) |
| `Login.img.xml` | Login screen UI |
| `ChatBalloon.img.xml` | Chat bubble sprites |
| `NameTag.img.xml` | Player name tag styles |
| `BuffIcon.img.xml` | Buff status icons |
| `CashShop.img.xml` | Cash shop UI |
| `MapLogin.img.xml` | Map-select login screen |

Structure is deeply nested `$imgdir`s containing `$canvas` sprites for each UI component.

---

## 13. Etc.wz — Lookup/Config Tables

**Path:** `resources/Etc.wz/`

Miscellaneous data tables:

| File | Purpose |
|---|---|
| `Commodity.img.xml` | Cash shop commodity listings |
| `MakeCharInfo.img.xml` | Character creation options (starting hair, face, etc.) |
| `NpcLocation.img.xml` | Which NPCs appear on which maps |
| `MapNeighbors.img.xml` | Adjacent map relationships |
| `SetItemInfo.img.xml` | Set bonus definitions |
| `ItemMake.img.xml` | Item crafting recipes |
| `OXQuiz.img.xml` | OX quiz questions |
| `ForbiddenName.img.xml` | Banned character names |
| `Category.img.xml` | Item category hierarchy |

---

## 14. Quest.wz — Quest System

**Path:** `resources/Quest.wz/`

| File | Purpose |
|---|---|
| `QuestInfo.img.xml` | Quest names, descriptions, area codes |
| `Check.img.xml` | Quest start/completion requirements (level, items, mobs killed) |
| `Act.img.xml` | Quest rewards (items, EXP, meso, fame) |
| `Say.img.xml` | Quest NPC dialogue |
| `PQuest.img.xml` | Party quest definitions |
| `Exclusive.img.xml` | Mutually exclusive quest groups |

Quest IDs are the keys within each file.

---

## 15. Reactor.wz — Interactive Map Objects

**Path:** `resources/Reactor.wz/`

Files: `XXXXXXX.img.xml`

### Structure

```json
{ "$imgdir": "info", "$$": [
  { "$string": "info", "value": "description" }
]},
{ "$imgdir": "0", "$$": [           // State 0
  { "$imgdir": "event", "$$": [     // What triggers state change
    { "$imgdir": "0", "$$": [
      { "$int": "type", "value": "0" },    // 0=hit, 3=timeout
      { "$int": "state", "value": "1" }    // next state
    ]}
  ]},
  { "$imgdir": "hit", "$$": [ ... ] },    // Hit animation
  { "$canvas": "0", ... }                  // Idle sprite for this state
]}
```

States are numbered directories. Each state has events that trigger transitions to other states.

---

## 16. Morph.wz & TamingMob.wz

**Morph.wz:** Transformation sprites (e.g., potion transforms). Each file is a morph ID with action animations similar to Character.wz body files.

**TamingMob.wz:** Mount sprites. Structure matches Character.wz action/frame format. Mount IDs correspond to taming mob item IDs.

---

## 17. Effect.wz — Visual Effects

**Path:** `resources/Effect.wz/`

| File | Purpose |
|---|---|
| `BasicEff.img.xml` | General effects (level up, skill get, etc.) |
| `CharacterEff.img.xml` | Character-bound effects |
| `ItemEff.img.xml` | Item use effects |
| `MapEff.img.xml` | Map-specific effects |
| `SkillName*.img.xml` | Skill name display effects |
| `Summon.img.xml` | Summon visual effects |
| `Direction*.img.xml` | Direction/cutscene effects |
| `Tomb.img.xml` | Death/tombstone effect |

Each effect is a named `$imgdir` containing numbered `$canvas` animation frames with `origin` and `delay`.

---

## 18. Common Editing Recipes

### Add an NPC to a Map
1. Open `Map.wz/Map/MapX/XXXXXXXXX.img.xml`
2. Find the `life` section
3. Add a new `$imgdir` entry with a unique index:
```json
{ "$imgdir": "99", "$$": [
  { "$string": "type", "value": "n" },
  { "$string": "id", "value": "NPCID" },
  { "$int": "x", "value": "X" },
  { "$int": "y", "value": "Y" },
  { "$int": "fh", "value": "FHID" },
  { "$int": "cy", "value": "Y" },
  { "$int": "rx0", "value": "X-50" },
  { "$int": "rx1", "value": "X+50" }
]}
```

### Add a Portal to a Map
1. Find the `portal` section
2. Add a new entry:
```json
{ "$imgdir": "99", "$$": [
  { "$string": "pn", "value": "myPortal" },
  { "$int": "pt", "value": "2" },
  { "$int": "x", "value": "X" },
  { "$int": "y", "value": "Y" },
  { "$int": "tm", "value": "TARGET_MAP_ID" },
  { "$string": "tn", "value": "targetPortalName" }
]}
```

### Change Monster Stats
1. Open `Mob.wz/XXXXXXX.img.xml`
2. Find the `info` section
3. Edit the relevant `$int` value (e.g., `maxHP`, `exp`, `level`)

### Change Map BGM
1. Open the map file
2. Find `info` section → `bgm` string
3. Change value to `"BgmXX/TrackName"` format

### Look Up a Name
1. Determine entity type (mob, NPC, map, item, etc.)
2. Open the corresponding `String.wz/<Type>.img.xml`
3. Search for the ID (without leading zeros for mobs/NPCs)

### Replace a Sprite
1. Create a new PNG image with correct dimensions
2. Base64-encode it
3. Replace the `basedata` field in the `$canvas` node
4. Update `width` and `height` if dimensions changed
5. Adjust `origin` vector if anchor point changed

---

## 19. UOL (Universal Object Link) References

Some nodes use `$uol` to reference other nodes within the same file:

```json
{ "$uol": "0", "value": "../0/0" }
```

The `value` is a relative path from the current node. `..` goes up one level. When resolving data, follow the UOL path to find the actual data.

---

## 20. Key Relationships Between WZ Files

```
Map.wz map file
  ├── info.bgm ──────────→ Sound.wz/BgmXX.img.xml
  ├── back[].bS ─────────→ Map.wz/Back/<bS>.img.xml
  ├── layer[].info.tS ───→ Map.wz/Tile/<tS>.img.xml
  ├── layer[].obj[].oS ──→ Map.wz/Obj/<oS>.img.xml
  ├── life[].id (type=n) → Npc.wz/<id>.img.xml + String.wz/Npc.img.xml
  ├── life[].id (type=m) → Mob.wz/<id>.img.xml + String.wz/Mob.img.xml
  └── portal[].tm ───────→ Map.wz/Map/MapX/<tm>.img.xml

Character.wz equipment file
  ├── z values ──────────→ Base.wz/zmap.img.xml (draw order)
  ├── islot/vslot ───────→ Base.wz/smap.img.xml (slot mapping)
  └── map vectors ───────→ Character.wz body file anchors (navel, neck, hand)

String.wz
  └── All name lookups for Map, Mob, Npc, Eqp, Consume, Etc, Skill, etc.
```
