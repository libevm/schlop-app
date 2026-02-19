# Canvas Rendering Pipeline

> Single-file client: `client/web/app.js` — all rendering is 2D canvas (`ctx`).

Canvas context initialization:
- `canvasEl.getContext("2d", { alpha: false, desynchronized: true })` with fallback to default 2D context
- `ctx.imageSmoothingEnabled = false` for crisp sprite pixels

## Game Loop

```
tick(timestampMs)                ← requestAnimationFrame
  ├─ accumulator += elapsedMs (every RAF)
  ├─ if accumulator < 16.67ms → wait next RAF (no update/render yet)
  ├─ while accumulator >= 16.67ms (max 6 steps/frame)
  │    └─ update(1/60)
  └─ render()                    ← draw everything to canvas
```

- Fixed-step simulation at 60Hz (`FIXED_STEP_MS = 1000/60`)
- Frame pacing is accumulator-driven (prevents jitter from tiny RAF timing variance)
- Render occurs only when enough accumulated time exists for at least one fixed update (effective ~60 FPS cap)
- Frame delta clamp: `MAX_FRAME_DELTA_MS = 250`
- Catch-up cap: `MAX_STEPS_PER_FRAME = 6` (prevents spiral-of-death)
- `tick` wrapped in try/catch → errors logged to `rlog()`, RAF continues

## Render Order (render function)

```
1. Clear canvas (black fill)
2. If loading.active → drawLoadingScreen() → return
3. If !runtime.map  → drawTransitionOverlay() → return
4. drawBackgroundLayer(0)       ← back backgrounds (front=0)
5. drawMapLayersWithCharacter() ← per layer: drawMapLayer + drawLifeSprites(layer) + drawCharacter at playerLayer
6. drawReactors()               ← reactor sprites (state 0 idle)
7. drawDamageNumbers()          ← floating damage text from combat
8. drawRopeGuides()             ← debug overlay (if enabled)
9. drawPortals()                ← portal sprites
10. drawFootholdOverlay()       ← debug overlay (if enabled)
11. drawLifeMarkers()           ← debug overlay (if enabled)
    drawReactorMarkers()        ← debug overlay (magenta, if life markers enabled)
12. drawHitboxOverlay()         ← debug overlay (if enabled)
13. drawBackgroundLayer(1)      ← front backgrounds (front=1)
13b. drawGroundDrops()          ← items dropped on the map floor
13c. drawVRBoundsOverflowMask() ← black fill for areas outside VR bounds (when map < viewport)
14. drawChatBubble()
15. drawPlayerNameLabel()       ← player name tag below character
16. drawStatusBar()             ← HP/MP/EXP bars at bottom
17. drawMapBanner()             ← map name fades in on map entry
18. drawMinimap()               ← collapsible panel with player/portal/mob/NPC/reactor dots
19. drawNpcDialogue()           ← NPC dialogue box with portrait + options
20. drawFpsCounter()            ← top bar FPS/frametime badge (left of settings/debug buttons, debug-toggleable)
21. drawTransitionOverlay()     ← fade-in/out black overlay
```

**Note:** `drawLifeSprites(filterLayer)` is called **inside** `drawMapLayersWithCharacter()`
for each map layer — it is NOT a standalone call in `render()`. Mobs/NPCs are interleaved
with map tiles/objects/player based on their `renderLayer` assignment.

## Coordinate Systems

- **World coords**: map positions (pixels). Origin varies per map.
- **Screen coords**: canvas pixel positions. (0,0) = top-left.
- `worldToScreen(worldX, worldY)` → `{ x, y }` screen position
  - `screenX = worldX - camera.x + canvasWidth/2`
  - `screenY = worldY - camera.y + canvasHeight/2`
- **No vertical bias**: `sceneRenderBiasY()` was removed — it shifted world rendering down
  on tall canvases, causing the character to render off-screen when camera clamped to map bounds.
- `BG_REFERENCE_HEIGHT = 600` — reference height for camera Y bias on tall viewports

## Drawing Primitives

- `drawWorldImage(image, worldX, worldY, opts)` — world-space draw with optional flip
- `drawScreenImage(image, x, y, flipped)` — screen-space draw with optional flip
- Both round coordinates to integers for pixel-perfect rendering
- Flip is done via `ctx.translate + ctx.scale(-1, 1)`
- Both increment runtime draw-call counters for perf diagnostics

