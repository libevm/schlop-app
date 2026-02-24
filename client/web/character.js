/**
 * character.js — Character frame system: body/face/hair/equip composition,
 * face animation, preloading, set effects, chat bubbles, name labels.
 */
import {
  fn, runtime, ctx, canvasEl,
  dlog, rlog, imageCache, metaCache,
  gameViewWidth, gameViewHeight,
  playerEquipped, playerInventory,
  playerFacePath, playerHairPath,
  FACE_ANIMATION_SPEED, DEFAULT_STANDARD_CHARACTER_WIDTH,
  CHAT_BUBBLE_LINE_HEIGHT, CHAT_BUBBLE_HORIZONTAL_PADDING,
  CHAT_BUBBLE_VERTICAL_PADDING, CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER,
  PLAYER_HIT_FACE_DURATION_MS,
  EQUIP_SLOT_LIST,
  STATUSBAR_HEIGHT, STATUSBAR_BAR_HEIGHT, STATUSBAR_PADDING_H,
  CLIMBING_STANCES, characterPlacementTemplateCache,
  lifeRuntimeState,
} from "./state.js";
import {
  safeNumber, childByName, imgdirChildren, imgdirLeafRecord,
  pickCanvasNode, canvasMetaFromNode, resolveNodeByUol, soundPathFromName,
  fetchJson, requestMeta, requestImageByKey, getImageByKey,
  worldToScreen, drawWorldImage,
  roundRect, wrapText, wrapBubbleTextToWidth,
} from "./util.js";
import { wsSend, remotePlayers, _remoteSetEffects } from "./net.js";
import { canvasToImageBitmap } from "./wz-canvas-decode.js";
import {
  loadLifeAnimation, loadReactorAnimation,
  loadBackgroundMeta, loadAnimatedBackgroundFrames,
  loadTileMeta, loadObjectMeta, loadAnimatedObjectFrames,
  portalVisibilityMode, DEGEN_STANCES_BY_TYPE,
  ATTACK_STANCES_BY_TYPE, MOB_DEFAULT_HP,
} from "./life.js";
import { equipWzCategoryFromId } from "./save.js";

export function requestCharacterData() {
  if (runtime.characterData && runtime.characterHeadData && runtime.characterFaceData) {
    return Promise.resolve();
  }

  if (!runtime.characterDataPromise) {
    runtime.characterDataPromise = (async () => {
      try {
        // Build equip fetch list from currently equipped items
        const equipEntries = [...playerEquipped.entries()].map(([slotType, eq]) => ({
          id: eq.id,
          category: equipWzCategoryFromId(eq.id) || slotType,
          padded: String(eq.id).padStart(8, "0"),
        }));

        const fetches = [
          fetchJson("/resourcesv3/Character.wz/00002000.img.xml"),
          fetchJson("/resourcesv3/Character.wz/00012000.img.xml"),
          fetchJson(`/resourcesv3/Character.wz/${playerFacePath()}`),
          fetchJson("/resourcesv3/Base.wz/zmap.img.xml"),
          fetchJson(`/resourcesv3/Character.wz/${playerHairPath()}`),
          ...equipEntries.map((eq) => fetchJson(`/resourcesv3/Character.wz/${eq.category}/${eq.padded}.img.xml`)),
        ];

        const results = await Promise.all(fetches);
        const [bodyData, headData, faceData, zMapData, hairData, ...equipResults] = results;

        runtime.characterData = bodyData;
        runtime.characterHeadData = headData;
        runtime.characterFaceData = faceData;
        runtime.zMapOrder = fn.buildZMapOrder(zMapData);
        runtime.characterHairData = hairData;

        for (let i = 0; i < equipEntries.length; i++) {
          runtime.characterEquipData[equipEntries[i].id] = equipResults[i];
        }
      } finally {
        runtime.characterDataPromise = null;
      }
    })();
  }

  return runtime.characterDataPromise;
}

export function getCharacterActionFrames(action) {
  if (!runtime.characterData) return [];

  const actionNode = childByName(runtime.characterData, action);
  if (!actionNode) return [];

  return imgdirChildren(actionNode).sort((a, b) => Number(a.$imgdir) - Number(b.$imgdir));
}

