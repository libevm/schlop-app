/**
 * Server-authoritative reactor system.
 *
 * Manages destroyable map objects (boxes/crates) with:
 * - Multi-hit HP (4 hits to destroy)
 * - Global hit cooldown (all players share a cooldown per reactor)
 * - Server-computed loot drops on destruction
 * - Timed respawn (30s after destruction)
 */

import { readWzXmlFile } from "./wz-xml.ts";

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

// ─── Drop Tables (loaded from WZ at startup) ───────────────────────

/**
 * Drop rate tiers:
 *   equipment  19%
 *   etc        50%
 *   use items  25%
 *   chairs      5%
 *   cash items   2%
 *
 * Pools are loaded dynamically from resourcesv3/ WZ data.
 */

let EQUIP_DROPS: number[] = [];
let USE_DROPS: number[] = [];
let ETC_DROPS: number[] = [];
let CHAIR_DROPS: number[] = [];
let CASH_DROPS: number[] = [];
let CASH_EQUIP_DROPS: number[] = [];
let _dropPoolsLoaded = false;

/** Extract 8-digit item IDs from an Item.wz JSON file (each has $imgdir children keyed by ID) */
function extractItemIds(json: any): number[] {
  const ids: number[] = [];
  for (const child of json?.$$  ?? []) {
    const key = child.$imgdir;
    if (key && /^\d{7,8}$/.test(key)) {
      ids.push(parseInt(key, 10));
    }
  }
  return ids;
}

// ─── Blacklist: items that should never be given to players ─────────

/**
 * Build a set of item IDs to exclude from drop pools.
 *
 * Blacklisted items:
 * - "MISSING NAME" or empty name in String.wz (unreleased/placeholder)
 * - Prefix 160 (Skill Effect weapons — no renderable stances, uses ring slot)
 * - Equipment with expireOnLogout=1 (vanishes on disconnect)
 * - Equipment with quest=1 (quest items, not usable outside quests)
 */
function buildItemBlacklist(resourceBase: string): Set<number> {
  const fs = require("fs");
  const path = require("path");
  const blacklist = new Set<number>();

  // ── 1) Items with MISSING NAME / empty name in String.wz ──
  const stringDir = path.join(resourceBase, "String.wz");

  // Eqp.img.xml
  try {
    const json = readWzXmlFile(path.join(stringDir, "Eqp.img.xml"));
    const eqp = json.$$?.find((c: any) => c.$imgdir === "Eqp");
    if (eqp) {
      for (const cat of eqp.$$ ?? []) {
        for (const item of cat.$$ ?? []) {
          const id = parseInt(item.$imgdir, 10);
          const nameNode = item.$$?.find((c: any) => c.$string === "name");
          const name = nameNode?.value ?? "";
          if (!name || name === "MISSING NAME" || name === "MISSING INFO") {
            blacklist.add(id);
          }
        }
      }
    }
  } catch {}

  // Consume, Etc, Ins, Cash string files
  for (const file of ["Consume.img.xml", "Etc.img.xml", "Ins.img.xml", "Cash.img.xml"]) {
    try {
      const json = readWzXmlFile(path.join(stringDir, file));
      for (const item of json.$$ ?? []) {
        const id = parseInt(item.$imgdir, 10);
        const nameNode = item.$$?.find((c: any) => c.$string === "name");
        const name = nameNode?.value ?? "";
        if (!name || name === "MISSING NAME" || name === "MISSING INFO") {
          blacklist.add(id);
        }
      }
    } catch {}
  }

  // ── 2) Prefix 160 (Skill Effect weapons — no stances, islot=Ri) ──
  const weaponDir = path.join(resourceBase, "Character.wz", "Weapon");
  try {
    for (const f of fs.readdirSync(weaponDir).filter((f: string) => f.endsWith(".img.xml"))) {
      const id = parseInt(f.replace(".img.xml", ""), 10);
      if (!isNaN(id) && Math.floor(id / 10000) === 160) {
        blacklist.add(id);
      }
    }
  } catch {}

  // ── 3) Equipment with expireOnLogout=1 or quest=1 in Character.wz info ──
  const equipDirs = ["Cap", "Coat", "Longcoat", "Pants", "Shoes", "Glove", "Shield", "Cape", "Weapon"];
  for (const dir of equipDirs) {
    const fullDir = path.join(resourceBase, "Character.wz", dir);
    try {
      for (const f of fs.readdirSync(fullDir).filter((f: string) => f.endsWith(".img.xml"))) {
        const id = parseInt(f.replace(".img.xml", ""), 10);
        if (isNaN(id)) continue;
        try {
          const json = readWzXmlFile(path.join(fullDir, f));
          const info = json.$$?.find((c: any) => c.$imgdir === "info");
          if (!info) continue;
          for (const c of info.$$ ?? []) {
            const key = c.$int || c.$short;
            if ((key === "expireOnLogout" || key === "quest") && String(c.value) === "1") {
              blacklist.add(id);
              break;
            }
          }
        } catch {}
      }
    } catch {}
  }

  return blacklist;
}

