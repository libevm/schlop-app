# .memory Sync Status

Last synced: 2026-02-19T20:00:00+11:00
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
- `client/web/app.js`: **8492 lines** (single-file debug web client)
- `client/src/` files: 13 (Phase 6 scaffolding — world-stage, combat-orchestrator, entity-pool)
- `server/src/` files: 6 (data-provider, server, build/dev/test harness)
- `packages/shared-schemas/src/` files: 4 (Zod schemas, constants)
- `tools/build-assets/src/` files: 13 (scanner, extractors, JSON reader, blob store, pipeline report)
- `tools/` other (observability, quality, policy, docs, workspace): 23 .mjs/.js files
- `docs/` files: 8 (process docs, pwa-findings, index)
- `resources/` WZ JSON: **22,182 files** across 16 WZ directories
- CI: **135 tests pass** across all workspaces (`bun run ci`)

## What was synced in this pass

### Wall collision parity rollback + hit-face cache fix (2026-02-19)
- User report: wall collision too aggressive; short vertical walls should not all block (e.g. `103000900`).
- C++ parity alignment applied in `client/web/app.js`:
  - removed `resolveWallLineCollisionX` global wall-segment fallback
  - `resolveWallCollision(...)` now follows foothold-chain `getWallX` + side wall fallback only
  - retained side-wall safety clamp via `clampXToSideWalls(...)`.
- Effect: wall blocking now matches C++ `FootholdTree::get_wall` behavior more closely and avoids
  over-blocking on local vertical walls.

- Follow-up fix for hit facial-expression behavior:
  - character placement template cache now keys by face expression/frame
  - `composeCharacterPlacements(...)` passes current face expression/frame into template selection
  - prevents stale default-face templates from masking hit expression overrides.

Validation:
- `bun run ci` ✅

### Face/head mapping correction after hit-visual pass (2026-02-19)
- Follow-up for report: facial expression mapping was still incorrect relative to head.
- Root cause: interim face placement logic ignored face frame brow offsets.
- Updated `client/web/app.js` character composition:
  - face now prefers `brow` anchor (when available)
  - face anchor solve now uses `brow` vector offsets from face frames (`map.brow`)
- C++ parity reference:
  - `Face::Frame` applies `texture.shift(-brow)`
  - `CharLook::draw` places face by drawinfo face position
- Effect: expression frames map correctly to head again.

Validation:
- `bun run ci` ✅

### Player-hit visual parity fix (blink + face alignment) (2026-02-19)
- User report: hit blink looked unlike original client; hit face appeared slightly above head.
- Reference check:
  - C++ `Char::draw` applies invincibility pulse as RGB color modulation (`Color(rgb, rgb, rgb, 1)`), not alpha fade.
  - C++ `CharLook::draw` places face via body draw-info face position (`drawinfo.getfacepos(...)`) with face texture origin.
- Updated `client/web/app.js`:
  - replaced alpha-based blink modulation with color-brightness modulation in `drawCharacter()`
  - `playerHitBlinkColorScale(...)` keeps the C++ pulse curve and range
  - composition now special-cases face placement to use world `brow` anchor + origin-only offset
    (ignores expression-local brow offset vectors)
- Effect:
  - hit blink now matches original darker pulse feel
  - hit expressions stay aligned with head (no upward drift).

Validation:
- `bun run ci` ✅

### Prone hitbox posture-parity update (2026-02-19)
- Follow-up for report: prone posture should use a prone-like collision profile.
- Reference scan snapshot captured before change:
  - C++ `MapMobs.cpp::find_colliding` uses a fixed vertical sweep rect concept
  - half-web TS (`MapleCharacter.ts`) computes body rectangles from rendered parts (stance-dependent)
- Updated `client/web/app.js`:
  - added `PLAYER_TOUCH_HITBOX_PRONE_HEIGHT` and `PLAYER_TOUCH_HITBOX_PRONE_HALF_WIDTH`
  - added `playerTouchBoxMetrics(player)`
  - updated `playerTouchBounds(...)` to switch metrics for prone/sit on-ground states
- Effect: touch-damage collision shape now better mirrors prone posture while preserving swept movement checks.

Validation:
- `bun run ci` ✅

### 103000900 jump-through wall tunneling fix (stopped jump + fast airborne) (2026-02-19)
- Follow-up for report: in map `103000900`, player could still jump through walls when launching from wall contact
  or at higher horizontal velocity.
