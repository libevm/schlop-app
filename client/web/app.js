// ─── Module Imports ──────────────────────────────────────────────────────────
// Shared state, constants, caches, DOM refs
import {
  fn, runtime, ctx, canvasEl, sessionId, setSessionId,
  chatBarEl, chatInputEl, chatLogEl, chatLogMessagesEl, chatLogHandleEl,
  pickupJournalEl, settingsButtonEl, settingsModalEl, keybindsButtonEl,
  settingsBgmToggleEl, settingsSfxToggleEl, settingsFixedResEl,
  settingsMinimapToggleEl, settingsPingToggleEl, pingWindowEl, pingValueEl,
  pingIndicatorEl, settingsLogoutBtn, logoutConfirmEl, logoutConfirmYesEl,
  logoutConfirmNoEl, claimHudButton, logoutConfirmTextEl, claimOverlayEl,
  claimPasswordInput, claimPasswordConfirm, claimErrorEl, claimConfirmBtn,
  claimCancelBtn, authTabLogin, authTabCreate, authLoginView, authCreateView,
  loginNameInput, loginPasswordInput, loginErrorEl, loginSubmitBtn,
  equipWindowEl, inventoryWindowEl, keybindsWindowEl, equipGridEl, invGridEl,
  keybindsGridEl, uiTooltipEl, openKeybindsBtnEl,
  dlog, rlog, DLOG_MAX, _debugLogBuffer, _debugLogDirty, setDebugLogDirty,
  cachedFetch, jsonCache, metaCache, metaPromiseCache, imageCache, imagePromiseCache,
  soundDataUriCache, soundDataPromiseCache, iconDataUriCache,
  RESOURCE_CACHE_NAME,
  DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, FIXED_RES_WIDTH, FIXED_RES_HEIGHT,
  MIN_CANVAS_WIDTH, MIN_CANVAS_HEIGHT, BG_REFERENCE_HEIGHT,
  SPATIAL_BUCKET_SIZE, SPATIAL_QUERY_MARGIN, PERF_SAMPLE_SIZE,
  gameViewWidth, gameViewHeight,
  PHYS_TPS, PHYS_GRAVFORCE, PHYS_FRICTION, PHYS_SLOPEFACTOR, PHYS_GROUNDSLIP,
  PHYS_FALL_BRAKE, PHYS_HSPEED_DEADZONE, PHYS_FALL_SPEED_CAP, PHYS_MAX_LAND_SPEED,
  PHYS_ROPE_JUMP_HMULT, PHYS_ROPE_JUMP_VDIV, PHYS_CLIMB_ACTION_DELAY_MS,
  PHYS_SWIMGRAVFORCE, PHYS_SWIMFRICTION, PHYS_SWIM_HFRICTION, PHYS_FLYFORCE,
  PHYS_SWIM_HFORCE, PHYS_SWIM_JUMP_MULT, PHYS_DEFAULT_SPEED_STAT, PHYS_DEFAULT_JUMP_STAT,
  PLAYER_TOUCH_HITBOX_HEIGHT, PLAYER_TOUCH_HITBOX_HALF_WIDTH,
  PLAYER_TOUCH_HITBOX_PRONE_HEIGHT, PLAYER_TOUCH_HITBOX_PRONE_HALF_WIDTH,
  TRAP_HIT_INVINCIBILITY_MS, PLAYER_KB_HSPEED, PLAYER_KB_VFORCE,
  MOB_KB_FORCE_GROUND, MOB_KB_FORCE_AIR, MOB_KB_COUNTER_START, MOB_KB_COUNTER_END,
  PLAYER_HIT_FACE_DURATION_MS, FALL_DAMAGE_THRESHOLD, FALL_DAMAGE_PERCENT,
  HIDDEN_PORTAL_REVEAL_DELAY_MS, HIDDEN_PORTAL_FADE_IN_MS,
  PORTAL_SPAWN_Y_OFFSET, PORTAL_FADE_OUT_MS, PORTAL_FADE_IN_MS,
  PORTAL_SCROLL_MIN_MS, PORTAL_SCROLL_MAX_MS, PORTAL_SCROLL_SPEED_PX_PER_SEC,
  PORTAL_ANIMATION_FRAME_MS,
  FACE_ANIMATION_SPEED, DEFAULT_STANDARD_CHARACTER_WIDTH,
  CHAT_BUBBLE_LINE_HEIGHT, CHAT_BUBBLE_HORIZONTAL_PADDING,
  CHAT_BUBBLE_VERTICAL_PADDING, CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER,
  STATUSBAR_HEIGHT, STATUSBAR_BAR_HEIGHT, STATUSBAR_PADDING_H,
  SETTINGS_CACHE_KEY, CHAT_LOG_HEIGHT_CACHE_KEY, CHAT_LOG_COLLAPSED_KEY,
  KEYBINDS_STORAGE_KEY, SESSION_KEY, CHARACTER_SAVE_KEY,
  MAP_ID_REDIRECTS, cameraHeightBias, newCharacterDefaults,
  playerFacePath, playerHairPath,
  EQUIP_SLOT_LIST, INV_COLS, INV_ROWS, INV_MAX_SLOTS, INV_TABS,
  currentInvTab, setCurrentInvTab,
  playerEquipped, playerInventory, groundDrops, draggedItem,
  DROP_PICKUP_RANGE, DROP_BOB_SPEED, DROP_BOB_AMP, DROP_SPAWN_VSPEED,
  DROP_SPINSTEP, DROP_PHYS_GRAVITY, DROP_PHYS_TERMINAL_VY, LOOT_ANIM_DURATION,
  FIXED_STEP_MS, MAX_FRAME_DELTA_MS, MAX_STEPS_PER_FRAME,
  BGM_FADE_DURATION_MS, BGM_TARGET_VOLUME, SFX_POOL_SIZE,
  DEFAULT_MOB_HIT_SOUND, DEFAULT_MOB_DIE_SOUND,
  ATTACK_COOLDOWN_MS, ATTACK_RANGE_X, ATTACK_RANGE_Y,
  MOB_HIT_DURATION_MS, MOB_AGGRO_DURATION_MS, MOB_KB_SPEED, MOB_RESPAWN_DELAY_MS,
  MOB_HP_BAR_WIDTH, MOB_HP_BAR_HEIGHT,
  MOB_GRAVFORCE, MOB_SWIMGRAVFORCE, MOB_FRICTION, MOB_SLOPEFACTOR,
  MOB_GROUNDSLIP, MOB_SWIMFRICTION, MOB_PHYS_TIMESTEP,
  MOB_STAND_MIN_MS, MOB_STAND_MAX_MS, MOB_MOVE_MIN_MS, MOB_MOVE_MAX_MS,
  MINIMAP_PADDING, MINIMAP_TITLE_HEIGHT, MINIMAP_BORDER_RADIUS,
  MINIMAP_PLAYER_RADIUS, MINIMAP_PORTAL_RADIUS, MINIMAP_CLOSE_SIZE,
  MAP_BANNER_SHOW_MS, MAP_BANNER_FADE_MS, MAP_BANNER_SLIDE_MS,
} from './state.js';

// Pure utilities, WZ helpers, asset cache, draw primitives
import {
  safeNumber, loadJsonFromStorage, saveJsonToStorage,
  childByName, imgdirChildren, parseLeafValue, imgdirLeafRecord,
  vectorRecord, pickCanvasNode, canvasMetaFromNode,
  objectMetaExtrasFromNode, applyObjectMetaExtras,
  findNodeByPath, resolveNodeByUol, randomRange,
  mapPathFromId, soundPathFromName,
  fetchJson, getMetaByKey, requestMeta, requestImageByKey, getImageByKey,
  wrapText, roundRect,
  worldToScreen, isWorldRectVisible, drawWorldImage, drawScreenImage,
  localPoint, topLeftFromAnchor, worldPointFromTopLeft,
} from './util.js';

// Multiplayer networking: WebSocket, remote players, interpolation
import {
  remotePlayers, remoteEquipData,
  _ws, _wsConnected, _wsPingMs, _isMobAuthority,
  _lastPosSendTime, _lastChatSendTime, _lastEmoteTime, _lastMobStateSendTime,
  _pendingMapChangeResolve, _pendingMapChangeReject, _pendingMapChangeTimer,
  _awaitingInitialMap, _initialMapResolve, _duplicateLoginBlocked,
  MOB_STATE_SEND_INTERVAL, REMOTE_INTERP_DELAY_MS, REMOTE_SNAPSHOT_MAX,
  connectWebSocket, connectWebSocketAsync, wsSend, wsSendEquipChange,
  updateRemotePlayers, drawRemotePlayer, drawRemotePlayerChatBubble,
  drawRemotePlayerNameLabel, findRemotePlayerAtScreen, sendMobState,
  showPlayerInfoModal, updatePingHud,
  setWsConnected, setIsMobAuthority, setDuplicateLoginBlocked,
  setAwaitingInitialMap, setInitialMapResolve,
  setPendingMapChangeResolve, setPendingMapChangeReject, setPendingMapChangeTimer,
  setLastPosSendTime, setLastChatSendTime, setLastEmoteTime, setLastMobStateSendTime,
} from './net.js';

