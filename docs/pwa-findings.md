# Progressive Web App Documentation + Findings

This page is the primary documentation page for the project’s docs-as-a-web-app flow.

## Browse docs in a web browser
Start the docs server:

```bash
bun run docs
```

Then open:
- default: `http://127.0.0.1:4173/`
- if that port is busy, use the URL printed in terminal (auto-fallback to next free port).

The docs UI includes sidebar navigation for markdown files under `docs/`.

## PWA docs notes
- A lightweight docs web app is served by `tools/docs/serve-docs.mjs`.
- It includes a web manifest (`/manifest.webmanifest`) and service worker (`/sw.js`) for basic install/offline support.
- This file also keeps the chronological findings/progress log.

## Update policy
- Add an entry after every significant change.
- Keep entries short and chronological (newest first).
- Include what changed, why it matters, and where to look.
- Keep instructions accurate for `bun run docs` browser usage.

---

## 2026-02-19 20:55 (GMT+11)
### Summary
- Added fall damage with knockback on high falls.
- Added attack swing sound (swordS/Attack).
- Fixed animated objects not playing after map transitions (laser/backgrounds).
- Trap hitbox now uses lt/rb bounds with sprite fallback; tiny blank frames (≤4px) skipped.
- Traps below 10% opacity skip collision.
- Cooldown hold (2s) before laser fade-in for clear off-period between cycles.
- Fall damage applies knockback bounce, climb lock, and invincibility frames.
- Knockback prevents climbing for 600ms after being hit.

### Files changed
- `client/web/app.js`

### What changed
- **Fall damage**: Tracks highest point during airborne period (`fallStartY`). On landing, if
  distance exceeds `FALL_DAMAGE_THRESHOLD` (500px), deals 10% maxHP per threshold. Applies
  half-strength horizontal knockback + 60% vertical bounce + 600ms climb lock + invincibility.
- **Attack sound**: `playSfx("Weapon", "swordS/Attack")` when starting attack, matching C++
  `CharLook::attack → weapon.get_usesound().play()`.
- **Map transition animation fix**: `requestMeta` cache returning without running loader side-effect.
  Animation preload now populates new map objects from cached meta immediately before queuing task.
  Applies to both object and background animations.
- **Trap hitbox parity**: `trapWorldBounds` uses `lt`/`rb` when present, falls back to sprite
  dimensions for frames without explicit hitbox (e.g. laser fade-in). Tiny frames (≤4px) return
  null (electric 1×1 cooldown blanks). Animated traps below 10% opacity (26/255) skip collision.
- **Laser cooldown hold**: Fade-in frames (a0=0) hold fully invisible for 2s before ramping,
  creating clear cooldown gap between laser cycles.
- **Knockback climb lock**: New `knockbackClimbLockUntil` field prevents rope/ladder attach
  for 600ms after any knockback (trap, mob, or fall damage).

### Validation
- `bun run ci` ✅

---

## 2026-02-19 17:40 (GMT+11)
### Summary
- Reverted wall column index approach — back to exact C++ 2-link chain check.

### Files changed
- `client/web/app.js`

### What changed
- The `wallColumnsByX` column index and `isWallColumnBlocking` caused over-blocking on interior
  walls in the subway map (debug2.png). Players were blocked from moving between sections at
  heights where the C++ client allows passage.
- `getWallX` now matches C++ `FootholdTree::get_wall` exactly: checks only the immediate 2
  chain links (prev/prevprev or next/nextnext) with the `[nextY-50, nextY-1]` blocking window.
- Map boundary walls are still enforced by `clampXToSideWalls` hard clamp.
- Removed `wallColumnsByX` from map parsing and map object.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 17:15 (GMT+11)
### Summary
- Fixed jump-through-wall bug on tall multi-segment walls (e.g., subway map 103000900).

### Files changed
- `client/web/app.js`

### What changed
- Root cause: `getWallX` only checked 2 foothold chain links for blocking walls, using a 50px Y window.
  Tall walls in the subway map are composed of many 60px vertical wall segments. When jumping,
  `nextY` moves above the 2-link check range, causing the wall check to fall through to the
  map side-wall boundary (much further away), allowing the player to pass through.
- Fix: pre-built `wallColumnsByX` index at map parse time — maps each wall X position to the full
  `{minY, maxY}` extent of all wall footholds at that X.
- `getWallX` now uses `isWallColumnBlocking()` instead of `isBlockingWall()` for chain-discovered
  walls. This checks the full column extent, not just the immediate chain segment.
- Only walls discovered through the normal foothold chain (prev/prevprev, next/nextnext) are checked
  against their column — no global wall scan, so small platform walls remain non-blocking.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 16:53 (GMT+11)
### Summary
- Fixed intermittent one-frame face disappearance during facial animation transitions.

### Files changed
- `client/web/app.js`

### What changed
- Character placement cache now includes face expression/frame in template lookups and fallback state.
- If a face part is expected but its image is still decoding, template build now returns `null` (no cache write) so renderer falls back to last complete frame.
- Prevents caching transient no-face templates that caused disappear/reappear flicker.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 16:45 (GMT+11)
### Summary
- Fixed hit-face override caching and reduced wall collision aggressiveness to match C++ foothold logic.

### Files changed
- `client/web/app.js`

### What changed
- Character composition cache now keys by face expression/frame (`faceExpression`, `faceFrameIndex`) so hit expressions (`pain`/`hit` etc.) apply immediately and are not masked by stale cached templates.
- Wall collision parity pass:
  - removed generic `wallLines` intersection fallback from `resolveWallCollision(...)`
  - restored C++-style behavior: foothold-chain wall checks (`getWallX`) + map side-wall fallback only
- This prevents over-aggressive blocking on short vertical walls (e.g. small platform walls in `103000900`) while keeping side-wall boundaries intact.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 16:31 (GMT+11)
### Summary
- Corrected face-to-head mapping regression from previous hit-visual parity pass.

### Files changed
- `client/web/app.js`

### What changed
- Face composition now anchors to `brow` and uses face-frame brow offsets (from `map.brow`) again.
- This matches C++ `Face::Frame` (`texture.shift(-brow)`) + `CharLook::draw` face placement flow.
- Fixes facial expression misalignment relative to head.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 16:24 (GMT+11)
### Summary
- Improved player-hit visual parity with C++: blink effect and face placement.

### Files changed
- `client/web/app.js`

### What changed
- Invincibility blink in `drawCharacter()` now uses color darkening (`brightness(...)`) rather than alpha fade.
- Pulse curve remains C++-style: `rgb = 0.9 - 0.5 * abs(sin(progress * 30))`.
- Character composition now special-cases face anchoring:
  - uses resolved world `brow` anchor
  - applies face origin only (ignores expression-local brow offsets)
- Fixes hit-face drifting slightly above head and keeps expression placement stable.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 16:14 (GMT+11)
### Summary
- Made player touch hitbox stance-aware so prone/sit uses a lower profile hitbox.

### Files changed
- `client/web/app.js`

### What changed
- Added prone hitbox metrics:
  - standing/default: `x ±12`, `y-50..y`
  - prone/sit on-ground: `x ±18`, `y-28..y`
- Added `playerTouchBoxMetrics(player)` and wired `playerTouchBounds(...)` to use it.
- Keeps previous swept collision behavior (`prevX/prevY` to current position) but now reflects prone posture.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 16:01 (GMT+11)
### Summary
- Fixed remaining jump-through-wall tunneling in `103000900` (including from stopped-at-wall jump states).

### Files changed
- `client/web/app.js`

### What changed
- Updated wall-line fallback to use swept Y probe (`oldY..nextY`) instead of nextY-only.
- `resolveWallCollision(...)` now resolves collision to a tiny inward offset (`±0.001`) from wall X.
- Added/used `clampXInsideSideWalls(...)` for final and safety clamps to avoid exact-boundary touch-start tunneling.
- Updated airborne wall collision call to pass both `oldY` and `nextY`.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 15:49 (GMT+11)
### Summary
- Fixed remaining high-velocity jump-through-wall case.

### Files changed
- `client/web/app.js`

### What changed
- Reintroduced a minimal `resolveWallLineCollisionX(...)` fallback inside `resolveWallCollision(...)`.
- This checks strict crossing against vertical wall segments (`map.wallLines`) in the player body Y range.
- It catches fast airborne crossings that foothold-chain/global side-wall checks can miss.
- Kept strict crossing (no touch-start mode) to avoid reintroducing wall-edge stickiness.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 15:41 (GMT+11)
### Summary
- Fixed jump-through-side-wall regression after simplification pass.

### Files changed
- `client/web/app.js`

### What changed
- Updated `sideWallBounds(map)` priority to prefer `map.walls.left/right` first.
- `map.walls` are inset C++-style limits (`left+25/right-25`) and represent actual side collision boundaries.
- `footholdBounds.minX/maxX` is now fallback-only (not primary), avoiding airborne jump bypass beyond inset wall limits.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 15:31 (GMT+11)
### Summary
- Simplified side-wall collision logic to a single shared clamp path.

### Files changed
- `client/web/app.js`

### What changed
- Removed wall-line intersection fallback and knockback wall-lock state.
- Added shared helpers:
  - `sideWallBounds(map)`
  - `clampXToSideWalls(x, map)`
- Side-wall clamps now use foothold extrema (`footholdBounds.minX/maxX`) first, with legacy `map.walls` fallback.
- Unified behavior across:
  - `resolveWallCollision(...)`
  - post-physics X safety clamp in `updatePlayer(...)`
  - immediate knockback-time clamp in `applyPlayerTouchHit(...)`

### Validation
- `bun run ci` ✅

---

## 2026-02-19 15:16 (GMT+11)
### Summary
- Fixed remaining knockback wall pass-through by adding knockback-aware wall-line collision mode.

### Files changed
- `client/web/app.js`

### What changed
- Added short knockback wall-lock state on player:
  - `knockbackWallLockUntil`
  - `knockbackDirection`
- `applyPlayerTouchHit(...)` now sets that state whenever knockback is applied.
- `resolveWallCollision(...)` now enables touch-start wall crossing only during active knockback in matching direction.
- `resolveWallLineCollisionX(...)` supports two modes:
  - strict crossing (normal movement, avoids sticky wall edges)
  - touch-start crossing (knockback-only, blocks slips when starting exactly on wall X)

### Validation
- `bun run ci` ✅

---

## 2026-02-19 15:02 (GMT+11)
### Summary
- Fixed wall-edge stickiness introduced by the knockback side-wall hardening.

### Files changed
- `client/web/app.js`

### What changed
- `resolveWallLineCollisionX(...)` crossing test now uses strict crossing + epsilon.
- Prevents false collisions when player is already exactly on wall X and tries to move away.
- Keeps robust knockback/airborne side-wall blocking while allowing normal movement off wall edges.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 14:54 (GMT+11)
### Summary
- Fixed remaining side-wall escape during knockback by adding wall-line intersection fallback and immediate hit-time wall clamp.

### Files changed
- `client/web/app.js`

### What changed
- Added `resolveWallLineCollisionX(...)` and integrated it into `resolveWallCollision(...)`:
  - intersects horizontal movement against `map.wallLines`
  - clamps to nearest crossed vertical wall in movement direction
- Keeps previous foothold-chain wall logic, but now has robust segment-based fallback for airborne/stale-foothold states.
- In `applyPlayerTouchHit(...)`, added immediate wall-bound X clamp to prevent one-frame penetration while knockback is applied.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 14:45 (GMT+11)
### Summary
- Hardened side-wall collision to stop remaining mid-air wall bypass cases in `103000903`.

### Files changed
- `client/web/app.js`

### What changed
- Kept existing null-foothold wall fallback in `resolveWallCollision(...)`.
- Added post-physics safety clamp on player X to global map walls (`map.walls.left/right`).
- When clamped, outward horizontal velocity is cleared to prevent immediate re-penetration.
- This closes residual edge cases where crossing-based checks could still miss transient mid-air escapes.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 14:37 (GMT+11)
### Summary
- Fixed side-wall bypass edge case in map `103000903` where high jumps could slip through walls.

### Files changed
- `client/web/app.js`

### What changed
- Updated `resolveWallCollision(...)` with C++-style global wall fallback when no foothold is currently resolvable.
- Previously, null foothold during airborne movement returned early (no wall clamp), allowing side escape at high Y.
- Now, null-foothold cases still collide against `map.walls.left/right` before applying X movement.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 14:29 (GMT+11)
### Summary
- Fixed laser reappearance/cooldown speed in `103000903` by aligning object frame sequencing with C++ bitmap-frame rules.

### Files changed
- `client/web/app.js`

### What changed
- `objectAnimationFrameEntries()` now includes only numeric `$imgdir` / direct numeric `$canvas` frame nodes.
- Removed numeric `$uol` alias nodes from object animation frame sequencing.
- Why: C++ `Animation` iterates bitmap frames only; counting alias nodes shortens cycle timing and makes lasers reappear too quickly.
- Result: laser cooldown/pulse cadence in `103000903` is now much closer to C++ timing.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 14:19 (GMT+11)
### Summary
- Fixed remaining `103000903` laser issues: corrected timing/appearance and bad segment orientation.

### Files changed
- `client/web/app.js`

### What changed
- Corrected map object field semantics:
  - object `f` is now treated as **horizontal flip flag** (C++ parity), not frame index.
  - object animations now consistently start from frame `0`.