- Updated `client/web/app.js`:
  - `resolveWallCollision(...)` signature now uses both `oldY` and `nextY`
  - `resolveWallLineCollisionX(...)` now sweeps vertical probe over movement span (`oldY..nextY`)
  - collision resolution places X slightly inside legal side (`wallX ± 0.001`) to avoid exact-boundary tunneling
  - added `clampXInsideSideWalls(...)` and applied it in movement and hit-time safety clamps
- Effect: jumping toward wall from standstill and high-speed airborne approaches now collide reliably.

Validation:
- `bun run ci` ✅

### High-velocity airborne side-wall pass-through fix (2026-02-19)
- Follow-up for report: player still felt wall resistance but could jump through with enough velocity.
- Updated `client/web/app.js`:
  - added `resolveWallLineCollisionX(oldX, newX, nextY, map)`
  - integrated it into `resolveWallCollision(...)` after foothold/global wall checks
  - strict crossing against `map.wallLines` now clamps nearest crossed wall segment
- Effect: fast airborne crossings now collide reliably instead of tunneling through side walls.

Validation:
- `bun run ci` ✅

### Side-wall jump-through regression fix after simplification (2026-02-19)
- Follow-up for report: moving into wall blocked correctly, but airborne jump could pass through side wall.
- Root cause: simplified clamp path prioritized raw foothold extrema (`footholdBounds.minX/maxX`),
  which are outside the intended inset collision limits.
- Updated `client/web/app.js`:
  - `sideWallBounds(map)` now prefers `map.walls.left/right` first (C++-style inset walls)
  - foothold extrema are fallback only.
- Effect: jumping/airborne movement now clamps at same side-wall boundary as ground movement.

Validation:
- `bun run ci` ✅

### Side-wall collision simplification pass (2026-02-19)
- User requested simplification after iterative wall-collision patches.
- Updated `client/web/app.js` to remove layered wall-line + knockback-lock logic.
- Introduced shared wall helpers:
  - `sideWallBounds(map)`
  - `clampXToSideWalls(x, map)`
- `resolveWallCollision(...)` now keeps foothold-chain check but always finishes with a hard side clamp.
- Post-physics and hit-time knockback clamps now use the same shared side-wall clamp path.
- Hard side limits prioritize `footholdBounds.minX/maxX` (raw foothold extrema), then fall back to legacy `map.walls`.

Validation:
- `bun run ci` ✅

### Knockback wall-pass-through fix (directional wall-lock) (2026-02-19)
- Follow-up for report: knockback into wall could still slip through when starting exactly on wall X.
- Updated `client/web/app.js`:
  - added `PLAYER_KNOCKBACK_WALL_LOCK_MS`
  - added player state: `knockbackWallLockUntil`, `knockbackDirection`
  - `applyPlayerTouchHit(...)` now marks knockback direction + short wall-lock window
  - `resolveWallLineCollisionX(...)` now supports:
    - strict crossing mode (normal movement)
    - touch-start crossing mode (knockback-only)
  - `resolveWallCollision(...)` enables touch-start mode only while wall-lock is active and movement matches knockback direction.
- Effect: knockback now collides against walls even when knockback starts exactly at wall edge,
  without reintroducing normal wall-edge stickiness.

Validation:
- `bun run ci` ✅

### Wall-edge stickiness fix after knockback hardening (2026-02-19)
- Follow-up for report: player could not walk away once positioned exactly at wall edge.
- Updated `client/web/app.js`:
  - `resolveWallLineCollisionX(...)` now uses strict crossing with epsilon
  - avoids treating "on-wall then moving away" as a crossing collision
- Retains knockback/mid-air wall bypass protection while removing wall-edge stickiness.

Validation:
- `bun run ci` ✅

### Side-wall collision hardening for knockback escape case (2026-02-19)
- Follow-up for report: side-wall bypass still possible during knockback in `103000903`.
- Updated `client/web/app.js`:
  - added `resolveWallLineCollisionX(...)` (direct vertical wall segment crossing check using `map.wallLines`)
  - integrated fallback into `resolveWallCollision(...)` after foothold/global-wall checks
  - nearest crossed wall in movement direction now clamps X even when foothold linkage is unreliable
  - added immediate X wall clamp in `applyPlayerTouchHit(...)` to avoid single-frame knockback penetration
- Effect: knockback states now respect side walls reliably.

Validation:
- `bun run ci` ✅

### Side-wall collision hardening (residual mid-air bypass) (2026-02-19)
- Follow-up fix for reported remaining side-wall bypass when jumping in mid-air.
- Updated `client/web/app.js` player update tail:
  - added post-physics X safety clamp to `map.walls.left/right`
  - clears outward velocity on clamp (`vx=0` when moving into wall)
