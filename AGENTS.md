# AGENTS.md

## Single Source of Truth
- The complete project context, plans, decisions, and progress snapshot live in `.memory/`.
- Always treat `.memory/` as authoritative.
- Do **not** duplicate long-form specs in this file.

## Project References (READ ONLY)
- Web port (TS/JS): `/home/k/Development/Libevm/MapleWeb`  
- C++ reference client: `/home/k/Development/Libevm/MapleStory-Client`
- Project assets are located in: `./resources/` and `./resourcesv2/`
- These two referenced codebases are **READ ONLY**.
- Do not modify files in either reference path.

## Required Workflow Rules
1. Read relevant files in `.memory/` before starting work.
2. Scan the half web port and C++ port references (read-only inspection only).
3. Save a snapshot of findings from that scan into `.memory/` (structure, key systems, relevant files, and current implementation status).
4. Implement the requested change in the working repository.
5. **After every change, update `.memory/` to reflect the new current state.**
   - Include code edits, architecture decisions, API/schema changes, milestones, and task progress.
6. If `.memory/` is not updated, the change is considered incomplete.
7. After every significant change, update the PWA documentation page at `docs/pwa-findings.md`.
   - Keep it concise, chronological, easy to skim, and accurate for browser usage via `bun run docs`.
8. If setup/run/workflow instructions change, update `README.md` in the same change.
   - Keep setup steps current and runnable for a new contributor.

## Rendering Pipeline Documentation
- `.memory/canvas-rendering.md` documents the full canvas rendering pipeline:
  asset loading, caching, draw order, coordinate systems, transitions, and diagnostics.
- **Any change to the rendering pipeline, draw order, asset caching, preload logic,
  coordinate transforms, or transition/overlay behavior MUST update `canvas-rendering.md`.**
- This includes: new draw functions, cache invalidation changes, new asset types,
  loading screen changes, debug overlay additions, and image decode pipeline changes.

## Physics Documentation
- `.memory/physics.md` documents the full physics system:
  player movement, mob movement, foothold structures, gravity, swimming, climbing, and AI.
- **Any change to physics constants, movement logic, foothold handling, collision detection,
  mob AI behavior, or force/velocity calculations MUST update `physics.md`.**
- This includes: new physics modes, constant tuning, foothold chain logic, jump mechanics,
  rope/ladder changes, mob patrol behavior, and swim physics.

## Client-Server Architecture Documentation
- `.memory/client-server.md` documents the client-server architecture:
  session/auth model, character state schema, V2 map set, resource pipeline.
- `.memory/shared-schema.md` is the **wire protocol source of truth**:
  all REST and WebSocket message types, fields, examples, and room model.
- **Any change to player state fields, session handling, WebSocket messages,
  REST endpoints, persistence logic, V2 map list, or online/offline mode
  switching MUST update `client-server.md` AND/OR `shared-schema.md`.**
- This includes: new stat fields, save/load functions, new WS message types,
  room model changes, auth flow changes, V2 resource additions, and
  default value changes.

## Inventory & Equipment Documentation
- `.memory/inventory-system.md` documents inventory tabs, slots, drag-drop, ground drops, loot.
- `.memory/equipment-system.md` documents equipment window, equip/unequip flow, sprite rendering.
- **Any change to inventory data model, tab logic, slot layout, item icons, drop mechanics,
  loot pickup, equip/unequip flow, or equipment UI MUST update the relevant file.**

## Agent Guidance
- Keep `.memory/` as the full progress snapshot for handoff/resume.
- Ensure snapshots and progress notes are clear enough for another agent to continue without re-discovery.
