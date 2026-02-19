# Implementation Plan — MapleWeb Online

> Step-by-step instructions for AI developers.
> Read `.memory/client-server.md` for full architecture context.
> Read `.memory/shared-schema.md` for the wire protocol definition.
> Read `AGENTS.md` for workflow rules.

---

## Architecture Principles

These rules apply to ALL phases. Violating them is a bug.

1. **Server is authoritative.** Clients are views + inputs. The server owns game state.
2. **Client sends inputs, not state.** The client never tells the server "my HP is 50" — it tells the server "I pressed attack" and the server decides the outcome.
3. **Periodic snapshots + interpolation.** Server sends state updates at 10–20 Hz. Client interpolates between snapshots (100–200 ms buffer). No aggressive extrapolation.
4. **Soft-predicted local movement.** Client moves immediately for feel (visual only). Server sends authoritative position periodically. Small drift → lerp correction over 100–300 ms. Large drift → snap with animation.
5. **Proximity culling.** Don't send distant players/mobs every tick. Server only relays updates for entities within the same map (and later, within view range).
6. **JSON wire format (v1).** All messages include a `type` field. Binary optimization deferred.

---

## File Organization

Before Phase 4, split `client/web/app.js` into modules:

```
client/web/
  app.js            → main entry, game loop, init, globals
  net.js            → WebSocket connection, wsSend, handleServerMessage, remotePlayers
  save.js           → buildCharacterSave, applyCharacterSave, saveCharacter, loadCharacter
  ui-character-create.js → Name/gender picker UI
```

Use `<script type="module">` in `index.html` or keep as classic scripts with a defined load order.
Global state that modules share should live in a `state.js` or remain in `app.js` with explicit `window.*` exports.
The split boundary: networking code never references DOM elements; rendering code never references WebSocket.

---

## Phase 1 — Client-Side Save/Load (Offline Persistence)

Goal: Character progress persists across page reloads in localStorage.

### 1.1 Add session ID generation

**File:** `client/web/save.js` (NEW)

1. Add constants:
   ```js
   const SESSION_KEY = "mapleweb.session";
   const CHARACTER_SAVE_KEY = "mapleweb.character.v1";
   ```
2. Add `getOrCreateSessionId()`:
   - Read `localStorage.getItem(SESSION_KEY)`
   - If null → `crypto.randomUUID()`, store, return
   - If exists → return it
3. Export/expose `sessionId` globally.

### 1.2 Add character creation UI (name + gender picker)

**File:** `client/web/ui-character-create.js` (NEW)
**File:** `client/web/index.html` (add overlay div)
**File:** `client/web/styles.css` (style the overlay)

1. Add a full-screen overlay `#character-create-overlay` in HTML, initially hidden.
2. Overlay contains:
   - MapleStory-styled panel (dark frosted glass, gold accents, Dotum font — match existing HUD aesthetic)
   - "Create Your Character" header
   - Name input field (max 12 chars, alphanumeric only, no leading/trailing spaces)
   - Gender toggle: Male / Female (two styled buttons, one active)
   - "Enter World" button (gold, disabled until name is valid)
   - Validation: show inline error for empty / too short / too long / invalid chars
3. On submit:
   - Store `{ name, gender }` in a pending state
   - Set `runtime.player.name` and player gender
   - Hide overlay, begin `loadMap()`
4. The overlay is shown if `loadCharacter()` returns null (no save exists) AND no session has a character.
5. Skip the overlay if a save already exists (returning player).

### 1.3 Add `buildCharacterSave()` function

**File:** `client/web/save.js`

1. Create function reading all runtime state → `CharacterSave` object.
2. Match the `CharacterSave` schema from `shared-schema.md` exactly.
3. Include `identity.name`, `identity.gender`, `identity.skin`, `identity.face_id`, `identity.hair_id`.
4. Include all stats from `runtime.player.*`.
5. `location.spawn_portal`: use helper `findClosestSpawnPortal(player.x, player.y)` → returns portal name string (not index).
6. Equipment: serialize from `playerEquipped` Map.
7. Inventory: serialize from `playerInventory` array.
8. Achievements: stub with zeros for now.
9. Include `version: 1` and `saved_at: new Date().toISOString()`.

### 1.4 Add `findClosestSpawnPortal(x, y)` helper

**File:** `client/web/app.js` (or `save.js` if it has access to `runtime.map`)

1. Iterate `runtime.map.portalEntries` where `portal.type === 0` (spawn portals).
2. Return the portal name with the smallest Euclidean distance to `(x, y)`.
3. Fallback: return `null` if no spawn portals exist.

### 1.5 Add `applyCharacterSave(save)` function

**File:** `client/web/save.js`

1. Apply identity: `runtime.player.name`, gender (store for future use).
2. Apply stats: level, job, exp, maxExp, hp, maxHp, mp, maxMp, stats.speed, stats.jump.
3. Apply facing: `runtime.player.facing = save.location.facing`.
4. Rebuild equipment:
   - Clear `playerEquipped`
   - For each `save.equipment` entry:
     - `playerEquipped.set(entry.slot_type, { id: entry.item_id, name: entry.item_name, iconKey: loadEquipIcon(entry.item_id, equipWzCategoryFromId(entry.item_id)) })`
     - Call `loadEquipWzData(entry.item_id)` (async, for character rendering)
     - Async load display name via `loadItemName(entry.item_id)`
5. Rebuild inventory:
   - Clear `playerInventory`
   - For each `save.inventory` entry: push item object, load icon, async load name
6. Call `refreshUIWindows()`.
7. Return `{ mapId: save.location.map_id, spawnPortal: save.location.spawn_portal }`.

