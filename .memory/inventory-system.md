# Inventory System

> Implements the MapleStory item inventory with tabbed categories, slot-based positioning,
> drag-drop with swap, ground drops, and loot. C++ reference: `UIItemInventory`, `Inventory`, `InventoryType`.

## Inventory Types (C++ `InventoryType::by_item_id`)

Item ID prefix (`floor(id / 1000000)`) determines the inventory tab:

| Prefix | Type   | Tab Label | Example IDs           |
|--------|--------|-----------|-----------------------|
| 1      | EQUIP  | Equip     | 1040002 (Coat)        |
| 2      | USE    | Use       | 2000000 (Red Potion)  |
| 3      | SETUP  | Set-up    | 3010000               |
| 4      | ETC    | Etc       | 4000000 (Snail Shell) |
| 5      | CASH   | Cash      | 5000000               |

Helper: `inventoryTypeById(id)` returns `"EQUIP"` / `"USE"` / `"SETUP"` / `"ETC"` / `"CASH"` / `null`.

## Data Model

### `playerInventory` (Array)

Each entry:
```js
{
  id: number,       // item ID
  name: string,     // display name (async loaded from String.wz)
  qty: number,      // stack count (equips always 1)
  iconKey: string,  // key into iconDataUriCache
  invType: string,  // "EQUIP" | "USE" | "SETUP" | "ETC" | "CASH"
  category: string, // equip slot type for EQUIP items (e.g. "Coat"), null otherwise
  slot: number,     // 0-based slot index within this tab (0..31)
}
```

### Tab State

- `currentInvTab` — currently selected tab (`"EQUIP"` | `"USE"` | `"SETUP"` | `"ETC"` | `"CASH"`)
- `INV_TABS` — `["EQUIP", "USE", "SETUP", "ETC", "CASH"]`
- Tab buttons in `#inv-tabs` HTML container

### Slot Layout

- `INV_COLS = 4`, `INV_ROWS = 8` → `INV_MAX_SLOTS = 32` per tab
- Each item has a `slot` field (0..31) determining its grid position
- `findFreeSlot(invType)` scans for first unoccupied slot in a tab
- Grid rendered by `refreshInvGrid()`, builds `slotMap` (slot→item) per tab

## UI Structure

### HTML (`index.html`)

```html
<div id="inventory-window" class="game-window hidden">
  <div class="game-window-titlebar" data-window="inventory">...</div>
  <div id="inv-tabs" class="inv-tabs">
    <button class="inv-tab active" data-tab="EQUIP">Equip</button>
    <button class="inv-tab" data-tab="USE">Use</button>
    <button class="inv-tab" data-tab="SETUP">Set-up</button>
    <button class="inv-tab" data-tab="ETC">Etc</button>
    <button class="inv-tab" data-tab="CASH">Cash</button>
  </div>
  <div id="inv-grid" class="inv-grid"></div>
</div>
```

### CSS (`styles.css`)

- `.inv-tabs` — flex row, background matches window chrome
- `.inv-tab` — compact tab button (9px font, rounded top corners)
- `.inv-tab.active` — lighter background, bottom border hidden (merges with grid)
- `.inv-grid` — 4-column CSS grid of 36×36px slots

## Tab Switching

- Click tab button → sets `currentInvTab`, calls `refreshInvGrid()`
- Active tab button gets `.active` class
- Wired in init via `document.querySelectorAll("#inv-tabs .inv-tab")` click listeners

## Slot Interactions

### Single Click (no drag active) — Start Drag
- Click any item slot → 200ms delayed `startItemDrag(source, index, item)`
  (delay prevents drag from firing on double-click equip/unequip)
- Sets `draggedItem` state, dims source slot to 40% opacity
- Ghost icon follows cursor (bottom-right anchor via CSS transform)
- Click again on same slot or Escape → `cancelItemDrag()`

