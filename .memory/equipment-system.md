# Equipment System

> Implements the MapleStory equipment window, equip/unequip mechanics, and
> dynamic character sprite rendering. C++ reference: `UIEquipInventory`,
> `Inventory`, `EquipSlot`, `EquipData`, `CharLook`, `Clothing`, `WeaponData`.

## Equipment Slots

### Slot List (`EQUIP_SLOT_LIST`)

| Slot Type  | UI Label  | Item ID Range     | WZ Folder  | Visible Sprite |
|------------|-----------|-------------------|------------|----------------|
| Cap        | Hat       | 100xxxx           | Cap        | ✅ |
| FaceAcc    | Face Acc  | 101xxxx           | Accessory  | ✅ (expression-based) |
| EyeAcc     | Eye Acc   | 102xxxx           | Accessory  | ✅ |
| Earrings   | Earrings  | 103xxxx           | Accessory  | ✅ |
| Pendant    | Pendant   | 112xxxx           | Accessory  | ❌ (stats only) |
| Cape       | Cape      | 110xxxx           | Cape       | ✅ |
| Coat       | Top       | 104xxxx           | Coat       | ✅ |
| Longcoat   | Overall   | 105xxxx           | Longcoat   | ✅ (hides Coat+Pants) |
| Shield     | Shield    | 109xxxx           | Shield     | ✅ |
| Glove      | Gloves    | 108xxxx           | Glove      | ✅ |
| Pants      | Bottom    | 106xxxx           | Pants      | ✅ |
| Shoes      | Shoes     | 107xxxx           | Shoes      | ✅ |
| Weapon     | Weapon    | 130xxxx–170xxxx   | Weapon     | ✅ |
| Ring       | Ring      | 111xxxx           | Ring       | ❌ (stats only) |
| Belt       | Belt      | 113xxxx           | Accessory  | ❌ (stats only) |
| Medal      | Medal     | 114xxxx           | Accessory  | ❌ (stats only) |

### Item ID → Slot Mapping (`equipSlotFromId`)

C++ parity with `EquipData` constructor: `index = id / 10000 - 100`

```js
function equipSlotFromId(id) {
  const p = Math.floor(id / 10000);
  if (p === 100) return "Cap";
  if (p === 101) return "FaceAcc";
  if (p === 102) return "EyeAcc";
  if (p === 103) return "Earrings";
  if (p === 104) return "Coat";
  if (p === 105) return "Longcoat";  // Overall — separate slot, hides Coat+Pants
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p === 111) return "Ring";
  if (p === 112) return "Pendant";
  if (p === 113) return "Belt";
  if (p === 114) return "Medal";
  if (p >= 130 && p <= 170) return "Weapon";
  return null;
}
```

### Item ID → WZ Folder (`equipWzCategoryFromId`)

Maps item ID prefix to `Character.wz` subfolder for loading sprites/icons:

```js
function equipWzCategoryFromId(id) {
  const p = Math.floor(id / 10000);
  if (p === 100) return "Cap";
  if (p >= 101 && p <= 103) return "Accessory"; // Face, Eye, Ear
  if (p === 104) return "Coat";
  if (p === 105) return "Longcoat";
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p === 111) return "Ring";
  if (p >= 112 && p <= 114) return "Accessory"; // Pendant, Belt, Medal
  if (p >= 130 && p <= 170) return "Weapon";
  return null;
}
```

## Weapon Type System (C++ `Weapon::Type`)

### Weapon Types

| Prefix | Type | Two-Handed | Stance |
|--------|------|------------|--------|
| 130 | 1H Sword | ❌ | stand1/walk1 |
| 131 | 1H Axe | ❌ | stand1/walk1 |
| 132 | 1H Mace | ❌ | stand1/walk1 |
| 133 | Dagger | ❌ | stand1/walk1 |
| 137 | Wand | ❌ | stand1/walk1 |
| 138 | Staff | ✅ | stand2/walk2 |
| 140 | 2H Sword | ✅ | stand2/walk2 |
| 141 | 2H Axe | ✅ | stand2/walk2 |
| 142 | 2H Mace | ✅ | stand2/walk2 |
| 143 | Spear | ✅ | stand2/walk2 |
| 144 | Polearm | ✅ | stand2/walk2 |
| 145 | Bow | ❌ | from WZ info |
| 146 | Crossbow | ✅ | stand2/walk2 |
| 147 | Claw | ❌ | stand1/walk1 |
| 148 | Knuckle | ❌ | stand1/walk1 |
| 149 | Gun | ❌ | from WZ info |
| 170 | Cash | ❌ | from WZ info |

### Stance Adjustment (`adjustStanceForWeapon`)

