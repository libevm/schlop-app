/**
 * net.js — Multiplayer networking: WebSocket, remote players, interpolation, rendering.
 * Only active when window.__MAPLE_ONLINE__ is true.
 */
import {
  fn, runtime, ctx, canvasEl, sessionId, pingWindowEl, pingValueEl, pingIndicatorEl,
  dlog, rlog, cachedFetch, imageCache, metaCache, iconDataUriCache,
  gameViewWidth, gameViewHeight, playerEquipped, playerInventory, groundDrops,
  EQUIP_SLOT_LIST, INV_MAX_SLOTS,
  CHAT_BUBBLE_LINE_HEIGHT, CHAT_BUBBLE_HORIZONTAL_PADDING,
  CHAT_BUBBLE_VERTICAL_PADDING, CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER,
  FACE_ANIMATION_SPEED, DEFAULT_STANDARD_CHARACTER_WIDTH,
  PLAYER_HIT_FACE_DURATION_MS, ATTACK_RANGE_X, ATTACK_RANGE_Y,
  SESSION_KEY, CLIMBING_STANCES, _chairSpriteCache,
  MOB_KB_COUNTER_START, MOB_KB_COUNTER_END, PHYS_TPS,
} from "./state.js";
import {
  safeNumber, childByName, imgdirLeafRecord, pickCanvasNode, canvasMetaFromNode,
  resolveNodeByUol, fetchJson, getMetaByKey, requestMeta, requestImageByKey, getImageByKey,
  worldToScreen, isWorldRectVisible, drawWorldImage, drawScreenImage,
  localPoint, topLeftFromAnchor, worldPointFromTopLeft,
  wrapText, roundRect,
} from "./util.js";

// ─── Multiplayer Networking (WebSocket) ────────────────────────────────────────
// Remote player data, WS connection, message handling, interpolation.
// Only active when window.__MAPLE_ONLINE__ is true.

export let _ws = null;
export let _wsConnected = false;
export let _wsPingInterval = null;
export let _wsReconnectTimer = null;
export let _lastPosSendTime = 0;
export let _wsPingSentAt = 0;
export let _wsPingMs = -1; // -1 = no measurement yet

/** Update the ping HUD display element. Called on pong + disconnect. */
export function updatePingHud() {
  if (!pingValueEl || !pingIndicatorEl) return;
  if (!_wsConnected) {
    pingValueEl.textContent = "Offline";
    pingIndicatorEl.className = "ping-indicator ping-off";
    return;
  }
  if (_wsPingMs < 0) {
    pingValueEl.textContent = "Initializing...";
    pingIndicatorEl.className = "ping-indicator ping-off";
    return;
  }
  pingValueEl.textContent = `${_wsPingMs} ms`;
  if (_wsPingMs <= 80) {
    pingIndicatorEl.className = "ping-indicator ping-good";
  } else if (_wsPingMs <= 200) {
    pingIndicatorEl.className = "ping-indicator ping-mid";
  } else {
    pingIndicatorEl.className = "ping-indicator ping-bad";
  }
}
export let _lastChatSendTime = 0; // 1s cooldown between chat messages
export let _lastEmoteTime = 0;    // 1s cooldown between emote changes
export let _duplicateLoginBlocked = false; // true if 4006 close received
export let _isMobAuthority = false; // true if this client controls mob AI for the current map
export let _lastMobStateSendTime = 0; // 10Hz mob state broadcasts
export const MOB_STATE_SEND_INTERVAL = 100; // ms between mob state sends (10Hz)

// ── Server-authoritative map change state ──
// When the server sends change_map, this resolves so the waiting code can proceed.
// When the client sends use_portal/admin_warp, it sets this up to wait for the response.
export let _pendingMapChangeResolve = null;
export let _pendingMapChangeReject = null;
export let _pendingMapChangeTimer = null;
/** Whether we're waiting for the initial change_map from server after auth */
export let _awaitingInitialMap = false;
export let _initialMapResolve = null;

/** sessionId → RemotePlayer */
export const remotePlayers = new Map();
/** Active set effects for remote players: sessionId → { active, frameIndex, frameTimer } */
export const _remoteSetEffects = new Map();
/** sessionId → Map<itemId, wzJson> */
export const remoteEquipData = new Map();
/** sessionId → { faceData, hairData } for gender-specific WZ */
export const remoteLookData = new Map();
/** sessionId → per-player placement template cache */
export const remoteTemplateCache = new Map();