// Life system: mobs, NPCs, combat, damage, reactors, spatial, map data, portals
import {
  lifeAnimations, lifeAnimationPromises, lifeRuntimeState,
  VICTORIA_TOWNS, ALL_MAJOR_TOWNS, NPC_SCRIPTS, JQ_DISPLAY_NAMES,
  NPC_AMBIENT_MESSAGES, _npcAmbientBubbles,
  NPC_AMBIENT_INTERVAL_MIN, NPC_AMBIENT_INTERVAL_MAX, NPC_AMBIENT_DURATION,
  _npcDialogueOptionHitBoxes, _npcDialogueBoxBounds,
  reactorRuntimeState,
  DMG_NUMBER_VSPEED, DMG_NUMBER_FADE_TIME,
  DMG_NUMBER_ROW_HEIGHT_NORMAL, DMG_NUMBER_ROW_HEIGHT_CRIT, DMG_DIGIT_ADVANCES,
  WEAPON_MULTIPLIER, DEFAULT_MASTERY, DEFAULT_CRITICAL, DEFAULT_ACCURACY, DEFAULT_WATK,
  SWORD_1H_ATTACK_STANCES, ATTACK_STANCES_BY_TYPE,
  WEAPON_SFX_BY_PREFIX,
  MOB_TPS, MOB_HSPEED_DEADZONE, MOB_DEFAULT_HP, MOB_HP_SHOW_MS,
  loadLifeAnimation,
  updateNpcAmbientBubbles, runNpcMapTransition, requestJqReward,
  buildScriptDialogue, buildFallbackScriptDialogue,
  fhGroundAt, fhSlope, fhLeft, fhRight, fhIsWall,
  fhIdBelow, fhEdge, fhWall,
  mobNextMove, mobPhysicsUpdate,
  initLifeRuntimeStates, updateLifeAnimations, drawLifeSprites,
  drawNpcAmbientBubble,
  spawnDamageNumber, updateDamageNumbers, drawDamageNumbers,
  calculatePlayerDamageRange, calculateMobDamage,
  findMobsInRange, performAttack, applyAttackToMobVisualOnly, applyAttackToMob,
  updatePlayerAttack, updateMobCombatStates,
  findNpcAtScreen, openNpcDialogue, closeNpcDialogue, advanceNpcDialogue, drawNpcDialogue,
  loadReactorAnimation, syncServerReactors, initReactorRuntimeStates,
  updateReactorAnimations, drawReactors, findReactorsInRange,
  spatialCellCoord, spatialBucketKey, addToSpatialBucket,
  buildLayerSpatialIndex, buildMapSpatialIndex,
  isDamagingTrapMeta, buildMapTrapHazardIndex,
  currentObjectFrameMeta, visibleSpritesForLayer,
  parseMapData, loadBackgroundMeta, requestBackgroundMeta,
  loadAnimatedBackgroundFrames, loadTileMeta, requestTileMeta,
  loadObjectMeta, objectAnimationFrameEntries, loadAnimatedObjectFrames, requestObjectMeta,
  portalVisibilityMode, updateHiddenPortalState, getHiddenPortalAlpha,
  updatePortalAnimations, isAutoEnterPortal, portalWorldBounds, portalBoundsContainsPlayer,
  isValidPortalTargetMapId, normalizedPortalTargetName, findUsablePortalAtPlayer,
  mapVisibleBounds, clampCameraXToMapBounds, clampCameraYToMapBounds,
  portalMomentumEase, startPortalMomentumScroll, waitForPortalMomentumScrollToFinish,
  movePlayerToPortalInCurrentMap, waitForAnimationFrame, fadeScreenTo,
  getWeaponAttackStances, getWeaponSfxKey, hasProjectileAmmo,
} from './life.js';

// Player physics, foothold helpers, wall collision, camera
import {
  findGroundLanding, findFootholdAtXNearY, findFootholdById, findFootholdBelow,
  rangesOverlap, isBlockingWall, isTallWallColumnBlocking,
  getWallX, sideWallBounds, clampXToSideWalls, resolveWallCollision,
  playerWalkforce, playerJumpforce, playerClimbforce,
  applyGroundPhysics, groundYOnFoothold, resolveFootholdForX,
  climbDownAttachTolerancePx, ladderInRange, ladderFellOff,
  findAttachableRope, climbSnapX,
  updatePlayer, updateCamera,
} from './physics.js';

// Rendering pipeline: map layers, character composition, collision
import {
  drawVRBoundsOverflowMask, drawBackgroundLayer,
  updateBackgroundAnimations, updateObjectAnimations,
  objectMoveOffset, normalizedRect, objectFrameOpacity,
  rectsOverlap, playerTouchBoxMetrics, playerTouchBounds,
  trapWorldBounds, applyPlayerTouchHit, applyTrapHit,
  mobFrameWorldBounds, updateMobTouchCollisions, updateTrapHazardCollisions,
  drawMapLayer, currentPlayerRenderLayer, buildLifeLayerBuckets,
  remotePlayerRenderLayer, buildRemotePlayerLayerBuckets,
  drawMapLayersWithCharacter,
  zOrderForPart, mergeMapAnchors, pickAnchorName,
  characterTemplateCacheKey, getCharacterPlacementTemplate,
  composeCharacterPlacements, characterBoundsFromPlacements,
  splitWordByWidth, wrapBubbleTextToWidth,
  playerHitBlinkColorScale, drawCharacter,
} from './render.js';

// Audio system: BGM, SFX, UI sounds, mob sounds
import {
  preloadUISounds, playUISound,
  findSoundNodeByName, requestSoundDataUri, unlockAudio,
  fadeOutAudio, playBgmPath, getSfxFromPool,
  playSfx, playSfxWithFallback, playMobSfx,
} from './sound.js';

// Character frame system: composition, face animation, preloading, set effects
import {
  requestCharacterData,
  getCharacterActionFrames, getHeadFrameMeta,
  getFaceExpressionFrames, getFaceFrameMeta, getFaceFrameDelayMs,
  pickPlayerHitFaceExpression, triggerPlayerHitVisuals,
  updateFaceAnimation,
  getEquipFrameParts, getHairFrameParts, extractHairPartsFromContainer,
  getCharacterFrameData, requestCharacterPartImage,
  addPreloadTask, buildMapAssetPreloadTasks, addCharacterPreloadTasks,
  preloadMapAssets,
  loadSetEffects, findActiveSetEffect,
  updateSetEffectAnimation, updateSetEffectAnimations, drawSetEffect,
  drawChatBubble, drawPlayerNameLabel,
} from './character.js';

// GM commands, chat, settings, canvas resolution
import {
  gmChat, handleSlashCommand, sendChatMessage,
  addSystemChatMessage, appendChatLogMessage,
  initChatLogResize, resetGameplayInput, resetPlayerToIdle,
  loadSettings, saveSettings, syncSettingsToUI, applyFixedRes,
  syncCanvasResolution, bindCanvasResizeHandling,
} from './input.js';

// Hide chat until first map loads successfully
if (chatBarEl) chatBarEl.style.display = "none";
if (chatLogEl) chatLogEl.style.display = "none";

// (constants, runtime, caches, and DOM refs are now in state.js)

/**
 * Solve a SHA-256 proof-of-work challenge.
 * Finds a nonce such that SHA-256(challenge + nonce) has `difficulty` leading zero bits.
 * Runs in a tight loop using crypto.subtle for hashing.
 */
async function solvePoW(challenge, difficulty) {
  console.log(`[pow] Solving challenge (${difficulty} bits)…`);
  const t0 = performance.now();
  const encoder = new TextEncoder();
  const challengeBytes = encoder.encode(challenge);
  const fullBytes = Math.floor(difficulty / 8);
  const remainBits = difficulty % 8;
  const mask = remainBits > 0 ? (0xff << (8 - remainBits)) & 0xff : 0;

  // Process in batches to avoid blocking the UI thread
  const BATCH = 50000;
  let nonce = 0;
  while (true) {
    for (let i = 0; i < BATCH; i++) {
      const nonceStr = nonce.toString(16);
      const input = new Uint8Array(challengeBytes.length + nonceStr.length);
      input.set(challengeBytes);
      input.set(encoder.encode(nonceStr), challengeBytes.length);
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", input));

      let valid = true;
      for (let b = 0; b < fullBytes; b++) {
        if (hash[b] !== 0) { valid = false; break; }
      }
      if (valid && remainBits > 0 && (hash[fullBytes] & mask) !== 0) valid = false;

      if (valid) {
        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        console.log(`[pow] Solved in ${elapsed}s (nonce=${nonceStr}, ${nonce} iterations)`);
        return nonceStr;
      }
      nonce++;
    }
    // Yield to UI thread between batches
    await new Promise(r => setTimeout(r, 0));
  }
}

/**
 * Obtain a session ID from the server via proof-of-work.
 * Only needed when no session exists in localStorage.
 */
const _powOverlay = document.getElementById("pow-overlay");
const _powLabel = _powOverlay?.querySelector(".pow-label");

function _showPow(msg) {
  if (_powLabel) _powLabel.textContent = msg || "Connecting…";
  _powOverlay?.classList.remove("hidden");
}
function _hidePow() { _powOverlay?.classList.add("hidden"); }

