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
- WZ XML files fetched from `/resourcesv3/` paths
- `cachedFetch(url)` — browser Cache API (`maple-resources-v3`) for persistent caching
- `fetchJson(path)` — deduped loader (XML → JSON via wz-xml-adapter, promise cache prevents duplicate fetches)
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
- Each part resolved from WZ: `Character.wz/{type}/{id}.img.xml`
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
- Sound paths: `soundPathFromName("Mob/0100100")` → `/resourcesv3/Sound.wz/Mob.img.xml`

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
- Static public assets from `client/public/` at `/public/*` (login BGM, loading screen sprites)
- WZ game resources from `resourcesv3/` at `/resourcesv3/*` (XML, 7d immutable cache)
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

### Asset Paths Must Use `/resourcesv3/`
`mapPathFromId()` and `soundPathFromName()` must reference `/resourcesv3/`,
not `/resourcesv2/`. The `resourcesv3/` directory contains the processed WZ data in XML format.

### Sound Path Extension
`soundPathFromName("Mob/0100100")` must produce `/resourcesv3/Sound.wz/Mob.img.xml`.
The function handles the `.img` suffix — don't double it.


---

# Canvas Rendering Pipeline

> All rendering is 2D canvas (`ctx`). Canvas context: `alpha: false, desynchronized: true`, `imageSmoothingEnabled = false`.

## Game Loop

- Fixed-step simulation at 60Hz (`FIXED_STEP_MS = 1000/60`)
- Accumulator-driven frame pacing (effective ~60 FPS cap)
- Frame delta clamp: 250ms. Catch-up cap: 6 steps/frame
- Physics at `PHYS_TPS = 125 Hz` via separate tick accumulator
- `tick` wrapped in try/catch → errors logged to `rlog()`, RAF continues

## Render Order

```
1. Clear canvas (black)
2. Loading screen (if loading.active) → return
3. Backgrounds (back, front=0)
4. Per-layer interleaved: tiles/objects → life sprites → character (at player layer)
5. Reactors
6. Damage numbers
7. Debug overlays (ropes, footholds, tiles, life markers, hitboxes)
8. Front backgrounds (front=1)
9. Ground drops
10. VR bounds overflow mask
11. Chat bubbles, player name labels (local + remote)
12. Status bar, map banner, minimap, NPC dialogue
13. Transition overlay (fade in/out)
```

Player render layer: climbing/airborne → layer 7, grounded → `player.footholdLayer`.

## Coordinate Systems

- **World**: map positions (px). **Screen**: canvas positions, (0,0) top-left.
- `worldToScreen(wx, wy)` → `{ x: wx - cam.x + w/2, y: wy - cam.y + h/2 }`
- `BG_REFERENCE_HEIGHT = 600` — reference for camera Y bias on tall viewports
- `cameraHeightBias()` = `max(0, (canvasH - 600) / 2)` — compensates tall viewports

## Drawing Primitives

- `drawWorldImage(image, worldX, worldY, opts)` / `drawScreenImage(image, x, y, flipped)`
- Integer-rounded coords for pixel-perfect rendering
- Flip via `ctx.translate + ctx.scale(-1, 1)`

## Asset Pipeline

### Persistent Browser Cache
`cachedFetch(url)` → Cache API (`maple-resources-v3`). XML files parsed with DOMParser and converted to JSON nodes via wz-xml-adapter.js.

### Three-Layer In-Memory Cache
| Cache | Type | Content |
|-------|------|---------|
| `jsonCache` | `Map<path, Promise<JSON>>` | Parsed WZ trees (XML→JSON at fetch, shared refs — never mutate!) |
| `metaCache` | `Map<key, meta>` | Image metadata (basedata, dimensions, origin, z, opacity) |
| `imageCache` | `Map<key, HTMLImageElement>` | Decoded ready-to-draw images |

+ `metaPromiseCache` / `imagePromiseCache` for deduplication.

