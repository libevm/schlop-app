/**
 * save.js — Weapon/item type helpers, icon loading, character save/load,
 * character create/login overlays, inventory UI grid, tooltips, item drag.
 */
import {
  fn, runtime, ctx, canvasEl, sessionId, setSessionId,
  chatBarEl, chatLogEl,
  equipWindowEl, inventoryWindowEl, keybindsWindowEl, equipGridEl, invGridEl,
  uiTooltipEl, openKeybindsBtnEl,
  claimHudButton, claimOverlayEl, claimPasswordInput, claimPasswordConfirm,
  claimErrorEl, claimConfirmBtn, claimCancelBtn,
  authTabLogin, authTabCreate, authLoginView, authCreateView,
  loginNameInput, loginPasswordInput, loginErrorEl, loginSubmitBtn,
  logoutConfirmEl, logoutConfirmYesEl, logoutConfirmNoEl, logoutConfirmTextEl,
  dlog, rlog, imageCache, iconDataUriCache, jsonCache,
  gameViewWidth, gameViewHeight,
  playerEquipped, playerInventory, groundDrops, draggedItem,
  EQUIP_SLOT_LIST, INV_COLS, INV_ROWS, INV_MAX_SLOTS, INV_TABS,
  currentInvTab, setCurrentInvTab,
  SESSION_KEY, CHARACTER_SAVE_KEY, KEYBINDS_STORAGE_KEY,
  newCharacterDefaults, playerFacePath, playerHairPath,
  PORTAL_SPAWN_Y_OFFSET,
  wzCursor,
  _localDropIdCounter, DROP_EXPIRE_MS, DROP_EXPIRE_FADE_MS,
  settingsPingToggleEl,
} from "./state.js";
import {
  safeNumber, loadJsonFromStorage, saveJsonToStorage,
  childByName, imgdirChildren, imgdirLeafRecord,
  resolveNodeByUol, fetchJson,
  requestImageByKey, getImageByKey,
} from "./util.js";
import {
  wsSend, connectWebSocketAsync, _wsConnected, _awaitingInitialMap, remoteEquipData,
  setAwaitingInitialMap, setDuplicateLoginBlocked, setInitialMapResolve,
} from "./net.js";
import { playUISound } from "./sound.js";
import { canvasToDataUrl } from "./wz-canvas-decode.js";
import {
  equipItemFromInventory, unequipItem, loadEquipWzData,
  isChairItem, useChair, getUIWindowEl, updateCursorElement,
} from "./items.js";
import { saveSettings } from "./input.js";

// ── Inventory type / equip category helpers (C++ parity) ──

/** Find the first free slot index (0..INV_MAX_SLOTS-1) for a given tab type. Returns -1 if full. */
export function findFreeSlot(invType) {
  const occupied = new Set();
  for (const it of playerInventory) {
    if (it.invType === invType) occupied.add(it.slot);
  }
  for (let s = 0; s < INV_MAX_SLOTS; s++) {
    if (!occupied.has(s)) return s;
  }
  return -1;
}