export function getHeadFrameMeta(action, frameIndex) {
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

export function randomBlinkCooldownMs() {
  return 1200 + Math.random() * 2200;
}

export function getFaceExpressionFrames(expression, overrideFaceData) {
  const faceData = overrideFaceData || runtime.characterFaceData;
  if (!faceData) return [];

  const expressionNode = childByName(faceData, expression);
  if (!expressionNode) return [];

  const expressionFrames = imgdirChildren(expressionNode).sort((a, b) => Number(a.$imgdir) - Number(b.$imgdir));
  if (expressionFrames.length > 0) {
    return expressionFrames;
  }

  return [expressionNode];
}

export function getFaceFrameMeta(frameLeaf, expression, expressionFrameIndex, overrideFaceData) {
  const faceData = overrideFaceData || runtime.characterFaceData;
  if (!faceData) return null;

  if (safeNumber(frameLeaf.face, 1) === 0) {
    return null;
  }

  const frames = getFaceExpressionFrames(expression, overrideFaceData);
  if (frames.length === 0) return null;

  const frameNode = frames[expressionFrameIndex % frames.length];
  const canvasNode =
    pickCanvasNode(frameNode, "face") ??
    pickCanvasNode(frameNode, "0") ??
    pickCanvasNode(childByName(faceData, "default"), "face");

  return canvasMetaFromNode(canvasNode);
}

export function getFaceFrameDelayMs(expression, expressionFrameIndex) {
  const frames = getFaceExpressionFrames(expression);
  if (frames.length === 0) return 120;

  const frameNode = frames[expressionFrameIndex % frames.length];
  const leaf = imgdirLeafRecord(frameNode);
  const baseDelay = safeNumber(leaf.delay, 120);
  return Math.max(35, baseDelay / FACE_ANIMATION_SPEED);
}

export function pickPlayerHitFaceExpression() {
  if (getFaceExpressionFrames("hit").length > 0) return "hit";
  if (getFaceExpressionFrames("pain").length > 0) return "pain";
  return "default";
}

export function triggerPlayerHitVisuals(nowMs = performance.now()) {
  const faceAnimation = runtime.faceAnimation;
  const hitExpression = pickPlayerHitFaceExpression();

  if (hitExpression !== "default") {
    faceAnimation.expression = hitExpression;
    faceAnimation.frameIndex = 0;
    faceAnimation.frameTimerMs = 0;
    faceAnimation.overrideExpression = hitExpression;
    faceAnimation.overrideUntilMs = nowMs + PLAYER_HIT_FACE_DURATION_MS;

    // Broadcast hit expression to other players (skip emote cooldown — hits are immediate)
    wsSend({ type: "face", expression: hitExpression });
  }

  faceAnimation.blinkCooldownMs = randomBlinkCooldownMs();
}

export function updateFaceAnimation(dt) {
  if (!runtime.characterFaceData) return;

  const faceAnimation = runtime.faceAnimation;
  const nowMs = performance.now();

  if (faceAnimation.overrideExpression && nowMs < faceAnimation.overrideUntilMs) {
    const expression = faceAnimation.overrideExpression;
    const frames = getFaceExpressionFrames(expression);

    if (frames.length === 0) {
      faceAnimation.overrideExpression = null;
      faceAnimation.overrideUntilMs = 0;
      faceAnimation.expression = "default";
      faceAnimation.frameIndex = 0;
      faceAnimation.frameTimerMs = 0;
      return;
    }

    if (faceAnimation.expression !== expression) {
      faceAnimation.expression = expression;
      faceAnimation.frameIndex = 0;
      faceAnimation.frameTimerMs = 0;
    }

    faceAnimation.frameTimerMs += dt * 1000;
    while (true) {
      const delayMs = getFaceFrameDelayMs(expression, faceAnimation.frameIndex);
      if (faceAnimation.frameTimerMs < delayMs) break;
      faceAnimation.frameTimerMs -= delayMs;
      faceAnimation.frameIndex = (faceAnimation.frameIndex + 1) % frames.length;
    }

    return;
  }

  if (faceAnimation.overrideExpression && nowMs >= faceAnimation.overrideUntilMs) {
    faceAnimation.overrideExpression = null;
    faceAnimation.overrideUntilMs = 0;
    faceAnimation.expression = "default";
    faceAnimation.frameIndex = 0;
    faceAnimation.frameTimerMs = 0;
  }

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
// (CLIMBING_STANCES moved to state.js)

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
export function getEquipFrameParts(data, action, frameIndex, prefix) {
  if (!data) return [];

  let actionNode = childByName(data, action);

  if (!actionNode) {
    // During climbing, if equip doesn't have the stance, don't render it (C++ parity:
    // weapons have no ladder/rope stance and are drawn only as BACKWEAPON if present).
    if (CLIMBING_STANCES.has(action)) return [];

    // For face accessories: fall back to "default" expression if specific one missing
    actionNode = childByName(data, "default");
    // For body equips: fall back to "stand1" stance if specific one missing
    if (!actionNode) actionNode = childByName(data, "stand1");
    if (!actionNode) return [];
  }

  const frames = imgdirChildren(actionNode).sort((a, b) => Number(a.$imgdir) - Number(b.$imgdir));

  // Face accessories and some equips have canvas children directly under the action node
  // (no numbered frame sub-nodes). Treat the action node itself as a single frame.
  let frameNode;
  let framePath;
  if (frames.length === 0) {
    // Check if actionNode has direct canvas children (face accessory pattern)
    const hasDirectCanvas = (actionNode.$$ ?? []).some(c => typeof c.$canvas === "string" || typeof c.$uol === "string");
    if (!hasDirectCanvas) return [];
    frameNode = actionNode;
    framePath = [actionNode.$imgdir ?? action];
  } else {
    frameNode = frames[frameIndex % frames.length];
    framePath = [actionNode.$imgdir ?? action, String(frameNode.$imgdir ?? frameIndex)];
  }
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
export function getHairFrameParts(action, frameIndex, overrideHairData) {
  const hairData = overrideHairData || runtime.characterHairData;
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
              name: `hair:${runtime.player.hair_id}:${action}:${frameIndex}:${child.$canvas}`,
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
                name: `hair:${runtime.player.hair_id}:${action}:${frameIndex}:${resolvedName}`,
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

  return extractHairPartsFromContainer(defaultNode, `hair:${runtime.player.hair_id}:default`);
}

/**
 * Extract hair parts from a container node (like "default" or "backDefault")
 * that has direct canvas children and/or sub-imgdirs with canvas children.
 */
export function extractHairPartsFromContainer(containerNode, keyPrefix) {
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

export function getCharacterFrameData(
  action,
  frameIndex,
  faceExpression = runtime.faceAnimation.expression,
  faceFrameIndex = runtime.faceAnimation.frameIndex,
) {
  // C++ CharEquips::adjust_stance — weapon may override stand/walk stances
  action = fn.adjustStanceForWeapon(action);

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
      faceExpression,
      faceFrameIndex,
    );
    if (faceMeta) {
      frameParts.push({ name: `face:${faceExpression}:${faceFrameIndex}`, meta: faceMeta });
    }
  }

  // Hair — filtered by cap type (C++ CharLook::draw cap-type switch)
  const hairParts = getHairFrameParts(action, frameIndex);
  const capType = fn.getCapType();
  const isClimbing = CLIMBING_STANCES.has(action);
  for (const hp of hairParts) {
    const z = hp.meta?.zName ?? "";
    const layerName = hp.name.split(":").pop() || z;

    if (isClimbing) {
      // Climbing: only back hair, filtered by cap type
      // NONE: backHair only
      // HEADBAND: backHair only (cap drawn separately via equip)
      // HALFCOVER: backHairBelowCap only (not backHair)
      // FULLCOVER: no hair at all
      if (capType === "FULLCOVER") continue;
      if (capType === "HALFCOVER") {
        if (layerName === "backHair" || z === "backHair") continue; // skip full back hair
        // Allow backHairBelowCap
      } else {
        // NONE or HEADBAND: skip backHairBelowCap (use full backHair)
        if (layerName === "backHairBelowCap" || z === "backHairBelowCap") continue;
      }
      // During climbing, skip front hair layers (only back hair)
      if (z === "hair" || z === "hairOverHead" || z === "hairShade" || z === "hairBelowBody") continue;
    } else {
      // Non-climbing: always draw hairBelowBody, hairShade, hair (DEFAULT)
      // Cap-type controls hairOverHead and backHair layers
      if (capType === "FULLCOVER") {
        // Hide ALL hair layers (cap covers everything)
        continue;
      } else if (capType === "HALFCOVER") {
        // Hide hairOverHead (half-covered), swap backHair → backHairBelowCap
        if (z === "hairOverHead") continue;
        if (layerName === "hairOverHead") continue;
        if (z === "backHair" || layerName === "backHair") continue; // use belowCap instead
      } else {
        // NONE or HEADBAND: skip backHairBelowCap (use full backHair + all front hair)
        if (z === "backHairBelowCap" || layerName === "backHairBelowCap") continue;
      }
    }
    frameParts.push(hp);
  }

  // Equipment — iterate currently equipped items (dynamic, not DEFAULT_EQUIPS)
  // Skip weapon when sitting on a chair
  const hidingWeapon = action === "sit";
  // C++ parity: if overall (Longcoat) is equipped, hide separate Coat and Pants
  const hasOverall = fn.hasOverallEquipped();
  for (const [slotType, equipped] of playerEquipped) {
    if (hidingWeapon && slotType === "Weapon") continue;
    // When overall equipped, skip separate top and bottom pieces
    if (hasOverall && (slotType === "Coat" || slotType === "Pants")) continue;
    const equipData = runtime.characterEquipData[equipped.id];
    if (!equipData) continue;
    // Face accessories use face expression as stance, frame 0 (C++ draws FACEACC at frame 0 with faceargs)
    let eqAction = action;
    let eqFrame = frameIndex;
    if (slotType === "FaceAcc") {
      eqAction = faceExpression;
      eqFrame = 0;
    }
    const equipParts = getEquipFrameParts(equipData, eqAction, eqFrame, `equip:${equipped.id}`);
    for (const ep of equipParts) {
      // C++ cap sub-layer filtering: capOverHair only drawn for HEADBAND caps
      if (slotType === "Cap") {
        const epZ = ep.meta?.zName ?? "";
        if (epZ === "capOverHair" || epZ === "backCapOverHair") {
          if (capType !== "HEADBAND") continue;
        }
      }
      frameParts.push(ep);
    }
  }

  return {
    delay,
    parts: frameParts,
  };
}

export function requestCharacterPartImage(key, meta) {
  if (!meta) return;

  if (!metaCache.has(key)) {
    metaCache.set(key, meta);
  }

  requestImageByKey(key);
}

export function addPreloadTask(taskMap, key, loader) {
  if (!key || taskMap.has(key)) return;
  taskMap.set(key, loader);
}

/**
 * Build preload task maps split into critical (blocks loading screen) and
 * deferred (loads in background after map is shown).
 *
 * Critical: assets visible at spawn viewport + backgrounds + minimap.
 * Deferred: distant tiles/objects, extra mob stances, attack animations,
 *           mob sounds, reactor hit sprites, etc.
 */
export function buildMapAssetPreloadTasks(map, spawnX, spawnY) {
  const critical = new Map();
  const deferred = new Map();
  const MARGIN = 300; // px beyond viewport to include
  const halfW = gameViewWidth() / 2 + MARGIN;
  const halfH = gameViewHeight() / 2 + MARGIN;

  function isNearSpawn(x, y) {
    return Math.abs(x - spawnX) < halfW && Math.abs(y - spawnY) < halfH;
  }

  // ── Backgrounds: always critical (fill entire screen) ──
  for (const background of map.backgrounds ?? []) {
    if (!background.key || !background.bS) continue;
    addPreloadTask(critical, background.key, () => loadBackgroundMeta(background));
    if (background.ani === 1) {
      const animKey = `back-anim:${background.baseKey}`;
      if (!critical.has(animKey) && !deferred.has(animKey)) {
        const bgsWithSameBase = (map.backgrounds ?? []).filter(
          (b) => b.baseKey === background.baseKey && b.ani === 1
        );
        const cachedBgAnim = metaCache.get(animKey);
        if (cachedBgAnim && cachedBgAnim.delays) {
          for (const b of bgsWithSameBase) {
            b.frameCount = cachedBgAnim.frameCount;
            b.frameDelays = cachedBgAnim.delays;
          }
        }
        addPreloadTask(critical, animKey, async () => {
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

  // ── Tiles & Objects: critical if near spawn, deferred otherwise ──
  for (const layer of map.layers ?? []) {
    for (const tile of layer.tiles ?? []) {
      if (!tile.key || !tile.tileSet) continue;
      const target = isNearSpawn(tile.x, tile.y) ? critical : deferred;
      addPreloadTask(target, tile.key, () => loadTileMeta(tile));
    }

    for (const obj of layer.objects ?? []) {
      if (!obj.key) continue;
      const near = isNearSpawn(obj.x, obj.y);
      // Frame 0 of visible objects is critical; animation discovery always critical
      // (so frame counts/delays are available), but extra frame images are deferred
      addPreloadTask(near ? critical : deferred, obj.key, () => loadObjectMeta(obj));
      const animKey = `obj-anim:${obj.baseKey}`;
      if (!critical.has(animKey) && !deferred.has(animKey)) {
        const objsWithSameBase = [];
        for (const l of map.layers ?? []) {
          for (const o of l.objects ?? []) {
            if (o.baseKey === obj.baseKey) objsWithSameBase.push(o);
          }
        }
        const cachedAnim = metaCache.get(animKey);
        if (cachedAnim && cachedAnim.delays) {
          for (const o of objsWithSameBase) {
            o.frameCount = cachedAnim.frameCount;
            o.frameDelays = cachedAnim.delays;
            o.frameOpacities = cachedAnim.opacities ?? null;
            o.frameKeys = cachedAnim.frameKeys ?? null;
            o.motion = cachedAnim.motion ?? null;
          }
        }
        // Object animation metadata discovery: critical for near objects so
        // frame delays are populated, deferred for distant ones.
        addPreloadTask(near ? critical : deferred, animKey, async () => {
          const result = await loadAnimatedObjectFrames(obj);
          if (result) {
            for (const o of objsWithSameBase) {
              o.frameCount = result.frameCount;
              o.frameDelays = result.delays;
              o.frameOpacities = result.opacities ?? null;
              o.frameKeys = result.frameKeys ?? null;
              o.motion = result.motion ?? null;
            }
          }
          return result;
        });
      }
    }
  }

  // ── Portals: critical if near spawn ──
  for (const portal of map.portalEntries ?? []) {
    if (portalVisibilityMode(portal) === "none") continue;
    const near = isNearSpawn(portal.x, portal.y);
    const frameCount = fn.portalFrameCount(portal);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const key = fn.portalMetaKey(portal, frame);
      addPreloadTask(near ? critical : deferred, key, () => fn.loadPortalMeta(portal, frame));
    }
  }

  // ── Life (mob/NPC): load animation data + stand frame 0 as critical,
  //    extra stances (move, hit1, die1) as deferred ──
  const lifeIds = new Set();
  for (const life of map.lifeEntries ?? []) {
    if (life.hide === 1) continue;
    const lifeKey = `${life.type}:${life.id}`;
    if (lifeIds.has(lifeKey)) continue;
    lifeIds.add(lifeKey);

    // Critical: fetch animation data + decode stand frame 0
    addPreloadTask(critical, `life-load:${lifeKey}`, async () => {
      const anim = await loadLifeAnimation(life.type, life.id);
      if (!anim) return null;
      // Register ALL stance frames in metaCache (cheap — just stores basedata ref)
      for (const stanceName of Object.keys(anim.stances)) {
        for (const frame of anim.stances[stanceName].frames) {
          if (!metaCache.has(frame.key)) {
            const m = { basedata: frame.basedata, width: frame.width, height: frame.height };
            if (frame.wzrawformat != null) m.wzrawformat = frame.wzrawformat;
            metaCache.set(frame.key, m);
          }
        }
      }
      // Only decode "stand" frame 0 now — visible immediately
      const standStance = anim.stances["stand"];
      if (standStance?.frames?.[0]) {
        const f = standStance.frames[0];
        await requestImageByKey(f.key);
        delete f.basedata;
        const cm = metaCache.get(f.key);
        if (cm) delete cm.basedata;
      }
      // Update mob HP from WZ data
      if (life.type === "m" && anim.maxHP > 0) {
        for (const [idx, state] of lifeRuntimeState) {
          const l = map.lifeEntries[idx];
          if (l && l.type === "m" && l.id === life.id && state.maxHp === MOB_DEFAULT_HP) {
            state.maxHp = anim.maxHP;
            state.hp = anim.maxHP;
          }
        }
      }
      return anim;
    });

    // Deferred: decode remaining stance frames (move, hit1, die1, stand frames 1+).
    // Closure captures lifeKey; anim data is available via lifeAnimations after
    // the critical loader runs loadLifeAnimation.
    addPreloadTask(deferred, `life-extra:${lifeKey}`, async () => {
      const anim = lifeAnimations.get(lifeKey);
      if (!anim) return;
      for (const stanceName of Object.keys(anim.stances)) {
        const stance = anim.stances[stanceName];
        if (!stance) continue;
        for (let i = 0; i < stance.frames.length; i++) {
          if (stanceName === "stand" && i === 0) continue;
          const frame = stance.frames[i];
          if (imageCache.has(frame.key)) continue;
          await requestImageByKey(frame.key);
          delete frame.basedata;
          const cm = metaCache.get(frame.key);
          if (cm) delete cm.basedata;
        }
      }
    });
  }

  // ── Mob sound: always deferred (22MB JSON, not needed until combat) ──
  const hasMobs = (map.lifeEntries ?? []).some(l => l.type === "m");
  if (hasMobs) {
    addPreloadTask(deferred, "sound:Mob.img", async () => {
      try { await fetchJson(soundPathFromName("Mob.img")); } catch {}
    });
  }

  // ── Reactors: idle state 0 frame 0 critical, rest deferred ──
  const reactorIds = new Set();
  for (const reactor of map.reactorEntries ?? []) {
    if (reactorIds.has(reactor.id)) continue;
    reactorIds.add(reactor.id);

    // Collect all frame keys during critical load; deferred phase uses the list
    // to decode remaining frames (avoids needing access to private reactorAnimations).
    const reactorFrameKeys = [];

    // Critical: load animation data + idle state 0 frame 0
    addPreloadTask(critical, `reactor-load:${reactor.id}`, async () => {
      const anim = await loadReactorAnimation(reactor.id);
      if (!anim) return null;
      // Register all frames in metaCache and collect keys for deferred phase
      for (const stateData of Object.values(anim.states)) {
        for (const frame of [...(stateData.idle || []), ...(stateData.hit || [])]) {
          reactorFrameKeys.push(frame.key);
          if (!metaCache.has(frame.key)) {
            const m = { basedata: frame.basedata, width: frame.width, height: frame.height };
            if (frame.wzrawformat != null) m.wzrawformat = frame.wzrawformat;
            metaCache.set(frame.key, m);
          }
        }
      }
      // Decode only idle state 0 frame 0
      const s0 = anim.states[0];
      if (s0?.idle?.[0]) {
        const f = s0.idle[0];
        await requestImageByKey(f.key);
        delete f.basedata;
        const cm = metaCache.get(f.key);
        if (cm) delete cm.basedata;
      }
      return anim;
    });

    // Deferred: decode remaining reactor frames using collected keys
    addPreloadTask(deferred, `reactor-extra:${reactor.id}`, async () => {
      for (const key of reactorFrameKeys) {
        if (imageCache.has(key)) continue;
        await requestImageByKey(key);
        const cm = metaCache.get(key);
        if (cm) delete cm.basedata;
      }
    });
  }

  // ── Minimap: critical ──
  if (map.miniMap?.basedata) {
    const mmKey = map.miniMap.imageKey;
    addPreloadTask(critical, mmKey, async () => {
      const m = {
        basedata: map.miniMap.basedata,
        width: map.miniMap.canvasWidth,
        height: map.miniMap.canvasHeight,
      };
      if (map.miniMap.wzrawformat != null) m.wzrawformat = map.miniMap.wzrawformat;
      return m;
    });
  }

  return { critical, deferred };
}

export function addCharacterPreloadTasks(critical, deferred) {
  // Critical: current stance (stand1) frame 0
  const criticalActions = ["stand1"];
  // Deferred: all other stances and frames
  const allAttackStances = new Set();
  for (const stances of ATTACK_STANCES_BY_TYPE) {
    for (const s of stances) allAttackStances.add(s);
  }
  for (const stances of DEGEN_STANCES_BY_TYPE) {
    for (const s of stances) allAttackStances.add(s);
  }
  const deferredActions = ["stand2", "walk1", "walk2", "jump", "ladder", "rope", "prone", "sit",
    "proneStab", ...allAttackStances];

  for (const action of criticalActions) {
    const actionFrames = getCharacterActionFrames(action);
    // Only frame 0 is critical
    const frame = actionFrames.length > 0 ? getCharacterFrameData(action, 0) : null;
    if (frame?.parts?.length) {
      for (const part of frame.parts) {
        const key = `char:${action}:0:${part.name}`;
        addPreloadTask(critical, key, async () => part.meta);
      }
    }
    // Remaining frames deferred
    for (let fi = 1; fi < Math.min(actionFrames.length, 6); fi++) {
      const f = getCharacterFrameData(action, fi);
      if (!f?.parts?.length) continue;
      for (const part of f.parts) {
        addPreloadTask(deferred, `char:${action}:${fi}:${part.name}`, async () => part.meta);
      }
    }
  }

  for (const action of deferredActions) {
    const actionFrames = getCharacterActionFrames(action);
    const frameCount = Math.min(actionFrames.length, 6);
    for (let fi = 0; fi < frameCount; fi++) {
      const frame = getCharacterFrameData(action, fi);
      if (!frame?.parts?.length) continue;
      for (const part of frame.parts) {
        addPreloadTask(deferred, `char:${action}:${fi}:${part.name}`, async () => part.meta);
      }
    }
  }
}

/**
 * Preload map assets in two phases:
 * 1. Critical (blocks loading screen): spawn-visible tiles/objects, backgrounds,
 *    minimap, mob/NPC stand frame 0, character stand1 frame 0, nearby portals.
 * 2. Deferred (returned as async runner, called after map is shown): everything else.
 *
 * Returns an async function that runs the deferred phase when called.
 */
export async function preloadMapAssets(map, loadToken, spawnX, spawnY) {
  const { critical, deferred } = buildMapAssetPreloadTasks(map, spawnX, spawnY);

  await requestCharacterData();
  if (loadToken !== runtime.mapLoadToken) return null;

  // Load set effects (Zakum Helmet glow etc.) in background
  loadSetEffects();

  addCharacterPreloadTasks(critical, deferred);

  // Phase 1: critical assets (blocks loading screen)
  const tasks = [...critical.entries()];
  runtime.loading.total = tasks.length;
  runtime.loading.loaded = 0;
  runtime.loading.progress = tasks.length > 0 ? 0 : 1;
  runtime.loading.label = `Loading assets 0/${tasks.length}`;

  if (tasks.length === 0) {
    return deferred.size > 0 ? async (deferToken) => {
      const dTasks = [...deferred.entries()];
      let dCursor = 0;
      const dWorkers = Array.from({ length: Math.min(4, dTasks.length) }, () =>
        (async () => {
          while (true) {
            const idx = dCursor++;
            if (idx >= dTasks.length) break;
            if (deferToken !== runtime.mapLoadToken) break;
            const [key, loader] = dTasks[idx];
            try {
              const meta = await requestMeta(key, loader);
              if (meta) await requestImageByKey(key);
            } catch {}
          }
        })(),
      );
      await Promise.all(dWorkers);
    } : null;
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
  rlog(`preload critical: decoded=${statsDecoded} cached=${statsCached} skipped=${statsSkipped} errors=${statsError} total=${tasks.length} deferred=${deferred.size}`);

  // Phase 2: return deferred runner (called after loading screen hides)
  if (deferred.size === 0) return null;
  return async (deferToken) => {
    const dTasks = [...deferred.entries()];
    let dCursor = 0;
    const dWorkerCount = Math.min(4, dTasks.length); // fewer workers to not starve gameplay
    const dWorkers = Array.from({ length: dWorkerCount }, () =>
      (async () => {
        while (true) {
          const idx = dCursor++;
          if (idx >= dTasks.length) break;
          if (deferToken !== runtime.mapLoadToken) break;
          const [key, loader] = dTasks[idx];
          try {
            const meta = await requestMeta(key, loader);
            if (meta) await requestImageByKey(key);
          } catch {}
        }
      })(),
    );
    await Promise.all(dWorkers);
  };
}


/**
 * Black-fill areas outside VR bounds when the map is smaller than the viewport.
 * C++ parity: camera locks to top/left edge when map is shorter/narrower,
 * and the overflow area (bottom/right) is beyond the designed scene.
 */
// ─── Set Effect System (WZ-based equip glow, e.g. Zakum Helmet) ─────

/**
 * Maps set ID → { items: number[], frames: [{key, originX, originY, delay}] }
 * Loaded from Effect.wz/SetEff.img.json
 */
const _setEffectData = new Map();
let _setEffectsLoaded = false;

/** Active set effect state for local player */
export const _localSetEffect = { active: false, frameIndex: 0, frameTimer: 0 };

// (_remoteSetEffects is now in net.js)

export async function loadSetEffects() {
  if (_setEffectsLoaded) return;
  _setEffectsLoaded = true;
  try {
    const data = await fetchJson("/resourcesv3/Effect.wz/SetEff.img.xml");
    if (!data?.$$) return;
    for (const setNode of data.$$) {
      const setId = setNode.$imgdir;
      if (!setId) continue;
      const infoNode = (setNode.$$ || []).find(n => n.$imgdir === "info");
      const effectNode = (setNode.$$ || []).find(n => n.$imgdir === "effect");
      if (!infoNode || !effectNode) continue;

      // Collect required item IDs from info sub-nodes
      const items = [];
      for (const lvl of infoNode.$$ || []) {
        for (const slot of lvl.$$ || []) {
          const val = Number(slot.value);
          if (val > 0) items.push(val);
        }
      }
      if (items.length === 0) continue;

      // Parse effect frames
      const frames = [];
      for (const f of effectNode.$$ || []) {
        if (!f.$canvas) continue;
        const origin = (f.$$ || []).find(c => c.$vector === "origin");
        const delay = (f.$$ || []).find(c => c.$int === "delay");
        const key = `seteff:${setId}:${f.$canvas}`;
        const frameObj = {
          key,
          width: Number(f.width) || 0,
          height: Number(f.height) || 0,
          originX: Number(origin?.x) || 0,
          originY: Number(origin?.y) || 0,
          delay: Number(delay?.value) || 100,
          basedata: f.basedata,
        };
        if (f.wzrawformat != null) frameObj.wzrawformat = f.wzrawformat;
        frames.push(frameObj);
      }
      if (frames.length === 0) continue;
      _setEffectData.set(setId, { items, frames });
    }
    // Pre-decode set effect images using onload (same pattern as preloader)
    let decoded = 0, failed = 0;
    const decodePromises = [];
    for (const [, setEff] of _setEffectData) {
      for (const frame of setEff.frames) {
        if (frame.basedata) {
          const key = frame.key;
          decodePromises.push(
            canvasToImageBitmap(frame).then((bitmap) => {
              if (!bitmap) { failed++; return false; }
              imageCache.set(key, bitmap);
              decoded++;
              return true;
            })
          );
        }
      }
    }
    await Promise.all(decodePromises);
    dlog("info", `[SetEff] Loaded ${_setEffectData.size} sets, decoded ${decoded} frames, failed ${failed}`);
  } catch (e) {
    dlog("warn", `[SetEff] Failed to load: ${e.message}`);
  }
}

/**
 * Find the active set effect for a list of equipped item IDs.
 * Returns the set effect data or null.
 */
export function findActiveSetEffect(equippedIds) {
  for (const [, setEff] of _setEffectData) {
    // Set is active if the player has ANY of the required items equipped
    if (setEff.items.some(id => equippedIds.includes(id))) {
      return setEff;
    }
  }
  return null;
}

export function updateSetEffectAnimation(state, setEff, dtMs) {
  if (!setEff || !state.active) return;
  state.frameTimer += dtMs;
  const frame = setEff.frames[state.frameIndex];
  if (!frame) { state.frameIndex = 0; state.frameTimer = 0; return; }
  if (state.frameTimer >= frame.delay) {
    state.frameTimer -= frame.delay;
    state.frameIndex = (state.frameIndex + 1) % setEff.frames.length;
  }
}

export function updateSetEffectAnimations(dtMs) {
  // Local player
  if (_localSetEffect.active) {
    const localEquipIds = [...playerEquipped.values()].map(e => e.id);
    const localSetEff = findActiveSetEffect(localEquipIds);
    updateSetEffectAnimation(_localSetEffect, localSetEff, dtMs);
  }
  // Remote players
  for (const [sid, state] of _remoteSetEffects) {
    if (!state.active) continue;
    const rp = remotePlayers.get(sid);
    if (!rp) { _remoteSetEffects.delete(sid); continue; }
    const rpEquipIds = (rp.look?.equipment || []).map(e => e.item_id);
    const rpSetEff = findActiveSetEffect(rpEquipIds);
    updateSetEffectAnimation(state, rpSetEff, dtMs);
  }
}

export function drawSetEffect(worldX, worldY, setEff, state) {
  if (!setEff || !state.active) return;
  const frame = setEff.frames[state.frameIndex % setEff.frames.length];
  if (!frame) return;
  const img = imageCache.get(frame.key);
  if (!img) return;
  // Draw at character position, offset by origin
  const drawX = worldX - frame.originX;
  const drawY = worldY - frame.originY;
  drawWorldImage(img, drawX, drawY);
}

export function drawChatBubble() {
  const now = performance.now();
  if (runtime.player.bubbleExpiresAt < now || !runtime.player.bubbleText) return;

  // C++ parity: chatballoon.draw(absp - Point<int16_t>(0, 85))
  // When prone the sprite is much shorter, so lower the bubble offset
  const action = runtime.player.action;
  const isProne = action === "prone" || action === "proneStab";
  const bubbleOffsetY = isProne ? 40 : 70;
  const anchor = worldToScreen(runtime.player.x, runtime.player.y - bubbleOffsetY);

  ctx.save();
  ctx.font = "12px 'Dotum', Arial, sans-serif";

  // Cache bubble layout (lines, width, height) so it doesn't jitter on stance changes
  let layout = runtime.player._bubbleLayout;
  if (!layout) {
    const playerName = runtime.player.name || "Player";
    const fullText = playerName + ": " + runtime.player.bubbleText;
    const standardWidth = Math.max(1, Math.round(runtime.standardCharacterWidth || DEFAULT_STANDARD_CHARACTER_WIDTH));
    const maxBubbleWidth = Math.max(40, Math.round(standardWidth * CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER));
    const maxTextWidth = Math.max(14, maxBubbleWidth - CHAT_BUBBLE_HORIZONTAL_PADDING * 2);
    const lines = wrapBubbleTextToWidth(fullText, maxTextWidth);
    const widestLine = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
    const width = Math.max(40, Math.min(maxBubbleWidth, Math.ceil(widestLine) + CHAT_BUBBLE_HORIZONTAL_PADDING * 2));
    const height = Math.max(26, lines.length * CHAT_BUBBLE_LINE_HEIGHT + CHAT_BUBBLE_VERTICAL_PADDING * 2);
    layout = { lines, width, height };
    runtime.player._bubbleLayout = layout;
  }
  const { lines, width, height } = layout;

  const clampedX = Math.max(6, Math.min(canvasEl.width - width - 6, anchor.x - width / 2));
  const y = anchor.y - height - 16;

  // White bubble with subtle border (MapleStory-style)
  roundRect(ctx, clampedX, y, width, height, 6);
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(60, 80, 120, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#1a1a2e";
  ctx.textBaseline = "middle";
  const textBlockHeight = lines.length * CHAT_BUBBLE_LINE_HEIGHT;
  const textOffsetY = (height - textBlockHeight) / 2;
  for (let index = 0; index < lines.length; index += 1) {
    const lineY = y + textOffsetY + index * CHAT_BUBBLE_LINE_HEIGHT + CHAT_BUBBLE_LINE_HEIGHT / 2;
    ctx.fillText(lines[index], clampedX + CHAT_BUBBLE_HORIZONTAL_PADDING, lineY);
  }

  // Tail
  const tailX = Math.max(clampedX + 8, Math.min(clampedX + width - 8, anchor.x));
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

// ─── Minimap ───────────────────────────────────────────────────────────────────

// Stored each frame so the click handler knows where the toggle button is
// ─── Player Name Label ────────────────────────────────────────────────────────

export function drawPlayerNameLabel() {
  const player = runtime.player;
  const screen = worldToScreen(player.x, player.y);

  ctx.save();
  ctx.font = "bold 11px 'Dotum', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const nameText = player.name;
  const nameWidth = ctx.measureText(nameText).width;
  const padH = 6;
  const padV = 2;
  const tagW = nameWidth + padH * 2;
  const tagH = 14 + padV * 2;
  const tagX = Math.round(screen.x - tagW / 2);
  const tagY = Math.round(screen.y + 2);

  // Background — dark with subtle blue tint (MapleStory name tag)
  roundRect(ctx, tagX, tagY, tagW, tagH, 3);
  ctx.fillStyle = "rgba(6, 12, 28, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(100, 130, 180, 0.25)";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Name text — white with subtle shadow
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 2;
  ctx.fillText(nameText, Math.round(screen.x), tagY + padV);

  ctx.restore();
}