**Important:** `loadEquipWzData` must be called for every equipped item so that `runtime.characterEquipData` has the stance data needed for `composeCharacterPlacements()`. The subsequent `loadMap → preloadMapAssets → requestCharacterData` will include these equips in its preload list because `requestCharacterData` reads from `playerEquipped`.

### 1.6 Add `saveCharacter()` / `loadCharacter()`

**File:** `client/web/save.js`

```js
function saveCharacter() {
  const save = buildCharacterSave();
  localStorage.setItem(CHARACTER_SAVE_KEY, JSON.stringify(save));
}

function loadCharacter() {
  const raw = localStorage.getItem(CHARACTER_SAVE_KEY);
  if (!raw) return null;
  try {
    const save = JSON.parse(raw);
    if (!save || save.version !== 1) return null;
    return save;
  } catch { return null; }
}
```

### 1.7 Wire save triggers

**File:** `client/web/app.js`

Add `saveCharacter()` calls at:

1. **Portal transition:** In `runPortalMapTransition()`, after successful `loadMap()` completes.
2. **Equip/unequip:** At end of `equipItemFromInventory()` and `unequipItem()`.
3. **Level up:** After the stat changes in the level-up block (~line 3870).
4. **Periodic timer:** `setInterval(saveCharacter, 30_000)` near init.
5. **Page unload:** `window.addEventListener("beforeunload", saveCharacter)`.

All save trigger calls are fire-and-forget (synchronous localStorage in offline mode).

### 1.8 Wire load on startup

**File:** `client/web/app.js` (bottom, near init)

```js
const savedCharacter = loadCharacter();
let startMapId, startPortalName;

if (savedCharacter) {
  const restored = applyCharacterSave(savedCharacter);
  startMapId = params.get("mapId") ?? restored.mapId ?? "100000001";
  startPortalName = restored.spawnPortal ?? null;
} else {
  // Show character creation UI, wait for user to submit
  await showCharacterCreateOverlay();
  startMapId = params.get("mapId") ?? "100000001";
  startPortalName = null;
  initPlayerEquipment();
  initPlayerInventory();
}

loadMap(startMapId, startPortalName);
```

### 1.9 Update default map

**File:** `client/web/app.js`

Change fallback map from `"104040000"` to `"100000001"` everywhere:
- Line ~10407: `const initialMapId = params.get("mapId") ?? "100000001";`

**File:** `tools/dev/serve-client-offline.mjs`, `tools/dev/serve-client-online.mjs`
- Update any `Default map:` console log references to `100000001`.

### 1.10 Test

- `bun run client:offline`
- Create character (name + gender picker appears)
- Play: move to another map, equip/unequip, gain EXP
- Reload page → character state restored (map, level, HP, equipment, inventory)
- Name picker does NOT appear on second load (save exists)
- `bun run ci` — must pass

### 1.11 Update `.memory`

- Update `sync-status.md`, `inventory-system.md`, `equipment-system.md`
- Update `canvas-rendering.md` if loading flow changed

---

## Phase 2 — Server Persistence (REST API)

Goal: Game server stores character data in SQLite. Online client saves/loads via REST.

### 2.1 Add SQLite database module

**File:** `server/src/db.ts` (NEW)

1. Import `Database` from `bun:sqlite`.
2. Export `initDatabase(dbPath?: string)`:
   - Default path: `./data/maple.db`
   - Create `data/` directory if needed (`mkdirSync`)
   - Create tables:
     ```sql
     CREATE TABLE IF NOT EXISTS characters (
       session_id TEXT PRIMARY KEY,
       data TEXT NOT NULL,
       version INTEGER DEFAULT 1,
       updated_at TEXT DEFAULT (datetime('now'))
     );
     CREATE TABLE IF NOT EXISTS names (
       name TEXT PRIMARY KEY COLLATE NOCASE,
       session_id TEXT NOT NULL UNIQUE,
       created_at TEXT DEFAULT (datetime('now'))
     );
     ```
   - Return the `Database` instance
3. Export helpers:
   - `saveCharacterData(db, sessionId, data: string)` — `INSERT OR REPLACE INTO characters (session_id, data, version, updated_at) VALUES (?, ?, 1, datetime('now'))`
   - `loadCharacterData(db, sessionId)` → parsed JSON or `null`
   - `reserveName(db, sessionId, name)` → `{ ok: true }` or `{ ok: false, reason: "name_taken" }`
     - Check: `SELECT session_id FROM names WHERE name = ? COLLATE NOCASE`
     - If exists and `session_id` matches → ok (re-reserving own name)
     - If exists and different → name_taken
     - If not exists → `INSERT INTO names`
   - `getNameBySession(db, sessionId)` → name string or `null`
   - `createDefaultCharacter(db, sessionId, name, gender)` → creates and saves a default `CharacterSave` JSON blob

### 2.2 Add character API middleware

**File:** `server/src/character-api.ts` (NEW)

1. Export `handleCharacterRequest(request: Request, url: URL, db: Database): Response | null`
2. Extract session from `Authorization: Bearer <id>` header. Return 401 if missing.
3. Route by path:

**`POST /api/character/create`**
- Body: `{ name: string, gender: boolean }`
- Call `reserveName(db, sessionId, name)` — if taken, return 409
- Call `createDefaultCharacter(db, sessionId, name, gender)`
- Return 201 with the default save data

**`GET /api/character/load`**
- Call `loadCharacterData(db, sessionId)`
- If null → return 404
- Return 200 with save data