- Updated object draw placement for flipped objects using mirrored origin handling.
- Updated trap bounds calculation to be flip-aware when using `lt/rb` vectors.
- Result for `103000903`:
  - laser segment orientation matches expected straight-line composition
  - pulse timing/phase no longer appears unnaturally fast due to wrong frame/flip interpretation

### Validation
- `bun run ci` ✅

---

## 2026-02-19 14:08 (GMT+11)
### Summary
- Added a new debug checkbox to draw hitboxes on canvas for collision troubleshooting.

### Files changed
- `client/web/index.html`
- `client/web/app.js`

### What changed
- Added debug-panel overlay toggle:
  - `debug-hitboxes-toggle` (“Draw hitboxes”)
- Added `runtime.debug.showHitboxes` and wired it through `syncDebugTogglesFromUi()`.
- Added `drawHitboxOverlay()` render pass (gated by overlay master toggle + new checkbox).
- Hitbox overlay currently renders:
  - player touch/sweep bounds
  - portal trigger bounds
  - trap hazard bounds
  - mob frame bounds (touch-damaging mobs visually emphasized)
- Added summary visibility in runtime debug JSON (`debug.showHitboxes`).

### Validation
- `bun run ci` ✅

---

## 2026-02-19 13:58 (GMT+11)
### Summary
- Fixed static lasers in map `103000903` by honoring WZ alpha-ramp animation metadata (`a0/a1`) on object frames.

### Files changed
- `client/web/app.js`

### What changed
- `canvasMetaFromNode()` now captures object-frame opacity metadata:
  - `opacityStart`, `opacityEnd` derived from WZ `a0/a1` semantics
- Added `objectFrameOpacity(meta, state, obj)` and applied it in `drawMapLayer()`.
- Animated object draw now modulates `ctx.globalAlpha` per-frame progress using current frame timer.
- This restores effects where frames reuse the same bitmap but animate via alpha transitions
  (not purely by frame image swaps), such as subway laser/lightning lines.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 13:46 (GMT+11)
### Summary
- Fixed missing lightning/power-line animation in map `103000900` and enabled mob touch damage against the player.

### Files changed
- `client/web/app.js`

### What changed
- Object animation frame loader now supports animation sets authored as:
  - numeric `$imgdir` frames
  - direct numeric `$canvas` frames
  - numeric `$uol` alias frames
- Added explicit per-object frame token sequence (`frameKeys`) so non-trivial frame IDs render correctly.
- Result: trap laser/power-line lightning objects (e.g., `Obj/trap/laser/electH2000/elect2000`) animate instead of staying static.

- Added mob touch collision pass:
  - `updateMobTouchCollisions()` runs each fixed update after life physics update
  - uses player sweep touch bounds + mob current-frame bounds
  - only mobs with `bodyAttack=1` apply touch hits
  - touch damage sourced from mob `PADamage`
- Hit response reuses player hit pipeline (damage number, knockback, pain face, blink/i-frames).

### Validation
- `bun run ci` ✅

---

## 2026-02-19 13:28 (GMT+11)
### Summary
- Added player hit-reaction visuals: whole-character blink during i-frames and a temporary pain-style face expression when hit.

### Files changed
- `client/web/app.js`

### What changed
- Added temporary face-expression override state:
  - `runtime.faceAnimation.overrideExpression`
  - `runtime.faceAnimation.overrideUntilMs`
- Added `triggerPlayerHitVisuals(nowMs)` and call it from trap hit handling.
- Face selection fallback priority on hit:
  - `pain` → `hit` → `troubled` → `stunned` → `bewildered`
- `updateFaceAnimation(dt)` now supports override playback for `PLAYER_HIT_FACE_DURATION_MS` (500ms), then returns to default/blink behavior.
- Added whole-character invincibility blink in `drawCharacter()` using a C++-style pulse curve while trap i-frames are active.
- Reset face override state on map load.

### Reference parity notes
- Matched intent from C++:
  - `Character/Char.cpp` invincibility pulse while recently hit
  - `Character/Look/Face.cpp` expression set including `pain`/`hit`

### Validation
- `bun run ci` ✅

---

## 2026-02-19 13:12 (GMT+11)
### Summary
- Added trap hitbox collision + knockback so spikeball/map hazards can damage and push the player on overlap.

### Files changed
- `client/web/app.js`

### What changed
- Trap metadata parsing now includes object-node fields:
  - `obstacle`, `damage`, `dir`
- Added map-load hazard indexing:
  - `buildMapTrapHazardIndex(map)` populates `map.trapHazards`
- Added fixed-step hazard collision pass:
  - `updateTrapHazardCollisions()` in `update()` after object animation updates
  - player overlap uses sweep-style touch bounds (`prevX/prevY` + body-height rect)
  - trap bounds use `lt/rb` vectors plus moving-object offsets (`moveType/moveW/moveH/moveP`)
- On collision:
  - player HP reduced by trap damage
  - damage number spawned on player
  - C++-style knockback impulse applied
  - 2s invulnerability window to avoid per-frame re-hit spam

### Validation
- `bun run ci` ✅

---

## 2026-02-19 12:30 (GMT+11)
### Summary
- Fixed non-animating spike balls in map `105040310` by implementing object motion metadata support.

### Files changed
- `client/web/app.js`

### Root cause + fix
- **Cause:** spike balls in this map are moving objects (`Obj/trap/moving/nature/0`) driven by WZ motion fields (`moveType/moveW/moveP`), not frame-based sprite animation.
- **Fix:**
  - parse object motion metadata in `canvasMetaFromNode()`
  - apply sinusoidal motion offsets in `drawMapLayer()` via `objectMoveOffset(meta, nowMs)`
- Result: trap/spike-ball objects now move as intended.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 12:20 (GMT+11)
### Summary
- Added portal frame warmup to address teleport arrows appearing static.

### Files changed
- `client/web/app.js`

### What changed
- Added `ensurePortalFramesRequested(portal)` called from `drawPortals()`.
- Warmup requests/decode-queues all frames for each portal animation set once (by type/image key).
- Added `portalFrameWarmupRequested` cache and clear on map load.
- This avoids first-frame-only rendering when non-zero frames are still lazy-loading.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 12:10 (GMT+11)
### Summary
- Added fallback redirect for missing map IDs to avoid hard 404 load failures.

### Files changed
- `client/web/app.js`

### What changed
- Added `MAP_ID_REDIRECTS` map for unavailable IDs in this extracted dataset.
- `loadMap()` now resolves requested map IDs through this redirect table before fetch.
- Added redirect telemetry:
  - runtime log entry
  - system chat info message when redirect occurs
- Current redirect:
  - `100000110` (Henesys Free Market Entrance) → `910000000` (Free Market)

### Validation
- `bun run ci` ✅

---

## 2026-02-19 11:57 (GMT+11)
### Summary
- Fixed teleport portal arrow animation by moving portal frame progression to a deterministic tick-driven animation state.

### Files changed
- `client/web/app.js`

### What changed
- Added `runtime.portalAnimation` state (regular + hidden frame indices/timers).
- Added `updatePortalAnimations(dtMs)` called from `update()`.
- `drawPortals()` now uses tick-updated frame indices instead of `performance.now()` frame sampling.
- Introduced `portalFrameCount(portal)` and reused it for preload/draw consistency.
- Portal animation state resets on map load.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 11:38 (GMT+11)
### Summary
- Fully decoupled background scene Y placement from live character/camera Y movement.

### Files changed
- `client/web/app.js`

### What changed
- Added `runtime.backgroundViewAnchorY`.
- Anchor is set when map loads and when canvas resolution changes.
- Background renderer now uses anchored vertical view translation (`anchoredViewY`) for Y placement/parallax math.
- Result: no jump/air-time scene shifting from character/camera Y updates.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 11:30 (GMT+11)
### Summary
- Removed any remaining character-Y coupling from background scene alignment.

### Files changed
- `client/web/app.js`

### What changed
- Background vertical scene offset remains fixed-resolution only.
- Renamed local variable in `drawBackgroundLayer()` for clarity:
  - `sceneCharacterBiasY` → `sceneFixedBiasY`
- Confirms background scenes are no longer aligned to player Y position.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 11:23 (GMT+11)
### Summary
- Undid jump-reactive background bias; switched to a fixed-resolution vertical scene offset for stable backdrop placement.

### Files changed
- `client/web/app.js`

### What changed
- Removed smoothed/grounded jump-reactive scene bias state.
- Background Y now uses a uniform fixed-resolution offset:
  - `max(0, (canvasHeight - BG_REFERENCE_HEIGHT) / 2)`
- Keeps background scenes lower for 1280×960 without movement spikes during jumps.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 11:15 (GMT+11)
### Summary
- Reduced aggressive background scene movement during jumps by smoothing and grounding the character-relative scene bias.

### Files changed
- `client/web/app.js`

### What changed
- Added smoothed background scene bias state (`bgSceneBiasState`) updated in `updateBackgroundAnimations()`.
- Bias target still comes from `clamp(player.y - camera.y, 0..cameraHeightBias())`.
- While airborne, target bias is held to the last grounded value.
- Draw path now uses smoothed bias instead of raw per-frame player/camera delta.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 11:02 (GMT+11)
### Summary
- Lowered background scene composition relative to the player framing for 1280×960.

### Files changed
- `client/web/app.js`

### What changed
- In `drawBackgroundLayer()`, added character-relative vertical bias:
  - `sceneCharacterBiasY = clamp(player.y - camera.y, 0..cameraHeightBias())`
- Applied this bias to background Y placement after the C++-style background shift/motion calculations.

### Why it matters
- When the player is intentionally framed lower on tall viewports, background scenes now follow that framing and no longer look slightly too high.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 10:47 (GMT+11)
### Summary
- Revamped background scene rendering to follow C++ map-background behavior and reduce visible patch seams.

### Files changed
- `client/web/app.js`

### What changed
- Reworked `drawBackgroundLayer()` against C++ `MapBackgrounds.cpp` flow:
  - static backgrounds now use view-translation + `rx/ry` shift formula (`shiftX/shiftY`)
  - added persistent `bgMotionStates` for mobile background types (4/5/6/7)
  - tile wrap alignment is done before origin offset (C++ parity)
- Added map-load reset for `bgMotionStates` with other animation state clears.

### Why it matters
- Background scenes are now positioned more deterministically and avoid intermittent gap/patch artifacts at fixed 4:3 (1280×960).

### Validation
- `bun run ci` ✅

---

## 2026-02-19 10:30 (GMT+11)
### Summary
- Removed static background parallax so scene backdrops follow camera without depth-scroll offset.

### Files changed
- `client/web/app.js`

### What changed
- In `drawBackgroundLayer()`:
  - static (non-mobile) backgrounds now use normal camera transform (`background.x/y + halfScreen - camera`)
  - removed `rx/ry` parallax contribution for static backgrounds
- Mobile drift backgrounds (types 4/5/6/7) still animate with time-based `rx/ry` motion.
- Removed unused `BG_REFERENCE_WIDTH` constant.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 10:17 (GMT+11)
### Summary
- Adjusted background scene vertical placement to fix backdrops rendering slightly too high in some areas.

### Files changed
- `client/web/app.js`

### What changed
- In `drawBackgroundLayer()`, added `bgParallaxCamY = camera.y + cameraHeightBias()`.
- Non-mobile background vertical parallax (`shiftY`) now uses `bgParallaxCamY`.
- Keeps gameplay camera bias for world rendering while compensating parallax calculation for backdrop alignment.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 10:01 (GMT+11)
### Summary
- Reduced movement jitter by changing 60 FPS frame pacing from hard skip-gating to accumulator-driven pacing.

### Files changed
- `client/web/app.js`

### What changed
- `tick()` now accumulates elapsed time on **every** RAF callback.
- Update/render only run when accumulator reaches `FIXED_STEP_MS`.
- Prevents micro-stutter from near-threshold RAF variance (e.g., 16.4ms callbacks being skipped then followed by ~33ms jumps).
- Preserves fixed-step 60Hz simulation and bounded catch-up.
- FPS sampling now uses accumulated interval between presented frames.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 09:40 (GMT+11)
### Summary
- Fixed FPS counter reporting so it reflects loop cadence (true capped FPS), not CPU render speed.

### Files changed
- `client/web/app.js`

### Root cause + fix
- **Cause:** FPS estimate was computed from `frameMs` (CPU update+render execution time), which can be <1ms and report 1000+ FPS.
- **Fix:**
  - added `runtime.perf.loopIntervalMs` (wall-clock interval between processed ticks)
  - sample window now uses loop interval (`elapsed`) for FPS calculation
  - FPS badge detail now shows loop interval ms

### Validation
- `bun run ci` ✅

---

## 2026-02-19 09:32 (GMT+11)
### Summary
- Capped the game update/render tick processing to 60 FPS.

### Files changed
- `client/web/app.js`

### What changed
- In `tick(timestampMs)`, frame processing is skipped when elapsed time is below `FIXED_STEP_MS` (16.67ms).
- Keeps fixed-step simulation (`1/60`) and bounded catch-up behavior.
- Ensures the game loop does not process updates/renders above 60 FPS on high-refresh monitors.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 09:20 (GMT+11)
### Summary
- Added a toggleable FPS counter in the top-right canvas overlay via the debug panel.

### Files changed
- `client/web/index.html`
- `client/web/app.js`

