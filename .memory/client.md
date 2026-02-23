# Client Architecture

> Vanilla JS game client with Canvas 2D rendering, WZ asset pipeline, and 12-module ES module structure.
> Source: `client/web/` (12 JS files, ~15,400 lines).

---

## Module Layout

| Module | Lines | Description |
|--------|-------|-------------|
| `state.js` | 479 | Constants, runtime state object, caches, DOM refs, fn registry |
| `util.js` | 505 | WZ node helpers, asset cache, draw primitives, text wrapping |
| `net.js` | 1,526 | WebSocket, remote players, interpolation, rendering |
| `life.js` | 3,668 | Mobs, NPCs, combat, damage numbers, reactors, map life parsing |
| `physics.js` | 895 | Player physics, footholds, walls, gravity, swimming, camera |
| `render.js` | 1,017 | Map layers (tiles, objects, BGs), character composition, collision |
| `sound.js` | 328 | BGM, SFX, UI sounds, mob sounds, audio pools |
| `character.js` | 1,146 | Character frame building, face animation, equip preload, set effects |
| `input.js` | 436 | Keyboard/mouse input, GM commands, chat, settings, canvas resize |
| `items.js` | 937 | Equipment window, inventory tabs, ground drops, chair, cursor, drag-drop |
| `save.js` | 1,219 | Weapon/item WZ helpers, save/load, create/login flow, inventory UI |
| `app.js` | 3,248 | Entry point: game loop, loadMap, portals, HUD, status bar, boot |

### Entry Point
```html
<script type="module" src="/app.js">  <!-- index.html -->
```
Bun.build bundles for `--prod` mode (12 modules → single minified file, ~0.44 MB).
Browser resolves imports natively in dev mode (no bundler needed).

---

## Dependency DAG (no circular imports)

```
state.js ← (no deps)
util.js ← state
sound.js ← state, util
net.js ← state, util
life.js ← state, util, net
physics.js ← state, util, life
render.js ← state, util, net, life, physics, character
character.js ← state, util, net, life, save
input.js ← state, util, net, sound
items.js ← state, util, net, physics, render, sound
save.js ← state, util, net, sound, items, input
app.js ← ALL modules (entry point)
```

### Circular Dependency Resolution

**Problem**: net.js↔life.js and render.js↔character.js mutual dependencies.

**Solution 1 — `state.js` as shared state host**:
`lifeAnimations`, `lifeRuntimeState`, `reactorRuntimeState` moved from life.js to state.js.
Both net.js and life.js import from state.js.

**Solution 2 — `util.js` as shared function host**:
`splitWordByWidth`, `wrapBubbleTextToWidth` moved from render.js to util.js.
Both render.js and character.js import from util.js.

**Solution 3 — `fn.*` late-binding registry**:
`state.js` exports `const fn = {}`. Modules register functions via
`Object.assign(fn, {...})` during initialization. Other modules call `fn.funcName()`
at runtime (not import-time), avoiding circular deps.

42 functions registered in `fn.*` (see fn.* Registry section below).

---

## Core Systems

### Game Loop (`app.js`)
- `requestAnimationFrame` loop with fixed timestep (60 Hz, `FIXED_STEP_MS = 16.67ms`)
- Max frame delta capped at 250ms, max 6 steps per frame
- Physics runs at `PHYS_TPS = 125 Hz` via separate tick accumulator
- Render phase: clear canvas → draw map layers → draw entities → draw HUD

### Asset Pipeline
- WZ JSON files fetched from `/resourcesv2/` paths
- `cachedFetch(url)` — browser Cache API (`maple-resources-v1`) for persistent caching
- `fetchJson(path)` — deduped JSON loader (promise cache prevents duplicate fetches)
- `requestMeta(key, loader)` — metadata cache with async loader + dedup
- `requestImageByKey(key)` — decodes base64 PNG from WZ basedata → `HTMLImageElement`
- All caches are `Map` objects in `state.js`: `jsonCache`, `metaCache`, `imageCache`, etc.

