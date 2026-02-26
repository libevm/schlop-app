/**
 * render.js — Map rendering pipeline, character composition & drawing,
 * collision detection (mobs/traps), background/tile/object layers.
 */
import {
  fn, runtime, ctx, canvasEl,
  dlog, rlog, gameViewWidth, gameViewHeight,
  SPATIAL_BUCKET_SIZE, SPATIAL_QUERY_MARGIN,
  PLAYER_TOUCH_HITBOX_HEIGHT, PLAYER_TOUCH_HITBOX_HALF_WIDTH,
  PLAYER_TOUCH_HITBOX_PRONE_HEIGHT, PLAYER_TOUCH_HITBOX_PRONE_HALF_WIDTH,
  TRAP_HIT_INVINCIBILITY_MS, PLAYER_KB_HSPEED, PLAYER_KB_VFORCE,
  PLAYER_HIT_FACE_DURATION_MS,
  CHAT_BUBBLE_LINE_HEIGHT, CHAT_BUBBLE_HORIZONTAL_PADDING,
  CHAT_BUBBLE_VERTICAL_PADDING, CHAT_BUBBLE_STANDARD_WIDTH_MULTIPLIER,
  DEFAULT_STANDARD_CHARACTER_WIDTH,
  BG_REFERENCE_HEIGHT, DEFAULT_CANVAS_HEIGHT,
  _chairSpriteCache, characterPlacementTemplateCache,
  objectAnimStates, PHYS_TPS, playerEquipped,
  lifeAnimations, lifeRuntimeState,
} from "./state.js";
import {
  safeNumber, getMetaByKey, getImageByKey,
  worldToScreen, isWorldRectVisible, drawWorldImage, drawScreenImage,
  topLeftFromAnchor, worldPointFromTopLeft,
  wrapText,
} from "./util.js";
import { drawRemotePlayer, remotePlayers, wsSend } from "./net.js";
import {
  currentObjectFrameMeta, drawLifeSprites, isDamagingTrapMeta,
  mapVisibleBounds, requestBackgroundMeta, requestObjectMeta, requestTileMeta,
  spawnDamageNumber, visibleSpritesForLayer,
} from "./life.js";
import { clampXToSideWalls, findFootholdAtXNearY, findFootholdBelow } from "./physics.js";
import { _localSetEffect } from "./character.js";

export function drawVRBoundsOverflowMask() {
  if (!runtime.map) return;

  const vw = gameViewWidth();
  const vh = gameViewHeight();
  const { left: vrL, right: vrR, top: vrT, bottom: vrB } = mapVisibleBounds(runtime.map);
  const cam = runtime.camera;

  // Convert VR edges to screen coordinates
  const vrScreenLeft = Math.round(vrL - cam.x + vw / 2);
  const vrScreenRight = Math.round(vrR - cam.x + vw / 2);
  const vrScreenTop = Math.round(vrT - cam.y + vh / 2);
  const vrScreenBottom = Math.round(vrB - cam.y + vh / 2);

  const needsMask =
    vrScreenLeft > 0 || vrScreenRight < vw ||
    vrScreenTop > 0 || vrScreenBottom < vh;

  if (!needsMask) return;

  ctx.save();
  ctx.fillStyle = "#000";

  // Left overflow
  if (vrScreenLeft > 0) ctx.fillRect(0, 0, vrScreenLeft, vh);
  // Right overflow
  if (vrScreenRight < vw) ctx.fillRect(vrScreenRight, 0, vw - vrScreenRight, vh);
  // Top overflow (between left/right masks)
  if (vrScreenTop > 0) {
    const x0 = Math.max(0, vrScreenLeft);
    const x1 = Math.min(vw, vrScreenRight);
    ctx.fillRect(x0, 0, x1 - x0, vrScreenTop);
  }
  // Bottom overflow (between left/right masks)
  if (vrScreenBottom < vh) {
    const x0 = Math.max(0, vrScreenLeft);
    const x1 = Math.min(vw, vrScreenRight);
    ctx.fillRect(x0, vrScreenBottom, x1 - x0, vh - vrScreenBottom);
  }

  ctx.restore();
}

