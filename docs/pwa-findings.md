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
