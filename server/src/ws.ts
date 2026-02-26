/**
 * WebSocket room manager and message handler.
 *
 * Manages map-scoped rooms, relays player state between clients.
 * See .memory/client-server.md for full message protocol.
 */
import type { ServerWebSocket } from "bun";
import type { Database } from "bun:sqlite";
import { saveCharacterData, incrementJqLeaderboard, appendLog } from "./db.ts";
import {
  getMapPortalData,
  getMapData,
  mapExists,
  findPortal,
  isUsablePortal,
  hasValidTarget,
  distance,
  isNpcOnMap,
  isValidNpcDestination,
  getNpcOnMap,
  findGroundY,
  getMapData,
  getMobStats,
  PORTAL_RANGE_PX,
} from "./map-data.ts";
import {
  getMapReactors,
  serializeReactors,
  hitReactor,
  tickReactorRespawns,
  rollReactorLoot,
  rollMobLoot,
  rollJqReward,
  getItemName,
} from "./reactor-system.ts";

// ─── Types ──────────────────────────────────────────────────────────

export interface PlayerLook {
  gender: boolean;     // false = male, true = female
  face_id: number;
  hair_id: number;
  skin: number;
  equipment: Array<{ slot_type: string; item_id: number }>;
}

/** Maximum movement speed in pixels per second (generous to allow latency bursts) */
const MAX_MOVE_SPEED_PX_PER_S = 1200;

export interface InventoryItem {
  item_id: number;
  qty: number;
  inv_type: string;
  slot: number;
  category: string | null;
}

export interface PlayerStats {
  level: number;
  job: string;
  exp: number;
  max_exp: number;
  hp: number;
  max_hp: number;
  mp: number;
  max_mp: number;
  str: number;
  dex: number;
  int: number;
  luk: number;
  speed: number;
  jump: number;
  meso: number;
}

export interface WSClient {
  id: string;          // session ID
  name: string;
  mapId: string;
  /** Map the client is transitioning to (set by server, cleared on map_loaded) */
  pendingMapId: string;
  /** Portal name to spawn at on pending map */
  pendingSpawnPortal: string;
  ws: ServerWebSocket<WSClientData>;
  /** Client IP address (from X-Forwarded-For or direct connection) */
  ip: string;
  x: number;
  y: number;
  action: string;
  facing: number;
  look: PlayerLook;
  lastActivityMs: number;
  /** Timestamp of the last accepted move message (for velocity checking) */
  lastMoveMs: number;
  /** True once the client has sent at least one valid move on the current map */
  positionConfirmed: boolean;
  /** Active chair item ID (0 = not sitting on chair) */
  chairId: number;
  /** Server-tracked inventory (updated by client via save_state) */
  inventory: InventoryItem[];
  /** Server-tracked stats (updated by client via save_state) */
  stats: PlayerStats;
  /** Server-tracked achievements (JQ completions, etc.) */
  achievements: Record<string, any>;
  /** GM privileges — enables slash commands */
  gm: boolean;
}

export interface WSClientData {
  authenticated: boolean;
  client: WSClient | null;
  /** IP address captured at WebSocket upgrade time */
  ip: string;
}

/** How long drops persist on the map before expiring (ms). MapleStory standard ~180s. */
export const DROP_EXPIRE_MS = 180_000;
/** How often the server sweeps for expired drops (ms). */
const DROP_SWEEP_INTERVAL_MS = 5_000;
/** Maximum inventory slots per tab (must match client INV_MAX_SLOTS). */
const INV_MAX_SLOTS_PER_TAB = 32;
/** Mob respawn delay (ms) — real MapleStory uses ~30s for normal mobs. */
const MOB_RESPAWN_DELAY_MS = 30_000;
/**
 * Attack range from WZ Afterimage data (C++ Afterimage::get_range).
 *
 * Each weapon has an `info/afterImage` name (e.g. "swordOL").
 * The hitbox for a given stance is in `Character.wz/Afterimage/{name}.img.xml/{level/10}/{stance}`
 * as `lt` (left-top) and `rb` (right-bottom) vectors, relative to player position.
 * Values are negative-X = in front when facing left.
 *
 * On the server we only track mob position (not their sprite bounds), so we add generous
 * vertical padding since C++ checks sprite-rect overlap, not point-in-rect.
 */

/** Fallback range if weapon/afterimage lookup fails. */
const FALLBACK_ATTACK_RANGE = { left: -50, right: 0, top: -35, bottom: 10 };

/** Cache: "afterImageName/stance" → { left, right, top, bottom } */
const _afterimageRangeCache = new Map<string, { left: number; right: number; top: number; bottom: number }>();

/** Cache: weaponItemId → afterImage name */
const _weaponAfterimageCache = new Map<number, string>();

/** Get afterimage name from weapon WZ info. */
function getWeaponAfterimage(weaponItemId: number): string {
  if (_weaponAfterimageCache.has(weaponItemId)) return _weaponAfterimageCache.get(weaponItemId)!;

  const padded = String(weaponItemId).padStart(8, "0");
  const { resolve: rp } = require("path");
  const { existsSync: ex, readFileSync: rf } = require("fs");
  const { parseWzXml: pz } = require("./wz-xml.ts");
  const PROJECT_ROOT = rp(__dirname, "../..");
  const fp = rp(PROJECT_ROOT, "resourcesv3", "Character.wz", "Weapon", `${padded}.img.xml`);

  let name = "";
  if (ex(fp)) {
    try {
      const json = pz(rf(fp, "utf-8"));
      const info = json?.$$?.find((s: any) => s.$imgdir === "info");
      for (const child of info?.$$ || []) {
        if (child.$string === "afterImage") { name = child.value || ""; break; }
      }
    } catch {}
  }
  _weaponAfterimageCache.set(weaponItemId, name);
  return name;
}

/** Get afterimage hit range for a given afterimage name and attack stance. */
function getAfterimageRange(aiName: string, stance: string, weaponLevel: number): { left: number; right: number; top: number; bottom: number } {
  const key = `${aiName}/${stance}`;
  if (_afterimageRangeCache.has(key)) return _afterimageRangeCache.get(key)!;

  const { resolve: rp } = require("path");
  const { existsSync: ex, readFileSync: rf } = require("fs");
  const { parseWzXml: pz } = require("./wz-xml.ts");
  const PROJECT_ROOT = rp(__dirname, "../..");
  const fp = rp(PROJECT_ROOT, "resourcesv3", "Character.wz", "Afterimage", `${aiName}.img.xml`);

  let result = FALLBACK_ATTACK_RANGE;
  if (ex(fp)) {
    try {
      const json = pz(rf(fp, "utf-8"));
      // C++: level/10 selects the sub-node. Level 0 weapons use "0".
      const levelKey = String(Math.floor(weaponLevel / 10));
      const levelNode = json?.$$?.find((s: any) => s.$imgdir === levelKey);
      const stanceNode = levelNode?.$$?.find((s: any) => s.$imgdir === stance);
      if (stanceNode?.$$) {
        let lt: { x: number; y: number } | null = null;
        let rb: { x: number; y: number } | null = null;
        for (const child of stanceNode.$$) {
          if (child.$vector === "lt") lt = { x: Number(child.x), y: Number(child.y) };
          if (child.$vector === "rb") rb = { x: Number(child.x), y: Number(child.y) };
        }
        if (lt && rb) {
          result = { left: lt.x, right: rb.x, top: lt.y, bottom: rb.y };
        }
      }
    } catch {}
  }
  _afterimageRangeCache.set(key, result);
  return result;
}

/**
 * Build world-space attack rectangle from afterimage range (mirrors C++ Combat::apply_move).
 *
 * C++ uses mob sprite bounds for overlap check; server uses mob position point,
 * so we add MOB_HITBOX_PADDING to vertical range to compensate.
 */
const MOB_HITBOX_PADDING_Y = 30; // mobs are roughly 30-60px tall

function buildAttackRect(px: number, py: number, facingLeft: boolean, range: { left: number; right: number; top: number; bottom: number }): { l: number; r: number; t: number; b: number } {
  // C++ Combat::apply_move: hrange = range.left * attack.hrange (hrange=1.0)
  const hrange = range.left; // negative value = distance in front

  if (facingLeft) {
    // Facing left: hitbox is to the LEFT of player
    return {
      l: px + hrange,           // px + (-84) = px - 84
      r: px + range.right,      // px + (-20) = px - 20
      t: py + range.top - MOB_HITBOX_PADDING_Y,
      b: py + range.bottom + MOB_HITBOX_PADDING_Y,
    };
  } else {
    // Facing right: hitbox is to the RIGHT of player (mirrored)
    return {
      l: px - range.right,      // px - (-20) = px + 20
      r: px - hrange,           // px - (-84) = px + 84
      t: py + range.top - MOB_HITBOX_PADDING_Y,
      b: py + range.bottom + MOB_HITBOX_PADDING_Y,
    };
  }
}
/**
 * Player damage constants — mirrors C++ CharStats::close_totalstats() for beginners.
 *
 * C++ formula:
 *   primary = get_multiplier() * STR   (multiplier=4.0 for 1H sword, 0.0 for no weapon)
 *   secondary = DEX
 *   multiplier = WATK / 100
 *   maxdamage = (primary + secondary) * multiplier
 *   mindamage = ((primary * 0.9 * mastery) + secondary) * multiplier
 *   mastery = 0.5 + skill_bonus (beginners: skill_bonus=0 → mastery=0.5)
 *   accuracy = DEX * 0.8 + LUK * 0.5
 *   critical = 0.05 (5%)
 */
const DEFAULT_CRITICAL = 0.05;

/**
 * Determine inventory tab type from item ID prefix.
 * Matches client-side `inventoryTypeById(id)`.
 */
function inventoryTypeByItemId(itemId: number): string {
  const prefix = Math.floor(itemId / 1_000_000);
  switch (prefix) {
    case 1: return "EQUIP";
    case 2: return "USE";
    case 3: return "SETUP";
    case 4: return "ETC";
    case 5: return "CASH";
    default: return "ETC";
  }
}

/**
 * Check if the client's inventory has room for an item in the given tab.
 * Returns true if at least one free slot exists (slot 0..INV_MAX_SLOTS_PER_TAB-1).
 */
function hasInventorySpace(client: WSClient, invType: string): boolean {
  const usedSlots = new Set<number>();
  for (const it of client.inventory) {
    if (it.inv_type === invType) usedSlots.add(it.slot);
  }
  for (let s = 0; s < INV_MAX_SLOTS_PER_TAB; s++) {
    if (!usedSlots.has(s)) return true;
  }
  return false;
}