// ── Snapshot interpolation constants ──
// Render remote players slightly "in the past" so we always have two snapshots
// to interpolate between. This eliminates jitter regardless of ping variance.
// INTERP_DELAY should be ~2x the send interval (50ms send → 100ms delay).
export const REMOTE_INTERP_DELAY_MS = 100;
// Maximum snapshots to buffer (1 second at 20Hz)
export const REMOTE_SNAPSHOT_MAX = 20;

export function createRemotePlayer(id, name, look, x, y, action, facing) {
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
    achievements: {},
  };
}

/** Connect WebSocket and wait for auth to succeed. Returns false if blocked (4006). */
export function connectWebSocketAsync() {
  return new Promise((resolve) => {
    _wsAuthResolve = resolve;
    connectWebSocket();
  });
}
let _wsAuthResolve = null;

export function connectWebSocket() {
  if (!window.__MAPLE_ONLINE__) return;
  if (_ws && (_ws.readyState === WebSocket.CONNECTING || _ws.readyState === WebSocket.OPEN)) return;

  const serverBase = window.__MAPLE_SERVER_URL__ || window.location.origin;
  const wsUrl = serverBase.replace(/^http/, "ws") + "/ws";
  console.log("[ws] Connecting to " + wsUrl);
  _ws = new WebSocket(wsUrl);

  _ws.onopen = () => {
    console.log("[ws] Connection opened, sending auth");
    _ws.send(JSON.stringify({ type: "auth", session_id: sessionId }));
    _wsConnected = true;
    // Immediate first ping + 5s interval
    _wsPingSentAt = performance.now(); wsSend({ type: "ping" });
    _wsPingInterval = setInterval(() => { _wsPingSentAt = performance.now(); wsSend({ type: "ping" }); }, 5_000);
    rlog("WS connected");
  };

  _ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (_wsAuthResolve) console.log("[ws] First message (auth accepted): type=" + msg.type);
      handleServerMessage(msg);
      // First message received = auth accepted
      if (_wsAuthResolve) { const r = _wsAuthResolve; _wsAuthResolve = null; r(true); }
    } catch (e) {
      console.error("[ws] Message parse error:", e, event.data?.slice?.(0, 200));
    }
  };

  _ws.onclose = (event) => {
    console.log("[ws] Connection closed: code=" + event.code + " reason=" + (event.reason || "none"));
    _wsConnected = false;
    _wsPingMs = -1;
    if (_wsPingInterval) { clearInterval(_wsPingInterval); _wsPingInterval = null; }
    updatePingHud();
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
      fn.showDuplicateLoginOverlay();
      return;
    }

    // Session expired/invalid — clear and reload to trigger new PoW
    if (event.code === 4007) {
      console.warn("[ws] Session expired — clearing and reloading");
      localStorage.removeItem(SESSION_KEY);
      window.location.reload();
      return;
    }

    rlog("WS disconnected, reconnecting in 3s…");
    if (_wsReconnectTimer) clearTimeout(_wsReconnectTimer);
    _wsReconnectTimer = setTimeout(connectWebSocket, 3000);
  };

  _ws.onerror = (e) => { console.error("[ws] WebSocket error:", e); }; // onclose fires too
}

export function wsSend(msg) {
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify(msg));
  }
}