## Asset Pipeline (Load → Cache → Render)

### Three-Layer Cache

```
jsonCache     (Map<path, Promise<JSON>>)     — raw WZ JSON files from dev server
metaCache     (Map<key, {basedata, width, height, vectors, zName}>)  — image metadata
imageCache    (Map<key, HTMLImageElement>)    — decoded ready-to-draw images
```

Additional promise caches prevent duplicate in-flight requests:
- `metaPromiseCache` — deduplicates concurrent requestMeta calls
- `imagePromiseCache` — deduplicates concurrent requestImageByKey calls

### Loading Flow

```
fetchJson(path)
  → jsonCache (stores promise, deduplicates)
  → returns parsed JSON tree (shared reference — do NOT mutate)

getMetaByKey(key)
  → synchronous read from metaCache (no allocation)

requestMeta(key, loaderFn)
  → if metaCache has key → return cached meta directly (no Promise.resolve)
  → else call loaderFn() → store result in metaCache
  → loaderFn typically: fetchJson → navigate JSON tree → canvasMetaFromNode()

requestImageByKey(key)
  → if imageCache has key → return cached image directly (no Promise.resolve)
  → if imagePromiseCache has key → return pending promise
  → get meta from metaCache
  → validate meta.basedata (string, length >= 8)
  → new Image(), src = data:image/png;base64,${meta.basedata}
  → on load → imageCache.set(key, image)
  → on error → rlog("IMG DECODE FAIL"), resolve(null)

getImageByKey(key)                           ← synchronous, used in render loop
  → return cached image immediately when present
  → if missing, fire requestImageByKey(key) once and return null
```

### Key Naming Conventions

| Asset Type      | Key Pattern                                        |
|-----------------|----------------------------------------------------|
| Background      | `back:{bS}:{no}:{ani}`                             |
| Background frame| `back:{bS}:{no}:{ani}:f{frameIdx}`                 |
| Tile            | `tile:{tileSet}:{u}:{no}`                           |
| Object          | `obj:{oS}:{l0}:{l1}:{l2}:{frameNo}`                |
| Object frame    | `obj:{oS}:{l0}:{l1}:{l2}:{frameIdx}`               |
| Portal          | `portal:{type}:{image}:{frame}`                     |
| Life sprite     | `life:{type}:{id}:{stance}:{frame}`                 |
| Character       | `char:{action}:{frame}:{partName}`                  |
| Reactor         | `reactor:{reactorId}:{state}:{frameIdx}`            |
| Minimap         | `minimap:{mapId}`                                   |

### Character Equipment Rendering

The character is composed from multiple WZ data sources, all positioned via anchor-based
composition using `composeCharacterPlacements()`:

**Data Sources** (loaded by `requestCharacterData()`):
- `Character.wz/00002000.img.json` — body (provides `navel`, `neck` anchors)
- `Character.wz/00012000.img.json` — head (anchors to `neck`, provides `brow`)
- `Character.wz/Face/00020000.img.json` — face (anchors to `brow`)
- `Character.wz/Hair/00030000.img.json` — hair (anchors to `brow`)
- `Character.wz/Coat/*.img.json` — top (anchors to `navel`)
- `Character.wz/Pants/*.img.json` — bottom (anchors to `navel`)
- `Character.wz/Shoes/*.img.json` — shoes (anchors to `navel`)
- `Character.wz/Weapon/*.img.json` — weapon (anchors to `hand`)
- `Base.wz/zmap.img.json` — z-order layer names

**Default Equipment** (`DEFAULT_EQUIPS` constant):
- Coat `01040002`, Pants `01060002`, Shoes `01072001`, Weapon `01302000`
- Hair `00030000` (`DEFAULT_HAIR_ID`)

**Part Extraction**:
- Body/head/face: existing extractors (`getCharacterActionFrames`, `getHeadFrameMeta`, `getFaceFrameMeta`)
- Hair: `getHairFrameParts()` — reads from `default` stance (direct canvas children + sub-imgdirs like `hairShade`)
- Equipment: `getEquipFrameParts()` — reads stance/frame canvas children with `z` string for zmap layer name