- This complements `resolveWallCollision` and closes transient states where crossing checks could miss.

Validation:
- `bun run ci` ✅

### Side-wall bypass fix at high Y (map 103000903) (2026-02-19)
- Fixed player side-wall collision edge case where jumping high could bypass wall clamps when
  foothold lookup returned null during airborne movement.
- Updated `client/web/app.js` `resolveWallCollision(...)`:
  - if no current foothold is available, now falls back to global wall bounds (`map.walls.left/right`)
  - preserves collision clamp behavior instead of early-returning the unconstrained X.
- Effect: side walls remain solid even at high Y in maps like `103000903`.

Validation:
- `bun run ci` ✅

### Map 103000903 laser cooldown parity fix (2026-02-19)
- Investigated "reappearing too quickly" laser cycles after orientation fix.
- Root cause: object animation frame discovery incorrectly included numeric `$uol` alias nodes as independent frames.
  - C++ `Animation` only includes bitmap frames (`$imgdir`/`$canvas`), so alias-only nodes should not extend the timeline.
  - Including aliases shortened effective cooldown cycles for laser effects.
- Updated `client/web/app.js`:
  - `objectAnimationFrameEntries()` now only includes numeric `$imgdir` and direct numeric `$canvas` frames
  - removed `$uol` branch from `loadAnimatedObjectFrames()` frame resolution
- Result: laser cooldown/timing in map `103000903` now matches C++ behavior more closely.

Validation:
- `bun run ci` ✅

### Map 103000903 laser parity fix (flip semantics + orientation) (2026-02-19)
- Investigated remaining wrong-looking/static-ish laser segments in `103000903`.
- Root cause: map object field `f` was interpreted as frame number in web code, but C++ uses it as horizontal flip flag (`Obj.cpp`).
- Updated `client/web/app.js`:
  - object parse now sets `flipped` from `row.f` and uses base frame `0`
  - object draw path now mirrors origin and draws with `flipped` flag
  - trap hitbox bounds now mirror `lt/rb` X offsets when object is flipped
- Result: laser segments align/orient correctly and pulse/timing behavior matches expected C++ object animation flow.

Validation:
- `bun run ci` ✅

### Debug hitbox overlay checkbox + renderer (2026-02-19)
- Added new debug panel toggle in `client/web/index.html`:
  - `debug-hitboxes-toggle` labeled **Draw hitboxes**.
- Wired toggle state in `client/web/app.js`:
  - DOM binding (`debugHitboxesToggleEl`)
  - runtime flag (`runtime.debug.showHitboxes`)
  - overlay-master disabled handling in `syncDebugTogglesFromUi()`
  - runtime summary field (`debug.showHitboxes`)
- Added hitbox rendering pass:
  - `drawHitboxOverlay()` called from `render()` when overlays + hitboxes are enabled
  - draws player touch bounds, portal trigger bounds, trap hazard bounds, and mob frame bounds
  - uses culling-aware `drawWorldDebugRect()` to avoid off-screen draw overhead.

Validation:
- `bun run ci` ✅

### Map 103000903 static laser fix (a0/a1 opacity animation) (2026-02-19)
- Investigated trap laser objects in map `103000903` and found many frames reuse identical bitmaps
  while relying on WZ alpha ramp fields (`a0` / `a1`) for perceived animation.
- Updated `client/web/app.js`:
  - `canvasMetaFromNode()` now parses opacity metadata as `opacityStart` / `opacityEnd`
  - added `objectFrameOpacity(meta, state, obj)` to compute per-frame alpha from animation timer progress
  - `drawMapLayer()` now applies per-object `ctx.globalAlpha` modulation for animated object frames
- This restores laser/lightning pulse animation that appeared static despite frame stepping.

Validation:
- `bun run ci` ✅

### Map 103000900 lightning animation + mob touch damage (2026-02-19)
- Fixed missing power-line/lightning animation by extending object animation frame discovery in `client/web/app.js`:
  - supports numeric `$imgdir`, direct numeric `$canvas`, and numeric `$uol` alias frame sets
  - added explicit object `frameKeys` sequence to render non-trivial frame-ID sets reliably
- This restores animation for trap laser electric line objects in subway map `103000900`
  (e.g., `Obj/trap/laser/electH2000/elect2000`).
