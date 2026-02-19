# .memory Sync Status

Last synced: 2026-02-20T10:00:00+11:00
Status: ✅ Synced

## Current authoritative memory files

| File | Purpose |
|------|---------|
| `canvas-rendering.md` | Full canvas rendering pipeline: asset loading, caching, draw order, coordinates, transitions, diagnostics |
| `physics.md` | Physics system: player/mob movement, footholds, gravity, swimming, climbing, AI |
| `physics-units.md` | Physics constant units and tick-rate conversion reference |
| `inventory-system.md` | Inventory tabs, slot layout, drag-drop, ground drops, loot, item icons |
| `equipment-system.md` | Equipment window, equip/unequip flow, dynamic character sprite rendering |
| `client-server.md` | **All character state for server persistence**: identity, stats, location, equipment, inventory, keybinds, settings, achievements — with TypeScript schema and defaults |
| `game-design.md` | High-level game design notes and feature goals |
| `tech-stack.md` | Technology choices, tooling, build system |
| `implementation-plan.md` | Detailed implementation plan and task breakdown |
| `cpp-port-architecture-snapshot.md` | C++ reference client architecture snapshot (read-only reference) |

## Codebase Metrics Snapshot
- `client/web/app.js`: ~10400 lines (single-file debug web client)
- Latest git: `33d3a04` on `origin/main`
- CI: `bun run ci` ✅

## Recent Changes (this sync pass)

### Client-server state doc (2026-02-20, new)
- Created `.memory/client-server.md` with all 8 character state groups
- TypeScript `CharacterSave` interface with full schema
- Persistence status table: keybinds + settings in localStorage, everything else not yet persisted
- C++ reference mapping (StatsEntry, LookEntry, Inventory, MapleStat)
- Default values documented for all fields

### Persistent browser Cache API (2026-02-20, 6628fa3)
- `cachedFetch()` wraps all resource fetches with Cache API (`maple-resources-v1`)
- `fetchJson()` and `preloadLoadingScreenAssets()` use `cachedFetch()`

### Mob name only after attack (2026-02-20, 51c476b)
- `nameVisible` flag on mob state, set `true` on any attack

### Player position init after map load (2026-02-20, f8ea031)
- Spawn portal, player position, camera init moved after `preloadMapAssets()`

### Loading screen overhaul (2026-02-20, 7e6aa68→39ec405)
- Animated Orange Mushroom from `resourcesv2/mob/orange-mushroom/`
- Login BGM from `resourcesv2/sound/login.mp3` (mono, 48kbps, 2.2MB)
- Modern flat style: pill bar, system font, spinner fallback
- Verbose status + percentage label

### HUD improvements (2026-02-20, f6aed48→abf587b)
- Button tooltips on hover, hidden during loading
- UI toggles (E/I/K) work when mouse over game windows
- Sound debounce (100ms per sound name)
- Keyboard Mappings keybind (K)

### Previous sync entries
(All entries from prior syncs remain valid — see git log for full history)

## Key Data Structures

```js
_winZCounter = 25                          // increments per bringWindowToFront()
playerInventory[i].slot                    // 0-31, position within tab grid
lifeRuntimeState[i].nameVisible            // false until attacked
RESOURCE_CACHE_NAME = "maple-resources-v1" // Cache API key
SETTINGS_CACHE_KEY = "mapleweb.settings.v1"
KEYBINDS_STORAGE_KEY = "mapleweb.keybinds.v1"
// Tooltip z-index: 99990 | Cursor z-index: 99999
```