**Composition** (`composeCharacterPlacements()`):
1. Body placed first at player position (via origin)
2. Body provides anchors: `navel`, `neck`, `hand` (arm part)
3. Remaining parts iterate using `pickAnchorName()` — finds matching anchor in already-placed anchors
4. Each part positioned by `topLeftFromAnchor()` using its own origin + map vectors
5. Z-ordered by `zOrderForPart()` using `zmap.img.json` layer index
6. Cached in `characterPlacementTemplateCache` per
   `(action, frameIndex, flipped, faceExpression, faceFrameIndex)`
   and reused each frame with player-position offsets.
   (Face-expression keys are required so hit/pain face overrides recompose immediately.)
   If a face part is expected but its image is not decoded yet, template creation returns `null`
   (no cache write) so draw falls back to last complete frame instead of caching a no-face template.

**Climbing Parity** (C++ `CharLook::draw` climbing branch):
- Weapon: hidden during climbing (`getEquipFrameParts` returns `[]` when `CLIMBING_STANCES` has action and equip has no stance)
- Hair: uses `backHair`/`backHairBelowCap` from `backDefault` via UOL resolution (e.g. `../../backDefault/backHair`)
- Face: not drawn during climbing (suppressed in `getCharacterFrameData`)
- Head: uses back section (`../../back/head` UOL resolved by `getHeadFrameMeta`)
- Coat/Pants/Shoes: use back z-layers (`backMailChest`, `backPants`, `backShoes`) from their climbing stances
- Body: uses `backBody` z-layer from climbing stance

**Preloading**: `addCharacterPreloadTasks()` preloads up to 6 frames per action for all character
parts (body, head, face, hair, equipment). Keys: `char:{action}:{frame}:{partName}`.

**Hit reaction visuals (C++-inspired):**
- `triggerPlayerHitVisuals(nowMs)` forces a temporary face-expression override when the player is hit.
- Expression selection priority: `pain` → `hit` → `troubled` → `stunned` → `bewildered` (first available in face data).
- Override timing: `PLAYER_HIT_FACE_DURATION_MS = 500` via `runtime.faceAnimation.overrideExpression/overrideUntilMs`.
- `updateFaceAnimation(dt)` now supports temporary override playback and then returns to normal default/blink cycle.
- `drawCharacter()` applies invincibility blink as color darkening (not alpha fade) while trap i-frames are active,
  matching C++ `Char::draw` behavior:
  `rgb = 0.9 - 0.5 * abs(sin(progress * 30))` (rendered via canvas `brightness(...)` filter).
- Face placement parity fix: when composing parts, face is forced to anchor via `brow` (when available), and uses
  face-frame `map.brow` offset during anchor solve. This matches C++ `Face::Frame` behavior
  (`texture.shift(-brow)`) + `CharLook::draw` face-position flow, preserving correct per-expression alignment.

### canvasMetaFromNode(canvasNode)

Extracts from a WZ JSON canvas node:
- `basedata` — base64 PNG string (from JSON tree, shared reference)
- `width`, `height` — pixel dimensions
- `vectors` — `{ origin: {x,y}, lt, rb }` from vector children
- `zName` — z-layer name from leaf record

Returns `null` if `canvasNode.basedata` is falsy.

## Preload System

`preloadMapAssets(map, loadToken)`:
1. `buildMapAssetPreloadTasks(map)` → creates task Map of `key → loaderFn`
2. `requestCharacterData()` + `addCharacterPreloadTasks(taskMap)`
3. 8 parallel workers consume tasks
4. Each worker: `requestMeta(key, loader)` → `requestImageByKey(key)`
5. Stats tracked: decoded / cached / skipped / errors
6. Progress reported to `runtime.loading` for loading screen

### Life Sprite Preload

- `loadLifeAnimation(type, id)` loads from `Mob.wz` / `Npc.wz`
- Follows `info.link` redirects
- Extracts all stances → frames with canvas metadata
- Registers frames in `metaCache`
- Eagerly decodes "stand" + "move" frames, then **deletes basedata** to free memory
- Cached in `lifeAnimations` Map keyed `"type:id"` → `{ stances, name, speed }`

### Critical Warning: JSON Cache Mutation

**Never mutate objects from `jsonCache`!** The same parsed JSON object is returned on every `fetchJson(path)` call. Mutating it (e.g., `delete node.basedata`) corrupts all future reads.