async function obtainSessionViaPow() {
  while (true) {
    console.log("[pow] Requesting challenge…");
    _showPow("Connecting…");

    let chResp, chData;
    try {
      chResp = await fetch("/api/pow/challenge");
      chData = await chResp.json();
    } catch (err) {
      console.error("[pow] Server unreachable:", err);
      const retry = await _showPowError("Server is not reachable");
      if (retry) continue;
    }
    if (!chData?.ok) {
      console.error("[pow] Challenge failed:", chData);
      const retry = await _showPowError("Failed to connect to server");
      if (retry) continue;
    }

    _showPow("Establishing session…");
    const nonce = await solvePoW(chData.challenge, chData.difficulty);

    _showPow("Verifying…");
    console.log("[pow] Submitting solution…");
    let vResp, vData;
    try {
      vResp = await fetch("/api/pow/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: chData.challenge, nonce }),
      });
      vData = await vResp.json();
    } catch (err) {
      console.error("[pow] Verify request failed:", err);
      const retry = await _showPowError("Server is not reachable");
      if (retry) continue;
    }
    if (!vData?.ok) {
      console.error("[pow] Verification failed:", vData);
      const retry = await _showPowError("Session verification failed");
      if (retry) continue;
    }

    console.log("[pow] Session obtained: " + vData.session_id.slice(0, 8) + "…");
    _hidePow();
    return vData.session_id;
  }
}

/**
 * Show an error message on the PoW overlay with a Retry button.
 * Returns a Promise that resolves to true when the user clicks Retry.
 */
function _showPowError(message) {
  return new Promise((resolve) => {
    if (_powLabel) {
      _powLabel.innerHTML = `${message}<br><button id="pow-retry-btn" style="
        margin-top: 14px; padding: 8px 28px; font-size: 14px;
        background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.25);
        border-radius: 6px; cursor: pointer; font-family: inherit;
      ">Retry</button>`;
    }
    _powOverlay?.classList.remove("hidden");
    // Hide the progress bar track while showing error
    const track = _powOverlay?.querySelector(".pow-track");
    if (track) track.style.display = "none";

    const btn = document.getElementById("pow-retry-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        if (track) track.style.display = "";
        resolve(true);
      }, { once: true });
    }
  });
}

// (MAP_ID_REDIRECTS, cameraHeightBias, newCharacterDefaults, playerFacePath/HairPath, runtime are now in state.js)

// (UI window DOM refs, EQUIP_SLOT_LIST, inventory state are now in state.js)

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

// (draggedItem, INV_TABS, currentInvTab are now in state.js)
// ── Inventory type / equip category helpers (C++ parity) ──

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
  if (p >= 101 && p <= 103) return "Accessory"; // Face Acc, Eye Acc, Earrings
  if (p === 104) return "Coat";
  if (p === 105) return "Longcoat";
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p === 111) return "Ring";
  if (p >= 112 && p <= 114) return "Accessory"; // Pendant, Belt, Medal
  if (p >= 130 && p <= 170) return "Weapon";
  return null;
}

// Equip slot key (for playerEquipped map) from equip item ID
// C++ EquipData determines slot from index = id/10000 - 100
// Equip slot key from item ID — C++ EquipData maps index = id/10000-100
// Index: 0=Hat, 1=FaceAcc, 2=EyeAcc, 3=Earrings, 4=Top, 5=Overall(top slot),
//        6=Bottom, 7=Shoes, 8=Gloves, 9=Shield, 10=Cape, 11=Ring, 12=Pendant,
//        13=Belt, 14=Medal.  30-49 = Weapons.
function equipSlotFromId(id) {
  const p = Math.floor(id / 10000);
  if (p === 100) return "Cap";
  if (p === 101) return "FaceAcc";
  if (p === 102) return "EyeAcc";
  if (p === 103) return "Earrings";
  if (p === 104) return "Coat";
  if (p === 105) return "Longcoat";  // Overall — separate slot, hides Coat+Pants
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p === 111) return "Ring";
  if (p === 112) return "Pendant";
  if (p === 113) return "Belt";
  if (p === 114) return "Medal";
  if (p >= 130 && p <= 170) return "Weapon";
  return null;
}

// ─── Weapon type helpers (C++ Weapon::Type) ─────────────────────────
// Two-handed weapons use stand2/walk2 stances instead of stand1/walk1
const TWO_HANDED_PREFIXES = new Set([
  138, // Staff
  140, // 2H Sword
  141, // 2H Axe
  142, // 2H Mace
  143, // Spear
  144, // Polearm
  146, // Crossbow
]);

function isWeaponTwoHanded(weaponId) {
  return TWO_HANDED_PREFIXES.has(Math.floor(weaponId / 10000));
}

/**
 * Get the preferred stand/walk stances from weapon WZ info.
 * C++ reads info/stand and info/walk (1 or 2). Falls back to two-handed check.
 */
function getWeaponStances(weaponId) {
  const wzData = runtime.characterEquipData[weaponId];
  const info = wzData?.$$?.find(c => c.$imgdir === "info");
  let standNo = 0, walkNo = 0;
  if (info) {
    for (const c of info.$$ || []) {
      if (c.$int === "stand") standNo = c.value ?? 0;
      if (c.$int === "walk") walkNo = c.value ?? 0;
    }
  }
  const twoH = isWeaponTwoHanded(weaponId);
  return {
    stand: standNo === 2 ? "stand2" : (standNo === 1 ? "stand1" : (twoH ? "stand2" : "stand1")),
    walk: walkNo === 2 ? "walk2" : (walkNo === 1 ? "walk1" : (twoH ? "walk2" : "walk1")),
  };
}

/**
 * Adjust stance based on equipped weapon (C++ CharEquips::adjust_stance).
 * Two-handed weapons and weapons with stand=2/walk=2 use stand2/walk2.
 */
function adjustStanceForWeapon(action) {
  const weapon = playerEquipped.get("Weapon");
  if (!weapon) return action;
  const stances = getWeaponStances(weapon.id);
  if (action === "stand1" || action === "stand2") return stances.stand;
  if (action === "walk1" || action === "walk2") return stances.walk;
  return action;
}

/**
 * Check if the player has an overall (Longcoat) equipped.
 * C++ CharEquips::has_overall: id / 10000 == 105
 * When an overall is equipped, Coat and Pants are hidden.
 */
function hasOverallEquipped() {
  return playerEquipped.has("Longcoat");
}

/**
 * Get the cap type from vslot in WZ info (C++ CharEquips::getcaptype).
 * Determines whether hair is shown under/over the hat.
 * - "CpH1H5"   → HALFCOVER (hair below cap shown)
 * - "CpH1H5AyAs" or longer → FULLCOVER (all hair hidden)
 * - "CpH5"     → HEADBAND (hair fully shown)
 * - default    → NONE (hair fully shown)
 */
function getCapType() {
  const cap = playerEquipped.get("Cap");
  if (!cap) return "NONE";
  const wzData = runtime.characterEquipData[cap.id];
  if (!wzData) return "NONE";
  const info = wzData.$$?.find(c => c.$imgdir === "info");
  if (!info) return "NONE";
  const vslotNode = (info.$$ || []).find(c => c.$string === "vslot");
  const vslot = vslotNode ? String(vslotNode.value ?? "") : "";
  if (vslot === "CpH1H5") return "HALFCOVER";
  if (vslot === "CpH5") return "HEADBAND";
  // Anything with more coverage than halfcover is full cover
  if (vslot.length > 6 && vslot.startsWith("Cp")) return "FULLCOVER";
  return "NONE";
}

/**
 * Adjust stance for a remote player's weapon.
 * Same logic as adjustStanceForWeapon but reads from remoteEquipData.
 */
function adjustStanceForRemoteWeapon(rp, action) {
  const equipDataMap = remoteEquipData.get(rp.id);
  if (!equipDataMap) return action;
  // Find the weapon in remote equip data
  let weaponId = 0;
  let weaponWz = null;
  for (const [itemId, equipJson] of equipDataMap) {
    if (equipSlotFromId(Number(itemId)) === "Weapon") {
      weaponId = Number(itemId);
      weaponWz = equipJson;
      break;
    }
  }
  if (!weaponId) return action;
  // Read stand/walk from WZ info
  const info = weaponWz?.$$?.find(c => c.$imgdir === "info");
  let standNo = 0, walkNo = 0;
  if (info) {
    for (const c of info.$$ || []) {
      if (c.$int === "stand") standNo = c.value ?? 0;
      if (c.$int === "walk") walkNo = c.value ?? 0;
    }
  }
  const twoH = isWeaponTwoHanded(weaponId);
  const preferStand = standNo === 2 ? "stand2" : (standNo === 1 ? "stand1" : (twoH ? "stand2" : "stand1"));
  const preferWalk = walkNo === 2 ? "walk2" : (walkNo === 1 ? "walk1" : (twoH ? "walk2" : "walk1"));
  if (action === "stand1" || action === "stand2") return preferStand;
  if (action === "walk1" || action === "walk2") return preferWalk;
  return action;
}

// (groundDrops, drop constants, iconDataUriCache are now in state.js)
let _localDropIdCounter = -1;
const DROP_EXPIRE_MS = 180_000;
const DROP_EXPIRE_FADE_MS = 2000;

function getIconDataUri(key) {
  return iconDataUriCache.get(key) ?? null;
}

