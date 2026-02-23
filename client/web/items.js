/**
 * items.js — Equipment management, ground drops, chair system, cursor, UI windows.
 */
import {
  fn, runtime, ctx, canvasEl,
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
} from "./state.js";
import {
  safeNumber, childByName, imgdirLeafRecord, fetchJson,
  getImageByKey, requestImageByKey,
  worldToScreen, isWorldRectVisible, drawWorldImage,
} from "./util.js";
import { wsSend, wsSendEquipChange, _wsConnected } from "./net.js";
import { findFootholdAtXNearY, findFootholdBelow } from "./physics.js";
import { normalizedRect, playerTouchBounds, rectsOverlap } from "./render.js";
import { playUISound, preloadUISounds } from "./sound.js";

// ── Equip / Unequip system ──

// Load WZ data for an equip item so the character sprite can render it
export async function loadEquipWzData(equipId) {
  const category = fn.equipWzCategoryFromId(equipId);
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
  wsSendEquipChange();
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
  wsSendEquipChange();
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

export function drawGroundDrops() {
  const camX = runtime.camera.x;
  const camY = runtime.camera.y;
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;

  for (const drop of groundDrops) {
    const iconUri = fn.getIconDataUri(drop.iconKey);
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
  drop._lootTargetX = runtime.player.x;
  drop._lootTargetY = runtime.player.y - 40;

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
export function createDropFromServer(dropData, animate) {
  // Don't duplicate if already exists
  if (groundDrops.find(d => d.drop_id === dropData.drop_id)) return;

  // Preload icon — derive iconKey from item_id if not provided
  let iconKey = dropData.iconKey || "";
  if (!iconKey && dropData.item_id) {
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
  // Resolve item name from WZ if not provided
  if (!dropData.name && dropData.item_id) {
    fn.loadItemName(dropData.item_id).then(n => {
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

export function getUIWindowEl(key) {
  if (key === "equip") return equipWindowEl;
  if (key === "inventory") return inventoryWindowEl;
  if (key === "keybinds") return keybindsWindowEl;
  if (key === "settings") return settingsModalEl;
  if (key === "ping") return pingWindowEl;
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