/**
 * Check if the client's inventory can accommodate a stackable item.
 * Returns true if the item can be stacked onto existing slots or a free slot exists.
 * For non-stackable items (EQUIP), just checks for a free slot.
 */
function canFitItem(client: WSClient, itemId: number, qty: number): boolean {
  const invType = inventoryTypeByItemId(itemId);
  const isEquip = invType === "EQUIP";

  if (isEquip) {
    return hasInventorySpace(client, invType);
  }

  // Stackable: check if existing stacks have room, or if a new slot is available
  // Default slotMax 100 for non-equip items (conservative; client has WZ data for precise values)
  const slotMax = 100;
  let remaining = qty;

  for (const it of client.inventory) {
    if (it.item_id === itemId && it.inv_type === invType) {
      const space = slotMax - it.qty;
      if (space > 0) {
        remaining -= space;
        if (remaining <= 0) return true;
      }
    }
  }

  // Still need space — check for free slots
  return hasInventorySpace(client, invType);
}

/**
 * Add an item to the server-tracked inventory.
 * Stacks onto existing slots when possible, otherwise uses first free slot.
 */
function addItemToInventory(client: WSClient, itemId: number, qty: number, category: string | null): void {
  const invType = inventoryTypeByItemId(itemId);
  const isEquip = invType === "EQUIP";
  const slotMax = isEquip ? 1 : 100;

  let remaining = qty;

  // Try stacking onto existing slots first (non-equip only)
  if (!isEquip) {
    for (const it of client.inventory) {
      if (it.item_id === itemId && it.inv_type === invType) {
        const space = slotMax - it.qty;
        if (space > 0) {
          const add = Math.min(remaining, space);
          it.qty += add;
          remaining -= add;
          if (remaining <= 0) return;
        }
      }
    }
  }

  // Remaining goes into free slots
  while (remaining > 0) {
    const usedSlots = new Set<number>();
    for (const it of client.inventory) {
      if (it.inv_type === invType) usedSlots.add(it.slot);
    }
    let freeSlot = -1;
    for (let s = 0; s < INV_MAX_SLOTS_PER_TAB; s++) {
      if (!usedSlots.has(s)) { freeSlot = s; break; }
    }
    if (freeSlot === -1) break; // inventory full — items lost

    const add = Math.min(remaining, slotMax);
    client.inventory.push({
      item_id: itemId,
      qty: add,
      inv_type: invType,
      slot: freeSlot,
      category: category,
    });
    remaining -= add;
  }
}

// ─── Server-Side Mob State ─────────────────────────────────────────

interface ServerMobState {
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  spawnX: number;   // original WZ spawn position
  spawnY: number;
  dead: boolean;
  respawnAt: number; // timestamp when mob should respawn (0 = alive)
}

/** mapId → mobIdx → ServerMobState */
const _mapMobStates = new Map<string, Map<number, ServerMobState>>();

/** mapId → (lifeIdx → mob ID string). Cached to avoid re-parsing WZ. */
const _mapMobIds = new Map<string, Map<number, string>>();

/** Initialize mob states for a map from WZ data. Called when first player joins. */
function initMapMobStates(mapId: string): Map<number, ServerMobState> {
  const existing = _mapMobStates.get(mapId);
  if (existing) return existing;

  const states = new Map<number, ServerMobState>();
  _mapMobStates.set(mapId, states);

  const mobIds = _parseMapLifeEntries(mapId);
  _mapMobIds.set(mapId, mobIds);

  for (const [lifeIdx, mobId] of mobIds) {
    const mobStats = getMobStats(mobId);
    const maxHp = mobStats?.maxHP ?? 100;
    // Position will be updated from mob_state authority messages.
    // Initialize with spawn position from WZ.
    states.set(lifeIdx, {
      hp: maxHp,
      maxHp,
      x: 0, y: 0,
      spawnX: 0, spawnY: 0, // filled from WZ below
      dead: false,
      respawnAt: 0,
    });
  }

  // Fill spawn positions from WZ
  _fillMobSpawnPositions(mapId, states);
  return states;
}

/** Parse the map's life section in WZ order to get lifeIdx → mobId mapping. */
function _parseMapLifeEntries(mapId: string): Map<number, string> {
  const result = new Map<number, string>();
  const { resolve } = require("path");
  const { existsSync, readFileSync } = require("fs");
  const { parseWzXml } = require("./wz-xml.ts");
  const PROJECT_ROOT = resolve(__dirname, "../..");

  const mapIdStr = String(mapId).padStart(9, "0");
  const mapDir = `Map${mapIdStr[0]}`;
  const filePath = resolve(PROJECT_ROOT, "resourcesv3", "Map.wz", "Map", mapDir, `${mapIdStr}.img.xml`);

  if (!existsSync(filePath)) return result;
  let mapJson: any;
  try { mapJson = parseWzXml(readFileSync(filePath, "utf-8")); } catch { return result; }

  const sections: any[] = mapJson?.$$;
  if (!Array.isArray(sections)) return result;

  const lifeSection = sections.find((s: any) => s.$imgdir === "life");
  if (!lifeSection?.$$) return result;

  let lifeIdx = 0;
  for (const entry of lifeSection.$$) {
    const children: any[] = entry.$$;
    if (!Array.isArray(children)) { lifeIdx++; continue; }
    let type = "", id = "", hide = false;
    for (const child of children) {
      if (child.$string === "type") type = String(child.value ?? "");
      else if (child.$string === "id") id = String(child.value ?? "");
      else if (child.$int === "hide") hide = String(child.value) === "1";
    }
    if (type === "m" && id && !hide) {
      result.set(lifeIdx, id);
    }
    lifeIdx++;
  }
  return result;
}

/** Fill spawn positions from WZ data. */
function _fillMobSpawnPositions(mapId: string, states: Map<number, ServerMobState>): void {
  const { resolve } = require("path");
  const { existsSync, readFileSync } = require("fs");
  const { parseWzXml } = require("./wz-xml.ts");
  const PROJECT_ROOT = resolve(__dirname, "../..");

  const mapIdStr = String(mapId).padStart(9, "0");
  const mapDir = `Map${mapIdStr[0]}`;
  const filePath = resolve(PROJECT_ROOT, "resourcesv3", "Map.wz", "Map", mapDir, `${mapIdStr}.img.xml`);

  if (!existsSync(filePath)) return;
  let mapJson: any;
  try { mapJson = parseWzXml(readFileSync(filePath, "utf-8")); } catch { return; }

  const sections: any[] = mapJson?.$$;
  if (!Array.isArray(sections)) return;
  const lifeSection = sections.find((s: any) => s.$imgdir === "life");
  if (!lifeSection?.$$) return;

  let lifeIdx = 0;
  for (const entry of lifeSection.$$) {
    const children: any[] = entry.$$;
    if (!Array.isArray(children)) { lifeIdx++; continue; }
    const st = states.get(lifeIdx);
    if (st) {
      for (const child of children) {
        if (child.$int === "x") { st.x = st.spawnX = Number(child.value) || 0; }
        else if (child.$int === "cy") { st.y = st.spawnY = Number(child.value) || 0; }
      }
    }
    lifeIdx++;
  }
}

/** Clear mob states when all players leave a map. */
function clearMapMobStates(mapId: string): void {
  _mapMobStates.delete(mapId);
  _mapMobIds.delete(mapId);
}

/** Tick mob respawns — call periodically (e.g. every 1s). */
function tickMobRespawns(roomManager: RoomManager): void {
  const now = Date.now();
  for (const [mapId, states] of _mapMobStates) {
    for (const [mobIdx, mob] of states) {
      if (mob.dead && mob.respawnAt > 0 && now >= mob.respawnAt) {
        mob.dead = false;
        mob.hp = mob.maxHp;
        mob.respawnAt = 0;
        // Reset to spawn position
        mob.x = mob.spawnX;
        mob.y = mob.spawnY;
        // Broadcast respawn to all clients in the map
        roomManager.broadcastToRoom(mapId, {
          type: "mob_respawn",
          mob_idx: mobIdx,
          x: mob.spawnX,
          y: mob.spawnY,
        });
      }
    }
  }
}

// ─── Stats payload builder (includes derived stats for UI) ───

function buildStatsPayload(client: WSClient): object {
  const dr = calcPlayerDamageRange(client);
  return {
    ...client.stats,
    min_damage: Math.floor(dr.min),
    max_damage: Math.floor(dr.max),
    accuracy: dr.accuracy,
    critical: 5, // beginner default 5%
  };
}

// ─── EXP table (Cosmic ExpTable.java) ───

const EXP_TABLE: number[] = [15,15,34,57,92,135,372,560,840,1144,1242,1573,2144,2800,3640,4700,5893,7360,9144,11120,13477,16268,19320,22880,27008,31477,36600,42444,48720,55813,63800,86784,98208,110932,124432,139372,155865,173280,192400,213345,235372,259392,285532,312928,342624,374760,408336,445544,483532,524160,567772,598886,631704,666321,702836,741351,781976,824828,870028,917625,967995,1021041,1076994,1136013,1198266,1263930,1333194,1406252,1483314,1564600,1650340,1740778,1836173,1936794,2042930,2154882,2272970,2397528,2528912,2667496,2813674,2967863,3130502,3302053,3483005,3673873,3875201,4087562,4311559,4547832,4797053,5059931,5337215,5629694,5938202,6263614,6606860,6968915,7350811,7753635,8178534,8626718,9099462,9598112,10124088,10678888,11264090,11881362,12532461,13219239,13943653,14707765,15513750,16363902,17260644,18206527,19204245,20256637,21366700,22537594,23772654,25075395,26449526,27898960,29427822,31040466,32741483,34535716,36428273,38424542,40530206,42751262,45094030,47565183,50171755,52921167,55821246,58880250,62106888,65510344,69100311,72887008,76881216,81094306,85594273,90225770,95170142,100385466,105886589,111689174,117809740,124265714,131075474,138258410,145834970,153826726,162256430,171148082,180526997,190419876,200854885,211861732,223471711,223471711,248635353,262260570,276632449,291791906,307782102,324648562,342439302,361204976,380999008,401877754,423900654,447130410,471633156,497478653,524740482,553496261,583827855,615821622,649568646,685165008,722712050,762316670,804091623,848155844,894634784,943660770,995373379,1049919840,1107455447,1168144006,1232158297,1299680571,1370903066,1446028554,1525246918,1608855764,1697021059];

function getExpForLevel(level: number): number {
  if (level < 0) return 15;
  if (level >= EXP_TABLE.length) return 2_000_000_000;
  return EXP_TABLE[level];
}

// ─── Weapon type → multiplier mapping (C++ CharStats::get_multiplier) ───