function loadEquipIcon(equipId, category) {
  const padded = String(equipId).padStart(8, "0");
  const key = `equip-icon:${equipId}`;
  if (iconDataUriCache.has(key)) return key;
  iconDataUriCache.set(key, null);
  const path = `/resourcesv2/Character.wz/${category}/${padded}.img.json`;
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
    wzPath = `/resourcesv2/Item.wz/Consume/${prefix}.img.json`;
  } else if (itemId >= 3000000 && itemId < 4000000) {
    wzPath = `/resourcesv2/Item.wz/Install/${prefix}.img.json`;
  } else if (itemId >= 4000000 && itemId < 5000000) {
    wzPath = `/resourcesv2/Item.wz/Etc/${prefix}.img.json`;
  } else if (itemId >= 5000000 && itemId < 6000000) {
    wzPath = `/resourcesv2/Item.wz/Cash/${prefix}.img.json`;
  } else { return key; }
  fetchJson(wzPath).then((json) => {
    if (!json?.$$) return;
    const itemNode = json.$$.find(c => c.$imgdir === idStr);
    if (!itemNode?.$$) return;
    const infoNode = itemNode.$$.find(c => c.$imgdir === "info");
    if (!infoNode?.$$) return;
    // Direct canvas icon
    const iconNode = infoNode.$$.find(c => c.$canvas === "icon" || c.$canvas === "iconRaw");
    if (iconNode?.basedata) {
      iconDataUriCache.set(key, `data:image/png;base64,${iconNode.basedata}`);
      refreshUIWindows();
      return;
    }
    // UOL reference — e.g. "../../02040008/info/icon"
    // Resolve relative to the info node: ../../ goes up to file root, then navigate path
    const uolNode = infoNode.$$.find(c => {
      const v = String(c.value ?? "");
      return v.includes("info/icon") && v.includes("../");
    });
    if (uolNode) {
      const resolved = resolveItemIconUol(json, String(uolNode.value));
      if (resolved?.basedata) {
        iconDataUriCache.set(key, `data:image/png;base64,${resolved.basedata}`);
        refreshUIWindows();
      }
    }
  }).catch(() => {});
  return key;
}

/**
 * Resolve a UOL icon reference within a WZ item file.
 * UOL format: "../../{itemId}/info/icon" — relative to the info node.
 * From info level: ../../ goes to file root, then itemId/info/icon.
 */
function resolveItemIconUol(fileJson, uolPath) {
  // Normalize: strip leading ../../ pairs to get the absolute path from file root
  const parts = uolPath.split("/");
  // Count leading ".." segments — each pair of "../" goes up one level
  let upCount = 0;
  while (upCount < parts.length && parts[upCount] === "..") upCount++;
  // The remaining path is relative to the ancestor node
  // From info (depth 2 within item/info), going up 2 levels reaches file root
  const relPath = parts.slice(upCount);
  // Navigate from file root: relPath[0] = itemId, relPath[1] = "info", relPath[2] = "icon"
  let node = fileJson;
  for (const seg of relPath) {
    if (!node?.$$) return null;
    // Try $imgdir match first, then $canvas match
    const child = node.$$.find(c => c.$imgdir === seg) || node.$$.find(c => c.$canvas === seg);
    if (!child) return null;
    node = child;
  }
  return node;
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
      const json = await fetchJson("/resourcesv2/String.wz/Eqp.img.json");
      return findStringName(json, idStr);
    } else if (itemId >= 2000000 && itemId < 3000000) {
      const json = await fetchJson("/resourcesv2/String.wz/Consume.img.json");
      return findStringName(json, idStr);
    } else if (itemId >= 3000000 && itemId < 4000000) {
      const json = await fetchJson("/resourcesv2/String.wz/Ins.img.json");
      return findStringName(json, idStr);
    } else if (itemId >= 4000000 && itemId < 5000000) {
      const json = await fetchJson("/resourcesv2/String.wz/Etc.img.json");
      return findStringName(json, idStr);
    } else if (itemId >= 5000000 && itemId < 6000000) {
      const json = await fetchJson("/resourcesv2/String.wz/Cash.img.json");
      return findStringName(json, idStr);
    }
  } catch {}
  return null;
}

