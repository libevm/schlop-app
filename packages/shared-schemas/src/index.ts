/**
 * @maple/shared-schemas — Canonical asset entity types, ID normalization,
 * section schemas, and API contracts for the Shlop project.
 *
 * This is the single source of truth for data contracts shared across
 * client, server, and build-assets pipeline.
 */

// ─── Asset Entity Types ─────────────────────────────────────────────

/**
 * First-class entity types recognized by the asset system.
 *
 * - map:       World maps (Map.wz)
 * - mob:       Monster definitions (Mob.wz)
 * - npc:       NPC definitions (Npc.wz)
 * - character: Player body/hair/face/equip (Character.wz)
 * - equip:     Equipment items that compose onto character
 * - effect:    Visual effects (Effect.wz, Map effects)
 * - audio:     Sound resources (Sound.wz)
 * - ui:        UI elements (UI.wz)
 * - skill:     Skill definitions (Skill.wz)
 * - reactor:   Reactor objects within maps (Reactor.wz)
 * - item:      Consumable/etc items (Item.wz)
 */
export type AssetEntityType =
  | "map"
  | "mob"
  | "npc"
  | "character"
  | "equip"
  | "effect"
  | "audio"
  | "ui"
  | "skill"
  | "reactor"
  | "item";

/** All recognized entity types as a readonly array (for runtime validation). */
export const ASSET_ENTITY_TYPES: readonly AssetEntityType[] = [
  "map",
  "mob",
  "npc",
  "character",
  "equip",
  "effect",
  "audio",
  "ui",
  "skill",
  "reactor",
  "item",
] as const;

// ─── ID Normalization ───────────────────────────────────────────────

/**
 * Canonical ID normalization rules:
 * 1. Trim whitespace
 * 2. Strip leading zeros for numeric IDs (maps, mobs, npcs, etc.)
 * 3. Preserve string IDs as-is after trimming (audio paths, UI keys)
 *
 * MapleStory uses zero-padded numeric IDs internally (e.g., "00002000"
 * for body, "100000000" for Henesys). We normalize to the minimal
 * numeric string for canonical lookups, but keep original for display.
 */
export function normalizeAssetId(id: string): string {
  const trimmed = id.trim();
  if (trimmed === "") return trimmed;

  // If purely numeric (possibly zero-padded), strip leading zeros
  if (/^\d+$/.test(trimmed)) {
    const stripped = trimmed.replace(/^0+/, "") || "0";
    return stripped;
  }

  return trimmed;
}

/**
 * Check if a raw ID string is valid for lookup (non-empty after normalization).
 */
export function isValidAssetId(id: string): boolean {
  return normalizeAssetId(id).length > 0;
}

/**
 * Check if an entity type string is a recognized AssetEntityType.
 */
export function isValidEntityType(type: string): type is AssetEntityType {
  return (ASSET_ENTITY_TYPES as readonly string[]).includes(type);
}

// ─── ID Aliases ─────────────────────────────────────────────────────

/**
 * Legacy/common alias → canonical ID mapping.
 * Used by debug tools and user-facing inputs to resolve friendly names.
 */
export const ASSET_ID_ALIASES: Readonly<Record<string, { type: AssetEntityType; id: string }>> = {
  // Maps
  henesys: { type: "map", id: "100000000" },
  ellinia: { type: "map", id: "101000000" },
  perion: { type: "map", id: "102000000" },
  kerning: { type: "map", id: "103000000" },
  lith: { type: "map", id: "104000000" },
  "lith-harbor": { type: "map", id: "104000000" },
  sleepywood: { type: "map", id: "105000000" },
  florina: { type: "map", id: "110000000" },
  "maple-island": { type: "map", id: "0" },
  mushroom: { type: "map", id: "100000000" },

  // Common mobs
  "green-snail": { type: "mob", id: "100100" },
  "blue-snail": { type: "mob", id: "100101" },
  "red-snail": { type: "mob", id: "130101" },
  shroom: { type: "mob", id: "120100" },
  stump: { type: "mob", id: "130100" },
  slime: { type: "mob", id: "210100" },
  "orange-mushroom": { type: "mob", id: "1210102" },
  "blue-mushroom": { type: "mob", id: "2220100" },

  // Common NPCs
  mai: { type: "npc", id: "10200" },
  heena: { type: "npc", id: "1012100" },
  shanks: { type: "npc", id: "1090000" },
} as const;

