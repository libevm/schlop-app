# Implementation Plan (AI Developer Playbook)

Date: 2026-02-17  
Runtime requirement: **Bun**  
Target architecture: `client/` + `server/` + `tools/build-assets/` + shared schemas

This plan is intentionally granular. Follow steps in order.  
Every step includes:
- an **automated test** (unit/integration/e2e/perf)
- a **debug mode test** (human-in-the-loop verification)

No step is complete unless both pass.

## Execution Status (Live)
- 2026-02-17: Began implementation from Phase 0 / Step 1.
  - Added DoD checklist doc: `docs/process/definition-of-done.md`
  - Added evidence template: `docs/process/evidence-template.md`
  - Added policy checker: `tools/policy/check-dod-evidence.mjs`
  - Added checker tests + fixtures under `tools/policy/`
  - Automated validation status: ✅ `bun test tools/policy/check-dod-evidence.test.mjs`
  - Debug-mode validation status: ⏳ Pending human verification using `docs/process/evidence-template.md`
- 2026-02-17: Continued Phase 0 through Steps 2–4 (implementation side).
  - Added unified logging conventions doc: `docs/process/logging-conventions.md`
  - Added logging formatter + validation tests:
    - `tools/observability/logging.mjs`
    - `tools/observability/logging.test.mjs`
  - Added runtime debug flags doc + parser + tests:
    - `docs/process/debug-flags.md`
    - `tools/observability/debug-flags.mjs`
    - `tools/observability/debug-flags.test.mjs`
  - Added debug panel requirements + dispatch/visibility test module:
    - `docs/process/debug-panel-requirements.md`
    - `tools/observability/debug-panel.mjs`
    - `tools/observability/debug-panel.test.mjs`
  - Automated validation status: ✅ `bun test tools/policy/check-dod-evidence.test.mjs tools/observability/logging.test.mjs tools/observability/debug-flags.test.mjs tools/observability/debug-panel.test.mjs`
  - Debug-mode validation status: ⏳ Pending human-in-the-loop verification for Steps 2–4.
- 2026-02-17: Completed Phase 1 implementation scaffolding (Steps 5–7).
  - Created Bun workspace structure and root orchestration:
    - `client/`, `server/`, `tools/build-assets/`, `packages/shared-schemas/`
    - root `package.json` workspaces + unified scripts (`dev/build/test/lint/typecheck`)
    - `tools/workspace/run-workspace-script.mjs`
  - Added package-level standardized scripts + TS configs + minimal harness files in all four workspace packages.
  - Added workspace integrity/script standardization tests:
    - `tools/workspace/workspace-integrity.test.mjs`
    - `tools/workspace/scripts-standardization.test.mjs`
  - Added baseline quality gate tooling + fixture:
    - `tools/quality/lint-package.mjs`
    - `tools/quality/typecheck-package.mjs`
    - `tools/quality/check-quality-gates.mjs`
    - `tools/quality/check-quality-gates.test.mjs`
    - `tools/quality/fixtures/broken-package.json`
  - Added merge-blocking CI workflow:
    - `.github/workflows/quality-gates.yml`
  - Added/updated setup docs for workspace commands:
    - `README.md`
  - Automated validation status:
    - ✅ `bun install`
    - ✅ `bun run check:workspace`
    - ✅ `bun run quality`
    - ✅ `bun run ci`
  - Debug-mode validation status:
    - ✅ `bun run dev` (manual smoke check of unified top-level dev flow)
    - ⏳ Human gameplay-parity verification for moved client behavior remains pending because this repository snapshot did not contain the prior runtime client implementation to compare against.
- 2026-02-17: Added browser-runnable docs web app for PWA documentation access.
  - Added docs server command: `bun run docs`
  - Added docs tests: `bun run docs:test`
  - Added docs web app modules:
    - `tools/docs/serve-docs.mjs`
    - `tools/docs/markdown.mjs`
    - `tools/docs/docs-utils.mjs`
    - `tools/docs/markdown.test.mjs`
    - `tools/docs/docs-utils.test.mjs`
  - Updated `docs/pwa-findings.md` to serve as PWA documentation + findings log with browser usage instructions.
  - Updated `README.md` and `AGENTS.md` to keep docs browser workflow explicit.
  - Validation status:
    - ✅ `bun run docs:test`
    - ✅ `bun run docs` (manual browser smoke using URL printed in terminal)
- 2026-02-17: Proceeded to Phase 6 implementation scaffolding (Steps 33–35).
  - Added Stage-like world orchestration module:
    - `client/src/runtime/world/world-stage.ts`
    - deterministic ordered subsystem update/draw + trace capture
  - Added combat orchestration module:
    - `client/src/runtime/combat/combat-orchestrator.ts`
    - attack queue, cooldown gating, hit-delay resolution, timeline events
  - Added entity identity/pool modules:
    - `client/src/runtime/entities/entity-pool.ts`
    - duplicate-ID rejection, stable updates, registry diagnostics
  - Added automated tests:
    - `client/src/runtime/world/world-stage.test.mjs`
    - `client/src/runtime/combat/combat-orchestrator.test.mjs`
    - `client/src/runtime/entities/entity-pool.test.mjs`
  - Added manual debug smoke flow:
    - `client/src/runtime/phase6-debug-smoke.ts`
    - run via `bun run --cwd client debug:phase6`
  - Added docs for this phase:
    - `docs/process/phase6-runtime-hardening.md`
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `bun run --cwd client debug:phase6`
- 2026-02-17: Added immediate browser client preview for map loading requests.
  - Added lightweight client web server:
    - `tools/dev/serve-client-web.mjs`
  - Added browser preview UI:
    - `client/web/index.html`
    - `client/web/app.js`
    - `client/web/styles.css`
  - Added scripts:
    - `client/package.json` -> `web`
    - root `package.json` -> `client:web`
  - Default behavior:
    - opens client preview with map query support
    - example map route `/?mapId=100020000`
  - Validation status:
    - ✅ `CLIENT_WEB_PORT=5190 bun run client:web` (manual smoke)
    - ✅ HTTP checks for `/` and map JSON route
    - ✅ `bun run ci`