- Added mob touch-damage collision pass:
  - `updateMobTouchCollisions()` runs after life physics update
  - overlap check uses player sweep rect and current mob frame bounds
  - only mobs with `bodyAttack=1` are damaging (`touchDamageEnabled`)
  - damage sourced from mob `PADamage` (`touchAttack`)
  - hit response reuses existing player-hit pipeline (damage number, knockback, pain face, blink/i-frames)

Validation:
- `bun run ci` ✅

### Player hit-reaction visuals (blink + pain face) (2026-02-19)
- Added C++-inspired player hit feedback visuals in `client/web/app.js`.
- C++ references checked:
  - `Character/Char.cpp` (`invincible` pulse + `show_damage` behavior)
  - `Character/Look/Face.cpp` (available face expression names, including `pain`/`hit`)
  - `Character/Look/CharLook.cpp` (alerted state and expression update flow)
- Web implementation:
  - Added temporary face override support to `runtime.faceAnimation`:
    - `overrideExpression`, `overrideUntilMs`
  - Added `pickPlayerHitFaceExpression()` priority fallback:
    - `pain` → `hit` → `troubled` → `stunned` → `bewildered`
  - Added `triggerPlayerHitVisuals(nowMs)` and invoked it on trap damage.
  - `updateFaceAnimation(dt)` now plays override expression for `PLAYER_HIT_FACE_DURATION_MS` (500ms), then returns to normal default/blink cycle.
  - Added whole-character invincibility blink in `drawCharacter()` via `playerHitBlinkOpacity(nowMs)` using C++ pulse formula (`0.9 - 0.5*abs(sin(progress*30))`).
- Map-load reset now clears face override fields.

Validation:
- `bun run ci` ✅

### Trap hitbox collision + player knockback (2026-02-19)
- Implemented damaging map-object trap collisions for player hit/knockback flow in `client/web/app.js`.
- Context scan performed and applied to web behavior:
  - C++ references: `Gameplay/Stage.cpp`, `Gameplay/MapleMap/MapMobs.cpp`, `Character/Player.cpp`, `Character/Char.cpp`
  - Half-web reference: `TypeScript-Client/src/MapleCharacter.ts`
  - Asset reference: `resources/Map.wz/Obj/trap.img.json`
- Implementation details:
  - Object metadata parsing now captures trap fields from object nodes:
    - `obstacle`, `damage`, `dir` via `objectMetaExtrasFromNode(...)`
  - Map-load hazard indexing:
    - `buildMapTrapHazardIndex(map)` creates `map.trapHazards` from object metas where `obstacle != 0 && damage > 0`
  - Added fixed-step trap collision pass:
    - `updateTrapHazardCollisions()` called during `update()` after object animation updates
    - player sweep bounds use `prevX/prevY` with C++-style vertical body span
    - trap bounds use `lt/rb` hitbox vectors + `objectMoveOffset(...)` for moving traps
  - Added hit response:
    - HP reduction from trap `damage`
    - floating damage number on player
    - knockback impulse (`±1.5 * PHYS_TPS`, `-3.5 * PHYS_TPS`)
    - `TRAP_HIT_INVINCIBILITY_MS = 2000`
- Added runtime diagnostics:
  - summary now includes `trapHazards` count and player trap i-frame remaining.

Validation:
- `bun run ci` ✅

### Map object motion support (spike ball animation fix) (2026-02-19)
- Investigated map `105040310` and identified "spike balls" as map objects (`Obj/trap/moving/nature/0`) using
  motion metadata (`moveType=1`, `moveW=200`) rather than multi-frame sprite animation.
- Implemented object motion rendering support in `client/web/app.js`:
  - `canvasMetaFromNode()` now captures `moveType`, `moveW`, `moveH`, `moveP`, `moveR`
  - added `objectMoveOffset(meta, nowMs)` sinusoidal offset helper
  - `drawMapLayer()` applies move offsets to object world position before culling/draw
- Result: moving trap objects now animate spatially instead of appearing static.

Validation:
- `bun run ci` ✅

### Portal frame warmup to fix static teleport arrows (2026-02-19)
- Added proactive portal animation frame warmup in `client/web/app.js`.
- New helper: `ensurePortalFramesRequested(portal)`
  - requests meta + decode for all frames in the portal's animation set once per type/image key
  - called from `drawPortals()` for visible portals
- Added `portalFrameWarmupRequested` set and clear on map load.
- Goal: prevent arrows appearing static when only frame 0 is ready while other frames lag/decode lazily.

Validation:
- `bun run ci` ✅

### Missing map ID redirect fallback (2026-02-19)
- Added map-id redirect support for absent extracted map files in `client/web/app.js`.
- New constant: `MAP_ID_REDIRECTS`.
  - currently maps `100000110` → `910000000`.