### WZ Node Navigation (`util.js`)
- `childByName(node, name)` — find child with `$imgdir === name`
- `imgdirChildren(node)` — filter children with `$imgdir` key
- `imgdirLeafRecord(node)` — extract `{key: value}` from typed leaf nodes
- `vectorRecord(node)` — extract `$vector` entries (origin, head, navel, etc.)
- `pickCanvasNode(node, preferredIndex)` — find canvas data in WZ frame
- `canvasMetaFromNode(canvasNode)` — extract basedata, dimensions, origin, opacity, motion
- `resolveNodeByUol(root, basePath, uolValue)` — resolve `../sibling/path` UOL references
  - **basePath must be an array** (uses `[...basePath]` spread)
- `findNodeByPath(root, names)` — traverse WZ tree by path segments

### Map Loading (`app.js`)
`loadMap(mapId)` orchestrates:
1. Increment `mapLoadToken` to cancel stale loads
2. Fetch map JSON from `mapPathFromId(mapId)`
3. Parse footholds, portals, life, backgrounds, tiles, objects, audio
4. Preload visible tile/object images
5. Spawn player at portal or first spawn point
6. Start BGM, reset camera, show map banner
7. Signal `map_loaded` to server

### Character Composition (`character.js` + `render.js`)
Sprite layering follows WZ zmap order:
- Body base → face → hair (below cap) → equipment layers → hair (above cap)
- Each part resolved from WZ: `Character.wz/{type}/{id}.img.json`
- Frame path: `[action, String(frameIndex)]` (array, not string)
- Anchor chain: body.navel → equip.navel, body.neck → head.neck, head.brow → face/hair
- Flip handling: `localPoint()` accounts for horizontal flip in anchor math

### Physics (`physics.js`)
- Gravity: `PHYS_GRAVFORCE = 0.14` per tick at 125 TPS
- Foothold-based collision: segments with prev/next chain
- Wall detection prevents horizontal pass-through
- Swimming: reduced gravity, water friction, swim force
- Climbing: rope/ladder attach/detach with cooldown
- Fall damage: >500px fall → 10% max HP

### Rendering Pipeline (`render.js`)
Draw order (back to front):
1. Backgrounds (tiled/parallax)
2. Tile layers (grouped by layer index)
3. Object layers (animated)
4. Life (mobs, NPCs) by foothold layer
5. Player character + remote players
6. Portals
7. Reactors
8. Ground drops
9. HUD (status bars, minimap, chat, map banner)

### Multiplayer (`net.js`)
- WebSocket to game server (auth → map sync → real-time state)
- Remote players: snapshot interpolation with 100ms delay buffer
- `REMOTE_SNAPSHOT_MAX = 20` buffered positions per player
- Teleport detection: >300px gap → instant snap
- Local animation: client runs frame timers per remote player
- Per-player equip data fetched independently

### Sound (`sound.js`)
- BGM: single `Audio` element with 800ms crossfade
- SFX: pooled `Audio` elements (8 per sound), base64 data URIs from WZ
- Sound paths: `soundPathFromName("Mob/0100100")` → `/resourcesv2/Sound.wz/Mob.img.json`

### Items & Inventory (`items.js` + `save.js`)
- 5 tabs: EQUIP, USE, SETUP, ETC, CASH (4×8 grid = 32 slots per tab)
- Equipment window: 16 slot types (Cap, Coat, Pants, Shoes, Weapon, etc.)
- Drag-drop between inventory ↔ equipment ↔ ground
- Ground drops: physics-based spawn arc, bob animation, 180s expiry
- Icons loaded from `Item.wz/` or `Character.wz/` info nodes

