/**
 * Server-authoritative reactor system.
 *
 * Manages destroyable map objects (boxes/crates) with:
 * - Multi-hit HP (4 hits to destroy)
 * - Global hit cooldown (all players share a cooldown per reactor)
 * - Server-computed loot drops on destruction
 * - Timed respawn (30s after destruction)
 */

// ─── Constants ──────────────────────────────────────────────────────

/** How many hits to destroy a reactor */
const REACTOR_MAX_HP = 4;

/** Global cooldown between hits on the same reactor (ms) — shared across all players */
const REACTOR_HIT_COOLDOWN_MS = 600;

/** Respawn delay after destruction (ms) */
const REACTOR_RESPAWN_MS = 10_000;

/** Maximum distance (px) a player can be from a reactor to hit it */
const REACTOR_HIT_RANGE_X = 120;
const REACTOR_HIT_RANGE_Y = 60;

// ─── Drop Tables ────────────────────────────────────────────────────

/**
 * Drop rate tiers:
 *   equipment  15%
 *   etc        49%
 *   use items  25%
 *   chairs     10%
 *   cash items  1%
 */

/** Equipment drops (beginner-appropriate gear) */
const EQUIP_DROPS: number[] = [
  // Caps
  1002001,  // Old Wisconsin
  1002003,  // Brown Hunting Cap
  1002017,  // Metal Gear
  1002050,  // White Bandana
  // Coats
  1040002,  // White Undershirt
  1040006,  // Blue One-lined T-Shirt
  1041002,  // Yellow T-Shirt (F)
  1041006,  // Green-Striped Top (F)
  // Pants
  1060002,  // Blue Jean Shorts
  1060006,  // Brown Cotton Shorts
  1061002,  // Red Miniskirt (F)
  1061006,  // Brown Miniskirt (F)
  // Shoes
  1072001,  // Red Rubber Boots
  1072004,  // Leather Sandals
  1072002,  // Yellow Rubber Boots
  // Weapons
  1302000,  // Sword
  1302004,  // Wooden Sword
  1322005,  // Wooden Mallet
  1402001,  // Wooden Sword (2H)
  1442000,  // Wooden Pole Arm
];

/** USE items (potions, scrolls) */
const USE_DROPS: number[] = [
  2000013,  // Red Potion for Beginners
  2000014,  // Blue Potion for Beginners
  2000000,  // Red Potion
  2000001,  // Orange Potion
  2000002,  // White Potion
  2000003,  // Blue Potion
  2000006,  // Mana Elixir
  2000004,  // Elixir
  2010000,  // Apple
  2010009,  // Meat
  2020013,  // Unagi
  2020015,  // Fried Chicken
];

/** ETC items (collectibles, quest items) */
const ETC_DROPS: number[] = [
  4000000,  // Blue Snail Shell
  4000001,  // Red Snail Shell
  4000002,  // Snail Shell
  4000003,  // Orange Mushroom Cap
  4000004,  // Octopus Leg
  4000005,  // Pig Ribbon
  4000006,  // Jr. Necki Skin
  4000007,  // Blue Mushroom Cap
  4000008,  // Horny Mushroom Cap
  4000009,  // Green Mushroom Cap
  4000010,  // Stirge Wing
  4000011,  // Stump Piece
  4000012,  // Slime Bubble
  4000013,  // Wild Boar Tooth
  4000014,  // Land of Wild Boar
  4000016,  // Charm of Undead
  4000018,  // Pig's Head
  4000019,  // Drake Skull
  4000020,  // Blue Drake Skull
  4000021,  // Fire Boar's Nose
  4010000,  // Bronze Ore
  4010001,  // Steel Ore
  4010002,  // Mithril Ore
  4010003,  // Adamantium Ore
  4010004,  // Silver Ore
  4010005,  // Orihalcon Ore
  4010006,  // Gold Ore
  4020000,  // Garnet Ore
  4020001,  // Amethyst Ore
  4020002,  // Aquamarine Ore
  4020003,  // Emerald Ore
  4020004,  // Opal Ore
  4020005,  // Sapphire Ore
  4020006,  // Topaz Ore
  4020007,  // Diamond Ore
  4020008,  // Black Crystal Ore
];