export function drawBackgroundLayer(frontFlag) {
  if (!runtime.map) return;

  const canvasW = canvasEl.width;
  const canvasH = canvasEl.height;
  // Use game viewport for parallax math; actual canvas for fill/tiling coverage.
  const gvw = gameViewWidth();
  const gvh = gameViewHeight();
  const screenHalfW = gvw / 2;
  const screenHalfH = gvh / 2;
  const camX = runtime.camera.x;
  const camY = runtime.camera.y;

  // C++ parity: map camera is represented as a view translation.
  // viewX/viewY track camera every frame, matching C++ MapBackgrounds::draw.
  const viewX = screenHalfW - camX;
  const viewY = screenHalfH - camY;

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

    let image = getImageByKey(frameKey);
    let meta = getMetaByKey(frameKey);

    if (!image || !meta) {
      image = image ?? getImageByKey(background.key);
      meta = meta ?? getMetaByKey(background.key);
    }

    if (!meta) {
      requestBackgroundMeta(background);
      continue;
    }

    if (!image) continue;

    const origin = meta.vectors.origin ?? { x: 0, y: 0 };
    const width = Math.max(1, image.width || meta.width || 1);
    const height = Math.max(1, image.height || meta.height || 1);
    const cx = background.cx > 0 ? background.cx : width;
    const cy = background.cy > 0 ? background.cy : height;

    const hMobile = background.type === 4 || background.type === 6;
    const vMobile = background.type === 5 || background.type === 7;

    let motionState = bgMotionStates.get(background.index);
    if (!motionState) {
      motionState = { x: background.x, y: background.y };
      bgMotionStates.set(background.index, motionState);
    }

    let x;
    if (hMobile) {
      x = motionState.x + viewX;
    } else {
      const shiftX = (background.rx * (screenHalfW - viewX)) / 100 + screenHalfW;
      x = background.x + shiftX;
    }

    let y;
    if (vMobile) {
      y = motionState.y + viewY;
    } else {
      const shiftY = (background.ry * (screenHalfH - viewY)) / 100 + screenHalfH;
      y = background.y + shiftY;
    }

    // C++ tiling: htile/vtile count-based, matching MapBackgrounds.cpp
    const tileX = background.type === 1 || background.type === 3 || background.type === 4 || background.type === 6 || background.type === 7;
    const tileY = background.type === 2 || background.type === 3 || background.type === 5 || background.type === 6 || background.type === 7;

    // C++ alignment performs wrapping before sprite-origin offset.
    const htile = tileX ? Math.floor(canvasW / cx) + 3 : 1;
    const vtile = tileY ? Math.floor(canvasH / cy) + 3 : 1;

    if (htile > 1) {
      while (x > 0) x -= cx;
      while (x < -cx) x += cx;
    }
    if (vtile > 1) {
      while (y > 0) y -= cy;
      while (y < -cy) y += cy;
    }

    const ix = Math.round(x);
    const iy = Math.round(y);
    const tw = cx * htile;
    const th = cy * vtile;
    const originOffsetX = background.flipped ? width - origin.x : origin.x;
    const originOffsetY = origin.y;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, background.alpha));

    for (let tx = 0; tx < tw; tx += cx) {
      for (let ty = 0; ty < th; ty += cy) {
        drawScreenImage(image, ix + tx - originOffsetX, iy + ty - originOffsetY, background.flipped);
      }
    }

    ctx.restore();
  }
}

// Object animation states: keyed by "layer:objId" -> { frameIndex, timerMs }
// (objectAnimStates moved to state.js)
// Background animation states: keyed by bg index -> { frameIndex, timerMs }
export const bgAnimStates = new Map();
// Background motion states: keyed by bg index -> { x, y }
export const bgMotionStates = new Map();
export const portalFrameWarmupRequested = new Set();

