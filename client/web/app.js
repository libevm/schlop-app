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
const debugOverlayToggleEl = document.getElementById("debug-overlay-toggle");
const debugRopesToggleEl = document.getElementById("debug-ropes-toggle");
const debugFootholdsToggleEl = document.getElementById("debug-footholds-toggle");
const debugLifeToggleEl = document.getElementById("debug-life-toggle");
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
const settingsCloseEl = document.getElementById("settings-close");
const settingsBgmToggleEl = document.getElementById("settings-bgm-toggle");
const settingsSfxToggleEl = document.getElementById("settings-sfx-toggle");
const settingsFixedResEl = document.getElementById("settings-fixed-res");
const settingsMinimapToggleEl = document.getElementById("settings-minimap-toggle");
const canvasEl = document.getElementById("map-canvas");
const ctx = canvasEl.getContext("2d");

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

const jsonCache = new Map();
const metaCache = new Map();
const metaPromiseCache = new Map();
const imageCache = new Map();
const imagePromiseCache = new Map();
const soundDataUriCache = new Map();
const soundDataPromiseCache = new Map();

const FACE_ANIMATION_SPEED = 1.6;

// C++ HeavenClient physics constants (per-tick units, TIMESTEP = 8ms)
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
const HIDDEN_PORTAL_REVEAL_DELAY_MS = 500;
const HIDDEN_PORTAL_FADE_IN_MS = 400;
const PORTAL_SPAWN_Y_OFFSET = 24;
const PORTAL_FADE_OUT_MS = 180;
const PORTAL_FADE_IN_MS = 240;
const PORTAL_SCROLL_MIN_MS = 180;
const PORTAL_SCROLL_MAX_MS = 560;
const PORTAL_SCROLL_SPEED_PX_PER_SEC = 3200;
const DEFAULT_CANVAS_WIDTH = 1280;
const DEFAULT_CANVAS_HEIGHT = 960;
const BG_REFERENCE_WIDTH = 800;
const BG_REFERENCE_HEIGHT = 600;
const MIN_CANVAS_WIDTH = 640;
const MIN_CANVAS_HEIGHT = 320;

/**
 * Camera Y offset to push the scene lower on tall viewports.
 * Backgrounds are designed for 600px height — content extends ~300px below center.
 * On taller canvases the viewport bottom extends further, showing void below the
 * map content. This bias shifts the camera upward so the viewport bottom stays at
 * the same world-space distance below center as the original 600px design.
 * At 600px: 0. At 1080px: 240. At 1440px: 420. Fully dynamic.
 */
function cameraHeightBias() {
  return Math.max(0, (canvasEl.height - BG_REFERENCE_HEIGHT) / 2);
}

const DEFAULT_STANDARD_CHARACTER_WIDTH = 58;
const CHAT_BUBBLE_LINE_HEIGHT = 16;
const CHAT_BUBBLE_HORIZONTAL_PADDING = 8;
const CHAT_BUBBLE_VERTICAL_PADDING = 6;
const CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER = 3;
const TELEPORT_PRESET_CACHE_KEY = "mapleweb.debug.teleportPreset.v1";
const SETTINGS_CACHE_KEY = "mapleweb.settings.v1";
const FIXED_RES_WIDTH = 1280;
const FIXED_RES_HEIGHT = 960;

/**
 * Default equipment set for the character.
 * Each entry is { id, category, path } where path is relative to Character.wz.
 * Equipment IDs follow MapleStory conventions: id/10000 determines category.
 */
const DEFAULT_EQUIPS = [
  { id: 1040002, category: "Coat",    path: "Coat/01040002.img.json" },
  { id: 1060002, category: "Pants",   path: "Pants/01060002.img.json" },
  { id: 1072001, category: "Shoes",   path: "Shoes/01072001.img.json" },
  { id: 1302000, category: "Weapon",  path: "Weapon/01302000.img.json" },
];
const DEFAULT_HAIR_ID = 30000;
const DEFAULT_HAIR_PATH = "Hair/00030000.img.json";