**`POST /api/character/save`**
- Parse body as JSON
- Validate `version` field exists
- Call `saveCharacterData(db, sessionId, JSON.stringify(body))`
- Return 200

**`POST /api/character/name`**
- Body: `{ name: string }`
- Call `reserveName(db, sessionId, name)`
- Return result (200 or 409)

4. Return `null` for unrecognized paths (fall through to other handlers).

### 2.3 Wire character API into server

**File:** `server/src/server.ts`

1. Import `initDatabase` from `./db.ts`.
2. Import `handleCharacterRequest` from `./character-api.ts`.
3. Add `dbPath?: string` to `ServerConfig`.
4. In `createServer()`:
   - Initialize DB in `start()`: `const db = initDatabase(cfg.dbPath)`
   - In `fetch()`, before existing asset routing:
     ```ts
     if (url.pathname.startsWith("/api/character/")) {
       const charResp = handleCharacterRequest(request, url, db);
       if (charResp) {
         charResp.headers.set("Access-Control-Allow-Origin", "*");
         charResp.headers.set("X-Correlation-Id", correlationId);
         return charResp;
       }
     }
     ```
5. Add CORS preflight handler for `OPTIONS` requests.

### 2.4 Keep server and static file server separate

**Do NOT merge static file serving into server.ts.**

- `bun run client:offline` → `serve-client-offline.mjs` (static files, no server dependency)
- `bun run client:online` → `serve-client-online.mjs` (static files + proxy `/api/*` to game server)
- `bun run server` (NEW script) → starts the game server on port 5200

**File:** `package.json` — add script:
```json
"server": "bun run --cwd server dev"
```

**File:** `server/package.json` — add script:
```json
"dev": "bun run src/dev.ts"
```

### 2.5 Update server dev entry

**File:** `server/src/dev.ts`

