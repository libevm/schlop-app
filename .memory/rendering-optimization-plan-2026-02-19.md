# Rendering Optimization Plan — 2026-02-19

## Goal
Make browser rendering feel fast/snappy by reducing frame time variance, input-to-photon latency, and GC spikes in sprite-heavy maps.

## Scope scanned (read-only)

### Current project (active)
- `client/web/app.js`
  - render loop + update loop (`render`, `update`, `tick`)
  - asset cache/load functions (`requestMeta`, `requestImageByKey`, `getImageByKey`)
  - map drawing (`drawBackgroundLayer`, `drawMapLayer`, `drawMapLayersWithCharacter`)
  - life/portal/reactor drawing
  - character composition (`composeCharacterPlacements`, `drawCharacter`)
  - runtime debug summary (`updateSummary`)

### Half web port reference
- `/home/k/Development/Libevm/MapleWeb/TypeScript-Client/src/Gameloop.ts`
- `/home/k/Development/Libevm/MapleWeb/TypeScript-Client/src/MapleMap.ts`
- `/home/k/Development/Libevm/MapleWeb/TypeScript-Client/src/MapleCharacter.ts`
- `/home/k/Development/Libevm/MapleWeb/TypeScript-Client/src/wz-utils/WZNode.ts`

### C++ reference
- `/home/k/Development/Libevm/MapleStory-Client/Gameplay/Stage.cpp`
- `/home/k/Development/Libevm/MapleStory-Client/Gameplay/MapleMap/MapBackgrounds.cpp`
- `/home/k/Development/Libevm/MapleStory-Client/Gameplay/MapleMap/MapTilesObjs.cpp`
- `/home/k/Development/Libevm/MapleStory-Client/Character/Look/CharLook.cpp`
- `/home/k/Development/Libevm/MapleStory-Client/Graphics/Animation.cpp`

## Current bottlenecks (evidence-based)

1. **Promise allocations in per-frame hot path**
   - `getImageByKey()` always calls `requestImageByKey()`.
   - `requestImageByKey()` returns `Promise.resolve(...)` on cache hit.
   - `requestMeta()` also returns `Promise.resolve(...)` on cache hit and is called from draw loops.
   - Impact: extra allocation/microtask pressure every sprite draw.

2. **No map tile/object viewport culling**
   - `drawMapLayer()` traverses all layer tiles + objects every frame, regardless of visibility.
   - Example map counts scanned from resources:
     - `100000000`: 859 tiles + 244 objs
     - `103000000`: 1010 tiles + 284 objs
   - Impact: high drawImage volume and avoidable CPU/GPU work.

3. **Debug summary work every frame**
   - `updateSummary()` does array filters, `getBoundingClientRect()`, object build, `JSON.stringify(...)`, and DOM text updates in the tick path.
   - Impact: layout/serialization churn and frame-time jitter.

4. **Character composition recomputed each frame**
   - `composeCharacterPlacements(...)` rebuilds part list + anchor merge + z-sort per render.
   - Impact: avoidable CPU for common repeated action/frame states.

5. **Layered life rendering loops are O(layers × life)**
   - `drawLifeSprites(layer)` loops full life state for each map layer call.
   - Impact: modest but avoidable repeated iteration.

6. **No chunk/spatial index for static sprites**
   - No prebuilt lookup for visible tiles/objects/portals/reactors.
   - Impact: scales poorly on dense maps.

## Reference insights to preserve

- C++ `Stage::draw` keeps deterministic pass order and layer interleave (background -> layers -> overlays/portals/foreground/effects).
- C++ rendering stack is GPU-atlas backed; JS canvas needs stronger culling/batching to compensate.
- Half web port historically uses repeated array filters in render loops; current project is better structured but still has similar per-frame overhead in key paths.

## Prioritized plan

## Phase 0 — Baseline instrumentation (no behavior change)
- Add frame timing buckets (update/render and major draw passes).
- Track per-frame counters:
  - drawImage calls
  - culled sprites
  - rendered tiles/objects/life/portals
  - cache-hit/miss counters for image/meta lookups