- `loadMap()` now resolves requested ID through redirects before fetching map JSON.
- Emits runtime log + chat info message when a redirect is applied.
- Prevents hard 404 failure path for known missing map IDs.

Validation:
- `bun run ci` ✅

### Portal animation fix (teleport arrows) (2026-02-19)
- Fixed portal/teleport arrow animation reliability in `client/web/app.js`.
- Changes:
  - Added tick-driven portal animation state (`runtime.portalAnimation`).
  - Added `updatePortalAnimations(dtMs)` with explicit frame cadence:
    - regular portals: 8 frames
    - hidden/script-hidden portals: 7 frames
    - `PORTAL_ANIMATION_FRAME_MS=100`
  - `drawPortals()` now selects frames from this runtime state instead of `performance.now()` sampling.
  - Added `portalFrameCount(portal)` helper and reused in portal preload + draw.
  - Reset portal animation state on map load.
- Effect: portal arrows animate consistently with game update loop and no longer appear stuck/static.

Validation:
- `bun run ci` ✅

### Decouple background Y from live character/camera movement (2026-02-19)
- Further removed residual character-linked background Y behavior.
- In `client/web/app.js`:
  - added `runtime.backgroundViewAnchorY` (set at map load / canvas resize)
  - `drawBackgroundLayer()` now uses anchored vertical view translation for background Y math
    (`anchoredViewY`) instead of live `viewY` derived from current camera
- Keeps fixed-resolution Y offset while preventing jump-time/air-time background scene drift.

Validation:
- `bun run ci` ✅

### Remove character-Y alignment from background scene bias (2026-02-19)
- Confirmed background scene offset is no longer derived from `player.y`.
- Kept only fixed-resolution offset behavior in `drawBackgroundLayer()`.
- Renamed local bias variable to avoid confusion:
  - `sceneCharacterBiasY` → `sceneFixedBiasY`
- No character/ground/air state now influences background scene Y alignment.

Validation:
- `bun run ci` ✅

### Fixed-resolution background Y alignment (undo jump-reactive bias) (2026-02-19)
- Removed jump-reactive/ground-reactive background bias state from `client/web/app.js`.
- Background scene Y placement now uses a uniform fixed-resolution bias:
  - `sceneCharacterBiasY = max(0, (canvasHeight - BG_REFERENCE_HEIGHT) / 2)`
- This keeps backdrop composition lower for 1280×960 while preventing any jump-linked scene motion.
- Cleaned associated state/reset logic from map load path.

Validation:
- `bun run ci` ✅

### Character-relative background Y alignment (2026-02-19)
- Adjusted background scene vertical placement for 1280×960 framing where the player is intentionally lower on screen.
- In `client/web/app.js` (`drawBackgroundLayer`):
  - added `sceneCharacterBiasY = clamp(player.y - camera.y, 0..cameraHeightBias())`
  - apply this Y bias to background scene placement after C++ shift/motion calculations.
- Effect: backdrop scenes track the lowered player composition better and no longer appear globally too high on tall viewports.

Validation:
- `bun run ci` ✅

### Background scene renderer revamp (C++ parity) (2026-02-19)
- Reworked `drawBackgroundLayer()` to align with C++ `MapBackgrounds.cpp` behavior and remove seam/patch artifacts.
- Key changes in `client/web/app.js`:
  - restored C++-style static background placement/parallax using view translation (`viewX/viewY`, `shiftX/shiftY` from `rx/ry`)
  - added `bgMotionStates` to model mobile background movement (types 4/5/6/7) as incremental state instead of absolute wall-clock position
  - moved tile wrap alignment to occur **before** origin offset (matching C++ draw flow)
  - kept count-based tiling (`htile/vtile = viewport/c + 3`) with integer-rounded base coordinates
  - clear `bgMotionStates` on map load alongside animation state resets
- Goal/result: eliminate visible background gaps/patches and improve deterministic scene placement at fixed 4:3 resolution.

**Files updated:**
- `client/web/app.js`
- `.memory/canvas-rendering.md`
- `docs/pwa-findings.md`

Validation:
- `bun run ci` ✅

### Background parallax removal (2026-02-19)
- Removed parallax offset from static background scene placement in `drawBackgroundLayer()`.
- New behavior:
  - static backgrounds (non-mobile) now follow camera with standard world→screen transform
  - mobile backgrounds (types 4/5/6/7) still keep time-based drift motion from `rx/ry`