Life sprite frames extract basedata into separate objects, so deleting `frame.basedata` is safe. Map asset meta objects hold a REFERENCE to `canvasNode.basedata` from the JSON tree — deleting from meta would not affect the JSON, but the meta would become unusable for re-decode.

## Backgrounds

`drawBackgroundLayer(frontFlag)`:
- Iterates `runtime.map.backgrounds`, filters by `front` flag
- Animated backgrounds use `bgAnimStates` to pick frame key
- Background types: 0=static, 1=htile, 2=vtile, 3=h+vtile, 4=hmove, 5=vmove, 6=h+vmove+htile, 7=vmove+htile+vtile
- C++-style placement/parallax model (from `MapBackgrounds.cpp`):
  - static backgrounds use `shiftX/shiftY` from `rx/ry` and camera view translation
  - mobile background types (4/5/6/7) use per-tick drift state (`bgMotionStates`)
- Vertical view translation for backgrounds is anchored per-map (`runtime.backgroundViewAnchorY`)
  so scene Y is decoupled from live character/camera Y movement (no jump-linked scene shift)
- Fixed-resolution vertical scene bias is added to background Y:
  `max(0, (canvasHeight - BG_REFERENCE_HEIGHT) / 2)`
  so backdrop composition remains lower on tall dynamic viewports
- Bias is uniform (not player-jump reactive), preventing jump-time scene popping
- Tiling: count-based (`htile × vtile`) matching C++ `MapBackgrounds.cpp`
- Tile wrap alignment is applied before origin offset (C++ parity) to reduce visible seams/patches
- `blackBackground`: first background with empty bS triggers black fill

## Map Layers

`drawMapLayer(layer)`:
- Draws objects first, then tiles (both z-sorted)
- Animated objects use `objectAnimStates` for frame selection
- Map object `f` is treated as horizontal flip flag (C++ parity), not as initial frame index.
  Object animations start from frame `0` and draw with mirrored origin when flipped.
- Object animation frame discovery supports numeric `$imgdir` and direct numeric `$canvas` frame nodes
  (`objectAnimationFrameEntries`) following C++ `Animation` bitmap-frame behavior.
  Numeric `$uol` alias entries are ignored for frame sequencing to preserve correct cycle timing/cooldowns.
- Object animation may use explicit frame token sequence (`obj.frameKeys`) rather than assuming contiguous `0..N-1` frame IDs
- Per-frame opacity uses accumulated `state.opacity` (0–255) tracked in `objectAnimStates`.
  Each tick: `opcStep = dtMs * (a1 - a0) / rampDelay` drives opacity toward the frame's end value.
  On frame advance, opacity carries over (no snap) for smooth transitions between cycles.
  Per-frame `a0`/`a1` stored in `obj.frameOpacities` array alongside `obj.frameDelays`.
  For fade-in frames (a0=0): hold fully invisible for 2s before ramping, creating a visible
  cooldown gap between laser cycles. `holdMs = isFadeIn ? 2000 : 0`.
  For laser objects this produces: 2s off → 1s ramp-in → 2s hold at full → 2s fade-out → repeat.
- Map transition animation fix: when `metaCache` already has the animation key from the previous
  map, the loader side-effect (populating `obj.frameDelays`/`frameOpacities`/`frameKeys`) is skipped.
  `buildMapAssetPreloadTasks` now checks cached meta and populates new map objects immediately
  before queuing the preload task. Applies to both object and background animations.
- Falls back to base frame if animated frame missing
- Object motion metadata (`moveType`, `moveW`, `moveH`, `moveP`) is applied in draw path
  with sinusoidal offsets (`objectMoveOffset`) for moving trap/map objects (e.g., spike balls)
- Origin-based positioning: `worldX = obj.x - origin.x`
- Uses map-load spatial index (`layer._spatialIndex`) + viewport cell query (`visibleSpritesForLayer`) to avoid iterating full layer arrays each frame
- Visible-cell query cache reuses candidate arrays while camera stays in same cell range
- World-rect culling via `isWorldRectVisible(...)` before draw
- Metadata requests are lazy-on-miss (`requestObjectMeta` / `requestTileMeta`) and skipped on cache hits