- Add rolling p50/p95 frame time in debug panel.

**Exit criteria:** stable baseline numbers on at least 3 maps (`104040000`, `100000000`, `103000000`).

## Phase 1 — Hot-path deallocation cleanup (highest ROI, low risk)
- Split cache APIs into:
  - synchronous `getCachedImage(key)` / `getCachedMeta(key)`
  - async `ensureImageRequested(key)` / `ensureMetaRequested(key, loader)` only on misses
- Remove Promise creation from draw-time cache hits.
- Ensure render paths do not call async loaders when assets are already preloaded.
- Throttle `updateSummary()` (e.g., 4–5 Hz) and gate heavy DOM updates behind visible/open debug panel state.
- Cache repeated text measurements (NPC/mob name labels, player name width).

**Expected impact:** lower GC pressure and reduced frame-time spikes.

## Phase 2 — Visibility culling + spatial index
- Build map-load-time spatial buckets (e.g., 256px grid) for static tiles/objects.
- Query visible buckets from camera bounds (+margin) per frame.
- Add culling to portals/reactors/background elements where safe.
- Keep life sprites in lightweight per-layer buckets updated from runtime state.

**Expected impact:** major draw-call reduction on dense maps.

## Phase 3 — Static layer chunk caching (offscreen)
- Pre-render static tile/object content into chunk canvases (or OffscreenCanvas where supported).
- Runtime draws chunk textures + dynamic overlays (character, life, portals, damage numbers, UI).
- Invalidate/rebuild only affected chunks for animated objects (or keep animated objects in dynamic pass).

**Expected impact:** much lower per-frame sprite compositing cost.

## Phase 4 — Character render caching
- Cache composed placements by `{action, frameIndex, flipped, equipHash}`.
- Reuse sorted placement data until key changes.
- Optional: precompose full character frame bitmap for frequently used idle/walk frames.

**Expected impact:** smoother animation in CPU-limited scenes.

## Phase 5 — Loop smoothness refinements
- Move toward fixed-step update with interpolation (C++ style) while rendering each RAF.
- Consider canvas context hinting (`alpha:false`, `desynchronized:true`) with compatibility fallback.

**Expected impact:** better perceptual smoothness and reduced perceived sluggishness.

## Success metrics
- p95 frame time below 16.7ms on tested baseline maps at 1280x960.
- No large GC-induced frame spikes during movement/combat in town maps.
- Input response feels immediate (reduced keypress-to-visible movement delay).
- Render pass counters show significant reduction in static sprite draws after Phase 2/3.

## Risks / constraints
- Must preserve existing draw order and parity-sensitive layer behavior.
- Chunk caching needs careful handling of animated map objects and alpha blending.
- Any render pipeline changes must update `.memory/canvas-rendering.md`.

## Implementation order recommendation
1. Phase 0 + Phase 1 in one PR.
2. Phase 2 culling in next PR.
3. Phase 3 chunk caching behind debug flag, then default-on after validation.
4. Phase 4/5 as follow-up polish.

## Progress update (2026-02-19)
- ✅ Phase 0 instrumentation implemented:
  - per-frame timing (`updateMs`, `renderMs`, `frameMs`)
  - rolling frame sample window (`PERF_SAMPLE_SIZE=120`) with p50/p95
  - per-frame counters (`drawCalls`, `culledSprites`, entity draw counts)
- ✅ Phase 1 implemented:
  - cache-hit deallocation cleanup (`requestMeta`, `requestImageByKey`, `getImageByKey`)
  - lazy meta requests on miss for background/tile/object/portal
  - `updateSummary` throttling to 5Hz + hidden-panel skip
- ✅ Phase 2 implemented:
  - world-rect culling for tiles/objects/portals (+ existing life/reactor culling counters)
  - map-load spatial index for layer tiles/objects (`SPATIAL_BUCKET_SIZE=256`)
  - visible-bucket query per frame
- ✅ Phase 3 partial implementation (non-offscreen variant):
  - visible-cell query cache per layer (reuses candidate arrays while camera stays in same cell range)
  - full offscreen chunk prerender still pending (optional future step)