export function inventoryTypeById(itemId) {
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
export function getItemSlotMax(itemId) {
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
export function isItemStackable(itemId) {
  return inventoryTypeById(itemId) !== "EQUIP";
}

// WZ folder from equip item ID — maps id prefix to Character.wz subfolder
export function equipWzCategoryFromId(id) {
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
export function equipSlotFromId(id) {
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

export function isWeaponTwoHanded(weaponId) {
  return TWO_HANDED_PREFIXES.has(Math.floor(weaponId / 10000));
}

/**
 * Get the preferred stand/walk stances from weapon WZ info.
 * C++ reads info/stand and info/walk (1 or 2). Falls back to two-handed check.
 */
export function getWeaponStances(weaponId) {
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
export function adjustStanceForWeapon(action) {
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
export function hasOverallEquipped() {
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
export function getCapType() {
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
export function adjustStanceForRemoteWeapon(rp, action) {
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
// (_localDropIdCounter, DROP_EXPIRE_MS, DROP_EXPIRE_FADE_MS moved to state.js)

export function getIconDataUri(key) {
  return iconDataUriCache.get(key) ?? null;
}

export function loadEquipIcon(equipId, category) {
  const padded = String(equipId).padStart(8, "0");
  const key = `equip-icon:${equipId}`;
  if (iconDataUriCache.has(key)) return key;
  iconDataUriCache.set(key, null);
  const path = `/resourcesv3/Character.wz/${category}/${padded}.img.xml`;
  fetchJson(path).then((json) => {
    if (!json?.$$) return;
    const infoNode = json.$$.find(c => c.$imgdir === "info");
    if (!infoNode?.$$) return;
    const iconNode = infoNode.$$.find(c => c.$canvas === "icon" || c.$canvas === "iconRaw");
    if (iconNode?.basedata) {
      canvasToDataUrl(iconNode).then(url => {
        if (url) { iconDataUriCache.set(key, url); refreshUIWindows(); }
      });
    }
  }).catch(() => {});
  return key;
}

export function loadItemIcon(itemId) {
  const key = `item-icon:${itemId}`;
  if (iconDataUriCache.has(key)) return key;
  iconDataUriCache.set(key, null);
  const idStr = String(itemId).padStart(8, "0");
  const prefix = idStr.substring(0, 4);
  let wzPath;
  if (itemId >= 2000000 && itemId < 3000000) {
    wzPath = `/resourcesv3/Item.wz/Consume/${prefix}.img.xml`;
  } else if (itemId >= 3000000 && itemId < 4000000) {
    wzPath = `/resourcesv3/Item.wz/Install/${prefix}.img.xml`;
  } else if (itemId >= 4000000 && itemId < 5000000) {
    wzPath = `/resourcesv3/Item.wz/Etc/${prefix}.img.xml`;
  } else if (itemId >= 5000000 && itemId < 6000000) {
    wzPath = `/resourcesv3/Item.wz/Cash/${prefix}.img.xml`;
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
      canvasToDataUrl(iconNode).then(url => {
        if (url) { iconDataUriCache.set(key, url); refreshUIWindows(); }
      });
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
        canvasToDataUrl(resolved).then(url => {
          if (url) { iconDataUriCache.set(key, url); refreshUIWindows(); }
        });
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
export function resolveItemIconUol(fileJson, uolPath) {
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

export function findStringName(node, targetId) {
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

export async function loadItemName(itemId) {
  const idStr = String(itemId);
  try {
    if (itemId >= 1000000 && itemId < 2000000) {
      const json = await fetchJson("/resourcesv3/String.wz/Eqp.img.xml");
      return findStringName(json, idStr);
    } else if (itemId >= 2000000 && itemId < 3000000) {
      const json = await fetchJson("/resourcesv3/String.wz/Consume.img.xml");
      return findStringName(json, idStr);
    } else if (itemId >= 3000000 && itemId < 4000000) {
      const json = await fetchJson("/resourcesv3/String.wz/Ins.img.xml");
      return findStringName(json, idStr);
    } else if (itemId >= 4000000 && itemId < 5000000) {
      const json = await fetchJson("/resourcesv3/String.wz/Etc.img.xml");
      return findStringName(json, idStr);
    } else if (itemId >= 5000000 && itemId < 6000000) {
      const json = await fetchJson("/resourcesv3/String.wz/Cash.img.xml");
      return findStringName(json, idStr);
    }
  } catch {}
  return null;
}

export function initPlayerEquipment(equips) {
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

export function initPlayerInventory() {
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
export function findClosestSpawnPortal(x, y) {
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
export function buildCharacterSave() {
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
      str: runtime.player.str ?? 12,
      dex: runtime.player.dex ?? 5,
      int: runtime.player.int ?? 4,
      luk: runtime.player.luk ?? 4,
      speed: runtime.player.stats.speed,
      jump: runtime.player.stats.jump,
      meso: runtime.player.meso || 0,
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
    keymap: runtime.keymap || {},
    version: 1,
    saved_at: new Date().toISOString(),
  };
}

/**
 * Apply a CharacterSave to runtime state.
 * Rebuilds equipment + inventory from the save data.
 * Returns { mapId, spawnPortal } for the caller to decide which map to load.
 */
export function applyCharacterSave(save) {
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
  p.str = save.stats.str ?? 12;
  p.dex = save.stats.dex ?? 5;
  p.int = save.stats.int ?? 4;
  p.luk = save.stats.luk ?? 4;
  p.stats.speed = save.stats.speed ?? 100;
  p.stats.jump = save.stats.jump ?? 100;
  p.meso = save.stats.meso ?? 0;
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

  // Load keymap from save data or localStorage
  if (fn.loadKeymap) fn.loadKeymap(save.keymap);

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
export function saveCharacter() {
  try {
    if (window.__MAPLE_ONLINE__) {
      // Server-authoritative: server manages inventory, stats, meso, equipment.
      // Client only sends achievements (JQ quests) for merge.
      if (_wsConnected) {
        const save = buildCharacterSave();
        wsSend({
          type: "save_state",
          achievements: save.achievements,
        });
      }
    } else {
      // Offline mode: save everything locally
      const save = buildCharacterSave();
      const json = JSON.stringify(save);
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
export async function loadCharacter() {
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
export function showDuplicateLoginOverlay() {
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
      await fn.loadMap(serverMap.map_id, serverMap.spawn_portal || null);
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

export function showCharacterCreateOverlay() {
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


export function buildSlotEl(icon, label, qty, tooltipData, clickData) {
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

    // HTML5 drag for dropping items onto keyboard config
    if (clickData.item && clickData.source === "inv") {
      slot.draggable = true;
      slot.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", JSON.stringify({
          item_id: clickData.item.id,
          name: clickData.item.name || "",
          iconKey: clickData.item.iconKey || "",
          qty: clickData.item.qty || 1,
        }));
        e.dataTransfer.effectAllowed = "copy";
      });
    }
  }
  return slot;
}

export function refreshUIWindows() {
  refreshEquipGrid();
  refreshInvGrid();
  updateStatusBar();
  updateStatWindow();
}

function updateStatusBar() {
  const p = runtime.player;
  const el = (id) => document.getElementById(id);
  const sbLevel = el("sb-level");
  const sbJob = el("sb-job");
  const sbHpFill = el("sb-hp-fill");
  const sbHpText = el("sb-hp-text");
  const sbMpFill = el("sb-mp-fill");
  const sbMpText = el("sb-mp-text");
  const sbExpFill = el("sb-exp-fill");
  const sbExpText = el("sb-exp-text");
  if (sbLevel) sbLevel.textContent = `Lv.${p.level}`;
  if (sbJob) sbJob.textContent = p.job;
  if (sbHpFill) sbHpFill.style.width = `${p.maxHp > 0 ? Math.min(100, (p.hp / p.maxHp) * 100) : 0}%`;
  if (sbHpText) sbHpText.textContent = `${p.hp}/${p.maxHp}`;
  if (sbMpFill) sbMpFill.style.width = `${p.maxMp > 0 ? Math.min(100, (p.mp / p.maxMp) * 100) : 0}%`;
  if (sbMpText) sbMpText.textContent = `${p.mp}/${p.maxMp}`;
  if (sbExpFill) sbExpFill.style.width = `${p.maxExp > 0 ? Math.min(100, (p.exp / p.maxExp) * 100) : 0}%`;
  if (sbExpText) sbExpText.textContent = `${p.exp}/${p.maxExp}`;
}

function updateStatWindow() {
  const p = runtime.player;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("stat-name", p.name);
  set("stat-level", p.level);
  set("stat-job", p.job);
  set("stat-fame", "0");
  set("stat-damage", `${Math.floor(p.minDamage)} ~ ${Math.floor(p.maxDamage)}`);
  set("stat-hp", `${p.hp} / ${p.maxHp}`);
  set("stat-mp", `${p.mp} / ${p.maxMp}`);
  set("stat-str", p.str);
  set("stat-dex", p.dex);
  set("stat-int", p.int);
  set("stat-luk", p.luk);
  set("stat-speed", `${p.stats.speed}%`);
  set("stat-jump", `${p.stats.jump}%`);
  set("stat-crit", `${p.critical}%`);
  set("stat-acc", p.accuracy);
}

export function refreshEquipGrid() {
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

export function refreshInvGrid() {
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

  // Update meso display
  const mesoValueEl = document.getElementById("inv-meso-value");
  if (mesoValueEl) {
    mesoValueEl.textContent = formatMeso(runtime.player.meso || 0);
  }
  // Update meso icon from loaded WZ data (gold tier, frame 0)
  const mesoIconEl = document.getElementById("inv-meso-icon");
  if (mesoIconEl) {
    const mesoUri = iconDataUriCache.get("meso_gold") || iconDataUriCache.get("meso_bronze");
    if (mesoUri) {
      mesoIconEl.src = mesoUri;
    }
  }
}

/** Format meso amount with comma separators */
function formatMeso(amount) {
  return amount.toLocaleString();
}

/** Extract equip stats from a WZ equip JSON node's info child */
export function getEquipInfoStats(equipId) {
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

export async function loadItemWzInfo(itemId) {
  if (_itemWzInfoCache[itemId]) return _itemWzInfoCache[itemId];
  const invType = inventoryTypeById(itemId);
  let folder = null;
  if (invType === "USE") folder = "Consume";
  else if (invType === "ETC") folder = "Etc";
  else if (invType === "SETUP") folder = "Install";
  if (!folder) return null;
  const prefix = String(itemId).padStart(8, "0").slice(0, 4);
  const path = `/resourcesv3/Item.wz/${folder}/${prefix}.img.xml`;
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

export async function loadItemDesc(itemId) {
  if (_itemDescCache[itemId] !== undefined) return _itemDescCache[itemId];
  const invType = inventoryTypeById(itemId);
  let file = null;
  if (invType === "USE") file = "Consume.img.xml";
  else if (invType === "ETC") file = "Etc.img.xml";
  else if (invType === "SETUP") file = "Ins.img.xml";
  if (!file) { _itemDescCache[itemId] = null; return null; }
  try {
    const json = await fetchJson(`/resourcesv3/String.wz/${file}`);
    const node = json?.$$?.find(c => c.$imgdir === String(itemId));
    const descChild = node?.$$?.find(c => (c.$string || "") === "desc");
    const desc = descChild?.value || null;
    _itemDescCache[itemId] = desc;
    return desc;
  } catch { _itemDescCache[itemId] = null; return null; }
}

export function showTooltip(e, data) {
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

export function moveTooltip(e) {
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

export function hideTooltip() {
  if (uiTooltipEl) uiTooltipEl.classList.add("hidden");
}

// ── Item selection / drag ──
export function startItemDrag(source, index, item) {
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

export function cancelItemDrag(silent) {
  if (!draggedItem.active) return;
  draggedItem.active = false;
  if (!silent) playUISound("DragEnd");
  refreshUIWindows();
}

// ── UI Sounds ──
/** Load WZ UI backgrounds and close button sprites */
// ── Dragging & window focus ──
let _dragWin = null;
let _dragOffX = 0;
let _dragOffY = 0;
let _winZCounter = 25; // base z-index for game windows

export function bringWindowToFront(winEl) {
  if (!winEl) return;
  _winZCounter += 1;
  winEl.style.zIndex = _winZCounter;
}

export function initUIWindowDrag() {
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

