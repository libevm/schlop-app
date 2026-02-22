# Reference Scan Snapshot — 2026-02-22 (Remote chat bubble off-screen behavior)

## Why this scan
Pre-work scan for request: do not render remote player chat bubbles when the sender is off-screen.

## Read-only references checked

### 1) Legacy web port (AGENTS path)
- Expected: `/home/k/Development/Libevm/MapleWeb`
- Result: unavailable on this machine (`No such file or directory`).

### 2) C++ reference client (AGENTS path)
- Expected: `/home/k/Development/Libevm/MapleStory-Client`
- Result: unavailable on this machine (`No such file or directory`).

### 3) Available sibling context (read-only substitute)
- Path: `/Users/k/Development/Libevm/shlop-web`
- Findings: marketing/site content only (`serve.ts`, `site.md`), no gameplay canvas renderer or chat-bubble render implementation to mirror.

## Current repo findings (relevant)
- Remote chat bubbles are drawn in `client/web/app.js` via `drawRemotePlayerChatBubble(rp)`.
- Render call site is in the main render pass loop after name labels.
- Existing bubble logic clamps X to viewport bounds, which can show edge-clamped bubbles even when the remote character is fully off-screen.
- Existing visibility helper available: `isWorldRectVisible(worldX, worldY, width, height, margin = 96)`.

## Implementation direction
- Add a visibility guard in `drawRemotePlayerChatBubble(rp)`:
  - return early when remote player anchor point is not in the current viewport (`margin = 0`).
- Keep chat log/history behavior unchanged.