C++ `CharEquips::adjust_stance`: when a weapon is equipped, stand1/walk1 may be
replaced with stand2/walk2 based on:
1. Weapon WZ `info/stand` and `info/walk` values (1 or 2)
2. Fallback: `TWO_HANDED_PREFIXES` set (staff, 2H weapons, crossbow)

Applied in `getCharacterFrameData()` and `getRemoteCharacterFrameData()`.

### `getWeaponStances(weaponId)`

Reads `info/stand` and `info/walk` from the weapon's WZ data. Returns
`{ stand: "stand1"|"stand2", walk: "walk1"|"walk2" }`.

## Overall (Longcoat) Handling

C++ `CharEquips::has_overall`: `id / 10000 == 105`

When an overall is equipped:
- `hasOverallEquipped()` returns true
- Equipment iteration in `getCharacterFrameData` skips Coat and Pants slots
- Same logic in `getRemoteCharacterFrameData` for other players
- Longcoat occupies its own slot (`"Longcoat"`), separate from Coat/Pants

## Cap Type / Hair Visibility (`getCapType`)

C++ `CharEquips::getcaptype` reads `info/vslot` from cap WZ data:

| vslot | Cap Type | Hair Visibility |
|-------|----------|-----------------|
| `CpH5` | HEADBAND | All hair shown |
| `CpH1H5` | HALFCOVER | belowCap hair only |
| `CpH1H5AyAs` (or longer) | FULLCOVER | All hair hidden |
| (other) | NONE | All hair shown |

*Currently parsed but not yet used for hair hiding logic.*

## Face Accessory Rendering

Face accessories (101xxxx) have a unique WZ structure:
- Top-level nodes are expression names (`default`, `blink`, `smile`, etc.)
- Each contains direct canvas children (not numbered frame sub-nodes)
- Canvas z-layer: `accessoryFace`
- Anchored to `brow` vector

Special handling in equipment rendering:
- `getCharacterFrameData`: passes `faceExpression` (not body action) and frame 0
- `getEquipFrameParts`: handles flat canvas children (no frame sub-nodes)
- Falls back to `"default"` expression if specific one missing

C++ draws face accessories at `faceargs` (face-shifted position), frame 0:
```cpp
equips.draw(EquipSlot::Id::FACE, interstance, Clothing::Layer::FACEACC, 0, faceargs);
```

## Data Model

### `playerEquipped` (Map<string, object>)

Keyed by slot type (e.g. `"Coat"`, `"Weapon"`, `"FaceAcc"`). Each value:
```js
{
  id: number,       // item ID (e.g. 1040002)
  name: string,     // display name
  iconKey: string,  // key into iconDataUriCache
}
```

### New Character Defaults (`newCharacterDefaults(gender)`)

Gender-aware starting gear and appearance, computed once at character creation.
The server (`db.ts: buildDefaultCharacterSave`) is the authoritative source;
the client mirrors this for offline mode only.

| Part | Male | Female |
|------|------|--------|
| `face_id` | 20000 | 21000 |
| `hair_id` | 30000 | 31000 |
| Coat | 1040002 | 1041002 |
| Pants | 1060002 | 1061002 |
| Shoes | 1072001 | 1072001 (unisex) |
| Weapon | 1302000 | 1302000 (unisex) |

### `runtime.characterEquipData` (Object)

Keyed by equip item ID → parsed WZ JSON from `Character.wz/{folder}/{padded}.img.json`.
Used by `getEquipFrameParts()` to extract sprite parts for character rendering.

## Equip / Unequip Flow

### Unequip (double-click equipment slot)

```
User double-clicks equipped item
  → clearTimeout on pending single-click drag timer (prevents DragStart sound)
  → unequipItem(slotType)
    → hideTooltip()
    → cancelItemDrag(true)  [silent — no DragEnd sound from cancel]
    → playerEquipped.delete(slotType)
    → playerInventory.push({ ...item, invType: "EQUIP", category: slotType, slot: freeSlot })
    → delete runtime.characterEquipData[item.id]
    → characterPlacementTemplateCache.clear()
    → playUISound("DragEnd")  [single sound only]
    → refreshUIWindows()
```

C++ parity: `UIEquipInventory::doubleclick` → `UnequipItemPacket(slot, freeslot)`

### Equip (double-click inventory EQUIP item)

```
User double-clicks inventory item (EQUIP tab)
  → clearTimeout on pending single-click drag timer (prevents DragStart sound)
  → equipItemFromInventory(invIndex)
    → hideTooltip()
    → cancelItemDrag(true)  [silent]
    → slotType = equipSlotFromId(item.id)
    → if slot occupied: swap existing → inventory (reuses outgoing item's slot index)
    → playerInventory.splice(invIndex, 1)
    → playerEquipped.set(slotType, { id, name, iconKey })
    → loadEquipWzData(item.id)  [async]
    → characterPlacementTemplateCache.clear()
    → playUISound("DragEnd")  [single sound only]
    → refreshUIWindows()
```