/** Load drop pools from resourcesv3/ WZ data. Call once at server startup. */
export function loadDropPools(resourceBase: string): void {
  if (_dropPoolsLoaded) return;
  _dropPoolsLoaded = true;

  const fs = require("fs");
  const path = require("path");

  // Build blacklist first
  const blacklist = buildItemBlacklist(resourceBase);

  // ── Equipment: Character.wz/<Type>/ — each file is one equip item ──
  // Also builds CASH_EQUIP_DROPS: equippable items with cash=1 in info (for JQ rewards).
  const equipDirs = ["Cap", "Coat", "Longcoat", "Pants", "Shoes", "Glove", "Shield", "Cape", "Weapon"];
  for (const dir of equipDirs) {
    const fullDir = path.join(resourceBase, "Character.wz", dir);
    try {
      const files = fs.readdirSync(fullDir).filter((f: string) => f.endsWith(".img.xml"));
      for (const f of files) {
        const id = parseInt(f.replace(".img.xml", ""), 10);
        if (isNaN(id) || blacklist.has(id)) continue;
        EQUIP_DROPS.push(id);

        // Check if this equip is a cash item
        try {
          const json = readWzXmlFile(path.join(fullDir, f));
          const info = json.$$?.find((c: any) => c.$imgdir === "info");
          if (info) {
            const cashNode = info.$$?.find((c: any) => (c.$int === "cash" || c.$short === "cash"));
            if (cashNode && String(cashNode.value) === "1") {
              CASH_EQUIP_DROPS.push(id);
            }
          }
        } catch {}
      }
    } catch {}
  }

  // ── USE items: Item.wz/Consume/ ──
  const consumeDir = path.join(resourceBase, "Item.wz", "Consume");
  try {
    for (const f of fs.readdirSync(consumeDir).filter((f: string) => f.endsWith(".img.xml"))) {
      const json = readWzXmlFile(path.join(consumeDir, f));
      USE_DROPS.push(...extractItemIds(json).filter(id => !blacklist.has(id)));
    }
  } catch {}

  // ── ETC items: Item.wz/Etc/ ──
  const etcDir = path.join(resourceBase, "Item.wz", "Etc");
  try {
    for (const f of fs.readdirSync(etcDir).filter((f: string) => f.endsWith(".img.xml"))) {
      const json = readWzXmlFile(path.join(etcDir, f));
      ETC_DROPS.push(...extractItemIds(json).filter(id => !blacklist.has(id)));
    }
  } catch {}

  // ── Chairs: Item.wz/Install/ ──
  const installDir = path.join(resourceBase, "Item.wz", "Install");
  try {
    for (const f of fs.readdirSync(installDir).filter((f: string) => f.endsWith(".img.xml"))) {
      const json = readWzXmlFile(path.join(installDir, f));
      CHAIR_DROPS.push(...extractItemIds(json).filter(id => !blacklist.has(id)));
    }
  } catch {}

  // ── Cash items: Item.wz/Cash/ ──
  const cashDir = path.join(resourceBase, "Item.wz", "Cash");
  try {
    for (const f of fs.readdirSync(cashDir).filter((f: string) => f.endsWith(".img.xml"))) {
      const json = readWzXmlFile(path.join(cashDir, f));
      CASH_DROPS.push(...extractItemIds(json).filter(id => !blacklist.has(id)));
    }
  } catch {}

  console.log(`[reactor] Blacklisted ${blacklist.size} items (MISSING NAME / Skill Effect / expireOnLogout / quest)`);
  console.log(`[reactor] Drop pools loaded: equip=${EQUIP_DROPS.length} use=${USE_DROPS.length} etc=${ETC_DROPS.length} chairs=${CHAIR_DROPS.length} cash=${CASH_DROPS.length} cashEquip=${CASH_EQUIP_DROPS.length}`);
}

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
    { reactor_id: "0002001", x: 1500, y: 252 },
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
  damageBy: Map<string, number>; // sessionId → hit count (for loot ownership)
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
    damageBy: new Map<string, number>(),
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
  playerId: string,
): {
  ok: boolean;
  destroyed?: boolean;
  newState?: number;
  newHp?: number;
  majorityHitter?: string; // session ID of player who dealt most hits (on destroy)
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

  // Track damage per player
  reactor.damageBy.set(playerId, (reactor.damageBy.get(playerId) ?? 0) + 1);

  if (reactor.hp <= 0) {
    // Destroyed — find majority hitter
    let majorityHitter = playerId;
    let maxHits = 0;
    for (const [sid, hits] of reactor.damageBy) {
      if (hits > maxHits) { maxHits = hits; majorityHitter = sid; }
    }
    reactor.active = false;
    reactor.respawnAt = now + REACTOR_RESPAWN_MS;
    return { ok: true, destroyed: true, newState: reactor.state, newHp: 0, majorityHitter };
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
        reactor.damageBy.clear();
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

  if (roll < 2) {
    // 2% — cash items
    pool = CASH_DROPS;
    category = "CASH";
  } else if (roll < 7) {
    // 5% — chairs
    pool = CHAIR_DROPS;
    category = "SETUP";
  } else if (roll < 26) {
    // 19% — equipment
    pool = EQUIP_DROPS;
    category = "EQUIP";
  } else if (roll < 51) {
    // 25% — use items
    pool = USE_DROPS;
    category = "USE";
    qty = 1 + Math.floor(Math.random() * 5); // 1-5
  } else {
    // 50% — etc items
    pool = ETC_DROPS;
    category = "ETC";
    qty = 1 + Math.floor(Math.random() * 10); // 1-10
  }

  // Fallback if pool is empty (WZ data not loaded)
  if (!pool || pool.length === 0) {
    pool = ETC_DROPS.length > 0 ? ETC_DROPS : [4000000];
    category = "ETC";
    qty = 1;
  }

  const item_id = pool[Math.floor(Math.random() * pool.length)];
  return { item_id, qty, category };
}

// ─── Item Name Lookup ───────────────────────────────────────────────

const _itemNameCache = new Map<number, string>();
let _itemNamesLoaded = false;

/** Load item names from String.wz. Call once at startup (after loadDropPools). */
export function loadItemNames(resourceBase: string): void {
  if (_itemNamesLoaded) return;
  _itemNamesLoaded = true;

  const fs = require("fs");
  const path = require("path");
  const stringDir = path.join(resourceBase, "String.wz");

  // Equip names: Eqp.img.xml → Eqp → sub-categories → items
  try {
    const json = readWzXmlFile(path.join(stringDir, "Eqp.img.xml"));
    const eqp = json.$$?.find((c: any) => c.$imgdir === "Eqp");
    if (eqp) {
      for (const cat of eqp.$$ ?? []) {
        for (const item of cat.$$ ?? []) {
          const id = parseInt(item.$imgdir, 10);
          const name = item.$$?.find((c: any) => c.$string === "name")?.value;
          if (!isNaN(id) && name) _itemNameCache.set(id, String(name));
        }
      }
    }
  } catch {}

  // Consume, Etc, Ins (chairs), Cash items
  for (const file of ["Consume.img.xml", "Etc.img.xml", "Ins.img.xml", "Cash.img.xml"]) {
    try {
      const json = readWzXmlFile(path.join(stringDir, file));
      for (const item of json.$$ ?? []) {
        const id = parseInt(item.$imgdir, 10);
        const name = item.$$?.find((c: any) => c.$string === "name")?.value;
        if (!isNaN(id) && name) _itemNameCache.set(id, String(name));
      }
    } catch {}
  }

  console.log(`[items] Loaded ${_itemNameCache.size} item names`);
}

/** Get the name for an item ID, or a fallback string. */
export function getItemName(itemId: number): string {
  return _itemNameCache.get(itemId) ?? `Item #${itemId}`;
}

// ─── JQ Reward Generation ───────────────────────────────────────────

/** Roll a random jump quest reward: 50% regular equipment, 50% cash equipment (equipable cash items), qty always 1. */
export function rollJqReward(): LootItem {
  const isEquip = Math.random() < 0.5;
  if (isEquip && EQUIP_DROPS.length > 0) {
    const item_id = EQUIP_DROPS[Math.floor(Math.random() * EQUIP_DROPS.length)];
    return { item_id, qty: 1, category: "EQUIP" };
  }
  if (CASH_EQUIP_DROPS.length > 0) {
    const item_id = CASH_EQUIP_DROPS[Math.floor(Math.random() * CASH_EQUIP_DROPS.length)];
    return { item_id, qty: 1, category: "EQUIP" };
  }
  // Fallback: regular equip if cash equip pool is empty
  if (EQUIP_DROPS.length > 0) {
    const item_id = EQUIP_DROPS[Math.floor(Math.random() * EQUIP_DROPS.length)];
    return { item_id, qty: 1, category: "EQUIP" };
  }
  return { item_id: 4000000, qty: 1, category: "ETC" };
}

/** Reset all reactor states (for testing). */
export function resetAllReactors(): void {
  _mapReactors.clear();
}
