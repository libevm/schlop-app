# Agent ↔ Chromium Interaction Notes

## Setup That Works

1. **Start the dev server** with `timeout` in bash (30s+ recommended):
   ```bash
   timeout 30 bash -c '
   bun tools/dev/serve-wzeditor.mjs &
   sleep 2
   # ... do browser stuff ...
   wait
   '
   ```
   Without `timeout`, the server process keeps the shell alive forever. Too-short timeouts (5-8s) kill the server before browser tools can connect.

2. **Start Chromium** with explicit user-data-dir (avoids conflicts with existing sessions):
   ```bash
   chromium --remote-debugging-port=9222 --no-first-run --user-data-dir=/tmp/chrome-debug --disable-gpu about:blank > /tmp/chrome.log 2>&1 &
   sleep 3
   curl -s http://127.0.0.1:9222/json/version | head -3  # verify
   ```
   - The `browser-start.js` helper sometimes doesn't keep Chrome alive — launching directly is more reliable.
   - Must use `--user-data-dir=/tmp/chrome-debug` (fresh profile) to avoid locking issues with an existing Chromium session.
   - Verify with `curl http://127.0.0.1:9222/json/version` before using browser tools.

3. **Navigate** with `browser-nav.js`:
   ```bash
   /home/k/.pi/agent/skills/pi-skills/browser-tools/browser-nav.js http://127.0.0.1:5175/
   ```

4. **Evaluate JS** with `browser-eval.js` — use sync IIFEs, not `async` with `await import()`:
   ```bash
   /home/k/.pi/agent/skills/pi-skills/browser-tools/browser-eval.js "
   (function() {
       return JSON.stringify({ title: document.title });
   })()
   "
   ```
   - `await import(...)` inside eval fails with fetch errors.
   - Dynamic imports don't work in puppeteer's execution context.
   - Stick to querying the DOM and reading already-loaded state.

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Server dies mid-test | bash timeout too short | Use `timeout 30` minimum |
| `nohup bun run ...` exits | `bun run` wrapper doesn't persist | Use `nohup bun tools/dev/serve-wzeditor.mjs` directly (no `run`) or use timeout bash block |
| `ERR_CONNECTION_REFUSED` in browser-nav | Server not running / wrong port | Check `lsof -i :5175` first; restart if needed |
| `browser-start.js` → no port 9222 | Chrome spawned but debug port not bound | Launch chromium directly with `--remote-debugging-port=9222` |
| `Failed to fetch` in browser-eval | Using `await import()` or `fetch()` in eval | Use sync IIFE; only query DOM/existing page state |
| IPv6 vs IPv4 mismatch | `localhost` resolves to `::1` but server binds `127.0.0.1` | Use `127.0.0.1` explicitly in URLs |

## Recommended Pattern (All-in-One)

```bash
timeout 30 bash -c '
# Start server
bun tools/dev/serve-wzeditor.mjs &
sleep 2

# Navigate
/home/k/.pi/agent/skills/pi-skills/browser-tools/browser-nav.js http://127.0.0.1:5175/
sleep 1

# Test
/home/k/.pi/agent/skills/pi-skills/browser-tools/browser-eval.js "(function() { return document.title; })()"

# Screenshot
/home/k/.pi/agent/skills/pi-skills/browser-tools/browser-screenshot.js

wait
'
```

Assumes Chromium is already running with `--remote-debugging-port=9222`. Start it separately if not.

## Cleanup

```bash
pkill -f serve-wzeditor 2>/dev/null
pkill -f "chromium.*chrome-debug" 2>/dev/null
```