C++ parity: `UIItemInventory::doubleclick` (EQUIP tab) → `EquipItemPacket(slot, eqslot)`

### Drop Equipped Item

```
User drags equipped item → clicks canvas
  → dropItemOnMap()
    → groundDrops.push({ ...drop })
    → playerEquipped.delete(slotType)
    → delete runtime.characterEquipData[equipped.id]
    → characterPlacementTemplateCache.clear()
```

## Character Sprite Rendering Integration

### Dynamic Equipment Iteration

`getCharacterFrameData()` iterates `playerEquipped`:

```js
// Adjust stance for weapon (stand1 → stand2 for two-handed)
action = adjustStanceForWeapon(action);

const hasOverall = hasOverallEquipped();
for (const [slotType, equipped] of playerEquipped) {
  if (hidingWeapon && slotType === "Weapon") continue;
  if (hasOverall && (slotType === "Coat" || slotType === "Pants")) continue;
  const equipData = runtime.characterEquipData[equipped.id];
  if (!equipData) continue;
  // Face accessories use expression as stance
  let eqAction = action, eqFrame = frameIndex;
  if (slotType === "FaceAcc") { eqAction = faceExpression; eqFrame = 0; }
  const equipParts = getEquipFrameParts(equipData, eqAction, eqFrame, `equip:${equipped.id}`);
  for (const ep of equipParts) frameParts.push(ep);
}
```

### `getEquipFrameParts` Enhancements

- Handles flat canvas children (face accessories with no numbered frame sub-nodes)
- Falls back to `"default"` → `"stand1"` if action not found
- During climbing, equips without ladder/rope stance are hidden (C++ parity)
- Reads `z` string child for zmap layer ordering

### Remote Player Equipment

`getRemoteCharacterFrameData` applies same logic:
- `adjustStanceForRemoteWeapon(rp, action)` reads weapon from `remoteEquipData`
- Overall detection checks `remoteEquipData` for Longcoat items
- Face accessories use expression as stance

### WZ Data Loading (`loadEquipWzData`)

```js
async function loadEquipWzData(equipId) {
  const category = equipWzCategoryFromId(equipId);
  const padded = String(equipId).padStart(8, "0");
  const path = `/resources/Character.wz/${category}/${padded}.img.json`;
  const data = await fetchJson(path);
  runtime.characterEquipData[equipId] = data;
  characterPlacementTemplateCache.clear();
}
```

### Initial Load (`requestCharacterData`)

On first character data request, fetches face/hair WZ from `runtime.player.face_id` /
`runtime.player.hair_id` (via `playerFacePath()` / `playerHairPath()`), and builds equip
fetch list from current `playerEquipped`:
```js
fetchJson(`/resources/Character.wz/${playerFacePath()}`),
fetchJson(`/resources/Character.wz/${playerHairPath()}`),
const equipEntries = [...playerEquipped.entries()].map(([slotType, eq]) => ({
  id: eq.id,
  category: equipWzCategoryFromId(eq.id) || slotType,
  padded: String(eq.id).padStart(8, "0"),
}));
```

### Placement Cache Invalidation

`characterPlacementTemplateCache` is a Map caching composed character placements per
`(action, frameIndex, flipped, faceExpression, faceFrameIndex)`.

**Must be cleared** (`characterPlacementTemplateCache.clear()`) whenever:
- An item is equipped
- An item is unequipped
- An equipped item is dropped on the map

Without clearing, the character continues rendering the old equipment set.

## Equipment UI

### HTML Structure

```html
<div id="equip-window" class="game-window hidden">
  <div class="game-window-titlebar" data-window="equip">Equipment</div>
  <div id="equip-grid" class="equip-grid"></div>
</div>
```

### Grid Layout

- `equip-grid`: 4-column CSS grid of 36×36px slots
- 16 slots matching `EQUIP_SLOT_LIST`
- Empty slots show label text (e.g. "Hat", "Weapon")
- Filled slots show equip icon with tooltip on hover

### Interactions

- **Hover** → tooltip with name, slot label, item ID
- **Single click** → start drag (ghost icon follows cursor)
- **Double-click** → unequip to inventory EQUIP tab
- **Drag to canvas** → drop on map as ground item

## Equip Icon Loading