### What changed
- Added new debug checkbox in **Overlays**:
  - `#debug-fps-toggle` (default: enabled)
- Added runtime debug state:
  - `runtime.debug.showFps`
- Added `drawFpsCounter()` in render pipeline:
  - top-right badge with estimated FPS (rolling p50 frametime) and current frame ms
  - color-coded FPS value (green/yellow/red)
- FPS counter now renders even during loading/no-map states when enabled.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 09:05 (GMT+11)
### Summary
- Continued optimization through Phase 6: spatial indexing, life bucketing, character template caching, fixed-step loop, and runtime perf telemetry.

### Files changed
- `client/web/app.js`
- `.memory/canvas-rendering.md`
- `.memory/physics.md`
- `.memory/rendering-optimization-plan-2026-02-19.md`

### Implemented (highlights)
- **Phase 0 instrumentation:**
  - added frame timings (`updateMs`, `renderMs`, `frameMs`) + rolling p50/p95 window.
  - added per-frame counters (`drawCalls`, `culledSprites`, tiles/objects/life/portal/reactor draws).
- **Phase 2/3 map rendering scale improvements:**
  - map-load spatial buckets for tiles/objects (`SPATIAL_BUCKET_SIZE=256`).
  - viewport bucket query + cached visible-cell ranges to avoid full layer iteration every frame.
- **Life rendering pass optimization:**
  - `drawMapLayersWithCharacter` now builds per-layer life buckets once and passes subsets to `drawLifeSprites`.
- **Phase 4 character optimization:**
  - cached character placement templates keyed by `(action, frameIndex, flipped)`.
- **Phase 5 loop smoothness:**
  - replaced frame-skip loop with fixed-step 60Hz simulation + bounded catch-up.
  - enabled 2D context hints (`alpha:false`, `desynchronized:true`) with fallback.

### Why this matters
- Reduces iteration/draw overhead and frame-time jitter on sprite-dense maps while improving consistency of movement/render cadence.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 08:35 (GMT+11)
### Summary
- Implemented first rendering optimization pass (hot-path cache cleanup, map/portal culling, throttled debug summary updates).

### Files changed
- `client/web/app.js`
- `.memory/canvas-rendering.md`

### Rendering/runtime improvements
- **Cache hit fast path:**
  - `requestMeta` and `requestImageByKey` now return cached values directly on hits (removed `Promise.resolve(...)` allocations).
  - `getImageByKey` now requests decode only on miss.
- **Lazy metadata requests:**
  - background/tile/object meta requests now only fire when metadata is missing.
  - duplicate in-flight requests are gated.
- **Sprite culling:**
  - added `isWorldRectVisible(...)` world-rect culling for map tiles/objects (`drawMapLayer`) and portals (`drawPortals`).
- **Debug summary throttle:**
  - `updateSummary` moved from every frame to 5Hz (`SUMMARY_UPDATE_INTERVAL_MS=200`).
  - summary generation is skipped while debug panel is hidden.

### Why this matters
- Reduces per-frame allocation churn + draw workload in dense maps, which should reduce jank and improve responsiveness.

### Validation
- `bun run ci` ✅

---

## 2026-02-19 08:15 (GMT+11)
### Summary
- Rendering performance audit complete; optimization roadmap documented for faster/snappier sprite rendering.

### What was analyzed
- Active client: `client/web/app.js` render/tick/cache paths.
- Reference scans (read-only):
  - `MapleWeb/TypeScript-Client` (`Gameloop.ts`, `MapleMap.ts`, `MapleCharacter.ts`, `WZNode.ts`)
  - `MapleStory-Client` (`Stage.cpp`, map/background draw modules, character look draw stack)

### Key findings (current browser bottlenecks)
- Promise churn in hot render path on cache hits (`requestImageByKey` / `requestMeta` usage from draw loops).
- No viewport culling for map tiles/objects in `drawMapLayer()`.
- Runtime summary JSON + DOM update work is still done every frame.
- Character composition/z-sort recomputed per frame.

### Plan document
- Added: `.memory/rendering-optimization-plan-2026-02-19.md`
- Phased approach:
  1. Instrumentation baseline
  2. Hot-path deallocation cleanup
  3. Spatial culling
  4. Static chunk caching (offscreen)
  5. Character frame caching + loop smoothness polish

### Why this matters for browser usage
- Targets lower frame-time spikes and less GC pressure, improving perceived responsiveness during movement/combat in sprite-dense maps.

---

## 2026-02-18 08:20 (GMT+11)
### Summary
- Client-side combat: click mobs to attack, damage numbers, mob HP bars, death/respawn, EXP/leveling

### Combat System
- **Click-to-attack**: click any mob to deal damage (350ms cooldown)
- **Damage numbers**: white (normal) or gold (critical, 15% chance), float upward and fade out
- **Mob HP bars**: green/red gauge above mob sprite, shown 3s after hit
- **Hit animation**: mob briefly plays `hit1` stance, then returns to patrol
- **Death animation**: mob plays `die1` stance, fades out over 800ms, marked dead
- **Respawn**: 8s after death, mob reappears at original spawn with full HP
- **EXP/leveling**: 3-7 EXP per kill, level up increases maxHP/MP/EXP
- **SFX**: mob-specific Damage/Die sounds from Sound.wz/Mob.img
- **Cursor**: pointer on mob hover (mob > NPC priority)
- **Mob AI paused**: during hit stagger and death — no patrol movement

### Status Bar Fix
- Full-width horizontal bar at bottom of canvas
- Chat bar + chat log pushed up above status bar via CSS `bottom` offset

### Input Fix
- PageDown/PageUp/Home/End/Tab now prevented from default browser behavior when game input active

### Validation
- Automated: `bun run ci` ✅ — all tests pass

---

## 2026-02-18 08:00 (GMT+11)
### Summary
- Player HUD: name label, HP/MP/EXP status bar, map name banner on map load

### Player HUD
- **Player name label**: dark tag below character sprite showing `player.name`
- **Status bar**: centered at bottom of canvas
  - Level + job label on left side
  - HP (red) and MP (blue) gauge bars on right with current/max text
  - Thin gold EXP bar along top edge of status panel
  - Default state: Lv.1 Beginner, 50/50 HP, 5/5 MP, 0/15 EXP
- **Map name banner**: shows on map load at 18% screen height
  - Street name (gray, small) above map name (gold, large, bold)
  - Visible for 3s total, fades out over last 800ms
  - Triggered by `showMapBanner(mapId)` using `getMapStringName()`/`getMapStringStreet()`

### Validation
- Automated: `bun run ci` ✅ — all tests pass

---

## 2026-02-18 07:45 (GMT+11)
### Summary
- Character equipment rendering: hair, coat, pants, shoes, weapon with C++ climbing parity

### Character Equipment System
- Default outfit: Hair 30000, Coat 1040002, Pants 1060002, Shoes 1072001, Weapon 1302000
- `getEquipFrameParts()`: extracts equipment canvas parts per-stance per-frame with z-layer names
- `getHairFrameParts()`: resolves UOLs for stance-specific hair (front vs back via `default`/`backDefault`)
- `extractHairPartsFromContainer()`: handles direct canvas + nested imgdir (e.g. hairShade) containers
- All parts composed via existing anchor system: body→navel, head→neck→brow, hair→brow, equips→navel/hand
- Z-ordering from `zmap.img.json` layer names (each canvas part has a `z` string child)
- Preloads up to 6 frames per action for all character parts

### C++ Climbing Parity
- **Weapon**: hidden during climbing — equip has no ladder/rope stance → `getEquipFrameParts` returns `[]`
- **Hair**: ladder/rope UOLs resolve to `backDefault/backHair` (back hair layers) instead of front hair
- **Face**: suppressed during climbing (C++ `CharLook::draw` skips face in climbing branch)
- **Head**: uses back section (`../../back/head` UOL)
- **Coat/Pants/Shoes**: use back z-layers (`backMailChest`, `backPants`, `backShoes`) from climbing stances
- **Body**: uses `backBody` z-layer from climbing stance

### Validation
- Automated: `bun run ci` ✅ — all tests pass

---

## 2026-02-18 07:10 (GMT+11)
### Summary
- Camera height bias for tall viewports, NPC dialogue with portraits + scripted options, mob speed increase

### Camera Height Bias
- `cameraHeightBias() = Math.max(0, (canvasHeight - 600) / 2)`
- Shifts camera target upward on viewports taller than 600px (BG reference height)
- At 600px: 0, at 1080px: 240, at 1440px: 420
- Backgrounds designed for 600px now cover more of viewport bottom; sky fills top
- Applied at all 4 camera target sites; still subject to map bounds clamping
- Known limitation: at very large resolutions when camera clamp overrides bias, some bottom void may still appear at map edges

### NPC Dialogue System
- Click any visible NPC to open dialogue (no range limit)
- NPC portrait (animated sprite) shown on left side of dialogue box
- `scriptId` extracted from `Npc.wz info/script` nodes
- **Scripted NPCs** (646 unique scripts found): known scripts (taxis, Spinel/world_trip, etc.) show specific greeting + clickable destination options. Unknown scripts show flavor text + travel options to all major towns
- **Non-scripted NPCs**: show flavor text only (`n0`/`n1`/`d0`/`d1` from `String.wz`)
- Clickable option list with hover highlight (gold), pointer cursor
- Options trigger `runPortalMapTransition` for travel destinations
- Enter/click advances text pages, Escape closes
- Player movement/jumping/portals locked during dialogue
- Dialogue closed on map change; state in debug panel

### Other Changes
- Mob patrol speed 3× (`(speed+100)*0.003`)
- Phase 5 Step 32: `fetchJson` is the single centralized WZ JSON loader (caching + coalescing)
- Removed duplicate `roundRect` function (was causing SyntaxError)
- `footholdBounds` extended with `minY`/`maxY`

### Validation
- Automated: `bun run ci` ✅ — all tests pass

---

## 2026-02-18 06:20 (GMT+11)
### Summary
- Phase 8 Step 41: Reactor subsystem — parse, load, preload, render, debug markers

### Reactor Implementation
- **Parsing**: `parseMapData()` now extracts `reactorEntries` from map JSON (`id`, `x`, `y`, `reactorTime`, `f`, `name`)
- **Loading**: `loadReactorAnimation(reactorId)` fetches from `Reactor.wz/{padded7}.img.json`, reads state 0 canvas frames with origin/delay metadata
- **Preloading**: reactor sprites registered in `buildMapAssetPreloadTasks()`, frames decoded and basedata freed after preload (same pattern as mobs/NPCs)
- **Rendering**: `drawReactors()` draws reactor sprites at world positions with origin-based anchoring, flip support, off-screen culling, `sceneRenderBiasY()` included
- **Animation**: `updateReactorAnimations(dt)` cycles multi-frame reactor animations using WZ delay values
- **Runtime state**: `reactorRuntimeState` Map tracks `frameIndex`, `elapsed`, `state`, `active` per reactor
- **Debug**: magenta reactor markers in debug overlay (`drawReactorMarkers`), reactor dots on minimap (purple/fuchsia), `reactorCount` in debug summary
- **Data**: 475 maps in dataset have reactors, at least 1 reachable from default test maps (100030000)
- **Cleanup**: `initReactorRuntimeStates()` called on map load, clears on map change

### Render Pipeline Update
- Reactors drawn after map layers, before life sprites (step 6 in pipeline)
- Reactor markers shown alongside life markers when debug overlay enabled

### Validation
- Automated: `bun run ci` ✅ — all tests pass
- Manual: reactor sprites should be visible on maps with reactor data (e.g., 100030000)

---

## 2026-02-18 09:00 (GMT+11)
### Summary
- Mob foothold physics: walk on platforms, follow slopes, turn at edges
- Player airborne z-index: renders above all layers when jumping
- Simplified player render layer logic

### Mob Foothold Physics
- `walkOnFootholds()` follows linked foothold chains (prev/next IDs)
- Y position interpolated from foothold slope at current X
- Mobs reverse at foothold edges (null prev/next) and vertical walls
- Patrol bounds (rx0/rx1) respected as outer limits
- Speed from `Mob.wz/info.speed` using C++ formula: `(speed+100)*0.001*70`
- "move" stance frames preloaded alongside "stand"
- Random behavior cycling: 1.5-4s stand, 2-5s move

### Player Z-Index Fix
- Airborne player renders at layer 7 (above all map layers)
- Matches climbing behavior — prevents clipping behind higher-layer objects mid-jump
- `currentPlayerRenderLayer()` simplified: just uses `player.footholdLayer` when grounded

---

## 2026-02-18 08:30 (GMT+11)
### Summary
- Animated map objects: multi-frame cycling with per-frame WZ delays
- Animated backgrounds: ani=1 backgrounds cycle through frames
- BGM crossfade: 800ms smooth fade-out on map transitions
- SFX audio pooling: up to 8 reusable Audio elements per sound
- Minimap −/+ collapse toggle on title bar, show/hide in Settings

### Animated Map Objects
- `loadAnimatedObjectFrames()` detects multi-frame objects during preload
- All frames registered in metaCache, images preloaded
- `objectAnimStates` map tracks per-object frame index and timer
- `updateObjectAnimations(dtMs)` cycles frames using WZ delay values
- Fallback to static frame key if animated frames not yet loaded