/** Chair items */
const CHAIR_DROPS: number[] = [
  3010000,  // The Relaxer
  3010001,  // Sky-blue Wooden Chair
  3010002,  // Green Chair
  3010003,  // Red Chair
  3010004,  // The Yellow Relaxer
  3010005,  // The Red Relaxer
  3010006,  // Yellow Chair
  3010007,  // Pink Seal Cushion
  3010008,  // Blue Seal Cushion
  3010009,  // Red Round Chair
];

/** Cash items (rare cosmetic effects) */
const CASH_DROPS: number[] = [
  5010000,  // Sunny Day
  5010001,  // Moon & the Stars
  5010002,  // Colorful Rainbow
  5010003,  // Little Devil
  5010004,  // Underwater
  5010005,  // Looking for Love
  5010006,  // Baby Angel
  5010007,  // Fugitive
];

// ─── Reactor Definitions ────────────────────────────────────────────

export interface ReactorPlacement {
  reactor_id: string; // WZ reactor ID (e.g. "0002000")
  x: number;
  y: number;          // foothold Y where reactor sits (same as character feet)
}

/** Map ID → array of reactor placements */
const MAP_REACTORS: Record<string, ReactorPlacement[]> = {
  "100000001": [
    // Reactor 0002001: 64×45 wooden box, origin(33,23), 2 shake frames + 7 break frames
    // y = footholdY - (height - originY) = foothold - (45 - 23) = foothold - 22
    // 4 on the grass ground (foothold y=274 → y=252)
    { reactor_id: "0002001", x: -400, y: 252 },
    { reactor_id: "0002001", x: 200,  y: 252 },
    { reactor_id: "0002001", x: 600,  y: 252 },
    { reactor_id: "0002001", x: 1000, y: 252 },
    // 1 next to Maya NPC (platform foothold y=38 → y=16)
    { reactor_id: "0002001", x: 60,   y: 16 },
  ],
};

// ─── Runtime State ──────────────────────────────────────────────────

export interface ReactorState {
  idx: number;          // index within the map's reactor array
  placement: ReactorPlacement;
  hp: number;           // remaining hits (starts at REACTOR_MAX_HP)
  state: number;        // current WZ state (0 = idle, increments on hit)
  active: boolean;      // false = destroyed, waiting for respawn
  lastHitMs: number;    // timestamp of last hit (for cooldown)
  respawnAt: number;    // timestamp when reactor should respawn (0 = not pending)
}

/**
 * Server-side reactor manager.
 * Keyed by mapId → array of ReactorState.
 */
const _mapReactors = new Map<string, ReactorState[]>();

// ─── Public API ─────────────────────────────────────────────────────

/** Get or initialize reactor states for a map. */
export function getMapReactors(mapId: string): ReactorState[] {
  let states = _mapReactors.get(mapId);
  if (states) return states;

  const placements = MAP_REACTORS[mapId];
  if (!placements || placements.length === 0) return [];

  states = placements.map((p, idx) => ({
    idx,
    placement: p,
    hp: REACTOR_MAX_HP,
    state: 0,
    active: true,
    lastHitMs: 0,
    respawnAt: 0,
  }));

  _mapReactors.set(mapId, states);
  return states;
}

/** Serialize reactor states for map_state / reactor_sync messages. */
export function serializeReactors(mapId: string): Array<{
  idx: number;
  reactor_id: string;
  x: number;
  y: number;
  state: number;
  hp: number;
  active: boolean;
}> {
  const states = getMapReactors(mapId);
  return states.map(r => ({
    idx: r.idx,
    reactor_id: r.placement.reactor_id,
    x: r.placement.x,
    y: r.placement.y,
    state: r.state,
    hp: r.hp,
    active: r.active,
  }));
}

