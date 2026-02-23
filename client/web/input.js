/**
 * input.js — GM slash commands, chat messaging, settings management,
 * canvas resolution, chat log resize.
 */
import {
  fn, runtime, ctx, canvasEl,
  chatBarEl, chatInputEl, chatLogEl, chatLogMessagesEl, chatLogHandleEl,
  settingsBgmToggleEl, settingsSfxToggleEl, settingsFixedResEl,
  settingsMinimapToggleEl, settingsPingToggleEl, pingWindowEl,
  settingsLogoutBtn,
  dlog, rlog,
  gameViewWidth, gameViewHeight,
  SETTINGS_CACHE_KEY, CHAT_LOG_HEIGHT_CACHE_KEY, CHAT_LOG_COLLAPSED_KEY,
  DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT,
  FIXED_RES_WIDTH, FIXED_RES_HEIGHT,
  MIN_CANVAS_WIDTH, MIN_CANVAS_HEIGHT,
} from "./state.js";
import { loadJsonFromStorage, saveJsonToStorage } from "./util.js";
import { wsSend, _wsConnected, setLastChatSendTime } from "./net.js";
import { playSfx } from "./sound.js";

// ── GM Slash Commands ────────────────────────────────────────────────

export function gmChat(text) {
  addSystemChatMessage(`[GM] ${text}`);
}

export function handleSlashCommand(input) {
  const parts = input.slice(1).split(/\s+/);
  const cmd = (parts[0] || "").toLowerCase();
  const args = parts.slice(1);

  if (!runtime.gm) {
    addSystemChatMessage("Slash commands require GM privileges.");
    return;
  }

  switch (cmd) {
    case "help":
      gmChat("Available commands:");
      gmChat("  /mousefly — Toggle mouse fly (hold Ctrl to fly)");
      gmChat("  /overlay — Toggle debug overlays (footholds, ropes, tiles, life, hitboxes)");
      gmChat("  /map <map_id> — Warp to a map");
      gmChat("  /teleport <username> <map_id> — Teleport a player to a map");
      gmChat("  /help — Show this list");
      break;

    case "mousefly":
      runtime.gmMouseFly = !runtime.gmMouseFly;
      gmChat(`MouseFly ${runtime.gmMouseFly ? "enabled" : "disabled"}. Hold Ctrl to fly.`);
      break;

    case "overlay":
      runtime.gmOverlay = !runtime.gmOverlay;
      gmChat(`Overlays ${runtime.gmOverlay ? "enabled" : "disabled"}.`);
      break;

    case "map":
      if (!args[0]) {
        gmChat("Usage: /map <map_id>");
        gmChat("Example: /map 100000000");
        break;
      }
      if (_wsConnected) {
        wsSend({ type: "gm_command", command: "map", args });
      } else {
        // Offline: direct load
        fn.loadMap(args[0]);
        gmChat(`Loading map ${args[0]}...`);
      }
      break;

    case "teleport":
      if (!args[0] || !args[1]) {
        gmChat("Usage: /teleport <username> <map_id>");
        gmChat("Example: /teleport Alice 100000000");
        break;
      }
      if (!_wsConnected) {
        gmChat("Teleport requires online mode.");
        break;
      }
      wsSend({ type: "gm_command", command: "teleport", args });
      break;

    default:
      gmChat(`Unknown command: /${cmd}`);
      gmChat("Type /help for a list of commands.");
  }
}

export function sendChatMessage(text) {
  if (!text || !text.trim()) return;
  const trimmed = text.trim();

  // ── GM slash commands (intercept before normal chat) ──
  if (trimmed.startsWith("/")) {
    handleSlashCommand(trimmed);
    return;
  }

  // Chat cooldown: 1s between messages
  const now = performance.now();
  if (now - _lastChatSendTime < 1000) return;
  setLastChatSendTime(now);

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

  // Track sent messages for up-arrow recall
  runtime.chat.sentHistory.push(trimmed);
  if (runtime.chat.sentHistory.length > runtime.chat.sentHistoryMax) {
    runtime.chat.sentHistory.shift();
  }

  appendChatLogMessage(msg);

  runtime.player.bubbleText = trimmed;
  runtime.player.bubbleExpiresAt = performance.now() + 8000;
  runtime.player._bubbleLayout = null; // recompute on next draw

  wsSend({ type: "chat", text: trimmed });

  playSfx("UI", "BtMouseOver");
}