`drawMapLayersWithCharacter()`:
- Iterates all map layers in order
- Builds life buckets once per frame (`buildLifeLayerBuckets`) and passes per-layer entries into `drawLifeSprites`
- Per layer: `drawMapLayer(layer)` → `drawLifeSprites(layerIndex, bucket)` → character (if layer matches)
- Player render layer determined by `currentPlayerRenderLayer()`:
  - Climbing → layer 7
  - Airborne (not grounded) → layer 7
  - Grounded → `player.footholdLayer`
- Player drawn once at matching layer; if no layer matches, drawn after all layers
- This interleaving allows higher map layers to occlude the player and lower layers to be behind

## Life Sprites (Mobs / NPCs)

`drawLifeSprites(filterLayer, lifeEntriesForLayer?)`:
- Called per map layer from `drawMapLayersWithCharacter()`, NOT as standalone in `render()`
- `filterLayer` parameter: only draws mobs/NPCs whose `renderLayer` matches the current layer
- Usually iterates a pre-bucketed per-layer subset (from `buildLifeLayerBuckets`) instead of scanning all life entries for every layer
- Position from `state.phobj.x` / `state.phobj.y` (physics object)
- Screen Y uses `worldY - cam.y + halfH` — same formula as `worldToScreen`
- Facing from `state.facing` (mobs) or `life.f` (NPCs)
- Off-screen culling with 100px margin
- Origin-based positioning from frame metadata (`frame.originX`, `frame.originY`)
- Does NOT use `drawWorldImage` — handles flip via `ctx.translate/scale` directly
- Name labels: yellow for NPCs, pink for mobs
- HP bars: green/red gauge, shown for 3s after mob is hit

> **Note:** `drawLifeSprites` uses manual screen positioning (not `worldToScreen`).
> Any changes to `worldToScreen` must be mirrored here.

## Reactors

`drawReactors()`:
- Iterates `reactorRuntimeState` entries
- Position from `reactor.x` / `reactor.y` (static map positions)
- Screen Y uses `worldY - cam.y + halfH` — same formula as `worldToScreen`
- Facing from `reactor.f` flag
- Off-screen culling with 100px margin
- Origin-based positioning from frame metadata
- Only renders state 0 (idle/normal) — state transitions require server

### Reactor Loading

- `loadReactorAnimation(reactorId)` loads from `Reactor.wz/{padded7}.img.json`
- Reads state 0 canvas frames (direct children with `$canvas`)
- Extracts origin, delay from frame metadata
- Cached in `reactorAnimations` Map keyed `reactorId`
- 475 maps in the dataset have reactor entries

### Reactor Runtime State

- `reactorRuntimeState` Map keyed by reactor entry index
- Tracks `frameIndex`, `elapsed` (animation timer), `state`, `active`
- `initReactorRuntimeStates()` called on map load (after preload)
- `updateReactorAnimations(dt)` advances frame timers each tick

### Reactor Debug

- `drawReactorMarkers()` — magenta squares + reactor IDs (shown with life markers)
- Reactor dots on minimap — purple/fuchsia color (`#e879f9`)
- `reactorCount` in debug panel summary

## Portal Transitions

```
tryUsePortal()
  → runPortalMapTransition(targetMapId, targetPortalName)
    → fadeScreenTo(1.0, 200ms)          ← fade to black
    → transition.alpha = 0              ← clear overlay for loading screen
    → loadMap(targetMapId, ...)          ← shows loading screen (drawLoadingScreen)
    → transition.alpha = 1              ← prepare fade-in overlay
    → fadeScreenTo(0.0, 300ms)          ← fade from black to transparent
```

- `fadeScreenTo` uses `requestAnimationFrame` loop, independent of game loop
- `drawTransitionOverlay()` draws semi-transparent dark fill based on `transition.alpha`
- Loading screen has its own dark background (transition overlay NOT drawn during loading)

## Loading Screen

`drawLoadingScreen()`:
- Dark background fill
- "Loading map assets..." text
- Progress bar (width proportional to `loading.progress`)
- Label text showing `"Loading assets X/Y"`
- FPS counter still renders in loading/no-map states when enabled (`drawFpsCounter()`)

## Debug / Diagnostics

