# Shared Schema — Wire Protocol & Data Structures

> Source of truth for all messages between client and server.
> Both `client/web/net.js` and `server/src/ws.ts` must conform to these shapes.
> Any field change here must be reflected in both codebases.

---

## CharacterSave (REST persistence)

Used by `POST /api/character/save`, `GET /api/character/load`, and localStorage.

```json
{
  "identity": {
    "name": "string (1-12 chars, alphanumeric + spaces, no leading/trailing spaces)",
    "gender": "boolean (false=male, true=female)",
    "skin": "number (0-11)",
    "face_id": "number (e.g. 20000)",
    "hair_id": "number (e.g. 30000)"
  },
  "stats": {
    "level": "number (1-200)",
    "job": "string (e.g. 'Beginner')",
    "exp": "number (≥0)",
    "max_exp": "number (>0)",
    "hp": "number (≥0)",
    "max_hp": "number (>0)",
    "mp": "number (≥0)",
    "max_mp": "number (>0)",
    "speed": "number (100 default)",
    "jump": "number (100 default)",
    "meso": "number (≥0)"
  },
  "location": {
    "map_id": "string (e.g. '100000001')",
    "spawn_portal": "string | null (portal name, not index)",
    "facing": "number (-1=left, 1=right)"
  },
  "equipment": [
    { "slot_type": "string (Cap|Coat|Pants|Shoes|Weapon|...)", "item_id": "number", "item_name": "string" }
  ],
  "inventory": [
    { "item_id": "number", "qty": "number", "inv_type": "string (EQUIP|USE|SETUP|ETC|CASH)", "slot": "number (0-31)", "category": "string | null" }
  ],
  "achievements": {
    "mobs_killed": "number",
    "maps_visited": ["string"],
    "portals_used": "number",
    "items_looted": "number",
    "max_level_reached": "number",
    "total_damage_dealt": "number",
    "deaths": "number",
    "play_time_ms": "number"
  },
  "version": 1,
  "saved_at": "ISO 8601 string"
}
```

### Defaults (new character)

```json
{
  "identity": { "name": "<user-chosen>", "gender": false, "skin": 0, "face_id": 20000, "hair_id": 30000 },
  "stats": { "level": 1, "job": "Beginner", "exp": 0, "max_exp": 15, "hp": 50, "max_hp": 50, "mp": 5, "max_mp": 5, "speed": 100, "jump": 100, "meso": 0 },
  "location": { "map_id": "100000001", "spawn_portal": null, "facing": -1 },
  "equipment": [
    { "slot_type": "Coat", "item_id": 1040002, "item_name": "" },
    { "slot_type": "Pants", "item_id": 1060002, "item_name": "" },
    { "slot_type": "Shoes", "item_id": 1072001, "item_name": "" },
    { "slot_type": "Weapon", "item_id": 1302000, "item_name": "" }
  ],
  "inventory": [
    { "item_id": 2000000, "qty": 30, "inv_type": "USE", "slot": 0, "category": null },
    { "item_id": 2000001, "qty": 15, "inv_type": "USE", "slot": 1, "category": null },
    { "item_id": 2000002, "qty": 5,  "inv_type": "USE", "slot": 2, "category": null },
    { "item_id": 2010000, "qty": 10, "inv_type": "USE", "slot": 3, "category": null },
    { "item_id": 4000000, "qty": 8,  "inv_type": "ETC", "slot": 0, "category": null },
    { "item_id": 4000001, "qty": 3,  "inv_type": "ETC", "slot": 1, "category": null }
  ],
  "achievements": { "mobs_killed": 0, "maps_visited": [], "portals_used": 0, "items_looted": 0, "max_level_reached": 1, "total_damage_dealt": 0, "deaths": 0, "play_time_ms": 0 },
  "version": 1
}
```

---

## REST API

### `POST /api/character/create`
- **Header:** `Authorization: Bearer <session_id>`
- **Body:** `{ "name": "string", "gender": boolean }`
- **201:** `{ "ok": true, "data": <CharacterSave> }`
- **409:** `{ "ok": false, "error": { "code": "NAME_TAKEN", "message": "..." } }`
- **401:** Missing/invalid Authorization header

### `GET /api/character/load`
- **Header:** `Authorization: Bearer <session_id>`
- **200:** `{ "ok": true, "data": <CharacterSave> }`
- **404:** No character for this session

### `POST /api/character/save`
- **Header:** `Authorization: Bearer <session_id>`
- **Body:** `<CharacterSave>`
- **200:** `{ "ok": true }`

