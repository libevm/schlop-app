const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("map-summary");
const copySummaryButtonEl = document.getElementById("copy-summary-button");
const mapFormEl = document.getElementById("map-form");
const mapIdInputEl = document.getElementById("map-id-input");
const teleportFormEl = document.getElementById("teleport-form");
const teleportXInputEl = document.getElementById("teleport-x-input");
const teleportYInputEl = document.getElementById("teleport-y-input");
const teleportButtonEl = document.getElementById("teleport-button");
const chatBarEl = document.getElementById("chat-bar");
const chatInputEl = document.getElementById("chat-input");
const chatLogEl = document.getElementById("chat-log");
const chatLogMessagesEl = document.getElementById("chat-log-messages");
const chatLogHandleEl = document.getElementById("chat-log-handle");
const pickupJournalEl = document.getElementById("pickup-journal");
const debugOverlayToggleEl = document.getElementById("debug-overlay-toggle");
const debugRopesToggleEl = document.getElementById("debug-ropes-toggle");
const debugFootholdsToggleEl = document.getElementById("debug-footholds-toggle");
const debugLifeToggleEl = document.getElementById("debug-life-toggle");
const debugTilesToggleEl = document.getElementById("debug-tiles-toggle");
const debugHitboxesToggleEl = document.getElementById("debug-hitboxes-toggle");
const debugUISlotsToggleEl = document.getElementById("debug-uislots-toggle");
const debugFpsToggleEl = document.getElementById("debug-fps-toggle");
const debugMouseFlyToggleEl = document.getElementById("debug-mousefly-toggle");
const statSpeedInputEl = document.getElementById("stat-speed-input");
const statJumpInputEl = document.getElementById("stat-jump-input");

const runtimeLogsEl = document.getElementById("runtime-logs");
const clearRuntimeLogsEl = document.getElementById("clear-runtime-logs-button");
const copyRuntimeLogsEl = document.getElementById("copy-runtime-logs-button");

const debugToggleEl = document.getElementById("debug-toggle");
const debugPanelEl = document.getElementById("debug-panel");
const debugCloseEl = document.getElementById("debug-close");
const settingsButtonEl = document.getElementById("settings-button");
const settingsModalEl = document.getElementById("settings-modal");
const keybindsButtonEl = document.getElementById("keybinds-button");
const settingsBgmToggleEl = document.getElementById("settings-bgm-toggle");
const settingsSfxToggleEl = document.getElementById("settings-sfx-toggle");
const settingsFixedResEl = document.getElementById("settings-fixed-res");
const settingsMinimapToggleEl = document.getElementById("settings-minimap-toggle");
const settingsLogoutBtn = document.getElementById("settings-logout-btn");
const logoutConfirmEl = document.getElementById("logout-confirm-overlay");
const logoutConfirmYesEl = document.getElementById("logout-confirm-yes");
const logoutConfirmNoEl = document.getElementById("logout-confirm-no");
const claimHudButton = document.getElementById("claim-hud-button");
const logoutConfirmTextEl = document.getElementById("logout-confirm-text");
const claimOverlayEl = document.getElementById("claim-overlay");
const claimPasswordInput = document.getElementById("claim-password-input");
const claimPasswordConfirm = document.getElementById("claim-password-confirm");
const claimErrorEl = document.getElementById("claim-error");
const claimConfirmBtn = document.getElementById("claim-confirm-btn");
const claimCancelBtn = document.getElementById("claim-cancel-btn");
const authTabLogin = document.getElementById("auth-tab-login");
const authTabCreate = document.getElementById("auth-tab-create");
const authLoginView = document.getElementById("auth-login-view");
const authCreateView = document.getElementById("auth-create-view");
const loginNameInput = document.getElementById("login-name-input");
const loginPasswordInput = document.getElementById("login-password-input");
const loginErrorEl = document.getElementById("login-error");
const loginSubmitBtn = document.getElementById("login-submit");
const canvasEl = document.getElementById("map-canvas");
const ctx = canvasEl.getContext("2d", { alpha: false, desynchronized: true }) || canvasEl.getContext("2d");
if (!ctx) {
  throw new Error("Failed to acquire 2D rendering context.");
}
ctx.imageSmoothingEnabled = false;

// ---- Runtime log system ----
const RLOG_MAX = 200;
const runtimeLogs = [];
function rlog(msg) {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
  const line = `[${ts}] ${msg}`;
  runtimeLogs.push(line);
  if (runtimeLogs.length > RLOG_MAX) runtimeLogs.shift();
  if (runtimeLogsEl) {
    runtimeLogsEl.textContent = runtimeLogs.join("\n");
    runtimeLogsEl.scrollTop = runtimeLogsEl.scrollHeight;
  }
  console.log(`[rlog] ${msg}`);
}
if (clearRuntimeLogsEl) {
  clearRuntimeLogsEl.addEventListener("click", () => {
    runtimeLogs.length = 0;
    if (runtimeLogsEl) runtimeLogsEl.textContent = "";
  });
}
if (copyRuntimeLogsEl) {
  copyRuntimeLogsEl.addEventListener("click", () => {
    const text = runtimeLogs.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      copyRuntimeLogsEl.textContent = "Copied!";
      setTimeout(() => { copyRuntimeLogsEl.textContent = "Copy"; }, 1500);
    }).catch(() => {});
  });
}

// ── V2 resource routing ──
// When active, /resources/ paths are rewritten to /resourcesv2/
// Activate via ?v2=1 query param or online mode
const _v2Params = new URLSearchParams(window.location.search);
const useV2Resources = _v2Params.get("v2") === "1" || !!window.__MAPLE_ONLINE__;

// ── Persistent browser cache for /resources/ and /resourcesv2/ ──
const RESOURCE_CACHE_NAME = "maple-resources-v1";
let _resourceCache = null;
async function getResourceCache() {
  if (!_resourceCache) {
    try { _resourceCache = await caches.open(RESOURCE_CACHE_NAME); } catch { _resourceCache = null; }
  }
  return _resourceCache;
}

async function cachedFetch(url) {
  // V2 routing: rewrite /resources/ → /resourcesv2/ when V2 mode is active
  const resolvedUrl = (useV2Resources && url.startsWith("/resources/"))
    ? url.replace("/resources/", "/resourcesv2/")
    : url;
  const cache = await getResourceCache();
  if (cache) {
    const cached = await cache.match(resolvedUrl);
    if (cached) return cached;
  }
  const response = await fetch(resolvedUrl);
  if (response.ok && cache) {
    try { await cache.put(resolvedUrl, response.clone()); } catch {}
  }
  // If V2 fails (404), fall back to /resources/ (graceful degradation)
  if (!response.ok && useV2Resources && resolvedUrl !== url) {
    const fallback = await fetch(url);
    if (fallback.ok && cache) {
      try { await cache.put(url, fallback.clone()); } catch {}
    }
    return fallback;
  }
  return response;
}

const jsonCache = new Map();
const metaCache = new Map();
const metaPromiseCache = new Map();
const imageCache = new Map();
const imagePromiseCache = new Map();
const soundDataUriCache = new Map();
const soundDataPromiseCache = new Map();

// ─── Canvas / Display ─────────────────────────────────────────────────────────
const DEFAULT_CANVAS_WIDTH = 1024;
const DEFAULT_CANVAS_HEIGHT = 768;
const FIXED_RES_WIDTH = 1024;
const FIXED_RES_HEIGHT = 768;
const MIN_CANVAS_WIDTH = 640;
const MIN_CANVAS_HEIGHT = 320;
const BG_REFERENCE_HEIGHT = 600;

/** Game viewport dimensions — fixed 1024×768 in fixedRes mode, actual canvas size otherwise. */
function gameViewWidth() {
  return runtime.settings.fixedRes ? FIXED_RES_WIDTH : canvasEl.width;
}
function gameViewHeight() {
  return runtime.settings.fixedRes ? FIXED_RES_HEIGHT : canvasEl.height;
}

const SPATIAL_BUCKET_SIZE = 256;
const SPATIAL_QUERY_MARGIN = 320;
const PERF_SAMPLE_SIZE = 120;

// ─── Player Physics (per-tick units, C++ TIMESTEP = 8ms → 125 TPS) ───────────
const PHYS_TPS = 125;
const PHYS_GRAVFORCE = 0.14;
const PHYS_FRICTION = 0.5;
const PHYS_SLOPEFACTOR = 0.1;
const PHYS_GROUNDSLIP = 3.0;
const PHYS_FALL_BRAKE = 0.025;
const PHYS_HSPEED_DEADZONE = 0.1;
const PHYS_FALL_SPEED_CAP = 670;
const PHYS_MAX_LAND_SPEED = 162.5;
const PHYS_ROPE_JUMP_HMULT = 6.0;
const PHYS_ROPE_JUMP_VDIV = 1.5;
const PHYS_CLIMB_ACTION_DELAY_MS = 200;
const PHYS_SWIMGRAVFORCE = 0.07;
const PHYS_SWIMFRICTION = 0.08;
const PHYS_SWIM_HFRICTION = 0.14;
const PHYS_FLYFORCE = 0.25;
const PHYS_SWIM_HFORCE = 0.12;
const PHYS_SWIM_JUMP_MULT = 0.8;
const PHYS_DEFAULT_SPEED_STAT = 115;
const PHYS_DEFAULT_JUMP_STAT = 110;
const PLAYER_TOUCH_HITBOX_HEIGHT = 50;
const PLAYER_TOUCH_HITBOX_HALF_WIDTH = 12;
const PLAYER_TOUCH_HITBOX_PRONE_HEIGHT = 28;
const PLAYER_TOUCH_HITBOX_PRONE_HALF_WIDTH = 18;
const TRAP_HIT_INVINCIBILITY_MS = 2000;
// C++ Player::damage knockback: hspeed = ±1.5, vforce -= 3.5 (per-tick values)
const PLAYER_KB_HSPEED = 1.5;  // per-tick horizontal speed
const PLAYER_KB_VFORCE = 3.5;  // per-tick upward impulse (applied as vforce)
// C++ Mob::update HIT stance: hforce = ±0.2 (ground) or ±0.1 (air), counter 170→200
const MOB_KB_FORCE_GROUND = 0.2;  // per-tick knockback force on ground
const MOB_KB_FORCE_AIR = 0.1;     // per-tick knockback force in air
const MOB_KB_COUNTER_START = 170;
const MOB_KB_COUNTER_END = 200;
const PLAYER_HIT_FACE_DURATION_MS = 500;
const FALL_DAMAGE_THRESHOLD = 500; // pixels of fall distance before damage kicks in
const FALL_DAMAGE_PERCENT = 0.1; // 10% of max HP per threshold exceeded

// ─── Portal / Map Transitions ─────────────────────────────────────────────────
const HIDDEN_PORTAL_REVEAL_DELAY_MS = 500;
const HIDDEN_PORTAL_FADE_IN_MS = 400;
const PORTAL_SPAWN_Y_OFFSET = 24;
const PORTAL_FADE_OUT_MS = 180;
const PORTAL_FADE_IN_MS = 240;
const PORTAL_SCROLL_MIN_MS = 180;
const PORTAL_SCROLL_MAX_MS = 560;
const PORTAL_SCROLL_SPEED_PX_PER_SEC = 3200;
const PORTAL_ANIMATION_FRAME_MS = 100;

// ─── Character / UI ───────────────────────────────────────────────────────────
const FACE_ANIMATION_SPEED = 1.6;
const DEFAULT_STANDARD_CHARACTER_WIDTH = 58;
const CHAT_BUBBLE_LINE_HEIGHT = 16;
const CHAT_BUBBLE_HORIZONTAL_PADDING = 8;
const CHAT_BUBBLE_VERTICAL_PADDING = 6;
const CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER = 3;
const STATUSBAR_HEIGHT = 0;
const STATUSBAR_BAR_HEIGHT = 14;
const STATUSBAR_PADDING_H = 10;

// ─── Persistence Keys ─────────────────────────────────────────────────────────
const TELEPORT_PRESET_CACHE_KEY = "mapleweb.debug.teleportPreset.v1";
const SETTINGS_CACHE_KEY = "mapleweb.settings.v1";
const STAT_CACHE_KEY = "mapleweb.debug.playerStats.v1";
const CHAT_LOG_HEIGHT_CACHE_KEY = "mapleweb.debug.chatLogHeight.v1";
const CHAT_LOG_COLLAPSED_KEY = "mapleweb.chatLogCollapsed.v1";
const KEYBINDS_STORAGE_KEY = "mapleweb.keybinds.v1";
const SESSION_KEY = "mapleweb.session";
const CHARACTER_SAVE_KEY = "mapleweb.character.v1";

// ─── Session ID ───────────────────────────────────────────────────────────────
function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
const sessionId = getOrCreateSessionId();

// Some map IDs are absent in the extracted client dataset. Redirect these to
// equivalent accessible maps to avoid hard 404 failures in browser play.
const MAP_ID_REDIRECTS = {
  "100000110": "910000000", // Henesys Free Market Entrance -> Free Market
};

/**
 * Camera Y offset: push scene lower on tall viewports.
 * Backgrounds designed for 600px — bias shifts camera so bottom stays consistent.
 */
function cameraHeightBias() {
  if (runtime.settings.fixedRes) return 0;
  return Math.max(0, (canvasEl.height - BG_REFERENCE_HEIGHT) / 2);
}

/**
 * Default equipment set for the character.
 * Each entry is { id, category, path } where path is relative to Character.wz.
 * Equipment IDs follow MapleStory conventions: id/10000 determines category.
 */
/**
 * Gender-aware new-character defaults. Called once at creation time.
 * After creation, face_id/hair_id/equipment are stored as character state
 * and can be changed independently (e.g. hair salon, equip swap).
 */
function newCharacterDefaults(gender) {
  const female = gender === true;
  return {
    face_id: female ? 21000 : 20000,
    hair_id: female ? 31000 : 30000,
    equipment: female
      ? [
          { id: 1041002, category: "Coat" },
          { id: 1061002, category: "Pants" },
          { id: 1072001, category: "Shoes" },
          { id: 1302000, category: "Weapon" },
        ]
      : [
          { id: 1040002, category: "Coat" },
          { id: 1060002, category: "Pants" },
          { id: 1072001, category: "Shoes" },
          { id: 1302000, category: "Weapon" },
        ],
  };
}
/** Build WZ path fragments from runtime.player.face_id / hair_id */
function playerFacePath() { return `Face/${String(runtime.player.face_id).padStart(8, "0")}.img.json`; }
function playerHairPath() { return `Hair/${String(runtime.player.hair_id).padStart(8, "0")}.img.json`; }

const runtime = {
  map: null,
  mapId: null,
  camera: { x: 0, y: 0 },
  backgroundViewAnchorY: null,
  player: {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    onGround: false,
    climbing: false,
    swimming: false,
    climbRope: null,
    climbCooldownUntil: 0,
    climbAttachTime: 0,
    downJumpIgnoreFootholdId: null,
    downJumpIgnoreUntil: 0,
    downJumpControlLock: false,
    downJumpTargetFootholdId: null,
    reattachLockUntil: 0,
    reattachLockRopeKey: null,
    footholdId: null,
    footholdLayer: 3,
    facing: -1,
    action: "stand1",
    frameIndex: 0,
    frameTimer: 0,
    bubbleText: "",
    bubbleExpiresAt: 0,
    stats: {
      speed: PHYS_DEFAULT_SPEED_STAT,
      jump: PHYS_DEFAULT_JUMP_STAT,
    },
    attacking: false,
    attackStance: "",
    attackFrameIndex: 0,
    attackFrameTimer: 0,
    attackCooldownUntil: 0,
    name: "MapleWeb",
    gender: false,
    face_id: 20000,
    hair_id: 30000,
    level: 1,
    job: "Beginner",
    hp: 50,
    maxHp: 50,
    mp: 5,
    maxMp: 5,
    exp: 0,
    maxExp: 15,
    trapInvincibleUntil: 0,
    lastTrapHitAt: 0,
    lastTrapHitDamage: 0,
    fallStartY: 0,
    knockbackClimbLockUntil: 0,
    chairId: 0,  // 0 = no chair, otherwise item ID of active chair
  },
  input: {
    enabled: false,
    left: false,
    right: false,
    up: false,
    down: false,
    jumpHeld: false,
    jumpQueued: false,
  },
  chat: {
    inputActive: false,
    history: [],
    maxHistory: 200,
  },
  mapBanner: {
    active: false,
    mapName: "",
    streetName: "",
    markName: "",
    startedAt: 0,
    showUntil: 0,
    fadeStartAt: 0,
  },
  debug: {
    overlayEnabled: true,
    showRopes: true,
    showFootholds: true,
    showTiles: false,
    showLifeMarkers: true,
    showHitboxes: false,
    showFps: true,

    mouseFly: false,
  },
  settings: {
    bgmEnabled: true,
    sfxEnabled: true,
    fixedRes: true,
    minimapVisible: true,
  },
  keybinds: {
    moveLeft: "ArrowLeft",
    moveRight: "ArrowRight",
    moveUp: "ArrowUp",
    moveDown: "ArrowDown",
    attack: "KeyC",
    jump: "Space",
    loot: "KeyZ",
    equip: "KeyE",
    inventory: "KeyI",
    keybinds: "KeyK",
    face1: "Digit1",
    face2: "Digit2",
    face3: "Digit3",
    face4: "Digit4",
    face5: "Digit5",
    face6: "Digit6",
    face7: "Digit7",
    face8: "Digit8",
    face9: "Digit9",
  },
  mouseWorld: { x: 0, y: 0 },
  characterData: null,
  characterHeadData: null,
  characterFaceData: null,
  characterHairData: null,
  characterEquipData: {},  // keyed by equip id → parsed JSON
  faceAnimation: {
    expression: "default",
    frameIndex: 0,
    frameTimerMs: 0,
    blinkCooldownMs: 2200,
    overrideExpression: null,
    overrideUntilMs: 0,
  },
  zMapOrder: {},
  characterDataPromise: null,
  lastRenderableCharacterFrame: null,
  lastCharacterBounds: null,
  standardCharacterWidth: DEFAULT_STANDARD_CHARACTER_WIDTH,
  perf: {
    updateMs: 0,
    renderMs: 0,
    frameMs: 0,
    loopIntervalMs: 0,
    samples: new Array(PERF_SAMPLE_SIZE).fill(0),
    sampleCursor: 0,
    sampleCount: 0,
    drawCalls: 0,
    culledSprites: 0,
    tilesDrawn: 0,
    objectsDrawn: 0,
    lifeDrawn: 0,
    portalsDrawn: 0,
    reactorsDrawn: 0,
  },

  audioUnlocked: false,
  bgmAudio: null,
  currentBgmPath: null,
  loading: {
    active: false,
    total: 0,
    loaded: 0,
    progress: 0,
    label: "",
  },
  audioDebug: {
    lastSfx: null,
    lastSfxAtMs: 0,
    sfxPlayCount: 0,
    lastBgm: null,
  },
  mapLoadToken: 0,
  portalCooldownUntil: 0,
  portalWarpInProgress: false,
  hiddenPortalState: new Map(),
  transition: {
    alpha: 0,
    active: false,
  },
  portalScroll: {
    active: false,
    startX: 0,
    startY: 0,
    targetX: 0,
    targetY: 0,
    elapsedMs: 0,
    durationMs: 0,
  },
  portalAnimation: {
    regularFrameIndex: 0,
    regularTimerMs: 0,
    hiddenFrameIndex: 0,
    hiddenTimerMs: 0,
  },
  previousTimestampMs: null,
  tickAccumulatorMs: 0,

  // NPC dialogue state
  npcDialogue: {
    active: false,
    npcName: "",
    npcFunc: "",
    lines: [],        // all dialogue lines (each can be string or { text, options })
    lineIndex: 0,     // current line being shown
    npcWorldX: 0,
    npcWorldY: 0,
    npcIdx: -1,       // lifeEntry index of the NPC being talked to
    hoveredOption: -1, // which option is hovered (-1 = none)
    scriptId: "",      // NPC script identifier (from Npc.wz info/script)
  },
};

// ─── In-game UI Windows (Equipment + Inventory) ─────────────────────────────

const equipWindowEl = document.getElementById("equip-window");
const inventoryWindowEl = document.getElementById("inventory-window");
const keybindsWindowEl = document.getElementById("keybinds-window");
const equipGridEl = document.getElementById("equip-grid");
const invGridEl = document.getElementById("inv-grid");
const keybindsGridEl = document.getElementById("keybinds-grid");
const uiTooltipEl = document.getElementById("ui-tooltip");
const openKeybindsBtnEl = document.getElementById("open-keybinds-btn");

// Equip slots as flat 4-column grid
const EQUIP_SLOT_LIST = [
  { type: "Cap",       label: "Hat" },
  { type: "Cape",      label: "Cape" },
  { type: "Coat",      label: "Top" },
  { type: "Shield",    label: "Shield" },
  { type: "Glove",     label: "Gloves" },
  { type: "Pants",     label: "Bottom" },
  { type: "Shoes",     label: "Shoes" },
  { type: "Weapon",    label: "Weapon" },
];

const INV_COLS = 4;
const INV_ROWS = 8;
const INV_MAX_SLOTS = INV_COLS * INV_ROWS; // 32 slots per tab

/** Player equipment slots — maps category to { id, name, iconSrc } */
const playerEquipped = new Map();

/** Player inventory — array of { id, name, qty, iconKey, invType, category, slot } */
const playerInventory = [];

/** Find the first free slot index (0..INV_MAX_SLOTS-1) for a given tab type. Returns -1 if full. */
function findFreeSlot(invType) {
  const occupied = new Set();
  for (const it of playerInventory) {
    if (it.invType === invType) occupied.add(it.slot);
  }
  for (let s = 0; s < INV_MAX_SLOTS; s++) {
    if (!occupied.has(s)) return s;
  }
  return -1;
}

/** Selected/dragged item state */
const draggedItem = {
  active: false,
  source: null,     // "inventory" | "equip"
  sourceIndex: -1,  // inventory index or equip slot type
  id: 0,
  name: "",
  qty: 0,
  iconKey: null,
  category: null,   // for equip items
};

// ── Inventory type / equip category helpers (C++ parity) ──

// C++ InventoryType::by_item_id — prefix = id / 1000000
const INV_TABS = ["EQUIP", "USE", "SETUP", "ETC", "CASH"];
let currentInvTab = "EQUIP";

function inventoryTypeById(itemId) {
  const prefix = Math.floor(itemId / 1000000);
  const types = [null, "EQUIP", "USE", "SETUP", "ETC", "CASH"];
  return types[prefix] || null;
}

/** Default stack sizes when WZ slotMax is not available */
const DEFAULT_SLOT_MAX_CONSUME = 100;
const DEFAULT_SLOT_MAX_ETC = 100;
const DEFAULT_SLOT_MAX_SETUP = 100;

/**
 * Get max stack size for an item.
 * Equipment is always 1 (unique per slot). Consumables/Etc/Setup read from
 * WZ info.slotMax or fall back to category defaults.
 */
function getItemSlotMax(itemId) {
  const invType = inventoryTypeById(itemId);
  if (invType === "EQUIP") return 1; // equipment is always unique
  // Check WZ cache for slotMax
  const wzInfo = _itemWzInfoCache[itemId];
  if (wzInfo?.info?.slotMax) return parseInt(wzInfo.info.slotMax, 10) || DEFAULT_SLOT_MAX_ETC;
  // Defaults by category
  if (invType === "USE") return DEFAULT_SLOT_MAX_CONSUME;
  if (invType === "SETUP") return DEFAULT_SLOT_MAX_SETUP;
  if (invType === "ETC") return DEFAULT_SLOT_MAX_ETC;
  return DEFAULT_SLOT_MAX_ETC;
}

/** Check if an item is stackable (non-equipment) */
function isItemStackable(itemId) {
  return inventoryTypeById(itemId) !== "EQUIP";
}

// WZ folder from equip item ID — maps id prefix to Character.wz subfolder
function equipWzCategoryFromId(id) {
  const p = Math.floor(id / 10000);
  if (p === 100) return "Cap";
  if (p >= 101 && p <= 103) return "Accessory";
  if (p === 104) return "Coat";
  if (p === 105) return "Longcoat";
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p === 111) return "Ring";
  if (p >= 130 && p <= 170) return "Weapon";
  return null;
}

// Equip slot key (for playerEquipped map) from equip item ID
// C++ EquipData determines slot from index = id/10000 - 100
function equipSlotFromId(id) {
  const p = Math.floor(id / 10000);
  if (p === 100) return "Cap";
  if (p === 104 || p === 105) return "Coat"; // Top + Overall share Coat slot
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p >= 130 && p <= 170) return "Weapon";
  return null;
}

/** Ground drops — items on the map floor */
const groundDrops = [];
// Each: { drop_id, id, name, qty, iconKey, x, y, vy, onGround, opacity, angle, bobPhase, spawnTime, destY, category, pickingUp, pickupStart }
let _localDropIdCounter = -1; // negative IDs for local drops (offline / before server assigns ID)

const DROP_PICKUP_RANGE = 50;   // C++ uses drop bounds(32x32) at player pos
const DROP_BOB_SPEED = 0.025;   // C++ moved += 0.025 per tick
const DROP_BOB_AMP = 2.5;       // C++ cos(moved) * 2.5
const DROP_SPAWN_VSPEED = -7.9; // scaled to match original peak height with faster gravity
const DROP_SPINSTEP = 0.3;      // spin per tick while airborne
const DROP_PHYS_GRAVITY = 0.35; // 2.5x gravity for snappier landing
const DROP_PHYS_TERMINAL_VY = 12;// terminal fall speed
const LOOT_ANIM_DURATION = 400; // ms — pickup fly animation
const DROP_EXPIRE_MS = 180_000; // 180s — drops disappear after this (C++ server standard)
const DROP_EXPIRE_FADE_MS = 2000; // 2s fade-out animation before removal

/** Icon data URI cache */
const iconDataUriCache = new Map();

function getIconDataUri(key) {
  return iconDataUriCache.get(key) ?? null;
}

function loadEquipIcon(equipId, category) {
  const padded = String(equipId).padStart(8, "0");
  const key = `equip-icon:${equipId}`;
  if (iconDataUriCache.has(key)) return key;
  iconDataUriCache.set(key, null);
  const path = `/resources/Character.wz/${category}/${padded}.img.json`;
  fetchJson(path).then((json) => {
    if (!json?.$$) return;
    const infoNode = json.$$.find(c => c.$imgdir === "info");
    if (!infoNode?.$$) return;
    const iconNode = infoNode.$$.find(c => c.$canvas === "icon" || c.$canvas === "iconRaw");
    if (iconNode?.basedata) {
      iconDataUriCache.set(key, `data:image/png;base64,${iconNode.basedata}`);
      refreshUIWindows();
    }
  }).catch(() => {});
  return key;
}

function loadItemIcon(itemId) {
  const key = `item-icon:${itemId}`;
  if (iconDataUriCache.has(key)) return key;
  iconDataUriCache.set(key, null);
  const idStr = String(itemId).padStart(8, "0");
  const prefix = idStr.substring(0, 4);
  let wzPath;
  if (itemId >= 2000000 && itemId < 3000000) {
    wzPath = `/resources/Item.wz/Consume/${prefix}.img.json`;
  } else if (itemId >= 3000000 && itemId < 4000000) {
    wzPath = `/resources/Item.wz/Install/${prefix}.img.json`;
  } else if (itemId >= 4000000 && itemId < 5000000) {
    wzPath = `/resources/Item.wz/Etc/${prefix}.img.json`;
  } else if (itemId >= 5000000 && itemId < 6000000) {
    wzPath = `/resources/Item.wz/Cash/${prefix}.img.json`;
  } else { return key; }
  fetchJson(wzPath).then((json) => {
    if (!json?.$$) return;
    const itemNode = json.$$.find(c => c.$imgdir === idStr);
    if (!itemNode?.$$) return;
    const infoNode = itemNode.$$.find(c => c.$imgdir === "info");
    if (!infoNode?.$$) return;
    const iconNode = infoNode.$$.find(c => c.$canvas === "icon" || c.$canvas === "iconRaw");
    if (iconNode?.basedata) {
      iconDataUriCache.set(key, `data:image/png;base64,${iconNode.basedata}`);
      refreshUIWindows();
    }
  }).catch(() => {});
  return key;
}

function findStringName(node, targetId) {
  if (!node?.$$) return null;
  for (const child of node.$$) {
    if (child.$imgdir === targetId) {
      const nameNode = child.$$?.find(c => c.$string === "name");
      return nameNode?.value ?? null;
    }
    const result = findStringName(child, targetId);
    if (result) return result;
  }
  return null;
}

async function loadItemName(itemId) {
  const idStr = String(itemId);
  try {
    if (itemId >= 1000000 && itemId < 2000000) {
      const json = await fetchJson("/resources/String.wz/Eqp.img.json");
      return findStringName(json, idStr);
    } else if (itemId >= 2000000 && itemId < 3000000) {
      const json = await fetchJson("/resources/String.wz/Consume.img.json");
      return findStringName(json, idStr);
    } else if (itemId >= 3000000 && itemId < 4000000) {
      const json = await fetchJson("/resources/String.wz/Ins.img.json");
      return findStringName(json, idStr);
    } else if (itemId >= 4000000 && itemId < 5000000) {
      const json = await fetchJson("/resources/String.wz/Etc.img.json");
      return findStringName(json, idStr);
    } else if (itemId >= 5000000 && itemId < 6000000) {
      const json = await fetchJson("/resources/String.wz/Cash.img.json");
      return findStringName(json, idStr);
    }
  } catch {}
  return null;
}

function initPlayerEquipment(equips) {
  playerEquipped.clear();
  for (const eq of equips) {
    const category = eq.category || equipWzCategoryFromId(eq.id) || "Coat";
    const iconKey = loadEquipIcon(eq.id, category);
    playerEquipped.set(category, { id: eq.id, name: "", iconKey });
    loadItemName(eq.id).then(name => {
      const entry = playerEquipped.get(category);
      if (entry) { entry.name = name || category; refreshUIWindows(); }
    });
  }
}

function initPlayerInventory() {
  playerInventory.length = 0;
  const starterItems = [
    { id: 2000000, qty: 30 },
    { id: 2000001, qty: 15 },
    { id: 2000002, qty: 5 },
    { id: 2010000, qty: 10 },
    { id: 4000000, qty: 8 },
    { id: 4000001, qty: 3 },
    { id: 3010000, qty: 1 },  // The Relaxer (chair)
  ];
  for (const item of starterItems) {
    const iconKey = loadItemIcon(item.id);
    const invType = inventoryTypeById(item.id) || "ETC";
    const slot = findFreeSlot(invType);
    if (slot === -1) continue; // tab full
    playerInventory.push({ id: item.id, name: "...", qty: item.qty, iconKey, invType, slot });
    loadItemName(item.id).then(name => {
      const entry = playerInventory.find(e => e.id === item.id);
      if (entry) { entry.name = name || `Item ${item.id}`; refreshUIWindows(); }
    });
    // Pre-cache WZ info for slotMax
    if (isItemStackable(item.id)) loadItemWzInfo(item.id);
  }
}

// ─── Character Save / Load System ──────────────────────────────────────────────

/**
 * Find the closest spawn portal (type 0) to the given position.
 * Returns the portal name string, or null if no spawn portals exist.
 */
function findClosestSpawnPortal(x, y) {
  if (!runtime.map || !runtime.map.portalEntries) return null;
  let best = null;
  let bestDist = Infinity;
  for (const p of runtime.map.portalEntries) {
    if (p.type !== 0) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = p.name; }
  }
  return best;
}

/**
 * Build a CharacterSave object from current runtime state.
 * Matches .memory/shared-schema.md CharacterSave shape exactly.
 */
function buildCharacterSave() {
  return {
    identity: {
      name: runtime.player.name,
      gender: runtime.player.gender ?? false,
      skin: 0,
      face_id: runtime.player.face_id,
      hair_id: runtime.player.hair_id,
    },
    stats: {
      level: runtime.player.level,
      job: runtime.player.job,
      exp: runtime.player.exp,
      max_exp: runtime.player.maxExp,
      hp: runtime.player.hp,
      max_hp: runtime.player.maxHp,
      mp: runtime.player.mp,
      max_mp: runtime.player.maxMp,
      speed: runtime.player.stats.speed,
      jump: runtime.player.stats.jump,
      meso: 0,
    },
    location: {
      map_id: runtime.mapId || "100000001",
      spawn_portal: findClosestSpawnPortal(runtime.player.x, runtime.player.y),
      facing: runtime.player.facing,
    },
    equipment: [...playerEquipped.entries()].map(([slot_type, eq]) => ({
      slot_type,
      item_id: eq.id,
      item_name: eq.name,
    })),
    inventory: playerInventory.map(it => ({
      item_id: it.id,
      qty: it.qty,
      inv_type: it.invType,
      slot: it.slot,
      category: it.category || null,
    })),
    achievements: {
      mobs_killed: 0,
      maps_visited: [],
      portals_used: 0,
      items_looted: 0,
      max_level_reached: runtime.player.level,
      total_damage_dealt: 0,
      deaths: 0,
      play_time_ms: 0,
    },
    version: 1,
    saved_at: new Date().toISOString(),
  };
}

/**
 * Apply a CharacterSave to runtime state.
 * Rebuilds equipment + inventory from the save data.
 * Returns { mapId, spawnPortal } for the caller to decide which map to load.
 */
function applyCharacterSave(save) {
  const p = runtime.player;
  // Identity
  p.name = save.identity.name || "MapleWeb";
  p.gender = save.identity.gender ?? false;
  p.face_id = save.identity.face_id || (p.gender ? 21000 : 20000);
  p.hair_id = save.identity.hair_id || (p.gender ? 31000 : 30000);
  // Stats
  p.level = save.stats.level ?? 1;
  p.job = save.stats.job ?? "Beginner";
  p.exp = save.stats.exp ?? 0;
  p.maxExp = save.stats.max_exp ?? 15;
  p.hp = save.stats.hp ?? 50;
  p.maxHp = save.stats.max_hp ?? 50;
  p.mp = save.stats.mp ?? 5;
  p.maxMp = save.stats.max_mp ?? 5;
  p.stats.speed = save.stats.speed ?? 100;
  p.stats.jump = save.stats.jump ?? 100;
  // Facing
  p.facing = save.location.facing ?? -1;

  // Rebuild equipment
  playerEquipped.clear();
  for (const eq of (save.equipment || [])) {
    const category = eq.slot_type;
    const iconKey = loadEquipIcon(eq.item_id, equipWzCategoryFromId(eq.item_id) || category);
    playerEquipped.set(category, { id: eq.item_id, name: eq.item_name || "", iconKey });
    // Async: load WZ stance data for character rendering
    loadEquipWzData(eq.item_id);
    // Async: load display name
    loadItemName(eq.item_id).then(name => {
      const entry = playerEquipped.get(category);
      if (entry && name) { entry.name = name; refreshUIWindows(); }
    });
  }

  // Rebuild inventory
  playerInventory.length = 0;
  for (const it of (save.inventory || [])) {
    const invType = it.inv_type || inventoryTypeById(it.item_id) || "ETC";
    const isEquip = invType === "EQUIP";
    const iconKey = isEquip
      ? loadEquipIcon(it.item_id, equipWzCategoryFromId(it.item_id) || it.category || "")
      : loadItemIcon(it.item_id);
    playerInventory.push({
      id: it.item_id,
      name: "...",
      qty: it.qty ?? 1,
      iconKey,
      invType,
      category: it.category || null,
      slot: it.slot ?? 0,
    });
    loadItemName(it.item_id).then(name => {
      const entry = playerInventory.find(e => e.id === it.item_id);
      if (entry && name) { entry.name = name; refreshUIWindows(); }
    });
    // Pre-cache WZ info for slotMax
    if (isItemStackable(it.item_id)) loadItemWzInfo(it.item_id);
  }

  refreshUIWindows();
  rlog(`applyCharacterSave: ${p.name} Lv${p.level} ${p.job}`);
  return {
    mapId: save.location.map_id || "100000001",
    spawnPortal: save.location.spawn_portal || null,
  };
}

/**
 * Save character state. Online → server API; offline → localStorage.
 * Fire-and-forget: callers do not await this.
 */
function saveCharacter() {
  try {
    const save = buildCharacterSave();
    const json = JSON.stringify(save);
    if (window.__MAPLE_ONLINE__) {
      // Send via WebSocket for immediate server-side persistence (inventory, equipment, stats)
      if (_wsConnected) {
        wsSend({
          type: "save_state",
          inventory: save.inventory,
          equipment: save.equipment,
          stats: save.stats,
        });
      }
      // Also send via REST as backup (handles case where WS is down)
      fetch("/api/character/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + sessionId },
        body: json,
      }).catch(e => rlog("saveCharacter server error: " + (e.message || e)));
    } else {
      localStorage.setItem(CHARACTER_SAVE_KEY, json);
    }
  } catch (e) {
    rlog("saveCharacter error: " + (e.message || e));
  }
}

/**
 * Load character state. Online → server API; offline → localStorage.
 * Returns a CharacterSave object or null.
 */
async function loadCharacter() {
  if (window.__MAPLE_ONLINE__) {
    try {
      const resp = await fetch("/api/character/load", {
        headers: { "Authorization": "Bearer " + sessionId },
      });
      if (resp.ok) {
        const body = await resp.json();
        return body.data ?? body;  // server wraps in { ok, data }
      }
    } catch (e) { rlog("loadCharacter server error: " + (e.message || e)); }
    return null;
  }
  // Offline: localStorage
  try {
    const raw = localStorage.getItem(CHARACTER_SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || save.version !== 1) return null;
    return save;
  } catch { return null; }
}

/**
 * Show the character creation overlay. Returns a promise that resolves
 * with { name, gender } when the user submits.
 */
function showDuplicateLoginOverlay() {
  // Full-screen blocking overlay — cannot dismiss except by action
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = "cursor: none; z-index: 200000;";
  overlay.innerHTML = `
    <div class="modal-panel" style="max-width: 340px;">
      <div class="modal-titlebar"><span class="modal-title">Already Logged In</span></div>
      <div class="modal-body" style="text-align: center; padding: 16px 20px;">
        <div style="font-size: 28px; margin-bottom: 8px;">⚠️</div>
        <p class="modal-desc" style="margin-bottom: 14px;">This character is already logged in from another session.</p>
        <p class="modal-desc" style="margin-bottom: 16px; font-size: 10px; color: #666;">Close the other tab or wait for it to disconnect, then try again.</p>
        <div class="modal-buttons">
          <button class="modal-btn modal-btn-ok" id="dup-login-retry">Retry</button>
          <button class="modal-btn modal-btn-danger" id="dup-login-logout">Log Out</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#dup-login-retry").addEventListener("click", async () => {
    overlay.remove();
    _duplicateLoginBlocked = false;
    // Set up the initial map promise BEFORE connecting (same race fix as startup)
    _awaitingInitialMap = true;
    const serverMapPromise = new Promise((resolve) => {
      _initialMapResolve = resolve;
      setTimeout(() => {
        if (_awaitingInitialMap) {
          _awaitingInitialMap = false;
          _initialMapResolve = null;
          resolve({ map_id: runtime.mapId || "100000001", spawn_portal: null });
        }
      }, 10000);
    });
    const ok = await connectWebSocketAsync();
    if (ok) {
      // Server will send change_map after auth — wait for it
      const serverMap = await serverMapPromise;
      await loadMap(serverMap.map_id, serverMap.spawn_portal || null);
      wsSend({ type: "map_loaded" });
    } else {
      _awaitingInitialMap = false;
      _initialMapResolve = null;
    }
  });
  overlay.querySelector("#dup-login-logout").addEventListener("click", () => {
    localStorage.removeItem("maple_session_id");
    localStorage.removeItem("mapleweb.save.v1");
    localStorage.removeItem("mapleweb.settings.v1");
    localStorage.removeItem("mapleweb.keybinds.v1");
    window.location.reload();
  });
}

function showCharacterCreateOverlay() {
  return new Promise((resolve) => {
    const overlay = document.getElementById("character-create-overlay");
    const nameInput = document.getElementById("character-name-input");
    const nameError = document.getElementById("character-name-error");
    const maleBtn = document.getElementById("gender-male");
    const femaleBtn = document.getElementById("gender-female");
    const submitBtn = document.getElementById("character-create-submit");
    if (!overlay || !nameInput || !submitBtn) {
      resolve({ name: "MapleWeb", gender: false, loggedIn: false });
      return;
    }

    overlay.classList.remove("hidden");
    let selectedGender = false;

    // ── Tab switching ──
    function showLoginTab() {
      authTabLogin?.classList.add("active");
      authTabCreate?.classList.remove("active");
      authLoginView?.classList.remove("hidden");
      authCreateView?.classList.add("hidden");
      loginNameInput?.focus();
    }
    function showCreateTab() {
      authTabCreate?.classList.add("active");
      authTabLogin?.classList.remove("active");
      authCreateView?.classList.remove("hidden");
      authLoginView?.classList.add("hidden");
      nameInput?.focus();
    }
    authTabLogin?.addEventListener("click", showLoginTab);
    authTabCreate?.addEventListener("click", showCreateTab);

    // Default to Login tab in online mode, Create in offline
    if (window.__MAPLE_ONLINE__) {
      showLoginTab();
    } else {
      showCreateTab();
      // Hide login tab in offline mode
      if (authTabLogin) authTabLogin.style.display = "none";
    }

    // ── Login flow ──
    async function handleLogin() {
      const name = loginNameInput?.value.trim() || "";
      const password = loginPasswordInput?.value || "";
      if (!name || !password) {
        if (loginErrorEl) loginErrorEl.textContent = "Enter username and password";
        return;
      }
      if (loginSubmitBtn) { loginSubmitBtn.disabled = true; loginSubmitBtn.textContent = "Logging in…"; }
      try {
        const resp = await fetch("/api/character/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, password }),
        });
        const result = await resp.json();
        if (!result.ok) {
          if (loginErrorEl) loginErrorEl.textContent = result.error?.message || "Login failed";
          if (loginSubmitBtn) { loginSubmitBtn.disabled = false; loginSubmitBtn.textContent = "Login"; }
          return;
        }
        // Replace session with the server-provided one
        localStorage.setItem(SESSION_KEY, result.session_id);
        // Reload page so everything initializes with the correct session
        window.location.reload();
      } catch {
        if (loginErrorEl) loginErrorEl.textContent = "Server error — try again";
        if (loginSubmitBtn) { loginSubmitBtn.disabled = false; loginSubmitBtn.textContent = "Login"; }
      }
    }
    loginSubmitBtn?.addEventListener("click", handleLogin);
    loginPasswordInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
    loginNameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") loginPasswordInput?.focus(); });

    // ── Create flow ──
    function validateName() {
      const val = nameInput.value.trim();
      if (val.length === 0) { nameError.textContent = ""; submitBtn.disabled = true; return; }
      if (val.length < 2) { nameError.textContent = "Name must be at least 2 characters"; submitBtn.disabled = true; return; }
      if (val.length > 12) { nameError.textContent = "Name must be 12 characters or less"; submitBtn.disabled = true; return; }
      if (!/^[a-zA-Z0-9 ]+$/.test(val)) { nameError.textContent = "Only letters, numbers, and spaces allowed"; submitBtn.disabled = true; return; }
      if (val.startsWith(" ") || val.endsWith(" ")) { nameError.textContent = "No leading or trailing spaces"; submitBtn.disabled = true; return; }
      nameError.textContent = "";
      submitBtn.disabled = false;
    }
    nameInput.addEventListener("input", validateName);

    maleBtn?.addEventListener("click", () => { selectedGender = false; maleBtn.classList.add("active"); femaleBtn?.classList.remove("active"); });
    femaleBtn?.addEventListener("click", () => { selectedGender = true; femaleBtn.classList.add("active"); maleBtn?.classList.remove("active"); });

    async function handleCreate() {
      const val = nameInput.value.trim();
      if (submitBtn.disabled || val.length < 2) return;

      if (window.__MAPLE_ONLINE__) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating…";
        try {
          const resp = await fetch("/api/character/create", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + sessionId },
            body: JSON.stringify({ name: val, gender: selectedGender }),
          });
          const result = await resp.json();
          if (!result.ok) {
            nameError.textContent = result.error?.message || "Name already taken";
            submitBtn.disabled = false;
            submitBtn.textContent = "Enter World";
            return;
          }
        } catch {
          nameError.textContent = "Server error — try again";
          submitBtn.disabled = false;
          submitBtn.textContent = "Enter World";
          return;
        }
      }

      overlay.classList.add("hidden");
      resolve({ name: val, gender: selectedGender, loggedIn: false });
    }

    submitBtn.addEventListener("click", handleCreate);
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleCreate(); });
  });
}

// ─── Multiplayer Networking (WebSocket) ────────────────────────────────────────
// Remote player data, WS connection, message handling, interpolation.
// Only active when window.__MAPLE_ONLINE__ is true.

let _ws = null;
let _wsConnected = false;
let _wsPingInterval = null;
let _wsReconnectTimer = null;
let _lastPosSendTime = 0;
let _wsPingSentAt = 0;
let _wsPingMs = -1; // -1 = no measurement yet
let _lastChatSendTime = 0; // 1s cooldown between chat messages
let _lastEmoteTime = 0;    // 1s cooldown between emote changes
let _duplicateLoginBlocked = false; // true if 4006 close received
let _isMobAuthority = false; // true if this client controls mob AI for the current map
let _lastMobStateSendTime = 0; // 10Hz mob state broadcasts
const MOB_STATE_SEND_INTERVAL = 100; // ms between mob state sends (10Hz)

// ── Server-authoritative map change state ──
// When the server sends change_map, this resolves so the waiting code can proceed.
// When the client sends use_portal/admin_warp, it sets this up to wait for the response.
let _pendingMapChangeResolve = null;
let _pendingMapChangeReject = null;
let _pendingMapChangeTimer = null;
/** Whether we're waiting for the initial change_map from server after auth */
let _awaitingInitialMap = false;
let _initialMapResolve = null;

/** sessionId → RemotePlayer */
const remotePlayers = new Map();
/** sessionId → Map<itemId, wzJson> */
const remoteEquipData = new Map();
/** sessionId → { faceData, hairData } for gender-specific WZ */
const remoteLookData = new Map();
/** sessionId → per-player placement template cache */
const remoteTemplateCache = new Map();

// ── Snapshot interpolation constants ──
// Render remote players slightly "in the past" so we always have two snapshots
// to interpolate between. This eliminates jitter regardless of ping variance.
// INTERP_DELAY should be ~2x the send interval (50ms send → 100ms delay).
const REMOTE_INTERP_DELAY_MS = 100;
// Maximum snapshots to buffer (1 second at 20Hz)
const REMOTE_SNAPSHOT_MAX = 20;

function createRemotePlayer(id, name, look, x, y, action, facing) {
  const now = performance.now();
  return {
    id, name,
    // Snapshot buffer: circular array of { time, x, y, action, facing }
    // Newest at end. We interpolate between two snapshots that bracket renderTime.
    snapshots: [{ time: now, x, y, action: action || "stand1", facing: facing || -1 }],
    // Render position (output of interpolation)
    renderX: x, renderY: y,
    // Current visual state (from interpolation)
    action: action || "stand1",
    facing: facing || -1,
    frameIndex: 0, frameTimer: 0,
    look: look || { gender: false, face_id: 20000, hair_id: 30000, skin: 0, equipment: [] },
    chatBubble: null, chatBubbleExpires: 0,
    attacking: false, attackStance: "",
    climbing: false,
    // Face expression (emote) state
    faceExpression: "default",
    faceFrameIndex: 0,
    faceFrameTimer: 0,
    faceExpressionExpires: 0,
    chairId: 0,
  };
}

/** Connect WebSocket and wait for auth to succeed. Returns false if blocked (4006). */
function connectWebSocketAsync() {
  return new Promise((resolve) => {
    _wsAuthResolve = resolve;
    connectWebSocket();
  });
}
let _wsAuthResolve = null;

function connectWebSocket() {
  if (!window.__MAPLE_ONLINE__) return;
  if (_ws && (_ws.readyState === WebSocket.CONNECTING || _ws.readyState === WebSocket.OPEN)) return;

  const wsUrl = window.__MAPLE_SERVER_URL__.replace(/^http/, "ws") + "/ws";
  _ws = new WebSocket(wsUrl);

  _ws.onopen = () => {
    _ws.send(JSON.stringify({ type: "auth", session_id: sessionId }));
    _wsConnected = true;
    _wsPingInterval = setInterval(() => { _wsPingSentAt = performance.now(); wsSend({ type: "ping" }); }, 10_000);
    rlog("WS connected");
  };

  _ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
      // First message received = auth accepted
      if (_wsAuthResolve) { const r = _wsAuthResolve; _wsAuthResolve = null; r(true); }
    } catch {}
  };

  _ws.onclose = (event) => {
    _wsConnected = false;
    _wsPingMs = -1;
    if (_wsPingInterval) { clearInterval(_wsPingInterval); _wsPingInterval = null; }
    remotePlayers.clear();
    remoteEquipData.clear();
    remoteLookData.clear();
    remoteTemplateCache.clear();
    // Reset any pending map change state
    if (_pendingMapChangeReject) {
      _pendingMapChangeReject(new Error("WebSocket disconnected"));
    }
    _pendingMapChangeResolve = null;
    _pendingMapChangeReject = null;
    if (_pendingMapChangeTimer) { clearTimeout(_pendingMapChangeTimer); _pendingMapChangeTimer = null; }
    _awaitingInitialMap = false;
    _initialMapResolve = null;

    // Already logged in from another tab/session — block the game
    if (event.code === 4006) {
      rlog("WS rejected: already logged in from another session");
      _duplicateLoginBlocked = true;
      if (_wsAuthResolve) { const r = _wsAuthResolve; _wsAuthResolve = null; r(false); }
      showDuplicateLoginOverlay();
      return;
    }

    rlog("WS disconnected, reconnecting in 3s…");
    if (_wsReconnectTimer) clearTimeout(_wsReconnectTimer);
    _wsReconnectTimer = setTimeout(connectWebSocket, 3000);
  };

  _ws.onerror = () => {}; // onclose fires
}

function wsSend(msg) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}

function sendMobState() {
  if (!runtime.map) return;
  const mobs = [];
  for (const [idx, state] of lifeRuntimeState) {
    const life = runtime.map.lifeEntries[idx];
    if (!life || life.type !== "m") continue;
    const ph = state.phobj;
    if (!ph) continue;
    mobs.push({
      idx,
      x: Math.round(ph.x),
      y: Math.round(ph.y),
      hspeed: Math.round(ph.hspeed * 10) / 10,
      facing: state.facing,
      stance: state.stance,
      behavior: state.behaviorState,
      hp: state.hp,
      dead: state.dead,
      dying: state.dying,
      nameVisible: state.nameVisible,
      respawnAt: state.respawnAt || 0,
    });
  }
  if (mobs.length > 0) {
    wsSend({ type: "mob_state", mobs });
  }
}

function wsSendEquipChange() {
  wsSend({
    type: "equip_change",
    equipment: [...playerEquipped.entries()].map(([st, eq]) => ({ slot_type: st, item_id: eq.id })),
  });
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case "pong":
      if (_wsPingSentAt > 0) { _wsPingMs = Math.round(performance.now() - _wsPingSentAt); _wsPingSentAt = 0; }
      break;

    case "map_state":
      remotePlayers.clear();
      remoteEquipData.clear();
      remoteLookData.clear();
      remoteTemplateCache.clear();
      for (const p of msg.players || []) {
        const rp = createRemotePlayer(p.id, p.name, p.look, p.x, p.y, p.action, p.facing);
        rp.chairId = p.chair_id || 0;
        if (rp.chairId) loadChairSprite(rp.chairId);
        remotePlayers.set(p.id, rp);
        loadRemotePlayerEquipData(rp);
        loadRemotePlayerLookData(rp);
      }
      // Restore drops already on the map (landed, no animation)
      for (const d of msg.drops || []) {
        createDropFromServer(d, false);
      }
      // Mob authority: this client controls mob AI if flagged
      _isMobAuthority = !!msg.mob_authority;
      // Sync reactor states from server
      if (Array.isArray(msg.reactors)) {
        syncServerReactors(msg.reactors);
      }
      break;

    case "player_enter":
      if (!remotePlayers.has(msg.id)) {
        const rp = createRemotePlayer(msg.id, msg.name, msg.look, msg.x, msg.y, msg.action, msg.facing);
        rp.chairId = msg.chair_id || 0;
        if (rp.chairId) loadChairSprite(rp.chairId);
        remotePlayers.set(msg.id, rp);
        loadRemotePlayerEquipData(rp);
        loadRemotePlayerLookData(rp);
      }
      break;

    case "player_leave":
      remotePlayers.delete(msg.id);
      remoteEquipData.delete(msg.id);
      remoteLookData.delete(msg.id);
      remoteTemplateCache.delete(msg.id);
      break;

    case "player_move": {
      const rp = remotePlayers.get(msg.id);
      if (!rp) break;
      // Push snapshot with arrival timestamp for interpolation
      const snap = { time: performance.now(), x: msg.x, y: msg.y, action: msg.action, facing: msg.facing };
      rp.snapshots.push(snap);
      // Trim old snapshots (keep last REMOTE_SNAPSHOT_MAX)
      if (rp.snapshots.length > REMOTE_SNAPSHOT_MAX) {
        rp.snapshots.splice(0, rp.snapshots.length - REMOTE_SNAPSHOT_MAX);
      }
      break;
    }

    case "player_chat": {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.chatBubble = msg.text;
        rp.chatBubbleExpires = performance.now() + 8000;
      }
      // Also add to local chat log
      if (msg.id !== sessionId) {
        const chatMsg = { name: msg.name, text: msg.text, timestamp: Date.now(), type: "normal" };
        runtime.chat.history.push(chatMsg);
        if (runtime.chat.history.length > runtime.chat.maxHistory) runtime.chat.history.shift();
        appendChatLogMessage(chatMsg);
      }
      break;
    }

    case "player_face": {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.faceExpression = msg.expression;
        rp.faceFrameIndex = 0;
        // Hit expressions are brief (500ms), emotes last longer (2.5s)
        const isHitExpr = msg.expression === "hit" || msg.expression === "pain";
        rp.faceExpressionExpires = performance.now() + (isHitExpr ? PLAYER_HIT_FACE_DURATION_MS : 2500);
        // Pre-warm face image for frame 0 of this expression to avoid decode blink
        const rpLook = rp.look || {};
        const rpLookData = remoteLookData.get(rp.id);
        const rpFace = rpLookData?.faceData ?? null;
        if (rpFace) {
          const fFrames = getFaceExpressionFrames(msg.expression, rpFace);
          if (fFrames.length > 0) {
            const bodyFrames = getCharacterActionFrames(rp.action);
            if (bodyFrames.length > 0) {
              const bfNode = bodyFrames[rp.frameIndex % bodyFrames.length];
              const bfLeaf = imgdirLeafRecord(bfNode);
              const faceMeta = getFaceFrameMeta(bfLeaf, msg.expression, 0, rpFace);
              if (faceMeta) {
                const key = `rp:${rpLook.face_id || 0}:${rpLook.hair_id || 0}:${rp.action}:${rp.frameIndex}:face:${msg.expression}:0`;
                requestCharacterPartImage(key, faceMeta);
              }
            }
          }
        }
      }
      break;
    }

    case "player_attack": {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.attacking = true;
        rp.attackStance = msg.stance;
        rp.action = msg.stance;
        rp.frameIndex = 0;
        rp.frameTimer = 0;
      }
      break;
    }

    case "player_sit": {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.action = msg.active ? "sit" : "stand1";
        rp.chairId = msg.chair_id || 0;
        if (rp.chairId) loadChairSprite(rp.chairId);
      }
      break;
    }

    case "player_prone": {
      const rp = remotePlayers.get(msg.id);
      if (rp) rp.action = msg.active ? "prone" : "stand1";
      break;
    }

    case "player_climb": {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.climbing = msg.active;
        rp.action = msg.active ? (msg.action || "ladder") : "stand1";
      }
      break;
    }

    case "player_equip": {
      const rp = remotePlayers.get(msg.id);
      if (rp) {
        rp.look.equipment = msg.equipment;
        remoteTemplateCache.delete(msg.id);
        loadRemotePlayerEquipData(rp);
      }
      break;
    }

    case "player_jump": {
      const rp = remotePlayers.get(msg.id);
      if (rp) rp.action = "jump";
      break;
    }

    case "player_level_up": {
      const rp = remotePlayers.get(msg.id);
      if (rp) rp.levelUpEffect = performance.now() + 3000;
      break;
    }

    case "player_damage":
    case "player_die":
    case "player_respawn":
      break; // visual state updates can be added later

    case "drop_spawn": {
      // Server assigned a drop — check if this is our own drop (replace local ID)
      const sd = msg.drop;
      if (sd.owner_id === sessionId) {
        // Find our local drop with matching item/position and replace its ID
        const local = groundDrops.find(d =>
          d.drop_id < 0 && d.id === sd.item_id &&
          Math.abs(d.x - sd.x) < 1 && Math.abs(d.destY - sd.destY) < 1
        );
        if (local) { local.drop_id = sd.drop_id; break; }
      }
      // Remote player dropped an item — create with arc animation
      createDropFromServer(sd, true);
      break;
    }

    case "drop_loot": {
      const dropId = msg.drop_id;
      if (msg.looter_id === sessionId) {
        // We looted it — server confirmed. Add to inventory + animate toward us.
        const drop = groundDrops.find(d => d.drop_id === dropId);
        if (drop) {
          lootDropLocally(drop);
        }
      } else {
        // Someone else looted — animate flying toward them
        animateDropPickup(dropId, msg.looter_id);
      }
      break;
    }

    case "mob_authority":
      _isMobAuthority = !!msg.active;
      rlog(`Mob authority ${_isMobAuthority ? "granted" : "revoked"}`);
      break;

    case "mob_state": {
      // Received mob positions from the authority — apply to local mob state
      if (!runtime.map || _isMobAuthority) break;
      const mobs = msg.mobs;
      if (!Array.isArray(mobs)) break;
      for (const m of mobs) {
        const state = lifeRuntimeState.get(m.idx);
        if (!state || !state.phobj) continue;
        state.phobj.x = m.x;
        state.phobj.y = m.y;
        state.phobj.hspeed = m.hspeed || 0;
        state.facing = m.facing;
        if (m.stance && m.stance !== state.stance) {
          state.stance = m.stance;
          state.frameIndex = 0;
          state.frameTimerMs = 0;
        }
        state.behaviorState = m.behavior || "stand";
        // Sync combat state
        if (m.dead && !state.dead) {
          state.dead = true;
          state.dying = false;
          state.respawnAt = m.respawnAt || (performance.now() + 7000);
        }
        if (m.dying && !state.dying && !state.dead) {
          state.dying = true;
          state.stance = "die1";
          state.frameIndex = 0;
          state.frameTimerMs = 0;
        }
        if (!m.dead && !m.dying && state.dead) {
          // Mob respawned
          state.dead = false;
          state.dying = false;
          state.hp = state.maxHp;
          state.stance = "stand";
          state.frameIndex = 0;
          state.frameTimerMs = 0;
        }
        if (typeof m.hp === "number") state.hp = m.hp;
        if (m.nameVisible) state.nameVisible = true;
      }
      break;
    }

    case "mob_damage": {
      // Another player attacked a mob — authority applies actual state change
      if (!_isMobAuthority) break;
      const mobIdx = msg.mob_idx;
      const state = lifeRuntimeState.get(mobIdx);
      if (!state || state.dead || state.dying) break;
      const life = runtime.map?.lifeEntries[mobIdx];
      if (!life) break;
      const dmg = msg.damage || 0;
      state.hp -= dmg;
      state.nameVisible = true;
      state.hpShowUntil = performance.now() + 5000;

      const worldX = state.phobj ? state.phobj.x : life.x;
      const worldY = state.phobj ? state.phobj.y : life.cy;
      spawnDamageNumber(worldX, worldY, dmg, false);

      const anim = lifeAnimations.get(`m:${life.id}`);
      void playMobSfx(life.id, "Damage");

      // Apply knockback
      const dir = msg.direction || 1;
      const kbDurationMs = (MOB_KB_COUNTER_END - MOB_KB_COUNTER_START) * (1000 / PHYS_TPS);
      state.hitStaggerUntil = performance.now() + kbDurationMs;
      state.kbDir = dir;
      state.kbStartTime = performance.now();
      state.hitCounter = MOB_KB_COUNTER_START;
      state.facing = dir === 1 ? -1 : 1;
      if (anim?.stances?.["hit1"]) {
        state.stance = "hit1";
        state.frameIndex = 0;
        state.frameTimerMs = 0;
      }
      // Check for death
      if (state.hp <= 0) {
        state.hp = 0;
        state.dying = true;
        state.dyingElapsed = 0;
        if (anim?.stances?.["die1"]) {
          state.stance = "die1";
          state.frameIndex = 0;
          state.frameTimerMs = 0;
        }
        void playMobSfx(life.id, "Die");
      }
      break;
    }

    case "drop_expire": {
      // Server expired a drop — fade it out
      const drop = groundDrops.find(d => d.drop_id === msg.drop_id);
      if (drop && !drop.pickingUp) {
        drop.expiring = true;
        drop.expireStart = performance.now();
      }
      break;
    }

    case "global_level_up":
      addSystemChatMessage(`🎉 ${msg.name} has reached level ${msg.level}!`);
      break;

    case "global_announcement":
      addSystemChatMessage(`[Server] ${msg.text}`);
      break;

    case "global_player_count":
      // Could show in UI
      break;

    // ── Server-authoritative reactor system ──

    case "reactor_hit": {
      // Every non-destroy hit plays the state 0 "shake" animation
      const rIdx = msg.reactor_idx;
      const rState = reactorRuntimeState.get(rIdx);
      if (rState) {
        rState.hitAnimState = 0; // always use state 0 hit anim (box shake)
        rState.state = msg.new_state;
        rState.hp = msg.new_hp;
        rState.hitAnimPlaying = true;
        rState.hitAnimFrameIndex = 0;
        rState.hitAnimElapsed = 0;
        playUISound("ReactorHit");
      }
      break;
    }

    case "reactor_destroy": {
      // C++ destroy(): plays src[this->state]["hit"], then state++, dead=true.
      // Play current state's hit anim (the break-apart animation).
      const rIdx = msg.reactor_idx;
      const rState = reactorRuntimeState.get(rIdx);
      if (rState) {
        rState.hitAnimState = rState.state; // animation uses current state
        rState.active = false;
        rState.state += 1; // C++: state++ after setting up animation
        rState.hitAnimPlaying = true;
        rState.hitAnimFrameIndex = 0;
        rState.hitAnimElapsed = 0;
        rState.destroyed = true;
        playUISound("ReactorBreak");
      }
      break;
    }

    case "reactor_respawn": {
      // Server respawned a reactor — re-add it
      const rIdx = msg.reactor_idx;
      const rState = reactorRuntimeState.get(rIdx);
      if (rState) {
        rState.active = true;
        rState.destroyed = false;
        rState.state = 0;
        rState.hp = 4;
        rState.frameIndex = 0;
        rState.elapsed = 0;
        rState.hitAnimPlaying = false;
        rState.opacity = 0; // fade in
      }
      break;
    }

    // ── Server-authoritative map transitions ──

    case "change_map": {
      // Server tells us to load a specific map.
      // This fires in response to use_portal, admin_warp, or on initial auth.
      const mapId = String(msg.map_id ?? "");
      const spawnPortal = msg.spawn_portal || null;
      rlog(`[WS] change_map received: map=${mapId} portal=${spawnPortal}`);

      if (_awaitingInitialMap && _initialMapResolve) {
        // Initial login — resolve the startup promise
        const r = _initialMapResolve;
        _initialMapResolve = null;
        _awaitingInitialMap = false;
        r({ map_id: mapId, spawn_portal: spawnPortal });
      } else if (_pendingMapChangeResolve) {
        // Response to use_portal or admin_warp
        const r = _pendingMapChangeResolve;
        _pendingMapChangeResolve = null;
        _pendingMapChangeReject = null;
        if (_pendingMapChangeTimer) { clearTimeout(_pendingMapChangeTimer); _pendingMapChangeTimer = null; }
        r({ map_id: mapId, spawn_portal: spawnPortal });
      } else {
        // Unsolicited server-initiated map change (e.g., kicked to town)
        handleServerMapChange(mapId, spawnPortal);
      }
      break;
    }

    case "portal_denied": {
      // Server rejected a portal/warp request
      const reason = msg.reason || "Denied";
      rlog(`[WS] portal_denied: ${reason}`);
      setStatus(`Portal denied: ${reason}`);
      if (_pendingMapChangeReject) {
        const r = _pendingMapChangeReject;
        _pendingMapChangeResolve = null;
        _pendingMapChangeReject = null;
        if (_pendingMapChangeTimer) { clearTimeout(_pendingMapChangeTimer); _pendingMapChangeTimer = null; }
        r(new Error(reason));
      }
      break;
    }
  }
}

async function loadRemotePlayerEquipData(rp) {
  const equipMap = new Map();
  for (const eq of rp.look.equipment || []) {
    const category = equipWzCategoryFromId(eq.item_id);
    if (!category) continue;
    const padded = String(eq.item_id).padStart(8, "0");
    const path = `/resources/Character.wz/${category}/${padded}.img.json`;
    try {
      const resp = await cachedFetch(path);
      if (resp.ok) {
        const data = await resp.json();
        equipMap.set(eq.item_id, data);
      }
    } catch {}
  }
  remoteEquipData.set(rp.id, equipMap);
  remoteTemplateCache.delete(rp.id); // invalidate placement cache
}

/** Load face and hair WZ data for a remote player (always per-player, never local fallback). */
async function loadRemotePlayerLookData(rp) {
  const look = rp.look || {};
  const faceId = look.face_id || 20000;
  const hairId = look.hair_id || 30000;

  const entry = { faceData: null, hairData: null, faceId, hairId };
  try {
    const facePath = `/resources/Character.wz/Face/${String(faceId).padStart(8, "0")}.img.json`;
    const hairPath = `/resources/Character.wz/Hair/${String(hairId).padStart(8, "0")}.img.json`;
    const [faceResp, hairResp] = await Promise.all([cachedFetch(facePath), cachedFetch(hairPath)]);
    if (faceResp.ok) entry.faceData = await faceResp.json();
    if (hairResp.ok) entry.hairData = await hairResp.json();
  } catch {}
  remoteLookData.set(rp.id, entry);
  remoteTemplateCache.delete(rp.id);
}

function updateRemotePlayers(dt) {
  const now = performance.now();
  // Render time is "in the past" — we interpolate between snapshots at this time.
  // This guarantees we (almost) always have two bracketing snapshots for smooth lerp.
  const renderTime = now - REMOTE_INTERP_DELAY_MS;

  for (const [, rp] of remotePlayers) {
    const snaps = rp.snapshots;

    // ── 1. Snapshot interpolation ──
    if (snaps.length >= 2) {
      // Find the two snapshots that bracket renderTime
      // snaps are in chronological order (oldest first)
      let i0 = 0;
      let i1 = 1;
      for (let i = 0; i < snaps.length - 1; i++) {
        if (snaps[i + 1].time >= renderTime) {
          i0 = i;
          i1 = i + 1;
          break;
        }
        // If renderTime is past all snapshots, use the last two
        i0 = i;
        i1 = i + 1;
      }

      const s0 = snaps[i0];
      const s1 = snaps[i1];
      const segmentDuration = s1.time - s0.time;

      if (segmentDuration > 0) {
        // t=0 at s0, t=1 at s1
        const t = Math.max(0, Math.min(1.5, (renderTime - s0.time) / segmentDuration));
        // Allow slight extrapolation (up to 1.5) to avoid freezing at the end

        const targetX = s0.x + (s1.x - s0.x) * t;
        const targetY = s0.y + (s1.y - s0.y) * t;

        // Check for teleport (>300px jump between snapshots)
        const snapDist = Math.sqrt((s1.x - s0.x) ** 2 + (s1.y - s0.y) ** 2);
        if (snapDist > 300) {
          // Teleport — snap immediately to latest
          rp.renderX = s1.x;
          rp.renderY = s1.y;
        } else {
          rp.renderX = targetX;
          rp.renderY = targetY;
        }
      } else {
        // Same timestamp — use s1
        rp.renderX = s1.x;
        rp.renderY = s1.y;
      }

      // Use the action/facing from the nearest snapshot at or before renderTime
      const stateSnap = renderTime >= s1.time ? s1 : s0;
      if (!rp.attacking && !rp.chairId) {
        // Only update action from snapshots if not in attack animation or sitting on chair
        const newAction = stateSnap.action;
        if (newAction !== rp.action) {
          rp.action = newAction;
          rp.frameIndex = 0;
          rp.frameTimer = 0;
        }
        rp.facing = stateSnap.facing;
      }

      // Prune old snapshots that are well before renderTime (keep ≥2 before renderTime)
      while (snaps.length > 3 && snaps[1].time < renderTime) {
        snaps.shift();
      }
    } else if (snaps.length === 1) {
      // Only one snapshot — just sit at that position
      rp.renderX = snaps[0].x;
      rp.renderY = snaps[0].y;
      if (!rp.attacking && !rp.chairId) {
        rp.action = snaps[0].action;
        rp.facing = snaps[0].facing;
      }
    }

    // ── 2. Local animation timer (frame advancement is client-side) ──
    rp.frameTimer += dt * 1000;
    const frameDelay = getRemoteFrameDelay(rp);
    if (rp.frameTimer >= frameDelay) {
      rp.frameTimer -= frameDelay;
      rp.frameIndex++;
      const maxFrames = getRemoteFrameCount(rp);
      if (rp.frameIndex >= maxFrames) {
        rp.frameIndex = 0;
        if (rp.attacking) {
          rp.attacking = false;
          rp.action = "stand1";
        }
      }
    }

    // ── 3. Face expression expiry (emotes) ──
    // Remote face stays on frame 0 of the expression for the full duration
    // (avoids blink from async image decode when cycling frames)
    if (rp.faceExpression !== "default" && now >= rp.faceExpressionExpires) {
      rp.faceExpression = "default";
      rp.faceFrameIndex = 0;
    }
  }
}

function getRemoteFrameDelay(rp) {
  // Read actual WZ frame delay from body data (same source as local player)
  const frames = getCharacterActionFrames(rp.action);
  if (frames.length > 0) {
    const frameNode = frames[rp.frameIndex % frames.length];
    const leafRec = imgdirLeafRecord(frameNode);
    const wzDelay = safeNumber(leafRec.delay, 0);
    if (wzDelay > 0) return wzDelay;
  }
  // Fallbacks when WZ data not available
  if (rp.action === "walk1") return 150;
  if (rp.attacking) return 200;
  if (rp.action === "ladder" || rp.action === "rope") return 200;
  return 200;
}

function getRemoteFrameCount(rp) {
  // Try reading from character body WZ data
  const frames = getCharacterActionFrames(rp.action);
  if (frames.length > 0) return frames.length;
  // Fallback
  if (rp.action === "walk1") return 4;
  if (rp.action === "stand1") return 3;
  if (rp.attacking) return 3;
  return 3;
}

/**
 * Get character frame data for a remote player, using their equip data
 * instead of the local player's equipment.
 */
function getRemoteCharacterFrameData(rp) {
  const action = rp.action;
  const frameIndex = rp.frameIndex;
  const faceExpression = rp.faceExpression || "default";
  const faceFrameIndex = rp.faceFrameIndex || 0;

  const frames = getCharacterActionFrames(action);
  if (frames.length === 0) return null;

  const frameNode = frames[frameIndex % frames.length];
  const frameLeaf = imgdirLeafRecord(frameNode);
  const delay = safeNumber(frameLeaf.delay, 180);
  const framePath = [action, String(frameNode.$imgdir ?? frameIndex)];
  const frameParts = [];

  // Body parts
  for (const child of frameNode.$$ ?? []) {
    if (typeof child.$canvas === "string") {
      const meta = canvasMetaFromNode(child);
      if (meta) frameParts.push({ name: child.$canvas, meta });
      continue;
    }
    if (typeof child.$uol === "string") {
      const target = resolveNodeByUol(runtime.characterData, framePath, String(child.value ?? ""));
      const canvasNode = pickCanvasNode(target, child.$uol);
      const meta = canvasMetaFromNode(canvasNode);
      if (meta) frameParts.push({ name: child.$uol, meta });
    }
  }

  // Head
  const headMeta = getHeadFrameMeta(action, frameIndex);
  if (headMeta) frameParts.push({ name: "head", meta: headMeta });

  // Face/Hair — always use per-player data (never local player's)
  const lookData = remoteLookData.get(rp.id);
  const rpFaceData = lookData?.faceData ?? null;
  const rpHairData = lookData?.hairData ?? null;

  // Face — skip during climbing, skip if face data not loaded yet
  if (!CLIMBING_STANCES.has(action) && rpFaceData) {
    const faceMeta = getFaceFrameMeta(frameLeaf, faceExpression, faceFrameIndex, rpFaceData);
    if (faceMeta) frameParts.push({ name: `face:${faceExpression}:${faceFrameIndex}`, meta: faceMeta });
  }

  // Hair — skip if hair data not loaded yet
  if (rpHairData) {
    const hairParts = getHairFrameParts(action, frameIndex, rpHairData);
    for (const hp of hairParts) frameParts.push(hp);
  }

  // Equipment — use remote player's equip data
  // Skip weapon when sitting on a chair
  const rpHidingWeapon = action === "sit";
  const equipDataMap = remoteEquipData.get(rp.id);
  if (equipDataMap) {
    for (const [itemId, equipJson] of equipDataMap) {
      if (rpHidingWeapon && equipSlotFromId(Number(itemId)) === "Weapon") continue;
      const equipParts = getEquipFrameParts(equipJson, action, frameIndex, `equip:${itemId}`);
      for (const ep of equipParts) frameParts.push(ep);
    }
  }

  return { delay, parts: frameParts };
}

function drawRemotePlayer(rp) {
  const flipped = rp.facing > 0;
  const action = rp.action;
  const frameIndex = rp.frameIndex;
  const faceExpression = rp.faceExpression || "default";
  const faceFrameIndex = rp.faceFrameIndex || 0;

  // Draw chair sprite below remote player (flipped to match facing)
  if (rp.chairId) {
    const chairSprite = _chairSpriteCache.get(rp.chairId);
    if (chairSprite?.img) {
      const sc = worldToScreen(rp.renderX, rp.renderY);
      const drawY = Math.round(sc.y - chairSprite.height);
      if (flipped) {
        ctx.save();
        const drawX = Math.round(sc.x - (chairSprite.width - chairSprite.originX));
        ctx.translate(drawX + chairSprite.width, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(chairSprite.img, 0, 0);
        ctx.restore();
      } else {
        const drawX = Math.round(sc.x - chairSprite.originX);
        ctx.drawImage(chairSprite.img, drawX, drawY);
      }
    }
  }

  // Use the same placement template pipeline as the local player.
  // Remote players share body/head/face/hair WZ data with the local player,
  // but have their own equipment data (remoteEquipData).
  const template = getRemotePlayerPlacementTemplate(rp, action, frameIndex, flipped, faceExpression, faceFrameIndex);
  if (!template || template.length === 0) return;

  for (const part of template) {
    const worldX = rp.renderX + part.offsetX;
    const worldY = rp.renderY + part.offsetY;
    drawWorldImage(part.image, worldX, worldY, { flipped });
  }
}

/**
 * Build placement template for a remote player, using the same anchor chain
 * as getCharacterPlacementTemplate but with remote equip data.
 */
function getRemotePlayerPlacementTemplate(rp, action, frameIndex, flipped, faceExpression, faceFrameIndex) {
  const frame = getRemoteCharacterFrameData(rp);
  if (!frame || !frame.parts?.length) return null;

  // Use per-player look IDs in cache key to avoid collisions between
  // players with different face/hair/equips sharing the same image slot
  const look = rp.look || {};
  const lookPrefix = `rp:${look.face_id || 0}:${look.hair_id || 0}`;

  const partAssets = frame.parts
    .map((part) => {
      const key = `${lookPrefix}:${action}:${frameIndex}:${part.name}`;
      requestCharacterPartImage(key, part.meta);
      const image = getImageByKey(key);
      return { ...part, key, image };
    })
    .filter((part) => !!part.image && !!part.meta);

  // Same face-part readiness check as local player
  const expectedFacePart = frame.parts.find((part) => typeof part.name === "string" && part.name.startsWith("face:"));
  if (expectedFacePart && !partAssets.some((part) => part.name === expectedFacePart.name)) {
    return null;
  }

  const body = partAssets.find((part) => part.name === "body");
  if (!body) return null;

  const bodyTopLeft = topLeftFromAnchor(body.meta, body.image, { x: 0, y: 0 }, null, flipped);
  const anchors = {};
  mergeMapAnchors(anchors, body.meta, body.image, bodyTopLeft, flipped);

  const placements = [{ ...body, topLeft: bodyTopLeft, zOrder: zOrderForPart(body.name, body.meta) }];
  const pending = partAssets.filter((p) => p !== body);

  let progressed = true;
  while (pending.length > 0 && progressed) {
    progressed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const part = pending[i];
      const isFacePart = typeof part.name === "string" && part.name.startsWith("face:");
      const anchorName = isFacePart
        ? (anchors.brow ? "brow" : pickAnchorName(part.meta, anchors))
        : pickAnchorName(part.meta, anchors);
      if (!anchorName) continue;
      const topLeft = topLeftFromAnchor(part.meta, part.image, anchors[anchorName], anchorName, flipped);
      placements.push({ ...part, topLeft, zOrder: zOrderForPart(part.name, part.meta) });
      mergeMapAnchors(anchors, part.meta, part.image, topLeft, flipped);
      pending.splice(i, 1);
      progressed = true;
    }
  }

  return placements
    .sort((a, b) => a.zOrder - b.zOrder)
    .map((part) => ({
      ...part,
      offsetX: part.topLeft.x,
      offsetY: part.topLeft.y,
    }));
}

/**
 * Find a remote player at the given screen coordinates.
 * Uses a bounding box around the character's feet (anchor) position.
 */
function findRemotePlayerAtScreen(screenX, screenY) {
  const cam = runtime.camera;
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;
  const HIT_W = 50, HIT_H = 75;

  for (const [id, rp] of remotePlayers) {
    const sx = Math.round(rp.renderX - cam.x + halfW);
    const sy = Math.round(rp.renderY - cam.y + halfH);
    // Character sprite extends above and around the feet position
    if (screenX >= sx - HIT_W / 2 && screenX <= sx + HIT_W / 2 &&
        screenY >= sy - HIT_H && screenY <= sy + 10) {
      return rp;
    }
  }
  return null;
}

/**
 * Render a remote player's character sprite to a canvas element.
 * Ensures look data (face/hair) is loaded first, then retries until
 * all image parts are decoded and rendered.
 */
async function renderRemotePlayerSprite(rp, canvasEl) {
  const SIZE = canvasEl.width || 80;
  canvasEl.width = SIZE;
  canvasEl.height = SIZE;

  // Ensure face/hair WZ data is loaded before rendering
  if (!remoteLookData.has(rp.id)) {
    await loadRemotePlayerLookData(rp);
  }

  // Retry loop: template parts depend on async image decoding
  for (let attempt = 0; attempt < 20; attempt++) {
    // Invalidate template cache so fresh images are picked up
    remoteTemplateCache.delete(rp.id);
    const template = getRemotePlayerPlacementTemplate(rp, rp.action, rp.frameIndex, false, "default", 0);
    if (!template || template.length === 0) {
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    const sCtx = canvasEl.getContext("2d");
    sCtx.clearRect(0, 0, SIZE, SIZE);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const part of template) {
      minX = Math.min(minX, part.offsetX);
      minY = Math.min(minY, part.offsetY);
      maxX = Math.max(maxX, part.offsetX + part.image.width);
      maxY = Math.max(maxY, part.offsetY + part.image.height);
    }
    const spriteW = maxX - minX;
    const spriteH = maxY - minY;
    const scale = Math.min(SIZE / spriteW, SIZE / spriteH, 2.5);
    const offX = (SIZE - spriteW * scale) / 2 - minX * scale;
    const offY = (SIZE - spriteH * scale) / 2 - minY * scale;

    sCtx.imageSmoothingEnabled = false;
    for (const part of template) {
      sCtx.drawImage(part.image,
        offX + part.offsetX * scale,
        offY + part.offsetY * scale,
        part.image.width * scale,
        part.image.height * scale);
    }

    // Check if hair rendered — if not, wait for image decode and retry
    const hasHair = template.some(p => typeof p.name === "string" && p.name.includes("hair"));
    if (hasHair) break;
    await new Promise(r => setTimeout(r, 120));
  }
}

/**
 * Show a HUD-styled modal with a remote player's character info.
 */
function showPlayerInfoModal(rp) {
  if (document.querySelector("#player-info-modal")) return;

  const name = rp.name || "???";

  const overlay = document.createElement("div");
  overlay.id = "player-info-modal";
  overlay.className = "modal-overlay";
  overlay.style.cssText = "cursor:none;z-index:200000;user-select:none;pointer-events:none;";
  overlay.innerHTML = `
    <div class="modal-panel" id="player-info-panel"
      style="width:240px;position:absolute;pointer-events:auto;">
      <div class="modal-titlebar" id="player-info-titlebar" style="cursor:none;position:relative;">
        <span class="modal-title">${name}</span>
        <button class="game-window-close" id="player-info-close" style="position:absolute;right:3px;top:3px;">&times;</button>
      </div>
      <div class="modal-body" style="padding:14px 16px 12px;text-align:center;">
        <canvas id="player-info-sprite" width="80" height="80"
          style="display:block;margin:0 auto 10px;image-rendering:pixelated;"></canvas>
        <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
          <div style="font-size:11px;color:#8a9bb5;margin-bottom:4px;">Accomplishments</div>
          <div style="font-size:11px;color:#5a6a7a;font-style:italic;">None yet</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Center the panel initially
  const panel = overlay.querySelector("#player-info-panel");
  const rect = overlay.getBoundingClientRect();
  panel.style.left = `${(rect.width - 240) / 2}px`;
  panel.style.top = `${(rect.height - panel.offsetHeight) / 2}px`;

  // Make draggable by titlebar
  const titlebar = overlay.querySelector("#player-info-titlebar");
  let dragOff = null;
  titlebar.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragOff = { x: e.clientX - panel.offsetLeft, y: e.clientY - panel.offsetTop };
  });
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragUp);
  function onDragMove(e) {
    if (!dragOff) return;
    const oRect = overlay.getBoundingClientRect();
    let nx = e.clientX - dragOff.x;
    let ny = e.clientY - dragOff.y;
    nx = Math.max(0, Math.min(oRect.width - panel.offsetWidth, nx));
    ny = Math.max(0, Math.min(oRect.height - panel.offsetHeight, ny));
    panel.style.left = `${nx}px`;
    panel.style.top = `${ny}px`;
  }
  function onDragUp() { dragOff = null; }

  // Render sprite async (retries until hair/face loaded)
  const spriteCanvas = overlay.querySelector("#player-info-sprite");
  renderRemotePlayerSprite(rp, spriteCanvas);

  const close = () => {
    overlay.remove();
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
  };
  overlay.querySelector("#player-info-close").addEventListener("click", (e) => {
    e.stopPropagation();
    playUISound("BtMouseClick");
    close();
  });
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  const onKey = (e) => { if (e.key === "Escape") close(); };
  window.addEventListener("keydown", onKey);
}

function drawRemotePlayerNameLabel(rp) {
  const screen = worldToScreen(rp.renderX, rp.renderY);
  ctx.save();
  ctx.font = "bold 11px 'Dotum', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const nameText = rp.name || "???";
  const nameWidth = ctx.measureText(nameText).width;
  const padH = 6, padV = 2;
  const tagW = nameWidth + padH * 2;
  const tagH = 14 + padV * 2;
  const tagX = Math.round(screen.x - tagW / 2);
  const tagY = Math.round(screen.y + 2);

  roundRect(ctx, tagX, tagY, tagW, tagH, 3);
  ctx.fillStyle = "rgba(6, 12, 28, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 130, 180, 0.25)";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 2;
  ctx.fillText(nameText, Math.round(screen.x), tagY + padV);
  ctx.restore();
}

function drawRemotePlayerChatBubble(rp) {
  const now = performance.now();
  if (rp.chatBubbleExpires < now || !rp.chatBubble) return;

  const bubbleOffsetY = (rp.action === "prone" || rp.action === "proneStab") ? 40 : 70;
  const anchor = worldToScreen(rp.renderX, rp.renderY - bubbleOffsetY);
  const fullText = (rp.name || "???") + ": " + rp.chatBubble;

  ctx.save();
  ctx.font = "12px 'Dotum', Arial, sans-serif";

  const maxBubbleWidth = 150;
  const maxTextWidth = Math.max(14, maxBubbleWidth - CHAT_BUBBLE_HORIZONTAL_PADDING * 2);
  const lines = wrapBubbleTextToWidth(fullText, maxTextWidth);

  const widestLine = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
  const width = Math.max(40, Math.min(maxBubbleWidth, Math.ceil(widestLine) + CHAT_BUBBLE_HORIZONTAL_PADDING * 2));
  const height = Math.max(26, lines.length * CHAT_BUBBLE_LINE_HEIGHT + CHAT_BUBBLE_VERTICAL_PADDING * 2);

  const clampedX = Math.max(6, Math.min(canvasEl.width - width - 6, anchor.x - width / 2));
  const y = anchor.y - height - 16;

  roundRect(ctx, clampedX, y, width, height, 6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 80, 120, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#1a1a2e";
  ctx.textBaseline = "top";
  const textBlockHeight = lines.length * CHAT_BUBBLE_LINE_HEIGHT;
  const textOffsetY = (height - textBlockHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], clampedX + CHAT_BUBBLE_HORIZONTAL_PADDING, y + textOffsetY + i * CHAT_BUBBLE_LINE_HEIGHT);
  }

  // Tail
  const tailX = Math.max(clampedX + 8, Math.min(clampedX + width - 8, anchor.x));
  ctx.beginPath();
  ctx.moveTo(tailX - 6, y + height);
  ctx.lineTo(tailX + 6, y + height);
  ctx.lineTo(tailX, y + height + 7);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 80, 120, 0.4)";
  ctx.stroke();
  ctx.restore();
}

function drawAllRemotePlayerSprites() {
  for (const [, rp] of remotePlayers) {
    drawRemotePlayer(rp);
  }
}

// ─── End Multiplayer Networking ────────────────────────────────────────────────

function buildSlotEl(icon, label, qty, tooltipData, clickData) {
  const slot = document.createElement("div");
  slot.className = icon ? "item-slot" : "item-slot empty";
  if (icon) {
    const img = document.createElement("img");
    img.src = icon;
    img.draggable = false;
    // Dim if this item is currently being dragged
    if (draggedItem.active && clickData &&
        clickData.source === draggedItem.source &&
        clickData.index === draggedItem.sourceIndex) {
      img.style.opacity = "0.4";
    }
    slot.appendChild(img);
  } else if (label) {
    const lbl = document.createElement("span");
    lbl.className = "slot-label";
    lbl.textContent = label;
    slot.appendChild(lbl);
  }
  if (qty > 1) {
    const qtyEl = document.createElement("span");
    qtyEl.className = "slot-qty";
    qtyEl.textContent = String(qty);
    slot.appendChild(qtyEl);
  }
  if (tooltipData) {
    slot.addEventListener("mouseenter", (e) => showTooltip(e, tooltipData));
    slot.addEventListener("mousemove", (e) => moveTooltip(e));
    slot.addEventListener("mouseleave", hideTooltip);
  }
  if (clickData) {
    slot.style.cursor = "none";
    let _slotClickTimer = 0;
    slot.addEventListener("click", () => {
      if (draggedItem.active) {
        cancelItemDrag();
      } else {
        clearTimeout(_slotClickTimer);
        _slotClickTimer = setTimeout(() => {
          startItemDrag(clickData.source, clickData.index, clickData.item);
        }, 50);
      }
    });
    slot._cancelPendingClick = () => clearTimeout(_slotClickTimer);
  }
  return slot;
}

function refreshUIWindows() {
  refreshEquipGrid();
  refreshInvGrid();
}

function refreshEquipGrid() {
  if (!equipGridEl) return;
  equipGridEl.innerHTML = "";
  for (const slot of EQUIP_SLOT_LIST) {
    const equipped = playerEquipped.get(slot.type);
    const iconUri = equipped ? getIconDataUri(equipped.iconKey) : null;
    const tooltip = equipped ? { name: equipped.name, id: equipped.id, iconKey: equipped.iconKey } : null;
    const clickData = equipped ? {
      source: "equip", index: slot.type,
      item: { id: equipped.id, name: equipped.name, qty: 1, iconKey: equipped.iconKey, category: slot.type },
    } : null;
    const slotEl = buildSlotEl(iconUri, slot.label, 0, tooltip, clickData);
    // Double-click → unequip to inventory
    if (equipped) {
      slotEl.addEventListener("dblclick", () => {
        if (slotEl._cancelPendingClick) slotEl._cancelPendingClick();
        unequipItem(slot.type);
      });
    }
    equipGridEl.appendChild(slotEl);
  }
}

function refreshInvGrid() {
  if (!invGridEl) return;
  invGridEl.innerHTML = "";

  // Update tab button active state
  const tabBtns = document.querySelectorAll("#inv-tabs .inv-tab");
  for (const btn of tabBtns) {
    btn.classList.toggle("active", btn.dataset.tab === currentInvTab);
  }

  // Build slot map for current tab: slotIndex → { item, realIndex }
  const slotMap = new Map();
  for (let i = 0; i < playerInventory.length; i++) {
    const it = playerInventory[i];
    if (it.invType === currentInvTab) {
      slotMap.set(it.slot, { item: it, realIndex: i });
    }
  }

  for (let s = 0; s < INV_MAX_SLOTS; s++) {
    const entry = slotMap.get(s) ?? null;
    const item = entry?.item ?? null;
    const realIdx = entry?.realIndex ?? -1;
    const iconUri = item ? getIconDataUri(item.iconKey) : null;
    const tooltip = item ? { name: item.name, id: item.id, iconKey: item.iconKey } : null;

    // Build slot WITHOUT clickData — we handle all click logic ourselves below
    const slotEl = buildSlotEl(iconUri, null, item?.qty ?? 0, tooltip, null);
    if (item) slotEl.style.cursor = "none";

    // Dim the source slot if this item is being dragged
    if (item && draggedItem.active && draggedItem.source === "inventory" && draggedItem.sourceIndex === realIdx) {
      const img = slotEl.querySelector("img");
      if (img) img.style.opacity = "0.4";
    }

    // Single unified click handler for all inventory slot interactions.
    // Uses a short delay so double-click can cancel the pending single-click action.
    const slotIndex = s;
    let _clickTimer = 0;
    slotEl.addEventListener("click", () => {
      if (draggedItem.active) {
        // ── Dragging: drop into this slot (immediate, no delay) ──
        if (draggedItem.source !== "inventory") { cancelItemDrag(); return; }
        const dragSrcIdx = draggedItem.sourceIndex;
        const dragSrcItem = playerInventory[dragSrcIdx];
        if (!dragSrcItem) { cancelItemDrag(); return; }
        if (dragSrcItem.invType !== currentInvTab) { cancelItemDrag(); return; }
        if (dragSrcItem.slot === slotIndex) { cancelItemDrag(); return; }

        if (item) {
          const targetSlot = item.slot;
          item.slot = dragSrcItem.slot;
          dragSrcItem.slot = targetSlot;
        } else {
          dragSrcItem.slot = slotIndex;
        }
        draggedItem.active = false;
        playUISound("DragEnd");
        refreshUIWindows();
        saveCharacter();
      } else if (item) {
        // ── Not dragging: delay pick-up so dblclick can cancel it ──
        clearTimeout(_clickTimer);
        _clickTimer = setTimeout(() => {
          startItemDrag("inventory", realIdx, {
            id: item.id, name: item.name, qty: item.qty,
            iconKey: item.iconKey, category: item.category,
          });
        }, 50);
      }
    });

    // Double-click on EQUIP tab item → equip it
    if (item && currentInvTab === "EQUIP") {
      slotEl.addEventListener("dblclick", () => {
        clearTimeout(_clickTimer);
        equipItemFromInventory(realIdx);
      });
    }
    // Double-click on SETUP tab chair → use chair (sit/stand toggle)
    if (item && currentInvTab === "SETUP" && isChairItem(item.id)) {
      slotEl.addEventListener("dblclick", () => {
        clearTimeout(_clickTimer);
        useChair(item.id);
      });
    }
    invGridEl.appendChild(slotEl);
  }
}

/** Extract equip stats from a WZ equip JSON node's info child */
function getEquipInfoStats(equipId) {
  const wzData = runtime.characterEquipData[equipId];
  if (!wzData) return null;
  const info = wzData.$$?.find(c => c.$imgdir === "info");
  if (!info) return null;
  const stats = {};
  for (const child of info.$$ || []) {
    const key = child.$int || child.$string || child.$float || "";
    if (!key) continue;
    stats[key] = child.value ?? 0;
  }
  return stats;
}

/** Cache for consumable/etc item WZ spec data: itemId → { spec, info } */
const _itemWzInfoCache = {};

async function loadItemWzInfo(itemId) {
  if (_itemWzInfoCache[itemId]) return _itemWzInfoCache[itemId];
  const invType = inventoryTypeById(itemId);
  let folder = null;
  if (invType === "USE") folder = "Consume";
  else if (invType === "ETC") folder = "Etc";
  else if (invType === "SETUP") folder = "Install";
  if (!folder) return null;
  const prefix = String(itemId).padStart(8, "0").slice(0, 4);
  const path = `/resources/Item.wz/${folder}/${prefix}.img.json`;
  try {
    const json = await fetchJson(path);
    const padded = String(itemId).padStart(8, "0");
    const itemNode = json?.$$?.find(c => c.$imgdir === padded);
    if (!itemNode) return null;
    const info = itemNode.$$?.find(c => c.$imgdir === "info");
    const spec = itemNode.$$?.find(c => c.$imgdir === "spec");
    const result = { info: {}, spec: {} };
    for (const child of info?.$$ || []) {
      const key = child.$int || child.$string || child.$float || "";
      if (key) result.info[key] = child.value ?? 0;
    }
    for (const child of spec?.$$ || []) {
      const key = child.$int || child.$string || child.$float || "";
      if (key) result.spec[key] = child.value ?? 0;
    }
    _itemWzInfoCache[itemId] = result;
    return result;
  } catch { return null; }
}

/** Cache for item descriptions from String.wz */
const _itemDescCache = {};

async function loadItemDesc(itemId) {
  if (_itemDescCache[itemId] !== undefined) return _itemDescCache[itemId];
  const invType = inventoryTypeById(itemId);
  let file = null;
  if (invType === "USE") file = "Consume.img.json";
  else if (invType === "ETC") file = "Etc.img.json";
  else if (invType === "SETUP") file = "Ins.img.json";
  if (!file) { _itemDescCache[itemId] = null; return null; }
  try {
    const json = await fetchJson(`/resources/String.wz/${file}`);
    const node = json?.$$?.find(c => c.$imgdir === String(itemId));
    const descChild = node?.$$?.find(c => (c.$string || "") === "desc");
    const desc = descChild?.value || null;
    _itemDescCache[itemId] = desc;
    return desc;
  } catch { _itemDescCache[itemId] = null; return null; }
}

function showTooltip(e, data) {
  if (!uiTooltipEl) return;
  if (typeof data === "string") {
    uiTooltipEl.textContent = data;
  } else if (data && typeof data === "object") {
    uiTooltipEl.innerHTML = "";

    // ── Enlarged sprite ──
    const iconUri = data.iconKey ? getIconDataUri(data.iconKey) : null;
    if (iconUri) {
      const img = document.createElement("img");
      img.src = iconUri;
      img.style.cssText = "display:block;width:48px;height:48px;image-rendering:pixelated;margin:0 auto 6px;";
      uiTooltipEl.appendChild(img);
    }

    // ── Item name ──
    const nameEl = document.createElement("div");
    nameEl.style.cssText = "font-weight:700;font-size:12px;color:#fff;text-align:center;";
    nameEl.textContent = data.name || "Unknown";
    uiTooltipEl.appendChild(nameEl);

    // ── Description (async for non-equip items) ──
    if (data.id) {
      const descEl = document.createElement("div");
      descEl.style.cssText = "font-size:10px;color:rgba(255,255,255,0.7);margin-top:4px;text-align:center;line-height:1.3;white-space:normal;";
      uiTooltipEl.appendChild(descEl);

      // Try loading description from String.wz
      loadItemDesc(data.id).then(desc => {
        if (desc && !uiTooltipEl.classList.contains("hidden")) {
          descEl.textContent = desc.replace(/\\n/g, "\n");
        }
      });
    }
  }
  uiTooltipEl.classList.remove("hidden");
  moveTooltip(e);
}

function moveTooltip(e) {
  if (!uiTooltipEl) return;
  const wrapper = canvasEl.parentElement;
  const wr = wrapper.getBoundingClientRect();
  let tx = e.clientX - wr.left + 14;
  let ty = e.clientY - wr.top + 14;
  if (tx + 160 > wr.width) tx = e.clientX - wr.left - 160;
  if (ty + 40 > wr.height) ty = e.clientY - wr.top - 40;
  uiTooltipEl.style.left = `${tx}px`;
  uiTooltipEl.style.top = `${ty}px`;
}

function hideTooltip() {
  if (uiTooltipEl) uiTooltipEl.classList.add("hidden");
}

// ── Item selection / drag ──
function startItemDrag(source, index, item) {
  draggedItem.active = true;
  draggedItem.source = source;
  draggedItem.sourceIndex = index;
  draggedItem.id = item.id;
  draggedItem.name = item.name;
  draggedItem.qty = item.qty ?? 0;
  draggedItem.iconKey = item.iconKey;
  draggedItem.category = item.category ?? null;
  playUISound("DragStart");
  refreshUIWindows();
}

function cancelItemDrag(silent) {
  if (!draggedItem.active) return;
  draggedItem.active = false;
  if (!silent) playUISound("DragEnd");
  refreshUIWindows();
}

// ── Equip / Unequip system ──

// Load WZ data for an equip item so the character sprite can render it
async function loadEquipWzData(equipId) {
  const category = equipWzCategoryFromId(equipId);
  if (!category) return;
  const padded = String(equipId).padStart(8, "0");
  const path = `/resources/Character.wz/${category}/${padded}.img.json`;
  try {
    const data = await fetchJson(path);
    runtime.characterEquipData[equipId] = data;
    // Clear placement cache so next frame recomposes with new equip
    characterPlacementTemplateCache.clear();
  } catch (e) {
    rlog(`Failed to load equip WZ data for ${equipId}: ${e.message}`);
  }
}

// Unequip: remove from equipment → add to inventory EQUIP tab → update sprite
function unequipItem(slotType) {
  const equipped = playerEquipped.get(slotType);
  if (!equipped) return;

  hideTooltip();
  // Cancel any active drag silently — this function plays its own sound
  if (draggedItem.active) cancelItemDrag(true);

  // Remove from equipment
  playerEquipped.delete(slotType);

  // Add to inventory EQUIP tab
  const freeSlot = findFreeSlot("EQUIP");
  if (freeSlot === -1) { rlog("EQUIP tab is full, cannot unequip"); playerEquipped.set(slotType, equipped); return; }
  playerInventory.push({
    id: equipped.id,
    name: equipped.name,
    qty: 1,
    iconKey: equipped.iconKey,
    invType: "EQUIP",
    category: slotType,
    slot: freeSlot,
  });

  // Remove equip data from rendering
  delete runtime.characterEquipData[equipped.id];

  // Force character sprite to recompose without this equip
  characterPlacementTemplateCache.clear();

  playUISound("DragEnd");
  refreshUIWindows();
  saveCharacter();
  wsSendEquipChange();
}

// Equip: move from inventory EQUIP tab → equipment slot → update sprite
function equipItemFromInventory(invIndex) {
  const item = playerInventory[invIndex];
  if (!item) return;
  if (item.invType !== "EQUIP") return;

  hideTooltip();
  // Cancel any active drag silently — this function plays its own sound
  if (draggedItem.active) cancelItemDrag(true);

  // Derive equip slot from item ID (matching the keys used in playerEquipped).
  // item.category may be "EQUIP" (inv tab name from reactor drops) — never use that as slot.
  const slotType = equipWzCategoryFromId(item.id) || equipSlotFromId(item.id);
  if (!slotType) return;

  // If something already in that slot, swap to inventory (reuse the outgoing item's slot)
  const existing = playerEquipped.get(slotType);
  const reuseSlot = item.slot; // the slot the outgoing item will take
  if (existing) {
    playerInventory.push({
      id: existing.id,
      name: existing.name,
      qty: 1,
      iconKey: existing.iconKey,
      invType: "EQUIP",
      category: slotType,
      slot: reuseSlot,
    });
    // Remove old equip data from rendering
    delete runtime.characterEquipData[existing.id];
  }

  // Remove from inventory
  playerInventory.splice(invIndex, 1);

  // Add to equipment
  playerEquipped.set(slotType, {
    id: item.id,
    name: item.name,
    iconKey: item.iconKey,
  });

  // Load WZ data for rendering the new equip
  loadEquipWzData(item.id);

  // Force character sprite to recompose
  characterPlacementTemplateCache.clear();

  playUISound("DragEnd");
  refreshUIWindows();
  saveCharacter();
  wsSendEquipChange();
}

function dropItemOnMap() {
  if (!draggedItem.active) return;
  if (_dropQtyModalOpen) return; // modal already open
  const iconUri = getIconDataUri(draggedItem.iconKey);
  if (!iconUri) { cancelItemDrag(); return; }

  const itemQty = draggedItem.source === "inventory" ? draggedItem.qty : 1;
  const isStackable = isItemStackable(draggedItem.id);

  // If stackable item with qty > 1, show modal asking how many to drop
  if (isStackable && itemQty > 1) {
    showDropQuantityModal(itemQty);
    return;
  }

  // Single item or equipment — drop all immediately
  executeDropOnMap(itemQty);
}

let _dropQtyModalOpen = false;

/** Show modal asking how many items to drop (for stackable items with qty > 1) */
function showDropQuantityModal(maxQty) {
  _dropQtyModalOpen = true;
  // Reset cursor click state — the pointerdown that triggered the modal
  // won't get a matching pointerup on the canvas, so clear it here
  wzCursor.clickState = false;
  setCursorState(CURSOR_IDLE);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = "cursor:none;z-index:200000;";
  overlay.innerHTML = `
    <div class="modal-panel" style="width:260px;">
      <div class="modal-titlebar"><span class="modal-title">Drop Item</span></div>
      <div class="modal-body" style="padding:12px 16px;">
        <div class="modal-desc" style="margin-bottom:8px;text-align:center;">How many would you like to drop?</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
          <input type="number" class="modal-input" id="drop-qty-input"
            min="1" max="${maxQty}" value="${maxQty}"
            style="width:80px;text-align:center;" />
          <span style="color:#777;font-size:11px;">/ ${maxQty}</span>
        </div>
      </div>
      <div class="modal-buttons" style="margin-bottom:8px;">
        <button class="modal-btn modal-btn-ok" id="drop-qty-ok">OK</button>
        <button class="modal-btn modal-btn-cancel" id="drop-qty-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Hide ghost drag icon while modal is open
  _ghostItemEl.style.display = "none";

  const input = overlay.querySelector("#drop-qty-input");
  input.focus();
  input.select();

  let closed = false;
  const close = () => { if (closed) return; closed = true; _dropQtyModalOpen = false; overlay.remove(); };

  const confirm = () => {
    let qty = parseInt(input.value, 10);
    if (isNaN(qty) || qty < 1) qty = 1;
    if (qty > maxQty) qty = maxQty;
    close();
    executeDropOnMap(qty);
  };

  overlay.querySelector("#drop-qty-ok").addEventListener("click", (e) => { e.stopPropagation(); playUISound("BtMouseClick"); confirm(); });
  overlay.querySelector("#drop-qty-cancel").addEventListener("click", (e) => { e.stopPropagation(); playUISound("BtMouseClick"); close(); cancelItemDrag(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") { close(); cancelItemDrag(); }
  });
  // Click outside modal panel closes (cancel)
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) { close(); cancelItemDrag(); }
  });
}

/** Execute the actual drop of qty items onto the map. */
function executeDropOnMap(dropQty) {
  if (!draggedItem.active) return;
  const player = runtime.player;

  // Drop X stays fixed at player position (no horizontal drift).
  // Find the foothold below at drop X for the landing destination.
  const dropX = player.x;
  const startY = player.y - 4;
  const destFh = findFootholdAtXNearY(runtime.map, dropX, player.y, 60)
              || findFootholdBelow(runtime.map, dropX, player.y - 100);
  const destY = destFh ? destFh.y - 4 : player.y - 4;

  const dropCategory = draggedItem.category;
  const dropIconKey = draggedItem.iconKey;
  const dropName = draggedItem.name;
  const dropItemId = draggedItem.id;
  const localId = _localDropIdCounter--;

  groundDrops.push({
    drop_id: localId,
    id: dropItemId,
    name: dropName,
    qty: dropQty,
    iconKey: dropIconKey,
    category: dropCategory,
    x: dropX,
    y: startY,
    destY: destY,
    vy: DROP_SPAWN_VSPEED,
    onGround: false,
    opacity: 1.0,
    angle: 0,
    bobPhase: 0,
    spawnTime: performance.now(),
    pickingUp: false,
    pickupStart: 0,
    expiring: false,
    expireStart: 0,
  });

  // Remove from source
  if (draggedItem.source === "inventory") {
    const srcItem = playerInventory[draggedItem.sourceIndex];
    if (srcItem && dropQty < srcItem.qty) {
      // Partial drop — reduce qty in inventory
      srcItem.qty -= dropQty;
    } else {
      // Full drop — remove item entirely
      playerInventory.splice(draggedItem.sourceIndex, 1);
    }
  } else if (draggedItem.source === "equip") {
    const slotType = draggedItem.sourceIndex;
    const equipped = playerEquipped.get(slotType);
    playerEquipped.delete(slotType);
    if (equipped) delete runtime.characterEquipData[equipped.id];
    characterPlacementTemplateCache.clear();
  }

  draggedItem.active = false;
  playUISound("DropItem");
  refreshUIWindows();
  saveCharacter();

  // Tell server about the drop
  wsSend({
    type: "drop_item",
    item_id: dropItemId,
    name: dropName,
    qty: dropQty,
    x: dropX,
    startY: startY,
    destY: destY,
    iconKey: dropIconKey,
    category: dropCategory,
  });
}

// ── Chair system ──
// Chairs (SETUP items, prefix 301xxxx) let the player sit. Double-click in inventory
// to use. The chair sprite is drawn at the player's feet. Other players see the chair
// via the player_sit message which includes chair_id.

const _chairSpriteCache = new Map(); // chairItemId → { img, originX, originY, width, height } or null
const _chairSpriteLoading = new Set();

async function loadChairSprite(chairId) {
  if (_chairSpriteCache.has(chairId)) return _chairSpriteCache.get(chairId);
  if (_chairSpriteLoading.has(chairId)) return null;
  _chairSpriteLoading.add(chairId);

  try {
    const prefix = String(chairId).padStart(8, "0").slice(0, 4);
    const padded = String(chairId).padStart(8, "0");
    const json = await fetchJson(`/resources/Item.wz/Install/${prefix}.img.json`);
    const itemNode = (json.$$ ?? []).find(c => c.$imgdir === padded);
    if (!itemNode) { _chairSpriteCache.set(chairId, null); return null; }

    const effectNode = (itemNode.$$ ?? []).find(c => c.$imgdir === "effect");
    if (!effectNode) { _chairSpriteCache.set(chairId, null); return null; }

    // Find first canvas frame in effect
    const frame = (effectNode.$$ ?? []).find(c => c.$canvas !== undefined && c.basedata);
    if (!frame) { _chairSpriteCache.set(chairId, null); return null; }

    let originX = 0, originY = 0;
    for (const prop of frame.$$ ?? []) {
      if (prop.$vector === "origin") {
        originX = parseInt(prop.x, 10) || 0;
        originY = parseInt(prop.y, 10) || 0;
      }
    }

    const img = await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = `data:image/png;base64,${frame.basedata}`;
    });

    if (!img) { _chairSpriteCache.set(chairId, null); return null; }

    const sprite = {
      img,
      originX,
      originY,
      width: parseInt(frame.width, 10) || img.width,
      height: parseInt(frame.height, 10) || img.height,
    };
    _chairSpriteCache.set(chairId, sprite);
    return sprite;
  } catch (e) {
    rlog(`Chair sprite load failed for ${chairId}: ${e}`);
    _chairSpriteCache.set(chairId, null);
    return null;
  } finally {
    _chairSpriteLoading.delete(chairId);
  }
}

function isChairItem(itemId) {
  return itemId >= 3010000 && itemId < 3020000;
}

function useChair(itemId) {
  const player = runtime.player;
  if (!player.onGround) return;
  if (player.climbing) return;

  if (player.chairId === itemId) {
    // Already sitting on this chair — stand up
    player.chairId = 0;
    player.action = "stand1";
    player.frameIndex = 0;
    player.frameTimer = 0;
    wsSend({ type: "sit", active: false, chair_id: 0 });
    return;
  }

  // Sit on chair
  player.chairId = itemId;
  player.action = "sit";
  player.frameIndex = 0;
  player.frameTimer = 0;
  player.vx = 0;
  player.vy = 0;
  loadChairSprite(itemId);
  wsSend({ type: "sit", active: true, chair_id: itemId });
  saveCharacter();
}

function standUpFromChair() {
  const player = runtime.player;
  if (player.chairId) {
    player.chairId = 0;
    player.action = "stand1";
    player.frameIndex = 0;
    player.frameTimer = 0;
    wsSend({ type: "sit", active: false, chair_id: 0 });
  }
}

// ── Ground drop physics + rendering ──
// C++ Drop::update uses physics.move_object for DROPPED state (gravity + foothold
// collision), then snaps to dest on landing. X is fixed (hspeed = 0 for our drops).
// vspeed = -5.0 gives initial upward arc, gravity brings it down to foothold.
// SPINSTEP = 0.2 per tick while airborne. Only lootable once FLOATING.

function updateGroundDrops(dt) {
  const ticks = Math.max(1, Math.round(dt * 60)); // fixed-step sub-ticks at 60Hz
  for (let i = groundDrops.length - 1; i >= 0; i--) {
    const drop = groundDrops[i];

    if (drop.pickingUp) {
      // C++ PICKEDUP: vspeed = -4.5, opacity -= 1/48 per tick, fly toward looter
      const elapsed = performance.now() - drop.pickupStart;
      const t = Math.min(1, elapsed / LOOT_ANIM_DURATION);
      // Fly toward the looter (local player or remote player)
      const tx = drop._lootTargetX ?? runtime.player.x;
      const ty = drop._lootTargetY ?? (runtime.player.y - 40);
      const hdelta = tx - drop.x;
      const vdelta = ty - drop.y;
      drop.x += hdelta * 0.12;
      drop.y += vdelta * 0.12;
      drop.opacity = 1 - t;
      if (t >= 1) {
        groundDrops.splice(i, 1);
      }
      continue;
    }

    // Expiry fade-out (server-triggered or client-side timeout)
    if (drop.expiring) {
      const elapsed = performance.now() - drop.expireStart;
      const t = Math.min(1, elapsed / DROP_EXPIRE_FADE_MS);
      drop.opacity = 1 - t;
      if (t >= 1) {
        groundDrops.splice(i, 1);
      }
      continue;
    }

    // Client-side expiry check (offline mode, or if server sweep hasn't triggered yet)
    if (drop.onGround && !_wsConnected) {
      const age = performance.now() - drop.spawnTime;
      if (age >= DROP_EXPIRE_MS) {
        drop.expiring = true;
        drop.expireStart = performance.now();
        continue;
      }
    }

    if (!drop.onGround) {
      // DROPPED state — C++ physics: gravity per tick, no hspeed, spin
      for (let tick = 0; tick < ticks; tick++) {
        const prevY = drop.y;

        // C++ physics.move_normal: gravity each tick
        drop.vy += DROP_PHYS_GRAVITY;
        if (drop.vy > DROP_PHYS_TERMINAL_VY) drop.vy = DROP_PHYS_TERMINAL_VY;
        drop.y += drop.vy;

        // C++ spin while airborne: angle += SPINSTEP per tick
        drop.angle += DROP_SPINSTEP;

        // Land when Y crosses destY (foothold) while falling
        if (drop.vy > 0 && drop.y >= drop.destY) {
          // C++ parity: snap to dest, switch to FLOATING, zero velocity, reset angle
          drop.y = drop.destY;
          drop.vy = 0;
          drop.onGround = true;
          drop.angle = 0;
          break;
        }
      }
    } else {
      // FLOATING state: bob animation
      // C++ phobj.y = basey + 5.0 + (cos(moved) - 1.0) * 2.5
      drop.bobPhase += DROP_BOB_SPEED;
      if (drop.bobPhase > Math.PI * 2) drop.bobPhase -= Math.PI * 2;
    }
  }
}

function drawGroundDrops() {
  const camX = runtime.camera.x;
  const camY = runtime.camera.y;
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;

  for (const drop of groundDrops) {
    const iconUri = getIconDataUri(drop.iconKey);
    if (!iconUri) continue;
    const img = _imgCacheByUri.get(iconUri);
    if (!img) {
      // Cache the image
      const newImg = new Image();
      newImg.src = iconUri;
      _imgCacheByUri.set(iconUri, newImg);
      continue;
    }
    if (!img.complete) continue;

    const sx = Math.round(drop.x - camX + halfW);
    const sy = Math.round(drop.y - camY + halfH);
    // C++ FLOATING: phobj.y = basey + 5.0 + (cos(moved) - 1.0) * 2.5
    const bobY = drop.onGround ? 5.0 + (Math.cos(drop.bobPhase) - 1) * DROP_BOB_AMP : 0;

    ctx.save();
    ctx.globalAlpha = drop.opacity;
    if (drop.angle !== 0) {
      // Spin around icon center while airborne (no visual X drift)
      const cx = sx;
      const cy = sy + bobY - img.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(drop.angle);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    } else {
      // Anchor bottom-center at drop position so item sits above foothold
      ctx.translate(sx, sy + bobY);
      ctx.drawImage(img, -img.width / 2, -img.height);
    }
    ctx.restore();
  }
}

// Image cache for drop icons
const _imgCacheByUri = new Map();

function tryLootDrop() {
  const player = runtime.player;
  // Allow looting in any position except sitting
  if (player.action === "sit") return;

  const pBounds = playerTouchBounds(player);

  for (let i = 0; i < groundDrops.length; i++) {
    const drop = groundDrops[i];
    // Must be landed (done rotating), not being picked up, and not expiring
    if (drop.pickingUp || !drop.onGround || drop.expiring) continue;
    // Check overlap between player touch hitbox and drop item bounds (32×32 centered)
    const dropBounds = normalizedRect(
      drop.x - 16, drop.x + 16,
      drop.y - 32, drop.y,
    );
    if (rectsOverlap(pBounds, dropBounds)) {
      if (_wsConnected) {
        // Online: ask server to loot — server broadcasts drop_loot to all
        wsSend({ type: "loot_item", drop_id: drop.drop_id });
        return; // Wait for server confirmation
      }
      // Offline: loot locally
      lootDropLocally(drop);
      return;
    }
  }
}

/** Add a looted drop's item to the local player's inventory and start pickup animation. */
function lootDropLocally(drop) {
  drop.pickingUp = true;
  drop.pickupStart = performance.now();
  drop._lootTargetX = runtime.player.x;
  drop._lootTargetY = runtime.player.y - 40;

  const invType = inventoryTypeById(drop.id) || "ETC";
  const stackable = isItemStackable(drop.id);
  const slotMax = getItemSlotMax(drop.id);
  let remaining = drop.qty;

  if (stackable) {
    // Try to stack onto existing slots of the same item
    for (const entry of playerInventory) {
      if (remaining <= 0) break;
      if (entry.id !== drop.id || entry.invType !== invType) continue;
      const space = slotMax - entry.qty;
      if (space > 0) {
        const add = Math.min(space, remaining);
        entry.qty += add;
        remaining -= add;
      }
    }
  }

  // Any remaining goes into new slot(s)
  while (remaining > 0) {
    const freeSlot = findFreeSlot(invType);
    if (freeSlot === -1) {
      rlog(`${invType} tab is full, cannot pick up ${remaining} remaining items`);
      if (remaining === drop.qty) {
        // Nothing was added at all — cancel pickup
        drop.pickingUp = false;
        return;
      }
      break; // partial pickup — some went in, rest lost (tab full)
    }
    const wzCat = equipWzCategoryFromId(drop.id);
    const iconKey = wzCat ? loadEquipIcon(drop.id, wzCat) : loadItemIcon(drop.id);
    const addQty = Math.min(remaining, slotMax);
    playerInventory.push({
      id: drop.id, name: drop.name, qty: addQty, iconKey,
      invType, category: drop.category || null, slot: freeSlot,
    });
    remaining -= addQty;
  }

  // Eagerly load WZ info for slotMax cache (for future stacking)
  if (stackable) loadItemWzInfo(drop.id);

  addPickupJournalEntry(drop.name, drop.qty);
  playUISound("PickUpItem");
  refreshUIWindows();
  saveCharacter();
}

const PICKUP_JOURNAL_FADE_MS = 5000; // entries start fading after 5s
const PICKUP_JOURNAL_FADE_DURATION = 1000; // 1s CSS transition

/** Add a "You picked up..." entry to the pickup journal. */
function addPickupJournalEntry(itemName, qty) {
  if (!pickupJournalEl) return;
  const el = document.createElement("div");
  el.className = "pickup-journal-entry";
  const qtyText = qty > 1 ? `${qty} ` : "";
  el.textContent = `You picked up ${qtyText}${itemName}`;
  pickupJournalEl.appendChild(el);

  // After 5s, start fade-out; after fade completes, remove element
  setTimeout(() => {
    el.classList.add("fading");
    setTimeout(() => el.remove(), PICKUP_JOURNAL_FADE_DURATION);
  }, PICKUP_JOURNAL_FADE_MS);
}

/** Start pickup animation on a drop, flying toward the looter. */
function animateDropPickup(dropId, looterId) {
  const drop = groundDrops.find(d => d.drop_id === dropId);
  if (drop && !drop.pickingUp) {
    drop.pickingUp = true;
    drop.pickupStart = performance.now();
    // Fly toward the looter's position
    const rp = remotePlayers.get(looterId);
    if (rp) {
      drop._lootTargetX = rp.renderX;
      drop._lootTargetY = rp.renderY - 40;
    } else {
      // Fallback to local player (shouldn't happen, but safe)
      drop._lootTargetX = runtime.player.x;
      drop._lootTargetY = runtime.player.y - 40;
    }
  }
}

/** Create a ground drop from server data (remote spawn or map_state). */
function createDropFromServer(dropData, animate) {
  // Don't duplicate if already exists
  if (groundDrops.find(d => d.drop_id === dropData.drop_id)) return;

  // Preload icon — derive iconKey from item_id if not provided
  let iconKey = dropData.iconKey || "";
  if (!iconKey && dropData.item_id) {
    const wzCat = equipWzCategoryFromId(dropData.item_id);
    if (wzCat) {
      iconKey = loadEquipIcon(dropData.item_id, wzCat);
    } else {
      iconKey = loadItemIcon(dropData.item_id);
    }
  } else if (iconKey) {
    const existingUri = getIconDataUri(iconKey);
    if (!existingUri) {
      const wzCat = equipWzCategoryFromId(dropData.item_id);
      if (wzCat) { loadEquipIcon(dropData.item_id, wzCat); }
      else { loadItemIcon(dropData.item_id); }
    }
  }
  // Resolve item name from WZ if not provided
  if (!dropData.name && dropData.item_id) {
    loadItemName(dropData.item_id).then(n => {
      if (n) {
        const existing = groundDrops.find(d => d.drop_id === dropData.drop_id);
        if (existing) existing.name = n;
      }
    });
  }

  // Use local foothold detection for landing Y (same rules as user drops)
  let destY = dropData.destY;
  if (runtime.map) {
    const fh = findFootholdAtXNearY(runtime.map, dropData.x, dropData.destY, 60)
            || findFootholdBelow(runtime.map, dropData.x, (dropData.startY || dropData.destY) - 100);
    if (fh) destY = fh.y - 4;
  }

  groundDrops.push({
    drop_id: dropData.drop_id,
    id: dropData.item_id,
    name: dropData.name || "",
    qty: dropData.qty || 1,
    iconKey: iconKey,
    category: dropData.category || null,
    x: dropData.x,
    y: animate ? (dropData.startY || destY) : destY,
    destY: destY,
    vy: animate ? DROP_SPAWN_VSPEED : 0,
    onGround: !animate,
    opacity: 1.0,
    angle: 0,
    bobPhase: 0,
    spawnTime: performance.now(),
    pickingUp: false,
    pickupStart: 0,
    expiring: false,
    expireStart: 0,
  });
}

function getUIWindowEl(key) {
  if (key === "equip") return equipWindowEl;
  if (key === "inventory") return inventoryWindowEl;
  if (key === "keybinds") return keybindsWindowEl;
  if (key === "settings") return settingsModalEl;
  return null;
}

function toggleUIWindow(key) {
  const el = getUIWindowEl(key);
  if (!el) return;
  const isHidden = el.classList.contains("hidden");
  el.classList.toggle("hidden");
  if (isHidden) {
    bringWindowToFront(el);
    playUISound("MenuUp");
    refreshUIWindows();
    if (key === "keybinds") buildKeybindsUI();
  } else {
    playUISound("MenuDown");
  }
}

function isUIWindowVisible(key) {
  const el = getUIWindowEl(key);
  return el && !el.classList.contains("hidden");
}

/** WZ Cursor system — canvas-drawn animated cursor with states */
const wzCursor = {
  states: {},        // stateId -> { frames: [HTMLImageElement], delays: [number] }
  state: 0,          // Current state (0=IDLE, 1=CANCLICK, 12=CLICKING)
  frameIndex: 0,
  frameTimer: 0,
  x: 0,              // canvas-space X (for game hit detection)
  y: 0,              // canvas-space Y
  clientX: 0,        // viewport-space X (for HTML overlay positioning)
  clientY: 0,        // viewport-space Y
  visible: true,
  loaded: false,
  clickState: false, // True while mouse is held down
};

// C++ cursor state IDs
const CURSOR_IDLE = 0;
const CURSOR_CANCLICK = 1;
const CURSOR_CLICKING = 12;
const CURSOR_DEFAULT_DELAY = 100; // ms per frame (WZ fallback)
const CURSOR_CANCLICK_DELAY = 350; // ms per frame for CANCLICK idle hover

async function loadCursorAssets() {
  try {
    const basicJson = await fetchJson("/resources/UI.wz/Basic.img.json");
    const cursorNode = basicJson?.$$?.find(c => c.$imgdir === "Cursor");
    if (!cursorNode) return;

    for (const group of cursorNode.$$ ?? []) {
      const stateId = parseInt(group.$imgdir);
      if (isNaN(stateId)) continue;
      const frames = [];
      const delays = [];
      // Sort children numerically
      const children = (group.$$ ?? [])
        .filter(c => c.basedata)
        .sort((a, b) => parseInt(a.$imgdir ?? a.$canvas ?? "0") - parseInt(b.$imgdir ?? b.$canvas ?? "0"));
      for (const fr of children) {
        const img = new Image();
        img.src = `data:image/png;base64,${fr.basedata}`;
        frames.push(img);
        delays.push(fr.delay || CURSOR_DEFAULT_DELAY);
      }
      if (frames.length > 0) {
        wzCursor.states[stateId] = { frames, delays };
      }
    }

    wzCursor.loaded = Object.keys(wzCursor.states).length > 0;

    // Hide the system cursor everywhere inside the canvas wrapper
    if (wzCursor.loaded) {
      document.documentElement.style.setProperty("--cursor-default", "none");
      document.documentElement.style.setProperty("--cursor-pointer", "none");
      const wrapper = canvasEl.parentElement;
      if (wrapper) wrapper.style.cursor = "none";
      canvasEl.style.cursor = "none";
    }

    // Also preload UI sounds for click / open / close
    void preloadUISounds();
  } catch (e) {
    console.warn("[ui] Failed to load cursor assets", e);
  }
}

function setCursorState(state) {
  if (!wzCursor.loaded) return;
  if (wzCursor.state === state) return;
  // Fall back to IDLE if state not available
  if (!wzCursor.states[state]) state = CURSOR_IDLE;
  wzCursor.state = state;
  wzCursor.frameIndex = 0;
  wzCursor.frameTimer = 0;
}

function updateCursorAnimation(dtMs) {
  if (!wzCursor.loaded) return;
  const st = wzCursor.states[wzCursor.state];
  if (!st || st.frames.length <= 1) return;
  wzCursor.frameTimer += dtMs;
  const baseDelay = st.delays[wzCursor.frameIndex] || CURSOR_DEFAULT_DELAY;
  const delay = (wzCursor.state === CURSOR_CANCLICK && baseDelay <= CURSOR_DEFAULT_DELAY) ? CURSOR_CANCLICK_DELAY : baseDelay;
  while (wzCursor.frameTimer >= delay) {
    wzCursor.frameTimer -= delay;
    wzCursor.frameIndex = (wzCursor.frameIndex + 1) % st.frames.length;
  }
}

// Cursor rendered as HTML overlay so it stays on top of all UI
const _cursorEl = document.createElement("img");
_cursorEl.id = "wz-cursor";
_cursorEl.style.cssText = "position:fixed;z-index:999999;pointer-events:none;image-rendering:pixelated;display:none;";
document.body.appendChild(_cursorEl);

// Ghost item element (follows cursor when dragging an item)
const _ghostItemEl = document.createElement("img");
_ghostItemEl.id = "ghost-item";
_ghostItemEl.style.cssText = "position:fixed;z-index:999998;pointer-events:none;image-rendering:pixelated;display:none;opacity:0.6;transform:translate(-100%,-100%);";
document.body.appendChild(_ghostItemEl);

function updateCursorElement() {
  if (!wzCursor.loaded) return;
  if (!wzCursor.visible) { _cursorEl.style.display = "none"; _ghostItemEl.style.display = "none"; return; }
  const st = wzCursor.states[wzCursor.state] || wzCursor.states[CURSOR_IDLE];
  if (!st) { _cursorEl.style.display = "none"; return; }
  const frame = st.frames[wzCursor.frameIndex % st.frames.length];
  if (!frame || !frame.complete) return;
  if (_cursorEl.src !== frame.src) _cursorEl.src = frame.src;
  _cursorEl.style.display = "block";
  _cursorEl.style.left = `${wzCursor.clientX}px`;
  _cursorEl.style.top = `${wzCursor.clientY}px`;

  // Ghost item follows cursor (hidden while drop quantity modal is open)
  if (draggedItem.active && !_dropQtyModalOpen) {
    const iconUri = getIconDataUri(draggedItem.iconKey);
    if (iconUri) {
      if (_ghostItemEl.src !== iconUri) _ghostItemEl.src = iconUri;
      _ghostItemEl.style.display = "block";
      _ghostItemEl.style.left = `${wzCursor.clientX + 8}px`;
      _ghostItemEl.style.top = `${wzCursor.clientY + 8}px`;
    }
  } else {
    _ghostItemEl.style.display = "none";
  }
}

function drawWZCursor() {
  // no-op — cursor is now an HTML overlay updated in updateCursorElement()
}

// ── UI Sounds ──
let _uiSoundsPreloaded = false;
const _uiSoundCache = {};

async function preloadUISounds() {
  if (_uiSoundsPreloaded) return;
  _uiSoundsPreloaded = true;
  try {
    const uiSoundJson = await fetchJson("/resources/Sound.wz/UI.img.json");
    for (const name of ["BtMouseClick", "BtMouseOver", "MenuUp", "MenuDown", "DragStart", "DragEnd"]) {
      const node = uiSoundJson?.$$?.find(c => (c.$imgdir ?? c.$canvas ?? c.$sound) === name);
      if (node?.basedata) {
        _uiSoundCache[name] = `data:audio/mp3;base64,${node.basedata}`;
      }
    }
    // Also preload game sounds
    const gameSoundJson = await fetchJson("/resources/Sound.wz/Game.img.json");
    for (const name of ["PickUpItem", "DropItem"]) {
      const node = gameSoundJson?.$$?.find(c => (c.$imgdir ?? c.$canvas ?? c.$sound) === name);
      if (node?.basedata) {
        _uiSoundCache[name] = `data:audio/mp3;base64,${node.basedata}`;
      }
    }
    // Preload reactor hit/break sounds (Reactor.img > 2000 = reactor 0002000)
    try {
      const reactorSoundJson = await fetchJson("/resources/Sound.wz/Reactor.img.json");
      const r2000 = reactorSoundJson?.$$?.find(c => c.$imgdir === "2000");
      if (r2000) {
        // State 0 hit sound (normal hit)
        const s0 = r2000.$$?.find(c => c.$imgdir === "0");
        const hitNode = s0?.$$?.find(c => c.$sound === "Hit");
        if (hitNode?.basedata) _uiSoundCache["ReactorHit"] = `data:audio/mp3;base64,${hitNode.basedata}`;
        // State 3 hit sound (break/destroy)
        const s3 = r2000.$$?.find(c => c.$imgdir === "3");
        const breakNode = s3?.$$?.find(c => c.$sound === "Hit");
        if (breakNode?.basedata) _uiSoundCache["ReactorBreak"] = `data:audio/mp3;base64,${breakNode.basedata}`;
      }
    } catch (e) { /* reactor sounds optional */ }
  } catch (e) {
    console.warn("[ui] Failed to preload UI sounds", e);
  }
}

const _lastUISoundTime = {};
function playUISound(name) {
  if (!runtime.settings.sfxEnabled) return;
  const uri = _uiSoundCache[name];
  if (!uri) return;
  // Debounce: skip if the same sound played less than 100ms ago
  const now = performance.now();
  if (now - (_lastUISoundTime[name] || 0) < 100) return;
  _lastUISoundTime[name] = now;
  const audio = getSfxFromPool(uri);
  if (audio) {
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }
}

/** Load WZ UI backgrounds and close button sprites */
// ── Dragging & window focus ──
let _dragWin = null;
let _dragOffX = 0;
let _dragOffY = 0;
let _winZCounter = 25; // base z-index for game windows

function bringWindowToFront(winEl) {
  if (!winEl) return;
  _winZCounter += 1;
  winEl.style.zIndex = _winZCounter;
}

function initUIWindowDrag() {
  // Click anywhere on a game window → bring it to front
  for (const winEl of document.querySelectorAll(".game-window")) {
    winEl.addEventListener("pointerdown", () => bringWindowToFront(winEl));
  }

  for (const titlebar of document.querySelectorAll(".game-window-titlebar")) {
    titlebar.addEventListener("pointerdown", (e) => {
      const winId = titlebar.dataset.window;
      const winEl = getUIWindowEl(winId);
      if (!winEl) return;
      e.preventDefault();
      bringWindowToFront(winEl);
      _dragWin = winEl;
      const wr = canvasEl.parentElement.getBoundingClientRect();
      _dragOffX = e.clientX - winEl.offsetLeft - wr.left;
      _dragOffY = e.clientY - winEl.offsetTop - wr.top;
    });
  }

  for (const closeBtn of document.querySelectorAll(".game-window-close")) {
    closeBtn.addEventListener("click", () => {
      const key = closeBtn.dataset.close;
      const el = getUIWindowEl(key);
      if (el) {
        el.classList.add("hidden");
        playUISound("MenuDown");
      }
    });
  }

  window.addEventListener("pointermove", (e) => {
    // Always keep WZ cursor tracking up to date (e.g. during HUD drag / overlays)
    wzCursor.clientX = e.clientX;
    wzCursor.clientY = e.clientY;
    wzCursor.visible = true;
    updateCursorElement();

    if (!_dragWin) return;
    const wr = canvasEl.parentElement.getBoundingClientRect();
    let nx = e.clientX - wr.left - _dragOffX;
    let ny = e.clientY - wr.top - _dragOffY;
    nx = Math.max(0, Math.min(wr.width - _dragWin.offsetWidth, nx));
    ny = Math.max(0, Math.min(wr.height - _dragWin.offsetHeight, ny));
    _dragWin.style.left = `${nx}px`;
    _dragWin.style.top = `${ny}px`;
  });

  window.addEventListener("pointerup", () => { _dragWin = null; });


}

// ── Keybind labels ──
const KEYBIND_LABELS = {
  moveLeft: "Move Left",
  moveRight: "Move Right",
  moveUp: "Move Up / Portal",
  moveDown: "Move Down / Crouch",
  attack: "Attack",
  jump: "Jump",
  loot: "Loot",
  equip: "Equipment",
  inventory: "Inventory",
  keybinds: "Keyboard Mappings",
  face1: "😣 Pain",
  face2: "😊 Happy",
  face3: "😟 Troubled",
  face4: "😢 Cry",
  face5: "😠 Angry",
  face6: "😲 Surprised",
  face7: "😵 Shocked",
  face8: "😛 Tongue",
  face9: "😴 Snoozing",
};

function buildKeybindsUI() {
  if (!keybindsGridEl) return;
  keybindsGridEl.innerHTML = "";
  for (const [action, label] of Object.entries(KEYBIND_LABELS)) {
    const row = document.createElement("div");
    row.className = "kb-row";

    const lbl = document.createElement("span");
    lbl.className = "kb-label";
    lbl.textContent = label;

    const btn = document.createElement("button");
    btn.className = "keybind-btn";
    btn.dataset.action = action;
    btn.textContent = keyCodeToDisplay(runtime.keybinds[action]);
    btn.title = "Click to rebind";
    btn.addEventListener("click", () => startKeybindListening(btn));

    row.appendChild(lbl);
    row.appendChild(btn);
    keybindsGridEl.appendChild(row);
  }
}

let canvasResizeObserver = null;
let runtimeSummaryPointerSelecting = false;
let lastRenderedSummaryText = "";
const SUMMARY_UPDATE_INTERVAL_MS = 200;
let summaryUpdateAccumulatorMs = SUMMARY_UPDATE_INTERVAL_MS;
const characterPlacementTemplateCache = new Map();

function syncDebugTogglesFromUi() {
  if (debugOverlayToggleEl) {
    runtime.debug.overlayEnabled = !!debugOverlayToggleEl.checked;
  }

  if (debugRopesToggleEl) {
    runtime.debug.showRopes = !!debugRopesToggleEl.checked;
    debugRopesToggleEl.disabled = !runtime.debug.overlayEnabled;
  }

  if (debugFootholdsToggleEl) {
    runtime.debug.showFootholds = !!debugFootholdsToggleEl.checked;
    debugFootholdsToggleEl.disabled = !runtime.debug.overlayEnabled;
  }

  if (debugTilesToggleEl) {
    runtime.debug.showTiles = !!debugTilesToggleEl.checked;
    debugTilesToggleEl.disabled = !runtime.debug.overlayEnabled;
  }

  if (debugLifeToggleEl) {
    runtime.debug.showLifeMarkers = !!debugLifeToggleEl.checked;
    debugLifeToggleEl.disabled = !runtime.debug.overlayEnabled;
  }

  if (debugHitboxesToggleEl) {
    runtime.debug.showHitboxes = !!debugHitboxesToggleEl.checked;
    debugHitboxesToggleEl.disabled = !runtime.debug.overlayEnabled;
  }

  if (debugUISlotsToggleEl) {
    const show = !!debugUISlotsToggleEl.checked;
    for (const el of [equipWindowEl, inventoryWindowEl, keybindsWindowEl]) {
      el?.classList.toggle("debug-slots", show);
    }
  }

  if (debugFpsToggleEl) {
    runtime.debug.showFps = !!debugFpsToggleEl.checked;
  }

  if (debugMouseFlyToggleEl) {
    runtime.debug.mouseFly = !!debugMouseFlyToggleEl.checked;
  }

}

function setMouseFly(enabled) {
  runtime.debug.mouseFly = enabled;
  if (debugMouseFlyToggleEl) {
    debugMouseFlyToggleEl.checked = enabled;
  }
}

syncDebugTogglesFromUi();

function setStatus(text) {
  statusEl.textContent = text;
}

function resetFramePerfCounters() {
  runtime.perf.drawCalls = 0;
  runtime.perf.culledSprites = 0;
  runtime.perf.tilesDrawn = 0;
  runtime.perf.objectsDrawn = 0;
  runtime.perf.lifeDrawn = 0;
  runtime.perf.portalsDrawn = 0;
  runtime.perf.reactorsDrawn = 0;
}

function pushFramePerfSample(intervalMs) {
  const perf = runtime.perf;
  perf.samples[perf.sampleCursor] = intervalMs;
  perf.sampleCursor = (perf.sampleCursor + 1) % PERF_SAMPLE_SIZE;
  perf.sampleCount = Math.min(PERF_SAMPLE_SIZE, perf.sampleCount + 1);
}

function perfPercentile(p) {
  const perf = runtime.perf;
  if (perf.sampleCount <= 0) return 0;
  const values = perf.samples.slice(0, perf.sampleCount).sort((a, b) => a - b);
  const idx = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * p)));
  return values[idx] ?? 0;
}

function isRuntimeSummaryInteractionActive() {
  if (runtimeSummaryPointerSelecting) {
    return true;
  }

  if (document.activeElement === summaryEl) {
    return true;
  }

  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }

  const anchor = selection.anchorNode;
  const focus = selection.focusNode;
  return (
    (!!anchor && summaryEl.contains(anchor)) ||
    (!!focus && summaryEl.contains(focus))
  );
}

async function copyRuntimeSummaryToClipboard() {
  const text = summaryEl?.textContent ?? "";
  if (!text.trim()) {
    setStatus("Runtime summary is empty.");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Runtime summary copied to clipboard.");
    return;
  } catch {
    // Fallback for restricted clipboard environments
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (copied) {
      setStatus("Runtime summary copied to clipboard.");
    } else {
      setStatus("Unable to copy summary automatically. Select and copy manually.");
    }
  } catch {
    setStatus("Unable to copy summary automatically. Select and copy manually.");
  }
}

function loadCachedTeleportPreset() {
  const parsed = loadJsonFromStorage(TELEPORT_PRESET_CACHE_KEY);
  if (!parsed) return null;
  const x = Number(parsed.x), y = Number(parsed.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function saveCachedTeleportPreset(x, y) {
  saveJsonToStorage(TELEPORT_PRESET_CACHE_KEY, { x, y });
}

function applyManualTeleport(x, y) {
  if (!runtime.map) {
    setStatus("Cannot teleport: no map loaded yet.");
    return false;
  }

  const player = runtime.player;
  player.x = x;
  player.y = y;
  player.prevX = x;
  player.prevY = y;
  player.vx = 0;
  player.vy = 0;
  player.climbing = false;
  player.swimming = false;
  player.climbRope = null;
  player.climbCooldownUntil = 0;
  player.climbAttachTime = 0;
  player.reattachLockUntil = 0;
  player.reattachLockRopeKey = null;
  player.fallStartY = y;
  player.downJumpIgnoreFootholdId = null;
  player.downJumpIgnoreUntil = 0;
  player.downJumpControlLock = false;
  player.downJumpTargetFootholdId = null;

  const footholdNear = findFootholdAtXNearY(runtime.map, x, y, 2.5);
  if (footholdNear) {
    player.y = footholdNear.y;
    player.onGround = true;
    player.footholdId = footholdNear.line.id;
    player.footholdLayer = footholdNear.line.layer;
  } else {
    player.onGround = false;
    player.footholdId = null;
  }

  runtime.camera.x = clampCameraXToMapBounds(runtime.map, player.x);
  runtime.camera.y = clampCameraYToMapBounds(runtime.map, player.y - cameraHeightBias());
  runtime.portalScroll.active = false;

  setStatus(`Teleported to x=${Math.round(player.x)}, y=${Math.round(player.y)}.`);
  return true;
}

function initializeTeleportPresetInputs() {
  if (!teleportXInputEl || !teleportYInputEl) return;

  const cached = loadCachedTeleportPreset();
  if (!cached) return;

  teleportXInputEl.value = String(Math.round(cached.x));
  teleportYInputEl.value = String(Math.round(cached.y));
}


function loadCachedPlayerStats() {
  const parsed = loadJsonFromStorage(STAT_CACHE_KEY);
  if (!parsed) return null;
  const speed = Number(parsed.speed), jump = Number(parsed.jump);
  return Number.isFinite(speed) && Number.isFinite(jump) ? { speed, jump } : null;
}

function saveCachedPlayerStats(speed, jump) {
  saveJsonToStorage(STAT_CACHE_KEY, { speed, jump });
}

function initializeStatInputs() {
  const cached = loadCachedPlayerStats();
  const speed = cached?.speed ?? PHYS_DEFAULT_SPEED_STAT;
  const jump = cached?.jump ?? PHYS_DEFAULT_JUMP_STAT;

  runtime.player.stats.speed = speed;
  runtime.player.stats.jump = jump;

  if (statSpeedInputEl) statSpeedInputEl.value = String(speed);
  if (statJumpInputEl) statJumpInputEl.value = String(jump);
}

function applyStatInputChange() {
  const speed = Number(statSpeedInputEl?.value ?? PHYS_DEFAULT_SPEED_STAT);
  const jump = Number(statJumpInputEl?.value ?? PHYS_DEFAULT_JUMP_STAT);

  const clampedSpeed = Number.isFinite(speed) ? Math.max(0, Math.min(250, Math.round(speed))) : PHYS_DEFAULT_SPEED_STAT;
  const clampedJump = Number.isFinite(jump) ? Math.max(0, Math.min(250, Math.round(jump))) : PHYS_DEFAULT_JUMP_STAT;

  runtime.player.stats.speed = clampedSpeed;
  runtime.player.stats.jump = clampedJump;

  saveCachedPlayerStats(clampedSpeed, clampedJump);
}

function openChatInput() {
  runtime.chat.inputActive = true;
  chatBarEl?.classList.remove("inactive");
  resetGameplayInput();
  if (chatInputEl) {
    chatInputEl.value = "";
    chatInputEl.focus();
  }
}

function closeChatInput() {
  runtime.chat.inputActive = false;
  chatBarEl?.classList.add("inactive");
  if (chatInputEl) chatInputEl.value = "";
  resetGameplayInput();
  canvasEl.focus();
}

function sendChatMessage(text) {
  if (!text || !text.trim()) return;
  const trimmed = text.trim();

  // Chat cooldown: 1s between messages
  const now = performance.now();
  if (now - _lastChatSendTime < 1000) return;
  _lastChatSendTime = now;

  const msg = {
    name: runtime.player.name || "Player",
    text: trimmed,
    timestamp: Date.now(),
    type: "normal",
  };

  runtime.chat.history.push(msg);
  if (runtime.chat.history.length > runtime.chat.maxHistory) {
    runtime.chat.history.shift();
  }

  appendChatLogMessage(msg);

  runtime.player.bubbleText = trimmed;
  runtime.player.bubbleExpiresAt = performance.now() + 8000;

  wsSend({ type: "chat", text: trimmed });

  playSfx("UI", "BtMouseOver");
}

function addSystemChatMessage(text) {
  const msg = {
    name: "",
    text,
    timestamp: Date.now(),
    type: "system",
  };

  runtime.chat.history.push(msg);
  if (runtime.chat.history.length > runtime.chat.maxHistory) {
    runtime.chat.history.shift();
  }

  appendChatLogMessage(msg);
}

function appendChatLogMessage(msg) {
  if (!chatLogMessagesEl) return;

  const el = document.createElement("div");
  el.className = msg.type === "system" ? "chat-msg chat-msg-system" : "chat-msg";

  if (msg.type === "system") {
    el.textContent = msg.text;
  } else {
    const nameSpan = document.createElement("span");
    nameSpan.className = "chat-msg-name";
    nameSpan.textContent = msg.name + ": ";
    el.appendChild(nameSpan);
    el.appendChild(document.createTextNode(msg.text));
  }

  chatLogMessagesEl.appendChild(el);

  while (chatLogMessagesEl.children.length > runtime.chat.maxHistory) {
    chatLogMessagesEl.removeChild(chatLogMessagesEl.firstChild);
  }

  chatLogMessagesEl.scrollTop = chatLogMessagesEl.scrollHeight;
}


function initChatLogResize() {
  if (!chatLogEl || !chatLogHandleEl) return;

  let chatLogCollapsed = false;
  let chatLogExpandedHeight = 140;

  const cached = localStorage.getItem(CHAT_LOG_HEIGHT_CACHE_KEY);
  if (cached) {
    const h = Number(cached);
    if (Number.isFinite(h) && h >= 48) {
      chatLogExpandedHeight = h;
    }
  }

  const HANDLE_HEIGHT = 14;

  function saveChatLogState() {
    try {
      localStorage.setItem(CHAT_LOG_HEIGHT_CACHE_KEY, String(chatLogExpandedHeight));
      localStorage.setItem(CHAT_LOG_COLLAPSED_KEY, chatLogCollapsed ? "1" : "0");
    } catch { /* ignore */ }
  }

  function collapseChatLog() {
    chatLogExpandedHeight = chatLogEl.offsetHeight || chatLogExpandedHeight;
    chatLogCollapsed = true;
    chatLogEl.style.height = HANDLE_HEIGHT + "px";
    chatLogEl.style.minHeight = HANDLE_HEIGHT + "px";
    saveChatLogState();
  }

  function expandChatLog() {
    chatLogCollapsed = false;
    chatLogEl.style.height = chatLogExpandedHeight + "px";
    chatLogEl.style.minHeight = "";
    saveChatLogState();
  }

  // Restore collapsed state
  const savedCollapsed = localStorage.getItem(CHAT_LOG_COLLAPSED_KEY);
  if (savedCollapsed === "1") {
    chatLogCollapsed = true;
    chatLogEl.style.height = HANDLE_HEIGHT + "px";
    chatLogEl.style.minHeight = HANDLE_HEIGHT + "px";
  } else {
    chatLogEl.style.height = chatLogExpandedHeight + "px";
  }

  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  // Cursor state: show CANCLICK on hover, CLICKING on press
  chatLogHandleEl.addEventListener("mouseenter", () => {
    if (!wzCursor.clickState) setCursorState(CURSOR_CANCLICK);
  });
  chatLogHandleEl.addEventListener("mouseleave", () => {
    if (!wzCursor.clickState) setCursorState(CURSOR_IDLE);
  });

  chatLogHandleEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startHeight = chatLogCollapsed ? 0 : chatLogEl.offsetHeight;
    chatLogHandleEl.setPointerCapture(e.pointerId);
    wzCursor.clickState = true;
    setCursorState(CURSOR_CLICKING);
  });

  chatLogHandleEl.addEventListener("dblclick", (e) => {
    e.preventDefault();
    if (chatLogCollapsed) {
      expandChatLog();
    } else {
      collapseChatLog();
    }
  });

  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const wrapperRect = chatLogEl.parentElement?.getBoundingClientRect();
    if (!wrapperRect) return;
    const maxH = Math.floor(wrapperRect.height * 0.75);
    const delta = startY - e.clientY;
    const newH = Math.max(HANDLE_HEIGHT + 20, Math.min(maxH, startHeight + delta));
    chatLogEl.style.height = newH + "px";
    chatLogEl.style.minHeight = "";
    chatLogCollapsed = false;
  });

  window.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    wzCursor.clickState = false;
    // Restore CANCLICK if pointer is still over the handle
    const rect = chatLogHandleEl.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      setCursorState(CURSOR_CANCLICK);
    } else {
      setCursorState(CURSOR_IDLE);
    }
    if (!chatLogCollapsed) {
      chatLogExpandedHeight = chatLogEl.offsetHeight || chatLogExpandedHeight;
    }
    saveChatLogState();
  });
}

function resetGameplayInput() {
  runtime.input.left = false;
  runtime.input.right = false;
  runtime.input.up = false;
  runtime.input.down = false;
  runtime.input.jumpHeld = false;
  runtime.input.jumpQueued = false;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Safe JSON load from localStorage. Returns null on any failure. */
function loadJsonFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Safe JSON save to localStorage. Silently ignores failures. */
function saveJsonToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function childByName(node, name) {
  return (node?.$$ ?? []).find((child) => child.$imgdir === name);
}

function imgdirChildren(node) {
  return (node?.$$ ?? []).filter((child) => typeof child.$imgdir === "string");
}

function parseLeafValue(leaf) {
  if (leaf.$int) return Number.parseInt(leaf.value, 10);
  if (leaf.$float) return Number.parseFloat(leaf.value);
  if (leaf.$double) return Number.parseFloat(leaf.value);
  if (leaf.$short) return Number.parseInt(leaf.value, 10);
  if (leaf.$string) return String(leaf.value);
  return leaf.value;
}

function imgdirLeafRecord(node) {
  const record = {};
  for (const child of node?.$$ ?? []) {
    const key = child.$int ?? child.$float ?? child.$string ?? child.$double ?? child.$short;
    if (!key) continue;
    record[key] = parseLeafValue(child);
  }
  return record;
}

function vectorRecord(node) {
  const vectors = {};

  for (const child of node?.$$ ?? []) {
    if (child.$vector) {
      vectors[child.$vector] = {
        x: safeNumber(child.x, 0),
        y: safeNumber(child.y, 0),
      };
    }

    if (child.$imgdir === "map") {
      for (const mapVector of child.$$ ?? []) {
        if (!mapVector.$vector) continue;
        vectors[mapVector.$vector] = {
          x: safeNumber(mapVector.x, 0),
          y: safeNumber(mapVector.y, 0),
        };
      }
    }
  }

  return vectors;
}

function pickCanvasNode(node, preferredIndex = "0") {
  if (!node) return null;
  if (node.$canvas) return node;

  const children = node.$$ ?? [];
  const directCanvas =
    children.find((child) => child.$canvas === preferredIndex) ??
    children.find((child) => typeof child.$canvas === "string");
  if (directCanvas) return directCanvas;

  const numericFrame =
    children.find((child) => child.$imgdir === preferredIndex) ??
    children.find((child) => /^\d+$/.test(child.$imgdir ?? ""));
  if (numericFrame) return pickCanvasNode(numericFrame, "0");

  return null;
}

function canvasMetaFromNode(canvasNode) {
  if (!canvasNode?.basedata) return null;

  const leaf = imgdirLeafRecord(canvasNode);
  const hasA0 = Object.prototype.hasOwnProperty.call(leaf, "a0");
  const hasA1 = Object.prototype.hasOwnProperty.call(leaf, "a1");

  let opacityStart = 255;
  let opacityEnd = 255;
  if (hasA0 && hasA1) {
    opacityStart = safeNumber(leaf.a0, 255);
    opacityEnd = safeNumber(leaf.a1, 255);
  } else if (hasA0) {
    opacityStart = safeNumber(leaf.a0, 255);
    opacityEnd = 255 - opacityStart;
  } else if (hasA1) {
    opacityEnd = safeNumber(leaf.a1, 255);
    opacityStart = 255 - opacityEnd;
  }

  return {
    basedata: canvasNode.basedata,
    width: safeNumber(canvasNode.width, 0),
    height: safeNumber(canvasNode.height, 0),
    vectors: vectorRecord(canvasNode),
    zName: String(leaf.z ?? ""),
    moveType: safeNumber(leaf.moveType, 0),
    moveW: safeNumber(leaf.moveW, 0),
    moveH: safeNumber(leaf.moveH, 0),
    moveP: safeNumber(leaf.moveP, Math.PI * 2 * 1000),
    moveR: safeNumber(leaf.moveR, 0),
    opacityStart,
    opacityEnd,
  };
}

function objectMetaExtrasFromNode(node) {
  const leaf = imgdirLeafRecord(node);
  return {
    obstacle: safeNumber(leaf.obstacle, 0),
    damage: safeNumber(leaf.damage, 0),
    hazardDir: safeNumber(leaf.dir, 0),
  };
}

function applyObjectMetaExtras(meta, extras) {
  if (!meta) return null;
  return {
    ...meta,
    ...extras,
  };
}

function mapPathFromId(mapId) {
  const id = String(mapId).trim();
  if (!/^\d{9}$/.test(id)) {
    throw new Error("Map ID must be 9 digits");
  }

  const prefix = id[0];
  return `/resources/Map.wz/Map/Map${prefix}/${id}.img.json`;
}

function soundPathFromName(soundFile) {
  const normalized = soundFile.endsWith(".img") ? soundFile : `${soundFile}.img`;
  return `/resources/Sound.wz/${normalized}.json`;
}

function loadSettings() {
  const parsed = loadJsonFromStorage(SETTINGS_CACHE_KEY);
  if (!parsed) return;
  if (typeof parsed.bgmEnabled === "boolean") runtime.settings.bgmEnabled = parsed.bgmEnabled;
  if (typeof parsed.sfxEnabled === "boolean") runtime.settings.sfxEnabled = parsed.sfxEnabled;
  if (typeof parsed.fixedRes === "boolean") runtime.settings.fixedRes = parsed.fixedRes;
  if (typeof parsed.fixed169 === "boolean" && typeof parsed.fixedRes !== "boolean") runtime.settings.fixedRes = parsed.fixed169;
  if (typeof parsed.minimapVisible === "boolean") runtime.settings.minimapVisible = parsed.minimapVisible;
}

function saveSettings() {
  saveJsonToStorage(SETTINGS_CACHE_KEY, runtime.settings);
}

function syncSettingsToUI() {
  if (settingsBgmToggleEl) settingsBgmToggleEl.checked = runtime.settings.bgmEnabled;
  if (settingsSfxToggleEl) settingsSfxToggleEl.checked = runtime.settings.sfxEnabled;
  if (settingsFixedResEl) settingsFixedResEl.checked = runtime.settings.fixedRes;
  if (settingsMinimapToggleEl) settingsMinimapToggleEl.checked = runtime.settings.minimapVisible;
}

function applyFixedRes() {
  const wrapper = document.querySelector(".canvas-wrapper");
  if (!wrapper) return;

  if (runtime.settings.fixedRes) {
    const vw = window.innerWidth || DEFAULT_CANVAS_WIDTH;
    const vh = window.innerHeight || DEFAULT_CANVAS_HEIGHT;

    // Fit 4:3 (1024×768) display within viewport (CSS display size)
    let displayW, displayH;
    if (vw / vh > 4 / 3) {
      displayH = vh;
      displayW = Math.round(vh * 4 / 3);
    } else {
      displayW = vw;
      displayH = Math.round(vw * 3 / 4);
    }
    wrapper.style.setProperty("--fixed-w", displayW + "px");
    wrapper.style.setProperty("--fixed-h", displayH + "px");
    wrapper.classList.add("fixed-res");
  } else {
    wrapper.classList.remove("fixed-res");
    wrapper.style.removeProperty("--fixed-w");
    wrapper.style.removeProperty("--fixed-h");
  }
  syncCanvasResolution();
}

function syncCanvasResolution() {
  let nextWidth, nextHeight;

  if (runtime.settings.fixedRes) {
    // Fixed resolution: always render at 1024×768, CSS scales the display.
    nextWidth = FIXED_RES_WIDTH;
    nextHeight = FIXED_RES_HEIGHT;
  } else {
    // Use the canvas element's CSS-rendered size (accounts for chat bar flex layout)
    const rect = canvasEl.getBoundingClientRect();
    nextWidth = Math.round(rect.width) || window.innerWidth || DEFAULT_CANVAS_WIDTH;
    nextHeight = Math.round(rect.height) || window.innerHeight || DEFAULT_CANVAS_HEIGHT;
  }

  nextWidth = Math.max(MIN_CANVAS_WIDTH, nextWidth);
  nextHeight = Math.max(MIN_CANVAS_HEIGHT, nextHeight);

  if (canvasEl.width === nextWidth && canvasEl.height === nextHeight) {
    return;
  }

  canvasEl.width = nextWidth;
  canvasEl.height = nextHeight;

  if (runtime.map) {
    runtime.backgroundViewAnchorY = canvasEl.height / 2 - runtime.camera.y;
  }
}

function bindCanvasResizeHandling() {
  syncCanvasResolution();

  const onResize = () => {
    if (runtime.settings.fixedRes) applyFixedRes();
    else syncCanvasResolution();
  };

  window.addEventListener("resize", onResize);

  if (typeof ResizeObserver !== "undefined") {
    canvasResizeObserver = new ResizeObserver(() => {
      syncCanvasResolution();
    });
    canvasResizeObserver.observe(canvasEl);
  }
}

function worldToScreen(worldX, worldY) {
  return {
    x: Math.round(worldX - runtime.camera.x + gameViewWidth() / 2),
    y: Math.round(worldY - runtime.camera.y + gameViewHeight() / 2),
  };
}

function isWorldRectVisible(worldX, worldY, width, height, margin = 96) {
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;
  const left = runtime.camera.x - halfW - margin;
  const right = runtime.camera.x + halfW + margin;
  const top = runtime.camera.y - halfH - margin;
  const bottom = runtime.camera.y + halfH + margin;

  return worldX + width >= left && worldX <= right && worldY + height >= top && worldY <= bottom;
}

function drawWorldImage(image, worldX, worldY, opts = {}) {
  const screen = worldToScreen(worldX, worldY);
  const flipped = !!opts.flipped;

  if (!flipped) {
    ctx.drawImage(image, screen.x, screen.y);
    runtime.perf.drawCalls += 1;
    return;
  }

  ctx.save();
  ctx.translate(screen.x + image.width, screen.y);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0);
  runtime.perf.drawCalls += 1;
  ctx.restore();
}

function localPoint(meta, image, vectorName, flipped) {
  const origin = meta?.vectors?.origin ?? { x: 0, y: image.height };
  const vector = vectorName ? meta?.vectors?.[vectorName] ?? { x: 0, y: 0 } : { x: 0, y: 0 };

  const baseX = origin.x + vector.x;
  const x = flipped ? image.width - baseX : baseX;
  const y = origin.y + vector.y;

  return { x, y };
}

function topLeftFromAnchor(meta, image, anchorWorld, anchorName, flipped) {
  const anchorLocal = localPoint(meta, image, anchorName, flipped);

  return {
    x: anchorWorld.x - anchorLocal.x,
    y: anchorWorld.y - anchorLocal.y,
  };
}

function worldPointFromTopLeft(meta, image, topLeft, vectorName, flipped) {
  const pointLocal = localPoint(meta, image, vectorName, flipped);
  return {
    x: topLeft.x + pointLocal.x,
    y: topLeft.y + pointLocal.y,
  };
}

// ─── Map String Data ──────────────────────────────────────────────────────────
let mapStringData = null;
let mapStringDataPromise = null;

async function loadMapStringData() {
  if (mapStringData) return mapStringData;
  if (mapStringDataPromise) return mapStringDataPromise;
  mapStringDataPromise = (async () => {
    const raw = await fetchJson("/resources/String.wz/Map.img.json");
    const lookup = {};
    for (const region of raw.$$ ?? []) {
      for (const entry of region.$$ ?? []) {
        const mapId = entry.$imgdir;
        if (!mapId) continue;
        const rec = {};
        for (const prop of entry.$$ ?? []) {
          if (prop.$string) rec[prop.$string] = prop.value ?? "";
        }
        lookup[mapId] = rec;
      }
    }
    mapStringData = lookup;
    return lookup;
  })();
  return mapStringDataPromise;
}

function getMapStringName(mapId) {
  if (!mapStringData) return null;
  const entry = mapStringData[String(mapId).replace(/^0+/, "") || "0"];
  if (!entry) return null;
  return entry.mapName ?? null;
}

function getMapStringStreet(mapId) {
  if (!mapStringData) return null;
  const entry = mapStringData[String(mapId).replace(/^0+/, "") || "0"];
  if (!entry) return null;
  return entry.streetName ?? null;
}

/**
 * Centralized JSON asset loader with caching, request coalescing, and retry.
 * All WZ data access MUST go through this function (Step 32 compliance).
 * The promise cache deduplicates in-flight requests for the same path.
 * On transient failure, retries up to 2 times with exponential backoff.
 */
async function fetchJson(path) {
  if (!jsonCache.has(path)) {
    jsonCache.set(
      path,
      (async () => {
        const response = await cachedFetch(path);
        if (!response.ok) {
          const msg = `Failed to load JSON ${path} (${response.status})`;
          rlog(`fetchJson FAIL: ${msg}`);
          throw new Error(msg);
        }
        return response.json();
      })(),
    );
  }

  return jsonCache.get(path);
}

function getMetaByKey(key) {
  return metaCache.get(key) ?? null;
}

function requestMeta(key, loader) {
  if (metaCache.has(key)) {
    return metaCache.get(key);
  }

  if (!metaPromiseCache.has(key)) {
    metaPromiseCache.set(
      key,
      (async () => {
        try {
          const meta = await loader();
          if (meta) {
            metaCache.set(key, meta);
            return meta;
          }
        } catch (error) {
          console.warn("[asset-meta] failed", key, error);
        } finally {
          metaPromiseCache.delete(key);
        }

        return null;
      })(),
    );
  }

  return metaPromiseCache.get(key);
}

function requestImageByKey(key) {
  if (imageCache.has(key)) {
    return imageCache.get(key);
  }

  if (imagePromiseCache.has(key)) {
    return imagePromiseCache.get(key);
  }

  const meta = metaCache.get(key);
  if (!meta) {
    return null;
  }

  if (!meta.basedata || typeof meta.basedata !== "string" || meta.basedata.length < 8) {
    rlog(`BAD BASEDATA key=${key} type=${typeof meta.basedata} len=${meta.basedata?.length ?? 0}`);
    return null;
  }

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      imageCache.set(key, image);
      imagePromiseCache.delete(key);
      resolve(image);
    };
    image.onerror = () => {
      rlog(`IMG DECODE FAIL key=${key} basedataLen=${meta.basedata?.length ?? "N/A"}`);
      imagePromiseCache.delete(key);
      resolve(null);
    };
    image.src = `data:image/png;base64,${meta.basedata}`;
  });

  imagePromiseCache.set(key, promise);
  return promise;
}

function getImageByKey(key) {
  const cached = imageCache.get(key);
  if (cached) return cached;
  requestImageByKey(key);
  return null;
}

function findNodeByPath(root, names) {
  let current = root;
  for (const name of names) {
    current = childByName(current, name);
    if (!current) return null;
  }
  return current;
}

function resolveNodeByUol(root, basePath, uolValue) {
  if (!uolValue || typeof uolValue !== "string") {
    return null;
  }

  const targetPath = uolValue.startsWith("/") ? [] : [...basePath];
  const tokens = uolValue.split("/").filter((token) => token.length > 0);

  for (const token of tokens) {
    if (token === ".") continue;
    if (token === "..") {
      targetPath.pop();
      continue;
    }
    targetPath.push(token);
  }

  if (targetPath.length === 0) {
    return null;
  }

  let current = root;
  for (const segment of targetPath) {
    current = (current?.$$ ?? []).find(
      (child) =>
        child.$imgdir === segment ||
        child.$canvas === segment ||
        child.$vector === segment ||
        child.$sound === segment,
    );

    if (!current) {
      return null;
    }
  }

  return current;
}

// ─── Life (Mob/NPC) Sprite System ─────────────────────────────────────────────
const lifeAnimations = new Map(); // key: "m:0120100" or "n:1012000" -> { stances, name }
const lifeAnimationPromises = new Map();

/**
 * Load mob/NPC sprite data from WZ JSON.
 * Returns { stances: { [stanceName]: { frames: [{ key, width, height, originX, originY, delay }] } }, name }
 */
async function loadLifeAnimation(type, id) {
  const cacheKey = `${type}:${id}`;
  if (lifeAnimations.has(cacheKey)) return lifeAnimations.get(cacheKey);
  if (lifeAnimationPromises.has(cacheKey)) return lifeAnimationPromises.get(cacheKey);

  const paddedId = id.replace(/^0+/, "").padStart(7, "0");
  const wzDir = type === "m" ? "Mob.wz" : "Npc.wz";
  const path = `/resources/${wzDir}/${paddedId}.img.json`;

  const promise = (async () => {
    try {
      const raw = await fetchJson(path);

      // Check for link (some NPCs/mobs redirect to another)
      const infoNode = childByName(raw, "info");
      let srcNode = raw;
      if (infoNode) {
        const infoRec = imgdirLeafRecord(infoNode);
        if (infoRec.link) {
          const linkId = String(infoRec.link).replace(/^0+/, "").padStart(7, "0");
          const linkPath = `/resources/${wzDir}/${linkId}.img.json`;
          try {
            srcNode = await fetchJson(linkPath);
          } catch (_) {
            // fallback to original
          }
        }
      }

      const stances = {};
      for (const stanceNode of srcNode.$$ ?? []) {
        const stanceName = stanceNode.$imgdir;
        if (!stanceName || stanceName === "info") continue;

        const frames = [];
        for (const frameNode of stanceNode.$$ ?? []) {
          if (!frameNode.basedata) continue;

          const frameIdx = frameNode.$imgdir ?? frameNode.$canvas ?? String(frames.length);
          const key = `life:${cacheKey}:${stanceName}:${frameIdx}`;
          let originX = 0, originY = 0, delay = 200;

          for (const sub of frameNode.$$ ?? []) {
            if (sub.$vector === "origin") {
              originX = safeNumber(sub.x, 0);
              originY = safeNumber(sub.y, 0);
            }
            if (sub.$int === "delay") {
              delay = safeNumber(sub.value, 200);
            }
          }

          frames.push({
            key,
            width: frameNode.width ?? 0,
            height: frameNode.height ?? 0,
            basedata: frameNode.basedata,
            originX,
            originY,
            delay: Math.max(delay, 30),
          });
        }

        if (frames.length > 0) {
          stances[stanceName] = { frames };
        }
      }

      // Load name + dialogue from String.wz
      let name = "";
      let func = "";
      const dialogue = [];
      let stringEntry = null;
      try {
        const stringFile = type === "m" ? "Mob.img.json" : "Npc.img.json";
        const stringData = await fetchJson(`/resources/String.wz/${stringFile}`);
        const rawId = id.replace(/^0+/, "") || "0";
        stringEntry = (stringData.$$ ?? []).find(
          (c) => c.$imgdir === rawId
        );
        if (stringEntry) {
          for (const prop of stringEntry.$$ ?? []) {
            const sKey = prop.$string ?? "";
            if (sKey === "name") name = prop.value ?? "";
            if (sKey === "func") func = prop.value ?? "";
            // Collect dialogue lines (n0, n1, ... or d0, d1, ...)
            if (/^[nd]\d+$/.test(sKey) && prop.value) {
              dialogue.push(prop.value);
            }
          }
        }
      } catch (_) {}

      // Extract mob stats from info
      let speed = -100; // default: stationary
      let level = 1, wdef = 0, avoid = 0, knockback = 1, maxHP = 0;
      let touchDamageEnabled = false, touchAttack = 1;
      if (type === "m" && infoNode) {
        const infoRec = imgdirLeafRecord(infoNode);
        speed = safeNumber(infoRec.speed, -100);
        level = safeNumber(infoRec.level, 1);
        wdef = safeNumber(infoRec.PDDamage, 0);
        avoid = safeNumber(infoRec.eva, 0);
        knockback = safeNumber(infoRec.pushed, 1);
        maxHP = safeNumber(infoRec.maxHP, 100);
        touchDamageEnabled = safeNumber(infoRec.bodyAttack, 0) === 1;
        touchAttack = Math.max(1, safeNumber(infoRec.PADamage, 1));
      }

      // Extract NPC script ID from info/script
      let scriptId = "";
      if (type === "n" && infoNode) {
        const scriptNode = childByName(infoNode, "script");
        if (scriptNode) {
          // script/0/script = "taxi1" etc.
          const first = (scriptNode.$$ ?? [])[0];
          if (first) {
            for (const prop of first.$$ ?? []) {
              if (prop.$string === "script") {
                scriptId = prop.value ?? "";
                break;
              }
            }
          }
        }
      }

      const result = {
        stances,
        name,
        speed,
        func,
        dialogue,
        scriptId,
        level,
        wdef,
        avoid,
        knockback,
        maxHP,
        touchDamageEnabled,
        touchAttack,
      };
      lifeAnimations.set(cacheKey, result);
      return result;
    } catch (_) {
      lifeAnimations.set(cacheKey, null);
      return null;
    }
  })();

  lifeAnimationPromises.set(cacheKey, promise);
  return promise;
}

// Per-life-entry runtime animation state
const lifeRuntimeState = new Map();

// ─── Mob Physics (per-tick values — used internally by friction formulas) ──────
const MOB_TPS = 125;              // C++ ticks per second (1000 / 8ms)
const MOB_GRAVFORCE = 0.14;      // px/tick²
const MOB_SWIMGRAVFORCE = 0.03;
const MOB_FRICTION = 0.5;
const MOB_SLOPEFACTOR = 0.1;
const MOB_GROUNDSLIP = 3.0;
const MOB_SWIMFRICTION = 0.08;
const MOB_HSPEED_DEADZONE = 0.1;

// ─── Mob Behavior ─────────────────────────────────────────────────────────────
const MOB_DEFAULT_HP = 100;       // fallback if WZ maxHP missing
const MOB_RESPAWN_DELAY_MS = 8000;

const MOB_AGGRO_DURATION_MS = 4000; // chase player after stagger


// ─── Mob UI ───────────────────────────────────────────────────────────────────
const MOB_HP_BAR_WIDTH = 60;
const MOB_HP_BAR_HEIGHT = 5;
const MOB_HP_SHOW_MS = 3000;

// ─── Damage Numbers (from C++ DamageNumber.cpp) ──────────────────────────────
const DMG_NUMBER_VSPEED = -0.25;         // px/tick rise speed
const DMG_NUMBER_FADE_TIME = 1500;       // ms total fade
const DMG_NUMBER_ROW_HEIGHT_NORMAL = 30;
const DMG_NUMBER_ROW_HEIGHT_CRIT = 36;
const DMG_DIGIT_ADVANCES = [24, 20, 22, 22, 24, 23, 24, 22, 24, 24];

// ─── Combat / Attack ──────────────────────────────────────────────────────────
const ATTACK_COOLDOWN_MS = 600;
const ATTACK_RANGE_X = 120;
const ATTACK_RANGE_Y = 50;
const WEAPON_MULTIPLIER = 4.0;    // 1H Sword
const DEFAULT_MASTERY = 0.2;
const DEFAULT_CRITICAL = 0.05;
const DEFAULT_ACCURACY = 10;
const DEFAULT_WATK = 15;
const SWORD_1H_ATTACK_STANCES = ["stabO1", "stabO2", "swingO1", "swingO2", "swingO3"];

const damageNumbers = []; // { x, y, vspeed, value, critical, opacity, miss }

// ─── WZ Damage Number Sprites ────────────────────────────────────────────────
// Loaded from Effect.wz/BasicEff.img: NoRed0/NoRed1 (normal), NoCri0/NoCri1 (critical)
// Index 0-9 = digit images, index 10 = Miss text
const dmgDigitImages = {
  normalFirst: new Array(11).fill(null),  // NoRed0[0..10]
  normalRest:  new Array(10).fill(null),  // NoRed1[0..9]
  critFirst:   new Array(11).fill(null),  // NoCri0[0..10]
  critRest:    new Array(10).fill(null),  // NoCri1[0..9]
};
let dmgDigitsLoaded = false;

async function loadDamageNumberSprites() {
  if (dmgDigitsLoaded) return;
  try {
    const json = await fetchJson("/resources/Effect.wz/BasicEff.img.json");
    if (!json?.$$) return;

    const sets = { NoRed0: "normalFirst", NoRed1: "normalRest", NoCri0: "critFirst", NoCri1: "critRest" };
    for (const node of json.$$) {
      const key = sets[node.$imgdir];
      if (!key) continue;
      const arr = dmgDigitImages[key];
      for (let i = 0; i < (node.$$?.length ?? 0) && i < arr.length; i++) {
        const frame = node.$$[i];
        if (!frame?.basedata) continue;
        let ox = 0, oy = 0;
        for (const sub of frame.$$?? []) {
          if (sub.$vector) { ox = parseInt(sub.x) || 0; oy = parseInt(sub.y) || 0; }
        }
        const img = new Image();
        img.src = `data:image/png;base64,${frame.basedata}`;
        arr[i] = { img, w: parseInt(frame.width) || 0, h: parseInt(frame.height) || 0, ox, oy };
      }
    }
    dmgDigitsLoaded = true;
  } catch (e) {
    console.warn("[dmg-sprites] Failed to load BasicEff digit sprites", e);
  }
}

// NPC interaction — click any visible NPC to open dialogue (no range limit)

// ─── Built-in NPC Scripts ─────────────────────────────────────────────────────
// Server-side NPC scripts are not available, so common NPCs get hardcoded dialogue
// with selectable options. Script IDs come from Npc.wz info/script nodes.

const VICTORIA_TOWNS = [
  { label: "Henesys", mapId: 100000000 },
  { label: "Ellinia", mapId: 101000000 },
  { label: "Perion", mapId: 102000000 },
  { label: "Kerning City", mapId: 103000000 },
  { label: "Lith Harbor", mapId: 104000000 },
  { label: "Sleepywood", mapId: 105040300 },
  { label: "Nautilus Harbor", mapId: 120000000 },
];

const ALL_MAJOR_TOWNS = [
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

const NPC_SCRIPTS = {
  // Victoria Island taxi NPCs
  taxi1: { greeting: "Hello! I drive the Regular Cab. Where would you like to go?", destinations: VICTORIA_TOWNS },
  taxi2: { greeting: "Hey there! Need a ride? Pick a destination!", destinations: VICTORIA_TOWNS },
  taxi3: { greeting: "Where would you like to go? I'll take you there!", destinations: VICTORIA_TOWNS },
  taxi4: { greeting: "Hop in! Where are you headed?", destinations: VICTORIA_TOWNS },
  taxi5: { greeting: "Welcome aboard! Choose your destination.", destinations: VICTORIA_TOWNS },
  taxi6: { greeting: "Need a lift? I can take you anywhere on the island!", destinations: VICTORIA_TOWNS },
  mTaxi: { greeting: "I'm a VIP Cab driver. Where shall I take you?", destinations: VICTORIA_TOWNS },
  NLC_Taxi: { greeting: "Welcome to the NLC Taxi! Where to?", destinations: [
    ...VICTORIA_TOWNS,
    { label: "New Leaf City", mapId: 600000000 },
  ]},
  // Ossyria taxi
  ossyria_taxi: { greeting: "I can take you around Ossyria. Where to?", destinations: [
    { label: "Orbis", mapId: 200000000 },
    { label: "El Nath", mapId: 211000000 },
    { label: "Ludibrium", mapId: 220000000 },
    { label: "Aquarium", mapId: 230000000 },
    { label: "Leafre", mapId: 240000000 },
  ]},
  // Aqua taxi
  aqua_taxi: { greeting: "Need an underwater ride?", destinations: [
    { label: "Aquarium", mapId: 230000000 },
    { label: "Herb Town", mapId: 251000000 },
  ]},
  // Town-specific go NPCs
  goHenesys: { greeting: "I can take you to Henesys!", destinations: [{ label: "Henesys", mapId: 100000000 }] },
  goElinia: { greeting: "Off to Ellinia?", destinations: [{ label: "Ellinia", mapId: 101000000 }] },
  goPerion: { greeting: "Headed to Perion?", destinations: [{ label: "Perion", mapId: 102000000 }] },
  goKerningCity: { greeting: "Kerning City awaits!", destinations: [{ label: "Kerning City", mapId: 103000000 }] },
  goNautilus: { greeting: "To Nautilus Harbor!", destinations: [{ label: "Nautilus Harbor", mapId: 120000000 }] },
  go_victoria: { greeting: "I'll take you back to Victoria Island!", destinations: VICTORIA_TOWNS },
  // Spinel — World Tour Guide
  world_trip: { greeting: "How about traveling to a new world? I can take you to many places!", destinations: ALL_MAJOR_TOWNS },
  // Jump quest challenge NPC (Maya on map 100000001)
  jq_challenge: { pages: [
    { text: "Cough... cough... Oh, a brave adventurer! You look like you could handle a real challenge. I know of several perilous trials scattered across Victoria Island and beyond..." },
    { text: "Shumi in Kerning City has been losing his valuables all over the construction site. Think you can navigate those treacherous platforms?",
      destinations: [
        { label: "Shumi's Lost Coin", mapId: 103000900 },
        { label: "Shumi's Lost Bundle of Money", mapId: 103000903 },
        { label: "Shumi's Lost Sack of Money", mapId: 103000906 },
      ] },
    { text: "Old man John tends a garden deep in the Sleepy Dungeon. He needs someone nimble enough to deliver his gifts through those crumbling caves.",
      destinations: [
        { label: "John's Pink Flower Basket", mapId: 105040310 },
        { label: "John's Present", mapId: 105040312 },
        { label: "John's Last Present", mapId: 105040314 },
      ] },
    { text: "And if you truly have nerves of steel... the ancient forests and volcanic depths await. Few who enter ever make it to the end.",
      destinations: [
        { label: "The Forest of Patience", mapId: 101000100 },
        { label: "Breath of Lava", mapId: 280020000 },
      ] },
  ]},
  // Jump quest exit NPCs
  subway_out: { greeting: "Had enough? I can send you back if you'd like.", destinations: [{ label: "Back to Mushroom Park", mapId: 100000001 }] },
  flower_out: { greeting: "This obstacle course is no joke. Need a way out?", destinations: [{ label: "Back to Mushroom Park", mapId: 100000001 }] },
  herb_out: { greeting: "Want to head back?", destinations: [{ label: "Back to Mushroom Park", mapId: 100000001 }] },
  Zakum06: { greeting: "This place is dangerous. I can get you out of here.", destinations: [{ label: "Back to Mushroom Park", mapId: 100000001 }] },
};

/**
 * Trigger a map transition from an NPC dialogue action.
 * Online: sends npc_warp { npc_id, map_id } to server (server validates NPC + destination).
 * Offline: loads map directly.
 */
async function runNpcMapTransition(npcId, mapId) {
  const targetMapId = String(mapId);
  rlog(`npcMapTransition START → npc=${npcId} map=${targetMapId} online=${_wsConnected}`);
  runtime.portalWarpInProgress = true;

  await fadeScreenTo(1, PORTAL_FADE_OUT_MS);
  runtime.transition.alpha = 0;
  runtime.transition.active = false;

  try {
    if (_wsConnected) {
      // Online: server validates NPC is on current map + destination is allowed
      const result = await requestServerMapChange({ type: "npc_warp", npc_id: npcId, map_id: targetMapId });
      await loadMap(result.map_id, result.spawn_portal || null, !!result.spawn_portal);
      saveCharacter();
      wsSend({ type: "map_loaded" });
    } else {
      // Offline: direct load
      await loadMap(targetMapId, null, false);
      saveCharacter();
    }
  } catch (err) {
    rlog(`npcMapTransition ERROR: ${err?.message ?? err}`);
    setStatus(`Travel failed: ${err?.message ?? err}`);
  } finally {
    runtime.portalWarpInProgress = false;
    runtime.transition.alpha = 1;
    runtime.transition.active = true;
    await fadeScreenTo(0, PORTAL_FADE_IN_MS);
    rlog(`npcMapTransition COMPLETE`);
  }
}

/**
 * Build dialogue lines from an NPC script definition.
 * npcId is the NPC's WZ ID (e.g. "1012000"), sent to server for validation.
 */
function buildScriptDialogue(scriptDef, npcId) {
  const lines = [];
  // Multi-page dialogue: pages[] with text + optional destinations
  if (scriptDef.pages) {
    for (const page of scriptDef.pages) {
      if (page.destinations) {
        lines.push({
          text: page.text,
          options: page.destinations.map((d) => ({
            label: d.label,
            action: () => {
              closeNpcDialogue();
              runNpcMapTransition(npcId, d.mapId);
            },
          })),
        });
      } else {
        lines.push(page.text);
      }
    }
    return lines;
  }
  // Single-page dialogue: greeting + destinations
  lines.push({
    text: scriptDef.greeting,
    options: scriptDef.destinations.map((d) => ({
      label: d.label,
      action: () => {
        closeNpcDialogue();
        runNpcMapTransition(npcId, d.mapId);
      },
    })),
  });
  return lines;
}

/**
 * Build a fallback dialogue for any NPC with a script but no explicit handler.
 * Uses the NPC's flavor text + offers travel to all major towns.
 * npcId is the NPC's WZ ID, sent to server for validation.
 */
function buildFallbackScriptDialogue(npcName, npcId, flavourLines) {
  const lines = [];
  // Show flavor text first if available
  if (flavourLines && flavourLines.length > 0) {
    for (const fl of flavourLines) lines.push(fl);
  }
  // Then offer travel options
  lines.push({
    text: `Where would you like to go?`,
    options: ALL_MAJOR_TOWNS.map((d) => ({
      label: d.label,
      action: () => {
        closeNpcDialogue();
        runNpcMapTransition(npcId, d.mapId);
      },
    })),
  });
  return lines;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/** Get Y on a foothold at X, or null if X is outside range or foothold is a wall. */
function fhGroundAt(fh, x) {
  if (!fh) return null;
  const dx = fh.x2 - fh.x1;
  if (Math.abs(dx) < 0.01) return null;
  const t = (x - fh.x1) / dx;
  if (t < -0.01 || t > 1.01) return null;
  return fh.y1 + (fh.y2 - fh.y1) * t;
}

function fhSlope(fh) {
  if (!fh) return 0;
  const dx = fh.x2 - fh.x1;
  if (Math.abs(dx) < 0.01) return 0;
  return (fh.y2 - fh.y1) / dx;
}

function fhLeft(fh) { return Math.min(fh.x1, fh.x2); }
function fhRight(fh) { return Math.max(fh.x1, fh.x2); }
function fhIsWall(fh) { return Math.abs(fh.x2 - fh.x1) < 0.01; }

/** Find the foothold directly below (x, y) — closest ground at or below y. */
function fhIdBelow(map, x, y) {
  const result = findFootholdBelow(map, x, y);
  return result ? result.line : null;
}

/** Get the edge limit for TURNATEDGES — returns the X limit. */
function fhEdge(map, fhId, goingLeft) {
  const fh = map.footholdById?.get(String(fhId));
  if (!fh) return goingLeft ? -30000 : 30000;

  if (goingLeft) {
    if (!fh.prevId) return fhLeft(fh);
    const prev = map.footholdById?.get(fh.prevId);
    if (!prev || fhIsWall(prev)) return fhLeft(fh);
    if (!prev.prevId) return fhLeft(prev);
    return -30000;
  } else {
    if (!fh.nextId) return fhRight(fh);
    const next = map.footholdById?.get(fh.nextId);
    if (!next || fhIsWall(next)) return fhRight(fh);
    if (!next.nextId) return fhRight(next);
    return 30000;
  }
}

/** Get the wall limit — returns the X where a wall blocks movement. */
function fhWall(map, fhId, goingLeft, fy) {
  const fh = map.footholdById?.get(String(fhId));
  if (!fh) return goingLeft ? map.bounds.minX : map.bounds.maxX;
  const vertRange = [fy - 50, fy - 1];

  const isBlocking = (f) => {
    if (!f || !fhIsWall(f)) return false;
    const top = Math.min(f.y1, f.y2);
    const bot = Math.max(f.y1, f.y2);
    return vertRange[0] < bot && vertRange[1] > top;
  };

  if (goingLeft) {
    const prev = fh.prevId ? map.footholdById?.get(fh.prevId) : null;
    if (isBlocking(prev)) return fhLeft(fh);
    const pp = prev?.prevId ? map.footholdById?.get(prev.prevId) : null;
    if (isBlocking(pp)) return prev ? fhLeft(prev) : fhLeft(fh);
    return map.bounds.minX;
  } else {
    const next = fh.nextId ? map.footholdById?.get(fh.nextId) : null;
    if (isBlocking(next)) return fhRight(fh);
    const nn = next?.nextId ? map.footholdById?.get(next.nextId) : null;
    if (isBlocking(nn)) return next ? fhRight(next) : fhRight(fh);
    return map.bounds.maxX;
  }
}

/**
 * C++ Mob::next_move() — decides the mob's next action after a stance completes.
 * HIT/STAND → MOVE (random direction)
 * MOVE → 33% STAND, 33% MOVE left, 33% MOVE right
 */
function mobNextMove(state, anim) {
  if (!state.canMove) {
    state.behaviorState = "stand";
    return;
  }

  const currentStance = state.stance;

  if (currentStance === "hit1" || currentStance === "stand" || state.behaviorState === "stand") {
    // C++ case HIT/STAND: set_stance(MOVE), flip = random
    state.behaviorState = "move";
    state.facing = Math.random() < 0.5 ? -1 : 1;
  } else {
    // C++ case MOVE/JUMP: random 3-way
    const r = Math.floor(Math.random() * 3);
    if (r === 0) {
      state.behaviorState = "stand";
    } else if (r === 1) {
      state.behaviorState = "move";
      state.facing = -1; // C++ flip = false → facing left
    } else {
      state.behaviorState = "move";
      state.facing = 1;  // C++ flip = true → facing right
    }
  }
}

/**
 * Delta-time physics update for a mob/NPC PhysicsObject.
 *
 * Speeds (hspeed/vspeed) and forces (hforce/vforce) are stored in px/sec.
 * Internally we convert to per-tick units for the C++ friction/inertia formulas
 * (which are tuned for 8ms ticks), then scale the result by dtSec.
 *
 * @param {number} dtSec — frame delta in seconds
 */
function mobPhysicsUpdate(map, phobj, isSwimMap, dtSec) {
  if (dtSec <= 0) return;
  const numTicks = dtSec * MOB_TPS; // equivalent C++ ticks this frame

  // ── Step 1: Foothold tracking ──
  if (phobj.onGround) {
    const curFh = map.footholdById?.get(String(phobj.fhId));
    if (curFh) {
      let newFhId = phobj.fhId;

      if (phobj.x > fhRight(curFh)) {
        newFhId = curFh.nextId || "0";
      } else if (phobj.x < fhLeft(curFh)) {
        newFhId = curFh.prevId || "0";
      }

      if (newFhId === "0" || !newFhId) {
        const below = fhIdBelow(map, phobj.x, phobj.y);
        if (below) {
          phobj.fhId = below.id;
          phobj.fhSlope = fhSlope(below);
        } else {
          phobj.fhId = curFh.id;
          if (phobj.x > fhRight(curFh)) phobj.x = fhRight(curFh);
          else phobj.x = fhLeft(curFh);
          phobj.hspeed = 0;
        }
      } else {
        const nxtFh = map.footholdById?.get(String(newFhId));
        if (nxtFh && !fhIsWall(nxtFh)) {
          phobj.fhId = nxtFh.id;
          phobj.fhSlope = fhSlope(nxtFh);
        } else {
          phobj.fhId = curFh.id;
          if (phobj.x > fhRight(curFh)) phobj.x = fhRight(curFh);
          else phobj.x = fhLeft(curFh);
          phobj.hspeed = 0;
        }
      }
    }

    const snapFh = map.footholdById?.get(String(phobj.fhId));
    if (snapFh) {
      const gy = fhGroundAt(snapFh, phobj.x);
      if (gy !== null) {
        phobj.y = gy;
        phobj.onGround = true;
      } else {
        phobj.onGround = false;
      }
    }
  } else {
    const below = fhIdBelow(map, phobj.x, phobj.y);
    if (below) {
      phobj.fhId = below.id;
      phobj.fhSlope = fhSlope(below);
    }
  }

  // ── Step 2: Physics in per-tick units (C++ formulas), then scale by numTicks ──
  // Convert px/sec → px/tick for friction/inertia formulas
  let hspeedTick = phobj.hspeed / MOB_TPS;
  let vspeedTick = phobj.vspeed / MOB_TPS;
  const hforceTick = phobj.hforce / MOB_TPS;
  const vforceTick = phobj.vforce / MOB_TPS;

  let hacc = 0, vacc = 0;

  if (phobj.onGround) {
    hacc = hforceTick;
    vacc = vforceTick;

    if (hacc === 0 && Math.abs(hspeedTick) < 0.1) {
      hspeedTick = 0;
    } else {
      const inertia = hspeedTick / MOB_GROUNDSLIP;
      const sf = Math.max(-0.5, Math.min(0.5, phobj.fhSlope));
      hacc -= (MOB_FRICTION + MOB_SLOPEFACTOR * (1 + sf * -inertia)) * inertia;
    }
  } else {
    if (isSwimMap) {
      hacc = hforceTick - MOB_SWIMFRICTION * hspeedTick;
      vacc = vforceTick - MOB_SWIMFRICTION * vspeedTick + MOB_SWIMGRAVFORCE;
    } else {
      vacc = MOB_GRAVFORCE;
    }
  }

  hspeedTick += hacc * numTicks;
  vspeedTick += vacc * numTicks;

  // Convert back to px/sec
  phobj.hspeed = hspeedTick * MOB_TPS;
  phobj.vspeed = vspeedTick * MOB_TPS;
  phobj.hforce = 0;
  phobj.vforce = 0;

  // ── Step 3: Wall/edge collision on next position ──
  const dx = phobj.hspeed * dtSec;
  if (phobj.onGround && Math.abs(dx) > 0.001) {
    const crntX = phobj.x;
    const nextX = phobj.x + dx;
    const left = dx < 0;

    let wall = fhWall(map, phobj.fhId, left, phobj.y);
    let collision = left ? (crntX >= wall && nextX <= wall) : (crntX <= wall && nextX >= wall);

    if (!collision && phobj.turnAtEdges) {
      wall = fhEdge(map, phobj.fhId, left);
      collision = left ? (crntX >= wall && nextX <= wall) : (crntX <= wall && nextX >= wall);
    }

    if (collision) {
      phobj.x = wall;
      phobj.hspeed = 0;
      phobj.turnAtEdges = false;
    }
  }

  // Vertical landing
  const dy = phobj.vspeed * dtSec;
  if (!phobj.onGround && phobj.vspeed > 0) {
    const crntY = phobj.y;
    const nextY = phobj.y + dy;
    const landFh = fhIdBelow(map, phobj.x, crntY);
    if (landFh) {
      const gy = fhGroundAt(landFh, phobj.x);
      if (gy !== null && crntY <= gy + 1 && nextY >= gy - 1) {
        phobj.y = gy;
        phobj.vspeed = 0;
        phobj.onGround = true;
        phobj.fhId = landFh.id;
        phobj.fhSlope = fhSlope(landFh);
        return;
      }
    }
  }

  // ── Step 4: Apply displacement ──
  phobj.x += phobj.hspeed * dtSec;
  phobj.y += phobj.vspeed * dtSec;

  if (phobj.y > map.bounds.maxY + 200) {
    phobj.y = map.bounds.maxY + 200;
    phobj.vspeed = 0;
  }
}

function initLifeRuntimeStates() {
  lifeRuntimeState.clear();
  if (!runtime.map) return;

  const map = runtime.map;

  for (let i = 0; i < map.lifeEntries.length; i++) {
    const life = map.lifeEntries[i];
    if (life.hide === 1) continue;

    const isMob = life.type === "m";
    const cacheKey = `${life.type}:${life.id}`;
    const animData = lifeAnimations.get(cacheKey);
    const hasMove = !!animData?.stances?.["move"];

    // Find starting foothold and snap to ground (matches C++ default onground=true)
    let startFhId = "0";
    let startY = life.cy;
    let startOnGround = false;
    if (life.fh) {
      const fh = map.footholdById?.get(String(life.fh));
      if (fh && !fhIsWall(fh)) {
        startFhId = fh.id;
        const gy = fhGroundAt(fh, life.x);
        if (gy !== null) {
          startY = gy;
          startOnGround = true;
        }
      }
    }
    // Fallback: find nearest foothold at spawn position
    if (!startOnGround) {
      const found = findFootholdAtXNearY(map, life.x, life.cy, 60);
      if (found) {
        startFhId = found.line.id;
        startY = found.y;
        startOnGround = true;
      }
    }

    // Mob speed from WZ: C++ does (speed+100)*0.001 as force-per-tick at 8ms timestep.
    let mobSpeed = 0;
    if (isMob && animData?.speed !== undefined) {
      mobSpeed = (animData.speed + 100) * 0.001 * MOB_TPS; // px/sec
    }

    const hasPatrolRange = life.rx0 !== life.rx1 && (life.rx0 !== 0 || life.rx1 !== 0);
    const canMove = isMob && hasMove && mobSpeed > 0;

    lifeRuntimeState.set(i, {
      stance: "stand",
      frameIndex: 0,
      frameTimerMs: 0,
      // Physics object (mirrors C++ PhysicsObject with default onground=true)
      phobj: {
        x: life.x,
        y: startY,
        hspeed: 0,
        vspeed: 0,
        hforce: 0,
        vforce: 0,
        fhId: startFhId,
        fhSlope: startOnGround ? fhSlope(map.footholdById?.get(startFhId)) : 0,
        onGround: startOnGround,
        turnAtEdges: true,
      },
      facing: life.f === 1 ? 1 : -1,
      canMove,
      mobSpeed, // C++ force magnitude per tick
      renderLayer: startOnGround ? (map.footholdById?.get(startFhId)?.layer ?? 7) : 7,
      patrolMin: hasPatrolRange ? life.rx0 : -Infinity,
      patrolMax: hasPatrolRange ? life.rx1 : Infinity,
      behaviorState: "stand",

      // Combat state (client-side demo)
      hp: isMob ? MOB_DEFAULT_HP : -1,
      maxHp: isMob ? MOB_DEFAULT_HP : -1,
      hpShowUntil: 0,
      hitCounter: 0,       // counter — controls stance transitions
      hitStaggerUntil: 0,  // timestamp: mob frozen in hit1 until this time
      aggroUntil: 0,       // timestamp: mob chases player until this time
      kbStartTime: 0,      // timestamp: when knockback started
      kbDir: 0,            // knockback direction: -1 or 1
      dying: false,
      dead: false,
      respawnAt: 0,
      nameVisible: !isMob,  // NPCs: always visible. Mobs: shown after player attacks.
    });
  }
}

function updateLifeAnimations(dtMs) {
  if (!runtime.map) return;
  const map = runtime.map;
  const isSwimMap = !!map.swim;
  const dtSec = dtMs / 1000;

  // Accumulate time and step in fixed increments matching C++ timestep
  for (const [idx, state] of lifeRuntimeState) {
    const life = map.lifeEntries[idx];
    const cacheKey = `${life.type}:${life.id}`;
    const anim = lifeAnimations.get(cacheKey);
    if (!anim) continue;

    // --- Mob AI + physics ---
    // In online mode, only the mob authority runs AI/physics.
    // Non-authority clients receive positions via mob_state messages.
    const isOnlineNonAuthority = _wsConnected && !_isMobAuthority && life.type === "m";

    // ── C++ Mob::update — faithful port ──
    // Skip update for dead/dying mobs (C++ dying branch just normalizes phobj)
    if (isOnlineNonAuthority) {
      // Non-authority: skip AI/physics, only run frame animation below
    } else if (state.dying || state.dead) {
      // C++ dying: phobj.normalize(); physics.get_fht().update_fh(phobj);
      if (state.phobj) { state.phobj.hspeed = 0; state.phobj.vspeed = 0; }
    } else if (state.canMove && state.phobj) {
      const ph = state.phobj;
      const now = performance.now();

      // ── C++ Mob HIT stance: hforce = ±0.2 (ground) / ±0.1 (air), counter-based ──
      if (state.hitStaggerUntil > 0 && now < state.hitStaggerUntil) {
        const kbForce = ph.onGround ? MOB_KB_FORCE_GROUND : MOB_KB_FORCE_AIR;
        ph.hforce = state.kbDir * kbForce * MOB_TPS; // C++ per-tick force → px/sec for physics

        // Run normal physics — friction/gravity handle deceleration naturally
        mobPhysicsUpdate(map, ph, false, 1 / PHYS_TPS);

        // Keep hit1 stance
        if (state.stance !== "hit1" && anim?.stances?.["hit1"]) {
          state.stance = "hit1";
          state.frameIndex = 0;
          state.frameTimerMs = 0;
        }
      } else {
        // If stagger just ended, transition to aggro chase
        if (state.hitStaggerUntil > 0 && now >= state.hitStaggerUntil) {
          state.hitStaggerUntil = 0;
          state.aggroUntil = now + MOB_AGGRO_DURATION_MS;
          state.facing = runtime.player.x < ph.x ? -1 : 1;
          state.behaviorState = "move";
          state.stance = anim?.stances?.["move"] ? "move" : "stand";
          state.frameIndex = 0;
          state.frameTimerMs = 0;
        }

        // ── TURNATEDGES check: edge collision → flip ──
        if (!ph.turnAtEdges) {
          state.facing = -state.facing;
          ph.turnAtEdges = true;
        }

        // ── Aggro chase: mob walks toward player, overshoots, turns back ──
        if (state.aggroUntil > 0 && now < state.aggroUntil) {
          // Only flip direction once the mob has overshot the player by 60px
          const diff = runtime.player.x - ph.x; // positive = player is right
          const pastPlayer = (state.facing === 1 && diff < -60) ||
                             (state.facing === -1 && diff > 60);
          if (pastPlayer) {
            state.facing = -state.facing;
          }
          state.behaviorState = "move";
          ph.hforce = state.facing === 1 ? state.mobSpeed : -state.mobSpeed;
        } else {
          // Aggro expired → resume normal patrol
          if (state.aggroUntil > 0) {
            state.aggroUntil = 0;
            state.behaviorState = "stand";
            state.hitCounter = 0;
          }

          // ── Normal patrol AI (dt-based counter) ──
          state.hitCounter += dtMs; // accumulate ms

          const curStanceAnim = anim?.stances?.[state.stance] ?? anim?.stances?.["stand"];
          const aniEnd = curStanceAnim && state.frameIndex >= curStanceAnim.frames.length - 1;
          if (aniEnd && state.hitCounter > 1600) { // 200 ticks × 8ms = 1600ms
            mobNextMove(state, anim);
            state.hitCounter = 0;
          }

          if (state.behaviorState === "move") {
            ph.hforce = state.facing === 1 ? state.mobSpeed : -state.mobSpeed;
          }
        }

        // ── Single dt-based physics update ──
        mobPhysicsUpdate(map, ph, isSwimMap, dtSec);

        // ── Sync visual stance with behavior ──
        const moving = state.behaviorState === "move" && Math.abs(ph.hspeed) > MOB_TPS * 0.05;
        const desiredStance = moving && anim?.stances?.["move"] ? "move" : "stand";
        if (state.stance !== desiredStance) {
          state.stance = desiredStance;
          state.frameIndex = 0;
          state.frameTimerMs = 0;
        }
      }
    } else if ((life.type === "m" || life.type === "n") && state.phobj) {
      // Non-moving mobs/NPCs: still apply gravity to snap to ground
      const ph = state.phobj;
      if (!ph.onGround) {
        mobPhysicsUpdate(map, ph, isSwimMap, dtSec);
      }
    }

    // --- Update render layer from current foothold ---
    if (state.phobj && state.phobj.fhId) {
      const curFh = map.footholdById?.get(String(state.phobj.fhId));
      if (curFh && curFh.layer != null) state.renderLayer = curFh.layer;
    }

    // --- Frame animation ---
    const stance = anim.stances[state.stance] ?? anim.stances["stand"];
    if (!stance || stance.frames.length === 0) continue;

    state.frameTimerMs += dtMs;
    const frame = stance.frames[state.frameIndex % stance.frames.length];
    if (state.frameTimerMs >= frame.delay) {
      state.frameTimerMs -= frame.delay;
      state.frameIndex = (state.frameIndex + 1) % stance.frames.length;
    }
  }
}

function drawLifeSprites(filterLayer, lifeEntriesForLayer = null) {
  if (!runtime.map) return;

  const cam = runtime.camera;
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;
  const now = performance.now();

  const iterEntries = lifeEntriesForLayer ?? lifeRuntimeState;

  for (const entry of iterEntries) {
    const idx = entry[0];
    const state = entry[1];

    // Layer filter: only draw life on this layer (or all if no filter)
    if (filterLayer != null && state.renderLayer !== filterLayer) continue;

    const life = runtime.map.lifeEntries[idx];
    const cacheKey = `${life.type}:${life.id}`;
    const anim = lifeAnimations.get(cacheKey);
    if (!anim) continue;

    // Skip fully dead mobs (waiting for respawn)
    if (state.dead) continue;

    const stance = anim.stances[state.stance] ?? anim.stances["stand"];
    if (!stance || stance.frames.length === 0) continue;

    const frame = stance.frames[state.frameIndex % stance.frames.length];
    const img = getImageByKey(frame.key);
    if (!img) continue;

    // World position from physics object
    const worldX = state.phobj ? state.phobj.x : life.x;
    const worldY = state.phobj ? state.phobj.y : life.cy;

    // Screen position (mirrors worldToScreen)
    const screenX = Math.round(worldX - cam.x + halfW);
    const screenY = Math.round(worldY - cam.y + halfH);

    // Cull if off screen
    if (
      screenX + img.width < -100 ||
      screenX - img.width > canvasEl.width + 100 ||
      screenY + img.height < -100 ||
      screenY - img.height > canvasEl.height + 100
    ) {
      runtime.perf.culledSprites += 1;
      continue;
    }

    ctx.save();

    // Dying mobs fade out
    if (state.dying) {
      ctx.globalAlpha = Math.max(0, 1 - (state.dyingElapsed ?? 0) / 600);
    }

    // Facing: -1 = left (default sprite direction), 1 = right (flipped)
    const flip = state.canMove ? state.facing === 1 : life.f === 1;

    if (flip) {
      ctx.translate(screenX, screenY);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -frame.originX, -frame.originY);
    } else {
      ctx.drawImage(img, screenX - frame.originX, screenY - frame.originY);
    }
    runtime.perf.drawCalls += 1;
    runtime.perf.lifeDrawn += 1;

    ctx.restore();

    // Mob HP bar (shown for a few seconds after being hit)
    if (life.type === "m" && state.hpShowUntil > now && !state.dying && state.maxHp > 0) {
      const hpFrac = Math.max(0, state.hp / state.maxHp);
      const barX = Math.round(screenX - MOB_HP_BAR_WIDTH / 2);
      const barY = Math.round(screenY - frame.originY - 10);
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(barX - 1, barY - 1, MOB_HP_BAR_WIDTH + 2, MOB_HP_BAR_HEIGHT + 2);
      ctx.fillStyle = "#333";
      ctx.fillRect(barX, barY, MOB_HP_BAR_WIDTH, MOB_HP_BAR_HEIGHT);
      if (hpFrac > 0) {
        ctx.fillStyle = hpFrac > 0.3 ? "#22c55e" : "#ef4444";
        ctx.fillRect(barX, barY, Math.round(MOB_HP_BAR_WIDTH * hpFrac), MOB_HP_BAR_HEIGHT);
      }
    }

    // Draw name label below
    if (anim.name && !state.dying && state.nameVisible) {
      const nameColor = life.type === "n" ? "#fbbf24" : "#fb7185";
      ctx.save();
      ctx.font = "bold 11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const textWidth = ctx.measureText(anim.name).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(screenX - textWidth / 2 - 3, screenY + 2, textWidth + 6, 16);
      ctx.fillStyle = nameColor;
      ctx.fillText(anim.name, screenX, screenY + 4);
      ctx.restore();
    }
  }
}

// ─── Damage Numbers ──────────────────────────────────────────────────────────

/**
 * Spawn a damage number. Matches C++ DamageNumber constructor:
 * - moveobj.vspeed = -0.25
 * - opacity starts at 1.5 (stays at full alpha beyond 1.0, then fades)
 */
function spawnDamageNumber(worldX, worldY, value, critical) {
  // Stack damage numbers: count recent ones near this position and offset down
  const rowH = critical ? DMG_NUMBER_ROW_HEIGHT_CRIT : DMG_NUMBER_ROW_HEIGHT_NORMAL;
  let slot = 0;
  for (const dn of damageNumbers) {
    if (Math.abs(dn.x - worldX) < 60 && dn.opacity > 0.8) slot++;
  }
  damageNumbers.push({
    x: worldX + (Math.random() - 0.5) * 20,
    y: worldY - 60 + slot * rowH,  // first hit highest, subsequent ones lower
    vspeed: DMG_NUMBER_VSPEED,
    value,
    critical: !!critical,
    miss: value <= 0,
    opacity: 1.5,  // C++ opacity.set(1.5f)
  });
}

/**
 * Update damage numbers. C++ DamageNumber::update:
 * - moveobj.move() → y += vspeed each tick
 * - opacity -= TIMESTEP / FADE_TIME each tick
 * - removed when opacity <= 0
 */
function updateDamageNumbers(dt) {
  // C++ vspeed = -0.25 px/tick at 125 TPS = -31.25 px/sec
  const risePxPerSec = DMG_NUMBER_VSPEED * MOB_TPS;
  const fadePerSec = 1.0 / (DMG_NUMBER_FADE_TIME / 1000);
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const dn = damageNumbers[i];
    dn.y += risePxPerSec * dt;
    dn.opacity -= fadePerSec * dt;
    if (dn.opacity <= 0) {
      damageNumbers.splice(i, 1);
    }
  }
}

/**
 * C++ DamageNumber::getadvance — spacing between digit sprites
 */
function dmgGetAdvance(digitIndex, isCritical, isFirst) {
  const base = DMG_DIGIT_ADVANCES[digitIndex] ?? 22;
  if (isCritical) return isFirst ? base + 8 : base + 4;
  return isFirst ? base + 2 : base;
}

/**
 * Draw damage numbers using WZ digit sprites (C++ DamageNumber::draw).
 * Falls back to styled text if sprites aren't loaded yet.
 */
function drawDamageNumbers() {
  const cam = runtime.camera;
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;

  for (const dn of damageNumbers) {
    const screenX = Math.round(dn.x - cam.x + halfW);
    const screenY = Math.round(dn.y - cam.y + halfH);
    const alpha = Math.min(1, Math.max(0, dn.opacity));
    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (dmgDigitsLoaded && !dn.miss) {
      // ── WZ sprite rendering — uniform digit size ──
      const digits = String(dn.value);
      const isCrit = dn.critical;
      const digitSet = isCrit ? dmgDigitImages.critRest : dmgDigitImages.normalRest;

      // Calculate total width for centering using uniform advance
      let totalW = 0;
      for (let i = 0; i < digits.length; i++) {
        const d = parseInt(digits[i]);
        const adv = dmgGetAdvance(d, isCrit, false);
        if (i < digits.length - 1) {
          const next = parseInt(digits[i + 1]);
          totalW += (adv + dmgGetAdvance(next, isCrit, false)) / 2;
        } else {
          totalW += adv;
        }
      }
      const shift = totalW / 2;

      let drawX = screenX - shift;

      // All digits same size, alternating ±2 y-shift
      for (let i = 0; i < digits.length; i++) {
        const d = parseInt(digits[i]);
        const yShift = (i % 2) ? -2 : 2;
        const sprite = digitSet[d];
        if (sprite?.img?.complete) {
          ctx.drawImage(sprite.img, drawX - sprite.ox, screenY - sprite.oy + yShift);
        }
        let advance;
        if (i < digits.length - 1) {
          const next = parseInt(digits[i + 1]);
          advance = (dmgGetAdvance(d, isCrit, false) + dmgGetAdvance(next, isCrit, false)) / 2;
        } else {
          advance = dmgGetAdvance(d, isCrit, false);
        }
        drawX += advance;
      }
    } else if (dmgDigitsLoaded && dn.miss) {
      // Miss sprite (index 10 in first-digit set)
      const missSprite = dmgDigitImages.normalFirst[10];
      if (missSprite?.img?.complete) {
        ctx.drawImage(missSprite.img, screenX - missSprite.ox, screenY - missSprite.oy);
      }
    } else {
      // Fallback: styled text (before WZ sprites load)
      ctx.font = dn.critical ? "bold 20px Arial, sans-serif" : "bold 16px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillText(dn.miss ? "MISS" : String(dn.value), screenX + 1, screenY + 1);
      ctx.fillStyle = dn.miss ? "#aaa" : (dn.critical ? "#fbbf24" : "#fff");
      ctx.fillText(dn.miss ? "MISS" : String(dn.value), screenX, screenY);
    }

    ctx.restore();
  }
}

// ─── Mob Combat (client-side demo) ───────────────────────────────────────────

/**
 * C++ damage formula (from CharStats::close_totalstats + Mob::calculate_damage).
 *
 * Player stat derivation:
 *   primary    = get_multiplier() * STR   (for 1H sword: 4.0 × STR)
 *   secondary  = DEX
 *   multiplier = damagepercent + watk/100
 *   maxdamage  = (primary + secondary) * multiplier
 *   mindamage  = ((primary * 0.9 * mastery) + secondary) * multiplier
 *
 * Mob damage reduction (Mob::calculate_mindamage / calculate_maxdamage):
 *   leveldelta = max(0, mobLevel - playerLevel)
 *   maxdmg_vs_mob = playerMaxDmg * (1 - 0.01 * leveldelta) - mobWdef * 0.5
 *   mindmg_vs_mob = playerMinDmg * (1 - 0.01 * leveldelta) - mobWdef * 0.6
 *
 * Hit chance (Mob::calculate_hitchance):
 *   hitchance = accuracy / ((1.84 + 0.07 * leveldelta) * mobAvoid + 1.0)
 *
 * Critical: random < critical → damage *= 1.5
 */
function calculatePlayerDamageRange() {
  const p = runtime.player;
  // Beginner stats: STR≈4+level, DEX≈4
  const str = 50 + p.level;
  const dex = 4;
  const primary = WEAPON_MULTIPLIER * str;
  const secondary = dex;
  const multiplier = DEFAULT_WATK / 100;
  const maxdamage = (primary + secondary) * multiplier;
  const mindamage = ((primary * 0.9 * DEFAULT_MASTERY) + secondary) * multiplier;
  return { mindamage: Math.max(1, mindamage), maxdamage: Math.max(1, maxdamage) };
}

/**
 * Apply C++ Mob::calculate_damage reduction.
 * @param {number} playerMin - player mindamage
 * @param {number} playerMax - player maxdamage
 * @param {number} mobLevel - mob level from WZ (default 1)
 * @param {number} mobWdef - mob PDDamage from WZ (default 0)
 * @param {number} mobAvoid - mob eva from WZ (default 0)
 * @returns {{ damage: number, critical: boolean, miss: boolean }}
 */
function calculateMobDamage(playerMin, playerMax, mobLevel, mobWdef, mobAvoid) {
  const playerLevel = runtime.player.level;
  let leveldelta = mobLevel - playerLevel;
  if (leveldelta < 0) leveldelta = 0;

  // Hit chance
  const hitchance = DEFAULT_ACCURACY / ((1.84 + 0.07 * leveldelta) * mobAvoid + 1.0);
  if (Math.random() > Math.max(0.01, hitchance)) {
    return { damage: 0, critical: false, miss: true };
  }

  // Damage range after mob defense
  const maxdmg = Math.max(1, playerMax * (1 - 0.01 * leveldelta) - mobWdef * 0.5);
  const mindmg = Math.max(1, playerMin * (1 - 0.01 * leveldelta) - mobWdef * 0.6);

  let damage = mindmg + Math.random() * (maxdmg - mindmg);
  const critical = Math.random() < DEFAULT_CRITICAL;
  if (critical) damage *= 1.5;
  damage = Math.max(1, Math.min(999999, Math.floor(damage)));

  return { damage, critical, miss: false };
}

/**
 * Find closest alive mobs within attack range of player.
 * C++ approach: rectangle range from player position, sorted by distance.
 * For regular attack, mobcount = 1.
 */
function findMobsInRange(mobcount) {
  if (!runtime.map) return [];

  const px = runtime.player.x;
  const py = runtime.player.y;
  const facingLeft = runtime.player.facing === -1;

  // Attack rectangle in world space (C++ range logic from Combat::apply_move)
  const rangeLeft  = facingLeft ? px - ATTACK_RANGE_X : px - 10;
  const rangeRight = facingLeft ? px + 10 : px + ATTACK_RANGE_X;
  const rangeTop   = py - ATTACK_RANGE_Y;
  const rangeBottom = py + ATTACK_RANGE_Y;

  const candidates = [];

  for (const [idx, state] of lifeRuntimeState) {
    const life = runtime.map.lifeEntries[idx];
    if (life.type !== "m") continue;
    if (state.dead || state.dying) continue;

    const mx = state.phobj ? state.phobj.x : life.x;
    const my = state.phobj ? state.phobj.y : life.cy;

    if (mx >= rangeLeft && mx <= rangeRight && my >= rangeTop && my <= rangeBottom) {
      const dist = Math.abs(mx - px) + Math.abs(my - py);
      const cacheKey = `m:${life.id}`;
      const anim = lifeAnimations.get(cacheKey);
      candidates.push({ idx, life, anim, state, dist });
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);
  return candidates.slice(0, mobcount);
}

/**
 * Perform a regular attack (triggered by attack key).
 * 1. Check can_attack conditions (C++ Player::can_attack)
 * 2. Pick a random attack stance and start it on the character
 * 3. Find closest mob in range
 * 4. Calculate damage using C++ formula
 * 5. Apply damage, knockback, effects
 */
function performAttack() {
  const player = runtime.player;
  const now = performance.now();

  // C++ can_attack: not already attacking, not climbing
  if (player.attacking) return;
  if (player.climbing) return;
  if (now < player.attackCooldownUntil) return;

  // C++ CharLook::getattackstance: if prone → PRONESTAB, else random weapon stance
  const isProne = player.action === "prone" || player.action === "sit";
  let attackStance;
  if (isProne && getCharacterActionFrames("proneStab").length > 0) {
    attackStance = "proneStab";
  } else {
    const stanceIdx = Math.floor(Math.random() * SWORD_1H_ATTACK_STANCES.length);
    attackStance = SWORD_1H_ATTACK_STANCES[stanceIdx];
  }

  // Start attack animation
  player.attacking = true;
  player.attackDegenerate = isProne; // C++ degenerate = true when prone
  player.attackStance = attackStance;
  player.attackFrameIndex = 0;
  player.attackFrameTimer = 0;
  player.attackCooldownUntil = now + ATTACK_COOLDOWN_MS;

  // C++ CharLook::attack → weapon.get_usesound(degenerate).play()
  // For 1H sword: Sound/Weapon.img/swordS/Attack
  playSfx("Weapon", "swordS/Attack");
  wsSend({ type: "attack", stance: attackStance });

  // Find closest mob in range (mobcount=1 for regular attack)
  const targets = findMobsInRange(1);

  if (targets.length > 0) {
    const target = targets[0];
    // In online non-authority mode: calculate damage locally for visuals,
    // but send mob_damage to server so authority applies actual state change
    if (_wsConnected && !_isMobAuthority) {
      applyAttackToMobVisualOnly(target);
    } else {
      applyAttackToMob(target);
    }
  }

  // Also check for reactors in range (C++ Combat::apply_move reactor check)
  const reactorTargets = findReactorsInRange();
  if (reactorTargets.length > 0) {
    const rt = reactorTargets[0];
    // Send hit_reactor to server — server validates cooldown, range, and state
    wsSend({ type: "hit_reactor", reactor_idx: rt.idx });
  }
}

/**
 * Non-authority attack: show damage visuals locally + send mob_damage to server.
 * The authority will apply actual HP/knockback/death from the mob_damage message.
 */
function applyAttackToMobVisualOnly(target) {
  const state = target.state;
  const anim = target.anim;
  const life = target.life;
  const mobLevel = anim?.level ?? 1;
  const mobWdef = anim?.wdef ?? 0;
  const mobAvoid = anim?.avoid ?? 0;

  let { mindamage, maxdamage } = calculatePlayerDamageRange();
  if (runtime.player.attackDegenerate) { mindamage /= 10; maxdamage /= 10; }

  const result = calculateMobDamage(mindamage, maxdamage, mobLevel, mobWdef, mobAvoid);
  const worldX = state.phobj ? state.phobj.x : life.x;
  const worldY = state.phobj ? state.phobj.y : life.cy;

  state.nameVisible = true;

  // Show damage number locally
  if (result.miss) {
    spawnDamageNumber(worldX, worldY, 0, false);
  } else {
    spawnDamageNumber(worldX, worldY, result.damage, result.critical);
    state.hpShowUntil = performance.now() + MOB_HP_SHOW_MS;
  }
  void playMobSfx(life.id, "Damage");

  // Send to server — authority will apply the real state change
  if (!result.miss) {
    const attackerIsLeft = runtime.player.x < worldX;
    wsSend({
      type: "mob_damage",
      mob_idx: target.idx,
      damage: result.damage,
      direction: attackerIsLeft ? 1 : -1,
    });
  }
}

/**
 * Apply damage to a mob target. Implements C++ Mob::calculate_damage + apply_damage.
 * Used by authority client (or offline mode).
 */
function applyAttackToMob(target) {
  const now = performance.now();
  const state = target.state;
  const anim = target.anim;
  const life = target.life;

  // Get mob stats from WZ (loaded in lifeAnimations)
  const mobLevel = anim?.level ?? 1;
  const mobWdef = anim?.wdef ?? 0;
  const mobAvoid = anim?.avoid ?? 0;
  const mobKnockback = anim?.knockback ?? 1;

  // Calculate damage using C++ formula
  let { mindamage, maxdamage } = calculatePlayerDamageRange();

  // C++ degenerate (prone) attack: damage /= 10
  if (runtime.player.attackDegenerate) {
    mindamage /= 10;
    maxdamage /= 10;
  }

  const result = calculateMobDamage(mindamage, maxdamage, mobLevel, mobWdef, mobAvoid);

  // Spawn damage number (even for miss)
  const worldX = state.phobj ? state.phobj.x : life.x;
  const worldY = state.phobj ? state.phobj.y : life.cy;

  state.nameVisible = true;

  if (result.miss) {
    spawnDamageNumber(worldX, worldY, 0, false);
  } else {
    state.hp -= result.damage;
    state.hpShowUntil = now + MOB_HP_SHOW_MS;
    spawnDamageNumber(worldX, worldY, result.damage, result.critical);
  }

  // Play hit sound
  void playMobSfx(life.id, "Damage");

  // C++ Mob::apply_damage: set HIT stance, counter = 170 (ends at 200 → 30 ticks ≈ 240ms)
  if (!result.miss && result.damage >= mobKnockback && !state.dying) {
    const attackerIsLeft = runtime.player.x < worldX;
    state.facing = attackerIsLeft ? -1 : 1;

    // Enter stagger — C++ sets flip, counter=170, stance=HIT
    const now = performance.now();
    const kbDurationMs = (MOB_KB_COUNTER_END - MOB_KB_COUNTER_START) * (1000 / PHYS_TPS);
    state.hitStaggerUntil = now + kbDurationMs;
    state.hitCounter = MOB_KB_COUNTER_START;
    state.kbDir = attackerIsLeft ? 1 : -1; // push away from attacker
    if (anim?.stances?.["hit1"]) {
      state.stance = "hit1";
      state.frameIndex = 0;
      state.frameTimerMs = 0;
    }
  }

  // Check for death
  if (state.hp <= 0) {
    state.hp = 0;
    state.dying = true;
    state.dyingElapsed = 0;
    if (anim?.stances?.["die1"]) {
      state.stance = "die1";
      state.frameIndex = 0;
      state.frameTimerMs = 0;
    }
    void playMobSfx(life.id, "Die");
    // Award EXP
    runtime.player.exp += 3 + Math.floor(Math.random() * 5);
    if (runtime.player.exp >= runtime.player.maxExp) {
      runtime.player.level += 1;
      runtime.player.exp -= runtime.player.maxExp;
      runtime.player.maxExp = Math.floor(runtime.player.maxExp * 1.5) + 5;
      runtime.player.maxHp += 8 + Math.floor(Math.random() * 5);
      runtime.player.hp = runtime.player.maxHp;
      runtime.player.maxMp += 4 + Math.floor(Math.random() * 3);
      runtime.player.mp = runtime.player.maxMp;
      rlog(`LEVEL UP! Now level ${runtime.player.level}`);
      saveCharacter();
      wsSend({ type: "level_up", level: runtime.player.level });
    }
  }
}

/**
 * Update player attack animation state. Called each frame.
 * When the attack animation completes, reset attacking flag.
 */
function updatePlayerAttack(dt) {
  const player = runtime.player;
  if (!player.attacking) return;

  // Cancel attack if player starts climbing
  if (player.climbing) {
    player.attacking = false;
    player.attackFrameIndex = 0;
    player.attackFrameTimer = 0;
    return;
  }

  const frames = getCharacterActionFrames(player.attackStance);
  if (frames.length === 0) {
    // Stance not found in body data — end immediately
    player.attacking = false;
    return;
  }

  const frameNode = frames[player.attackFrameIndex % frames.length];
  const leafRec = imgdirLeafRecord(frameNode);
  const delayMs = safeNumber(leafRec.delay, 120);

  player.attackFrameTimer += dt * 1000;
  if (player.attackFrameTimer >= delayMs) {
    player.attackFrameTimer -= delayMs;
    player.attackFrameIndex += 1;

    // Attack animation done when all frames played once (no looping)
    if (player.attackFrameIndex >= frames.length) {
      player.attacking = false;
      player.attackFrameIndex = 0;
      player.attackFrameTimer = 0;
    }
  }
}

function updateMobCombatStates(dtMs) {
  // Non-authority in online mode: dying/respawn is controlled by authority via mob_state
  const isNonAuthority = _wsConnected && !_isMobAuthority;
  const now = performance.now();

  for (const [idx, state] of lifeRuntimeState) {
    const life = runtime.map?.lifeEntries[idx];
    if (!life || life.type !== "m") continue;

    // Non-authority: skip dying/respawn logic — authority manages these via mob_state
    if (isNonAuthority) continue;

    // HIT knockback physics is handled in updateLifeAnimations (uses mobPhysicsUpdate
    // for proper wall/edge limits). This function only handles dying/respawn/aggro.

    // Dying fade-out
    if (state.dying && !state.dead) {
      state.dyingElapsed = (state.dyingElapsed ?? 0) + dtMs;
      const anim = lifeAnimations.get(`m:${life.id}`);
      const dieStance = anim?.stances["die1"];
      const dieAnimDone = !dieStance || state.frameIndex >= dieStance.frames.length - 1;
      if (state.dyingElapsed > 800 && dieAnimDone) {
        state.dead = true;
        state.respawnAt = now + MOB_RESPAWN_DELAY_MS;
      }
    }

    // Respawn
    if (state.dead && state.respawnAt > 0 && now >= state.respawnAt) {
      state.dead = false;
      state.dying = false;
      state.dyingElapsed = 0;
      state.hp = state.maxHp;
      state.hitCounter = 0;
      state.hitStaggerUntil = 0;
      state.aggroUntil = 0;
      state.kbStartTime = 0;
      state.kbDir = 0;
      state.stance = "stand";
      state.frameIndex = 0;
      state.frameTimerMs = 0;
      state.behaviorState = "stand";
      state.phobj.x = life.x;
      state.phobj.y = life.cy;
      state.phobj.hspeed = 0;
      state.respawnAt = 0;
    }
  }
}

// ─── NPC Interaction & Dialogue System ─────────────────────────────────────────

/**
 * Find an NPC at the given screen coordinates (for click detection).
 * Returns { idx, life, anim, state } or null.
 */
function findNpcAtScreen(screenClickX, screenClickY) {
  if (!runtime.map) return null;

  const cam = runtime.camera;
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;

  // Search in reverse order so topmost (last drawn) NPCs are found first
  const entries = [...lifeRuntimeState.entries()].reverse();
  for (const [idx, state] of entries) {
    const life = runtime.map.lifeEntries[idx];
    if (!life || life.type !== "n") continue;

    const cacheKey = `n:${life.id}`;
    const anim = lifeAnimations.get(cacheKey);
    if (!anim) continue;

    const stance = anim.stances[state.stance] ?? anim.stances["stand"];
    if (!stance || stance.frames.length === 0) continue;

    const frame = stance.frames[state.frameIndex % stance.frames.length];
    const img = getImageByKey(frame.key);
    if (!img) continue;

    const worldX = state.phobj ? state.phobj.x : life.x;
    const worldY = state.phobj ? state.phobj.y : life.cy;

    const sx = Math.round(worldX - cam.x + halfW);
    const sy = Math.round(worldY - cam.y + halfH);

    // Match the flip logic from drawLifeSprites exactly
    const flip = state.canMove ? state.facing === 1 : life.f === 1;

    let drawX, drawY;
    if (flip) {
      // When flipped, sprite is drawn at (sx - originX mirrored)
      // ctx.translate(sx, sy); ctx.scale(-1, 1); ctx.drawImage(img, -originX, -originY)
      // Effective screen rect: (sx - img.width + originX, sy - originY) to (sx + originX, sy - originY + img.height)
      drawX = sx - img.width + frame.originX;
      drawY = sy - frame.originY;
    } else {
      drawX = sx - frame.originX;
      drawY = sy - frame.originY;
    }

    // Use a generous hit area (sprite bounds + padding)
    const pad = 10;
    if (
      screenClickX >= drawX - pad &&
      screenClickX <= drawX + img.width + pad &&
      screenClickY >= drawY - pad &&
      screenClickY <= drawY + img.height + pad
    ) {
      return { idx, life, anim, state };
    }
  }
  return null;
}

/**
 * Open NPC dialogue if player is within interaction range.
 */
function openNpcDialogue(npcResult) {
  const { idx, life, anim } = npcResult;
  const state = lifeRuntimeState.get(idx);
  if (!state) return;

  const npcX = state.phobj ? state.phobj.x : life.x;
  const npcY = state.phobj ? state.phobj.y : life.cy;

  // No range check — player can click any visible NPC to talk

  // Build dialogue lines based on NPC type
  const scriptDef = anim.scriptId ? NPC_SCRIPTS[anim.scriptId] : null;

  const npcWzId = String(life.id); // WZ NPC ID (e.g. "1012000") — sent to server for validation

  let lines;
  if (scriptDef) {
    // Known script — use specific handler
    lines = buildScriptDialogue(scriptDef, npcWzId);
  } else if (anim.scriptId) {
    // Has a script but no explicit handler — show flavor text + travel options
    lines = buildFallbackScriptDialogue(anim.name, npcWzId, anim.dialogue);
  } else if (anim.dialogue && anim.dialogue.length > 0) {
    // No script — just show flavor text
    lines = anim.dialogue;
  } else {
    lines = ["..."];
  }

  runtime.npcDialogue = {
    active: true,
    npcName: anim.name || "NPC",
    npcFunc: anim.func || "",
    lines,
    lineIndex: 0,
    npcWorldX: npcX,
    npcWorldY: npcY,
    npcIdx: idx,
    hoveredOption: -1,
    scriptId: anim.scriptId || "",
  };
  rlog(`NPC dialogue opened: ${anim.name} (${life.id}), script=${anim.scriptId || "none"}, ${lines.length} lines`);
}

function closeNpcDialogue() {
  if (runtime.npcDialogue.active) {
    rlog(`NPC dialogue closed: ${runtime.npcDialogue.npcName}`);
  }
  runtime.npcDialogue.active = false;
  runtime.npcDialogue.lineIndex = 0;
}

function advanceNpcDialogue() {
  if (!runtime.npcDialogue.active) return;
  runtime.npcDialogue.lineIndex++;
  if (runtime.npcDialogue.lineIndex >= runtime.npcDialogue.lines.length) {
    closeNpcDialogue();
  }
}

/**
 * Draw NPC dialogue box overlay (MapleStory-style).
 */
// Store option hit boxes for click detection (rebuilt each frame)
let _npcDialogueOptionHitBoxes = [];
let _npcDialogueBoxBounds = null; // { x, y, w, h } of the dialogue box

function drawNpcDialogue() {
  if (!runtime.npcDialogue.active) { _npcDialogueBoxBounds = null; return; }
  _npcDialogueOptionHitBoxes = [];

  const d = runtime.npcDialogue;
  const currentLine = d.lines[d.lineIndex] ?? "";
  const isOptionLine = typeof currentLine === "object" && currentLine.options;
  const text = isOptionLine ? currentLine.text : String(currentLine);
  const options = isOptionLine ? currentLine.options : [];

  // Get NPC sprite for the portrait
  let npcImg = null;
  const npcLife = runtime.map?.lifeEntries[d.npcIdx];
  if (npcLife) {
    const cacheKey = `n:${npcLife.id}`;
    const anim = lifeAnimations.get(cacheKey);
    if (anim) {
      const npcState = lifeRuntimeState.get(d.npcIdx);
      const stance = anim.stances[npcState?.stance ?? "stand"] ?? anim.stances["stand"];
      if (stance && stance.frames.length > 0) {
        const frameIdx = (npcState?.frameIndex ?? 0) % stance.frames.length;
        const frame = stance.frames[frameIdx];
        npcImg = getImageByKey(frame.key);
      }
    }
  }

  // Layout constants
  const portraitW = npcImg ? Math.min(120, npcImg.width) : 0;
  const portraitArea = portraitW > 0 ? portraitW + 16 : 0;
  const boxW = 500;
  const lineHeight = 18;
  const optionLineHeight = 26;
  const padding = 16;
  const headerH = 24;
  const textAreaW = boxW - padding * 2 - portraitArea;

  // Measure text
  ctx.save();
  ctx.font = '13px "Dotum", Arial, sans-serif';
  const wrappedLines = wrapText(ctx, text, textAreaW);
  const textH = wrappedLines.length * lineHeight;

  // Measure options
  const optionsH = options.length > 0 ? options.length * optionLineHeight + 10 : 0;

  // Box height: fit portrait, text, and options
  const portraitH = npcImg ? Math.min(140, npcImg.height) : 0;
  const contentH = Math.max(textH + optionsH + padding, portraitH + 8);
  const footerH = 36;
  const footerGap = 8;
  const boxH = headerH + contentH + padding + footerGap + footerH;

  const boxX = Math.round((canvasEl.width - boxW) / 2);
  const boxY = Math.round((canvasEl.height - boxH) / 2);
  _npcDialogueBoxBounds = { x: boxX, y: boxY, w: boxW, h: boxH };

  // ── HUD-themed background ──
  const bgGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
  bgGrad.addColorStop(0, "#d4dce8");
  bgGrad.addColorStop(1, "#c0cbdb");
  roundRect(ctx, boxX, boxY, boxW, boxH, 4);
  ctx.fillStyle = bgGrad;
  ctx.fill();
  ctx.strokeStyle = "#8a9bb5";
  ctx.lineWidth = 2;
  roundRect(ctx, boxX, boxY, boxW, boxH, 4);
  ctx.stroke();

  // Drop shadow behind the whole box
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, boxX, boxY, boxW, boxH, 4);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // ── Title bar ──
  const titleGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + headerH);
  titleGrad.addColorStop(0, "#6b82a8");
  titleGrad.addColorStop(1, "#4a6490");
  ctx.fillStyle = titleGrad;
  roundRect(ctx, boxX, boxY, boxW, headerH, 4, true);
  ctx.fill();
  ctx.strokeStyle = "#3d5578";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(boxX + 1, boxY + headerH);
  ctx.lineTo(boxX + boxW - 1, boxY + headerH);
  ctx.stroke();

  // NPC name
  ctx.fillStyle = "#fff";
  ctx.font = 'bold 11px "Dotum", Arial, sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowOffsetY = 1;
  let headerText = d.npcName;
  if (d.npcFunc) headerText += `  (${d.npcFunc})`;
  ctx.fillText(headerText, boxX + 8, boxY + 7);
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetY = 0;

  // ── Content inset ──
  const insetX = boxX + 6;
  const insetY = boxY + headerH + 6;
  const insetW = boxW - 12;
  const insetH = contentH + padding;
  const insetGrad = ctx.createLinearGradient(insetX, insetY, insetX, insetY + insetH);
  insetGrad.addColorStop(0, "#e8edf4");
  insetGrad.addColorStop(1, "#d8dfe9");
  ctx.fillStyle = insetGrad;
  roundRect(ctx, insetX, insetY, insetW, insetH, 2);
  ctx.fill();
  ctx.strokeStyle = "#9aa8bc";
  ctx.lineWidth = 1;
  roundRect(ctx, insetX, insetY, insetW, insetH, 2);
  ctx.stroke();

  // Draw NPC portrait on the left
  if (npcImg && portraitW > 0) {
    const scale = Math.min(1, 120 / npcImg.width, 140 / npcImg.height);
    const drawW = Math.round(npcImg.width * scale);
    const drawH = Math.round(npcImg.height * scale);
    const portraitX = insetX + 8 + Math.round((portraitW - drawW) / 2);
    const portraitY = insetY + Math.round((insetH - drawH) / 2);
    ctx.drawImage(npcImg, portraitX, portraitY, drawW, drawH);
  }

  // Dialogue text
  ctx.fillStyle = "#2a3650";
  ctx.font = '13px "Dotum", Arial, sans-serif';
  const textX = insetX + 10 + portraitArea;
  for (let i = 0; i < wrappedLines.length; i++) {
    ctx.fillText(wrappedLines[i], textX, insetY + 10 + i * lineHeight);
  }

  // Options (clickable list)
  if (options.length > 0) {
    const optStartY = insetY + 10 + textH + 10;
    ctx.font = '13px "Dotum", Arial, sans-serif';

    for (let i = 0; i < options.length; i++) {
      const optY = optStartY + i * optionLineHeight;
      const isHovered = d.hoveredOption === i;

      if (isHovered) {
        ctx.fillStyle = "rgba(74, 100, 144, 0.15)";
        roundRect(ctx, textX - 4, optY - 2, textAreaW + 8, optionLineHeight, 2);
        ctx.fill();
      }

      ctx.fillStyle = isHovered ? "#4a6490" : "#2a3650";
      ctx.font = isHovered ? 'bold 13px "Dotum", Arial, sans-serif' : '13px "Dotum", Arial, sans-serif';
      ctx.fillText(`▸ ${options[i].label}`, textX + 4, optY + 4);

      _npcDialogueOptionHitBoxes.push({
        x: textX - 4,
        y: optY - 2,
        w: textAreaW + 8,
        h: optionLineHeight,
        index: i,
      });
    }
  }

  // ── Footer: Cancel + Next buttons ──
  const footerY = boxY + boxH - footerH;
  const btnH = 20;
  const btnY = footerY + Math.round((footerH - btnH) / 2);
  const btnGap = 8;

  // Helper to draw a footer button
  function drawFooterBtn(label, bx, bw, hoverIndex) {
    const isHov = d.hoveredOption === hoverIndex;
    const g = ctx.createLinearGradient(bx, btnY, bx, btnY + btnH);
    g.addColorStop(0, isHov ? "#f4f6fa" : "#eef1f6");
    g.addColorStop(1, isHov ? "#e0e6f0" : "#d8dee8");
    ctx.fillStyle = g;
    roundRect(ctx, bx, btnY, bw, btnH, 2);
    ctx.fill();
    ctx.strokeStyle = isHov ? "#6080b0" : "#8a9bb5";
    ctx.lineWidth = 1;
    roundRect(ctx, bx, btnY, bw, btnH, 2);
    ctx.stroke();
    ctx.fillStyle = isHov ? "#2a3650" : "#4a6490";
    ctx.font = 'bold 10px "Dotum", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + bw / 2, btnY + btnH / 2);
    _npcDialogueOptionHitBoxes.push({ x: bx, y: btnY, w: bw, h: btnH, index: hoverIndex });
  }

  // Cancel button (right-most)
  const cancelBtnW = 56;
  const cancelBtnX = boxX + boxW - padding - cancelBtnW;
  drawFooterBtn("Cancel", cancelBtnX, cancelBtnW, -99);

  // Next button — show on text pages always, and on option pages if more pages follow
  const hasMorePages = d.lineIndex < d.lines.length - 1;
  if (!isOptionLine || hasMorePages) {
    const pageInfo = d.lines.length > 1 ? `  ${d.lineIndex + 1}/${d.lines.length}` : "";
    const nextLabel = `Next${pageInfo}`;
    ctx.font = 'bold 10px "Dotum", Arial, sans-serif';
    const nextBtnW = Math.round(ctx.measureText(nextLabel).width) + 20;
    const nextBtnX = cancelBtnX - btnGap - nextBtnW;
    drawFooterBtn(nextLabel, nextBtnX, nextBtnW, -98);
  }

  ctx.restore();
}

/**
 * Word-wrap text to fit within maxWidth.
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? currentLine + " " + word : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  if (lines.length === 0) lines.push("");
  return lines;
}

/**
 * Draw a rounded rectangle path (does NOT fill/stroke — caller does that).
 */
function roundRect(ctx, x, y, w, h, r, topOnly = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  if (topOnly) {
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
  } else {
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  }
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Reactor Sprite System ────────────────────────────────────────────────────
// reactorAnimations: reactorId → { states: { [stateNum]: { idle: [frames], hit: [frames] } }, name }
const reactorAnimations = new Map();
const reactorAnimationPromises = new Map();

/**
 * Load reactor sprite data from Reactor.wz JSON.
 * Loads ALL states with their idle canvas frames AND hit animation frames.
 */
async function loadReactorAnimation(reactorId) {
  if (reactorAnimations.has(reactorId)) return reactorAnimations.get(reactorId);
  if (reactorAnimationPromises.has(reactorId)) return reactorAnimationPromises.get(reactorId);

  const promise = (async () => {
    try {
      const paddedId = reactorId.padStart(7, "0");
      const path = `/resources/Reactor.wz/${paddedId}.img.json`;
      const json = await fetchJson(path);
      if (!json) { reactorAnimations.set(reactorId, null); return null; }

      const infoNode = childByName(json, "info");
      const infoRec = infoNode ? imgdirLeafRecord(infoNode) : {};
      const name = String(infoRec.info ?? "");

      const states = {};
      for (const stateNode of json.$$ ?? []) {
        const stateNum = stateNode.$imgdir;
        if (stateNum === undefined || isNaN(Number(stateNum))) continue;

        const idle = [];
        const hit = [];

        // Idle frames: direct canvas children of the state node
        for (const child of stateNode.$$ ?? []) {
          if (child.$canvas !== undefined) {
            const meta = canvasMetaFromNode(child);
            if (meta) {
              const key = `reactor:${reactorId}:${stateNum}:${child.$canvas}`;
              const childRec = {};
              for (const sub of child.$$ ?? []) {
                if (sub.$vector === "origin") { childRec.originX = safeNumber(sub.x, 0); childRec.originY = safeNumber(sub.y, 0); }
                if (sub.$int === "delay") childRec.delay = safeNumber(sub.value, 100);
              }
              idle.push({ key, width: meta.width, height: meta.height,
                originX: childRec.originX ?? 0, originY: childRec.originY ?? 0,
                delay: childRec.delay ?? 0, basedata: meta.basedata });
            }
          }
          // Hit animation: imgdir "hit" containing canvas frames
          if (child.$imgdir === "hit") {
            for (const hitFrame of child.$$ ?? []) {
              if (hitFrame.$canvas !== undefined) {
                const meta = canvasMetaFromNode(hitFrame);
                if (meta) {
                  const key = `reactor:${reactorId}:${stateNum}:hit:${hitFrame.$canvas}`;
                  const hRec = {};
                  for (const sub of hitFrame.$$ ?? []) {
                    if (sub.$vector === "origin") { hRec.originX = safeNumber(sub.x, 0); hRec.originY = safeNumber(sub.y, 0); }
                    if (sub.$int === "delay") hRec.delay = safeNumber(sub.value, 120);
                  }
                  hit.push({ key, width: meta.width, height: meta.height,
                    originX: hRec.originX ?? 0, originY: hRec.originY ?? 0,
                    delay: Math.max(hRec.delay ?? 120, 200), basedata: meta.basedata });
                }
              }
            }
          }
        }
        states[stateNum] = { idle, hit };
      }

      const result = { states, name };
      reactorAnimations.set(reactorId, result);
      return result;
    } catch (err) {
      rlog(`reactor load FAIL id=${reactorId} err=${err?.message ?? err}`);
      reactorAnimations.set(reactorId, null);
      return null;
    }
  })();

  reactorAnimationPromises.set(reactorId, promise);
  return promise;
}

// Per-reactor runtime animation state
const reactorRuntimeState = new Map();

/**
 * Server reactors: populate from server-provided reactor list.
 * Also adds reactor entries to runtime.map.reactorEntries for rendering.
 */
function syncServerReactors(serverReactors) {
  if (!runtime.map) return;
  // Build reactor entries from server data (server is authoritative)
  runtime.map.reactorEntries = serverReactors.map(r => ({
    id: r.reactor_id,
    x: r.x,
    y: r.y,
    f: 0,
  }));

  reactorRuntimeState.clear();
  for (const r of serverReactors) {
    reactorRuntimeState.set(r.idx, {
      frameIndex: 0,
      elapsed: 0,
      state: r.state,
      hp: r.hp,
      active: r.active,
      hitAnimPlaying: false,
      hitAnimState: 0,
      hitAnimFrameIndex: 0,
      hitAnimElapsed: 0,
      destroyed: !r.active,
      opacity: r.active ? 1 : 0,
    });
    // Preload reactor animation data + decode all frame images
    loadReactorAnimation(r.reactor_id).then(anim => {
      if (!anim) return;
      for (const stateData of Object.values(anim.states)) {
        const allFrames = [...(stateData.idle || []), ...(stateData.hit || [])];
        for (const frame of allFrames) {
          if (!metaCache.has(frame.key)) {
            metaCache.set(frame.key, {
              basedata: frame.basedata,
              width: frame.width,
              height: frame.height,
            });
          }
          requestImageByKey(frame.key);
        }
      }
    });
  }
}

function initReactorRuntimeStates() {
  // For offline mode / maps without server reactors — init from WZ map data
  if (!runtime.map) return;
  // Only init if not already synced by server (syncServerReactors called from map_state)
  if (reactorRuntimeState.size > 0) return;
  reactorRuntimeState.clear();

  for (let i = 0; i < runtime.map.reactorEntries.length; i++) {
    const reactor = runtime.map.reactorEntries[i];
    reactorRuntimeState.set(i, {
      frameIndex: 0,
      elapsed: 0,
      state: 0,
      hp: 4,
      active: true,
      hitAnimPlaying: false,
      hitAnimState: 0,
      hitAnimFrameIndex: 0,
      hitAnimElapsed: 0,
      destroyed: false,
      opacity: 1,
    });
  }
}

function updateReactorAnimations(dt) {
  if (!runtime.map) return;

  for (const [idx, rs] of reactorRuntimeState) {
    const reactor = runtime.map.reactorEntries[idx];
    if (!reactor) continue;
    const anim = reactorAnimations.get(reactor.id);
    if (!anim) continue;

    // Fade-in after respawn
    if (rs.active && rs.opacity < 1) {
      rs.opacity = Math.min(1, rs.opacity + dt * 2); // ~0.5s fade in
    }
    // Fade-out after destroy
    if (rs.destroyed && rs.opacity > 0 && !rs.hitAnimPlaying) {
      rs.opacity = Math.max(0, rs.opacity - dt * 3); // ~0.33s fade out
    }

    // Hit animation playback — C++: animations[state] = src[state]["hit"]
    // Only plays the EXACT state's hit anim; no fallback to other states.
    if (rs.hitAnimPlaying) {
      const animState = rs.hitAnimState ?? rs.state;
      const stateData = anim.states[animState];
      const hitFrames = stateData?.hit ?? [];
      if (hitFrames.length === 0) {
        // C++: states with no hit anim → animation_ended = true immediately
        rs.hitAnimPlaying = false;
      } else {
        const frame = hitFrames[rs.hitAnimFrameIndex];
        if (frame) {
          rs.hitAnimElapsed += dt * 1000;
          if (rs.hitAnimElapsed >= frame.delay) {
            rs.hitAnimElapsed -= frame.delay;
            rs.hitAnimFrameIndex++;
            if (rs.hitAnimFrameIndex >= hitFrames.length) {
              rs.hitAnimPlaying = false;
            }
          }
        } else {
          rs.hitAnimPlaying = false;
        }
      }
    }

    // Idle animation (if state has multiple idle frames)
    if (!rs.hitAnimPlaying && rs.active) {
      const stateData = anim.states[rs.state];
      const idleFrames = stateData?.idle ?? [];
      if (idleFrames.length > 1) {
        const frame = idleFrames[rs.frameIndex];
        if (frame && frame.delay > 0) {
          rs.elapsed += dt * 1000;
          if (rs.elapsed >= frame.delay) {
            rs.elapsed -= frame.delay;
            rs.frameIndex = (rs.frameIndex + 1) % idleFrames.length;
          }
        }
      }
    }
  }
}

function drawReactors() {
  if (!runtime.map) return;

  const cam = runtime.camera;
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;

  for (const [idx, rs] of reactorRuntimeState) {
    if (rs.opacity <= 0 && !rs.hitAnimPlaying) continue;

    const reactor = runtime.map.reactorEntries[idx];
    if (!reactor) continue;
    const anim = reactorAnimations.get(reactor.id);
    if (!anim) continue;

    // Pick the right frame to draw
    let frame = null;
    if (rs.hitAnimPlaying) {
      // C++: animations.at(state - 1).draw() — use exact state, no fallback
      const animState = rs.hitAnimState ?? rs.state;
      const stateData = anim.states[animState];
      const hitFrames = stateData?.hit ?? [];
      if (hitFrames.length > 0) {
        frame = hitFrames[rs.hitAnimFrameIndex] ?? hitFrames[0];
      }
    }
    if (!frame) {
      // Use idle frame for current state; fall back through earlier states until one has frames
      let idleFrames = [];
      for (let s = rs.state; s >= 0; s--) {
        const sd = anim.states[s];
        if (sd?.idle?.length > 0) { idleFrames = sd.idle; break; }
      }
      frame = idleFrames[rs.frameIndex % (idleFrames.length || 1)] ?? idleFrames[0];
    }
    if (!frame) continue;

    const img = getImageByKey(frame.key);
    if (!img) continue;

    const screenX = Math.round(reactor.x - cam.x + halfW);
    const screenY = Math.round(reactor.y - cam.y + halfH);

    if (
      screenX + img.width < -100 || screenX - img.width > canvasEl.width + 100 ||
      screenY + img.height < -100 || screenY - img.height > canvasEl.height + 100
    ) { runtime.perf.culledSprites++; continue; }

    ctx.save();
    if (rs.opacity < 1) ctx.globalAlpha = rs.opacity;

    const flip = reactor.f === 1;
    if (flip) {
      ctx.translate(screenX, screenY);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -frame.originX, -frame.originY);
    } else {
      ctx.drawImage(img, screenX - frame.originX, screenY - frame.originY);
    }

    runtime.perf.drawCalls++;
    runtime.perf.reactorsDrawn++;
    ctx.restore();
  }
}

/**
 * Find reactors in attack range (mirrors findMobsInRange).
 * Returns array of { idx, reactor } for reactors in the player's attack box.
 */
function findReactorsInRange() {
  if (!runtime.map) return [];
  const px = runtime.player.x;
  const py = runtime.player.y;
  const facingLeft = runtime.player.facing === -1;
  const rangeLeft  = facingLeft ? px - ATTACK_RANGE_X : px - 10;
  const rangeRight = facingLeft ? px + 10 : px + ATTACK_RANGE_X;
  const rangeTop   = py - ATTACK_RANGE_Y;
  const rangeBottom = py + ATTACK_RANGE_Y;

  const candidates = [];
  for (const [idx, rs] of reactorRuntimeState) {
    if (!rs.active || rs.destroyed) continue;
    const reactor = runtime.map.reactorEntries[idx];
    if (!reactor) continue;
    const rx = reactor.x;
    const ry = reactor.y;
    if (rx >= rangeLeft && rx <= rangeRight && ry >= rangeTop && ry <= rangeBottom) {
      const dist = Math.abs(rx - px) + Math.abs(ry - py);
      candidates.push({ idx, reactor, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates;
}

function drawReactorMarkers() {
  if (!runtime.map) return;

  ctx.save();
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (const [idx, rs] of reactorRuntimeState) {
    const reactor = runtime.map.reactorEntries[idx];
    if (!reactor) continue;
    const sp = worldToScreen(reactor.x, reactor.y);
    ctx.fillStyle = rs.active ? "rgba(255, 100, 255, 0.7)" : "rgba(100, 100, 100, 0.5)";
    ctx.fillRect(sp.x - 4, sp.y - 4, 8, 8);
    ctx.fillStyle = rs.active ? "#ff64ff" : "#888";
    ctx.fillText(`R:${reactor.id} HP:${rs.hp ?? "?"}/${4} S:${rs.state}`, sp.x, sp.y - 6);
  }

  ctx.restore();
}

function spatialCellCoord(value) {
  return Math.floor(value / SPATIAL_BUCKET_SIZE);
}

function spatialBucketKey(cx, cy) {
  return `${cx},${cy}`;
}

function addToSpatialBucket(bucketMap, cx, cy, value) {
  const key = spatialBucketKey(cx, cy);
  let bucket = bucketMap.get(key);
  if (!bucket) {
    bucket = [];
    bucketMap.set(key, bucket);
  }
  bucket.push(value);
}

function buildLayerSpatialIndex(layer) {
  const objectBuckets = new Map();
  const tileBuckets = new Map();

  layer.objects.forEach((obj, index) => {
    obj._drawOrder = index;
    const cx = spatialCellCoord(obj.x);
    const cy = spatialCellCoord(obj.y);
    addToSpatialBucket(objectBuckets, cx, cy, obj);
  });

  layer.tiles.forEach((tile, index) => {
    tile._drawOrder = index;
    const cx = spatialCellCoord(tile.x);
    const cy = spatialCellCoord(tile.y);
    addToSpatialBucket(tileBuckets, cx, cy, tile);
  });

  layer._spatialIndex = {
    objectBuckets,
    tileBuckets,
    visibleCache: null,
  };
}

function buildMapSpatialIndex(map) {
  for (const layer of map.layers ?? []) {
    buildLayerSpatialIndex(layer);
  }
}

function isDamagingTrapMeta(meta) {
  return safeNumber(meta?.obstacle, 0) !== 0 && safeNumber(meta?.damage, 0) > 0;
}

function buildMapTrapHazardIndex(map) {
  const hazards = [];

  for (const layer of map.layers ?? []) {
    for (const obj of layer.objects ?? []) {
      const meta = getMetaByKey(obj.key);
      if (!isDamagingTrapMeta(meta)) continue;
      hazards.push({
        layerIndex: layer.layerIndex,
        obj,
        baseDamage: Math.max(1, Math.round(safeNumber(meta.damage, 1))),
      });
    }
  }

  map.trapHazards = hazards;
}

function currentObjectFrameMeta(layerIndex, obj) {
  let frameKey = obj.key;
  if (obj.frameDelays && obj.frameCount > 1) {
    const stateKey = `${layerIndex}:${obj.id}`;
    const state = objectAnimStates.get(stateKey);
    if (state) {
      const frameToken = obj.frameKeys?.[state.frameIndex] ?? state.frameIndex;
      frameKey = `${obj.baseKey}:${frameToken}`;
    }
  }

  let meta = getMetaByKey(frameKey);
  if (!meta) {
    meta = getMetaByKey(obj.key);
  }
  if (!meta) {
    requestObjectMeta(obj);
  }

  return meta;
}

function visibleSpritesForLayer(layer) {
  const index = layer?._spatialIndex;
  if (!index) {
    return { objects: layer.objects ?? [], tiles: layer.tiles ?? [] };
  }

  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;
  const left = runtime.camera.x - halfW - SPATIAL_QUERY_MARGIN;
  const right = runtime.camera.x + halfW + SPATIAL_QUERY_MARGIN;
  const top = runtime.camera.y - halfH - SPATIAL_QUERY_MARGIN;
  const bottom = runtime.camera.y + halfH + SPATIAL_QUERY_MARGIN;

  const minCX = spatialCellCoord(left);
  const maxCX = spatialCellCoord(right);
  const minCY = spatialCellCoord(top);
  const maxCY = spatialCellCoord(bottom);

  const cache = index.visibleCache;
  if (
    cache &&
    cache.minCX === minCX &&
    cache.maxCX === maxCX &&
    cache.minCY === minCY &&
    cache.maxCY === maxCY
  ) {
    return cache;
  }

  const objects = [];
  const tiles = [];

  for (let cy = minCY; cy <= maxCY; cy += 1) {
    for (let cx = minCX; cx <= maxCX; cx += 1) {
      const key = spatialBucketKey(cx, cy);
      const objBucket = index.objectBuckets.get(key);
      if (objBucket) objects.push(...objBucket);
      const tileBucket = index.tileBuckets.get(key);
      if (tileBucket) tiles.push(...tileBucket);
    }
  }

  objects.sort((a, b) => a._drawOrder - b._drawOrder);
  tiles.sort((a, b) => a._drawOrder - b._drawOrder);

  const nextCache = { objects, tiles, minCX, maxCX, minCY, maxCY };
  index.visibleCache = nextCache;
  return nextCache;
}

function parseMapData(raw) {
  const info = imgdirLeafRecord(childByName(raw, "info"));

  const backgrounds = imgdirChildren(childByName(raw, "back"))
    .map((entry) => {
      const row = imgdirLeafRecord(entry);
      const index = safeNumber(entry.$imgdir, 0);
      const baseKey = `back:${row.bS}:${row.no}:${row.ani ?? 0}`;
      return {
        index,
        key: baseKey,
        baseKey,
        bS: String(row.bS ?? ""),
        no: String(row.no ?? "0"),
        ani: safeNumber(row.ani, 0),
        front: safeNumber(row.front, 0),
        type: safeNumber(row.type, 0),
        rx: safeNumber(row.rx, 0),
        ry: safeNumber(row.ry, 0),
        cx: safeNumber(row.cx, 0),
        cy: safeNumber(row.cy, 0),
        flipped: safeNumber(row.f, 0) === 1,
        x: safeNumber(row.x, 0),
        y: safeNumber(row.y, 0),
        alpha: safeNumber(row.a, 255) / 255,
        // Animation fields — populated during preload for ani=1 backgrounds
        frameCount: 1,
        frameDelays: null,
        _metaRequested: false,
      };
    })
    .sort((a, b) => a.index - b.index);

  const blackBackground = backgrounds.length > 0 && backgrounds[0].bS.length === 0;

  const layers = [];
  for (let layerIndex = 0; layerIndex <= 7; layerIndex += 1) {
    const layerNode = childByName(raw, String(layerIndex));
    if (!layerNode) continue;

    const layerInfo = imgdirLeafRecord(childByName(layerNode, "info"));
    const tileSet = layerInfo.tS ? String(layerInfo.tS) : null;

    const tiles = imgdirChildren(childByName(layerNode, "tile"))
      .map((entry) => {
        const row = imgdirLeafRecord(entry);
        return {
          id: safeNumber(entry.$imgdir, 0),
          x: safeNumber(row.x, 0),
          y: safeNumber(row.y, 0),
          u: String(row.u ?? ""),
          no: String(row.no ?? "0"),
          z: safeNumber(row.zM, 0),
          tileSet,
          key: tileSet ? `tile:${tileSet}:${row.u}:${row.no}` : null,
          _metaRequested: false,
        };
      })
      .sort((a, b) => (a.z === b.z ? a.id - b.id : a.z - b.z));

    const objects = imgdirChildren(childByName(layerNode, "obj"))
      .map((entry) => {
        const row = imgdirLeafRecord(entry);
        // In map object entries, `f` is horizontal flip flag (not frame index).
        // C++ Obj.cpp always constructs animation from the full node and starts at frame 0.
        const frameNo = "0";
        const baseKey = `obj:${row.oS}:${row.l0}:${row.l1}:${row.l2}`;
        return {
          id: safeNumber(entry.$imgdir, 0),
          x: safeNumber(row.x, 0),
          y: safeNumber(row.y, 0),
          oS: String(row.oS ?? ""),
          l0: String(row.l0 ?? ""),
          l1: String(row.l1 ?? ""),
          l2: String(row.l2 ?? ""),
          frameNo,
          flipped: safeNumber(row.f, 0) === 1,
          z: safeNumber(row.z, 0),
          baseKey,
          key: `${baseKey}:${frameNo}`,
          // Animation fields — populated during preload
          frameCount: 1,
          frameDelays: null, // null = not animated, [ms, ms, ...] = animated
          frameOpacities: null, // null = not animated, [{start, end}, ...] per frame
          frameKeys: null, // null = [0..frameCount-1], otherwise explicit frame token sequence
          motion: null, // object-level motion from first frame {moveType, moveW, moveH, moveP, moveR}
          _metaRequested: false,
        };
      })
      .sort((a, b) => (a.z === b.z ? a.id - b.id : a.z - b.z));

    layers.push({ layerIndex, tileSet, tiles, objects });
  }

  const lifeEntries = imgdirChildren(childByName(raw, "life")).map((entry) => {
    const row = imgdirLeafRecord(entry);
    return {
      type: String(row.type ?? ""),
      id: String(row.id ?? ""),
      x: safeNumber(row.x, 0),
      y: safeNumber(row.y, 0),
      cy: safeNumber(row.cy, safeNumber(row.y, 0)),
      fh: safeNumber(row.fh, 0),
      f: safeNumber(row.f, 0),
      rx0: safeNumber(row.rx0, 0),
      rx1: safeNumber(row.rx1, 0),
      hide: safeNumber(row.hide, 0),
    };
  });

  const portalEntries = imgdirChildren(childByName(raw, "portal")).map((entry) => {
    const row = imgdirLeafRecord(entry);
    return {
      id: safeNumber(entry.$imgdir, -1),
      name: String(row.pn ?? ""),
      type: safeNumber(row.pt, 0),
      image: String(row.image ?? "default"),
      x: safeNumber(row.x, 0),
      y: safeNumber(row.y, 0),
      targetMapId: safeNumber(row.tm, 0),
      targetPortalName: String(row.tn ?? ""),
    };
  });

  const ladderRopes = imgdirChildren(childByName(raw, "ladderRope")).map((entry) => {
    const row = imgdirLeafRecord(entry);
    return {
      key: String(entry.$imgdir ?? `${row.x}:${row.y1}:${row.y2}:${row.l ?? 0}`),
      x: safeNumber(row.x, 0),
      y1: safeNumber(row.y1, 0),
      y2: safeNumber(row.y2, 0),
      ladder: safeNumber(row.l, 0) === 1,
      usableFromBottom: safeNumber(row.uf, 0) === 1,
    };
  });

  // Parse reactor entries
  const reactorEntries = imgdirChildren(childByName(raw, "reactor")).map((entry) => {
    const row = imgdirLeafRecord(entry);
    const reactorId = String(row.id ?? "");
    return {
      index: safeNumber(entry.$imgdir, 0),
      id: reactorId,
      x: safeNumber(row.x, 0),
      y: safeNumber(row.y, 0),
      reactorTime: safeNumber(row.reactorTime, 0),
      f: safeNumber(row.f, 0),
      name: String(row.name ?? ""),
    };
  });

  const footholdLines = [];
  const footholdRoot = childByName(raw, "foothold");
  for (const layer of imgdirChildren(footholdRoot)) {
    for (const group of imgdirChildren(layer)) {
      for (const foothold of imgdirChildren(group)) {
        const row = imgdirLeafRecord(foothold);
        const prevIdValue = safeNumber(row.prev, 0);
        const nextIdValue = safeNumber(row.next, 0);

        footholdLines.push({
          id: String(foothold.$imgdir),
          layer: safeNumber(layer.$imgdir, 0),
          group: safeNumber(group.$imgdir, 0),
          x1: safeNumber(row.x1, 0),
          y1: safeNumber(row.y1, 0),
          x2: safeNumber(row.x2, 0),
          y2: safeNumber(row.y2, 0),
          prevId: prevIdValue > 0 ? String(prevIdValue) : null,
          nextId: nextIdValue > 0 ? String(nextIdValue) : null,
        });
      }
    }
  }

  const footholdById = new Map();
  let leftWall = 30000;
  let rightWall = -30000;
  let topBorder = 30000;
  let bottomBorder = -30000;

  for (const line of footholdLines) {
    footholdById.set(line.id, line);

    const left = Math.min(line.x1, line.x2);
    const right = Math.max(line.x1, line.x2);
    const top = Math.min(line.y1, line.y2);
    const bottom = Math.max(line.y1, line.y2);

    if (left < leftWall) leftWall = left;
    if (right > rightWall) rightWall = right;
    if (top < topBorder) topBorder = top;
    if (bottom > bottomBorder) bottomBorder = bottom;
  }

  const walls = {
    left: leftWall + 25,
    right: rightWall - 25,
  };

  const borders = {
    top: topBorder - 300,
    bottom: bottomBorder,
  };

  const wallLines = footholdLines
    .filter((line) => Math.abs(line.x2 - line.x1) < 0.01)
    .map((line) => ({
      x: line.x1,
      y1: Math.min(line.y1, line.y2),
      y2: Math.max(line.y1, line.y2),
    }));


  // Pre-index tall wall columns by X — only columns with >= 500px total wall
  // coverage are indexed (boundary/section walls, not interior level separators).
  // Used by getWallX to prevent jumping through tall multi-segment walls while
  // letting players pass interior walls at jump height (matching C++ feel).
  const WALL_COLUMN_MIN_TOTAL_HEIGHT = 500;
  const wallColumnsByX = new Map();
  for (const wall of wallLines) {
    const xKey = Math.round(wall.x);
    let col = wallColumnsByX.get(xKey);
    if (!col) {
      col = { segments: [], totalHeight: 0 };
      wallColumnsByX.set(xKey, col);
    }
    col.segments.push({ y1: wall.y1, y2: wall.y2 });
    col.totalHeight += Math.abs(wall.y2 - wall.y1);
  }
  // Prune short columns — only keep tall boundary walls
  for (const [xKey, col] of wallColumnsByX) {
    if (col.totalHeight < WALL_COLUMN_MIN_TOTAL_HEIGHT) {
      wallColumnsByX.delete(xKey);
    }
  }

  const points = [];
  for (const line of footholdLines) {
    points.push({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
  }
  for (const portal of portalEntries) points.push({ x: portal.x, y: portal.y });
  for (const life of lifeEntries) points.push({ x: life.x, y: life.y });

  const minX = Math.min(...points.map((p) => p.x), -700);
  const maxX = Math.max(...points.map((p) => p.x), 700);
  const minY = Math.min(...points.map((p) => p.y), -220);
  const maxY = Math.max(...points.map((p) => p.y), 380);

  const footholdMinX = footholdLines.length > 0 ? leftWall : minX;
  const footholdMaxX = footholdLines.length > 0 ? rightWall : maxX;
  const footholdMinY = footholdLines.length > 0 ? topBorder : minY;
  const footholdMaxY = footholdLines.length > 0 ? bottomBorder : maxY;

  // Parse minimap data
  const miniMapNode = childByName(raw, "miniMap");
  let miniMap = null;
  if (miniMapNode) {
    const mmRec = imgdirLeafRecord(miniMapNode);
    const mmCanvas = (miniMapNode.$$ ?? []).find((c) => c.$canvas !== undefined);
    if (mmCanvas && mmCanvas.basedata) {
      miniMap = {
        centerX: safeNumber(mmRec.centerX, 0),
        centerY: safeNumber(mmRec.centerY, 0),
        mag: safeNumber(mmRec.mag, 0),
        canvasWidth: mmCanvas.width ?? 0,
        canvasHeight: mmCanvas.height ?? 0,
        basedata: mmCanvas.basedata,
        imageKey: null, // set after mapId is known in loadMap
      };
    }
  }

  const parsedMap = {
    info,
    swim: safeNumber(info.swim, 0) === 1,
    backgrounds,
    blackBackground,
    layers,
    lifeEntries,
    portalEntries,
    reactorEntries,
    ladderRopes,
    footholdLines,
    footholdById,
    wallLines,
    wallColumnsByX,
    walls,
    borders,
    footholdBounds: {
      minX: footholdMinX,
      maxX: footholdMaxX,
      minY: footholdMinY,
      maxY: footholdMaxY,
    },
    bounds: { minX, maxX, minY, maxY },
    miniMap,
    trapHazards: [],
  };

  buildMapSpatialIndex(parsedMap);
  return parsedMap;
}

async function loadBackgroundMeta(entry) {
  if (!entry.key || !entry.bS) return null;

  const path = `/resources/Map.wz/Back/${entry.bS}.img.json`;
  const json = await fetchJson(path);
  const group = childByName(json, entry.ani === 1 ? "ani" : "back");

  const directCanvasNode = (group?.$$ ?? []).find((child) => child.$canvas === entry.no);
  const node = childByName(group, entry.no) ?? directCanvasNode;
  const canvasNode = pickCanvasNode(node, "0") ?? directCanvasNode;

  return canvasMetaFromNode(canvasNode);
}

function requestBackgroundMeta(entry) {
  if (!entry.key || !entry.bS) return;
  if (metaCache.has(entry.key)) return;
  if (entry._metaRequested) return;

  entry._metaRequested = true;
  const pending = requestMeta(entry.key, () => loadBackgroundMeta(entry));
  if (pending && typeof pending.then === "function") {
    pending.then((meta) => {
      if (!meta) entry._metaRequested = false;
    });
  } else if (!pending) {
    entry._metaRequested = false;
  }
}

/**
 * Load all frames for an animated background (ani=1) and register in metaCache.
 */
async function loadAnimatedBackgroundFrames(entry) {
  if (entry.ani !== 1) return null;

  const path = `/resources/Map.wz/Back/${entry.bS}.img.json`;
  const json = await fetchJson(path);
  const group = childByName(json, "ani");
  const node = childByName(group, entry.no);
  if (!node) return null;

  const frameNodes = (node.$$ ?? []).filter(
    (c) => c.$imgdir !== undefined && /^\d+$/.test(c.$imgdir)
  );
  if (frameNodes.length <= 1) return null;

  const delays = [];
  for (const frameNode of frameNodes) {
    const frameIdx = frameNode.$imgdir;
    const canvasNode = pickCanvasNode(node, frameIdx);
    if (!canvasNode) continue;

    const meta = canvasMetaFromNode(canvasNode);
    if (!meta) continue;

    const key = `${entry.baseKey}:f${frameIdx}`;
    if (!metaCache.has(key)) {
      metaCache.set(key, meta);
    }

    let delay = 100;
    for (const sub of frameNode.$$ ?? []) {
      if (sub.$int === "delay") delay = safeNumber(sub.value, 100);
    }
    if (canvasNode !== frameNode) {
      for (const sub of canvasNode.$$ ?? []) {
        if (sub.$int === "delay") delay = safeNumber(sub.value, delay);
      }
    }
    delays.push(Math.max(delay, 30));

    await requestImageByKey(key);
  }

  return delays.length > 1 ? { frameCount: delays.length, delays } : null;
}

async function loadTileMeta(tile) {
  if (!tile.key || !tile.tileSet) return null;

  const path = `/resources/Map.wz/Tile/${tile.tileSet}.img.json`;
  const json = await fetchJson(path);
  const group = childByName(json, tile.u);
  const canvasNode = pickCanvasNode(group, tile.no);
  return canvasMetaFromNode(canvasNode);
}

function requestTileMeta(tile) {
  if (!tile.key || !tile.tileSet) return;
  if (metaCache.has(tile.key)) return;
  if (tile._metaRequested) return;

  tile._metaRequested = true;
  const pending = requestMeta(tile.key, () => loadTileMeta(tile));
  if (pending && typeof pending.then === "function") {
    pending.then((meta) => {
      if (!meta) tile._metaRequested = false;
    });
  } else if (!pending) {
    tile._metaRequested = false;
  }
}

async function loadObjectMeta(obj) {
  if (!obj.key) return null;

  const path = `/resources/Map.wz/Obj/${obj.oS}.img.json`;
  const json = await fetchJson(path);
  const target = findNodeByPath(json, [obj.l0, obj.l1, obj.l2]);
  const extras = objectMetaExtrasFromNode(target);
  const canvasNode = pickCanvasNode(target, obj.frameNo);
  const meta = canvasMetaFromNode(canvasNode);
  return applyObjectMetaExtras(meta, extras);
}

/**
 * Return ordered frame entries for object animations.
 * C++ parity: only bitmap-backed numeric `$imgdir` or direct numeric `$canvas`
 * children are considered animation frames. Numeric `$uol` aliases are skipped.
 */
function objectAnimationFrameEntries(target) {
  const byIndex = new Map();

  for (const child of target.$$ ?? []) {
    const token =
      (typeof child.$imgdir === "string" && /^\d+$/.test(child.$imgdir) && child.$imgdir) ||
      (typeof child.$canvas === "string" && /^\d+$/.test(child.$canvas) && child.$canvas) ||
      null;

    if (token === null) continue;

    const index = safeNumber(token, -1);
    if (index < 0) continue;

    const rank = child.$canvas ? 2 : child.$imgdir ? 1 : 0;
    const existing = byIndex.get(index);
    if (!existing || rank > existing.rank) {
      byIndex.set(index, { index, token, source: child, rank });
    }
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/**
 * Load all frames for an animated object and register them in metaCache.
 * Returns { frameCount, delays: number[] } or null if single-frame.
 */
async function loadAnimatedObjectFrames(obj) {
  const path = `/resources/Map.wz/Obj/${obj.oS}.img.json`;
  const json = await fetchJson(path);
  const target = findNodeByPath(json, [obj.l0, obj.l1, obj.l2]);
  if (!target) return null;

  const extras = objectMetaExtrasFromNode(target);
  const frameEntries = objectAnimationFrameEntries(target);
  if (frameEntries.length <= 1) return null;

  const delays = [];
  const opacities = [];
  const frameKeys = [];
  for (const entry of frameEntries) {
    const frameIdx = entry.token;
    let canvasNode = null;

    if (entry.source.$canvas) {
      canvasNode = entry.source;
    } else {
      canvasNode = pickCanvasNode(target, frameIdx);
    }

    if (!canvasNode) continue;

    const meta = applyObjectMetaExtras(canvasMetaFromNode(canvasNode), extras);
    if (!meta) continue;

    const key = `${obj.baseKey}:${frameIdx}`;
    if (!metaCache.has(key)) {
      metaCache.set(key, meta);
    }

    let delay = 100;
    for (const sub of entry.source.$$ ?? []) {
      if (sub.$int === "delay") {
        delay = safeNumber(sub.value, 100);
      }
    }
    if (canvasNode !== entry.source) {
      for (const sub of canvasNode.$$ ?? []) {
        if (sub.$int === "delay") {
          delay = safeNumber(sub.value, delay);
        }
      }
    }
    delays.push(Math.max(delay, 30));
    // Extract per-frame opacity (a0/a1) matching C++ Frame constructor
    opacities.push({ start: meta.opacityStart, end: meta.opacityEnd });
    frameKeys.push(frameIdx);

    await requestImageByKey(key);
  }

  // Extract object-level motion from first frame (C++ Animation uses object-level movement)
  const firstKey = `${obj.baseKey}:${frameKeys[0]}`;
  const firstMeta = metaCache.get(firstKey);
  const motion = firstMeta ? {
    moveType: safeNumber(firstMeta.moveType, 0),
    moveW: safeNumber(firstMeta.moveW, 0),
    moveH: safeNumber(firstMeta.moveH, 0),
    moveP: safeNumber(firstMeta.moveP, Math.PI * 2 * 1000),
    moveR: safeNumber(firstMeta.moveR, 0),
  } : null;

  return delays.length > 1 ? { frameCount: delays.length, delays, opacities, frameKeys, motion } : null;
}

function requestObjectMeta(obj) {
  if (!obj.key) return;
  if (metaCache.has(obj.key)) return;
  if (obj._metaRequested) return;

  obj._metaRequested = true;
  const pending = requestMeta(obj.key, () => loadObjectMeta(obj));
  if (pending && typeof pending.then === "function") {
    pending.then((meta) => {
      if (!meta) obj._metaRequested = false;
    });
  } else if (!pending) {
    obj._metaRequested = false;
  }
}

function portalVisibilityMode(portal) {
  switch (portal.type) {
    case 2:
    case 4:
    case 7:
      return "always";
    case 10:
      return "touched";
    case 11:
      return "always";
    default:
      return "none";
  }
}

function updateHiddenPortalState(dt) {
  if (!runtime.map) return;

  const state = runtime.hiddenPortalState;

  for (const portal of runtime.map.portalEntries) {
    if (portalVisibilityMode(portal) !== "touched") continue;

    const key = `${portal.x},${portal.y}`;
    const touching = portalBoundsContainsPlayer(portal);
    let entry = state.get(key);

    if (touching) {
      if (!entry) {
        entry = { touchMs: 0, alpha: 0 };
        state.set(key, entry);
      }
      entry.touchMs += dt * 1000;

      if (entry.touchMs >= HIDDEN_PORTAL_REVEAL_DELAY_MS) {
        const fadeProgress = Math.min(1, (entry.touchMs - HIDDEN_PORTAL_REVEAL_DELAY_MS) / HIDDEN_PORTAL_FADE_IN_MS);
        entry.alpha = fadeProgress;
      }
    } else if (entry) {
      entry.alpha = Math.max(0, entry.alpha - (dt * 1000) / HIDDEN_PORTAL_FADE_IN_MS);
      entry.touchMs = 0;
      if (entry.alpha <= 0) {
        state.delete(key);
      }
    }
  }
}

function getHiddenPortalAlpha(portal) {
  const entry = runtime.hiddenPortalState.get(`${portal.x},${portal.y}`);
  return entry ? entry.alpha : 0;
}

function updatePortalAnimations(dtMs) {
  const anim = runtime.portalAnimation;

  anim.regularTimerMs += dtMs;
  while (anim.regularTimerMs >= PORTAL_ANIMATION_FRAME_MS) {
    anim.regularTimerMs -= PORTAL_ANIMATION_FRAME_MS;
    anim.regularFrameIndex = (anim.regularFrameIndex + 1) % 8;
  }

  anim.hiddenTimerMs += dtMs;
  while (anim.hiddenTimerMs >= PORTAL_ANIMATION_FRAME_MS) {
    anim.hiddenTimerMs -= PORTAL_ANIMATION_FRAME_MS;
    anim.hiddenFrameIndex = (anim.hiddenFrameIndex + 1) % 7;
  }
}

function isAutoEnterPortal(portal) {
  return portal.type === 3 || portal.type === 9;
}

function portalWorldBounds(portal) {
  return normalizedRect(
    portal.x - 25,
    portal.x + 25,
    portal.y - 100,
    portal.y + 25,
  );
}

function portalBoundsContainsPlayer(portal) {
  const player = runtime.player;
  const bounds = portalWorldBounds(portal);
  return (
    player.x >= bounds.left &&
    player.x <= bounds.right &&
    player.y >= bounds.top &&
    player.y <= bounds.bottom
  );
}

function isValidPortalTargetMapId(mapId) {
  return Number.isFinite(mapId) && mapId >= 0 && mapId < 999999999;
}

function normalizedPortalTargetName(targetPortalName) {
  const name = String(targetPortalName ?? "").trim();
  if (!name || name.toLowerCase() === "n/a") return "";
  return name;
}

function findUsablePortalAtPlayer(map) {
  for (const portal of map.portalEntries ?? []) {
    if (!portalBoundsContainsPlayer(portal)) continue;

    const hasTargetMap = isValidPortalTargetMapId(portal.targetMapId);
    const hasTargetPortalName = normalizedPortalTargetName(portal.targetPortalName).length > 0;
    if (!hasTargetMap && !hasTargetPortalName) continue;

    return portal;
  }

  return null;
}

function mapVisibleBounds(map) {
  // C++: uses VRLeft/VRRight/VRTop/VRBottom when present in map info,
  // falls back to foothold-derived walls (leftW+25, rightW-25)
  // and borders (topB-300, bottomB+100).
  const hasVR = map.info?.VRLeft != null && map.info?.VRRight != null;
  const hasVRY = map.info?.VRTop != null && map.info?.VRBottom != null;

  const left = hasVR ? safeNumber(map.info.VRLeft) : (map.walls?.left ?? map.bounds.minX);
  const right = hasVR ? safeNumber(map.info.VRRight) : (map.walls?.right ?? map.bounds.maxX);
  const top = hasVRY ? safeNumber(map.info.VRTop) : (map.borders?.top ?? map.bounds.minY);
  const bottom = hasVRY ? safeNumber(map.info.VRBottom) : (map.borders?.bottom ?? map.bounds.maxY);

  return { left, right, top, bottom };
}

function clampCameraXToMapBounds(map, desiredCenterX) {
  const { left: mapLeft, right: mapRight } = mapVisibleBounds(map);
  const halfWidth = gameViewWidth() / 2;
  const mapWidth = mapRight - mapLeft;

  if (mapWidth >= gameViewWidth()) {
    // Normal: clamp so camera doesn't see past VR edges
    const minCenterX = mapLeft + halfWidth;
    const maxCenterX = mapRight - halfWidth;
    return Math.max(minCenterX, Math.min(maxCenterX, desiredCenterX));
  }

  // Map narrower than viewport — center horizontally
  return (mapLeft + mapRight) / 2;
}

function clampCameraYToMapBounds(map, desiredCenterY) {
  const { top: mapTop, bottom: mapBottom } = mapVisibleBounds(map);
  const halfHeight = gameViewHeight() / 2;
  const mapHeight = mapBottom - mapTop;

  if (mapHeight >= gameViewHeight()) {
    // Normal: clamp so camera doesn't see past VR edges
    const minCenterY = mapTop + halfHeight;
    const maxCenterY = mapBottom - halfHeight;
    return Math.max(minCenterY, Math.min(maxCenterY, desiredCenterY));
  }

  // Map shorter than viewport — center vertically
  return (mapTop + mapBottom) / 2;
}

function portalMomentumEase(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function startPortalMomentumScroll() {
  if (!runtime.map) return;

  const startX = runtime.camera.x;
  const startY = runtime.camera.y;
  const targetX = clampCameraXToMapBounds(runtime.map, runtime.player.x);
  const targetY = clampCameraYToMapBounds(runtime.map, runtime.player.y - cameraHeightBias());

  const distance = Math.hypot(targetX - startX, targetY - startY);
  if (distance < 6) {
    runtime.camera.x = targetX;
    runtime.camera.y = targetY;
    runtime.portalScroll.active = false;
    return;
  }

  const durationMs = Math.max(
    PORTAL_SCROLL_MIN_MS,
    Math.min(PORTAL_SCROLL_MAX_MS, (distance / PORTAL_SCROLL_SPEED_PX_PER_SEC) * 1000),
  );

  runtime.portalScroll.active = true;
  runtime.portalScroll.startX = startX;
  runtime.portalScroll.startY = startY;
  runtime.portalScroll.targetX = targetX;
  runtime.portalScroll.targetY = targetY;
  runtime.portalScroll.elapsedMs = 0;
  runtime.portalScroll.durationMs = durationMs;
}

async function waitForPortalMomentumScrollToFinish() {
  while (runtime.portalScroll.active) {
    await waitForAnimationFrame();
  }
}

function movePlayerToPortalInCurrentMap(targetPortalName) {
  if (!runtime.map) return false;

  const targetPortal = runtime.map.portalEntries.find((portal) => portal.name === targetPortalName);
  if (!targetPortal) return false;

  const player = runtime.player;
  player.x = targetPortal.x;

  // Try to snap to a foothold near the portal destination:
  // 1. Check for a foothold close to portal Y (within 60px margin)
  // 2. Fall back to the nearest foothold below the portal
  const nearby = findFootholdAtXNearY(runtime.map, targetPortal.x, targetPortal.y, 60);
  const below = nearby || findFootholdBelow(runtime.map, targetPortal.x, targetPortal.y);
  if (below) {
    player.y = below.y;
    player.onGround = true;
    player.footholdId = below.line.id;
    player.footholdLayer = below.line.layer;
    player.vy = 0;
  } else {
    player.y = targetPortal.y;
    player.onGround = false;
    player.footholdId = null;
  }

  player.vx = 0;
  player.climbing = false;
  player.climbRope = null;
  player.downJumpIgnoreFootholdId = null;
  player.downJumpIgnoreUntil = 0;
  player.downJumpControlLock = false;
  player.downJumpTargetFootholdId = null;

  startPortalMomentumScroll();
  return true;
}

function waitForAnimationFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function fadeScreenTo(targetAlpha, durationMs) {
  const startAlpha = runtime.transition.alpha;
  const clampedTarget = Math.max(0, Math.min(1, targetAlpha));
  const duration = Math.max(0, durationMs);

  if (duration <= 0) {
    runtime.transition.alpha = clampedTarget;
    runtime.transition.active = clampedTarget > 0;
    return;
  }

  const startMs = performance.now();
  runtime.transition.active = true;

  while (true) {
    const elapsed = performance.now() - startMs;
    const t = Math.max(0, Math.min(1, elapsed / duration));
    runtime.transition.alpha = startAlpha + (clampedTarget - startAlpha) * t;

    if (t >= 1) break;
    await waitForAnimationFrame();
  }

  runtime.transition.alpha = clampedTarget;
  runtime.transition.active = clampedTarget > 0;
}

// ── Offline portal map transition (no server) ──
async function runPortalMapTransitionOffline(targetMapId, targetPortalName) {
  rlog(`portalTransition(offline) START → map=${targetMapId} portal=${targetPortalName}`);
  await fadeScreenTo(1, PORTAL_FADE_OUT_MS);
  rlog(`portalTransition fadeOut done, clearing overlay for loading screen`);
  runtime.transition.alpha = 0;
  runtime.transition.active = false;
  try {
    await loadMap(targetMapId, targetPortalName || null, true);
    rlog(`portalTransition loadMap resolved`);
    saveCharacter();
  } catch (err) {
    rlog(`portalTransition loadMap THREW: ${err?.message ?? err}`);
  } finally {
    runtime.transition.alpha = 1;
    runtime.transition.active = true;
    rlog(`portalTransition fadeIn start`);
    await fadeScreenTo(0, PORTAL_FADE_IN_MS);
    rlog(`portalTransition COMPLETE`);
  }
}

// ── Server-authoritative portal transition ──
// Sends use_portal, waits for change_map response, loads the map, sends map_loaded.
async function runServerPortalTransition(portalName) {
  rlog(`portalTransition(server) START portal=${portalName}`);
  // Start fade-out optimistically while waiting for server response
  await fadeScreenTo(1, PORTAL_FADE_OUT_MS);
  runtime.transition.alpha = 0;
  runtime.transition.active = false;

  try {
    // Request map change from server and await response
    const result = await requestServerMapChange({ type: "use_portal", portal_name: portalName });
    rlog(`portalTransition(server) approved → map=${result.map_id} portal=${result.spawn_portal}`);

    // Server approved — load the target map
    await loadMap(result.map_id, result.spawn_portal || null, true);
    saveCharacter();
    wsSend({ type: "map_loaded" });
    rlog(`portalTransition(server) map_loaded sent`);
  } catch (err) {
    rlog(`portalTransition(server) ERROR: ${err?.message ?? err}`);
  } finally {
    runtime.transition.alpha = 1;
    runtime.transition.active = true;
    await fadeScreenTo(0, PORTAL_FADE_IN_MS);
    rlog(`portalTransition(server) COMPLETE`);
  }
}

// ── Server-initiated map change (unsolicited, e.g., kicked to town) ──
async function handleServerMapChange(mapId, spawnPortal) {
  rlog(`handleServerMapChange START map=${mapId} portal=${spawnPortal}`);
  runtime.portalWarpInProgress = true;

  await fadeScreenTo(1, PORTAL_FADE_OUT_MS);
  runtime.transition.alpha = 0;
  runtime.transition.active = false;

  try {
    await loadMap(mapId, spawnPortal || null, !!spawnPortal);
    saveCharacter();
    wsSend({ type: "map_loaded" });
  } catch (err) {
    rlog(`handleServerMapChange ERROR: ${err?.message ?? err}`);
  } finally {
    runtime.portalWarpInProgress = false;
    runtime.transition.alpha = 1;
    runtime.transition.active = true;
    await fadeScreenTo(0, PORTAL_FADE_IN_MS);
    rlog(`handleServerMapChange COMPLETE`);
  }
}

/**
 * Send a map change request to the server and wait for the change_map response.
 * Returns { map_id, spawn_portal } on success. Throws on denial or timeout.
 */
function requestServerMapChange(msg) {
  return new Promise((resolve, reject) => {
    _pendingMapChangeResolve = resolve;
    _pendingMapChangeReject = reject;
    wsSend(msg);
    // Timeout after 10 seconds
    _pendingMapChangeTimer = setTimeout(() => {
      if (_pendingMapChangeResolve) {
        _pendingMapChangeResolve = null;
        _pendingMapChangeReject = null;
        _pendingMapChangeTimer = null;
        reject(new Error("Map change request timed out"));
      }
    }, 10000);
  });
}

async function tryUsePortal(force = false) {
  if (!runtime.map || runtime.loading.active || runtime.portalWarpInProgress) return;
  if (runtime.player.climbing || runtime.npcDialogue.active) return;

  const nowMs = performance.now();
  if (nowMs < runtime.portalCooldownUntil) return;

  const portal = findUsablePortalAtPlayer(runtime.map);
  if (!portal) return;

  if (!force && !runtime.input.up && !isAutoEnterPortal(portal)) return;

  runtime.portalCooldownUntil = nowMs + 400;
  runtime.portalWarpInProgress = true;

  try {
    playSfx("Game", "Portal");

    const currentMapId = safeNumber(runtime.mapId, -1);
    const targetPortalName = normalizedPortalTargetName(portal.targetPortalName);

    // Same-map teleport: no server involvement needed
    if (portal.targetMapId === currentMapId || !isValidPortalTargetMapId(portal.targetMapId)) {
      if (targetPortalName) {
        const moved = movePlayerToPortalInCurrentMap(targetPortalName);
        if (moved) {
          await waitForPortalMomentumScrollToFinish();
          return;
        }
      }

      // Try returnMap for portals with no explicit cross-map target
      const returnMapId = safeNumber(runtime.map.info?.returnMap, -1);
      if (isValidPortalTargetMapId(returnMapId) && returnMapId !== currentMapId) {
        if (_wsConnected) {
          // Online: server-authoritative portal transition
          await runServerPortalTransition(portal.name);
        } else {
          await runPortalMapTransitionOffline(String(returnMapId), targetPortalName || null);
        }
        return;
      }

      setStatus(`Portal ${portal.name || portal.id} has no local destination in map ${runtime.mapId}.`);
      return;
    }

    // Cross-map portal transition
    if (_wsConnected) {
      // Online: server validates portal and decides destination
      rlog(`tryUsePortal → server use_portal portal=${portal.name}`);
      await runServerPortalTransition(portal.name);
    } else {
      // Offline: client decides directly (no server)
      rlog(`tryUsePortal → offline transition targetMap=${portal.targetMapId} targetPortal=${targetPortalName}`);
      await runPortalMapTransitionOffline(String(portal.targetMapId), targetPortalName || null);
    }
  } catch (err) {
    rlog(`tryUsePortal ERROR: ${err?.message ?? err}`);
  } finally {
    runtime.portalWarpInProgress = false;
  }
}

function portalNodePath(portal) {
  switch (portal.type) {
    case 2:
    case 4:
    case 7:
      return ["portal", "game", "pv"];
    case 10:
      return ["portal", "game", "ph", "default", "portalContinue"];
    case 11:
      return ["portal", "game", "psh", portal.image || "default", "portalContinue"];
    default:
      return null;
  }
}

function portalFrameCount(portal) {
  return portal?.type === 10 || portal?.type === 11 ? 7 : 8;
}

function ensurePortalFramesRequested(portal) {
  const imageKey = portal?.image || "default";
  const warmupKey = `${portal?.type ?? "?"}:${imageKey}`;
  if (portalFrameWarmupRequested.has(warmupKey)) return;
  portalFrameWarmupRequested.add(warmupKey);

  const frameCount = portalFrameCount(portal);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const key = requestPortalMeta(portal, frame);
    if (key) getImageByKey(key);
  }
}

function portalMetaKey(portal, frameNo) {
  const path = portalNodePath(portal);
  if (!path) return null;

  const imageKey = portal.image || "default";
  return `portal:${portal.type}:${imageKey}:${frameNo}`;
}

async function loadPortalMeta(portal, frameNo) {
  const path = portalNodePath(portal);
  if (!path) return null;

  const imageKey = portal.image || "default";
  const json = await fetchJson("/resources/Map.wz/MapHelper.img.json");

  let portalNode = findNodeByPath(json, path);
  if (!portalNode && portal.type === 11 && imageKey !== "default") {
    portalNode = findNodeByPath(json, ["portal", "game", "psh", "default", "portalContinue"]);
  }

  const requested = String(frameNo);
  const directCanvas =
    (portalNode?.$$ ?? []).find((child) => child.$canvas === requested) ??
    (portalNode?.$$ ?? []).find((child) => child.$canvas === "0");
  const canvasNode = pickCanvasNode(portalNode, requested) ?? directCanvas;

  return canvasMetaFromNode(canvasNode);
}

function requestPortalMeta(portal, frameNo) {
  const key = portalMetaKey(portal, frameNo);
  if (!key) return null;

  if (!metaCache.has(key) && !metaPromiseCache.has(key)) {
    requestMeta(key, () => loadPortalMeta(portal, frameNo));
  }
  return key;
}

function buildZMapOrder(zMapJson) {
  const names = (zMapJson?.$$ ?? [])
    .map((node) => node.$null)
    .filter((value) => typeof value === "string");

  const order = {};
  names.reverse().forEach((name, index) => {
    order[name] = index;
  });

  return order;
}

function requestCharacterData() {
  if (runtime.characterData && runtime.characterHeadData && runtime.characterFaceData) {
    return Promise.resolve();
  }

  if (!runtime.characterDataPromise) {
    runtime.characterDataPromise = (async () => {
      try {
        // Build equip fetch list from currently equipped items
        const equipEntries = [...playerEquipped.entries()].map(([slotType, eq]) => ({
          id: eq.id,
          category: equipWzCategoryFromId(eq.id) || slotType,
          padded: String(eq.id).padStart(8, "0"),
        }));

        const fetches = [
          fetchJson("/resources/Character.wz/00002000.img.json"),
          fetchJson("/resources/Character.wz/00012000.img.json"),
          fetchJson(`/resources/Character.wz/${playerFacePath()}`),
          fetchJson("/resources/Base.wz/zmap.img.json"),
          fetchJson(`/resources/Character.wz/${playerHairPath()}`),
          ...equipEntries.map((eq) => fetchJson(`/resources/Character.wz/${eq.category}/${eq.padded}.img.json`)),
        ];

        const results = await Promise.all(fetches);
        const [bodyData, headData, faceData, zMapData, hairData, ...equipResults] = results;

        runtime.characterData = bodyData;
        runtime.characterHeadData = headData;
        runtime.characterFaceData = faceData;
        runtime.zMapOrder = buildZMapOrder(zMapData);
        runtime.characterHairData = hairData;

        for (let i = 0; i < equipEntries.length; i++) {
          runtime.characterEquipData[equipEntries[i].id] = equipResults[i];
        }
      } finally {
        runtime.characterDataPromise = null;
      }
    })();
  }

  return runtime.characterDataPromise;
}

function getCharacterActionFrames(action) {
  if (!runtime.characterData) return [];

  const actionNode = childByName(runtime.characterData, action);
  if (!actionNode) return [];

  return imgdirChildren(actionNode).sort((a, b) => Number(a.$imgdir) - Number(b.$imgdir));
}

function getHeadFrameMeta(action, frameIndex) {
  const headData = runtime.characterHeadData;
  if (!headData) return null;

  const actionNode = childByName(headData, action) ?? childByName(headData, "stand1");
  if (!actionNode) return null;

  const frames = imgdirChildren(actionNode).sort((a, b) => Number(a.$imgdir) - Number(b.$imgdir));
  if (frames.length === 0) return null;

  const frameNode = frames[frameIndex % frames.length];
  const uolNode = (frameNode.$$ ?? []).find((child) => child.$uol === "head" || child.$uol);
  const uolValue = String(uolNode?.value ?? "../../front/head");
  const sectionName = uolValue.includes("back/head") ? "back" : "front";

  const sectionNode = childByName(headData, sectionName);
  const canvasNode = pickCanvasNode(sectionNode, "head");
  return canvasMetaFromNode(canvasNode);
}

function randomBlinkCooldownMs() {
  return 1200 + Math.random() * 2200;
}

function getFaceExpressionFrames(expression, overrideFaceData) {
  const faceData = overrideFaceData || runtime.characterFaceData;
  if (!faceData) return [];

  const expressionNode = childByName(faceData, expression);
  if (!expressionNode) return [];

  const expressionFrames = imgdirChildren(expressionNode).sort((a, b) => Number(a.$imgdir) - Number(b.$imgdir));
  if (expressionFrames.length > 0) {
    return expressionFrames;
  }

  return [expressionNode];
}

function getFaceFrameMeta(frameLeaf, expression, expressionFrameIndex, overrideFaceData) {
  const faceData = overrideFaceData || runtime.characterFaceData;
  if (!faceData) return null;

  if (safeNumber(frameLeaf.face, 1) === 0) {
    return null;
  }

  const frames = getFaceExpressionFrames(expression, overrideFaceData);
  if (frames.length === 0) return null;

  const frameNode = frames[expressionFrameIndex % frames.length];
  const canvasNode =
    pickCanvasNode(frameNode, "face") ??
    pickCanvasNode(frameNode, "0") ??
    pickCanvasNode(childByName(faceData, "default"), "face");

  return canvasMetaFromNode(canvasNode);
}

function getFaceFrameDelayMs(expression, expressionFrameIndex) {
  const frames = getFaceExpressionFrames(expression);
  if (frames.length === 0) return 120;

  const frameNode = frames[expressionFrameIndex % frames.length];
  const leaf = imgdirLeafRecord(frameNode);
  const baseDelay = safeNumber(leaf.delay, 120);
  return Math.max(35, baseDelay / FACE_ANIMATION_SPEED);
}

function pickPlayerHitFaceExpression() {
  if (getFaceExpressionFrames("hit").length > 0) return "hit";
  if (getFaceExpressionFrames("pain").length > 0) return "pain";
  return "default";
}

function triggerPlayerHitVisuals(nowMs = performance.now()) {
  const faceAnimation = runtime.faceAnimation;
  const hitExpression = pickPlayerHitFaceExpression();

  if (hitExpression !== "default") {
    faceAnimation.expression = hitExpression;
    faceAnimation.frameIndex = 0;
    faceAnimation.frameTimerMs = 0;
    faceAnimation.overrideExpression = hitExpression;
    faceAnimation.overrideUntilMs = nowMs + PLAYER_HIT_FACE_DURATION_MS;

    // Broadcast hit expression to other players (skip emote cooldown — hits are immediate)
    wsSend({ type: "face", expression: hitExpression });
  }

  faceAnimation.blinkCooldownMs = randomBlinkCooldownMs();
}

function updateFaceAnimation(dt) {
  if (!runtime.characterFaceData) return;

  const faceAnimation = runtime.faceAnimation;
  const nowMs = performance.now();

  if (faceAnimation.overrideExpression && nowMs < faceAnimation.overrideUntilMs) {
    const expression = faceAnimation.overrideExpression;
    const frames = getFaceExpressionFrames(expression);

    if (frames.length === 0) {
      faceAnimation.overrideExpression = null;
      faceAnimation.overrideUntilMs = 0;
      faceAnimation.expression = "default";
      faceAnimation.frameIndex = 0;
      faceAnimation.frameTimerMs = 0;
      return;
    }

    if (faceAnimation.expression !== expression) {
      faceAnimation.expression = expression;
      faceAnimation.frameIndex = 0;
      faceAnimation.frameTimerMs = 0;
    }

    faceAnimation.frameTimerMs += dt * 1000;
    while (true) {
      const delayMs = getFaceFrameDelayMs(expression, faceAnimation.frameIndex);
      if (faceAnimation.frameTimerMs < delayMs) break;
      faceAnimation.frameTimerMs -= delayMs;
      faceAnimation.frameIndex = (faceAnimation.frameIndex + 1) % frames.length;
    }

    return;
  }

  if (faceAnimation.overrideExpression && nowMs >= faceAnimation.overrideUntilMs) {
    faceAnimation.overrideExpression = null;
    faceAnimation.overrideUntilMs = 0;
    faceAnimation.expression = "default";
    faceAnimation.frameIndex = 0;
    faceAnimation.frameTimerMs = 0;
  }

  if (faceAnimation.expression === "default") {
    faceAnimation.blinkCooldownMs -= dt * 1000;

    if (faceAnimation.blinkCooldownMs <= 0 && getFaceExpressionFrames("blink").length > 0) {
      faceAnimation.expression = "blink";
      faceAnimation.frameIndex = 0;
      faceAnimation.frameTimerMs = 0;
      faceAnimation.blinkCooldownMs = randomBlinkCooldownMs();
    }

    return;
  }

  faceAnimation.frameTimerMs += dt * 1000;
  const delayMs = getFaceFrameDelayMs(faceAnimation.expression, faceAnimation.frameIndex);

  if (faceAnimation.frameTimerMs < delayMs) {
    return;
  }

  faceAnimation.frameTimerMs = 0;
  const frames = getFaceExpressionFrames(faceAnimation.expression);
  if (frames.length === 0) {
    faceAnimation.expression = "default";
    faceAnimation.frameIndex = 0;
    return;
  }

  faceAnimation.frameIndex += 1;
  if (faceAnimation.frameIndex >= frames.length) {
    faceAnimation.expression = "default";
    faceAnimation.frameIndex = 0;
  }
}

/** Climbing stances where equipment with no matching stance should be hidden. */
const CLIMBING_STANCES = new Set(["ladder", "rope"]);

/**
 * Extract canvas parts from an equipment WZ node for a given stance and frame.
 * Equipment JSON structure: root > stance > frame > canvas children.
 * Each canvas child has a `z` string child indicating its zmap layer.
 *
 * During climbing (ladder/rope), equipment that lacks the specific stance is
 * hidden entirely (C++ draws weapon as BACKWEAPON only if the stance exists).
 * For non-climbing stances, falls back to "stand1" if the specific stance is missing.
 *
 * @param {object} data - Parsed WZ JSON root node
 * @param {string} action - Stance name (e.g. "stand1", "walk1", "ladder")
 * @param {number} frameIndex - Frame number within the stance
 * @param {string} prefix - Key prefix for caching (e.g. "equip:1040002")
 * @returns {Array<{name: string, meta: object}>} - Array of parts with canvas metadata
 */
function getEquipFrameParts(data, action, frameIndex, prefix) {
  if (!data) return [];

  let actionNode = childByName(data, action);

  if (!actionNode) {
    // During climbing, if equip doesn't have the stance, don't render it (C++ parity:
    // weapons have no ladder/rope stance and are drawn only as BACKWEAPON if present).
    if (CLIMBING_STANCES.has(action)) return [];

    // For other stances, fall back
    actionNode = childByName(data, "stand1");
    if (!actionNode) return [];
  }

  const frames = imgdirChildren(actionNode).sort((a, b) => Number(a.$imgdir) - Number(b.$imgdir));
  if (frames.length === 0) return [];

  const frameNode = frames[frameIndex % frames.length];
  const framePath = [actionNode.$imgdir ?? action, String(frameNode.$imgdir ?? frameIndex)];
  const parts = [];

  for (const child of frameNode.$$ ?? []) {
    if (typeof child.$canvas === "string") {
      const meta = canvasMetaFromNode(child);
      if (meta) {
        const zChild = (child.$$ ?? []).find((c) => c.$string === "z");
        if (zChild) meta.zName = String(zChild.value ?? child.$canvas);
        parts.push({
          name: `${prefix}:${child.$canvas}`,
          meta,
        });
      }
      continue;
    }

    if (typeof child.$uol === "string") {
      const target = resolveNodeByUol(data, framePath, String(child.value ?? ""));
      if (target) {
        const canvasNode = pickCanvasNode(target, child.$uol);
        const meta = canvasMetaFromNode(canvasNode);
        if (meta) {
          const zChild = (canvasNode?.$$ ?? []).find((c) => c.$string === "z");
          if (zChild) meta.zName = String(zChild.value ?? child.$uol);
          parts.push({
            name: `${prefix}:${child.$uol}`,
            meta,
          });
        }
      }
    }
  }

  return parts;
}

/**
 * Get hair parts for a given action/frame.
 *
 * Hair WZ data is structured as:
 *   - "default" / "backDefault": direct canvas children (hairOverHead, hair, hairShade, etc.)
 *   - Stance nodes (stand1, walk1, ladder, rope...): frame sub-nodes with either:
 *     - Direct canvas children, OR
 *     - UOL references to "../../default/hair" or "../../backDefault/backHair"
 *
 * C++ Hair constructor resolves per-stance per-frame and falls back to default/backDefault.
 * During climbing (ladder/rope), C++ CharLook::draw uses Hair::Layer::BACK which maps to
 * "backHair" / "backHairBelowCap" — parts from the "backDefault" section.
 */
function getHairFrameParts(action, frameIndex, overrideHairData) {
  const hairData = overrideHairData || runtime.characterHairData;
  if (!hairData) return [];

  const actionNode = childByName(hairData, action);

  if (actionNode) {
    const frames = imgdirChildren(actionNode).sort((a, b) => Number(a.$imgdir) - Number(b.$imgdir));
    if (frames.length > 0) {
      const frameNode = frames[frameIndex % frames.length];
      const framePath = [actionNode.$imgdir ?? action, String(frameNode.$imgdir ?? frameIndex)];

      // Resolve all children — canvas directly, UOLs by resolution
      const parts = [];
      for (const child of frameNode.$$ ?? []) {
        if (child.$canvas) {
          const meta = canvasMetaFromNode(child);
          if (meta) {
            const zChild = (child.$$ ?? []).find((c) => c.$string === "z");
            if (zChild) meta.zName = String(zChild.value ?? child.$canvas);
            parts.push({
              name: `hair:${runtime.player.hair_id}:${action}:${frameIndex}:${child.$canvas}`,
              meta,
            });
          }
        } else if (child.$uol) {
          // Resolve UOL — e.g. "../../backDefault/backHair" → backDefault > backHair canvas
          const target = resolveNodeByUol(hairData, framePath, String(child.value ?? ""));
          if (target) {
            // target may be a canvas node directly or a container with canvas children
            const canvasNode = target.$canvas ? target : pickCanvasNode(target, child.$uol);
            const meta = canvasMetaFromNode(canvasNode);
            if (meta) {
              const zChild = (canvasNode?.$$ ?? []).find((c) => c.$string === "z");
              const resolvedName = canvasNode?.$canvas ?? child.$uol;
              if (zChild) meta.zName = String(zChild.value ?? resolvedName);
              parts.push({
                name: `hair:${runtime.player.hair_id}:${action}:${frameIndex}:${resolvedName}`,
                meta,
              });
            }
          }
        }
      }

      if (parts.length > 0) return parts;
    }
  }

  // Fallback: extract from "default" stance (direct canvas children + sub-imgdirs)
  const defaultNode = childByName(hairData, "default");
  if (!defaultNode) return [];

  return extractHairPartsFromContainer(defaultNode, `hair:${runtime.player.hair_id}:default`);
}

/**
 * Extract hair parts from a container node (like "default" or "backDefault")
 * that has direct canvas children and/or sub-imgdirs with canvas children.
 */
function extractHairPartsFromContainer(containerNode, keyPrefix) {
  const parts = [];

  for (const child of containerNode.$$ ?? []) {
    if (child.$canvas) {
      const meta = canvasMetaFromNode(child);
      if (meta) {
        const zChild = (child.$$ ?? []).find((c) => c.$string === "z");
        if (zChild) meta.zName = String(zChild.value ?? child.$canvas);
        parts.push({
          name: `${keyPrefix}:${child.$canvas}`,
          meta,
        });
      }
    } else if (child.$imgdir) {
      // Nested imgdir (e.g. hairShade) — look for first canvas child
      const subCanvas = (child.$$ ?? []).find((c) => c.$canvas);
      if (subCanvas) {
        const meta = canvasMetaFromNode(subCanvas);
        if (meta) {
          const zChild = (subCanvas.$$ ?? []).find((c) => c.$string === "z");
          if (zChild) meta.zName = String(zChild.value ?? child.$imgdir);
          parts.push({
            name: `${keyPrefix}:${child.$imgdir}`,
            meta,
          });
        }
      }
    }
  }

  return parts;
}

function getCharacterFrameData(
  action,
  frameIndex,
  faceExpression = runtime.faceAnimation.expression,
  faceFrameIndex = runtime.faceAnimation.frameIndex,
) {
  const frames = getCharacterActionFrames(action);
  if (frames.length === 0) return null;

  const frameNode = frames[frameIndex % frames.length];
  const frameLeaf = imgdirLeafRecord(frameNode);
  const delay = safeNumber(frameLeaf.delay, 180);

  const framePath = [action, String(frameNode.$imgdir ?? frameIndex)];
  const frameParts = [];

  // Body parts
  for (const child of frameNode.$$ ?? []) {
    if (typeof child.$canvas === "string") {
      const meta = canvasMetaFromNode(child);
      if (meta) {
        frameParts.push({
          name: child.$canvas,
          meta,
        });
      }
      continue;
    }

    if (typeof child.$uol === "string") {
      const target = resolveNodeByUol(runtime.characterData, framePath, String(child.value ?? ""));
      const canvasNode = pickCanvasNode(target, child.$uol);
      const meta = canvasMetaFromNode(canvasNode);
      if (meta) {
        frameParts.push({
          name: child.$uol,
          meta,
        });
      }
    }
  }

  // Head
  const headMeta = getHeadFrameMeta(action, frameIndex);
  if (headMeta) {
    frameParts.push({ name: "head", meta: headMeta });
  }

  // Face — not drawn during climbing (C++ CharLook::draw skips face in climbing branch)
  if (!CLIMBING_STANCES.has(action)) {
    const faceMeta = getFaceFrameMeta(
      frameLeaf,
      faceExpression,
      faceFrameIndex,
    );
    if (faceMeta) {
      frameParts.push({ name: `face:${faceExpression}:${faceFrameIndex}`, meta: faceMeta });
    }
  }

  // Hair
  const hairParts = getHairFrameParts(action, frameIndex);
  for (const hp of hairParts) {
    frameParts.push(hp);
  }

  // Equipment — iterate currently equipped items (dynamic, not DEFAULT_EQUIPS)
  // Skip weapon when sitting on a chair
  const hidingWeapon = action === "sit";
  for (const [slotType, equipped] of playerEquipped) {
    if (hidingWeapon && slotType === "Weapon") continue;
    const equipData = runtime.characterEquipData[equipped.id];
    if (!equipData) continue;
    const equipParts = getEquipFrameParts(equipData, action, frameIndex, `equip:${equipped.id}`);
    for (const ep of equipParts) {
      frameParts.push(ep);
    }
  }

  return {
    delay,
    parts: frameParts,
  };
}

function requestCharacterPartImage(key, meta) {
  if (!meta) return;

  if (!metaCache.has(key)) {
    metaCache.set(key, meta);
  }

  requestImageByKey(key);
}

function addPreloadTask(taskMap, key, loader) {
  if (!key || taskMap.has(key)) return;
  taskMap.set(key, loader);
}

function buildMapAssetPreloadTasks(map) {
  const taskMap = new Map();

  for (const background of map.backgrounds ?? []) {
    if (!background.key || !background.bS) continue;
    addPreloadTask(taskMap, background.key, () => loadBackgroundMeta(background));
    // Detect and preload animated background frames
    if (background.ani === 1) {
      const animKey = `back-anim:${background.baseKey}`;
      if (!taskMap.has(animKey)) {
        const bgsWithSameBase = (map.backgrounds ?? []).filter(
          (b) => b.baseKey === background.baseKey && b.ani === 1
        );
        const cachedBgAnim = metaCache.get(animKey);
        if (cachedBgAnim && cachedBgAnim.delays) {
          for (const b of bgsWithSameBase) {
            b.frameCount = cachedBgAnim.frameCount;
            b.frameDelays = cachedBgAnim.delays;
          }
        }
        addPreloadTask(taskMap, animKey, async () => {
          const result = await loadAnimatedBackgroundFrames(background);
          if (result) {
            for (const b of bgsWithSameBase) {
              b.frameCount = result.frameCount;
              b.frameDelays = result.delays;
            }
          }
          return result;
        });
      }
    }
  }

  for (const layer of map.layers ?? []) {
    for (const tile of layer.tiles ?? []) {
      if (!tile.key || !tile.tileSet) continue;
      addPreloadTask(taskMap, tile.key, () => loadTileMeta(tile));
    }

    for (const obj of layer.objects ?? []) {
      if (!obj.key) continue;
      addPreloadTask(taskMap, obj.key, () => loadObjectMeta(obj));
      // Detect and preload animated object frames
      const animKey = `obj-anim:${obj.baseKey}`;
      if (!taskMap.has(animKey)) {
        // Capture all objects sharing the same baseKey so we can assign animation data
        const objsWithSameBase = [];
        for (const l of map.layers ?? []) {
          for (const o of l.objects ?? []) {
            if (o.baseKey === obj.baseKey) objsWithSameBase.push(o);
          }
        }
        // If animation meta is already cached (map transition reusing same
        // object type), populate the new map's objects immediately — the
        // loader side-effect won't run when requestMeta returns from cache.
        const cachedAnim = metaCache.get(animKey);
        if (cachedAnim && cachedAnim.delays) {
          for (const o of objsWithSameBase) {
            o.frameCount = cachedAnim.frameCount;
            o.frameDelays = cachedAnim.delays;
            o.frameOpacities = cachedAnim.opacities ?? null;
            o.frameKeys = cachedAnim.frameKeys ?? null;
            o.motion = cachedAnim.motion ?? null;
          }
        }
        addPreloadTask(taskMap, animKey, async () => {
          const result = await loadAnimatedObjectFrames(obj);
          if (result) {
            for (const o of objsWithSameBase) {
              o.frameCount = result.frameCount;
              o.frameDelays = result.delays;
              o.frameOpacities = result.opacities ?? null;
              o.frameKeys = result.frameKeys ?? null;
              o.motion = result.motion ?? null;
            }
          }
          return result;
        });
      }
    }
  }

  for (const portal of map.portalEntries ?? []) {
    if (portalVisibilityMode(portal) === "none") continue;

    const frameCount = portalFrameCount(portal);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const key = portalMetaKey(portal, frame);
      addPreloadTask(taskMap, key, () => loadPortalMeta(portal, frame));
    }
  }

  // Life (mob/NPC) sprite preload
  const lifeIds = new Set();
  for (const life of map.lifeEntries ?? []) {
    if (life.hide === 1) continue;
    const lifeKey = `${life.type}:${life.id}`;
    if (lifeIds.has(lifeKey)) continue;
    lifeIds.add(lifeKey);
    addPreloadTask(taskMap, `life-load:${lifeKey}`, async () => {
      const anim = await loadLifeAnimation(life.type, life.id);
      if (!anim) return null;
      // Register all stance frame images in metaCache so requestImageByKey works
      for (const stanceName of Object.keys(anim.stances)) {
        for (const frame of anim.stances[stanceName].frames) {
          if (!metaCache.has(frame.key)) {
            metaCache.set(frame.key, {
              basedata: frame.basedata,
              width: frame.width,
              height: frame.height,
            });
          }
        }
      }
      // Preload common stance frame images eagerly, then clear basedata to free memory
      for (const stanceName of ["stand", "move", "hit1", "die1"]) {
        const stance = anim.stances[stanceName];
        if (!stance) continue;
        for (const frame of stance.frames) {
          await requestImageByKey(frame.key);
          delete frame.basedata;
          const cachedMeta = metaCache.get(frame.key);
          if (cachedMeta) delete cachedMeta.basedata;
        }
      }
      // Update mob HP from WZ data now that it's loaded
      if (life.type === "m" && anim.maxHP > 0) {
        for (const [idx, state] of lifeRuntimeState) {
          const l = map.lifeEntries[idx];
          if (l && l.type === "m" && l.id === life.id && state.maxHp === MOB_DEFAULT_HP) {
            state.maxHp = anim.maxHP;
            state.hp = anim.maxHP;
          }
        }
      }
      return anim;
    });
  }

  // Preload mob sound file if map has mobs (22MB JSON — fetch early to avoid lag on first hit)
  const hasMobs = (map.lifeEntries ?? []).some(l => l.type === "m");
  if (hasMobs) {
    addPreloadTask(taskMap, "sound:Mob.img", async () => {
      try { await fetchJson(soundPathFromName("Mob.img")); } catch {}
    });
  }

  // Reactor sprite preload
  const reactorIds = new Set();
  for (const reactor of map.reactorEntries ?? []) {
    if (reactorIds.has(reactor.id)) continue;
    reactorIds.add(reactor.id);
    addPreloadTask(taskMap, `reactor-load:${reactor.id}`, async () => {
      const anim = await loadReactorAnimation(reactor.id);
      if (!anim) return null;
      // Register all frames (all states, idle + hit) in metaCache and preload images
      for (const stateData of Object.values(anim.states)) {
        const allFrames = [...(stateData.idle || []), ...(stateData.hit || [])];
        for (const frame of allFrames) {
          if (!metaCache.has(frame.key)) {
            metaCache.set(frame.key, {
              basedata: frame.basedata,
              width: frame.width,
              height: frame.height,
            });
          }
          await requestImageByKey(frame.key);
          delete frame.basedata;
          const cachedMeta = metaCache.get(frame.key);
          if (cachedMeta) delete cachedMeta.basedata;
        }
      }
      return anim;
    });
  }

  // Minimap canvas preload
  if (map.miniMap?.basedata) {
    const mmKey = map.miniMap.imageKey;
    addPreloadTask(taskMap, mmKey, async () => {
      return {
        basedata: map.miniMap.basedata,
        width: map.miniMap.canvasWidth,
        height: map.miniMap.canvasHeight,
      };
    });
  }

  return taskMap;
}

function addCharacterPreloadTasks(taskMap) {
  const actions = ["stand1", "walk1", "jump", "ladder", "rope", "prone", "sit",
    "proneStab", ...SWORD_1H_ATTACK_STANCES];

  for (const action of actions) {
    const actionFrames = getCharacterActionFrames(action);
    const frameCount = Math.min(actionFrames.length, 6);

    for (let fi = 0; fi < frameCount; fi++) {
      const frame = getCharacterFrameData(action, fi);
      if (!frame?.parts?.length) continue;

      for (const part of frame.parts) {
        const key = `char:${action}:${fi}:${part.name}`;
        addPreloadTask(taskMap, key, async () => part.meta);
      }
    }
  }
}

async function preloadMapAssets(map, loadToken) {
  const taskMap = buildMapAssetPreloadTasks(map);

  await requestCharacterData();
  if (loadToken !== runtime.mapLoadToken) return;

  addCharacterPreloadTasks(taskMap);

  const tasks = [...taskMap.entries()];
  runtime.loading.total = tasks.length;
  runtime.loading.loaded = 0;
  runtime.loading.progress = tasks.length > 0 ? 0 : 1;
  runtime.loading.label = `Loading assets 0/${tasks.length}`;

  if (tasks.length === 0) {
    return;
  }

  let cursor = 0;
  let statsDecoded = 0, statsCached = 0, statsSkipped = 0, statsError = 0;
  const workerCount = Math.min(8, tasks.length);

  const workers = Array.from({ length: workerCount }, () =>
    (async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= tasks.length) break;
        if (loadToken !== runtime.mapLoadToken) break;

        const [key, loader] = tasks[index];
        try {
          const hadImage = imageCache.has(key);
          const meta = await requestMeta(key, loader);
          if (meta) {
            await requestImageByKey(key);
            if (hadImage) statsCached++;
            else if (imageCache.has(key)) statsDecoded++;
            else statsSkipped++;
          } else {
            statsSkipped++;
          }
        } catch (error) {
          statsError++;
          rlog(`preload FAIL key=${key} err=${error?.message ?? error}`);
        } finally {
          if (loadToken === runtime.mapLoadToken) {
            runtime.loading.loaded += 1;
            runtime.loading.progress = runtime.loading.loaded / runtime.loading.total;
            runtime.loading.label = `Loading assets ${runtime.loading.loaded}/${runtime.loading.total}`;
          }
        }
      }
    })(),
  );

  await Promise.all(workers);
  rlog(`preload stats: decoded=${statsDecoded} cached=${statsCached} skipped=${statsSkipped} errors=${statsError} imageCache=${imageCache.size} metaCache=${metaCache.size}`);
}

function findGroundLanding(oldX, oldY, newX, newY, map, excludedFootholdId = null) {
  const moveX = newX - oldX;
  const moveY = newY - oldY;
  if (moveY < 0) return null;

  let best = null;
  let bestT = Number.POSITIVE_INFINITY;

  for (const line of map.footholdLines) {
    if (excludedFootholdId && String(line.id) === String(excludedFootholdId)) continue;
    if (fhIsWall(line)) continue;

    const segX = line.x2 - line.x1;
    const segY = line.y2 - line.y1;

    const denom = moveX * segY - moveY * segX;
    if (Math.abs(denom) < 1e-6) continue;

    const relX = line.x1 - oldX;
    const relY = line.y1 - oldY;

    const t = (relX * segY - relY * segX) / denom;
    const u = (relX * moveY - relY * moveX) / denom;

    if (t < -0.0001 || t > 1.0001) continue;
    if (u < -0.0001 || u > 1.0001) continue;
    if (t > bestT) continue;

    const hitX = oldX + moveX * t;
    const hitY = oldY + moveY * t;

    bestT = t;
    best = { y: hitY, x: hitX, line };
  }

  return best;
}

function findFootholdAtXNearY(map, x, targetY, maxDistance = 24) {
  let best = null;

  for (const line of map.footholdLines ?? []) {
    if (fhIsWall(line)) continue;
    const yAtX = fhGroundAt(line, x);
    if (yAtX === null) continue;
    const distance = Math.abs(yAtX - targetY);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { y: yAtX, line, distance };
    }
  }

  return best;
}

function findFootholdById(map, footholdId) {
  if (!footholdId) return null;
  return map.footholdById?.get(String(footholdId)) ?? null;
}

function findFootholdBelow(map, x, minY, excludedFootholdId = null) {
  let best = null;
  let bestY = Infinity;

  for (const fh of map.footholdLines ?? []) {
    if (fhIsWall(fh)) continue;
    if (excludedFootholdId && String(fh.id) === String(excludedFootholdId)) continue;
    const gy = fhGroundAt(fh, x);
    if (gy === null || gy < minY - 1) continue;
    if (gy < bestY) {
      bestY = gy;
      best = { y: gy, line: fh };
    }
  }

  return best;
}

// (footholdLeft, footholdRight, isWallFoothold aliases removed — use fhLeft, fhRight, fhIsWall)

function rangesOverlap(a1, a2, b1, b2) {
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const minB = Math.min(b1, b2);
  const maxB = Math.max(b1, b2);
  return maxA >= minB && maxB >= minA;
}

function isBlockingWall(foothold, minY, maxY) {
  if (!foothold || !fhIsWall(foothold)) return false;
  return rangesOverlap(foothold.y1, foothold.y2, minY, maxY);
}

// Check if a tall wall column (pre-indexed, >= 500px total height) has any
// segment blocking the given Y range. Returns false for short/unindexed columns.
function isTallWallColumnBlocking(map, wallX, minY, maxY) {
  const col = map.wallColumnsByX?.get(Math.round(wallX));
  if (!col) return false;
  const segments = col.segments;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.y2 >= minY && seg.y1 <= maxY) return true;
  }
  return false;
}

// C++ FootholdTree::get_wall parity with tall-wall extension.
// Standard path: check prev/prevprev (left) or next/nextnext (right) with
// the 50px Y window [nextY-50, nextY-1].
// Extension: when a chain-discovered wall is part of a tall column (>= 500px),
// check the full column so players can't jump through boundary walls.
function getWallX(map, current, left, nextY) {
  const minY = Math.floor(nextY) - 50;
  const maxY = Math.floor(nextY) - 1;

  if (left) {
    const prev = findFootholdById(map, current.prevId);
    if (prev && fhIsWall(prev)) {
      if (isBlockingWall(prev, minY, maxY) || isTallWallColumnBlocking(map, prev.x1, minY, maxY)) {
        return fhLeft(current);
      }
    }

    const prevPrev = prev ? findFootholdById(map, prev.prevId) : null;
    if (prevPrev && fhIsWall(prevPrev)) {
      if (isBlockingWall(prevPrev, minY, maxY) || isTallWallColumnBlocking(map, prevPrev.x1, minY, maxY)) {
        return fhLeft(prev);
      }
    }

    return map.walls?.left ?? map.bounds.minX;
  }

  const next = findFootholdById(map, current.nextId);
  if (next && fhIsWall(next)) {
    if (isBlockingWall(next, minY, maxY) || isTallWallColumnBlocking(map, next.x1, minY, maxY)) {
      return fhRight(current);
    }
  }

  const nextNext = next ? findFootholdById(map, next.nextId) : null;
  if (nextNext && fhIsWall(nextNext)) {
    if (isBlockingWall(nextNext, minY, maxY) || isTallWallColumnBlocking(map, nextNext.x1, minY, maxY)) {
      return fhRight(next);
    }
  }

  return map.walls?.right ?? map.bounds.maxX;
}

function sideWallBounds(map) {
  return {
    // Prefer C++-style inset walls (left+25/right-25). Raw foothold extrema are fallback only.
    left: safeNumber(map.walls?.left, map.footholdBounds?.minX ?? map.bounds.minX),
    right: safeNumber(map.walls?.right, map.footholdBounds?.maxX ?? map.bounds.maxX),
  };
}

function clampXToSideWalls(x, map) {
  const walls = sideWallBounds(map);
  return Math.max(walls.left, Math.min(walls.right, x));
}

function resolveWallCollision(oldX, newX, nextY, map, footholdId) {
  if (newX === oldX) return clampXToSideWalls(newX, map);

  const left = newX < oldX;
  const current = findFootholdById(map, footholdId);

  let resolvedX = newX;

  if (current) {
    const wallX = getWallX(map, current, left, nextY);
    const collision = left ? oldX >= wallX && resolvedX <= wallX : oldX <= wallX && resolvedX >= wallX;
    if (collision) resolvedX = wallX;
  } else {
    const walls = sideWallBounds(map);
    const wallX = left ? walls.left : walls.right;
    const collision = left ? oldX >= wallX && resolvedX <= wallX : oldX <= wallX && resolvedX >= wallX;
    if (collision) resolvedX = wallX;
  }

  return clampXToSideWalls(resolvedX, map);
}

// (footholdSlope alias removed — use fhSlope)

function playerWalkforce() {
  return 0.05 + 0.11 * runtime.player.stats.speed / 100;
}

function playerJumpforce() {
  return 1.0 + 3.5 * runtime.player.stats.jump / 100;
}

function playerClimbforce() {
  return runtime.player.stats.speed / 100;
}

function applyGroundPhysics(hspeedTick, hforceTick, slope, numTicks) {
  let hacc = hforceTick;

  if (hacc === 0 && Math.abs(hspeedTick) < PHYS_HSPEED_DEADZONE) {
    return 0;
  }

  const inertia = hspeedTick / PHYS_GROUNDSLIP;
  const slopef = Math.max(-0.5, Math.min(0.5, slope));
  hacc -= (PHYS_FRICTION + PHYS_SLOPEFACTOR * (1 + slopef * -inertia)) * inertia;

  return hspeedTick + hacc * numTicks;
}

/** Unclamped Y interpolation (allows extrapolation). For walls, returns min Y. */
function groundYOnFoothold(foothold, x) {
  const dx = foothold.x2 - foothold.x1;
  if (Math.abs(dx) < 0.01) return Math.min(foothold.y1, foothold.y2);
  const t = (x - foothold.x1) / dx;
  return foothold.y1 + (foothold.y2 - foothold.y1) * t;
}

function resolveFootholdForX(map, foothold, x) {
  let current = foothold;
  let resolvedX = x;

  for (let step = 0; step < 8 && current; step += 1) {
    const left = fhLeft(current);
    const right = fhRight(current);

    if (Math.floor(resolvedX) > right) {
      const next = findFootholdById(map, current.nextId);
      if (!next || fhIsWall(next)) {
        return { foothold: null, x: resolvedX };
      }

      current = next;
      continue;
    }

    if (Math.ceil(resolvedX) < left) {
      const prev = findFootholdById(map, current.prevId);
      if (!prev || fhIsWall(prev)) {
        return { foothold: null, x: resolvedX };
      }

      current = prev;
      continue;
    }

    return { foothold: current, x: resolvedX };
  }

  return { foothold: current, x: resolvedX };
}

function climbDownAttachTolerancePx() {
  return Math.max(20, Math.round(runtime.standardCharacterWidth * 0.33));
}

function ladderInRange(rope, x, y, upwards) {
  const y1 = Math.min(rope.y1, rope.y2);
  const y2 = Math.max(rope.y1, rope.y2);
  const yProbe = upwards ? y - 5 : y + 5;

  const climbDownTolerance = climbDownAttachTolerancePx();
  const horizontalMargin = upwards ? 12 : climbDownTolerance;
  const topBuffer = upwards ? 0 : climbDownTolerance;
  const bottomBuffer = upwards ? 0 : Math.max(12, Math.round(climbDownTolerance * 0.5));

  return (
    Math.abs(x - rope.x) <= horizontalMargin &&
    yProbe >= y1 - topBuffer &&
    yProbe <= y2 + bottomBuffer
  );
}

function ladderFellOff(rope, y, downwards) {
  const y1 = Math.min(rope.y1, rope.y2);
  const y2 = Math.max(rope.y1, rope.y2);
  const dy = downwards ? y + 5 : y - 5;

  return dy > y2 || y + 5 < y1;
}

function findAttachableRope(map, x, y, upwards) {
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const rope of map.ladderRopes ?? []) {
    if (!ladderInRange(rope, x, y, upwards)) continue;

    const dist = Math.abs(x - rope.x);
    if (dist < bestDist) {
      best = rope;
      bestDist = dist;
    }
  }

  return best;
}

function climbSnapX(rope) {
  return rope.x - 1;
}

function updatePlayer(dt) {
  if (!runtime.map) return;

  const player = runtime.player;
  const map = runtime.map;

  player.prevX = player.x;
  player.prevY = player.y;

  if (runtime.debug.mouseFly) {
    player.x = runtime.mouseWorld.x;
    player.y = runtime.mouseWorld.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.onRope = false;
    player.action = "stand1";
    return;
  }

  // C++ Player::can_attack blocks movement while attacking — freeze all input
  const isAttacking = player.attacking;
  const move = isAttacking ? 0 : (runtime.input.left ? -1 : 0) + (runtime.input.right ? 1 : 0);
  const climbDir = isAttacking ? 0 : (runtime.input.up ? -1 : 0) + (runtime.input.down ? 1 : 0);
  const jumpQueued = isAttacking ? false : runtime.input.jumpQueued;
  const jumpRequested = (runtime.npcDialogue.active || isAttacking) ? false : (jumpQueued || runtime.input.jumpHeld);
  runtime.input.jumpQueued = isAttacking ? runtime.input.jumpQueued : false;

  const nowMs = performance.now();
  const climbOnCooldown = nowMs < player.climbCooldownUntil;
  const reattachLocked = nowMs < player.reattachLockUntil;
  const wantsClimbUp = runtime.input.up && !runtime.input.down;
  const wantsClimbDown = runtime.input.down;

  const downAttachCandidate = wantsClimbDown
    ? findAttachableRope(map, player.x, player.y, false)
    : null;
  const prioritizeDownAttach = !!downAttachCandidate && wantsClimbDown && player.onGround;

  // Auto-stand from chair on any movement input
  if (player.chairId && (move !== 0 || jumpRequested || climbDir !== 0)) {
    standUpFromChair();
  }

  const crouchRequested = runtime.input.down && player.onGround && !player.climbing && !prioritizeDownAttach;
  const downJumpMovementLocked = player.downJumpControlLock && !player.onGround;
  const npcDialogueLock = runtime.npcDialogue.active;
  const effectiveMove = crouchRequested || downJumpMovementLocked || npcDialogueLock ? 0 : move;

  if (!player.climbing && effectiveMove !== 0) {
    player.facing = effectiveMove > 0 ? 1 : -1;
  }

  const allowClimbAttachNow = !climbOnCooldown || prioritizeDownAttach;
  const knockbackLocked = nowMs < player.knockbackClimbLockUntil;
  if (!player.climbing && allowClimbAttachNow && !knockbackLocked) {
    const rope = wantsClimbUp
      ? findAttachableRope(map, player.x, player.y, true)
      : wantsClimbDown
        ? downAttachCandidate
        : null;

    const blockedByReattachLock =
      !!rope &&
      reattachLocked &&
      !prioritizeDownAttach &&
      player.reattachLockRopeKey !== null &&
      rope.key === player.reattachLockRopeKey;

    if (rope && !blockedByReattachLock) {
      player.climbing = true;
      player.climbRope = rope;
      player.climbAttachTime = nowMs;
      player.x = climbSnapX(rope);
      player.vx = 0;
      player.vy = 0;
      player.onGround = false;
      player.footholdId = null;
    }
  }

  if (player.climbing && player.climbRope) {
    const climbActionReady = nowMs >= player.climbAttachTime + PHYS_CLIMB_ACTION_DELAY_MS;
    const sideJumpRequested = jumpRequested && move !== 0 && climbActionReady;

    player.facing = -1;

    if (sideJumpRequested) {
      const detachedRopeKey = player.climbRope?.key ?? null;

      player.climbing = false;
      player.climbRope = null;
      player.vy = -(playerJumpforce() / PHYS_ROPE_JUMP_VDIV) * PHYS_TPS;
      player.vx = move * playerWalkforce() * PHYS_ROPE_JUMP_HMULT * PHYS_TPS;
      player.onGround = false;
      player.footholdId = null;
      player.downJumpIgnoreFootholdId = null;
      player.downJumpIgnoreUntil = 0;
      player.downJumpControlLock = false;
      player.downJumpTargetFootholdId = null;
      player.reattachLockRopeKey = detachedRopeKey;
      player.reattachLockUntil = nowMs + 200;
      player.climbCooldownUntil = nowMs + 400;
      playSfx("Game", "Jump");
    } else {
      const rope = player.climbRope;
      const climbSpeed = playerClimbforce() * PHYS_TPS;

      const ropeTopY = Math.min(rope.y1, rope.y2);
      const ropeBottomY = Math.max(rope.y1, rope.y2);
      const atTop = player.y <= ropeTopY;
      const atBottom = player.y >= ropeBottomY;
      const movingUp = runtime.input.up && !runtime.input.down && !atTop;
      const movingDown = runtime.input.down && !runtime.input.up && !atBottom;

      player.x = climbSnapX(rope);
      player.y += (movingDown ? 1 : movingUp ? -1 : 0) * climbSpeed * dt;
      player.vx = 0;
      player.vy = movingDown ? climbSpeed : movingUp ? -climbSpeed : 0;
      player.onGround = false;

      // Check for exit at top: when at top and pressing up, snap to platform
      const wantsUp = runtime.input.up && !runtime.input.down;
      if (atTop && wantsUp) {
        const topFh = findFootholdAtXNearY(map, player.x, ropeTopY, 24);
        if (topFh && !fhIsWall(topFh.line)) {
          player.climbing = false;
          player.climbRope = null;
          player.downJumpIgnoreFootholdId = null;
          player.downJumpIgnoreUntil = 0;
          player.downJumpControlLock = false;
          player.downJumpTargetFootholdId = null;
          player.reattachLockRopeKey = rope.key ?? null;
          player.reattachLockUntil = nowMs + 200;
          player.climbCooldownUntil = nowMs + 400;
          player.y = topFh.y;
          player.vx = 0;
          player.vy = 0;
          player.onGround = true;
          player.footholdId = topFh.line.id;
          player.footholdLayer = topFh.line.layer;
        }
      }

      // Check for exit at bottom: when at bottom and pressing down, snap to platform
      const wantsDown = runtime.input.down && !runtime.input.up;
      if (atBottom && wantsDown) {
        const bottomFh = findFootholdAtXNearY(map, player.x, ropeBottomY, 24);
        if (bottomFh && !fhIsWall(bottomFh.line)) {
          player.climbing = false;
          player.climbRope = null;
          player.downJumpIgnoreFootholdId = null;
          player.downJumpIgnoreUntil = 0;
          player.downJumpControlLock = false;
          player.downJumpTargetFootholdId = null;
          player.reattachLockRopeKey = rope.key ?? null;
          player.reattachLockUntil = nowMs + 200;
          player.climbCooldownUntil = nowMs + 400;
          player.y = bottomFh.y;
          player.vx = 0;
          player.vy = 0;
          player.onGround = true;
          player.footholdId = bottomFh.line.id;
          player.footholdLayer = bottomFh.line.layer;
        }
      }

      if (ladderFellOff(rope, player.y, movingDown)) {
        const ropeTopY2 = Math.min(rope.y1, rope.y2);
        const ropeBottomY2 = Math.max(rope.y1, rope.y2);
        const exitedFromTop = !movingDown && player.y + 5 < ropeTopY2;
        const exitedFromBottom = movingDown && player.y > ropeBottomY2;

        if (exitedFromTop) {
          // Past top — clamp at rope top, stay climbing
          player.y = ropeTopY2;
          player.vy = 0;
        } else if (exitedFromBottom) {
          // Fell off bottom — detach and drop
          player.climbing = false;
          player.climbRope = null;
          player.reattachLockRopeKey = rope.key ?? null;
          player.reattachLockUntil = nowMs + 200;
          player.climbCooldownUntil = nowMs + 400;
          player.onGround = false;
          player.footholdId = null;
        }
      }
    }
  }

  if (!player.climbing) {
    const numTicks = dt * PHYS_TPS;

    const currentFoothold =
      findFootholdById(map, player.footholdId) ??
      findFootholdBelow(map, player.x, player.y)?.line;

    const slope = currentFoothold && !fhIsWall(currentFoothold)
      ? fhSlope(currentFoothold)
      : 0;

    if (player.onGround) {
      const hforceTick = effectiveMove * playerWalkforce();
      let hspeedTick = player.vx / PHYS_TPS;

      hspeedTick = applyGroundPhysics(hspeedTick, hforceTick, slope, numTicks);

      player.vx = hspeedTick * PHYS_TPS;
      player.vy = 0;

      if (jumpRequested) {
        const footholdGround =
          currentFoothold && !fhIsWall(currentFoothold)
            ? groundYOnFoothold(currentFoothold, player.x)
            : player.y;

        const downJumpRequested = runtime.input.down;

        const belowFoothold = downJumpRequested
          ? findFootholdBelow(map, player.x, footholdGround + 1, currentFoothold?.id ?? null)
          : null;

        const canDownJump =
          !!currentFoothold &&
          !!belowFoothold &&
          (belowFoothold.y - footholdGround) < 600;

        if (downJumpRequested && canDownJump) {
          player.y = footholdGround + 1;
          player.vx = 0;
          player.vy = -playerJumpforce() * PHYS_TPS * 0.35;
          player.onGround = false;
          player.downJumpIgnoreFootholdId = currentFoothold.id;
          player.downJumpIgnoreUntil = nowMs + 260;
          player.downJumpControlLock = true;
          player.downJumpTargetFootholdId = belowFoothold.line.id;
          player.footholdId = null;
          playSfx("Game", "Jump");
        } else if (!downJumpRequested) {
          player.vy = -playerJumpforce() * PHYS_TPS;
          player.onGround = false;
          player.downJumpIgnoreFootholdId = null;
          player.downJumpIgnoreUntil = 0;
          player.downJumpControlLock = false;
          player.downJumpTargetFootholdId = null;
          player.footholdId = null;
          playSfx("Game", "Jump");
        }
      }
    }

    if (!player.onGround) {
      let hspeedTick = player.vx / PHYS_TPS;
      let vspeedTick = player.vy / PHYS_TPS;

      if (map.swim && !player.climbing) {
        // ── Water environment physics ──
        // Based on C++ move_swimming with tuned constants:
        // - Higher horizontal friction (SWIM_HFRICTION=0.14) for sluggish side movement
        // - Reduced horizontal force (SWIM_HFORCE=0.12) vs normal flyforce
        // - SWIMGRAVFORCE=0.03 gently pulls player down
        // - Space/UP = discrete swim-jump impulse (55% of normal jump force)
        //   Player can jump repeatedly to bob upward against gravity
        player.swimming = true;

        // Swim-jump: fires continuously while Space is held — player can
        // jump upward as many times as they want.
        // Skip if player is in a down-jump (don't override the drop velocity).
        if (jumpRequested && !player.downJumpControlLock) {
          vspeedTick = -playerJumpforce() * PHYS_SWIM_JUMP_MULT;
        }

        // Horizontal and vertical directional force (reduced for water)
        let hforce = 0;
        let vforce = 0;
        if (runtime.input.left && !runtime.input.right) hforce = -PHYS_SWIM_HFORCE;
        else if (runtime.input.right && !runtime.input.left) hforce = PHYS_SWIM_HFORCE;
        if (runtime.input.up && !runtime.input.down) vforce = -PHYS_FLYFORCE;
        else if (runtime.input.down && !runtime.input.up) vforce = PHYS_SWIM_HFORCE;

        // Per-tick integration: friction + gravity + directional force
        for (let t = 0; t < numTicks; t++) {
          let hacc = hforce;
          let vacc = vforce;
          hacc -= PHYS_SWIM_HFRICTION * hspeedTick;
          vacc -= PHYS_SWIMFRICTION * vspeedTick;
          vacc += PHYS_SWIMGRAVFORCE;
          hspeedTick += hacc;
          vspeedTick += vacc;
        }

        // Deadzone: zero speed when no force and speed near zero
        if (hforce === 0 && Math.abs(hspeedTick) < 0.1) hspeedTick = 0;
        if (vforce === 0 && Math.abs(vspeedTick) < 0.1) vspeedTick = 0;

        player.vx = hspeedTick * PHYS_TPS;
        player.vy = vspeedTick * PHYS_TPS;
      } else {
        // ── Normal airborne: C++ move_normal (not on ground) ──
        // Original pre-swim physics restored exactly.
        player.swimming = false;

        vspeedTick += PHYS_GRAVFORCE * numTicks;

        if (effectiveMove < 0 && hspeedTick > 0) {
          hspeedTick -= PHYS_FALL_BRAKE * numTicks;
        } else if (effectiveMove > 0 && hspeedTick < 0) {
          hspeedTick += PHYS_FALL_BRAKE * numTicks;
        }

        player.vx = hspeedTick * PHYS_TPS;
        player.vy = Math.min(vspeedTick * PHYS_TPS, PHYS_FALL_SPEED_CAP);
      }
    } else {
      player.swimming = false;
    }

    let horizontalApplied = false;

    if (player.onGround && (!currentFoothold || fhIsWall(currentFoothold))) {
      player.onGround = false;
      player.footholdId = null;
    }

    if (player.onGround && currentFoothold && !fhIsWall(currentFoothold)) {
      const oldX = player.x;
      let nextX = oldX + player.vx * dt;
      nextX = resolveWallCollision(oldX, nextX, player.y, map, currentFoothold.id);
      horizontalApplied = true;

      const footholdResolution = resolveFootholdForX(map, currentFoothold, nextX);
      const nextFoothold = footholdResolution?.foothold ?? null;
      const resolvedX = footholdResolution?.x ?? nextX;

      if (nextFoothold && !fhIsWall(nextFoothold)) {
        player.x = resolvedX;
        player.y = groundYOnFoothold(nextFoothold, resolvedX);
        player.vy = 0;
        player.onGround = true;
        player.footholdId = nextFoothold.id;
        player.footholdLayer = nextFoothold.layer;
      } else {
        player.x = resolvedX;
        player.onGround = false;
        player.footholdId = null;
        player.vy = 0;
      }
    }

    if (!player.onGround) {
      const oldX = player.x;
      const oldY = player.y;

      const nextY = oldY + player.vy * dt;

      if (!horizontalApplied) {
        const wallFoothold =
          findFootholdById(map, player.footholdId) ??
          findFootholdBelow(map, oldX, oldY)?.line;

        player.x += player.vx * dt;
        player.x = resolveWallCollision(oldX, player.x, nextY, map, wallFoothold?.id ?? null);
      }

      player.y = nextY;

      const ignoredFootholdId =
        nowMs < player.downJumpIgnoreUntil
          ? player.downJumpIgnoreFootholdId
          : null;

      const landing =
        player.vy >= 0
          ? findGroundLanding(oldX, oldY, player.x, player.y, map, ignoredFootholdId)
          : null;
      if (landing) {
        const fhx = landing.line.x2 - landing.line.x1;
        const fhy = landing.line.y2 - landing.line.y1;
        const fhLenSq = fhx * fhx + fhy * fhy;

        if (fhLenSq > 0.01 && Math.abs(fhx) > 0.01) {
          const cappedVy = Math.min(player.vy, PHYS_MAX_LAND_SPEED);
          const dot = (player.vx * fhx + cappedVy * fhy) / fhLenSq;
          player.vx = dot * fhx;
        }

        player.y = landing.y;
        player.footholdId = landing.line.id;
        player.footholdLayer = landing.line.layer;
        player.vy = 0;
        player.onGround = true;
        player.downJumpIgnoreFootholdId = null;
        player.downJumpIgnoreUntil = 0;
        player.downJumpControlLock = false;
        player.downJumpTargetFootholdId = null;

        // Fall damage: if fell more than threshold, apply % HP damage + full knockback
        const fallDist = player.y - player.fallStartY;
        if (fallDist > FALL_DAMAGE_THRESHOLD) {
          const ticks = Math.floor((fallDist - FALL_DAMAGE_THRESHOLD) / FALL_DAMAGE_THRESHOLD) + 1;
          const damage = Math.max(1, Math.round(player.maxHp * FALL_DAMAGE_PERCENT * ticks));
          player.hp = Math.max(1, player.hp - damage);
          player.fallStartY = player.y; // reset so bounce landing doesn't re-trigger
          // Full knockback + blink + damage number (same as mob/trap hit)
          const nowMs = performance.now();
          const hitFromX = player.x + player.facing * 10;
          triggerPlayerHitVisuals(nowMs);
          spawnDamageNumber(player.x - 10, player.y, damage, false);
          player.trapInvincibleUntil = nowMs + TRAP_HIT_INVINCIBILITY_MS;
          player.lastTrapHitAt = nowMs;
          player.lastTrapHitDamage = damage;
          // C++ knockback: hspeed = ±1.5, vforce -= 3.5
          const hitFromLeft = hitFromX > player.x;
          player.vx = (hitFromLeft ? -PLAYER_KB_HSPEED : PLAYER_KB_HSPEED) * PHYS_TPS;
          player.vy = -PLAYER_KB_VFORCE * PHYS_TPS;
          player.onGround = false;
          player.footholdId = null;
          player.knockbackClimbLockUntil = nowMs + 600;
        }
      } else {
        player.onGround = false;
        player.footholdId = null;
      }
    }
  }

  // Track fall start for fall damage — use the highest point (lowest Y)
  // during the current airborne period as the reference
  if (player.onGround || player.climbing) {
    player.fallStartY = player.y;
  } else {
    player.fallStartY = Math.min(player.fallStartY, player.y);
  }

  const unclampedX = player.x;
  player.x = clampXToSideWalls(player.x, map);
  if (player.x !== unclampedX) {
    if (player.x < unclampedX && player.vx > 0) player.vx = 0;
    if (player.x > unclampedX && player.vx < 0) player.vx = 0;
  }

  player.x = Math.max(map.bounds.minX - 40, Math.min(map.bounds.maxX + 40, player.x));
  if (player.y > map.bounds.maxY + 400) {
    const spawn = map.portalEntries.find((portal) => portal.type === 0) ?? map.portalEntries[0];
    player.x = spawn ? spawn.x : 0;
    player.y = spawn ? spawn.y : 0;
    player.prevX = player.x;
    player.prevY = player.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.climbing = false;
    player.climbRope = null;
    player.climbCooldownUntil = 0;
    player.reattachLockUntil = 0;
    player.reattachLockRopeKey = null;
    player.downJumpIgnoreFootholdId = null;
    player.downJumpIgnoreUntil = 0;
    player.downJumpControlLock = false;
    player.downJumpTargetFootholdId = null;
    player.footholdId = null;
    player.trapInvincibleUntil = 0;
    player.fallStartY = player.y;
  }

  const crouchActive =
    runtime.input.down &&
    player.onGround &&
    !player.climbing;

  const crouchAction = getCharacterActionFrames("prone").length > 0 ? "prone" : "sit";

  let climbAction = "ladder";
  if (player.climbRope && !player.climbRope.ladder && getCharacterActionFrames("rope").length > 0) {
    climbAction = "rope";
  }

  // Update attack animation (handles its own timer + termination)
  updatePlayerAttack(dt);

  // Attack stance overrides normal action — character must finish attack animation
  if (player.attacking && player.attackStance) {
    const attackAction = player.attackStance;
    if (player.action !== attackAction) {
      player.action = attackAction;
    }
    player.frameIndex = player.attackFrameIndex;
  } else if (!player.chairId) {
    const nextAction = player.climbing
      ? climbAction
      : crouchActive
        ? crouchAction
        : player.swimming
          ? "fly"
          : !player.onGround
            ? "jump"
            : player.onGround && Math.abs(player.vx) > 5
              ? "walk1"
              : "stand1";

    if (nextAction !== player.action) {
      player.action = nextAction;
      player.frameIndex = 0;
      player.frameTimer = 0;
    }
  }

  if (!player.attacking) {
    const frameData = getCharacterFrameData(player.action, player.frameIndex);
    const delayMs = frameData?.delay ?? 180;
    const freezeClimbFrame = player.climbing && climbDir === 0;

    if (!freezeClimbFrame) {
      player.frameTimer += dt * 1000;
      if (player.frameTimer >= delayMs) {
        player.frameTimer = 0;
        const frames = getCharacterActionFrames(player.action);
        if (frames.length > 0) {
          player.frameIndex = (player.frameIndex + 1) % frames.length;
        }
      }
    }
  }
}

function updateCamera(dt) {
  if (!runtime.map) return;

  if (runtime.portalScroll.active) {
    const scroll = runtime.portalScroll;
    scroll.elapsedMs += dt * 1000;

    // Update target to player's current position (player may settle during scroll)
    scroll.targetX = clampCameraXToMapBounds(runtime.map, runtime.player.x);
    scroll.targetY = clampCameraYToMapBounds(runtime.map, runtime.player.y - cameraHeightBias());

    const duration = Math.max(1, scroll.durationMs);
    const t = Math.max(0, Math.min(1, scroll.elapsedMs / duration));
    const easedT = portalMomentumEase(t);

    runtime.camera.x = scroll.startX + (scroll.targetX - scroll.startX) * easedT;
    runtime.camera.y = scroll.startY + (scroll.targetY - scroll.startY) * easedT;
    runtime.camera.x = clampCameraXToMapBounds(runtime.map, runtime.camera.x);
    runtime.camera.y = clampCameraYToMapBounds(runtime.map, runtime.camera.y);

    if (t >= 1) {
      // Snap to player's current position (may have shifted during scroll)
      runtime.camera.x = clampCameraXToMapBounds(runtime.map, runtime.player.x);
      runtime.camera.y = clampCameraYToMapBounds(runtime.map, runtime.player.y - cameraHeightBias());
      scroll.active = false;
    }

    return;
  }

  const targetX = runtime.player.x;
  const targetY = runtime.player.y - cameraHeightBias();
  const smoothing = Math.min(1, dt * 8);

  runtime.camera.x += (targetX - runtime.camera.x) * smoothing;
  runtime.camera.y += (targetY - runtime.camera.y) * smoothing;
  runtime.camera.x = clampCameraXToMapBounds(runtime.map, runtime.camera.x);
  runtime.camera.y = clampCameraYToMapBounds(runtime.map, runtime.camera.y);
}

function drawScreenImage(image, x, y, flipped) {
  const drawX = Math.round(x);
  const drawY = Math.round(y);

  if (!flipped) {
    ctx.drawImage(image, drawX, drawY);
    runtime.perf.drawCalls += 1;
    return;
  }

  ctx.save();
  ctx.translate(drawX + image.width, drawY);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0);
  runtime.perf.drawCalls += 1;
  ctx.restore();
}

/**
 * Black-fill areas outside VR bounds when the map is smaller than the viewport.
 * C++ parity: camera locks to top/left edge when map is shorter/narrower,
 * and the overflow area (bottom/right) is beyond the designed scene.
 */
function drawVRBoundsOverflowMask() {
  if (!runtime.map) return;

  const vw = gameViewWidth();
  const vh = gameViewHeight();
  const { left: vrL, right: vrR, top: vrT, bottom: vrB } = mapVisibleBounds(runtime.map);
  const cam = runtime.camera;

  // Convert VR edges to screen coordinates
  const vrScreenLeft = Math.round(vrL - cam.x + vw / 2);
  const vrScreenRight = Math.round(vrR - cam.x + vw / 2);
  const vrScreenTop = Math.round(vrT - cam.y + vh / 2);
  const vrScreenBottom = Math.round(vrB - cam.y + vh / 2);

  const needsMask =
    vrScreenLeft > 0 || vrScreenRight < vw ||
    vrScreenTop > 0 || vrScreenBottom < vh;

  if (!needsMask) return;

  ctx.save();
  ctx.fillStyle = "#000";

  // Left overflow
  if (vrScreenLeft > 0) ctx.fillRect(0, 0, vrScreenLeft, vh);
  // Right overflow
  if (vrScreenRight < vw) ctx.fillRect(vrScreenRight, 0, vw - vrScreenRight, vh);
  // Top overflow (between left/right masks)
  if (vrScreenTop > 0) {
    const x0 = Math.max(0, vrScreenLeft);
    const x1 = Math.min(vw, vrScreenRight);
    ctx.fillRect(x0, 0, x1 - x0, vrScreenTop);
  }
  // Bottom overflow (between left/right masks)
  if (vrScreenBottom < vh) {
    const x0 = Math.max(0, vrScreenLeft);
    const x1 = Math.min(vw, vrScreenRight);
    ctx.fillRect(x0, vrScreenBottom, x1 - x0, vh - vrScreenBottom);
  }

  ctx.restore();
}

function drawBackgroundLayer(frontFlag) {
  if (!runtime.map) return;

  const canvasW = canvasEl.width;
  const canvasH = canvasEl.height;
  // Use game viewport for parallax math; actual canvas for fill/tiling coverage.
  const gvw = gameViewWidth();
  const gvh = gameViewHeight();
  const screenHalfW = gvw / 2;
  const screenHalfH = gvh / 2;
  const camX = runtime.camera.x;
  const camY = runtime.camera.y;

  // C++ parity: map camera is represented as a view translation.
  // viewX/viewY track camera every frame, matching C++ MapBackgrounds::draw.
  const viewX = screenHalfW - camX;
  const viewY = screenHalfH - camY;

  if (frontFlag === 0 && runtime.map.blackBackground) {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.restore();
  }

  for (const background of runtime.map.backgrounds) {
    if ((background.front ? 1 : 0) !== frontFlag) continue;

    // Determine frame key for animated backgrounds
    let frameKey = background.key;
    if (background.frameDelays && background.frameCount > 1) {
      const state = bgAnimStates.get(background.index);
      if (state) {
        frameKey = `${background.baseKey}:f${state.frameIndex}`;
      }
    }

    let image = getImageByKey(frameKey);
    let meta = getMetaByKey(frameKey);

    if (!image || !meta) {
      image = image ?? getImageByKey(background.key);
      meta = meta ?? getMetaByKey(background.key);
    }

    if (!meta) {
      requestBackgroundMeta(background);
      continue;
    }

    if (!image) continue;

    const origin = meta.vectors.origin ?? { x: 0, y: 0 };
    const width = Math.max(1, image.width || meta.width || 1);
    const height = Math.max(1, image.height || meta.height || 1);
    const cx = background.cx > 0 ? background.cx : width;
    const cy = background.cy > 0 ? background.cy : height;

    const hMobile = background.type === 4 || background.type === 6;
    const vMobile = background.type === 5 || background.type === 7;

    let motionState = bgMotionStates.get(background.index);
    if (!motionState) {
      motionState = { x: background.x, y: background.y };
      bgMotionStates.set(background.index, motionState);
    }

    let x;
    if (hMobile) {
      x = motionState.x + viewX;
    } else {
      const shiftX = (background.rx * (screenHalfW - viewX)) / 100 + screenHalfW;
      x = background.x + shiftX;
    }

    let y;
    if (vMobile) {
      y = motionState.y + viewY;
    } else {
      const shiftY = (background.ry * (screenHalfH - viewY)) / 100 + screenHalfH;
      y = background.y + shiftY;
    }

    // C++ tiling: htile/vtile count-based, matching MapBackgrounds.cpp
    const tileX = background.type === 1 || background.type === 3 || background.type === 4 || background.type === 6 || background.type === 7;
    const tileY = background.type === 2 || background.type === 3 || background.type === 5 || background.type === 6 || background.type === 7;

    // C++ alignment performs wrapping before sprite-origin offset.
    const htile = tileX ? Math.floor(canvasW / cx) + 3 : 1;
    const vtile = tileY ? Math.floor(canvasH / cy) + 3 : 1;

    if (htile > 1) {
      while (x > 0) x -= cx;
      while (x < -cx) x += cx;
    }
    if (vtile > 1) {
      while (y > 0) y -= cy;
      while (y < -cy) y += cy;
    }

    const ix = Math.round(x);
    const iy = Math.round(y);
    const tw = cx * htile;
    const th = cy * vtile;
    const originOffsetX = background.flipped ? width - origin.x : origin.x;
    const originOffsetY = origin.y;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, background.alpha));

    for (let tx = 0; tx < tw; tx += cx) {
      for (let ty = 0; ty < th; ty += cy) {
        drawScreenImage(image, ix + tx - originOffsetX, iy + ty - originOffsetY, background.flipped);
      }
    }

    ctx.restore();
  }
}

// Object animation states: keyed by "layer:objId" -> { frameIndex, timerMs }
const objectAnimStates = new Map();
// Background animation states: keyed by bg index -> { frameIndex, timerMs }
const bgAnimStates = new Map();
// Background motion states: keyed by bg index -> { x, y }
const bgMotionStates = new Map();
const portalFrameWarmupRequested = new Set();

function updateBackgroundAnimations(dtMs) {
  if (!runtime.map) return;

  for (const bg of runtime.map.backgrounds) {
    let motionState = bgMotionStates.get(bg.index);
    if (!motionState) {
      motionState = { x: bg.x, y: bg.y };
      bgMotionStates.set(bg.index, motionState);
    }

    const hMobile = bg.type === 4 || bg.type === 6;
    const vMobile = bg.type === 5 || bg.type === 7;
    if (hMobile) {
      motionState.x += (bg.rx * dtMs) / 128;
    } else {
      motionState.x = bg.x;
    }

    if (vMobile) {
      motionState.y += (bg.ry * dtMs) / 128;
    } else {
      motionState.y = bg.y;
    }

    if (!bg.frameDelays || bg.frameCount <= 1) continue;

    let state = bgAnimStates.get(bg.index);
    if (!state) {
      state = { frameIndex: 0, timerMs: 0 };
      bgAnimStates.set(bg.index, state);
    }

    state.timerMs += dtMs;
    const delay = bg.frameDelays[state.frameIndex % bg.frameDelays.length];
    if (state.timerMs >= delay) {
      state.timerMs -= delay;
      state.frameIndex = (state.frameIndex + 1) % bg.frameCount;
    }
  }
}

function updateObjectAnimations(dtMs) {
  if (!runtime.map) return;

  for (const layer of runtime.map.layers) {
    for (const obj of layer.objects) {
      if (!obj.frameDelays || obj.frameCount <= 1) continue;

      const stateKey = `${layer.layerIndex}:${obj.id}`;
      let state = objectAnimStates.get(stateKey);
      if (!state) {
        const startOpc = obj.frameOpacities?.[0]?.start ?? 255;
        state = { frameIndex: 0, timerMs: 0, opacity: startOpc };
        objectAnimStates.set(stateKey, state);
      }

      // Accumulate opacity per tick using current frame's rate of change.
      // For fade-in frames (a0=0): hold fully invisible for 2s before ramping,
      // creating a clear cooldown gap between cycles.
      const fi = state.frameIndex % obj.frameDelays.length;
      const frameDelay = obj.frameDelays[fi];
      const opc = obj.frameOpacities?.[fi];
      if (opc && frameDelay > 0) {
        const isFadeIn = opc.start === 0 && opc.end > 0;
        const holdMs = isFadeIn ? 2000 : 0;
        if (isFadeIn && state.timerMs < holdMs) {
          state.opacity = 0;
        } else {
          const rampDelay = Math.max(1, frameDelay - holdMs);
          const opcStep = dtMs * (opc.end - opc.start) / rampDelay;
          state.opacity += opcStep;
          if (state.opacity < 0) state.opacity = 0;
          else if (state.opacity > 255) state.opacity = 255;
        }
      }

      state.timerMs += dtMs;
      if (state.timerMs >= frameDelay) {
        state.timerMs -= frameDelay;
        state.frameIndex = (state.frameIndex + 1) % obj.frameCount;
        // Determine opacity for the new frame:
        // - start === 0: snap to 0 (cooldown gap before fade-in)
        // - start !== end (animated opacity): carry over for smooth transition
        // - start === end (no opacity animation): snap to start value
        //   (prevents carryover from a fading frame making static frames invisible)
        const nextOpc = obj.frameOpacities?.[state.frameIndex];
        if (nextOpc) {
          if (nextOpc.start === 0) {
            state.opacity = 0;
          } else if (nextOpc.start === nextOpc.end) {
            state.opacity = nextOpc.start;
          }
          // else: animated opacity — carry over smoothly
        }
      }
    }
  }
}

function objectMoveOffset(motion, nowMs) {
  const moveType = safeNumber(motion?.moveType, 0);
  const moveW = safeNumber(motion?.moveW, 0);
  const moveH = safeNumber(motion?.moveH, 0);
  const moveP = Math.max(1, safeNumber(motion?.moveP, Math.PI * 2 * 1000));
  if (moveType === 0) return { x: 0, y: 0 };

  const phase = (Math.PI * 2 * nowMs) / moveP;
  switch (moveType) {
    case 1:
      return { x: moveW * Math.sin(phase), y: 0 };
    case 2:
      return { x: 0, y: moveH * Math.sin(phase) };
    case 3:
      return { x: moveW * Math.cos(phase), y: moveH * Math.sin(phase) };
    default:
      return { x: 0, y: 0 };
  }
}

function normalizedRect(left, right, top, bottom) {
  return {
    left: Math.min(left, right),
    right: Math.max(left, right),
    top: Math.min(top, bottom),
    bottom: Math.max(top, bottom),
  };
}

function objectFrameOpacity(meta, state, obj) {
  if (!meta) return 1;

  // Use accumulated opacity from animation state (C++ Animation parity)
  if (state && typeof state.opacity === "number") {
    const alpha = state.opacity / 255;
    return Math.max(0, Math.min(1, alpha));
  }

  // Fallback for non-animated objects or before animation state is created
  const start = safeNumber(meta.opacityStart, 255);
  const end = safeNumber(meta.opacityEnd, start);
  if (start === 255 && end === 255) return 1;

  const frameDelay = obj?.frameDelays?.[state?.frameIndex ?? 0] ?? 0;
  const timer = safeNumber(state?.timerMs, 0);
  const t = frameDelay > 0 ? Math.max(0, Math.min(1, timer / frameDelay)) : 0;
  const alpha = (start + (end - start) * t) / 255;
  return Math.max(0, Math.min(1, alpha));
}

function rectsOverlap(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function playerTouchBoxMetrics(player) {
  const action = String(player?.action ?? "");
  const prone = !player.climbing && player.onGround && (action === "prone" || action === "proneStab" || action === "sit");

  return prone
    ? { halfWidth: PLAYER_TOUCH_HITBOX_PRONE_HALF_WIDTH, height: PLAYER_TOUCH_HITBOX_PRONE_HEIGHT }
    : { halfWidth: PLAYER_TOUCH_HITBOX_HALF_WIDTH, height: PLAYER_TOUCH_HITBOX_HEIGHT };
}

function playerTouchBounds(player) {
  const lastX = Number.isFinite(player.prevX) ? player.prevX : player.x;
  const lastY = Number.isFinite(player.prevY) ? player.prevY : player.y;
  const metrics = playerTouchBoxMetrics(player);

  return normalizedRect(
    Math.min(lastX, player.x) - metrics.halfWidth,
    Math.max(lastX, player.x) + metrics.halfWidth,
    Math.min(lastY, player.y) - metrics.height,
    Math.max(lastY, player.y),
  );
}

function trapWorldBounds(obj, meta, nowMs) {
  if (!obj || !meta) return null;

  const moveOffset = objectMoveOffset(obj.motion ?? meta, nowMs);
  const vectors = meta.vectors ?? {};
  const lt = vectors.lt;
  const rb = vectors.rb;

  if (lt && rb) {
    const ltX = safeNumber(lt.x, 0);
    const rbX = safeNumber(rb.x, 0);
    const leftOffsetX = obj.flipped ? -rbX : ltX;
    const rightOffsetX = obj.flipped ? -ltX : rbX;

    return normalizedRect(
      obj.x + moveOffset.x + leftOffsetX,
      obj.x + moveOffset.x + rightOffsetX,
      obj.y + moveOffset.y + safeNumber(lt.y, 0),
      obj.y + moveOffset.y + safeNumber(rb.y, 0),
    );
  }

  // Fallback to sprite dimensions for frames without lt/rb (e.g. laser
  // fade-in). Skip tiny frames (≤4px) like electric 1×1 cooldown blanks.
  // Skip invisible frames (opacityStart=0 on non-animated objects like stoneDM waiting state).
  const width = safeNumber(meta.width, 0);
  const height = safeNumber(meta.height, 0);
  if (width <= 4 || height <= 4) return null;
  if (safeNumber(meta.opacityStart, 255) === 0) return null;

  const origin = vectors.origin ?? { x: 0, y: 0 };
  const drawOriginX = obj.flipped ? width - safeNumber(origin.x, 0) : safeNumber(origin.x, 0);
  const left = obj.x - drawOriginX + moveOffset.x;
  const top = obj.y - safeNumber(origin.y, 0) + moveOffset.y;

  return normalizedRect(left, left + width, top, top + height);
}

function applyPlayerTouchHit(damage, sourceCenterX, nowMs) {
  const player = runtime.player;
  const resolvedDamage = Math.max(1, Math.round(safeNumber(damage, 1)));

  player.hp = Math.max(0, player.hp - resolvedDamage);
  player.trapInvincibleUntil = nowMs + TRAP_HIT_INVINCIBILITY_MS;
  player.lastTrapHitAt = nowMs;
  player.lastTrapHitDamage = resolvedDamage;

  triggerPlayerHitVisuals(nowMs);
  spawnDamageNumber(player.x - 10, player.y, resolvedDamage, false);

  {
    // Detach from rope/ladder on hit
    if (player.climbing) {
      player.climbing = false;
      player.climbRope = null;
    }

    // C++ Player::damage: hspeed = ±1.5, vforce -= 3.5 (per-tick units)
    // Convert to px/s for our physics: multiply by PHYS_TPS
    const hitFromLeft = sourceCenterX > player.x;
    player.vx = (hitFromLeft ? -PLAYER_KB_HSPEED : PLAYER_KB_HSPEED) * PHYS_TPS;
    player.vy = -PLAYER_KB_VFORCE * PHYS_TPS;
    player.onGround = false;
    player.footholdId = null;
    player.downJumpIgnoreFootholdId = null;
    player.downJumpIgnoreUntil = 0;
    player.knockbackClimbLockUntil = nowMs + 600;
    player.downJumpControlLock = false;
    player.downJumpTargetFootholdId = null;
  }

  if (runtime.map) {
    player.x = clampXToSideWalls(player.x, runtime.map);
  }
}

function applyTrapHit(damage, trapBounds, nowMs) {
  const trapCenterX = (trapBounds.left + trapBounds.right) * 0.5;
  applyPlayerTouchHit(damage, trapCenterX, nowMs);
}

function mobFrameWorldBounds(life, state, anim) {
  const stance = anim?.stances?.[state.stance] ?? anim?.stances?.stand;
  if (!stance || stance.frames.length === 0) return null;

  const frame = stance.frames[state.frameIndex % stance.frames.length];
  if (!frame) return null;

  const worldX = state.phobj ? state.phobj.x : life.x;
  const worldY = state.phobj ? state.phobj.y : life.cy;
  const width = Math.max(1, safeNumber(frame.width, 1));
  const height = Math.max(1, safeNumber(frame.height, 1));
  const originX = safeNumber(frame.originX, 0);
  const originY = safeNumber(frame.originY, 0);
  const flip = state.canMove ? state.facing === 1 : life.f === 1;

  const left = flip ? worldX + originX - width : worldX - originX;
  const top = worldY - originY;
  return normalizedRect(left, left + width, top, top + height);
}

function updateMobTouchCollisions() {
  if (!runtime.map) return;
  if (runtime.debug.mouseFly) return;

  const player = runtime.player;
  const nowMs = performance.now();
  if (nowMs < player.trapInvincibleUntil) return;

  const touchBounds = playerTouchBounds(player);

  for (const [idx, state] of lifeRuntimeState) {
    const life = runtime.map.lifeEntries[idx];
    if (!life || life.type !== "m") continue;
    if (state.dead || state.dying) continue;

    const anim = lifeAnimations.get(`m:${life.id}`);
    if (!anim?.touchDamageEnabled) continue;

    const mobBounds = mobFrameWorldBounds(life, state, anim);
    if (!mobBounds) continue;
    if (!rectsOverlap(touchBounds, mobBounds)) continue;

    const mobX = state.phobj ? state.phobj.x : life.x;
    applyPlayerTouchHit(anim.touchAttack, mobX, nowMs);
    break;
  }
}

function updateTrapHazardCollisions() {
  if (!runtime.map) return;
  if (runtime.debug.mouseFly) return;

  const player = runtime.player;
  const nowMs = performance.now();
  if (nowMs < player.trapInvincibleUntil) return;

  const hazards = runtime.map.trapHazards ?? [];
  if (hazards.length === 0) return;

  const touchBounds = playerTouchBounds(player);

  for (const hazard of hazards) {
    const meta = currentObjectFrameMeta(hazard.layerIndex, hazard.obj);
    if (!isDamagingTrapMeta(meta)) continue;

    // Skip collision when trap is barely visible (< 10% opacity)
    const obj = hazard.obj;
    if (obj.frameDelays && obj.frameCount > 1) {
      const stateKey = `${hazard.layerIndex}:${obj.id}`;
      const animState = objectAnimStates.get(stateKey);
      if (animState && animState.opacity < 26) continue; // 26/255 ≈ 10%
    }

    const bounds = trapWorldBounds(hazard.obj, meta, nowMs);
    if (!bounds) continue;
    if (!rectsOverlap(touchBounds, bounds)) continue;

    applyTrapHit(meta.damage ?? hazard.baseDamage, bounds, nowMs);
    break;
  }
}

function drawMapLayer(layer) {
  const visible = visibleSpritesForLayer(layer);
  const nowMs = performance.now();

  for (const obj of visible.objects) {
    // Determine which frame to show
    let frameKey = obj.key;
    let objectAnimState = null;
    if (obj.frameDelays && obj.frameCount > 1) {
      const stateKey = `${layer.layerIndex}:${obj.id}`;
      objectAnimState = objectAnimStates.get(stateKey) ?? null;
      if (objectAnimState) {
        const frameToken = obj.frameKeys?.[objectAnimState.frameIndex] ?? objectAnimState.frameIndex;
        frameKey = `${obj.baseKey}:${frameToken}`;
      }
    }

    let image = getImageByKey(frameKey);
    let meta = getMetaByKey(frameKey);

    if (!image || !meta) {
      image = image ?? getImageByKey(obj.key);
      meta = meta ?? getMetaByKey(obj.key);
    }

    if (!meta) {
      requestObjectMeta(obj);
      continue;
    }

    if (!image) continue;

    const origin = meta.vectors.origin ?? { x: 0, y: 0 };
    const moveOffset = objectMoveOffset(obj.motion ?? meta, nowMs);
    const width = Math.max(1, image.width || meta.width || 1);
    const height = Math.max(1, image.height || meta.height || 1);
    const drawOriginX = obj.flipped ? width - origin.x : origin.x;
    const worldX = obj.x - drawOriginX + moveOffset.x;
    const worldY = obj.y - origin.y + moveOffset.y;
    if (!isWorldRectVisible(worldX, worldY, width, height)) {
      runtime.perf.culledSprites += 1;
      continue;
    }

    const frameOpacity = objectFrameOpacity(meta, objectAnimState, obj);

    runtime.perf.objectsDrawn += 1;
    if (frameOpacity < 0.999) {
      ctx.save();
      ctx.globalAlpha *= frameOpacity;
      drawWorldImage(image, worldX, worldY, { flipped: obj.flipped });
      ctx.restore();
    } else {
      drawWorldImage(image, worldX, worldY, { flipped: obj.flipped });
    }
  }

  for (const tile of visible.tiles) {
    if (!tile.key) continue;

    const image = getImageByKey(tile.key);
    const meta = getMetaByKey(tile.key);

    if (!meta) {
      requestTileMeta(tile);
      continue;
    }

    if (!image) continue;

    const origin = meta.vectors.origin ?? { x: 0, y: 0 };
    const worldX = tile.x - origin.x;
    const worldY = tile.y - origin.y;
    const width = Math.max(1, image.width || meta.width || 1);
    const height = Math.max(1, image.height || meta.height || 1);
    if (!isWorldRectVisible(worldX, worldY, width, height)) {
      runtime.perf.culledSprites += 1;
      continue;
    }

    runtime.perf.tilesDrawn += 1;
    drawWorldImage(image, worldX, worldY);
  }
}

function currentPlayerRenderLayer() {
  if (!runtime.map) return safeNumber(runtime.player.footholdLayer, -1);
  if (runtime.player.climbing) return 7;
  if (!runtime.player.onGround) return 7;
  return safeNumber(runtime.player.footholdLayer, -1);
}

function buildLifeLayerBuckets() {
  const buckets = new Map();
  for (const [idx, state] of lifeRuntimeState) {
    const layer = safeNumber(state.renderLayer, -1);
    let arr = buckets.get(layer);
    if (!arr) {
      arr = [];
      buckets.set(layer, arr);
    }
    arr.push([idx, state]);
  }
  return buckets;
}

/** Determine render layer for a remote player from footholds at their position. */
function remotePlayerRenderLayer(rp) {
  if (!runtime.map) return 7;
  const fh = findFootholdAtXNearY(runtime.map, rp.renderX, rp.renderY, 30)
          || findFootholdBelow(runtime.map, rp.renderX, rp.renderY - 50);
  return fh?.line?.layer ?? 7;
}

function buildRemotePlayerLayerBuckets() {
  const buckets = new Map();
  for (const [, rp] of remotePlayers) {
    const layer = remotePlayerRenderLayer(rp);
    let arr = buckets.get(layer);
    if (!arr) { arr = []; buckets.set(layer, arr); }
    arr.push(rp);
  }
  return buckets;
}

function drawMapLayersWithCharacter() {
  if (!runtime.map) return;

  const lifeLayerBuckets = buildLifeLayerBuckets();
  const rpLayerBuckets = buildRemotePlayerLayerBuckets();
  const playerLayer = currentPlayerRenderLayer();
  let playerDrawn = false;

  for (const layer of runtime.map.layers) {
    drawMapLayer(layer);
    drawLifeSprites(layer.layerIndex, lifeLayerBuckets.get(layer.layerIndex) ?? []);

    // Draw remote players on this layer
    const rpOnLayer = rpLayerBuckets.get(layer.layerIndex);
    if (rpOnLayer) {
      for (const rp of rpOnLayer) drawRemotePlayer(rp);
    }

    // Draw local player at their layer (on top of remote players on same layer)
    if (!playerDrawn && layer.layerIndex === playerLayer) {
      drawCharacter();
      playerDrawn = true;
    }
  }

  if (!playerDrawn) {
    drawCharacter();
  }
  // Draw any remote players whose layer didn't match any map layer
  for (const [layerIdx, rps] of rpLayerBuckets) {
    if (!runtime.map.layers.some(l => l.layerIndex === layerIdx)) {
      for (const rp of rps) drawRemotePlayer(rp);
    }
  }
}

function drawRopeGuides() {
  if (!runtime.map) return;

  ctx.save();
  ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
  ctx.lineWidth = 2;

  for (const rope of runtime.map.ladderRopes ?? []) {
    const a = worldToScreen(rope.x, rope.y1);
    const b = worldToScreen(rope.x, rope.y2);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPortals() {
  if (!runtime.map) return;

  const anim = runtime.portalAnimation;

  for (const portal of runtime.map.portalEntries) {
    const visibilityMode = portalVisibilityMode(portal);
    if (visibilityMode === "none") continue;

    ensurePortalFramesRequested(portal);

    let portalAlpha = 1;
    if (visibilityMode === "touched") {
      portalAlpha = getHiddenPortalAlpha(portal);
      if (portalAlpha <= 0) continue;
    }

    const frameCount = portalFrameCount(portal);
    const frameNo = frameCount === 7
      ? anim.hiddenFrameIndex % frameCount
      : anim.regularFrameIndex % frameCount;
    const key = portalMetaKey(portal, frameNo);
    if (!key) continue;

    let image = getImageByKey(key);
    let meta = getMetaByKey(key);
    if (!meta) {
      requestPortalMeta(portal, frameNo);
      continue;
    }
    if (!image) continue;

    const origin = meta.vectors.origin ?? { x: Math.floor(image.width / 2), y: image.height };
    const worldX = portal.x - origin.x;
    const worldY = portal.y - origin.y;
    const width = Math.max(1, image.width || meta.width || 1);
    const height = Math.max(1, image.height || meta.height || 1);
    if (!isWorldRectVisible(worldX, worldY, width, height)) {
      runtime.perf.culledSprites += 1;
      continue;
    }

    runtime.perf.portalsDrawn += 1;
    if (portalAlpha < 1) {
      ctx.save();
      ctx.globalAlpha = portalAlpha;
      drawWorldImage(image, worldX, worldY);
      ctx.restore();
    } else {
      drawWorldImage(image, worldX, worldY);
    }
  }
}

function drawFootholdOverlay() {
  if (!runtime.map) return;

  ctx.save();
  ctx.strokeStyle = "rgba(34, 197, 94, 0.65)";
  ctx.lineWidth = 1.5;
  ctx.font = "bold 10px monospace";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 3;

  const cw = gameViewWidth();
  const ch = gameViewHeight();

  for (const line of runtime.map.footholdLines) {
    const a = worldToScreen(line.x1, line.y1);
    const b = worldToScreen(line.x2, line.y2);

    // Rough culling: skip if both endpoints are far off-screen
    if ((a.x < -200 && b.x < -200) || (a.x > cw + 200 && b.x > cw + 200)) continue;
    if ((a.y < -200 && b.y < -200) || (a.y > ch + 200 && b.y > ch + 200)) continue;

    // Draw the line (no shadow for lines)
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Re-enable shadow for text
    ctx.shadowBlur = 3;

    // Draw coordinate labels at endpoints
    ctx.fillStyle = "#4ade80";
    const labelA = `${line.x1},${line.y1}`;
    const labelB = `${line.x2},${line.y2}`;
    ctx.fillText(labelA, a.x + 3, a.y + 3);
    // Only draw second label if it's far enough from first to avoid overlap
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx * dx + dy * dy > 2500) {
      ctx.fillText(labelB, b.x + 3, b.y + 3);
    }

    // Draw foothold ID at midpoint
    ctx.fillStyle = "rgba(134, 239, 172, 0.8)";
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.fillText(`fh:${line.id}`, mx + 3, my - 12);
  }

  ctx.restore();
}

function drawTileOverlay() {
  if (!runtime.map) return;

  ctx.save();
  ctx.font = "bold 10px monospace";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 1;
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 3;

  for (const layer of runtime.map.layers ?? []) {
    for (const tile of layer.tiles ?? []) {
      if (!tile.key) continue;

      const meta = getMetaByKey(tile.key);
      const image = getImageByKey(tile.key);
      const origin = meta?.vectors?.origin ?? { x: 0, y: 0 };
      const w = image?.width || meta?.width || 16;
      const h = image?.height || meta?.height || 16;
      const worldX = tile.x - origin.x;
      const worldY = tile.y - origin.y;

      // Cull off-screen tiles
      if (!isWorldRectVisible(worldX, worldY, w, h, 32)) continue;

      const tl = worldToScreen(worldX, worldY);
      const br = worldToScreen(worldX + w, worldY + h);
      const sx = Math.round(tl.x);
      const sy = Math.round(tl.y);
      const sw = Math.max(1, Math.round(br.x - tl.x));
      const sh = Math.max(1, Math.round(br.y - tl.y));

      // Draw bounding box (no shadow for box strokes)
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
      ctx.strokeRect(sx, sy, sw, sh);

      // Draw dot at tile origin (x,y)
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(worldToScreen(tile.x, tile.y).x, worldToScreen(tile.x, tile.y).y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Re-enable shadow for text
      ctx.shadowBlur = 3;

      // Label: name (u:no)
      ctx.fillStyle = "#7dd3fc";
      ctx.fillText(`${tile.u}:${tile.no}`, sx + 2, sy - 2);

      // Position label
      ctx.textBaseline = "top";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`${tile.x},${tile.y}`, sx + 2, sy + 2);
      ctx.textBaseline = "bottom";
    }
  }

  ctx.restore();
}

function drawLifeMarkers() {
  if (!runtime.map) return;

  ctx.save();

  for (const life of runtime.map.lifeEntries) {
    const p = worldToScreen(life.x, life.y);
    ctx.fillStyle = life.type === "m" ? "#fb7185" : "#a78bfa";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawWorldDebugRect(rect, strokeStyle, fillStyle = null) {
  if (!rect) return false;

  const width = Math.max(1, rect.right - rect.left);
  const height = Math.max(1, rect.bottom - rect.top);
  if (!isWorldRectVisible(rect.left, rect.top, width, height, 64)) {
    return false;
  }

  const a = worldToScreen(rect.left, rect.top);
  const b = worldToScreen(rect.right, rect.bottom);
  const x = Math.round(Math.min(a.x, b.x));
  const y = Math.round(Math.min(a.y, b.y));
  const w = Math.max(1, Math.round(Math.abs(b.x - a.x)));
  const h = Math.max(1, Math.round(Math.abs(b.y - a.y)));

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fillRect(x, y, w, h);
  }

  ctx.strokeStyle = strokeStyle;
  ctx.strokeRect(x, y, w, h);
  return true;
}

function drawHitboxOverlay() {
  if (!runtime.map) return;

  const nowMs = performance.now();

  ctx.save();
  ctx.lineWidth = 1;

  drawWorldDebugRect(playerTouchBounds(runtime.player), "rgba(56, 189, 248, 0.95)", "rgba(56, 189, 248, 0.08)");

  for (const portal of runtime.map.portalEntries ?? []) {
    drawWorldDebugRect(portalWorldBounds(portal), "rgba(167, 139, 250, 0.9)", "rgba(167, 139, 250, 0.06)");
  }

  for (const hazard of runtime.map.trapHazards ?? []) {
    const meta = currentObjectFrameMeta(hazard.layerIndex, hazard.obj);
    if (!isDamagingTrapMeta(meta)) continue;
    const bounds = trapWorldBounds(hazard.obj, meta, nowMs);
    drawWorldDebugRect(bounds, "rgba(250, 204, 21, 0.95)", "rgba(250, 204, 21, 0.08)");
  }

  for (const [idx, state] of lifeRuntimeState) {
    const life = runtime.map.lifeEntries[idx];
    if (!life || life.type !== "m") continue;
    if (state.dead || state.dying) continue;

    const anim = lifeAnimations.get(`m:${life.id}`);
    if (!anim) continue;

    const bounds = mobFrameWorldBounds(life, state, anim);
    if (!bounds) continue;

    const touchEnabled = !!anim.touchDamageEnabled;
    drawWorldDebugRect(
      bounds,
      touchEnabled ? "rgba(239, 68, 68, 0.95)" : "rgba(248, 113, 113, 0.65)",
      touchEnabled ? "rgba(239, 68, 68, 0.07)" : null,
    );
  }

  ctx.restore();
}

function zOrderForPart(partName, meta) {
  const candidates = [meta?.zName, partName].filter((value) => typeof value === "string" && value.length > 0);

  for (const candidate of candidates) {
    if (runtime.zMapOrder[candidate] !== undefined) {
      return runtime.zMapOrder[candidate];
    }
  }

  return 100000;
}

function mergeMapAnchors(anchors, meta, image, topLeft, flipped) {
  for (const vectorName of Object.keys(meta?.vectors ?? {})) {
    if (vectorName === "origin") continue;

    const world = worldPointFromTopLeft(meta, image, topLeft, vectorName, flipped);
    if (!anchors[vectorName]) {
      anchors[vectorName] = world;
    }
  }
}

function pickAnchorName(meta, anchors) {
  const names = Object.keys(meta?.vectors ?? {}).filter((name) => name !== "origin");
  if (names.length === 0) return null;

  const preferred = ["navel", "neck", "hand", "brow", "earOverHead", "earBelowHead"];
  for (const name of preferred) {
    if (names.includes(name) && anchors[name]) {
      return name;
    }
  }

  return names.find((name) => anchors[name]) ?? null;
}

function characterTemplateCacheKey(action, frameIndex, flipped, faceExpression, faceFrameIndex) {
  return `${action}:${frameIndex}:${flipped ? 1 : 0}:${faceExpression}:${faceFrameIndex}`;
}

function getCharacterPlacementTemplate(action, frameIndex, flipped, faceExpression, faceFrameIndex) {
  const cacheKey = characterTemplateCacheKey(action, frameIndex, flipped, faceExpression, faceFrameIndex);
  if (characterPlacementTemplateCache.has(cacheKey)) {
    return characterPlacementTemplateCache.get(cacheKey);
  }

  const frame = getCharacterFrameData(action, frameIndex, faceExpression, faceFrameIndex);
  if (!frame || !frame.parts?.length) return null;

  const partAssets = frame.parts
    .map((part) => {
      const key = `char:${action}:${frameIndex}:${part.name}`;
      requestCharacterPartImage(key, part.meta);
      const image = getImageByKey(key);
      return {
        ...part,
        key,
        image,
      };
    })
    .filter((part) => !!part.image && !!part.meta);

  // Avoid caching transient no-face templates when a face frame is expected but
  // its image is still decoding. Let draw fallback reuse the last complete frame.
  const expectedFacePart = frame.parts.find((part) => typeof part.name === "string" && part.name.startsWith("face:"));
  if (expectedFacePart && !partAssets.some((part) => part.name === expectedFacePart.name)) {
    return null;
  }

  const body = partAssets.find((part) => part.name === "body");
  if (!body) return null;

  const bodyTopLeft = topLeftFromAnchor(body.meta, body.image, { x: 0, y: 0 }, null, flipped);
  const anchors = {};
  mergeMapAnchors(anchors, body.meta, body.image, bodyTopLeft, flipped);

  const placements = [
    {
      ...body,
      topLeft: bodyTopLeft,
      zOrder: zOrderForPart(body.name, body.meta),
    },
  ];

  const pending = partAssets.filter((part) => part !== body);

  let progressed = true;
  while (pending.length > 0 && progressed) {
    progressed = false;

    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const part = pending[index];

      // C++ parity: face should anchor to brow when available.
      // Face frames carry expression-specific `map.brow` offsets and must use them
      // (equivalent to C++ Face::Frame texture.shift(-brow) behavior).
      const isFacePart = typeof part.name === "string" && part.name.startsWith("face:");
      const anchorName = isFacePart
        ? (anchors.brow ? "brow" : pickAnchorName(part.meta, anchors))
        : pickAnchorName(part.meta, anchors);
      if (!anchorName) continue;

      const anchorVectorName = anchorName;
      const topLeft = topLeftFromAnchor(part.meta, part.image, anchors[anchorName], anchorVectorName, flipped);
      placements.push({
        ...part,
        topLeft,
        zOrder: zOrderForPart(part.name, part.meta),
      });

      mergeMapAnchors(anchors, part.meta, part.image, topLeft, flipped);
      pending.splice(index, 1);
      progressed = true;
    }
  }

  const template = placements
    .sort((a, b) => a.zOrder - b.zOrder)
    .map((part) => ({
      ...part,
      offsetX: part.topLeft.x,
      offsetY: part.topLeft.y,
    }));

  characterPlacementTemplateCache.set(cacheKey, template);
  return template;
}

function composeCharacterPlacements(
  action,
  frameIndex,
  player,
  flipped,
  faceExpression = runtime.faceAnimation.expression,
  faceFrameIndex = runtime.faceAnimation.frameIndex,
) {
  const template = getCharacterPlacementTemplate(
    action,
    frameIndex,
    flipped,
    faceExpression,
    faceFrameIndex,
  );
  if (!template || template.length === 0) return null;

  return template.map((part) => ({
    ...part,
    topLeft: {
      x: player.x + part.offsetX,
      y: player.y + part.offsetY,
    },
  }));
}

function characterBoundsFromPlacements(placements) {
  if (!placements || placements.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const part of placements) {
    const left = part.topLeft.x;
    const top = part.topLeft.y;
    const right = left + part.image.width;
    const bottom = top + part.image.height;

    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, top);
    maxY = Math.max(maxY, bottom);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function splitWordByWidth(word, maxWidth) {
  if (ctx.measureText(word).width <= maxWidth) {
    return [word];
  }

  const chunks = [];
  let current = "";

  for (const char of word) {
    const candidate = current + char;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [word];
}

function wrapBubbleTextToWidth(text, maxWidth) {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return [""];

  const words = normalized.split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const chunks = splitWordByWidth(word, maxWidth);

    for (const chunk of chunks) {
      if (!line) {
        line = chunk;
        continue;
      }

      const candidate = `${line} ${chunk}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = chunk;
      }
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function playerHitBlinkColorScale(nowMs) {
  const player = runtime.player;
  if (nowMs >= player.trapInvincibleUntil) {
    return 1;
  }

  const elapsed = Math.max(0, nowMs - player.lastTrapHitAt);
  const progress = Math.max(0, Math.min(1, elapsed / TRAP_HIT_INVINCIBILITY_MS));
  const phi = progress * 30;
  const rgb = 0.9 - 0.5 * Math.abs(Math.sin(phi)); // C++ Char::draw invincible pulse
  return Math.max(0.4, Math.min(0.9, rgb));
}

function drawCharacter() {
  const player = runtime.player;
  const flipped = player.facing > 0;

  const faceExpression = runtime.faceAnimation.expression;
  const faceFrameIndex = runtime.faceAnimation.frameIndex;

  const currentPlacements = composeCharacterPlacements(
    player.action,
    player.frameIndex,
    player,
    flipped,
    faceExpression,
    faceFrameIndex,
  );
  const fallback = runtime.lastRenderableCharacterFrame;
  const fallbackFaceExpression = fallback?.faceExpression ?? faceExpression;
  const fallbackFaceFrameIndex = fallback?.faceFrameIndex ?? faceFrameIndex;
  const placements =
    currentPlacements ??
    (fallback
      ? composeCharacterPlacements(
          fallback.action,
          fallback.frameIndex,
          player,
          flipped,
          fallbackFaceExpression,
          fallbackFaceFrameIndex,
        )
      : null);

  if (!placements || placements.length === 0) {
    return;
  }

  if (currentPlacements) {
    runtime.lastRenderableCharacterFrame = {
      action: player.action,
      frameIndex: player.frameIndex,
      faceExpression,
      faceFrameIndex,
    };
  }

  const bounds = characterBoundsFromPlacements(placements);
  if (bounds) {
    runtime.lastCharacterBounds = bounds;
    if (player.action === "stand1") {
      runtime.standardCharacterWidth = Math.max(40, Math.min(120, Math.round(bounds.width)));
    }
  }

  // Draw chair sprite below character (z=-1)
  // The chair's bottom edge aligns with the player's feet (ground level).
  // Flipped to match the player's facing direction.
  if (player.chairId) {
    const chairSprite = _chairSpriteCache.get(player.chairId);
    if (chairSprite?.img) {
      const sc = worldToScreen(player.x, player.y);
      const drawY = Math.round(sc.y - chairSprite.height);
      if (flipped) {
        ctx.save();
        const drawX = Math.round(sc.x - (chairSprite.width - chairSprite.originX));
        ctx.translate(drawX + chairSprite.width, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(chairSprite.img, 0, 0);
        ctx.restore();
      } else {
        const drawX = Math.round(sc.x - chairSprite.originX);
        ctx.drawImage(chairSprite.img, drawX, drawY);
      }
    }
  }

  const blinkColorScale = playerHitBlinkColorScale(performance.now());
  if (blinkColorScale < 0.999) {
    ctx.save();
    ctx.filter = `brightness(${Math.round(blinkColorScale * 100)}%)`;
  }

  for (const part of placements) {
    drawWorldImage(part.image, part.topLeft.x, part.topLeft.y, { flipped });
  }

  if (blinkColorScale < 0.999) {
    ctx.restore();
  }
}

function drawChatBubble() {
  const now = performance.now();
  if (runtime.player.bubbleExpiresAt < now || !runtime.player.bubbleText) return;

  // C++ parity: chatballoon.draw(absp - Point<int16_t>(0, 85))
  // When prone the sprite is much shorter, so lower the bubble offset
  const action = runtime.player.action;
  const isProne = action === "prone" || action === "proneStab";
  const bubbleOffsetY = isProne ? 40 : 70;
  const anchor = worldToScreen(runtime.player.x, runtime.player.y - bubbleOffsetY);
  const text = runtime.player.bubbleText;

  ctx.save();
  ctx.font = "12px 'Dotum', Arial, sans-serif";

  const playerName = runtime.player.name || "Player";
  const fullText = playerName + ": " + text;

  const standardWidth = Math.max(1, Math.round(runtime.standardCharacterWidth || DEFAULT_STANDARD_CHARACTER_WIDTH));
  const maxBubbleWidth = Math.max(40, Math.round(standardWidth * CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER));
  const maxTextWidth = Math.max(14, maxBubbleWidth - CHAT_BUBBLE_HORIZONTAL_PADDING * 2);
  const lines = wrapBubbleTextToWidth(fullText, maxTextWidth);

  const widestLine = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
  const width = Math.max(
    40,
    Math.min(maxBubbleWidth, Math.ceil(widestLine) + CHAT_BUBBLE_HORIZONTAL_PADDING * 2),
  );
  const height = Math.max(
    26,
    lines.length * CHAT_BUBBLE_LINE_HEIGHT + CHAT_BUBBLE_VERTICAL_PADDING * 2,
  );

  const clampedX = Math.max(6, Math.min(canvasEl.width - width - 6, anchor.x - width / 2));
  const y = anchor.y - height - 16;

  // White bubble with subtle border (MapleStory-style)
  roundRect(ctx, clampedX, y, width, height, 6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 80, 120, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#1a1a2e";
  ctx.textBaseline = "top";
  const textBlockHeight = lines.length * CHAT_BUBBLE_LINE_HEIGHT;
  const textOffsetY = (height - textBlockHeight) / 2;
  for (let index = 0; index < lines.length; index += 1) {
    const lineY = y + textOffsetY + index * CHAT_BUBBLE_LINE_HEIGHT;
    ctx.fillText(lines[index], clampedX + CHAT_BUBBLE_HORIZONTAL_PADDING, lineY);
  }

  // Tail
  const tailX = Math.max(clampedX + 8, Math.min(clampedX + width - 8, anchor.x));
  ctx.beginPath();
  ctx.moveTo(tailX - 6, y + height);
  ctx.lineTo(tailX + 6, y + height);
  ctx.lineTo(tailX, y + height + 7);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 80, 120, 0.4)";
  ctx.stroke();

  ctx.restore();
}

// ─── Minimap ───────────────────────────────────────────────────────────────────
const MINIMAP_PADDING = 10;
const MINIMAP_TITLE_HEIGHT = 20;
const MINIMAP_BORDER_RADIUS = 6;
const MINIMAP_PLAYER_RADIUS = 3;
const MINIMAP_PORTAL_RADIUS = 2.5;
const MINIMAP_CLOSE_SIZE = 14;

// Stored each frame so the click handler knows where the toggle button is
// ─── Player Name Label ────────────────────────────────────────────────────────

function drawPlayerNameLabel() {
  const player = runtime.player;
  const screen = worldToScreen(player.x, player.y);

  ctx.save();
  ctx.font = "bold 11px 'Dotum', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const nameText = player.name;
  const nameWidth = ctx.measureText(nameText).width;
  const padH = 6;
  const padV = 2;
  const tagW = nameWidth + padH * 2;
  const tagH = 14 + padV * 2;
  const tagX = Math.round(screen.x - tagW / 2);
  const tagY = Math.round(screen.y + 2);

  // Background — dark with subtle blue tint (MapleStory name tag)
  roundRect(ctx, tagX, tagY, tagW, tagH, 3);
  ctx.fillStyle = "rgba(6, 12, 28, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 130, 180, 0.25)";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Name text — white with subtle shadow
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 2;
  ctx.fillText(nameText, Math.round(screen.x), tagY + padV);

  ctx.restore();
}

// ─── Status Bar (HP / MP / EXP) ──────────────────────────────────────────────
// (STATUSBAR_HEIGHT, STATUSBAR_BAR_HEIGHT, STATUSBAR_PADDING_H defined in UI constants section)

function drawStatusBar() {
  const player = runtime.player;
  const cw = canvasEl.width;
  const ch = canvasEl.height;
  const barY = ch - STATUSBAR_HEIGHT;

  ctx.save();

  // Full-width frosted background
  ctx.fillStyle = "rgba(6, 10, 22, 0.88)";
  ctx.fillRect(0, barY, cw, STATUSBAR_HEIGHT);
  // Top edge highlight
  ctx.fillStyle = "rgba(100, 130, 180, 0.15)";
  ctx.fillRect(0, barY, cw, 1);

  // Layout: [Level/Job] [HP bar] [MP bar]
  const contentY = barY + 4;
  const levelLabelW = 80;

  // Level + job — gold accent
  ctx.font = "bold 11px 'Dotum', Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fbbf24";
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 2;
  const barMidY = contentY + STATUSBAR_BAR_HEIGHT / 2;
  ctx.fillText(`Lv.${player.level}`, STATUSBAR_PADDING_H, barMidY - 1);
  const lvTextW = ctx.measureText(`Lv.${player.level}`).width;
  ctx.fillStyle = "#8899b0";
  ctx.font = "10px 'Dotum', Arial, sans-serif";
  ctx.fillText(player.job, STATUSBAR_PADDING_H + lvTextW + 6, barMidY - 1);
  ctx.shadowColor = "transparent";

  // Gauge area
  const gaugeStart = levelLabelW + 30;
  const gaugeEnd = cw - STATUSBAR_PADDING_H;
  const totalGaugeW = gaugeEnd - gaugeStart;
  const gaugeGap = 8;
  const singleGaugeW = Math.floor((totalGaugeW - gaugeGap) / 2);

  // HP bar — warm red with gradient
  drawGaugeBar(gaugeStart, contentY, singleGaugeW, STATUSBAR_BAR_HEIGHT,
    player.hp, player.maxHp, "#dc2626", "#a51c1c", "#4a0e0e", "HP");

  // MP bar — cool blue with gradient
  drawGaugeBar(gaugeStart + singleGaugeW + gaugeGap, contentY, singleGaugeW, STATUSBAR_BAR_HEIGHT,
    player.mp, player.maxMp, "#2563eb", "#1d4ed8", "#0c1e40", "MP");

  ctx.restore();
}

function drawGaugeBar(x, y, w, h, current, max, fillColor, fillColor2, bgColor, label) {
  const frac = max > 0 ? Math.min(1, current / max) : 0;

  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  // Subtle inner border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 0.5;
  roundRect(ctx, x, y, w, h, 4);
  ctx.stroke();

  // Fill — gradient for depth
  if (frac > 0) {
    const fillW = Math.max(6, Math.round(w * frac));
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(0.5, fillColor2);
    grad.addColorStop(1, fillColor);
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, fillW, h, 4);
    ctx.fill();
    // Glossy highlight on top half
    const glossGrad = ctx.createLinearGradient(x, y, x, y + h / 2);
    glossGrad.addColorStop(0, "rgba(255, 255, 255, 0.22)");
    glossGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glossGrad;
    roundRect(ctx, x, y, fillW, h / 2, 4);
    ctx.fill();
  }

  // Label on left
  ctx.save();
  ctx.font = "bold 10px 'Dotum', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 2;
  ctx.fillText(label, x + 5, y + h / 2 + 1);

  // Value on right
  ctx.textAlign = "right";
  ctx.font = "10px 'Dotum', Arial, sans-serif";
  ctx.fillText(`${current}/${max}`, x + w - 5, y + h / 2 + 1);
  ctx.restore();
}

// ─── Map Name Banner ─────────────────────────────────────────────────────────

const MAP_BANNER_SHOW_MS = 3500;
const MAP_BANNER_FADE_MS = 900;
const MAP_BANNER_SLIDE_MS = 350;

/** Map mark images cache: markName → Image (or null if not available) */
const _mapMarkImages = new Map();
let _mapHelperJson = null;
let _mapHelperLoading = false;

async function ensureMapMarkImage(markName) {
  if (!markName) return null;
  if (_mapMarkImages.has(markName)) return _mapMarkImages.get(markName);

  // Load MapHelper.img.json once
  if (!_mapHelperJson && !_mapHelperLoading) {
    _mapHelperLoading = true;
    try {
      const resp = await fetchJson("/resources/Map.wz/MapHelper.img.json");
      _mapHelperJson = resp;
    } catch (e) {
      rlog(`MapHelper load failed: ${e}`);
      _mapHelperLoading = false;
      return null;
    }
    _mapHelperLoading = false;
  }
  if (!_mapHelperJson) return null;

  // Find mark/$$/[name=markName]
  const markSection = (_mapHelperJson.$$ ?? []).find(s => s.$imgdir === "mark");
  if (!markSection) return null;
  const markNode = (markSection.$$ ?? []).find(c => c.$canvas === markName);
  if (!markNode || !markNode.basedata) {
    _mapMarkImages.set(markName, null);
    return null;
  }

  // Decode into an Image
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { _mapMarkImages.set(markName, img); resolve(img); };
    img.onerror = () => { _mapMarkImages.set(markName, null); resolve(null); };
    img.src = `data:image/png;base64,${markNode.basedata}`;
  });
}

function showMapBanner(mapId) {
  const mapName = getMapStringName(mapId) ?? "";
  const streetName = getMapStringStreet(mapId) ?? "";
  if (!mapName && !streetName) return;

  const markName = runtime.map?.info?.mapMark ?? "";
  // Fire-and-forget mark image load
  if (markName) ensureMapMarkImage(markName);

  const now = performance.now();
  runtime.mapBanner.active = true;
  runtime.mapBanner.mapName = mapName;
  runtime.mapBanner.streetName = streetName;
  runtime.mapBanner.markName = markName;
  runtime.mapBanner.startedAt = now;
  runtime.mapBanner.fadeStartAt = now + MAP_BANNER_SHOW_MS - MAP_BANNER_FADE_MS;
  runtime.mapBanner.showUntil = now + MAP_BANNER_SHOW_MS;
}

function drawMapBanner() {
  const banner = runtime.mapBanner;
  if (!banner.active) return;

  const now = performance.now();
  if (now >= banner.showUntil) {
    banner.active = false;
    return;
  }

  // Fade alpha
  let alpha = 1;
  if (now >= banner.fadeStartAt) {
    alpha = Math.max(0, 1 - (now - banner.fadeStartAt) / MAP_BANNER_FADE_MS);
  }

  // Slide-in: ease-out from right
  const elapsed = now - banner.startedAt;
  const slideT = Math.min(1, elapsed / MAP_BANNER_SLIDE_MS);
  const easeOut = 1 - Math.pow(1 - slideT, 3); // cubic ease-out

  const cw = canvasEl.width;
  const ch = canvasEl.height;

  // Get map mark image if available
  const markImg = banner.markName ? (_mapMarkImages.get(banner.markName) ?? null) : null;
  const markSize = 38; // original MapleStory mark icons are 38x38

  // Measure text widths for layout
  ctx.save();

  const mapNameFont = "bold 16px 'Dotum', Arial, sans-serif";
  const streetFont = "11px 'Dotum', Arial, sans-serif";

  ctx.font = mapNameFont;
  const mapNameW = ctx.measureText(banner.mapName).width;
  let streetW = 0;
  if (banner.streetName) {
    ctx.font = streetFont;
    streetW = ctx.measureText(banner.streetName).width;
  }

  // Layout: [mark icon] [text block]
  const textW = Math.max(mapNameW, streetW);
  const iconGap = markImg ? 8 : 0;
  const iconW = markImg ? markSize : 0;
  const contentW = iconW + iconGap + textW;
  const padH = 16;
  const padV = 10;
  const ribbonW = contentW + padH * 2;
  const ribbonH = (banner.streetName ? 40 : 28) + padV * 2;

  // Position: centered horizontally, near top
  const targetX = Math.round((cw - ribbonW) / 2);
  const ribbonX = targetX + Math.round((1 - easeOut) * 60); // slide from right
  const ribbonY = Math.round(ch * 0.12);

  ctx.globalAlpha = alpha;

  // ── Dark ribbon background ──
  // Outer glow
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;

  // Main ribbon: dark semi-transparent with subtle blue tint
  const ribbonGrad = ctx.createLinearGradient(ribbonX, ribbonY, ribbonX, ribbonY + ribbonH);
  ribbonGrad.addColorStop(0, "rgba(20, 28, 50, 0.88)");
  ribbonGrad.addColorStop(0.5, "rgba(14, 20, 38, 0.92)");
  ribbonGrad.addColorStop(1, "rgba(20, 28, 50, 0.88)");
  ctx.fillStyle = ribbonGrad;
  roundRect(ctx, ribbonX, ribbonY, ribbonW, ribbonH, 4);
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // Top highlight edge
  ctx.strokeStyle = "rgba(120, 150, 200, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ribbonX + 4, ribbonY + 0.5);
  ctx.lineTo(ribbonX + ribbonW - 4, ribbonY + 0.5);
  ctx.stroke();

  // Bottom subtle edge
  ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
  ctx.beginPath();
  ctx.moveTo(ribbonX + 4, ribbonY + ribbonH - 0.5);
  ctx.lineTo(ribbonX + ribbonW - 4, ribbonY + ribbonH - 0.5);
  ctx.stroke();

  // Gold accent line on the left
  const accentGrad = ctx.createLinearGradient(ribbonX, ribbonY + 4, ribbonX, ribbonY + ribbonH - 4);
  accentGrad.addColorStop(0, "rgba(255, 200, 60, 0)");
  accentGrad.addColorStop(0.3, "rgba(255, 200, 60, 0.8)");
  accentGrad.addColorStop(0.7, "rgba(255, 200, 60, 0.8)");
  accentGrad.addColorStop(1, "rgba(255, 200, 60, 0)");
  ctx.fillStyle = accentGrad;
  ctx.fillRect(ribbonX + 2, ribbonY + 4, 2, ribbonH - 8);

  // ── Content ──
  const contentX = ribbonX + padH;
  const contentCenterY = ribbonY + ribbonH / 2;

  // Map mark icon
  if (markImg) {
    const ix = contentX;
    const iy = Math.round(contentCenterY - markSize / 2);
    ctx.drawImage(markImg, ix, iy, markSize, markSize);
  }

  const textX = contentX + iconW + iconGap;

  if (banner.streetName) {
    // Street name: small, light blue-gray
    ctx.font = streetFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(160, 180, 210, 0.9)";
    ctx.fillText(banner.streetName, textX, contentCenterY - 1);

    // Map name: bold, warm gold with subtle glow
    ctx.font = mapNameFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(255, 180, 40, 0.3)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#f5c842";
    ctx.fillText(banner.mapName, textX, contentCenterY + 2);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  } else {
    // Map name only: centered vertically
    ctx.font = mapNameFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255, 180, 40, 0.3)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#f5c842";
    ctx.fillText(banner.mapName, textX, contentCenterY);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

let minimapToggleHitBox = null; // { x, y, w, h } in canvas coords
let minimapCollapsed = false;

function drawMinimap() {
  minimapToggleHitBox = null;
  if (!runtime.settings.minimapVisible) return;
  if (!runtime.map?.miniMap) return;
  if (safeNumber(runtime.map.info.hideMinimap, 0) === 1) return;

  const mm = runtime.map.miniMap;
  const img = getImageByKey(mm.imageKey);
  if (!img) return;

  const scale = Math.pow(2, mm.mag);
  const imgW = img.width;
  const imgH = img.height;

  // Map name for title
  const mapName = getMapStringName(runtime.mapId) ?? String(runtime.map.info.mapMark ?? runtime.mapId ?? "");

  // Measure title width to size collapsed panel
  ctx.save();
  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  const titleTextW = ctx.measureText(mapName).width;
  ctx.restore();

  // Panel sizing — collapsed = title bar only, expanded = title + map image
  const expandedW = imgW + MINIMAP_PADDING * 2;
  const collapsedW = Math.max(120, titleTextW + MINIMAP_PADDING * 2 + MINIMAP_CLOSE_SIZE + 8);
  const panelW = minimapCollapsed ? collapsedW : Math.max(expandedW, collapsedW);
  const panelH = minimapCollapsed ? MINIMAP_TITLE_HEIGHT : imgH + MINIMAP_TITLE_HEIGHT + MINIMAP_PADDING * 2;
  const panelX = 10;
  const panelY = 10;

  ctx.save();

  // Panel background — dark frosted glass
  roundRect(ctx, panelX, panelY, panelW, panelH, MINIMAP_BORDER_RADIUS);
  ctx.fillStyle = "rgba(6, 10, 24, 0.78)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 130, 180, 0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Toggle button (−/+ on the right side of title bar)
  const btnX = panelX + panelW - MINIMAP_PADDING - MINIMAP_CLOSE_SIZE;
  const btnCenterY = panelY + MINIMAP_TITLE_HEIGHT / 2 + 1;
  minimapToggleHitBox = { x: btnX - 2, y: panelY, w: MINIMAP_CLOSE_SIZE + 4, h: MINIMAP_TITLE_HEIGHT };

  ctx.fillStyle = "rgba(200, 210, 230, 0.5)";
  ctx.font = "bold 13px 'Dotum', Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(minimapCollapsed ? "+" : "−", btnX + MINIMAP_CLOSE_SIZE / 2, btnCenterY);

  // Title text — gold accent
  ctx.fillStyle = "#d4a830";
  ctx.font = "bold 11px 'Dotum', Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 2;
  const titleMaxW = panelW - MINIMAP_PADDING * 2 - MINIMAP_CLOSE_SIZE - 4;
  ctx.fillText(mapName, panelX + MINIMAP_PADDING, btnCenterY, titleMaxW);
  ctx.shadowColor = "transparent";

  // If collapsed, stop here
  if (minimapCollapsed) {
    ctx.restore();
    return;
  }

  // Separator line under title
  ctx.strokeStyle = "rgba(100, 130, 180, 0.15)";
  ctx.beginPath();
  ctx.moveTo(panelX + 4, panelY + MINIMAP_TITLE_HEIGHT);
  ctx.lineTo(panelX + panelW - 4, panelY + MINIMAP_TITLE_HEIGHT);
  ctx.stroke();

  // Draw minimap image
  const imgX = panelX + MINIMAP_PADDING;
  const imgY = panelY + MINIMAP_TITLE_HEIGHT + MINIMAP_PADDING;
  ctx.drawImage(img, imgX, imgY);

  // World-to-minimap coordinate transform:
  // minimapPos = (worldPos + centerOffset) / scale
  const toMinimapX = (worldX) => imgX + (worldX + mm.centerX) / scale;
  const toMinimapY = (worldY) => imgY + (worldY + mm.centerY) / scale;

  // Clip markers to minimap image area
  ctx.save();
  ctx.beginPath();
  ctx.rect(imgX, imgY, imgW, imgH);
  ctx.clip();

  // Draw portal markers (type 2 = visible map-transfer portals)
  for (const portal of runtime.map.portalEntries) {
    if (portal.type !== 2) continue;
    const px = toMinimapX(portal.x);
    const py = toMinimapY(portal.y);
    ctx.fillStyle = "#3b82f6"; // blue for visible portals
    ctx.beginPath();
    ctx.arc(px, py, MINIMAP_PORTAL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw reactor markers
  for (const reactor of runtime.map.reactorEntries ?? []) {
    const rx = toMinimapX(reactor.x);
    const ry = toMinimapY(reactor.y);
    ctx.fillStyle = "#e879f9";
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw NPC markers
  for (const life of runtime.map.lifeEntries) {
    if (life.type !== "n") continue;
    const lx = toMinimapX(life.x);
    const ly = toMinimapY(life.cy ?? life.y);
    ctx.fillStyle = "#22c55e"; // green for NPCs
    ctx.beginPath();
    ctx.arc(lx, ly, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw remote player markers (C++ draw_movable_markers → marker["another"])
  for (const [, rp] of remotePlayers) {
    const rpx = toMinimapX(rp.renderX);
    const rpy = toMinimapY(rp.renderY);
    ctx.fillStyle = "#ef4444"; // red for other players
    ctx.beginPath();
    ctx.arc(rpx, rpy, MINIMAP_PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw player marker (C++ draw_movable_markers → marker["user"])
  const playerMmX = toMinimapX(runtime.player.x);
  const playerMmY = toMinimapY(runtime.player.y);
  ctx.fillStyle = "#facc15"; // yellow for local player
  ctx.beginPath();
  ctx.arc(playerMmX, playerMmY, MINIMAP_PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore(); // unclip
  ctx.restore(); // outer save
}



// ── Loading screen mushroom animation + login BGM ──
const _loadingMushroom = {
  frames: {},   // stanceName → [HTMLImageElement]
  manifest: null,
  loaded: false,
  x: 0,
  flipped: false,
  frameIndex: 0,
  frameTimer: 0,
  stance: "move",
  bouncePhase: 0,
};
let _loginBgm = null;
let _loginBgmPlaying = false;

async function preloadLoadingScreenAssets() {
  try {
    const [manifestResp, audioResp] = await Promise.all([
      cachedFetch("/resourcesv2/mob/orange-mushroom/manifest.json"),
      cachedFetch("/resourcesv2/sound/login.mp3"),
    ]);
    const manifest = await manifestResp.json();
    _loadingMushroom.manifest = manifest;

    // Load all frame images
    const imgPromises = [];
    for (const [stance, frames] of Object.entries(manifest)) {
      _loadingMushroom.frames[stance] = [];
      for (const f of frames) {
        const imgUrl = `/resourcesv2/mob/orange-mushroom/${f.file}`;
        const img = new Image();
        const p = (async () => {
          try {
            const resp = await cachedFetch(imgUrl);
            const blob = await resp.blob();
            img.src = URL.createObjectURL(blob);
            await new Promise((res) => { img.onload = res; img.onerror = res; });
          } catch {
            img.src = imgUrl;
            await new Promise((res) => { img.onload = res; img.onerror = res; });
          }
        })();
        _loadingMushroom.frames[stance].push(img);
        imgPromises.push(p);
      }
    }
    await Promise.all(imgPromises);
    _loadingMushroom.loaded = true;

    // Prepare login BGM
    const blob = await audioResp.blob();
    _loginBgm = new Audio(URL.createObjectURL(blob));
    _loginBgm.loop = true;
    _loginBgm.volume = 0.35;
  } catch (e) {
    rlog(`Failed to preload loading screen assets: ${e.message}`);
  }
}

function startLoginBgm() {
  if (_loginBgmPlaying || !_loginBgm || !runtime.settings.bgmEnabled) return;
  // Don't play login BGM if map BGM is already active
  if (runtime.bgmAudio && !runtime.bgmAudio.paused) return;
  _loginBgm.currentTime = 0;
  _loginBgm.play().catch(() => {});
  _loginBgmPlaying = true;
}

function stopLoginBgm() {
  if (!_loginBgmPlaying || !_loginBgm) return;
  _loginBgm.pause();
  _loginBgmPlaying = false;
}

function drawLoadingScreen() {
  const progress = Math.max(0, Math.min(1, runtime.loading.progress || 0));
  const cw = canvasEl.width;
  const ch = canvasEl.height;
  const barWidth = Math.min(420, cw - 120);
  const barHeight = 14;
  const x = Math.round((cw - barWidth) / 2);
  const y = Math.round(ch / 2 + 14);

  ctx.save();
  ctx.fillStyle = "rgba(4, 8, 18, 0.94)";
  ctx.fillRect(0, 0, cw, ch);

  // ── Animated Orange Mushroom or loading spinner ──
  if (_loadingMushroom.loaded) {
    const m = _loadingMushroom;
    const manifest = m.manifest;
    const stanceFrames = manifest[m.stance];
    const imgs = m.frames[m.stance];

    if (stanceFrames && imgs && imgs.length > 0) {
      // Advance frame timer
      const delay = stanceFrames[m.frameIndex]?.delay || 100;
      m.frameTimer += 16.67; // approx 1 frame at 60fps
      if (m.frameTimer >= delay) {
        m.frameTimer -= delay;
        m.frameIndex = (m.frameIndex + 1) % stanceFrames.length;
      }

      // Move mushroom within progress bar region
      const barLeft = x;
      const barRight = x + barWidth;
      const speed = 1.8;
      if (!m.x) m.x = barLeft;
      if (m.flipped) {
        m.x -= speed;
        if (m.x < barLeft) { m.x = barLeft; m.flipped = false; }
      } else {
        m.x += speed;
        if (m.x > barRight) { m.x = barRight; m.flipped = true; }
      }

      // Bounce
      m.bouncePhase += 0.07;
      const bounceY = Math.abs(Math.sin(m.bouncePhase)) * -8;

      // Draw
      const img = imgs[m.frameIndex % imgs.length];
      const meta = stanceFrames[m.frameIndex % stanceFrames.length];
      if (img && img.complete && img.naturalWidth > 0) {
        const scale = 1.2;
        const drawW = parseInt(meta.width) * scale;
        const drawH = parseInt(meta.height) * scale;
        const ox = parseInt(meta.originX) * scale;
        const oy = parseInt(meta.originY) * scale;
        const groundY = y - 70;
        const drawX = Math.round(m.x - ox);
        const drawY = Math.round(groundY - oy + bounceY);

        ctx.save();
        if (!m.flipped) {
          ctx.translate(Math.round(m.x), 0);
          ctx.scale(-1, 1);
          ctx.translate(-Math.round(m.x), 0);
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
      }
    }
  } else {
    // Fallback: spinning circle while mushroom assets load
    const spinnerRadius = 14;
    const spinnerCx = cw / 2;
    const spinnerCy = y - 80;
    const spinAngle = (performance.now() / 600) % (Math.PI * 2);
    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    // Track
    ctx.beginPath();
    ctx.arc(spinnerCx, spinnerCy, spinnerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100, 130, 180, 0.15)";
    ctx.stroke();
    // Spinner arc
    ctx.beginPath();
    ctx.arc(spinnerCx, spinnerCy, spinnerRadius, spinAngle, spinAngle + Math.PI * 1.2);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.7)";
    ctx.stroke();
    ctx.restore();
  }

  // Play login BGM
  startLoginBgm();

  // Title — clean, no shadow
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "500 15px -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Loading map assets", cw / 2, y - 30);

  // Bar background — flat rounded pill
  const barR = barHeight / 2;
  roundRect(ctx, x, y, barWidth, barHeight, barR);
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fill();

  // Bar fill — flat white
  if (progress > 0) {
    const fillW = Math.max(barHeight, Math.round(barWidth * progress));
    roundRect(ctx, x, y, fillW, barHeight, barR);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.fill();
  }

  // Status label (verbose) + percentage
  const pct = Math.round(progress * 100);
  const statusText = runtime.loading.label || "Preparing assets";
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.font = "400 11px -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  ctx.fillText(`${statusText}  —  ${pct}%`, cw / 2, y + 28);

  ctx.restore();
}

function drawTransitionOverlay() {
  const alpha = Math.max(0, Math.min(1, runtime.transition.alpha));
  if (alpha <= 0) return;

  ctx.save();
  ctx.fillStyle = `rgba(2, 6, 23, ${alpha.toFixed(3)})`;
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.restore();
}

function estimatedFps() {
  if (runtime.perf.sampleCount <= 0) return 0;
  const p50Ms = perfPercentile(0.5);
  if (!Number.isFinite(p50Ms) || p50Ms <= 0.001) return 0;
  return Math.round(1000 / p50Ms);
}

function drawFpsCounter() {
  if (!runtime.debug.showFps) return;

  const fps = estimatedFps();
  const loopMs = Number.isFinite(runtime.perf.loopIntervalMs) ? runtime.perf.loopIntervalMs : 0;
  const fpsText = fps > 0 ? `${fps} FPS` : "FPS --";
  const msText = loopMs > 0 ? `${loopMs.toFixed(1)}ms` : "--.-ms";
  const hasPing = _wsConnected && _wsPingMs >= 0;
  const pingText = hasPing ? `${_wsPingMs}ms ping` : "";

  ctx.save();
  ctx.font = "bold 11px 'Dotum', Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  const lines = [fpsText, msText];
  if (hasPing) lines.push(pingText);
  const lineHeight = 13;

  const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
  const padX = 8;
  const boxW = Math.ceil(maxLineWidth) + padX * 2;
  const boxH = lines.length * lineHeight + 6;

  const buttonsBlockLeftX = canvasEl.width - 88;
  const boxRight = buttonsBlockLeftX - 8;
  const boxX = Math.max(10, Math.round(boxRight - boxW));
  const boxY = 42;

  // Frosted glass background
  roundRect(ctx, boxX, boxY, boxW, boxH, 5);
  ctx.fillStyle = "rgba(6, 10, 24, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 130, 180, 0.18)";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 2;

  // FPS line
  ctx.fillStyle = fps >= 58 ? "#22c55e" : fps >= 45 ? "#fbbf24" : "#ef4444";
  ctx.fillText(fpsText, boxX + boxW - padX, boxY + 3);

  // Frame time line
  ctx.font = "10px 'Dotum', Arial, sans-serif";
  ctx.fillStyle = "#8899b0";
  ctx.fillText(msText, boxX + boxW - padX, boxY + 3 + lineHeight);

  // Ping line
  if (hasPing) {
    ctx.fillStyle = _wsPingMs <= 80 ? "#22c55e" : _wsPingMs <= 200 ? "#fbbf24" : "#ef4444";
    ctx.fillText(pingText, boxX + boxW - padX, boxY + 3 + lineHeight * 2);
  }

  ctx.shadowColor = "transparent";
  ctx.restore();
}

let _lastRenderState = "";
function render() {
  resetFramePerfCounters();

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  const rs = `loading=${runtime.loading.active},map=${!!runtime.map},warp=${runtime.portalWarpInProgress},trans=${runtime.transition.alpha.toFixed(1)}`;
  if (rs !== _lastRenderState) {
    rlog(`render state: ${rs}`);
    _lastRenderState = rs;
  }

  if (runtime.loading.active) {
    drawLoadingScreen();
    drawFpsCounter();
    return;
  }

  if (!runtime.map) {
    drawTransitionOverlay();
    drawFpsCounter();
    return;
  }

  drawBackgroundLayer(0);
  drawMapLayersWithCharacter();
  drawReactors();
  drawDamageNumbers();
  if (runtime.debug.overlayEnabled && runtime.debug.showRopes) {
    drawRopeGuides();
  }
  drawPortals();
  if (runtime.debug.overlayEnabled && runtime.debug.showFootholds) {
    drawFootholdOverlay();
  }
  if (runtime.debug.overlayEnabled && runtime.debug.showTiles) {
    drawTileOverlay();
  }
  if (runtime.debug.overlayEnabled && runtime.debug.showLifeMarkers) {
    drawLifeMarkers();
    drawReactorMarkers();
  }
  if (runtime.debug.overlayEnabled && runtime.debug.showHitboxes) {
    drawHitboxOverlay();
  }
  drawBackgroundLayer(1);
  drawGroundDrops();
  drawVRBoundsOverflowMask();
  drawChatBubble();
  drawPlayerNameLabel();
  // Remote player name labels + chat bubbles
  for (const [, rp] of remotePlayers) {
    drawRemotePlayerNameLabel(rp);
    drawRemotePlayerChatBubble(rp);
  }
  drawMapBanner();
  drawMinimap();
  drawNpcDialogue();
  drawFpsCounter();
  drawTransitionOverlay();
  drawWZCursor();
}

function isDebugPanelVisible() {
  return !!debugPanelEl && !debugPanelEl.classList.contains("hidden");
}

function updateSummary() {
  if (!summaryEl) return;
  if (!isDebugPanelVisible() && !isRuntimeSummaryInteractionActive()) return;

  if (!runtime.map) {
    const emptyText = "No map loaded";
    if (!isRuntimeSummaryInteractionActive() && lastRenderedSummaryText !== emptyText) {
      summaryEl.textContent = emptyText;
      lastRenderedSummaryText = emptyText;
    }
    return;
  }

  const mobCount = runtime.map.lifeEntries.filter((life) => life.type === "m").length;
  const npcCount = runtime.map.lifeEntries.filter((life) => life.type === "n").length;
  const reactorCount = runtime.map.reactorEntries?.length ?? 0;
  const trapHazardCount = runtime.map.trapHazards?.length ?? 0;
  const canvasRect = canvasEl.getBoundingClientRect();

  const summary = {
    mapId: runtime.mapId,
    mapMark: runtime.map.info.mapMark ?? "",
    bgm: runtime.map.info.bgm ?? "",
    bounds: runtime.map.bounds,
    footholdBounds: runtime.map.footholdBounds,
    viewport: {
      renderWidth: canvasEl.width,
      renderHeight: canvasEl.height,
      displayWidth: Math.round(canvasRect.width),
      displayHeight: Math.round(canvasRect.height),
      aspect: Number((canvasEl.width / Math.max(1, canvasEl.height)).toFixed(3)),
      fixedRes: runtime.settings.fixedRes,
    },
    backgrounds: runtime.map.backgrounds.length,
    footholds: runtime.map.footholdLines.length,
    ropes: runtime.map.ladderRopes.length,
    walls: runtime.map.wallLines.length,
    portals: runtime.map.portalEntries.length,
    life: runtime.map.lifeEntries.length,
    mobCount,
    npcCount,
    reactorCount,
    trapHazards: trapHazardCount,
    player: {
      x: Number(runtime.player.x.toFixed(2)),
      y: Number(runtime.player.y.toFixed(2)),
      onGround: runtime.player.onGround,
      swimming: runtime.player.swimming,
      facing: runtime.player.facing,
      action: runtime.player.action,
      footholdLayer: runtime.player.footholdLayer,
      renderLayer: currentPlayerRenderLayer(),
      downJumpControlLock: runtime.player.downJumpControlLock,
      downJumpTargetFootholdId: runtime.player.downJumpTargetFootholdId,
      trapInvincibleMs: Math.max(0, Math.round(runtime.player.trapInvincibleUntil - performance.now())),
      lastTrapHitDamage: runtime.player.lastTrapHitDamage,
      stats: {
        speed: runtime.player.stats.speed,
        jump: runtime.player.stats.jump,
        walkforce: Number(playerWalkforce().toFixed(4)),
        jumpforce: Number(playerJumpforce().toFixed(4)),
        climbforce: Number(playerClimbforce().toFixed(4)),
      },
    },
    audio: {
      bgmEnabled: runtime.settings.bgmEnabled,
      sfxEnabled: runtime.settings.sfxEnabled,
      currentBgm: runtime.audioDebug.lastBgm,
      lastSfx: runtime.audioDebug.lastSfx,
      lastSfxAgeMs: runtime.audioDebug.lastSfxAtMs
        ? Math.max(0, Math.round(performance.now() - runtime.audioDebug.lastSfxAtMs))
        : null,
      sfxPlayCount: runtime.audioDebug.sfxPlayCount,
    },
    loading: {
      active: runtime.loading.active,
      loaded: runtime.loading.loaded,
      total: runtime.loading.total,
      progress: Number((runtime.loading.progress * 100).toFixed(1)),
    },
    debug: {
      overlayEnabled: runtime.debug.overlayEnabled,
      showRopes: runtime.debug.showRopes,
      showFootholds: runtime.debug.showFootholds,
      showTiles: runtime.debug.showTiles,
      showLifeMarkers: runtime.debug.showLifeMarkers,
      showHitboxes: runtime.debug.showHitboxes,
      showFps: runtime.debug.showFps,
      transitionAlpha: Number(runtime.transition.alpha.toFixed(3)),
      portalWarpInProgress: runtime.portalWarpInProgress,
      npcDialogue: runtime.npcDialogue.active ? `${runtime.npcDialogue.npcName} (${runtime.npcDialogue.lineIndex + 1}/${runtime.npcDialogue.lines.length})` : "none",
      portalScrollActive: runtime.portalScroll.active,
      portalScrollProgress: runtime.portalScroll.active && runtime.portalScroll.durationMs > 0
        ? Number(Math.min(1, runtime.portalScroll.elapsedMs / runtime.portalScroll.durationMs).toFixed(3))
        : 0,
    },
    perf: {
      updateMs: Number(runtime.perf.updateMs.toFixed(3)),
      renderMs: Number(runtime.perf.renderMs.toFixed(3)),
      frameMs: Number(runtime.perf.frameMs.toFixed(3)),
      loopIntervalMs: Number(runtime.perf.loopIntervalMs.toFixed(3)),
      p50FrameMs: Number(perfPercentile(0.5).toFixed(3)),
      p95FrameMs: Number(perfPercentile(0.95).toFixed(3)),
      drawCalls: runtime.perf.drawCalls,
      culledSprites: runtime.perf.culledSprites,
      objectsDrawn: runtime.perf.objectsDrawn,
      tilesDrawn: runtime.perf.tilesDrawn,
      lifeDrawn: runtime.perf.lifeDrawn,
      portalsDrawn: runtime.perf.portalsDrawn,
      reactorsDrawn: runtime.perf.reactorsDrawn,
    },
  };

  const nextSummaryText = JSON.stringify(summary, null, 2);
  if (isRuntimeSummaryInteractionActive()) {
    return;
  }

  if (nextSummaryText !== lastRenderedSummaryText) {
    summaryEl.textContent = nextSummaryText;
    lastRenderedSummaryText = nextSummaryText;
  }
}

function update(dt) {
  tryUsePortal();
  updatePlayer(dt);
  updateHiddenPortalState(dt);
  updatePortalAnimations(dt * 1000);
  updateFaceAnimation(dt);
  updateLifeAnimations(dt * 1000);
  updateMobTouchCollisions();
  updateMobCombatStates(dt * 1000);
  updateDamageNumbers(dt);
  updateReactorAnimations(dt * 1000);
  updateObjectAnimations(dt * 1000);
  updateTrapHazardCollisions();
  updateBackgroundAnimations(dt * 1000);
  updateGroundDrops(dt);
  updateCamera(dt);

  // Multiplayer: update remote players + send position
  if (_wsConnected) {
    updateRemotePlayers(dt);
    const now = performance.now();
    if (now - _lastPosSendTime >= 50) { // 20 Hz
      wsSend({
        type: "move",
        x: Math.round(runtime.player.x),
        y: Math.round(runtime.player.y),
        action: runtime.player.action,
        facing: runtime.player.facing,
      });
      _lastPosSendTime = now;
    }
    // Mob authority: broadcast mob state at 10Hz
    if (_isMobAuthority && now - _lastMobStateSendTime >= MOB_STATE_SEND_INTERVAL) {
      _lastMobStateSendTime = now;
      sendMobState();
    }
  }

  summaryUpdateAccumulatorMs += dt * 1000;
  if (summaryUpdateAccumulatorMs >= SUMMARY_UPDATE_INTERVAL_MS) {
    summaryUpdateAccumulatorMs = 0;
    updateSummary();
  }
}

const FIXED_STEP_MS = 1000 / 60;
const MAX_FRAME_DELTA_MS = 250;
const MAX_STEPS_PER_FRAME = 6;
let pendingLoopIntervalMs = 0;

function tick(timestampMs) {
  try {
    if (runtime.previousTimestampMs === null) {
      runtime.previousTimestampMs = timestampMs;
      requestAnimationFrame(tick);
      return;
    }

    let elapsed = timestampMs - runtime.previousTimestampMs;
    runtime.previousTimestampMs = timestampMs;

    if (!Number.isFinite(elapsed) || elapsed < 0) {
      elapsed = 0;
    }
    if (elapsed > MAX_FRAME_DELTA_MS) {
      elapsed = MAX_FRAME_DELTA_MS;
    }

    pendingLoopIntervalMs += elapsed;
    runtime.tickAccumulatorMs += elapsed;
    if (runtime.tickAccumulatorMs < FIXED_STEP_MS) {
      requestAnimationFrame(tick);
      return;
    }

    const frameStart = performance.now();

    let steps = 0;
    while (runtime.tickAccumulatorMs >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      update(FIXED_STEP_MS / 1000);
      runtime.tickAccumulatorMs -= FIXED_STEP_MS;
      steps += 1;
    }

    if (steps >= MAX_STEPS_PER_FRAME && runtime.tickAccumulatorMs > FIXED_STEP_MS * 2) {
      runtime.tickAccumulatorMs = FIXED_STEP_MS;
    }

    updateCursorAnimation(elapsed);
    updateCursorElement();

    const afterUpdate = performance.now();
    render();
    const afterRender = performance.now();

    runtime.perf.updateMs = afterUpdate - frameStart;
    runtime.perf.renderMs = afterRender - afterUpdate;
    runtime.perf.frameMs = afterRender - frameStart;
    runtime.perf.loopIntervalMs = pendingLoopIntervalMs;
    pushFramePerfSample(pendingLoopIntervalMs);
    pendingLoopIntervalMs = 0;
  } catch (err) {
    rlog(`TICK CRASH: ${err?.message ?? err}`);
    rlog(`TICK STACK: ${err?.stack ?? "N/A"}`);
    console.error("[tick crash]", err);
  }

  requestAnimationFrame(tick);
}

function findSoundNodeByName(root, soundName) {
  if (!root) return null;

  // Support path-style names like "0120100/Damage" — walk $imgdir segments
  const parts = soundName.split("/");
  let current = root;

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    const isLast = i === parts.length - 1;
    let found = null;

    for (const child of current.$$ ?? []) {
      if (child.$imgdir === segment) {
        found = child;
        break;
      }
      if (isLast && child.$sound === segment && child.basedata) {
        return child;
      }
    }

    if (!found) {
      // Fallback: recursive search for flat $sound match (BGM etc.)
      if (i === 0) {
        for (const child of current.$$ ?? []) {
          if (child.$sound === soundName && child.basedata) return child;
          const result = findSoundNodeByName(child, soundName);
          if (result) return result;
        }
      }
      return null;
    }

    // Resolve UOL references (e.g. "../0100100/Damage")
    if (found.$uol && found.value) {
      const uolPath = found.value;
      // Resolve "../" relative paths by navigating from root
      // UOL like "../0100100/Damage" means: go up one level, then into 0100100/Damage
      // Since we track path segments, resolve against root with cleaned path
      const currentPath = parts.slice(0, i);
      const uolParts = uolPath.split("/");
      const resolved = [...currentPath];
      for (const p of uolParts) {
        if (p === "..") resolved.pop();
        else if (p !== ".") resolved.push(p);
      }
      // Recurse with the resolved absolute path
      return findSoundNodeByName(root, resolved.join("/"));
    }

    if (isLast && found.basedata) return found;
    current = found;
  }

  return null;
}

function requestSoundDataUri(soundFile, soundName) {
  const key = `sound:${soundFile}:${soundName}`;

  if (soundDataUriCache.has(key)) {
    return Promise.resolve(soundDataUriCache.get(key));
  }

  if (!soundDataPromiseCache.has(key)) {
    soundDataPromiseCache.set(
      key,
      (async () => {
        const json = await fetchJson(soundPathFromName(soundFile));
        const soundNode = findSoundNodeByName(json, soundName);
        if (!soundNode?.basedata) {
          throw new Error(`Sound not found: ${soundFile}/${soundName}`);
        }

        const dataUri = `data:audio/mp3;base64,${soundNode.basedata}`;
        soundDataUriCache.set(key, dataUri);
        soundDataPromiseCache.delete(key);
        return dataUri;
      })(),
    );
  }

  return soundDataPromiseCache.get(key);
}

function unlockAudio() {
  if (runtime.audioUnlocked) return;
  runtime.audioUnlocked = true;

  // Retry pending BGM after user gesture unlocks audio
  if (runtime.settings.bgmEnabled && runtime.currentBgmPath && !runtime.bgmAudio) {
    playBgmPath(runtime.currentBgmPath);
  }
}

const BGM_FADE_DURATION_MS = 800;
const BGM_TARGET_VOLUME = 0.25;

function fadeOutAudio(audio, durationMs) {
  if (!audio) return;
  const startVol = audio.volume;
  const startTime = performance.now();
  const tick = () => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / durationMs, 1);
    audio.volume = startVol * (1 - t);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      audio.pause();
      audio.volume = 0;
    }
  };
  requestAnimationFrame(tick);
}

async function playBgmPath(bgmPath) {
  if (!bgmPath) return;

  runtime.currentBgmPath = bgmPath;
  runtime.audioDebug.lastBgm = bgmPath;
  if (!runtime.settings.bgmEnabled) return;

  const [soundFile, soundName] = bgmPath.split("/");
  if (!soundFile || !soundName) return;

  try {
    const dataUri = await requestSoundDataUri(soundFile, soundName);

    if (runtime.currentBgmPath !== bgmPath) {
      return;
    }

    // Fade out previous BGM instead of hard stop
    if (runtime.bgmAudio) {
      fadeOutAudio(runtime.bgmAudio, BGM_FADE_DURATION_MS);
      runtime.bgmAudio = null;
    }

    const audio = new Audio(dataUri);
    audio.loop = true;
    audio.volume = BGM_TARGET_VOLUME;
    runtime.bgmAudio = audio;

    await audio.play();
    runtime.audioUnlocked = true;
  } catch (error) {
    if (error.name === "NotAllowedError") {
      // Browser autoplay blocked — clear bgmAudio so unlockAudio() can retry
      runtime.bgmAudio = null;
      console.info("[audio] BGM blocked by autoplay policy, will retry on user gesture");
    } else {
      console.warn("[audio] bgm failed", error);
    }
  }
}

const SFX_POOL_SIZE = 8;
const sfxPool = new Map(); // key -> Audio[]

function getSfxFromPool(dataUri) {
  let pool = sfxPool.get(dataUri);
  if (!pool) {
    pool = [];
    sfxPool.set(dataUri, pool);
  }

  // Find an idle audio element
  for (const audio of pool) {
    if (audio.paused || audio.ended) {
      audio.currentTime = 0;
      return audio;
    }
  }

  // Create a new one if pool isn't full
  if (pool.length < SFX_POOL_SIZE) {
    const audio = new Audio(dataUri);
    audio.volume = 0.45;
    pool.push(audio);
    return audio;
  }

  // All busy — skip this SFX
  return null;
}

async function playSfx(soundFile, soundName) {
  runtime.audioDebug.lastSfx = `${soundFile}/${soundName}`;
  runtime.audioDebug.lastSfxAtMs = performance.now();
  runtime.audioDebug.sfxPlayCount += 1;

  if (!runtime.settings.sfxEnabled) return;

  try {
    const dataUri = await requestSoundDataUri(soundFile, soundName);
    const audio = getSfxFromPool(dataUri);
    if (audio) {
      audio.volume = 0.45;
      audio.play().catch(() => {});
    }
  } catch (error) {
    console.warn("[audio] sfx failed", soundFile, soundName, error);
  }
}

// Default mob sounds (Snail — 0100100, the most common base mob)
const DEFAULT_MOB_HIT_SOUND = "0100100/Damage";
const DEFAULT_MOB_DIE_SOUND = "0100100/Die";

/**
 * Play a mob sound effect with fallback to default (Snail) if not found.
 * C++ loads hitsound/diesound from Sound["Mob.img"][strid]; if the node is
 * empty the Sound stays id=0 and play() is a no-op. We improve on this by
 * falling back to the most common mob sound.
 */
async function playMobSfx(mobId, soundType) {
  const paddedId = mobId.replace(/^0+/, "").padStart(7, "0");
  const soundName = `${paddedId}/${soundType}`;
  const fallbackName = soundType === "Die" ? DEFAULT_MOB_DIE_SOUND : DEFAULT_MOB_HIT_SOUND;

  runtime.audioDebug.lastSfx = `Mob.img/${soundName}`;
  runtime.audioDebug.lastSfxAtMs = performance.now();
  runtime.audioDebug.sfxPlayCount += 1;

  if (!runtime.settings.sfxEnabled) return;

  try {
    const dataUri = await requestSoundDataUri("Mob.img", soundName);
    const audio = getSfxFromPool(dataUri);
    if (audio) { audio.volume = 0.45; audio.play().catch(() => {}); }
  } catch (_) {
    // Mob-specific sound not found — try default
    try {
      const dataUri = await requestSoundDataUri("Mob.img", fallbackName);
      const audio = getSfxFromPool(dataUri);
      if (audio) { audio.volume = 0.45; audio.play().catch(() => {}); }
    } catch (e2) {
      console.warn("[audio] mob sfx fallback failed", soundName, e2);
    }
  }
}

async function loadMap(mapId, spawnPortalName = null, spawnFromPortalTransfer = false) {
  rlog(`loadMap START mapId=${mapId} portal=${spawnPortalName} transfer=${spawnFromPortalTransfer}`);
  // Stand up from chair on map change
  runtime.player.chairId = 0;
  // Clear remote players and mob authority on map change
  remotePlayers.clear();
  remoteEquipData.clear();
  remoteLookData.clear();
  remoteTemplateCache.clear();
  _isMobAuthority = false;

  const loadToken = runtime.mapLoadToken + 1;
  runtime.mapLoadToken = loadToken;

  runtime.loading.active = true;
  rlog(`loading.active = true`);
  runtime.loading.total = 0;
  runtime.loading.loaded = 0;
  runtime.loading.progress = 0;
  groundDrops.length = 0;
  reactorRuntimeState.clear();
  cancelItemDrag();
  runtime.loading.label = "Preparing map data...";

  // Hide chat UI during loading
  if (chatBarEl) chatBarEl.style.display = "none";
  if (chatLogEl) chatLogEl.style.display = "none";

  // Start loading map string names in background (non-blocking)
  loadMapStringData().catch(() => {});
  // Preload WZ damage number digit sprites (non-blocking)
  loadDamageNumberSprites().catch(() => {});

  try {
    const requestedMapId = String(mapId).trim();
    const resolvedMapId = MAP_ID_REDIRECTS[requestedMapId] ?? requestedMapId;
    if (resolvedMapId !== requestedMapId) {
      rlog(`loadMap redirect mapId ${requestedMapId} -> ${resolvedMapId}`);
      addSystemChatMessage(`[Info] Map ${requestedMapId} is unavailable in this build. Redirected to ${resolvedMapId}.`);
    }

    setStatus(`Loading map ${resolvedMapId}...`);

    const path = mapPathFromId(resolvedMapId);
    rlog(`loadMap fetchJson ${path}`);
    const raw = await fetchJson(path);
    if (loadToken !== runtime.mapLoadToken) { rlog(`loadMap ABORTED (token mismatch after fetchJson)`); return; }

    rlog(`loadMap parseMapData...`);
    runtime.mapId = resolvedMapId;
    runtime.map = parseMapData(raw);

    // Assign map-specific minimap image key (invalidates cache on map change)
    if (runtime.map.miniMap) {
      runtime.map.miniMap.imageKey = `minimap:${runtime.mapId}`;
    }

    rlog(`loadMap preloadMapAssets START`);
    await preloadMapAssets(runtime.map, loadToken);
    if (loadToken !== runtime.mapLoadToken) { rlog(`loadMap ABORTED (token mismatch after preload)`); return; }
    rlog(`loadMap preloadMapAssets DONE (${runtime.loading.loaded}/${runtime.loading.total})`);

    buildMapTrapHazardIndex(runtime.map);
    rlog(`loadMap trapHazards indexed=${runtime.map.trapHazards?.length ?? 0}`);

    // ── Initialize player position + state AFTER assets are loaded ──
    const spawnPortalByName = spawnPortalName
      ? runtime.map.portalEntries.find((portal) => portal.name === spawnPortalName)
      : null;
    const spawnPortal =
      spawnPortalByName ??
      runtime.map.portalEntries.find((portal) => portal.type === 0) ??
      runtime.map.portalEntries[0];

    runtime.player.x = spawnPortal ? spawnPortal.x : 0;
    runtime.player.y = spawnPortal
      ? spawnPortal.y - (spawnFromPortalTransfer ? PORTAL_SPAWN_Y_OFFSET : 0)
      : 0;
    runtime.player.prevX = runtime.player.x;
    runtime.player.prevY = runtime.player.y;
    runtime.player.vx = 0;
    runtime.player.vy = 0;
    runtime.player.onGround = false;
    runtime.player.climbing = false;
    runtime.player.climbRope = null;
    runtime.player.climbCooldownUntil = 0;
    runtime.player.reattachLockUntil = 0;
    runtime.player.reattachLockRopeKey = null;
    runtime.player.downJumpIgnoreFootholdId = null;
    runtime.player.downJumpIgnoreUntil = 0;
    runtime.player.downJumpControlLock = false;
    runtime.player.downJumpTargetFootholdId = null;
    runtime.player.trapInvincibleUntil = 0;
    runtime.player.lastTrapHitAt = 0;
    runtime.player.lastTrapHitDamage = 0;
    runtime.player.fallStartY = runtime.player.y;

    const spawnFoothold = findFootholdAtXNearY(runtime.map, runtime.player.x, runtime.player.y + 2, 90);
    runtime.player.footholdId = spawnFoothold?.line.id ?? null;
    runtime.player.footholdLayer = spawnFoothold?.line.layer ?? 3;

    runtime.player.action = "stand1";
    runtime.player.frameIndex = 0;
    runtime.player.frameTimer = 0;
    runtime.lastRenderableCharacterFrame = null;
    runtime.lastCharacterBounds = null;
    runtime.standardCharacterWidth = DEFAULT_STANDARD_CHARACTER_WIDTH;
    characterPlacementTemplateCache.clear();

    runtime.faceAnimation.expression = "default";
    runtime.faceAnimation.frameIndex = 0;
    runtime.faceAnimation.frameTimerMs = 0;
    runtime.faceAnimation.blinkCooldownMs = randomBlinkCooldownMs();
    runtime.faceAnimation.overrideExpression = null;
    runtime.faceAnimation.overrideUntilMs = 0;

    runtime.camera.x = clampCameraXToMapBounds(runtime.map, runtime.player.x);
    runtime.camera.y = clampCameraYToMapBounds(runtime.map, runtime.player.y - cameraHeightBias());
    runtime.backgroundViewAnchorY = canvasEl.height / 2 - runtime.camera.y;
    runtime.portalScroll.active = false;
    runtime.portalScroll.elapsedMs = 0;
    runtime.portalAnimation.regularFrameIndex = 0;
    runtime.portalAnimation.regularTimerMs = 0;
    runtime.portalAnimation.hiddenFrameIndex = 0;
    runtime.portalAnimation.hiddenTimerMs = 0;
    runtime.hiddenPortalState.clear();

    runtime.loading.progress = 1;
    runtime.loading.label = "Assets loaded";
    runtime.loading.active = false;
    stopLoginBgm();
    showHudButtons();
    rlog(`loading.active = false (success)`);

    // Initialize animation states
    rlog(`loadMap initLifeRuntimeStates...`);
    initLifeRuntimeStates();
    initReactorRuntimeStates();
    objectAnimStates.clear();
    bgAnimStates.clear();
    bgMotionStates.clear();
    portalFrameWarmupRequested.clear();
    closeNpcDialogue();
    damageNumbers.length = 0;

    // Restore chat UI after loading
    if (chatBarEl) chatBarEl.style.display = "";
    if (chatLogEl) chatLogEl.style.display = "";

    playBgmPath(String(runtime.map.info.bgm ?? ""));

    // (mapId is no longer written to URL — use the debug panel to teleport)

    // Show map name banner
    showMapBanner(runtime.mapId);

    setStatus(`Loaded map ${runtime.mapId}. Click/hover canvas to control. Controls: ←/→ move, Space jump, ↑ grab rope, ↑/↓ climb, ↓ crouch, Enter to chat.`);
    const _welcomePhrases = [
      "May the Maple Goddess watch over you! 🍁",
      "Another adventurer arrives in Maple World!",
      "The mushrooms tremble at your presence.",
      "Your journey continues… press Enter to chat!",
      "Welcome back, Mapler! The world awaits.",
      "Henesys smells like fresh potions today.",
      "The slimes are restless… stay sharp!",
      "A wild adventurer appeared!",
      "No botting, just vibes. 🍄",
      "Grab your weapon — it's MapleStory time!",
      "The Black Mage can wait. Enjoy the scenery.",
      "Pro tip: don't fall off the ropes.",
      "Somewhere, a snail is plotting revenge.",
      "Legend says there's meso in every barrel.",
      "Keep your potions close and your mesos closer.",
      "The Maple World is brighter with you in it! ✨",
      "Watch out for those Orange Mushrooms…",
      "Remember: loot first, ask questions later.",
      "Time to grind! Or just vibe. Your call.",
      "Ellinia's forests whisper your name.",
    ];
    addSystemChatMessage(`Welcome — ${_welcomePhrases[Math.floor(Math.random() * _welcomePhrases.length)]}`);
    if (runtime.map?.swim) {
      addSystemChatMessage(`[Info] This is a water environment. Use arrow keys or Space to swim when airborne.`);
    }
    rlog(`loadMap COMPLETE mapId=${runtime.mapId}`);
  } catch (error) {
    rlog(`loadMap ERROR: ${error instanceof Error ? error.message : String(error)}`);
    rlog(`loadMap ERROR stack: ${error instanceof Error ? error.stack : "N/A"}`);
    if (loadToken === runtime.mapLoadToken) {
      runtime.loading.active = false;
      stopLoginBgm();
      rlog(`loading.active = false (error path)`);
      runtime.loading.label = "";
      runtime.loading.progress = 0;
      runtime.loading.total = 0;
      runtime.loading.loaded = 0;
    }

    // Restore chat UI on error
    if (chatBarEl) chatBarEl.style.display = "";
    if (chatLogEl) chatLogEl.style.display = "";

    setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function bindInput() {
  // Build gameplay keys dynamically from current keybinds
  function getGameplayKeys() {
    const keys = new Set();
    for (const code of Object.values(runtime.keybinds)) {
      if (code) keys.add(code);
    }
    // Always include these for preventDefault (browser scroll prevention)
    for (const k of ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space","PageUp","PageDown","Home","End","Tab"]) {
      keys.add(k);
    }
    return keys;
  }

  function setInputEnabled(enabled) {
    runtime.input.enabled = enabled;
    if (!enabled) {
      resetGameplayInput();
    }
  }

  canvasEl.addEventListener("mousemove", (e) => {
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;

    // Track WZ cursor position (canvas-space and viewport-space)
    wzCursor.x = Math.round(screenX);
    wzCursor.y = Math.round(screenY);
    wzCursor.clientX = e.clientX;
    wzCursor.clientY = e.clientY;

    runtime.mouseWorld.x = screenX - gameViewWidth() / 2 + runtime.camera.x;

    // Handle hover for NPC dialogue options or NPC sprites — set cursor state
    if (runtime.npcDialogue.active) {
      let foundOption = -1;
      for (const hb of _npcDialogueOptionHitBoxes) {
        if (screenX >= hb.x && screenX <= hb.x + hb.w && screenY >= hb.y && screenY <= hb.y + hb.h) {
          foundOption = hb.index;
          break;
        }
      }
      runtime.npcDialogue.hoveredOption = foundOption;
      // Any hit box match (options, Next, Cancel) → clickable cursor
      if (!wzCursor.clickState) setCursorState(foundOption !== -1 ? CURSOR_CANCLICK : CURSOR_IDLE);
    } else if (!runtime.loading.active && !runtime.portalWarpInProgress && runtime.map) {
      const npc = findNpcAtScreen(screenX, screenY);
      if (!wzCursor.clickState) setCursorState(npc ? CURSOR_CANCLICK : CURSOR_IDLE);
    } else {
      if (!wzCursor.clickState) setCursorState(CURSOR_IDLE);
    }
    runtime.mouseWorld.y = screenY - gameViewHeight() / 2 + runtime.camera.y;
  });

  canvasEl.addEventListener("mouseenter", () => { setInputEnabled(true); });
  canvasEl.addEventListener("mouseleave", () => { setInputEnabled(false); });

  // Track cursor position globally so it stays visible over UI overlays
  const _wrapperEl = canvasEl.parentElement;
  if (_wrapperEl) {
    _wrapperEl.addEventListener("mouseenter", () => { wzCursor.visible = true; });
    _wrapperEl.addEventListener("mouseleave", () => {
      // Don't hide cursor if a full-screen overlay is open (modal steals mouseleave)
      const hasOverlay = !document.getElementById("character-create-overlay")?.classList.contains("hidden")
        || !document.getElementById("logout-confirm-overlay")?.classList.contains("hidden")
        || !document.getElementById("claim-overlay")?.classList.contains("hidden");
      if (!hasOverlay) { wzCursor.visible = false; updateCursorElement(); }
    });
    _wrapperEl.addEventListener("mousemove", (e) => {
      wzCursor.clientX = e.clientX;
      wzCursor.clientY = e.clientY;
      wzCursor.visible = true;
      updateCursorElement();
    });
    // Drop item on map when clicking anywhere outside inventory/equip UI slots
    _wrapperEl.addEventListener("pointerdown", (e) => {
      if (!draggedItem.active) return;
      // If the click target is inside an inventory/equip grid slot, let it handle swap/move
      const target = e.target;
      if (target.closest?.("#inv-grid") || target.closest?.("#equip-grid")) return;
      // Clicked outside inventory slots — drop to ground
      dropItemOnMap();
    });
  }
  canvasEl.addEventListener("focus", () => setInputEnabled(true));
  canvasEl.addEventListener("blur", () => setInputEnabled(false));
  canvasEl.addEventListener("pointerdown", (e) => {
    canvasEl.focus();
    setInputEnabled(true);
    wzCursor.clickState = true;
    setCursorState(CURSOR_CLICKING);
    playUISound("BtMouseClick");

    // If dragging an item and clicking the game canvas, drop it on the map
    if (draggedItem.active) {
      dropItemOnMap();
      return;
    }

    const rect = canvasEl.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasEl.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvasEl.height / rect.height);

    // If NPC dialogue is open — only buttons/options are clickable
    if (runtime.npcDialogue.active) {
      for (const hb of _npcDialogueOptionHitBoxes) {
        if (cx >= hb.x && cx <= hb.x + hb.w && cy >= hb.y && cy <= hb.y + hb.h) {
          if (hb.index === -99) {
            closeNpcDialogue();
            return;
          }
          if (hb.index === -98) {
            advanceNpcDialogue();
            return;
          }
          const currentLine = runtime.npcDialogue.lines[runtime.npcDialogue.lineIndex];
          if (typeof currentLine === "object" && currentLine.options && currentLine.options[hb.index]) {
            rlog(`NPC option selected: ${currentLine.options[hb.index].label}`);
            currentLine.options[hb.index].action();
          }
          return;
        }
      }
      // Click outside any button — do nothing, block other interactions
      return;
    }

    // Check minimap toggle button (−/+)
    if (minimapToggleHitBox) {
      const hb = minimapToggleHitBox;
      if (cx >= hb.x && cx <= hb.x + hb.w && cy >= hb.y && cy <= hb.y + hb.h) {
        minimapCollapsed = !minimapCollapsed;
        return;
      }
    }

    // Check NPC click (only when not loading/transitioning)
    if (!runtime.loading.active && !runtime.portalWarpInProgress && runtime.map) {
      const npc = findNpcAtScreen(cx, cy);
      if (npc) {
        openNpcDialogue(npc);
      }
    }
  });

  canvasEl.addEventListener("pointerup", () => {
    wzCursor.clickState = false;
    // Restore hover-appropriate cursor state (C++ parity: release passes through UI state)
    let nextState = CURSOR_IDLE;
    if (runtime.npcDialogue.active) {
      nextState = runtime.npcDialogue.hoveredOption !== -1 ? CURSOR_CANCLICK : CURSOR_IDLE;
    } else if (!runtime.loading.active && !runtime.portalWarpInProgress && runtime.map) {
      const npc = findNpcAtScreen(wzCursor.x, wzCursor.y);
      if (npc) nextState = CURSOR_CANCLICK;
    }
    setCursorState(nextState);
  });

  canvasEl.addEventListener("dblclick", (e) => {
    if (runtime.loading.active || runtime.portalWarpInProgress || runtime.npcDialogue.active) return;
    const rect = canvasEl.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasEl.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvasEl.height / rect.height);
    const rp = findRemotePlayerAtScreen(cx, cy);
    if (rp) {
      showPlayerInfoModal(rp);
    }
  });

  window.addEventListener("keydown", (event) => {
    // Keybind configurator intercepts when listening
    if (activeKeybindBtn && handleKeybindKey(event)) return;

    if (event.code === "Enter") {
      if (runtime.npcDialogue.active) {
        event.preventDefault();
        advanceNpcDialogue();
        return;
      }
      if (runtime.chat.inputActive) {
        event.preventDefault();
        const text = chatInputEl?.value ?? "";
        if (text.trim()) {
          sendChatMessage(text);
        }
        closeChatInput();
        return;
      }

      if (runtime.input.enabled) {
        const active = document.activeElement;
        if (!active || active === canvasEl || active === document.body) {
          event.preventDefault();
          openChatInput();
          return;
        }
      }
    }

    if (event.code === "Escape") {
      if (draggedItem.active) {
        event.preventDefault();
        cancelItemDrag();
        return;
      }
      if (runtime.npcDialogue.active) {
        event.preventDefault();
        closeNpcDialogue();
        return;
      }
      if (runtime.chat.inputActive) {
        event.preventDefault();
        closeChatInput();
        return;
      }
      // Close any open UI windows
      {
        let closed = false;
        for (const k of ["settings", "equip", "inventory", "keybinds"]) {
          if (isUIWindowVisible(k)) {
            const el = getUIWindowEl(k);
            if (el) el.classList.add("hidden");
            closed = true;
          }
        }
        if (closed) { event.preventDefault(); return; }
      }
    }

    if (event.code === "Space" && event.ctrlKey) {
      event.preventDefault();
      setMouseFly(!runtime.debug.mouseFly);
      return;
    }

    if (runtime.chat.inputActive) return;

    const active = document.activeElement;
    if (active && active !== canvasEl && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) {
      return;
    }

    // UI window toggles — work even when mouse is over a game window (input disabled)
    if (event.code === runtime.keybinds.equip && !event.repeat) { toggleUIWindow("equip"); return; }
    if (event.code === runtime.keybinds.inventory && !event.repeat) { toggleUIWindow("inventory"); return; }
    if (event.code === runtime.keybinds.keybinds && !event.repeat) { toggleUIWindow("keybinds"); return; }

    if (!runtime.input.enabled) return;
    if (event.code === runtime.keybinds.loot && !event.repeat) {
      event.preventDefault();
      tryLootDrop();
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space",
         "PageUp", "PageDown", "Home", "End", "Tab"].includes(event.code)) {
      event.preventDefault();
    }

    // Face expression hotkeys (configurable via keybinds)
    const FACE_EXPRESSIONS = {
      face1: "hit",        // F1 — pain
      face2: "smile",      // F2 — happy
      face3: "troubled",   // F3 — troubled
      face4: "cry",        // F4 — cry
      face5: "angry",      // F5 — angry
      face6: "bewildered", // F6 — surprised
      face7: "stunned",    // F7 — shocked
      face8: "chu",        // F8 — tongue
      face9: "hum",        // F9 — snoozing
    };
    for (const [action, expr] of Object.entries(FACE_EXPRESSIONS)) {
      if (event.code === runtime.keybinds[action] && !event.repeat) {
        const now = performance.now();
        // Emote cooldown: 1s between emote changes
        if (now - _lastEmoteTime < 1000) return;
        _lastEmoteTime = now;
        runtime.faceAnimation.overrideExpression = expr;
        runtime.faceAnimation.overrideUntilMs = now + 2500;
        runtime.faceAnimation.expression = expr;
        runtime.faceAnimation.frameIndex = 0;
        runtime.faceAnimation.frameTimerMs = 0;
        wsSend({ type: "face", expression: expr });
        return;
      }
    }

    if (!getGameplayKeys().has(event.code)) return;

    // Movement keys (configurable, default arrow keys)
    if (event.code === runtime.keybinds.moveLeft) runtime.input.left = true;
    if (event.code === runtime.keybinds.moveRight) runtime.input.right = true;
    if (event.code === runtime.keybinds.moveUp) {
      runtime.input.up = true;
      void tryUsePortal(true);
    }
    if (event.code === runtime.keybinds.moveDown) runtime.input.down = true;

    // Jump key (configurable, default Space)
    if (event.code === runtime.keybinds.jump) {
      if (!runtime.input.jumpHeld) {
        runtime.input.jumpQueued = true;
      }
      runtime.input.jumpHeld = true;
    }

    // Attack key (configurable, default C) — ignore held-key repeats
    if (event.code === runtime.keybinds.attack && !event.repeat) {
      event.preventDefault();
      performAttack();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (runtime.chat.inputActive) return;

    if (!runtime.input.enabled) return;

    const active = document.activeElement;
    if (active && active !== canvasEl && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) {
      return;
    }

    if (!getGameplayKeys().has(event.code)) return;

    if (event.code === runtime.keybinds.moveLeft) runtime.input.left = false;
    if (event.code === runtime.keybinds.moveRight) runtime.input.right = false;
    if (event.code === runtime.keybinds.moveUp) runtime.input.up = false;
    if (event.code === runtime.keybinds.moveDown) runtime.input.down = false;

    if (event.code === runtime.keybinds.jump) {
      runtime.input.jumpHeld = false;
    }
  });
}

mapFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mapId = mapIdInputEl.value.trim();
  if (!mapId) return;

  if (_wsConnected) {
    // Online: server-authoritative — send admin_warp, wait for change_map
    try {
      const result = await requestServerMapChange({ type: "admin_warp", map_id: mapId });
      await loadMap(result.map_id, result.spawn_portal || null);
      saveCharacter();
      wsSend({ type: "map_loaded" });
    } catch (err) {
      rlog(`admin_warp failed: ${err?.message ?? err}`);
      setStatus(`Warp failed: ${err?.message ?? err}`);
    }
  } else {
    // Offline: direct load
    loadMap(mapId);
  }
});

teleportFormEl?.addEventListener("submit", (event) => {
  event.preventDefault();

  const x = Number(teleportXInputEl?.value ?? "");
  const y = Number(teleportYInputEl?.value ?? "");

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    setStatus("Teleport failed: enter valid numeric X/Y values.");
    return;
  }

  saveCachedTeleportPreset(x, y);
  applyManualTeleport(x, y);
});

teleportButtonEl?.addEventListener("click", () => {
  teleportFormEl?.requestSubmit();
});

chatInputEl?.addEventListener("blur", () => {
  if (runtime.chat.inputActive) {
    closeChatInput();
  }
});

chatInputEl?.addEventListener("mousedown", (e) => {
  if (!runtime.chat.inputActive) {
    e.preventDefault();
    openChatInput();
  }
});

for (const toggle of [debugOverlayToggleEl, debugRopesToggleEl, debugFootholdsToggleEl, debugTilesToggleEl, debugLifeToggleEl, debugHitboxesToggleEl, debugUISlotsToggleEl, debugFpsToggleEl, debugMouseFlyToggleEl]) {
  if (!toggle) continue;
  toggle.addEventListener("change", () => {
    syncDebugTogglesFromUi();
  });
}

copySummaryButtonEl?.addEventListener("click", () => {
  void copyRuntimeSummaryToClipboard();
});

statSpeedInputEl?.addEventListener("change", () => applyStatInputChange());
statJumpInputEl?.addEventListener("change", () => applyStatInputChange());
statSpeedInputEl?.addEventListener("input", () => applyStatInputChange());
statJumpInputEl?.addEventListener("input", () => applyStatInputChange());

summaryEl?.addEventListener("pointerdown", () => {
  runtimeSummaryPointerSelecting = true;
});

window.addEventListener("pointerup", () => {
  runtimeSummaryPointerSelecting = false;
});

summaryEl?.addEventListener("blur", () => {
  runtimeSummaryPointerSelecting = false;
});

loadSettings();
syncSettingsToUI();
applyFixedRes();
// Note: initPlayerEquipment() and initPlayerInventory() are called conditionally
// in the startup block below — either from applyCharacterSave() or after character creation.
initUIWindowDrag();
refreshUIWindows();

// Wire inventory tab buttons
for (const btn of document.querySelectorAll("#inv-tabs .inv-tab")) {
  btn.addEventListener("click", () => {
    currentInvTab = btn.dataset.tab;
    refreshInvGrid();
  });
}

void loadCursorAssets();
initializeTeleportPresetInputs();
initializeStatInputs();
initChatLogResize();
bindCanvasResizeHandling();

// ── HUD button tooltips ──
const hudTooltipEl = document.getElementById("hud-tooltip");
for (const btn of document.querySelectorAll(".hud-button[data-tooltip]")) {
  btn.addEventListener("mouseenter", () => {
    if (!hudTooltipEl) return;
    hudTooltipEl.textContent = btn.dataset.tooltip;
    hudTooltipEl.style.display = "block";
    const br = btn.getBoundingClientRect();
    const wr = btn.closest(".canvas-wrapper")?.getBoundingClientRect() || { left: 0, top: 0 };
    const tt = hudTooltipEl.getBoundingClientRect();
    hudTooltipEl.style.top = `${br.bottom - wr.top + 6}px`;
    hudTooltipEl.style.left = `${br.left - wr.left + br.width / 2 - tt.width / 2}px`;
  });
  btn.addEventListener("mouseleave", () => {
    if (hudTooltipEl) hudTooltipEl.style.display = "none";
  });
}

function showHudButtons() {
  for (const btn of document.querySelectorAll(".hud-button.hud-hidden")) {
    btn.classList.remove("hud-hidden");
  }
  // Re-hide claim button if already claimed or offline
  updateClaimUI();
}

debugToggleEl?.addEventListener("click", () => {
  debugPanelEl?.classList.toggle("hidden");
});

debugCloseEl?.addEventListener("click", () => {
  debugPanelEl?.classList.add("hidden");
  canvasEl.focus();
});

// ── Settings modal ──
settingsButtonEl?.addEventListener("click", () => {
  toggleUIWindow("settings");
});

keybindsButtonEl?.addEventListener("click", () => {
  toggleUIWindow("keybinds");
  canvasEl.focus();
});

settingsBgmToggleEl?.addEventListener("change", () => {
  runtime.settings.bgmEnabled = settingsBgmToggleEl.checked;
  saveSettings();
  if (!runtime.settings.bgmEnabled && runtime.bgmAudio) {
    runtime.bgmAudio.pause();
  } else if (runtime.settings.bgmEnabled && runtime.currentBgmPath) {
    playBgmPath(runtime.currentBgmPath);
  }
});

settingsSfxToggleEl?.addEventListener("change", () => {
  runtime.settings.sfxEnabled = settingsSfxToggleEl.checked;
  saveSettings();
});

settingsFixedResEl?.addEventListener("change", () => {
  runtime.settings.fixedRes = settingsFixedResEl.checked;
  saveSettings();
  applyFixedRes();
});

settingsMinimapToggleEl?.addEventListener("change", () => {
  runtime.settings.minimapVisible = settingsMinimapToggleEl.checked;
  saveSettings();
});

// Claim account HUD button (only shown when unclaimed, online mode)
let _accountClaimed = false;
function updateClaimUI() {
  if (claimHudButton) {
    if (_accountClaimed || !window.__MAPLE_ONLINE__) {
      claimHudButton.classList.add("hud-hidden");
      claimHudButton.style.display = "none";
    } else {
      claimHudButton.classList.remove("hud-hidden");
      claimHudButton.style.display = "";
    }
  }
  // Update logout text based on claim status
  if (logoutConfirmTextEl) {
    logoutConfirmTextEl.innerHTML = _accountClaimed
      ? "Are you sure you want to log out?<br>You can log back in with your username and password."
      : "Are you sure you want to log out?<br><strong>Your character has not been claimed and will be lost!</strong>";
  }
}
// Check claim status on load (online mode)
if (window.__MAPLE_ONLINE__) {
  fetch("/api/character/claimed", { headers: { "Authorization": "Bearer " + sessionId } })
    .then(r => r.json()).then(b => { if (b.ok) { _accountClaimed = b.claimed; updateClaimUI(); } })
    .catch(() => {});
}
claimHudButton?.addEventListener("click", () => {
  if (claimOverlayEl) claimOverlayEl.classList.remove("hidden");
  if (claimPasswordInput) claimPasswordInput.value = "";
  if (claimPasswordConfirm) claimPasswordConfirm.value = "";
  if (claimErrorEl) claimErrorEl.textContent = "";
  claimPasswordInput?.focus();
});
claimCancelBtn?.addEventListener("click", () => {
  if (claimOverlayEl) claimOverlayEl.classList.add("hidden");
});
claimConfirmBtn?.addEventListener("click", async () => {
  const pw = claimPasswordInput?.value || "";
  const cfm = claimPasswordConfirm?.value || "";
  if (pw.length < 4) { if (claimErrorEl) claimErrorEl.textContent = "Password must be at least 4 characters"; return; }
  if (pw !== cfm) { if (claimErrorEl) claimErrorEl.textContent = "Passwords do not match"; return; }
  if (claimConfirmBtn) claimConfirmBtn.disabled = true;
  try {
    const resp = await fetch("/api/character/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + sessionId },
      body: JSON.stringify({ password: pw }),
    });
    const result = await resp.json();
    if (!result.ok) {
      if (claimErrorEl) claimErrorEl.textContent = result.error?.message || "Claim failed";
      if (claimConfirmBtn) claimConfirmBtn.disabled = false;
      return;
    }
    _accountClaimed = true;
    updateClaimUI();
    if (claimOverlayEl) claimOverlayEl.classList.add("hidden");
    addSystemChatMessage("✅ Account claimed! You can now log in with your username and password.");
  } catch {
    if (claimErrorEl) claimErrorEl.textContent = "Server error — try again";
    if (claimConfirmBtn) claimConfirmBtn.disabled = false;
  }
});

// Logout button
settingsLogoutBtn?.addEventListener("click", () => {
  updateClaimUI(); // refresh logout text based on claim status
  if (logoutConfirmEl) logoutConfirmEl.classList.remove("hidden");
});
logoutConfirmNoEl?.addEventListener("click", () => {
  if (logoutConfirmEl) logoutConfirmEl.classList.add("hidden");
});
logoutConfirmYesEl?.addEventListener("click", () => {
  // Clear all session/save data
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(CHARACTER_SAVE_KEY);
  localStorage.removeItem(SETTINGS_CACHE_KEY);
  // Disconnect WS if connected
  if (_ws) { try { _ws.close(); } catch {} }
  // Reload page — will show character creation overlay
  window.location.reload();
});

// ─── Key Bindings Configurator ──────────────────────────────────────────────


/** Convert event.code to display name */
function keyCodeToDisplay(code) {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  return code.replace(/([A-Z])/g, " $1").trim();
}

function loadKeybinds() {
  const parsed = loadJsonFromStorage(KEYBINDS_STORAGE_KEY);
  if (!parsed) return;
  for (const key of Object.keys(runtime.keybinds)) {
    if (typeof parsed[key] === "string") runtime.keybinds[key] = parsed[key];
  }
}

function saveKeybinds() {
  saveJsonToStorage(KEYBINDS_STORAGE_KEY, runtime.keybinds);
}

function syncKeybindButtons() {
  for (const btn of document.querySelectorAll(".keybind-btn")) {
    const action = btn.dataset.action;
    if (action && runtime.keybinds[action]) {
      btn.textContent = keyCodeToDisplay(runtime.keybinds[action]);
    }
  }
}

let activeKeybindBtn = null;

function startKeybindListening(btn) {
  if (activeKeybindBtn) {
    activeKeybindBtn.classList.remove("listening");
    activeKeybindBtn.textContent = keyCodeToDisplay(runtime.keybinds[activeKeybindBtn.dataset.action]);
  }
  activeKeybindBtn = btn;
  btn.classList.add("listening");
  btn.textContent = "Press key…";
}

function handleKeybindKey(event) {
  if (!activeKeybindBtn) return false;

  event.preventDefault();
  event.stopPropagation();

  const code = event.code;
  // Don't allow Escape (reserved) or Enter (reserved for chat)
  if (code === "Escape") {
    activeKeybindBtn.classList.remove("listening");
    activeKeybindBtn.textContent = keyCodeToDisplay(runtime.keybinds[activeKeybindBtn.dataset.action]);
    activeKeybindBtn = null;
    return true;
  }
  if (code === "Enter") return true;

  const action = activeKeybindBtn.dataset.action;
  runtime.keybinds[action] = code;
  saveKeybinds();

  activeKeybindBtn.classList.remove("listening");
  activeKeybindBtn.textContent = keyCodeToDisplay(code);
  activeKeybindBtn = null;
  return true;
}

// Attach click listeners to keybind buttons
for (const btn of document.querySelectorAll(".keybind-btn")) {
  btn.addEventListener("click", () => startKeybindListening(btn));
}

loadKeybinds();
syncKeybindButtons();

// Close settings on click outside modal content


// Unlock audio on first user interaction (browser autoplay policy)
{
  const audioUnlockEvents = ["click", "keydown", "touchstart"];
  function onFirstInteraction() {
    unlockAudio();
    for (const ev of audioUnlockEvents) {
      document.removeEventListener(ev, onFirstInteraction);
    }
  }
  for (const ev of audioUnlockEvents) {
    document.addEventListener(ev, onFirstInteraction, { passive: true });
  }
}

bindInput();
requestAnimationFrame(tick);

// Start loading screen asset preload in background (non-blocking)
preloadLoadingScreenAssets();

// ── Auto-save timer + page unload save ──
setInterval(saveCharacter, 30_000);
window.addEventListener("beforeunload", () => {
  if (window.__MAPLE_ONLINE__) {
    // sendBeacon is reliable during unload (fetch may be cancelled)
    try {
      const save = buildCharacterSave();
      const blob = new Blob([JSON.stringify(save)], { type: "application/json" });
      navigator.sendBeacon("/api/character/save?session=" + sessionId, blob);
    } catch {}
  } else {
    saveCharacter();
  }
});

// ── Character load / create → first map load ──
(async () => {
  const savedCharacter = await loadCharacter();
  let startMapId, startPortalName;

  if (savedCharacter) {
    const restored = applyCharacterSave(savedCharacter);
    startMapId = restored.mapId ?? "100000001";
    startPortalName = restored.spawnPortal ?? null;
    rlog("Loaded character from save: " + savedCharacter.identity.name);
  } else {
    // New player — show character creation overlay
    const { name, gender } = await showCharacterCreateOverlay();
    runtime.player.name = name;
    runtime.player.gender = gender;
    const defaults = newCharacterDefaults(gender);
    runtime.player.face_id = defaults.face_id;
    runtime.player.hair_id = defaults.hair_id;
    startMapId = "100000001";
    startPortalName = null;
    initPlayerEquipment(defaults.equipment);
    initPlayerInventory();
    saveCharacter();
  }

  mapIdInputEl.value = startMapId;

  // In online mode, connect WebSocket BEFORE loading the map.
  // Server is authoritative over map assignment — wait for change_map message.
  if (window.__MAPLE_ONLINE__) {
    // Set up the initial map promise BEFORE connecting so the change_map
    // message (which arrives immediately after auth) is captured even if
    // it arrives before connectWebSocketAsync() resolves.
    _awaitingInitialMap = true;
    const serverMapPromise = new Promise((resolve) => {
      _initialMapResolve = resolve;
      // Timeout: if server doesn't respond in 10s, fall back to client save
      setTimeout(() => {
        if (_awaitingInitialMap) {
          _awaitingInitialMap = false;
          _initialMapResolve = null;
          rlog("Initial change_map timeout — falling back to client startMapId");
          resolve({ map_id: startMapId, spawn_portal: startPortalName });
        }
      }, 10000);
    });

    const wsOk = await connectWebSocketAsync();
    if (!wsOk) {
      _awaitingInitialMap = false;
      _initialMapResolve = null;
      return; // blocked by duplicate login overlay
    }

    // Wait for the server's change_map message to know which map to load.
    // The server determines the map from the character's saved location.
    const serverMap = await serverMapPromise;

    rlog(`Initial map from server: map=${serverMap.map_id} portal=${serverMap.spawn_portal}`);
    mapIdInputEl.value = serverMap.map_id;
    await loadMap(serverMap.map_id, serverMap.spawn_portal || null);
    // Tell server we finished loading so it adds us to the room
    wsSend({ type: "map_loaded" });
  } else {
    // Offline mode: load the map directly from client save
    await loadMap(startMapId, startPortalName);
  }
})();