### Runtime Logs (`rlog()`)
- Timestamped messages stored in `runtimeLogs[]` (max 200)
- Displayed in Debug Panel > "Runtime Logs" section
- Copy / Clear buttons
- Key events logged: loadMap lifecycle, portal transitions, preload stats,
  fetchJson failures, image decode failures, render state changes, tick crashes

### Render State Tracking
- `_lastRenderState` dedup: only logs when state string changes
- Format: `loading=bool,map=bool,warp=bool,trans=N.N`

### Runtime Summary Throttling
- `updateSummary()` is throttled to every `SUMMARY_UPDATE_INTERVAL_MS=200`
  (5Hz) instead of every frame
- Summary updates are skipped while debug panel is hidden (unless interaction is active)
- Reduces per-frame JSON serialization / DOM churn in gameplay loop

### Runtime Performance Counters
- Per-frame counters reset in `render()` via `resetFramePerfCounters()`:
  - `drawCalls`, `culledSprites`, `objectsDrawn`, `tilesDrawn`, `lifeDrawn`, `portalsDrawn`, `reactorsDrawn`
- Timing captured in `tick()`:
  - CPU timings: `updateMs`, `renderMs`, `frameMs`
  - loop cadence: `loopIntervalMs` (elapsed wall-clock between processed ticks)
  - rolling sample window (`PERF_SAMPLE_SIZE=120`) now tracks loop interval for accurate FPS p50/p95

### Preload Stats (per map load)
- `decoded` — new images decoded from base64
- `cached` — images already in imageCache (skip decode)
- `skipped` — tasks where metadata was null (no image data)
- `errors` — tasks that threw exceptions
- Total `imageCache.size` and `metaCache.size` logged after preload

### Image Validation
- `requestImageByKey` validates `meta.basedata` before creating Image
- Logs `BAD BASEDATA` if basedata is missing/invalid
- Logs `IMG DECODE FAIL` if browser rejects the data URI

## Hidden Portal System

`updateHiddenPortalState(dt)`:
- Tracks per-portal touch state in `runtime.hiddenPortalState` Map (keyed `"x,y"`)
- When player overlaps hidden portal bounds: accumulates `touchMs`
- After `HIDDEN_PORTAL_REVEAL_DELAY_MS` (500ms), begins fade-in
- Fade-in duration: `HIDDEN_PORTAL_FADE_IN_MS` (400ms)
- When player leaves portal bounds: alpha fades out at same rate
- Portal render (`drawPortals`) uses per-portal alpha for hidden type (`pt=10`)
- Portal animation frames are driven by `runtime.portalAnimation` (tick-updated),
  not wall-clock sampling:
  - regular portals: 8 frames
  - hidden/script-hidden portals: 7 frames
  - frame step: `PORTAL_ANIMATION_FRAME_MS=100`
- Portal frame warmup: `ensurePortalFramesRequested(portal)` queues/decode-requests all frames
  for a portal animation set once, preventing static-looking first-frame stalls
- Portal sprites are also world-rect culled (`isWorldRectVisible`) and portal meta
  is requested lazily only when a frame key is missing from cache

## Portal Momentum Scroll

`startPortalMomentumScroll()` / `waitForPortalMomentumScrollToFinish()`:
- When entering a portal, camera smoothly glides from current position to destination
- Duration based on distance: `max(PORTAL_SCROLL_MIN_MS, min(PORTAL_SCROLL_MAX_MS, distance/speed))`
- Constants: `PORTAL_SCROLL_MIN_MS=180`, `PORTAL_SCROLL_MAX_MS=560`, `PORTAL_SCROLL_SPEED_PX_PER_SEC=3200`
- `updateCamera()` applies eased interpolation during scroll
- Player position tracked during scroll to avoid camera jerk at end

## Keybind Customization

- Stored in `runtime.keybinds` object: `attack`, `jump`, `pickup`, `npcChat`
- Persisted via `KEYBINDS_STORAGE_KEY` in localStorage
- UI buttons in debug panel for rebinding (click button → press key → saved)
- `keyCodeToDisplay()` maps `event.code` to display label

## Settings System

