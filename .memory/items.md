# Items, Equipment & Inventory

> Single source for inventory tabs, equipment slots, ground drops, drag-drop,
> item icons, chairs, weapon types, and character sprite rendering integration.

---

## Inventory

### Tabs & Slots
- 5 tabs: EQUIP, USE, SETUP, ETC, CASH
- `INV_COLS=4`, `INV_ROWS=8` → 32 slots per tab (slot 0–31)
- Tab determined by item ID prefix: `floor(id / 1_000_000)` → 1=EQUIP, 2=USE, 3=SETUP, 4=ETC, 5=CASH
- Helper: `inventoryTypeById(id)`, `findFreeSlot(invType)`

### Data Model (`playerInventory` array)
```js
{ id, name, qty, iconKey, invType, category, slot }
```

### Item Stacking
| Source | slotMax |
|--------|---------|
| Equipment | Always 1 |
| WZ `info.slotMax` | From `_itemWzInfoCache` |
| Default (non-equip) | 100 |

Helpers: `getItemSlotMax(id)`, `isItemStackable(id)`

### Slot Interactions
- **Single click** → start drag (200ms delay prevents double-click conflict)
- **Click empty slot** (drag active) → move item
- **Click occupied slot** (drag active) → swap slots (same tab only)
- **Double-click EQUIP item** → equip via `equipItemFromInventory()`
- **Drag to canvas** → drop on ground via `dropItemOnMap()`

### Drop Quantity Modal
- Stackable items with qty > 1: modal asks how many to drop
- Equipment / qty=1: drops immediately

---

## Equipment

### Slot List (16 types)

| Slot | ID Prefix | WZ Folder | Visible |
|------|-----------|-----------|---------|
| Cap | 100 | Cap | ✅ |
| FaceAcc | 101 | Accessory | ✅ |
| EyeAcc | 102 | Accessory | ✅ |
| Earrings | 103 | Accessory | ✅ |
| Coat | 104 | Coat | ✅ |
| Longcoat | 105 | Longcoat | ✅ (hides Coat+Pants) |
| Pants | 106 | Pants | ✅ |
| Shoes | 107 | Shoes | ✅ |
| Glove | 108 | Glove | ✅ |
| Shield | 109 | Shield | ✅ |
| Cape | 110 | Cape | ✅ |
| Ring | 111 | Ring | ❌ |
| Pendant | 112 | Accessory | ❌ |
| Belt | 113 | Accessory | ❌ |
| Medal | 114 | Accessory | ❌ |
| Weapon | 130–170 | Weapon | ✅ |

Helpers: `equipSlotFromId(id)` → slot type, `equipWzCategoryFromId(id)` → WZ folder

### Data Model (`playerEquipped` Map)
```js
Map<slotType, { id, name, iconKey }>
```

### Equip/Unequip Flow
- **Equip** (double-click inv EQUIP item): move to `playerEquipped`, swap if slot occupied,
  `loadEquipWzData(id)`, clear `characterPlacementTemplateCache`, broadcast `equip_change`
- **Unequip** (double-click equip slot): move to inventory EQUIP tab, delete WZ data, clear cache
- **Drop equipped**: remove from `playerEquipped`, delete WZ data, clear cache, spawn ground drop
- **Cache invalidation**: `characterPlacementTemplateCache.clear()` on any equip change

### Overall (Longcoat) Handling
- `hasOverallEquipped()`: `id / 10000 == 105`
- When equipped, Coat and Pants slots skipped in character rendering

---

## Weapon System

### Weapon Types

| Prefix | Type | Two-Handed | Stance |
|--------|------|------------|--------|
| 130 | 1H Sword | ❌ | stand1/walk1 |
| 131–132 | 1H Axe/Mace | ❌ | stand1/walk1 |
| 133 | Dagger | ❌ | stand1/walk1 |
| 137 | Wand | ❌ | stand1/walk1 |
| 138 | Staff | ✅ | stand2/walk2 |
| 140–142 | 2H Sword/Axe/Mace | ✅ | stand2/walk2 |
| 143–144 | Spear/Polearm | ✅ | stand2/walk2 |
| 145 | Bow | ❌ | from WZ |
| 146 | Crossbow | ✅ | stand2/walk2 |
| 147 | Claw | ❌ | stand1/walk1 |
| 148 | Knuckle | ❌ | stand1/walk1 |
| 149 | Gun | ❌ | from WZ |
| 170 | Cash | ❌ | from WZ |

### Stance Adjustment
`adjustStanceForWeapon()`: stand1→stand2, walk1→walk2 based on WZ `info/stand`/`info/walk` or two-handed prefix set.

### Attack Stances (from WZ `info/attack`)
| Type | Weapons | Stances |
|------|---------|---------|
| 1 | 1H Sword/Axe/Mace/Dagger | stabO1/O2, swingO1/O2/O3 |
| 2 | Spear/Polearm | stabT1, swingP1 |
| 3 | Bow | shoot1 |
| 4 | Crossbow | shoot2 |
| 5 | 2H Sword/Axe/Mace | stabO1/O2, swingT1/T2/T3 |
| 6 | Wand/Staff | swingO1/O2 |
| 7 | Claw | swingO1/O2 |
| 8 | Knuckle | swingO1/O2 |
| 9 | Gun | shot |