- 2026-02-17: Upgraded browser client preview into an offline playable debug client.
  - Added runtime map scene rendering from WZ JSON resources:
    - backgrounds (`Map.wz/Back/*`)
    - tiles (`Map.wz/Tile/*`)
    - objects (`Map.wz/Obj/*`)
  - Added playable character rendering + movement/jump loop:
    - character frames from `Character.wz/00002000.img.json`
    - foothold-based landing checks + camera follow
  - Added chat bubble rendering + input form.
  - Added BGM/SFX hooks using `Sound.wz/*` (audio unlock button for browser autoplay policy).
  - Updated setup/docs:
    - `README.md`
    - `docs/process/phase6-runtime-hardening.md`
    - `docs/pwa-findings.md`
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5190 bun run client:web`
    - ✅ endpoint checks for map route and map JSON asset route
- 2026-02-17: Fixed character rendering orientation/composition regressions in offline web client.
  - Inspected MapleWeb `MapleCharacter` composition logic and anchor usage (`origin`, `map` vectors, flipped-part handling).
  - Corrected world rendering so facing no longer mirrors the map scene.
  - Corrected character-only flip behavior and anchor-based part placement.
  - Added head composition from `Character.wz/00012000.img.json` and neck-anchor mapping.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` (manual map route smoke)
- 2026-02-17: Added airborne stance animation switching.
  - Updated offline web client action selection logic:
    - rising => `jump`
    - descending => `fly`
    - grounded moving => `walk1`
    - grounded idle => `stand1`
  - Validation status:
    - ✅ `bun run ci`
- 2026-02-17: Improved character part composition and enabled rope climbing.
  - Reworked character frame rendering from fixed slots (`body`/`arm`/`hand`) to dynamic per-frame part composition.
  - Added map-vector anchor propagation across parts (fixes jump arm/hand alignment issues and supports `lHand`/`rHand` frames).
  - Added z-order guidance from `Base.wz/zmap.img.json` for more correct part layering.
  - Implemented rope climbing using map `ladderRope` data:
    - `↑`/`↓` to climb when near rope
    - `ladder` action while climbing
    - `Space` jump-off from rope
  - Updated controls text/docs (`client/web/index.html`, `README.md`, phase6 process doc).
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke
- 2026-02-17: Refined jump stance behavior and restored default face rendering.
  - Updated airborne stance selection to use `jump` only (removed `fly` mapping).
  - Added default face asset loading from `Character.wz/Face/00020000.img.json`.
  - Composed face via `brow` anchor when frame `face` flag is enabled.
  - Improved part placement robustness by iterating pending parts until anchor dependencies are satisfied.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke
- 2026-02-17: Added blink animation and improved traversal collision edge cases.
  - Added periodic face blink cycle driven by face frame delays (`default` -> `blink` -> `default`).
  - Fixed rope-top transition by snapping to nearby foothold when climbing up reaches `y1`.
  - Added vertical-wall collision from foothold geometry to stop easy wall passthrough at map edges.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke
- 2026-02-17: Adjusted wall blocker policy to only prevent out-of-bounds fall-through.
  - Updated wall collision to apply only for grounded crossing attempts.
  - Added foothold probe below destination side of wall crossing.
  - If foothold exists below, crossing is allowed (internal wall pass-through preserved).
  - If no foothold exists below, crossing is blocked (map-edge fall protection).
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke
- 2026-02-17: Refined ladder input semantics for side-jump behavior.
  - While attached to rope/ladder, lateral inputs no longer produce walk/detach drift.
  - `←`/`→` now explicitly trigger side jump-off from rope/ladder.
  - `Space` jump-off behavior retained.
  - Updated user-facing controls text in web UI + README.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke
- 2026-02-17: Fixed prone pose disappearing + aligned map/character layer ordering closer to C++ Stage behavior.
  - Reference scan findings captured from read-only code:
    - C++ `PlayerClimbState` uses jump+walk-input side detach semantics.
    - C++ `Stage::draw` renders by map layer (tiles/objs first, then chars) so higher layers can appear in front of the player.
    - Half-web TS `prone` action frame in `Character.wz/00002000.img.json` uses UOL links (`../../proneStab/0/body`, `../../proneStab/0/arm`) rather than direct `$canvas` children.
  - Implemented web-client frame-part UOL resolution for character action frames.
  - Added foothold layer tracking and map-layer interleaved character rendering.
  - Result: prone now renders correctly; foreground map layers can occlude character as expected.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=100020000` => 200)
- 2026-02-17: Fixed edge-lock regression so walking off foothold ends allows falling when no wall blocks movement.
  - Reference scan findings captured from read-only code:
    - Half-web TS physics (`MapleWeb/TypeScript-Client/src/Physics.ts`) allows edge fall-through when next/prev link is missing or non-blocking vertical foothold.
    - Half-web TS blocks only specific edge-connected wall orientations:
      - right edge blocked when `next` is vertical and `next.y1 > next.y2`
      - left edge blocked when `prev` is vertical and `prev.y1 < prev.y2`
    - C++ foothold tree uses explicit wall/edge limiting logic instead of blanket drop-locking.
  - Updated web debug client foothold linking/parsing and wall resolution:
    - treat `prev/next` value `0` as no-link (`null`)
    - replace generic destination-side drop probe lock with foothold-link edge blocking logic
    - allow natural edge drop when no blocking wall exists
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=100020000` => 200)
- 2026-02-17: Refined rope/ladder interaction semantics and render layering.
  - Reference scan findings captured from read-only code:
    - C++ `PlayerClimbState` jump-off requires `JUMP` + walk input (`haswalkinput(player)`).
    - Half-web TS climbing update confirms ladder stance + climb movement semantics while attached.
  - Updated web debug client rope/ladder behavior in `client/web/app.js`:
    - ropes/ladders are now rendered behind the character (`drawRopeGuides()` before map/character draw pass)
    - while climbing, jump-off now requires **Space + (←/→)** together
    - while climbing, `Space` alone and `←/→` alone do nothing
    - pressing `↑` at top no longer re-attaches/teleports to rope start (attach gated by `player.y > rope.y1 + 6`)
    - pressing `↓` while not already attached no longer starts climbing (only `↑` can attach)
  - Updated user-facing controls text:
    - `client/web/index.html`
    - `README.md`
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=100020000` => 200)
- 2026-02-17: Ported key C++ ladder/foothold/wall semantics into web debug client movement loop.
  - Read-only C++ reference review completed for:
    - `Gameplay/Physics/Foothold{.h,.cpp}`
    - `Gameplay/Physics/FootholdTree.cpp`
    - `Gameplay/MapleMap/MapInfo{.h,.cpp}`
    - `Character/PlayerStates.cpp`, `Character/Player.cpp`
    - `Gameplay/Stage.cpp` ladder-check callsites
  - Implemented parity-focused behavior in `client/web/app.js`:
    - foothold-derived map wall/border ranges (`left+25/right-25`, `top-300/bottom+100`)
    - wall blocking using two-hop foothold checks by vertical overlap (`get_wall` style)
    - ladder range checks using ±10 px horizontal and ±5 y probe (`inrange` semantics)
    - ladder fall-off detection using C++ `felloff` logic
    - climb cooldown (~1000ms) after ladder cancel/jump-off
    - climb jump-off remains `Space + walk input`
    - top-of-ladder `↓` attach-and-climb-down restored (C++ `check_ladders(false)` style)
  - Updated controls text to reflect top-of-ladder down-climb attach behavior.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=100020000` => 200)