```ts
import { createServer } from "./server.ts";
import { InMemoryDataProvider } from "./data-provider.ts";

const provider = new InMemoryDataProvider();
const { start } = createServer(provider, {
  port: 5200,
  debug: true,
  dbPath: "./data/maple.db",
});
const server = start();
console.log(`🍄 MapleWeb game server on http://localhost:${server.port}`);
```

### 2.6 Wire online client save/load

**File:** `client/web/save.js`

1. Modify `saveCharacter()` to be async:
   ```js
   async function saveCharacter() {
     const save = buildCharacterSave();
     if (window.__MAPLE_ONLINE__) {
       try {
         await fetch("/api/character/save", {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             "Authorization": "Bearer " + sessionId,
           },
           body: JSON.stringify(save),
         });
       } catch (e) { rlog("Save failed: " + e.message); }
     } else {
       localStorage.setItem(CHARACTER_SAVE_KEY, JSON.stringify(save));
     }
   }
   ```
2. Modify `loadCharacter()` to be async:
   ```js
   async function loadCharacter() {
     if (window.__MAPLE_ONLINE__) {
       try {
         const resp = await fetch("/api/character/load", {
           headers: { "Authorization": "Bearer " + sessionId },
         });
         if (resp.ok) return await resp.json();
       } catch (e) { rlog("Load failed: " + e.message); }
       return null;
     }
     const raw = localStorage.getItem(CHARACTER_SAVE_KEY);
     if (!raw) return null;
     try { return JSON.parse(raw); } catch { return null; }
   }
   ```
3. For `beforeunload` in online mode: use `navigator.sendBeacon("/api/character/save", blob)` since `fetch` can't be awaited during unload. The server's `POST /api/character/save` must accept both JSON and beacon payloads.
4. Update init to `await loadCharacter()`.

### 2.7 Online character creation flow

**File:** `client/web/ui-character-create.js`

1. In online mode, after user submits name + gender:
   - `POST /api/character/create` with `{ name, gender }`
   - If 409 (name taken) → show error "Name already taken", let user retry
   - If 201 → proceed to `loadMap()`
2. In offline mode → skip server call, just save to localStorage.

### 2.8 Add server tests

**File:** `server/src/character-api.test.ts` (NEW)

Tests using in-memory SQLite (`:memory:`):
1. `POST /api/character/create` → 201, returns default save
2. `GET /api/character/load` → returns saved data
3. `GET /api/character/load` with unknown session → 404
4. `POST /api/character/save` → 200, updates data
5. `POST /api/character/name` with new name → 200
6. `POST /api/character/name` with taken name → 409
7. Missing `Authorization` header → 401

### 2.9 Test end-to-end

- Terminal 1: `bun run server` (game server on 5200)
- Terminal 2: `bun run client:online` (client on 5173, proxies to 5200)
- Create character → name reserved in SQLite
- Play, reload → character state persists via server
- `bun run ci` — must pass

### 2.10 Update `.memory`

---

## Phase 3 — WebSocket Server (Real-Time Relay)

Goal: Server manages map-scoped rooms, relays real-time player state with server authority.

### 3.1 Create shared schema document

**File:** `.memory/shared-schema.md` (NEW — created in this PR, see separate section below)

All message types, fields, and semantics documented in markdown.
Both server and client code reference this file as the source of truth.

### 3.2 Add WebSocket room manager

**File:** `server/src/ws.ts` (NEW)

1. Define `WSClient`:
   ```ts
   interface WSClient {
     id: string;          // session ID
     name: string;
     mapId: string;
     ws: ServerWebSocket<WSClientData>;
     x: number;
     y: number;
     action: string;
     facing: number;
     look: PlayerLook;    // face_id, hair_id, skin, equipment[]
     lastActivityMs: number;
   }
   ```

2. Create `RoomManager` class:
   - `rooms: Map<string, Map<string, WSClient>>` — mapId → (sessionId → client)
   - `allClients: Map<string, WSClient>` — sessionId → client
   - Methods:
     - `addClient(client)` — add to `allClients` + room
     - `removeClient(sessionId)` — remove from room + `allClients`, broadcast `player_leave` to old room
     - `changeRoom(sessionId, newMapId)` — remove from old room (broadcast `player_leave`), add to new room (broadcast `player_enter`), send `map_state` snapshot to the joining client
     - `broadcastToRoom(mapId, msg, excludeId?)` — send JSON to all in room except excludeId
     - `broadcastGlobal(msg)` — send to all connected clients
     - `getMapState(mapId)` — array of player snapshots for `map_state`
     - `getClient(sessionId)` — lookup
     - `getPlayerCount()` → `allClients.size`

3. **Heartbeat / disconnect detection:**
   - Track `lastActivityMs` on every message received
   - `setInterval` every 10s: iterate `allClients`, if `now - lastActivityMs > 30_000`, disconnect the WS and call `removeClient`
   - Client sends `{ type: "ping" }` every 10s; server responds `{ type: "pong" }`

### 3.3 Add message handler

**File:** `server/src/ws.ts`

`handleClientMessage(client, parsed, roomManager, db)`:

Switch on `parsed.type`:

| Client Message | Server Action |
|----------------|---------------|
| `"ping"` | Respond `{ type: "pong" }` |
| `"move"` | Update `client.x/y/action/facing`, broadcast `player_move` to room (exclude sender) |
| `"chat"` | Broadcast `player_chat` to room (include sender so they see it confirmed) |
| `"face"` | Broadcast `player_face` to room |
| `"attack"` | Broadcast `player_attack` to room |
| `"sit"` | Update `client.action`, broadcast `player_sit` to room |
| `"prone"` | Update `client.action`, broadcast `player_prone` to room |
| `"climb"` | Update `client.action`, broadcast `player_climb` to room |
| `"equip_change"` | Update `client.look.equipment`, broadcast `player_equip` to room |
| `"jump"` | Broadcast `player_jump` to room |
| `"enter_map"` | Call `changeRoom(client.id, msg.map_id)` — this handles leave/enter/map_state |
| `"leave_map"` | Remove from current room, set `client.mapId = ""` |
| `"level_up"` | Broadcast `player_level_up` to room; if level ≥ 10, also `global_level_up` to all |
| `"damage_taken"` | Broadcast `player_damage` to room |
| `"die"` | Broadcast `player_die` to room |
| `"respawn"` | Broadcast `player_respawn` to room |
| `"drop_item"` | Broadcast `drop_spawn` to room |
| `"loot_item"` | Broadcast `drop_loot` to room |

### 3.4 Wire WebSocket into Bun.serve

**File:** `server/src/server.ts`

1. Import `RoomManager`, `handleClientMessage` from `./ws.ts`.
2. Create `RoomManager` instance in `createServer()`.
3. Add `websocket` handler to `Bun.serve()`:

```ts
websocket: {
  open(ws) {
    // Wait for auth message
  },
  message(ws, raw) {
    const data = ws.data as WSClientData;
    let parsed;
    try { parsed = JSON.parse(String(raw)); } catch { return; }

    if (!data.authenticated) {
      // First message must be: { type: "auth", session_id: "..." }
      if (parsed.type !== "auth" || !parsed.session_id) {
        ws.close(4001, "First message must be auth");
        return;
      }
      const sessionId = parsed.session_id;
      const charData = loadCharacterData(db, sessionId);
      if (!charData) {
        ws.close(4002, "No character found");
        return;
      }
      const client: WSClient = {
        id: sessionId,
        name: charData.identity.name,
        mapId: charData.location.map_id,
        ws,
        x: 0, y: 0,
        action: "stand1",
        facing: -1,
        look: {
          face_id: charData.identity.face_id,
          hair_id: charData.identity.hair_id,
          skin: charData.identity.skin,
          equipment: charData.equipment,
        },
        lastActivityMs: Date.now(),
      };
      data.authenticated = true;
      data.client = client;
      roomManager.addClient(client);
      // Send map_state to the new client
      ws.send(JSON.stringify({
        type: "map_state",
        players: roomManager.getMapState(client.mapId)
          .filter(p => p.id !== sessionId),
      }));
      // Broadcast player_enter to the room (exclude self)
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_enter",
        id: client.id,
        name: client.name,
        look: client.look,
        x: client.x, y: client.y,
        action: client.action, facing: client.facing,
      }, client.id);
      return;
    }

    data.client.lastActivityMs = Date.now();
    handleClientMessage(data.client, parsed, roomManager, db);
  },
  close(ws) {
    const data = ws.data as WSClientData;
    if (data.client) {
      roomManager.removeClient(data.client.id);
    }
  },
},
```

4. In `fetch()`, handle WebSocket upgrade:
```ts
if (url.pathname === "/ws") {
  const upgraded = server.upgrade(request, {
    data: { authenticated: false, client: null },
  });
  if (upgraded) return undefined;
  return new Response("WebSocket upgrade failed", { status: 400 });
}
```

### 3.5 Map enter ACK protocol

When a client sends `enter_map`:
1. Server moves client to new room
2. Server sends `map_state` (all current players in that room) to the client
3. Server broadcasts `player_enter` to the room (excluding the joining client)

The client must:
1. Send `leave_map` → clear remote players
2. Load map assets locally
3. Send `enter_map` with new `map_id`
4. Wait for `map_state` response before rendering remote players

This is a "soft ACK" — the client proceeds once it receives `map_state`, confirming the server has placed them in the room.

### 3.6 Periodic player count broadcast

In `RoomManager` constructor or in `server.ts` after creating it:
```ts
setInterval(() => {
  roomManager.broadcastGlobal({
    type: "global_player_count",
    count: roomManager.getPlayerCount(),
  });
}, 10_000);
```

### 3.7 Add WebSocket tests

**File:** `server/src/ws.test.ts` (NEW)

1. Start server with test DB
2. Connect two WS clients, authenticate both
3. Both `enter_map` to same map
4. Client A sends `move` → Client B receives `player_move`
5. Client A sends `chat` → Client B receives `player_chat`
6. Client A's WS closes → Client B receives `player_leave`
7. Auth with no character → WS closed with 4002
8. Non-auth first message → WS closed with 4001
9. `bun run ci` — must pass

### 3.8 Update `.memory`

---

## Phase 4 — Client Multiplayer

Goal: Client connects to server, sends inputs, renders remote players with interpolation.

### 4.1 Create net.js module

**File:** `client/web/net.js` (NEW)

Exports/globals:
```js
let _ws = null;
let _wsConnected = false;
let _wsReconnectTimer = null;
const remotePlayers = new Map(); // sessionId → RemotePlayer

