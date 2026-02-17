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
const statSpeedInputEl = document.getElementById("stat-speed-input");
const statJumpInputEl = document.getElementById("stat-jump-input");
const audioEnableButtonEl = document.getElementById("audio-enable-button");
const canvasEl = document.getElementById("map-canvas");
const ctx = canvasEl.getContext("2d");

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
const PHYS_ROPE_JUMP_HMULT = 8.0;
const PHYS_ROPE_JUMP_VDIV = 1.5;
const PHYS_DEFAULT_SPEED_STAT = 115;
const PHYS_DEFAULT_JUMP_STAT = 110;
const PORTAL_SPAWN_Y_OFFSET = 24;
const PORTAL_FADE_OUT_MS = 180;
const PORTAL_FADE_IN_MS = 240;
const PORTAL_SCROLL_MIN_MS = 180;
const PORTAL_SCROLL_MAX_MS = 560;
const PORTAL_SCROLL_SPEED_PX_PER_SEC = 3200;
const DEFAULT_CANVAS_WIDTH = 1280;
const DEFAULT_CANVAS_HEIGHT = 720;
const MIN_CANVAS_WIDTH = 640;
const MIN_CANVAS_HEIGHT = 320;
const ASPECT_MODE_DYNAMIC = "dynamic";
const DEFAULT_STANDARD_CHARACTER_WIDTH = 58;
const CHAT_BUBBLE_LINE_HEIGHT = 16;
const CHAT_BUBBLE_HORIZONTAL_PADDING = 8;
const CHAT_BUBBLE_VERTICAL_PADDING = 6;
const CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER = 3;
const TELEPORT_PRESET_CACHE_KEY = "mapleweb.debug.teleportPreset.v1";

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
    climbRope: null,
    climbCooldownUntil: 0,
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
  debug: {
    overlayEnabled: true,
    showRopes: true,
    showFootholds: true,
    showLifeMarkers: true,
    aspectMode: ASPECT_MODE_DYNAMIC,
  },
  characterData: null,
  characterHeadData: null,
  characterFaceData: null,
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

  runtime.debug.aspectMode = ASPECT_MODE_DYNAMIC;
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
  player.climbRope = null;
  player.climbCooldownUntil = 0;
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
  runtime.camera.y = player.y - 130;
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

  const cached = localStorage.getItem(CHAT_LOG_HEIGHT_CACHE_KEY);
  if (cached) {
    const h = Number(cached);
    if (Number.isFinite(h) && h >= 48) {
      chatLogEl.style.height = h + "px";
    }
  }

  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  chatLogHandleEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startHeight = chatLogEl.offsetHeight;
    chatLogHandleEl.setPointerCapture(e.pointerId);
  });

  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const wrapperRect = chatLogEl.parentElement?.getBoundingClientRect();
    if (!wrapperRect) return;
    const maxH = Math.floor(wrapperRect.height * 0.75);
    const delta = startY - e.clientY;
    const newH = Math.max(48, Math.min(maxH, startHeight + delta));
    chatLogEl.style.height = newH + "px";
  });

  window.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      localStorage.setItem(CHAT_LOG_HEIGHT_CACHE_KEY, String(chatLogEl.offsetHeight));
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

function applyCanvasAspectMode() {
  runtime.debug.aspectMode = ASPECT_MODE_DYNAMIC;

  const rect = canvasEl.getBoundingClientRect();
  const width = Math.max(1, rect.width || DEFAULT_CANVAS_WIDTH);
  const top = rect.top || 0;
  const viewportHeight = Math.max(1, window.innerHeight || DEFAULT_CANVAS_HEIGHT);
  const viewportWidth = Math.max(1, window.innerWidth || DEFAULT_CANVAS_WIDTH);
  const viewportRatio = viewportWidth / viewportHeight;
  const availableHeight = Math.max(MIN_CANVAS_HEIGHT, Math.floor(viewportHeight - top - 24));
  const targetHeight = Math.max(
    MIN_CANVAS_HEIGHT,
    Math.min(availableHeight, Math.round(width / Math.max(0.8, viewportRatio))),
  );

  canvasEl.style.aspectRatio = "auto";
  canvasEl.style.height = `${targetHeight}px`;
}