### Animated Backgrounds
- Same pattern as objects: `loadAnimatedBackgroundFrames()` for ani=1 backgrounds
- `bgAnimStates` map tracks per-background frame index and timer
- Seamless fallback to static frame if not loaded

### Audio Robustness (Step 44)
- **BGM crossfade**: `fadeOutAudio()` smoothly reduces volume over 800ms via requestAnimationFrame
- **SFX pooling**: `getSfxFromPool()` reuses paused/ended Audio elements (pool of 8 per sound)
- Reduces GC pressure and avoids creating hundreds of short-lived Audio elements

---

## 2026-02-18 08:00 (GMT+11)
### Summary
- Minimap: top-left, toggle button, per-map cache key, String.wz name lookup
- Mob/NPC sprites: load from Mob.wz/Npc.wz, animated stand stances, name labels
- Chat UI hidden during loading screen
- Removed duplicate HUD text overlay

### Minimap System
- Parses `miniMap` node from map JSON (centerX, centerY, mag, canvas basedata)
- Image key per map (`minimap:{mapId}`) ensures cache invalidation on map change
- Map name from `String.wz/Map.img.json` lazy-loaded on first use
- Player (green), portal (yellow), NPC (blue) dot markers
- Toggle button in topbar with localStorage persistence

### Mob/NPC Sprite Rendering
- Loads `Mob.wz/{paddedId}.img.json` / `Npc.wz/{paddedId}.img.json`
- Supports `info.link` redirect for aliased entities
- Animation: stand stance, frame cycling with delay timers
- Origin-based positioning (foot anchor point)
- Name labels from `String.wz/Mob.img.json` / `Npc.img.json`
- NPCs yellow, mobs pink, dark background behind text
- basedata freed after image decode to save memory
- Off-screen culling for performance

---

## 2026-02-18 07:30 (GMT+11)
### Summary
- Phase 4 complete: Asset API server (`@maple/server`)
- Phase 5 (Steps 28-31) complete: AssetClient loader (`client/src/runtime/asset-client.ts`)
- Total test count: 128 across all workspaces

### Phase 4 — Asset API Server (`server/src/`)
- Bun native HTTP server (no Fastify dependency)
- **Endpoints**: `/health`, `/ready`, `/metrics`, `/api/v1/asset/:type/:id`, `/api/v1/asset/:type/:id/:section`, `/api/v1/blob/:hash`, `POST /api/v1/batch`
- **Caching**: assets max-age=300, blobs immutable with ETag
- **Headers**: CORS (Access-Control-Allow-Origin: *), X-Correlation-Id on all responses
- **Metrics**: request count, error count, latency, uptime
- **Data provider**: pluggable DataProvider interface, InMemoryDataProvider for testing
- **Error handling**: typed error codes (NOT_FOUND, INVALID_TYPE, INVALID_SECTION, BATCH_TOO_LARGE)

### Phase 5 — AssetClient (`client/src/runtime/asset-client.ts`)
- **API-first**: getAsset(), getSection(), getBlob(), batch()
- **Request coalescing**: duplicate in-flight requests share one network call
- **LRU cache**: configurable max entries (default 2000), eviction tracking
- **Retry**: exponential backoff (100ms base), configurable max retries
- **Diagnostics**: cache stats, in-flight count, coalesced count, total errors

### Validation
- `bun run ci` ✅ — 128 tests

---

## 2026-02-18 07:15 (GMT+11)
### Summary
- Phase 2 complete: Shared contracts and data model (`@maple/shared-schemas`)
- Phase 3 complete: Build-assets pipeline (`@maple/build-assets`)
- Background tiling rewrite to C++ faithful count-based approach
- Default resolution 1920×1080, fixed 16:9 canvas constraining
- Non-tiled background edge-extension attempted and reverted

### Phase 2 — Shared Contracts (`packages/shared-schemas/`)
- 11 entity types: map, mob, npc, character, equip, effect, audio, ui, skill, reactor, item
- ID normalization (trim, strip leading zeros for numeric IDs)
- Alias system (henesys → map:100000000, slime → mob:210100, etc.)
- Section schemas per entity (core/heavy/ref categories for loading strategy)
- API contracts: success/error envelopes, batch request/response, error codes
- Runtime data model types: Foothold, Portal, LadderRope, BackgroundLayer, etc.
- Schema version tracking (1.0.0)

### Phase 3 — Build-Assets Pipeline (`tools/build-assets/`)
- **Scanner**: Scans WZ JSON tree, produces deterministic inventory (16 namespaces, 22K+ files, 3.7GB)
- **JSON Reader**: Safe file reader, never throws, handles malformed/BOM/missing files
- **UOL Resolver**: Resolves WZ UOL references (relative to parent), inlinks, records outlinks
- **Map Extractor**: Full map parsing (footholds, portals, backgrounds, layers, life, ladders, walls, borders, dependencies)
- **Mob/NPC Extractor**: Info, stances, frames, sounds, linked entity detection
- **Character Extractor**: Actions, frame parts with anchors, UOL refs, face flags, type inference
- **Blob Store**: Content-addressed SHA-256 storage with deduplication
- **Asset Index**: type:id:section → blob hash mapping, reverse lookup, integrity checking, serialization
- **Pipeline Report**: Issue tracking by severity, configurable fail threshold, human-readable output

### Display/Background Changes
- Default resolution: 1920×1080 (was 1280×720)
- Fixed 16:9: canvas buffer locked at 1920×1080 on large viewports, CSS scales display
- Background tiling: C++ count-based approach (`htile = VWIDTH/cx + 3`)
- Edge-extension for type 0 backgrounds: attempted but reverted (causes ugly repeated seams)

### Validation
- `bun run ci` ✅ — 99 tests across all workspaces

---

## 2026-02-18 06:30 (GMT+11)
### Summary
- Audio enabled by default — removed "Enable Audio" button and `audioUnlocked` gate
- Added settings system: gear button + modal with BGM/SFX toggles and fixed 16:9 display
- Water environment physics tuned: swim-jump, fly animation, heavier horizontal friction
- Camera clamping uses VR bounds when present
- Dead code cleanup: removed `ASPECT_MODE_DYNAMIC`, `aspectMode`, audio enable button

### Files changed
- `client/web/app.js` — settings state, audio auto-enable, swim physics, camera VR bounds, dead code removal
- `client/web/index.html` — settings button/modal HTML, removed audio enable button
- `client/web/styles.css` — settings button/modal styling, fixed 16:9 display mode

### Settings system
- **Gear button** in canvas (left of debug hamburger), same frosted glass style
- **Modal** with dark backdrop, closes via ×/Escape/click-outside
- **Audio section**: BGM toggle (pauses/resumes instantly), SFX toggle
- **Display section**: Fixed 16:9 resolution (enabled by default, recommended)
  - Canvas wrapper constrains to 16:9 aspect ratio, centered with black padding
  - Pillarbox on ultrawide, letterbox on tall displays
- All persisted in localStorage (`mapleweb.settings.v1`)

### Audio changes
- `audioUnlocked` removed — audio plays immediately on map load
- BGM/SFX gated only by settings toggles (not unlock button)
- Removed `#audio-enable-button` from HTML and all JS references

### Water environment physics
- Swim-jump: Space gives upward impulse (80% of jump force), fires while held
- Horizontal: SWIM_HFRICTION=0.14, SWIM_HFORCE=0.12 (sluggish water feel)
- Gravity: SWIMGRAVFORCE=0.07 (player visibly sinks)
- Animation: "fly" action (confirmed exists in character data)
- Normal jump works from ground on swim maps (C++ faithful)

### Camera
- `mapVisibleBounds()` checks VRLeft/VRRight/VRTop/VRBottom from map info first
- Falls back to foothold-derived walls/borders

### Dead code removed
- `ASPECT_MODE_DYNAMIC` constant
- `runtime.debug.aspectMode` field + assignment in `syncDebugTogglesFromUi()`
- `audioEnableButtonEl` reference + click handler
- `runtime.audioUnlocked` flag
- Runtime summary: removed `mode`/`unlocked`, added `fixed169`/`bgmEnabled`/`sfxEnabled`

### Validation
- `bun run ci` ✅

---

## 2026-02-18 08:35 (GMT+11)
### Summary
- Fixed parallax background rendering for dynamic viewport sizes (any browser window/aspect ratio).

### Files changed
- `client/web/app.js`

### Problem
- Parallax shift formula used `canvasEl.width / 2` as the reference offset, but WZ background `rx/ry` values were tuned for the original 800×600 MapleStory resolution. On wider screens (1920×1080, etc.), parallax shifted too much, causing visible gaps and misaligned layers.

### Fix
- Added `BG_REFERENCE_WIDTH = 800`, `BG_REFERENCE_HEIGHT = 600` constants
- Parallax calculation now uses the fixed reference half-size (400/300) for the `rx/ry` shift formula, matching C++ `WOFFSET/HOFFSET`
- Result is offset by `(screenHalf - refHalf)` to center on the actual screen
- Tiling coverage still uses actual canvas dimensions — no gaps on any screen size
- Mobile backgrounds (type 4–7) continue to use actual screen half for proper scrolling

### Validation
- `bun run ci` ✅, route smoke ✅

## 2026-02-18 08:12 (GMT+11)
### Summary
- In-canvas chat system matching C++ UIChatBar: Enter toggles chat input at bottom of canvas, message history overlay with expand/collapse.

### Files changed
- `client/web/index.html` — removed old external chat form, added canvas-wrapper with chat-bar and chat-log overlays
- `client/web/styles.css` — canvas-wrapper positioning, chat-bar/chat-log styling (semi-transparent, fade gradient)
- `client/web/app.js` — chat state management, Enter/Escape key routing, message history, input focus suppresses movement

### Behavior
- **Enter** while playing → opens chat bar at bottom of canvas, expands message log, character stops
- **Type + Enter** → sends bubble over character head + adds to chat log, closes input, resumes gameplay
- **Enter with empty** → closes chat (C++ parity: `input_text_enter_callback`)
- **Escape** → closes chat without sending
- Chat log: semi-transparent overlay, shows last messages with fade when collapsed, full scrollable history when expanded
- System messages (yellow italic) for map load events

### Validation
- `bun run ci` ✅, route smoke ✅

## 2026-02-18 07:57 (GMT+11)
### Summary
- Slope landing tangent velocity projection: when landing on a sloped foothold, the incoming velocity vector is projected onto the foothold tangent. This converts downward momentum into horizontal push along the slope.

### Files changed
- `client/web/app.js`

### Details
- Reference: half-web port `Physics.ts` line 381 — `dot = (vx * fx + vy * fy) / (fx² + fy²); vx = dot * fx`
- Before projection, downward velocity capped at `PHYS_MAX_LAND_SPEED = 162.5 px/s` (prevents extreme pushes at terminal fall speed)
- Only applies to non-wall footholds (`|fhx| > 0.01`)
- If player stands still after landing, grounded friction decays the push to zero
- If player jumps immediately, the slope push carries into the air as horizontal momentum

### Validation
- `bun run ci` ✅, route smoke ✅

## 2026-02-18 07:47 (GMT+11)
### Summary
- Complete physics rewrite to faithfully match C++ HeavenClient force/friction/gravity model. Removed all ad-hoc velocity constants and slope-push system.

### Files changed
- `client/web/app.js`

### What was removed
- Instant-speed ground walking (`effectiveMove * 190`)
- Ad-hoc slope landing push system (`landingSlopePushVx`, `slopeLandingPushDeltaVx`, etc.)
- Old friction helpers (`applyCppGroundSlopeDrag`, `applySlopeJumpTakeoffVelocity`)
- Old air control helper (`applyCppFallHorizontalControl`, `AIR_OPPOSITE_DIRECTION_BRAKE_PER_SEC`)
- Redundant gravity in position update step

### What was added
- C++ tick-space physics constants (`PHYS_TPS=125`, `PHYS_GRAVFORCE=0.14`, `PHYS_WALKFORCE=0.16`, `PHYS_JUMPFORCE=4.5`, etc.)
- `applyGroundPhysics()` — C++ `move_normal` grounded friction/slope formula
- Force-based walk (ramp up/down, max ~100px/s at 100% speed stat)
- Jump impulse: -562.5 px/s (was -540)
- Gravity: ~2187.5 px/s² (was 1700)
- Air control: only opposing-direction nudge (~390 px/s²)
- Down-jump: vy=0 (C++ style — just teleport y, let gravity fall)
- Rope side-jump: 160 px/s horizontal, 375 px/s vertical
- Terminal fall speed cap: 670 px/s
- Landing preserves horizontal speed; friction decelerates naturally

### Reference scan basis (read-only)
- `MapleStory-Client/Gameplay/Physics/Physics.cpp` — `move_normal()`
- `MapleStory-Client/Gameplay/Physics/PhysicsObject.h` — tick model
- `MapleStory-Client/Character/PlayerStates.cpp` — walk/jump/fall/climb states
- `MapleStory-Client/Character/Player.cpp` — walkforce/jumpforce formulas

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 07:36 (GMT+11)
### Summary
- Refined airborne direction swap to match C++ fall behavior: reversal can cross into slight opposite velocity (not hard-clamped at zero).

### Files changed
- `client/web/app.js`

### Functional updates
- Updated `applyCppFallHorizontalControl(...)`:
  - removed zero clamp during opposite-direction airborne braking
  - applies signed braking delta directly