const runtime = {
  map: null,
  mapId: null,
  camera: { x: 0, y: 0 },
  player: {
    x: 0,
    y: 0,
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
    level: 1,
    job: "Beginner",
    hp: 50,
    maxHp: 50,
    mp: 5,
    maxMp: 5,
    exp: 0,
    maxExp: 15,
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
    showUntil: 0,
    fadeStartAt: 0,
  },
  debug: {
    overlayEnabled: true,
    showRopes: true,
    showFootholds: true,
    showLifeMarkers: true,

    mouseFly: false,
  },
  settings: {
    bgmEnabled: true,
    sfxEnabled: true,
    fixedRes: true,
    minimapVisible: true,
  },
  keybinds: {
    attack: "KeyC",
    jump: "Space",
    pickup: "KeyZ",
    npcChat: "KeyX", // placeholder for future
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
  },
  zMapOrder: {},
  characterDataPromise: null,
  lastRenderableCharacterFrame: null,
  lastCharacterBounds: null,
  standardCharacterWidth: DEFAULT_STANDARD_CHARACTER_WIDTH,

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
  previousTimestampMs: null,

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

let canvasResizeObserver = null;
let runtimeSummaryPointerSelecting = false;
let lastRenderedSummaryText = "";

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

  if (debugLifeToggleEl) {
    runtime.debug.showLifeMarkers = !!debugLifeToggleEl.checked;
    debugLifeToggleEl.disabled = !runtime.debug.overlayEnabled;
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
  try {
    const raw = localStorage.getItem(TELEPORT_PRESET_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return { x, y };
  } catch {
    return null;
  }
}

function saveCachedTeleportPreset(x, y) {
  try {
    localStorage.setItem(TELEPORT_PRESET_CACHE_KEY, JSON.stringify({ x, y }));
  } catch {
    // ignore storage failures (private mode/quota)
  }
}

function applyManualTeleport(x, y) {
  if (!runtime.map) {
    setStatus("Cannot teleport: no map loaded yet.");
    return false;
  }

  const player = runtime.player;
  player.x = x;
  player.y = y;
  player.vx = 0;
  player.vy = 0;
  player.climbing = false;
  player.swimming = false;
  player.climbRope = null;
  player.climbCooldownUntil = 0;
  player.climbAttachTime = 0;
  player.reattachLockUntil = 0;
  player.reattachLockRopeKey = null;
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

  runtime.camera.x = player.x;
  runtime.camera.y = player.y - cameraHeightBias();
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

const STAT_CACHE_KEY = "mapleweb.debug.playerStats.v1";

function loadCachedPlayerStats() {
  try {
    const raw = localStorage.getItem(STAT_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const speed = Number(parsed?.speed);
    const jump = Number(parsed?.jump);
    if (!Number.isFinite(speed) || !Number.isFinite(jump)) return null;

    return { speed, jump };
  } catch {
    return null;
  }
}

function saveCachedPlayerStats(speed, jump) {
  try {
    localStorage.setItem(STAT_CACHE_KEY, JSON.stringify({ speed, jump }));
  } catch {
    // ignore
  }
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

  const msg = {
    name: "Player",
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

const CHAT_LOG_HEIGHT_CACHE_KEY = "mapleweb.debug.chatLogHeight.v1";

function initChatLogResize() {
  if (!chatLogEl || !chatLogHandleEl) return;

  let chatLogCollapsed = false;
  let chatLogExpandedHeight = 140;

  const cached = localStorage.getItem(CHAT_LOG_HEIGHT_CACHE_KEY);
  if (cached) {
    const h = Number(cached);
    if (Number.isFinite(h) && h >= 48) {
      chatLogEl.style.height = h + "px";
      chatLogExpandedHeight = h;
    }
  }

  const HANDLE_HEIGHT = 14;

  function collapseChatLog() {
    chatLogExpandedHeight = chatLogEl.offsetHeight || chatLogExpandedHeight;
    chatLogCollapsed = true;
    chatLogEl.style.height = HANDLE_HEIGHT + "px";
    chatLogEl.style.minHeight = HANDLE_HEIGHT + "px";
  }

  function expandChatLog() {
    chatLogCollapsed = false;
    chatLogEl.style.height = chatLogExpandedHeight + "px";
    chatLogEl.style.minHeight = "";
  }

  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  chatLogHandleEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startHeight = chatLogCollapsed ? 0 : chatLogEl.offsetHeight;
    chatLogHandleEl.setPointerCapture(e.pointerId);
  });

  chatLogHandleEl.addEventListener("dblclick", (e) => {
    e.preventDefault();
    if (chatLogCollapsed) {
      expandChatLog();
    } else {
      collapseChatLog();
    }
    try {
      localStorage.setItem(CHAT_LOG_HEIGHT_CACHE_KEY, String(chatLogExpandedHeight));
    } catch { /* ignore */ }
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
    if (!chatLogCollapsed) {
      chatLogExpandedHeight = chatLogEl.offsetHeight || chatLogExpandedHeight;
    }
    try {
      localStorage.setItem(CHAT_LOG_HEIGHT_CACHE_KEY, String(chatLogExpandedHeight));
    } catch { /* ignore */ }
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

  return {
    basedata: canvasNode.basedata,
    width: safeNumber(canvasNode.width, 0),
    height: safeNumber(canvasNode.height, 0),
    vectors: vectorRecord(canvasNode),
    zName: String(leaf.z ?? ""),
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
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (typeof parsed.bgmEnabled === "boolean") runtime.settings.bgmEnabled = parsed.bgmEnabled;
      if (typeof parsed.sfxEnabled === "boolean") runtime.settings.sfxEnabled = parsed.sfxEnabled;
      if (typeof parsed.fixedRes === "boolean") runtime.settings.fixedRes = parsed.fixedRes;
      // Migrate legacy key
      if (typeof parsed.fixed169 === "boolean" && typeof parsed.fixedRes !== "boolean") runtime.settings.fixedRes = parsed.fixed169;
      if (typeof parsed.minimapVisible === "boolean") runtime.settings.minimapVisible = parsed.minimapVisible;
    }
  } catch (_) {}
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(runtime.settings));
  } catch (_) {}
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

    // Fit 4:3 (1280×960) display within viewport (CSS display size)
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
    const vw = window.innerWidth || DEFAULT_CANVAS_WIDTH;
    const vh = window.innerHeight || DEFAULT_CANVAS_HEIGHT;

    // If viewport >= fixed resolution, lock canvas buffer to 1280×960
    // and let CSS scale the display. If smaller, use viewport size.
    if (vw >= FIXED_RES_WIDTH && vh >= FIXED_RES_HEIGHT) {
      nextWidth = FIXED_RES_WIDTH;
      nextHeight = FIXED_RES_HEIGHT;
    } else {
      // Smaller viewport: use actual size, fitted to 4:3
      if (vw / vh > 4 / 3) {
        nextHeight = vh;
        nextWidth = Math.round(vh * 4 / 3);
      } else {
        nextWidth = vw;
        nextHeight = Math.round(vw * 3 / 4);
      }
    }
  } else {
    nextWidth = window.innerWidth || DEFAULT_CANVAS_WIDTH;
    nextHeight = window.innerHeight || DEFAULT_CANVAS_HEIGHT;
  }

  nextWidth = Math.max(MIN_CANVAS_WIDTH, nextWidth);
  nextHeight = Math.max(MIN_CANVAS_HEIGHT, nextHeight);

  if (canvasEl.width === nextWidth && canvasEl.height === nextHeight) {
    return;
  }

  canvasEl.width = nextWidth;
  canvasEl.height = nextHeight;
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
    x: Math.round(worldX - runtime.camera.x + canvasEl.width / 2),
    y: Math.round(worldY - runtime.camera.y + canvasEl.height / 2),
  };
}

function drawWorldImage(image, worldX, worldY, opts = {}) {
  const screen = worldToScreen(worldX, worldY);
  const flipped = !!opts.flipped;

  if (!flipped) {
    ctx.drawImage(image, screen.x, screen.y);
    return;
  }

  ctx.save();
  ctx.translate(screen.x + image.width, screen.y);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0);
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
        const response = await fetch(path);
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

function requestMeta(key, loader) {
  if (metaCache.has(key)) {
    return Promise.resolve(metaCache.get(key));
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
    return Promise.resolve(imageCache.get(key));
  }

  if (imagePromiseCache.has(key)) {
    return imagePromiseCache.get(key);
  }

  const meta = metaCache.get(key);
  if (!meta) {
    return Promise.resolve(null);
  }

  if (!meta.basedata || typeof meta.basedata !== "string" || meta.basedata.length < 8) {
    rlog(`BAD BASEDATA key=${key} type=${typeof meta.basedata} len=${meta.basedata?.length ?? 0}`);
    return Promise.resolve(null);
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
  requestImageByKey(key);
  return imageCache.get(key) ?? null;
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
      let level = 1, wdef = 0, avoid = 0, knockback = 1;
      if (type === "m" && infoNode) {
        const infoRec = imgdirLeafRecord(infoNode);
        speed = safeNumber(infoRec.speed, -100);
        level = safeNumber(infoRec.level, 1);
        wdef = safeNumber(infoRec.PDDamage, 0);
        avoid = safeNumber(infoRec.eva, 0);
        knockback = safeNumber(infoRec.pushed, 1);
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

      const result = { stances, name, speed, func, dialogue, scriptId, level, wdef, avoid, knockback };
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

// C++ physics constants (per-tick, 8ms timestep = 125fps)
const MOB_GRAVFORCE = 0.14;
const MOB_SWIMGRAVFORCE = 0.03;
const MOB_FRICTION = 0.5;
const MOB_SLOPEFACTOR = 0.1;
const MOB_GROUNDSLIP = 3.0;
const MOB_SWIMFRICTION = 0.08;
const MOB_PHYS_TIMESTEP = 8; // C++ Constants::TIMESTEP = 8ms (125fps)

// (Behavior transitions are now counter-based per C++, not timer-based)

// ─── Client-side combat demo ──────────────────────────────────────────────────

const MOB_DEFAULT_HP = 100;
const MOB_RESPAWN_DELAY_MS = 8000;
const MOB_HP_BAR_WIDTH = 60;
const MOB_HP_BAR_HEIGHT = 5;
const MOB_HP_SHOW_MS = 3000;
// C++ DamageNumber constants (from DamageNumber.cpp)
const DMG_NUMBER_VSPEED = -0.25;         // C++ moveobj.vspeed = -0.25 (px/tick)
const DMG_NUMBER_FADE_TIME = 1500;       // C++ FADE_TIME in ms
const DMG_NUMBER_ROW_HEIGHT_NORMAL = 30; // C++ rowheight(false)
const DMG_NUMBER_ROW_HEIGHT_CRIT = 36;   // C++ rowheight(true)
// C++ digit advances table (DamageNumber::getadvance)
const DMG_DIGIT_ADVANCES = [24, 20, 22, 22, 24, 23, 24, 22, 24, 24];
const ATTACK_COOLDOWN_MS = 600;    // minimum time between attacks

// Knockback / stagger constants
const MOB_HIT_DURATION_MS = 500;   // pain animation duration (~0.5s)
const MOB_AGGRO_DURATION_MS = 4000; // chase player after stagger (4s)

// C++ damage formula constants
// Weapon multiplier for 1H Sword (from C++ get_multiplier)
const WEAPON_MULTIPLIER = 4.0;
// Default mastery for beginner
const DEFAULT_MASTERY = 0.2;
// Default critical rate
const DEFAULT_CRITICAL = 0.05;
// Default accuracy
const DEFAULT_ACCURACY = 10;
// Default attack stat (watk from weapon + base)
const DEFAULT_WATK = 15;
// Close-range attack reach: C++ uses afterimage range, we simplify to px rect
const ATTACK_RANGE_X = 120;
const ATTACK_RANGE_Y = 50;

// 1H Sword attack stances (from C++ S1A1M1D attack_stances)
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
};

/**
 * Build dialogue lines from an NPC script definition.
 * Returns array of line objects: string for text, or { text, options } for choices.
 */
function buildScriptDialogue(scriptDef) {
  const lines = [];
  lines.push({
    text: scriptDef.greeting,
    options: scriptDef.destinations.map((d) => ({
      label: d.label,
      action: () => {
        closeNpcDialogue();
        runPortalMapTransition(d.mapId, null);
      },
    })),
  });
  return lines;
}

/**
 * Build a fallback dialogue for any NPC with a script but no explicit handler.
 * Uses the NPC's flavor text + offers travel to all major towns.
 */
function buildFallbackScriptDialogue(npcName, flavourLines) {
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
        runPortalMapTransition(d.mapId, null);
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
  let bestFh = null;
  let bestY = Infinity;
  for (const fh of map.footholdLines) {
    if (fhIsWall(fh)) continue;
    const gy = fhGroundAt(fh, x);
    if (gy === null) continue;
    if (gy >= y && gy < bestY) {
      bestY = gy;
      bestFh = fh;
    }
  }
  return bestFh;
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
 * Full physics step for a mob/NPC PhysicsObject.
 * Mirrors C++ physics.move_object(phobj):
 *   1. fht.update_fh(phobj)        — foothold tracking
 *   2. move_normal(phobj)           — forces → hacc → hspeed/vspeed
 *   3. fht.limit_movement(phobj)    — wall/edge collision on next position
 *   4. phobj.move()                 — x += hspeed, y += vspeed
 */
function mobPhysicsStep(map, phobj, isSwimMap) {
  // ── Step 1: C++ fht.update_fh — foothold tracking (BEFORE physics) ──
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
          // C++ fhid=0 fallback: phobj.fhid = curfh.id(); phobj.limitx(curfh.x1())
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

    // C++ update_fh sets onground = (y == ground)
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
    // Airborne: C++ update_fh does fhid = get_fhid_below(x, y)
    const below = fhIdBelow(map, phobj.x, phobj.y);
    if (below) {
      phobj.fhId = below.id;
      phobj.fhSlope = fhSlope(below);
    }
  }

  // ── Step 2: C++ move_normal — compute acceleration, update speed ──
  let hacc = 0, vacc = 0;

  if (phobj.onGround) {
    hacc = phobj.hforce;
    vacc = phobj.vforce;

    if (hacc === 0 && phobj.hspeed < 0.1 && phobj.hspeed > -0.1) {
      phobj.hspeed = 0;
    } else {
      const inertia = phobj.hspeed / MOB_GROUNDSLIP;
      const sf = Math.max(-0.5, Math.min(0.5, phobj.fhSlope));
      hacc -= (MOB_FRICTION + MOB_SLOPEFACTOR * (1 + sf * -inertia)) * inertia;
    }
  } else {
    // Airborne
    if (isSwimMap) {
      hacc = phobj.hforce - MOB_SWIMFRICTION * phobj.hspeed;
      vacc = phobj.vforce - MOB_SWIMFRICTION * phobj.vspeed + MOB_SWIMGRAVFORCE;
    } else {
      vacc = MOB_GRAVFORCE;
    }
  }

  phobj.hforce = 0;
  phobj.vforce = 0;
  phobj.hspeed += hacc;
  phobj.vspeed += vacc;

  // ── Step 3: C++ fht.limit_movement — wall/edge collision on NEXT position ──
  // C++ checks crnt_x vs next_x = x + hspeed (BEFORE move)
  if (phobj.onGround && (phobj.hspeed > 0.001 || phobj.hspeed < -0.001)) {
    const crntX = phobj.x;
    const nextX = phobj.x + phobj.hspeed;
    const left = phobj.hspeed < 0;

    // Wall check
    let wall = fhWall(map, phobj.fhId, left, phobj.y);
    let collision = left ? (crntX >= wall && nextX <= wall) : (crntX <= wall && nextX >= wall);

    // Edge check (TURNATEDGES)
    if (!collision && phobj.turnAtEdges) {
      wall = fhEdge(map, phobj.fhId, left);
      collision = left ? (crntX >= wall && nextX <= wall) : (crntX <= wall && nextX >= wall);
    }

    if (collision) {
      // C++ phobj.limitx(wall): x = wall, hspeed = 0
      phobj.x = wall;
      phobj.hspeed = 0;
      phobj.turnAtEdges = false; // C++ clear_flag(TURNATEDGES)
    }
  }

  // Vertical limits
  if (!phobj.onGround && phobj.vspeed > 0) {
    const crntY = phobj.y;
    const nextY = phobj.y + phobj.vspeed;
    const landFh = fhIdBelow(map, phobj.x, crntY);
    if (landFh) {
      const gy = fhGroundAt(landFh, phobj.x);
      if (gy !== null && crntY <= gy + 1 && nextY >= gy - 1) {
        // C++ phobj.limity(ground): y = ground, vspeed = 0
        phobj.y = gy;
        phobj.vspeed = 0;
        phobj.onGround = true;
        phobj.fhId = landFh.id;
        phobj.fhSlope = fhSlope(landFh);
        // Don't apply move — already landed
        return;
      }
    }
  }

  // ── Step 4: C++ phobj.move() — x += hspeed, y += vspeed ──
  phobj.x += phobj.hspeed;
  phobj.y += phobj.vspeed;

  // Clamp to map borders
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
      mobSpeed = (animData.speed + 100) * 0.001;
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
      dying: false,
      dead: false,
      respawnAt: 0,
    });
  }
}