export function sendMobState() {
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

export function wsSendEquipChange() {
  wsSend({
    type: "equip_change",
    equipment: [...playerEquipped.entries()].map(([st, eq]) => ({ slot_type: st, item_id: eq.id })),
  });
}

export function handleServerMessage(msg) {
  switch (msg.type) {
    case "pong":
      if (_wsPingSentAt > 0) { _wsPingMs = Math.round(performance.now() - _wsPingSentAt); _wsPingSentAt = 0; }
      updatePingHud();
      break;

    case "map_state":
      remotePlayers.clear();
      remoteEquipData.clear();
      remoteLookData.clear();
      remoteTemplateCache.clear();
      for (const p of msg.players || []) {
        const rp = createRemotePlayer(p.id, p.name, p.look, p.x, p.y, p.action, p.facing);
        rp.chairId = p.chair_id || 0;
        rp.achievements = (p.achievements && typeof p.achievements === "object" && !Array.isArray(p.achievements)) ? p.achievements : {};
        if (rp.chairId) fn.loadChairSprite(rp.chairId);
        remotePlayers.set(p.id, rp);
        loadRemotePlayerEquipData(rp);
        loadRemotePlayerLookData(rp);
      }
      // Restore drops already on the map (landed, no animation)
      for (const d of msg.drops || []) {
        fn.createDropFromServer(d, false);
      }
      // Mob authority: this client controls mob AI if flagged
      _isMobAuthority = !!msg.mob_authority;
      // Sync reactor states from server
      if (Array.isArray(msg.reactors)) {
        fn.syncServerReactors(msg.reactors);
      }
      break;

    case "player_enter":
      if (!remotePlayers.has(msg.id)) {
        const rp = createRemotePlayer(msg.id, msg.name, msg.look, msg.x, msg.y, msg.action, msg.facing);
        rp.chairId = msg.chair_id || 0;
        rp.achievements = (msg.achievements && typeof msg.achievements === "object" && !Array.isArray(msg.achievements)) ? msg.achievements : {};
        if (rp.chairId) fn.loadChairSprite(rp.chairId);
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
      _remoteSetEffects.delete(msg.id);
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
        fn.appendChatLogMessage(chatMsg);
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
          const fFrames = fn.getFaceExpressionFrames(msg.expression, rpFace);
          if (fFrames.length > 0) {
            const bodyFrames = fn.getCharacterActionFrames(rp.action);
            if (bodyFrames.length > 0) {
              const bfNode = bodyFrames[rp.frameIndex % bodyFrames.length];
              const bfLeaf = imgdirLeafRecord(bfNode);
              const faceMeta = fn.getFaceFrameMeta(bfLeaf, msg.expression, 0, rpFace);
              if (faceMeta) {
                const key = `rp:${rpLook.face_id || 0}:${rpLook.hair_id || 0}:${rp.action}:${rp.frameIndex}:face:${msg.expression}:0`;
                fn.requestCharacterPartImage(key, faceMeta);
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
        if (rp.chairId) fn.loadChairSprite(rp.chairId);
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
      // Server assigned a drop — check if this is our own local drop (replace local ID)
      const sd = msg.drop;
      // Match our pending local drops (negative IDs) by item + position
      const local = groundDrops.find(d =>
        d.drop_id < 0 && d.id === sd.item_id &&
        Math.abs(d.x - sd.x) < 1 && Math.abs(d.destY - sd.destY) < 1
      );
      if (local) { local.drop_id = sd.drop_id; break; }
      // Remote drop or reactor loot — create with arc animation
      fn.createDropFromServer(sd, true);
      break;
    }

    case "drop_loot": {
      const dropId = msg.drop_id;
      if (msg.looter_id === sessionId) {
        // We looted it — server confirmed. Add to inventory + animate toward us.
        const drop = groundDrops.find(d => d.drop_id === dropId);
        if (drop) {
          fn.lootDropLocally(drop);
        }
      } else {
        // Someone else looted — animate flying toward them
        fn.animateDropPickup(dropId, msg.looter_id);
      }
      break;
    }

    case "loot_failed": {
      const failDropId = msg.drop_id;
      if (msg.reason === "not_found" || msg.reason === "already_looted") {
        // Drop no longer exists on server — remove locally
        const idx = groundDrops.findIndex(d => d.drop_id === failDropId);
        if (idx >= 0) groundDrops.splice(idx, 1);
      } else if (msg.reason === "inventory_full") {
        fn.addSystemChatMessage("Your inventory is full. Please make room before picking up more items.");
      }
      // "owned" — drop stays visible, player just can't pick it up yet
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
      fn.spawnDamageNumber(worldX, worldY, dmg, false);

      const anim = lifeAnimations.get(`m:${life.id}`);
      void fn.playMobSfx(life.id, "Damage");

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
        void fn.playMobSfx(life.id, "Die");
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
      fn.addSystemChatMessage(`🎉 ${msg.name} has reached level ${msg.level}!`);
      break;

    case "global_announcement":
      fn.addSystemChatMessage(`[Server] ${msg.text}`);
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
        fn.playUISound("ReactorHit");
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
        fn.playUISound("ReactorBreak");
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

    case "jq_reward": {
      // Server awarded a JQ treasure chest reward
      const questName = msg.quest_name || "Jump Quest";
      const itemName = msg.item_name || "an item";
      const itemId = Number(msg.item_id) || 0;
      const itemQty = Number(msg.item_qty) || 1;
      const itemCategory = msg.item_category || "EQUIP";

      // Add item to local inventory
      if (itemId) {
        const invType = itemCategory === "EQUIP" ? "EQUIP" : "CASH";
        const maxSlot = playerInventory
          .filter(it => it.invType === invType)
          .reduce((max, it) => Math.max(max, it.slot), -1);
        playerInventory.push({
          id: itemId,
          name: itemName,
          qty: itemQty,
          invType,
          slot: maxSlot + 1,
          category: itemCategory === "EQUIP" ? "Weapon" : null,
        });
      }

      // Update local achievements under jq_quests
      const completions = Number(msg.completions) || 1;
      if (!runtime.player.achievements.jq_quests) runtime.player.achievements.jq_quests = {};
      runtime.player.achievements.jq_quests[questName] = completions;

      // Handle bonus item (e.g. Zakum Helmet)
      const bonusItemId = Number(msg.bonus_item_id) || 0;
      const bonusItemName = msg.bonus_item_name || "";
      if (bonusItemId) {
        const bonusMaxSlot = playerInventory
          .filter(it => it.invType === "EQUIP")
          .reduce((max, it) => Math.max(max, it.slot), -1);
        playerInventory.push({
          id: bonusItemId,
          name: bonusItemName,
          qty: 1,
          invType: "EQUIP",
          slot: bonusMaxSlot + 1,
          category: "Cap",
        });
      }

      // Grey system message in chat
      let rewardText = `You've completed ${questName} and have received ${itemName}!`;
      if (bonusItemName) {
        rewardText += ` You also received a ${bonusItemName}!`;
      }
      rewardText += ` Refresh the page if it doesn't appear in your inventory.`;
      const sysMsg = {
        name: "",
        text: rewardText,
        timestamp: Date.now(),
        type: "system",
      };
      runtime.chat.history.push(sysMsg);
      if (runtime.chat.history.length > runtime.chat.maxHistory) runtime.chat.history.shift();
      fn.appendChatLogMessage(sysMsg);
      rlog(`[JQ] Reward: ${itemName} (${itemId}) for ${questName}, completions=${completions}${bonusItemName ? `, bonus: ${bonusItemName}` : ""}`);
      break;
    }

    case "jq_inventory_full": {
      fn.addSystemChatMessage("Your inventory is full! Please drop an item to make room for your reward.");
      break;
    }

    case "jq_proximity": {
      // Server rejected JQ reward because player isn't on the same platform as the NPC
      const PROXIMITY_PHRASES = [
        "Come closer... I can barely see you from way over there!",
        "Hey! You need to come up here if you want your reward!",
        "Come closer... the flowers won't bite, I promise!",
        "You'll have to climb up to me if you want what I have!",
        "Come closer... I can't reach you from all the way down there!",
        "Almost there! Just a little closer and the reward is yours!",
      ];
      const phrase = PROXIMITY_PHRASES[Math.floor(Math.random() * PROXIMITY_PHRASES.length)];
      fn.addSystemChatMessage(phrase);
      break;
    }

    case "change_map": {
      // Server tells us to load a specific map.
      // This fires in response to use_portal, admin_warp, or on initial auth.
      const mapId = String(msg.map_id ?? "");
      const spawnPortal = msg.spawn_portal || null;
      // Pick up GM status from server on first change_map (auth response)
      if (msg.gm) runtime.gm = true;
      rlog(`[WS] change_map received: map=${mapId} portal=${spawnPortal}${runtime.gm ? " [GM]" : ""}`);
      console.log("[ws] change_map: map=" + mapId + " portal=" + spawnPortal + " awaitingInitial=" + _awaitingInitialMap);

      if (_awaitingInitialMap && _initialMapResolve) {
        console.log("[boot] Resolving initial map promise with map=" + mapId);
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
        fn.handleServerMapChange(mapId, spawnPortal);
      }
      break;
    }

    case "portal_denied": {
      // Server rejected a portal/warp request
      const reason = msg.reason || "Denied";
      rlog(`[WS] portal_denied: ${reason}`);
      rlog(`Portal denied: ${reason}`);
      if (_pendingMapChangeReject) {
        const r = _pendingMapChangeReject;
        _pendingMapChangeResolve = null;
        _pendingMapChangeReject = null;
        if (_pendingMapChangeTimer) { clearTimeout(_pendingMapChangeTimer); _pendingMapChangeTimer = null; }
        r(new Error(reason));
      }
      break;
    }

    case "gm_response": {
      const text = msg.text || "";
      fn.addSystemChatMessage(`[GM] ${text}`, msg.ok ? undefined : "error");
      break;
    }
  }
}

export async function loadRemotePlayerEquipData(rp) {
  const equipMap = new Map();
  for (const eq of rp.look.equipment || []) {
    const category = fn.equipWzCategoryFromId(eq.item_id);
    if (!category) continue;
    const padded = String(eq.item_id).padStart(8, "0");
    const path = `/resourcesv2/Character.wz/${category}/${padded}.img.json`;
    try {
      const resp = await cachedFetch(path);
      if (resp.ok) {
        const data = await resp.json();
        const prefix = Math.floor(eq.item_id / 10000);
        if (prefix === 170) {
          equipMap.set(eq.item_id, resolveCashWeaponDataForRemote(data, eq.item_id, rp.look.equipment));
        } else {
          equipMap.set(eq.item_id, data);
        }
      }
    } catch {}
  }
  remoteEquipData.set(rp.id, equipMap);
  remoteTemplateCache.delete(rp.id); // invalidate placement cache
}

/**
 * Resolve cash weapon group for a remote player based on their equipment list.
 */
export function resolveCashWeaponDataForRemote(data, cashWeaponId, equipment) {
  let groupId = "30"; // default: 1H Sword
  for (const eq of equipment || []) {
    if (eq.slot_type === "Weapon" && eq.item_id !== cashWeaponId) {
      const weaponPrefix = Math.floor(eq.item_id / 10000);
      if (weaponPrefix >= 130 && weaponPrefix < 170) {
        groupId = String(weaponPrefix - 100);
        break;
      }
    }
  }
  const groupNode = childByName(data, groupId) || childByName(data, "30");
  if (groupNode) {
    const infoNode = childByName(data, "info");
    const merged = { $imgdir: data.$imgdir, $$: [] };
    if (infoNode) merged.$$.push(infoNode);
    for (const child of groupNode.$$ || []) merged.$$.push(child);
    return merged;
  }
  return data;
}

/** Load face and hair WZ data for a remote player (always per-player, never local fallback). */
export async function loadRemotePlayerLookData(rp) {
  const look = rp.look || {};
  const faceId = look.face_id || 20000;
  const hairId = look.hair_id || 30000;

  const entry = { faceData: null, hairData: null, faceId, hairId };
  try {
    const facePath = `/resourcesv2/Character.wz/Face/${String(faceId).padStart(8, "0")}.img.json`;
    const hairPath = `/resourcesv2/Character.wz/Hair/${String(hairId).padStart(8, "0")}.img.json`;
    const [faceResp, hairResp] = await Promise.all([cachedFetch(facePath), cachedFetch(hairPath)]);
    if (faceResp.ok) entry.faceData = await faceResp.json();
    if (hairResp.ok) entry.hairData = await hairResp.json();
  } catch {}
  remoteLookData.set(rp.id, entry);
  remoteTemplateCache.delete(rp.id);
}

export function updateRemotePlayers(dt) {
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

export function getRemoteFrameDelay(rp) {
  // Read actual WZ frame delay from body data (same source as local player)
  const action = fn.adjustStanceForRemoteWeapon(rp, rp.action);
  const frames = fn.getCharacterActionFrames(action);
  if (frames.length > 0) {
    const frameNode = frames[rp.frameIndex % frames.length];
    const leafRec = imgdirLeafRecord(frameNode);
    const wzDelay = safeNumber(leafRec.delay, 0);
    if (wzDelay > 0) return wzDelay;
  }
  // Fallbacks when WZ data not available
  if (action.startsWith("walk")) return 150;
  if (rp.attacking) return 200;
  if (action === "ladder" || action === "rope") return 200;
  return 200;
}

export function getRemoteFrameCount(rp) {
  // Try reading from character body WZ data
  const action = fn.adjustStanceForRemoteWeapon(rp, rp.action);
  const frames = fn.getCharacterActionFrames(action);
  if (frames.length > 0) return frames.length;
  // Fallback
  if (action.startsWith("walk")) return 4;
  if (action.startsWith("stand")) return 3;
  if (rp.attacking) return 3;
  return 3;
}

/**
 * Get character frame data for a remote player, using their equip data
 * instead of the local player's equipment.
 */
export function getRemoteCharacterFrameData(rp) {
  let action = rp.action;
  const frameIndex = rp.frameIndex;
  const faceExpression = rp.faceExpression || "default";
  const faceFrameIndex = rp.faceFrameIndex || 0;

  // Adjust stance for remote player's weapon (C++ CharEquips::adjust_stance)
  action = fn.adjustStanceForRemoteWeapon(rp, action);

  const frames = fn.getCharacterActionFrames(action);
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
  const headMeta = fn.getHeadFrameMeta(action, frameIndex);
  if (headMeta) frameParts.push({ name: "head", meta: headMeta });

  // Face/Hair — always use per-player data (never local player's)
  const lookData = remoteLookData.get(rp.id);
  const rpFaceData = lookData?.faceData ?? null;
  const rpHairData = lookData?.hairData ?? null;

  // Face — skip during climbing, skip if face data not loaded yet
  if (!CLIMBING_STANCES.has(action) && rpFaceData) {
    const faceMeta = fn.getFaceFrameMeta(frameLeaf, faceExpression, faceFrameIndex, rpFaceData);
    if (faceMeta) frameParts.push({ name: `face:${faceExpression}:${faceFrameIndex}`, meta: faceMeta });
  }

  // Equipment — use remote player's equip data
  // Skip weapon when sitting on a chair
  const rpHidingWeapon = action === "sit";
  const equipDataMap = remoteEquipData.get(rp.id);

  // Determine remote cap type for hair filtering
  let rpCapType = "NONE";
  let rpHasOverall = false;
  if (equipDataMap) {
    for (const [itemId, equipJson] of equipDataMap) {
      const slot = fn.equipSlotFromId(Number(itemId));
      if (slot === "Longcoat") rpHasOverall = true;
      if (slot === "Cap") {
        const info = equipJson?.$$?.find(c => c.$imgdir === "info");
        const vslotNode = (info?.$$ || []).find(c => c.$string === "vslot");
        const vslot = vslotNode ? String(vslotNode.value ?? "") : "";
        if (vslot === "CpH1H5") rpCapType = "HALFCOVER";
        else if (vslot === "CpH5") rpCapType = "HEADBAND";
        else if (vslot.length > 6 && vslot.startsWith("Cp")) rpCapType = "FULLCOVER";
      }
    }
  }

  // Hair — filtered by cap type (same logic as local player)
  const rpIsClimbing = CLIMBING_STANCES.has(action);
  if (rpHairData) {
    const hairParts = fn.getHairFrameParts(action, frameIndex, rpHairData);
    for (const hp of hairParts) {
      const z = hp.meta?.zName ?? "";
      const layerName = hp.name.split(":").pop() || z;
      if (rpIsClimbing) {
        if (rpCapType === "FULLCOVER") continue;
        if (rpCapType === "HALFCOVER") {
          if (layerName === "backHair" || z === "backHair") continue;
        } else {
          if (layerName === "backHairBelowCap" || z === "backHairBelowCap") continue;
        }
        if (z === "hair" || z === "hairOverHead" || z === "hairShade" || z === "hairBelowBody") continue;
      } else {
        if (rpCapType === "FULLCOVER") {
          // Hide ALL hair layers (cap covers everything)
          continue;
        } else if (rpCapType === "HALFCOVER") {
          if (z === "hairOverHead" || layerName === "hairOverHead") continue;
          if (z === "backHair" || layerName === "backHair") continue;
        } else {
          if (z === "backHairBelowCap" || layerName === "backHairBelowCap") continue;
        }
      }
      frameParts.push(hp);
    }
  }

  if (equipDataMap) {
    for (const [itemId, equipJson] of equipDataMap) {
      const slot = fn.equipSlotFromId(Number(itemId));
      if (rpHidingWeapon && slot === "Weapon") continue;
      // When overall equipped, skip separate top and bottom pieces
      if (rpHasOverall && (slot === "Coat" || slot === "Pants")) continue;
      // Face accessories use face expression as stance (C++ parity)
      let eqAction = action;
      let eqFrame = frameIndex;
      if (slot === "FaceAcc") {
        eqAction = faceExpression;
        eqFrame = 0;
      }
      const equipParts = fn.getEquipFrameParts(equipJson, eqAction, eqFrame, `equip:${itemId}`);
      for (const ep of equipParts) {
        // Cap sub-layer filtering: capOverHair only for HEADBAND
        if (slot === "Cap") {
          const epZ = ep.meta?.zName ?? "";
          if (epZ === "capOverHair" || epZ === "backCapOverHair") {
            if (rpCapType !== "HEADBAND") continue;
          }
        }
        frameParts.push(ep);
      }
    }
  }

  return { delay, parts: frameParts };
}

export function drawRemotePlayer(rp) {
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

  // Draw set effect behind remote player
  const rpEquipIds = (rp.look?.equipment || []).map(e => e.item_id);
  const rpSetEff = fn.findActiveSetEffect(rpEquipIds);
  let rpSetState = _remoteSetEffects.get(rp.id);
  if (rpSetEff) {
    if (!rpSetState) {
      rpSetState = { active: true, frameIndex: 0, frameTimer: 0 };
      _remoteSetEffects.set(rp.id, rpSetState);
    }
    rpSetState.active = true;
    fn.drawSetEffect(rp.renderX, rp.renderY, rpSetEff, rpSetState);
  } else if (rpSetState) {
    rpSetState.active = false;
  }

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
export function getRemotePlayerPlacementTemplate(rp, action, frameIndex, flipped, faceExpression, faceFrameIndex) {
  const frame = getRemoteCharacterFrameData(rp);
  if (!frame || !frame.parts?.length) return null;

  // Use per-player look IDs in cache key to avoid collisions between
  // players with different face/hair/equips sharing the same image slot
  const look = rp.look || {};
  const lookPrefix = `rp:${look.face_id || 0}:${look.hair_id || 0}`;

  const partAssets = frame.parts
    .map((part) => {
      const key = `${lookPrefix}:${action}:${frameIndex}:${part.name}`;
      fn.requestCharacterPartImage(key, part.meta);
      const image = getImageByKey(key);
      return { ...part, key, image };
    })
    .filter((part) => !!part.image && !!part.meta);

  // If the expected face expression image isn't ready yet, don't hide the whole character —
  // just proceed without the face part (avoids blink on expression change).
  // The pre-warm in player_face will decode it and subsequent frames will include it.

  const body = partAssets.find((part) => part.name === "body");
  if (!body) return null;

  const bodyTopLeft = topLeftFromAnchor(body.meta, body.image, { x: 0, y: 0 }, null, flipped);
  const anchors = {};
  fn.mergeMapAnchors(anchors, body.meta, body.image, bodyTopLeft, flipped);

  const placements = [{ ...body, topLeft: bodyTopLeft, zOrder: fn.zOrderForPart(body.name, body.meta) }];
  const pending = partAssets.filter((p) => p !== body);

  let progressed = true;
  while (pending.length > 0 && progressed) {
    progressed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const part = pending[i];
      const isFacePart = typeof part.name === "string" && part.name.startsWith("face:");
      const anchorName = isFacePart
        ? (anchors.brow ? "brow" : fn.pickAnchorName(part.meta, anchors))
        : fn.pickAnchorName(part.meta, anchors);
      if (!anchorName) continue;
      const topLeft = topLeftFromAnchor(part.meta, part.image, anchors[anchorName], anchorName, flipped);
      placements.push({ ...part, topLeft, zOrder: fn.zOrderForPart(part.name, part.meta) });
      fn.mergeMapAnchors(anchors, part.meta, part.image, topLeft, flipped);
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
export function findRemotePlayerAtScreen(screenX, screenY) {
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
export async function renderRemotePlayerSprite(rp, canvasEl) {
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
export function showPlayerInfoModal(rp) {
  if (document.querySelector("#player-info-modal")) return;

  const name = rp.name || "???";

  const overlay = document.createElement("div");
  overlay.id = "player-info-modal";
  overlay.className = "modal-overlay";
  overlay.style.cssText = "z-index:200000;user-select:none;pointer-events:none;";
  overlay.innerHTML = `
    <div class="modal-panel" id="player-info-panel"
      style="width:240px;position:absolute;pointer-events:auto;">
      <div class="modal-titlebar" id="player-info-titlebar" style="position:relative;">
        <span class="modal-title">${name}</span>
        <button class="game-window-close" id="player-info-close" style="position:absolute;right:3px;top:3px;">&times;</button>
      </div>
      <div class="modal-body" style="padding:14px 16px 12px;text-align:center;">
        <canvas id="player-info-sprite" width="80" height="80"
          style="display:block;margin:0 auto 10px;image-rendering:pixelated;"></canvas>
        <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
          <div style="font-size:11px;color:#5a6a80;font-weight:700;margin-bottom:4px;">Achievements</div>
          <div id="player-info-achievements" style="font-size:11px;"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Populate accomplishments (only jq_quests)
  const achDiv = overlay.querySelector("#player-info-achievements");
  const jqQuests = (rp.achievements && rp.achievements.jq_quests) || {};
  const achEntries = Object.entries(jqQuests).filter(([, v]) => typeof v === "number" && v > 0);
  if (achEntries.length === 0) {
    achDiv.innerHTML = `<div style="color:#8898b0;font-style:italic;">None yet</div>`;
  } else {
    achDiv.innerHTML = achEntries.map(([quest, count]) =>
      `<div style="color:#2a3a4e;margin-bottom:2px;">${quest} <span style="color:#5a6a7a;font-weight:700;">×${count}</span></div>`
    ).join("");
  }

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
    fn.playUISound("BtMouseClick");
    close();
  });
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  const onKey = (e) => { if (e.key === "Escape") close(); };
  window.addEventListener("keydown", onKey);
}

export function drawRemotePlayerNameLabel(rp) {
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

export function drawRemotePlayerChatBubble(rp) {
  const now = performance.now();
  if (rp.chatBubbleExpires < now || !rp.chatBubble) return;

  const bubbleOffsetY = (rp.action === "prone" || rp.action === "proneStab") ? 40 : 70;
  const anchor = worldToScreen(rp.renderX, rp.renderY - bubbleOffsetY);

  ctx.save();
  ctx.font = "12px 'Dotum', Arial, sans-serif";

  // Cache bubble layout so it doesn't jitter on stance changes
  if (!rp._bubbleLayout || rp._bubbleLayoutText !== rp.chatBubble) {
    const fullText = (rp.name || "???") + ": " + rp.chatBubble;
    const maxBubbleWidth = 150;
    const maxTextWidth = Math.max(14, maxBubbleWidth - CHAT_BUBBLE_HORIZONTAL_PADDING * 2);
    const lines = fn.wrapBubbleTextToWidth(fullText, maxTextWidth);
    const widestLine = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    const width = Math.max(40, Math.min(maxBubbleWidth, Math.ceil(widestLine) + CHAT_BUBBLE_HORIZONTAL_PADDING * 2));
    const height = Math.max(26, lines.length * CHAT_BUBBLE_LINE_HEIGHT + CHAT_BUBBLE_VERTICAL_PADDING * 2);
    rp._bubbleLayout = { lines, width, height };
    rp._bubbleLayoutText = rp.chatBubble;
  }
  const { lines, width, height } = rp._bubbleLayout;

  // Bubble is anchored to the character — no viewport clamping.
  // It naturally clips at canvas edges when the character is partially off-screen.
  const bubbleX = Math.round(anchor.x - width / 2);
  const y = anchor.y - height - 16;

  // Skip drawing entirely if bubble is fully outside canvas
  if (bubbleX + width < 0 || bubbleX > canvasEl.width ||
      y + height + 7 < 0 || y > canvasEl.height) {
    ctx.restore();
    return;
  }

  roundRect(ctx, bubbleX, y, width, height, 6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 80, 120, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#1a1a2e";
  ctx.textBaseline = "middle";
  const textBlockHeight = lines.length * CHAT_BUBBLE_LINE_HEIGHT;
  const textOffsetY = (height - textBlockHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bubbleX + CHAT_BUBBLE_HORIZONTAL_PADDING, y + textOffsetY + i * CHAT_BUBBLE_LINE_HEIGHT + CHAT_BUBBLE_LINE_HEIGHT / 2);
  }

  // Tail
  const tailX = anchor.x;
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

export function drawAllRemotePlayerSprites() {
  for (const [, rp] of remotePlayers) {
    drawRemotePlayer(rp);
  }
}

// ─── End Multiplayer Networking ────────────────────────────────────────────────

// Setter functions for mutable state (ES module live bindings are read-only from importers)
export function setWsConnected(v) { _wsConnected = v; }
export function setIsMobAuthority(v) { _isMobAuthority = v; }
export function setDuplicateLoginBlocked(v) { _duplicateLoginBlocked = v; }
export function setAwaitingInitialMap(v) { _awaitingInitialMap = v; }
export function setInitialMapResolve(v) { _initialMapResolve = v; }
export function setPendingMapChangeResolve(v) { _pendingMapChangeResolve = v; }
export function setPendingMapChangeReject(v) { _pendingMapChangeReject = v; }
export function setPendingMapChangeTimer(v) { _pendingMapChangeTimer = v; }
export function setLastPosSendTime(v) { _lastPosSendTime = v; }
export function setLastChatSendTime(v) { _lastChatSendTime = v; }
export function setLastEmoteTime(v) { _lastEmoteTime = v; }
export function setLastMobStateSendTime(v) { _lastMobStateSendTime = v; }

