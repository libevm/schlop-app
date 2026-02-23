# Client Module Split

> Tracks the decomposition of `client/web/app.js` (~14,862 lines) into ES modules.

## Module Plan

| Module | Description | Status |
|--------|-------------|--------|
| `state.js` | Constants, runtime object, caches, DOM refs, shared mutable state | ✅ |
| `util.js` | Pure utility functions (WZ node navigation, safe helpers, draw primitives) | ✅ |
| `cache.js` | Asset fetch/cache layer (cachedFetch, fetchJson, requestMeta, requestImageByKey) | ⬜ |
| `sound.js` | Audio system (BGM, SFX, UI sounds, pools) | ⬜ |
| `save.js` | Character save/load, PoW, session management, character create/login overlays | ⬜ |
| `net.js` | WebSocket, remote players, snapshot interpolation, remote rendering | ⬜ |
| `inventory.js` | Inventory/equip data + UI, item drag, tooltips, icons, chair system | ⬜ |
| `physics.js` | Player physics, foothold helpers, ground physics, wall collision | ⬜ |
| `life.js` | Mob/NPC loading, mob physics, mob AI, combat, damage numbers | ⬜ |
| `npc.js` | NPC scripts, dialogue system, leaderboard, NPC interaction | ⬜ |
| `character.js` | Character composition, face animation, equip/hair parts, set effects | ⬜ |
| `map.js` | Map parsing, loading, spatial index, preloading, portals, transitions | ⬜ |
| `render.js` | Core render loop, backgrounds, map layers, HUD, minimap, loading screen, overlays | ⬜ |
| `input.js` | Keyboard/mouse/touch input, keybinds, settings, chat, GM commands | ⬜ |
| `app.js` | Entry point: game loop (update/tick), boot sequence, wiring | ⬜ |

## Architecture

- **ES modules** — `<script type="module" src="/app.js">` in index.html (unchanged)
- **Bun.build** handles bundling for `--prod` mode (resolves ES imports automatically)
- **Browser** resolves imports natively in dev mode (no bundler needed)
- **state.js** is the shared foundation — imported by all other modules
- **Circular dependencies** avoided by keeping orchestration in app.js/render.js
- **Mutable state** — `runtime` object exported as `const` from state.js (properties are mutable)
- **Mutable primitives** (e.g., `sessionId`) use exported setter functions

## Shared State Strategy

```
state.js exports:
  - runtime (object — mutable properties)
  - ctx, canvasEl (canvas context)
  - All cache Maps (jsonCache, metaCache, imageCache, etc.)
  - All constants (physics, portal, UI, etc.)
  - DOM element refs
  - playerEquipped, playerInventory, groundDrops
  - sessionId + setSessionId()
  - gameViewWidth(), gameViewHeight(), cameraHeightBias()
```

## Progress Log

### 2026-02-23 — Foundation modules created
- Created `state.js` (~318 lines): All constants, runtime object, caches, DOM refs, debug logging,
  session state, `fn` registry for late-binding cross-module calls.
  Exports: runtime, ctx, canvasEl, all caches, all constants, DOM element refs,
  gameViewWidth/Height, cameraHeightBias, newCharacterDefaults, playerFacePath/HairPath,
  playerEquipped, playerInventory, groundDrops, draggedItem, sessionId/setSessionId.
- Created `util.js` (~280 lines): Pure utility functions + asset cache layer + draw helpers.
  Exports: safeNumber, loadJsonFromStorage, saveJsonToStorage, childByName, imgdirChildren,
  parseLeafValue, imgdirLeafRecord, vectorRecord, pickCanvasNode, canvasMetaFromNode,
  objectMetaExtrasFromNode, applyObjectMetaExtras, findNodeByPath, resolveNodeByUol,
  randomRange, mapPathFromId, soundPathFromName, fetchJson, getMetaByKey, requestMeta,
  requestImageByKey, getImageByKey, wrapText, roundRect, worldToScreen, isWorldRectVisible,
  drawWorldImage, drawScreenImage, localPoint, topLeftFromAnchor, worldPointFromTopLeft.
- Modified `app.js` to import from state.js and util.js, removed all duplicated declarations.
- Used `setSessionId()` and `setCurrentInvTab()` for mutable primitive exports (ES module live bindings).
- Verified: `node --check` passes, `bun build` bundles all 3 modules successfully.
- app.js reduced from ~14,923 to ~13,993 lines (~930 lines extracted).
- Next step: extract net.js (lines 1462-2945, ~1500 lines of networking code).