- Result:
  - midair opposite input can transition to slight opposite-direction speed after momentum bleed, instead of stopping at exactly zero.

### Reference scan basis (read-only)
- `MapleStory-Client/Character/PlayerStates.cpp` (`PlayerFallState::update`)

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 07:35 (GMT+11)
### Summary
- Implemented non-instant midair direction reversal (C++-style fall behavior), tightened down-climb tolerance to `characterWidth * 0.33`, and fixed ladder top-out overshoot.

### Files changed
- `client/web/app.js`

### Functional updates
- Midair horizontal control:
  - airborne movement no longer sets `vx` directly to input speed each frame
  - opposite direction input now brakes horizontal speed toward zero first (no immediate full-speed inversion)
- Ladder/rope top-out:
  - when exiting upward, snaps to nearby top foothold if present, preventing lift above platform
- Down-climb attach tuning:
  - `climbDownAttachTolerancePx()` now uses `runtime.standardCharacterWidth * 0.33` (min 20)

### Reference scan basis (read-only)
- `MapleStory-Client/Character/PlayerStates.cpp` (`PlayerFallState::update`)
- `MapleStory-Client/Gameplay/Physics/Physics.cpp`
- `MapleWeb/TypeScript-Client/src/Physics.ts`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 07:28 (GMT+11)
### Summary
- Prioritized down-ladder attach so pressing Down near valid rope/ladder starts descent immediately instead of entering prone and waiting through cooldown.

### Files changed
- `client/web/app.js`

### Functional updates
- Added pre-check for down attach candidate before crouch handling.
- If grounded + Down + valid ladder/rope:
  - suppress prone request
  - allow immediate climb attach even during climb cooldown
  - ignore short reattach lock for this prioritized down-attach case

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 07:26 (GMT+11)
### Summary
- Raised down-only ladder attach tolerance from half character width to full character width.

### Files changed
- `client/web/app.js`

### Functional updates
- `climbDownAttachTolerancePx()` now uses full standard character width.
- Downward ladder attach remains broader; upward attach logic remains unchanged.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 07:25 (GMT+11)
### Summary
- Increased ladder attach tolerance when climbing **down** so players can start descent without perfect ladder-center alignment.

### Files changed
- `client/web/app.js`

### Functional updates
- Added `climbDownAttachTolerancePx()` (roughly half character width, min 20px).
- Updated ladder attach range logic for down-only attach path:
  - wider horizontal margin
  - larger top buffer (easier to catch ladder from platform top)
  - slightly increased bottom buffer
- Upward climb attach behavior remains unchanged.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 07:23 (GMT+11)
### Summary
- Added held-key action repetition for jump: holding Space now repeatedly requests jump actions.

### Files changed
- `client/web/app.js`

### Functional updates
- `updatePlayer()` jump request now uses:
  - `jumpQueued` (edge/tap)
  - `jumpHeld` (continuous hold-repeat)
- This enables hold-to-repeat behavior without requiring repeated key taps.

### Reference scan basis (read-only)
- `MapleWeb/TypeScript-Client/src/MapState.ts` (held key polling for jump)
- `MapleWeb/TypeScript-Client/src/GameCanvas.ts` (pressed key state)
- `MapleStory-Client/Character/PlayerStates.cpp`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 07:19 (GMT+11)
### Summary
- Added slope-landing push behavior so jumping onto slanted footholds nudges player along incline direction.

### Files changed
- `client/web/app.js`

### Functional updates
- Added slope-landing impulse model:
  - computes landing tangent projection delta from incoming velocity on non-flat footholds
  - applies capped horizontal push (`landingSlopePushVx`) when landing on slants
  - decays push smoothly over time during grounded movement
- Added safety resets for this transient push on teleport/map load/respawn/climb transitions.
- Debug summary now includes:
  - `player.landingSlopePushVx`

### Reference scan basis (read-only)
- `MapleWeb/TypeScript-Client/src/Physics.ts`
- `MapleStory-Client/Gameplay/Physics/Physics.cpp`
- `MapleStory-Client/Gameplay/Physics/FootholdTree.cpp`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 07:14 (GMT+11)
### Summary
- Fixed runtime summary manual selection/copy by pausing live summary DOM rewrites during user interaction.

### Files changed
- `client/web/app.js`

### Functional updates
- Added runtime summary interaction guard:
  - detects pointer-based selection, focus state, and active text selection within summary
- `updateSummary()` now avoids replacing summary text while user is selecting/copying
- Added memoized summary text write:
  - DOM updates only when content actually changes and interaction guard is inactive

### Why this fixed it
- Previously summary content was rewritten every frame, which reset selection state before copy could complete.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 07:12 (GMT+11)
### Summary
- Made debug tools panel scrollable; runtime summary is now selection-friendly and one-click copyable. Also ensured teleport X/Y stays in browser cache (not URL params).

### Files changed
- `client/web/index.html`
- `client/web/styles.css`
- `client/web/app.js`

### Functional updates
- Debug panel/tool scrolling:
  - added `#debug-panel-scroll` with independent vertical scrolling
- Runtime summary copyability:
  - summary `<pre>` is focusable/selectable (`tabindex`, `user-select: text`)
  - added `Copy` button (`#copy-summary-button`) with clipboard API + fallback copy path
- Teleport form polish:
  - removed teleport input `name` fields so X/Y are not serialized into URL
  - retained localStorage-based teleport preset cache and repopulation on reload
- Layout fix:
  - teleport X/Y inputs now fit inside card at all panel widths (`minmax(0,1fr)`, `min-width:0`, border-box sizing)

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 06:57 (GMT+11)
### Summary
- Set viewport to dynamic by default and removed the user-facing aspect mode switch.

### Files changed
- `client/web/index.html`
- `client/web/app.js`
- `client/web/styles.css`

### Functional updates
- Removed aspect selector control from debug panel.
- Viewport section now displays fixed mode note: `Dynamic (fit screen)`.
- Runtime now always uses dynamic aspect behavior:
  - removed 16:9 / 21:9 mode-switch code path and selector event wiring
  - `applyCanvasAspectMode()` now always performs dynamic fit-to-screen sizing
  - debug summary `viewport.mode` remains `dynamic`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 06:53 (GMT+11)
### Summary
- Expanded chat bubble width cap from 1x to 3x standard character width.

### Files changed
- `client/web/app.js`

### Functional updates
- Added multiplier constant:
  - `CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER = 3`
- Updated `drawChatBubble()` max width logic:
  - now uses `standardCharacterWidth * CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER`
- Existing wrapping behavior remains:
  - bubble still wraps long text and clamps on-screen; it just allows more horizontal room before wrapping.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 06:52 (GMT+11)
### Summary
- Chat bubble width is now constrained to standard character width and long text wraps to multiple lines.

### Files changed
- `client/web/app.js`

### Functional updates
- Added bounded chat bubble layout constants and multiline text sizing.
- Added wrapping helpers:
  - `splitWordByWidth(...)`
  - `wrapBubbleTextToWidth(...)`
- `drawCharacter()` now tracks standard character width from `stand1` composed bounds.
- `drawChatBubble()` now:
  - caps bubble max width to standard character width
  - wraps overflow text vertically instead of expanding bubble width
  - clamps bubble/tail position to keep rendering on-screen

### Reference scan basis (read-only)
- `MapleStory-Client/IO/Components/ChatBalloon.cpp`
- `MapleWeb/TypeScript-Client/src/MapleCharacter.ts`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 06:48 (GMT+11)
### Summary
- Moved map controls and status logs into debug panel; runtime summary now fills canvas-matched panel height instead of fixed-height behavior.

### Files changed
- `client/web/index.html`
- `client/web/styles.css`

### Functional updates
- Debug panel now contains:
  - map id input + load map button
  - audio enable button
  - status log output (`#status`)
- Runtime summary sizing:
  - removed fixed max-height behavior
  - debug panel now stretches with canvas row height
  - runtime summary section uses flexible height (`flex: 1`) and internal scrolling
- Visual cleanup:
  - map/status controls styled as panel cards for easier scanning

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 06:44 (GMT+11)
### Summary
- Tidied debug sidebar UI and added live viewport aspect controls: 16:9, 21:9, and dynamic fit-to-screen.

### Files changed
- `client/web/index.html`
- `client/web/styles.css`
- `client/web/app.js`

### Functional updates
- Debug panel UX refresh:
  - reorganized into clear sections (`Viewport`, `Overlays`, `Runtime Summary`)
  - improved panel/card styling, spacing, and log readability
- Added aspect mode selector (`#aspect-mode-select`) with options:
  - `16:9`
  - `21:9`
  - `dynamic` (fit screen)
- Canvas behavior updates:
  - fixed-ratio display for 16:9 and 21:9 modes
  - dynamic mode computes display height from current screen/layout space
  - switching mode triggers immediate canvas resolution resync
- Debug summary now includes:
  - viewport mode
  - render width/height
  - display width/height

### Reference scan basis (read-only)
- `MapleWeb/TypeScript-Client/src/Config.ts`
- `MapleStory-Client/Constants.h`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 06:38 (GMT+11)
### Summary
- Updated scene/parallax rendering for responsive 16:9 canvas layout and resize-safe viewport coverage.

### Files changed
- `client/web/index.html`
- `client/web/styles.css`
- `client/web/app.js`

### Functional updates
- Canvas/layout modernization:
  - default canvas size changed to `1280x720`
  - canvas now uses `aspect-ratio: 16 / 9` (responsive widescreen)
- Runtime resize handling:
  - added `syncCanvasResolution()` and `bindCanvasResizeHandling()`
  - synchronizes canvas backing resolution with displayed size on window/layout changes
- Parallax background coverage hardening:
  - switched tiled background drawing to viewport-range coverage (`xBegin/xEnd`, `yBegin/yEnd`) with seam-safe overdraw margin
  - removes fixed-size assumptions that caused occasional empty patches while resizing
- Debug visibility:
  - summary now includes viewport width/height/aspect

### Reference scan basis (read-only)
- `MapleWeb/TypeScript-Client/src/Background.ts`
- `MapleStory-Client/Gameplay/MapleMap/MapBackgrounds.cpp`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 06:33 (GMT+11)
### Summary
- Tuned same-map portal momentum scroll to feel snappier while retaining fluid start/end motion.

### Files changed
- `client/web/app.js`

### Functional updates
- Adjusted intramap portal camera timing/speed constants:
  - `PORTAL_SCROLL_MIN_MS`: `260 -> 180`
  - `PORTAL_SCROLL_MAX_MS`: `820 -> 560`
  - `PORTAL_SCROLL_SPEED_PX_PER_SEC`: `2200 -> 3200`
- Result:
  - faster camera travel and quicker settle on destination portal with preserved ease-in/ease-out feel.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 06:31 (GMT+11)
### Summary
- Refined same-map portal camera movement into a fluid momentum scroll with natural acceleration/deceleration.

### Files changed
- `client/web/app.js`

### Functional updates
- Added dedicated intramap portal camera tweening:
  - runtime state `runtime.portalScroll` tracks start/target/duration/progress
  - smootherstep easing (`portalMomentumEase`) gives zero-speed start/end for natural motion
  - distance-based duration clamped by:
    - `PORTAL_SCROLL_MIN_MS`
    - `PORTAL_SCROLL_MAX_MS`
    - `PORTAL_SCROLL_SPEED_PX_PER_SEC`
- Same-map portal flow now:
  1. player relocates to destination portal
  2. camera runs momentum tween to destination follow point
  3. portal warp-in-progress ends after tween completion
- Added debug telemetry:
  - `debug.portalScrollActive`
  - `debug.portalScrollProgress`

### Reference scan basis (read-only)
- `MapleWeb/TypeScript-Client/src/Camera.ts`
- `MapleWeb/TypeScript-Client/src/MapleCharacter.ts`
- `MapleStory-Client/Gameplay/Stage.cpp`
- `MapleStory-Client/Gameplay/MapleMap/MapPortals.cpp`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-18 06:26 (GMT+11)
### Summary
- Same-map portal travel now scrolls the camera to destination instead of instantly snapping the viewport.

### Files changed
- `client/web/app.js`

### Functional updates
- Updated intramap portal movement (`movePlayerToPortalInCurrentMap(...)`):
  - removed direct camera snap (`runtime.camera.x/y = ...`) after local portal relocation
  - kept player destination placement + foothold resolution logic unchanged
- Result:
  - same-map portal usage now uses existing `updateCamera(...)` smoothing, producing a visible scroll transition.

### Reference scan basis (read-only)
- `MapleStory-Client/Gameplay/Stage.cpp` (`check_portals` intramap branch)
- `MapleStory-Client/Gameplay/MapleMap/MapPortals.cpp`
- `MapleWeb/TypeScript-Client/src/MapleCharacter.ts` (`checkForPortal`)
- `MapleWeb/TypeScript-Client/src/Camera.ts` (eased camera update)

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:45 (GMT+11)
### Summary
- Updated airborne render-layer logic so front/behind ordering changes during jump/fall, not only on landing.

### Files changed
- `client/web/app.js`

### Functional updates
- Added `currentPlayerRenderLayer()` to choose draw layer dynamically:
  - climbing uses layer `7`
  - otherwise uses nearest foothold below current position (`findFootholdBelow`)
  - fallback to persisted foothold layer when no foothold candidate is found