### Input (`input.js`)
- Configurable keybinds stored in `localStorage`
- GM commands: `/mousefly`, `/overlay`, `/help`
- Chat: Enter to toggle, sent history with arrow recall
- Mobile: auto-detected touch overlay (D-pad + A/B buttons)

---

## Runtime State (`state.js`)

### `runtime` Object (main game state)
```javascript
runtime.map          // current map WZ data
runtime.mapId        // current map ID string
runtime.camera       // { x, y } world coordinates
runtime.player       // { x, y, vx, vy, action, facing, stats, equipment, ... }
runtime.input        // { left, right, up, down, jumpHeld, ctrlHeld, ... }
runtime.chat         // { inputActive, history, sentHistory, ... }
runtime.settings     // { bgmEnabled, sfxEnabled, fixedRes, minimapVisible, showPing }
runtime.keybinds     // configurable key mappings
runtime.transition   // { alpha, active } for fade transitions
runtime.loading      // { active, total, loaded, progress, label }
runtime.perf         // frame timing, draw call counts, sample buffer
runtime.npcDialogue  // NPC interaction state
```

### Caches (all `Map` objects)
- `jsonCache` — fetched WZ JSON files
- `metaCache` — processed sprite metadata (basedata, dimensions, origin, z, opacity)
- `imageCache` — decoded `HTMLImageElement` objects
- `metaPromiseCache` / `imagePromiseCache` — in-flight dedup promises
- `lifeAnimations` — mob/NPC animation data (stances, name)
- `lifeRuntimeState` — per-mob/NPC runtime state (position, action, HP, etc.)
- `objectAnimStates` — per-object animation frame counters
- `characterPlacementTemplateCache` — pre-computed character sprite layouts
- `_chairSpriteCache` — chair item sprite data

### Mutable Primitives (with setter functions)
- `sessionId` / `setSessionId(v)` — current session token
- `currentInvTab` / `setCurrentInvTab(v)` — active inventory tab
- `_localDropIdCounter` / `setLocalDropIdCounter(v)` — local drop ID sequence
- Net module: 16 mutable vars with setter functions (wsConnected, onlinePlayers, etc.)

---

## fn.* Registry (42 functions)

Functions registered in `app.js` via `Object.assign(fn, {...})` during initialization.
Called as `fn.funcName()` from other modules to avoid circular imports.

### By Consumer Module

**net.js needs (28):** addSystemChatMessage, appendChatLogMessage, adjustStanceForRemoteWeapon,
animateDropPickup, createDropFromServer, lootDropLocally, drawSetEffect, findActiveSetEffect,
equipSlotFromId, equipWzCategoryFromId, getCharacterActionFrames, getEquipFrameParts,
getFaceExpressionFrames, getFaceFrameMeta, getHairFrameParts, getHeadFrameMeta,
handleServerMapChange, showDuplicateLoginOverlay, loadChairSprite, mergeMapAnchors,
pickAnchorName, zOrderForPart, playMobSfx, playUISound, requestCharacterPartImage,
spawnDamageNumber, syncServerReactors, wrapBubbleTextToWidth

**life.js needs (11):** findFootholdAtXNearY, findFootholdBelow, loadMap, normalizedRect,
playSfx, playSfxWithFallback, requestServerMapChange, saveCharacter, appendChatLogMessage,
getCharacterActionFrames, playMobSfx

**physics.js needs (5):** adjustStanceForWeapon, getCharacterActionFrames,
getCharacterFrameData, standUpFromChair, triggerPlayerHitVisuals

**render.js needs (3):** drawSetEffect, findActiveSetEffect, requestCharacterPartImage

**character.js needs (7):** adjustStanceForWeapon, buildZMapOrder, getCapType,
hasOverallEquipped, loadPortalMeta, portalFrameCount, portalMetaKey

**input.js needs (2):** setCursorState, loadMap