### `POST /api/character/name`
- **Header:** `Authorization: Bearer <session_id>`
- **Body:** `{ "name": "string" }`
- **200:** `{ "ok": true }`
- **409:** `{ "ok": false, "error": { "code": "NAME_TAKEN" } }`

---

## WebSocket Protocol

### Connection Flow

1. Client opens `ws://<server>/ws`
2. Client sends auth message (must be first message):
   ```json
   { "type": "auth", "session_id": "<uuid>" }
   ```
3. Server validates session, loads character from DB
4. If no character → close with code `4002`
5. If valid → server adds client to map room, sends `map_state`, broadcasts `player_enter`
6. Subsequent messages are game messages (see below)

### PlayerLook (sub-object used in several messages)

```json
{
  "face_id": 20000,
  "hair_id": 30000,
  "skin": 0,
  "equipment": [
    { "slot_type": "Coat", "item_id": 1040002 },
    { "slot_type": "Weapon", "item_id": 1302000 }
  ]
}
```

---

## Client → Server Messages

Every message has a `type` string field.

### `move` — Position update (sent at 20 Hz while client is active)
```json
{ "type": "move", "x": 1234, "y": 567, "action": "walk1", "facing": -1 }
```
- `x`, `y`: integer world coordinates
- `action`: current stance string (stand1, walk1, jump, prone, sit, ladder, rope, etc.)
- `facing`: -1 (left) or 1 (right)
- Note: no `frame` — remote clients run local animation timers

### `chat` — Chat message
```json
{ "type": "chat", "text": "Hello!" }
```

### `face` — Face expression change
```json
{ "type": "face", "expression": "smile" }
```

### `attack` — Attack started
```json
{ "type": "attack", "stance": "swingO1" }
```

### `sit` — Sit state changed
```json
{ "type": "sit", "active": true }
```

### `prone` — Prone state changed
```json
{ "type": "prone", "active": true }
```

### `climb` — Climb state changed
```json
{ "type": "climb", "active": true, "action": "ladder" }
```

### `equip_change` — Equipment changed
```json
{ "type": "equip_change", "equipment": [{ "slot_type": "Weapon", "item_id": 1302000 }] }
```

### `jump` — Jump started
```json
{ "type": "jump" }
```

### `enter_map` — Client loaded into new map
```json
{ "type": "enter_map", "map_id": "103000900" }
```

### `leave_map` — Client leaving current map
```json
{ "type": "leave_map" }
```

### `level_up` — Level increased
```json
{ "type": "level_up", "level": 10 }
```

### `damage_taken` — Player took damage
```json
{ "type": "damage_taken", "damage": 25, "direction": 1 }
```

### `die` — Player died
```json
{ "type": "die" }
```

### `respawn` — Player respawned
```json
{ "type": "respawn" }
```

### `drop_item` — Item dropped on map
```json
{ "type": "drop_item", "item_id": 2000000, "x": 100, "y": 200 }
```

### `loot_item` — Item looted from map
```json
{ "type": "loot_item", "drop_index": 3 }
```

### `ping` — Heartbeat
```json
{ "type": "ping" }
```

---

## Server → Client Messages

Every message has a `type` string field.

### Map-Scoped (sent only to players in the same map)

### `map_state` — Full snapshot of all players in the map (sent on join)
```json
{
  "type": "map_state",
  "players": [
    {
      "id": "abc-session-id",
      "name": "Player1",
      "x": 100, "y": 200,
      "action": "stand1",
      "facing": -1,
      "look": { "face_id": 20000, "hair_id": 30000, "skin": 0, "equipment": [...] }
    }
  ]
}
```

### `player_enter` — New player joined the map
```json
{
  "type": "player_enter",
  "id": "abc", "name": "Player1",
  "x": 100, "y": 200,
  "action": "stand1", "facing": -1,
  "look": { ... }
}
```

### `player_leave` — Player left the map
```json
{ "type": "player_leave", "id": "abc" }
```

### `player_move` — Player position update
```json
{ "type": "player_move", "id": "abc", "x": 1234, "y": 567, "action": "walk1", "facing": -1 }
```

### `player_chat` — Player chat message
```json
{ "type": "player_chat", "id": "abc", "name": "Player1", "text": "Hello!" }
```

### `player_face` — Player face expression
```json
{ "type": "player_face", "id": "abc", "expression": "smile" }
```

### `player_attack` — Player started attack
```json
{ "type": "player_attack", "id": "abc", "stance": "swingO1" }
```

### `player_sit` — Player sit state
```json
{ "type": "player_sit", "id": "abc", "active": true }
```

