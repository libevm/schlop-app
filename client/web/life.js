/**
 * life.js — Life system: mob/NPC sprites, NPC scripts & dialogue, reactors,
 * spatial indexing, map data parsing, backgrounds/tiles/objects/portals,
 * damage numbers, mob combat & AI, mob physics.
 */
import {
  fn, runtime, ctx, canvasEl, sessionId,
  dlog, rlog, cachedFetch, jsonCache, metaCache, metaPromiseCache, imageCache, imagePromiseCache,
  soundDataUriCache, soundDataPromiseCache, iconDataUriCache,
  gameViewWidth, gameViewHeight,
  playerEquipped, playerInventory, groundDrops,
  DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, BG_REFERENCE_HEIGHT,
  SPATIAL_BUCKET_SIZE, SPATIAL_QUERY_MARGIN,
  PHYS_TPS, PLAYER_TOUCH_HITBOX_HEIGHT, PLAYER_TOUCH_HITBOX_HALF_WIDTH,
  PLAYER_TOUCH_HITBOX_PRONE_HEIGHT, PLAYER_TOUCH_HITBOX_PRONE_HALF_WIDTH,
  TRAP_HIT_INVINCIBILITY_MS, PLAYER_KB_HSPEED, PLAYER_KB_VFORCE,
  MOB_KB_FORCE_GROUND, MOB_KB_FORCE_AIR, MOB_KB_COUNTER_START, MOB_KB_COUNTER_END,
  PLAYER_HIT_FACE_DURATION_MS, FALL_DAMAGE_THRESHOLD, FALL_DAMAGE_PERCENT,
  HIDDEN_PORTAL_REVEAL_DELAY_MS, HIDDEN_PORTAL_FADE_IN_MS,
  PORTAL_SPAWN_Y_OFFSET, PORTAL_FADE_OUT_MS, PORTAL_FADE_IN_MS,
  PORTAL_SCROLL_MIN_MS, PORTAL_SCROLL_MAX_MS, PORTAL_SCROLL_SPEED_PX_PER_SEC,
  PORTAL_ANIMATION_FRAME_MS,
  CHAT_BUBBLE_LINE_HEIGHT, CHAT_BUBBLE_HORIZONTAL_PADDING,
  CHAT_BUBBLE_VERTICAL_PADDING, CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER,
  ATTACK_COOLDOWN_MS, ATTACK_RANGE_X, ATTACK_RANGE_Y,
  MOB_HIT_DURATION_MS, MOB_AGGRO_DURATION_MS, MOB_KB_SPEED, MOB_RESPAWN_DELAY_MS,
  MOB_HP_BAR_WIDTH, MOB_HP_BAR_HEIGHT,
  MOB_GRAVFORCE, MOB_SWIMGRAVFORCE, MOB_FRICTION, MOB_SLOPEFACTOR,
  MOB_GROUNDSLIP, MOB_SWIMFRICTION, MOB_PHYS_TIMESTEP,
  MOB_STAND_MIN_MS, MOB_STAND_MAX_MS, MOB_MOVE_MIN_MS, MOB_MOVE_MAX_MS,
  DROP_PICKUP_RANGE, cameraHeightBias, objectAnimStates,
  lifeAnimations, lifeRuntimeState, reactorRuntimeState,
  MAP_ID_REDIRECTS, newCharacterDefaults,
  EQUIP_SLOT_LIST, INV_MAX_SLOTS,
} from "./state.js";
import {
  safeNumber, childByName, imgdirChildren, imgdirLeafRecord,
  pickCanvasNode, canvasMetaFromNode, objectMetaExtrasFromNode, applyObjectMetaExtras,
  findNodeByPath, resolveNodeByUol, randomRange,
  mapPathFromId, soundPathFromName,
  fetchJson, getMetaByKey, requestMeta, requestImageByKey, getImageByKey,
  wrapText, roundRect,
  worldToScreen, isWorldRectVisible, drawWorldImage, drawScreenImage,
  localPoint, topLeftFromAnchor, worldPointFromTopLeft,
} from "./util.js";
import { wsSend, _wsConnected, _isMobAuthority } from "./net.js";

// ─── Life (Mob/NPC) Sprite System ─────────────────────────────────────────────
// (lifeAnimations moved to state.js)
export const lifeAnimationPromises = new Map();

/**
 * Load mob/NPC sprite data from WZ JSON.
 * Returns { stances: { [stanceName]: { frames: [{ key, width, height, originX, originY, delay }] } }, name }
 */
