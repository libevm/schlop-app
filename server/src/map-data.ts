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
}

export interface MapInfo {
  returnMap: number;
}

export interface MapData {
  portals: PortalInfo[];
  npcs: NpcLifeEntry[];
  info: MapInfo;
}

// ─── NPC Script Destinations (server-authoritative) ─────────────────

export interface NpcDestination {
  label: string;
  mapId: number;
}

const VICTORIA_TOWNS: NpcDestination[] = [
  { label: "Henesys", mapId: 100000000 },
  { label: "Ellinia", mapId: 101000000 },
  { label: "Perion", mapId: 102000000 },
  { label: "Kerning City", mapId: 103000000 },
  { label: "Lith Harbor", mapId: 104000000 },
  { label: "Sleepywood", mapId: 105040300 },
  { label: "Nautilus Harbor", mapId: 120000000 },
];

const ALL_MAJOR_TOWNS: NpcDestination[] = [
  ...VICTORIA_TOWNS,
  { label: "Orbis", mapId: 200000000 },
  { label: "El Nath", mapId: 211000000 },
  { label: "Ludibrium", mapId: 220000000 },
  { label: "Aquarium", mapId: 230000000 },
  { label: "Leafre", mapId: 240000000 },
  { label: "Mu Lung", mapId: 250000000 },
  { label: "Herb Town", mapId: 251000000 },
  { label: "Ariant", mapId: 260000000 },
  { label: "Magatia", mapId: 261000000 },
  { label: "Singapore", mapId: 540000000 },
  { label: "Malaysia", mapId: 550000000 },
  { label: "New Leaf City", mapId: 600000000 },
];

const OSSYRIA_TOWNS: NpcDestination[] = [
  { label: "Orbis", mapId: 200000000 },
  { label: "El Nath", mapId: 211000000 },
  { label: "Ludibrium", mapId: 220000000 },
  { label: "Aquarium", mapId: 230000000 },
  { label: "Leafre", mapId: 240000000 },
];

/**
 * scriptId → allowed destinations.
 * Must match client-side NPC_SCRIPTS in app.js.
 */
export const NPC_SCRIPT_DESTINATIONS: Record<string, NpcDestination[]> = {
  // Victoria Island taxi NPCs
  taxi1: VICTORIA_TOWNS,
  taxi2: VICTORIA_TOWNS,
  taxi3: VICTORIA_TOWNS,
  taxi4: VICTORIA_TOWNS,
  taxi5: VICTORIA_TOWNS,
  taxi6: VICTORIA_TOWNS,
  mTaxi: VICTORIA_TOWNS,
  NLC_Taxi: [...VICTORIA_TOWNS, { label: "New Leaf City", mapId: 600000000 }],
  // Ossyria taxi
  ossyria_taxi: OSSYRIA_TOWNS,
  // Aqua taxi
  aqua_taxi: [
    { label: "Aquarium", mapId: 230000000 },
    { label: "Herb Town", mapId: 251000000 },
  ],
  // Town-specific go NPCs
  goHenesys: [{ label: "Henesys", mapId: 100000000 }],
  goElinia: [{ label: "Ellinia", mapId: 101000000 }],
  goPerion: [{ label: "Perion", mapId: 102000000 }],
  goKerningCity: [{ label: "Kerning City", mapId: 103000000 }],
  goNautilus: [{ label: "Nautilus Harbor", mapId: 120000000 }],
  go_victoria: VICTORIA_TOWNS,
  // Spinel — World Tour Guide
  world_trip: ALL_MAJOR_TOWNS,
  // Jump quest challenge NPC (Maya on map 100000001)
  jq_challenge: [
    { label: "Shumi's Lost Coin", mapId: 103000900 },
    { label: "Shumi's Lost Bundle of Money", mapId: 103000903 },
    { label: "Shumi's Lost Sack of Money", mapId: 103000906 },
    { label: "John's Pink Flower Basket", mapId: 105040310 },
    { label: "John's Present", mapId: 105040312 },
    { label: "John's Last Present", mapId: 105040314 },
    { label: "The Forest of Patience", mapId: 101000100 },
    { label: "Breath of Lava", mapId: 280020000 },
  ],
  // Jump quest exit NPCs
  subway_out: [{ label: "Leave", mapId: 100000001 }],
  flower_out: [{ label: "Leave", mapId: 100000001 }],
  herb_out: [{ label: "Leave", mapId: 100000001 }],
  Zakum06: [{ label: "Leave", mapId: 100000001 }],
};