- `drawMapLayersWithCharacter()` now uses this live render layer instead of only settled foothold layer.
- Debug summary now includes `player.renderLayer` for verification.

### C++ parity references
- `MapleStory-Client/Gameplay/Physics/FootholdTree.cpp` (`update_fh` / `get_fhid_below`)
- `MapleStory-Client/Character/Char.cpp` (`get_layer`)
- `MapleStory-Client/Gameplay/Stage.cpp` (layer-interleaved draw)

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:42 (GMT+11)
### Summary
- Added cross-map portal fade transitions and offset spawn placement above destination portal.

### Files changed
- `client/web/app.js`

### Functional updates
- Portal transfer UX:
  - cross-map portal travel now fades out before map load and fades in after load
  - transition timings: ~180ms fade-out, ~240ms fade-in
- Destination spawn adjustment:
  - when arriving from portal transfer, player spawns slightly above target portal (`-24px`)
  - helps prevent rough foothold geometry from dropping player below expected portal position
- Added transition runtime state and render overlay:
  - `runtime.transition.alpha`
  - `drawTransitionOverlay()` in both loading and world render paths
- Added transition debug telemetry:
  - `debug.transitionAlpha`
  - `debug.portalWarpInProgress`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:38 (GMT+11)
### Summary
- Improved portal `↑` usage reliability and restored map layer/z-based front-object occlusion over the player.

### Files changed
- `client/web/app.js`

### Functional updates
- Portal interaction:
  - added immediate portal-use attempt on `↑/W` keydown
  - moved portal-use check earlier in update flow (before movement)
  - expanded portal destination handling:
    - valid `tm` -> map warp
    - same-map/invalid-map + valid `tn` -> intramap portal-name warp
    - fallback to `info.returnMap` when direct destination is unavailable
  - ignores placeholder destination names like `N/A`
- Render layering:
  - map layer draw now interleaves character by foothold layer (`drawMapLayersWithCharacter`)
  - tiles now parse/sort by `zM` (stable tie by node id)
  - objects now stable-sort by `z` (tie by node id)
  - higher map layers now render in front of player as expected

### C++ / reference parity sources
- `MapleStory-Client/Gameplay/Stage.cpp`
- `MapleStory-Client/Gameplay/MapleMap/MapPortals.cpp`
- `MapleStory-Client/Gameplay/MapleMap/Portal.cpp`
- `MapleStory-Client/Gameplay/MapleMap/MapTilesObjs.cpp`
- `MapleStory-Client/Gameplay/MapleMap/Obj.cpp`
- `MapleStory-Client/Gameplay/MapleMap/Tile.cpp`
- `MapleWeb/TypeScript-Client/src/MapleMap.ts`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:28 (GMT+11)
### Summary
- Implemented portal interaction on `↑` so standing on a portal now triggers warps.

### Files changed
- `client/web/app.js`

### Functional updates
- Added runtime portal interaction state:
  - `portalCooldownUntil`
  - `portalWarpInProgress`
- Added portal interaction helpers:
  - `findUsablePortalAtPlayer(map)`
  - `movePlayerToPortalInCurrentMap(targetPortalName)`
  - `tryUsePortal()`
- Update loop now checks portal usage each frame while `↑` is held.
- Added short anti-repeat cooldown (~400ms).
- `loadMap(...)` now accepts optional `spawnPortalName` so intermap portals can place player at target portal name (`tn`) when available.

### C++ parity references
- `MapleStory-Client/Gameplay/Stage.cpp` (`check_portals`)
- `MapleStory-Client/Gameplay/MapleMap/MapPortals.h` (`WARPCD`)

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:25 (GMT+11)
### Summary
- Moved debug controls/logs into a dedicated panel and split overlay controls into independent toggles.

### Files changed
- `client/web/index.html`
- `client/web/styles.css`
- `client/web/app.js`

### Functional updates
- Added dedicated debug panel (`#debug-panel`) with live debug log (`#map-summary`).
- Added separate overlay toggles:
  - master overlay on/off
  - ropes
  - footholds
  - life markers
- Runtime debug state now tracks each toggle independently.
- Render pass now draws each debug layer independently based on its own toggle.
- Sub-toggles are disabled when master overlay is off.
- Debug summary includes full toggle state.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:22 (GMT+11)
### Summary
- Added a checkbox to toggle debug overlay drawings on the game canvas.

### Files changed
- `client/web/index.html`
- `client/web/app.js`

### Functional updates
- New UI control: `#debug-overlay-toggle` (checked by default).
- Runtime flag: `runtime.debugOverlayEnabled`.
- Render gating:
  - when enabled: draws rope guides + foothold/marker overlay
  - when disabled: hides those debug drawings
- Added debug summary field:
  - `debug.overlayEnabled`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:19 (GMT+11)
### Summary
- Added blocking loading screen with progress bar until required map/character assets are loaded.

### Files changed
- `client/web/app.js`

### Functional updates
- Added runtime loading state:
  - `loading.active`, `loading.total`, `loading.loaded`, `loading.progress`, `loading.label`
  - `mapLoadToken` for race-safe async map loads
- Asset pipeline now supports awaited preloading:
  - `requestMeta()` and `requestImageByKey()` now return promises
  - async metadata loaders extracted for background/tile/object/portal
- Added preload flow:
  - map tasks (backgrounds/tiles/objects/portal frames)
  - initial character tasks (`stand1`, `walk1`, `jump`, `ladder`, `rope`, `prone`, `sit` frame 0)
  - concurrent worker preload with live progress updates
- Added `drawLoadingScreen()` and render gating:
  - while loading is active, canvas shows loading overlay/progress bar
  - world draw is blocked until preload completion
- `loadMap()` now awaits preload completion before map ready status/BGM finalization.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:13 (GMT+11)
### Summary
- Implemented C++-style background parallax for scene/cloud layers.

### Files changed
- `client/web/app.js`

### Functional updates
- Reworked `drawBackgroundLayer()` to screen-space background rendering with type-aware behavior.
- Added parallax/motion behavior using `rx/ry` and background `type`:
  - static parallax for non-mobile types
  - continuous drift for mobile types (`4/5/6/7`)
- Kept tiled background coverage semantics (`+3` viewport margin) using `cx/cy`.
- Added flip-aware screen draw helper: `drawScreenImage(...)`.
- Back layer now fills black for maps with `blackBackground` marker.

### C++ parity references
- `MapleStory-Client/Gameplay/MapleMap/MapBackgrounds.cpp`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:10 (GMT+11)
### Summary
- Added slope jump-off push impulse so jumping from inclines pushes character away from slope.

### Files changed
- `client/web/app.js`

### Functional updates
- Added `applySlopeJumpTakeoffVelocity(hspeed, slope, moveDir)`:
  - applies C++-style slope drag first
  - when no horizontal input and takeoff would be near stationary, injects downslope push (`slope * 120`)
- Normal jump path now uses this takeoff helper.
- Outcome: slope jump-off now has a visible away-from-slope horizontal launch response.

### Why this was needed
- The web debug client’s simplified ground velocity model under-represented C++ continuous slope/inertia behavior at jump takeoff.
- This patch restores expected feel without replacing the whole movement integrator.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:08 (GMT+11)
### Summary
- Added slope-aware jump takeoff adjustment based on C++ normal-ground physics terms.

### Files changed
- `client/web/app.js`

### Functional updates
- Added C++-inspired constants for ground slope drag:
  - `CPP_GROUND_FRICTION = 0.5`
  - `CPP_SLOPE_FACTOR = 0.1`
  - `CPP_GROUND_SLIP = 3.0`
- Added helpers:
  - `footholdSlope(foothold)`
  - `applyCppGroundSlopeDrag(hspeed, slope)`
- On normal jump (non down-jump), when on a sloped foothold:
  - horizontal takeoff velocity now gets a slope/friction adjustment before lift-off
  - slope contribution is clamped to `[-0.5, 0.5]` (matching C++ behavior)

### C++ parity references
- `MapleStory-Client/Gameplay/Physics/Physics.cpp` (`move_normal`)
- `MapleStory-Client/Gameplay/Physics/Foothold.cpp` (`slope`)

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:05 (GMT+11)
### Summary
- Clamped horizontal camera/render span to foothold left/right extents.

### Files changed
- `client/web/app.js`

### Functional updates
- Added `map.footholdBounds` (`minX`, `maxX`) derived from foothold endpoints during map parse.
- Updated `updateCamera()` horizontal clamp to keep camera center within foothold render range:
  - `minCenterX = footholdMinX + viewportHalfWidth`
  - `maxCenterX = footholdMaxX - viewportHalfWidth`
- If foothold span is narrower than viewport, camera now centers on foothold midpoint.
- Debug summary now includes `footholdBounds` for verification.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 18:02 (GMT+11)
### Summary
- Fixed intermittent character render blip where the sprite vanished for a frame and reappeared.

### Files changed
- `client/web/app.js`

### Functional updates
- Added render fallback state: `runtime.lastRenderableCharacterFrame`.
- Refactored character composition into `composeCharacterPlacements(...)`.
- `drawCharacter()` now:
  - renders current frame when available
  - falls back to last renderable frame if current frame assets are not yet ready
  - updates fallback snapshot once current frame is renderable again
- Fallback state resets on map load.

### Why this fixes the issue
- Previous behavior returned early when the current frame had no loaded `body` image, causing a one-frame disappearance.
- Fallback keeps a valid drawable frame through transient asset cache gaps.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:59 (GMT+11)
### Summary
- Fixed portal visibility/render mapping: visible portals were hidden and hidden portals were visible.

### Files changed
- `client/web/app.js`

### Functional updates
- Portal parsing now includes:
  - `portal.id`
  - `portal.image`
- Replaced incorrect portal style mapping with type-aware behavior:
  - **always draw**: types `2`, `4`, `7`, `11`
  - **draw only when touched**: type `10` (hidden)
  - **not drawn**: spawn/invisible/touch-only and other non-visual types
- Portal asset resolution now matches C++ structure:
  - regular: `portal/game/pv`
  - hidden: `portal/game/ph/default/portalContinue`
  - scripted hidden: `portal/game/psh/<image>/portalContinue` (fallback `default`)

### C++ parity references
- `MapleStory-Client/Gameplay/MapleMap/Portal.cpp`
- `MapleStory-Client/Gameplay/MapleMap/MapPortals.cpp`
- `MapleWeb/TypeScript-Client/src/Portal.ts`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:56 (GMT+11)
### Summary
- Fixed regression where scene stopped rendering after background renderer refactor.
- Restored stable background rendering and kept safe tiled coverage improvements.

### Files changed
- `client/web/app.js`

### Functional updates
- Restored reliable background metadata draw path (`requestBackgroundMeta`).
- Retained enriched background parse fields (`type`, `cx`, `cy`, `rx`, `ry`, `flipped`).
- Added viewport tile repetition for tiled background types using `cx/cy` to reduce uncovered dark areas.
- Fixed flipped background draw invocation to pass `{ flipped: background.flipped }`.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:51 (GMT+11)
### Summary
- Fixed scene dark patches by reworking background rendering toward C++ `MapBackgrounds` behavior.

### Files changed
- `client/web/app.js`

### Functional updates
- Background parse now includes C++-relevant fields:
  - `index`, `type`, `rx`, `ry`, `cx`, `cy`, `flipped`
  - map-level `blackBackground`
- Replaced single-background-canvas draw with source/frame loading that supports:
  - direct `$canvas` backgrounds
  - animated frame lists
  - frame `delay` and `a0/a1` alpha blending
- Implemented C++-style background draw semantics:
  - type-driven tiling counts (`horizontal` / `vertical` / `both`)
  - parallax/motion handling via `type` and `rx/ry`
  - origin + flipped placement per tile
  - black fill pass for black-background maps

### C++ parity references
- `MapleStory-Client/Gameplay/MapleMap/MapBackgrounds.cpp`
- `MapleStory-Client/Gameplay/MapleMap/MapBackgrounds.h`
- `MapleStory-Client/Gameplay/Stage.cpp`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:46 (GMT+11)
### Summary
- Down-jump now hard-locks horizontal movement until landing on the lower foothold.

### Files changed
- `client/web/app.js`

### Functional updates
- Added down-jump control lock state:
  - `player.downJumpControlLock`
  - `player.downJumpTargetFootholdId`
- On successful `jump + down`, lock is enabled and target foothold is recorded.
- While airborne with lock active, left/right input is ignored.
- Lock clears on landing and on reset paths (map reload/respawn/other jump branches).
- Debug panel (`map-summary`) now shows:
  - `player.downJumpControlLock`
  - `player.downJumpTargetFootholdId`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:43 (GMT+11)
### Summary
- Corrected jump sound effect to match C++ implementation parity.
- Added audio debug telemetry in the in-page debug panel.

### Files changed
- `client/web/app.js`

### Functional updates
- Jump-related actions now play `Sound.wz/Game.img/Jump` (`Game/Jump`) instead of `Game/Portal2`:
  - normal jump
  - down-jump
  - rope/ladder jump-off
- Added debug panel audio fields under map summary JSON:
  - `audio.currentBgm`
  - `audio.lastSfx`
  - `audio.lastSfxAgeMs`
  - `audio.sfxPlayCount`