/** Weapon type IDs from WZ (first 2 digits of weapon item ID after 1). */
function getWeaponMultiplier(weaponItemId: number): number {
  // Weapon item IDs: 1XXYYYY where XX = weapon type category
  const cat = Math.floor(weaponItemId / 10000) % 100;
  switch (cat) {
    case 30: return 4.0;  // 1H Sword
    case 31: return 4.4;  // 1H Axe
    case 32: return 4.4;  // 1H Mace
    case 33: return 3.6;  // Dagger
    case 37: return 4.4;  // Wand
    case 38: return 4.4;  // Staff
    case 40: return 4.6;  // 2H Sword
    case 41: return 4.8;  // 2H Axe
    case 42: return 4.8;  // 2H Mace
    case 43: return 5.0;  // Spear
    case 44: return 5.0;  // Polearm
    case 45: return 3.4;  // Bow
    case 46: return 3.6;  // Crossbow
    case 47: return 3.6;  // Claw
    case 48: return 4.8;  // Knuckle
    case 49: return 3.6;  // Gun
    default: return 0.0;  // No weapon / unknown
  }
}

/** WZ-cached weapon stats: { watk } */
const _weaponStatsCache = new Map<number, { watk: number }>();

function getWeaponWatk(weaponItemId: number): number {
  if (_weaponStatsCache.has(weaponItemId)) return _weaponStatsCache.get(weaponItemId)!.watk;

  // Look up weapon in Character.wz/Weapon/0XXYYYY.img.xml → info/incPAD
  const padded = String(weaponItemId).padStart(8, "0");
  const { resolve: rp } = require("path");
  const { existsSync: ex, readFileSync: rf } = require("fs");
  const { parseWzXml: pz } = require("./wz-xml.ts");
  const PROJECT_ROOT = rp(__dirname, "../..");
  const fp = rp(PROJECT_ROOT, "resourcesv3", "Character.wz", "Weapon", `${padded}.img.xml`);

  let watk = 0;
  if (ex(fp)) {
    try {
      const json = pz(rf(fp, "utf-8"));
      const info = json?.$$?.find((s: any) => s.$imgdir === "info");
      if (info?.$$) {
        for (const child of info.$$) {
          if ((child.$int === "incPAD" || child.$short === "incPAD") && child.value) {
            watk = Number(child.value) || 0;
          }
        }
      }
    } catch {}
  }
  _weaponStatsCache.set(weaponItemId, { watk });
  return watk;
}

/** Consumable item spec cache: itemId → { hp, mp, hpR, mpR, time } */
interface ItemSpec {
  hp: number;   // flat HP restore
  mp: number;   // flat MP restore
  hpR: number;  // HP % restore (0-100 → 0.0-1.0)
  mpR: number;  // MP % restore (0-100 → 0.0-1.0)
  time: number; // buff duration in ms (-1 = instant)
  speed: number; // speed buff
  jump: number;  // jump buff
  pad: number;   // WATK buff
  pdd: number;   // WDEF buff
}
const _itemSpecCache = new Map<number, ItemSpec | null>();

function getItemSpec(itemId: number): ItemSpec | null {
  if (_itemSpecCache.has(itemId)) return _itemSpecCache.get(itemId)!;

  const prefix = String(itemId).slice(0, 4); // e.g. "0200"
  const padded = String(itemId).padStart(8, "0");
  const { resolve: rp } = require("path");
  const { existsSync: ex, readFileSync: rf } = require("fs");
  const { parseWzXml: pz } = require("./wz-xml.ts");
  const PROJECT_ROOT = rp(__dirname, "../..");
  const fp = rp(PROJECT_ROOT, "resourcesv3", "Item.wz", "Consume", `${prefix}.img.xml`);

  if (!ex(fp)) { _itemSpecCache.set(itemId, null); return null; }

  try {
    const json = pz(rf(fp, "utf-8"));
    const itemDir = json?.$$?.find((s: any) => s.$imgdir === padded);
    if (!itemDir?.$$) { _itemSpecCache.set(itemId, null); return null; }

    // Look for "specEx" first, then "spec" (matches Cosmic's ItemInformationProvider)
    let specDir = itemDir.$$.find((s: any) => s.$imgdir === "specEx");
    if (!specDir) specDir = itemDir.$$.find((s: any) => s.$imgdir === "spec");
    if (!specDir?.$$) { _itemSpecCache.set(itemId, null); return null; }

    const spec: ItemSpec = { hp: 0, mp: 0, hpR: 0, mpR: 0, time: -1, speed: 0, jump: 0, pad: 0, pdd: 0 };
    for (const child of specDir.$$) {
      const name = child.$int ?? child.$short ?? child.$string;
      const val = Number(child.value) || 0;
      if (name === "hp") spec.hp = val;
      else if (name === "mp") spec.mp = val;
      else if (name === "hpR") spec.hpR = val / 100.0;
      else if (name === "mpR") spec.mpR = val / 100.0;
      else if (name === "time") spec.time = val;
      else if (name === "speed") spec.speed = val;
      else if (name === "jump") spec.jump = val;
      else if (name === "pad") spec.pad = val;
      else if (name === "pdd") spec.pdd = val;
    }
    _itemSpecCache.set(itemId, spec);
    return spec;
  } catch {
    _itemSpecCache.set(itemId, null);
    return null;
  }
}

/**
 * Calculate player damage range — mirrors C++ CharStats::close_totalstats().
 *
 * Uses player's actual stats (level → base STR/DEX for beginners) and equipped weapon.
 * Beginner base stats: STR = 50 + level, DEX = 4, LUK = 4, INT = 4
 * accuracy = DEX * 0.8 + LUK * 0.5
 * mastery = 0.5 (beginner, no skill bonus)
 */
function calcPlayerDamageRange(client: WSClient): { min: number; max: number; accuracy: number } {
  const level = client.stats?.level ?? 1;

  // Use actual stats from PlayerStats (set via GM commands or level-up)
  const str = client.stats?.str ?? 4;
  const dex = client.stats?.dex ?? 4;
  const luk = client.stats?.luk ?? 4;
  const accuracy = Math.floor(dex * 0.8 + luk * 0.5);

  // Find equipped weapon from look.equipment
  let weaponId = 0;
  for (const eq of client.look.equipment) {
    if (eq.slot_type === "Weapon") {
      weaponId = eq.item_id;
      break;
    }
  }

  // C++ multiplier = weapon-type-specific
  const multiplier = weaponId ? getWeaponMultiplier(weaponId) : 0;

  // Total WATK = weapon base + buffs (no buffs yet)
  const watk = weaponId ? getWeaponWatk(weaponId) : 0;

  // No weapon equipped → very low damage (fist fighting)
  if (!weaponId || multiplier === 0) {
    // Bare-handed: 1 damage
    return { min: 1, max: 1 + Math.floor(level / 5), accuracy };
  }

  const primary = multiplier * str;
  const secondary = dex;
  const mastery = 0.5; // C++: mastery = 0.5 + skill_bonus; beginners have 0 skill bonus
  const atkMul = watk / 100;

  const maxdmg = (primary + secondary) * atkMul;
  const mindmg = ((primary * 0.9 * mastery) + secondary) * atkMul;

  return {
    min: Math.max(1, mindmg),
    max: Math.max(1, maxdmg),
    accuracy,
  };
}

/**
 * Calculate damage to a specific mob — mirrors C++ Mob::calculate_damage + next_damage.
 *
 * C++ Mob::calculate_mindamage (physical): damage * (1 - 0.01 * leveldelta) - wdef * 0.6
 * C++ Mob::calculate_maxdamage (physical): damage * (1 - 0.01 * leveldelta) - wdef * 0.5
 * C++ Mob::calculate_hitchance: accuracy / ((1.84 + 0.07 * leveldelta) * avoid + 1.0)
 * C++ next_damage: random in [min,max], 5% critical × 1.5, cap 999999
 */
function calcMobDamage(
  playerMin: number, playerMax: number, playerAccuracy: number, playerLevel: number,
  mobLevel: number, mobWdef: number, mobAvoid: number,
  isDegenerate: boolean,
): { damage: number; critical: boolean; miss: boolean } {
  let pmin = playerMin, pmax = playerMax;
  if (isDegenerate) { pmin /= 10; pmax /= 10; }

  let leveldelta = mobLevel - playerLevel;
  if (leveldelta < 0) leveldelta = 0;

  // C++ Mob::calculate_hitchance
  const hitchance = playerAccuracy / ((1.84 + 0.07 * leveldelta) * mobAvoid + 1.0);
  if (Math.random() > Math.max(0.01, hitchance)) {
    return { damage: 0, critical: false, miss: true };
  }

  // C++ Mob::calculate_maxdamage / calculate_mindamage (DMG_WEAPON, not magic)
  const maxd = Math.max(1, pmax * (1 - 0.01 * leveldelta) - mobWdef * 0.5);
  const mind = Math.max(1, pmin * (1 - 0.01 * leveldelta) - mobWdef * 0.6);

  let damage = mind + Math.random() * (maxd - mind);
  const critical = Math.random() < DEFAULT_CRITICAL;
  if (critical) damage *= 1.5;
  damage = Math.max(1, Math.min(999999, Math.floor(damage)));

  return { damage, critical, miss: false };
}

export interface MapDrop {
  drop_id: number;
  item_id: number;
  name: string;
  qty: number;
  x: number;          // destination X (where the drop lands)
  startX: number;     // X where the drop animation begins (mob/dropper position)
  startY: number;     // Y where the drop animation begins (dropper's position)
  destY: number;      // Y where the drop lands (foothold)
  owner_id: string;   // session ID of who dropped it
  iconKey: string;    // client icon cache key for rendering
  category: string | null;
  created_at: number; // Date.now() timestamp
  meso: boolean;      // true = meso drop (item_id = amount, qty = amount)
}

// ─── Room Manager ───────────────────────────────────────────────────