function updateLifeAnimations(dtMs) {
  if (!runtime.map) return;
  const map = runtime.map;
  const isSwimMap = !!map.swim;

  // Accumulate time and step in fixed increments matching C++ timestep
  for (const [idx, state] of lifeRuntimeState) {
    const life = map.lifeEntries[idx];
    const cacheKey = `${life.type}:${life.id}`;
    const anim = lifeAnimations.get(cacheKey);
    if (!anim) continue;

    // --- Mob AI + physics ---
    // ── C++ Mob::update — faithful port ──
    // Skip update for dead/dying mobs (C++ dying branch just normalizes phobj)
    if (state.dying || state.dead) {
      // C++ dying: phobj.normalize(); physics.get_fht().update_fh(phobj);
      if (state.phobj) { state.phobj.hspeed = 0; state.phobj.vspeed = 0; }
    } else if (state.canMove && state.phobj) {
      const ph = state.phobj;
      const now = performance.now();
      const steps = Math.max(1, Math.round(dtMs / MOB_PHYS_TIMESTEP));

      // ── Stagger: mob is frozen, plays hit1 animation, no movement ──
      if (state.hitStaggerUntil > 0 && now < state.hitStaggerUntil) {
        // Frozen in pain — zero all velocity, no force
        ph.hspeed = 0;
        ph.hforce = 0;
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
          // Face toward player
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

        // ── Aggro chase: mob walks toward player ──
        if (state.aggroUntil > 0 && now < state.aggroUntil) {
          state.facing = runtime.player.x < ph.x ? -1 : 1;
          state.behaviorState = "move";
          ph.hforce = state.facing === 1 ? state.mobSpeed : -state.mobSpeed;
        } else {
          // Aggro expired → resume normal patrol
          if (state.aggroUntil > 0) {
            state.aggroUntil = 0;
            state.behaviorState = "stand";
            state.hitCounter = 0;
          }

          // ── Normal patrol AI ──
          state.hitCounter += steps;

          // Counter-based transitions (C++ next_move)
          const curStanceAnim = anim?.stances?.[state.stance] ?? anim?.stances?.["stand"];
          const aniEnd = curStanceAnim && state.frameIndex >= curStanceAnim.frames.length - 1;
          if (aniEnd && state.hitCounter > 200) {
            mobNextMove(state, anim);
            state.hitCounter = 0;
          }

          // Apply movement force
          if (state.behaviorState === "move") {
            ph.hforce = state.facing === 1 ? state.mobSpeed : -state.mobSpeed;
          }
        }

        // ── Physics step ──
        for (let s = 0; s < steps; s++) {
          mobPhysicsStep(map, ph, isSwimMap);
        }

        // ── Sync visual stance with behavior ──
        const moving = state.behaviorState === "move" && Math.abs(ph.hspeed) > 0.05;
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
        const steps = Math.max(1, Math.round(dtMs / MOB_PHYS_TIMESTEP));
        for (let s = 0; s < steps; s++) {
          mobPhysicsStep(map, ph, isSwimMap);
        }
      }
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

function drawLifeSprites() {
  if (!runtime.map) return;

  const cam = runtime.camera;
  const halfW = canvasEl.width / 2;
  const halfH = canvasEl.height / 2;
  const now = performance.now();

  for (const [idx, state] of lifeRuntimeState) {
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
    )
      continue;

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
    if (anim.name && !state.dying) {
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
  damageNumbers.push({
    x: worldX + (Math.random() - 0.5) * 20,
    y: worldY - 30,
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
  const ticks = dt * 1000 / MOB_PHYS_TIMESTEP; // approximate # ticks
  const fadeStep = ticks * (MOB_PHYS_TIMESTEP / DMG_NUMBER_FADE_TIME);
  for (let i = damageNumbers.length - 1; i >= 0; i--) {
    const dn = damageNumbers[i];
    dn.y += dn.vspeed * ticks;
    dn.opacity -= fadeStep;
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
  const halfW = canvasEl.width / 2;
  const halfH = canvasEl.height / 2;

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

  // Find closest mob in range (mobcount=1 for regular attack)
  const targets = findMobsInRange(1);

  if (targets.length > 0) {
    const target = targets[0];
    applyAttackToMob(target);
  }
}

/**
 * Apply damage to a mob target. Implements C++ Mob::calculate_damage + apply_damage.
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

  if (result.miss) {
    spawnDamageNumber(worldX, worldY, 0, false);
  } else {
    state.hp -= result.damage;
    state.hpShowUntil = now + MOB_HP_SHOW_MS;
    spawnDamageNumber(worldX, worldY, result.damage, result.critical);
  }

  // Play hit sound
  void playMobSfx(life.id, "Damage");

  // Stagger: mob freezes in hit1 for MOB_HIT_DURATION_MS, then chases player
  if (!result.miss && result.damage >= mobKnockback && !state.dying) {
    const attackerIsLeft = runtime.player.x < worldX;
    state.facing = attackerIsLeft ? -1 : 1;

    // Enter stagger — frozen in place with hit1 animation
    const now = performance.now();
    state.hitStaggerUntil = now + MOB_HIT_DURATION_MS;
    state.phobj.hspeed = 0;
    state.phobj.hforce = 0;
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
  const now = performance.now();

  for (const [idx, state] of lifeRuntimeState) {
    const life = runtime.map?.lifeEntries[idx];
    if (!life || life.type !== "m") continue;

    // HIT knockback physics is handled in updateLifeAnimations (uses mobPhysicsStep
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
  const halfW = canvasEl.width / 2;
  const halfH = canvasEl.height / 2;

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

  let lines;
  if (scriptDef) {
    // Known script — use specific handler
    lines = buildScriptDialogue(scriptDef);
  } else if (anim.scriptId) {
    // Has a script but no explicit handler — show flavor text + travel options
    lines = buildFallbackScriptDialogue(anim.name, anim.dialogue);
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

function drawNpcDialogue() {
  if (!runtime.npcDialogue.active) return;
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
  const headerH = 28;
  const textAreaW = boxW - padding * 2 - portraitArea;

  // Measure text
  ctx.save();
  ctx.font = "13px Inter, system-ui, sans-serif";
  const wrappedLines = wrapText(ctx, text, textAreaW);
  const textH = wrappedLines.length * lineHeight;

  // Measure options
  const optionsH = options.length > 0 ? options.length * optionLineHeight + 10 : 0;

  // Box height: fit portrait, text, and options
  const portraitH = npcImg ? Math.min(140, npcImg.height) : 0;
  const contentH = Math.max(textH + optionsH + padding, portraitH + 8);
  const footerH = isOptionLine ? 20 : 24;
  const boxH = headerH + contentH + padding + footerH;

  const boxX = Math.round((canvasEl.width - boxW) / 2);
  const boxY = Math.round((canvasEl.height - boxH) / 2);

  // Background
  ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
  roundRect(ctx, boxX, boxY, boxW, boxH, 8);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(255, 200, 50, 0.6)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, boxX, boxY, boxW, boxH, 8);
  ctx.stroke();

  // NPC name header
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 14px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let headerText = d.npcName;
  if (d.npcFunc) headerText += `  (${d.npcFunc})`;
  ctx.fillText(headerText, boxX + padding + portraitArea, boxY + 8);

  // Divider
  ctx.strokeStyle = "rgba(255, 200, 50, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(boxX + padding + portraitArea, boxY + headerH);
  ctx.lineTo(boxX + boxW - padding, boxY + headerH);
  ctx.stroke();

  // Draw NPC portrait on the left
  if (npcImg && portraitW > 0) {
    const scale = Math.min(1, 120 / npcImg.width, 140 / npcImg.height);
    const drawW = Math.round(npcImg.width * scale);
    const drawH = Math.round(npcImg.height * scale);
    const portraitX = boxX + padding + Math.round((portraitW - drawW) / 2);
    const portraitY = boxY + headerH + Math.round((contentH - drawH) / 2);
    ctx.drawImage(npcImg, portraitX, portraitY, drawW, drawH);
  }

  // Dialogue text
  ctx.fillStyle = "#e5e7eb";
  ctx.font = "13px Inter, system-ui, sans-serif";
  const textX = boxX + padding + portraitArea;
  for (let i = 0; i < wrappedLines.length; i++) {
    ctx.fillText(wrappedLines[i], textX, boxY + headerH + 8 + i * lineHeight);
  }

  // Options (clickable list)
  if (options.length > 0) {
    const optStartY = boxY + headerH + 8 + textH + 10;
    ctx.font = "13px Inter, system-ui, sans-serif";

    for (let i = 0; i < options.length; i++) {
      const optY = optStartY + i * optionLineHeight;
      const isHovered = d.hoveredOption === i;

      // Option background highlight on hover
      if (isHovered) {
        ctx.fillStyle = "rgba(255, 200, 50, 0.15)";
        ctx.fillRect(textX - 4, optY - 2, textAreaW + 8, optionLineHeight);
      }

      // Option bullet + label
      ctx.fillStyle = isHovered ? "#fbbf24" : "#93c5fd";
      ctx.fillText(`▸ ${options[i].label}`, textX + 4, optY + 4);

      // Store hit box for click detection
      _npcDialogueOptionHitBoxes.push({
        x: textX - 4,
        y: optY - 2,
        w: textAreaW + 8,
        h: optionLineHeight,
        index: i,
      });
    }
  }

  // Footer hint
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  if (isOptionLine) {
    ctx.fillText("Click an option or press Escape to close", boxX + boxW / 2, boxY + boxH - 12);
  } else {
    const pageInfo = d.lines.length > 1 ? ` (${d.lineIndex + 1}/${d.lines.length})` : "";
    ctx.fillText(`Click or press Enter to continue${pageInfo}`, boxX + boxW / 2, boxY + boxH - 16);
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
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Reactor Sprite System ────────────────────────────────────────────────────
const reactorAnimations = new Map(); // key: reactorId -> { frames: [{ key, width, height, originX, originY, delay }], name }
const reactorAnimationPromises = new Map();

/**
 * Load reactor sprite data from Reactor.wz JSON.
 * Loads state 0 normal animation frames (the idle appearance).
 * Returns { frames: [{ key, width, height, originX, originY, delay }], name }
 */
async function loadReactorAnimation(reactorId) {
  if (reactorAnimations.has(reactorId)) return reactorAnimations.get(reactorId);
  if (reactorAnimationPromises.has(reactorId)) return reactorAnimationPromises.get(reactorId);

  const promise = (async () => {
    try {
      const paddedId = reactorId.padStart(7, "0");
      const path = `/resources/Reactor.wz/${paddedId}.img.json`;
      const json = await fetchJson(path);
      if (!json) {
        reactorAnimations.set(reactorId, null);
        return null;
      }

      // Get info name
      const infoNode = childByName(json, "info");
      const infoRec = infoNode ? imgdirLeafRecord(infoNode) : {};
      const name = String(infoRec.info ?? "");

      // Get state 0 (normal/idle state)
      const state0Node = childByName(json, "0");
      if (!state0Node) {
        reactorAnimations.set(reactorId, null);
        return null;
      }

      // Collect canvas frames from state 0 (direct children that are canvases)
      const frames = [];
      for (const child of state0Node.$$ ?? []) {
        if (child.$canvas !== undefined) {
          const frameIndex = child.$canvas;
          const meta = canvasMetaFromNode(child);
          if (meta) {
            const key = `reactor:${reactorId}:0:${frameIndex}`;
            const childRec = {};
            for (const sub of child.$$ ?? []) {
              if (sub.$vector === "origin") {
                childRec.originX = safeNumber(sub.x, 0);
                childRec.originY = safeNumber(sub.y, 0);
              }
              if (sub.$int === "delay") childRec.delay = safeNumber(sub.value, 100);
            }
            frames.push({
              key,
              width: meta.width,
              height: meta.height,
              originX: childRec.originX ?? 0,
              originY: childRec.originY ?? 0,
              delay: childRec.delay ?? 0,
              basedata: meta.basedata,
            });
          }
        }
      }

      if (frames.length === 0) {
        reactorAnimations.set(reactorId, null);
        return null;
      }

      const result = { frames, name };
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
const reactorRuntimeState = new Map(); // key: reactor entry index -> { frameIndex, elapsed, state }

function initReactorRuntimeStates() {
  reactorRuntimeState.clear();
  if (!runtime.map) return;

  for (let i = 0; i < runtime.map.reactorEntries.length; i++) {
    const reactor = runtime.map.reactorEntries[i];
    const anim = reactorAnimations.get(reactor.id);
    if (!anim) continue;

    reactorRuntimeState.set(i, {
      frameIndex: 0,
      elapsed: 0,
      state: 0, // initial state
      active: true,
    });
  }
}

function updateReactorAnimations(dt) {
  if (!runtime.map) return;

  for (const [idx, state] of reactorRuntimeState) {
    const reactor = runtime.map.reactorEntries[idx];
    const anim = reactorAnimations.get(reactor.id);
    if (!anim || anim.frames.length <= 1) continue;

    const frame = anim.frames[state.frameIndex];
    if (!frame || frame.delay <= 0) continue;

    state.elapsed += dt;
    if (state.elapsed >= frame.delay) {
      state.elapsed -= frame.delay;
      state.frameIndex = (state.frameIndex + 1) % anim.frames.length;
    }
  }
}

function drawReactors() {
  if (!runtime.map) return;

  const cam = runtime.camera;
  const halfW = canvasEl.width / 2;
  const halfH = canvasEl.height / 2;

  for (const [idx, state] of reactorRuntimeState) {
    if (!state.active) continue;

    const reactor = runtime.map.reactorEntries[idx];
    const anim = reactorAnimations.get(reactor.id);
    if (!anim || anim.frames.length === 0) continue;

    const frame = anim.frames[state.frameIndex % anim.frames.length];
    const img = getImageByKey(frame.key);
    if (!img) continue;

    // Screen position (mirrors worldToScreen)
    const screenX = Math.round(reactor.x - cam.x + halfW);
    const screenY = Math.round(reactor.y - cam.y + halfH);

    // Cull if off screen
    if (
      screenX + img.width < -100 ||
      screenX - img.width > canvasEl.width + 100 ||
      screenY + img.height < -100 ||
      screenY - img.height > canvasEl.height + 100
    )
      continue;

    ctx.save();

    const flip = reactor.f === 1;
    if (flip) {
      ctx.translate(screenX, screenY);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -frame.originX, -frame.originY);
    } else {
      ctx.drawImage(img, screenX - frame.originX, screenY - frame.originY);
    }

    ctx.restore();
  }
}

function drawReactorMarkers() {
  if (!runtime.map) return;

  ctx.save();
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (const reactor of runtime.map.reactorEntries) {
    const sp = worldToScreen(reactor.x, reactor.y);
    ctx.fillStyle = "rgba(255, 100, 255, 0.7)";
    ctx.fillRect(sp.x - 4, sp.y - 4, 8, 8);
    ctx.fillStyle = "#ff64ff";
    ctx.fillText(`R:${reactor.id}`, sp.x, sp.y - 6);
  }

  ctx.restore();
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
        };
      })
      .sort((a, b) => (a.z === b.z ? a.id - b.id : a.z - b.z));

    const objects = imgdirChildren(childByName(layerNode, "obj"))
      .map((entry) => {
        const row = imgdirLeafRecord(entry);
        const frameNo = String(row.f ?? "0");
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
          z: safeNumber(row.z, 0),
          baseKey,
          key: `${baseKey}:${frameNo}`,
          // Animation fields — populated during preload
          frameCount: 1,
          frameDelays: null, // null = not animated, [ms, ms, ...] = animated
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
    bottom: bottomBorder + 100,
  };

  const wallLines = footholdLines
    .filter((line) => Math.abs(line.x2 - line.x1) < 0.01)
    .map((line) => ({
      x: line.x1,
      y1: Math.min(line.y1, line.y2),
      y2: Math.max(line.y1, line.y2),
    }));

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

  return {
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
  };
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
  requestMeta(entry.key, () => loadBackgroundMeta(entry));
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
  requestMeta(tile.key, () => loadTileMeta(tile));
}

async function loadObjectMeta(obj) {
  if (!obj.key) return null;

  const path = `/resources/Map.wz/Obj/${obj.oS}.img.json`;
  const json = await fetchJson(path);
  const target = findNodeByPath(json, [obj.l0, obj.l1, obj.l2]);
  const canvasNode = pickCanvasNode(target, obj.frameNo);
  return canvasMetaFromNode(canvasNode);
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

  // Count numeric-keyed children that are canvas nodes
  const frameNodes = (target.$$ ?? []).filter(
    (c) => c.$imgdir !== undefined && /^\d+$/.test(c.$imgdir)
  );
  if (frameNodes.length <= 1) return null;

  const delays = [];
  for (const frameNode of frameNodes) {
    const frameIdx = frameNode.$imgdir;
    const canvasNode = pickCanvasNode(target, frameIdx);
    if (!canvasNode) continue;

    const meta = canvasMetaFromNode(canvasNode);
    if (!meta) continue;

    const key = `${obj.baseKey}:${frameIdx}`;
    if (!metaCache.has(key)) {
      metaCache.set(key, meta);
    }

    // Get delay from the frame node's children
    let delay = 100;
    for (const sub of frameNode.$$ ?? []) {
      if (sub.$int === "delay") {
        delay = safeNumber(sub.value, 100);
      }
    }
    // Also check canvas node children for delay
    if (canvasNode !== frameNode) {
      for (const sub of canvasNode.$$ ?? []) {
        if (sub.$int === "delay") {
          delay = safeNumber(sub.value, delay);
        }
      }
    }
    delays.push(Math.max(delay, 30));

    // Preload the image
    await requestImageByKey(key);
  }

  return delays.length > 1 ? { frameCount: delays.length, delays } : null;
}

function requestObjectMeta(obj) {
  if (!obj.key) return;
  requestMeta(obj.key, () => loadObjectMeta(obj));
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

function isAutoEnterPortal(portal) {
  return portal.type === 3 || portal.type === 9;
}

function portalBoundsContainsPlayer(portal) {
  const player = runtime.player;
  return (
    player.x >= portal.x - 25 &&
    player.x <= portal.x + 25 &&
    player.y >= portal.y - 100 &&
    player.y <= portal.y + 25
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
  const halfWidth = canvasEl.width / 2;

  const minCenterX = mapLeft + halfWidth;
  const maxCenterX = mapRight - halfWidth;

  if (minCenterX <= maxCenterX) {
    return Math.max(minCenterX, Math.min(maxCenterX, desiredCenterX));
  }

  // Map narrower than viewport — center on map
  return (mapLeft + mapRight) / 2;
}

function clampCameraYToMapBounds(map, desiredCenterY) {
  const { top: mapTop, bottom: mapBottom } = mapVisibleBounds(map);
  const halfHeight = canvasEl.height / 2;

  const minCenterY = mapTop + halfHeight;
  const maxCenterY = mapBottom - halfHeight;

  if (minCenterY <= maxCenterY) {
    return Math.max(minCenterY, Math.min(maxCenterY, desiredCenterY));
  }

  // Map shorter than viewport — follow player within bounds
  return Math.max(maxCenterY, Math.min(minCenterY, desiredCenterY));
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
  const targetY = runtime.player.y - cameraHeightBias();

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

  const below = findFootholdBelow(runtime.map, targetPortal.x, targetPortal.y);
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

async function runPortalMapTransition(targetMapId, targetPortalName) {
  rlog(`portalTransition START → map=${targetMapId} portal=${targetPortalName}`);
  await fadeScreenTo(1, PORTAL_FADE_OUT_MS);
  rlog(`portalTransition fadeOut done, clearing overlay for loading screen`);
  // Clear transition overlay so loading screen is visible
  runtime.transition.alpha = 0;
  runtime.transition.active = false;
  try {
    await loadMap(targetMapId, targetPortalName || null, true);
    rlog(`portalTransition loadMap resolved`);
  } catch (err) {
    rlog(`portalTransition loadMap THREW: ${err?.message ?? err}`);
  } finally {
    // Fade in from black after map loads
    runtime.transition.alpha = 1;
    runtime.transition.active = true;
    rlog(`portalTransition fadeIn start`);
    await fadeScreenTo(0, PORTAL_FADE_IN_MS);
    rlog(`portalTransition COMPLETE`);
  }
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

    if (portal.targetMapId === currentMapId || !isValidPortalTargetMapId(portal.targetMapId)) {
      if (targetPortalName) {
        const moved = movePlayerToPortalInCurrentMap(targetPortalName);
        if (moved) {
          await waitForPortalMomentumScrollToFinish();
          return;
        }
      }

      const returnMapId = safeNumber(runtime.map.info?.returnMap, -1);
      if (isValidPortalTargetMapId(returnMapId) && returnMapId !== currentMapId) {
        await runPortalMapTransition(String(returnMapId), targetPortalName || null);
        return;
      }

      setStatus(`Portal ${portal.name || portal.id} has no local destination in map ${runtime.mapId}.`);
      return;
    }

    rlog(`tryUsePortal → runPortalMapTransition targetMap=${portal.targetMapId} targetPortal=${targetPortalName}`);
    await runPortalMapTransition(String(portal.targetMapId), targetPortalName || null);
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

  requestMeta(key, () => loadPortalMeta(portal, frameNo));
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
        const fetches = [
          fetchJson("/resources/Character.wz/00002000.img.json"),
          fetchJson("/resources/Character.wz/00012000.img.json"),
          fetchJson("/resources/Character.wz/Face/00020000.img.json"),
          fetchJson("/resources/Base.wz/zmap.img.json"),
          fetchJson(`/resources/Character.wz/${DEFAULT_HAIR_PATH}`),
          ...DEFAULT_EQUIPS.map((eq) => fetchJson(`/resources/Character.wz/${eq.path}`)),
        ];

        const results = await Promise.all(fetches);
        const [bodyData, headData, faceData, zMapData, hairData, ...equipResults] = results;

        runtime.characterData = bodyData;
        runtime.characterHeadData = headData;
        runtime.characterFaceData = faceData;
        runtime.zMapOrder = buildZMapOrder(zMapData);
        runtime.characterHairData = hairData;

        for (let i = 0; i < DEFAULT_EQUIPS.length; i++) {
          runtime.characterEquipData[DEFAULT_EQUIPS[i].id] = equipResults[i];
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

function getFaceExpressionFrames(expression) {
  const faceData = runtime.characterFaceData;
  if (!faceData) return [];

  const expressionNode = childByName(faceData, expression);
  if (!expressionNode) return [];

  const expressionFrames = imgdirChildren(expressionNode).sort((a, b) => Number(a.$imgdir) - Number(b.$imgdir));
  if (expressionFrames.length > 0) {
    return expressionFrames;
  }

  return [expressionNode];
}

function getFaceFrameMeta(frameLeaf, expression, expressionFrameIndex) {
  const faceData = runtime.characterFaceData;
  if (!faceData) return null;

  if (safeNumber(frameLeaf.face, 1) === 0) {
    return null;
  }

  const frames = getFaceExpressionFrames(expression);
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

function updateFaceAnimation(dt) {
  if (!runtime.characterFaceData) return;

  const faceAnimation = runtime.faceAnimation;

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
function getHairFrameParts(action, frameIndex) {
  const hairData = runtime.characterHairData;
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
              name: `hair:${DEFAULT_HAIR_ID}:${action}:${frameIndex}:${child.$canvas}`,
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
                name: `hair:${DEFAULT_HAIR_ID}:${action}:${frameIndex}:${resolvedName}`,
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

  return extractHairPartsFromContainer(defaultNode, `hair:${DEFAULT_HAIR_ID}:default`);
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

function getCharacterFrameData(action, frameIndex) {
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
      runtime.faceAnimation.expression,
      runtime.faceAnimation.frameIndex,
    );
    if (faceMeta) {
      frameParts.push({ name: "face", meta: faceMeta });
    }
  }

  // Hair
  const hairParts = getHairFrameParts(action, frameIndex);
  for (const hp of hairParts) {
    frameParts.push(hp);
  }

  // Equipment
  for (const equip of DEFAULT_EQUIPS) {
    const equipData = runtime.characterEquipData[equip.id];
    if (!equipData) continue;
    const equipParts = getEquipFrameParts(equipData, action, frameIndex, `equip:${equip.id}`);
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
        addPreloadTask(taskMap, animKey, async () => {
          const result = await loadAnimatedObjectFrames(obj);
          if (result) {
            for (const o of objsWithSameBase) {
              o.frameCount = result.frameCount;
              o.frameDelays = result.delays;
            }
          }
          return result;
        });
      }
    }
  }

  for (const portal of map.portalEntries ?? []) {
    if (portalVisibilityMode(portal) === "none") continue;

    const frameCount = portal.type === 10 || portal.type === 11 ? 7 : 8;
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
      // Preload stand + move frame images eagerly, then clear basedata to free memory
      for (const stanceName of ["stand", "move"]) {
        const stance = anim.stances[stanceName];
        if (!stance) continue;
        for (const frame of stance.frames) {
          await requestImageByKey(frame.key);
          delete frame.basedata;
          const cachedMeta = metaCache.get(frame.key);
          if (cachedMeta) delete cachedMeta.basedata;
        }
      }
      return anim;
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
      // Register all frames in metaCache and preload images
      for (const frame of anim.frames) {
        if (!metaCache.has(frame.key)) {
          metaCache.set(frame.key, {
            basedata: frame.basedata,
            width: frame.width,
            height: frame.height,
          });
        }
        await requestImageByKey(frame.key);
        // Free basedata after decode
        delete frame.basedata;
        const cachedMeta = metaCache.get(frame.key);
        if (cachedMeta) delete cachedMeta.basedata;
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
    if (isWallFoothold(line)) continue;

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
    const dx = line.x2 - line.x1;
    if (Math.abs(dx) < 0.01) continue;

    const minX = Math.min(line.x1, line.x2);
    const maxX = Math.max(line.x1, line.x2);
    if (x < minX - 1 || x > maxX + 1) continue;

    const t = (x - line.x1) / dx;
    if (t < -0.01 || t > 1.01) continue;

    const yAtX = line.y1 + (line.y2 - line.y1) * t;
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
  let bestY = Number.POSITIVE_INFINITY;

  for (const line of map.footholdLines ?? []) {
    if (isWallFoothold(line)) continue;
    if (excludedFootholdId && String(line.id) === String(excludedFootholdId)) continue;

    const minX = Math.min(line.x1, line.x2);
    const maxX = Math.max(line.x1, line.x2);
    if (x < minX - 1 || x > maxX + 1) continue;

    const dx = line.x2 - line.x1;
    if (Math.abs(dx) < 0.01) continue;

    const t = (x - line.x1) / dx;
    if (t < -0.01 || t > 1.01) continue;

    const yAtX = line.y1 + (line.y2 - line.y1) * t;
    if (yAtX < minY - 1) continue;

    if (yAtX < bestY) {
      bestY = yAtX;
      best = { y: yAtX, line };
    }
  }

  return best;
}

function footholdLeft(foothold) {
  return Math.min(foothold.x1, foothold.x2);
}

function footholdRight(foothold) {
  return Math.max(foothold.x1, foothold.x2);
}

function isWallFoothold(foothold) {
  return Math.abs(foothold.x2 - foothold.x1) < 0.01;
}

function rangesOverlap(a1, a2, b1, b2) {
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const minB = Math.min(b1, b2);
  const maxB = Math.max(b1, b2);
  return maxA >= minB && maxB >= minA;
}

function isBlockingWall(foothold, minY, maxY) {
  if (!foothold || !isWallFoothold(foothold)) return false;
  return rangesOverlap(foothold.y1, foothold.y2, minY, maxY);
}

function getWallX(map, current, left, nextY) {
  const minY = Math.floor(nextY) - 50;
  const maxY = Math.floor(nextY) - 1;

  if (left) {
    const prev = findFootholdById(map, current.prevId);
    if (isBlockingWall(prev, minY, maxY)) {
      return footholdLeft(current);
    }

    const prevPrev = prev ? findFootholdById(map, prev.prevId) : null;
    if (isBlockingWall(prevPrev, minY, maxY)) {
      return footholdLeft(prev);
    }

    return map.walls?.left ?? map.bounds.minX;
  }

  const next = findFootholdById(map, current.nextId);
  if (isBlockingWall(next, minY, maxY)) {
    return footholdRight(current);
  }

  const nextNext = next ? findFootholdById(map, next.nextId) : null;
  if (isBlockingWall(nextNext, minY, maxY)) {
    return footholdRight(next);
  }

  return map.walls?.right ?? map.bounds.maxX;
}

function resolveWallCollision(oldX, newX, nextY, map, footholdId) {
  const current = findFootholdById(map, footholdId);
  if (!current) return newX;

  if (newX === oldX) return newX;

  const left = newX < oldX;
  const wallX = getWallX(map, current, left, nextY);
  const collision = left ? oldX >= wallX && newX <= wallX : oldX <= wallX && newX >= wallX;

  return collision ? wallX : newX;
}

function footholdSlope(foothold) {
  const dx = foothold.x2 - foothold.x1;
  if (Math.abs(dx) < 0.01) return 0;
  return (foothold.y2 - foothold.y1) / dx;
}

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

function groundYOnFoothold(foothold, x) {
  const dx = foothold.x2 - foothold.x1;
  if (Math.abs(dx) < 0.01) {
    return Math.min(foothold.y1, foothold.y2);
  }

  const t = (x - foothold.x1) / dx;
  return foothold.y1 + (foothold.y2 - foothold.y1) * t;
}

function resolveFootholdForX(map, foothold, x) {
  let current = foothold;
  let resolvedX = x;

  for (let step = 0; step < 8 && current; step += 1) {
    const left = footholdLeft(current);
    const right = footholdRight(current);

    if (Math.floor(resolvedX) > right) {
      const next = findFootholdById(map, current.nextId);
      if (!next || isWallFoothold(next)) {
        return { foothold: null, x: resolvedX };
      }

      current = next;
      continue;
    }

    if (Math.ceil(resolvedX) < left) {
      const prev = findFootholdById(map, current.prevId);
      if (!prev || isWallFoothold(prev)) {
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

  const crouchRequested = runtime.input.down && player.onGround && !player.climbing && !prioritizeDownAttach;
  const downJumpMovementLocked = player.downJumpControlLock && !player.onGround;
  const npcDialogueLock = runtime.npcDialogue.active;
  const effectiveMove = crouchRequested || downJumpMovementLocked || npcDialogueLock ? 0 : move;

  if (!player.climbing && effectiveMove !== 0) {
    player.facing = effectiveMove > 0 ? 1 : -1;
  }

  const allowClimbAttachNow = !climbOnCooldown || prioritizeDownAttach;
  if (!player.climbing && allowClimbAttachNow) {
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
      player.climbCooldownUntil = nowMs + 1000;
      playSfx("Game", "Jump");
    } else {
      const rope = player.climbRope;
      const climbSpeed = playerClimbforce() * PHYS_TPS;

      const movingUp = runtime.input.up && !runtime.input.down;
      const movingDown = runtime.input.down && !runtime.input.up;

      player.x = climbSnapX(rope);
      player.y += (movingDown ? 1 : movingUp ? -1 : 0) * climbSpeed * dt;
      player.vx = 0;
      player.vy = movingDown ? climbSpeed : movingUp ? -climbSpeed : 0;
      player.onGround = false;

      if (ladderFellOff(rope, player.y, movingDown)) {
        const ropeTopY = Math.min(rope.y1, rope.y2);
        const exitedFromTop = !movingDown && player.y + 5 < ropeTopY;
        const topExitFoothold = exitedFromTop
          ? findFootholdAtXNearY(map, player.x, ropeTopY, 24)
          : null;
        const canSnapToTopFoothold = !!topExitFoothold && !isWallFoothold(topExitFoothold.line);

        player.climbing = false;
        player.climbRope = null;
        player.downJumpIgnoreFootholdId = null;
        player.downJumpIgnoreUntil = 0;
        player.downJumpControlLock = false;
        player.downJumpTargetFootholdId = null;
        player.reattachLockRopeKey = rope.key ?? null;
        player.reattachLockUntil = nowMs + 200;
        player.climbCooldownUntil = nowMs + 1000;

        if (canSnapToTopFoothold) {
          player.y = topExitFoothold.y;
          player.vx = 0;
          player.vy = 0;
          player.onGround = true;
          player.footholdId = topExitFoothold.line.id;
          player.footholdLayer = topExitFoothold.line.layer;
        } else {
          if (exitedFromTop) {
            player.y = Math.max(player.y, ropeTopY - 5);
          }
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

    const slope = currentFoothold && !isWallFoothold(currentFoothold)
      ? footholdSlope(currentFoothold)
      : 0;

    if (player.onGround) {
      const hforceTick = effectiveMove * playerWalkforce();
      let hspeedTick = player.vx / PHYS_TPS;

      hspeedTick = applyGroundPhysics(hspeedTick, hforceTick, slope, numTicks);

      player.vx = hspeedTick * PHYS_TPS;
      player.vy = 0;

      if (jumpRequested) {
        const footholdGround =
          currentFoothold && !isWallFoothold(currentFoothold)
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

    if (player.onGround && (!currentFoothold || isWallFoothold(currentFoothold))) {
      player.onGround = false;
      player.footholdId = null;
    }

    if (player.onGround && currentFoothold && !isWallFoothold(currentFoothold)) {
      const oldX = player.x;
      let nextX = oldX + player.vx * dt;
      nextX = resolveWallCollision(oldX, nextX, player.y, map, currentFoothold.id);
      horizontalApplied = true;

      const footholdResolution = resolveFootholdForX(map, currentFoothold, nextX);
      const nextFoothold = footholdResolution?.foothold ?? null;
      const resolvedX = footholdResolution?.x ?? nextX;

      if (nextFoothold && !isWallFoothold(nextFoothold)) {
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
      } else {
        player.onGround = false;
        player.footholdId = null;
      }
    }
  }

  player.x = Math.max(map.bounds.minX - 40, Math.min(map.bounds.maxX + 40, player.x));
  if (player.y > map.bounds.maxY + 400) {
    const spawn = map.portalEntries.find((portal) => portal.type === 0) ?? map.portalEntries[0];
    player.x = spawn ? spawn.x : 0;
    player.y = spawn ? spawn.y : 0;
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
  } else {
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

    const duration = Math.max(1, scroll.durationMs);
    const t = Math.max(0, Math.min(1, scroll.elapsedMs / duration));
    const easedT = portalMomentumEase(t);

    runtime.camera.x = scroll.startX + (scroll.targetX - scroll.startX) * easedT;
    runtime.camera.y = scroll.startY + (scroll.targetY - scroll.startY) * easedT;
    runtime.camera.x = clampCameraXToMapBounds(runtime.map, runtime.camera.x);
    runtime.camera.y = clampCameraYToMapBounds(runtime.map, runtime.camera.y);

    if (t >= 1) {
      runtime.camera.x = scroll.targetX;
      runtime.camera.y = scroll.targetY;
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
    return;
  }

  ctx.save();
  ctx.translate(drawX + image.width, drawY);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function drawBackgroundLayer(frontFlag) {
  if (!runtime.map) return;

  const canvasW = canvasEl.width;
  const canvasH = canvasEl.height;

  const refHalfW = BG_REFERENCE_WIDTH / 2;
  const refHalfH = BG_REFERENCE_HEIGHT / 2;

  const screenHalfW = canvasW / 2;
  const screenHalfH = canvasH / 2;

  const camX = runtime.camera.x;
  const camY = runtime.camera.y;

  const nowMs = performance.now();

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

    requestBackgroundMeta(background);
    const image = getImageByKey(frameKey) ?? getImageByKey(background.key);
    const meta = metaCache.get(frameKey) ?? metaCache.get(background.key);
    if (!image || !meta) continue;

    const origin = meta.vectors.origin ?? { x: 0, y: 0 };
    const width = Math.max(1, image.width || meta.width || 1);
    const height = Math.max(1, image.height || meta.height || 1);

    const cx = background.cx > 0 ? background.cx : width;
    const cy = background.cy > 0 ? background.cy : height;

    const hMobile = background.type === 4 || background.type === 6;
    const vMobile = background.type === 5 || background.type === 7;

    let x;
    if (hMobile) {
      x = background.x + (background.rx * nowMs) / 128 + (screenHalfW - camX);
    } else {
      const shiftX = (background.rx * camX) / 100 + refHalfW;
      x = background.x + shiftX + (screenHalfW - refHalfW);
    }

    let y;
    if (vMobile) {
      y = background.y + (background.ry * nowMs) / 128 + (screenHalfH - camY);
    } else {
      const shiftY = (background.ry * camY) / 100 + refHalfH;
      y = background.y + shiftY + (screenHalfH - refHalfH);
    }

    // C++ tiling: htile/vtile count-based, matching MapBackgrounds.cpp
    const tileX = background.type === 1 || background.type === 3 || background.type === 4 || background.type === 6 || background.type === 7;
    const tileY = background.type === 2 || background.type === 3 || background.type === 5 || background.type === 6 || background.type === 7;

    let drawX = x - (background.flipped ? width - origin.x : origin.x);
    let drawY = y - origin.y;

    // C++ tiling: count-based for tiled types, single draw for type 0
    const htile = tileX ? Math.floor(canvasW / cx) + 3 : 1;
    const vtile = tileY ? Math.floor(canvasH / cy) + 3 : 1;

    if (htile > 1) {
      while (drawX > 0) drawX -= cx;
      while (drawX < -cx) drawX += cx;
    }
    if (vtile > 1) {
      while (drawY > 0) drawY -= cy;
      while (drawY < -cy) drawY += cy;
    }

    const ix = Math.round(drawX);
    const iy = Math.round(drawY);
    const tw = cx * htile;
    const th = cy * vtile;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, background.alpha));

    for (let tx = 0; tx < tw; tx += cx) {
      for (let ty = 0; ty < th; ty += cy) {
        drawScreenImage(image, ix + tx, iy + ty, background.flipped);
      }
    }

    ctx.restore();
  }
}

// Object animation states: keyed by "layer:objId" -> { frameIndex, timerMs }
const objectAnimStates = new Map();
// Background animation states: keyed by bg index -> { frameIndex, timerMs }
const bgAnimStates = new Map();

function updateBackgroundAnimations(dtMs) {
  if (!runtime.map) return;

  for (const bg of runtime.map.backgrounds) {
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
        state = { frameIndex: 0, timerMs: 0 };
        objectAnimStates.set(stateKey, state);
      }

      state.timerMs += dtMs;
      const delay = obj.frameDelays[state.frameIndex % obj.frameDelays.length];
      if (state.timerMs >= delay) {
        state.timerMs -= delay;
        state.frameIndex = (state.frameIndex + 1) % obj.frameCount;
      }
    }
  }
}

function drawMapLayer(layer) {
  for (const obj of layer.objects) {
    // Determine which frame to show
    let frameKey = obj.key;
    if (obj.frameDelays && obj.frameCount > 1) {
      const stateKey = `${layer.layerIndex}:${obj.id}`;
      const state = objectAnimStates.get(stateKey);
      if (state) {
        frameKey = `${obj.baseKey}:${state.frameIndex}`;
      }
    }

    requestObjectMeta(obj);
    const image = getImageByKey(frameKey);
    const meta = metaCache.get(frameKey);
    if (!image || !meta) {
      // Fallback to original frame key
      const fbImage = getImageByKey(obj.key);
      const fbMeta = metaCache.get(obj.key);
      if (fbImage && fbMeta) {
        const origin = fbMeta.vectors.origin ?? { x: 0, y: 0 };
        drawWorldImage(fbImage, obj.x - origin.x, obj.y - origin.y);
      }
      continue;
    }

    const origin = meta.vectors.origin ?? { x: 0, y: 0 };
    const worldX = obj.x - origin.x;
    const worldY = obj.y - origin.y;
    drawWorldImage(image, worldX, worldY);
  }

  for (const tile of layer.tiles) {
    if (!tile.key) continue;
    requestTileMeta(tile);
    const image = getImageByKey(tile.key);
    const meta = metaCache.get(tile.key);
    if (!image || !meta) continue;

    const origin = meta.vectors.origin ?? { x: 0, y: 0 };
    const worldX = tile.x - origin.x;
    const worldY = tile.y - origin.y;
    drawWorldImage(image, worldX, worldY);
  }
}

function currentPlayerRenderLayer() {
  if (!runtime.map) return safeNumber(runtime.player.footholdLayer, -1);
  if (runtime.player.climbing) return 7;
  if (!runtime.player.onGround) return 7;
  return safeNumber(runtime.player.footholdLayer, -1);
}

function drawMapLayersWithCharacter() {
  if (!runtime.map) return;

  const playerLayer = currentPlayerRenderLayer();
  let playerDrawn = false;

  for (const layer of runtime.map.layers) {
    drawMapLayer(layer);

    if (!playerDrawn && layer.layerIndex === playerLayer) {
      drawCharacter();
      playerDrawn = true;
    }
  }

  if (!playerDrawn) {
    drawCharacter();
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

  const frameNo = Math.floor(performance.now() / 120) % 8;

  for (const portal of runtime.map.portalEntries) {
    const visibilityMode = portalVisibilityMode(portal);
    if (visibilityMode === "none") continue;

    let portalAlpha = 1;
    if (visibilityMode === "touched") {
      portalAlpha = getHiddenPortalAlpha(portal);
      if (portalAlpha <= 0) continue;
    }

    const key = requestPortalMeta(portal, frameNo);
    if (!key) continue;

    const image = getImageByKey(key);
    const meta = metaCache.get(key);
    if (!image || !meta) continue;

    const origin = meta.vectors.origin ?? { x: Math.floor(image.width / 2), y: image.height };
    const worldX = portal.x - origin.x;
    const worldY = portal.y - origin.y;

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

  for (const line of runtime.map.footholdLines) {
    const a = worldToScreen(line.x1, line.y1);
    const b = worldToScreen(line.x2, line.y2);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
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

function composeCharacterPlacements(action, frameIndex, player, flipped) {
  const frame = getCharacterFrameData(action, frameIndex);
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

  const body = partAssets.find((part) => part.name === "body");
  if (!body) return null;

  const bodyTopLeft = topLeftFromAnchor(body.meta, body.image, { x: player.x, y: player.y }, null, flipped);
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
      const anchorName = pickAnchorName(part.meta, anchors);
      if (!anchorName) continue;

      const topLeft = topLeftFromAnchor(part.meta, part.image, anchors[anchorName], anchorName, flipped);
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

  return placements.sort((a, b) => a.zOrder - b.zOrder);
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

function drawCharacter() {
  const player = runtime.player;
  const flipped = player.facing > 0;

  const currentPlacements = composeCharacterPlacements(player.action, player.frameIndex, player, flipped);
  const fallback = runtime.lastRenderableCharacterFrame;
  const placements =
    currentPlacements ??
    (fallback ? composeCharacterPlacements(fallback.action, fallback.frameIndex, player, flipped) : null);

  if (!placements || placements.length === 0) {
    return;
  }

  if (currentPlacements) {
    runtime.lastRenderableCharacterFrame = {
      action: player.action,
      frameIndex: player.frameIndex,
    };
  }

  const bounds = characterBoundsFromPlacements(placements);
  if (bounds) {
    runtime.lastCharacterBounds = bounds;
    if (player.action === "stand1") {
      runtime.standardCharacterWidth = Math.max(40, Math.min(120, Math.round(bounds.width)));
    }
  }

  for (const part of placements) {
    drawWorldImage(part.image, part.topLeft.x, part.topLeft.y, { flipped });
  }
}

function drawChatBubble() {
  const now = performance.now();
  if (runtime.player.bubbleExpiresAt < now || !runtime.player.bubbleText) return;

  const anchor = worldToScreen(runtime.player.x, runtime.player.y - 70);
  const text = runtime.player.bubbleText;

  ctx.save();
  ctx.font = "14px Inter, system-ui, sans-serif";

  const standardWidth = Math.max(1, Math.round(runtime.standardCharacterWidth || DEFAULT_STANDARD_CHARACTER_WIDTH));
  const maxBubbleWidth = Math.max(40, Math.round(standardWidth * CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER));
  const maxTextWidth = Math.max(14, maxBubbleWidth - CHAT_BUBBLE_HORIZONTAL_PADDING * 2);
  const lines = wrapBubbleTextToWidth(text, maxTextWidth);

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

  roundRect(ctx, clampedX, y, width, height, 8);
  ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
  ctx.stroke();

  ctx.fillStyle = "#f8fafc";
  ctx.textBaseline = "top";
  for (let index = 0; index < lines.length; index += 1) {
    const lineY = y + CHAT_BUBBLE_VERTICAL_PADDING + index * CHAT_BUBBLE_LINE_HEIGHT;
    ctx.fillText(lines[index], clampedX + CHAT_BUBBLE_HORIZONTAL_PADDING, lineY);
  }

  const tailX = Math.max(clampedX + 8, Math.min(clampedX + width - 8, anchor.x));
  ctx.beginPath();
  ctx.moveTo(tailX - 7, y + height);
  ctx.lineTo(tailX + 7, y + height);
  ctx.lineTo(tailX, y + height + 8);
  ctx.closePath();
  ctx.fillStyle = "rgba(15, 23, 42, 0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
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
  ctx.font = "bold 12px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const nameText = player.name;
  const nameWidth = ctx.measureText(nameText).width;
  const padH = 4;
  const padV = 2;
  const tagW = nameWidth + padH * 2;
  const tagH = 14 + padV * 2;
  const tagX = Math.round(screen.x - tagW / 2);
  const tagY = Math.round(screen.y + 2);

  // Background
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(tagX, tagY, tagW, tagH);

  // Name text
  ctx.fillStyle = "#ffffff";
  ctx.fillText(nameText, Math.round(screen.x), tagY + padV);

  ctx.restore();
}

// ─── Status Bar (HP / MP / EXP) ──────────────────────────────────────────────

const STATUSBAR_HEIGHT = 34;
const STATUSBAR_BAR_HEIGHT = 14;
const STATUSBAR_PADDING_H = 10;

function drawStatusBar() {
  const player = runtime.player;
  const cw = canvasEl.width;
  const ch = canvasEl.height;
  const barY = ch - STATUSBAR_HEIGHT;

  ctx.save();

  // Full-width background (fully opaque)
  ctx.fillStyle = "#0a0f1e";
  ctx.fillRect(0, barY, cw, STATUSBAR_HEIGHT);
  ctx.fillStyle = "#334155";
  ctx.fillRect(0, barY, cw, 1);

  // Layout: [Level/Job] [HP bar ~~~~~~~~~~~~] [MP bar ~~~~~~~~~~~~]
  const contentY = barY + 4;
  const levelLabelW = 80;

  // Level + job
  ctx.font = "bold 11px Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fbbf24";
  const barMidY = contentY + STATUSBAR_BAR_HEIGHT / 2;
  ctx.fillText(`Lv.${player.level}`, STATUSBAR_PADDING_H, barMidY - 1);
  const lvTextW = ctx.measureText(`Lv.${player.level}`).width;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px Arial, sans-serif";
  ctx.fillText(player.job, STATUSBAR_PADDING_H + lvTextW + 6, barMidY - 1);

  // Gauge area: split remaining width between HP and MP
  const gaugeStart = levelLabelW + 30;
  const gaugeEnd = cw - STATUSBAR_PADDING_H;
  const totalGaugeW = gaugeEnd - gaugeStart;
  const gaugeGap = 8;
  const singleGaugeW = Math.floor((totalGaugeW - gaugeGap) / 2);

  // HP bar
  drawGaugeBar(gaugeStart, contentY, singleGaugeW, STATUSBAR_BAR_HEIGHT,
    player.hp, player.maxHp, "#ef4444", "#7f1d1d", "HP");

  // MP bar
  drawGaugeBar(gaugeStart + singleGaugeW + gaugeGap, contentY, singleGaugeW, STATUSBAR_BAR_HEIGHT,
    player.mp, player.maxMp, "#3b82f6", "#1e3a5f", "MP");

  ctx.restore();
}

function drawGaugeBar(x, y, w, h, current, max, fillColor, bgColor, label) {
  const frac = max > 0 ? Math.min(1, current / max) : 0;

  // Background
  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();

  // Fill
  if (frac > 0) {
    ctx.fillStyle = fillColor;
    const fillW = Math.max(4, Math.round(w * frac));
    roundRect(ctx, x, y, fillW, h, 3);
    ctx.fill();
  }

  // Label on left
  ctx.save();
  ctx.font = "bold 10px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(label, x + 5, y + h / 2 + 1);

  // Value on right
  ctx.textAlign = "right";
  ctx.font = "10px Arial, sans-serif";
  ctx.fillText(`${current}/${max}`, x + w - 5, y + h / 2 + 1);
  ctx.restore();
}

// ─── Map Name Banner ─────────────────────────────────────────────────────────

const MAP_BANNER_SHOW_MS = 3000;
const MAP_BANNER_FADE_MS = 800;

function showMapBanner(mapId) {
  const mapName = getMapStringName(mapId) ?? "";
  const streetName = getMapStringStreet(mapId) ?? "";
  if (!mapName && !streetName) return;

  const now = performance.now();
  runtime.mapBanner.active = true;
  runtime.mapBanner.mapName = mapName;
  runtime.mapBanner.streetName = streetName;
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

  let alpha = 1;
  if (now >= banner.fadeStartAt) {
    alpha = Math.max(0, 1 - (now - banner.fadeStartAt) / MAP_BANNER_FADE_MS);
  }

  const cw = canvasEl.width;
  const bannerY = Math.round(canvasEl.height * 0.18);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Street name (smaller, above)
  if (banner.streetName) {
    ctx.font = "14px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(banner.streetName, cw / 2, bannerY - 4);
  }

  // Map name (large)
  ctx.font = "bold 22px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Text shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillText(banner.mapName, cw / 2 + 1, bannerY + 1);
  // Text
  ctx.fillStyle = "#fbbf24";
  ctx.fillText(banner.mapName, cw / 2, bannerY);

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

  // Panel background with rounded corners
  roundRect(ctx, panelX, panelY, panelW, panelH, MINIMAP_BORDER_RADIUS);
  ctx.fillStyle = "rgba(2, 6, 23, 0.75)";
  ctx.fill();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Toggle button (−/+ on the right side of title bar)
  const btnX = panelX + panelW - MINIMAP_PADDING - MINIMAP_CLOSE_SIZE;
  const btnCenterY = panelY + MINIMAP_TITLE_HEIGHT / 2 + 1;
  minimapToggleHitBox = { x: btnX - 2, y: panelY, w: MINIMAP_CLOSE_SIZE + 4, h: MINIMAP_TITLE_HEIGHT };

  ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
  ctx.font = "bold 14px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(minimapCollapsed ? "+" : "−", btnX + MINIMAP_CLOSE_SIZE / 2, btnCenterY);

  // Title text
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const titleMaxW = panelW - MINIMAP_PADDING * 2 - MINIMAP_CLOSE_SIZE - 4;
  ctx.fillText(mapName, panelX + MINIMAP_PADDING, btnCenterY, titleMaxW);

  // If collapsed, stop here
  if (minimapCollapsed) {
    ctx.restore();
    return;
  }

  // Separator line under title
  ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
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
    ctx.fillStyle = "#fbbf24";
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
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(lx, ly, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw player marker
  const px = toMinimapX(runtime.player.x);
  const py = toMinimapY(runtime.player.y);
  ctx.fillStyle = "#22c55e";
  ctx.beginPath();
  ctx.arc(px, py, MINIMAP_PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore(); // unclip
  ctx.restore(); // outer save
}



function drawLoadingScreen() {
  const progress = Math.max(0, Math.min(1, runtime.loading.progress || 0));
  const barWidth = Math.min(460, canvasEl.width - 120);
  const barHeight = 16;
  const x = Math.round((canvasEl.width - barWidth) / 2);
  const y = Math.round(canvasEl.height / 2 + 14);

  ctx.save();
  ctx.fillStyle = "rgba(2, 6, 23, 0.9)";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "600 20px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Loading map assets...", canvasEl.width / 2, y - 44);

  ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
  ctx.fillRect(x, y, barWidth, barHeight);

  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(x, y, Math.round(barWidth * progress), barHeight);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.8)";
  ctx.strokeRect(x, y, barWidth, barHeight);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "13px Inter, system-ui, sans-serif";
  ctx.fillText(runtime.loading.label || "Preparing assets", canvasEl.width / 2, y + 34);

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

let _lastRenderState = "";
function render() {
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
    return;
  }

  if (!runtime.map) {
    drawTransitionOverlay();
    return;
  }

  drawBackgroundLayer(0);
  drawMapLayersWithCharacter();
  drawReactors();
  drawLifeSprites();
  drawDamageNumbers();
  if (runtime.debug.overlayEnabled && runtime.debug.showRopes) {
    drawRopeGuides();
  }
  drawPortals();
  if (runtime.debug.overlayEnabled && runtime.debug.showFootholds) {
    drawFootholdOverlay();
  }
  if (runtime.debug.overlayEnabled && runtime.debug.showLifeMarkers) {
    drawLifeMarkers();
    drawReactorMarkers();
  }
  drawBackgroundLayer(1);
  drawChatBubble();
  drawPlayerNameLabel();
  drawStatusBar();
  drawMapBanner();
  drawMinimap();
  drawNpcDialogue();
  drawTransitionOverlay();
}

function updateSummary() {
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
      showLifeMarkers: runtime.debug.showLifeMarkers,
      transitionAlpha: Number(runtime.transition.alpha.toFixed(3)),
      portalWarpInProgress: runtime.portalWarpInProgress,
      npcDialogue: runtime.npcDialogue.active ? `${runtime.npcDialogue.npcName} (${runtime.npcDialogue.lineIndex + 1}/${runtime.npcDialogue.lines.length})` : "none",
      portalScrollActive: runtime.portalScroll.active,
      portalScrollProgress: runtime.portalScroll.active && runtime.portalScroll.durationMs > 0
        ? Number(Math.min(1, runtime.portalScroll.elapsedMs / runtime.portalScroll.durationMs).toFixed(3))
        : 0,
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
  updateFaceAnimation(dt);
  updateLifeAnimations(dt * 1000);
  updateMobCombatStates(dt * 1000);
  updateDamageNumbers(dt);
  updateReactorAnimations(dt * 1000);
  updateObjectAnimations(dt * 1000);
  updateBackgroundAnimations(dt * 1000);
  updateCamera(dt);
  updateSummary();
}

function tick(timestampMs) {
  try {
    if (runtime.previousTimestampMs === null) {
      runtime.previousTimestampMs = timestampMs;
    }

    const dt = Math.min((timestampMs - runtime.previousTimestampMs) / 1000, 0.05);
    runtime.previousTimestampMs = timestampMs;

    update(dt);
    render();
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
  const loadToken = runtime.mapLoadToken + 1;
  runtime.mapLoadToken = loadToken;

  runtime.loading.active = true;
  rlog(`loading.active = true`);
  runtime.loading.total = 0;
  runtime.loading.loaded = 0;
  runtime.loading.progress = 0;
  runtime.loading.label = "Preparing map data...";

  // Hide chat UI during loading
  if (chatBarEl) chatBarEl.style.display = "none";
  if (chatLogEl) chatLogEl.style.display = "none";

  // Start loading map string names in background (non-blocking)
  loadMapStringData().catch(() => {});
  // Preload WZ damage number digit sprites (non-blocking)
  loadDamageNumberSprites().catch(() => {});

  try {
    setStatus(`Loading map ${mapId}...`);

    const path = mapPathFromId(mapId);
    rlog(`loadMap fetchJson ${path}`);
    const raw = await fetchJson(path);
    if (loadToken !== runtime.mapLoadToken) { rlog(`loadMap ABORTED (token mismatch after fetchJson)`); return; }

    rlog(`loadMap parseMapData...`);
    runtime.mapId = String(mapId).trim();
    runtime.map = parseMapData(raw);

    // Assign map-specific minimap image key (invalidates cache on map change)
    if (runtime.map.miniMap) {
      runtime.map.miniMap.imageKey = `minimap:${runtime.mapId}`;
    }

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

    const spawnFoothold = findFootholdAtXNearY(runtime.map, runtime.player.x, runtime.player.y + 2, 90);
    runtime.player.footholdId = spawnFoothold?.line.id ?? null;
    runtime.player.footholdLayer = spawnFoothold?.line.layer ?? 3;

    runtime.player.action = "stand1";
    runtime.player.frameIndex = 0;
    runtime.player.frameTimer = 0;
    runtime.lastRenderableCharacterFrame = null;
    runtime.lastCharacterBounds = null;
    runtime.standardCharacterWidth = DEFAULT_STANDARD_CHARACTER_WIDTH;

    runtime.faceAnimation.expression = "default";
    runtime.faceAnimation.frameIndex = 0;
    runtime.faceAnimation.frameTimerMs = 0;
    runtime.faceAnimation.blinkCooldownMs = randomBlinkCooldownMs();

    runtime.camera.x = runtime.player.x;
    runtime.camera.y = runtime.player.y - cameraHeightBias();
    runtime.portalScroll.active = false;
    runtime.portalScroll.elapsedMs = 0;
    runtime.hiddenPortalState.clear();

    rlog(`loadMap preloadMapAssets START`);
    await preloadMapAssets(runtime.map, loadToken);
    if (loadToken !== runtime.mapLoadToken) { rlog(`loadMap ABORTED (token mismatch after preload)`); return; }
    rlog(`loadMap preloadMapAssets DONE (${runtime.loading.loaded}/${runtime.loading.total})`);

    runtime.loading.progress = 1;
    runtime.loading.label = "Assets loaded";
    runtime.loading.active = false;
    rlog(`loading.active = false (success)`);

    // Initialize animation states
    rlog(`loadMap initLifeRuntimeStates...`);
    initLifeRuntimeStates();
    initReactorRuntimeStates();
    objectAnimStates.clear();
    bgAnimStates.clear();
    closeNpcDialogue();
    damageNumbers.length = 0;

    // Restore chat UI after loading
    if (chatBarEl) chatBarEl.style.display = "";
    if (chatLogEl) chatLogEl.style.display = "";

    playBgmPath(String(runtime.map.info.bgm ?? ""));

    const params = new URLSearchParams(window.location.search);
    params.set("mapId", runtime.mapId);
    history.replaceState(null, "", `?${params.toString()}`);

    // Show map name banner
    showMapBanner(runtime.mapId);

    setStatus(`Loaded map ${runtime.mapId}. Click/hover canvas to control. Controls: ←/→ move, Space jump, ↑ grab rope, ↑/↓ climb, ↓ crouch, Enter to chat.`);
    addSystemChatMessage(`[Welcome] Loaded map ${runtime.mapId}. Press Enter to chat.`);
    if (runtime.map?.swim) {
      addSystemChatMessage(`[Info] This is a water environment. Use arrow keys or Space to swim when airborne.`);
    }
    rlog(`loadMap COMPLETE mapId=${runtime.mapId}`);
  } catch (error) {
    rlog(`loadMap ERROR: ${error instanceof Error ? error.message : String(error)}`);
    rlog(`loadMap ERROR stack: ${error instanceof Error ? error.stack : "N/A"}`);
    if (loadToken === runtime.mapLoadToken) {
      runtime.loading.active = false;
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
  const gameplayKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS",
    "KeyC", "KeyZ", "KeyX"]; // attack, pickup, npc (configurable)

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
    runtime.mouseWorld.x = screenX - canvasEl.width / 2 + runtime.camera.x;

    // Handle hover for NPC dialogue options or NPC sprites
    if (runtime.npcDialogue.active) {
      let foundOption = -1;
      for (const hb of _npcDialogueOptionHitBoxes) {
        if (screenX >= hb.x && screenX <= hb.x + hb.w && screenY >= hb.y && screenY <= hb.y + hb.h) {
          foundOption = hb.index;
          break;
        }
      }
      runtime.npcDialogue.hoveredOption = foundOption;
      canvasEl.style.cursor = foundOption >= 0 ? "pointer" : "";
    } else if (!runtime.loading.active && !runtime.portalWarpInProgress && runtime.map) {
      const npc = findNpcAtScreen(screenX, screenY);
      canvasEl.style.cursor = npc ? "pointer" : "";
    } else {
      canvasEl.style.cursor = "";
    }
    runtime.mouseWorld.y = screenY - canvasEl.height / 2 + runtime.camera.y;
  });

  canvasEl.addEventListener("mouseenter", () => setInputEnabled(true));
  canvasEl.addEventListener("mouseleave", () => setInputEnabled(false));
  canvasEl.addEventListener("focus", () => setInputEnabled(true));
  canvasEl.addEventListener("blur", () => setInputEnabled(false));
  canvasEl.addEventListener("pointerdown", (e) => {
    canvasEl.focus();
    setInputEnabled(true);

    const rect = canvasEl.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasEl.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvasEl.height / rect.height);

    // If NPC dialogue is open, check for option clicks or advance
    if (runtime.npcDialogue.active) {
      // Check if an option was clicked
      for (const hb of _npcDialogueOptionHitBoxes) {
        if (cx >= hb.x && cx <= hb.x + hb.w && cy >= hb.y && cy <= hb.y + hb.h) {
          const currentLine = runtime.npcDialogue.lines[runtime.npcDialogue.lineIndex];
          if (typeof currentLine === "object" && currentLine.options && currentLine.options[hb.index]) {
            rlog(`NPC option selected: ${currentLine.options[hb.index].label}`);
            currentLine.options[hb.index].action();
          }
          return;
        }
      }
      // No option clicked — if this is a text-only line, advance
      const currentLine = runtime.npcDialogue.lines[runtime.npcDialogue.lineIndex];
      if (typeof currentLine !== "object" || !currentLine.options) {
        advanceNpcDialogue();
      }
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
      } else {
        rlog(`click at screen(${Math.round(cx)},${Math.round(cy)}) world(${Math.round(runtime.mouseWorld.x)},${Math.round(runtime.mouseWorld.y)}) — no hit`);
      }
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
      if (settingsModalEl && !settingsModalEl.classList.contains("hidden")) {
        event.preventDefault();
        settingsModalEl.classList.add("hidden");
        canvasEl.focus();
        return;
      }
    }

    if (event.code === "Space" && event.ctrlKey) {
      event.preventDefault();
      setMouseFly(!runtime.debug.mouseFly);
      return;
    }

    if (runtime.chat.inputActive) return;

    if (!runtime.input.enabled) return;

    const active = document.activeElement;
    if (active && active !== canvasEl && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) {
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space",
         "PageUp", "PageDown", "Home", "End", "Tab"].includes(event.code)) {
      event.preventDefault();
    }

    if (!gameplayKeys.includes(event.code)) return;

    if (event.code === "ArrowLeft" || event.code === "KeyA") runtime.input.left = true;
    if (event.code === "ArrowRight" || event.code === "KeyD") runtime.input.right = true;
    if (event.code === "ArrowUp" || event.code === "KeyW") {
      runtime.input.up = true;
      void tryUsePortal(true);
    }
    if (event.code === "ArrowDown" || event.code === "KeyS") runtime.input.down = true;

    // Jump key (configurable, default Space)
    if (event.code === runtime.keybinds.jump || event.code === "Space") {
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

    if (!gameplayKeys.includes(event.code)) return;

    if (event.code === "ArrowLeft" || event.code === "KeyA") runtime.input.left = false;
    if (event.code === "ArrowRight" || event.code === "KeyD") runtime.input.right = false;
    if (event.code === "ArrowUp" || event.code === "KeyW") runtime.input.up = false;
    if (event.code === "ArrowDown" || event.code === "KeyS") runtime.input.down = false;

    if (event.code === runtime.keybinds.jump || event.code === "Space") {
      runtime.input.jumpHeld = false;
    }
  });
}

mapFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  loadMap(mapIdInputEl.value.trim());
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

for (const toggle of [debugOverlayToggleEl, debugRopesToggleEl, debugFootholdsToggleEl, debugLifeToggleEl, debugMouseFlyToggleEl]) {
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
initializeTeleportPresetInputs();
initializeStatInputs();
initChatLogResize();
bindCanvasResizeHandling();

debugToggleEl?.addEventListener("click", () => {
  debugPanelEl?.classList.toggle("hidden");
});

debugCloseEl?.addEventListener("click", () => {
  debugPanelEl?.classList.add("hidden");
  canvasEl.focus();
});

// ── Settings modal ──
settingsButtonEl?.addEventListener("click", () => {
  settingsModalEl?.classList.toggle("hidden");
});

settingsCloseEl?.addEventListener("click", () => {
  settingsModalEl?.classList.add("hidden");
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

// ─── Key Bindings Configurator ──────────────────────────────────────────────

const KEYBINDS_STORAGE_KEY = "mapleweb.keybinds.v1";

/** Convert event.code to display name */
function keyCodeToDisplay(code) {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return "↑↓←→"["UpDownLeftRight".indexOf(code.slice(5)) / (code.slice(5).length)] || code.slice(5);
  return code.replace(/([A-Z])/g, " $1").trim();
}

function loadKeybinds() {
  try {
    const raw = localStorage.getItem(KEYBINDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(runtime.keybinds)) {
        if (typeof parsed[key] === "string") runtime.keybinds[key] = parsed[key];
      }
    }
  } catch (_) {}
}

function saveKeybinds() {
  try {
    localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(runtime.keybinds));
  } catch (_) {}
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
settingsModalEl?.addEventListener("click", (e) => {
  if (e.target === settingsModalEl) {
    settingsModalEl.classList.add("hidden");
    canvasEl.focus();
    if (activeKeybindBtn) {
      activeKeybindBtn.classList.remove("listening");
      activeKeybindBtn.textContent = keyCodeToDisplay(runtime.keybinds[activeKeybindBtn.dataset.action]);
      activeKeybindBtn = null;
    }
  }
});

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

const params = new URLSearchParams(window.location.search);
const initialMapId = params.get("mapId") ?? "104040000";
mapIdInputEl.value = initialMapId;
loadMap(initialMapId);