/**
 * Resolve a possibly-aliased ID to its canonical {type, id} pair.
 * Returns null if the alias is not recognized.
 */
export function resolveAlias(alias: string): { type: AssetEntityType; id: string } | null {
  const key = alias.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return ASSET_ID_ALIASES[key] ?? null;
}

// ─── Asset Lookup ───────────────────────────────────────────────────

/** A fully qualified asset lookup key. */
export interface AssetLookup {
  type: AssetEntityType;
  id: string;
  section?: string;
}

/**
 * Create a normalized AssetLookup.
 */
export function createAssetLookup(type: AssetEntityType, id: string, section?: string): AssetLookup {
  return {
    type,
    id: normalizeAssetId(id),
    ...(section ? { section } : {}),
  };
}

/**
 * Serialize an AssetLookup to a canonical string key.
 * Format: `type:id` or `type:id:section`
 */
export function assetLookupKey(lookup: AssetLookup): string {
  const base = `${lookup.type}:${lookup.id}`;
  return lookup.section ? `${base}:${lookup.section}` : base;
}

// ─── Section Schemas ────────────────────────────────────────────────

/**
 * Defines the required and optional sections per entity type.
 * Heavy sections (frames, audio blobs) are split for lazy loading.
 *
 * Section categories:
 * - "core":  Small metadata, always loaded first
 * - "heavy": Large payloads (frames, audio), loaded on demand
 * - "ref":   Reference/dependency lists
 */
export interface SectionSpec {
  name: string;
  required: boolean;
  category: "core" | "heavy" | "ref";
  description: string;
}

export const MAP_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "Map metadata (name, return map, field type, swim, etc.)" },
  { name: "footholds", required: true, category: "core", description: "Foothold geometry for physics collision" },
  { name: "portals", required: true, category: "core", description: "Portal positions, types, and destinations" },
  { name: "backgrounds", required: false, category: "heavy", description: "Background layer definitions (parallax, tiling)" },
  { name: "tiles", required: false, category: "heavy", description: "Per-layer tile placements" },
  { name: "objects", required: false, category: "heavy", description: "Per-layer object placements (animated/static)" },
  { name: "life", required: false, category: "ref", description: "Mob and NPC spawn definitions" },
  { name: "ladderRopes", required: false, category: "core", description: "Ladder and rope climb zones" },
  { name: "audio", required: false, category: "ref", description: "BGM path reference" },
  { name: "reactors", required: false, category: "ref", description: "Reactor spawn definitions" },
  { name: "minimap", required: false, category: "heavy", description: "Minimap image and markers" },
] as const;

export const MOB_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "Mob stats, level, exp, element attributes" },
  { name: "stances", required: true, category: "heavy", description: "Animation stance frames (stand, move, hit, die, attack)" },
  { name: "audio", required: false, category: "heavy", description: "Mob sound effects" },
] as const;

export const NPC_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "NPC metadata (name, function, script)" },
  { name: "stances", required: true, category: "heavy", description: "Animation stance frames (stand, speak, etc.)" },
  { name: "audio", required: false, category: "heavy", description: "NPC sound effects" },
] as const;

export const CHARACTER_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "Body/face/hair metadata" },
  { name: "stances", required: true, category: "heavy", description: "Action frames with layer/anchor metadata" },
  { name: "zmap", required: false, category: "core", description: "Z-order layer definitions for part composition" },
] as const;

