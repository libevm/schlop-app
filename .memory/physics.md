# Physics System

> All physics in `client/web/app.js`. C++ reference: `MapleStory-Client/Gameplay/Physics/`.

## C++ Reference Architecture

The C++ client has a unified physics engine (`Physics.cpp`) operating on `PhysicsObject` structs.
Every entity (player, mobs, NPCs, drops) uses the same `move_object(phobj)` pipeline:

```
move_object(phobj):
  1. fht.update_fh(phobj)      ← track current foothold
  2. move_normal/flying/swimming ← apply forces based on terrain type
  3. fht.limit_movement(phobj)  ← wall/edge collision
  4. phobj.move()               ← x += hspeed, y += vspeed
```

### C++ Constants (per-tick, TIMESTEP = 8ms → 125 TPS)
| Constant       | Value  | Description |
|----------------|--------|-------------|
| GRAVFORCE      | 0.14   | Normal gravity per tick |
| SWIMGRAVFORCE  | 0.03   | Water gravity per tick |
| FRICTION       | 0.5    | Ground friction |
| SLOPEFACTOR    | 0.1    | Slope influence on friction |
| GROUNDSLIP     | 3.0    | Inertia divisor for ground movement |
| FLYFRICTION    | 0.05   | Air friction for flying mobs |
| SWIMFRICTION   | 0.08   | Water friction |

### C++ PhysicsObject Fields
```
x, y            — position (Linear<double> for interpolation)
hspeed, vspeed  — velocity per tick
hforce, vforce  — external force (cleared after each tick)
hacc, vacc      — acceleration (computed each tick)
fhid            — current foothold ID
fhslope         — slope of current foothold (dy/dx)
fhlayer         — layer of current foothold
onground        — whether touching a foothold
type            — NORMAL | ICE | SWIMMING | FLYING | FIXATED
flags           — NOGRAVITY | TURNATEDGES | CHECKBELOW
```

## Web Client: Player Physics

### Constants (per-tick, TPS = 125 to match C++)
```js
PHYS_TPS = 125              // ticks per second
PHYS_GRAVFORCE = 0.14       // gravity per tick
PHYS_FRICTION = 0.5         // ground friction
PHYS_SLOPEFACTOR = 0.1      // slope friction influence
PHYS_GROUNDSLIP = 3.0       // inertia divisor
PHYS_FALL_BRAKE = 0.025     // air control deceleration
PHYS_HSPEED_DEADZONE = 0.1  // below this → zero speed
PHYS_FALL_SPEED_CAP = 670   // max fall speed (px/s)
PHYS_MAX_LAND_SPEED = 162.5 // max speed retained on landing
PHYS_ROPE_JUMP_HMULT = 6.0  // rope jump horizontal multiplier
PHYS_ROPE_JUMP_VDIV = 1.5   // rope jump vertical divisor
PHYS_CLIMB_ACTION_DELAY_MS = 200
```

### Swimming Constants
```js
PHYS_SWIMGRAVFORCE = 0.07   // water gravity (higher than C++ for feel)
PHYS_SWIMFRICTION = 0.08    // vertical water friction
PHYS_SWIM_HFRICTION = 0.14  // horizontal water friction (sluggish)
PHYS_FLYFORCE = 0.25        // up/down swim force
PHYS_SWIM_HFORCE = 0.12     // left/right swim force
PHYS_SWIM_JUMP_MULT = 0.8   // swim jump = 80% of normal jump
```

### Player Stats → Force Conversion
```js
playerWalkforce()  = 0.05 + 0.11 * speed / 100   // per-tick horizontal force
playerJumpforce()  = 1.0 + 3.5 * jump / 100       // initial jump velocity
playerClimbforce() = speed / 100                    // climb speed
```
Default stats: `speed = 115`, `jump = 110`.

### updatePlayer(dt) Flow

`dt` now comes from a fixed-step game loop (`1/60s` per simulation step, RAF-rendered),
with bounded catch-up steps to avoid spiral-of-death.

```
1. MouseFly mode → snap to mouse, skip physics
2. Input processing → move direction, climb direction, jump queue
3. Climb attach check → findAttachableRope()
4. If climbing:
   a. Side-jump detection (jump + move while on rope)
   b. Vertical movement along rope (climbforce * dt)
   c. Fall-off detection → ladderFellOff()
   d. Top-exit → snap to foothold above rope top
5. If not climbing:
   a. numTicks = dt * PHYS_TPS
   b. Find current foothold (by ID or findFootholdBelow)
   c. Calculate slope
   d. ON GROUND:
      - applyGroundPhysics(hspeed, hforce, slope, ticks)
      - Jump check → normal jump or down-jump
   e. AIRBORNE:
      - Swimming: per-tick SWIMGRAVFORCE + directional forces + friction
      - Normal: GRAVFORCE + air brake
   f. Position integration:
      - Ground: resolveFootholdForX() follows prev/next chains
      - Air: findGroundLanding() ray-segment intersection
```