/**
 * npcId → scriptId mapping.
 * Lazily populated from Npc.wz files on first lookup.
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
 * Get valid destinations for an NPC, considering its script.
 * Returns null if NPC has no known script / no travel destinations.
 * Falls back to ALL_MAJOR_TOWNS for NPCs with an unknown script (matching client fallback behavior).
 */
export function getNpcDestinations(npcId: string): NpcDestination[] | null {
  const scriptId = getNpcScriptId(npcId);
  if (!scriptId) return null; // NPC has no script → no travel
  const dests = NPC_SCRIPT_DESTINATIONS[scriptId];
  if (dests) return dests;
  // NPC has a script but no explicit destination table → fallback to all towns
  // (matches client buildFallbackScriptDialogue behavior)
  return ALL_MAJOR_TOWNS;
}

/**
 * Check if a specific mapId is a valid destination for the given NPC.
 */
export function isValidNpcDestination(npcId: string, targetMapId: number): boolean {
  const dests = getNpcDestinations(npcId);
  if (!dests) return false;
  return dests.some(d => d.mapId === targetMapId);
}

export function clearMapDataCache(): void {
  mapDataCache.clear();
  npcScriptCache.clear();
}

// ─── Internal: Map Loading ──────────────────────────────────────────

function loadMapData(paddedMapId: string): MapData | null {
  const prefix = paddedMapId.charAt(0);
  const relPath = `Map.wz/Map/Map${prefix}/${paddedMapId}.img.json`;

  for (const root of ["resourcesv2", "resources"]) {
    const fullPath = resolve(PROJECT_ROOT, root, relPath);
    if (!existsSync(fullPath)) continue;
    try {
      const text = readFileSync(fullPath, "utf-8");
      const raw = JSON.parse(text);
      return parseMapData(raw);
    } catch (err) {
      console.warn(`[map-data] Failed to parse ${fullPath}: ${err}`);
      continue;
    }
  }
  return null;
}

function parseMapData(mapJson: any): MapData {
  const sections: any[] = mapJson?.$$;
  if (!Array.isArray(sections)) return { portals: [], npcs: [], info: { returnMap: 999999999 } };

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

  // ── life section (NPCs only) ──
  const lifeSection = sections.find((s: any) => s.$imgdir === "life");
  const npcs: NpcLifeEntry[] = [];
  if (lifeSection?.$$) {
    for (const entry of lifeSection.$$) {
      const children: any[] = entry.$$;
      if (!Array.isArray(children)) continue;
      let type = "", id = "", x = 0, cy = 0;
      for (const child of children) {
        if (child.$string === "type") type = String(child.value ?? "");
        else if (child.$string === "id") id = String(child.value ?? "");
        else if (child.$int === "x") x = Number(child.value) || 0;
        else if (child.$int === "cy") cy = Number(child.value) || 0;
      }
      if (type === "n" && id) {
        npcs.push({ id, x, cy });
      }
    }
  }

  return { portals, npcs, info: { returnMap } };
}

// ─── Internal: NPC Script Loading ───────────────────────────────────

function loadNpcScriptId(npcId: string): string {
  const padded = String(npcId).padStart(7, "0");
  const relPath = `Npc.wz/${padded}.img.json`;

  for (const root of ["resourcesv2", "resources"]) {
    const fullPath = resolve(PROJECT_ROOT, root, relPath);
    if (!existsSync(fullPath)) continue;
    try {
      const text = readFileSync(fullPath, "utf-8");
      const raw = JSON.parse(text);
      return parseNpcScriptId(raw);
    } catch {
      continue;
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