export const EQUIP_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "Equipment stats and metadata" },
  { name: "stances", required: true, category: "heavy", description: "Equip overlay frames per action/frame with anchors" },
] as const;

export const EFFECT_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "Effect metadata (type, duration)" },
  { name: "frames", required: true, category: "heavy", description: "Effect animation frames" },
] as const;

export const AUDIO_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "Audio metadata (name, group)" },
  { name: "data", required: true, category: "heavy", description: "Audio binary blob reference" },
] as const;

export const SKILL_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "Skill metadata (name, description, max level)" },
  { name: "levels", required: true, category: "core", description: "Per-level stat data" },
  { name: "effect", required: false, category: "heavy", description: "Skill visual effect frames" },
  { name: "hit", required: false, category: "heavy", description: "Hit visual effect frames" },
] as const;

export const REACTOR_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "Reactor metadata" },
  { name: "states", required: true, category: "heavy", description: "Reactor state machine and animation frames" },
] as const;

export const ITEM_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "Item metadata (name, desc, price, type)" },
  { name: "icon", required: false, category: "heavy", description: "Item icon image" },
] as const;

export const UI_SECTIONS: readonly SectionSpec[] = [
  { name: "info", required: true, category: "core", description: "UI element metadata" },
  { name: "frames", required: false, category: "heavy", description: "UI element frames/sprites" },
] as const;

/** Section registry by entity type. */
export const ENTITY_SECTIONS: Readonly<Record<AssetEntityType, readonly SectionSpec[]>> = {
  map: MAP_SECTIONS,
  mob: MOB_SECTIONS,
  npc: NPC_SECTIONS,
  character: CHARACTER_SECTIONS,
  equip: EQUIP_SECTIONS,
  effect: EFFECT_SECTIONS,
  audio: AUDIO_SECTIONS,
  ui: UI_SECTIONS,
  skill: SKILL_SECTIONS,
  reactor: REACTOR_SECTIONS,
  item: ITEM_SECTIONS,
};

/**
 * Get the section spec for a given entity type and section name.
 * Returns null if the section is not defined for that type.
 */
export function getSectionSpec(type: AssetEntityType, sectionName: string): SectionSpec | null {
  const sections = ENTITY_SECTIONS[type];
  return sections?.find((s) => s.name === sectionName) ?? null;
}

/**
 * Get all required section names for an entity type.
 */
export function getRequiredSections(type: AssetEntityType): string[] {
  return ENTITY_SECTIONS[type]?.filter((s) => s.required).map((s) => s.name) ?? [];
}

/**
 * Validate that a section name is valid for a given entity type.
 */
export function isValidSection(type: AssetEntityType, sectionName: string): boolean {
  return getSectionSpec(type, sectionName) !== null;
}

// ─── Parsed Entity Shapes (runtime data model) ─────────────────────

/** 2D point. */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned bounding box. */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Foothold segment. */
export interface Foothold {
  id: string;
  layer: number;
  group: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  prevId: string | null;
  nextId: string | null;
}

/** Wall segment derived from vertical footholds. */
export interface WallLine {
  x: number;
  y1: number;
  y2: number;
}

/** Portal definition. */
export interface Portal {
  name: string;
  type: number;
  x: number;
  y: number;
  targetMapId: number;
  targetPortalName: string;
  id: number;
  image: string;
}

/** Portal type constants matching C++ Portal::Type enum. */
export const PortalType = {
  SPAWN: 0,
  INVISIBLE: 1,
  REGULAR: 2,
  TOUCH: 3,
  TOUCH_TYPE: 4,
  HIDDEN: 6,
  SCRIPTED_HIDDEN: 7,
  SCRIPTED: 8,
  SCRIPTED_INVISIBLE: 9,
  HIDDEN_VISIBLE: 10,
  SPRING_1: 11,
  SPRING_2: 12,
  CHANGE_MUSIC: 13,
} as const;