- Cleaned unused `BG_REFERENCE_WIDTH` constant from `client/web/app.js`.

Validation:
- `bun run ci` ✅

### Background vertical placement adjustment (2026-02-19)
- Revisited background placement logic against references:
  - C++: `Gameplay/MapleMap/MapBackgrounds.cpp`
  - Half web port: `TypeScript-Client/src/Background.ts`
- Issue addressed: some backdrop scenes appeared slightly too high on tall viewports in specific map regions.
- Fix in `client/web/app.js` (`drawBackgroundLayer`):
  - added `bgParallaxCamY = camera.y + cameraHeightBias()`
  - non-mobile (`!vMobile`) vertical parallax now uses `bgParallaxCamY` for `shiftY`
- Effect: compensates tall-viewport camera Y bias for background parallax so scenes align better with map composition.

Validation:
- `bun run ci` ✅

### Jitter reduction for 60 FPS pacing (2026-02-19)
- Updated `tick()` pacing logic in `client/web/app.js` to accumulate elapsed time on **every** RAF callback.
- New behavior:
  - always advance `previousTimestampMs`
  - accumulate `elapsed` into `tickAccumulatorMs`
  - only run update+render once accumulator reaches `FIXED_STEP_MS`
- This removes the hard early-return timing gate that could skip near-16.67ms frames and cause visible micro-jitter.
- Kept fixed-step update, bounded catch-up, and effective ~60 FPS cap.
- FPS sampling now uses accumulated loop interval between presented frames (`pendingLoopIntervalMs`).

Validation:
- `bun run ci` ✅

### FPS counter accuracy fix after 60 FPS cap (2026-02-19)
- Root cause: FPS counter was derived from `runtime.perf.frameMs` (CPU processing time), not wall-clock loop interval.
  - With optimized render CPU time (~0.4ms), displayed FPS could appear as 2000+ even while loop was capped.
- Fix in `client/web/app.js`:
  - Added `runtime.perf.loopIntervalMs`.
  - FPS sample window now records processed tick interval (`elapsed`) instead of CPU frame time.
  - FPS badge detail switched to `loopIntervalMs`.
- Validation: `bun run ci` ✅

### 60 FPS game-loop cap (2026-02-19)
- Updated `tick()` loop in `client/web/app.js` to cap processed frames at 60 FPS.
- Behavior:
  - if RAF elapsed time is below `FIXED_STEP_MS` (16.67ms), skip processing and wait for next RAF.
  - keeps fixed-step simulation (`1/60`) and bounded catch-up logic.
- Effect: prevents update/render from running above 60 on high-refresh displays.

**Files updated:**
- `client/web/app.js`
- `.memory/canvas-rendering.md`
- `docs/pwa-findings.md`

Validation:
- `bun run ci` ✅

### FPS counter debug toggle (2026-02-19)
- Added top-right FPS counter overlay to canvas render path (`drawFpsCounter()`).
- Added debug panel toggle checkbox (`debug-fps-toggle`) under Overlays.
- Wired runtime toggle state (`runtime.debug.showFps`) + sync/input listeners.
- FPS badge shows:
  - estimated FPS (rolling p50 frame sample)
  - current frame ms
- FPS overlay is rendered in gameplay, loading, and no-map states when enabled.

**Files updated:**
- `client/web/index.html`
- `client/web/app.js`
- `.memory/canvas-rendering.md`
- `docs/pwa-findings.md`

Validation:
- `bun run ci` ✅

### Rendering optimization continuation (Phases 0-6) (2026-02-19)
- Continued implementation in `client/web/app.js` through the requested Phase 6 target.
- Validation: `bun run ci` ✅ (all workspace checks/tests passing).

**Newly implemented in this pass:**
1. **Phase 0 instrumentation**
   - Per-frame timings (`updateMs`, `renderMs`, `frameMs`) + rolling p50/p95 frame stats.
   - Per-frame counters (`drawCalls`, `culledSprites`, objects/tiles/life/portal/reactor draw counts).
2. **Phase 2 visibility + spatial index**
   - Added map-load spatial bucket index for tiles/objects (`SPATIAL_BUCKET_SIZE=256`).
   - Added visible bucket query in `drawMapLayer()`.
3. **Phase 3 partial cache**
   - Added per-layer visible-cell cache (`visibleCache`) to reuse candidate lists while camera remains in same bucket range.
4. **Phase 4 character caching**
   - Added `characterPlacementTemplateCache` keyed by `(action, frameIndex, flipped)` and reused via offsets each frame.
