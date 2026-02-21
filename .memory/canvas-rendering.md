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
5. drawMapLayersWithCharacter() ← per layer: drawMapLayer + drawLifeSprites(layer) + remote players at their foothold layer + drawCharacter at playerLayer (local player on top of same-layer remotes)
6. drawReactors()               ← reactor sprites (state 0 idle)
7. drawDamageNumbers()          ← floating damage text from combat
8. drawRopeGuides()             ← debug overlay (if enabled)
9. drawPortals()                ← portal sprites
10. drawFootholdOverlay()       ← debug overlay (if enabled): lines + x,y labels + fh ID
10b. drawTileOverlay()          ← debug overlay (if enabled): bounding boxes + name + x,y
11. drawLifeMarkers()           ← debug overlay (if enabled)
    drawReactorMarkers()        ← debug overlay (magenta, if life markers enabled)
12. drawHitboxOverlay()         ← debug overlay (if enabled)
13. drawBackgroundLayer(1)      ← front backgrounds (front=1)
13b. drawGroundDrops()          ← items dropped on the map floor
13c. drawVRBoundsOverflowMask() ← black fill for areas outside VR bounds (when map < viewport)
14. drawChatBubble()
15. drawPlayerNameLabel()       ← player name tag below character
15b. drawRemotePlayerNameLabel() + drawRemotePlayerChatBubble() for each remote player
16. drawStatusBar()             ← HP/MP/EXP bars at bottom
17. drawMapBanner()             ← map name fades in on map entry
18. drawMinimap()               ← collapsible panel with player/portal/mob/NPC/reactor dots
19. drawNpcDialogue()           ← NPC dialogue box with portrait + options
20. drawTransitionOverlay()     ← fade-in/out black overlay
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

### Persistent Browser Cache (Cache API)

```
cachedFetch(url)
  → V2 routing: if useV2Resources && url starts with /resources/
      → rewrite to /resourcesv2/
  → cache.match(resolvedUrl) → return if hit
  → fetch(resolvedUrl) → cache.put → return
  → if V2 404 → fallback to /resources/ (graceful degradation)
```

- V2 mode activated by `?v2=1` query param or `window.__MAPLE_ONLINE__`
- All `/resources/` and `/resourcesv2/` fetches go through `cachedFetch()`
- `fetchJson()` uses `cachedFetch()` instead of raw `fetch()`
- Survives page reloads — subsequent visits serve from browser Cache Storage
- Gracefully degrades if Cache API unavailable (falls back to network)

### Three-Layer In-Memory Cache

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
   Same guard applies to `equip:*` parts — if any expected equip sprite is still decoding,
   template is NOT cached. This prevents equipment "blinking" after equipping new items
   (incomplete template cached → equip missing → cache hit on next frame → blink cycle).

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
- Name labels: hidden by default; only shown after player attacks the mob (`state.nameVisible`)
  - Set to `true` on any attack (hit or miss); resets on mob death/respawn

> **Note:** `drawLifeSprites` uses manual screen positioning (not `worldToScreen`).
> Any changes to `worldToScreen` must be mirrored here.

## Reactors (Server-Authoritative Destroyable Objects)

**Reactor 0002001** (64×45 wooden box) on map 100000001: 5 placements.

`drawReactors()`:
- Iterates `reactorRuntimeState` entries
- Position from `reactor.x` / `reactor.y` — y is set so sprite bottom sits on foothold
  (y = footholdY - (spriteHeight - originY), e.g. 274 - 22 = 252 for reactor 0002001)
- Standard WZ origin-based rendering: `drawImage(img, screenX - originX, screenY - originY)`
- Screen coords: `worldX/Y - cam.x/y + halfW/H`
- Off-screen culling with 100px margin
- Renders current WZ state's idle frame OR hit animation frame
- Supports opacity for fade-in (respawn, 0.5s) and fade-out (destroy, 0.33s)

**Hit animation logic:**
- `reactor_hit` → `hitAnimState = 0` (always plays state 0 "shake" — 2 frames)
- `reactor_destroy` → `hitAnimState = rState.state` (plays state 3 "break apart" — 7 frames)
- States 1/2 have no hit/idle frames; not used for animation lookup

### Reactor Loading