### Degenerate Attack
Ranged weapons without ammo use alternate melee stances, 1/10 damage.
`isAttackDegenerate()` checks prone or missing ammo (bow→arrows 206, claw→stars 207, gun→bullets 233).

### Cash Weapons (Prefix 170)
Stances nested under weapon-type groups (e.g. `"30"`=1H Sword). `resolveCashWeaponData()` picks group matching player's actual weapon type.

---

## Cap Type & Hair Visibility

`getCapType()` reads WZ `info/vslot`:

| vslot | Type | Hair Shown |
|-------|------|------------|
| `CpH5` | HEADBAND | All |
| `CpH1H5` | HALFCOVER | belowCap only |
| `CpH1H5AyAs`+ | FULLCOVER | None |
| other | NONE | All |

Climbing: NONE/HEADBAND → `backHair`; HALFCOVER → `backHairBelowCap`; FULLCOVER → none.

---

## Face Accessories (101xxxx)
- Top-level nodes are expression names (not action names)
- `getEquipFrameParts` uses `faceExpression` as stance, frame 0
- Canvas z-layer: `accessoryFace`, anchored to `brow`

---

## Character Sprite Rendering

### Composition Pipeline
Body → head → face → hair → equipment layers, all positioned via anchor chains:
- body.navel → equip.navel, body.neck → head.neck, head.brow → face/hair
- Z-ordered by `zmap.img.xml` layer index
- Cached in `characterPlacementTemplateCache` per `(action, frame, flipped, expression, faceFrame)`
- If any equip sprite still decoding → template NOT cached (prevents blink)

### Equipment in Rendering
```js
for (const [slotType, equipped] of playerEquipped) {
  if (climbing && no climb stance) → skip
  if (hasOverall && (Coat || Pants)) → skip
  if (sitting && Weapon) → skip
  // Face accessories use expression as stance
  getEquipFrameParts(equipData, action, frame, key)
}
```

### Climbing Parity
Weapon hidden, hair uses `backHair`/`backHairBelowCap`, face not drawn, body uses `backBody` z-layer.

---

## Ground Drops

### Drop Object
```js
{ drop_id, id, name, qty, iconKey, category,
  x, y, destY, vy, onGround, opacity, angle, bobPhase,
  spawnTime, pickingUp, pickupStart }
```

### Physics (C++ `Drop` parity)
- Spawn: `vy = -5.0`, gravity `0.14/tick`, terminal `8`, spin `0.2 rad/tick`
- X never changes. Landing: snap to `destY` when `y >= destY` while falling.
- Bob: `5.0 + (cos(phase)-1)*2.5`, phase += 0.025/tick

### States
- **DROPPED**: gravity arc + spin
- **FLOATING**: bob animation, lootable
- **PICKEDUP**: fly toward player, fade over 400ms

### Server Sync
- Player drops item → temp negative `drop_id` → server assigns positive ID → `drop_spawn` broadcast
- Loot: `loot_item { drop_id }` → server validates ownership + capacity → `drop_loot` broadcast
- 5s loot protection for reactor/mob drops. 180s expiry (server sweep, 2s client fade).

### Loot
- Z key, 50px range, must be `onGround`, one per press
- Stackable: fill existing stacks first, then new slots
- Full tab: rejected with system chat message
- Client pre-checks capacity; server also validates via `canFitItem()`

---

## Chair System

### Using
- Double-click SETUP item (3010000–3019999) → `useChair(itemId)`
- Sets `player.chairId`, `action = "sit"`, broadcasts `sit { active, chair_id }`
- Movement/jump/climb → `standUpFromChair()`. Map change resets.

### Rendering
- Sprite from `Item.wz/Install/{prefix}.img.xml` → `effect/0` canvas
- Drawn below character (z=-1), bottom aligned to player feet
- Flips with character facing. Weapon hidden while sitting.
- Cached in `_chairSpriteCache`. Remote players sync via `player_sit` message.

---

## Item Icons

- **Equip**: `Character.wz/{category}/{padded}.img.xml` → `info/icon`
- **Consumable/Etc**: `Item.wz/{folder}/{prefix}.img.xml` → `{id}/info/icon`
- **UOL resolution**: 663 Consume + 37 Etc items use UOL refs (e.g. `../../02040008/info/icon`)
- All cached in `iconDataUriCache` as base64 data URIs

---

## Persistence

- Save: `{ item_id, qty, inv_type, slot, category }` per item
- `{ slot_type, item_id, item_name }` per equip
- Triggers: equip/unequip, loot, drop, portal, level up, swap, 30s timer, beforeunload
- Dual-path: WS `save_state` + REST `/api/character/save`

---

## Starter Items
Red Potion ×30, Orange ×15, White ×5, Blue ×10 (USE), Snail Shell ×8, Blue Snail ×3 (ETC), The Relaxer chair (SETUP).

Default equipment (male): Coat 1040002, Pants 1060002, Shoes 1072001, Weapon 1302000.
Female variants: Coat 1041002, Pants 1061002. Face/hair differ by gender.