### Loading Flow
`fetchJson(path)` → `requestMeta(key, loaderFn)` → `requestImageByKey(key)` → `getImageByKey(key)` (sync render-loop read, fires async decode on miss).

### Key Naming

| Type | Pattern |
|------|---------|
| Background | `back:{bS}:{no}:{ani}[:f{frame}]` |
| Tile | `tile:{tileSet}:{u}:{no}` |
| Object | `obj:{oS}:{l0}:{l1}:{l2}:{frame}` |
| Portal | `portal:{type}:{image}:{frame}` |
| Life | `life:{type}:{id}:{stance}:{frame}` |
| Character | `char:{action}:{frame}:{partName}` |
| Reactor | `reactor:{id}:{state}:{frame}` |
| Minimap | `minimap:{mapId}` |

## Character Composition

> Equipment slots, weapon types, cap/hair/face accessory rendering → see `items.md`.

Anchor-chain positioning: body → head → face → hair → equipment layers.
`composeCharacterPlacements()` resolves all parts via `pickAnchorName()` + `topLeftFromAnchor()`,
z-ordered by `zmap.img.xml`. Cached in `characterPlacementTemplateCache` per
`(action, frame, flipped, expression, faceFrame)`. Template NOT cached if any equip/face image still decoding (prevents blink).

**Climbing parity**: weapon hidden, face hidden, hair uses `backHair`/`backHairBelowCap` via UOL, body/coat/pants/shoes use back z-layers.

**Hit visuals**: `triggerPlayerHitVisuals()` → temporary face override (pain/hit/troubled, 500ms).
Invincibility blink via `brightness()` filter (C++ parity).

**Preloading**: `addCharacterPreloadTasks()` preloads up to 6 frames × all parts per action.

## Backgrounds

- Types: 0=static, 1=htile, 2=vtile, 3=h+vtile, 4=hmove, 5=vmove, 6=h+vmove+htile, 7=vmove+htile+vtile
- C++-style parallax from `rx/ry` + camera shift
- Mobile types (4–7) use per-tick drift in `bgMotionStates`
- Background Y anchored per-map (`backgroundViewAnchorY`) — decoupled from camera Y
- Fixed-res bias: `max(0, (canvasH - 600) / 2)` added to background Y
- Count-based tiling matching C++ `MapBackgrounds.cpp`

## Map Layers

- Objects drawn first, then tiles (both z-sorted) per layer
- `f` flag = horizontal flip (not initial frame), animations start from frame 0
- Object animation: explicit `frameKeys`, numeric `$imgdir`/`$canvas` discovery, UOL aliases ignored for frame sequencing
- Per-frame opacity (`a0`/`a1`) with ramp delay. Fade-in frames hold invisible 2s before ramp.
- Object motion: sinusoidal offsets from `moveType`/`moveW`/`moveH`/`moveP`
- Spatial index per layer + viewport cell query for culling
- `metaCache` hit check in `buildMapAssetPreloadTasks` populates frame data immediately

## Life Sprites (Mobs / NPCs)

- Drawn per-layer via `drawLifeSprites(filterLayer, bucket)` — interleaved with map layers
- `buildLifeLayerBuckets()` pre-sorts once per frame
- Off-screen culling with 100px margin. Origin-based positioning.
- Name labels (yellow NPCs, pink mobs) — mob names hidden until attacked
- HP bars: green/red gauge, 3s visibility after hit
- Uses manual screen positioning (not `worldToScreen`)

### Life Preload
`loadLifeAnimation(type, id)` → follows `info.link` redirects → extracts all stances/frames → eager decode of stand+move → deletes basedata to free memory.

## Reactors

Server-authoritative destroyable objects. Reactor 0002001 (wooden box) on map 100000001.

