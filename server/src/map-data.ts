/**
 * Server-side map data — portals, NPC life, NPC scripts.
 *
 * Lazy-loaded from WZ JSON files for anti-cheat validation.
 * See .memory/wz-structure.md for WZ JSON format documentation.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─── Types ──────────────────────────────────────────────────────────

export interface PortalInfo {
  index: number;
  name: string;
  /** 0=spawn, 1=visible, 2=hidden, 3=touch, 6=scripted, 7=scripted, 10=hidden-intra, 11=scripted-intra */
  type: number;
  x: number;
  y: number;
  /** 999999999 = same map / invalid */
  targetMapId: number;
  targetPortalName: string;
}

export interface NpcLifeEntry {
  /** NPC ID from Npc.wz (e.g. "1012000") */
  id: string;
  x: number;
  cy: number;
  /** Foothold ID the NPC stands on (-1 if unknown) */
  fh: number;
}

export interface MobLifeEntry {
  /** Mob ID from Mob.wz (e.g. "0100100") */
  id: string;
  x: number;
  cy: number;
  fh: number;
  /** Whether mob is hidden (hide="1") */
  hide: boolean;
}

export interface FootholdInfo {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MapInfo {
  returnMap: number;
}

export interface MapData {
  portals: PortalInfo[];
  npcs: NpcLifeEntry[];
  mobs: MobLifeEntry[];
  footholds: FootholdInfo[];
  info: MapInfo;
}

// ─── Foothold Helpers ───────────────────────────────────────────────

/**
 * Find the Y of the closest foothold at or below (x, y).
 * Returns the ground Y, or null if no foothold found.
 * Used server-side for drop landing positions.
 */
export function findGroundY(footholds: FootholdInfo[], x: number, y: number): number | null {
  let bestY: number | null = null;

  for (const fh of footholds) {
    // Skip walls (vertical segments)
    const dx = fh.x2 - fh.x1;
    if (Math.abs(dx) < 0.01) continue;

    // Check if x is within this foothold's horizontal range
    const left = Math.min(fh.x1, fh.x2);
    const right = Math.max(fh.x1, fh.x2);
    if (x < left || x > right) continue;

    // Interpolate Y at this X
    const t = (x - fh.x1) / dx;
    const groundY = fh.y1 + (fh.y2 - fh.y1) * t;

    // Must be at or below the query point
    if (groundY < y - 1) continue;

    // Keep the closest (smallest Y that's >= y)
    if (bestY === null || groundY < bestY) {
      bestY = groundY;
    }
  }

  return bestY;
}

// ─── Mob Stats (from Mob.wz) ────────────────────────────────────────

export interface MobStats {
  level: number;
  maxHP: number;
  watk: number;    // PADamage (touch attack power)
  wdef: number;    // PDDamage
  avoid: number;   // eva
  knockback: number; // pushed
  exp: number;
  bodyAttack: boolean; // whether mob deals contact damage
}

const _mobStatsCache = new Map<string, MobStats | null>();

/** Load mob stats from Mob.wz/<mobId>.img.xml. Cached per mob ID. */
export function getMobStats(mobId: string): MobStats | null {
  if (_mobStatsCache.has(mobId)) return _mobStatsCache.get(mobId)!;

  const padded = mobId.padStart(7, "0");
  const filePath = resolve(PROJECT_ROOT, "resourcesv3", "Mob.wz", `${padded}.img.xml`);

  try {
    if (!existsSync(filePath)) {
      _mobStatsCache.set(mobId, null);
      return null;
    }
    const { parseWzXml } = require("./wz-xml.ts");
    const text = readFileSync(filePath, "utf-8");
    const json = parseWzXml(text);
    const sections: any[] = json?.$$;
    if (!Array.isArray(sections)) { _mobStatsCache.set(mobId, null); return null; }

    const info = sections.find((s: any) => s.$imgdir === "info");
    if (!info?.$$) { _mobStatsCache.set(mobId, null); return null; }

    let level = 1, maxHP = 100, watk = 0, wdef = 0, avoid = 0, knockback = 1, exp = 0, bodyAttack = true;
    for (const child of info.$$) {
      const name = child.$int ?? child.$short ?? "";
      const val = Number(child.value) || 0;
      if (name === "level") level = val;
      else if (name === "maxHP") maxHP = val;
      else if (name === "PADamage") watk = val;
      else if (name === "PDDamage") wdef = val;
      else if (name === "eva") avoid = val;
      else if (name === "pushed") knockback = val;
      else if (name === "exp") exp = val;
      else if (name === "bodyAttack") bodyAttack = val !== 0;
    }

    const stats: MobStats = { level, maxHP, watk, wdef, avoid, knockback, exp, bodyAttack };
    _mobStatsCache.set(mobId, stats);
    return stats;
  } catch {
    _mobStatsCache.set(mobId, null);
    return null;
  }
}

/**
 * npcId → scriptId mapping.
 * Lazily populated from Npc.wz files on first lookup.
 * Used by JQ reward system to identify reward NPCs by script.
 */
const npcScriptCache = new Map<string, string>();

// ─── Cache ──────────────────────────────────────────────────────────

const mapDataCache = new Map<string, MapData>();
const PROJECT_ROOT = resolve(import.meta.dir, "../..");

/** Portal interaction range in pixels */
export const PORTAL_RANGE_PX = 200;

// ─── Public API ─────────────────────────────────────────────────────

export function getMapData(mapId: string): MapData | null {
  const key = String(mapId).padStart(9, "0");
  if (mapDataCache.has(key)) return mapDataCache.get(key)!;
  const data = loadMapData(key);
  if (data) mapDataCache.set(key, data);
  return data;
}

/** Backwards compat alias */
export function getMapPortalData(mapId: string): MapData | null {
  return getMapData(mapId);
}

export function mapExists(mapId: string): boolean {
  return getMapData(mapId) !== null;
}

export function findPortal(mapId: string, portalName: string): PortalInfo | null {
  const data = getMapData(mapId);
  if (!data) return null;
  return data.portals.find(p => p.name === portalName) ?? null;
}

export function isUsablePortal(portal: PortalInfo): boolean {
  return portal.type !== 0 && portal.type !== 6;
}

export function hasValidTarget(portal: PortalInfo): boolean {
  return portal.targetMapId > 0 && portal.targetMapId < 999999999;
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if a given NPC ID is placed on the specified map.
 */
export function isNpcOnMap(mapId: string, npcId: string): boolean {
  const data = getMapData(mapId);
  if (!data) return false;
  return data.npcs.some(n => n.id === npcId);
}

/**
 * Get the script ID for an NPC from Npc.wz data.
 * Returns "" if the NPC has no script or data can't be loaded.
 */
export function getNpcScriptId(npcId: string): string {
  if (npcScriptCache.has(npcId)) return npcScriptCache.get(npcId)!;
  const scriptId = loadNpcScriptId(npcId);
  npcScriptCache.set(npcId, scriptId);
  return scriptId;
}



/**
 * Get the NPC life entry for a specific NPC on a specific map.
 */
export function getNpcOnMap(mapId: string, npcId: string): NpcLifeEntry | null {
  const data = getMapData(mapId);
  if (!data) return null;
  return data.npcs.find(n => n.id === npcId) ?? null;
}

/**
 * Check if a player at (px, py) is on the same platform as an NPC.
 * "Same platform" means the player's Y is within 60px of the NPC's foothold Y,
 * and the player's X is within the foothold chain's X range (±50px tolerance).
 */
export function isOnSamePlatform(mapId: string, npcId: string, px: number, py: number): boolean {
  const data = getMapData(mapId);
  if (!data) return false;
  const npc = data.npcs.find(n => n.id === npcId);
  if (!npc || npc.fh < 0) return false;

  // Find the NPC's foothold
  const npcFh = data.footholds.find(f => f.id === npc.fh);
  if (!npcFh) return false;

  // Build connected platform: collect all footholds at the same Y level
  // that form a contiguous chain with the NPC's foothold
  const platformY = npcFh.y1; // assuming horizontal foothold
  const horizontalFhs = data.footholds.filter(f => f.y1 === platformY && f.y2 === platformY);

  // Find connected chain from NPC's foothold
  const chain = new Set<number>();
  const queue = [npcFh.id];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    if (chain.has(cur)) continue;
    chain.add(cur);
    const curFh = horizontalFhs.find(f => f.id === cur);
    if (!curFh) continue;
    // Find adjacent footholds that share an endpoint
    for (const other of horizontalFhs) {
      if (chain.has(other.id)) continue;
      if (other.x1 === curFh.x2 || other.x2 === curFh.x1) {
        queue.push(other.id);
      }
    }
  }

  // Get platform bounds
  let minX = Infinity, maxX = -Infinity;
  for (const fhId of chain) {
    const fh = horizontalFhs.find(f => f.id === fhId);
    if (!fh) continue;
    minX = Math.min(minX, fh.x1, fh.x2);
    maxX = Math.max(maxX, fh.x1, fh.x2);
  }

  const TOLERANCE_X = 50;
  const TOLERANCE_Y = 60;
  return px >= minX - TOLERANCE_X && px <= maxX + TOLERANCE_X && Math.abs(py - platformY) <= TOLERANCE_Y;
}

export function clearMapDataCache(): void {
  mapDataCache.clear();
  npcScriptCache.clear();
}

// ─── Internal: Map Loading ──────────────────────────────────────────

function loadMapData(paddedMapId: string): MapData | null {
  const prefix = paddedMapId.charAt(0);
  const relPath = `Map.wz/Map/Map${prefix}/${paddedMapId}.img.xml`;

  const fullPath = resolve(PROJECT_ROOT, "resourcesv3", relPath);
  if (existsSync(fullPath)) {
    try {
      const { parseWzXml } = require("./wz-xml.ts");
      const text = readFileSync(fullPath, "utf-8");
      const raw = parseWzXml(text);
      return parseMapData(raw);
    } catch (err) {
      console.warn(`[map-data] Failed to parse ${fullPath}: ${err}`);
    }
  }
  return null;
}

function parseMapData(mapJson: any): MapData {
  const sections: any[] = mapJson?.$$;
  if (!Array.isArray(sections)) return { portals: [], npcs: [], mobs: [], footholds: [], info: { returnMap: 999999999 } };

  // ── info section ──
  const infoSection = sections.find((s: any) => s.$imgdir === "info");
  let returnMap = 999999999;
  if (infoSection?.$$) {
    for (const child of infoSection.$$) {
      if (child.$int === "returnMap") returnMap = Number(child.value) || 999999999;
    }
  }

  // ── portal section ──
  const portalSection = sections.find((s: any) => s.$imgdir === "portal");
  const portals: PortalInfo[] = [];
  if (portalSection?.$$) {
    for (const entry of portalSection.$$) {
      const idx = Number(entry.$imgdir ?? -1);
      const children: any[] = entry.$$;
      if (!Array.isArray(children)) continue;
      const portal: PortalInfo = {
        index: idx, name: "", type: 0, x: 0, y: 0,
        targetMapId: 999999999, targetPortalName: "",
      };
      for (const child of children) {
        if (child.$string === "pn") portal.name = String(child.value ?? "");
        else if (child.$string === "tn") portal.targetPortalName = String(child.value ?? "");
        else if (child.$int === "pt") portal.type = Number(child.value) || 0;
        else if (child.$int === "x") portal.x = Number(child.value) || 0;
        else if (child.$int === "y") portal.y = Number(child.value) || 0;
        else if (child.$int === "tm") portal.targetMapId = Number(child.value) || 999999999;
      }
      portals.push(portal);
    }
  }

  // ── life section (NPCs and Mobs) ──
  const lifeSection = sections.find((s: any) => s.$imgdir === "life");
  const npcs: NpcLifeEntry[] = [];
  const mobs: MobLifeEntry[] = [];
  if (lifeSection?.$$) {
    for (const entry of lifeSection.$$) {
      const children: any[] = entry.$$;
      if (!Array.isArray(children)) continue;
      let type = "", id = "", x = 0, cy = 0, fh = -1, hide = false;
      for (const child of children) {
        if (child.$string === "type") type = String(child.value ?? "");
        else if (child.$string === "id") id = String(child.value ?? "");
        else if (child.$int === "x") x = Number(child.value) || 0;
        else if (child.$int === "cy") cy = Number(child.value) || 0;
        else if (child.$int === "fh" || child.$short === "fh") fh = Number(child.value) ?? -1;
        else if (child.$int === "hide") hide = String(child.value) === "1";
      }
      if (type === "n" && id) {
        npcs.push({ id, x, cy, fh });
      } else if (type === "m" && id) {
        mobs.push({ id, x, cy, fh, hide });
      }
    }
  }

  // ── foothold section ──
  const fhSection = sections.find((s: any) => s.$imgdir === "foothold");
  const footholds: FootholdInfo[] = [];
  if (fhSection?.$$) {
    for (const layer of fhSection.$$) {
      if (!layer?.$$) continue;
      for (const group of layer.$$) {
        if (!group?.$$) continue;
        for (const fh of group.$$) {
          if (!fh?.$$) continue;
          let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
          const fhId = Number(fh.$imgdir ?? 0);
          for (const child of fh.$$) {
            if (child.$int === "x1") x1 = Number(child.value) || 0;
            else if (child.$int === "y1") y1 = Number(child.value) || 0;
            else if (child.$int === "x2") x2 = Number(child.value) || 0;
            else if (child.$int === "y2") y2 = Number(child.value) || 0;
          }
          footholds.push({ id: fhId, x1, y1, x2, y2 });
        }
      }
    }
  }

  return { portals, npcs, mobs, footholds, info: { returnMap } };
}

// ─── Internal: NPC Script Loading ───────────────────────────────────

function loadNpcScriptId(npcId: string): string {
  const padded = String(npcId).padStart(7, "0");
  const relPath = `Npc.wz/${padded}.img.xml`;

  const fullPath = resolve(PROJECT_ROOT, "resourcesv3", relPath);
  if (existsSync(fullPath)) {
    try {
      const { parseWzXml } = require("./wz-xml.ts");
      const text = readFileSync(fullPath, "utf-8");
      const raw = parseWzXml(text);
      return parseNpcScriptId(raw);
    } catch {
      // ignore
    }
  }
  return "";
}

function parseNpcScriptId(npcJson: any): string {
  const sections: any[] = npcJson?.$$;
  if (!Array.isArray(sections)) return "";

  const infoSection = sections.find((s: any) => s.$imgdir === "info");
  if (!infoSection?.$$) return "";

  const scriptSection = infoSection.$$.find((s: any) => s.$imgdir === "script");
  if (!scriptSection?.$$) return "";

  // script/0/script = "taxi1" etc.
  const first = scriptSection.$$[0];
  if (!first?.$$) return "";

  for (const prop of first.$$) {
    if (prop.$string === "script") return String(prop.value ?? "");
  }
  return "";
}