- 2026-02-17: Corrected airborne wall collision parity (jumping into wall now blocks horizontal advance).
  - Root cause:
    - wall-limiting path was gated to grounded movement only.
    - C++ `FootholdTree::limit_movement` applies horizontal wall limiting whenever object is horizontally mobile, including airborne states.
  - Fix in `client/web/app.js`:
    - removed grounded-only gate from `resolveWallCollision`
    - added foothold-below lookup for airborne wall context (mirrors `get_fhid_below` intent)
    - wall collision now resolves against foothold-linked walls during jumps/falls as well
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=100020000` => 200)
- 2026-02-17: Updated rope/ladder visual layering per latest request.
  - Changed render order so rope/ladder guides are drawn after map+character pass.
  - Result: rope/ladder lines now render in front of the character.
  - File: `client/web/app.js`
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=100020000` => 200)
- 2026-02-17: Switched climbing animation to rope-specific action when attached to rope.
  - Updated action selection in `client/web/app.js`:
    - climbing on ladder (`l=1`) -> `ladder` action
    - climbing on rope (`l=0`) -> `rope` action (fallback to `ladder` if `rope` frames unavailable)
  - Confirmed interactable overlay layering remains aligned with C++ stage intent:
    - back backgrounds first
    - map/interactable passes
    - foreground backgrounds last (only explicitly-front content overlays)
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=100020000` => 200)
- 2026-02-17: Updated default map ID for web debug client startup.
  - Default map changed from `100020000` to `104040000`.
  - Updated files:
    - `client/web/index.html` (default form input)
    - `client/web/app.js` (fallback `initialMapId`)
    - `README.md` (default URL)
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /` => 200, `GET /resources/Map.wz/Map/Map1/104040000.img.json` => 200)
- 2026-02-17: Adjusted object/rope/character draw ordering per latest layering feedback.
  - Updated render order in `client/web/app.js`:
    - map layers and interactable objects render before character
    - rope/ladder guides render before character
    - character now renders after those objects
  - Removed character interleave-in-layer draw path from `drawMapLayers()`.
  - Added object sorting by map `z` value within each layer to better mirror C++ `TilesObjs` z-bucket ordering.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Fixed incline foothold traversal so player follows uneven platforms instead of falling through.
  - Reference alignment target:
    - C++ `FootholdTree::update_fh` keeps grounded objects snapped to foothold ground and transitions to linked footholds when crossing edges.
  - Updated web client movement logic in `client/web/app.js`:
    - added slope-ground projection (`groundYOnFoothold`) for grounded horizontal movement
    - added linked foothold traversal resolver (`resolveFootholdForX`) for prev/next foothold transitions
    - split grounded-vs-airborne integration path so gravity is only applied when not grounded
    - preserved wall limiting via `resolveWallCollision` while grounded and airborne
  - Result:
    - walking up/down inclined footholds now tracks ground height properly
    - no immediate fall-through on uneven surfaces
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Added deeper C++-style foothold edge/slope transition handling for uneven surfaces.
  - Reference alignment details from `FootholdTree::update_fh`:
    - edge crossing checks use `floor(x) > r` and `ceil(x) < l`
    - prev/next transitions should follow linked footholds rather than dropping immediately
    - wall-adjacent linked footholds should clamp movement instead of causing ground-loss flicker
  - Updated `client/web/app.js`:
    - `resolveFootholdForX` now uses floor/ceil edge logic and multi-step linked traversal
    - wall-adjacent transitions now clamp `x` to foothold edge and keep grounded state
    - `findFootholdBelow` now includes small tolerance (`minY - 1`) to reduce precision loss on slope snaps
  - Result:
    - improved continuity over chained uneven footholds
    - reduced slope edge drop-through and wall-edge ground loss
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Tuned rope margin and added C++-style rope-jump/down-jump behavior refinements.
  - Updated `client/web/app.js`:
    - rope/ladder attach horizontal margin increased slightly (`±12`) so player need not be pixel-perfect on rope X
    - rope side jump now uses reduced vertical launch (`vy=-360`) to mirror C++ climb jump (`-jumpforce/1.5`) behavior
    - added down-jump flow on foothold when pressing `jump + down` and foothold exists below within 600px (C++ `enablejd/groundbelow` style)
      - sets position just below current ground (`ground + 1`), enters fall, then lands on below foothold
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Refined down-jump gating + foothold-edge release behavior.
  - Updated `client/web/app.js`:
    - down-jump now strictly requires a **different** foothold below current foothold within 600px
    - down-jump now applies a small hop impulse (`vy=-190`) to better match expected visual hop/fall transition
    - down-jump horizontal speed forced to zero for consistent drop-through behavior
    - adjusted edge traversal to avoid clamping on non-blocking wall-linked edges, reducing "stuck at foothold end" cases
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Fixed down-jump landing exclusion and ladder-facing stabilization.
  - Updated `client/web/app.js`:
    - climbing now locks to default facing sprite (`facing=-1`) and remains centered on rope x-axis
    - down-jump now marks current foothold as temporarily excluded landing target (prevents re-landing on same foothold after hop)
    - landing checks now honor exclusion window (`~260ms`) for down-jump pass-through reliability
    - down-jump detection now excludes current foothold when searching for a valid foothold below
  - Result:
    - down+jump can again reach lower foothold reliably when available
    - down+jump with no valid below foothold falls back to normal jump instead of silent prone no-op
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Fixed angled-jump landings on uneven footholds (swept landing collision).
  - Root cause:
    - landing detection used end-of-frame x only, so diagonal motion could miss sloped foothold intersections.
  - Updated `client/web/app.js`:
    - replaced scalar x-based landing check with swept segment intersection (`oldX,oldY -> newX,newY` vs foothold segment)
    - keeps down-jump exclusion support via optional foothold exclusion parameter
  - Result:
    - jumping diagonally into inclined footholds now lands reliably instead of passing through.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Fixed rope alignment offset and mid-air ladder re-attach behavior.
  - Updated `client/web/app.js`:
    - added climb snap offset (`x = rope.x - 1`) to correct ~1px right drift while climbing
    - allowed climb re-attach while airborne even during climb cooldown (supports re-grabbing ladder mid-jump)
  - Result:
    - climbing sprite appears centered on rope/ladder
    - jumping off mid-ladder can re-attach mid-air when pressing climb input
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Relaxed down-climb attach detection around ladders/ropes.
  - Updated `client/web/app.js` (`ladderInRange`):
    - keeps climb-up attach behavior unchanged
    - broadens climb-down attach envelope to allow "around ladder" captures:
      - horizontal margin `±16` (down) vs `±12` (up)
      - vertical buffer for down attach (`top -18`, `bottom +12`)
  - Result:
    - pressing down to climb from near/around ladder top is less strict and more forgiving.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Increased down-climb horizontal capture margin further.
  - Updated `client/web/app.js` (`ladderInRange`):
    - climb-down horizontal margin increased from `±16` to `±20`
  - Result:
    - easier ladder/rope down-climb attach when player is near (not exactly centered) around ladder x-axis.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Added minimum short reattach lock after ladder/rope jump-off.
  - Updated `client/web/app.js`:
    - new `reattachLockUntil` timer on player state
    - set `reattachLockUntil = now + 200ms` when jump-off/canceling climb
    - attach checks now require lock to expire before re-climbing
    - retains airborne reattach support after lock window (prevents instant same-frame regrab)
  - Note: C++ uses a larger climb cooldown (`set_climb_cooldown(1000ms)`); this tuned value follows requested short lock behavior while preserving mid-air regrab flow.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Scoped reattach lock to same rope only.
  - Updated `client/web/app.js`:
    - added `reattachLockRopeKey` tracking on detach
    - reattach lock now blocks only if candidate rope matches detached rope key
    - jumping across to a different rope can reattach immediately (even within lock window)
    - same-rope reattach still waits 200ms
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Fixed input/down-jump/background/portal regressions and improved interaction gating.
  - Updated `client/web/app.js`:
    - `jump + down` now always ignores lateral movement input (`vx=0`)
    - `jump + down` with no valid foothold below now performs no jump (stays grounded, no upward jump)
    - increased facial animation playback speed (faster blink cadence + lower per-frame delays)
    - fixed background/scenery/cloud loading by handling `Back/*.img` `back/ani` direct `$canvas` children
    - added animated portal rendering from `Map.wz/MapHelper.img.json` (`pv/ph/psh`) and integrated into render pass
    - keyboard gameplay input now only works when canvas is entered/focused/clicked; input resets on leave/blur
  - Updated `client/web/index.html`:
    - made canvas focusable via `tabindex="0"` for focus-based keyboard gating
  - Updated `README.md`:
    - added controls note that keyboard input requires canvas hover/focus
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Fixed jump SFX parity against C++ and surfaced active SFX in debug panel.
  - Reference scan (read-only) findings:
    - C++ `Character/PlayerStates.cpp`: `play_jumpsound()` is used for stand/walk/down-jump and ladder jump-off.
    - C++ `Audio/Audio.cpp`: `Sound::Name::JUMP` maps to `Sound.wz/Game.img/Jump`.
    - Half web reference `TypeScript-Client/src/MapleCharacter.ts`: jump also uses `Sound.wz/Game.img/Jump`.
  - Updated `client/web/app.js`:
    - replaced jump-related SFX trigger from `Game/Portal2` to `Game/Jump` for:
      - normal ground jump
      - down-jump
      - rope/ladder jump-off
    - added debug audio telemetry (`runtime.audioDebug`) and included audio section in map summary panel:
      - `currentBgm`
      - `lastSfx`
      - `lastSfxAgeMs`
      - `sfxPlayCount`
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Locked horizontal movement during successful down-jump until landing.
  - Updated `client/web/app.js`:
    - added player state flags:
      - `downJumpControlLock`
      - `downJumpTargetFootholdId`
    - on successful `jump + down`, movement lock now activates and records target foothold below
    - while lock is active and airborne, left/right input is ignored (`effectiveMove = 0`)
    - lock clears on landing (or reset paths: map load/respawn/other jump paths)
    - exposed lock state in debug panel summary under `player.downJumpControlLock` and `player.downJumpTargetFootholdId`
  - Behavior result:
    - after `jump + down`, user cannot apply directional input until landing on the next foothold.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Reworked background rendering to follow C++ tiling/parallax behavior (fixes dark scene patches).
  - Reference scan (read-only) findings:
    - C++ `Gameplay/MapleMap/MapBackgrounds.cpp`:
      - uses `type` to derive horizontal/vertical tiling counts (`VWIDTH/cx + 3`, `VHEIGHT/cy + 3`)
      - uses `rx/ry` for parallax or motion depending on background type
      - supports per-frame alpha (`a0/a1`) and animated background frames
      - can fill black when map background root is marked empty (`black`)
    - C++ stage draw order confirms backgrounds are drawn in a dedicated pass before map layers (`Gameplay/Stage.cpp`).
  - Updated `client/web/app.js`:
    - expanded parsed background metadata: `index`, `type`, `rx`, `ry`, `cx`, `cy`, `flipped`
    - added map-level `blackBackground` detection from back index `0`
    - replaced single-canvas background draw path with source/frame loader:
      - resolves direct `$canvas` and frame children for `Back/*.img`
      - caches frame metadata and images
      - supports animated frame delays + `a0/a1` blending
    - implemented C++-style screen-space background draw behavior:
      - type-driven tiling coverage (horizontal/vertical/both)
      - parallax/motion handling based on `type` + `rx/ry`
      - origin and flip-aware placement for each tile
      - optional black screen fill for black-background maps
  - Expected behavior result:
    - background layers now continuously cover the viewport (no intermittent dark patch gaps) and track camera more faithfully.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Fixed regression where scene stopped rendering after background renderer overhaul.
  - Root issue:
    - new full background pipeline introduced a runtime regression causing map scene to disappear.
  - Updated `client/web/app.js`:
    - restored stable background meta loading path (`requestBackgroundMeta`) so scene renders reliably again
    - kept background schema enrichment (`type/cx/cy/rx/ry/flipped`) from C++ parity pass
    - added safe tiled background repetition based on `type` + `cx/cy` to reduce uncovered dark patches without breaking core render
    - fixed flipped draw call to pass `{ flipped: background.flipped }` into `drawWorldImage`
  - Behavior result:
    - scene rendering restored
    - tiled backgrounds now cover viewport more consistently
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)
- 2026-02-17: Corrected portal visibility/type mapping to match C++ semantics.
  - Reference scan (read-only) findings:
    - C++ `Gameplay/MapleMap/Portal.cpp`: hidden portals (`type == HIDDEN`, id 10) draw only when touched by player bounds.
    - C++ `Gameplay/MapleMap/MapPortals.cpp`: regular portal animation uses `pv`; hidden uses `ph/default/portalContinue`.
    - Half web `TypeScript-Client/src/Portal.ts`: visible/invisible type gating differs by `pt`; regular uses `pv`.
  - Updated `client/web/app.js`:
    - portal map parsing now stores `id` and `image`
    - removed incorrect style mapping that swapped regular/hidden visuals
    - added type-aware portal render policy:
      - draw always: `2`, `4`, `7` (and `11` scripted hidden style)
      - draw only when touched: `10` hidden
      - do not draw: spawn/invisible/touch-only and other non-visual types
    - portal assets now loaded by C++-style paths:
      - regular: `portal/game/pv`
      - hidden: `portal/game/ph/default/portalContinue`
      - scripted hidden: `portal/game/psh/<image>/portalContinue` (fallback `default`)
  - Behavior result:
    - visible portals now render correctly
    - hidden portals no longer render unless player is inside portal touch bounds.
  - Validation status:
    - ✅ `bun run ci`
    - ✅ `CLIENT_WEB_PORT=5210 bun run client:web` route smoke (`GET /?mapId=104040000` => 200)

