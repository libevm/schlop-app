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
8. Minimap overlay — top-left, toggle button, map-specific caching, map names from String.wz
9. Mob/NPC sprite rendering — load from Mob.wz/Npc.wz, animation system, name labels, String.wz names
10. Chat UI hidden during loading screen
11. Removed duplicate HUD overlay (map/action/frame text)

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
- Phase 4 (Steps 21-27): ✅ Complete (Bun native HTTP server, health/metrics, asset/section/blob/batch endpoints)
- Phase 5 (Steps 28-31): ✅ Complete (AssetClient with coalescing, LRU cache, retry, batch)
- Phase 5 (Step 32): ⏳ Remaining — Remove direct path-based fetches from gameplay
- Phase 6 (Steps 33-35): Scaffolding complete
- Phase 7+: Not started

## Next expected update point
- Phase 5, Step 32: Migrate direct WZ path fetches to AssetClient
- Phase 7: Networking and multiplayer
