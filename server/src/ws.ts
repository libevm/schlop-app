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
/** Mob respawn delay (ms). */
const MOB_RESPAWN_DELAY_MS = 7_000;
/** Attack range constants (must match client ATTACK_RANGE_X/Y). */
const ATTACK_RANGE_X = 120;
const ATTACK_RANGE_Y = 50;
/** Player damage constants (mirror client defaults). */
const WEAPON_MULTIPLIER = 4.0;
const DEFAULT_MASTERY = 0.2;
const DEFAULT_CRITICAL = 0.05;
const DEFAULT_ACCURACY = 10;
const DEFAULT_WATK = 15;

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

// ─── Server-Side Mob State ─────────────────────────────────────────

interface ServerMobState {
  hp: number;
  maxHp: number;
  x: number;
  y: number;
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
      x: 0, y: 0, // filled from WZ below
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
        if (child.$int === "x") st.x = Number(child.value) || 0;
        else if (child.$int === "cy") st.y = Number(child.value) || 0;
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
function tickMobRespawns(): void {
  const now = Date.now();
  for (const [, states] of _mapMobStates) {
    for (const [, mob] of states) {
      if (mob.dead && mob.respawnAt > 0 && now >= mob.respawnAt) {
        mob.dead = false;
        mob.hp = mob.maxHp;
        mob.respawnAt = 0;
      }
    }
  }
}

/**
 * Calculate player damage range from level (mirrors client calculatePlayerDamageRange).
 * Uses beginner stat formula: STR = 50 + level, DEX = 4.
 */
function calcPlayerDamageRange(level: number): { min: number; max: number } {
  const str = 50 + level;
  const dex = 4;
  const primary = WEAPON_MULTIPLIER * str;
  const secondary = dex;
  const multiplier = DEFAULT_WATK / 100;
  const maxdmg = (primary + secondary) * multiplier;
  const mindmg = ((primary * 0.9 * DEFAULT_MASTERY) + secondary) * multiplier;
  return { min: Math.max(1, mindmg), max: Math.max(1, maxdmg) };
}

/**
 * Calculate damage to a specific mob (mirrors client calculateMobDamage).
 * Returns { damage, critical, miss }.
 */
function calcMobDamage(
  playerMin: number, playerMax: number, playerLevel: number,
  mobLevel: number, mobWdef: number, mobAvoid: number,
  isDegenerate: boolean,
): { damage: number; critical: boolean; miss: boolean } {
  let pmin = playerMin, pmax = playerMax;
  if (isDegenerate) { pmin /= 10; pmax /= 10; }

  let leveldelta = mobLevel - playerLevel;
  if (leveldelta < 0) leveldelta = 0;

  const hitchance = DEFAULT_ACCURACY / ((1.84 + 0.07 * leveldelta) * mobAvoid + 1.0);
  if (Math.random() > Math.max(0.01, hitchance)) {
    return { damage: 0, critical: false, miss: true };
  }

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
  x: number;
  startY: number;     // Y where the drop animation begins (dropper's position)
  destY: number;      // Y where the drop lands (foothold)
  owner_id: string;   // session ID of who dropped it
  iconKey: string;    // client icon cache key for rendering
  category: string | null;
  created_at: number; // Date.now() timestamp
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
      tickMobRespawns();
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
      client.look.equipment = msg.equipment as Array<{ slot_type: string; item_id: number }>;
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_equip",
        id: client.id,
        equipment: client.look.equipment,
      }, client.id);
      if (_moduleDb) {
        const equipStr = client.look.equipment.map(e => `${e.slot_type}:${e.item_id}`).join(", ");
        appendLog(_moduleDb, client.name, `equip_change: ${equipStr}`, client.ip);
      }
      break;
    }

    case "save_state": {
      // Client sends full inventory + equipment + stats for server-side tracking.
      // Persisted to DB immediately so state survives crashes/disconnects.
      if (Array.isArray(msg.inventory)) {
        client.inventory = (msg.inventory as InventoryItem[]).map(it => ({
          item_id: Number(it.item_id) || 0,
          qty: Number(it.qty) || 1,
          inv_type: String(it.inv_type || "ETC"),
          slot: Number(it.slot) || 0,
          category: it.category ? String(it.category) : null,
        }));
      }
      if (Array.isArray(msg.equipment)) {
        client.look.equipment = (msg.equipment as Array<{ slot_type: string; item_id: number }>);
      }
      if (msg.stats && typeof msg.stats === "object") {
        const s = msg.stats as Record<string, unknown>;
        client.stats = {
          level: Number(s.level) || client.stats.level,
          job: String(s.job ?? client.stats.job),
          exp: Number(s.exp) ?? client.stats.exp,
          max_exp: Number(s.max_exp) ?? client.stats.max_exp,
          hp: Number(s.hp) ?? client.stats.hp,
          max_hp: Number(s.max_hp) ?? client.stats.max_hp,
          mp: Number(s.mp) ?? client.stats.mp,
          max_mp: Number(s.max_mp) ?? client.stats.max_mp,
          speed: Number(s.speed) ?? client.stats.speed,
          jump: Number(s.jump) ?? client.stats.jump,
          meso: Number(s.meso) ?? client.stats.meso,
        };
      }
      // Merge jq_quests from client (take max — server is authoritative but client may have offline data)
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
      // Persist to DB immediately
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

    case "damage_taken":
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_damage",
        id: client.id,
        damage: msg.damage,
        direction: msg.direction,
      }, client.id);
      break;

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

    case "drop_item": {
      // Server creates the drop, assigns unique ID, broadcasts to ALL in room
      const dropName = (msg.name as string) || "";
      const dropQty = (msg.qty as number) || 1;
      const dropItemId = msg.item_id as number;
      const drop = roomManager.addDrop(client.mapId, {
        item_id: dropItemId,
        name: dropName,
        qty: dropQty,
        x: msg.x as number,
        startY: (msg.startY as number) || (msg.destY as number),
        destY: msg.destY as number,
        owner_id: "",       // player-dropped items have no loot priority
        iconKey: (msg.iconKey as string) || "",
        category: (msg.category as string) || null,
      });
      // Broadcast to everyone in the room INCLUDING the dropper
      // (dropper uses drop_id to replace their local drop)
      roomManager.broadcastToRoom(client.mapId, {
        type: "drop_spawn",
        drop,
      });
      if (_moduleDb) appendLog(_moduleDb, client.name, `dropped ${dropName || `item#${dropItemId}`} x${dropQty} on map ${client.mapId}`, client.ip);
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
      const { min: pmin, max: pmax } = calcPlayerDamageRange(playerLevel);

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

      const rangeLeft  = facingLeft ? px - ATTACK_RANGE_X : px - 10;
      const rangeRight = facingLeft ? px + 10 : px + ATTACK_RANGE_X;
      const rangeTop   = py - ATTACK_RANGE_Y;
      const rangeBottom = py + ATTACK_RANGE_Y;

      // Find closest alive mob in range (mobcount=1 for regular attack)
      let bestIdx = -1;
      let bestDist = Infinity;
      for (const [idx, mob] of mobStates) {
        if (mob.dead) continue;
        if (mob.x < rangeLeft || mob.x > rangeRight) continue;
        if (mob.y < rangeTop || mob.y > rangeBottom) continue;
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

      const result = calcMobDamage(pmin, pmax, playerLevel, mobLevel, mobWdef, mobAvoid, isDegenerate);

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

      // Spawn drop if mob killed
      if (killed) {
        const loot = rollMobLoot();
        if (loot) {
          let destY = mob.y;
          if (mapData) {
            const groundY = findGroundY(mapData.footholds, mob.x, mob.y - 20);
            if (groundY !== null) destY = groundY;
          }
          const drop = roomManager.addDrop(client.mapId, {
            item_id: loot.item_id,
            name: "",
            qty: loot.qty,
            x: mob.x,
            startY: mob.y - 20,
            destY,
            owner_id: client.id,
            iconKey: "",
            category: loot.category,
          });
          roomManager.broadcastToRoom(client.mapId, {
            type: "drop_spawn",
            drop,
          });
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

      // Check inventory capacity before allowing loot
      if (!canFitItem(client, pendingDrop.item_id, pendingDrop.qty)) {
        roomManager.sendTo(client, {
          type: "loot_failed",
          drop_id: dropId,
          reason: "inventory_full",
        });
        break;
      }

      const looted = roomManager.removeDrop(client.mapId, dropId);
      if (!looted) {
        roomManager.sendTo(client, { type: "loot_failed", drop_id: dropId, reason: "already_looted" });
        break;
      }
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
      });
      if (_moduleDb) appendLog(_moduleDb, client.name, `looted ${looted.name || `item#${looted.item_id}`} x${looted.qty} on map ${client.mapId}`, client.ip);
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
          startY: dropY - 40, // arc starts above reactor
          destY: dropY,       // client recalculates using foothold detection
          owner_id: result.majorityHitter || client.id, // majority damage dealer gets priority
          iconKey: "",        // client loads icon from WZ
          category: loot.category,
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