### Map Trap Collision + Knockback (Spikeball / Obj trap)

Implemented in `client/web/app.js` as a fixed-step post-physics pass:

- Update order now includes `updateTrapHazardCollisions()` after object animation advancement
  (`updateObjectAnimations`) and before camera update.
- Hazard metadata source: object WZ nodes (`Obj/*.img`) parsed via `loadObjectMeta` / `loadAnimatedObjectFrames`:
  - `obstacle`, `damage`, `dir` from object node leaf record
  - `lt`/`rb` hitbox vectors from canvas vectors
  - motion fields (`moveType`, `moveW`, `moveH`, `moveP`, `moveR`) already used for moving traps
- Map-load indexing: `buildMapTrapHazardIndex(map)` builds `map.trapHazards` from object metas where
  `obstacle != 0 && damage > 0`.

Per-step collision model:

- Player sweep bounds use previous and current player positions:
  - `prevX/prevY` captured at start of `updatePlayer(dt)`
  - touch rect is stance-aware via `playerTouchBoxMetrics(player)`:
    - standing/default: `x ± 12`, `y - 50 .. y`
    - prone/sit on-ground: `x ± 18`, `y - 28 .. y`
- Trap bounds use object-space hitbox vectors and current motion offset:
  - world rect from `obj.x/obj.y + lt/rb + objectMoveOffset(...)`
  - applies horizontal mirroring when map object `f` (flip) is set (uses mirrored `lt/rb` offsets)
  - falls back to sprite rect if `lt/rb` missing (with flip-aware origin handling)
- First overlap applies `applyTrapHit(...)`:
  - HP reduced by trap `damage` (min 1)
  - floating damage number spawned above player
  - knockback (when not climbing):
    - `vx = ±(1.5 * PHYS_TPS)`
    - `vy = -(3.5 * PHYS_TPS)`
  - player leaves ground (`onGround=false`, foothold cleared)
  - invulnerability window: `TRAP_HIT_INVINCIBILITY_MS = 2000`
  - climb lock: `knockbackClimbLockUntil = nowMs + 600` (prevents rope/ladder grab for 600ms)
  - animated traps below 10% opacity (`< 26/255`) skip collision entirely
  - frames without `lt`/`rb` fall back to sprite dimensions (≤4px frames return null)

C++ parity references used for behavior shape:
- `Stage.cpp` touch-damage flow (`player.damage(...)`)
- `MapMobs.cpp::find_colliding` player sweep-rect concept
- `Player.cpp::damage` knockback values (`hspeed ±1.5`, `vforce -= 3.5`)
- `Char.cpp::show_damage` invincible timing (`2000ms`)

Prone-hitbox investigation snapshot (2026-02-19):
- C++ `MapMobs.cpp::find_colliding` uses a fixed player sweep height (`vertical.smaller() - 50 .. vertical.greater()`).
- Half-web TS reference (`MapleCharacter.ts`) derives collision rectangles from rendered body parts (`bodyRects`),
  which naturally changes with stance (including prone).
- Web debug client now follows a lightweight stance-aware touch box model for prone parity while keeping
  fixed-step sweep behavior (`prev`/`current` interpolation).

### Mob touch damage (player collision with mobs)

Implemented as `updateMobTouchCollisions()` in fixed-step update:
- called after `updateLifeAnimations()` so mob physics positions are current for this step
- reuses player sweep touch bounds (`prevX/prevY` + current position)
- checks overlap against current mob frame bounds (origin/width/height + facing-aware flip bounds)
- only applies to mobs with `bodyAttack == 1` (parsed as `touchDamageEnabled` from mob `info`)
- touch damage uses mob `PADamage` (parsed as `touchAttack`, min 1)
- on hit, shares the same player-hit path used by trap damage:
  - HP reduction
  - damage number
  - knockback impulse
  - pain/hit face reaction + full-character blink
  - 2s invulnerability window to prevent re-hit spam

### Ground Physics (applyGroundPhysics)