export async function loadLifeAnimation(type, id) {
  const cacheKey = `${type}:${id}`;
  if (lifeAnimations.has(cacheKey)) return lifeAnimations.get(cacheKey);
  if (lifeAnimationPromises.has(cacheKey)) return lifeAnimationPromises.get(cacheKey);

  const paddedId = id.replace(/^0+/, "").padStart(7, "0");
  const wzDir = type === "m" ? "Mob.wz" : "Npc.wz";
  const path = `/resourcesv2/${wzDir}/${paddedId}.img.json`;

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
          const linkPath = `/resourcesv2/${wzDir}/${linkId}.img.json`;
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
        const stringData = await fetchJson(`/resourcesv2/String.wz/${stringFile}`);
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
// (lifeRuntimeState moved to state.js)

// (Mob physics/behavior/UI constants are now in state.js)
export const MOB_TPS = 125;
export const MOB_HSPEED_DEADZONE = 0.1;
export const MOB_DEFAULT_HP = 100;
export const MOB_HP_SHOW_MS = 3000;

// ─── Damage Numbers (from C++ DamageNumber.cpp) ──────────────────────────────
export const DMG_NUMBER_VSPEED = -0.25;         // px/tick rise speed
export const DMG_NUMBER_FADE_TIME = 1500;       // ms total fade
export const DMG_NUMBER_ROW_HEIGHT_NORMAL = 30;
export const DMG_NUMBER_ROW_HEIGHT_CRIT = 36;
export const DMG_DIGIT_ADVANCES = [24, 20, 22, 22, 24, 23, 24, 22, 24, 24];

// ─── Combat / Attack ──────────────────────────────────────────────────────────
// (ATTACK_COOLDOWN_MS, ATTACK_RANGE_X/Y are now in state.js)
export const WEAPON_MULTIPLIER = 4.0;    // 1H Sword
export const DEFAULT_MASTERY = 0.2;
export const DEFAULT_CRITICAL = 0.05;
export const DEFAULT_ACCURACY = 10;
export const DEFAULT_WATK = 15;
export const SWORD_1H_ATTACK_STANCES = ["stabO1", "stabO2", "swingO1", "swingO2", "swingO3"];

// ─── Attack stances per weapon attack type (C++ CharLook::getattackstance) ───
// Attack type is read from weapon WZ info/attack ($short).
// Index: 0=NONE, 1=S1A1M1D (1H), 2=SPEAR, 3=BOW, 4=CROSSBOW, 5=S2A2M2 (2H), 6=WAND, 7=CLAW, 8=KNUCKLE, 9=GUN
export const ATTACK_STANCES_BY_TYPE = [
  /* 0: NONE */     [],
  /* 1: S1A1M1D */  ["stabO1", "stabO2", "swingO1", "swingO2", "swingO3"],
  /* 2: SPEAR */    ["stabT1", "swingP1"],
  /* 3: BOW */      ["shoot1"],
  /* 4: CROSSBOW */ ["shoot2"],
  /* 5: S2A2M2 */   ["stabO1", "stabO2", "swingT1", "swingT2", "swingT3"],
  /* 6: WAND */     ["swingO1", "swingO2"],
  /* 7: CLAW */     ["swingO1", "swingO2"],
  /* 8: KNUCKLE */  ["swingO1", "swingO2"],
  /* 9: GUN */      ["shot"],
];

// Degenerate (prone) stances per weapon attack type
export const DEGEN_STANCES_BY_TYPE = [
  /* 0: NONE */     [],
  /* 1: S1A1M1D */  [],
  /* 2: SPEAR */    [],
  /* 3: BOW */      ["swingT1", "swingT3"],
  /* 4: CROSSBOW */ ["swingT1", "stabT1"],
  /* 5: S2A2M2 */   [],
  /* 6: WAND */     [],
  /* 7: CLAW */     ["swingT1", "stabT1"],
  /* 8: KNUCKLE */  [],
  /* 9: GUN */      ["swingP1", "stabT2"],
];

// Weapon sound effect keys per weapon type prefix (C++ WeaponData::get_usesound via sfx)
export const WEAPON_SFX_BY_PREFIX = {
  130: "swordL",    // 1H Sword
  131: "swordL",    // 1H Axe
  132: "mace",      // 1H Mace
  133: "swordL",    // Dagger
  137: "mace",      // Wand
  138: "mace",      // Staff
  140: "swordL",    // 2H Sword
  141: "swordS",    // 2H Axe
  142: "mace",      // 2H Mace
  143: "spear",     // Spear
  144: "poleArm",   // Polearm
  145: "bow",       // Bow
  146: "cBow",      // Crossbow
  147: "tGlove",    // Claw
  148: "knuckle",   // Knuckle
  149: "gun",       // Gun
};

/**
 * Get the attack type from the currently equipped weapon's WZ info.
 * Returns the attack index (1-9) or 1 (1H default) if no weapon / no data.
 */
export function getWeaponAttackType() {
  const weapon = playerEquipped.get("Weapon");
  if (!weapon) return 1; // default to 1H
  const wzData = runtime.characterEquipData[weapon.id];
  if (!wzData) return 1;
  const info = wzData.$$?.find(c => c.$imgdir === "info");
  if (!info) return 1;
  for (const c of info.$$ || []) {
    if (c.$short === "attack" || c.$int === "attack") return Number(c.value) || 1;
  }
  return 1;
}

/**
 * Get the attack stances for the current weapon (C++ CharLook::getattackstance).
 * @param {boolean} degenerate - true when prone (uses degen stances for ranged)
 * @returns {string[]} Array of possible attack stance names
 */
export function getWeaponAttackStances(degenerate) {
  const attackType = getWeaponAttackType();
  const stances = degenerate
    ? (DEGEN_STANCES_BY_TYPE[attackType] || [])
    : (ATTACK_STANCES_BY_TYPE[attackType] || []);
  // Filter to stances that actually have frames in body data
  const available = stances.filter(s => fn.getCharacterActionFrames(s).length > 0);
  if (available.length > 0) return available;
  // Fallback: try the non-degenerate stances
  if (degenerate) {
    const fallback = (ATTACK_STANCES_BY_TYPE[attackType] || []).filter(s => fn.getCharacterActionFrames(s).length > 0);
    if (fallback.length > 0) return fallback;
  }
  // Ultimate fallback: 1H stances
  return SWORD_1H_ATTACK_STANCES.filter(s => fn.getCharacterActionFrames(s).length > 0);
}

/**
 * Get the weapon sound effect key for the current weapon.
 */
export function getWeaponSfxKey() {
  const weapon = playerEquipped.get("Weapon");
  if (!weapon) return "swordL";
  // Try reading sfx from WZ info
  const wzData = runtime.characterEquipData[weapon.id];
  if (wzData) {
    const info = wzData.$$?.find(c => c.$imgdir === "info");
    if (info) {
      for (const c of info.$$ || []) {
        if (c.$string === "sfx") return String(c.value || "swordL");
      }
    }
  }
  // Fallback: derive from weapon type prefix
  const prefix = Math.floor(weapon.id / 10000);
  return WEAPON_SFX_BY_PREFIX[prefix] || "swordL";
}

// ─── Projectile / Ammo Detection (C++ Inventory::has_projectile) ─────────
// Ranged weapons require ammo in the USE tab to fire normally.
// Without ammo, the attack is "degenerate" (melee swing, 1/10 damage).
// Weapon prefix → set of valid ammo item ID prefixes (id / 10000)
const WEAPON_AMMO_PREFIXES = {
  145: [206],        // Bow → Arrows for Bow (2060xxx) & Crossbow (2061xxx)
  146: [206],        // Crossbow → Arrows (2060xxx, 2061xxx)
  147: [207],        // Claw → Throwing Stars (2070xxx)
  149: [233],        // Gun → Bullets (2330xxx)
};

/**
 * Check if the player has projectile ammo in their USE inventory.
 * C++ Inventory::has_projectile — checks bulletslot > 0.
 * We check if any USE item matches the required ammo prefix for the weapon.
 */
export function hasProjectileAmmo() {
  const weapon = playerEquipped.get("Weapon");
  if (!weapon) return true; // no weapon = not ranged
  const weaponPrefix = Math.floor(weapon.id / 10000);
  const ammoPrefixes = WEAPON_AMMO_PREFIXES[weaponPrefix];
  if (!ammoPrefixes) return true; // weapon doesn't need ammo
  // Search USE inventory for matching ammo
  for (const item of playerInventory) {
    if (item.invType !== "USE") continue;
    const itemPrefix = Math.floor(item.id / 10000);
    if (ammoPrefixes.includes(itemPrefix)) return true;
  }
  return false;
}

// Note: In C++, degenerate attack only applies when prone (proneStab).
// Ranged weapons without ammo are BLOCKED entirely (RegularAttack::can_use → FBR_BULLETCOST).
// Wand/Staff degenerate is for skills only (not regular attack).
// So isAttackDegenerate is no longer needed — prone check is inlined in performAttack.

export const damageNumbers = []; // { x, y, vspeed, value, critical, opacity, miss }

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

export async function loadDamageNumberSprites() {
  if (dmgDigitsLoaded) return;
  try {
    const json = await fetchJson("/resourcesv2/Effect.wz/BasicEff.img.json");
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
    dlog("warn", "[dmg-sprites] Failed to load BasicEff digit sprites: " + (e.message || e));
  }
}

// NPC interaction — click any visible NPC to open dialogue (no range limit)

// ─── Built-in NPC Scripts ─────────────────────────────────────────────────────
// Server-side NPC scripts are not available, so common NPCs get hardcoded dialogue
// with selectable options. Script IDs come from Npc.wz info/script nodes.

export const VICTORIA_TOWNS = [
  { label: "Henesys", mapId: 100000000 },
  { label: "Ellinia", mapId: 101000000 },
  { label: "Perion", mapId: 102000000 },
  { label: "Kerning City", mapId: 103000000 },
  { label: "Lith Harbor", mapId: 104000000 },
  { label: "Sleepywood", mapId: 105040300 },
  { label: "Nautilus Harbor", mapId: 120000000 },
];

export const ALL_MAJOR_TOWNS = [
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

export const NPC_SCRIPTS = {
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
  // Jump quest treasure chests
  subway_get1: { greeting: "Congratulations! You've made it through the construction site! Open the chest to claim your reward.", jqReward: true },
  subway_get2: { greeting: "Incredible! You've conquered the deeper levels of the construction site! Open the chest to claim your reward.", jqReward: true },
  subway_get3: { greeting: "Amazing! You've braved the deepest depths of the construction site! Open the chest to claim your reward.", jqReward: true },
  // Forest of Patience JQ reward NPCs
  viola_pink: { greeting: "Oh! You found me all the way up here! These pink flowers are for John. Please, take this basket as a thank-you for your incredible climb!", jqReward: true, requirePlatform: true },
  viola_blue: { greeting: "Amazing! You made it through those treacherous vines! John will be so happy. Here — take this present as a reward for your perseverance!", jqReward: true, requirePlatform: true },
  bush1: { greeting: "Incredible! You've made it to the very top! These flowers have been waiting for someone as determined as you. Take this reward — you've earned it!", jqReward: true, requirePlatform: true, proximityRange: 500 },
  // Breath of Lava JQ reward NPC (Lira)
  Zakum02: { greeting: "Incredible... you survived the Breath of Lava! Few have ever made it this far. You've truly earned this reward — take it with pride!", jqReward: true, requirePlatform: true, proximityRange: 500 },
  // Jump quest exit NPCs
  subway_out: { greeting: "Had enough? I can send you back if you'd like.", destinations: [{ label: "Back to Mushroom Park", mapId: 100000001 }] },
  flower_out: { greeting: "This obstacle course is no joke. Need a way out?", destinations: [{ label: "Back to Mushroom Park", mapId: 100000001 }] },
  herb_out: { greeting: "Want to head back?", destinations: [{ label: "Back to Mushroom Park", mapId: 100000001 }] },
  Zakum06: { greeting: "This place is dangerous. I can get you out of here.", destinations: [{ label: "Back to Mushroom Park", mapId: 100000001 }] },
  // Leaderboard NPC
  jq_leaderboard: { leaderboard: true },
};

// ─── Leaderboard fetch + display ─────────────────────────────────────

export const JQ_DISPLAY_NAMES = [
  "Shumi's Lost Coin", "Shumi's Lost Bundle of Money", "Shumi's Lost Sack of Money",
  "John's Pink Flower Basket", "John's Present", "John's Last Present",
  "The Forest of Patience", "Breath of Lava",
];

export async function fetchJqLeaderboard() {
  try {
    const resp = await fetch("/api/leaderboard");
    const body = await resp.json();
    if (!body.ok || !body.leaderboards) {
      replaceDialogueWithLeaderboard(null);
      return;
    }
    replaceDialogueWithLeaderboard(body.leaderboards);
  } catch {
    replaceDialogueWithLeaderboard(null);
  }
}

export function replaceDialogueWithLeaderboard(leaderboards) {
  if (!runtime.npcDialogue.active) return;
  const lines = [];

  if (!leaderboards || Object.keys(leaderboards).length === 0) {
    lines.push("No jump quest completions recorded yet. Be the first to conquer a challenge!");
    runtime.npcDialogue.lines = lines;
    runtime.npcDialogue.lineIndex = 0;
    return;
  }

  // Build one page per quest that has entries, top 5 each
  for (const questName of JQ_DISPLAY_NAMES) {
    const entries = leaderboards[questName];
    if (!entries || entries.length === 0) continue;
    const top5 = entries.slice(0, 5);
    let text = `◆ ${questName}\n\n`;
    for (let i = 0; i < top5.length; i++) {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
      text += `${medal}  ${top5[i].name}  —  ${top5[i].completions} clear${top5[i].completions !== 1 ? "s" : ""}\n`;
    }
    lines.push(text.trimEnd());
  }

  if (lines.length === 0) {
    lines.push("No jump quest completions recorded yet. Be the first to conquer a challenge!");
  }

  runtime.npcDialogue.lines = lines;
  runtime.npcDialogue.lineIndex = 0;
}

// ─── NPC Ambient Chat Bubbles ────────────────────────────────────────

export const NPC_AMBIENT_MESSAGES = {
  "1012101": [ // Maya — JQ challenge NPC
    "Think you've got what it takes? Try a Jump Quest!",
    "The bravest adventurers test themselves in the Jump Quests...",
    "Shumi lost his valuables again... someone should help!",
    "Cough... cough... I've seen many try, but few succeed...",
    "The construction site in Kerning City hides great treasures!",
    "Old man John's garden is full of surprises... and danger.",
    "Have you braved the Breath of Lava? Only legends survive it.",
    "The Forest of Patience... it's called that for a reason.",
    "I hear there's a rare Zakum Helmet waiting at the end of the lava...",
    "Jump Quests reward the persistent. Are you up for it?",
    "Many adventurers have come and gone... will you be different?",
    "The deeper you go in Kerning's construction site, the better the loot!",
    "John's flowers are beautiful, but the climb is treacherous...",
    "Come talk to me if you're looking for a real challenge!",
  ],
  "9040011": [ // Leaderboard — Bulletin Board
    "Check the leaderboard! Who's the top Jump Quest champion?",
    "Click me to see who conquered the most Jump Quests!",
    "New records are being set every day. Are you on the board?",
    "The leaderboard awaits! See how you stack up against others.",
    "Who holds the record for Breath of Lava? Find out here!",
    "Shumi's construction site has claimed many... see who survived!",
    "Think you're the best? The leaderboard tells the truth.",
    "Legends are written here. Click to see the top adventurers!",
    "Jump Quest champions are immortalized on this board!",
    "The top 5 for each quest... is your name there?",
    "Every completion counts. Check your ranking!",
    "Forest of Patience? More like Forest of Champions. See them here!",
  ],
};

/** Per-NPC-ID ambient bubble state: { text, expiresAt, nextAt } */
export const _npcAmbientBubbles = new Map();
export const NPC_AMBIENT_INTERVAL_MIN = 6000;  // 6s min between bubbles
export const NPC_AMBIENT_INTERVAL_MAX = 14000; // 14s max
export const NPC_AMBIENT_DURATION = 4500;      // bubble visible for 4.5s

export function updateNpcAmbientBubbles(now) {
  for (const [idx, state] of lifeRuntimeState) {
    const life = runtime.map?.lifeEntries?.[idx];
    if (!life || life.type !== "n") continue;
    const messages = NPC_AMBIENT_MESSAGES[life.id];
    if (!messages || messages.length === 0) continue;

    let bubble = _npcAmbientBubbles.get(idx);
    if (!bubble) {
      // Initialize with a random first delay
      bubble = { text: "", expiresAt: 0, nextAt: now + Math.random() * NPC_AMBIENT_INTERVAL_MAX };
      _npcAmbientBubbles.set(idx, bubble);
    }

    if (now >= bubble.nextAt && now >= bubble.expiresAt) {
      // Pick a random message
      bubble.text = messages[Math.floor(Math.random() * messages.length)];
      bubble.expiresAt = now + NPC_AMBIENT_DURATION;
      bubble.nextAt = bubble.expiresAt + NPC_AMBIENT_INTERVAL_MIN + Math.random() * (NPC_AMBIENT_INTERVAL_MAX - NPC_AMBIENT_INTERVAL_MIN);
    }
  }
}

/**
 * Trigger a map transition from an NPC dialogue action.
 * Online: sends npc_warp { npc_id, map_id } to server (server validates NPC + destination).
 * Offline: loads map directly.
 */
export async function runNpcMapTransition(npcId, mapId) {
  const targetMapId = String(mapId);
  rlog(`npcMapTransition START → npc=${npcId} map=${targetMapId} online=${_wsConnected}`);
  runtime.portalWarpInProgress = true;

  await fadeScreenTo(1, PORTAL_FADE_OUT_MS);
  runtime.transition.alpha = 0;
  runtime.transition.active = false;

  try {
    if (_wsConnected) {
      // Online: server validates NPC is on current map + destination is allowed
      const result = await fn.requestServerMapChange({ type: "npc_warp", npc_id: npcId, map_id: targetMapId });
      await fn.loadMap(result.map_id, result.spawn_portal || null, !!result.spawn_portal);
      fn.saveCharacter();
      wsSend({ type: "map_loaded" });
    } else {
      // Offline: direct load
      await fn.loadMap(targetMapId, null, false);
      fn.saveCharacter();
    }
  } catch (err) {
    rlog(`npcMapTransition ERROR: ${err?.message ?? err}`);
    rlog(`Travel failed: ${err?.message ?? err}`);
  } finally {
    runtime.portalWarpInProgress = false;
    runtime.transition.alpha = 1;
    runtime.transition.active = true;
    await fadeScreenTo(0, PORTAL_FADE_IN_MS);
    rlog(`npcMapTransition COMPLETE`);
  }
}

/**
 * Request a JQ treasure chest reward from the server.
 * Server rolls a 50/50 equip/cash item, adds to inventory, increments achievement, warps home.
 */
export async function requestJqReward() {
  if (!_wsConnected) {
    // Offline fallback — just warp home
    await fadeScreenTo(1, PORTAL_FADE_OUT_MS);
    runtime.transition.alpha = 0;
    runtime.transition.active = false;
    try { await fn.loadMap("100000001", null, false); fn.saveCharacter(); }
    catch (e) { rlog(`JQ reward offline error: ${e}`); }
    finally {
      runtime.portalWarpInProgress = false;
      runtime.transition.alpha = 1;
      runtime.transition.active = true;
      await fadeScreenTo(0, PORTAL_FADE_IN_MS);
    }
    return;
  }
  // Online — server handles reward + warp
  rlog(`[JQ] Sending jq_reward request, mapId=${runtime.mapId}, wsConnected=${_wsConnected}`);
  wsSend({ type: "jq_reward" });
  // Response handled in WS message handler (jq_reward → chat msg + change_map follows)
}

/**
 * Build dialogue lines from an NPC script definition.
 * npcId is the NPC's WZ ID (e.g. "1012000"), sent to server for validation.
 */
export function buildScriptDialogue(scriptDef, npcId, npcWorldX, npcWorldY) {
  const lines = [];
  // Leaderboard NPC: show async fetch loading, then replace with data
  if (scriptDef.leaderboard) {
    lines.push("Loading leaderboard data...");
    // Kick off async fetch — will replace dialogue lines when ready
    fetchJqLeaderboard();
    return lines;
  }
  // JQ reward NPC: check platform proximity first if required
  if (scriptDef.jqReward) {
    // Client-side proximity check (server validates authoritatively too)
    if (scriptDef.requirePlatform && typeof npcWorldY === "number") {
      const dx = runtime.player.x - (typeof npcWorldX === "number" ? npcWorldX : runtime.player.x);
      const dy = runtime.player.y - npcWorldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const range = scriptDef.proximityRange || 200;
      if (dist > range) {
        const PROXIMITY_PHRASES = [
          "Come closer... I can barely see you from way over there!",
          "Hey! You need to come up here if you want your reward!",
          "Come closer... the flowers won't bite, I promise!",
          "You'll have to climb up to me if you want what I have!",
          "Come closer... I can't reach you from all the way down there!",
          "Almost there! Just a little closer and the reward is yours!",
        ];
        lines.push(PROXIMITY_PHRASES[Math.floor(Math.random() * PROXIMITY_PHRASES.length)]);
        return lines;
      }
    }
    lines.push({
      text: scriptDef.greeting,
      options: [{
        label: scriptDef.requirePlatform ? "Claim Reward" : "Open Chest",
        action: () => {
          closeNpcDialogue();
          requestJqReward();
        },
      }],
    });
    return lines;
  }
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
export function buildFallbackScriptDialogue(npcName, npcId, flavourLines) {
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


/** Get Y on a foothold at X, or null if X is outside range or foothold is a wall. */
export function fhGroundAt(fh, x) {
  if (!fh) return null;
  const dx = fh.x2 - fh.x1;
  if (Math.abs(dx) < 0.01) return null;
  const t = (x - fh.x1) / dx;
  if (t < -0.01 || t > 1.01) return null;
  return fh.y1 + (fh.y2 - fh.y1) * t;
}

export function fhSlope(fh) {
  if (!fh) return 0;
  const dx = fh.x2 - fh.x1;
  if (Math.abs(dx) < 0.01) return 0;
  return (fh.y2 - fh.y1) / dx;
}

export function fhLeft(fh) { return Math.min(fh.x1, fh.x2); }
export function fhRight(fh) { return Math.max(fh.x1, fh.x2); }
export function fhIsWall(fh) { return Math.abs(fh.x2 - fh.x1) < 0.01; }

/** Find the foothold directly below (x, y) — closest ground at or below y. */
export function fhIdBelow(map, x, y) {
  const result = fn.findFootholdBelow(map, x, y);
  return result ? result.line : null;
}

/** Get the edge limit for TURNATEDGES — returns the X limit. */
export function fhEdge(map, fhId, goingLeft) {
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
export function fhWall(map, fhId, goingLeft, fy) {
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
export function mobNextMove(state, anim) {
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
export function mobPhysicsUpdate(map, phobj, isSwimMap, dtSec) {
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

export function initLifeRuntimeStates() {
  lifeRuntimeState.clear();
  _npcAmbientBubbles.clear();
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
      const found = fn.findFootholdAtXNearY(map, life.x, life.cy, 60);
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

export function updateLifeAnimations(dtMs) {
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

export function drawLifeSprites(filterLayer, lifeEntriesForLayer = null) {
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

    // Draw ambient chat bubble above NPC
    if (life.type === "n") {
      const bubble = _npcAmbientBubbles.get(idx);
      if (bubble && bubble.text && performance.now() < bubble.expiresAt) {
        drawNpcAmbientBubble(screenX, screenY - frame.originY, bubble.text, bubble.expiresAt);
      }
    }
  }
}

export function drawNpcAmbientBubble(screenX, topY, text, expiresAt) {
  const now = performance.now();
  const remaining = expiresAt - now;

  // Fade in during first 300ms, fade out during last 600ms
  let alpha = 1;
  const age = NPC_AMBIENT_DURATION - remaining;
  if (age < 300) alpha = age / 300;
  else if (remaining < 600) alpha = remaining / 600;
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '11px "Dotum", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  // Wrap text to max width
  const maxW = 140;
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  const lineH = 14;
  const padX = 8, padY = 6;
  const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = Math.ceil(widest) + padX * 2;
  const boxH = lines.length * lineH + padY * 2;
  const boxX = Math.round(screenX - boxW / 2);
  const boxY = Math.round(topY - boxH - 12);

  // Bubble background
  roundRect(ctx, boxX, boxY, boxW, boxH, 5);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(80, 100, 140, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tail
  const tailX = screenX;
  ctx.beginPath();
  ctx.moveTo(tailX - 4, boxY + boxH);
  ctx.lineTo(tailX + 4, boxY + boxH);
  ctx.lineTo(tailX, boxY + boxH + 5);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fill();

  // Text
  ctx.fillStyle = "#2a2a3e";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], boxX + padX, boxY + padY + i * lineH + lineH / 2);
  }

  ctx.restore();
}

// ─── Damage Numbers ──────────────────────────────────────────────────────────

/**
 * Spawn a damage number. Matches C++ DamageNumber constructor:
 * - moveobj.vspeed = -0.25
 * - opacity starts at 1.5 (stays at full alpha beyond 1.0, then fades)
 */
export function spawnDamageNumber(worldX, worldY, value, critical) {
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
export function updateDamageNumbers(dt) {
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
export function dmgGetAdvance(digitIndex, isCritical, isFirst) {
  const base = DMG_DIGIT_ADVANCES[digitIndex] ?? 22;
  if (isCritical) return isFirst ? base + 8 : base + 4;
  return isFirst ? base + 2 : base;
}

/**
 * Draw damage numbers using WZ digit sprites (C++ DamageNumber::draw).
 * Falls back to styled text if sprites aren't loaded yet.
 */
export function drawDamageNumbers() {
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
export function calculatePlayerDamageRange() {
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
export function calculateMobDamage(playerMin, playerMax, mobLevel, mobWdef, mobAvoid) {
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
export function findMobsInRange(mobcount) {
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
export function performAttack() {
  const player = runtime.player;
  const now = performance.now();

  // C++ can_attack: not already attacking, not climbing
  if (player.attacking) return;
  if (player.climbing) return;
  if (now < player.attackCooldownUntil) return;

  // C++ Player::prepare_attack: prone is always a melee stab (no ammo needed)
  const isProne = player.action === "prone" || player.action === "sit";

  // C++ RegularAttack::can_use — ranged weapons require ammo (only when not prone)
  if (!isProne) {
    const weapon = playerEquipped.get("Weapon");
    if (weapon) {
      const wpfx = Math.floor(weapon.id / 10000);
      if (WEAPON_AMMO_PREFIXES[wpfx] && !hasProjectileAmmo()) {
        const ammoMsg = wpfx === 145 || wpfx === 146 ? "Please equip arrows first."
                      : wpfx === 147 ? "Please equip throwing stars first."
                      : "Please equip bullets first.";
        const sysMsg = { name: "", text: ammoMsg, timestamp: Date.now(), type: "system" };
        runtime.chat.history.push(sysMsg);
        if (runtime.chat.history.length > runtime.chat.maxHistory) runtime.chat.history.shift();
        fn.appendChatLogMessage(sysMsg);
        player.attackCooldownUntil = now + 300; // brief cooldown to prevent spam
        return;
      }
    }
  }

  // C++ CharLook::getattackstance
  let attackStance;
  if (isProne && fn.getCharacterActionFrames("proneStab").length > 0) {
    attackStance = "proneStab";
  } else {
    const stances = getWeaponAttackStances(false);
    const stanceIdx = Math.floor(Math.random() * stances.length);
    attackStance = stances[stanceIdx] || "swingO1";
  }

  // Start attack animation
  player.attacking = true;
  player.attackDegenerate = isProne; // C++ degenerate only applies when prone
  player.attackStance = attackStance;
  player.attackFrameIndex = 0;
  player.attackFrameTimer = 0;
  player.attackCooldownUntil = now + ATTACK_COOLDOWN_MS;

  // C++ CharLook::attack → weapon.get_usesound(degenerate).play()
  // Degenerate (prone) uses Attack2 if it exists, otherwise falls back to Attack
  const sfxKey = getWeaponSfxKey();
  if (isProne) {
    fn.playSfxWithFallback("Weapon", `${sfxKey}/Attack2`, `${sfxKey}/Attack`);
  } else {
    fn.playSfx("Weapon", `${sfxKey}/Attack`);
  }
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
export function applyAttackToMobVisualOnly(target) {
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
  void fn.playMobSfx(life.id, "Damage");

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
export function applyAttackToMob(target) {
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
  void fn.playMobSfx(life.id, "Damage");

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
    void fn.playMobSfx(life.id, "Die");
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
      fn.saveCharacter();
      wsSend({ type: "level_up", level: runtime.player.level });
    }
  }
}

/**
 * Update player attack animation state. Called each frame.
 * When the attack animation completes, reset attacking flag.
 */
export function updatePlayerAttack(dt) {
  const player = runtime.player;
  if (!player.attacking) return;

  // Cancel attack if player starts climbing
  if (player.climbing) {
    player.attacking = false;
    player.attackFrameIndex = 0;
    player.attackFrameTimer = 0;
    return;
  }

  const frames = fn.getCharacterActionFrames(player.attackStance);
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

export function updateMobCombatStates(dtMs) {
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
export function findNpcAtScreen(screenClickX, screenClickY) {
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
export function openNpcDialogue(npcResult) {
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
    lines = buildScriptDialogue(scriptDef, npcWzId, npcX, npcY);
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

export function closeNpcDialogue() {
  if (runtime.npcDialogue.active) {
    rlog(`NPC dialogue closed: ${runtime.npcDialogue.npcName}`);
  }
  runtime.npcDialogue.active = false;
  runtime.npcDialogue.lineIndex = 0;
}

export function advanceNpcDialogue() {
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
export let _npcDialogueOptionHitBoxes = [];
export let _npcDialogueBoxBounds = null; // { x, y, w, h } of the dialogue box

export function drawNpcDialogue() {
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

// reactorAnimations: reactorId → { states: { [stateNum]: { idle: [frames], hit: [frames] } }, name }
const reactorAnimations = new Map();
const reactorAnimationPromises = new Map();

/**
 * Load reactor sprite data from Reactor.wz JSON.
 * Loads ALL states with their idle canvas frames AND hit animation frames.
 */
export async function loadReactorAnimation(reactorId) {
  if (reactorAnimations.has(reactorId)) return reactorAnimations.get(reactorId);
  if (reactorAnimationPromises.has(reactorId)) return reactorAnimationPromises.get(reactorId);

  const promise = (async () => {
    try {
      const paddedId = reactorId.padStart(7, "0");
      const path = `/resourcesv2/Reactor.wz/${paddedId}.img.json`;
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
// (reactorRuntimeState moved to state.js)

/**
 * Server reactors: populate from server-provided reactor list.
 * Also adds reactor entries to runtime.map.reactorEntries for rendering.
 */
export function syncServerReactors(serverReactors) {
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

export function initReactorRuntimeStates() {
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

export function updateReactorAnimations(dt) {
  if (!runtime.map) return;

  for (const [idx, rs] of reactorRuntimeState) {
    const reactor = runtime.map.reactorEntries[idx];
    if (!reactor) continue;
    const anim = reactorAnimations.get(reactor.id);
    if (!anim) continue;

    // Fade-in after respawn (dt is in ms)
    if (rs.active && rs.opacity < 1) {
      rs.opacity = Math.min(1, rs.opacity + dt * 0.002); // ~0.5s fade in
    }
    // Fade-out after destroy
    if (rs.destroyed && rs.opacity > 0 && !rs.hitAnimPlaying) {
      rs.opacity = Math.max(0, rs.opacity - dt * 0.003); // ~0.33s fade out
    }

    // Hit animation playback
    // dt is already in ms (caller passes dt * 1000)
    if (rs.hitAnimPlaying) {
      const animState = rs.hitAnimState ?? rs.state;
      const stateData = anim.states[animState];
      const hitFrames = stateData?.hit ?? [];
      if (hitFrames.length === 0) {
        rs.hitAnimPlaying = false;
      } else {
        const frame = hitFrames[rs.hitAnimFrameIndex];
        if (frame) {
          rs.hitAnimElapsed += dt;
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
    // dt is already in ms
    if (!rs.hitAnimPlaying && rs.active) {
      const stateData = anim.states[rs.state];
      const idleFrames = stateData?.idle ?? [];
      if (idleFrames.length > 1) {
        const frame = idleFrames[rs.frameIndex];
        if (frame && frame.delay > 0) {
          rs.elapsed += dt;
          if (rs.elapsed >= frame.delay) {
            rs.elapsed -= frame.delay;
            rs.frameIndex = (rs.frameIndex + 1) % idleFrames.length;
          }
        }
      }
    }
  }
}

export function drawReactors() {
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
export function findReactorsInRange() {
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

export function spatialCellCoord(value) {
  return Math.floor(value / SPATIAL_BUCKET_SIZE);
}

export function spatialBucketKey(cx, cy) {
  return `${cx},${cy}`;
}

export function addToSpatialBucket(bucketMap, cx, cy, value) {
  const key = spatialBucketKey(cx, cy);
  let bucket = bucketMap.get(key);
  if (!bucket) {
    bucket = [];
    bucketMap.set(key, bucket);
  }
  bucket.push(value);
}

export function buildLayerSpatialIndex(layer) {
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

export function buildMapSpatialIndex(map) {
  for (const layer of map.layers ?? []) {
    buildLayerSpatialIndex(layer);
  }
}

export function isDamagingTrapMeta(meta) {
  return safeNumber(meta?.obstacle, 0) !== 0 && safeNumber(meta?.damage, 0) > 0;
}

export function buildMapTrapHazardIndex(map) {
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

export function currentObjectFrameMeta(layerIndex, obj) {
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

export function visibleSpritesForLayer(layer) {
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

export function parseMapData(raw) {
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

export async function loadBackgroundMeta(entry) {
  if (!entry.key || !entry.bS) return null;

  const path = `/resourcesv2/Map.wz/Back/${entry.bS}.img.json`;
  const json = await fetchJson(path);
  const group = childByName(json, entry.ani === 1 ? "ani" : "back");

  const directCanvasNode = (group?.$$ ?? []).find((child) => child.$canvas === entry.no);
  const node = childByName(group, entry.no) ?? directCanvasNode;
  const canvasNode = pickCanvasNode(node, "0") ?? directCanvasNode;

  return canvasMetaFromNode(canvasNode);
}

export function requestBackgroundMeta(entry) {
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
export async function loadAnimatedBackgroundFrames(entry) {
  if (entry.ani !== 1) return null;

  const path = `/resourcesv2/Map.wz/Back/${entry.bS}.img.json`;
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

export async function loadTileMeta(tile) {
  if (!tile.key || !tile.tileSet) return null;

  const path = `/resourcesv2/Map.wz/Tile/${tile.tileSet}.img.json`;
  const json = await fetchJson(path);
  const group = childByName(json, tile.u);
  const canvasNode = pickCanvasNode(group, tile.no);
  return canvasMetaFromNode(canvasNode);
}

export function requestTileMeta(tile) {
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

export async function loadObjectMeta(obj) {
  if (!obj.key) return null;

  const path = `/resourcesv2/Map.wz/Obj/${obj.oS}.img.json`;
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
export function objectAnimationFrameEntries(target) {
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
export async function loadAnimatedObjectFrames(obj) {
  const path = `/resourcesv2/Map.wz/Obj/${obj.oS}.img.json`;
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

export function requestObjectMeta(obj) {
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

export function portalVisibilityMode(portal) {
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

export function updateHiddenPortalState(dt) {
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

export function getHiddenPortalAlpha(portal) {
  const entry = runtime.hiddenPortalState.get(`${portal.x},${portal.y}`);
  return entry ? entry.alpha : 0;
}

export function updatePortalAnimations(dtMs) {
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

export function isAutoEnterPortal(portal) {
  return portal.type === 3 || portal.type === 9;
}

export function portalWorldBounds(portal) {
  return fn.normalizedRect(
    portal.x - 25,
    portal.x + 25,
    portal.y - 100,
    portal.y + 25,
  );
}

export function portalBoundsContainsPlayer(portal) {
  const player = runtime.player;
  const bounds = portalWorldBounds(portal);
  return (
    player.x >= bounds.left &&
    player.x <= bounds.right &&
    player.y >= bounds.top &&
    player.y <= bounds.bottom
  );
}

export function isValidPortalTargetMapId(mapId) {
  return Number.isFinite(mapId) && mapId >= 0 && mapId < 999999999;
}

export function normalizedPortalTargetName(targetPortalName) {
  const name = String(targetPortalName ?? "").trim();
  if (!name || name.toLowerCase() === "n/a") return "";
  return name;
}

export function findUsablePortalAtPlayer(map) {
  for (const portal of map.portalEntries ?? []) {
    if (!portalBoundsContainsPlayer(portal)) continue;

    const hasTargetMap = isValidPortalTargetMapId(portal.targetMapId);
    const hasTargetPortalName = normalizedPortalTargetName(portal.targetPortalName).length > 0;
    if (!hasTargetMap && !hasTargetPortalName) continue;

    return portal;
  }

  return null;
}

export function mapVisibleBounds(map) {
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

export function clampCameraXToMapBounds(map, desiredCenterX) {
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

export function clampCameraYToMapBounds(map, desiredCenterY) {
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

export function portalMomentumEase(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function startPortalMomentumScroll() {
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

export async function waitForPortalMomentumScrollToFinish() {
  while (runtime.portalScroll.active) {
    await waitForAnimationFrame();
  }
}

export function movePlayerToPortalInCurrentMap(targetPortalName) {
  if (!runtime.map) return false;

  const targetPortal = runtime.map.portalEntries.find((portal) => portal.name === targetPortalName);
  if (!targetPortal) return false;

  const player = runtime.player;
  player.x = targetPortal.x;

  // Try to snap to a foothold near the portal destination:
  // 1. Check for a foothold close to portal Y (within 60px margin)
  // 2. Fall back to the nearest foothold below the portal
  const nearby = fn.findFootholdAtXNearY(runtime.map, targetPortal.x, targetPortal.y, 60);
  const below = nearby || fn.findFootholdBelow(runtime.map, targetPortal.x, targetPortal.y);
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

export function waitForAnimationFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function fadeScreenTo(targetAlpha, durationMs) {
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

