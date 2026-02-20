/**
 * WebSocket room manager and message handler.
 *
 * Manages map-scoped rooms, relays player state between clients.
 * See .memory/shared-schema.md for full message protocol.
 */
import type { ServerWebSocket } from "bun";
import type { Database } from "bun:sqlite";
import { saveCharacterData } from "./db.ts";
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
  PORTAL_RANGE_PX,
} from "./map-data.ts";

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
}

export interface WSClientData {
  authenticated: boolean;
  client: WSClient | null;
}

/** How long drops persist on the map before expiring (ms). MapleStory standard ~180s. */
export const DROP_EXPIRE_MS = 180_000;
/** How often the server sweeps for expired drops (ms). */
const DROP_SWEEP_INTERVAL_MS = 5_000;

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
    this.sendTo(client, { type: "map_state", players, drops, mob_authority: isMobAuthority });

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
    }, client.id);

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
    this.sendTo(client, { type: "map_state", players, drops, mob_authority: isMobAuthority });

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
    }));
  }

  getClient(sessionId: string): WSClient | undefined {
    return this.allClients.get(sessionId);
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
      if (room.size === 0) this.rooms.delete(mapId);
    }
  }

  private sendTo(client: WSClient, msg: unknown): void {
    try { client.ws.send(JSON.stringify(msg)); } catch {}
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function sendDirect(client: WSClient, msg: unknown): void {
  try { client.ws.send(JSON.stringify(msg)); } catch {}
}

/**
 * Build a character save JSON from the server's tracked state for a client.
 * Used to persist on disconnect and map transitions.
 */
function buildServerSave(client: WSClient): object {
  return {
    identity: {
      name: client.name,
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
    achievements: {
      mobs_killed: 0, maps_visited: [], portals_used: 0, items_looted: 0,
      max_level_reached: client.stats.level, total_damage_dealt: 0, deaths: 0, play_time_ms: 0,
    },
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
    saveCharacterData(db, client.id, JSON.stringify(save));
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

    case "equip_change":
      client.look.equipment = msg.equipment as Array<{ slot_type: string; item_id: number }>;
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_equip",
        id: client.id,
        equipment: client.look.equipment,
      }, client.id);
      break;

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
      roomManager.initiateMapChange(client.id, String(targetMapId), "");
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
      break;

    case "respawn":
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_respawn",
        id: client.id,
      }, client.id);
      break;

    case "drop_item": {
      // Server creates the drop, assigns unique ID, broadcasts to ALL in room
      const drop = roomManager.addDrop(client.mapId, {
        item_id: msg.item_id as number,
        name: (msg.name as string) || "",
        qty: (msg.qty as number) || 1,
        x: msg.x as number,
        startY: (msg.startY as number) || (msg.destY as number),
        destY: msg.destY as number,
        owner_id: client.id,
        iconKey: (msg.iconKey as string) || "",
        category: (msg.category as string) || null,
      });
      // Broadcast to everyone in the room INCLUDING the dropper
      // (dropper uses drop_id to replace their local drop)
      roomManager.broadcastToRoom(client.mapId, {
        type: "drop_spawn",
        drop,
      });
      break;
    }

    case "mob_state": {
      // Only accept from the mob authority for this map
      if (roomManager.mobAuthority.get(client.mapId) !== client.id) break;
      // Relay mob state to all OTHER clients in the room
      roomManager.broadcastToRoom(client.mapId, {
        type: "mob_state",
        mobs: msg.mobs,
      }, client.id);
      break;
    }

    case "mob_damage": {
      // Player hit a mob — broadcast to all including authority so it can apply damage
      roomManager.broadcastToRoom(client.mapId, {
        type: "mob_damage",
        attacker_id: client.id,
        mob_idx: msg.mob_idx,
        damage: msg.damage,
        direction: msg.direction,
      }, client.id);
      break;
    }

    case "loot_item": {
      const dropId = msg.drop_id as number;
      const looted = roomManager.removeDrop(client.mapId, dropId);
      if (!looted) break; // drop doesn't exist (already looted)
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
      break;
    }
  }
}