/**
 * Attempt to hit a reactor. Returns result object.
 *
 * Validates:
 * - reactor exists and is active
 * - player is within range
 * - cooldown has elapsed
 */
export function hitReactor(
  mapId: string,
  reactorIdx: number,
  playerX: number,
  playerY: number,
): {
  ok: boolean;
  destroyed?: boolean;
  newState?: number;
  newHp?: number;
  reason?: string;
} {
  const states = getMapReactors(mapId);
  if (!states || reactorIdx < 0 || reactorIdx >= states.length) {
    return { ok: false, reason: "invalid_reactor" };
  }

  const reactor = states[reactorIdx];
  if (!reactor.active) {
    return { ok: false, reason: "inactive" };
  }

  // Range check
  const dx = Math.abs(playerX - reactor.placement.x);
  const dy = Math.abs(playerY - reactor.placement.y);
  if (dx > REACTOR_HIT_RANGE_X || dy > REACTOR_HIT_RANGE_Y) {
    return { ok: false, reason: "out_of_range" };
  }

  // Global cooldown check
  const now = Date.now();
  if (now - reactor.lastHitMs < REACTOR_HIT_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }

  // Apply hit
  reactor.lastHitMs = now;
  reactor.hp -= 1;
  reactor.state += 1;

  if (reactor.hp <= 0) {
    // Destroyed
    reactor.active = false;
    reactor.respawnAt = now + REACTOR_RESPAWN_MS;
    return { ok: true, destroyed: true, newState: reactor.state, newHp: 0 };
  }

  return { ok: true, destroyed: false, newState: reactor.state, newHp: reactor.hp };
}

/**
 * Check all maps for reactors that need respawning.
 * Call this periodically (e.g. every 1s).
 * Returns list of { mapId, reactor } for reactors that were just respawned.
 */
export function tickReactorRespawns(): Array<{ mapId: string; reactor: ReactorState }> {
  const respawned: Array<{ mapId: string; reactor: ReactorState }> = [];
  const now = Date.now();

  for (const [mapId, states] of _mapReactors) {
    for (const reactor of states) {
      if (!reactor.active && reactor.respawnAt > 0 && now >= reactor.respawnAt) {
        reactor.hp = REACTOR_MAX_HP;
        reactor.state = 0;
        reactor.active = true;
        reactor.lastHitMs = 0;
        reactor.respawnAt = 0;
        respawned.push({ mapId, reactor });
      }
    }
  }

  return respawned;
}

// ─── Loot Generation ────────────────────────────────────────────────

export interface LootItem {
  item_id: number;
  qty: number;
  category: string; // "EQUIP" | "USE" | "SETUP" | "ETC" | "CASH"
}

/** Roll a random loot drop from the reactor's drop table. */
export function rollReactorLoot(): LootItem {
  const roll = Math.random() * 100;
  let pool: number[];
  let category: string;
  let qty = 1;

  if (roll < 1) {
    // 1% — cash
    pool = CASH_DROPS;
    category = "CASH";
  } else if (roll < 11) {
    // 10% — chairs
    pool = CHAIR_DROPS;
    category = "SETUP";
  } else if (roll < 26) {
    // 15% — equipment
    pool = EQUIP_DROPS;
    category = "EQUIP";
  } else if (roll < 51) {
    // 25% — use items
    pool = USE_DROPS;
    category = "USE";
    qty = 1 + Math.floor(Math.random() * 5); // 1-5 potions
  } else {
    // 49% — etc
    pool = ETC_DROPS;
    category = "ETC";
    qty = 1 + Math.floor(Math.random() * 10); // 1-10 materials
  }

  const item_id = pool[Math.floor(Math.random() * pool.length)];
  return { item_id, qty, category };
}

/** Reset all reactor states (for testing). */
export function resetAllReactors(): void {
  _mapReactors.clear();
}