Matches C++ `move_normal` when on ground:
```js
if (no force && |hspeed| < deadzone) → hspeed = 0
else:
  inertia = hspeed / GROUNDSLIP
  slopef = clamp(slope, -0.5, 0.5)
  hacc -= (FRICTION + SLOPEFACTOR * (1 + slopef * -inertia)) * inertia
  hspeed += hacc * numTicks
```

### Landing (findGroundLanding)

Uses **ray-segment intersection** between movement vector `(oldPos → newPos)` and each foothold line segment. Finds the earliest collision (smallest `t` parameter). On landing:
- Projects velocity onto foothold direction (preserves momentum along slope)
- Caps at `PHYS_MAX_LAND_SPEED`
- Sets `onGround = true`, assigns foothold ID and layer

### Foothold Chain Resolution (resolveFootholdForX)

When walking on ground, if X moves past current foothold's edge:
- Follow `nextId` (rightward) or `prevId` (leftward)
- Up to 8 chain steps
- Stop at walls (vertical footholds) or null links → go airborne

### Wall Collision (resolveWallCollision / getWallX)

Matches C++ `FootholdTree::get_wall()`:
- Check 2 footholds deep (current → prev/next → prev.prev/next.next)
- A foothold is "blocking" if it's a wall (vertical) AND overlaps the vertical range `[y-50, y-1]`
- Returns the X limit where movement is clamped
- Airborne no-foothold fallback: if no current/below foothold is found, `resolveWallCollision`
  clamps against side wall bounds.
- Simplified wall handling:
  - introduced `sideWallBounds(map)` + `clampXToSideWalls(x, map)`
  - side clamp now prefers C++-style inset map walls (`map.walls.left/right`) and only falls back
    to foothold extrema (`map.footholdBounds.minX/maxX`) when needed.
  - this prevents airborne/jump-through escapes that can happen if raw foothold extrema are used first.
- `resolveWallCollision(...)` now follows C++ `FootholdTree::get_wall` style directly:
  - keeps foothold-chain wall crossing logic (`getWallX`) when foothold context exists
  - uses side-wall fallback only when foothold context is missing
  - no global wall-line intersection fallback (to avoid over-blocking on local short vertical walls)
  - final clamp uses `clampXToSideWalls` (C++-style map wall bounds).
- `getWallX` uses two-tier wall collision:
  - **Standard path** (C++ parity): check prev/prevprev or next/nextnext with `[nextY-50, nextY-1]`
    blocking window. Interior walls (< 500px total height) use this path only — passable at jump height.
  - **Tall wall extension**: when a chain-discovered wall is part of a `wallColumnsByX`-indexed column
    (>= 500px total height), check ALL segments in the column. Prevents jumping through boundary walls.
  - `wallColumnsByX` is built at map parse time; short columns are pruned immediately.
  - Map hard boundary enforced by `clampXToSideWalls`.
- Side clamp helper:
  - `clampXToSideWalls(...)` hard clamp to map side walls (`map.walls`, fallback `footholdBounds`).
- Post-physics and hit-time safety:
  - after movement integration, player X is clamped with `clampXToSideWalls` and outward velocity is reset
  - `applyPlayerTouchHit(...)` also clamps X immediately after knockback application.

### Fall Damage

Implemented client-side (server-side in original MapleStory):

```js
FALL_DAMAGE_THRESHOLD = 500   // pixels before damage kicks in
FALL_DAMAGE_PERCENT = 0.1     // 10% maxHP per threshold exceeded
```

- Tracks `player.fallStartY` — set to `min(fallStartY, player.y)` each tick while airborne
  (captures highest point, i.e. lowest Y value, during the fall)