// Per-player equip WZ data (separate from local player's runtime.characterEquipData)
const remoteEquipData = new Map(); // sessionId → Map<itemId, wzJson>
```

### 4.2 Add RemotePlayer data structure

**File:** `client/web/net.js`

```js
function createRemotePlayer(id, name, look, x, y, action, facing) {
  return {
    id,
    name,
    // Position: server-authoritative with interpolation
    serverX: x, serverY: y,       // latest known server position
    renderX: x, renderY: y,       // interpolated render position
    prevX: x, prevY: y,           // previous render position (for Linear-style interp)
    // Animation: locally driven (C++ OtherChar parity)
    action,
    facing,
    frameIndex: 0,
    frameTimer: 0,
    // Movement queue (C++ OtherChar::movements queue parity)
    moveQueue: [],                // queued movements from server
    moveTimer: 0,                 // countdown to consume next queued movement
    // Appearance
    look,                         // { face_id, hair_id, skin, equipment: [...] }
    // Transient state
    chatBubble: null,
    chatBubbleExpires: 0,
    faceExpression: "default",
    attacking: false,
    attackStance: "",
    sitting: false,
    prone: false,
    climbing: false,
    climbAction: "",
    dead: false,
    levelUpEffect: 0,            // timestamp, render effect until expired
    nameLabel: null,              // cached Text rendering
  };
}
```

### 4.3 Add WebSocket connection manager

**File:** `client/web/net.js`

```js
function connectWebSocket() {
  if (!window.__MAPLE_ONLINE__) return;

  const wsUrl = window.__MAPLE_SERVER_URL__.replace(/^http/, "ws") + "/ws";
  _ws = new WebSocket(wsUrl);

  _ws.onopen = () => {
    // Send auth message (JSON with type field)
    _ws.send(JSON.stringify({ type: "auth", session_id: sessionId }));
    _wsConnected = true;
    // Start ping interval
    _wsPingInterval = setInterval(() => wsSend({ type: "ping" }), 10_000);
  };

  _ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch {}
  };

  _ws.onclose = () => {
    _wsConnected = false;
    clearInterval(_wsPingInterval);
    // Clear all remote players on disconnect
    remotePlayers.clear();
    remoteEquipData.clear();
    // Reconnect after 3s
    _wsReconnectTimer = setTimeout(connectWebSocket, 3000);
  };

  _ws.onerror = () => {}; // onclose will fire
}

