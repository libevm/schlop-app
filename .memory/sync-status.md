# .memory Sync Status

Last synced: 2026-02-18T07:15:00+11:00
Status: ✅ Synced

## Current authoritative memory files
- `.memory/game-design.md`
- `.memory/cpp-port-architecture-snapshot.md`
- `.memory/half-web-port-architecture-snapshot.md`
- `.memory/cpp-vs-half-web-port-gap-snapshot.md`
- `.memory/tech-stack.md`
- `.memory/implementation-plan.md`

## What was synced in this pass
1. Phase 2 (Steps 8-10): Shared contracts and data model in @maple/shared-schemas
2. Phase 3 (Steps 11-20): Build-assets pipeline in @maple/build-assets
3. Phase 4 (Steps 21-27): Asset API server in @maple/server
4. Phase 5 (Steps 28-31): AssetClient loader in client runtime
5. Background tiling rewrite to match C++ MapBackgrounds.cpp count-based approach
6. Default resolution changed to 1920×1080
7. Fixed 16:9 display mode properly constrains canvas
8. Minimap overlay — top-left, −/+ collapse toggle, map-specific caching, String.wz names
9. Mob/NPC sprite rendering — load from Mob.wz/Npc.wz, animation system, name labels
10. Chat UI hidden during loading screen
11. Removed duplicate HUD overlay (map/action/frame text)
12. Animated map objects — multi-frame cycling with per-frame delays
13. Animated backgrounds — ani=1 backgrounds cycle through frames
14. BGM crossfade — 800ms fade-out on map transitions
15. SFX audio pooling — up to 8 reusable Audio elements per sound
16. Minimap toggle in Settings > Display
17. Mob foothold physics — walk on linked footholds, turn at edges/walls
18. Player renders at layer 7 when airborne (above all map layers)
19. Simplified player render layer (no more findFootholdBelow per frame)

## Validation snapshot
- ✅ `bun run ci` — 128 tests pass across all workspaces
  - shared-schemas: 35 tests
  - build-assets: 45 tests (including real WZ file extraction)
  - client: 23 tests (12 existing + 11 AssetClient)
  - server: 19 tests (1 harness + 18 API integration)
  - docs: 6 tests

## Phase completion status
- Phase 0 (Steps 1-4): ✅ Complete
- Phase 1 (Steps 5-7): ✅ Complete
- Phase 2 (Steps 8-10): ✅ Complete
- Phase 3 (Steps 11-20): ✅ Complete
- Phase 4 (Steps 21-27): ✅ Complete
- Phase 5 (Steps 28-31): ✅ Complete
- Phase 5 (Step 32): ⏳ Remaining — Remove direct path-based fetches
- Phase 6 (Steps 33-35): Scaffolding complete
- Phase 7 (Steps 36-39): Not started — requires game server protocol
- Phase 8 (Steps 40-44): ⏳ Partial
  - Step 40 (map effects): Animated objects ✅, animated backgrounds ✅, event effects deferred (server-dependent)
  - Step 41 (reactors): Not started
  - Step 42 (minimap): ✅ Complete
  - Step 43 (projectiles): Not started (needs combat system)
  - Step 44 (audio robustness): ✅ BGM crossfade, SFX pooling

## Next expected update point
- Phase 7: Networking and multiplayer (needs server protocol)
- Phase 8: Reactors, remaining visual features
- Phase 9: E2E validation