- Sprite bottom sits on foothold (`y = fhY - (height - originY)`)
- Hit animation: state 0 "shake" (2 frames, 400ms), state 3 "break" (7 frames, 1400ms)
- `updateReactorAnimations(dt)` — dt in ms, fade opacity: 0.002 (in) / 0.003 (out)
- `findReactorsInRange()` + `hit_reactor` WS message (server validates 120px X, 60px Y, 600ms cooldown)
- Sounds: `ReactorHit`, `ReactorBreak` from `Sound.wz/Reactor.img`
- Debug: magenta markers + minimap purple dots

## Portals

### Hidden Portals
- `updateHiddenPortalState(dt)`: per-portal touch tracking, 500ms reveal delay, 400ms fade-in
- Animation: 8 frames regular, 7 frames hidden, 100ms per frame
- `ensurePortalFramesRequested()` preloads all animation frames on first approach

### Momentum Scroll
- Camera glides to destination on portal use
- Duration: `max(180ms, min(560ms, distance / 3200 px/s))`
- Eased interpolation in `updateCamera()`

### Transition Sequence
`tryUsePortal()` → fade to black (200ms) → `loadMap()` (shows loading screen) → fade in (300ms)

## Preload System

`preloadMapAssets()`: builds task map → 8 parallel workers → `requestMeta()` → `requestImageByKey()`. Progress → `runtime.loading` for loading screen.

## Loading Screen

- Dark background, "Loading map assets" title, flat pill progress bar
- Animated Orange Mushroom sprite (bouncing, walking along progress bar)
- Login BGM: `client/public/login.mp3` at 35% volume, looped

## HUD Elements

- **Status bar**: HP (red), MP (blue), EXP gauge bars with gloss. Dotum font.
- **Map banner**: slide-in ribbon with map mark icon, street/map name, gold accent, 3.5s display
- **Minimap**: dark panel, markers: yellow (local), red (remote), green (NPCs), blue (portals), purple (reactors)
- **Chat bubble**: white bubble with blue-gray border, prone-aware Y offset (70px normal, 40px prone)
- **Player name label**: dark rounded tag below character
- **NPC dialogue**: portrait + name/function header + word-wrapped text + options. Blocks movement.
- **Pickup journal**: right-aligned text, 5s fade, above chat bar
- **Ping window**: draggable, color-coded dot (green ≤80ms, yellow ≤200ms, red >200ms)

## NPC System

- Click NPC → `openNpcDialogue()`. No range limit.
- `NPC_SCRIPTS` map: taxis, Spinel (town warps)
- Scripted: pages with text + clickable options (gold highlight on hover)
- Unknown scripts: flavor text + travel to major towns. No script: flavor text only.
- Cursor changes to CANCLICK on NPC hover

## WZ Cursor

- HTML `<img>` overlay, `position:fixed; z-index:99999`
- States: IDLE=0 (1f), CANCLICK=1 (2f), CLICKING=12 (1f)
- Animation advanced in game loop tick
- Click state: held on pointerdown, cleared on pointerup → restores hover state
- Activation: loaded after login dismissed, `body.wz-cursor-active` class hides native cursor

## Settings & Debug

- **Settings**: bgmEnabled, sfxEnabled, fixedRes (1024×768 locked), minimapVisible
- **Fixed res**: canvas buffer always 1024×768, CSS scales to fit viewport. `gameViewWidth()`/`gameViewHeight()` return fixed values.
- **Mouse-fly**: player snaps to cursor, bypasses all physics
- **Debug overlays**: footholds (lines + IDs), tiles (cyan boxes + names), life markers, hitboxes (player/portal/trap/mob), reactor markers
- **`rlog()`**: timestamped logs (max 200), displayed in debug panel
- **Perf counters**: drawCalls, culled/drawn sprites, CPU timings, rolling 120-sample window for FPS p50/p95
- **Summary throttling**: 200ms (5Hz), skipped when panel hidden

## Known Issues

- **Blank screen on portal transition**: ERR_INVALID_URL on second load of same map (basedata invalidation). Under investigation.
