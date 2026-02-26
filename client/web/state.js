/**
 * state.js — Shared state, constants, caches, and DOM refs.
 * Imported by all other modules. No external dependencies.
 */

// ─── Late-binding function registry ──────────────────────────────────────────
// Modules register functions here so other modules can call them without
// circular import issues. Functions are set during module initialization.
export const fn = {};

// ─── DOM Element Refs ────────────────────────────────────────────────────────
export const chatBarEl = document.getElementById("chat-bar");
export const chatInputEl = document.getElementById("chat-input");
export const chatLogEl = document.getElementById("chat-log");
export const chatLogMessagesEl = document.getElementById("chat-log-messages");
export const chatLogHandleEl = document.getElementById("chat-log-handle");
export const pickupJournalEl = document.getElementById("pickup-journal");
export const settingsButtonEl = document.getElementById("settings-button");
export const settingsModalEl = document.getElementById("settings-modal");
export const keybindsButtonEl = document.getElementById("keybinds-button");
export const settingsBgmToggleEl = document.getElementById("settings-bgm-toggle");
export const settingsSfxToggleEl = document.getElementById("settings-sfx-toggle");
export const settingsFixedResEl = document.getElementById("settings-fixed-res");
export const settingsMinimapToggleEl = document.getElementById("settings-minimap-toggle");
export const settingsPingToggleEl = document.getElementById("settings-ping-toggle");
export const pingWindowEl = document.getElementById("ping-window");
export const pingValueEl = document.getElementById("ping-value");
export const pingIndicatorEl = document.getElementById("ping-indicator");
export const settingsLogoutBtn = document.getElementById("settings-logout-btn");
export const logoutConfirmEl = document.getElementById("logout-confirm-overlay");
export const logoutConfirmYesEl = document.getElementById("logout-confirm-yes");
export const logoutConfirmNoEl = document.getElementById("logout-confirm-no");
export const claimHudButton = document.getElementById("claim-hud-button");
export const logoutConfirmTextEl = document.getElementById("logout-confirm-text");
export const claimOverlayEl = document.getElementById("claim-overlay");
export const claimPasswordInput = document.getElementById("claim-password-input");
export const claimPasswordConfirm = document.getElementById("claim-password-confirm");
export const claimErrorEl = document.getElementById("claim-error");
export const claimConfirmBtn = document.getElementById("claim-confirm-btn");
export const claimCancelBtn = document.getElementById("claim-cancel-btn");
export const authTabLogin = document.getElementById("auth-tab-login");
export const authTabCreate = document.getElementById("auth-tab-create");
export const authLoginView = document.getElementById("auth-login-view");
export const authCreateView = document.getElementById("auth-create-view");
export const loginNameInput = document.getElementById("login-name-input");
export const loginPasswordInput = document.getElementById("login-password-input");
export const loginErrorEl = document.getElementById("login-error");
export const loginSubmitBtn = document.getElementById("login-submit");
export const canvasEl = document.getElementById("map-canvas");
export const ctx = canvasEl.getContext("2d", { alpha: false, desynchronized: true }) || canvasEl.getContext("2d");
if (!ctx) throw new Error("Failed to acquire 2D rendering context.");
ctx.imageSmoothingEnabled = false;

export const equipWindowEl = document.getElementById("equip-window");
export const inventoryWindowEl = document.getElementById("inventory-window");
export const keybindsWindowEl = document.getElementById("keybinds-window");
export const equipGridEl = document.getElementById("equip-grid");
export const invGridEl = document.getElementById("inv-grid");
export const keybindsGridEl = document.getElementById("keybinds-grid");
export const uiTooltipEl = document.getElementById("ui-tooltip");
export const openKeybindsBtnEl = document.getElementById("open-keybinds-btn");

// ─── Debug log system ────────────────────────────────────────────────────────
export const DLOG_MAX = 5000;
export const _debugLogBuffer = [];
export let _debugLogDirty = false;
export function setDebugLogDirty(v) { _debugLogDirty = v; }