- `runtime.settings`: `bgmEnabled`, `sfxEnabled`, `fixedRes`, `minimapVisible`
- Settings modal accessed via ⚙️ button
- `loadSettings()` / `saveSettings()` via localStorage (`SETTINGS_CACHE_KEY`)
- `fixedRes`: locks canvas to 1024×768 internal resolution; all game rendering
  (camera, parallax, world-to-screen, culling) uses `gameViewWidth()`/`gameViewHeight()`
  which return fixed 1024×768 in fixedRes mode, actual canvas size otherwise.
  `cameraHeightBias()` returns 0 in fixedRes mode (no dynamic viewport compensation).
- `applyFixedRes()` + `syncCanvasResolution()` handle canvas size management
  (canvas buffer always 1024×768 in fixedRes; CSS scales to fit viewport)

## Mouse-Fly Debug Mode

- Toggle via debug panel checkbox
- When enabled: player position snaps to mouse cursor position each frame
- Bypasses all physics (gravity, footholds, walls)
- Useful for quick map exploration and testing

## Hitbox Overlay (Debug)

- Toggle via debug panel checkbox (`debug-hitboxes-toggle`)
- Requires `overlayEnabled` master toggle
- `drawHitboxOverlay()` renders world-space rectangles for collision diagnostics:
  - player touch/sweep hitbox (`playerTouchBounds`)
  - portal trigger bounds (`portalWorldBounds`)
  - trap hazard hitboxes (from `map.trapHazards` + current object frame metadata)
  - mob frame bounds (touch-damaging mobs highlighted stronger)
- Uses `drawWorldDebugRect()` with viewport culling (`isWorldRectVisible`) to avoid drawing off-screen boxes.

## FPS Counter (Debug)

- Toggle via debug panel checkbox (`debug-fps-toggle`)
- Renders canvas badge in the top bar, positioned left of the settings/debug buttons
- Badge shows:
  - estimated FPS (from rolling p50 loop interval)
  - current loop interval ms (`runtime.perf.loopIntervalMs`)
- Drawn in normal gameplay and loading/no-map states

## NPC Dialogue System

`openNpcDialogue(npcResult)` / `drawNpcDialogue()`:
- Click NPC → opens dialogue overlay
- Portrait: NPC sprite with scaling, positioned in left column
- Header: NPC name + function
- Content: word-wrapped text lines with page navigation
- Scripted NPCs: `NPC_SCRIPTS` map keyed by scriptId
  - Known scripts: taxis (Henesys/Ellinia/etc.), Spinel (town warps)
  - Each script defines pages with text + clickable options
- Option handling: hover highlight (gold), click executes action (map warp, close, etc.)
- Fallback: NPCs without scripts show flavor text + travel options to major towns
- Blocks player movement/jumping/portal use while active

## Ground Drop System

Items can be dropped on the map and looted by the player.

### Drop Spawning
- Player clicks canvas while dragging an inventory/equip item
- Drop spawns at `(player.x, player.y - 4)` with destination 30-60px in facing direction
- C++ parity: `hspeed = (destX - startX) / 48`, `vspeed = -5.0`

### Drop Physics (per-tick in `updateGroundDrops`)
- Gravity: `DROP_PHYS_GRAVITY = 0.14` per tick (matches game engine)
- Terminal velocity: `DROP_PHYS_TERMINAL_VY = 8`
- Spin while airborne: `angle += 0.2` per tick (C++ SPINSTEP)
- Foothold crossing detection: `prevY <= fh.y && newY >= fh.y`
- On landing: snap to `(destX, destY)`, switch to FLOATING state
- Fixed-tick sub-stepping (1 tick per update call at 60fps)

### Drop States (C++ parity)
- **DROPPED** (`onGround=false`): physics-driven arc with spin
- **FLOATING** (`onGround=true`): bob animation `cos(phase) * 2.5px`, phase += 0.025/tick
- **PICKEDUP** (`pickingUp=true`): fly toward player, fade out over 400ms

### Drop Rendering (`drawGroundDrops`)
- Icon drawn at world position with camera transform
- Bob offset applied when floating
- Rotation applied when airborne
- Opacity modulated during pickup animation
- No text labels on ground drops

### Loot Pickup
- Z key (configurable) triggers `tryLootDrop()`
- 50px range, player must be on ground
- One item per press (C++ `lootenabled` parity)
- Item returns to inventory (stacks if same ID)
- PickUpItem sound plays

