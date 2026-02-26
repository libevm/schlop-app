/**
 * items.js — Equipment management, ground drops, chair system, cursor, UI windows.
 */
import {
  fn, runtime, ctx, canvasEl, pickupJournalEl,
  dlog, rlog, imageCache, iconDataUriCache,
  gameViewWidth, gameViewHeight,
  playerEquipped, playerInventory, groundDrops, draggedItem,
  EQUIP_SLOT_LIST, INV_MAX_SLOTS, INV_TABS,
  equipWindowEl, inventoryWindowEl, keybindsWindowEl,
  DROP_PICKUP_RANGE, DROP_BOB_SPEED, DROP_BOB_AMP, DROP_SPAWN_VSPEED,
  DROP_SPINSTEP, DROP_PHYS_GRAVITY, DROP_PHYS_TERMINAL_VY, LOOT_ANIM_DURATION,
  wzCursor, CURSOR_IDLE, CURSOR_CANCLICK, CURSOR_CLICKING,
  CURSOR_DEFAULT_DELAY, CURSOR_CANCLICK_DELAY,
  _chairSpriteCache,
  _localDropIdCounter, setLocalDropIdCounter, DROP_EXPIRE_MS, DROP_EXPIRE_FADE_MS,
  characterPlacementTemplateCache,
  pingWindowEl, sessionId, settingsModalEl,
} from "./state.js";
import {
  safeNumber, childByName, imgdirLeafRecord, fetchJson,
  getImageByKey, requestImageByKey,
  worldToScreen, isWorldRectVisible, drawWorldImage,
} from "./util.js";
import { wsSend, wsSendEquipChange, _wsConnected, remotePlayers } from "./net.js";
import { findFootholdAtXNearY, findFootholdBelow, findGroundLanding } from "./physics.js";
import { normalizedRect, playerTouchBounds, rectsOverlap } from "./render.js";
import { playUISound, preloadUISounds } from "./sound.js";
import { canvasToDataUrl, canvasToImageBitmap, isRawWzCanvas } from "./wz-canvas-decode.js";

// ── Meso Icon System ──
// C++ parity: MapDrops::init() loads 4 meso icon tiers from Item.wz/Special/0900.img
// Each tier has 4 animated frames. C++ uses Animation objects for meso drops.
// Bronze (<50), Gold (<100), Bundle (<1000), Bag (≥1000)
const MESO_ICON_TIERS = [
  { key: "meso_bronze", id: "09000000", threshold: 50 },
  { key: "meso_gold",   id: "09000001", threshold: 100 },
  { key: "meso_bundle", id: "09000002", threshold: 1000 },
  { key: "meso_bag",    id: "09000003", threshold: Infinity },
];
let _mesoIconsLoaded = false;

/** Map of tier key → array of frame data URIs (for animation) */
const _mesoAnimFrames = new Map(); // key → string[]
/** Map of tier key → array of decoded ImageBitmaps per frame */
const _mesoAnimBitmaps = new Map(); // key → ImageBitmap[]
/** Global meso animation state */
const _mesoAnim = { frameIndex: 0, timer: 0 };
const MESO_ANIM_DELAY_MS = 200; // ms per frame (C++ Animation default)

/** Update meso animation timer — called from updateGroundDrops */
export function updateMesoAnimation(dt) {
  _mesoAnim.timer += dt * 1000;
  if (_mesoAnim.timer >= MESO_ANIM_DELAY_MS) {
    _mesoAnim.timer -= MESO_ANIM_DELAY_MS;
    _mesoAnim.frameIndex = (_mesoAnim.frameIndex + 1) % 4;
  }
}

/** Get the current meso animation frame bitmap for a tier key, or null */
export function getMesoFrameBitmap(tierKey) {
  const bitmaps = _mesoAnimBitmaps.get(tierKey);
  if (!bitmaps || bitmaps.length === 0) return null;
  return bitmaps[_mesoAnim.frameIndex % bitmaps.length] ?? bitmaps[0];
}