function initPlayerEquipment(equips) {
  playerEquipped.clear();
  for (const eq of equips) {
    // eq.category may be a WZ folder name (old saves) or an equip slot type (new saves)
    // Always resolve the authoritative slot from the item ID
    const slotType = equipSlotFromId(eq.id) || eq.category || "Coat";
    const wzCategory = equipWzCategoryFromId(eq.id) || slotType;
    const iconKey = loadEquipIcon(eq.id, wzCategory);
    playerEquipped.set(slotType, { id: eq.id, name: "", iconKey });
    loadItemName(eq.id).then(name => {
      const entry = playerEquipped.get(slotType);
      if (entry) { entry.name = name || slotType; refreshUIWindows(); }
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
    name: runtime.player.name,
    identity: {
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
    achievements: { ...runtime.player.achievements },
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
  p.name = save.identity?.name || save.name || p.name || "Shlop";
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
    // Resolve slot from item ID (authoritative), fall back to saved slot_type
    const slotType = equipSlotFromId(eq.item_id) || eq.slot_type;
    const wzCategory = equipWzCategoryFromId(eq.item_id) || slotType;
    const iconKey = loadEquipIcon(eq.item_id, wzCategory);
    playerEquipped.set(slotType, { id: eq.item_id, name: eq.item_name || "", iconKey });
    // Async: load WZ stance data for character rendering
    loadEquipWzData(eq.item_id);
    // Async: load display name
    loadItemName(eq.item_id).then(name => {
      const entry = playerEquipped.get(slotType);
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

  // Achievements (server-authoritative, loaded from save)
  const savedAch = save.achievements;
  p.achievements = (savedAch && typeof savedAch === "object" && !Array.isArray(savedAch)) ? { ...savedAch } : {};

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
          achievements: save.achievements,
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
  overlay.style.cssText = "z-index: 200000;";
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
    setDuplicateLoginBlocked(false);
    // Set up the initial map promise BEFORE connecting (same race fix as startup)
    setAwaitingInitialMap(true);
    const serverMapPromise = new Promise((resolve) => {
      setInitialMapResolve(resolve);
      setTimeout(() => {
        if (_awaitingInitialMap) {
          setAwaitingInitialMap(false);
          setInitialMapResolve(null);
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
      setAwaitingInitialMap(false);
      setInitialMapResolve(null);
    }
  });
  overlay.querySelector("#dup-login-logout").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CHARACTER_SAVE_KEY);
    localStorage.removeItem("maple_session_id"); // legacy key
    localStorage.removeItem("shlop.save.v1");
    localStorage.removeItem("shlop.settings.v1");
    localStorage.removeItem("shlop.keybinds.v1");
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
      resolve({ name: "Shlop", gender: false, loggedIn: false });
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
    // cursor handled by body.wz-cursor-active

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
  const path = `/resourcesv2/Item.wz/${folder}/${prefix}.img.json`;
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
    const json = await fetchJson(`/resourcesv2/String.wz/${file}`);
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
  const path = `/resourcesv2/Character.wz/${category}/${padded}.img.json`;
  try {
    const data = await fetchJson(path);
    // Cash weapons (prefix 170) have stances nested under numeric weapon-type groups.
    // Resolve the appropriate group based on the player's actual weapon type.
    const prefix = Math.floor(equipId / 10000);
    if (prefix === 170) {
      const resolved = resolveCashWeaponData(data, equipId);
      runtime.characterEquipData[equipId] = resolved;
    } else {
      runtime.characterEquipData[equipId] = data;
    }
    // Clear placement cache so next frame recomposes with new equip
    characterPlacementTemplateCache.clear();
  } catch (e) {
    rlog(`Failed to load equip WZ data for ${equipId}: ${e.message}`);
  }
}

/**
 * Cash weapons (170x) have stances nested under numeric group IDs that correspond
 * to weapon type prefixes (e.g. group "30" = 1H Sword type 130).
 * This resolves the correct group based on the player's actual equipped weapon,
 * or defaults to group "30" (1H Sword) if no weapon is equipped.
 * Returns a flattened node with stances at the top level (same shape as normal weapons).
 */
function resolveCashWeaponData(data, cashWeaponId) {
  // Determine the actual weapon type from the player's other equipped weapon
  let groupId = "30"; // default: 1H Sword
  for (const [slot, eq] of playerEquipped) {
    if (slot === "Weapon" && eq.id !== cashWeaponId) {
      const weaponPrefix = Math.floor(eq.id / 10000);
      if (weaponPrefix >= 130 && weaponPrefix < 170) {
        groupId = String(weaponPrefix - 100);
        break;
      }
    }
  }
  // Find the group node
  const groupNode = childByName(data, groupId);
  if (groupNode) {
    // Merge info from the top-level with the group's stances
    const infoNode = childByName(data, "info");
    const merged = { $imgdir: data.$imgdir, $$: [] };
    if (infoNode) merged.$$.push(infoNode);
    for (const child of groupNode.$$ || []) {
      merged.$$.push(child);
    }
    rlog(`Cash weapon ${cashWeaponId}: resolved group ${groupId}`);
    return merged;
  }
  // Fallback: try group "30"
  const fallback = childByName(data, "30");
  if (fallback) {
    const infoNode = childByName(data, "info");
    const merged = { $imgdir: data.$imgdir, $$: [] };
    if (infoNode) merged.$$.push(infoNode);
    for (const child of fallback.$$ || []) {
      merged.$$.push(child);
    }
    rlog(`Cash weapon ${cashWeaponId}: fallback to group 30`);
    return merged;
  }
  rlog(`Cash weapon ${cashWeaponId}: no group found, using raw data`);
  return data;
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
  // equipSlotFromId is the primary slot resolver (maps to EQUIP_SLOT_LIST types).
  // equipWzCategoryFromId maps to WZ folder names (e.g. "Accessory") — not equip slots.
  const slotType = equipSlotFromId(item.id);
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
  overlay.style.cssText = "z-index:200000;";
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
    const json = await fetchJson(`/resourcesv2/Item.wz/Install/${prefix}.img.json`);
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
      // Pre-check: does the inventory tab have room for this item?
      const dropInvType = inventoryTypeById(drop.id) || "ETC";
      const dropStackable = isItemStackable(drop.id);
      let hasRoom = false;
      if (dropStackable) {
        // Check if existing stacks have space
        for (const entry of playerInventory) {
          if (entry.id === drop.id && entry.invType === dropInvType) {
            const slotMax = getItemSlotMax(drop.id);
            if (entry.qty < slotMax) { hasRoom = true; break; }
          }
        }
      }
      if (!hasRoom) hasRoom = findFreeSlot(dropInvType) !== -1;
      if (!hasRoom) {
        addSystemChatMessage("Your inventory is full. Please make room before picking up more items.");
        return;
      }

      if (_wsConnected) {
        // Loot ownership: skip if owned by someone else and less than 5s old
        if (drop.ownerId && drop.ownerId !== sessionId) {
          const age = Date.now() - drop.createdAt;
          if (age < 5000) continue; // not our drop yet — try next
        }
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
        addSystemChatMessage("Your inventory is full. Please make room before picking up more items.");
        return;
      }
      addSystemChatMessage("Your inventory is full. Some items could not be picked up.");
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
    createdAt: Date.now(), // local timestamp for loot protection timing (avoids clock skew)
    ownerId: dropData.owner_id || "",
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
  if (key === "ping") return pingWindowEl;
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
    const basicJson = await fetchJson("/resourcesv2/UI.wz/Basic.img.json");
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

    // Hide the system cursor everywhere — activated by body class
    if (wzCursor.loaded) {
      document.body.classList.add("wz-cursor-active");
    }

    // Also preload UI sounds for click / open / close
    void preloadUISounds();
  } catch (e) {
    dlog("warn", "[ui] Failed to load cursor assets: " + (e.message || e));
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
        // Sync settings toggle when ping window is closed via ×
        if (key === "ping") {
          runtime.settings.showPing = false;
          if (settingsPingToggleEl) settingsPingToggleEl.checked = false;
          saveSettings();
        }
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


const characterPlacementTemplateCache = new Map();



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



function openChatInput() {
  runtime.chat.inputActive = true;
  runtime.chat.recallIndex = -1;
  runtime.chat.recallDraft = "";
  chatBarEl?.classList.remove("inactive");
  resetGameplayInput();
  if (chatInputEl) {
    chatInputEl.focus();
  }
}

function closeChatInput() {
  runtime.chat.inputActive = false;
  chatBarEl?.classList.add("inactive");
  resetGameplayInput();
  canvasEl.focus();
}

// ─── Map String Data ──────────────────────────────────────────────────────────
let mapStringData = null;
let mapStringDataPromise = null;

async function loadMapStringData() {
  if (mapStringData) return mapStringData;
  if (mapStringDataPromise) return mapStringDataPromise;
  mapStringDataPromise = (async () => {
    const raw = await fetchJson("/resourcesv2/String.wz/Map.img.json");
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
    setPendingMapChangeResolve(resolve);
    setPendingMapChangeReject(reject);
    wsSend(msg);
    // Timeout after 10 seconds
    setPendingMapChangeTimer(setTimeout(() => {
      if (_pendingMapChangeResolve) {
        setPendingMapChangeResolve(null);
        setPendingMapChangeReject(null);
        setPendingMapChangeTimer(null);
        reject(new Error("Map change request timed out"));
      }
    }, 10000));
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

      rlog(`Portal ${portal.name || portal.id} has no local destination in map ${runtime.mapId}.`);
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
  const json = await fetchJson("/resourcesv2/Map.wz/MapHelper.img.json");

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
      const resp = await fetchJson("/resourcesv2/Map.wz/MapHelper.img.json");
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




let _lastRenderState = "";
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

// ── GM Overlay Drawing ──────────────────────────────────────────────

function _gmDrawRect(rect, strokeStyle, fillStyle) {
  if (!rect) return;
  const width = Math.max(1, rect.right - rect.left);
  const height = Math.max(1, rect.bottom - rect.top);
  if (!isWorldRectVisible(rect.left, rect.top, width, height, 64)) return;
  const a = worldToScreen(rect.left, rect.top);
  const b = worldToScreen(rect.right, rect.bottom);
  const x = Math.round(Math.min(a.x, b.x));
  const y = Math.round(Math.min(a.y, b.y));
  const w = Math.max(1, Math.round(Math.abs(b.x - a.x)));
  const h = Math.max(1, Math.round(Math.abs(b.y - a.y)));
  if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fillRect(x, y, w, h); }
  ctx.strokeStyle = strokeStyle; ctx.strokeRect(x, y, w, h);
}

function drawGmOverlays() {
  if (!runtime.map) return;
  const cw = gameViewWidth();
  const ch = gameViewHeight();
  const nowMs = performance.now();

  ctx.save();

  // ── Footholds (green lines with coordinate labels + IDs) ──
  ctx.strokeStyle = "rgba(34, 197, 94, 0.65)";
  ctx.lineWidth = 1.5;
  ctx.font = "bold 10px monospace";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 3;

  for (const fh of runtime.map.footholdLines) {
    const a = worldToScreen(fh.x1, fh.y1);
    const b = worldToScreen(fh.x2, fh.y2);
    if ((a.x < -200 && b.x < -200) || (a.x > cw + 200 && b.x > cw + 200)) continue;
    if ((a.y < -200 && b.y < -200) || (a.y > ch + 200 && b.y > ch + 200)) continue;

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(34, 197, 94, 0.65)";
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    // Endpoint dots
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(a.x - 2, a.y - 2, 4, 4);
    ctx.fillRect(b.x - 2, b.y - 2, 4, 4);

    // Coordinate labels
    ctx.shadowBlur = 3;
    ctx.fillStyle = "#4ade80";
    ctx.fillText(`${fh.x1},${fh.y1}`, a.x + 3, a.y + 3);
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx * dx + dy * dy > 2500) {
      ctx.fillText(`${fh.x2},${fh.y2}`, b.x + 3, b.y + 3);
    }

    // Foothold ID at midpoint
    ctx.fillStyle = "rgba(134, 239, 172, 0.8)";
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    ctx.fillText(`fh:${fh.id}`, mx + 3, my - 12);
  }

  // ── Ropes / Ladders (yellow lines with position labels) ──
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(251, 191, 36, 0.85)";
  ctx.lineWidth = 2;
  for (const rope of runtime.map.ladderRopes ?? []) {
    const a = worldToScreen(rope.x, rope.y1);
    const b = worldToScreen(rope.x, rope.y2);
    if (a.x < -100 || a.x > cw + 100) continue;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    // Labels
    ctx.shadowBlur = 3;
    ctx.fillStyle = "#fbbf24";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "center";
    ctx.fillText(`rope ${rope.x}`, a.x, a.y - 4);
    ctx.fillStyle = "#fcd34d";
    ctx.font = "9px monospace";
    ctx.fillText(`y:${rope.y1}→${rope.y2}  L=${rope.ladder ? 1 : 0}`, a.x, a.y - 16);
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
  }

  // ── Tile overlays (blue bounding boxes with u:no + position) ──
  ctx.lineWidth = 1;
  ctx.textBaseline = "bottom";
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
      if (!isWorldRectVisible(worldX, worldY, w, h, 32)) continue;
      const tl = worldToScreen(worldX, worldY);
      const br = worldToScreen(worldX + w, worldY + h);
      const sx = Math.round(tl.x), sy = Math.round(tl.y);
      const sw = Math.max(1, Math.round(br.x - tl.x));
      const sh = Math.max(1, Math.round(br.y - tl.y));
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(56, 189, 248, 0.5)";
      ctx.strokeRect(sx, sy, sw, sh);
      // Origin dot
      ctx.fillStyle = "#38bdf8";
      const op = worldToScreen(tile.x, tile.y);
      ctx.beginPath(); ctx.arc(op.x, op.y, 2.5, 0, Math.PI * 2); ctx.fill();
      // Labels
      ctx.shadowBlur = 3;
      ctx.fillStyle = "#7dd3fc";
      ctx.fillText(`${tile.u}:${tile.no}`, sx + 2, sy - 2);
      ctx.textBaseline = "top";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(`${tile.x},${tile.y}`, sx + 2, sy + 2);
      ctx.textBaseline = "bottom";
    }
  }

  // ── Life markers (mobs + NPCs — verbose) ──
  ctx.lineWidth = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.shadowBlur = 3;
  for (let idx = 0; idx < runtime.map.lifeEntries.length; idx++) {
    const life = runtime.map.lifeEntries[idx];
    const sp = worldToScreen(life.x, life.cy);
    const isMob = life.type === "m";
    const state = lifeRuntimeState.get(idx);
    const cacheKey = `${life.type}:${life.id}`;
    const anim = lifeAnimations.get(cacheKey);
    const name = anim?.name || life.id;

    // Spawn position marker
    ctx.fillStyle = isMob ? "rgba(239, 68, 68, 0.8)" : "rgba(167, 139, 250, 0.8)";
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2); ctx.fill();

    // ID + name
    ctx.fillStyle = isMob ? "#fb7185" : "#c4b5fd";
    ctx.font = "bold 10px monospace";
    ctx.fillText(`${isMob ? "Mob" : "NPC"} ${life.id}`, sp.x, sp.y - 28);
    ctx.font = "9px monospace";
    ctx.fillStyle = isMob ? "#fda4af" : "#ddd6fe";
    ctx.fillText(`"${name}"`, sp.x, sp.y - 16);

    // Position + state info
    const posX = state ? Math.round(state.x ?? life.x) : life.x;
    const posY = state ? Math.round(state.y ?? life.cy) : life.cy;
    ctx.fillStyle = isMob ? "#fecdd3" : "#ede9fe";
    ctx.fillText(`pos:${posX},${posY}  fh:${life.fh ?? "?"}`, sp.x, sp.y - 4);

    if (isMob && state) {
      // Mob-specific: show HP, action, facing, dead/dying
      const hp = state.hp ?? "?";
      const maxHp = anim?.maxHp ?? "?";
      const action = state.action ?? "?";
      const facing = state.facing === -1 ? "L" : "R";
      let extra = `hp:${hp}/${maxHp} ${action} ${facing}`;
      if (state.dead) extra += " DEAD";
      else if (state.dying) extra += " DYING";
      ctx.fillText(extra, sp.x, sp.y + 10);
    }

    if (!isMob) {
      // NPC-specific: show script if available
      const scriptId = life.script || "";
      if (scriptId) {
        ctx.fillStyle = "#a5b4fc";
        ctx.fillText(`script:${scriptId}`, sp.x, sp.y + 10);
      }
    }
  }

  // ── Portal markers (purple boxes with verbose info) ──
  ctx.lineWidth = 1;
  for (const portal of runtime.map.portalEntries ?? []) {
    const sp = worldToScreen(portal.x, portal.y);
    if (sp.x < -200 || sp.x > cw + 200 || sp.y < -200 || sp.y > ch + 200) continue;
    // Bounding box
    _gmDrawRect(portalWorldBounds(portal), "rgba(167, 139, 250, 0.9)", "rgba(167, 139, 250, 0.06)");
    // Labels
    ctx.fillStyle = "#c4b5fd";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`Portal "${portal.name}"`, sp.x, sp.y - 28);
    ctx.font = "9px monospace";
    ctx.fillStyle = "#ddd6fe";
    const pt = portal.pt ?? "?";
    const tm = portal.tm ?? "?";
    const tn = portal.tn ?? "";
    ctx.fillText(`pt:${pt} → ${tm}/${tn}`, sp.x, sp.y - 16);
    ctx.fillText(`pos:${portal.x},${portal.y}`, sp.x, sp.y - 4);
  }

  // ── Reactor markers (pink boxes with HP + state) ──
  for (const [idx, rs] of reactorRuntimeState) {
    const reactor = runtime.map.reactorEntries?.[idx];
    if (!reactor) continue;
    const sp = worldToScreen(reactor.x, reactor.y);
    if (sp.x < -200 || sp.x > cw + 200) continue;
    ctx.fillStyle = rs.active ? "rgba(255, 100, 255, 0.8)" : "rgba(100, 100, 100, 0.5)";
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = rs.active ? "#ff64ff" : "#888";
    ctx.fillText(`Reactor ${reactor.id}`, sp.x, sp.y - 16);
    ctx.font = "9px monospace";
    ctx.fillStyle = rs.active ? "#f0abfc" : "#aaa";
    const hpText = rs.active ? `HP:${rs.hp ?? "?"}/${4}` : "DESTROYED";
    ctx.fillText(`${hpText}  pos:${reactor.x},${reactor.y}`, sp.x, sp.y - 4);
  }

  // ── Hitboxes ──
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;

  // Player hitbox (cyan)
  _gmDrawRect(playerTouchBounds(runtime.player), "rgba(56, 189, 248, 0.95)", "rgba(56, 189, 248, 0.08)");

  // Trap/hazard hitboxes (yellow)
  for (const hazard of runtime.map.trapHazards ?? []) {
    const meta = currentObjectFrameMeta(hazard.layerIndex, hazard.obj);
    if (!isDamagingTrapMeta(meta)) continue;
    const bounds = trapWorldBounds(hazard.obj, meta, nowMs);
    _gmDrawRect(bounds, "rgba(250, 204, 21, 0.95)", "rgba(250, 204, 21, 0.08)");
  }

  // Mob hitboxes (red/pink)
  for (const [idx, state] of lifeRuntimeState) {
    const life = runtime.map.lifeEntries[idx];
    if (!life || life.type !== "m") continue;
    if (state.dead || state.dying) continue;
    const anim = lifeAnimations.get(`m:${life.id}`);
    if (!anim) continue;
    const bounds = mobFrameWorldBounds(life, state, anim);
    if (!bounds) continue;
    const touchEnabled = !!anim.touchDamageEnabled;
    _gmDrawRect(
      bounds,
      touchEnabled ? "rgba(239, 68, 68, 0.95)" : "rgba(248, 113, 113, 0.65)",
      touchEnabled ? "rgba(239, 68, 68, 0.07)" : null,
    );
  }

  // ── HUD: Player coords + map info (top-left) ──
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "bold 11px monospace";
  const px = Math.round(runtime.player.x);
  const py = Math.round(runtime.player.y);
  const lines = [
    `Map: ${runtime.mapId}  Player: ${px}, ${py}`,
    `Action: ${runtime.player.action}  Facing: ${runtime.player.facing === -1 ? "L" : "R"}  Ground: ${runtime.player.onGround}`,
    `Camera: ${Math.round(runtime.camera.x)}, ${Math.round(runtime.camera.y)}  FH: ${runtime.map.footholdLines.length}  Life: ${runtime.map.lifeEntries.length}`,
    `Ropes: ${(runtime.map.ladderRopes ?? []).length}  Portals: ${(runtime.map.portalEntries ?? []).length}  Reactors: ${(runtime.map.reactorEntries ?? []).length}`,
  ];
  const hudX = 8, hudY = 8;
  const lineH = 14;
  // Background
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(hudX - 4, hudY - 4, 520, lines.length * lineH + 8);
  ctx.fillStyle = "#e2e8f0";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], hudX, hudY + i * lineH);
  }

  ctx.restore();
}

let _renderLogOnce = false;
function render() {
  resetFramePerfCounters();

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  const rs = `loading=${runtime.loading.active},map=${!!runtime.map},warp=${runtime.portalWarpInProgress},trans=${runtime.transition.alpha.toFixed(1)}`;
  if (rs !== _lastRenderState) {
    console.log(`[render] state change: ${rs} | canvas=${canvasEl.width}x${canvasEl.height} | camera=${Math.round(runtime.camera.x)},${Math.round(runtime.camera.y)} | player=${Math.round(runtime.player.x)},${Math.round(runtime.player.y)}`);
    rlog(`render state: ${rs}`);
    _lastRenderState = rs;
  }

  if (runtime.loading.active) {
    drawLoadingScreen();
    return;
  }

  if (!runtime.map) {
    if (runtime._fatalError) {
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.font = "14px 'Dotum', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(runtime._fatalError, canvasEl.width / 2, canvasEl.height / 2);
      ctx.restore();
    }
    drawTransitionOverlay();
    return;
  }

  if (!_renderLogOnce) {
    _renderLogOnce = true;
    const m = runtime.map;
    console.log(`[render] First map render: mapId=${runtime.mapId} layers=${m.layers?.length ?? 0} footholds=${m.footholds?.length ?? 0} bg=${m.backgrounds?.length ?? 0} portals=${m.portalEntries?.length ?? 0}`);
    console.log(`[render] Map bounds: VR=${JSON.stringify(m.info?.VRLeft != null ? {l:m.info.VRLeft,r:m.info.VRRight,t:m.info.VRTop,b:m.info.VRBottom} : 'none')} bgCount=${m.backgrounds?.length ?? 0}`);
    console.log(`[render] Player pos: ${runtime.player.x},${runtime.player.y} fh=${runtime.player.footholdId} action=${runtime.player.action}`);

    // Check if any tile/obj images are actually loaded
    let tileCount = 0, objCount = 0;
    for (const layer of (m.layers ?? [])) {
      tileCount += layer.tiles?.length ?? 0;
      objCount += layer.objects?.length ?? 0;
    }
    console.log(`[render] Asset counts: tiles=${tileCount} objs=${objCount} imageCache=${imageCache.size} metaCache=${metaCache.size} jsonCache=${jsonCache.size}`);
    // Sample a few tile/obj keys to see if their images exist
    for (const layer of (m.layers ?? [])) {
      for (const tile of (layer.tiles ?? []).slice(0, 3)) {
        const key = tile.key;
        const hasMeta = metaCache.has(key);
        const hasImg = imageCache.has(key);
        console.log(`[render]   tile key=${key} hasMeta=${hasMeta} hasImg=${hasImg}`);
      }
      for (const obj of (layer.objects ?? []).slice(0, 3)) {
        const key = obj.key ?? obj.frames?.[0]?.key;
        const hasMeta = metaCache.has(key);
        const hasImg = imageCache.has(key);
        console.log(`[render]   obj key=${key} hasMeta=${hasMeta} hasImg=${hasImg}`);
      }
    }
  }

  drawBackgroundLayer(0);
  drawMapLayersWithCharacter();
  drawReactors();
  drawDamageNumbers();
  drawPortals();
  if (runtime.gmOverlay) drawGmOverlays();
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
  drawTransitionOverlay();
  drawWZCursor();
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
  updateSetEffectAnimations(dt * 1000);
  updateNpcAmbientBubbles(performance.now());
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
      setLastPosSendTime(now);
    }
    // Mob authority: broadcast mob state at 10Hz
    if (_isMobAuthority && now - _lastMobStateSendTime >= MOB_STATE_SEND_INTERVAL) {
      setLastMobStateSendTime(now);
      sendMobState();
    }
  }


}

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
    dlog("error", "[tick crash] " + (err?.message || err) + "\n" + (err?.stack || ""));
  }

  requestAnimationFrame(tick);
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
  setIsMobAuthority(false);

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

    rlog(`Loading map ${resolvedMapId}...`);

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

    rlog(`Loaded map ${runtime.mapId}. Click/hover canvas to control. Controls: ←/→ move, Space jump, ↑ grab rope, ↑/↓ climb, ↓ crouch, Enter to chat.`);
    const _welcomePhrases = [
      "The platforms don't care about your feelings.",
      "Remember: gravity is not a suggestion. 🍁",
      "Pro tip: the floor is optional, apparently.",
      "Those ropes aren't going to grab themselves.",
      "Somewhere, a platform is waiting to betray you.",
      "Don't look down. Actually, do. You need to land.",
      "Your spacebar called. It wants a break.",
      "Fall count: let's not keep track, shall we?",
      "The jump quests believe in you. The physics don't.",
      "One pixel off? Back to the bottom you go! 🍄",
      "They said it'd be fun. They lied. You'll love it.",
      "Hope you stretched your fingers. You'll need them.",
      "No amount of potions will heal your pride here.",
      "The treasure chest at the top is definitely worth it. Probably.",
      "Patience is a virtue. Rage-quitting is a tradition.",
      "Fun fact: the ropes are greased. Not really, but it feels like it.",
      "You vs. a series of small platforms. Place your bets.",
      "Legend says someone cleared this on the first try. Legend is a liar.",
      "Keep your potions close and your arrow keys closer.",
      "Another adventurer enters the meat grinder. Good luck! ✨",
      "The platforms were placed by someone who hates you personally.",
      "Tip: screaming at the screen does improve jump accuracy by 0%.",
      "You're here for the challenge. And the suffering. Mostly the suffering.",
      "Each fall builds character. You must have great character by now.",
    ];
    addSystemChatMessage(`Welcome — ${_welcomePhrases[Math.floor(Math.random() * _welcomePhrases.length)]}`, "welcome");
    if (runtime.map?.swim) {
      addSystemChatMessage(`[Info] This is a water environment. Use arrow keys or Space to swim when airborne.`);
    }
    rlog(`loadMap COMPLETE mapId=${runtime.mapId}`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const isLfsError = error instanceof SyntaxError && errMsg.includes('"version ht"');
    console.error(`[loadMap] ERROR:`, error);
    if (isLfsError) {
      console.error(`[loadMap] ⚠️  Git LFS pointer detected! Run "git lfs pull" on the server to download actual resource files.`);
    }
    console.error(`[loadMap] Stack:`, error instanceof Error ? error.stack : "N/A");
    rlog(`loadMap ERROR: ${errMsg}`);
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

    // Only restore chat UI if map actually loaded — keep it hidden on fatal errors
    if (runtime.map) {
      if (chatBarEl) chatBarEl.style.display = "";
      if (chatLogEl) chatLogEl.style.display = "";
    }

    rlog(`Error: ${errMsg}`);

    // Show visible error on canvas for fatal load failures
    if (!runtime.map) {
      runtime._fatalError = isLfsError
        ? "Resource files not downloaded. Run 'git lfs pull' on the server."
        : `Map load failed: ${errMsg}`;
    }
  }
}

