# .memory Sync Status

Last synced: 2026-02-18T07:47:32+11:00
Status: ✅ Synced

## Current authoritative memory files
- `.memory/game-design.md`
- `.memory/cpp-port-architecture-snapshot.md`
- `.memory/half-web-port-architecture-snapshot.md`
- `.memory/cpp-vs-half-web-port-gap-snapshot.md`
- `.memory/tech-stack.md`
- `.memory/implementation-plan.md`

## What was synced in this pass
1. Complete physics rewrite in `client/web/app.js`:
   - Replaced ad-hoc velocity model with C++ HeavenClient force/friction/gravity pipeline
   - Ground: force-based walk with slope/friction drag (max ~100 px/s)
   - Air: gravity (2187.5 px/s²) + opposing-direction nudge (0.025/tick)
   - Jump: -562.5 px/s impulse, carrying ground momentum
   - Landing: hspeed preserved, friction handles deceleration
   - Removed slope landing push system entirely
   - Added terminal fall velocity cap (670 px/s)
2. Reference scans captured:
   - `MapleStory-Client/Gameplay/Physics/Physics.cpp`
   - `MapleStory-Client/Gameplay/Physics/PhysicsObject.h`
   - `MapleStory-Client/Character/PlayerStates.cpp`
   - `MapleStory-Client/Character/Player.cpp`
3. Memory/docs updates:
   - `.memory/implementation-plan.md` updated with full physics rewrite entry
   - `docs/pwa-findings.md` updated with new 2026-02-18 07:47 entry

## Validation snapshot
- Automated:
  - ✅ `bun run ci`
- Manual web smoke:
  - ✅ `CLIENT_WEB_PORT=5210 bun run client:web`
  - ✅ route load `/?mapId=104040000` (HTTP 200)

## Next expected update point
- User feel-check of walk acceleration ramp, jump height/arc, fall speed, and air control responsiveness. Tune PHYS_ constants if needed.