### `player_prone` — Player prone state
```json
{ "type": "player_prone", "id": "abc", "active": true }
```

### `player_climb` — Player climb state
```json
{ "type": "player_climb", "id": "abc", "active": true, "action": "ladder" }
```

### `player_equip` — Player equipment changed
```json
{ "type": "player_equip", "id": "abc", "equipment": [{ "slot_type": "Weapon", "item_id": 1302000 }] }
```

### `player_jump` — Player jumped
```json
{ "type": "player_jump", "id": "abc" }
```

### `player_level_up` — Player leveled up (map-scoped)
```json
{ "type": "player_level_up", "id": "abc", "level": 10 }
```

### `player_damage` — Player took damage
```json
{ "type": "player_damage", "id": "abc", "damage": 25, "direction": 1 }
```

### `player_die` — Player died
```json
{ "type": "player_die", "id": "abc" }
```

### `player_respawn` — Player respawned
```json
{ "type": "player_respawn", "id": "abc" }
```

### `drop_spawn` — Item dropped on map
```json
{ "type": "drop_spawn", "drop": { "index": 5, "item_id": 2000000, "x": 100, "destY": 200, "owner_id": "abc" } }
```

### `drop_loot` — Item looted from map
```json
{ "type": "drop_loot", "drop_index": 5, "looter_id": "abc" }
```

### Global (sent to ALL connected players)

### `global_level_up` — Celebration broadcast (level ≥ 10)
```json
{ "type": "global_level_up", "name": "Player1", "level": 30 }
```

### `global_achievement` — Achievement broadcast
```json
{ "type": "global_achievement", "name": "Player1", "achievement": "First Boss Kill" }
```

### `global_announcement` — Server message
```json
{ "type": "global_announcement", "text": "Server maintenance in 10 minutes" }
```

### `global_player_count` — Periodic player count (every 10s)
```json
{ "type": "global_player_count", "count": 42 }
```

### `pong` — Heartbeat response
```json
{ "type": "pong" }
```

---

## Server Room Model

```
rooms: Map<mapId, Map<sessionId, WSClient>>
allClients: Map<sessionId, WSClient>
```

### Room transitions:
1. `enter_map(map_id)`:
   - Remove client from old room → broadcast `player_leave` to old room
   - Add client to new room
   - Send `map_state` to the joining client (all current players, excluding self)
   - Broadcast `player_enter` to new room (excluding self)

2. `leave_map`:
   - Remove from current room → broadcast `player_leave`
   - Client `mapId` set to `""` (in limbo during map load)

3. Disconnect:
   - Remove from room → broadcast `player_leave`
   - Remove from `allClients`

### Broadcast rules:
- `move` relayed to room, **excluding sender**
- `chat` relayed to room, **including sender** (confirmation)
- All other map-scoped messages relayed to room, **excluding sender**
- Global messages sent to ALL `allClients`

---

## C++ Reference: OtherChar Movement Model

From `MapleStory-Client/Character/OtherChar.cpp`:

```cpp
// Movement queue with timer-based consumption
void OtherChar::send_movement(const vector<Movement>& newmoves) {
    movements.push(newmoves.back());
    if (timer == 0) {
        constexpr uint16_t DELAY = 50;
        timer = DELAY;
    }
}

int8_t OtherChar::update(const Physics& physics) {
    if (timer > 1) timer--;
    else if (timer == 1) {
        if (!movements.empty()) {
            lastmove = movements.front();
            movements.pop();
        } else timer = 0;
    }

    if (!attacking) set_state(lastmove.newstate);

    // Move toward target position (delta = speed)
    phobj.hspeed = lastmove.xpos - phobj.crnt_x();
    phobj.vspeed = lastmove.ypos - phobj.crnt_y();
    phobj.move();

    // ... animation update local
    bool aniend = Char::update(physics, get_stancespeed());
    if (aniend && attacking) attacking = false;
}
```

Key behaviors to replicate:
- **Movement queue** with timer-based consumption (not instant apply)
- **Position = delta per tick** (hspeed = target - current), not lerp
- **Animation is fully local** — uses stance speed (walk=hspeed, climb=vspeed, else 1.0)
- **Attack overrides stance** until animation ends
- **Linear interpolation for rendering** (before/now with alpha)

---

## Correction Thresholds

| Error Distance | Strategy | Duration |
|----------------|----------|----------|
| < 2 px | No correction (within rounding) | — |
| 2-300 px | Smooth lerp toward server position | 100-300 ms |
| > 300 px | Instant snap (teleport/knockback/portal) | 0 ms |
