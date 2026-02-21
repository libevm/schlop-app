# Shlop

This repository is the active implementation workspace for the MapleStory web-port completion effort.

## Current milestone status
- ✅ **Phase 0 implementation scaffolding** completed (DoD policy, observability conventions, debug flags/panel requirements).
- ✅ **Phase 1 implementation scaffolding** completed (Bun workspace split + package script standardization + baseline quality gates).
- ✅ **Phase 6 scaffolding pass** added (Stage-like world orchestrator, combat orchestrator, entity pools + diagnostics).
- 📁 Source assets are in `./resources/`.
- 🧠 Project context and architecture snapshots are in `.memory/`.

---

## Prerequisites
1. **Bun** (required runtime/package manager)
   - Recommended: `>= 1.3.x`
2. **Git**
3. Unix-like shell (Linux/macOS)

Verify:

```bash
bun --version
git --version
```

---

## Repository layout (current)

```txt
client/
server/
tools/
  build-assets/
  observability/
  policy/
  quality/
  workspace/
packages/
  shared-schemas/
resources/
docs/
.memory/
```

---

## Initial setup
1. Clone and enter repo:

```bash
git clone <repo-url>
cd shlop-app
```

2. Install workspace dependencies:

```bash
bun install
```

3. Confirm assets exist:

```bash
ls resources
```

You should see directories such as `Map.wz`, `Character.wz`, `Sound.wz`, etc.

---

## Workspace commands (root)
Run from repository root:

```bash
bun run dev
bun run build
bun run test
bun run lint
bun run typecheck
bun run check:workspace
bun run quality
bun run ci
bun run docs
bun run docs:test
bun run client:web
bun run client:offline
bun run client:online
```

### What they do
- `dev|build|test|lint|typecheck` run the same script across all workspace packages.
- `check:workspace` validates workspace structure/script conventions and quality-gate fixtures.
- `quality` runs lint + typecheck + test across all packages.
- `ci` runs `check:workspace` + `quality` + `docs:test`.
- `docs` starts a browser docs server (PWA-style docs UI).
- `docs:test` runs docs renderer/discovery unit tests.
- `client:offline` starts the standalone browser client (no server dependency, all state local).
- `client:online` starts the browser client with API proxy to the game server.
- `client:web` legacy alias for `client:offline`.
- `extract:v2` extracts V2 map dependencies from `resources/` → `resourcesv2/` (90 files: maps, mobs, NPCs, tiles, objects, backgrounds, BGM, character base, UI, strings).
  Run this before using V2 mode (`?v2=1` or online mode).

---

## Per-package scripts
Each package (`client`, `server`, `tools/build-assets`, `packages/shared-schemas`) exposes:
- `dev`
- `build`
- `test`
- `lint`
- `typecheck`

This is enforced by workspace tests under `tools/workspace/`.

---

## Quality gates and policy checks
### Definition of Done evidence checker

```bash
bun tools/policy/check-dod-evidence.mjs tools/policy/fixtures/evidence-pass.md
```

### Workspace/quality validation tests

```bash
bun run check:workspace
```

### Full local CI pass

```bash
bun run ci
```

---

## Docs in browser (PWA-style)
Start docs:

```bash
bun run docs
```

Open:
- default: `http://127.0.0.1:4173/`
- if 4173 is busy, the server automatically uses the next available port (check terminal output).

Optional:

```bash
DOCS_PORT=4300 bun run docs
```

Docs tests:

```bash
bun run docs:test
```

---

## Client in browser

### Offline mode (standalone, no server)

```bash
bun run client:offline
```

### Online mode (connects to game server)

```bash
# Start the game server first (port 5200)
bun run --cwd server dev

# Then start the online client (port 5173, proxies /api/* to server)
bun run client:online
```

Open:
- default: `http://127.0.0.1:5173/?mapId=104040000`
- if 5173 is busy, use the URL printed in terminal.
- online mode env: `GAME_SERVER_URL=http://host:port` (default `http://127.0.0.1:5200`)

Current debug-client capabilities:
- loads map data directly from `resources/` (no server gameplay backend required)
- renders map backgrounds, tiles, and objects for the selected map
- spawns a playable character (keyboard movement + jump + crouch + rope climbing)
- displays chat bubbles via in-page chat form
- supports BGM + SFX after clicking **Enable Audio**

Controls:
- keyboard controls are active only when the game canvas is hovered/focused (click canvas to focus)
- `←` / `→` (or `A` / `D`) move
- `Space` jump
- `↑` (or `W`) grabs nearby rope/ladder; at ladder top, `↓` (or `S`) can also grab to climb down
- while attached use `↑` / `↓` to climb
- while on rope/ladder, hold `←` / `→` then press `Space` to jump off sideways (no horizontal ladder walk)
- `↓` (or `S`) crouch (`prone`) when grounded

---

## Debug/config flags
Debug flags are defined in:
- `docs/process/debug-flags.md`

Reference parser:
- `tools/observability/debug-flags.mjs`

Example:

```bash
export DEBUG_MODE=true
export DEBUG_LOG_LEVEL=debug
export CLIENT_DEBUG_VERBOSE_ASSETS=true
export CLIENT_DEBUG_SIMULATED_LATENCY_MS=120
```

Phase 6 runtime hardening smoke flow:

```bash
bun run --cwd client debug:phase6
```

Reference:
- `docs/process/phase6-runtime-hardening.md`

---

## Contributor/agent workflow requirements
1. Read `AGENTS.md` first.
2. Treat `.memory/` as authoritative state.
3. After significant changes, update:
   - `.memory/` state files
   - `docs/pwa-findings.md`
4. If setup/run/workflow instructions change, update this `README.md` in the same change.

---

## Key files
- `AGENTS.md` — agent workflow rules
- `.memory/implementation-plan.md` — execution plan + live status
- `.memory/sync-status.md` — latest memory sync marker
- `docs/pwa-findings.md` — Progressive Web App documentation + significant changes log
- `docs/process/` — DoD/logging/debug process docs
- `tools/workspace/` — workspace orchestration + structure tests
- `tools/quality/` — lint/typecheck helpers + quality gate checks
- `resources/` — decomposed game assets
