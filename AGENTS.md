# AGENTS.md

## Single Source of Truth
- The complete project context, plans, decisions, and progress snapshot live in `.memory/`.
- Always treat `.memory/` as authoritative.
- Do **not** duplicate long-form specs in this file.

## Project References (READ ONLY)
- Web port (TS/JS): `/home/k/Development/Libevm/MapleWeb`  
- C++ reference client: `/home/k/Development/Libevm/MapleStory-Client`
- Project assets are located in: `./resources/`
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

## Agent Guidance
- Keep `.memory/` as the full progress snapshot for handoff/resume.
- Ensure snapshots and progress notes are clear enough for another agent to continue without re-discovery.