**items.js needs (18):** addSystemChatMessage, bringWindowToFront, buildKeybindsUI,
cancelItemDrag, equipSlotFromId, equipWzCategoryFromId, findFreeSlot, getIconDataUri,
getItemSlotMax, hideTooltip, inventoryTypeById, isItemStackable, loadEquipIcon,
loadItemIcon, loadItemName, loadItemWzInfo, refreshUIWindows, saveCharacter

---

## Dev Server (`tools/dev/serve-client-online.mjs`)

### Dev Mode (default)
- Static file serving from `client/web/`
- API proxy: `/api/*` → game server (default `http://127.0.0.1:5200`)
- WebSocket proxy: `/ws` → game server
- **Hot-reload**: file watcher + `/__hmr` WebSocket
  - 80ms debounce on file changes
  - CSS changes: hot-swapped via stylesheet cache-bust (no page reload)
  - JS/HTML changes: full page reload
  - HMR script auto-injected into HTML `</body>`
- Tailwind CSS watcher spawned automatically (no `--minify` in dev)
- JS/CSS served with `no-cache` headers
- Injects `window.__MAPLE_ONLINE__`, `window.__MAPLE_SERVER_URL__`, `window.__BUILD_GIT_HASH__`

### Prod Mode (`--prod`)
- JS minification via `Bun.build` (tree-shaken ESM)
- Gzip pre-compression of all assets at startup
- Served from memory with `Content-Encoding: gzip`
- ETag-based conditional responses (304 Not Modified)
- Security headers: X-Content-Type-Options, X-Frame-Options, COOP, Referrer-Policy
- Cache-control: HTML=no-cache, JS/CSS=1h, game resources=7d immutable
- Path traversal protection, method allowlist

### Env Vars
- `CLIENT_WEB_HOST` (default `127.0.0.1`)
- `CLIENT_WEB_PORT` (default `5173`)
- `GAME_SERVER_URL` (default `http://127.0.0.1:5200`)
- `ALLOWED_ORIGIN` (default `""` — reflects request origin)
- `PROXY_TIMEOUT_MS` (default `10000`)

---

## Boot Sequence (`app.js`)

1. Load settings from localStorage
2. Solve PoW challenge → get session_id (or use cached)
3. Check `/api/character/claimed` → show login/create UI if needed
4. Load character data from server
5. Connect WebSocket (auth with session_id)
6. Server sends `change_map` → client loads map
7. Client sends `map_loaded` → server sends `map_state` (players, drops, reactors)
8. Game loop starts (requestAnimationFrame)

### Error Recovery
- PoW fetch failure → "Server is not reachable" + Retry button (no uncaught errors)
- WS 4006 (duplicate login) → full-screen blocking overlay with Retry/Logout
- Map load failure → error overlay with details

---

## Critical Implementation Notes

### util.js Must Match Monolith Verbatim
Phase 1 extraction created wrong function implementations. All util.js functions
must be verbatim copies from the original monolithic app.js. Key differences that
caused rendering failures:
- `drawWorldImage`/`drawScreenImage` — flip logic
- `canvasMetaFromNode` — missing opacity/motion fields
- `resolveNodeByUol` — completely different algorithm
- `applyObjectMetaExtras` — must create new object, not mutate cached meta
- `localPoint`/`topLeftFromAnchor` — different anchor math
- `fetchJson`/`requestMeta` — different caching/dedup logic

### `resolveNodeByUol` basePath Contract
`basePath` must be an **array** (uses `[...basePath]` spread).
All `framePath` vars must use array syntax: `[action, String(frameIndex)]`.
String basePath spreads individual characters → wrong resolution.

### Asset Paths Must Use `/resourcesv2/`
`mapPathFromId()` and `soundPathFromName()` must reference `/resourcesv2/`,
not `/resources/`. The V2 directory contains the processed WZ data.

### Sound Path Extension
`soundPathFromName("Mob/0100100")` must produce `/resourcesv2/Sound.wz/Mob.img.json`.
The function handles the `.img` suffix — don't double it.