`loadEquipIcon(equipId, category)`:
- Fetches `Character.wz/{category}/{padded}.img.json`
- Reads `info/icon` or `info/iconRaw` canvas node
- Stores base64 data URI in `iconDataUriCache` keyed `equip-icon:{id}`
- Returns the cache key immediately (icon loads async)

## Persistence

Equipment is saved/loaded via `buildCharacterSave()` / `applyCharacterSave()`:
- Each equip serialized as `{ slot_type, item_id, item_name }`
- `slot_type` uses new slot names: Cap, FaceAcc, EyeAcc, Earrings, Coat, Longcoat, etc.
- On load, `equipSlotFromId(item_id)` resolves authoritative slot (ignores saved slot_type)
- `loadEquipWzData(id)` called for each equip (async, for character rendering)
- Icons and names async-fetched; `characterPlacementTemplateCache` cleared on equip WZ load
- Save triggers: equip/unequip, loot, drop, portal transition, level up, slot swap, 30s timer, beforeunload
- Online: dual-path — WS `save_state` (immediate DB persist) + REST `POST /api/character/save` (backup)
- Server also persists on WS disconnect, ensuring equipment state survives crashes
- Server tracks `look.equipment` on `WSClient`, updated by both `equip_change` and `save_state`

## Weapon Attack Stances (C++ `CharLook::getattackstance`)

Attack type is read from weapon WZ `info/attack` (`$short`):

| Attack Type | Weapons | Stances | Prone (Degen) |
|-------------|---------|---------|---------------|
| 1 (S1A1M1D) | 1H Sword, Axe, Mace, Dagger | stabO1/O2, swingO1/O2/O3 | — |
| 2 (SPEAR) | Spear, Polearm | stabT1, swingP1 | — |
| 3 (BOW) | Bow | shoot1 | swingT1, swingT3 |
| 4 (CROSSBOW) | Crossbow | shoot2 | swingT1, stabT1 |
| 5 (S2A2M2) | 2H Sword, Axe, Mace | stabO1/O2, swingT1/T2/T3 | — |
| 6 (WAND) | Wand, Staff | swingO1, swingO2 | — |
| 7 (CLAW) | Claw | swingO1, swingO2 | swingT1, stabT1 |
| 8 (KNUCKLE) | Knuckle | swingO1, swingO2 | — |
| 9 (GUN) | Gun | shot | swingP1, stabT2 |

### Helper Functions
- `getWeaponAttackType()`: reads `info/attack` from weapon WZ ($short or $int)
- `getWeaponAttackStances(degenerate)`: returns filtered stance list for current weapon
- `getWeaponSfxKey()`: reads `info/sfx` or falls back to `WEAPON_SFX_BY_PREFIX`

### Weapon Sounds
Read from `Sound.wz/Weapon.img.json > {sfx}/Attack`:
bow, cBow, tGlove, poleArm, spear, gun, knuckle, mace, swordL, swordS

### Degenerate Attack (C++ `Player::prepare_attack`)

Ranged weapons without ammo use alternate melee stances and deal 1/10 damage.

| Weapon | Ammo Required | Ammo ID Prefix |
|--------|--------------|----------------|
| Bow (145) | Arrows | 206xxxx |
| Crossbow (146) | Arrows | 206xxxx |
| Claw (147) | Throwing Stars | 207xxxx |
| Gun (149) | Bullets | 233xxxx |

`isAttackDegenerate()` checks:
1. Prone → always degenerate
2. Bow/Crossbow/Claw/Gun → `!hasProjectileAmmo()` (scans USE inventory for matching prefix)
3. Other weapons → never degenerate

`hasProjectileAmmo()` searches `playerInventory` for USE items with matching `WEAPON_AMMO_PREFIXES[weaponPrefix]`.

When degenerate: stances from `DEGEN_STANCES_BY_TYPE` (melee swings), damage `/= 10`.
Remote players see correct animation since actual stance name is broadcast.

### Preloading
`addCharacterPreloadTasks` includes all attack stances (stand2, walk2, all swingX/stabX/shootX/shot).

### Item Icon UOL Resolution

663 Consume items and 37 Etc items use UOL references for icons (e.g. `../../02040008/info/icon`).
`loadItemIcon()` resolves UOL references via `resolveItemIconUol()` when direct `$canvas` icon is missing.
Navigates the `../../itemId/info/icon` path within the same WZ file to find the target canvas node.

## Known Limitations

- No stat requirements check (C++ `can_wear_equip` validates level/job/stats)
- No gender restrictions
- Cap type parsed (`getCapType`) but not yet used for hair hiding
- No equip tooltips with stat details
- No scroll use (applying scrolls to equipment)
- No equipment swap via drag-drop between equip and inventory windows
- No Cash/Pet/Android tabs in equipment window (C++ has 4 tabs)