/** Preload meso drop icons (all 4 frames per tier) from Item.wz/Special/0900.img.xml */
export async function loadMesoIcons() {
  if (_mesoIconsLoaded) return;
  _mesoIconsLoaded = true;
  try {
    const data = await fetchJson("/resourcesv3/Item.wz/Special/0900.img.xml");
    if (!data?.$$) return;
    for (const tier of MESO_ICON_TIERS) {
      const itemNode = data.$$.find(c => c.$imgdir === tier.id);
      if (!itemNode) continue;
      const iconRaw = itemNode.$$?.find(c => c.$imgdir === "iconRaw");
      if (!iconRaw?.$$) continue;

      const frameUris = [];
      const frameBitmaps = [];
      // Load all frames (0,1,2,3)
      for (let i = 0; i < 4; i++) {
        const frame = iconRaw.$$.find(c => c.$canvas === String(i));
        if (!frame?.basedata) continue;
        const uri = await canvasToDataUrl(frame);
        if (uri) {
          frameUris.push(uri);
          // Decode to ImageBitmap for direct canvas drawing
          try {
            const blob = await fetch(uri).then(r => r.blob());
            const bmp = await createImageBitmap(blob);
            frameBitmaps.push(bmp);
          } catch { frameBitmaps.push(null); }
        }
      }
      _mesoAnimFrames.set(tier.key, frameUris);
      _mesoAnimBitmaps.set(tier.key, frameBitmaps);
      // Also store frame 0 in iconDataUriCache for the inventory meso icon
      if (frameUris.length > 0) {
        iconDataUriCache.set(tier.key, frameUris[0]);
      }
    }
  } catch (e) {
    rlog("Failed to load meso icons:", e);
  }
}

/** Get the appropriate meso icon key for a given meso amount (C++ MesoIcon tier) */
export function mesoIconKey(amount) {
  for (const tier of MESO_ICON_TIERS) {
    if (amount < tier.threshold) return tier.key;
  }
  return "meso_bag";
}

// ── Equip / Unequip system ──