export function dlog(category, msg) {
  const ts = new Date().toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
  const line = `[${ts}] [${category}] ${msg}`;
  _debugLogBuffer.push(line);
  if (_debugLogBuffer.length > DLOG_MAX) _debugLogBuffer.shift();
  _debugLogDirty = true;
}
export function rlog(msg) { dlog("info", msg); }

// ── Capture global errors/warnings/rejections ──
window.addEventListener("error", (e) => {
  const loc = e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : "";
  dlog("error", `${e.message}${loc}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack}` : String(e.reason);
  dlog("error", `Unhandled rejection: ${reason}`);
});

// ─── Persistent browser cache ────────────────────────────────────────────────
export const RESOURCE_CACHE_NAME = "maple-resources-v3";
let _resourceCache = null;
export async function getResourceCache() {
  if (!_resourceCache) {
    try { _resourceCache = await caches.open(RESOURCE_CACHE_NAME); } catch { _resourceCache = null; }
  }
  return _resourceCache;
}

export async function cachedFetch(url) {
  const cache = await getResourceCache();
  if (cache) {
    const cached = await cache.match(url);
    if (cached) return cached;
  }
  const response = await fetch(url);
  if (response.ok && cache) {
    try { await cache.put(url, response.clone()); } catch {}
  }
  if (!response.ok) console.warn(`[fetch] Failed (${response.status}): ${url}`);
  return response;
}

// ─── Asset Caches ────────────────────────────────────────────────────────────
export const jsonCache = new Map();
export const metaCache = new Map();
export const metaPromiseCache = new Map();
export const imageCache = new Map();
export const imagePromiseCache = new Map();
export const soundDataUriCache = new Map();
export const soundDataPromiseCache = new Map();
export const iconDataUriCache = new Map();

// ─── Canvas / Display Constants ──────────────────────────────────────────────
export const DEFAULT_CANVAS_WIDTH = 1024;
export const DEFAULT_CANVAS_HEIGHT = 768;
export const FIXED_RES_WIDTH = 1024;
export const FIXED_RES_HEIGHT = 768;
export const MIN_CANVAS_WIDTH = 640;
export const MIN_CANVAS_HEIGHT = 320;
export const BG_REFERENCE_HEIGHT = 600;
export const SPATIAL_BUCKET_SIZE = 256;
export const SPATIAL_QUERY_MARGIN = 320;
export const PERF_SAMPLE_SIZE = 120;

export function gameViewWidth() {
  return runtime.settings.fixedRes ? FIXED_RES_WIDTH : canvasEl.width;
}
export function gameViewHeight() {
  return runtime.settings.fixedRes ? FIXED_RES_HEIGHT : canvasEl.height;
}

// ─── Player Physics Constants ────────────────────────────────────────────────
export const PHYS_TPS = 125;
export const PHYS_GRAVFORCE = 0.14;
export const PHYS_FRICTION = 0.5;
export const PHYS_SLOPEFACTOR = 0.1;
export const PHYS_GROUNDSLIP = 3.0;
export const PHYS_FALL_BRAKE = 0.025;
export const PHYS_HSPEED_DEADZONE = 0.1;
export const PHYS_FALL_SPEED_CAP = 670;
export const PHYS_MAX_LAND_SPEED = 162.5;
export const PHYS_ROPE_JUMP_HMULT = 6.0;
export const PHYS_ROPE_JUMP_VDIV = 1.5;
export const PHYS_CLIMB_ACTION_DELAY_MS = 200;
export const PHYS_SWIMGRAVFORCE = 0.07;
export const PHYS_SWIMFRICTION = 0.08;
export const PHYS_SWIM_HFRICTION = 0.14;
export const PHYS_FLYFORCE = 0.25;
export const PHYS_SWIM_HFORCE = 0.12;
export const PHYS_SWIM_JUMP_MULT = 0.8;
export const PHYS_DEFAULT_SPEED_STAT = 115;
export const PHYS_DEFAULT_JUMP_STAT = 110;
export const PLAYER_TOUCH_HITBOX_HEIGHT = 50;
export const PLAYER_TOUCH_HITBOX_HALF_WIDTH = 12;
export const PLAYER_TOUCH_HITBOX_PRONE_HEIGHT = 28;
export const PLAYER_TOUCH_HITBOX_PRONE_HALF_WIDTH = 18;
export const TRAP_HIT_INVINCIBILITY_MS = 2000;
export const PLAYER_KB_HSPEED = 1.5;
export const PLAYER_KB_VFORCE = 3.5;
export const MOB_KB_FORCE_GROUND = 0.2;
export const MOB_KB_FORCE_AIR = 0.1;
export const MOB_KB_COUNTER_START = 170;
export const MOB_KB_COUNTER_END = 200;
export const PLAYER_HIT_FACE_DURATION_MS = 500;
export const FALL_DAMAGE_THRESHOLD = 500;
export const FALL_DAMAGE_PERCENT = 0.1;

// ─── Portal / Map Transitions ────────────────────────────────────────────────
export const HIDDEN_PORTAL_REVEAL_DELAY_MS = 500;
export const HIDDEN_PORTAL_FADE_IN_MS = 400;
export const PORTAL_SPAWN_Y_OFFSET = 24;
export const PORTAL_FADE_OUT_MS = 180;
export const PORTAL_FADE_IN_MS = 240;
export const PORTAL_SCROLL_MIN_MS = 180;
export const PORTAL_SCROLL_MAX_MS = 560;
export const PORTAL_SCROLL_SPEED_PX_PER_SEC = 3200;
export const PORTAL_ANIMATION_FRAME_MS = 100;

// ─── Character / UI Constants ────────────────────────────────────────────────
export const FACE_ANIMATION_SPEED = 1.6;
export const DEFAULT_STANDARD_CHARACTER_WIDTH = 58;
export const CHAT_BUBBLE_LINE_HEIGHT = 16;
export const CHAT_BUBBLE_HORIZONTAL_PADDING = 8;
export const CHAT_BUBBLE_VERTICAL_PADDING = 10;
export const CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER = 3;
export const STATUSBAR_HEIGHT = 0;
export const STATUSBAR_BAR_HEIGHT = 14;
export const STATUSBAR_PADDING_H = 10;

// ─── Persistence Keys ───────────────────────────────────────────────────────
export const SETTINGS_CACHE_KEY = "shlop.settings.v1";
export const CHAT_LOG_HEIGHT_CACHE_KEY = "shlop.debug.chatLogHeight.v1";
export const CHAT_LOG_COLLAPSED_KEY = "shlop.chatLogCollapsed.v1";
export const KEYBINDS_STORAGE_KEY = "shlop.keybinds.v1";
export const SESSION_KEY = "shlop.session";
export const CHARACTER_SAVE_KEY = "shlop.character.v1";

// ─── Session ─────────────────────────────────────────────────────────────────
export let sessionId = localStorage.getItem(SESSION_KEY) || "";
export function setSessionId(v) { sessionId = v; }

// ─── Map ID Redirects ────────────────────────────────────────────────────────
export const MAP_ID_REDIRECTS = {
  "100000110": "910000000",
};

// ─── Viewport Helpers ────────────────────────────────────────────────────────
export function cameraHeightBias() {
  if (runtime.settings.fixedRes) return 0;
  return Math.max(0, (canvasEl.height - BG_REFERENCE_HEIGHT) / 2);
}

export function newCharacterDefaults(gender) {
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

export function playerFacePath() { return `Face/${String(runtime.player.face_id).padStart(8, "0")}.img.xml`; }
export function playerHairPath() { return `Hair/${String(runtime.player.hair_id).padStart(8, "0")}.img.xml`; }

// ─── Runtime State ───────────────────────────────────────────────────────────
export const runtime = {
  map: null,
  mapId: null,
  camera: { x: 0, y: 0 },
  backgroundViewAnchorY: null,
  player: {
    x: 0, y: 0, prevX: 0, prevY: 0,
    vx: 0, vy: 0,
    onGround: false, climbing: false, swimming: false,
    climbRope: null, climbCooldownUntil: 0, climbAttachTime: 0,
    downJumpIgnoreFootholdId: null, downJumpIgnoreUntil: 0,
    downJumpControlLock: false, downJumpTargetFootholdId: null,
    reattachLockUntil: 0, reattachLockRopeKey: null,
    footholdId: null, footholdLayer: 3,
    facing: -1, action: "stand1",
    frameIndex: 0, frameTimer: 0,
    bubbleText: "", bubbleExpiresAt: 0,
    stats: { speed: PHYS_DEFAULT_SPEED_STAT, jump: PHYS_DEFAULT_JUMP_STAT },
    attacking: false, attackStance: "", attackFrameIndex: 0,
    attackFrameTimer: 0, attackCooldownUntil: 0,
    name: "Shlop", gender: false,
    face_id: 20000, hair_id: 30000,
    level: 1, job: "Beginner",
    hp: 50, maxHp: 50, mp: 5, maxMp: 5, exp: 0, maxExp: 15, meso: 0,
    str: 12, dex: 5, int: 4, luk: 4,
    minDamage: 1, maxDamage: 1, accuracy: 6, critical: 5,
    stance: 30, // knockback resistance % (C++ 0 for beginner, raised by skills/buffs)
    trapInvincibleUntil: 0, lastTrapHitAt: 0, lastTrapHitDamage: 0,
    fallStartY: 0, knockbackClimbLockUntil: 0,
    chairId: 0,
    achievements: {},
  },
  input: {
    enabled: false,
    left: false, right: false, up: false, down: false,
    jumpHeld: false, jumpQueued: false, ctrlHeld: false,
  },
  chat: {
    inputActive: false, history: [], maxHistory: 200,
    sentHistory: [], sentHistoryMax: 50,
    recallIndex: -1, recallDraft: "",
  },
  mapBanner: {
    active: false, mapName: "", streetName: "", markName: "",
    startedAt: 0, showUntil: 0, fadeStartAt: 0,
  },
  settings: {
    bgmEnabled: true, sfxEnabled: true, fixedRes: true,
    minimapVisible: true, showPing: false,
  },
  keybinds: {
    moveLeft: "ArrowLeft", moveRight: "ArrowRight",
    moveUp: "ArrowUp", moveDown: "ArrowDown",
    attack: "KeyC", jump: "Space", loot: "KeyZ",
    equip: "KeyE", inventory: "KeyI", keybinds: "KeyK", stat: "KeyS", minimap: "KeyM",
    face1: "Digit1", face2: "Digit2", face3: "Digit3",
    face4: "Digit4", face5: "Digit5", face6: "Digit6",
    face7: "Digit7", face8: "Digit8", face9: "Digit9",
  },
  keymap: null, // initialized by loadKeymap() in app.js
  mouseWorld: { x: 0, y: 0 },
  characterData: null, characterHeadData: null,
  characterFaceData: null, characterHairData: null,
  characterEquipData: {},
  faceAnimation: {
    expression: "default", frameIndex: 0, frameTimerMs: 0,
    blinkCooldownMs: 2200, overrideExpression: null, overrideUntilMs: 0,
  },
  zMapOrder: {},
  characterDataPromise: null,
  lastRenderableCharacterFrame: null,
  lastCharacterBounds: null,
  standardCharacterWidth: DEFAULT_STANDARD_CHARACTER_WIDTH,
  perf: {
    updateMs: 0, renderMs: 0, frameMs: 0, loopIntervalMs: 0,
    samples: new Array(PERF_SAMPLE_SIZE).fill(0),
    sampleCursor: 0, sampleCount: 0,
    drawCalls: 0, culledSprites: 0, tilesDrawn: 0, objectsDrawn: 0,
    lifeDrawn: 0, portalsDrawn: 0, reactorsDrawn: 0,
  },
  audioUnlocked: false, bgmAudio: null, currentBgmPath: null,
  loading: { active: false, total: 0, loaded: 0, progress: 0, label: "" },
  audioDebug: { lastSfx: null, lastSfxAtMs: 0, sfxPlayCount: 0, lastBgm: null },
  mapLoadToken: 0,
  portalCooldownUntil: 0, portalWarpInProgress: false,
  hiddenPortalState: new Map(),
  transition: { alpha: 0, active: false },
  portalScroll: {
    active: false, startX: 0, startY: 0,
    targetX: 0, targetY: 0, elapsedMs: 0, durationMs: 0,
  },
  portalAnimation: {
    regularFrameIndex: 0, regularTimerMs: 0,
    hiddenFrameIndex: 0, hiddenTimerMs: 0,
  },
  previousTimestampMs: null, tickAccumulatorMs: 0,
  npcDialogue: {
    active: false, npcName: "", npcFunc: "",
    lines: [], lineIndex: 0,
    npcWorldX: 0, npcWorldY: 0, npcIdx: -1,
    hoveredOption: -1, scriptId: "",
  },
  gm: false, gmMouseFly: false, gmOverlay: false,
};

// ─── Equip Slot Layout ───────────────────────────────────────────────────────
export const EQUIP_SLOT_LIST = [
  { type: "Cap", label: "Hat" }, { type: "FaceAcc", label: "Face Acc" },
  { type: "EyeAcc", label: "Eye Acc" }, { type: "Earrings", label: "Earrings" },
  { type: "Pendant", label: "Pendant" }, { type: "Cape", label: "Cape" },
  { type: "Coat", label: "Top" }, { type: "Longcoat", label: "Overall" },
  { type: "Shield", label: "Shield" }, { type: "Glove", label: "Gloves" },
  { type: "Pants", label: "Bottom" }, { type: "Shoes", label: "Shoes" },
  { type: "Weapon", label: "Weapon" }, { type: "Ring", label: "Ring" },
  { type: "Belt", label: "Belt" }, { type: "Medal", label: "Medal" },
];

// ─── Inventory State ─────────────────────────────────────────────────────────
export const INV_COLS = 4;
export const INV_ROWS = 8;
export const INV_MAX_SLOTS = INV_COLS * INV_ROWS;
export const INV_TABS = ["EQUIP", "USE", "SETUP", "ETC", "CASH"];
export let currentInvTab = "EQUIP";
export function setCurrentInvTab(v) { currentInvTab = v; }

export const playerEquipped = new Map();
export const playerInventory = [];
export const groundDrops = [];

export const draggedItem = {
  active: false, source: null, sourceIndex: -1,
  id: 0, name: "", qty: 0, iconKey: null, category: null,
};

// ─── Drop Physics Constants ──────────────────────────────────────────────────
export const DROP_PICKUP_RANGE = 50;
export const DROP_BOB_SPEED = 0.025;
export const DROP_BOB_AMP = 2.5;
export const DROP_SPAWN_VSPEED = -7.9;
export const DROP_SPINSTEP = 0.3;
export const DROP_PHYS_GRAVITY = 0.35;
export const DROP_PHYS_TERMINAL_VY = 8;
export const LOOT_ANIM_DURATION = 400;

// ─── Mob Physics Constants ───────────────────────────────────────────────────
export const MOB_GRAVFORCE = 0.14;
export const MOB_SWIMGRAVFORCE = 0.03;
export const MOB_FRICTION = 0.5;
export const MOB_SLOPEFACTOR = 0.1;
export const MOB_GROUNDSLIP = 3.0;
export const MOB_SWIMFRICTION = 0.08;
export const MOB_PHYS_TIMESTEP = 1000 / 30;

// ─── Mob Behavior Constants ─────────────────────────────────────────────────
export const MOB_STAND_MIN_MS = 1500;
export const MOB_STAND_MAX_MS = 4000;
export const MOB_MOVE_MIN_MS = 2000;
export const MOB_MOVE_MAX_MS = 5000;

// ─── Combat Constants ────────────────────────────────────────────────────────
export const ATTACK_COOLDOWN_MS = 600;
export const ATTACK_RANGE_X = 120;
export const ATTACK_RANGE_Y = 50;
export const MOB_HIT_DURATION_MS = 500;
export const MOB_AGGRO_DURATION_MS = 4000;
export const MOB_KB_SPEED = 150;
export const MOB_RESPAWN_DELAY_MS = 8000;
export const MOB_HP_BAR_WIDTH = 60;
export const MOB_HP_BAR_HEIGHT = 5;

// ─── Minimap Constants ───────────────────────────────────────────────────────
export const MINIMAP_PADDING = 10;
export const MINIMAP_TITLE_HEIGHT = 20;
export const MINIMAP_BORDER_RADIUS = 6;
export const MINIMAP_PLAYER_RADIUS = 3;
export const MINIMAP_PORTAL_RADIUS = 2.5;
export const MINIMAP_CLOSE_SIZE = 14;

// ─── Map Banner Constants ────────────────────────────────────────────────────
export const MAP_BANNER_SHOW_MS = 3500;
export const MAP_BANNER_FADE_MS = 900;
export const MAP_BANNER_SLIDE_MS = 350;

// ─── Game Loop Constants ─────────────────────────────────────────────────────
export const FIXED_STEP_MS = 1000 / 60;
export const MAX_FRAME_DELTA_MS = 250;
export const MAX_STEPS_PER_FRAME = 6;

// ─── Life/Mob/NPC/Reactor Runtime State ──────────────────────────────────────
export const lifeAnimations = new Map(); // key: "m:0120100" or "n:1012000" -> { stances, name }
export const lifeRuntimeState = new Map();
export const reactorRuntimeState = new Map();

// ─── Animation State Maps ────────────────────────────────────────────────────
export const objectAnimStates = new Map();

// ─── Drop Expiry ─────────────────────────────────────────────────────────────
export let _localDropIdCounter = -1;
export function setLocalDropIdCounter(v) { _localDropIdCounter = v; }
export const DROP_EXPIRE_MS = 180_000;
export const DROP_EXPIRE_FADE_MS = 2000;

// ─── Chair Sprite Cache ──────────────────────────────────────────────────────
export const _chairSpriteCache = new Map(); // chairItemId → { img, originX, originY, width, height } or null

// ─── Character Constants ─────────────────────────────────────────────────────
export const CLIMBING_STANCES = new Set(["ladder", "rope"]);

// ─── Character Placement Cache ───────────────────────────────────────────────
export const characterPlacementTemplateCache = new Map();

// ─── WZ Cursor ───────────────────────────────────────────────────────────────
export const wzCursor = {
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
export const CURSOR_IDLE = 0;
export const CURSOR_CANCLICK = 1;
export const CURSOR_CLICKING = 12;
export const CURSOR_DEFAULT_DELAY = 100;
export const CURSOR_CANCLICK_DELAY = 350;

// ─── Sound Constants ─────────────────────────────────────────────────────────
export const BGM_FADE_DURATION_MS = 800;
export const BGM_TARGET_VOLUME = 0.25;
export const SFX_POOL_SIZE = 8;
export const DEFAULT_MOB_HIT_SOUND = "0100100/Damage";
export const DEFAULT_MOB_DIE_SOUND = "0100100/Die";