### C++/reference parity notes
- `MapleStory-Client/Character/PlayerStates.cpp`: jump and ladder jump-off call `play_jumpsound()`.
- `MapleStory-Client/Audio/Audio.cpp`: `Sound::Name::JUMP` maps to `Game.img/Jump`.
- `MapleWeb/TypeScript-Client/src/MapleCharacter.ts`: jump uses `Sound.wz/Game.img/Jump`.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:35 (GMT+11)
### Summary
- Fixed down-jump key behavior and no-target down-jump fallback.
- Increased face/blink animation speed.
- Fixed missing portal visuals and missing background scenery/cloud rendering.
- Added canvas-scoped keyboard input gating.

### Files changed
- `client/web/app.js`
- `client/web/index.html`
- `README.md`

### Functional updates
- `jump + down` now ignores left/right input (`vx=0`) during down-jump attempts.
- `jump + down` with no valid foothold below no longer jumps up; character stays grounded.
- Facial animation speed increased:
  - faster blink cooldown cycle
  - reduced face-frame delays (higher effective FPS)
- Background rendering fix:
  - `Back/*.img` lookup now supports direct `$canvas` children under `back/ani` groups
  - restores clouds/scenery rendering
- Portal rendering added:
  - animated portal sprites (`pv/ph/psh`) loaded from `Map.wz/MapHelper.img.json`
  - integrated in world render pass
- Keyboard input gating:
  - canvas is focusable (`tabindex="0"`)
  - gameplay keys only active while canvas is entered/focused/clicked
  - gameplay input resets on canvas blur/leave

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:27 (GMT+11)
### Summary
- Reattach cooldown now applies only when reattaching to the same rope.

### Files changed
- `client/web/app.js`

### Functional updates
- Reattach lock duration remains `200ms`.
- Added per-rope lock scoping (`reattachLockRopeKey`):
  - same rope: lock enforced
  - different rope: immediate attach allowed
- Result: jumping across ropes can attach instantly, while same-rope spam reattach is still throttled.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:21 (GMT+11)
### Summary
- Increased ladder/rope down-climb horizontal capture margin further.

### Files changed
- `client/web/app.js`

### Functional updates
- `ladderInRange` climb-down horizontal tolerance changed from `±16` to `±20`.
- Result: easier down-climb attach when player is around (not centered on) ladder/rope x-axis.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:20 (GMT+11)
### Summary
- Relaxed ladder/rope down-climb attach requirements near ladder top/around-ladder area.

### Files changed
- `client/web/app.js`

### Functional updates
- `ladderInRange` now uses direction-specific tolerances:
  - climb-up attach: unchanged tight envelope (`±12`, no extra vertical buffer)
  - climb-down attach: more forgiving envelope (`±16`, top buffer `-18`, bottom buffer `+12`)
- Result: pressing down near/around ladder/rope is less strict and more reliably attaches for climbing down.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:18 (GMT+11)
### Summary
- Fixed rope climbing horizontal alignment offset.
- Restored ability to re-grab ladder/rope while airborne after jumping off mid-ladder.

### Files changed
- `client/web/app.js`

### Functional updates
- Added climb snap correction: while attached, player x now uses `rope.x - 1` to address right-shift drift.
- Climb attach gating now allows mid-air reattach even if climb cooldown is active.
- Result: player can jump from mid-ladder and climb back onto ladder/rope mid-air with climb input.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:16 (GMT+11)
### Summary
- Fixed diagonal jump-through on inclined/uneven footholds.

### Files changed
- `client/web/app.js`

### Functional updates
- Landing detection now uses swept segment intersection between player motion (`oldX,oldY -> newX,newY`) and foothold segments.
- Replaces previous end-of-frame x-only landing probe that could miss diagonal slope intersections.
- Down-jump exclusion behavior remains supported in the new landing function.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:14 (GMT+11)
### Summary
- Fixed down-jump hop behavior so it can reliably reach lower footholds.
- Stabilized ladder/rope climbing facing to default centered presentation.

### Files changed
- `client/web/app.js`

### Functional updates
- Climbing now locks to default facing sprite while attached (`facing=-1`) and remains centered on rope x-position.
- Down-jump improvements:
  - below-foothold search now excludes the current foothold
  - after down-jump, current foothold is temporarily excluded from landing checks (~260ms)
  - prevents immediate re-landing on source foothold after hop
- If no valid foothold below exists, `down + jump` now falls back to normal jump instead of prone no-op.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:10 (GMT+11)
### Summary
- Tightened down-jump requirements and added slight hop on down-jump.
- Reduced foothold-end sticking when no blocking wall should apply.

### Files changed
- `client/web/app.js`

### Functional updates
- Down-jump (`jump + down`) now strictly requires a **different** foothold below current ground within 600px.
- Down-jump now includes a small hop impulse (`vy=-190`) for the expected visual transition.
- Down-jump now zeroes horizontal speed for stable drop-through behavior.
- Foothold edge resolver no longer clamps to edge for non-blocking wall-linked transitions, reducing stuck-at-edge behavior.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:07 (GMT+11)
### Summary
- Tuned rope attach tolerance and rope jump-off physics.
- Added C++-style down-jump behavior for `jump + down` on footholds.

### Files changed
- `client/web/app.js`

### Functional updates
- Rope/ladder attach now allows a tiny extra horizontal margin (`±12`) so attachment is less pixel-perfect.
- Rope side jump-off now uses reduced vertical launch (`vy=-360`) consistent with C++ climb jump ratio (`-jumpforce/1.5`).
- Implemented down-jump flow:
  - when grounded and pressing `jump + down`, if a lower foothold exists within 600px vertical range,
  - player is moved to `ground + 1` and enters falling state to drop to lower platform.

### Reference alignment
- C++ climb jump in `PlayerClimbState` uses reduced jump vertical speed (`-jumpforce / 1.5`).
- C++ down-jump logic in walk/prone state uses `enablejd` + `groundbelow` when lower foothold is within threshold.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:04 (GMT+11)
### Summary
- Added deeper C++-style foothold edge/slope transition handling for uneven surfaces.

### Files changed
- `client/web/app.js`

### Functional updates
- `resolveFootholdForX` now follows C++ edge transition semantics more closely:
  - uses `floor(x) > right` and `ceil(x) < left` checks
  - traverses linked `prev`/`next` footholds across multiple segments
  - clamps to foothold edge when adjacent link is a wall foothold
- `findFootholdBelow` now includes a small tolerance (`minY - 1`) to reduce floating precision ground-loss on slopes.
- Result: better continuity while walking on uneven/inclined footholds and reduced fall-through at slope edges.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 17:01 (GMT+11)
### Summary
- Fixed inclined/uneven foothold movement so character follows slopes instead of falling through.

### Files changed
- `client/web/app.js`

### Functional updates
- Added grounded slope projection (`groundYOnFoothold`) to keep player snapped to sloped footholds.
- Added linked foothold transition logic (`resolveFootholdForX`) to move across `prev`/`next` footholds when crossing platform edges.
- Split grounded and airborne movement integration:
  - grounded path follows foothold ground
  - airborne path applies gravity and landing checks
- Wall collision checks remain active in both paths.

### Reference alignment
- Mirrors core intent of C++ `FootholdTree::update_fh` + linked foothold traversal behavior for grounded movement.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 16:57 (GMT+11)
### Summary
- Adjusted draw ordering so character renders after map objects and rope/ladder guides.
- Improved per-layer object ordering using map `z` values.

### Files changed
- `client/web/app.js`

### Functional updates
- Render order now ensures:
  - map layers (objects/tiles) draw first
  - rope/ladder guides draw before player
  - player draws after those objects
