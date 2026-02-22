---
title: Remaking MapleStory as a Web Client With AI Agents
date: 2026-02-22
---

![](https://i.imgur.com/placeholder-maple-header.png)

---

## The Pitch

You know that feeling when you're 12 years old, sitting in a PC bang, burning through your allowance so you can grind Henesys Hunting Ground for another 4 hours? That dopamine hit when an Orange Mushroom drops a Work Glove and you convince yourself it's worth 10 million meso?

Yeah. I wanted that back. Except this time I wanted it in a browser tab, next to my 47 open tabs of DeFi dashboards and unread Telegram messages. Because apparently I hate myself.

> You miss 100% of the jump quests you don't attempt -- Sun Tzu, probably

## Act 1 - Reconnaissance (aka Reading 14,000 Lines of JavaScript)

The starting point was a half-finished TypeScript MapleStory web port and a C++ reference client that I could only look at, not touch. Kind of like window shopping at a Porsche dealership except the Porsche is a 2D side-scroller from 2003.

The half-web-port had map rendering, character movement, and ~3.7 GB of decomposed WZ→JSON assets sitting in a `public/` folder like a ticking time bomb for anyone's `git clone`.

The C++ reference client was the "real deal" -- a proper implementation with physics, footholds, mob AI, the works. My job was to stare at it very hard and make the browser do the same thing, except in JavaScript, which as we all know is the language God intended for 2D platformer physics.

**Asset situation:**
- ~22,000 JSON files
- 3.7 GB on disk
- Client loaded them monolithically
- Your browser: 💀

## Act 2 - The Architecture (Keeping It Stupid Simple)

After scanning both codebases and having an existential crisis about the scope of this project, I settled on the most boring possible architecture. No React. No Next.js. No Kubernetes. No microservices. No Redis. Just vibes and vanilla JavaScript.

```
client/web/app.js     ← 14,700 lines of hand-written JS. Yes, one file. Fight me.
server/src/           ← Raw Bun.serve(), no frameworks
tools/                ← Asset extraction scripts
```

**Tech stack:**
- **Runtime:** Bun (because it's fast and I like the logo)
- **Client:** Vanilla JS + Canvas 2D API (no WebGL, we're not animals)
- **Server:** Raw `Bun.serve()` + `bun:sqlite` (zero npm runtime dependencies in prod)
- **Styling:** Tailwind CSS v4 for the UI overlays (login, settings, HUD)
- **External dependencies in production:** Zero. Literally zero.

No build step for JavaScript in dev mode. Just a `<script>` tag pointing at `app.js`. The bundler industrial complex in shambles.

For production (`--prod` flag), we get Bun.build minification + gzip pre-compression. Assets served from memory. ETags for caching. The whole nine yards, but only when it matters.

## Act 3 - Making Pixels Appear (The Rendering Pipeline)

The rendering pipeline is a Canvas 2D `requestAnimationFrame` loop running at 60fps. Nothing revolutionary here -- MapleStory was designed to run on a Pentium 4, so Canvas 2D is more than enough.

```
tick(timestampMs)
  ├─ accumulator-based fixed-step at 60Hz
  ├─ update() ← physics, AI, animation
  └─ render() ← draw everything
```

The draw order is a 20-step monster that took way too long to get right:

1. Clear canvas (black)
2. Back backgrounds
3. Map layers interleaved with mobs/NPCs/player (z-ordered)
4. Reactors, damage numbers, portals
5. Front backgrounds
6. Ground drops
7. VR bounds overflow mask
8. Chat bubbles, name labels
9. HUD (HP/MP bars, minimap, map banner)
10. NPC dialogue
11. Transition overlay

The hardest part? Getting the **draw order right for layered content**. Mobs and NPCs need to be interleaved with map tile layers based on their foothold layer. Higher layers occlude the player. Lower layers are behind them. Getting this wrong means your character is either invisible or standing on top of everything like a god.

### The Character Sprite Nightmare

MapleStory characters are composed from ~8 separate sprite sheets (body, head, face, hair, coat, pants, shoes, weapon) all positioned via anchor-based composition. Each part has origin points and "map" vectors that define where it connects to other parts.

```
Body → provides navel, neck, hand anchors
Head → attaches to neck, provides brow
Face → attaches to brow
Hair → attaches to brow
Equipment → attaches to navel/hand
```

All z-ordered by a `zmap.img.json` layer file. All cached. All frame-indexed. All flippable.

The composition function (`composeCharacterPlacements()`) is cached per `(action, frameIndex, flipped, faceExpression, faceFrameIndex)`. If any equip sprite is still decoding, the template is NOT cached -- this prevents the "equipment blinking" bug where an incomplete template gets cached and you look naked for one frame.

I am not going to pretend I got this right on the first try. Or the fifth.

## Act 4 - Physics (C++ Port Speedrun Any%)

The C++ client has a proper physics engine with `PhysicsObject` structs, a unified `move_object()` pipeline, and foothold trees with spatial indexing. Elegant. Clean. C++ things.

My port has... inline physics in `updatePlayer()` that I'm told works.

**The constants** (per-tick at 125 TPS to match C++):
```js
PHYS_GRAVFORCE = 0.14
PHYS_FRICTION = 0.5
PHYS_GROUNDSLIP = 3.0
PHYS_SLOPEFACTOR = 0.1
```

**What I implemented:**
- Ground friction with slope influence (matching C++ `move_normal`)
- Landing via ray-segment intersection against footholds
- Foothold chain walking (follow `prevId`/`nextId` up to 8 links)
- Wall collision (2-link lookahead, tall wall detection)
- Down-jumping (skip current platform, reduced force)
- Rope/ladder climbing with snap, reattach locks, side-jumping
- Swimming (separate gravity, friction, directional forces)
- Fall damage (threshold-based, percentage HP, knockback bounce)
- Trap collision (sweep-test against animated object hitboxes)
- Mob touch damage (body contact, knockback, invincibility window)

**What I did NOT implement:**
- Flying mob physics (sorry, Crimson Balrogs)
- Mob jumping

The foothold system is a linear scan instead of C++'s spatial index. This is fine for the 21 maps I support. If I ever support Victoria Island in full, future me can suffer.

## Act 5 - Multiplayer (The "Oh God Why" Phase)

Single-player was working great. Then someone (me) decided it should be multiplayer.

### Server-Authoritative Model

The server is king. Clients are mere suggestion boxes.

- Client sends inputs (`move`, `attack`, `chat`), not state
- Server validates everything (position, portal proximity, loot ownership)
- 20 Hz position broadcasts
- Clients interpolate with 100ms render delay (snapshot interpolation)

### The WebSocket Dance

```
1. Client solves SHA-256 Proof-of-Work challenge (anti-bot)
2. Client opens WebSocket, sends auth message
3. Server loads character from SQLite, sends change_map
4. Client loads map, sends map_loaded
5. Server adds to room, sends map_state (who else is here)
6. Game begins
7. Ping/pong every 5s, 30s timeout
```

The PoW challenge was a fun addition -- new visitors must find a nonce where `SHA-256(challenge + nonce)` has 20 leading zero bits. Takes about 1 second on a modern browser. Prevents bot spam without a CAPTCHA. The client shows a little progress bar while your CPU suffers.

### Remote Player Rendering

Remote players use **snapshot interpolation** -- the same technique from Source Engine / Overwatch. Buffer received positions with timestamps, render 100ms "in the past", lerp between bracketing snapshots.

This eliminates jitter from ping variance. No chase-lerp oscillation. No janky position jumping. Just smooth sliding characters that are technically living in the past, like all of us emotionally.

Each remote player gets:
- Their own equip WZ data (loaded independently)
- Their own animation frame timer
- Chat bubbles, name labels, face expressions
- Correct foothold layer rendering

### The "Someone Is Already Logged In" Problem

Duplicate login detection! If you try to log in from a second tab, the server rejects the new connection with code `4006`. The client shows a blocking overlay with "Retry" or "Log Out" buttons. The existing session always wins.

This was important because without it, you'd get two copies of yourself on the same map, and MapleStory is already confusing enough.

## Act 6 - Server Features (The Backend Nobody Asked For)

### Persistence

SQLite for everything. `bun:sqlite` is built into Bun, zero native addon friction.

```sql
characters (name, data, version, gm, updated_at)
sessions (session_id, character_name, created_at)
credentials (name, password_hash, claimed_at)
valid_sessions (session_id, created_at, last_used_at)
jq_leaderboard (player_name, quest_name, completions, best_at)
logs (id, username, timestamp, action)
```

Dual-path persistence in online mode: WebSocket `save_state` for real-time updates, REST `POST /api/character/save` as backup, and server-side persist on WebSocket disconnect. Your character data isn't going anywhere.

### The Reactor System (Destroyable Boxes)

Map 100000001 (Henesys) has 6 wooden boxes you can smash. 4 hits to destroy. 10s respawn. Server-computed random loot from dynamically loaded WZ item pools.

Loot categories: 50% ETC, 25% USE, 19% equipment, 5% chairs, 2% cash. 276 items blacklisted (missing names, quest items, logout-expiry items, cursed prefix-160 weapons that break rendering).

5s loot protection for the majority hitter. Democracy in action.

### Jump Quest Rewards

21 maps. 3 jump quest series (Kerning Subway, Forest of Patience, Breath of Lava). Treasure chests at the end give random equipment. Completion tracking. Leaderboard.

The server validates proximity to the NPC before dispensing rewards, because someone will absolutely try to claim the chest from across the map.

### GM System

```
/mousefly   ← toggle fly mode (client-side)
/overlay    ← debug overlays: footholds, hitboxes, everything
/map <id>   ← warp to any map (server-validated)
/teleport <user> <map_id> ← warp someone else
```

Plus a full admin dashboard (`bun run client:admin-ui`) with GM-only login, table browser, SQL query runner, and CSV export. Rate-limited login to prevent brute force. Admin sessions with 8h TTL.

## Act 7 - The V2 Resource Strategy

Remember the 3.7 GB asset problem? Instead of serving all 22,000 JSON files, I wrote an extraction script that pulls only the assets needed for the 21 supported maps.

```bash
bun run extract:v2
# 90 files extracted. 0 missing. Chef's kiss.
```

The client rewrites `/resources/` → `/resourcesv2/` when V2 mode is active (online or `?v2=1`). Cache API separates entries naturally by URL prefix. Graceful fallback to full resources if V2 returns 404.

From 3.7 GB to "actually reasonable". Your ISP thanks me.

## Act 8 - The Little Things That Took Forever

- **WZ Cursor**: Custom cursor loaded from WZ assets. Three states (idle, can-click, clicking). Animated multi-frame hover. Only activates after login screen dismisses so you don't get an invisible cursor during character creation.

- **Hidden Portals**: Touch a hidden portal for 500ms → it fades in over 400ms. Leave → it fades out. Exactly like the real game.

- **Map Name Banner**: Dark ribbon slides in from the right with map mark icon, street name in light blue, map name in gold with warm glow. Cubic ease-out. 3.5s display.

- **Chair Sitting**: SETUP tab items. Chair sprite drawn below character. Flips with facing. Weapon hidden while sitting. Remote players sync chair state.

- **Minimap**: Collapsible panel. Player dot (yellow), remote players (red), NPCs (green), portals (blue), reactors (purple). All positions world-to-minimap transformed.

- **Chat Bubbles**: Properly anchored above character head. Prone-aware Y offset. Remote bubbles clip naturally at canvas edges (no viewport clamping). White bubble, Dotum font, subtle blue-gray border.

- **Loading Screen**: Animated Orange Mushroom sprite walking back and forth above the progress bar. Falls back to a spinning gold circle while the mushroom assets load. Login BGM plays during loading at 35% volume.

- **Mobile Controls**: Auto-detected on touch devices in online mode. D-pad left, A/B buttons right. Semi-transparent. Safe-area aware.

## Closing Remarks

Is this production-ready? Depends on your definition. There are 69 server tests passing. The client is a single 14,700-line JavaScript file. There's a custom cursor system. I implemented fall damage.

Was it worth it? I spent weeks porting C++ physics to JavaScript, implementing anchor-based sprite composition, writing a WebSocket room manager, building an admin dashboard, and debugging why characters sometimes render without pants.

Of course it was worth it.

The whole thing runs on zero npm runtime dependencies, deploys on a single Bun process, and gives you that 2003 MapleStory feeling right in your browser. Including the part where you fall off the same platform 47 times in Kerning City Jump Quest.

Some things never change.

## Links

- [MapleStory C++ Reference Client](https://github.com/libevm/MapleStory-Client) (read-only reference)
- [Bun Runtime](https://bun.sh/)
- [Tailwind CSS](https://tailwindcss.com/)