---

## Phase 0 — Delivery Safety, Debug Mode, and Observability

### Step 1 — Define global Definition of Done (DoD)
**Actions**
1. Create a single DoD checklist used by all AI developers.
2. Include mandatory checks: schema validation, automated tests, debug-mode verification, logs inspected, `.memory` updated.
3. Add required evidence format (screenshots/log snippets/test reports).

**Validation**
- **Automated:** Add a repository policy check that fails if PR/task output does not include DoD evidence fields.
- **Debug mode:** Human reviews one sample completed task and confirms all evidence sections are present and understandable.

### Step 2 — Add unified logging conventions
**Actions**
1. Standardize log levels across client/server/tools: `trace`, `debug`, `info`, `warn`, `error`.
2. Define structured log fields: `timestamp`, `component`, `event`, `entityType`, `entityId`, `mapId`, `requestId`.
3. Document when to log state transitions vs. noisy frame updates.

**Validation**
- **Automated:** Unit test log formatter and required fields for representative events.
- **Debug mode:** Human runs app in debug mode and confirms logs are readable, filtered by level, and include map/entity context.

### Step 3 — Add runtime debug flags
**Actions**
1. Define environment flags for client/server/tools (debug on/off, verbose assets, verbose network, simulated latency).
2. Ensure defaults are safe for normal play and explicit for debug.
3. Document all flags in one markdown file.