export function addSystemChatMessage(text, subtype) {
  const msg = {
    name: "",
    text,
    timestamp: Date.now(),
    type: "system",
    subtype: subtype || null,
  };

  runtime.chat.history.push(msg);
  if (runtime.chat.history.length > runtime.chat.maxHistory) {
    runtime.chat.history.shift();
  }

  appendChatLogMessage(msg);
}

export function appendChatLogMessage(msg) {
  if (!chatLogMessagesEl) return;

  const el = document.createElement("div");
  el.className = msg.type === "system"
    ? "chat-msg chat-msg-system" + (msg.subtype === "welcome" ? " chat-msg-welcome" : "")
    : "chat-msg";

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


export function initChatLogResize() {
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
    if (!wzCursor.clickState) fn.setCursorState(CURSOR_CANCLICK);
  });
  chatLogHandleEl.addEventListener("mouseleave", () => {
    if (!wzCursor.clickState) fn.setCursorState(CURSOR_IDLE);
  });

  chatLogHandleEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startHeight = chatLogCollapsed ? 0 : chatLogEl.offsetHeight;
    chatLogHandleEl.setPointerCapture(e.pointerId);
    wzCursor.clickState = true;
    fn.setCursorState(CURSOR_CLICKING);
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
      fn.setCursorState(CURSOR_CANCLICK);
    } else {
      fn.setCursorState(CURSOR_IDLE);
    }
    if (!chatLogCollapsed) {
      chatLogExpandedHeight = chatLogEl.offsetHeight || chatLogExpandedHeight;
    }
    saveChatLogState();
  });
}

export function resetGameplayInput() {
  runtime.input.left = false;
  runtime.input.right = false;
  runtime.input.up = false;
  runtime.input.down = false;
  runtime.input.jumpHeld = false;
  runtime.input.jumpQueued = false;
}

/**
 * Reset player to idle state when the window/tab loses focus.
 * Cancels attacks, movement animations, and clears all held keys
 * so the character doesn't keep acting while the user is away.
 */
export function resetPlayerToIdle() {
  resetGameplayInput();
  const p = runtime.player;
  // Cancel attack animation
  if (p.attacking) {
    p.attacking = false;
    p.attackFrameIndex = 0;
    p.attackFrameTimer = 0;
  }
  // Reset to standing (unless climbing, sitting on chair, or swimming)
  if (!p.climbing && !p.chairId && p.action !== "swim") {
    p.action = "stand1";
    p.frameIndex = 0;
    p.frameTimer = 0;
  }
}

// Reset player state when the tab/window loses focus
document.addEventListener("visibilitychange", () => {
  if (document.hidden && runtime.map) {
    resetPlayerToIdle();
  }
});
window.addEventListener("blur", () => {
  if (runtime.map) {
    resetPlayerToIdle();
  }
});

export function loadSettings() {
  const parsed = loadJsonFromStorage(SETTINGS_CACHE_KEY);
  if (!parsed) return;
  if (typeof parsed.bgmEnabled === "boolean") runtime.settings.bgmEnabled = parsed.bgmEnabled;
  if (typeof parsed.sfxEnabled === "boolean") runtime.settings.sfxEnabled = parsed.sfxEnabled;
  if (typeof parsed.fixedRes === "boolean") runtime.settings.fixedRes = parsed.fixedRes;
  if (typeof parsed.fixed169 === "boolean" && typeof parsed.fixedRes !== "boolean") runtime.settings.fixedRes = parsed.fixed169;
  if (typeof parsed.minimapVisible === "boolean") runtime.settings.minimapVisible = parsed.minimapVisible;
  if (typeof parsed.showPing === "boolean") runtime.settings.showPing = parsed.showPing;
}

export function saveSettings() {
  saveJsonToStorage(SETTINGS_CACHE_KEY, runtime.settings);
}

export function syncSettingsToUI() {
  if (settingsBgmToggleEl) settingsBgmToggleEl.checked = runtime.settings.bgmEnabled;
  if (settingsSfxToggleEl) settingsSfxToggleEl.checked = runtime.settings.sfxEnabled;
  if (settingsFixedResEl) settingsFixedResEl.checked = runtime.settings.fixedRes;
  if (settingsMinimapToggleEl) settingsMinimapToggleEl.checked = runtime.settings.minimapVisible;
  if (settingsPingToggleEl) settingsPingToggleEl.checked = runtime.settings.showPing;
  // Sync ping window visibility
  if (pingWindowEl) {
    if (runtime.settings.showPing) pingWindowEl.classList.remove("hidden");
    else pingWindowEl.classList.add("hidden");
  }
}

export function applyFixedRes() {
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

export function syncCanvasResolution() {
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

export function bindCanvasResizeHandling() {
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