- `loadReactorAnimation(reactorId)` loads from `Reactor.wz/{padded7}.img.json`
- Loads ALL states: idle canvas frames + `hit` sub-animation per state
- Returns `{ states: { [stateNum]: { idle: [frames], hit: [frames] } }, name }`
- Cached in `reactorAnimations` Map keyed `reactorId`
- Hit frame delay minimum: 200ms (WZ default 150ms). Shake: 400ms, Break: 1400ms.
- Preload in `buildMapAssetPreloadTasks` for WZ-defined reactors
- `syncServerReactors` also registers frames in `metaCache` + calls `requestImageByKey`

### Reactor Runtime State

- `reactorRuntimeState` Map keyed by reactor entry index
- Server-synced via `syncServerReactors()` from `map_state` message
- Tracks: `frameIndex`, `elapsed`, `state`, `hp`, `active`, `destroyed`, `opacity`
- Hit animation: `hitAnimPlaying`, `hitAnimState`, `hitAnimFrameIndex`, `hitAnimElapsed`
- `initReactorRuntimeStates()` — offline fallback, skipped if server already synced
- **`updateReactorAnimations(dt)`** — `dt` is in **milliseconds** (caller passes `dt * 1000`)
  - Uses `dt` directly for elapsed accumulation (NOT `dt * 1000` again)
  - Fade opacity: `dt * 0.002` for fade-in, `dt * 0.003` for fade-out
- Cleared at start of `loadMap()` to avoid stale data

### Reactor Hit Detection

- `findReactorsInRange()` — mirrors `findMobsInRange()`, uses ATTACK_RANGE_X/Y
- Called in `performAttack()` — sends `hit_reactor { reactor_idx }` to server
- Server validates range (120px X, 60px Y), 600ms cooldown, active state

### Reactor Sounds

- `ReactorHit` — state 0 hit sound from `Sound.wz/Reactor.img.json > 2000 > 0 > Hit`
- `ReactorBreak` — state 3 hit sound (destruction) from same file `> 3 > Hit`
- Preloaded in `preloadUISounds()`

### Reactor Drop Landing & Loot Ownership

- `createDropFromServer` uses `findFootholdAtXNearY`/`findFootholdBelow` for destY
- Same foothold detection as user-dropped items (with -4px offset)
- Server destY is only a hint; client recalculates locally
- Drops store `ownerId` (from server `owner_id`) and `createdAt` (client `Date.now()`)
- `tryLootDrop()` skips drops where `ownerId !== sessionId` and age < 5s
- Server `loot_failed` handler: `not_found`/`already_looted` → remove drop; `owned` → drop stays

### Item Icon Loading

- `loadItemIcon(itemId)` → fetches `Item.wz/{folder}/{prefix}.img.json`, finds `info/icon` canvas
- Handles **UOL icon references**: 663 Consume + 37 Etc items use UOL (e.g. `../../02040008/info/icon`)
- `resolveItemIconUol(fileJson, uolPath)` navigates the relative path within the same WZ file
- `loadEquipIcon(equipId, category)` → fetches `Character.wz/{category}/{padded}.img.json > info/icon`
- All icons cached in `iconDataUriCache` as base64 data URIs

### Reactor Debug

- `drawReactorMarkers()` — magenta squares + reactor ID + HP/state (shown with life markers)
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
- Dark background fill (`rgba(4, 8, 18, 0.94)`)
- Modern flat style: system font, no text shadows, no gradients
- "Loading map assets" title (white 85% opacity, 15px system font)
- Progress bar: flat pill shape (full rounded corners), white 8% bg, white 70% fill
- Verbose status label + percentage: `"Loading assets 12/48 — 25%"` (white 45% opacity)


### Animated Orange Mushroom
- Sprites preloaded from `resourcesv2/mob/orange-mushroom/` (manifest.json + 6 PNGs)
- `_loadingMushroom` state: frames, position, facing, bounce phase, animation timer
- Runs back and forth within progress bar horizontal bounds
- 1.2× scale, `move` stance (3 frames), bounce via `sin(phase) * -8`
- WZ sprites face left natively → flipped when moving right
- 70px margin above progress bar (groundY = barY - 70)
- Fallback: gold spinning circle shown while mushroom assets still loading
  (14px radius, 1.2 rad arc, 80px above bar)

### Login BGM
- Preloaded from `resourcesv2/sound/login.mp3` (mono, 48kbps, 2.2MB)
- `startLoginBgm()`: plays looped at 35% volume during loading
- Skips if map BGM already active (`runtime.bgmAudio && !runtime.bgmAudio.paused`)
- `stopLoginBgm()`: called on `loading.active = false` (success + error paths)
- `preloadLoadingScreenAssets()` runs in parallel with `loadMap()` (non-blocking)