**Validation**
- **Automated:** Unit tests for flag parsing and default values.
- **Debug mode:** Human toggles flags and confirms behavior changes immediately (extra overlays/log lines/latency simulation).

### Step 4 — Create in-game debug panel requirements
**Actions**
1. Specify a debug panel with sections: map info, entity counts, memory/cache stats, network stats, last API errors.
2. Define required controls: map warp, spawn mob, spawn NPC, clear entities, reload map sections, audio test, packet simulator.
3. Define security rule: debug controls only in debug builds.

**Validation**
- **Automated:** UI/state tests verifying panel visibility by mode and control dispatch events.
- **Debug mode:** Human opens panel, uses each control once, and confirms visible state changes and log entries.

---

## Phase 1 — Repository Restructure (Bun Workspaces)

### Step 5 — Create workspace structure
**Actions**
1. Create directories: `client/`, `server/`, `tools/build-assets/`, `packages/shared-schemas/`.
2. Move existing TypeScript client into `client/` without changing behavior.
3. Configure Bun workspace so all packages resolve correctly.

**Validation**
- **Automated:** Workspace integrity test that installs dependencies and runs package discovery.
- **Debug mode:** Human starts client from new location and verifies login/map flow still works exactly as before.

### Step 6 — Standardize scripts across packages
**Actions**
1. Define consistent scripts: `dev`, `build`, `test`, `lint`, `typecheck` in all packages.
2. Add top-level scripts that run package scripts in order.
3. Document expected runtime (Bun only).

