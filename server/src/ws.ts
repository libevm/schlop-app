/**
 * WebSocket room manager and message handler.
 *
 * Manages map-scoped rooms, relays player state between clients.
 * See .memory/shared-schema.md for full message protocol.
 */
import type { ServerWebSocket } from "bun";
import type { Database } from "bun:sqlite";

// ─── Types ──────────────────────────────────────────────────────────

export interface PlayerLook {
  gender: boolean;     // false = male, true = female
  face_id: number;
  hair_id: number;
  skin: number;
  equipment: Array<{ slot_type: string; item_id: number }>;
}

export interface WSClient {
  id: string;          // session ID
  name: string;
  mapId: string;
  ws: ServerWebSocket<WSClientData>;
  x: number;
  y: number;
  action: string;
  facing: number;
  look: PlayerLook;
  lastActivityMs: number;
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
    action: string; facing: number; look: PlayerLook;
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

// ─── Message Handler ────────────────────────────────────────────────

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

    case "move":
      client.x = msg.x as number;
      client.y = msg.y as number;
      client.action = msg.action as string;
      client.facing = msg.facing as number;
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_move",
        id: client.id,
        x: client.x,
        y: client.y,
        action: client.action,
        facing: client.facing,
      }, client.id);
      break;

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
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_sit",
        id: client.id,
        active: msg.active,
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

    case "jump":
      roomManager.broadcastToRoom(client.mapId, {
        type: "player_jump",
        id: client.id,
      }, client.id);
      break;

    case "enter_map":
      roomManager.changeRoom(client.id, msg.map_id as string);
      break;

    case "leave_map":
      roomManager.removeClient(client.id);
      client.mapId = "";
      roomManager.allClients.set(client.id, client);
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
