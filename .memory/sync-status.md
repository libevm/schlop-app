# .memory Sync Status

Last synced: 2026-02-17T17:59:04+11:00
Status: ✅ Synced

## Current authoritative memory files
- `.memory/game-design.md`
- `.memory/cpp-port-architecture-snapshot.md`
- `.memory/half-web-port-architecture-snapshot.md`
- `.memory/cpp-vs-half-web-port-gap-snapshot.md`
- `.memory/tech-stack.md`
- `.memory/implementation-plan.md`

## What was synced in this pass
1. Investigated portal visibility mismatch via C++ references (read-only):
   - `MapleStory-Client/Gameplay/MapleMap/Portal.cpp`
   - `MapleStory-Client/Gameplay/MapleMap/MapPortals.cpp`
   - `MapleWeb/TypeScript-Client/src/Portal.ts`
2. Fixed portal rendering/type mapping in `client/web/app.js`:
   - portal parsing now includes `id` and `image`
   - corrected portal type-to-visual behavior:
     - always render: `2`, `4`, `7`, `11`
     - render only when touched: `10` hidden
     - do not render: non-visual portal types (`0`, `1`, `3`, etc.)
   - corrected portal asset path selection:
     - regular `pv`
     - hidden `ph/default/portalContinue`
     - scripted hidden `psh/<image>/portalContinue` with `default` fallback
3. Documentation/memory updates:
   - `.memory/implementation-plan.md`
   - `docs/pwa-findings.md` (new 17:59 entry)

## Validation snapshot
- Automated:
  - ✅ `bun run ci`
- Manual web smoke:
  - ✅ `CLIENT_WEB_PORT=5210 bun run client:web`
  - ✅ route load `/?mapId=104040000` (HTTP 200)

## Next expected update point
- User visual verification of portal parity on maps containing both regular (`pt=2`) and hidden (`pt=10`) portals.