**Validation**
- **Automated:** CI script executes all workspace scripts and fails on missing script names.
- **Debug mode:** Human runs top-level `dev` flow and confirms client + server + tool watcher start cleanly.

### Step 7 — Add baseline quality gates
**Actions**
1. Enable formatting/linting/typechecking for all packages.
2. Add minimal test harness in each package.
3. Block merges when any package fails.

**Validation**
- **Automated:** Deliberately broken fixture should fail lint/type/test gates.
- **Debug mode:** Human checks failing output is actionable (file, line, reason) and easy to fix.

---

## Phase 2 — Shared Contracts and Data Model

### Step 8 — Define canonical asset entity list
**Actions**
1. Freeze first-class entities: map, mob, npc, character, effect, audio, ui.
2. Define canonical IDs and normalization rules.
3. Define alias handling for legacy names.

**Validation**
- **Automated:** Unit tests for ID normalization and alias resolution.
- **Debug mode:** Human tests known IDs (valid/invalid/aliased) via debug panel resolver.

### Step 9 — Define section schemas per entity
**Actions**
1. Specify required/optional sections for each entity.
2. Mark heavy sections to split (frames/audio blobs/large lists).
3. Version schemas and create backward-compatibility policy.

**Validation**
- **Automated:** Schema tests with positive and negative fixtures.
- **Debug mode:** Human loads schema docs in debug panel and validates section metadata is clear.

### Step 10 — Define API response/error contracts
**Actions**
1. Define success envelope, error envelope, and correlation IDs.
2. Define batch request/response ordering and partial-failure behavior.
3. Define cache metadata fields returned to clients.

**Validation**
- **Automated:** Contract tests for all endpoint response shapes.
- **Debug mode:** Human triggers known errors (missing entity, missing section, bad batch) and verifies readable error details.

---

## Phase 3 — Build-Assets Pipeline (tools/build-assets)

### Step 11 — Implement asset source scanner
**Actions**
1. Build scanner for raw decomposed WZ JSON tree.
2. Output deterministic inventory report (counts, sizes, largest files, namespace distribution).
3. Save report artifact for every run.

**Validation**
- **Automated:** Snapshot test on scanner report format and deterministic ordering.
- **Debug mode:** Human compares report with known large directories and confirms totals look correct.

### Step 12 — Implement robust JSON streaming reader
**Actions**
1. Use streaming parser for large JSON documents.
2. Add safe handling for malformed/truncated files.
3. Emit actionable parse error report with file paths.

**Validation**
- **Automated:** Unit tests with valid and intentionally corrupted JSON fixtures.
- **Debug mode:** Human injects one bad file and confirms pipeline continues with clear failure report.

### Step 13 — Implement link/UOL/outlink resolver
**Actions**
1. Resolve node links/UOL references during transform.
2. Record unresolved references explicitly.
3. Add configurable strict mode (fail) vs permissive mode (warn).

**Validation**
- **Automated:** Resolver tests with nested and chained references.
- **Debug mode:** Human views resolver diagnostics and confirms unresolved references are easy to trace.

### Step 14 — Implement map document extractor
**Actions**
1. Extract map core docs and split sections: meta/background/tiles/objects/footholds/portals/life/audio.
2. Keep references stable and deterministic.
3. Record reverse dependencies (map -> mobs/npcs/effects).

**Validation**
- **Automated:** Unit tests comparing extracted sections against source fixture expectations.
- **Debug mode:** Human opens one known map in debug panel and confirms section counts match source expectations.

### Step 15 — Implement mob/npc extractor
**Actions**
1. Extract mob and NPC docs with animation/audio/name sections.
2. Handle linked entities (info.link-like structures).
3. Normalize stance/frame metadata.

**Validation**
- **Automated:** Unit tests for linked entity resolution and section generation.
- **Debug mode:** Human inspects a linked mob and confirms resolved identity and playable animation data.

### Step 16 — Implement character/equip extractor
**Actions**
1. Extract character body/hair/face/equip data required by renderer.
2. Preserve layer/anchor metadata needed for composition.
3. Split heavy frame payloads to blob references.

**Validation**
- **Automated:** Unit tests for anchor/layer completeness and required fields.
- **Debug mode:** Human renders one character with multiple equips and confirms layering is visually correct.

### Step 17 — Implement blob hashing and deduplication
**Actions**
1. Hash large payloads (images/audio/large frame arrays).
2. Store blobs by content hash.
3. Replace inline payloads with blob references.

**Validation**
- **Automated:** Dedup tests proving identical inputs map to one blob.
- **Debug mode:** Human checks blob stats report and verifies duplicate-heavy datasets shrink as expected.

### Step 18 — Build index database
**Actions**
1. Create index mapping `type/id/section` -> storage location/hash metadata.
2. Include reverse lookup fields for diagnostics.
3. Add index integrity checker.

**Validation**
- **Automated:** Index lookup tests for existing/non-existing entries.
- **Debug mode:** Human queries random assets from debug CLI/panel and confirms instant lookup.

### Step 19 — Add incremental build mode
**Actions**
1. Track source file fingerprints.
2. Rebuild only changed entities and dependent docs.
3. Emit change summary.

**Validation**
- **Automated:** Integration tests proving unchanged files are skipped.
- **Debug mode:** Human edits one source asset and confirms only related docs/blobs/index rows update.

### Step 20 — Add pipeline validation report
**Actions**
1. Emit final report: processed entities, unresolved refs, schema violations, dedup ratio.
2. Classify issues by severity.
3. Fail build on configured severity threshold.

**Validation**
- **Automated:** Report schema tests and failure-threshold tests.
- **Debug mode:** Human reviews one full report and confirms it is understandable for non-authors.

---

## Phase 4 — Server API (Fastify on Bun)

### Step 21 — Implement server bootstrap and health endpoint
**Actions**
1. Start Fastify server with structured logs and correlation IDs.
2. Add health/readiness endpoints with index/data checks.
3. Add startup diagnostics (index version, doc count, blob count).

**Validation**
- **Automated:** Integration tests for health endpoint responses in healthy/unhealthy states.
- **Debug mode:** Human starts server with missing index and verifies readiness fails with clear reason.