### Player Init After Load
- Spawn portal lookup, player x/y/velocity, foothold placement, camera positioning,
  and animation state reset all happen AFTER `preloadMapAssets()` completes
- Player cannot interact with the map until loading finishes

### HUD Buttons During Loading
- All HUD buttons (Key Bindings, Settings, Debug) hidden with `.hud-hidden` until
  first map load completes (`showHudButtons()` on `loading.active = false`)
- Hover shows custom tooltip popup below button (dark frosted glass style)

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

## Tile Overlay (Debug)

- Toggle via debug panel checkbox (`debug-tiles-toggle`), off by default
- Requires `overlayEnabled` master toggle
- `drawTileOverlay()` iterates all layers' tiles and renders:
  - Cyan bounding box (from tile position + origin offset + image dimensions)
  - Small cyan dot at the tile's origin point (x, y)
  - Name label: `{u}:{no}` (tile type and number from WZ, e.g. `enV0:0`)
  - Position label: `{x},{y}` (world coordinates)
- Uses `isWorldRectVisible()` for viewport culling
- Color: `rgba(56, 189, 248, ...)` (sky blue / cyan)

## Ping HUD

- Toggle via Settings > Display > "Show Ping" checkbox (`settings-ping-toggle`)
- Draggable `game-window` HTML element (`#ping-window`), not canvas-drawn
- Shows colored indicator dot + ping value in ms
  - Green (≤80ms), Yellow (≤200ms), Red (>200ms), Grey (offline/initializing)
- Three states: "Offline", "Initializing...", "{N} ms"
- Updated on every `pong` WS response (5s interval) and on disconnect
- Closing via × unchecks the setting and saves
- Setting persisted in localStorage with other settings

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
- Drop spawns at `(player.x, player.y - 4)` — X is fixed at player position, never changes
- Foothold Y found via `findFootholdAtXNearY` / `findFootholdBelow` at drop X
- `destY = footholdY - 4` (C++ parity: `basey = dest.y() - 4`)

### Drop Animation (C++ `Drop::update` parity)
- **No horizontal movement** — X stays fixed at drop position
- Initial `vspeed = -5.0` (upward arc), gravity `0.14/tick`, terminal velocity `8`
- Spin while airborne: `angle += 0.2` per tick (C++ `SPINSTEP = 0.2f`)
- Landing: when `Y >= destY` while falling → snap to `destY`, switch to FLOATING
- Fixed-tick sub-stepping at 60Hz for stable simulation
- Item is only lootable once animation completes (FLOATING state)

### Drop States (C++ parity)
- **DROPPED** (`onGround=false`): gravity-driven vertical arc with spin, X fixed
- **FLOATING** (`onGround=true`): bob `y = basey + 5.0 + (cos(phase) - 1.0) * 2.5`, phase += 0.025/tick
- **PICKEDUP** (`pickingUp=true`): fly toward player, fade out over 400ms

### Drop Rendering (`drawGroundDrops`)
- Icon drawn at world position with camera transform
- Bob offset `5.0 + (cos(phase) - 1.0) * 2.5` applied when floating (C++ parity)
- Rotation applied when airborne
- Opacity modulated during pickup animation
- No text labels on ground drops

### Loot Pickup
- Z key (configurable) triggers `tryLootDrop()`
- Uses player touch hitbox AABB overlap with drop bounds (32×32 centered on drop position)
- Allowed in any stance except sitting (`action === "sit"`)
- Only lootable when `drop.onGround` is true (landing animation must complete first)
- One item per press (C++ `lootenabled` parity)
- Item returns to inventory (stacks if same ID, assigns free slot)
- Full tab rejects pickup with log message
- PickUpItem sound plays

### Item Drag System
- `draggedItem` state: active, source, sourceIndex, id, name, qty, iconKey, category
- Ghost item (`<img id="ghost-item">`) follows cursor at 60% opacity, z-index 99998,
  positioned with bottom-right at cursor via `transform: translate(-100%, -100%)`
- Source slot dims to 40% while dragged
- DragStart/DragEnd/DropItem/PickUpItem sounds from WZ
- Escape or map change cancels drag