- `drawMapLayers()` no longer draws the player interleaved by foothold layer.
- Map objects are now sorted by `z` within each layer for closer C++-style ordering behavior.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=104040000` returns 200 ✅

## 2026-02-17 16:54 (GMT+11)
### Summary
- Changed web debug client default map to `104040000`.

### Files changed
- `client/web/index.html`
- `client/web/app.js`
- `README.md`

### Functional updates
- Map form default value now starts on `104040000`.
- App fallback `initialMapId` now defaults to `104040000` when query param is absent.
- README default URL updated accordingly.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke:
  - `CLIENT_WEB_PORT=5210 bun run client:web` ✅
  - `GET /` => 200 ✅
  - `GET /resources/Map.wz/Map/Map1/104040000.img.json` => 200 ✅

## 2026-02-17 16:53 (GMT+11)
### Summary
- Rope climbing now uses rope animation instead of ladder animation.
- Interactable overlay layering remains aligned with C++ stage ordering expectations.

### Files changed
- `client/web/app.js`

### Functional updates
- Climbing action selection now differentiates ladder vs rope:
  - ladder (`l=1`) -> `ladder`
  - rope (`l=0`) -> `rope` (fallback to `ladder` if rope frames missing)
- Interactable visuals continue to render after back backgrounds and before foreground backgrounds, so default interactables appear in front of background unless explicitly front-layered background content overlays them.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 16:51 (GMT+11)
### Summary
- Updated rope/ladder visual layering per latest request.

### Files changed
- `client/web/app.js`

### Functional updates
- Render order changed so `drawRopeGuides()` now runs after map+character rendering.
- Result: rope/ladder guides now render in front of the character.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 16:48 (GMT+11)
### Summary
- Fixed airborne wall collision behavior so jumping into walls blocks horizontal movement.

### Files changed
- `client/web/app.js`

### Functional updates
- Removed grounded-only guard from horizontal wall collision resolution.
- Added foothold-below fallback for airborne frames to derive wall-context foothold (C++ `get_fhid_below` intent).
- Result: when moving/jumping into a wall, character no longer keeps moving forward through it.

### Reference alignment
- C++ `FootholdTree::limit_movement` applies horizontal wall limiting for hmobile objects, not just grounded movement.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 15:41 (GMT+11)
### Summary
- Ported key C++ ladder/foothold/wall behavior into the web debug client movement loop.
- Restored top-of-ladder `↓` attach behavior so players can climb down from ladder tops.

### Files changed
- `client/web/app.js`
- `client/web/index.html`
- `README.md`

### Functional updates
- Added foothold-derived wall/border ranges (matching C++ foothold tree defaults):
  - walls: `left + 25`, `right - 25`
  - borders: `top - 300`, `bottom + 100`
- Reworked wall collision to use C++-style two-hop foothold wall checks (`get_wall` behavior).
- Reworked ladder/rope checks with C++-style semantics:
  - in-range uses ±10 px horizontal with ±5 y probe offset (`up` vs `down`)
  - `felloff` checks determine ladder detach at top/bottom
  - climb cooldown applied after cancel/jump-off
  - jump-off still requires `Space` + (`←` or `→`)
- Top-of-ladder behavior:
  - pressing `↓` while not attached can now grab and climb down ladder/rope if in range.

### Reference scan used for this change
- `MapleStory-Client/Gameplay/Physics/FootholdTree.cpp`
- `MapleStory-Client/Gameplay/Physics/Foothold.cpp`
- `MapleStory-Client/Gameplay/MapleMap/MapInfo.{h,cpp}`
- `MapleStory-Client/Character/PlayerStates.cpp`
- `MapleStory-Client/Character/Player.cpp`
- `MapleStory-Client/Gameplay/Stage.cpp`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 15:35 (GMT+11)
### Summary
- Refined rope/ladder behavior to match requested controls and removed unwanted top-of-rope re-attach teleport.
- Adjusted rope debug rendering order so rope/ladder guides draw behind the character.

### Files changed
- `client/web/app.js`
- `client/web/index.html`
- `README.md`

### Functional updates
- Rope/ladders now render behind the character (`drawRopeGuides()` runs before map/character pass).
- Rope attach behavior changed:
  - not attached: only `↑` can grab rope/ladder
  - not attached: `↓` no longer starts climbing
- Rope jump-off behavior changed:
  - attached: jump-off requires `Space` + (`←` or `→`) together
  - attached: `Space` alone does nothing
  - attached: `←`/`→` alone does nothing
- Top-of-rope behavior changed:
  - pressing `↑` at top no longer snaps/re-attaches the character to rope start.

### Reference scan used for this change
- C++ climb state jump-off condition (`JUMP` + walk input): `MapleStory-Client/Character/PlayerStates.cpp`
- TS half-web climbing context: `MapleWeb/TypeScript-Client/src/MapleCharacter.ts`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 15:31 (GMT+11)
### Summary
- Fixed movement lock at foothold edges.
- Walking off a foothold now drops/falls correctly when there is no blocking wall.

### Files changed
- `client/web/app.js`

### Functional updates
- Foothold link parsing now treats `prev/next = 0` as no link (`null`) instead of a valid foothold ID.
- Replaced broad wall-crossing drop lock with foothold-link edge rules derived from MapleWeb physics behavior:
  - moving right: block only when linked `next` foothold is vertical and `y1 > y2`
  - moving left: block only when linked `prev` foothold is vertical and `y1 < y2`
- Result: non-wall foothold edges no longer "stick" the player; character can naturally walk off and fall.

### Reference scan used for this change
- TS half-web physics edge logic: `MapleWeb/TypeScript-Client/src/Physics.ts`
- C++ foothold movement-limiting reference: `MapleStory-Client/Gameplay/Physics/FootholdTree.cpp`

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 15:25 (GMT+11)
### Summary
- Fixed prone (`prone`) pose disappearing in the offline debug client.
- Improved layer-order rendering so map layers can occlude the character similar to C++ `Stage::draw` behavior.

### Files changed
- `client/web/app.js`

### Functional updates
- Character action frame parsing now resolves `$uol` part links (e.g. prone -> `../../proneStab/0/body`, `arm`) instead of only direct `$canvas` parts.
- Added foothold layer tracking on landings/top-of-rope transitions.
- Map rendering now draws the character at its current foothold layer during the 0..7 layer pass (instead of always after all layers).
- Result: prone rendering is visible again; upper map layers/background elements can appear in front of the player where expected.

### Reference scan used for this change
- C++: `MapleStory-Client/Gameplay/Stage` draw ordering model (layer pass with characters inside layer traversal)
- C++: `Character/PlayerStates.cpp` climb/jump-off behavior
- TS half-web reference: `MapleWeb/TypeScript-Client` prone/ladder handling context

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 15:02 (GMT+11)
### Summary
- Updated ladder movement input policy to prevent horizontal movement while attached to rope/ladder.
- Pressing left/right while climbing now performs a side jump-off instead of detaching into a slide/fall.

### Files changed
- `client/web/app.js`
- `client/web/index.html`
- `README.md`

### Functional updates
- While climbing:
  - `←`/`→` no longer act as ladder-walk movement.
  - `←`/`→` now trigger jump-off with horizontal impulse.
  - `Space` still jumps off rope/ladder.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 14:54 (GMT+11)
### Summary
- Refined wall collision behavior so vertical wall blockers only stop movement when crossing would drop the player into out-of-bounds void.
- Internal walls now allow traversal if there is supporting foothold geometry below on the destination side.

### Files changed
- `client/web/app.js`

### Functional updates
- Added ground-below probe for attempted wall crossing.
- Wall collision now applies only when:
  - player is grounded, and
  - crossing side has no foothold below current height (`crossingWouldFallOffMap`).

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 14:52 (GMT+11)
### Summary
- Added default blink animation cycling for the character face.
- Fixed rope top-exit behavior so climbing up can transition onto the platform instead of sticking at the top.
- Added vertical foothold wall collision checks to reduce walking through map walls/ledge side barriers.

### Files changed
- `client/web/app.js`

### Functional updates
- Face animation:
  - default face expression now blinks periodically using `blink` frames/delays from `Face/00020000.img.json`.
- Rope climbing:
  - pressing `↑` at rope top now tries to snap onto nearby foothold and exit climbing state.
- Wall collision:
  - extracts vertical foothold segments as wall lines.
  - blocks horizontal movement when crossing those wall lines at matching Y range.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 14:47 (GMT+11)
### Summary
- Updated airborne action behavior to always use `jump` (removed `fly` stance switching).
- Added default face rendering to character composition using `Character.wz/Face/00020000.img.json`.
- Improved anchor placement stability so dependent parts (e.g. face needing `brow` from head) resolve in iterative passes.

### Files changed
- `client/web/app.js`

### Functional updates
- Airborne state now maps to `jump` only.
- Character loads default face asset and renders it when frame `face` flag is enabled.
- Face anchors to `brow` map point from head.

### Validation
- Automated: `bun run ci` ✅
- Manual route smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + `/?mapId=100020000` returns 200 ✅

## 2026-02-17 14:41 (GMT+11)
### Summary
- Improved character part composition and added rope climbing controls in the offline debug client.
- Addressed jump-arm oddities by switching from fixed arm/hand placement to generalized per-part anchor composition (including `lHand`/`rHand` frames).

### Files changed
- `client/web/app.js`
- `client/web/index.html`
- `README.md`
- `docs/process/phase6-runtime-hardening.md`

### Functional updates
- Character composition now:
  - uses frame canvas parts dynamically (`body`, `arm`, `lHand`, `rHand`, etc.)
  - anchors parts via shared `map` vectors
  - applies character-only flip per part
  - includes z-order guidance from `Base.wz/zmap.img.json`
- Rope climbing:
  - `↑`/`↓` near ladder-rope nodes enters climbing
  - climbing uses `ladder` stance
  - `Space` jumps off rope

### Validation
- Automated: `bun run ci` ✅
- Manual web smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + map route load ✅

## 2026-02-17 14:33 (GMT+11)
### Summary
- Added airborne stance switching for the offline web client.
- Character now uses `jump` while rising and `fly` while descending, then returns to `walk1`/`stand1` on landing.

### Files changed
- `client/web/app.js`

### Validation
- Automated baseline: `bun run ci` ✅

## 2026-02-17 14:31 (GMT+11)
### Summary
- Fixed major sprite-orientation regression where moving left/right appeared to flip the map instead of the character.
- Updated character rendering to follow MapleWeb-style anchor mapping (`origin` + `map` vectors such as `navel`/`neck`) and added head rendering source from `Character.wz/00012000.img.json`.

### Files changed
- `client/web/app.js` (rendering math and composition updates)

### What was corrected
- World tiles/objects/backgrounds no longer mirror based on facing direction.
- Character parts now flip independently from the map.
- Arm/hand placement now anchors from body `navel` mapping.
- Head is now included and anchored from body `neck` mapping.

### Validation
- Automated baseline: `bun run ci` ✅
- Manual web smoke: `CLIENT_WEB_PORT=5210 bun run client:web` + map route load ✅

## 2026-02-17 14:22 (GMT+11)
### Summary
- Upgraded the browser client from structural preview to an **offline playable debug client**.
- Added map scene rendering (backgrounds, tiles, objects), playable character movement/jump, chat bubbles, and audio hooks (BGM/SFX with user audio unlock).
- Default route now supports immediate verification on map `100020000`.

### Files changed
- `client/web/app.js` (major rewrite)
- `client/web/index.html`, `client/web/styles.css`
- `tools/dev/serve-client-web.mjs`
- `client/package.json`, root `package.json`
- `README.md`, `docs/process/phase6-runtime-hardening.md`

### Validation
- Manual web smoke:
  - `CLIENT_WEB_PORT=5190 bun run client:web` ✅
  - `GET /?mapId=100020000` returns 200 ✅
  - map JSON endpoint for `100020000` returns 200 ✅
- Automated baseline: `bun run ci` ✅

## 2026-02-17 14:11 (GMT+11)
### Summary
- Added a browser-runnable **client preview** so you can load map JSON in the web immediately.
- Default preview route now loads map ID `100020000`.

### Files changed
- `tools/dev/serve-client-web.mjs` (new local web server for client preview + `resources/`)
- `client/web/index.html`, `client/web/app.js`, `client/web/styles.css` (map preview UI + parser + canvas render)
- `client/package.json` (`web` script)
- `package.json` (`client:web` script)
- `README.md` (how to run browser preview with map 100020000)

### Validation
- Manual smoke: `CLIENT_WEB_PORT=5190 bun run client:web` ✅
- HTTP checks:
  - `/` returns 200 ✅
  - `/resources/Map.wz/Map/Map1/100020000.img.json` returns 200 ✅
- Automated baseline: `bun run ci` ✅

## 2026-02-17 14:00 (GMT+11)
### Summary
- Proceeded to **Phase 6 scaffolding** with runtime hardening modules in `client/`.
- Added Stage-like world orchestration, combat orchestration, and entity pool/registry diagnostics.
- Added a manual debug smoke command for phase-6 behavior validation.
- Kept docs browser flow updated with a dedicated phase-6 process page.

### Files changed
- `client/src/runtime/world/world-stage.ts` + tests
- `client/src/runtime/combat/combat-orchestrator.ts` + tests
- `client/src/runtime/entities/entity-pool.ts` + tests
- `client/src/runtime/phase6-debug-smoke.ts`
- `client/package.json` (added `debug:phase6`)
- `docs/process/phase6-runtime-hardening.md`
- `docs/index.md`, `README.md`, `.memory/implementation-plan.md`

### Validation
- Automated: `bun run ci` ✅
- Manual smoke: `bun run --cwd client debug:phase6` ✅

## 2026-02-17 13:56 (GMT+11)
### Summary
- Implemented a browser-runnable docs web app and added `bun run docs` support.
- Repositioned this page as **Progressive Web App documentation + findings** instead of only a plain log.

### Files changed
- `tools/docs/serve-docs.mjs` (new docs web server with port fallback)
- `tools/docs/markdown.mjs` + `tools/docs/docs-utils.mjs` (markdown rendering + docs discovery)
- `tools/docs/markdown.test.mjs` + `tools/docs/docs-utils.test.mjs` (tests)
- `package.json` (new `docs` and `docs:test` scripts; CI includes docs tests)
- `docs/index.md` (docs home page)
- `docs/pwa-findings.md` (PWA documentation intro + usage)
- `README.md` (browser docs run instructions)
- `AGENTS.md` (rule updated to keep PWA docs page accurate for `bun run docs`)

### Validation
- Automated: `bun run docs:test` ✅
- Automated: `bun run ci` ✅
- Manual smoke: `bun run docs` then open browser URL printed in terminal ✅

## 2026-02-17 13:50 (GMT+11)
### Summary
- Completed **Phase 1 implementation scaffolding** (workspace structure + standardized scripts + baseline quality gates).
- Added Bun workspaces for `client`, `server`, `tools/build-assets`, and `packages/shared-schemas`.
- Added root orchestration scripts (`dev/build/test/lint/typecheck/check:workspace/quality/ci`) and merge-blocking CI workflow.
- Added per-package script parity, TS configs, and minimal test harnesses.

### Files changed (high impact)
- `package.json`, `tsconfig.base.json`, `bun.lock`, `.gitignore`
- `client/*`, `server/*`, `tools/build-assets/*`, `packages/shared-schemas/*`
- `tools/workspace/*` (workspace orchestration + validation tests)
- `tools/quality/*` (lint/typecheck helpers + quality gate checks)
- `.github/workflows/quality-gates.yml`
- `README.md`
- `.memory/implementation-plan.md`

### Validation
- Automated:
  - `bun install` ✅
  - `bun run check:workspace` ✅
  - `bun run quality` ✅
  - `bun run ci` ✅
- Debug/manual smoke:
  - `bun run dev` ✅ (all workspace packages bootstrapped through unified runner)

### Notes
- Human gameplay-parity debug verification for “moved existing client behavior unchanged” is still pending because this repo snapshot started without the prior runtime client code present.

## 2026-02-17 13:44 (GMT+11)
### Summary
- Added a root `README.md` with end-to-end setup/onboarding instructions for current repository state.
- Updated `AGENTS.md` to require README updates whenever setup/run/workflow instructions change.

### Files changed
- `README.md` (new)
- `AGENTS.md` (workflow rule update)

### Why this matters
- New contributors/agents now have a single setup reference.
- Prevents setup documentation drift as implementation evolves.

## 2026-02-17 13:42 (GMT+11)
### Summary
- Continued implementation plan execution and reached the next milestone boundary (**Phase 0 implementation for Steps 2–4**).
- Added standardized logging conventions, runtime debug flag definitions/parsing, and debug panel requirements/controller scaffolding.
- Added automated unit tests for logging, debug flags, debug panel behavior, and existing DoD policy checks.

### Files changed
- `docs/process/logging-conventions.md` (new)
- `tools/observability/logging.mjs` (new)
- `tools/observability/logging.test.mjs` (new)
- `docs/process/debug-flags.md` (new)
- `tools/observability/debug-flags.mjs` (new)
- `tools/observability/debug-flags.test.mjs` (new)
- `docs/process/debug-panel-requirements.md` (new)
- `tools/observability/debug-panel.mjs` (new)
- `tools/observability/debug-panel.test.mjs` (new)
- `.memory/implementation-plan.md` (live status updated)

### Validation
- Automated: `bun test tools/policy/check-dod-evidence.test.mjs tools/observability/logging.test.mjs tools/observability/debug-flags.test.mjs tools/observability/debug-panel.test.mjs` ✅
- Debug/human verification: pending manual in-app checks for Steps 2–4.

## 2026-02-17 13:38 (GMT+11)
### Summary
- Began implementation plan execution at **Phase 0 / Step 1 (DoD workflow)**.
- Added a global DoD checklist, evidence template, and an automated policy checker for task evidence completeness.
- Added unit tests and fixtures for the policy checker.

### Files changed
- `docs/process/definition-of-done.md` (new)
- `docs/process/evidence-template.md` (new)
- `tools/policy/check-dod-evidence.mjs` (new)
- `tools/policy/check-dod-evidence.test.mjs` (new)
- `tools/policy/fixtures/evidence-pass.md` (new)
- `tools/policy/fixtures/evidence-fail.md` (new)
- `.memory/implementation-plan.md` (execution status updated)

### Validation
- Automated: `bun test tools/policy/check-dod-evidence.test.mjs` ✅
- Debug/human verification: pending manual review of sample task evidence.

## 2026-02-17 13:35 (GMT+11)
### Summary
- Added an explicit project note that assets are stored in `./resources/`.

### Files changed
- `AGENTS.md` (project reference note updated)

### Why this matters
- Makes asset location immediately clear for future implementation and debugging tasks.

## 2026-02-17 13:32 (GMT+11)
### Summary
- Established a dedicated, browsable documentation page for ongoing findings.
- Added workflow guidance in `AGENTS.md` to require updates to this page after significant changes.

### Files changed
- `docs/pwa-findings.md` (created)
- `AGENTS.md` (updated workflow rules)

### Notes for next updates
- Continue appending new entries to the top of this file.
- Mirror high-level project state updates in `.memory/` after each significant change.
