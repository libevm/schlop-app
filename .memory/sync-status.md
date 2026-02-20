# .memory Sync Status

Last synced: 2026-02-20T10:20:00+11:00
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
- `client/web/app.js`: ~11,700 lines
- CI: `bun run ci` ✅ (167 tests across 6 suites)
- `runtime.player.face_id` / `runtime.player.hair_id`: stored character state (not derived from gender)
- FPS counter includes ping display (color-coded, 10s interval)
- Latest commit: `5659977` on `origin/main`

## Key Architecture Decisions

### Server-authoritative model
- Server is source of truth for all game state
- Clients send inputs, not state
- Periodic snapshots at 20 Hz with client-side interpolation (100-200ms buffer)
- Soft-predicted local movement: small error → lerp (100-300ms), large error → snap
- Proximity culling: only relay within same map room

### Session & auth model
- Session ID = random UUID in localStorage (`mapleweb.session`)
- Character name first-come-first-serve, immutable once claimed
- Character creation: Login/Create tabs on first visit (online defaults to Login tab)
- Account claiming: optional password (min 4 chars) via glowing HUD button → bcrypt hashed
- Login: name + password → server returns session_id → client adopts it
- Logout: clears localStorage, warns unclaimed accounts about data loss

### WebSocket protocol
- Auth via `{ type: "auth", session_id: "..." }` (JSON, first message, includes type field)
- 20 Hz position updates (move messages)
- Immediate action events (chat, attack, face, sit, prone, climb, etc.)
- Map enter ACK: client sends leave_map → loads map → sends enter_map → waits for map_state
- Ping/pong heartbeat every 10s, 30s disconnect timeout
- Default character created on first WS auth if none exists

### Remote player rendering (C++ OtherChar parity)
- **Snapshot interpolation**: buffer received positions with timestamps, render 100ms
  "in the past", lerp between bracketing snapshots. Eliminates jitter regardless of ping.
- Constants: `REMOTE_INTERP_DELAY_MS=100`, `REMOTE_SNAPSHOT_MAX=20`
- Teleport detection: >300px between snapshots → instant snap
- Animation fully local: client runs frame timers per remote player
- Per-player equip WZ data storage (separate from local player)
- **Remote attack frame delay**: reads actual WZ delay from body data (not hardcoded)
- **Remote face expressions**: synced via `player_face` message, shown for 2.5s (hit/pain: 500ms), frame 0 only (no cycling to avoid async decode blink), pre-warmed on receipt
- **Render layer from footholds**: `remotePlayerRenderLayer(rp)` computes layer client-side from `findFootholdAtXNearY` at remote player position — no server layer field needed
- **Hit expression sync**: `triggerPlayerHitVisuals` broadcasts `{ type: "face", expression: "hit" }` on trap/mob knockback; skips emote cooldown
- **Per-player look data**: `remoteLookData` Map stores per-player face/hair WZ data; never falls back to local player's data
- **Look-prefixed image cache keys**: remote player part images keyed as `rp:{face_id}:{hair_id}:{action}:{frame}:{part}` to prevent cache collisions between different genders/faces/hairs
- **Server sends gender** in `PlayerLook` (`gender: boolean`, false=male, true=female)
- **Character info modal**: double-click remote player → draggable HUD modal with 80px sprite (async render with retry for hair), name, accomplishments placeholder; X close button in titlebar; per-player image cache keys (`rp:{face_id}:{hair_id}:...`) prevent gender/look collisions

### Server-authoritative item drops
- Server stores drops per map: `RoomManager.mapDrops: Map<mapId, Map<drop_id, MapDrop>>`
- Drop flow: client sends `drop_item` → server assigns `drop_id` → broadcasts `drop_spawn` to ALL
- Loot flow: client sends `loot_item { drop_id }` → server removes → broadcasts `drop_loot` to ALL
- Loot animation flies toward looter's position (local or remote player)
- `map_state` includes `drops[]` for players entering a map
- `MapDrop` fields: drop_id, item_id, name, qty, x, startY, destY, owner_id, iconKey, category
- Offline mode: drops work locally with negative temp IDs

### Cooldowns
- **Chat**: 1s cooldown (`_lastChatSendTime`) — `sendChatMessage` drops if <1s
- **Emote**: 1s cooldown (`_lastEmoteTime`) — face hotkeys ignored if <1s since last

### Duplicate login blocking
- WS 4006 now shows full-screen blocking modal BEFORE map loads
- `connectWebSocketAsync()` returns promise: true on auth success, false on 4006
- Boot sequence: connect WS → if blocked, show overlay + stop → else load map
- Overlay has Retry (reconnects, loads map on success) and Log Out (full wipe)

### Movement keybinds
- WASD removed — only configurable movement keys (default: arrow keys)
- `moveLeft`, `moveRight`, `moveUp`, `moveDown` in `runtime.keybinds`
- `getGameplayKeys()` builds key set dynamically from current keybinds

### Claim account button
- Golden pulsing animation (1.5s cycle, scale 1→1.08)
- Red "!" notification badge with bounce
- Standard 34px icon-only button, aligned with other HUD buttons

### Name reclaiming
- Unclaimed (no password) + offline (no WS) names are reclaimable
- `releaseUnclaimedName(db, name, roomManager)`: checks credentials + getClient
- Claimed names permanently protected; online unclaimed names protected
- `saveCharacterData` is UPDATE-only; `insertCharacterData` for create only
- Integration tests verify online protection + offline reclaim

### Mob authority system (server-synced mobs)
- First player in a map becomes mob authority — runs AI locally, sends at 10Hz
- `RoomManager.mobAuthority: Map<mapId, sessionId>` tracks per-map authority
- `map_state` includes `mob_authority: boolean` flag
- On authority leave: server reassigns + sends `mob_authority { active: true }`
- Authority sends `mob_state { mobs: [...] }` — positions, stances, hp, dead/dying
- Non-authority clients apply received positions, skip local AI/physics
- Non-authority attacks: `applyAttackToMobVisualOnly()` → local damage numbers + sends `mob_damage` to server
- Authority receives `mob_damage` → applies HP, knockback, hit stance, death
- `updateMobCombatStates` guarded: non-authority skips dying/respawn logic
- Mob touch collisions still local (player taking damage from mob contact)
- Traps: no sync needed — static map data, collision is local
- `_isMobAuthority` reset on `loadMap` (reassigned by `map_state`)
- Offline mode: mobs run locally as before (no authority system)

### Drop expiry
- Server sweeps every 5s, removes drops older than 180s, broadcasts `drop_expire`
- Client: 2s fade-out animation on expire; offline fallback timer

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
_lastChatSendTime = 0                      // 1s chat cooldown
_lastEmoteTime = 0                         // 1s emote cooldown
_duplicateLoginBlocked = false             // true if 4006 received
// Tooltip z-index: 99990 | Cursor z-index: 999999 | Ghost item: 999998
// Duplicate login overlay z-index: 200000
```