### Inventory Tab System (C++ UIItemInventory parity)
- 5 tabs: EQUIP, USE, SETUP (Set-up), ETC, CASH
- Tab determined by item ID prefix: `floor(id / 1000000)` → 1=EQUIP, 2=USE, 3=SETUP, 4=ETC, 5=CASH
- `inventoryTypeById(id)` helper (C++ `InventoryType::by_item_id`)
- Each `playerInventory` item has `invType` field for tab filtering
- `currentInvTab` state controls which tab is visible
- Tab buttons in HTML `#inv-tabs` container with active highlighting
- `refreshInvGrid()` filters inventory by `currentInvTab`

### Equip / Unequip System
- **Double-click equip slot** → `unequipItem(slotType)`:
  removes from `playerEquipped`, adds to inventory EQUIP tab, deletes equip WZ data,
  clears `characterPlacementTemplateCache` → sprite re-renders without the equip
- **Double-click inventory EQUIP item** → `equipItemFromInventory(invIndex)`:
  moves from inventory to `playerEquipped`, swaps existing if slot occupied,
  calls `loadEquipWzData(id)` to fetch Character.wz JSON, clears placement cache
- **Drop equipped item** on map:
  removes from `playerEquipped`, deletes WZ data, clears placement cache
- **Character rendering** uses `playerEquipped` (not `DEFAULT_EQUIPS`) to iterate equipment
  in `getCharacterFrameData()` — dynamically reflects equip changes on sprite
- **WZ data loading**: `loadEquipWzData(id)` resolves WZ folder via `equipWzCategoryFromId(id)`
  (item ID prefix → Character.wz subfolder: Cap, Coat, Pants, Shoes, Weapon, etc.)
- **Equip slot mapping**: `equipSlotFromId(id)` determines which `playerEquipped` key an item
  occupies (C++ `EquipData::get_eqslot` parity)

## Chair Rendering System

### Chair Sprite Loading
- `loadChairSprite(itemId)` → async, fetches `Item.wz/Install/{prefix}.img.json`
- Extracts `effect/0` canvas from the chair's imgdir node
- Decodes PNG, stores `{ img, originX, originY, width, height }` in `_chairSpriteCache` (Map)
- `_chairSpriteLoading` Set prevents duplicate concurrent loads
- Chair items are in SETUP tab, ID range 3010000–3019999 (`isChairItem()`)

### Chair Positioning
- Chair sprite drawn **below** character (z=-1 parity with C++ `EffectLayer::drawbelow`)
- Bottom edge of chair aligns with player's feet (ground level):
  `drawY = screenY - chairSprite.height`
- Horizontal: origin-based centering `drawX = screenX - chairSprite.originX`
- Same positioning for both local player and remote players

### Chair Facing / Flip
- Chair flips to match character facing direction
- When `flipped` (facing right): `ctx.save()` → translate → `ctx.scale(-1, 1)` → draw → restore
- Flip mirror X: `drawX = screenX - (width - originX)` to keep origin-anchored

### Sit Action
- `useChair(itemId)` sets `player.action = "sit"`, `player.chairId = itemId`, zeroes velocity
- Physics update **skips action override** when `player.chairId` is set
  (prevents `"sit"` being overwritten to `"stand1"` each frame)
- `standUpFromChair()` clears `chairId`, resets action to `"stand1"`, broadcasts via WS
- Called on any movement input, jump, climb, or map change

### Weapon Hidden While Sitting
- `getCharacterFrameData()` skips "Weapon" slot when `action === "sit"`
  (local player check via `slotType === "Weapon"`)
- Remote player check via `equipSlotFromId(Number(itemId)) === "Weapon"`
- Placement template cache key includes action, so sit/stand templates are distinct

### Remote Player Chair Sync
- `player_sit` WS message sets `rp.action` and `rp.chairId`, calls `loadChairSprite()`
- Snapshot interpolation **skips action/facing override** when `rp.chairId` is set
  (prevents movement snapshots from overwriting "sit" action with "stand1")
- `map_state` and `player_enter` messages include `chair_id` for late-joining clients

## WZ Cursor System

- Cursor is an HTML `<img>` overlay (`#wz-cursor`) positioned at `position:fixed; z-index:99999`
- Loaded from `UI.wz/Basic.img.json` → `Cursor` node, states keyed by numeric ID
- States: `IDLE=0` (1 frame), `CANCLICK=1` (2 frames), `CLICKING=12` (1 frame)
- `setCursorState(state)` changes state, resets frame index/timer
- `updateCursorAnimation(dtMs)` advances multi-frame animation (called in game loop tick)
- `updateCursorElement()` syncs HTML element src/position to current state/frame
  - Called in game loop tick (after `updateCursorAnimation`) AND on mouse move events
  - Game-loop call ensures state changes (click/release) and animation frame advances
    are reflected immediately, even when the mouse is stationary