- ✅ Phase 4 implemented:
  - character placement template cache (`characterPlacementTemplateCache`) keyed by `(action, frameIndex, flipped)`
- ✅ Phase 5 implemented:
  - fixed-step 60Hz update loop with RAF rendering (`FIXED_STEP_MS`, bounded catch-up)
  - context hinting (`alpha:false`, `desynchronized:true`) with fallback
- ✅ Phase 6 polish implemented:
  - per-layer life bucketing to avoid O(layers × life) full scans
  - summary perf reporting surfaced in runtime debug output

### Remaining optional follow-ups
- OffscreenCanvas/static chunk prerender for map layers.
- Label text-measure cache for life/name UI.
- Optional interpolation path between fixed updates for ultra-high-refresh displays.

### Correctness follow-up completed after Phase 6
- Implemented map trap hitbox collision + knockback pipeline for damaging obstacle objects
  (e.g., moving spike balls):
  - object metadata now carries `obstacle` / `damage` / `dir`
  - map-load hazard indexing (`map.trapHazards`)
  - fixed-step overlap check against player sweep bounds
  - C++-style knockback impulse and 2s invulnerability window
- Added player hit reaction visuals for trap hits:
  - temporary pain/hit face-expression override
  - whole-character invincibility blink pulse during i-frames
- Fixed map object animation edge case where frame lists are authored as direct numeric `$canvas`
  entries (not numeric `$imgdir` nodes), restoring missing effects like subway power-line lightning.
- Refined frame sequencing parity: numeric `$uol` alias entries are excluded from animation frame lists
  (C++ `Animation` only iterates bitmap nodes), preventing shortened laser cooldown cycles.
- Added object frame `a0`/`a1` alpha interpolation during draw so laser/lightning effects that rely on
  opacity ramps animate instead of appearing static.
- Added mob touch-damage collision pass (bodyAttack-enabled mobs can now damage/knockback player on contact).
- Added debug hitbox overlay toggle/render pass for rapid visual verification of collision bounds
  (player sweep, portals, traps, mob frame bounds).
- Corrected map object `f` handling to be horizontal flip (not frame index), fixing misrendered subway laser segments
  and restoring C++-style object orientation/timing behavior.
- Fixed airborne null-foothold side-wall clamp edge case so players cannot bypass map side walls
  at high Y in subway laser maps (physics parity follow-up).
- Added post-physics safety clamp to side walls for residual mid-air side-wall escape scenarios.
- Simplified collision follow-up: removed wall-line/knockback-lock complexity and converged on
  one side-wall clamp path:
  - `sideWallBounds(map)` + `clampXToSideWalls(x, map)`
  - uses C++-style inset wall bounds (`map.walls.left/right`) as primary hard limits
  - falls back to foothold extrema (`footholdBounds.minX/maxX`) only when wall bounds are unavailable.
- `resolveWallCollision(...)`, post-physics integration, and knockback hit application now all share
  this clamp path to keep behavior consistent and easier to reason about.
- Finalized wall-collision parity pass against C++ `FootholdTree::get_wall`:
  - removed generic wall-line intersection fallback (it over-blocked on short/local vertical walls)
  - `resolveWallCollision(...)` now uses foothold-chain blocking checks + map side-wall fallback only
  - keeps C++-style map wall bounds (`map.walls.left/right`) as primary side limits.
- Added stance-aware player touch hitbox sizing (prone/sit vs standing) so collision profile
  better matches rendered posture while preserving swept collision checks.
- Refined player-hit visual parity:
  - invincibility blink now darkens sprite color (C++-style RGB pulse) instead of alpha fading
  - face composition now always anchors via body/head brow (when present) and keeps frame brow offsets,
    matching C++ face frame mapping and preventing misalignment.
  - character placement template cache now keys by face expression/frame as well, so hit-face overrides
    (pain/hit/etc.) update immediately instead of reusing stale default-face templates.
  - template build skips cache writes when face is expected but still decoding, using last complete frame
    fallback to avoid one-frame face disappear/reappear flicker.