### Single Click (drag active) — Move / Swap
- Click **empty slot** → moves dragged item to that slot (updates `slot` field)
- Click **occupied slot** → swaps `slot` values between the two items
- Only works within the same tab (cross-tab drag cancels)
- Clicking the item's own slot cancels the drag

### Double-Click — Equip (EQUIP tab only)
- Double-click inventory EQUIP item → `equipItemFromInventory(invIndex)`
- Moves item from inventory to `playerEquipped`
- If equipment slot occupied, existing equip takes the vacated inventory slot
- Loads WZ data, clears character placement cache

### Drop on Map
- Click game canvas while dragging → `dropItemOnMap()`
- Spawns ground drop at player X, finds foothold Y below
- C++ physics: vspeed=-5.0 upward arc, gravity 0.14/tick, spin 0.2rad/tick
- Item X never changes; lands at foothold, switches to floating bob
- Only lootable after landing animation completes

## Item Icon Loading

### Equip Icons
- `loadEquipIcon(equipId, category)` → fetches `Character.wz/{category}/{padded}.img.json`
- Reads `info/icon` or `info/iconRaw` canvas → base64 data URI
- Cached in `iconDataUriCache` keyed `equip-icon:{id}`

### Consumable/Etc Icons
- `loadItemIcon(itemId)` → fetches `Item.wz/Consume/{prefix}.img.json` or `Item.wz/Etc/{prefix}.img.json`
- Reads `{paddedId}/info/icon` canvas
- Cached in `iconDataUriCache` keyed `item-icon:{id}`

### Item Names
- `loadItemName(itemId)` → fetches from `String.wz/Eqp.img.json`, `Consume.img.json`, or `Etc.img.json`
- Async; updates UI on resolve

## Ground Drops

### Drop Object Shape
```js
{
  drop_id,    // server-assigned unique ID (positive), or local temp ID (negative, offline)
  id, name, qty, iconKey, category,
  x,          // world X (fixed at drop position)
  y,          // world Y (animated)
  destY,      // foothold landing Y - 4
  vy,         // vertical velocity (starts at -5.0)
  onGround,   // false=DROPPED, true=FLOATING
  opacity,    // 1.0 normal, fades during pickup
  angle,      // rotation (0.2/tick while airborne, 0 when landed)
  bobPhase,   // cosine phase for floating bob
  spawnTime,  // performance.now() at spawn
  pickingUp,  // true during loot animation
  pickupStart,// timestamp of loot start
}
```

### Server-Authoritative Drop Sync

Drops are synced across all players in the same map via the server.

**Server state**: `RoomManager.mapDrops: Map<mapId, Map<drop_id, MapDrop>>`

**Drop flow**:
1. Player drags item to map → local drop created with temp negative `drop_id`
2. Client sends `drop_item` to server (includes item_id, name, qty, x, destY, iconKey, category)
3. Server creates `MapDrop` with unique positive `drop_id`, stores in `mapDrops`
4. Server broadcasts `drop_spawn` to ALL in room (including dropper)
5. Dropper's handler: matches local temp drop by item_id+position, replaces `drop_id`
6. Other clients: `createDropFromServer()` adds drop with arc animation

**Loot flow**:
1. Player presses Z near a drop → client sends `loot_item` with `drop_id`
2. Server removes drop from `mapDrops`, broadcasts `drop_loot` to ALL
3. Looter's handler: `lootDropLocally()` adds to inventory + pickup animation
4. Other clients: `animateDropPickup()` plays disappear animation

**Map enter**: `map_state` includes `drops[]` — all existing drops appear landed (no animation)

**Drop expiry** (180 seconds):
- Server: `sweepExpiredDrops()` runs every 5s, removes drops older than `DROP_EXPIRE_MS` (180s), broadcasts `drop_expire { drop_id }` to room
- Client: on `drop_expire` message, starts 2s fade-out animation (`expiring=true, expireStart`)
- Offline: client-side timer checks `spawnTime` age when `onGround && !_wsConnected`
- Expiring drops cannot be looted (`drop.expiring` check in `tryLootDrop`)

**Offline mode**: Drops work locally with negative temp IDs, no server interaction.