function isMobileClient() {
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches === true;
  const ua = navigator.userAgent || "";
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
  return coarsePointer || mobileUa;
}

function setupMobileTouchControls() {
  if (!window.__MAPLE_ONLINE__) return;
  if (!isMobileClient()) return;

  const wrapper = canvasEl.parentElement;
  if (!wrapper) return;

  const overlay = document.createElement("div");
  overlay.id = "mobile-touch-controls";
  overlay.style.cssText = [
    "position:absolute",
    "left:0",
    "right:0",
    "bottom:calc(env(safe-area-inset-bottom, 0px) - 34px)",
    "z-index:120000",
    "display:flex",
    "justify-content:space-between",
    "align-items:flex-end",
    "padding:0",
    "pointer-events:none",
    "user-select:none",
  ].join(";");

  const dpad = document.createElement("div");
  dpad.style.cssText = "display:grid;grid-template-columns:64px 64px 64px;grid-template-rows:64px 64px 64px;gap:8px;pointer-events:auto;touch-action:none;margin-left:25px;margin-bottom:-52px;";

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:auto;touch-action:none;margin-right:25px;margin-bottom:24px;";

  function mkBtn(label, gridPos = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.textContent = "";
    b.style.cssText = [
      "width:64px",
      "height:64px",
      "border-radius:16px",
      "border:1px solid rgba(255,255,255,0.28)",
      "background:rgba(15,23,42,0.10)",
      "color:transparent",
      "font-size:0",
      "touch-action:none",
    ].join(";");
    if (gridPos) b.style.gridArea = gridPos;
    return b;
  }

  const upBtn = mkBtn("↑", "1 / 2");
  const leftBtn = mkBtn("←", "2 / 1");
  const downBtn = mkBtn("↓", "2 / 2");
  const rightBtn = mkBtn("→", "2 / 3");

  const jumpBtn = mkBtn("A");
  jumpBtn.style.width = "76px";
  jumpBtn.style.height = "76px";
  jumpBtn.style.borderRadius = "999px";
  const attackBtn = mkBtn("B");
  attackBtn.style.width = "72px";
  attackBtn.style.height = "72px";
  attackBtn.style.borderRadius = "999px";

  dpad.append(upBtn, leftBtn, downBtn, rightBtn);
  // Attack above, jump below (primary thumb button)
  actions.append(attackBtn, jumpBtn);
  overlay.append(dpad, actions);
  wrapper.appendChild(overlay);

  const activePointers = {
    left: new Set(),
    right: new Set(),
    up: new Set(),
    down: new Set(),
    jump: new Set(),
  };

  function press(action, event) {
    event.preventDefault();
    event.stopPropagation();
    canvasEl.focus();
    runtime.input.enabled = true;

    if (action === "attack") {
      performAttack();
      return;
    }

    const id = event.pointerId ?? "mouse";
    activePointers[action]?.add(id);

    if (action === "left") runtime.input.left = true;
    if (action === "right") runtime.input.right = true;
    if (action === "down") runtime.input.down = true;
    if (action === "up") {
      const wasUp = runtime.input.up;
      runtime.input.up = true;
      if (!wasUp) void tryUsePortal(true);
    }
    if (action === "jump") {
      if (!runtime.input.jumpHeld) runtime.input.jumpQueued = true;
      runtime.input.jumpHeld = true;
    }
  }

  function release(action, event) {
    event.preventDefault();
    event.stopPropagation();
    const id = event.pointerId ?? "mouse";
    activePointers[action]?.delete(id);

    if (action === "left" && activePointers.left.size === 0) runtime.input.left = false;
    if (action === "right" && activePointers.right.size === 0) runtime.input.right = false;
    if (action === "up" && activePointers.up.size === 0) runtime.input.up = false;
    if (action === "down" && activePointers.down.size === 0) runtime.input.down = false;
    if (action === "jump" && activePointers.jump.size === 0) runtime.input.jumpHeld = false;
  }

  function setPressedVisual(button, pressed) {
    button.style.background = pressed
      ? "rgba(59,130,246,0.20)"
      : "rgba(15,23,42,0.10)";
    button.style.transform = pressed ? "scale(0.96)" : "scale(1)";
  }

  function wireHold(button, action) {
    button.addEventListener("pointerdown", (e) => {
      setPressedVisual(button, true);
      press(action, e);
    });
    button.addEventListener("pointerup", (e) => {
      setPressedVisual(button, false);
      release(action, e);
    });
    button.addEventListener("pointercancel", (e) => {
      setPressedVisual(button, false);
      release(action, e);
    });
    button.addEventListener("pointerleave", (e) => {
      setPressedVisual(button, false);
      release(action, e);
    });
  }

  wireHold(leftBtn, "left");
  wireHold(rightBtn, "right");
  wireHold(upBtn, "up");
  wireHold(downBtn, "down");
  wireHold(jumpBtn, "jump");
  attackBtn.addEventListener("pointerdown", (e) => {
    setPressedVisual(attackBtn, true);
    press("attack", e);
  });
  attackBtn.addEventListener("pointerup", () => setPressedVisual(attackBtn, false));
  attackBtn.addEventListener("pointercancel", () => setPressedVisual(attackBtn, false));
  attackBtn.addEventListener("pointerleave", () => setPressedVisual(attackBtn, false));

  rlog("Mobile touch controls enabled (online mode).");
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
    // Track Ctrl for GM mousefly (must be before any early returns)
    if (event.key === "Control") runtime.input.ctrlHeld = true;

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
          if (chatInputEl) chatInputEl.value = "";
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

    // Chat input: Up/Down arrow to recall sent messages
    if (runtime.chat.inputActive && chatInputEl) {
      if (event.code === "ArrowUp") {
        event.preventDefault();
        const sent = runtime.chat.sentHistory;
        if (sent.length === 0) return;
        if (runtime.chat.recallIndex === -1) {
          runtime.chat.recallDraft = chatInputEl.value;
          runtime.chat.recallIndex = sent.length - 1;
        } else if (runtime.chat.recallIndex > 0) {
          runtime.chat.recallIndex--;
        }
        chatInputEl.value = sent[runtime.chat.recallIndex] || "";
        chatInputEl.setSelectionRange(chatInputEl.value.length, chatInputEl.value.length);
        return;
      }
      if (event.code === "ArrowDown") {
        event.preventDefault();
        const sent = runtime.chat.sentHistory;
        if (runtime.chat.recallIndex === -1) return;
        if (runtime.chat.recallIndex < sent.length - 1) {
          runtime.chat.recallIndex++;
          chatInputEl.value = sent[runtime.chat.recallIndex] || "";
        } else {
          runtime.chat.recallIndex = -1;
          chatInputEl.value = runtime.chat.recallDraft;
        }
        chatInputEl.setSelectionRange(chatInputEl.value.length, chatInputEl.value.length);
        return;
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
        setLastEmoteTime(now);
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
    if (event.key === "Control") runtime.input.ctrlHeld = false;

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
    setCurrentInvTab(btn.dataset.tab);
    refreshInvGrid();
  });
}