### Item Drag System
- `draggedItem` state: active, source, sourceIndex, id, name, qty, iconKey, category
- Ghost item (`<img id="ghost-item">`) follows cursor at 60% opacity, z-index 99998
- Source slot dims to 40% while dragged
- DragStart/DragEnd/DropItem/PickUpItem sounds from WZ
- Escape or map change cancels drag

## Known Issues / Investigation

- **Blank screen on portal transition**: Under investigation. ERR_INVALID_URL seen on
  second load of same map, suggesting some basedata becomes invalid between loads.
  Diagnostic logging added to identify which key is affected.
- **Transition overlay during fade-in**: `drawTransitionOverlay()` is at end of normal
  render path, so fade-in works correctly when rendering pipeline is healthy.

## Resolved Issues

- **Character off-screen on tall resolutions** (fixed): Two issues combined:
  1. `sceneRenderBiasY()` shifted all rendering down by `(canvasHeight-600)/2` without
     camera compensation. At 1080p: 240px extra shift, pushing player to 84% down screen.
     Fix: removed `sceneRenderBiasY()` entirely from world rendering.
  2. Camera target was `player.y - 130` (arbitrary offset pushing player below center).
     The C++ client actually centers the player: `camera.y = VHEIGHT/2 - position.y()`.
     Fix: changed camera target to `player.y - cameraHeightBias()`.
- **Camera height bias** (`cameraHeightBias()`): `Math.max(0, (canvasHeight - 600) / 2)`.
  Shifts the camera target upward on viewports taller than the 600px reference height.
  Backgrounds are designed for 600px — on taller canvases they don't cover the bottom.
  The bias pushes the scene down so sky backgrounds fill the top and ground content covers
  more of the bottom. At 600px: 0. At 1080px: 240. At 1440px: 420.
  Applied at all 4 camera target sites (teleport, portal scroll, smooth follow, map load).
  Still subject to `clampCameraYToMapBounds` — at map bottom edges, clamp may override bias.
- **Short-map camera clamping** (C++ parity): when map VR bounds are smaller than viewport,
  camera locks top-aligned (Y) / left-aligned (X), matching C++ behavior. Overflow goes to
  bottom/right. `drawVRBoundsOverflowMask()` blacks out areas outside VR bounds so
  background tiles/objects beyond the designed scene are hidden.
- **NPC dialogue overlay**: drawn after minimap, before transition overlay. Blocks player
  movement, jumping, and portal use while active. MapleStory-style box with NPC portrait,
  name/function header, word-wrapped text, clickable options for scripted NPCs, page
  navigation, and footer hint.
- **Player name label** (`drawPlayerNameLabel()`): renders player name in a dark tag below the
  character sprite. Uses `player.name` from runtime state.
- **Status bar** (`drawStatusBar()`): centered at bottom of canvas, shows Lv/job on left,
  HP (red) and MP (blue) gauge bars on right, thin EXP bar (gold) along top edge of panel.
  Uses `player.hp/maxHp/mp/maxMp/exp/maxExp/level/job`. Default: Lv1 Beginner, 50/50 HP, 5/5 MP.
- **Map name banner** (`drawMapBanner()`): shows map name (gold, large) and street name (gray, small)
  at 18% screen height on map load. Fades out over 800ms after 3s total display.
  Triggered by `showMapBanner(mapId)` at end of `loadMap()`. Uses `getMapStringName()`/`getMapStringStreet()`.
- **Client-side combat demo**: click mobs to attack, damage numbers float upward, mob HP bars
  shown for 3s after hit, mob hit1/die1 stance animation, fade-out on death, respawn after 8s.
  EXP awarded on kill with level-up system (increases maxHP/MP/EXP).
  Pointer cursor on mob hover. Hit/Die SFX from `Sound.wz/Mob.img`.
- **NPC interaction system**: click any visible NPC to open dialogue. No range limit.
  NPCs with known scripts (taxis, Spinel) show specific options. NPCs with unknown scripts
  show flavor text + travel options to all major towns. NPCs without scripts show flavor text.
  Cursor changes to pointer on NPC hover. Option highlight on hover with gold color.
- **Minimap**: collapsible panel showing map image with player (blue dot), portal (yellow dots),
  mob (red dots), NPC (green dots), reactor (purple dots) markers. Toggle via settings.
  Click +/− to collapse/expand. World-to-minimap coordinate transform using map center offset and scale.