### Drop States (C++ `Drop::State`)
- **DROPPED** (`onGround=false`): vertical gravity arc, spin, X fixed
- **FLOATING** (`onGround=true`): bob `5.0 + (cos(phase)-1)*2.5`, lootable
- **PICKEDUP** (`pickingUp=true`): fly toward player, fade out over 400ms

### Drop Rendering (`drawGroundDrops`)
- Airborne: rotate around icon center (no visual X drift)
- Landed: bottom-center anchor, icon sits above foothold
- Bob offset applied during FLOATING state

### Loot
- Z key (configurable) → `tryLootDrop()`
- 50px range, player on ground, drop must be `onGround`
- One item per press (C++ `lootenabled` parity)
- Equip items: non-stackable, added with `invType: "EQUIP"`, assigned free slot
- Other items: stack if same ID exists in inventory
- If tab is full (`findFreeSlot` returns -1), pickup is rejected

## Starter Items

```js
// initPlayerInventory()
{ id: 2000000, qty: 30 },  // Red Potion     → USE tab, slot 0
{ id: 2000001, qty: 15 },  // Orange Potion  → USE tab, slot 1
{ id: 2000002, qty: 5  },  // White Potion   → USE tab, slot 2
{ id: 2010000, qty: 10 },  // Blue Potion    → USE tab, slot 3
{ id: 4000000, qty: 8  },  // Snail Shell    → ETC tab, slot 0
{ id: 4000001, qty: 3  },  // Blue Snail Shell → ETC tab, slot 1
```

## Keybinds

- `inventory` — toggle inventory window (default: KeyI)
- `loot` — pick up nearest ground drop (default: KeyZ)

## Persistence

Inventory is saved/loaded via `buildCharacterSave()` / `applyCharacterSave()`:
- Each item serialized as `{ item_id, qty, inv_type, slot, category }`
- On load, icons and names are async-fetched (same as init)
- Save triggers: portal transition, equip/unequip, level up, 30s timer, beforeunload
- localStorage key: `mapleweb.character.v1`

## Item Stacking (slotMax)

Items have a maximum stack size determined by WZ data or category defaults:

| Source         | slotMax                                  |
|----------------|------------------------------------------|
| Equipment      | Always 1 (unique per slot, never stack)  |
| WZ `info.slotMax` | Read from `_itemWzInfoCache[id].info.slotMax` |
| Consume default | 100 (if WZ slotMax absent)              |
| Etc/Setup default | 100 (WZ values: 1, 100, 200, 1000)   |

### Stack-aware loot (`lootDropLocally`)
1. If stackable, scan existing inventory slots for same item ID
2. Add to each existing slot up to `slotMax - currentQty`
3. Remaining qty goes into new slots (each capped at `slotMax`)
4. If tab full, partial pickup succeeds (what fits), rest discarded with log

### Stack-aware drop (quantity modal)
- Equipment items: always drop immediately (qty=1)
- Stackable items with qty > 1: HUD-styled modal asks "How many to drop?"
  - Number input (min 1, max current qty), OK/Cancel, Enter/Escape keys
  - Partial drop → reduces source inventory item qty
  - Full drop → removes item from inventory entirely
- Stackable items with qty=1: drop immediately (no modal)

### WZ info pre-caching
- `initPlayerInventory()` and `applyCharacterSave()` both eagerly call
  `loadItemWzInfo(itemId)` for stackable items to populate `_itemWzInfoCache`
- `lootDropLocally()` also pre-caches on pickup

### Helpers
- `getItemSlotMax(itemId)` — returns max stack from WZ cache or defaults
- `isItemStackable(itemId)` — returns `false` for EQUIP type items

## Known Limitations

- No scroll/pagination within a tab (32 slots all visible)
- No item sorting or gathering (C++ has Sort/Gather buttons)
- No item use (double-click USE items does nothing yet)
- No meso display
- No item tooltips with stat details (only name/qty/ID)
- No cross-tab item dragging