### Step 22 — Implement `GET /api/v1/asset/:type/:id`
**Actions**
1. Return canonical document envelope for entity root.
2. Validate path params and enforce normalized IDs.
3. Return typed errors for not found/invalid type.

**Validation**
- **Automated:** Endpoint contract tests for valid/invalid cases.
- **Debug mode:** Human fetches map/mob/npc entities and inspects payload clarity in API viewer.

### Step 23 — Implement `GET /api/v1/asset/:type/:id/:section`
**Actions**
1. Return section payload and metadata.
2. Ensure section-level cache metadata is present.
3. Enforce strict section names by schema.

**Validation**
- **Automated:** Section endpoint tests for each supported type.
- **Debug mode:** Human requests map sections one-by-one and confirms partial loading in client debug panel.

### Step 24 — Implement `POST /api/v1/batch`
**Actions**
1. Accept ordered array of asset requests.
2. Return ordered results with per-item success/error.
3. Apply payload size limits and request validation.

**Validation**
- **Automated:** Batch ordering and partial-failure tests.
- **Debug mode:** Human submits mixed valid/invalid batch and confirms the UI handles partial results gracefully.

### Step 25 — Implement `GET /api/v1/blob/:hash`
**Actions**
1. Stream blob content by hash.
2. Return correct content type and cache headers.
3. Return typed not-found errors.

**Validation**
- **Automated:** Blob retrieval tests and content hash consistency checks.
- **Debug mode:** Human loads map with many repeated assets and verifies blob cache hits in logs.

### Step 26 — Add caching, compression, and ETag behavior
**Actions**
1. Add immutable caching for hashed resources.
2. Add short/controlled caching for mutable index-like resources.
3. Enable compression where beneficial.

**Validation**
- **Automated:** HTTP header integration tests and conditional request tests.
- **Debug mode:** Human refreshes same map repeatedly and verifies fewer bytes transferred and cache-hit logs.

### Step 27 — Add API observability dashboards
**Actions**
1. Expose metrics: request count, latency percentiles, error rates, cache hit rate.
2. Add endpoint-level tracing identifiers.
3. Add slow-query warnings.

**Validation**
- **Automated:** Metrics endpoint tests for expected counters/histograms.
- **Debug mode:** Human stress-tests map load and confirms metrics change in expected direction.

---

## Phase 5 — Client Loader Migration (Map-First)

### Step 28 — Introduce new AssetClient abstraction
**Actions**
1. Create an API-first loader interface separate from legacy WZ path access.
2. Keep compatibility adapter so old systems still run during migration.
3. Add request coalescing for duplicate in-flight requests.

**Validation**
- **Automated:** Unit tests for cache, coalescing, retry, and error propagation.
- **Debug mode:** Human enables request tracing and confirms duplicate requests are deduplicated.

### Step 29 — Migrate map core loading to API
**Actions**
1. Load map meta first.
2. Load map sections in map-first order (background, tiles, objects, footholds, portals, life, audio refs).
3. Keep placeholder rendering for missing sections.

**Validation**
- **Automated:** Integration test that map renders with staged section arrival.
- **Debug mode:** Human simulates slow network and verifies progressive map appearance without full freeze.

### Step 30 — Migrate mob/npc/character dependent loading
**Actions**
1. Resolve spawn dependencies after map core load.
2. Load mob/npc/character assets lazily by encounter.
3. Ensure fallback placeholder visuals when late.

**Validation**
- **Automated:** Tests for lazy-load trigger behavior and placeholder replacement.
- **Debug mode:** Human teleports across maps and confirms new entities stream in without major stutter.

### Step 31 — Add client memory + persistent cache policy
**Actions**
1. Add LRU policy for in-memory docs and decoded assets.
2. Add optional persistent cache for stable docs/blobs.
3. Expose cache stats in debug panel.

**Validation**
- **Automated:** Cache eviction tests and persistence tests.
- **Debug mode:** Human performs long play session and verifies memory growth stabilizes.

### Step 32 — Remove direct path-based fetches from gameplay path
**Actions**
1. Identify all direct WZ path lookups in active runtime loops.
2. Route them through AssetClient.
3. Keep legacy adapter only for temporary migration fallback.

**Validation**
- **Automated:** Static test/lint rule that fails on new direct path fetch usage in runtime modules.
- **Debug mode:** Human runs full gameplay loop and confirms no missing content caused by migration.

---

## Phase 6 — Runtime Architecture Hardening

### Step 33 — Introduce Stage-like world orchestration module
**Actions**
1. Create a central world orchestrator with explicit subsystems.
2. Move map object pools and update/draw orchestration into this module.
3. Keep existing behavior unchanged while moving responsibilities.

**Validation**
- **Automated:** Integration tests asserting update/draw order remains deterministic.
- **Debug mode:** Human compares before/after rendering in known maps and confirms no layer regressions.

### Step 34 — Extract combat orchestration from character class
**Actions**
1. Move attack timing, hit resolution, projectile scheduling, and effect triggers to a combat subsystem.
2. Keep character as input/state/render holder.
3. Add combat debug timeline output.

**Validation**
- **Automated:** Combat unit tests for melee hit windows, damage application, and cooldown behavior.
- **Debug mode:** Human runs scripted combat scenarios and validates hit timing visually and via logs.

### Step 35 — Normalize entity identity and pools
**Actions**
1. Add stable runtime IDs for entities (player, mob, npc, drops, projectiles).
2. Replace ad-hoc arrays where needed with keyed pools.
3. Add pool diagnostics in debug panel.

**Validation**
- **Automated:** Tests for add/update/remove lifecycle and duplicate ID rejection.
- **Debug mode:** Human spawns/clears many entities repeatedly and verifies no ghost entities remain.

---

## Phase 7 — Networking and Multiplayer

### Step 36 — Expand packet dispatch framework
**Actions**
1. Add packet router structure by feature domain (field, movement, combat, inventory, chat).
2. Keep existing login/ping handlers functional.
3. Add packet decode diagnostics in debug mode.