function wsSend(msg) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}
```

### 4.4 Add `setPlayerAction(action)` wrapper

**File:** `client/web/app.js`

Currently `player.action` is assigned in ~15 places. Create a central setter:

```js
function setPlayerAction(newAction) {
  const prev = runtime.player.action;
  runtime.player.action = newAction;

  // Send WS state change if action category changed
  if (_wsConnected && prev !== newAction) {
    if (newAction === "sit" || prev === "sit") {
      wsSend({ type: "sit", active: newAction === "sit" });
    }
    if (newAction === "prone" || newAction === "proneStab" || prev === "prone" || prev === "proneStab") {
      wsSend({ type: "prone", active: newAction === "prone" || newAction === "proneStab" });
    }
  }
}
```

Replace all `runtime.player.action = "..."` / `player.action = "..."` assignments with `setPlayerAction("...")`.
Exception: assignments in `applyCharacterSave` and initial state reset (those aren't player inputs).

### 4.5 Wire input sends (client → server)

**File:** `client/web/app.js` / `client/web/net.js`

At each action point, add a `wsSend` call. These are the only places the client communicates with the server — it sends **inputs/events**, not authoritative state:

1. **Position (throttled):** In game loop update, after physics:
   ```js
   if (_wsConnected) {
     const now = performance.now();
     if (now - _lastPosSendTime >= 50) {  // 20 Hz
       wsSend({
         type: "move",
         x: Math.round(player.x),
         y: Math.round(player.y),
         action: player.action,
         facing: player.facing,
       });
       _lastPosSendTime = now;
     }
   }
   ```
   Note: no `frame` in move — remote clients run their own animation timers.

2. **Chat:** In `sendChatMessage()`, after setting bubbleText:
   `wsSend({ type: "chat", text: trimmed })`

3. **Face expression:** In face hotkey handler:
   `wsSend({ type: "face", expression: expressionName })`

4. **Attack:** When attack starts:
   `wsSend({ type: "attack", stance: player.attackStance })`

5. **Climb:** When `player.climbing` changes:
   `wsSend({ type: "climb", active: player.climbing, action: player.action })`

6. **Equip change:** At end of `equipItemFromInventory()` and `unequipItem()`:
   ```js
   wsSend({ type: "equip_change", equipment: [...playerEquipped.entries()].map(
     ([st, eq]) => ({ slot_type: st, item_id: eq.id })
   )});
   ```

7. **Drop item:** In `dropItemOnMap()`:
   `wsSend({ type: "drop_item", item_id: drop.id, x: drop.x, y: drop.destY })`

8. **Loot:** In `tryLootDrop()` on success:
   `wsSend({ type: "loot_item", drop_index: i })`

9. **Level up:** In the level-up block:
   `wsSend({ type: "level_up", level: runtime.player.level })`

10. **Jump:** When jump initiates (vy goes negative from ground state):
    `wsSend({ type: "jump" })`

11. **Map transition:** In `runPortalMapTransition()`:
    - Before `loadMap()`: `wsSend({ type: "leave_map" })`
    - After `loadMap()` completes: `wsSend({ type: "enter_map", map_id: runtime.mapId })`

12. **Damage / die / respawn:** At respective trigger points.

### 4.6 Handle server → client messages

**File:** `client/web/net.js`

```js
function handleServerMessage(msg) {
  switch (msg.type) {
    case "pong":
      break; // heartbeat acknowledged

    case "map_state":
      remotePlayers.clear();
      for (const p of msg.players) {
        const rp = createRemotePlayer(p.id, p.name, p.look, p.x, p.y, p.action, p.facing);
        remotePlayers.set(p.id, rp);
        loadRemotePlayerEquipData(rp);
      }
      break;

    case "player_enter":
      if (!remotePlayers.has(msg.id)) {
        const rp = createRemotePlayer(msg.id, msg.name, msg.look, msg.x, msg.y, msg.action, msg.facing);
        remotePlayers.set(msg.id, rp);
        loadRemotePlayerEquipData(rp);
      }
      break;

    case "player_leave":
      remotePlayers.delete(msg.id);
      remoteEquipData.delete(msg.id);
      break;

    case "player_move": {
      const rp = remotePlayers.get(msg.id);
      if (!rp) break;
      // Queue movement (C++ OtherChar::send_movement parity)
      rp.moveQueue.push({
        x: msg.x, y: msg.y,
        action: msg.action, facing: msg.facing,
      });
      if (rp.moveTimer === 0) rp.moveTimer = 3; // consume after ~3 ticks (50ms at 60fps)
      break;
    }

    case "player_chat": {
      const rp = remotePlayers.get(msg.id);
      if (rp) { rp.chatBubble = msg.text; rp.chatBubbleExpires = performance.now() + 8000; }
      break;
    }

    case "player_face": {
      const rp = remotePlayers.get(msg.id);
      if (rp) rp.faceExpression = msg.expression;
      break;
    }

    case "player_attack": {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.attacking = true;
        rp.attackStance = msg.stance;
        rp.action = msg.stance; // attack stance overrides action
        rp.frameIndex = 0;
        rp.frameTimer = 0;
      }
      break;
    }

    case "player_sit": {
      const rp = remotePlayers.get(msg.id);
      if (rp) { rp.sitting = msg.active; rp.action = msg.active ? "sit" : "stand1"; }
      break;
    }

    case "player_prone": {
      const rp = remotePlayers.get(msg.id);
      if (rp) { rp.prone = msg.active; rp.action = msg.active ? "prone" : "stand1"; }
      break;
    }

    case "player_climb": {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.climbing = msg.active;
        rp.climbAction = msg.action;
        rp.action = msg.active ? msg.action : "stand1";
      }
      break;
    }

    case "player_equip": {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.look.equipment = msg.equipment;
        loadRemotePlayerEquipData(rp); // re-fetch WZ data for new equipment
      }
      break;
    }

    case "player_jump": {
      const rp = remotePlayers.get(msg.id);
      if (rp) rp.action = "jump";
      break;
    }

    case "player_level_up": {
      const rp = remotePlayers.get(msg.id);
      if (rp) rp.levelUpEffect = performance.now() + 3000;
      break;
    }

    case "player_damage":
    case "player_die":
    case "player_respawn":
      // Update visual state on remote player
      break;

    case "global_level_up":
      addSystemChatMessage(`🎉 ${msg.name} has reached level ${msg.level}!`);
      break;

    case "global_announcement":
      addSystemChatMessage(`[Server] ${msg.text}`);
      break;

    case "global_player_count":
      // Optional: show in UI
      break;
  }
}
```

### 4.7 Remote player movement interpolation (C++ OtherChar parity)

**File:** `client/web/net.js`

Called once per game loop tick (~60 Hz):

```js
function updateRemotePlayers(dt) {
  for (const [id, rp] of remotePlayers) {
    // 1. Consume movement queue (C++ OtherChar::update timer logic)
    if (rp.moveTimer > 0) {
      rp.moveTimer--;
      if (rp.moveTimer === 0 || rp.moveTimer === 1) {
        if (rp.moveQueue.length > 0) {
          const move = rp.moveQueue.shift();
          rp.serverX = move.x;
          rp.serverY = move.y;
          if (!rp.attacking) {
            rp.action = move.action;
            rp.facing = move.facing;
          }
          // If more queued, set timer for next
          if (rp.moveQueue.length > 0) rp.moveTimer = 3;
        }
      }
    }

    // 2. Interpolate render position toward server position
    //    (C++ OtherChar: hspeed = lastmove.xpos - phobj.crnt_x(), then phobj.move())
    const dx = rp.serverX - rp.renderX;
    const dy = rp.serverY - rp.renderY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 300) {
      // Large error → snap (teleport/knockback)
      rp.prevX = rp.serverX;
      rp.prevY = rp.serverY;
      rp.renderX = rp.serverX;
      rp.renderY = rp.serverY;
    } else if (dist > 1) {
      // Small error → smooth lerp over ~100-200ms (6-12 frames at 60fps)
      const speed = Math.min(1.0, dist / 4); // faster when further away
      rp.prevX = rp.renderX;
      rp.prevY = rp.renderY;
      rp.renderX += dx * speed;
      rp.renderY += dy * speed;
    }

    // 3. Local animation timer (C++ CharLook::update parity)
    //    Frame advancement is LOCAL, not server-driven
    rp.frameTimer += dt;
    const frameDelay = getRemotePlayerFrameDelay(rp);
    if (rp.frameTimer >= frameDelay) {
      rp.frameTimer -= frameDelay;
      rp.frameIndex++;
      // Frame count depends on action — use WZ body frame count
      const maxFrames = getActionFrameCount(rp.action);
      if (rp.frameIndex >= maxFrames) {
        rp.frameIndex = 0;
        if (rp.attacking) {
          rp.attacking = false;
          rp.action = "stand1"; // return to idle after attack animation
        }
      }
    }
  }
}
```

`getRemotePlayerFrameDelay(rp)`:
- Walk: scale by abs(hspeed) like C++ `get_stancespeed` (`abs(phobj.hspeed)`)
- Stand/sit/prone: use WZ frame delay (~200ms)
- Attack: use WZ frame delay scaled by attack speed
- Climb: scale by abs(vspeed)

`getActionFrameCount(action)`:
- Read from body WZ data: count frames for the stance
- Fallback: 3 for walk, 1 for stand, 3 for attack stances

### 4.8 Load remote player equip WZ data

**File:** `client/web/net.js`

```js
async function loadRemotePlayerEquipData(rp) {
  const equipMap = new Map();
  for (const eq of rp.look.equipment) {
    const category = equipWzCategoryFromId(eq.item_id);
    if (!category) continue;
    const padded = String(eq.item_id).padStart(8, "0");
    const path = `/resources/Character.wz/${category}/${padded}.img.json`;
    try {
      const data = await fetchJson(path);
      equipMap.set(eq.item_id, data);
    } catch {}
  }
  remoteEquipData.set(rp.id, equipMap);
}
```

### 4.9 Remote player rendering

**File:** `client/web/app.js` (in rendering section)

1. In `drawMapLayersWithCharacter()`, after drawing the local player at its layer:
   ```js
   for (const [id, rp] of remotePlayers) {
     const rpLayer = rp.climbing ? 7 : (rp.action === "jump" ? 7 : 3); // simplified layer
     if (rpLayer !== currentLayer) continue;
     drawRemotePlayer(rp);
   }
   ```

2. `drawRemotePlayer(rp)`:
   - Use `composeCharacterPlacements()` but parameterized:
     - Pass `rp.action`, `rp.frameIndex`, `rp.facing`
     - For equipment: use `remoteEquipData.get(rp.id)` instead of `runtime.characterEquipData`
     - This requires making `getCharacterFrameData()` accept an optional equipData parameter
   - Draw at `(rp.renderX, rp.renderY)` using camera transform

3. `drawRemotePlayerNameLabel(rp)`:
   - Reuse name label drawing logic from `drawPlayerNameLabel()` but with `rp.name` and `(rp.renderX, rp.renderY)`

4. `drawRemotePlayerChatBubble(rp)`:
   - Reuse `drawChatBubble()` logic with `rp.chatBubble`, `rp.chatBubbleExpires`, `(rp.renderX, rp.renderY)`

### 4.10 Parameterize `getCharacterFrameData()`

**File:** `client/web/app.js`

Current signature: `getCharacterFrameData()` reads from global `playerEquipped` + `runtime.characterEquipData`.

New signature: `getCharacterFrameData(equipEntries, equipData)` where:
- `equipEntries`: iterable of `[slotType, { id }]` pairs (default: `playerEquipped.entries()`)
- `equipData`: object mapping equipId → WZ JSON (default: `runtime.characterEquipData`)

For local player: call with no args (uses defaults).
For remote player: call with `rp.look.equipment` converted to the same format, and `remoteEquipData.get(rp.id)`.

### 4.11 Clear remote players on map change

**File:** `client/web/app.js`

In `loadMap()`, at the start:
```js
remotePlayers.clear();
remoteEquipData.clear();
```

### 4.12 Call `updateRemotePlayers` in game loop

**File:** `client/web/app.js`

In the `update()` function, after local player physics:
```js
if (_wsConnected) {
  updateRemotePlayers(FIXED_STEP_MS / 1000);
}
```

### 4.13 Test multiplayer

- Start server: `bun run server`
- Start client: `bun run client:online`
- Open two browser tabs → both should see each other
- Tab A walks → Tab B sees smooth movement
- Tab A chats → Tab B sees chat bubble
- Tab A disconnects → Tab B sees player disappear
- Tab A reconnects → Tab B sees player reappear
- `bun run ci` — must pass

### 4.14 Update `.memory`

- Update `canvas-rendering.md` with remote player rendering pipeline
- Update `physics.md` with remote player interpolation model

---

## Phase 5 — V2 Resource Extraction

Goal: Extract only the needed assets for the 21 V2 maps into `resourcesv2/`.

Can run in parallel with Phases 1-4.

### 5.1 Create extraction script

**File:** `tools/build-assets/extract-v2-maps.mjs` (NEW)

```js
const V2_MAPS = [
  "100000001",
  "103000900","103000901","103000902","103000903","103000904","103000905","103000906","103000907","103000908",
  "105040310","105040311","105040312","105040313","105040314","105040315",
  "101000100","101000101",
  "280020000","280020001",
];
```

For each map:
1. Read `resources/Map.wz/Map/Map{first_digit}/{id}.img.json`
2. Copy to `resourcesv2/Map.wz/Map/Map{first_digit}/{id}.img.json`
3. Scan JSON to collect dependencies:
   - `info.bgm` → BGM path (`Bgm00/FloralLife` → `Sound.wz/Bgm00.img.json`)
   - `life[].id` with `type=m` → `Mob.wz/{padded8}.img.json`
   - `life[].id` with `type=n` → `Npc.wz/{padded7}.img.json`
   - layer `info.tS` → `Map.wz/Tile/{tS}.img.json`
   - layer objects `oS` → `Map.wz/Obj/{oS}.img.json`
   - `back[].bS` → `Map.wz/Back/{bS}.img.json`

### 5.2 Filter Sound.wz files (not whole-file copy)

For each BGM dependency (e.g., `Bgm00/FloralLife`):
1. Read `resources/Sound.wz/Bgm00.img.json`
2. Extract only the needed track entry (`FloralLife`)
3. Write to `resourcesv2/Sound.wz/Bgm00.img.json` — if file already exists (multiple tracks from same pack), merge entries

### 5.3 Copy String.wz files

Copy these whole (they're lookup tables, relatively small):
- `String.wz/Map.img.json`
- `String.wz/Mob.img.json`
- `String.wz/Npc.img.json`
- `String.wz/Eqp.img.json`
- `String.wz/Consume.img.json`
- `String.wz/Etc.img.json`

### 5.4 Copy shared assets

Copy whole files:
- `UI.wz/Basic.img.json` (cursor, UI elements)
- `Sound.wz/UI.img.json` (UI sounds)
- `Sound.wz/Game.img.json` (game sounds)
- `Effect.wz/BasicEff.img.json` (level-up effect)
- `Base.wz/zmap.img.json` (z-order)
- `Map.wz/MapHelper.img.json` (portal sprites)
- Character base files:
  - `Character.wz/00002000.img.json` (body)
  - `Character.wz/00012000.img.json` (head)
  - `Character.wz/Face/00020000.img.json`
  - `Character.wz/Hair/00030000.img.json`
  - `Character.wz/Coat/01040002.img.json`
  - `Character.wz/Pants/01060002.img.json`
  - `Character.wz/Shoes/01072001.img.json`
  - `Character.wz/Weapon/01302000.img.json`

### 5.5 Preserve existing resourcesv2 content

The script must NOT overwrite files in:
- `resourcesv2/mob/orange-mushroom/` (loading screen sprites)
- `resourcesv2/sound/login.mp3` (loading BGM)

These are manually curated files in a different path structure (lowercase, no `.wz` suffix).

### 5.6 Run extraction and verify

```bash
bun run tools/build-assets/extract-v2-maps.mjs
find resourcesv2 -name "*.json" | wc -l    # expect ~60-80 files
du -sh resourcesv2/                          # should be much smaller than resources/
```

### 5.7 Add V2 resource path routing to client

**File:** `client/web/app.js`

1. Add constant:
   ```js
   const V2_MAPS = new Set(["100000001","103000900","103000901",...]);
   ```
2. Add flag: `let useV2Resources = false`
   - Set `true` when `?v2=1` query param present or `window.__MAPLE_ONLINE__` is active
3. Modify `fetchJson(path)`:
   ```js
   async function fetchJson(path) {
     const resolvedPath = useV2Resources ? path.replace("/resources/", "/resourcesv2/") : path;
     // ... rest of existing fetchJson logic using resolvedPath
   }
   ```
4. This means `cachedFetch` will cache under `/resourcesv2/` URLs. The Cache API key remains `maple-resources-v1` — the different URL prefix naturally separates v1 and v2 cache entries.

### 5.8 Test V2 resources

- `bun run client:offline` with `?v2=1&mapId=103000900`
- Verify all 21 V2 maps load without missing-asset errors
- Verify non-V2 maps still work without `?v2=1`
- `bun run ci` — must pass

### 5.9 Update `.memory`

- Update `client-server.md` V2 section with actual file counts
- Update `canvas-rendering.md` if resource path logic changed
- Update `sync-status.md`

---

## Phase Summary

| Phase | Deliverable | Depends On | Key Files |
|-------|-------------|------------|-----------|
| **1** | Offline persistence + name picker | — | `save.js`, `ui-character-create.js`, `app.js` |
| **2** | Server REST persistence | Phase 1 | `server/src/db.ts`, `character-api.ts`, `server.ts` |
| **3** | WebSocket server + rooms | Phase 2 | `server/src/ws.ts`, `server.ts` |
| **4** | Client multiplayer rendering | Phase 3 | `net.js`, `app.js` |
| **5** | V2 resource extraction | — (parallel) | `tools/build-assets/extract-v2-maps.mjs` |

---

## Verification Checklist (after each phase)

- [ ] `bun run ci` passes
- [ ] `bun run client:offline` works (no regressions)
- [ ] `.memory/` files updated
- [ ] No hardcoded secrets in committed code
- [ ] Error handling: network failures gracefully degrade
- [ ] Server endpoints return proper HTTP status codes + JSON error bodies
- [ ] WebSocket disconnects don't crash server or client
