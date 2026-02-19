# .memory Sync Status

Last synced: 2026-02-20T12:30:00+11:00
Status: ✅ Synced

## Current authoritative memory files

| File | Purpose |
|------|---------|
| `canvas-rendering.md` | Full canvas rendering pipeline: asset loading, caching, draw order, coordinates, transitions, diagnostics |
| `physics.md` | Physics system: player/mob movement, footholds, gravity, swimming, climbing, AI |
| `physics-units.md` | Physics constant units and tick-rate conversion reference |
| `inventory-system.md` | Inventory tabs, slot layout, drag-drop, ground drops, loot, item icons |
| `equipment-system.md` | Equipment window, equip/unequip flow, dynamic character sprite rendering |
| `client-server.md` | Client-server architecture: session/auth model, character state schema, WebSocket overview, V2 map set, resource pipeline |
| `shared-schema.md` | **Wire protocol source of truth**: all REST and WebSocket message types, fields, examples, room model, C++ parity notes |
| `implementation-plan.md` | **5-phase implementation plan** with step-by-step instructions, code snippets, file paths, test procedures |
| `game-design.md` | High-level game design notes and feature goals |
| `tech-stack.md` | Technology choices (partially stale — actual stack is vanilla JS + raw Bun.serve) |
| `cpp-port-architecture-snapshot.md` | C++ reference client architecture snapshot (read-only reference) |

## Codebase Metrics
- `client/web/app.js`: ~10,400 lines (will be split into modules in Phase 4)
- CI: `bun run ci` ✅

## Key Architecture Decisions

### Server-authoritative model
- Server is source of truth for all game state
- Clients send inputs, not state
- Periodic snapshots at 20 Hz with client-side interpolation (100-200ms buffer)
- Soft-predicted local movement: small error → lerp (100-300ms), large error → snap
- Proximity culling: only relay within same map room

### Session model
- Session ID = random UUID in localStorage (`mapleweb.session`)
- Character name first-come-first-serve, immutable once claimed
- Character creation: name + gender picker on first login (after resources loaded)
- Auth optional (Phase 2): passphrase recovery, no email/OAuth

### WebSocket protocol
- Auth via `{ type: "auth", session_id: "..." }` (JSON, first message, includes type field)
- 20 Hz position updates (move messages)
- Immediate action events (chat, attack, face, sit, prone, climb, etc.)
- Map enter ACK: client sends leave_map → loads map → sends enter_map → waits for map_state
- Ping/pong heartbeat every 10s, 30s disconnect timeout
- Default character created on first WS auth if none exists

### Remote player rendering (C++ OtherChar parity)
- Movement queue with timer-based consumption (not instant apply)
- Position: delta per tick (target - current), not direct lerp
- Animation fully local: client runs frame timers per remote player
- Per-player equip WZ data storage (separate from local player)

### File organization
- Split `app.js` into modules before Phase 4: `net.js`, `save.js`, `ui-character-create.js`
- Server and static file server remain separate (`server/` vs `tools/dev/serve-client-*.mjs`)
- Character API is a separate middleware layer in server

### Persistence split
- Server-persisted (6 groups): identity, stats, location, equipment, inventory, achievements
- Client-only localStorage (2 groups): keybinds, settings
- Spawn portal stored as portal name (not index), resolved by `findClosestSpawnPortal(x, y)`

### V2 map set
- 21 maps: Henesys + Shumi JQs (9) + John JQs (6) + Forest of Patience (2) + Breath of Lava (2)
- Sound.wz: filtered per-track extraction (not whole-file copy)
- Default spawn: `100000001` (Henesys Townstreet)

## Key Data Structures

```js
_winZCounter = 25                          // increments per bringWindowToFront()
playerInventory[i].slot                    // 0-31, position within tab grid
lifeRuntimeState[i].nameVisible            // false until attacked
RESOURCE_CACHE_NAME = "maple-resources-v1" // Cache API key
SESSION_KEY = "mapleweb.session"
CHARACTER_SAVE_KEY = "mapleweb.character.v1"
SETTINGS_CACHE_KEY = "mapleweb.settings.v1"
KEYBINDS_STORAGE_KEY = "mapleweb.keybinds.v1"
// Tooltip z-index: 99990 | Cursor z-index: 99999
```