// Load WZ data for an equip item so the character sprite can render it
export async function loadEquipWzData(equipId) {
  const category = fn.equipWzCategoryFromId(equipId);
  if (!category) return;
  const padded = String(equipId).padStart(8, "0");
  const path = `/resourcesv3/Character.wz/${category}/${padded}.img.xml`;
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
export function resolveCashWeaponData(data, cashWeaponId) {
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
export function unequipItem(slotType) {
  const equipped = playerEquipped.get(slotType);
  if (!equipped) return;

  fn.hideTooltip();
  // Cancel any active drag silently — this function plays its own sound
  if (draggedItem.active) fn.cancelItemDrag(true);

  // Remove from equipment
  playerEquipped.delete(slotType);

  // Add to inventory EQUIP tab
  const freeSlot = fn.findFreeSlot("EQUIP");
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
  fn.refreshUIWindows();
  fn.saveCharacter();
  wsSendEquipChange("unequip", slotType, equipped.id);
}

// Equip: move from inventory EQUIP tab → equipment slot → update sprite
export function equipItemFromInventory(invIndex) {
  const item = playerInventory[invIndex];
  if (!item) return;
  if (item.invType !== "EQUIP") return;

  fn.hideTooltip();
  // Cancel any active drag silently — this function plays its own sound
  if (draggedItem.active) fn.cancelItemDrag(true);

  // Derive equip slot from item ID (matching the keys used in playerEquipped).
  // equipSlotFromId is the primary slot resolver (maps to EQUIP_SLOT_LIST types).
  // equipWzCategoryFromId maps to WZ folder names (e.g. "Accessory") — not equip slots.
  const slotType = fn.equipSlotFromId(item.id);
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
  fn.refreshUIWindows();
  fn.saveCharacter();
  wsSendEquipChange("equip", slotType, item.id);
}

export function dropItemOnMap() {
  if (!draggedItem.active) return;
  if (_dropQtyModalOpen) return; // modal already open
  const iconUri = fn.getIconDataUri(draggedItem.iconKey);
  if (!iconUri) { fn.cancelItemDrag(); return; }

  const itemQty = draggedItem.source === "inventory" ? draggedItem.qty : 1;
  const isStackable = fn.isItemStackable(draggedItem.id);

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
export function showDropQuantityModal(maxQty) {
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
  overlay.querySelector("#drop-qty-cancel").addEventListener("click", (e) => { e.stopPropagation(); playUISound("BtMouseClick"); close(); fn.cancelItemDrag(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") { close(); fn.cancelItemDrag(); }
  });
  // Click outside modal panel closes (cancel)
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) { close(); fn.cancelItemDrag(); }
  });
}

/** Execute the actual drop of qty items onto the map. */
export function executeDropOnMap(dropQty) {
  if (!draggedItem.active) return;
  const player = runtime.player;

  // Drop X stays fixed at player position (no horizontal drift).
  // Find the foothold below at drop X for the landing destination.
  const dropX = player.x;
  const startY = player.y - 4;
  const destFh = findFootholdAtXNearY(runtime.map, dropX, player.y, 60)
              || findFootholdBelow(runtime.map, dropX, player.y - 100);
  const destY = destFh ? destFh.y - 4 : player.y - 4;
  const dropRenderLayer = destFh?.line?.layer ?? 7;

  const dropCategory = draggedItem.category;
  const dropIconKey = draggedItem.iconKey;
  const dropName = draggedItem.name;
  const dropItemId = draggedItem.id;
  const localId = _localDropIdCounter;
  setLocalDropIdCounter(_localDropIdCounter - 1);

  groundDrops.push({
    drop_id: localId,
    id: dropItemId,
    name: dropName,
    qty: dropQty,
    iconKey: dropIconKey,
    category: dropCategory,
    x: dropX,
    y: startY,
    destX: dropX,
    destY: destY,
    vx: 0,
    vy: DROP_SPAWN_VSPEED,
    onGround: false,
    opacity: 1.0,
    angle: 0,
    bobPhase: 0,
    renderLayer: dropRenderLayer,
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
  fn.refreshUIWindows();
  fn.saveCharacter();

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

// ── Meso drop ──

let _mesoDropModalOpen = false;

/** Show in-game modal asking how much meso to drop */
export function showMesoDropModal() {
  const currentMeso = runtime.player.meso || 0;
  if (currentMeso <= 0 || _mesoDropModalOpen) return;
  _mesoDropModalOpen = true;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.style.cssText = "z-index:200000;";

  // Build meso icon src from WZ cache
  const mesoUri = iconDataUriCache.get("meso_gold") || iconDataUriCache.get("meso_bronze") || "";
  const iconHtml = mesoUri
    ? `<img src="${mesoUri}" style="width:22px;height:22px;image-rendering:pixelated;vertical-align:middle;margin-right:4px;" />`
    : "";

  overlay.innerHTML = `
    <div class="modal-panel" style="width:260px;">
      <div class="modal-titlebar"><span class="modal-title">Drop Meso</span></div>
      <div class="modal-body" style="padding:12px 16px;">
        <div class="modal-desc" style="margin-bottom:8px;text-align:center;">
          ${iconHtml}How many meso to drop?
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
          <input type="number" class="modal-input" id="meso-drop-input"
            min="1" max="${currentMeso}" value="${currentMeso}"
            style="width:100px;text-align:center;" />
          <span style="color:#777;font-size:11px;">/ ${currentMeso.toLocaleString()}</span>
        </div>
      </div>
      <div class="modal-buttons" style="margin-bottom:8px;">
        <button class="modal-btn modal-btn-ok" id="meso-drop-ok">OK</button>
        <button class="modal-btn modal-btn-cancel" id="meso-drop-cancel">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#meso-drop-input");
  input.focus();
  input.select();

  let closed = false;
  const close = () => { if (closed) return; closed = true; _mesoDropModalOpen = false; overlay.remove(); };

  const confirm = () => {
    let amount = parseInt(input.value, 10);
    if (isNaN(amount) || amount <= 0) { close(); return; }
    amount = Math.min(amount, runtime.player.meso || 0);
    close();
    dropMesoOnMap(amount);
  };

  overlay.querySelector("#meso-drop-ok").addEventListener("click", (e) => { e.stopPropagation(); playUISound("BtMouseClick"); confirm(); });
  overlay.querySelector("#meso-drop-cancel").addEventListener("click", (e) => { e.stopPropagation(); playUISound("BtMouseClick"); close(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirm();
    if (e.key === "Escape") close();
  });
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
}

/** Drop meso on the ground — deduct from balance, create ground drop, notify server */
function dropMesoOnMap(amount) {
  if (amount <= 0) return;
  const player = runtime.player;
  const currentMeso = player.meso || 0;
  if (amount > currentMeso) amount = currentMeso;
  // Don't deduct locally — server is authoritative. Server sends stats_update.

  const dropX = player.x;
  const startY = player.y - 4;
  const destFh = findFootholdAtXNearY(runtime.map, dropX, player.y, 60)
              || findFootholdBelow(runtime.map, dropX, player.y - 100);
  const destY = destFh ? destFh.y - 4 : player.y - 4;
  const dropRenderLayer = destFh?.line?.layer ?? 7;
  const tierKey = mesoIconKey(amount);

  loadMesoIcons();

  const localId = _localDropIdCounter;
  setLocalDropIdCounter(_localDropIdCounter - 1);

  groundDrops.push({
    drop_id: localId,
    id: amount,
    name: `${amount} meso`,
    qty: amount,
    iconKey: tierKey,
    category: "MESO",
    meso: true,
    x: dropX,
    y: startY,
    destX: dropX,
    destY: destY,
    vx: 0,
    vy: DROP_SPAWN_VSPEED,
    onGround: false,
    opacity: 1.0,
    angle: 0,
    bobPhase: 0,
    renderLayer: dropRenderLayer,
    spawnTime: performance.now(),
    pickingUp: false,
    pickupStart: 0,
    expiring: false,
    expireStart: 0,
  });

  playUISound("DropItem");
  fn.refreshUIWindows();
  fn.saveCharacter();

  wsSend({
    type: "drop_meso",
    amount,
    x: dropX,
    startY,
    destY,
  });
}

// ── Chair system ──
// Chairs (SETUP items, prefix 301xxxx) let the player sit. Double-click in inventory
// to use. The chair sprite is drawn at the player's feet. Other players see the chair
// via the player_sit message which includes chair_id.

// (_chairSpriteCache moved to state.js)
const _chairSpriteLoading = new Set();

export async function loadChairSprite(chairId) {
  if (_chairSpriteCache.has(chairId)) return _chairSpriteCache.get(chairId);
  if (_chairSpriteLoading.has(chairId)) return null;
  _chairSpriteLoading.add(chairId);

  try {
    const prefix = String(chairId).padStart(8, "0").slice(0, 4);
    const padded = String(chairId).padStart(8, "0");
    const json = await fetchJson(`/resourcesv3/Item.wz/Install/${prefix}.img.xml`);
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

    const img = await canvasToImageBitmap(frame);

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

export function isChairItem(itemId) {
  return itemId >= 3010000 && itemId < 3020000;
}

export function useChair(itemId) {
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
  fn.saveCharacter();
}

export function standUpFromChair() {
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

export function updateGroundDrops(dt) {
  // Update meso animation (shared across all meso drops)
  updateMesoAnimation(dt);
  const ticks = Math.max(1, Math.round(dt * 60)); // 60 TPS — one tick per frame at 60fps
  for (let i = groundDrops.length - 1; i >= 0; i--) {
    const drop = groundDrops[i];

    if (drop.pickingUp) {
      // C++ PICKEDUP: fly toward looter's *current* position (tracks movement)
      const elapsed = performance.now() - drop.pickupStart;
      const t = Math.min(1, elapsed / LOOT_ANIM_DURATION);
      // Resolve live target position — player may have moved since pickup started
      let tx, ty;
      if (drop._lootTargetId) {
        const rp = remotePlayers.get(drop._lootTargetId);
        if (rp) { tx = rp.renderX; ty = rp.renderY - 40; }
      }
      if (tx === undefined) { tx = runtime.player.x; ty = runtime.player.y - 40; }
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
      // DROPPED state — C++ Drop.cpp: physics.move_object(phobj) each tick.
      // The drop uses NORMAL physics: gravity + hspeed, and lands on whatever
      // foothold it collides with during its arc (not a fixed destY).
      for (let tick = 0; tick < ticks; tick++) {
        const oldX = drop.x;
        const oldY = drop.y;

        // C++ move_normal: gravity when airborne, constant hspeed
        drop.vy += DROP_PHYS_GRAVITY;
        if (drop.vy > DROP_PHYS_TERMINAL_VY) drop.vy = DROP_PHYS_TERMINAL_VY;
        drop.y += drop.vy;
        if (drop.vx) drop.x += drop.vx;

        // C++ spin while airborne: angle += SPINSTEP per tick
        drop.angle += DROP_SPINSTEP;

        // C++ limit_movement: check if movement crosses a foothold (landing).
        // findGroundLanding does segment intersection — only when falling (vy > 0).
        if (drop.vy > 0 && runtime.map) {
          const landing = findGroundLanding(oldX, oldY, drop.x, drop.y, runtime.map);
          if (landing) {
            drop.x = landing.x;
            drop.y = landing.y;
            drop.vx = 0;
            drop.vy = 0;
            drop.onGround = true;
            drop.angle = 0;
            drop.renderLayer = landing.line?.layer ?? drop.renderLayer;
            break;
          }
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

export function drawGroundDrops(layerFilter) {
  const camX = runtime.camera.x;
  const camY = runtime.camera.y;
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;

  for (const drop of groundDrops) {
    // C++ parity: drops draw per-layer (phobj.fhlayer)
    if (layerFilter != null && (drop.renderLayer ?? 7) !== layerFilter) continue;

    // Resolve the image to draw — meso uses animated frames, items use static icons
    let img;
    if (drop.meso) {
      img = getMesoFrameBitmap(drop.iconKey);
      if (!img) continue; // meso icons not loaded yet
    } else {
      const iconUri = fn.getIconDataUri(drop.iconKey);
      if (!iconUri) continue;
      img = _dropIconBitmaps.get(iconUri);
      if (!img) {
        // Decode data URL → ImageBitmap (async, skip this frame)
        if (!_dropIconBitmapPending.has(iconUri)) {
          _dropIconBitmapPending.add(iconUri);
          fetch(iconUri).then(r => r.blob()).then(b => createImageBitmap(b)).then(bmp => {
            _dropIconBitmaps.set(iconUri, bmp);
          }).catch(() => {}).finally(() => _dropIconBitmapPending.delete(iconUri));
        }
        continue;
      }
    }

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

// ImageBitmap cache for drop icons (decoded from icon data URIs)
const _dropIconBitmaps = new Map();
const _dropIconBitmapPending = new Set();

export function tryLootDrop() {
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
      // Meso drops don't need inventory space
      if (!drop.meso) {
        // Pre-check: does the inventory tab have room for this item?
        const dropInvType = fn.inventoryTypeById(drop.id) || "ETC";
        const dropStackable = fn.isItemStackable(drop.id);
        let hasRoom = false;
        if (dropStackable) {
          // Check if existing stacks have space
          for (const entry of playerInventory) {
            if (entry.id === drop.id && entry.invType === dropInvType) {
              const slotMax = fn.getItemSlotMax(drop.id);
              if (entry.qty < slotMax) { hasRoom = true; break; }
            }
          }
        }
        if (!hasRoom) hasRoom = fn.findFreeSlot(dropInvType) !== -1;
        if (!hasRoom) {
          fn.addSystemChatMessage("Your inventory is full. Please make room before picking up more items.");
          return;
        }
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
export function lootDropLocally(drop) {
  drop.pickingUp = true;
  drop.pickupStart = performance.now();
  drop._lootTargetId = null; // null = local player (tracked live each frame)

  // Meso drops: add to meso balance, don't touch inventory
  if (drop.meso) {
    // If server already set the authoritative meso total (online mode),
    // don't double-add — just show the pickup effects.
    if (!drop._mesoHandledByServer) {
      runtime.player.meso = (runtime.player.meso || 0) + drop.qty;
    }
    addPickupJournalEntry(`${drop.qty} meso`, 0);
    playUISound("PickUpItem");
    fn.refreshUIWindows();
    fn.saveCharacter();
    return;
  }

  const invType = fn.inventoryTypeById(drop.id) || "ETC";
  const stackable = fn.isItemStackable(drop.id);
  const slotMax = fn.getItemSlotMax(drop.id);
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
    const freeSlot = fn.findFreeSlot(invType);
    if (freeSlot === -1) {
      rlog(`${invType} tab is full, cannot pick up ${remaining} remaining items`);
      if (remaining === drop.qty) {
        // Nothing was added at all — cancel pickup
        drop.pickingUp = false;
        fn.addSystemChatMessage("Your inventory is full. Please make room before picking up more items.");
        return;
      }
      fn.addSystemChatMessage("Your inventory is full. Some items could not be picked up.");
      break; // partial pickup — some went in, rest lost (tab full)
    }
    const wzCat = fn.equipWzCategoryFromId(drop.id);
    const iconKey = wzCat ? fn.loadEquipIcon(drop.id, wzCat) : fn.loadItemIcon(drop.id);
    const addQty = Math.min(remaining, slotMax);
    playerInventory.push({
      id: drop.id, name: drop.name, qty: addQty, iconKey,
      invType, category: drop.category || null, slot: freeSlot,
    });
    remaining -= addQty;
  }

  // Eagerly load WZ info for slotMax cache (for future stacking)
  if (stackable) fn.loadItemWzInfo(drop.id);

  addPickupJournalEntry(drop.name, drop.qty);
  playUISound("PickUpItem");
  fn.refreshUIWindows();
  fn.saveCharacter();
}

const PICKUP_JOURNAL_FADE_MS = 5000; // entries start fading after 5s
const PICKUP_JOURNAL_FADE_DURATION = 1000; // 1s CSS transition

/** Add a "You picked up..." entry to the pickup journal. */
export function addPickupJournalEntry(itemName, qty) {
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
export function animateDropPickup(dropId, looterId) {
  const drop = groundDrops.find(d => d.drop_id === dropId);
  if (drop && !drop.pickingUp) {
    drop.pickingUp = true;
    drop.pickupStart = performance.now();
    // Store looter ID — position is resolved live each frame in updateGroundDrops
    drop._lootTargetId = looterId || null;
  }
}

/** Create a ground drop from server data (remote spawn or map_state). */
export function createDropFromServer(dropData, animate) {
  // Don't duplicate if already exists
  if (groundDrops.find(d => d.drop_id === dropData.drop_id)) return;

  const isMeso = !!dropData.meso;

  // Preload icon — derive iconKey from item_id if not provided
  let iconKey = dropData.iconKey || "";
  if (isMeso) {
    // Meso drop: use tier-based meso icon
    iconKey = mesoIconKey(dropData.qty || 1);
    loadMesoIcons(); // ensure meso icons are loaded
  } else if (!iconKey && dropData.item_id) {
    const wzCat = fn.equipWzCategoryFromId(dropData.item_id);
    if (wzCat) {
      iconKey = fn.loadEquipIcon(dropData.item_id, wzCat);
    } else {
      iconKey = fn.loadItemIcon(dropData.item_id);
    }
  } else if (iconKey) {
    const existingUri = fn.getIconDataUri(iconKey);
    if (!existingUri) {
      const wzCat = fn.equipWzCategoryFromId(dropData.item_id);
      if (wzCat) { fn.loadEquipIcon(dropData.item_id, wzCat); }
      else { fn.loadItemIcon(dropData.item_id); }
    }
  }
  // Resolve item name from WZ if not provided (skip for meso)
  if (!isMeso && !dropData.name && dropData.item_id) {
    fn.loadItemName(dropData.item_id).then(n => {
      if (n) {
        const existing = groundDrops.find(d => d.drop_id === dropData.drop_id);
        if (existing) existing.name = n;
      }
    });
  }

  // Server already computed destY via findGroundY at the drop's X from mob.y.
  // We trust the server Y but resolve the render layer from the local foothold.
  let destY = dropData.destY;
  let dropRenderLayer = 7;
  if (runtime.map) {
    // Find the foothold closest to destY at this X — just for render layer, not Y override
    const fh = findFootholdAtXNearY(runtime.map, dropData.x, dropData.destY, 10)
            || findFootholdBelow(runtime.map, dropData.x, dropData.destY - 5);
    if (fh) {
      dropRenderLayer = fh.line?.layer ?? 7;
    }
  }

  // C++ parity: drop starts at mob/dropper X, arcs to destination X.
  // hspeed = (dest.x - start.x) / 48  (from Drop.cpp constructor, mode 0/1)
  const startX = dropData.startX ?? dropData.x;
  const hspeed = animate ? (dropData.x - startX) / 48 : 0;

  groundDrops.push({
    drop_id: dropData.drop_id,
    id: dropData.item_id,
    name: isMeso ? `${dropData.qty} meso` : (dropData.name || ""),
    qty: dropData.qty || 1,
    iconKey: iconKey,
    category: dropData.category || null,
    meso: isMeso,
    x: animate ? startX : dropData.x,
    y: animate ? (dropData.startY || destY) : destY,
    destX: dropData.x,
    destY: destY,
    vx: hspeed,
    vy: animate ? DROP_SPAWN_VSPEED : 0,
    onGround: !animate,
    opacity: 1.0,
    angle: 0,
    bobPhase: 0,
    renderLayer: dropRenderLayer,
    spawnTime: performance.now(),
    createdAt: Date.now(), // local timestamp for loot protection timing (avoids clock skew)
    ownerId: dropData.owner_id || "",
    pickingUp: false,
    pickupStart: 0,
    expiring: false,
    expireStart: 0,
  });
}

const statWindowEl = document.getElementById("stat-window");

export function getUIWindowEl(key) {
  if (key === "equip") return equipWindowEl;
  if (key === "inventory") return inventoryWindowEl;
  if (key === "keybinds") return keybindsWindowEl;
  if (key === "settings") return settingsModalEl;
  if (key === "ping") return pingWindowEl;
  if (key === "stat") return statWindowEl;
  return null;
}

export function toggleUIWindow(key) {
  const el = getUIWindowEl(key);
  if (!el) return;
  const isHidden = el.classList.contains("hidden");
  el.classList.toggle("hidden");
  if (isHidden) {
    fn.bringWindowToFront(el);
    playUISound("MenuUp");
    fn.refreshUIWindows();
    if (key === "keybinds") fn.buildKeybindsUI();
  } else {
    playUISound("MenuDown");
  }
}

export function isUIWindowVisible(key) {
  const el = getUIWindowEl(key);
  return el && !el.classList.contains("hidden");
}

// (wzCursor, CURSOR_* constants are now in state.js)

export async function loadCursorAssets() {
  try {
    const basicJson = await fetchJson("/resourcesv3/UI.wz/Basic.img.xml");
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
        // Raw WZ canvas data needs async decode, but cursor loading is fire-and-forget
        if (isRawWzCanvas(fr)) {
          canvasToDataUrl(fr).then(url => { if (url) img.src = url; });
        } else {
          img.src = `data:image/png;base64,${fr.basedata}`;
        }
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

export function setCursorState(state) {
  if (!wzCursor.loaded) return;
  if (wzCursor.state === state) return;
  // Fall back to IDLE if state not available
  if (!wzCursor.states[state]) state = CURSOR_IDLE;
  wzCursor.state = state;
  wzCursor.frameIndex = 0;
  wzCursor.frameTimer = 0;
}

export function updateCursorAnimation(dtMs) {
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

export function updateCursorElement() {
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
    const iconUri = fn.getIconDataUri(draggedItem.iconKey);
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

export function drawWZCursor() {
  // no-op — cursor is now an HTML overlay updated in updateCursorElement()
}