function syncCanvasResolution() {
  applyCanvasAspectMode();

  const rect = canvasEl.getBoundingClientRect();
  const fallbackHeight = (rect.width || DEFAULT_CANVAS_WIDTH) * (DEFAULT_CANVAS_HEIGHT / DEFAULT_CANVAS_WIDTH);
  const nextWidth = Math.max(MIN_CANVAS_WIDTH, Math.round(rect.width || DEFAULT_CANVAS_WIDTH));
  const nextHeight = Math.max(MIN_CANVAS_HEIGHT, Math.round(rect.height || fallbackHeight));

  if (canvasEl.width === nextWidth && canvasEl.height === nextHeight) {
    return;
  }

  canvasEl.width = nextWidth;
  canvasEl.height = nextHeight;
}

function bindCanvasResizeHandling() {
  syncCanvasResolution();

  const onResize = () => {
    syncCanvasResolution();
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

async function fetchJson(path) {
  if (!jsonCache.has(path)) {
    jsonCache.set(
      path,
      (async () => {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`Failed to load JSON ${path} (${response.status})`);
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

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      imageCache.set(key, image);
      imagePromiseCache.delete(key);
      resolve(image);
    };
    image.onerror = () => {
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

function parseMapData(raw) {
  const info = imgdirLeafRecord(childByName(raw, "info"));

  const backgrounds = imgdirChildren(childByName(raw, "back"))
    .map((entry) => {
      const row = imgdirLeafRecord(entry);
      const index = safeNumber(entry.$imgdir, 0);
      return {
        index,
        key: `back:${row.bS}:${row.no}:${row.ani ?? 0}`,
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
          key: `obj:${row.oS}:${row.l0}:${row.l1}:${row.l2}:${frameNo}`,
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
      fh: safeNumber(row.fh, 0),
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

  return {
    info,
    backgrounds,
    blackBackground,
    layers,
    lifeEntries,
    portalEntries,
    ladderRopes,
    footholdLines,
    footholdById,
    wallLines,
    walls,
    borders,
    footholdBounds: {
      minX: footholdMinX,
      maxX: footholdMaxX,
    },
    bounds: { minX, maxX, minY, maxY },
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

function clampCameraXToMapBounds(map, desiredCenterX) {
  const footholdMinX = map.footholdBounds?.minX ?? map.bounds.minX;
  const footholdMaxX = map.footholdBounds?.maxX ?? map.bounds.maxX;
  const halfWidth = canvasEl.width / 2;

  const minCenterX = footholdMinX + halfWidth;
  const maxCenterX = footholdMaxX - halfWidth;

  if (minCenterX <= maxCenterX) {
    return Math.max(minCenterX, Math.min(maxCenterX, desiredCenterX));
  }

  return (footholdMinX + footholdMaxX) / 2;
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
  const targetY = runtime.player.y - 130;

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
  await fadeScreenTo(1, PORTAL_FADE_OUT_MS);
  try {
    await loadMap(targetMapId, targetPortalName || null, true);
  } finally {
    await fadeScreenTo(0, PORTAL_FADE_IN_MS);
  }
}

async function tryUsePortal(force = false) {
  if (!runtime.map || runtime.loading.active || runtime.portalWarpInProgress) return;
  if (!force && !runtime.input.up) return;
  if (runtime.player.climbing) return;

  const nowMs = performance.now();
  if (nowMs < runtime.portalCooldownUntil) return;

  const portal = findUsablePortalAtPlayer(runtime.map);
  if (!portal) return;

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

    await runPortalMapTransition(String(portal.targetMapId), targetPortalName || null);
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
        const [bodyData, headData, faceData, zMapData] = await Promise.all([
          fetchJson("/resources/Character.wz/00002000.img.json"),
          fetchJson("/resources/Character.wz/00012000.img.json"),
          fetchJson("/resources/Character.wz/Face/00020000.img.json"),
          fetchJson("/resources/Base.wz/zmap.img.json"),
        ]);

        runtime.characterData = bodyData;
        runtime.characterHeadData = headData;
        runtime.characterFaceData = faceData;
        runtime.zMapOrder = buildZMapOrder(zMapData);
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

function getCharacterFrameData(action, frameIndex) {
  const frames = getCharacterActionFrames(action);
  if (frames.length === 0) return null;

  const frameNode = frames[frameIndex % frames.length];
  const frameLeaf = imgdirLeafRecord(frameNode);
  const delay = safeNumber(frameLeaf.delay, 180);

  const framePath = [action, String(frameNode.$imgdir ?? frameIndex)];
  const frameParts = [];

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

  const headMeta = getHeadFrameMeta(action, frameIndex);
  if (headMeta) {
    frameParts.push({ name: "head", meta: headMeta });
  }

  const faceMeta = getFaceFrameMeta(
    frameLeaf,
    runtime.faceAnimation.expression,
    runtime.faceAnimation.frameIndex,
  );
  if (faceMeta) {
    frameParts.push({ name: "face", meta: faceMeta });
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
  }

  for (const layer of map.layers ?? []) {
    for (const tile of layer.tiles ?? []) {
      if (!tile.key || !tile.tileSet) continue;
      addPreloadTask(taskMap, tile.key, () => loadTileMeta(tile));
    }

    for (const obj of layer.objects ?? []) {
      if (!obj.key) continue;
      addPreloadTask(taskMap, obj.key, () => loadObjectMeta(obj));
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

  return taskMap;
}

function addCharacterPreloadTasks(taskMap) {
  const actions = ["stand1", "walk1", "jump", "ladder", "rope", "prone", "sit"];

  for (const action of actions) {
    const frame = getCharacterFrameData(action, 0);
    if (!frame?.parts?.length) continue;

    for (const part of frame.parts) {
      const key = `char:${action}:0:${part.name}`;
      addPreloadTask(taskMap, key, async () => part.meta);
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
          const meta = await requestMeta(key, loader);
          if (meta) {
            await requestImageByKey(key);
          }
        } catch (error) {
          console.warn("[preload] failed", key, error);
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

  const move = (runtime.input.left ? -1 : 0) + (runtime.input.right ? 1 : 0);
  const climbDir = (runtime.input.up ? -1 : 0) + (runtime.input.down ? 1 : 0);
  const jumpRequested = runtime.input.jumpQueued || runtime.input.jumpHeld;
  runtime.input.jumpQueued = false;

  const nowMs = performance.now();
  const climbOnCooldown = nowMs < player.climbCooldownUntil;
  const canReattachMidAir = !player.onGround;
  const reattachLocked = nowMs < player.reattachLockUntil;
  const wantsClimbUp = runtime.input.up && !runtime.input.down;
  const wantsClimbDown = runtime.input.down;

  const downAttachCandidate = wantsClimbDown
    ? findAttachableRope(map, player.x, player.y, false)
    : null;
  const prioritizeDownAttach = !!downAttachCandidate && wantsClimbDown && player.onGround;

  const crouchRequested = runtime.input.down && player.onGround && !player.climbing && !prioritizeDownAttach;
  const downJumpMovementLocked = player.downJumpControlLock && !player.onGround;
  const effectiveMove = crouchRequested || downJumpMovementLocked ? 0 : move;

  if (!player.climbing && effectiveMove !== 0) {
    player.facing = effectiveMove > 0 ? 1 : -1;
  }

  const allowClimbAttachNow = !climbOnCooldown || canReattachMidAir || prioritizeDownAttach;
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
      player.x = climbSnapX(rope);
      player.vx = 0;
      player.vy = 0;
      player.onGround = false;
      player.footholdId = null;
    }
  }

  if (player.climbing && player.climbRope) {
    const sideJumpRequested = jumpRequested && move !== 0;

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

      vspeedTick += PHYS_GRAVFORCE * numTicks;

      if (effectiveMove < 0 && hspeedTick > 0) {
        hspeedTick -= PHYS_FALL_BRAKE * numTicks;
      } else if (effectiveMove > 0 && hspeedTick < 0) {
        hspeedTick += PHYS_FALL_BRAKE * numTicks;
      }

      player.vx = hspeedTick * PHYS_TPS;
      player.vy = Math.min(vspeedTick * PHYS_TPS, PHYS_FALL_SPEED_CAP);
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

  const nextAction = player.climbing
    ? climbAction
    : crouchActive
      ? crouchAction
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

    if (t >= 1) {
      runtime.camera.x = scroll.targetX;
      runtime.camera.y = scroll.targetY;
      scroll.active = false;
    }

    return;
  }

  const targetX = runtime.player.x;
  const targetY = runtime.player.y - 130;
  const smoothing = Math.min(1, dt * 8);

  runtime.camera.x += (targetX - runtime.camera.x) * smoothing;
  runtime.camera.y += (targetY - runtime.camera.y) * smoothing;
  runtime.camera.x = clampCameraXToMapBounds(runtime.map, runtime.camera.x);
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

  const halfW = canvasEl.width / 2;
  const halfH = canvasEl.height / 2;
  const viewX = halfW - runtime.camera.x;
  const viewY = halfH - runtime.camera.y;
  const nowMs = performance.now();

  if (frontFlag === 0 && runtime.map.blackBackground) {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.restore();
  }

  for (const background of runtime.map.backgrounds) {
    if ((background.front ? 1 : 0) !== frontFlag) continue;

    requestBackgroundMeta(background);
    const image = getImageByKey(background.key);
    const meta = metaCache.get(background.key);
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
      x = background.x + (background.rx * nowMs) / 128 + viewX;
    } else {
      const shiftX = (background.rx * (halfW - viewX)) / 100 + halfW;
      x = background.x + shiftX;
    }

    let y;
    if (vMobile) {
      y = background.y + (background.ry * nowMs) / 128 + viewY;
    } else {
      const shiftY = (background.ry * (halfH - viewY)) / 100 + halfH;
      y = background.y + shiftY;
    }

    const tileX = background.type === 1 || background.type === 3 || background.type === 4 || background.type === 6 || background.type === 7;
    const tileY = background.type === 2 || background.type === 3 || background.type === 5 || background.type === 6 || background.type === 7;

    const baseX = x - (background.flipped ? width - origin.x : origin.x);
    const baseY = y - origin.y;

    let xBegin = baseX;
    let xEnd = baseX;
    let yBegin = baseY;
    let yEnd = baseY;

    if (tileX) {
      xBegin += width;
      xBegin %= cx;
      if (xBegin <= 0) xBegin += cx;
      xBegin -= width;

      xEnd -= canvasEl.width;
      xEnd %= cx;
      if (xEnd >= 0) xEnd -= cx;
      xEnd += canvasEl.width;
    }

    if (tileY) {
      yBegin += height;
      yBegin %= cy;
      if (yBegin <= 0) yBegin += cy;
      yBegin -= height;

      yEnd -= canvasEl.height;
      yEnd %= cy;
      if (yEnd >= 0) yEnd -= cy;
      yEnd += canvasEl.height;
    }

    const drawStartX = tileX ? Math.floor(xBegin) - 2 : Math.round(baseX);
    const drawEndX = tileX ? Math.ceil(xEnd) + 2 : Math.round(baseX);
    const drawStartY = tileY ? Math.floor(yBegin) - 2 : Math.round(baseY);
    const drawEndY = tileY ? Math.ceil(yEnd) + 2 : Math.round(baseY);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, background.alpha));

    for (let tx = drawStartX; tx <= drawEndX; tx += cx) {
      for (let ty = drawStartY; ty <= drawEndY; ty += cy) {
        drawScreenImage(image, tx, ty, background.flipped);
      }
    }

    ctx.restore();
  }
}

function drawMapLayer(layer) {
  for (const obj of layer.objects) {
    requestObjectMeta(obj);
    const image = getImageByKey(obj.key);
    const meta = metaCache.get(obj.key);
    if (!image || !meta) continue;

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

  const below = findFootholdBelow(runtime.map, runtime.player.x, runtime.player.y);
  if (below?.line && Number.isFinite(below.line.layer)) {
    return below.line.layer;
  }

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
    if (visibilityMode === "touched" && !portalBoundsContainsPlayer(portal)) continue;

    const key = requestPortalMeta(portal, frameNo);
    if (!key) continue;

    const image = getImageByKey(key);
    const meta = metaCache.get(key);
    if (!image || !meta) continue;

    const origin = meta.vectors.origin ?? { x: Math.floor(image.width / 2), y: image.height };
    const worldX = portal.x - origin.x;
    const worldY = portal.y - origin.y;
    drawWorldImage(image, worldX, worldY);
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

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawHud() {
  if (!runtime.map) return;

  const text = `Map ${runtime.mapId} • ${runtime.map.info.mapMark ?? ""} • ${runtime.player.action} frame ${runtime.player.frameIndex}`;

  ctx.save();
  ctx.fillStyle = "rgba(2, 6, 23, 0.7)";
  ctx.fillRect(10, 10, Math.min(canvasEl.width - 20, 520), 28);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "13px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 18, 24);
  ctx.restore();
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

function render() {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  if (runtime.loading.active) {
    drawLoadingScreen();
    drawTransitionOverlay();
    return;
  }

  if (!runtime.map) {
    drawTransitionOverlay();
    return;
  }

  drawBackgroundLayer(0);
  drawMapLayersWithCharacter();
  if (runtime.debug.overlayEnabled && runtime.debug.showRopes) {
    drawRopeGuides();
  }
  drawPortals();
  if (runtime.debug.overlayEnabled && runtime.debug.showFootholds) {
    drawFootholdOverlay();
  }
  if (runtime.debug.overlayEnabled && runtime.debug.showLifeMarkers) {
    drawLifeMarkers();
  }
  drawBackgroundLayer(1);
  drawChatBubble();
  drawHud();
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
  const canvasRect = canvasEl.getBoundingClientRect();

  const summary = {
    mapId: runtime.mapId,
    mapMark: runtime.map.info.mapMark ?? "",
    bgm: runtime.map.info.bgm ?? "",
    bounds: runtime.map.bounds,
    footholdBounds: runtime.map.footholdBounds,
    viewport: {
      mode: runtime.debug.aspectMode,
      renderWidth: canvasEl.width,
      renderHeight: canvasEl.height,
      displayWidth: Math.round(canvasRect.width),
      displayHeight: Math.round(canvasRect.height),
      aspect: Number((canvasEl.width / Math.max(1, canvasEl.height)).toFixed(3)),
    },
    backgrounds: runtime.map.backgrounds.length,
    footholds: runtime.map.footholdLines.length,
    ropes: runtime.map.ladderRopes.length,
    walls: runtime.map.wallLines.length,
    portals: runtime.map.portalEntries.length,
    life: runtime.map.lifeEntries.length,
    mobCount,
    npcCount,
    player: {
      x: Number(runtime.player.x.toFixed(2)),
      y: Number(runtime.player.y.toFixed(2)),
      onGround: runtime.player.onGround,
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
      unlocked: runtime.audioUnlocked,
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
  updateFaceAnimation(dt);
  updateCamera(dt);
  updateSummary();
}

function tick(timestampMs) {
  if (runtime.previousTimestampMs === null) {
    runtime.previousTimestampMs = timestampMs;
  }

  const dt = Math.min((timestampMs - runtime.previousTimestampMs) / 1000, 0.05);
  runtime.previousTimestampMs = timestampMs;

  update(dt);
  render();

  requestAnimationFrame(tick);
}

function findSoundNodeByName(node, soundName) {
  if (!node) return null;

  if (node.$sound === soundName && node.basedata) {
    return node;
  }

  for (const child of node.$$ ?? []) {
    const result = findSoundNodeByName(child, soundName);
    if (result) return result;
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

async function playBgmPath(bgmPath) {
  if (!bgmPath) return;

  runtime.currentBgmPath = bgmPath;
  runtime.audioDebug.lastBgm = bgmPath;
  if (!runtime.audioUnlocked) return;

  const [soundFile, soundName] = bgmPath.split("/");
  if (!soundFile || !soundName) return;

  try {
    const dataUri = await requestSoundDataUri(soundFile, soundName);

    if (runtime.currentBgmPath !== bgmPath) {
      return;
    }

    if (runtime.bgmAudio) {
      runtime.bgmAudio.pause();
      runtime.bgmAudio = null;
    }

    const audio = new Audio(dataUri);
    audio.loop = true;
    audio.volume = 0.25;
    runtime.bgmAudio = audio;

    await audio.play();
    setStatus(`Loaded map ${runtime.mapId}. BGM playing: ${bgmPath}`);
  } catch (error) {
    console.warn("[audio] bgm failed", error);
    setStatus(`Loaded map ${runtime.mapId}. BGM unavailable (${bgmPath}).`);
  }
}

async function playSfx(soundFile, soundName) {
  runtime.audioDebug.lastSfx = `${soundFile}/${soundName}`;
  runtime.audioDebug.lastSfxAtMs = performance.now();
  runtime.audioDebug.sfxPlayCount += 1;

  if (!runtime.audioUnlocked) return;

  try {
    const dataUri = await requestSoundDataUri(soundFile, soundName);
    const audio = new Audio(dataUri);
    audio.volume = 0.45;
    audio.play().catch(() => {});
  } catch (error) {
    console.warn("[audio] sfx failed", soundFile, soundName, error);
  }
}

async function loadMap(mapId, spawnPortalName = null, spawnFromPortalTransfer = false) {
  const loadToken = runtime.mapLoadToken + 1;
  runtime.mapLoadToken = loadToken;

  runtime.loading.active = true;
  runtime.loading.total = 0;
  runtime.loading.loaded = 0;
  runtime.loading.progress = 0;
  runtime.loading.label = "Preparing map data...";

  try {
    setStatus(`Loading map ${mapId}...`);

    const path = mapPathFromId(mapId);
    const raw = await fetchJson(path);
    if (loadToken !== runtime.mapLoadToken) return;

    runtime.mapId = String(mapId).trim();
    runtime.map = parseMapData(raw);

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
    runtime.camera.y = runtime.player.y - 130;
    runtime.portalScroll.active = false;
    runtime.portalScroll.elapsedMs = 0;

    await preloadMapAssets(runtime.map, loadToken);
    if (loadToken !== runtime.mapLoadToken) return;

    runtime.loading.progress = 1;
    runtime.loading.label = "Assets loaded";
    runtime.loading.active = false;

    playBgmPath(String(runtime.map.info.bgm ?? ""));

    const params = new URLSearchParams(window.location.search);
    params.set("mapId", runtime.mapId);
    history.replaceState(null, "", `?${params.toString()}`);

    setStatus(`Loaded map ${runtime.mapId}. Click/hover canvas to control. Controls: ←/→ move, Space jump, ↑ grab rope, ↑/↓ climb, ↓ crouch, Enter to chat.`);
    addSystemChatMessage(`[Welcome] Loaded map ${runtime.mapId}. Press Enter to chat.`);
  } catch (error) {
    if (loadToken === runtime.mapLoadToken) {
      runtime.loading.active = false;
      runtime.loading.label = "";
      runtime.loading.progress = 0;
      runtime.loading.total = 0;
      runtime.loading.loaded = 0;
    }

    setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function bindInput() {
  const gameplayKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS"];

  function setInputEnabled(enabled) {
    runtime.input.enabled = enabled;
    if (!enabled) {
      resetGameplayInput();
    }
  }

  canvasEl.addEventListener("mouseenter", () => setInputEnabled(true));
  canvasEl.addEventListener("mouseleave", () => setInputEnabled(false));
  canvasEl.addEventListener("focus", () => setInputEnabled(true));
  canvasEl.addEventListener("blur", () => setInputEnabled(false));
  canvasEl.addEventListener("pointerdown", () => {
    canvasEl.focus();
    setInputEnabled(true);
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Enter") {
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

    if (event.code === "Escape" && runtime.chat.inputActive) {
      event.preventDefault();
      closeChatInput();
      return;
    }

    if (runtime.chat.inputActive) return;

    if (!runtime.input.enabled) return;

    const active = document.activeElement;
    if (active && active !== canvasEl && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) {
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
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

    if (event.code === "Space") {
      if (!runtime.input.jumpHeld) {
        runtime.input.jumpQueued = true;
      }
      runtime.input.jumpHeld = true;
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

    if (event.code === "Space") {
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

for (const toggle of [debugOverlayToggleEl, debugRopesToggleEl, debugFootholdsToggleEl, debugLifeToggleEl]) {
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

audioEnableButtonEl.addEventListener("click", async () => {
  runtime.audioUnlocked = true;
  audioEnableButtonEl.textContent = "Audio Enabled";
  audioEnableButtonEl.disabled = true;

  if (runtime.currentBgmPath) {
    await playBgmPath(runtime.currentBgmPath);
  }
});

initializeTeleportPresetInputs();
initializeStatInputs();
initChatLogResize();
bindCanvasResizeHandling();
bindInput();
requestAnimationFrame(tick);

const params = new URLSearchParams(window.location.search);
const initialMapId = params.get("mapId") ?? "104040000";
mapIdInputEl.value = initialMapId;
loadMap(initialMapId);