**Validation**
- **Automated:** Unit tests for opcode routing and unknown-op handling.
- **Debug mode:** Human replays packet captures and verifies handlers trigger expected domain logs.

### Step 37 — Implement field state sync
**Actions**
1. Add handlers for map change, spawn/remove entities, movement updates.
2. Ensure client state updates are idempotent and order-safe.
3. Add reconciliation warnings when state diverges.

**Validation**
- **Automated:** Integration tests with out-of-order and duplicate packet fixtures.
- **Debug mode:** Human runs two clients in same map and verifies consistent entity positions/state.

### Step 38 — Implement multiplayer combat sync
**Actions**
1. Add network events for attacks, damage, knockback, mob deaths, drops.
2. Preserve local responsiveness with reconciliation.
3. Add combat desync diagnostics.

**Validation**
- **Automated:** Integration tests for deterministic combat outcomes under simulated latency.
- **Debug mode:** Human tests two-client combat in one map, including latency simulation, and confirms both clients agree on outcomes.

### Step 39 — Implement chat sync + chat bubbles
**Actions**
1. Add message send/receive handlers.
2. Render chat log plus timed chat bubbles above characters.
3. Add profanity/spam placeholder hooks for future moderation.

**Validation**
- **Automated:** Unit tests for message formatting, bubble lifetime, and queue limits.
- **Debug mode:** Human sends messages across two clients and confirms bubbles/logs align and expire correctly.

---

## Phase 8 — Feature Completion for Target Scope

### Step 40 — Implement map effect subsystem
**Actions**
1. Add map-wide effect loader and timeline manager.
2. Integrate draw order near end-of-scene pass.
3. Add effect trigger API for packet/events.

**Validation**
- **Automated:** Tests for effect start/stop/timing behavior.
- **Debug mode:** Human triggers map effects from debug panel and verifies expected layering and timing.

### Step 41 — Implement reactor subsystem
**Actions**
1. Load reactors from map data.
2. Add state transitions and interactions.
3. Add visible debug state for each reactor.

**Validation**
- **Automated:** Reactor state machine tests.
- **Debug mode:** Human interacts with reactors and verifies state transitions and logs.

### Step 42 — Implement minimap subsystem
**Actions**
1. Load minimap section and world markers.
2. Track player and entity markers.
3. Add map transfer and NPC marker interactions where supported.

**Validation**
- **Automated:** Tests for marker coordinate transforms and minimap bounds.
- **Debug mode:** Human moves across map extremes and verifies minimap marker accuracy.

### Step 43 — Finish projectile/ranged integration
**Actions**
1. Fully connect projectile spawning to combat flow.
2. Ensure collision, damage, and effects are synchronized with server events.
3. Add fallback behavior for unsupported weapon classes.

**Validation**
- **Automated:** Projectile integration tests for travel, hit, miss, and cleanup.
- **Debug mode:** Human tests bow/throwing gameplay and confirms hit registration and visuals.

### Step 44 — Audio robustness pass
**Actions**
1. Verify BGM transitions across map changes.
2. Ensure SFX concurrency limits are sane.
3. Add debug audio mixer panel (active channels, volumes, clipping warnings).

**Validation**
- **Automated:** Audio state tests for start/stop/replace on map transitions.
- **Debug mode:** Human stress-tests combat/audio-heavy maps and confirms no stuck loops or silent channels.

---

## Phase 9 — End-to-End Validation and Release Readiness

### Step 45 — Build full scenario test suite
**Actions**
1. Create end-to-end scenarios: login, map load, movement, combat, drops, chat, map transfer, reconnect.
2. Add deterministic seed mode for repeatable results.
3. Include network-latency and packet-loss scenarios.

**Validation**
- **Automated:** E2E suite must pass in normal and degraded network profiles.
- **Debug mode:** Human runs scenario script with live visual confirmation and compares results against expected checklist.

### Step 46 — Add performance budgets
**Actions**
1. Define budgets for map load latency, frame time, memory, API p95 latency, cache-hit ratio.
2. Track budgets continuously in CI/perf runs.
3. Fail release candidate if budgets regress beyond threshold.

**Validation**
- **Automated:** Performance regression tests and threshold assertions.
- **Debug mode:** Human uses perf overlay while teleporting/spawning to confirm no major stutters or runaway memory.

### Step 47 — Add reliability and recovery tests
**Actions**
1. Test server restart during active sessions.
2. Test client reconnect and state recovery.
3. Test corrupted asset/missing blob fallback behavior.

**Validation**
- **Automated:** Chaos-style integration tests for restart/reconnect/data-missing cases.
- **Debug mode:** Human intentionally stops server mid-session and verifies graceful recovery path.

### Step 48 — Final multiplayer acceptance test
**Actions**
1. Define final acceptance script with two or more clients.
2. Include synchronized map transitions, cooperative combat, chat, drops, and reconnect.
3. Require shared evidence package (logs + screenshots + metrics summary).

**Validation**
- **Automated:** Multi-client integration run must pass with no desync assertions.
- **Debug mode:** Human executes full multiplayer checklist and confirms feature parity from player perspective.

### Step 49 — Release candidate checklist
**Actions**
1. Confirm all DoD items complete for every phase.
2. Freeze schema and API version for release candidate.
3. Produce operator runbook (start/stop, rebuild assets, debug workflow, known limitations).

**Validation**
- **Automated:** Final gate runs full lint/type/test/e2e/perf matrix.
- **Debug mode:** Human performs clean-room setup from docs and confirms they can run client/server/pipeline without tribal knowledge.

---

## Required Debug Playbook (must stay up-to-date)

Maintain a human-readable debug playbook with at least these flows:
1. Start client + server + pipeline output.
2. Warp to map by ID.
3. Spawn/despawn mobs and NPCs.
4. Simulate packet latency/loss.
5. Open two clients and verify multiplayer sync.
6. Trigger combat (melee + ranged), drops, and effects.
7. Send chat and verify bubbles/log.
8. Inspect API/cache metrics and asset lookup logs.
9. Force error cases (missing asset, bad packet, server restart).
10. Capture evidence bundle for any failed flow.

If any playbook flow fails, treat release as blocked.
