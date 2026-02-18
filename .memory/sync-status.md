# .memory Sync Status

Last synced: 2026-02-18T07:45:00+11:00
Status: ✅ Synced

## Current authoritative memory files
- `.memory/game-design.md`
- `.memory/cpp-port-architecture-snapshot.md`
- `.memory/half-web-port-architecture-snapshot.md`
- `.memory/cpp-vs-half-web-port-gap-snapshot.md`
- `.memory/tech-stack.md`
- `.memory/implementation-plan.md`
- `.memory/canvas-rendering.md`
- `.memory/physics.md`

## What was synced in this pass
1. **Camera height bias**: Camera target is `player.y - cameraHeightBias()` where
   `cameraHeightBias() = Math.max(0, (canvasHeight - 600) / 2)`. At 600px: 0, at 1080px: 240.
   Shifts the camera upward on tall viewports so backgrounds (designed for 600px) cover
   more of the viewport bottom and sky fills the top. Still subject to map bounds clamping.
2. **Character equipment rendering** (Phase 8):
   - Hair data loaded from `Character.wz/Hair/00030000.img.json`
   - Equipment data loaded for default outfit: Coat 01040002, Pants 01060002, Shoes 01072001, Weapon 01302000
   - `getHairFrameParts()` extracts hair canvas parts from "default" stance (handles nested hairShade imgdirs)
   - `getEquipFrameParts()` extracts equipment canvas parts for any stance/frame with z-layer names
   - `getCharacterFrameData()` now includes hair + equipment parts alongside body/head/face
   - `addCharacterPreloadTasks()` preloads up to 6 frames per action for all parts
   - Composition uses existing anchor system: body→navel, head→neck→brow, hair→brow, equips→navel/hand
   - Z-ordering uses `zmap.img.json` layer names from each part's `z` string node
   - **Climbing parity (C++ CharLook::draw)**:
     - Weapon hidden during climbing (no ladder/rope stance → skip)
     - Hair resolves UOLs to `backDefault/backHair` + `backHairBelowCap` (back hair layers)
     - Face suppressed during climbing
     - Head uses back section (`../../back/head`)
     - Coat/Pants/Shoes use their back z-layers (`backMailChest`, `backPants`, `backShoes`)
3. **NPC dialogue + scripts**: Full feature (click-to-talk, portraits, scripted options, travel)
4. **Mob movement speed 3×**: `(speed+100)*0.003`
5. **Duplicate `roundRect` removed**
6. **footholdBounds extended with minY/maxY**

## Validation snapshot
- ✅ `bun run ci` — all tests pass across all workspaces

## Phase completion status
- Phase 0 (Steps 1-4): ✅ Complete
- Phase 1 (Steps 5-7): ✅ Complete
- Phase 2 (Steps 8-10): ✅ Complete
- Phase 3 (Steps 11-20): ✅ Complete
- Phase 4 (Steps 21-27): ✅ Complete
- Phase 5 (Steps 28-32): ✅ Complete
- Phase 6 (Steps 33-35): Scaffolding complete
- Phase 7 (Steps 36-39): Not started — requires game server protocol
- Phase 8 (Steps 40-44): ⏳ Partial
  - Step 40 (map effects): Animated objects ✅, animated backgrounds ✅, event effects deferred
  - Step 41 (reactors): ✅ Complete
  - Step 42 (minimap): ✅ Complete
  - Step 43 (projectiles): Not started (needs combat system)
  - Step 44 (audio robustness): ✅ BGM crossfade, SFX pooling
- **NPC dialogue + scripts**: ✅ Complete

## Next expected update point
- Phase 7: Networking and multiplayer (needs server protocol)
- Phase 8: Remaining visual features (equipment rendering, projectiles)
- Phase 9: E2E validation
- Camera bottom-void: still visible at very large resolutions when camera clamp overrides bias