// Cursor assets loaded after login — see activateWZCursor() below

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

settingsPingToggleEl?.addEventListener("change", () => {
  runtime.settings.showPing = settingsPingToggleEl.checked;
  saveSettings();
  if (pingWindowEl) {
    if (runtime.settings.showPing) { pingWindowEl.classList.remove("hidden"); updatePingHud(); }
    else pingWindowEl.classList.add("hidden");
  }
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

// Download debug logs button
const settingsDownloadLogsBtn = document.getElementById("settings-download-logs");
settingsDownloadLogsBtn?.addEventListener("click", () => {
  const header = [
    `Shlop Debug Log`,
    `Exported: ${new Date().toISOString()}`,
    `UserAgent: ${navigator.userAgent}`,
    `Screen: ${screen.width}x${screen.height} Canvas: ${canvasEl?.width}x${canvasEl?.height}`,
    `Online: ${!!window.__MAPLE_ONLINE__} Connected: ${_wsConnected} Ping: ${_wsPingMs}ms`,
    `Map: ${runtime.mapId || "none"} Player: ${runtime.player?.name || "none"}`,
    `Lines: ${_debugLogBuffer.length}`,
    `${"─".repeat(60)}`,
  ];
  const content = header.join("\n") + "\n" + _debugLogBuffer.join("\n") + "\n";
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shlop-debug-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
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
setupMobileTouchControls();
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

// ── Register fn.* callbacks for cross-module calls (net.js → app.js) ──
Object.assign(fn, {
  // Used by net.js
  addSystemChatMessage, appendChatLogMessage,
  adjustStanceForRemoteWeapon,
  animateDropPickup, createDropFromServer, lootDropLocally,
  drawSetEffect, findActiveSetEffect,
  equipSlotFromId, equipWzCategoryFromId,
  getCharacterActionFrames, getEquipFrameParts,
  getFaceExpressionFrames, getFaceFrameMeta,
  getHairFrameParts, getHeadFrameMeta,
  handleServerMapChange, showDuplicateLoginOverlay,
  loadChairSprite, mergeMapAnchors, pickAnchorName, zOrderForPart,
  playMobSfx, playUISound,
  requestCharacterPartImage, spawnDamageNumber,
  syncServerReactors, wrapBubbleTextToWidth,
  // Used by life.js
  findFootholdAtXNearY, findFootholdBelow,
  loadMap, normalizedRect,
  playSfx, playSfxWithFallback,
  requestServerMapChange, saveCharacter,
  // Used by physics.js
  adjustStanceForWeapon, getCharacterActionFrames, getCharacterFrameData,
  standUpFromChair, triggerPlayerHitVisuals,
  // Used by render.js
  drawSetEffect, findActiveSetEffect, requestCharacterPartImage,
  // Used by character.js
  adjustStanceForWeapon, buildZMapOrder, getCapType, hasOverallEquipped,
  loadPortalMeta, portalFrameCount, portalMetaKey,
  // Used by input.js
  setCursorState, loadMap,
});

// ── Character load / create → first map load ──
(async () => {
  console.log("[boot] Starting game init, online=" + !!window.__MAPLE_ONLINE__);
  console.log("[boot] Build: " + (window.__BUILD_GIT_HASH__ || "dev"));
  console.log("[boot] Session ID: " + (sessionId ? sessionId.slice(0, 8) + "…" : "none"));

  // ── Obtain a valid session via proof-of-work if needed (online only) ──
  if (window.__MAPLE_ONLINE__ && !sessionId) {
    console.log("[boot] No session — performing proof-of-work…");
    setSessionId(await obtainSessionViaPow());
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  let savedCharacter;
  try {
    savedCharacter = await loadCharacter();
    console.log("[boot] loadCharacter result: " + (savedCharacter ? "found" : "null"));
  } catch (e) {
    console.error("[boot] loadCharacter threw:", e);
    savedCharacter = null;
  }

  // If the server rejected our session (expired/invalid), get a new one via PoW
  if (window.__MAPLE_ONLINE__ && !savedCharacter && sessionId) {
    try {
      const checkResp = await fetch("/api/character/claimed", {
        headers: { "Authorization": "Bearer " + sessionId },
      });
      if (checkResp.status === 401) {
        console.log("[boot] Session rejected by server — performing proof-of-work…");
        localStorage.removeItem(SESSION_KEY);
        setSessionId(await obtainSessionViaPow());
        localStorage.setItem(SESSION_KEY, sessionId);
      }
    } catch (err) {
      console.error("[boot] Session check failed (server unreachable):", err);
      // Force re-auth via PoW (which has its own retry UI)
      localStorage.removeItem(SESSION_KEY);
      setSessionId(await obtainSessionViaPow());
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  }

  let startMapId, startPortalName;

  if (savedCharacter) {
    const restored = applyCharacterSave(savedCharacter);
    startMapId = restored.mapId ?? "100000001";
    startPortalName = restored.spawnPortal ?? null;
    rlog("Loaded character from save: " + (savedCharacter.identity?.name || savedCharacter.name || "?"));
    console.log("[boot] Restored character, startMap=" + startMapId);
  } else {
    console.log("[boot] No saved character — showing create overlay");
    // New player — show character creation overlay
    const { name, gender } = await showCharacterCreateOverlay();
    console.log("[boot] Create overlay resolved: name=" + name + " gender=" + gender);
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
    console.log("[boot] New character created & saved");
  }

  // Player is past the login/create screen — activate the WZ cursor
  void loadCursorAssets();

  // In online mode, connect WebSocket BEFORE loading the map.
  // Server is authoritative over map assignment — wait for change_map message.
  if (window.__MAPLE_ONLINE__) {
    console.log("[boot] Online mode — connecting WebSocket…");
    const serverBase = window.__MAPLE_SERVER_URL__ || window.location.origin;
    console.log("[boot] WS target base: " + serverBase);

    // Set up the initial map promise BEFORE connecting so the change_map
    // message (which arrives immediately after auth) is captured even if
    // it arrives before connectWebSocketAsync() resolves.
    setAwaitingInitialMap(true);
    const serverMapPromise = new Promise((resolve) => {
      setInitialMapResolve(resolve);
      // Timeout: if server doesn't respond in 10s, fall back to client save
      setTimeout(() => {
        if (_awaitingInitialMap) {
          setAwaitingInitialMap(false);
          setInitialMapResolve(null);
          console.warn("[boot] Initial change_map timeout (10s) — falling back to startMapId=" + startMapId);
          rlog("Initial change_map timeout — falling back to client startMapId");
          resolve({ map_id: startMapId, spawn_portal: startPortalName });
        }
      }, 10000);
    });

    const wsOk = await connectWebSocketAsync();
    console.log("[boot] connectWebSocketAsync resolved: ok=" + wsOk);
    if (!wsOk) {
      console.warn("[boot] WS auth failed (duplicate login?) — aborting game init");
      setAwaitingInitialMap(false);
      setInitialMapResolve(null);
      return; // blocked by duplicate login overlay
    }

    // Wait for the server's change_map message to know which map to load.
    // The server determines the map from the character's saved location.
    console.log("[boot] Waiting for server change_map message…");
    const serverMap = await serverMapPromise;

    console.log("[boot] Server map received: map=" + serverMap.map_id + " portal=" + serverMap.spawn_portal);
    rlog(`Initial map from server: map=${serverMap.map_id} portal=${serverMap.spawn_portal}`);
    await loadMap(serverMap.map_id, serverMap.spawn_portal || null);
    console.log("[boot] loadMap complete — sending map_loaded");
    // Tell server we finished loading so it adds us to the room
    wsSend({ type: "map_loaded" });
  } else {
    console.log("[boot] Offline mode — loading map " + startMapId);
    // Offline mode: load the map directly from client save
    await loadMap(startMapId, startPortalName);
    console.log("[boot] loadMap complete (offline)");
  }
  console.log("[boot] Game init finished");
})();