- `wzCursor.clickState` flag: true while mouse button is held down
  - Set on `pointerdown`, cleared on `pointerup`
  - Guards `mousemove` handler from overriding CLICKING state with hover state
- On `pointerup`: restores hover-appropriate state (CANCLICK if over NPC/dialogue option, else IDLE)
  matching C++ `UI::send_cursor(false)` → `state->send_cursor(pos, IDLE)` flow

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
- **Chat bubble** (`drawChatBubble()`): white bubble with subtle blue-gray border, dark text,
  Dotum font. Positioned above player head. **Prone-aware**: Y offset is 70px above feet
  normally, 40px when `action === "prone"` or `"proneStab"` (C++ parity: `chatballoon.draw(absp - Point(0, 85))`
  is a fixed offset from feet — shorter prone sprite means bubble naturally sits lower).
- **Status bar** (`drawStatusBar()`): frosted dark background, gold level text with shadow (Dotum font),
  HP (red gradient + gloss) and MP (blue gradient + gloss) gauge bars.
  Uses `player.hp/maxHp/mp/maxMp/exp/maxExp/level/job`. Default: Lv1 Beginner, 50/50 HP, 5/5 MP.
- **Map name banner** (`drawMapBanner()`): MapleStory-style dark ribbon with:
  - Map mark icon (38×38, loaded from `MapHelper.img.json`, cached in `_mapMarkImages`)
  - Street name in light blue-gray (11px Dotum)
  - Map name in bold gold (#f5c842, 16px Dotum) with warm glow
  - Dark semi-transparent background with blue tint, gold accent line on left
  - Cubic ease-out slide-in from right (350ms), fade-out over 900ms, 3.5s total display
  - Centered horizontally at 12% screen height. Triggered by `showMapBanner(mapId)`.
- **Player name label** (`drawPlayerNameLabel()`): dark rounded tag with subtle blue border tint,
  white text with shadow, Dotum font. Positioned at player feet.
- **Minimap** (`drawMinimap()`): dark frosted glass panel, gold map name title, subtle blue borders.
- **Loading screen** (`drawLoadingScreen()`): gold title, gold gradient progress bar with gloss highlight.
- **HUD style**: All canvas-drawn HUD uses Dotum font with Arial fallback. Frosted glass
  aesthetic with warm gold accents, cool blue tints, gradient fills with gloss highlights.
- **Client-side combat demo**: click mobs to attack, damage numbers float upward, mob HP bars
  shown for 3s after hit, mob hit1/die1 stance animation, fade-out on death, respawn after 8s.
  EXP awarded on kill with level-up system (increases maxHP/MP/EXP).
  Pointer cursor on mob hover. Hit/Die SFX from `Sound.wz/Mob.img`.
- **NPC interaction system**: click any visible NPC to open dialogue. No range limit.
  NPCs with known scripts (taxis, Spinel) show specific options. NPCs with unknown scripts
  show flavor text + travel options to all major towns. NPCs without scripts show flavor text.
  Cursor changes to pointer on NPC hover. Option highlight on hover with gold color.
- **Minimap**: collapsible panel showing map image with markers. Toggle via settings.
  Click +/− to collapse/expand. World-to-minimap coordinate transform using map center offset and scale.
  Remote player positions interpolated from server snapshots — appear on minimap in real-time.
  Marker colors: yellow (local player + white border), red (remote players),
  green (NPCs), blue (visible portals type 2), purple (reactors).
- **Pickup journal**: right-aligned text above chat bar (`#pickup-journal`). Shows
  "You picked up [qty] ItemName" entries. Newest appends to bottom. Entries fade after 5s
  (1s CSS opacity transition), then removed from DOM. Plain white text with drop shadow, no card.
- **Drop quantity modal**: HUD-styled modal for dropping stackable items with qty > 1.
  `_dropQtyModalOpen` flag suppresses ghost item rendering in `updateCursorElement`.
  Cursor click state reset on modal open (prevents stuck clicking animation).
  Guard prevents double-open from wrapper+canvas pointerdown firing on same event.