export function updateBackgroundAnimations(dtMs) {
  if (!runtime.map) return;

  for (const bg of runtime.map.backgrounds) {
    let motionState = bgMotionStates.get(bg.index);
    if (!motionState) {
      motionState = { x: bg.x, y: bg.y };
      bgMotionStates.set(bg.index, motionState);
    }

    const hMobile = bg.type === 4 || bg.type === 6;
    const vMobile = bg.type === 5 || bg.type === 7;
    if (hMobile) {
      motionState.x += (bg.rx * dtMs) / 128;
    } else {
      motionState.x = bg.x;
    }

    if (vMobile) {
      motionState.y += (bg.ry * dtMs) / 128;
    } else {
      motionState.y = bg.y;
    }

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

export function updateObjectAnimations(dtMs) {
  if (!runtime.map) return;

  for (const layer of runtime.map.layers) {
    for (const obj of layer.objects) {
      if (!obj.frameDelays || obj.frameCount <= 1) continue;

      const stateKey = `${layer.layerIndex}:${obj.id}`;
      let state = objectAnimStates.get(stateKey);
      if (!state) {
        const startOpc = obj.frameOpacities?.[0]?.start ?? 255;
        state = { frameIndex: 0, timerMs: 0, opacity: startOpc };
        objectAnimStates.set(stateKey, state);
      }

      // Accumulate opacity per tick using current frame's rate of change.
      // For fade-in frames (a0=0): hold fully invisible for 2s before ramping,
      // creating a clear cooldown gap between cycles.
      const fi = state.frameIndex % obj.frameDelays.length;
      const frameDelay = obj.frameDelays[fi];
      const opc = obj.frameOpacities?.[fi];
      if (opc && frameDelay > 0) {
        const isFadeIn = opc.start === 0 && opc.end > 0;
        const holdMs = isFadeIn ? 2000 : 0;
        if (isFadeIn && state.timerMs < holdMs) {
          state.opacity = 0;
        } else {
          const rampDelay = Math.max(1, frameDelay - holdMs);
          const opcStep = dtMs * (opc.end - opc.start) / rampDelay;
          state.opacity += opcStep;
          if (state.opacity < 0) state.opacity = 0;
          else if (state.opacity > 255) state.opacity = 255;
        }
      }

      state.timerMs += dtMs;
      if (state.timerMs >= frameDelay) {
        state.timerMs -= frameDelay;
        state.frameIndex = (state.frameIndex + 1) % obj.frameCount;
        // Determine opacity for the new frame:
        // - start === 0: snap to 0 (cooldown gap before fade-in)
        // - start !== end (animated opacity): carry over for smooth transition
        // - start === end (no opacity animation): snap to start value
        //   (prevents carryover from a fading frame making static frames invisible)
        const nextOpc = obj.frameOpacities?.[state.frameIndex];
        if (nextOpc) {
          if (nextOpc.start === 0) {
            state.opacity = 0;
          } else if (nextOpc.start === nextOpc.end) {
            state.opacity = nextOpc.start;
          }
          // else: animated opacity — carry over smoothly
        }
      }
    }
  }
}

export function objectMoveOffset(motion, nowMs) {
  const moveType = safeNumber(motion?.moveType, 0);
  const moveW = safeNumber(motion?.moveW, 0);
  const moveH = safeNumber(motion?.moveH, 0);
  const moveP = Math.max(1, safeNumber(motion?.moveP, Math.PI * 2 * 1000));
  if (moveType === 0) return { x: 0, y: 0 };

  const phase = (Math.PI * 2 * nowMs) / moveP;
  switch (moveType) {
    case 1:
      return { x: moveW * Math.sin(phase), y: 0 };
    case 2:
      return { x: 0, y: moveH * Math.sin(phase) };
    case 3:
      return { x: moveW * Math.cos(phase), y: moveH * Math.sin(phase) };
    default:
      return { x: 0, y: 0 };
  }
}

export function normalizedRect(left, right, top, bottom) {
  return {
    left: Math.min(left, right),
    right: Math.max(left, right),
    top: Math.min(top, bottom),
    bottom: Math.max(top, bottom),
  };
}

export function objectFrameOpacity(meta, state, obj) {
  if (!meta) return 1;

  // Use accumulated opacity from animation state (C++ Animation parity)
  if (state && typeof state.opacity === "number") {
    const alpha = state.opacity / 255;
    return Math.max(0, Math.min(1, alpha));
  }

  // Fallback for non-animated objects or before animation state is created
  const start = safeNumber(meta.opacityStart, 255);
  const end = safeNumber(meta.opacityEnd, start);
  if (start === 255 && end === 255) return 1;

  const frameDelay = obj?.frameDelays?.[state?.frameIndex ?? 0] ?? 0;
  const timer = safeNumber(state?.timerMs, 0);
  const t = frameDelay > 0 ? Math.max(0, Math.min(1, timer / frameDelay)) : 0;
  const alpha = (start + (end - start) * t) / 255;
  return Math.max(0, Math.min(1, alpha));
}

export function rectsOverlap(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function playerTouchBoxMetrics(player) {
  const action = String(player?.action ?? "");
  const prone = !player.climbing && player.onGround && (action === "prone" || action === "proneStab" || action === "sit");

  return prone
    ? { halfWidth: PLAYER_TOUCH_HITBOX_PRONE_HALF_WIDTH, height: PLAYER_TOUCH_HITBOX_PRONE_HEIGHT }
    : { halfWidth: PLAYER_TOUCH_HITBOX_HALF_WIDTH, height: PLAYER_TOUCH_HITBOX_HEIGHT };
}

export function playerTouchBounds(player) {
  const lastX = Number.isFinite(player.prevX) ? player.prevX : player.x;
  const lastY = Number.isFinite(player.prevY) ? player.prevY : player.y;
  const metrics = playerTouchBoxMetrics(player);

  return normalizedRect(
    Math.min(lastX, player.x) - metrics.halfWidth,
    Math.max(lastX, player.x) + metrics.halfWidth,
    Math.min(lastY, player.y) - metrics.height,
    Math.max(lastY, player.y),
  );
}

export function trapWorldBounds(obj, meta, nowMs) {
  if (!obj || !meta) return null;

  const moveOffset = objectMoveOffset(obj.motion ?? meta, nowMs);
  const vectors = meta.vectors ?? {};
  const lt = vectors.lt;
  const rb = vectors.rb;

  if (lt && rb) {
    const ltX = safeNumber(lt.x, 0);
    const rbX = safeNumber(rb.x, 0);
    const leftOffsetX = obj.flipped ? -rbX : ltX;
    const rightOffsetX = obj.flipped ? -ltX : rbX;

    return normalizedRect(
      obj.x + moveOffset.x + leftOffsetX,
      obj.x + moveOffset.x + rightOffsetX,
      obj.y + moveOffset.y + safeNumber(lt.y, 0),
      obj.y + moveOffset.y + safeNumber(rb.y, 0),
    );
  }

  // Fallback to sprite dimensions for frames without lt/rb (e.g. laser
  // fade-in). Skip tiny frames (≤4px) like electric 1×1 cooldown blanks.
  // Skip invisible frames (opacityStart=0 on non-animated objects like stoneDM waiting state).
  const width = safeNumber(meta.width, 0);
  const height = safeNumber(meta.height, 0);
  if (width <= 4 || height <= 4) return null;
  if (safeNumber(meta.opacityStart, 255) === 0) return null;

  const origin = vectors.origin ?? { x: 0, y: 0 };
  const drawOriginX = obj.flipped ? width - safeNumber(origin.x, 0) : safeNumber(origin.x, 0);
  const left = obj.x - drawOriginX + moveOffset.x;
  const top = obj.y - safeNumber(origin.y, 0) + moveOffset.y;

  return normalizedRect(left, left + width, top, top + height);
}

/**
 * Apply mob/trap touch hit.
 * Client handles: invincibility timer, knockback, blink visuals.
 * Server handles: damage calculation, HP deduction (via damage_taken → stats_update).
 * @param {string|null} mobId  WZ mob ID (e.g. "100100") — null for traps
 * @param {number} damage      estimated damage (used for traps; mob damage comes from server)
 * @param {number} sourceCenterX  X position of the damage source
 * @param {number} nowMs       current timestamp
 */
export function applyPlayerTouchHit(mobId, damage, sourceCenterX, nowMs) {
  const player = runtime.player;

  player.trapInvincibleUntil = nowMs + TRAP_HIT_INVINCIBILITY_MS;
  player.lastTrapHitAt = nowMs;

  fn.triggerPlayerHitVisuals(nowMs);

  // Knockback: probabilistic based on stance (even while climbing)
  const dead = player.hp <= 0;
  if (!dead) {
    const stance = (runtime.player.stance ?? 0) / 100;
    if (Math.random() > stance) {
      // Detach from rope/ladder if climbing
      if (player.climbing) {
        player.climbing = false;
        player.climbRope = null;
      }
      const hitFromLeft = sourceCenterX > player.x;
      player.vx = (hitFromLeft ? -PLAYER_KB_HSPEED : PLAYER_KB_HSPEED) * PHYS_TPS;
      player.vy = -PLAYER_KB_VFORCE * PHYS_TPS;
      player.onGround = false;
      player.footholdId = null;
      player.downJumpIgnoreFootholdId = null;
      player.downJumpIgnoreUntil = 0;
      player.knockbackClimbLockUntil = nowMs + 600;
      player.downJumpControlLock = false;
      player.downJumpTargetFootholdId = null;
    }
  }

  if (runtime.map) {
    player.x = clampXToSideWalls(player.x, runtime.map);
  }

  // Tell server — it calculates real damage and deducts HP
  const direction = sourceCenterX > player.x ? 0 : 1;
  if (mobId) {
    wsSend({ type: "damage_taken", mob_id: mobId, direction });
  } else {
    // Trap damage: server trusts client value (traps are map-defined, not exploitable)
    wsSend({ type: "damage_taken", trap_damage: damage, direction });
  }
}

export function applyTrapHit(damage, trapBounds, nowMs) {
  const trapCenterX = (trapBounds.left + trapBounds.right) * 0.5;
  applyPlayerTouchHit(null, damage, trapCenterX, nowMs);
}

export function mobFrameWorldBounds(life, state, anim) {
  const stance = anim?.stances?.[state.stance] ?? anim?.stances?.stand;
  if (!stance || stance.frames.length === 0) return null;

  const frame = stance.frames[state.frameIndex % stance.frames.length];
  if (!frame) return null;

  const worldX = state.phobj ? state.phobj.x : life.x;
  const worldY = state.phobj ? state.phobj.y : life.cy;
  const width = Math.max(1, safeNumber(frame.width, 1));
  const height = Math.max(1, safeNumber(frame.height, 1));
  const originX = safeNumber(frame.originX, 0);
  const originY = safeNumber(frame.originY, 0);
  const flip = state.canMove ? state.facing === 1 : life.f === 1;

  const left = flip ? worldX + originX - width : worldX - originX;
  const top = worldY - originY;
  return normalizedRect(left, left + width, top, top + height);
}

export function updateMobTouchCollisions() {
  if (!runtime.map) return;
  if (runtime.gmMouseFly && runtime.input.ctrlHeld) return;

  const player = runtime.player;
  const nowMs = performance.now();
  if (nowMs < player.trapInvincibleUntil) return;

  const touchBounds = playerTouchBounds(player);

  for (const [idx, state] of lifeRuntimeState) {
    const life = runtime.map.lifeEntries[idx];
    if (!life || life.type !== "m") continue;
    if (state.dead || state.dying) continue;

    const anim = lifeAnimations.get(`m:${life.id}`);
    if (!anim?.touchDamageEnabled) continue;

    const mobBounds = mobFrameWorldBounds(life, state, anim);
    if (!mobBounds) continue;
    if (!rectsOverlap(touchBounds, mobBounds)) continue;

    const mobX = state.phobj ? state.phobj.x : life.x;
    applyPlayerTouchHit(String(life.id), anim.touchAttack, mobX, nowMs);
    break;
  }
}

export function updateTrapHazardCollisions() {
  if (!runtime.map) return;
  if (runtime.gmMouseFly && runtime.input.ctrlHeld) return;

  const player = runtime.player;
  const nowMs = performance.now();
  if (nowMs < player.trapInvincibleUntil) return;

  const hazards = runtime.map.trapHazards ?? [];
  if (hazards.length === 0) return;

  const touchBounds = playerTouchBounds(player);

  for (const hazard of hazards) {
    const meta = currentObjectFrameMeta(hazard.layerIndex, hazard.obj);
    if (!isDamagingTrapMeta(meta)) continue;

    // Skip collision when trap is barely visible (< 10% opacity)
    const obj = hazard.obj;
    if (obj.frameDelays && obj.frameCount > 1) {
      const stateKey = `${hazard.layerIndex}:${obj.id}`;
      const animState = objectAnimStates.get(stateKey);
      if (animState && animState.opacity < 26) continue; // 26/255 ≈ 10%
    }

    const bounds = trapWorldBounds(hazard.obj, meta, nowMs);
    if (!bounds) continue;
    if (!rectsOverlap(touchBounds, bounds)) continue;

    applyTrapHit(meta.damage ?? hazard.baseDamage, bounds, nowMs);
    break;
  }
}

export function drawMapLayer(layer) {
  const visible = visibleSpritesForLayer(layer);
  const nowMs = performance.now();

  // C++ parity (MapTilesObjs.cpp TilesObjs::draw): objects draw first (behind),
  // then tiles draw on top. Tiles are floors/platforms that cover decorative objects.
  for (const obj of visible.objects) {
    // Determine which frame to show
    let frameKey = obj.key;
    let objectAnimState = null;
    if (obj.frameDelays && obj.frameCount > 1) {
      const stateKey = `${layer.layerIndex}:${obj.id}`;
      objectAnimState = objectAnimStates.get(stateKey) ?? null;
      if (objectAnimState) {
        const frameToken = obj.frameKeys?.[objectAnimState.frameIndex] ?? objectAnimState.frameIndex;
        frameKey = `${obj.baseKey}:${frameToken}`;
      }
    }

    let image = getImageByKey(frameKey);
    let meta = getMetaByKey(frameKey);

    if (!image || !meta) {
      image = image ?? getImageByKey(obj.key);
      meta = meta ?? getMetaByKey(obj.key);
    }

    if (!meta) {
      requestObjectMeta(obj);
      continue;
    }

    if (!image) continue;

    const origin = meta.vectors.origin ?? { x: 0, y: 0 };
    const moveOffset = objectMoveOffset(obj.motion ?? meta, nowMs);
    const width = Math.max(1, image.width || meta.width || 1);
    const height = Math.max(1, image.height || meta.height || 1);
    const drawOriginX = obj.flipped ? width - origin.x : origin.x;
    const worldX = obj.x - drawOriginX + moveOffset.x;
    const worldY = obj.y - origin.y + moveOffset.y;
    if (!isWorldRectVisible(worldX, worldY, width, height)) {
      runtime.perf.culledSprites += 1;
      continue;
    }

    const frameOpacity = objectFrameOpacity(meta, objectAnimState, obj);

    runtime.perf.objectsDrawn += 1;
    if (frameOpacity < 0.999) {
      ctx.save();
      ctx.globalAlpha *= frameOpacity;
      drawWorldImage(image, worldX, worldY, { flipped: obj.flipped });
      ctx.restore();
    } else {
      drawWorldImage(image, worldX, worldY, { flipped: obj.flipped });
    }
  }

  // Tiles draw on top of objects (floors/platforms cover decorative objects)
  for (const tile of visible.tiles) {
    if (!tile.key) continue;

    const image = getImageByKey(tile.key);
    const meta = getMetaByKey(tile.key);

    if (!meta) {
      requestTileMeta(tile);
      continue;
    }

    if (!image) continue;

    const origin = meta.vectors.origin ?? { x: 0, y: 0 };
    const worldX = tile.x - origin.x;
    const worldY = tile.y - origin.y;
    const width = Math.max(1, image.width || meta.width || 1);
    const height = Math.max(1, image.height || meta.height || 1);
    if (!isWorldRectVisible(worldX, worldY, width, height)) {
      runtime.perf.culledSprites += 1;
      continue;
    }

    runtime.perf.tilesDrawn += 1;
    drawWorldImage(image, worldX, worldY);
  }
}

export function currentPlayerRenderLayer() {
  if (!runtime.map) return safeNumber(runtime.player.footholdLayer, -1);
  if (runtime.player.climbing) return 7;
  if (!runtime.player.onGround) return 7;
  return safeNumber(runtime.player.footholdLayer, -1);
}

export function buildLifeLayerBuckets() {
  const buckets = new Map();
  for (const [idx, state] of lifeRuntimeState) {
    const layer = safeNumber(state.renderLayer, -1);
    let arr = buckets.get(layer);
    if (!arr) {
      arr = [];
      buckets.set(layer, arr);
    }
    arr.push([idx, state]);
  }
  return buckets;
}

/** Determine render layer for a remote player from footholds at their position. */
export function remotePlayerRenderLayer(rp) {
  if (!runtime.map) return 7;
  const fh = findFootholdAtXNearY(runtime.map, rp.renderX, rp.renderY, 30)
          || findFootholdBelow(runtime.map, rp.renderX, rp.renderY - 50);
  return fh?.line?.layer ?? 7;
}

export function buildRemotePlayerLayerBuckets() {
  const buckets = new Map();
  for (const [, rp] of remotePlayers) {
    const layer = remotePlayerRenderLayer(rp);
    let arr = buckets.get(layer);
    if (!arr) { arr = []; buckets.set(layer, arr); }
    arr.push(rp);
  }
  return buckets;
}

/**
 * Draw all map layers with character, life, reactors, and drops interleaved per-layer.
 * C++ Stage::draw order per layer: tilesobjs → reactors → npcs/mobs → chars/player → drops.
 * @param {Object} [hooks] — optional per-layer draw callbacks to avoid circular imports.
 * @param {function(number)} [hooks.drawReactorsForLayer] — draw reactors on this layer
 * @param {function(number)} [hooks.drawDropsForLayer] — draw ground drops on this layer
 */
export function drawMapLayersWithCharacter(hooks) {
  if (!runtime.map) return;

  const lifeLayerBuckets = buildLifeLayerBuckets();
  const rpLayerBuckets = buildRemotePlayerLayerBuckets();
  const playerLayer = currentPlayerRenderLayer();
  let playerDrawn = false;
  const drawReactorsForLayer = hooks?.drawReactorsForLayer;
  const drawDropsForLayer = hooks?.drawDropsForLayer;

  for (const layer of runtime.map.layers) {
    drawMapLayer(layer);

    // C++ parity: reactors draw after tiles/objs but before life sprites
    if (drawReactorsForLayer) drawReactorsForLayer(layer.layerIndex);

    drawLifeSprites(layer.layerIndex, lifeLayerBuckets.get(layer.layerIndex) ?? []);

    // Draw remote players on this layer
    const rpOnLayer = rpLayerBuckets.get(layer.layerIndex);
    if (rpOnLayer) {
      for (const rp of rpOnLayer) drawRemotePlayer(rp);
    }

    // Draw local player at their layer (on top of remote players on same layer)
    if (!playerDrawn && layer.layerIndex === playerLayer) {
      drawCharacter();
      playerDrawn = true;
    }

    // C++ parity: drops draw after player on this layer
    if (drawDropsForLayer) drawDropsForLayer(layer.layerIndex);
  }

  if (!playerDrawn) {
    drawCharacter();
  }
  // Draw any remote players whose layer didn't match any map layer
  for (const [layerIdx, rps] of rpLayerBuckets) {
    if (!runtime.map.layers.some(l => l.layerIndex === layerIdx)) {
      for (const rp of rps) drawRemotePlayer(rp);
    }
  }
}


export function zOrderForPart(partName, meta) {
  const candidates = [meta?.zName, partName].filter((value) => typeof value === "string" && value.length > 0);

  for (const candidate of candidates) {
    if (runtime.zMapOrder[candidate] !== undefined) {
      return runtime.zMapOrder[candidate];
    }
  }

  return 100000;
}

export function mergeMapAnchors(anchors, meta, image, topLeft, flipped) {
  for (const vectorName of Object.keys(meta?.vectors ?? {})) {
    if (vectorName === "origin") continue;

    const world = worldPointFromTopLeft(meta, image, topLeft, vectorName, flipped);
    if (!anchors[vectorName]) {
      anchors[vectorName] = world;
    }
  }
}

export function pickAnchorName(meta, anchors) {
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

export function characterTemplateCacheKey(action, frameIndex, flipped, faceExpression, faceFrameIndex) {
  return `${action}:${frameIndex}:${flipped ? 1 : 0}:${faceExpression}:${faceFrameIndex}`;
}

export function getCharacterPlacementTemplate(action, frameIndex, flipped, faceExpression, faceFrameIndex) {
  const cacheKey = characterTemplateCacheKey(action, frameIndex, flipped, faceExpression, faceFrameIndex);
  if (characterPlacementTemplateCache.has(cacheKey)) {
    return characterPlacementTemplateCache.get(cacheKey);
  }

  const frame = fn.getCharacterFrameData(action, frameIndex, faceExpression, faceFrameIndex);
  if (!frame || !frame.parts?.length) return null;

  const partAssets = frame.parts
    .map((part) => {
      const key = `char:${action}:${frameIndex}:${part.name}`;
      fn.requestCharacterPartImage(key, part.meta);
      const image = getImageByKey(key);
      return {
        ...part,
        key,
        image,
      };
    })
    .filter((part) => !!part.image && !!part.meta);

  // Avoid caching incomplete templates when expected parts are still decoding.
  // If any part's image is pending, return null to reuse the last complete frame.
  const expectedFacePart = frame.parts.find((part) => typeof part.name === "string" && part.name.startsWith("face:"));
  if (expectedFacePart && !partAssets.some((part) => part.name === expectedFacePart.name)) {
    return null;
  }
  // Same for equip parts — don't cache a template missing equip sprites
  const expectedEquipParts = frame.parts.filter((part) => typeof part.name === "string" && part.name.startsWith("equip:"));
  for (const ep of expectedEquipParts) {
    if (!partAssets.some((part) => part.name === ep.name)) {
      return null; // equip image still loading — don't cache incomplete template
    }
  }

  const body = partAssets.find((part) => part.name === "body");
  if (!body) return null;

  const bodyTopLeft = topLeftFromAnchor(body.meta, body.image, { x: 0, y: 0 }, null, flipped);
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

      // C++ parity: face should anchor to brow when available.
      // Face frames carry expression-specific `map.brow` offsets and must use them
      // (equivalent to C++ Face::Frame texture.shift(-brow) behavior).
      const isFacePart = typeof part.name === "string" && part.name.startsWith("face:");
      const anchorName = isFacePart
        ? (anchors.brow ? "brow" : pickAnchorName(part.meta, anchors))
        : pickAnchorName(part.meta, anchors);
      if (!anchorName) continue;

      const anchorVectorName = anchorName;
      const topLeft = topLeftFromAnchor(part.meta, part.image, anchors[anchorName], anchorVectorName, flipped);
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

  const template = placements
    .sort((a, b) => a.zOrder - b.zOrder)
    .map((part) => ({
      ...part,
      offsetX: part.topLeft.x,
      offsetY: part.topLeft.y,
    }));

  characterPlacementTemplateCache.set(cacheKey, template);
  return template;
}

export function composeCharacterPlacements(
  action,
  frameIndex,
  player,
  flipped,
  faceExpression = runtime.faceAnimation.expression,
  faceFrameIndex = runtime.faceAnimation.frameIndex,
) {
  const template = getCharacterPlacementTemplate(
    action,
    frameIndex,
    flipped,
    faceExpression,
    faceFrameIndex,
  );
  if (!template || template.length === 0) return null;

  return template.map((part) => ({
    ...part,
    topLeft: {
      x: player.x + part.offsetX,
      y: player.y + part.offsetY,
    },
  }));
}

export function characterBoundsFromPlacements(placements) {
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

// (splitWordByWidth, wrapBubbleTextToWidth moved to util.js)

export function playerHitBlinkColorScale(nowMs) {
  const player = runtime.player;
  if (nowMs >= player.trapInvincibleUntil) {
    return 1;
  }

  const elapsed = Math.max(0, nowMs - player.lastTrapHitAt);
  const progress = Math.max(0, Math.min(1, elapsed / TRAP_HIT_INVINCIBILITY_MS));
  const phi = progress * 30;
  const rgb = 0.9 - 0.5 * Math.abs(Math.sin(phi)); // C++ Char::draw invincible pulse
  return Math.max(0.4, Math.min(0.9, rgb));
}

export function drawCharacter() {
  const player = runtime.player;
  const flipped = player.facing > 0;

  const faceExpression = runtime.faceAnimation.expression;
  const faceFrameIndex = runtime.faceAnimation.frameIndex;

  const currentPlacements = composeCharacterPlacements(
    player.action,
    player.frameIndex,
    player,
    flipped,
    faceExpression,
    faceFrameIndex,
  );
  const fallback = runtime.lastRenderableCharacterFrame;
  const fallbackFaceExpression = fallback?.faceExpression ?? faceExpression;
  const fallbackFaceFrameIndex = fallback?.faceFrameIndex ?? faceFrameIndex;
  const placements =
    currentPlacements ??
    (fallback
      ? composeCharacterPlacements(
          fallback.action,
          fallback.frameIndex,
          player,
          flipped,
          fallbackFaceExpression,
          fallbackFaceFrameIndex,
        )
      : null);

  if (!placements || placements.length === 0) {
    return;
  }

  if (currentPlacements) {
    runtime.lastRenderableCharacterFrame = {
      action: player.action,
      frameIndex: player.frameIndex,
      faceExpression,
      faceFrameIndex,
    };
  }

  const bounds = characterBoundsFromPlacements(placements);
  if (bounds) {
    runtime.lastCharacterBounds = bounds;
    if (player.action === "stand1") {
      runtime.standardCharacterWidth = Math.max(40, Math.min(120, Math.round(bounds.width)));
    }
  }

  // Draw chair sprite below character (z=-1)
  // The chair's bottom edge aligns with the player's feet (ground level).
  // Flipped to match the player's facing direction.
  if (player.chairId) {
    const chairSprite = _chairSpriteCache.get(player.chairId);
    if (chairSprite?.img) {
      const sc = worldToScreen(player.x, player.y);
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

  // Draw set effect behind character (e.g. Zakum Helmet glow)
  const localEquipIds = [...playerEquipped.values()].map(e => e.id);
  const localSetEff = fn.findActiveSetEffect(localEquipIds);

  if (localSetEff && !_localSetEffect.active) {
    _localSetEffect.active = true;
    _localSetEffect.frameIndex = 0;
    _localSetEffect.frameTimer = 0;
  } else if (!localSetEff) {
    _localSetEffect.active = false;
  }
  fn.drawSetEffect(player.x, player.y, localSetEff, _localSetEffect);

  const blinkColorScale = playerHitBlinkColorScale(performance.now());
  if (blinkColorScale < 0.999) {
    ctx.save();
    ctx.filter = `brightness(${Math.round(blinkColorScale * 100)}%)`;
  }

  for (const part of placements) {
    drawWorldImage(part.image, part.topLeft.x, part.topLeft.y, { flipped });
  }

  if (blinkColorScale < 0.999) {
    ctx.restore();
  }

  // Level up effect (drawn on top of player)
  fn.updateAndDrawLocalLevelUpEffect(runtime._lastDtMs || 16);
}