- Reset on: spawn, teleport, map load, landing
- On landing: `fallDist = player.y - player.fallStartY`
  - If `fallDist > FALL_DAMAGE_THRESHOLD`:
    - `ticks = floor((fallDist - 500) / 500) + 1`
    - `damage = max(1, round(maxHp * 0.1 * ticks))`
    - HP floored at 1 (can't kill)
  - Applies knockback bounce:
    - `vx = facing * TRAP_KNOCKBACK_HSPEED * 0.5` (half horizontal)
    - `vy = -TRAP_KNOCKBACK_VSPEED * 0.6` (60% vertical bounce)
  - Sets `onGround = false`, clears foothold
  - Applies 600ms climb lock + full invincibility window
  - Triggers hit visuals (blink + damage number)

### Down-Jump

- Requires: on ground + down input + jump input
- Checks `findFootholdBelow(x, groundY + 1)` for platform below
- Must be within 600px vertical distance
- Sets `downJumpIgnoreFootholdId` to skip current platform during fall
- `downJumpControlLock = true` → prevents horizontal input briefly
- Reduced jump force: `0.35 * normal`

### Rope / Ladder Climbing

- `findAttachableRope(map, x, y, upwards)` — finds closest rope within tolerance
- `climbSnapX(rope)` — snaps player X to `rope.x - 1`
- Climb speed: `playerClimbforce() * PHYS_TPS * dt`
- Fall-off: `ladderFellOff()` checks if Y is beyond rope bounds
- Top exit: snap to foothold near rope top via `findFootholdAtXNearY()`
- Reattach lock: 200ms cooldown after leaving a rope (prevents re-grab)
- Climb cooldown: 1000ms after rope jump

## Web Client: Mob Physics

### Constants (per-tick, ~30 FPS fixed timestep)
```js
MOB_GRAVFORCE = 0.14         // same as player
MOB_SWIMGRAVFORCE = 0.03     // water gravity
MOB_FRICTION = 0.5
MOB_SLOPEFACTOR = 0.1
MOB_GROUNDSLIP = 3.0
MOB_SWIMFRICTION = 0.08
MOB_PHYS_TIMESTEP = 1000/30  // ~33ms per step
```

### Mob Speed from WZ Data

C++ formula: `speed = (info.speed + 100) * 0.001`
- `info.speed` from `Mob.wz/{id}.img/info/speed` (typically negative, e.g., -30)
- Result is force-per-tick applied as `phobj.hforce` during MOVE stance
- Stored in `lifeAnimations` cache as `speed` property

### Mob PhysicsObject (per mob instance)
```js
{
  x, y,           // position
  hspeed, vspeed,  // velocity per tick
  hforce, vforce,  // applied force (cleared each tick)
  fhId,           // current foothold ID
  fhSlope,        // slope of current foothold
  onGround,       // whether on a foothold
  turnAtEdges,    // TURNATEDGES flag
}
```

### mobPhysicsStep(map, phobj, isSwimMap)

```
1. FORCES:
   - On ground: friction + slope (same formula as player)
   - Airborne normal: GRAVFORCE
   - Airborne swim: SWIMGRAVFORCE + SWIMFRICTION
   - hspeed += hacc, vspeed += vacc
   - Clear hforce/vforce

2. HORIZONTAL MOVEMENT (ground only):
   - Wall check: fhWall() — 2-link lookahead for blocking walls
   - Edge check: fhEdge() — 2-link lookahead for TURNATEDGES
   - On collision: clamp X, zero hspeed, clear turnAtEdges flag

3. VERTICAL MOVEMENT + LANDING:
   - Move Y by vspeed
   - If falling (vspeed >= 0, !onGround):
     - fhIdBelow() finds closest foothold below previous Y
     - If mob crossed through foothold this tick → land on it
     - Set onGround, update fhId/fhSlope

4. FOOTHOLD TRACKING (ground):
   - Follow prev/next chain when X exceeds current foothold bounds
   - Snap Y to current foothold ground
   - If X is off-foothold → go airborne
```

### Mob AI (Behavior State Machine)

```
States: "stand" | "move" | "hit" (stagger) | "aggro" (chase) | "die" | "dead"
Timers: MOB_STAND_MIN/MAX_MS (1500–4000), MOB_MOVE_MIN/MAX_MS (2000–5000)

Patrol (normal behavior):
  On timer expiry:
    stand → move: pick random facing, set hforce
    move → stand: stop force
  During "move":
    phobj.hforce = facing * mobSpeed
    Patrol bounds (rx0/rx1): reverse on boundary hit

Combat state machine (triggered by player attack):
  1. HIT (stagger): mob freezes in hit1 animation for MOB_HIT_DURATION_MS (500ms)
     - Knockback: linear velocity decay (MOB_KB_SPEED=150 px/sec → 0)
     - Direction: away from player
     - Physics bypassed — direct velocity assignment
  2. AGGRO (chase): lasts MOB_AGGRO_DURATION_MS (4000ms) after stagger ends
     - Mob chases player, orbits within ±60px
     - Uses mob speed for hforce toward player
     - Reverses when overshooting player position
  3. Return to PATROL: after aggro timer expires

Death:
  - die1 stance plays, mob fades out over 800ms
  - Marked dead, respawns after MOB_RESPAWN_DELAY_MS (8000ms)
  - Respawn restores full HP and original spawn position

TURNATEDGES:
  When edge collision clears the flag → AI reverses facing, re-sets flag
```

### Combat Constants
```js
ATTACK_COOLDOWN_MS = 600           // player attack cooldown
ATTACK_RANGE_X = 120               // horizontal attack range
ATTACK_RANGE_Y = 50                // vertical attack range
MOB_HIT_DURATION_MS = 500          // stagger freeze duration
MOB_AGGRO_DURATION_MS = 4000       // chase duration after stagger
MOB_KB_SPEED = 150                 // initial knockback speed (px/sec)
MOB_RESPAWN_DELAY_MS = 8000        // respawn timer after death
MOB_HP_BAR_WIDTH = 60              // HP bar pixel width
MOB_HP_BAR_HEIGHT = 5              // HP bar pixel height
```

### Mob/NPC Spawn

- Position from `life.x`, `life.cy` (map data)
- If `life.fh` (foothold ID) exists: look up foothold, snap Y to `fhGroundAt(fh, life.x)`,
  start `onGround = true` — matches C++ default `onground = true` with immediate `update_fh` snap
- Fallback: `findFootholdAtXNearY(map, life.x, life.cy, 60)` within 60px tolerance
- Only if no valid foothold found: start at `life.cy` with `onGround = false`, gravity pulls down
- Non-moving mobs/NPCs also get gravity each frame until landed (for the no-foothold case)

### Mob Foothold Helpers (separate from player helpers)

| Function          | Description |
|-------------------|-------------|
| `fhGroundAt(fh, x)` | Y on foothold at X, null if outside range or wall |
| `fhSlope(fh)`     | dy/dx of foothold |
| `fhIdBelow(map, x, y)` | Find closest foothold at or below y (linear scan) |
| `fhEdge(map, fhId, left)` | Edge X for TURNATEDGES (2-link lookahead) |
| `fhWall(map, fhId, left, fy)` | Wall X blocking movement (2-link lookahead) |

Note: Mob physics uses its own set of foothold helper functions (`fhGroundAt`, `fhIdBelow`, etc.)
separate from the player's (`groundYOnFoothold`, `findFootholdBelow`, etc.). They have the same
logic but are named differently and not shared.

## Foothold Data Structure

From `parseMapData()`:
```js
{
  id: String,       // foothold ID (unique within map)
  layer: Number,    // render layer (0–7)
  group: Number,    // grouping within layer
  x1, y1,          // start point
  x2, y2,          // end point
  prevId: String|null,  // linked previous foothold (null = platform edge)
  nextId: String|null,  // linked next foothold (null = platform edge)
}
```

- **Wall**: `|x2 - x1| < 0.01` (vertical segment)
- **Slope**: `(y2 - y1) / (x2 - x1)`
- **Linked chains**: footholds connect via prevId/nextId to form platforms
- Null link = edge of platform (mobs with TURNATEDGES reverse here)

### Map Boundary Data
```js
map.walls = { left: leftWall + 25, right: rightWall - 25 }
map.borders = { top: topBorder - 300, bottom: bottomBorder + 100 }
map.footholdById = Map<id → foothold>
map.footholdLines = foothold[]
```

## Key Differences: Web vs C++

| Aspect | C++ | Web |
|--------|-----|-----|
| Timestep | 8ms (125 TPS) | Player: 125 TPS via `numTicks`. Mobs: ~30 FPS fixed step |
| Physics object | Shared `PhysicsObject` struct | Player: inline in `updatePlayer`. Mobs: `phobj` object |
| Foothold tree | `FootholdTree` class with spatial index (`footholdsbyx`) | Linear scan of `footholdLines` array |
| Landing | `limit_movement` checks ground intersection | Player: `findGroundLanding` ray-segment. Mobs: `fhIdBelow` scan |
| Mob control | Server-driven + local prediction | Fully local AI (stand/move state machine) |
| Interpolation | `Linear<double>` for smooth rendering | Direct position (no interpolation between ticks) |
| Flying mobs | `PhysicsObject::Type::FLYING` with FLYFRICTION | Not yet implemented |

## Potential Improvements

- **Spatial foothold index**: Replace linear scan with x-bucketed lookup (like C++ `footholdsbyx`)
- **Unify foothold helpers**: Player and mob use separate functions with identical logic
- **Flying mob physics**: Add `move_flying` equivalent for flying mobs (`canfly` flag)
- **Mob jumping**: C++ mobs can jump (`canjump` flag, Stance::JUMP with vforce = -5.0)
- **Tick interpolation**: Add Linear interpolation for smoother rendering between physics ticks
