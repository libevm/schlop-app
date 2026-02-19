# .memory Sync Status

Last synced: 2026-02-19T07:57:00+11:00
Status: ✅ Synced

## Current authoritative memory files
- `.memory/game-design.md`
- `.memory/cpp-port-architecture-snapshot.md`
- `.memory/half-web-port-architecture-snapshot.md`
- `.memory/cpp-vs-half-web-port-gap-snapshot.md`
- `.memory/tech-stack.md`
- `.memory/implementation-plan.md`
- `.memory/canvas-rendering.md`
- `.memory/rendering-optimization-plan-2026-02-19.md`
- `.memory/physics.md`
- `.memory/physics-units.md`

## Codebase Metrics Snapshot
- `client/web/app.js`: **9710 lines** (single-file debug web client)
- Latest git: `8468d99` on `origin/main`
- CI: `bun run ci` ✅

## What was synced in this pass

### Item selection, drag-drop, ground drops, and loot system (62f5180 → 8468d99)

**Item Selection & Drag:**
- Click any item in Equipment or Inventory to pick it up
- `draggedItem` state object tracks: active, source ("inventory"|"equip"), sourceIndex, id, name, qty, iconKey, category
- Ghost item icon (`<img id="ghost-item">`) follows cursor at 60% opacity, z-index 99998
- Source slot dims to 40% opacity while item is dragged
- DragStart/DragEnd sounds from `Sound.wz/UI.img.json`
- Escape cancels drag, map change cancels drag

**Drop on Map (C++ parity):**
- Click game canvas while dragging → spawns ground drop at player position
- C++ `Drop` physics: `hspeed = (dest.x - start.x) / 48`, `vspeed = -5.0`
- Destination X: randomized 30-60px in facing direction
- Destination Y: found from foothold below destX via `findFootholdAtXNearY` / `findFootholdBelow`
- Per-tick gravity (0.14) + terminal velocity (8), foothold crossing detection
- Spin while airborne (0.2 rad/tick, C++ SPINSTEP)
- On landing: snap to dest position, switch to FLOATING state
- FLOATING: cosine bob animation (2.5px amplitude, 0.025 phase/tick)
- No text label on dropped items
- DropItem sound from `Sound.wz/Game.img.json`

**Loot System:**
- Z key (configurable "loot" keybind) picks up nearest ground drop
- 50px pickup range, player must be on ground
- Pickup animation: item flies toward player and fades out (400ms)
- Item returns to inventory (stacks if same ID exists)
- PickUpItem sound from `Sound.wz/Game.img.json`
- One item per loot press (C++ `lootenabled` parity)

**New Sounds Preloaded:**
- UI: DragStart, DragEnd
- Game: PickUpItem, DropItem

**New Keybind:**
- `loot` (default: KeyZ) added to configurable keybinds with label "Loot"

### Ladder/rope bottom-exit platform snap (d97eeb4)
- When climbing down to bottom of ladder/rope and pressing down, player now checks for
  foothold within 24px of rope bottom and snaps onto it
- Mirrors existing top-exit logic (atTop && wantsUp → findFootholdAtXNearY → snap)
- Previously player would stay clamped at bottom or detach and freefall

### Drop physics C++ parity fix (07dc66c → 8468d99)
- hspeed = (dest.x - start.x) / 48 (was fixed dir*2.0)
- Gravity per tick 0.14 matching game physics engine
- Foothold crossing detection (prevY ≤ fh.y && newY ≥ fh.y)
- Fixed-tick sub-stepping for stable simulation
- Removed item name text labels from ground drops

## Key Data Structures Added

```js
// Item drag state
const draggedItem = { active, source, sourceIndex, id, name, qty, iconKey, category };

// Ground drops array
const groundDrops = []; // { id, name, qty, iconKey, x, y, destX, destY, vx, vy, onGround, opacity, angle, bobPhase, spawnTime, pickingUp, pickupStart, category }

// Drop physics constants
DROP_PICKUP_RANGE = 50
DROP_BOB_SPEED = 0.025
DROP_BOB_AMP = 2.5
DROP_SPAWN_VSPEED = -5.0
DROP_PHYS_GRAVITY = 0.14
DROP_PHYS_TERMINAL_VY = 8
LOOT_ANIM_DURATION = 400

// Ghost item HTML element
_ghostItemEl: <img id="ghost-item"> at position:fixed, z-index:99998, pointer-events:none
```

## Key Functions Added
- `startItemDrag(source, index, item)` — begin dragging an item
- `cancelItemDrag()` — cancel current drag
- `dropItemOnMap()` — drop dragged item as ground drop at player position
- `updateGroundDrops(dt)` — physics simulation for all ground drops
- `drawGroundDrops()` — render ground drops to canvas
- `tryLootDrop()` — attempt to pick up nearest ground drop

## Render Pipeline Update
- `updateGroundDrops(dt)` called in `update()` after `updateBackgroundAnimations`
- `drawGroundDrops()` called in `render()` after `drawBackgroundLayer(1)`, before `drawVRBoundsOverflowMask`
- `_imgCacheByUri` Map caches Image objects for drop icon data URIs
- Ghost item element updated in `updateCursorElement()` alongside WZ cursor

## Previous sync content preserved
(All previous sync entries from the prior sync-status.md remain valid and are not repeated here for brevity. Key systems: wall collision, prone hitbox, hit visuals, opacity animations, laser cooldown, trap collision, fall damage, mob knockback, background rendering, rope/ladder, fixed resolution 1024×768, UI windows, WZ cursor, NPC dialogue, face keybinds, attack lag fix, portal foothold snap, etc.)