5. **Phase 5 loop smoothness**
   - Replaced frame-skip loop with fixed-step simulation (`FIXED_STEP_MS=1000/60`) + bounded catch-up.
   - Added 2D context hints (`alpha:false`, `desynchronized:true`) with fallback and disabled image smoothing.
6. **Phase 6 render-pass polish**
   - Added per-layer life bucketing to avoid repeated full scans per map layer.
   - Exposed perf stats in runtime summary.

**Memory/docs updates in same pass:**
- Updated `.memory/canvas-rendering.md` (loop model, spatial index/culling, perf counters, character template cache).
- Updated `.memory/physics.md` (fixed-step dt note for player update flow).
- Updated `.memory/rendering-optimization-plan-2026-02-19.md` progress status.
- Updated `docs/pwa-findings.md` chronological entry.

### Rendering optimization implementation (Phase 1 + early culling) (2026-02-19)
- Implemented hot-path rendering optimizations in `client/web/app.js`.
- Validation: `bun run ci` ✅ (all workspace checks/tests passing).

**Implemented changes:**
1. **Cache hot-path deallocation cleanup**
   - Added synchronous `getMetaByKey(key)` helper.
   - Updated `requestMeta` cache-hit behavior to return cached meta directly (no `Promise.resolve`).
   - Updated `requestImageByKey` cache-hit behavior to return cached image directly (no `Promise.resolve`).
   - Updated `getImageByKey` to only trigger decode request on cache miss.
2. **Lazy metadata requests (on miss only)**
   - `requestBackgroundMeta`, `requestTileMeta`, `requestObjectMeta` now skip work when meta exists and gate duplicate requests via `_metaRequested` flags.
   - `requestPortalMeta` now checks `metaCache`/`metaPromiseCache` before requesting.
3. **Sprite visibility culling**
   - Added `isWorldRectVisible(worldX, worldY, width, height, margin)` helper.
   - Added world-rect culling to `drawMapLayer()` (objects + tiles).
   - Added world-rect culling to `drawPortals()`.
4. **Runtime summary throttling**
   - Added `SUMMARY_UPDATE_INTERVAL_MS=200` (5Hz) for `updateSummary` calls.
   - Added debug panel visibility guard to skip summary rebuild when panel is hidden.

**Memory/docs updates in same pass:**
- Updated `.memory/canvas-rendering.md` for cache behavior, map/portal culling, and summary throttling.
- Updated `docs/pwa-findings.md` with this optimization implementation entry.

### Rendering performance planning + reference scan (2026-02-19)
- Performed a focused rendering performance audit of `client/web/app.js` hot paths.
- Read-only scans completed for:
  - Half web port: `/home/k/Development/Libevm/MapleWeb/TypeScript-Client/src`
  - C++ reference: `/home/k/Development/Libevm/MapleStory-Client`
- Added new authoritative plan doc:
  - `.memory/rendering-optimization-plan-2026-02-19.md`

**Key bottlenecks identified in current browser client:**
1. Promise churn in hot render path (`getImageByKey` -> `requestImageByKey` and `requestMeta` calls from draw loops create `Promise.resolve(...)` allocations on cache hits).
2. No culling for map tiles/objects in `drawMapLayer()`; whole map layers are drawn every frame.
3. Debug runtime summary (`updateSummary`) rebuilds/serializes large JSON and updates DOM every frame.
4. Character placement recomposition + z-sort done every draw frame.
5. No spatial index/chunking for static sprite batches.

### Full audit of `.memory/` vs actual codebase (2026-02-18)
No code changes since previous sync (only debug image cleanup + sync-status update commits).
All `.memory/` docs verified against actual `client/web/app.js` (7246 lines) function list, render pipeline, physics constants, and runtime state.

**Corrections applied:**
1. **canvas-rendering.md**: Fixed render order to accurately show `drawLifeSprites(filterLayer)` is called inside `drawMapLayersWithCharacter()` per map layer — not as a standalone step. Updated draw order listing.
2. **canvas-rendering.md**: Updated to document all runtime state fields including `keybinds`, `portalScroll`, `npcDialogue`, `hiddenPortalState`, `settings` (bgm/sfx/fixedRes/minimap), `debug` sub-toggles.
3. **physics.md**: Verified all constants match app.js. Swimming physics documented. No changes needed.
4. **physics-units.md**: Verified conversion formulas and code references. No changes needed.
5. **implementation-plan.md**: Verified execution status entries are accurate. No changes needed (last entry already covered all features).
6. **sync-status.md**: Updated timestamp, metrics, and phase status.

