# .memory Sync Status

Last synced: 2026-02-18T09:00:00+11:00
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
1. **WZ sprite damage numbers** (C++ DamageNumber parity):
   - Loads digit sprites from `Effect.wz/BasicEff.img`: NoRed0/NoRed1 (normal), NoCri0/NoCri1 (critical)
   - Indices 0-9 = digit images, index 10 = "MISS" sprite
   - First digit uses larger sprite (set0), rest use smaller (set1) with alternating ±2px y-shift
   - Advance spacing matches C++ `getadvance()` table: [24,20,22,22,24,23,24,22,24,24]
   - Critical digits get +8 (first) / +4 (rest) extra advance
   - Float-up via C++ `moveobj.vspeed = -0.25` per tick, opacity starts at 1.5 (extended full alpha)
   - Falls back to styled text if sprites not yet loaded
2. **C++ knockback physics (faithful):**
   - HIT stance force: `hforce = flip ? -KBFORCE : KBFORCE` (0.2 ground, 0.1 air)
   - Runs through `mobPhysicsStep()` with proper wall/edge limits (TURNATEDGES)
   - C++ edge-hit during HIT: flips mob, stops KB, exits to STAND (Mob::update lines 193-199)
   - HIT exits at counter>200 → transitions to aggro chase
   - Removed duplicate KB integration from `updateMobCombatStates`
3. **Mob aggro/chase after being hit:**
   - `state.aggro = true` set when HIT stance exits (counter>200 or edge-hit)
   - Aggro mobs face and chase player position, using normal `mobPhysicsStep` (respects edges)
   - Aggro expires after 3-6s random timer, mob returns to normal patrol
   - Aggro reset on respawn
4. **Mob foothold safety:**
   - During KB, `turnAtEdges = true` active → `mobPhysicsStep` uses `fhEdge()` to prevent falling off
   - Edge collision during KB stops knockback sliding, flips mob
   - All mob movement (patrol, aggro, KB) goes through unified `mobPhysicsStep` with limits
5. **Prone attack** (C++ parity):
   - `proneStab` stance when attacking while crouching
   - Degenerate damage ÷10 (C++ `Player::prepare_attack`)
6. **Default STR 25** for test character
7. **Mob sound UOL resolution** — `../` relative paths resolved; fallback to Snail (0100100)

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
  - Step 43 (projectiles): Not started (needs combat system expansion)
  - Step 44 (audio robustness): ✅ BGM crossfade, SFX pooling
- **NPC dialogue + scripts**: ✅ Complete
- **Combat system**: ✅ C++ parity — damage formula, knockback physics, aggro chase, WZ damage sprites
- **Equipment rendering**: ✅ Complete
- **Player HUD**: ✅ Complete

## Next expected update point
- Phase 7: Networking and multiplayer (needs server protocol)
- Phase 8: Remaining visual features (map weather/effects, projectiles)
- Phase 9: E2E validation