export class RoomManager {
  /** mapId → (sessionId → client) */
  rooms: Map<string, Map<string, WSClient>> = new Map();
  /** sessionId → client */
  allClients: Map<string, WSClient> = new Map();
  /** mapId → (drop_id → MapDrop) — server-authoritative drop state */
  mapDrops: Map<string, Map<number, MapDrop>> = new Map();
  /** Auto-incrementing drop ID counter */
  private _nextDropId = 1;
  /** mapId → sessionId of the mob authority (the client controlling mobs) */
  mobAuthority: Map<string, string> = new Map();

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private playerCountInterval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    // Heartbeat: disconnect inactive clients (no message for 30s)
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, client] of this.allClients) {
        if (now - client.lastActivityMs > 30_000) {
          try { client.ws.close(4003, "Inactive"); } catch {}
          this.removeClient(id);
        }
      }
    }, 10_000);

    // Periodic player count broadcast
    this.playerCountInterval = setInterval(() => {
      this.broadcastGlobal({ type: "global_player_count", count: this.getPlayerCount() });
    }, 10_000);
  }

  stop(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.playerCountInterval) clearInterval(this.playerCountInterval);
  }

  addClient(client: WSClient): void {
    // Disconnect existing connection for same session (reconnect scenario)
    const existing = this.allClients.get(client.id);
    if (existing) {
      try { existing.ws.close(4004, "Replaced by new connection"); } catch {}
      this.removeClientFromRoom(existing);
    }
    this.allClients.set(client.id, client);
    this.addClientToRoom(client, client.mapId);
  }

  /**
   * Register a client in allClients without joining any room.
   * Used on auth — client waits for change_map before joining a room.
   */
  registerClient(client: WSClient): void {
    const existing = this.allClients.get(client.id);
    if (existing) {
      try { existing.ws.close(4004, "Replaced by new connection"); } catch {}
      this.removeClientFromRoom(existing);
    }
    this.allClients.set(client.id, client);
  }

  /**
   * Server-initiated map change: remove from current room, set pending,
   * send change_map to client. Client must respond with map_loaded.
   */
  initiateMapChange(sessionId: string, newMapId: string, spawnPortal: string = ""): void {
    const client = this.allClients.get(sessionId);
    if (!client) return;

    // Leave current room (if in one)
    if (client.mapId) {
      this.removeClientFromRoom(client);
    }

    // Set pending state — client is "in limbo" until map_loaded
    client.mapId = "";
    client.pendingMapId = newMapId;
    client.pendingSpawnPortal = spawnPortal;
    client.chairId = 0;

    // Tell client to load the map
    this.sendTo(client, {
      type: "change_map",
      map_id: newMapId,
      spawn_portal: spawnPortal || null,
      gm: client.gm || undefined,
    });
  }

  /**
   * Complete a pending map change when client sends map_loaded.
   * Joins the client into the pending room.
   */
  completeMapChange(sessionId: string): boolean {
    const client = this.allClients.get(sessionId);
    if (!client || !client.pendingMapId) return false;

    const newMapId = client.pendingMapId;
    client.mapId = newMapId;
    client.pendingMapId = "";
    client.pendingSpawnPortal = "";
    // Reset position tracking — client must send new moves on the new map
    client.positionConfirmed = false;
    client.lastMoveMs = 0;

    // Join the room
    this.addClientToRoom(client, newMapId);

    // Send map_state snapshot to the joining client
    const players = this.getMapState(newMapId).filter(p => p.id !== sessionId);
    const drops = this.getDrops(newMapId);
    const isMobAuthority = this.mobAuthority.get(newMapId) === sessionId;
    const reactors = serializeReactors(newMapId);
    this.sendTo(client, { type: "map_state", players, drops, mob_authority: isMobAuthority, reactors });
    // Send server-authoritative stats to client (meso, level, hp, str, etc.)
    this.sendTo(client, { type: "stats_update", stats: buildStatsPayload(client) });

    // Broadcast player_enter to new room (exclude self)
    this.broadcastToRoom(newMapId, {
      type: "player_enter",
      id: client.id,
      name: client.name,
      x: client.x,
      y: client.y,
      action: client.action,
      facing: client.facing,
      look: client.look,
      chair_id: client.chairId,
      achievements: client.achievements,
    }, client.id);

    // Log map entry
    if (_moduleDb) appendLog(_moduleDb, client.name, `entered map ${newMapId}`, client.ip);

    return true;
  }

  removeClient(sessionId: string): void {
    const client = this.allClients.get(sessionId);
    if (!client) return;
    this.removeClientFromRoom(client);
    this.allClients.delete(sessionId);
  }

  changeRoom(sessionId: string, newMapId: string): void {
    const client = this.allClients.get(sessionId);
    if (!client) return;

    // Leave old room
    this.removeClientFromRoom(client);

    // Join new room
    client.mapId = newMapId;
    this.addClientToRoom(client, newMapId);

    // Send map_state snapshot to the joining client (players + drops + mob authority)
    const players = this.getMapState(newMapId).filter(p => p.id !== sessionId);
    const drops = this.getDrops(newMapId);
    const isMobAuthority = this.mobAuthority.get(newMapId) === sessionId;
    const reactors = serializeReactors(newMapId);
    this.sendTo(client, { type: "map_state", players, drops, mob_authority: isMobAuthority, reactors });

    // Broadcast player_enter to new room (exclude self)
    this.broadcastToRoom(newMapId, {
      type: "player_enter",
      id: client.id,
      name: client.name,
      x: client.x,
      y: client.y,
      action: client.action,
      facing: client.facing,
      look: client.look,
      chair_id: client.chairId,
      achievements: client.achievements,
    }, client.id);
  }

  broadcastToRoom(mapId: string, msg: unknown, excludeId?: string): void {
    const room = this.rooms.get(mapId);
    if (!room) return;
    const json = JSON.stringify(msg);
    for (const [id, client] of room) {
      if (id === excludeId) continue;
      try { client.ws.send(json); } catch {}
    }
  }

  broadcastGlobal(msg: unknown): void {
    const json = JSON.stringify(msg);
    for (const [, client] of this.allClients) {
      try { client.ws.send(json); } catch {}
    }
  }

  getMapState(mapId: string): Array<{
    id: string; name: string; x: number; y: number;
    action: string; facing: number; look: PlayerLook; chair_id: number;
    achievements: Record<string, any>;
  }> {
    const room = this.rooms.get(mapId);
    if (!room) return [];
    return Array.from(room.values()).map(c => ({
      id: c.id,
      name: c.name,
      x: c.x,
      y: c.y,
      action: c.action,
      facing: c.facing,
      look: c.look,
      chair_id: c.chairId,
      achievements: c.achievements,
    }));
  }

  getClient(sessionId: string): WSClient | undefined {
    return this.allClients.get(sessionId);
  }

  /** Find a connected client by character name (case-insensitive). */
  getClientByName(name: string): WSClient | undefined {
    const lower = name.toLowerCase();
    for (const client of this.allClients.values()) {
      if (client.name.toLowerCase() === lower) return client;
    }
    return undefined;
  }

  getPlayerCount(): number {
    return this.allClients.size;
  }

  // ── Drop management ──

  addDrop(mapId: string, drop: Omit<MapDrop, "drop_id" | "created_at">): MapDrop {
    const dropId = this._nextDropId++;
    const fullDrop: MapDrop = { ...drop, drop_id: dropId, created_at: Date.now() };
    let drops = this.mapDrops.get(mapId);
    if (!drops) {
      drops = new Map();
      this.mapDrops.set(mapId, drops);
    }
    drops.set(dropId, fullDrop);
    return fullDrop;
  }

  getDrop(mapId: string, dropId: number): MapDrop | null {
    return this.mapDrops.get(mapId)?.get(dropId) ?? null;
  }

  removeDrop(mapId: string, dropId: number): MapDrop | null {
    const drops = this.mapDrops.get(mapId);
    if (!drops) return null;
    const drop = drops.get(dropId);
    if (!drop) return null;
    drops.delete(dropId);
    if (drops.size === 0) this.mapDrops.delete(mapId);
    return drop;
  }

  getDrops(mapId: string): MapDrop[] {
    const drops = this.mapDrops.get(mapId);
    if (!drops) return [];
    return Array.from(drops.values());
  }

  /** Start periodic sweep for expired drops. Call once at server start. */
  startDropSweep(): void {
    setInterval(() => this.sweepExpiredDrops(), DROP_SWEEP_INTERVAL_MS);
  }

  /** Remove drops older than DROP_EXPIRE_MS, broadcast drop_expire to rooms. */
  private sweepExpiredDrops(): void {
    const now = Date.now();
    for (const [mapId, drops] of this.mapDrops) {
      const expired: number[] = [];
      for (const [dropId, drop] of drops) {
        if (now - drop.created_at >= DROP_EXPIRE_MS) {
          expired.push(dropId);
        }
      }
      for (const dropId of expired) {
        drops.delete(dropId);
        this.broadcastToRoom(mapId, { type: "drop_expire", drop_id: dropId });
      }
      if (drops.size === 0) this.mapDrops.delete(mapId);
    }
  }

  /** Start periodic reactor + mob respawn check. Call once at server start. */
  startReactorTick(): void {
    setInterval(() => {
      const respawned = tickReactorRespawns();
      for (const { mapId, reactor } of respawned) {
        this.broadcastToRoom(mapId, {
          type: "reactor_respawn",
          reactor_idx: reactor.idx,
          reactor_id: reactor.placement.reactor_id,
          x: reactor.placement.x,
          y: reactor.placement.y,
        });
      }
      // Also tick mob respawns
      tickMobRespawns(this);
    }, 1000); // check every 1s
  }

  // ── Internal ──

  private addClientToRoom(client: WSClient, mapId: string): void {
    if (!mapId) return;
    let room = this.rooms.get(mapId);
    if (!room) {
      room = new Map();
      this.rooms.set(mapId, room);
    }
    room.set(client.id, client);

    // Assign mob authority if none exists for this map
    if (!this.mobAuthority.has(mapId)) {
      this.mobAuthority.set(mapId, client.id);
    }

    // Initialize server-side mob states for this map
    initMapMobStates(mapId);
  }

  private removeClientFromRoom(client: WSClient): void {
    const mapId = client.mapId;
    const room = this.rooms.get(mapId);
    if (room) {
      room.delete(client.id);
      // Broadcast player_leave to old room
      this.broadcastToRoom(mapId, { type: "player_leave", id: client.id });

      // Reassign mob authority if the leaving client was the authority
      if (this.mobAuthority.get(mapId) === client.id) {
        this.mobAuthority.delete(mapId);
        if (room.size > 0) {
          const nextAuthority = room.values().next().value!;
          this.mobAuthority.set(mapId, nextAuthority.id);
          // Notify the new authority
          this.sendTo(nextAuthority, { type: "mob_authority", active: true });
        }
      }

      // Clean up empty rooms
      if (room.size === 0) {
        this.rooms.delete(mapId);
        clearMapMobStates(mapId);
      }
    }
  }

  sendTo(client: WSClient, msg: unknown): void {
    try { client.ws.send(JSON.stringify(msg)); } catch {}
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function sendDirect(client: WSClient, msg: unknown): void {
  try { client.ws.send(JSON.stringify(msg)); } catch {}
}

/** Handle a GM slash command from an authenticated GM client. */
function handleGmCommand(
  client: WSClient,
  command: string,
  args: string[],
  roomManager: RoomManager,
  db: Database | null,
): void {
  const reply = (text: string, ok = true) => {
    sendDirect(client, { type: "gm_response", ok, text });
  };

  switch (command) {
    case "map": {
      const mapId = args[0]?.trim();
      if (!mapId) { reply("Usage: /map <map_id>", false); break; }
      if (client.pendingMapId) { reply("Map transition already in progress.", false); break; }
      if (!mapExists(mapId)) { reply(`Map '${mapId}' not found.`, false); break; }
      roomManager.initiateMapChange(client.id, mapId, "");
      reply(`Warping to map ${mapId}...`);
      break;
    }

    case "teleport": {
      const targetName = args[0]?.trim();
      const targetMapId = args[1]?.trim();
      if (!targetName || !targetMapId) { reply("Usage: /teleport <username> <map_id>", false); break; }
      if (!mapExists(targetMapId)) { reply(`Map '${targetMapId}' not found.`, false); break; }
      // Find the target client by name (case-insensitive)
      let targetClient: WSClient | null = null;
      for (const [, c] of roomManager.allClients) {
        if (c.name.toLowerCase() === targetName.toLowerCase()) {
          targetClient = c;
          break;
        }
      }
      if (!targetClient) { reply(`Player '${targetName}' is not online.`, false); break; }
      if (targetClient.pendingMapId) { reply(`Player '${targetName}' is already changing maps.`, false); break; }
      roomManager.initiateMapChange(targetClient.id, targetMapId, "");
      reply(`Teleported ${targetClient.name} to map ${targetMapId}.`);
      sendDirect(targetClient, { type: "gm_response", ok: true, text: `You have been teleported to map ${targetMapId} by a GM.` });
      break;
    }

    case "level": {
      const lvl = parseInt(args[0], 10);
      if (!lvl || lvl < 1 || lvl > 200) { reply("Usage: /level <1-200>", false); break; }
      client.stats.level = lvl;
      client.stats.max_exp = getExpForLevel(lvl);
      client.stats.exp = 0;
      // Scale HP/MP with level (beginner formula: 50 + 20*level, 5 + 10*level)
      client.stats.max_hp = 50 + 20 * lvl;
      client.stats.hp = client.stats.max_hp;
      client.stats.max_mp = 5 + 10 * lvl;
      client.stats.mp = client.stats.max_mp;
      sendDirect(client, { type: "stats_update", stats: buildStatsPayload(client) });
      roomManager.broadcastToRoom(client.mapId, { type: "player_level_up", id: client.id, level: lvl }, client.id);
      persistClientState(client, db);
      reply(`Level set to ${lvl}. HP: ${client.stats.max_hp}, MP: ${client.stats.max_mp}`);
      break;
    }

    case "str": {
      const val = parseInt(args[0], 10);
      if (!val || val < 1 || val > 30000) { reply("Usage: /str <1-30000>", false); break; }
      client.stats.str = val;
      sendDirect(client, { type: "stats_update", stats: buildStatsPayload(client) });
      persistClientState(client, db);
      reply(`STR set to ${val}`);
      break;
    }

    case "dex": {
      const val = parseInt(args[0], 10);
      if (!val || val < 1 || val > 30000) { reply("Usage: /dex <1-30000>", false); break; }
      client.stats.dex = val;
      sendDirect(client, { type: "stats_update", stats: buildStatsPayload(client) });
      persistClientState(client, db);
      reply(`DEX set to ${val}`);
      break;
    }

    case "int": {
      const val = parseInt(args[0], 10);
      if (!val || val < 1 || val > 30000) { reply("Usage: /int <1-30000>", false); break; }
      client.stats.int = val;
      sendDirect(client, { type: "stats_update", stats: buildStatsPayload(client) });
      persistClientState(client, db);
      reply(`INT set to ${val}`);
      break;
    }

    case "luk": {
      const val = parseInt(args[0], 10);
      if (!val || val < 1 || val > 30000) { reply("Usage: /luk <1-30000>", false); break; }
      client.stats.luk = val;
      sendDirect(client, { type: "stats_update", stats: buildStatsPayload(client) });
      persistClientState(client, db);
      reply(`LUK set to ${val}`);
      break;
    }

    case "item": {
      const itemId = parseInt(args[0], 10);
      const qty = Math.max(1, parseInt(args[1], 10) || 1);
      if (!itemId) { reply("Usage: /item <item_id> [qty]", false); break; }
      addItemToInventory(client, itemId, qty, null);
      sendDirect(client, { type: "inventory_update", inventory: client.inventory });
      persistClientState(client, db);
      reply(`Added item ${itemId} x${qty} to inventory`);
      break;
    }

    case "meso": {
      const val = parseInt(args[0], 10);
      if (isNaN(val) || val < 0) { reply("Usage: /meso <amount>", false); break; }
      client.stats.meso = val;
      sendDirect(client, { type: "stats_update", stats: buildStatsPayload(client) });
      persistClientState(client, db);
      reply(`Meso set to ${val}`);
      break;
    }

    default:
      reply(`Unknown GM command: /${command}`, false);
  }
}

/**
 * Build a character save JSON from the server's tracked state for a client.
 * Used to persist on disconnect and map transitions.
 */
function buildServerSave(client: WSClient): object {
  return {
    identity: {
      gender: client.look.gender,
      skin: client.look.skin,
      face_id: client.look.face_id,
      hair_id: client.look.hair_id,
    },
    stats: { ...client.stats },
    location: {
      map_id: client.mapId || "100000001",
      spawn_portal: null,
      facing: client.facing,
    },
    equipment: client.look.equipment.map(e => ({
      slot_type: e.slot_type,
      item_id: e.item_id,
      item_name: "",
    })),
    inventory: client.inventory.map(it => ({
      item_id: it.item_id,
      qty: it.qty,
      inv_type: it.inv_type,
      slot: it.slot,
      category: it.category,
    })),
    achievements: { ...client.achievements },
    version: 1,
    saved_at: new Date().toISOString(),
  };
}

/**
 * Persist the client's tracked state to the database.
 * Called on disconnect and periodically during gameplay.
 */
export function persistClientState(client: WSClient, db: Database | null): void {
  if (!db) return;
  try {
    const save = buildServerSave(client);
    saveCharacterData(db, client.name, JSON.stringify(save));
  } catch (e) {
    console.error(`[WS] Failed to persist state for ${client.name}: ${e}`);
  }
}

// ─── Message Handler ────────────────────────────────────────────────

/** Module-level debug mode flag — set by server at startup */
let _debugMode = false;
/** Module-level database reference — set by server at startup for disconnect saves */
let _moduleDb: Database | null = null;

export function setDebugMode(enabled: boolean): void {
  _debugMode = enabled;
}

export function setDatabase(db: Database | null): void {
  _moduleDb = db;
}

export function handleClientMessage(
  client: WSClient,
  msg: { type: string; [key: string]: unknown },
  roomManager: RoomManager,
  _db: Database | null,
): void {
  switch (msg.type) {
    case "ping":
      try { client.ws.send(JSON.stringify({ type: "pong" })); } catch {}
      break;

    case "move": {
      const newX = msg.x as number;
      const newY = msg.y as number;
      const now = Date.now();

      // Velocity check: reject impossibly fast movement
      if (client.positionConfirmed && client.lastMoveMs > 0) {
        const dtS = Math.max((now - client.lastMoveMs) / 1000, 0.01);
        const dist = distance(client.x, client.y, newX, newY);
        const speed = dist / dtS;
        if (speed > MAX_MOVE_SPEED_PX_PER_S) {
          // Silently drop the move — don't update server position
          // Still relay so remote players don't freeze, but use server's last valid position
          break;
        }
      }

      client.x = newX;
      client.y = newY;
      client.action = msg.action as string;
      client.facing = msg.facing as number;
      client.lastMoveMs = now;
      client.positionConfirmed = true;

      roomManager.broadcastToRoom(client.mapId, {
        type: "player_move",
        id: client.id,
        x: client.x,
        y: client.y,
        action: client.action,
        facing: client.facing,
      }, client.id);
      break;
    }

    case "chat":
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_chat",
        id: client.id,
        name: client.name,
        text: msg.text,
      });
      if (_moduleDb) appendLog(_moduleDb, client.name, `send_message: ${String(msg.text ?? "").slice(0, 200)}`, client.ip);
      break;

    case "face":
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_face",
        id: client.id,
        expression: msg.expression,
      }, client.id);
      break;

    case "attack":
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_attack",
        id: client.id,
        stance: msg.stance,
      }, client.id);
      break;

    case "sit":
      client.action = (msg.active as boolean) ? "sit" : "stand1";
      client.chairId = (msg.active as boolean) ? (Number(msg.chair_id) || 0) : 0;
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_sit",
        id: client.id,
        active: msg.active,
        chair_id: client.chairId,
      }, client.id);
      break;

    case "prone":
      client.action = (msg.active as boolean) ? "prone" : "stand1";
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_prone",
        id: client.id,
        active: msg.active,
      }, client.id);
      break;

    case "climb":
      client.action = (msg.active as boolean) ? (msg.action as string) : "stand1";
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_climb",
        id: client.id,
        active: msg.active,
        action: msg.action,
      }, client.id);
      break;

    case "equip_change": {
      // Server-authoritative equip: client sends the action (equip/unequip) and item.
      // Server validates the item exists, moves it between inventory ↔ equipment.
      const action = msg.action as string; // "equip" or "unequip"
      const itemId = Number(msg.item_id);
      const slotType = msg.slot_type as string;

      if (action === "equip" && itemId && slotType) {
        // Validate item exists in server inventory
        const invIdx = client.inventory.findIndex(it => it.item_id === itemId);
        if (invIdx === -1) break; // client doesn't have this item

        // Remove from inventory
        const invItem = client.inventory[invIdx];
        if (invItem.qty <= 1) {
          client.inventory.splice(invIdx, 1);
        } else {
          invItem.qty--;
        }

        // If something is already in this equip slot, unequip it to inventory
        const existingIdx = client.look.equipment.findIndex(e => e.slot_type === slotType);
        if (existingIdx !== -1) {
          const oldEquip = client.look.equipment[existingIdx];
          addItemToInventory(client, oldEquip.item_id, 1, null);
          client.look.equipment.splice(existingIdx, 1);
        }

        // Equip the new item
        client.look.equipment.push({ slot_type: slotType, item_id: itemId });
      } else if (action === "unequip" && slotType) {
        // Validate item is equipped
        const equipIdx = client.look.equipment.findIndex(e => e.slot_type === slotType);
        if (equipIdx === -1) break;

        // Check inventory has room
        const removedItem = client.look.equipment[equipIdx];
        if (!hasInventorySpace(client, "EQUIP")) break; // no room

        // Move to inventory
        client.look.equipment.splice(equipIdx, 1);
        addItemToInventory(client, removedItem.item_id, 1, null);
      } else {
        break; // invalid action
      }

      // Broadcast updated equipment to room
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_equip",
        id: client.id,
        equipment: client.look.equipment,
      }, client.id);
      // Persist change
      persistClientState(client, _moduleDb);
      if (_moduleDb) {
        const equipStr = client.look.equipment.map(e => `${e.slot_type}:${e.item_id}`).join(", ");
        appendLog(_moduleDb, client.name, `equip_change: ${action} ${slotType}:${itemId}`, client.ip);
      }
      break;
    }

    case "save_state": {
      // Server-authoritative: client cannot set stats, inventory, equipment, or meso.
      // All game state is managed by the server via combat/loot/drop/equip handlers.
      // The only thing accepted from save_state is achievement merging (JQ quests).
      if (msg.achievements && typeof msg.achievements === "object") {
        const clientAch = msg.achievements as Record<string, unknown>;
        if (clientAch.jq_quests && typeof clientAch.jq_quests === "object") {
          if (!client.achievements.jq_quests || typeof client.achievements.jq_quests !== "object") {
            client.achievements.jq_quests = {};
          }
          const serverJq = client.achievements.jq_quests as Record<string, number>;
          const clientJq = clientAch.jq_quests as Record<string, number>;
          for (const [key, val] of Object.entries(clientJq)) {
            const n = Number(val);
            if (n > 0) {
              serverJq[key] = Math.max(serverJq[key] || 0, n);
            }
          }
        }
      }
      // Persist server-authoritative state to DB
      persistClientState(client, _moduleDb);
      break;
    }

    case "jump":
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_jump",
        id: client.id,
      }, client.id);
      break;

    // ── Server-authoritative map transitions ──

    case "use_portal": {
      // Client requests to use a portal — server validates and sends change_map or portal_denied
      const portalName = msg.portal_name as string;
      if (!portalName || !client.mapId) {
        sendDirect(client, { type: "portal_denied", reason: "Invalid request" });
        break;
      }

      // Must have sent at least one move to confirm position on this map
      if (!client.positionConfirmed) {
        sendDirect(client, { type: "portal_denied", reason: "Position not confirmed" });
        break;
      }

      // Don't allow portal use while already transitioning
      if (client.pendingMapId) {
        sendDirect(client, { type: "portal_denied", reason: "Already transitioning" });
        break;
      }

      // Load portal data for current map
      const mapData = getMapPortalData(client.mapId);
      if (!mapData) {
        sendDirect(client, { type: "portal_denied", reason: "Map data not found" });
        break;
      }

      // Find the portal by name
      const portal = mapData.portals.find(p => p.name === portalName);
      if (!portal) {
        sendDirect(client, { type: "portal_denied", reason: "Portal not found" });
        break;
      }

      // Must be a usable portal (not spawn point)
      if (!isUsablePortal(portal)) {
        sendDirect(client, { type: "portal_denied", reason: "Not a usable portal" });
        break;
      }

      // Anti-cheat: check player proximity to portal (using server-tracked position)
      const dist = distance(client.x, client.y, portal.x, portal.y);
      if (dist > PORTAL_RANGE_PX) {
        sendDirect(client, {
          type: "portal_denied",
          reason: `Too far from portal (${Math.round(dist)}px > ${PORTAL_RANGE_PX}px)`,
        });
        break;
      }

      // Determine destination
      let targetMapId: number;
      let targetPortalName: string;

      if (hasValidTarget(portal)) {
        // Portal has explicit target map
        targetMapId = portal.targetMapId;
        targetPortalName = portal.targetPortalName;
      } else if (mapData.info.returnMap > 0 && mapData.info.returnMap < 999999999) {
        // Use map's returnMap as fallback
        targetMapId = mapData.info.returnMap;
        targetPortalName = portal.targetPortalName;
      } else {
        sendDirect(client, { type: "portal_denied", reason: "No valid destination" });
        break;
      }

      // Validate destination map exists
      const destMapData = getMapPortalData(String(targetMapId));
      if (!destMapData) {
        sendDirect(client, { type: "portal_denied", reason: "Destination map not found" });
        break;
      }

      // All checks passed — initiate the map change
      if (_moduleDb) appendLog(_moduleDb, client.name, `used portal "${portalName}" on map ${client.mapId} → map ${targetMapId}`, client.ip);
      roomManager.initiateMapChange(client.id, String(targetMapId), targetPortalName);
      break;
    }

    case "map_loaded": {
      // Client finished loading the map the server told it to load
      if (!client.pendingMapId) break; // no pending change, ignore
      roomManager.completeMapChange(client.id);
      break;
    }

    case "npc_warp": {
      // NPC travel — server validates NPC is on the current map and destination is allowed
      const npcId = String(msg.npc_id ?? "").trim();
      const targetMapId = Number(msg.map_id ?? 0);
      if (!npcId || !targetMapId || !client.mapId) {
        sendDirect(client, { type: "portal_denied", reason: "Invalid NPC warp request" });
        break;
      }

      // Don't allow while already transitioning
      if (client.pendingMapId) {
        sendDirect(client, { type: "portal_denied", reason: "Already transitioning" });
        break;
      }

      // Verify the NPC is actually on the client's current map
      if (!isNpcOnMap(client.mapId, npcId)) {
        sendDirect(client, { type: "portal_denied", reason: "NPC not on this map" });
        break;
      }

      // Verify the destination is in the NPC's allowed destinations
      if (!isValidNpcDestination(npcId, targetMapId)) {
        sendDirect(client, { type: "portal_denied", reason: "Invalid destination for this NPC" });
        break;
      }

      // Verify destination map file exists
      if (!mapExists(String(targetMapId))) {
        sendDirect(client, { type: "portal_denied", reason: "Destination map not found" });
        break;
      }

      // All checks passed
      if (_moduleDb) appendLog(_moduleDb, client.name, `npc_warp via npc#${npcId} to map ${targetMapId}`, client.ip);
      roomManager.initiateMapChange(client.id, String(targetMapId), "");
      break;
    }

    case "jq_reward": {
      // Jump quest treasure chest / flower reward — server rolls a reward and warps player home
      const JQ_TREASURE_CHESTS: Record<string, { npcId: string; questName: string; requirePlatform: boolean }> = {
        "103000902": { npcId: "1052008", questName: "Shumi's Lost Coin", requirePlatform: false },
        "103000905": { npcId: "1052009", questName: "Shumi's Lost Bundle of Money", requirePlatform: false },
        "103000909": { npcId: "1052010", questName: "Shumi's Lost Sack of Money", requirePlatform: false },
        "105040311": { npcId: "1063000", questName: "John's Pink Flower Basket", requirePlatform: true },
        "105040313": { npcId: "1063001", questName: "John's Present", requirePlatform: true },
        "105040315": { npcId: "1043000", questName: "John's Last Present", requirePlatform: true, proximityRange: 500 },
        "101000101": { npcId: "1043000", questName: "The Forest of Patience", requirePlatform: true, proximityRange: 200 },
        "280020001": { npcId: "2032003", questName: "Breath of Lava", requirePlatform: true, proximityRange: 500 },
      };

      const jqInfo = JQ_TREASURE_CHESTS[client.mapId];
      if (!jqInfo) {
        sendDirect(client, { type: "portal_denied", reason: "No treasure chest on this map" });
        break;
      }
      if (client.pendingMapId) {
        sendDirect(client, { type: "portal_denied", reason: "Already transitioning" });
        break;
      }

      // Proximity check — player must be within range of the NPC
      if (jqInfo.requirePlatform) {
        const npc = getNpcOnMap(client.mapId, jqInfo.npcId);
        const range = (jqInfo as any).proximityRange ?? 200;
        if (npc) {
          const dist = distance(client.x, client.y, npc.x, npc.cy);
          if (dist > range) {
            sendDirect(client, { type: "jq_proximity", npc_id: jqInfo.npcId });
            break;
          }
        }
      }

      // Check inventory capacity before rolling reward
      // JQ rewards go to EQUIP or CASH tab — check both have room
      if (!hasInventorySpace(client, "EQUIP") && !hasInventorySpace(client, "CASH")) {
        sendDirect(client, {
          type: "jq_inventory_full",
        });
        break;
      }

      // Roll 50/50 equipment or cash item
      const reward = rollJqReward();
      const itemName = getItemName(reward.item_id);
      const rewardInvType = reward.category === "EQUIP" ? "EQUIP" : "CASH";

      // If the specific tab for this reward is full, reject
      if (!hasInventorySpace(client, rewardInvType)) {
        sendDirect(client, {
          type: "jq_inventory_full",
        });
        break;
      }

      // Add item to player's inventory
      const invType = reward.category === "EQUIP" ? "EQUIP" : "CASH";
      const maxSlot = client.inventory
        .filter(it => it.inv_type === invType)
        .reduce((max, it) => Math.max(max, it.slot), -1);
      client.inventory.push({
        item_id: reward.item_id,
        qty: reward.qty,
        inv_type: invType,
        slot: maxSlot + 1,
        category: reward.category === "EQUIP" ? "Weapon" : null, // generic category
      });

      // Increment achievement under jq_quests namespace
      const achKey = jqInfo.questName;
      if (!client.achievements.jq_quests || typeof client.achievements.jq_quests !== "object") {
        client.achievements.jq_quests = {};
      }
      const jqQuests = client.achievements.jq_quests as Record<string, number>;
      jqQuests[achKey] = (jqQuests[achKey] || 0) + 1;

      // Update JQ leaderboard (keyed by player name)
      if (_moduleDb) {
        incrementJqLeaderboard(_moduleDb, client.name, achKey);
      }

      // Bonus drop: Zakum Helmet (25% chance on Breath of Lava completion)
      // Only awarded if EQUIP tab has room
      let bonusItemId = 0;
      let bonusItemName = "";
      if (client.mapId === "280020001" && Math.random() < 0.25 && hasInventorySpace(client, "EQUIP")) {
        bonusItemId = 1002357; // Zakum Helmet
        bonusItemName = getItemName(bonusItemId) || "Zakum Helmet";
        const equipMaxSlot = client.inventory
          .filter(it => it.inv_type === "EQUIP")
          .reduce((max, it) => Math.max(max, it.slot), -1);
        client.inventory.push({
          item_id: bonusItemId,
          qty: 1,
          inv_type: "EQUIP",
          slot: equipMaxSlot + 1,
          category: "Cap",
        });
      }

      // Persist immediately
      persistClientState(client, _moduleDb);

      // Log JQ completion + reward
      if (_moduleDb) {
        appendLog(_moduleDb, client.name, `completed "${jqInfo.questName}" (#${jqQuests[achKey]}), received ${itemName} x${reward.qty} (${reward.category})`, client.ip);
        if (bonusItemId) {
          appendLog(_moduleDb, client.name, `bonus reward: ${bonusItemName} (Zakum Helmet)`, client.ip);
        }
      }

      // Send reward info to client
      sendDirect(client, {
        type: "jq_reward",
        quest_name: jqInfo.questName,
        item_id: reward.item_id,
        item_name: itemName,
        item_qty: reward.qty,
        item_category: reward.category,
        completions: jqQuests[achKey],
        bonus_item_id: bonusItemId || undefined,
        bonus_item_name: bonusItemName || undefined,
      });

      // Warp player back to Mushroom Park
      roomManager.initiateMapChange(client.id, "100000001", "");
      break;
    }

    case "admin_warp": {
      // Debug panel warp — only allowed when server is in debug mode
      if (!_debugMode) {
        sendDirect(client, { type: "portal_denied", reason: "Admin warp disabled" });
        break;
      }
      const warpMapId = String(msg.map_id ?? "").trim();
      if (!warpMapId) break;
      if (client.pendingMapId) break;
      if (!mapExists(warpMapId)) {
        sendDirect(client, { type: "portal_denied", reason: "Map not found" });
        break;
      }
      roomManager.initiateMapChange(client.id, warpMapId, "");
      break;
    }

    // ── GM slash commands ──
    case "gm_command": {
      if (!client.gm) {
        sendDirect(client, { type: "gm_response", ok: false, text: "You do not have GM privileges." });
        break;
      }
      const cmd = String(msg.command ?? "").trim();
      const args = (msg.args as string[]) || [];
      if (_moduleDb) appendLog(_moduleDb, client.name, `gm_command: /${cmd} ${args.join(" ")}`.trim(), client.ip);
      handleGmCommand(client, cmd, args, roomManager, _db);
      break;
    }

    case "enter_map":
    case "leave_map":
      // REMOVED: These were client-driven map transitions.
      // All map transitions must go through use_portal, npc_warp, or admin_warp.
      // Silently ignore to avoid breaking old clients during rollout.
      break;

    case "level_up": {
      const level = msg.level as number;
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_level_up",
        id: client.id,
        level,
      }, client.id);
      // Global celebration for level ≥ 10
      if (level >= 10) {
        roomManager.broadcastGlobal({
          type: "global_level_up",
          name: client.name,
          level,
        });
      }
      if (_moduleDb) appendLog(_moduleDb, client.name, `level_up to ${level}`, client.ip);
      break;
    }

    case "damage_taken": {
      if ((client.stats.hp ?? 0) <= 0) break; // already dead

      let dmg = 0;
      const mobId = msg.mob_id ? String(msg.mob_id) : null;
      const trapDmg = msg.trap_damage ? Math.floor(Number(msg.trap_damage)) : 0;

      if (mobId) {
        // Server-authoritative: look up mob attack, calculate damage
        const mobStats = getMobStats(mobId);
        if (!mobStats || !mobStats.bodyAttack) break;
        const mobAtk = mobStats.watk;
        if (mobAtk <= 0) break;

        // C++ CharStats::calculate_damage(mobatk):
        //   if (wdef == 0) return mobatk;
        //   reduceatk = mobatk / 2 + mobatk / wdef;
        //   return reduceatk - reduceatk * reducedamage;
        const playerWdef = client.stats.level ?? 1; // beginner wdef ≈ level
        if (playerWdef <= 0) {
          dmg = mobAtk;
        } else {
          dmg = Math.floor(mobAtk / 2 + mobAtk / playerWdef);
        }
      } else if (trapDmg > 0) {
        // Trap damage: capped to prevent abuse
        dmg = Math.min(trapDmg, client.stats.maxHp ?? 9999);
      } else {
        break;
      }

      dmg = Math.max(1, dmg);

      // Deduct HP
      client.stats.hp = Math.max(0, (client.stats.hp ?? 0) - dmg);

      // Send authoritative stats + calculated damage back to client
      ws.send(JSON.stringify({
        type: "stats_update",
        stats: buildStatsPayload(client),
      }));
      ws.send(JSON.stringify({
        type: "damage_result",
        damage: dmg,
      }));

      // Broadcast to other players
      const direction = msg.direction ?? 0;
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_damage",
        id: client.id,
        damage: dmg,
        direction,
      }, client.id);

      persistClientState(client, _moduleDb);
      break;
    }

    case "die":
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_die",
        id: client.id,
      }, client.id);
      if (_moduleDb) appendLog(_moduleDb, client.name, `died on map ${client.mapId}`, client.ip);
      break;

    case "respawn":
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_respawn",
        id: client.id,
      }, client.id);
      break;

    case "use_item": {
      // Server-authoritative: consume a USE item, apply spec effects (HP/MP restore)
      const useItemId = Number(msg.item_id);
      if (!useItemId) break;

      // Must be a USE item (2xxxxxxx)
      if (useItemId < 2000000 || useItemId >= 3000000) break;

      // Find in server inventory
      const useIdx = client.inventory.findIndex(it => it.item_id === useItemId);
      if (useIdx === -1) break; // don't have it

      // Check alive
      const curHp = client.stats.hp ?? 1;
      if (curHp <= 0) break;

      // Load item spec from WZ
      const spec = getItemSpec(useItemId);
      if (!spec) break; // no spec = not a consumable

      // Deduct 1 from inventory
      if (client.inventory[useIdx].qty <= 1) {
        client.inventory.splice(useIdx, 1);
      } else {
        client.inventory[useIdx].qty -= 1;
      }

      // Apply HP/MP recovery (Cosmic StatEffect.calcHPChange / calcMPChange)
      const maxHp = client.stats.maxHp ?? 50;
      const maxMp = client.stats.maxMp ?? 50;
      let hpChange = spec.hp + Math.floor(maxHp * spec.hpR);
      let mpChange = spec.mp + Math.floor(maxMp * spec.mpR);

      let newHp = Math.min(maxHp, Math.max(0, (client.stats.hp ?? 0) + hpChange));
      let newMp = Math.min(maxMp, Math.max(0, (client.stats.mp ?? 0) + mpChange));
      client.stats.hp = newHp;
      client.stats.mp = newMp;

      // Send inventory update
      ws.send(JSON.stringify({
        type: "inventory_update",
        inventory: client.inventory,
      }));

      // Send stats update
      ws.send(JSON.stringify({
        type: "stats_update",
        stats: buildStatsPayload(client),
      }));

      // Persist
      persistClientState(client, _moduleDb);
      break;
    }

    case "drop_item": {
      // Server-authoritative: validate item exists in server inventory, remove it, create drop
      const dropItemId = Number(msg.item_id);
      const dropQty = Math.max(1, Math.floor(Number(msg.qty) || 1));
      if (!dropItemId) break;

      // Find the item in server-tracked inventory
      const invIdx = client.inventory.findIndex(it => it.item_id === dropItemId);
      if (invIdx === -1) break; // client doesn't have this item — reject silently

      const invItem = client.inventory[invIdx];
      if (dropQty >= invItem.qty) {
        // Drop all — remove from inventory
        client.inventory.splice(invIdx, 1);
      } else {
        // Partial drop — reduce qty
        invItem.qty -= dropQty;
      }

      const drop = roomManager.addDrop(client.mapId, {
        item_id: dropItemId,
        name: (msg.name as string) || "",
        qty: dropQty,
        x: msg.x as number,
        startX: msg.x as number,
        startY: (msg.startY as number) || (msg.destY as number),
        destY: msg.destY as number,
        owner_id: "",
        iconKey: (msg.iconKey as string) || "",
        category: invItem.category || (msg.category as string) || null,
        meso: false,
      });
      // Broadcast to everyone in the room INCLUDING the dropper
      roomManager.broadcastToRoom(client.mapId, {
        type: "drop_spawn",
        drop,
      });
      // Persist inventory change
      persistClientState(client, _moduleDb);
      if (_moduleDb) appendLog(_moduleDb, client.name, `dropped item#${dropItemId} x${dropQty} on map ${client.mapId}`, client.ip);
      break;
    }

    case "drop_meso": {
      const mesoAmount = Math.floor(Number(msg.amount) || 0);
      if (mesoAmount <= 0) break;
      const currentMeso = client.stats.meso || 0;
      if (mesoAmount > currentMeso) break; // can't drop more than you have
      client.stats.meso = currentMeso - mesoAmount;

      const drop = roomManager.addDrop(client.mapId, {
        item_id: mesoAmount,
        name: `${mesoAmount} meso`,
        qty: mesoAmount,
        x: msg.x as number,
        startX: msg.x as number,
        startY: (msg.startY as number) || (msg.destY as number),
        destY: msg.destY as number,
        owner_id: "",
        iconKey: "",
        category: "MESO",
        meso: true,
      });
      roomManager.broadcastToRoom(client.mapId, {
        type: "drop_spawn",
        drop,
      });
      // Send updated meso balance to the dropper
      roomManager.sendTo(client, { type: "stats_update", stats: { meso: client.stats.meso } });
      persistClientState(client, _moduleDb);
      if (_moduleDb) appendLog(_moduleDb, client.name, `dropped ${mesoAmount} meso on map ${client.mapId}`, client.ip);
      break;
    }

    case "mob_state": {
      // Only accept from the mob authority for this map
      if (roomManager.mobAuthority.get(client.mapId) !== client.id) break;

      // Update server-side mob positions from authority (used for range checks)
      const mobStates = _mapMobStates.get(client.mapId);
      if (mobStates && Array.isArray(msg.mobs)) {
        for (const m of msg.mobs) {
          const st = mobStates.get(m.idx);
          if (st && !st.dead) {
            st.x = m.x;
            st.y = m.y;
          }
        }
      }

      // Relay mob state to all OTHER clients in the room
      roomManager.broadcastToRoom(client.mapId, {
        type: "mob_state",
        mobs: msg.mobs,
      }, client.id);
      break;
    }

    case "character_attack": {
      // Server-authoritative attack processing.
      // Client sends: { type: "character_attack", stance, degenerate, x, y, facing }
      // Server: finds mobs in range, calculates damage, applies HP, detects death, spawns drops.
      if (!client.mapId) break;

      const mobStates = _mapMobStates.get(client.mapId);
      if (!mobStates) break;

      const isDegenerate = !!msg.degenerate;
      const playerLevel = client.stats?.level ?? 1;
      const { min: pmin, max: pmax, accuracy: pAcc } = calcPlayerDamageRange(client);

      // Use attack position from message (client sends current pos).
      // Also update server-tracked position so it stays in sync.
      const atkX = Number(msg.x) || client.x;
      const atkY = Number(msg.y) || client.y;
      const atkFacing = Number(msg.facing) || client.facing;
      client.x = atkX;
      client.y = atkY;
      client.facing = atkFacing;
      if (!client.positionConfirmed) client.positionConfirmed = true;

      const px = atkX;
      const py = atkY;
      const facingLeft = atkFacing < 0;

      // Build weapon-specific attack hitbox from WZ Afterimage data
      let weaponId = 0;
      for (const eq of client.look.equipment) {
        if (eq.slot_type === "Weapon") { weaponId = eq.item_id; break; }
      }

      let attackRect: { l: number; r: number; t: number; b: number };
      if (weaponId) {
        const aiName = getWeaponAfterimage(weaponId);
        // Determine attack stance from client message or default
        const attackStance = (msg.stance as string) || "stabO1";
        const weaponLevel = 0; // TODO: read reqLevel from weapon WZ
        const range = aiName
          ? getAfterimageRange(aiName, attackStance, weaponLevel)
          : FALLBACK_ATTACK_RANGE;
        attackRect = buildAttackRect(px, py, facingLeft, range);
      } else {
        // Bare-handed: use barehands afterimage
        const range = getAfterimageRange("barehands", "stabO1", 0);
        attackRect = buildAttackRect(px, py, facingLeft, range);
      }

      // Find closest alive mob in range (mobcount=1 for regular attack)
      let bestIdx = -1;
      let bestDist = Infinity;
      for (const [idx, mob] of mobStates) {
        if (mob.dead) continue;
        if (mob.x < attackRect.l || mob.x > attackRect.r) continue;
        if (mob.y < attackRect.t || mob.y > attackRect.b) continue;
        const dist = Math.abs(mob.x - px) + Math.abs(mob.y - py);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      }

      // Broadcast attack animation to other players
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_attack",
        id: client.id,
        stance: msg.stance,
      }, client.id);

      if (bestIdx < 0) break; // no mob in range

      const mob = mobStates.get(bestIdx)!;

      // Look up mob WZ stats via cached mob ID map
      const mapData = getMapData(client.mapId);
      const mobIdMap = _mapMobIds.get(client.mapId);
      const mobId = mobIdMap?.get(bestIdx) ?? "";

      const mobStats = mobId ? getMobStats(mobId) : null;
      const mobLevel = mobStats?.level ?? 1;
      const mobWdef = mobStats?.wdef ?? 0;
      const mobAvoid = mobStats?.avoid ?? 0;
      const mobKnockback = mobStats?.knockback ?? 1;
      const mobExp = mobStats?.exp ?? 3;

      const result = calcMobDamage(pmin, pmax, pAcc, playerLevel, mobLevel, mobWdef, mobAvoid, isDegenerate);

      const attackerIsLeft = px < mob.x;
      let killed = false;

      if (!result.miss) {
        mob.hp -= result.damage;
        if (result.damage >= mobKnockback) {
          // Knockback will be applied client-side from the mob_damage_result
        }
        if (mob.hp <= 0) {
          mob.hp = 0;
          mob.dead = true;
          mob.respawnAt = Date.now() + MOB_RESPAWN_DELAY_MS;
          killed = true;
        }
      }

      // Broadcast damage result to ALL players in room (including attacker)
      roomManager.broadcastToRoom(client.mapId, {
        type: "mob_damage_result",
        attacker_id: client.id,
        mob_idx: bestIdx,
        damage: result.damage,
        critical: result.critical,
        miss: result.miss,
        killed,
        direction: attackerIsLeft ? 1 : -1,
        new_hp: mob.hp,
        max_hp: mob.maxHp,
        knockback: (!result.miss && result.damage >= mobKnockback) ? 1 : 0,
        exp: killed ? mobExp : 0,
      });

      // Grant EXP to killer and handle level-up
      if (killed && mobExp > 0) {
        client.stats.exp += mobExp;
        let leveledUp = false;
        // Level-up loop (can multi-level from high EXP mobs)
        while (client.stats.level < 200 && client.stats.exp >= client.stats.max_exp) {
          client.stats.exp -= client.stats.max_exp;
          client.stats.level++;
          client.stats.max_exp = getExpForLevel(client.stats.level);
          // Beginner HP/MP gain per level: +20 HP, +10 MP
          client.stats.max_hp += 20;
          client.stats.max_mp += 10;
          client.stats.hp = client.stats.max_hp;
          client.stats.mp = client.stats.max_mp;
          leveledUp = true;
        }
        // Send updated stats to the killer
        roomManager.sendTo(client, { type: "stats_update", stats: buildStatsPayload(client) });
        if (leveledUp) {
          roomManager.broadcastToRoom(client.mapId, {
            type: "player_level_up", id: client.id, level: client.stats.level,
          }, client.id);
          persistClientState(client, _moduleDb);
        }
      }

      // Spawn drops if mob killed — Cosmic-style: each entry rolled independently
      if (killed) {
        const loots = rollMobLoot(mobId, mobLevel);
        let dropIndex = 0;
        for (const loot of loots) {
          // Slight X spread so drops don't stack on top of each other.
          // index 0 → 0, 1 → +12, 2 → -12, 3 → +24, 4 → -24 ...
          const xOffset = (dropIndex === 0) ? 0
            : ((dropIndex % 2 === 1)
              ? (12 * Math.ceil(dropIndex / 2))
              : -(12 * Math.floor(dropIndex / 2)));
          const dropX = mob.x + xOffset;

          // Find ground at the drop's X.  mob.y IS the mob's foothold Y, so
          // search from that Y downward — never pick a platform above the mob.
          let destY = mob.y;
          if (mapData) {
            const groundY = findGroundY(mapData.footholds, dropX, mob.y);
            if (groundY !== null) destY = groundY;
          }

          const drop = roomManager.addDrop(client.mapId, {
            item_id: loot.item_id,
            name: loot.meso ? `${loot.qty} meso` : "",
            qty: loot.qty,
            x: dropX,
            startX: mob.x,
            startY: mob.y - 20,
            destY,
            owner_id: client.id,
            iconKey: "",
            category: loot.category,
            meso: loot.meso,
          });
          roomManager.broadcastToRoom(client.mapId, {
            type: "drop_spawn",
            drop,
          });
          dropIndex++;
        }
      }
      break;
    }

    case "loot_item": {
      const dropId = msg.drop_id as number;
      // Check loot ownership before removing
      const pendingDrop = roomManager.getDrop(client.mapId, dropId);
      if (!pendingDrop) {
        // Drop doesn't exist — tell client to remove it
        roomManager.sendTo(client, { type: "loot_failed", drop_id: dropId, reason: "not_found" });
        break;
      }

      // Loot ownership: if someone else owns this drop, they must wait 5s
      const LOOT_PROTECTION_MS = 5_000;
      if (pendingDrop.owner_id && pendingDrop.owner_id !== client.id) {
        const age = Date.now() - pendingDrop.created_at;
        if (age < LOOT_PROTECTION_MS) {
          roomManager.sendTo(client, {
            type: "loot_failed",
            drop_id: dropId,
            reason: "owned",
            owner_id: pendingDrop.owner_id,
            remaining_ms: LOOT_PROTECTION_MS - age,
          });
          break;
        }
      }

      // Meso drops don't need inventory space check
      if (!pendingDrop.meso) {
        // Check inventory capacity before allowing loot
        if (!canFitItem(client, pendingDrop.item_id, pendingDrop.qty)) {
          roomManager.sendTo(client, {
            type: "loot_failed",
            drop_id: dropId,
            reason: "inventory_full",
          });
          break;
        }
      }

      const looted = roomManager.removeDrop(client.mapId, dropId);
      if (!looted) {
        roomManager.sendTo(client, { type: "loot_failed", drop_id: dropId, reason: "already_looted" });
        break;
      }

      // Server-authoritative: update server state for looted item
      if (looted.meso) {
        // Meso: add to server-tracked balance
        client.stats.meso = (client.stats.meso || 0) + looted.qty;
      } else {
        // Item: add to server-tracked inventory
        addItemToInventory(client, looted.item_id, looted.qty, looted.category);
      }

      // Persist inventory/meso change
      persistClientState(client, _moduleDb);

      // Broadcast to ALL in room including the looter
      roomManager.broadcastToRoom(client.mapId, {
        type: "drop_loot",
        drop_id: dropId,
        looter_id: client.id,
        item_id: looted.item_id,
        name: looted.name,
        qty: looted.qty,
        category: looted.category,
        iconKey: looted.iconKey,
        meso: looted.meso,
        meso_total: looted.meso ? client.stats.meso : undefined,
      });
      if (_moduleDb) appendLog(_moduleDb, client.name, `looted ${looted.meso ? `${looted.qty} meso` : `${looted.name || `item#${looted.item_id}`} x${looted.qty}`} on map ${client.mapId}`, client.ip);
      break;
    }

    case "hit_reactor": {
      // Client attacked a reactor — server validates and applies damage
      const reactorIdx = Number(msg.reactor_idx);
      if (!client.mapId) break;

      const result = hitReactor(client.mapId, reactorIdx, client.x, client.y, client.id);
      if (!result.ok) break; // silently reject invalid hits

      if (result.destroyed) {
        // Broadcast destruction to all in room
        roomManager.broadcastToRoom(client.mapId, {
          type: "reactor_destroy",
          reactor_idx: reactorIdx,
        });
        if (_moduleDb) appendLog(_moduleDb, client.name, `destroyed reactor #${reactorIdx} on map ${client.mapId}`, client.ip);

        // Roll loot and spawn as a server drop
        const loot = rollReactorLoot();
        const reactors = getMapReactors(client.mapId);
        const reactor = reactors[reactorIdx];
        const dropX = reactor.placement.x;
        const dropY = reactor.placement.y;

        const drop = roomManager.addDrop(client.mapId, {
          item_id: loot.item_id,
          name: "",    // client resolves name from WZ
          qty: loot.qty,
          x: dropX,
          startX: dropX,      // reactor drop: no X spread
          startY: dropY - 40, // arc starts above reactor
          destY: dropY,       // client recalculates using foothold detection
          owner_id: result.majorityHitter || client.id, // majority damage dealer gets priority
          iconKey: "",        // client loads icon from WZ
          category: loot.category,
          meso: false,
        });

        roomManager.broadcastToRoom(client.mapId, {
          type: "drop_spawn",
          drop,
        });
      } else {
        // Broadcast hit to all in room (for hit animation)
        roomManager.broadcastToRoom(client.mapId, {
          type: "reactor_hit",
          reactor_idx: reactorIdx,
          new_state: result.newState,
          new_hp: result.newHp,
          hitter_id: client.id,
        });
      }
      break;
    }
  }
}