### Feature inventory (verified present in app.js)

**Rendering:**
- Backgrounds (parallax, tiling, animated, black-bg maps)
- Map layers (tiles + objects, z-sorted per layer)
- Character composition (body/head/face/hair/equips, anchor-based, zmap ordering)
- Life sprites (mobs + NPCs, per-layer rendering with HP bars)
- Reactors (state 0 idle, animated frames)
- Portals (type-aware: visible/hidden/scripted, animated frames)
- Damage numbers (WZ sprites, critical gold, miss text)
- Chat bubbles (word-wrapped, timed)
- Player name label
- Status bar (HP/MP/EXP gauges, level/job)
- Map name banner (fade-in/out)
- Minimap (collapsible, player/portal/mob/NPC/reactor dots)
- Loading screen (progress bar)
- Transition overlay (fade in/out for portal transfers)
- Debug overlays (footholds, ropes, life markers, reactor markers)

**Physics/Movement:**
- Foothold-based platforming (C++ parity constants)
- Gravity, friction, slope drag, ground-slip
- Jump, down-jump (foothold exclusion window)
- Rope/ladder climbing (attach/detach, cooldown, top-exit, side-jump)
- Wall collision (2-link lookahead, airborne + grounded)
- Swimming physics (separate gravity/friction/force constants)
- Edge traversal (prev/next foothold chain resolution)
- Swept landing detection (ray-segment intersection)
- Portal scroll (momentum-based camera glide to destination)

**Combat:**
- Click-to-attack mobs (350ms cooldown, STR-based damage)
- Mob stagger → aggro → patrol state machine
- Knockback (C++ faithful: 0.2 hforce for ~31 ticks, ground friction)
- Mob HP from WZ `maxHP`, damage formula with STR/weapon/level
- Hit/Die stances, mob-specific SFX
- Death fade-out, 8s respawn timer
- EXP on kill, level-up system
- Damage numbers (WZ sprites, critical chance)

**Interaction:**
- NPC click → dialogue box (portrait, word-wrap, scripted options, page navigation)
- Known NPC scripts (taxis, Spinel town warps)
- Portal interaction (↑ key, type-aware, intramap/intermap warp)
- Hidden portal reveal (touch-based, fade-in)
- Chat input (Enter to open, local messages + system messages)

**UI/Settings:**
- Settings modal (BGM/SFX toggle, fixed resolution, minimap toggle)
- Keybind customization (attack, jump, pickup, stored in localStorage)
- Debug panel (overlay toggles, mouse-fly mode, stat editor, teleport presets)
- Resizable chat log (drag handle, collapse/expand)
- Mouse-fly debug mode
- Canvas focus-gated keyboard input

**Audio:**
- BGM playback (map-driven, fade-out on map change)
- SFX (jump, portal, mob hit/die, attack)
- Audio unlock button (browser autoplay policy)

**Asset Loading:**
- Three-layer cache (jsonCache → metaCache → imageCache)
- Promise deduplication for concurrent requests
- Map preload pipeline (8 parallel workers, progress tracking)
- Character data preloading (all parts for 6 frames per action)
- Life animation loading (mob/NPC with link resolution)
- Reactor animation loading
- UOL resolution for character frame parts

## Phase completion status
- Phase 0 (Steps 1-4): ✅ Complete (DoD, logging, debug flags, debug panel requirements)
- Phase 1 (Steps 5-7): ✅ Complete (workspace structure, scripts, quality gates)
- Phase 2-5: ✅ Complete (shared schemas, asset pipeline tooling, data provider, server)
- Phase 6 (Steps 33-35): ✅ Scaffolding complete (world-stage, combat-orchestrator, entity-pool)
- Phase 7: Not started — requires game server protocol
- Phase 8 (Steps 40-44): ⏳ Partial
  - **Combat system**: ✅ Stagger/aggro/KB complete, WZ HP, damage formula
  - **Equipment rendering**: ✅ Complete (hair/coat/pants/shoes/weapon, climbing parity)
  - **Player HUD**: ✅ Complete (name, status bar, map banner, minimap)
  - **Mob rendering**: ✅ Layer-correct rendering with HP bars
  - **NPC system**: ✅ Dialogue with scripts, portraits, options
  - **Reactor system**: ✅ State 0 rendering + animation
  - **Portal system**: ✅ Type-aware rendering + interaction + transitions

## Next expected update point
- Phase 7: Networking and multiplayer (needs server protocol)
- More visual polish: weather, effects, skill UI
- Performance: foothold spatial index, animation interpolation