/** Ladder/rope definition. */
export interface LadderRope {
  id: string;
  l: number; // 1 = ladder, 0 = rope
  uf: number; // usable flag
  x: number;
  y1: number;
  y2: number;
  page: number;
}

/** Life spawn entry (mob or NPC). */
export interface LifeEntry {
  id: string;
  type: string; // "m" = mob, "n" = npc
  x: number;
  y: number;
  cy: number;
  rx0: number;
  rx1: number;
  f: number; // facing
  fh: number; // foothold
  mobTime: number;
}

/** Background layer definition. */
export interface BackgroundLayer {
  key: string;
  bS: string;
  no: string;
  ani: number;
  type: number;
  x: number;
  y: number;
  rx: number;
  ry: number;
  cx: number;
  cy: number;
  alpha: number;
  front: boolean;
  flipped: boolean;
}

/** Background type constants matching C++ Background::Type enum. */
export const BackgroundType = {
  NORMAL: 0,
  HTILED: 1,
  VTILED: 2,
  TILED: 3,
  HMOVEA: 4,
  VMOVEA: 5,
  HMOVEB: 6,
  VMOVEB: 7,
} as const;

/** Map tile placement. */
export interface TilePlacement {
  x: number;
  y: number;
  u: string;
  no: string;
  zM: number;
  key: string;
  tS: string;
  nodeId: string;
}

/** Map object placement. */
export interface ObjectPlacement {
  x: number;
  y: number;
  z: number;
  oS: string;
  l0: string;
  l1: string;
  l2: string;
  f: number;
  key: string;
  nodeId: string;
}

/** Map info metadata. */
export interface MapInfo {
  bgm?: string;
  returnMap?: number;
  forcedReturn?: number;
  fieldLimit?: number;
  swim?: number;
  VRLeft?: number;
  VRRight?: number;
  VRTop?: number;
  VRBottom?: number;
  [key: string]: unknown;
}

/** Fully parsed map data for runtime use. */
export interface ParsedMap {
  info: MapInfo;
  swim: boolean;
  backgrounds: BackgroundLayer[];
  blackBackground: boolean;
  layers: Array<{
    tiles: TilePlacement[];
    objects: ObjectPlacement[];
  }>;
  lifeEntries: LifeEntry[];
  portalEntries: Portal[];
  ladderRopes: LadderRope[];
  footholdLines: Foothold[];
  footholdById: Map<string, Foothold>;
  wallLines: WallLine[];
  walls: { left: number; right: number };
  borders: { top: number; bottom: number };
  footholdBounds: { minX: number; maxX: number };
  bounds: Bounds;
}

// ─── API Contracts ──────────────────────────────────────────────────

/** API success response envelope. */
export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data: T;
  meta?: {
    type: AssetEntityType;
    id: string;
    section?: string;
    hash?: string;
    cachedAt?: string;
  };
  correlationId?: string;
}

/** API error response envelope. */
export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  correlationId?: string;
}

/** Union type for all API responses. */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Batch request item. */
export interface BatchRequestItem {
  type: AssetEntityType;
  id: string;
  section?: string;
}

/** Batch response item. */
export interface BatchResponseItem {
  index: number;
  result: ApiResponse;
}

/** Batch response envelope. */
export interface ApiBatchResponse {
  ok: true;
  results: BatchResponseItem[];
  correlationId?: string;
}

/** API error codes. */
export const ApiErrorCode = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_TYPE: "INVALID_TYPE",
  INVALID_ID: "INVALID_ID",
  INVALID_SECTION: "INVALID_SECTION",
  BATCH_TOO_LARGE: "BATCH_TOO_LARGE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
} as const;

// ─── Schema Version ─────────────────────────────────────────────────

/** Current schema version for backward-compatibility tracking. */
export const SCHEMA_VERSION = "1.0.0";
