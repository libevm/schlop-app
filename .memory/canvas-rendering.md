# Canvas Rendering Pipeline

> Single-file client: `client/web/app.js` — all rendering is 2D canvas (`ctx`).

## Game Loop

```
tick(timestampMs)          ← requestAnimationFrame
  ├─ update(dt)            ← game logic (physics, AI, camera, animation)
  └─ render()              ← draw everything to canvas
```

- Fixed at display refresh rate via `requestAnimationFrame`
- `dt` clamped to max 50ms to prevent spiral-of-death
- `tick` is wrapped in try/catch → errors logged to `rlog()`, RAF continues

## Render Order (render function)

```
1. Clear canvas (black fill)
2. If loading.active → drawLoadingScreen() → return
3. If !runtime.map  → drawTransitionOverlay() → return
4. drawBackgroundLayer(0)       ← back backgrounds (front=0)
5. drawMapLayersWithCharacter() ← tiles + objects + player (z-sorted)
6. drawReactors()               ← reactor sprites (state 0 idle)
7. drawLifeSprites()            ← mobs + NPCs
8. drawRopeGuides()             ← debug overlay (if enabled)
9. drawPortals()                ← portal sprites
10. drawFootholdOverlay()       ← debug overlay (if enabled)
11. drawLifeMarkers()           ← debug overlay (if enabled)
    drawReactorMarkers()        ← debug overlay (magenta, if life markers enabled)
12. drawBackgroundLayer(1)      ← front backgrounds (front=1)
13. drawChatBubble()
14. drawMinimap()
15. drawNpcDialogue()           ← NPC dialogue box with portrait + options
16. drawTransitionOverlay()     ← fade-in/out black overlay
```

## Coordinate Systems

- **World coords**: map positions (pixels). Origin varies per map.
- **Screen coords**: canvas pixel positions. (0,0) = top-left.
- `worldToScreen(worldX, worldY)` → `{ x, y }` screen position
  - `screenX = worldX - camera.x + canvasWidth/2`
  - `screenY = worldY - camera.y + canvasHeight/2`
- **No vertical bias**: `sceneRenderBiasY()` was removed — it shifted world rendering down
  on tall canvases, causing the character to render off-screen when camera clamped to map bounds.
- `BG_REFERENCE_WIDTH = 800`, `BG_REFERENCE_HEIGHT = 600` — C++ reference resolution (used for background parallax only)

## Drawing Primitives

- `drawWorldImage(image, worldX, worldY, opts)` — world-space draw with optional flip
- `drawScreenImage(image, x, y, flipped)` — screen-space draw with optional flip
- Both round coordinates to integers for pixel-perfect rendering
- Flip is done via `ctx.translate + ctx.scale(-1, 1)`

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

requestMeta(key, loaderFn)
  → if metaCache has key → return cached
  → else call loaderFn() → store result in metaCache
  → loaderFn typically: fetchJson → navigate JSON tree → canvasMetaFromNode()

requestImageByKey(key)
  → if imageCache has key → return cached
  → if imagePromiseCache has key → return pending promise
  → get meta from metaCache
  → validate meta.basedata (string, length >= 8)
  → new Image(), src = data:image/png;base64,${meta.basedata}
  → on load → imageCache.set(key, image)
  → on error → rlog("IMG DECODE FAIL"), resolve(null)

getImageByKey(key)                           ← synchronous, used in render loop
  → requestImageByKey(key)                   ← fire-and-forget (starts decode if needed)
  → return imageCache.get(key) ?? null       ← only returns if already decoded
```

### Key Naming Conventions

| Asset Type      | Key Pattern                                        |
|-----------------|----------------------------------------------------|
| Background      | `back:{bS}:{no}:{ani}`                             |
| Background frame| `back:{bS}:{no}:{ani}:f{frameIdx}`                 |
| Tile            | `tile:{tileSet}:{u}:{no}`                           |
| Object          | `obj:{oS}:{l0}:{l1}:{l2}:{frameNo}`                |
| Object frame    | `obj:{oS}:{l0}:{l1}:{l2}:{frameIdx}`               |
| Portal          | `portal:{type}:{frame}`                             |
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

**Climbing Parity** (C++ `CharLook::draw` climbing branch):
- Weapon: hidden during climbing (`getEquipFrameParts` returns `[]` when `CLIMBING_STANCES` has action and equip has no stance)
- Hair: uses `backHair`/`backHairBelowCap` from `backDefault` via UOL resolution (e.g. `../../backDefault/backHair`)
- Face: not drawn during climbing (suppressed in `getCharacterFrameData`)
- Head: uses back section (`../../back/head` UOL resolved by `getHeadFrameMeta`)
- Coat/Pants/Shoes: use back z-layers (`backMailChest`, `backPants`, `backShoes`) from their climbing stances
- Body: uses `backBody` z-layer from climbing stance

**Preloading**: `addCharacterPreloadTasks()` preloads up to 6 frames per action for all character
parts (body, head, face, hair, equipment). Keys: `char:{action}:{frame}:{partName}`.

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
- Parallax: `rx/ry` control scroll speed relative to camera
- Tiling: count-based (`htile × vtile`) matching C++ `MapBackgrounds.cpp`
- `blackBackground`: first background with empty bS triggers black fill

## Map Layers

`drawMapLayer(layer)`:
- Draws objects first, then tiles (both z-sorted)
- Animated objects use `objectAnimStates` for frame selection
- Falls back to base frame if animated frame missing
- Origin-based positioning: `worldX = obj.x - origin.x`

`drawMapLayersWithCharacter()`:
- Iterates layers 0–7
- Draws player character at the matching `footholdLayer`
- Player at layer 7 when airborne or climbing

## Life Sprites (Mobs / NPCs)

`drawLifeSprites()`:
- Iterates `lifeRuntimeState` entries
- Position from `state.phobj.x` / `state.phobj.y` (physics object)
- Screen Y uses `worldY - cam.y + halfH` — same formula as `worldToScreen`
- Facing from `state.facing` (mobs) or `life.f` (NPCs)
- Off-screen culling with 100px margin
- Origin-based positioning from frame metadata (`frame.originX`, `frame.originY`)
- Does NOT use `drawWorldImage` — handles flip via `ctx.translate/scale` directly
- Name labels: yellow for NPCs, pink for mobs

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
- **Short-map camera clamping** (fixed): when map is shorter than viewport, camera follows
  player between anchor-top and anchor-bottom positions, preventing void on both sides
  while keeping the player on-screen.
- **NPC dialogue overlay**: drawn after minimap, before transition overlay. Blocks player
  movement, jumping, and portal use while active. MapleStory-style box with NPC portrait,
  name/function header, word-wrapped text, clickable options for scripted NPCs, page
  navigation, and footer hint.
- **NPC interaction system**: click any visible NPC to open dialogue. No range limit.
  NPCs with known scripts (taxis, Spinel) show specific options. NPCs with unknown scripts
  show flavor text + travel options to all major towns. NPCs without scripts show flavor text.
  Cursor changes to pointer on NPC hover. Option highlight on hover with gold color.
