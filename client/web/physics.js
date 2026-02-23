/**
 * physics.js — Player physics, foothold helpers, wall collision, gravity,
 * swimming, climbing, camera update.
 */
import {
  fn, runtime, canvasEl,
  dlog, rlog, gameViewWidth, gameViewHeight, cameraHeightBias,
  PHYS_TPS, PHYS_GRAVFORCE, PHYS_FRICTION, PHYS_SLOPEFACTOR, PHYS_GROUNDSLIP,
  PHYS_FALL_BRAKE, PHYS_HSPEED_DEADZONE, PHYS_FALL_SPEED_CAP, PHYS_MAX_LAND_SPEED,
  PHYS_ROPE_JUMP_HMULT, PHYS_ROPE_JUMP_VDIV, PHYS_CLIMB_ACTION_DELAY_MS,
  PHYS_SWIMGRAVFORCE, PHYS_SWIMFRICTION, PHYS_SWIM_HFRICTION, PHYS_FLYFORCE,
  PHYS_SWIM_HFORCE, PHYS_SWIM_JUMP_MULT, PHYS_DEFAULT_SPEED_STAT, PHYS_DEFAULT_JUMP_STAT,
  PLAYER_TOUCH_HITBOX_HEIGHT, PLAYER_TOUCH_HITBOX_HALF_WIDTH,
  FALL_DAMAGE_THRESHOLD, FALL_DAMAGE_PERCENT,
  PORTAL_SPAWN_Y_OFFSET,
  PLAYER_KB_HSPEED, PLAYER_KB_VFORCE, TRAP_HIT_INVINCIBILITY_MS,
} from "./state.js";
import { safeNumber } from "./util.js";
import {
  fhGroundAt, fhIsWall, fhLeft, fhRight, fhSlope,
  clampCameraXToMapBounds, clampCameraYToMapBounds,
  portalMomentumEase, spawnDamageNumber, updatePlayerAttack,
} from "./life.js";

export function findGroundLanding(oldX, oldY, newX, newY, map, excludedFootholdId = null) {
  const moveX = newX - oldX;
  const moveY = newY - oldY;
  if (moveY < 0) return null;

  let best = null;
  let bestT = Number.POSITIVE_INFINITY;

  for (const line of map.footholdLines) {
    if (excludedFootholdId && String(line.id) === String(excludedFootholdId)) continue;
    if (fhIsWall(line)) continue;

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

export function findFootholdAtXNearY(map, x, targetY, maxDistance = 24) {
  let best = null;

  for (const line of map.footholdLines ?? []) {
    if (fhIsWall(line)) continue;
    const yAtX = fhGroundAt(line, x);
    if (yAtX === null) continue;
    const distance = Math.abs(yAtX - targetY);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { y: yAtX, line, distance };
    }
  }

  return best;
}

export function findFootholdById(map, footholdId) {
  if (!footholdId) return null;
  return map.footholdById?.get(String(footholdId)) ?? null;
}

export function findFootholdBelow(map, x, minY, excludedFootholdId = null) {
  let best = null;
  let bestY = Infinity;

  for (const fh of map.footholdLines ?? []) {
    if (fhIsWall(fh)) continue;
    if (excludedFootholdId && String(fh.id) === String(excludedFootholdId)) continue;
    const gy = fhGroundAt(fh, x);
    if (gy === null || gy < minY - 1) continue;
    if (gy < bestY) {
      bestY = gy;
      best = { y: gy, line: fh };
    }
  }

  return best;
}

// (footholdLeft, footholdRight, isWallFoothold aliases removed — use fhLeft, fhRight, fhIsWall)

export function rangesOverlap(a1, a2, b1, b2) {
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const minB = Math.min(b1, b2);
  const maxB = Math.max(b1, b2);
  return maxA >= minB && maxB >= minA;
}

export function isBlockingWall(foothold, minY, maxY) {
  if (!foothold || !fhIsWall(foothold)) return false;
  return rangesOverlap(foothold.y1, foothold.y2, minY, maxY);
}

// Check if a tall wall column (pre-indexed, >= 500px total height) has any
// segment blocking the given Y range. Returns false for short/unindexed columns.
export function isTallWallColumnBlocking(map, wallX, minY, maxY) {
  const col = map.wallColumnsByX?.get(Math.round(wallX));
  if (!col) return false;
  const segments = col.segments;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.y2 >= minY && seg.y1 <= maxY) return true;
  }
  return false;
}

// C++ FootholdTree::get_wall parity with tall-wall extension.
// Standard path: check prev/prevprev (left) or next/nextnext (right) with
// the 50px Y window [nextY-50, nextY-1].
// Extension: when a chain-discovered wall is part of a tall column (>= 500px),
// check the full column so players can't jump through boundary walls.
export function getWallX(map, current, left, nextY) {
  const minY = Math.floor(nextY) - 50;
  const maxY = Math.floor(nextY) - 1;

  if (left) {
    const prev = findFootholdById(map, current.prevId);
    if (prev && fhIsWall(prev)) {
      if (isBlockingWall(prev, minY, maxY) || isTallWallColumnBlocking(map, prev.x1, minY, maxY)) {
        return fhLeft(current);
      }
    }

    const prevPrev = prev ? findFootholdById(map, prev.prevId) : null;
    if (prevPrev && fhIsWall(prevPrev)) {
      if (isBlockingWall(prevPrev, minY, maxY) || isTallWallColumnBlocking(map, prevPrev.x1, minY, maxY)) {
        return fhLeft(prev);
      }
    }

    return map.walls?.left ?? map.bounds.minX;
  }

  const next = findFootholdById(map, current.nextId);
  if (next && fhIsWall(next)) {
    if (isBlockingWall(next, minY, maxY) || isTallWallColumnBlocking(map, next.x1, minY, maxY)) {
      return fhRight(current);
    }
  }

  const nextNext = next ? findFootholdById(map, next.nextId) : null;
  if (nextNext && fhIsWall(nextNext)) {
    if (isBlockingWall(nextNext, minY, maxY) || isTallWallColumnBlocking(map, nextNext.x1, minY, maxY)) {
      return fhRight(next);
    }
  }

  return map.walls?.right ?? map.bounds.maxX;
}

export function sideWallBounds(map) {
  return {
    // Prefer C++-style inset walls (left+25/right-25). Raw foothold extrema are fallback only.
    left: safeNumber(map.walls?.left, map.footholdBounds?.minX ?? map.bounds.minX),
    right: safeNumber(map.walls?.right, map.footholdBounds?.maxX ?? map.bounds.maxX),
  };
}

export function clampXToSideWalls(x, map) {
  const walls = sideWallBounds(map);
  return Math.max(walls.left, Math.min(walls.right, x));
}

export function resolveWallCollision(oldX, newX, nextY, map, footholdId) {
  if (newX === oldX) return clampXToSideWalls(newX, map);

  const left = newX < oldX;
  const current = findFootholdById(map, footholdId);

  let resolvedX = newX;

  if (current) {
    const wallX = getWallX(map, current, left, nextY);
    const collision = left ? oldX >= wallX && resolvedX <= wallX : oldX <= wallX && resolvedX >= wallX;
    if (collision) resolvedX = wallX;
  } else {
    const walls = sideWallBounds(map);
    const wallX = left ? walls.left : walls.right;
    const collision = left ? oldX >= wallX && resolvedX <= wallX : oldX <= wallX && resolvedX >= wallX;
    if (collision) resolvedX = wallX;
  }

  return clampXToSideWalls(resolvedX, map);
}

// (footholdSlope alias removed — use fhSlope)

export function playerWalkforce() {
  return 0.05 + 0.11 * runtime.player.stats.speed / 100;
}

export function playerJumpforce() {
  return 1.0 + 3.5 * runtime.player.stats.jump / 100;
}

export function playerClimbforce() {
  return runtime.player.stats.speed / 100;
}

export function applyGroundPhysics(hspeedTick, hforceTick, slope, numTicks) {
  let hacc = hforceTick;

  if (hacc === 0 && Math.abs(hspeedTick) < PHYS_HSPEED_DEADZONE) {
    return 0;
  }

  const inertia = hspeedTick / PHYS_GROUNDSLIP;
  const slopef = Math.max(-0.5, Math.min(0.5, slope));
  hacc -= (PHYS_FRICTION + PHYS_SLOPEFACTOR * (1 + slopef * -inertia)) * inertia;

  return hspeedTick + hacc * numTicks;
}

/** Unclamped Y interpolation (allows extrapolation). For walls, returns min Y. */
export function groundYOnFoothold(foothold, x) {
  const dx = foothold.x2 - foothold.x1;
  if (Math.abs(dx) < 0.01) return Math.min(foothold.y1, foothold.y2);
  const t = (x - foothold.x1) / dx;
  return foothold.y1 + (foothold.y2 - foothold.y1) * t;
}

export function resolveFootholdForX(map, foothold, x) {
  let current = foothold;
  let resolvedX = x;

  for (let step = 0; step < 8 && current; step += 1) {
    const left = fhLeft(current);
    const right = fhRight(current);

    if (Math.floor(resolvedX) > right) {
      const next = findFootholdById(map, current.nextId);
      if (!next || fhIsWall(next)) {
        return { foothold: null, x: resolvedX };
      }

      current = next;
      continue;
    }

    if (Math.ceil(resolvedX) < left) {
      const prev = findFootholdById(map, current.prevId);
      if (!prev || fhIsWall(prev)) {
        return { foothold: null, x: resolvedX };
      }

      current = prev;
      continue;
    }

    return { foothold: current, x: resolvedX };
  }

  return { foothold: current, x: resolvedX };
}

export function climbDownAttachTolerancePx() {
  return Math.max(20, Math.round(runtime.standardCharacterWidth * 0.33));
}

export function ladderInRange(rope, x, y, upwards) {
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

export function ladderFellOff(rope, y, downwards) {
  const y1 = Math.min(rope.y1, rope.y2);
  const y2 = Math.max(rope.y1, rope.y2);
  const dy = downwards ? y + 5 : y - 5;

  return dy > y2 || y + 5 < y1;
}

export function findAttachableRope(map, x, y, upwards) {
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

export function climbSnapX(rope) {
  return rope.x - 1;
}

export function updatePlayer(dt) {
  if (!runtime.map) return;

  const player = runtime.player;
  const map = runtime.map;

  player.prevX = player.x;
  player.prevY = player.y;

  // GM MouseFly: hold Ctrl to move player to mouse position
  if (runtime.gmMouseFly && runtime.input.ctrlHeld) {
    player.x = runtime.mouseWorld.x;
    player.y = runtime.mouseWorld.y;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.onRope = false;
    player.action = "stand1";
    return;
  }

  // C++ Player::can_attack blocks movement while attacking — freeze all input
  const isAttacking = player.attacking;
  const move = isAttacking ? 0 : (runtime.input.left ? -1 : 0) + (runtime.input.right ? 1 : 0);
  const climbDir = isAttacking ? 0 : (runtime.input.up ? -1 : 0) + (runtime.input.down ? 1 : 0);
  const jumpQueued = isAttacking ? false : runtime.input.jumpQueued;
  const jumpRequested = (runtime.npcDialogue.active || isAttacking) ? false : (jumpQueued || runtime.input.jumpHeld);
  runtime.input.jumpQueued = isAttacking ? runtime.input.jumpQueued : false;

  const nowMs = performance.now();
  const climbOnCooldown = nowMs < player.climbCooldownUntil;
  const reattachLocked = nowMs < player.reattachLockUntil;
  const wantsClimbUp = runtime.input.up && !runtime.input.down;
  const wantsClimbDown = runtime.input.down;

  const downAttachCandidate = wantsClimbDown
    ? findAttachableRope(map, player.x, player.y, false)
    : null;
  const prioritizeDownAttach = !!downAttachCandidate && wantsClimbDown && player.onGround;

  // Auto-stand from chair on any movement input
  if (player.chairId && (move !== 0 || jumpRequested || climbDir !== 0)) {
    fn.standUpFromChair();
  }

  const crouchRequested = runtime.input.down && player.onGround && !player.climbing && !prioritizeDownAttach;
  const downJumpMovementLocked = player.downJumpControlLock && !player.onGround;
  const npcDialogueLock = runtime.npcDialogue.active;
  const effectiveMove = crouchRequested || downJumpMovementLocked || npcDialogueLock ? 0 : move;

  if (!player.climbing && effectiveMove !== 0) {
    player.facing = effectiveMove > 0 ? 1 : -1;
  }

  const allowClimbAttachNow = !climbOnCooldown || prioritizeDownAttach;
  const knockbackLocked = nowMs < player.knockbackClimbLockUntil;
  if (!player.climbing && allowClimbAttachNow && !knockbackLocked) {
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
      player.climbAttachTime = nowMs;
      player.x = climbSnapX(rope);
      player.vx = 0;
      player.vy = 0;
      player.onGround = false;
      player.footholdId = null;
    }
  }

  if (player.climbing && player.climbRope) {
    const climbActionReady = nowMs >= player.climbAttachTime + PHYS_CLIMB_ACTION_DELAY_MS;
    const sideJumpRequested = jumpRequested && move !== 0 && climbActionReady;

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
      player.climbCooldownUntil = nowMs + 400;
      fn.playSfx("Game", "Jump");
    } else {
      const rope = player.climbRope;
      const climbSpeed = playerClimbforce() * PHYS_TPS;

      const ropeTopY = Math.min(rope.y1, rope.y2);
      const ropeBottomY = Math.max(rope.y1, rope.y2);
      const atTop = player.y <= ropeTopY;
      const atBottom = player.y >= ropeBottomY;
      const movingUp = runtime.input.up && !runtime.input.down && !atTop;
      const movingDown = runtime.input.down && !runtime.input.up && !atBottom;

      player.x = climbSnapX(rope);
      player.y += (movingDown ? 1 : movingUp ? -1 : 0) * climbSpeed * dt;
      player.vx = 0;
      player.vy = movingDown ? climbSpeed : movingUp ? -climbSpeed : 0;
      player.onGround = false;

      // Check for exit at top: when at top and pressing up, snap to platform
      const wantsUp = runtime.input.up && !runtime.input.down;
      if (atTop && wantsUp) {
        const topFh = findFootholdAtXNearY(map, player.x, ropeTopY, 24);
        if (topFh && !fhIsWall(topFh.line)) {
          player.climbing = false;
          player.climbRope = null;
          player.downJumpIgnoreFootholdId = null;
          player.downJumpIgnoreUntil = 0;
          player.downJumpControlLock = false;
          player.downJumpTargetFootholdId = null;
          player.reattachLockRopeKey = rope.key ?? null;
          player.reattachLockUntil = nowMs + 200;
          player.climbCooldownUntil = nowMs + 400;
          player.y = topFh.y;
          player.vx = 0;
          player.vy = 0;
          player.onGround = true;
          player.footholdId = topFh.line.id;
          player.footholdLayer = topFh.line.layer;
        }
      }

      // Check for exit at bottom: when at bottom and pressing down, snap to platform
      const wantsDown = runtime.input.down && !runtime.input.up;
      if (atBottom && wantsDown) {
        const bottomFh = findFootholdAtXNearY(map, player.x, ropeBottomY, 24);
        if (bottomFh && !fhIsWall(bottomFh.line)) {
          player.climbing = false;
          player.climbRope = null;
          player.downJumpIgnoreFootholdId = null;
          player.downJumpIgnoreUntil = 0;
          player.downJumpControlLock = false;
          player.downJumpTargetFootholdId = null;
          player.reattachLockRopeKey = rope.key ?? null;
          player.reattachLockUntil = nowMs + 200;
          player.climbCooldownUntil = nowMs + 400;
          player.y = bottomFh.y;
          player.vx = 0;
          player.vy = 0;
          player.onGround = true;
          player.footholdId = bottomFh.line.id;
          player.footholdLayer = bottomFh.line.layer;
        }
      }

      if (ladderFellOff(rope, player.y, movingDown)) {
        const ropeTopY2 = Math.min(rope.y1, rope.y2);
        const ropeBottomY2 = Math.max(rope.y1, rope.y2);
        const exitedFromTop = !movingDown && player.y + 5 < ropeTopY2;
        const exitedFromBottom = movingDown && player.y > ropeBottomY2;

        if (exitedFromTop) {
          // Past top — clamp at rope top, stay climbing
          player.y = ropeTopY2;
          player.vy = 0;
        } else if (exitedFromBottom) {
          // Fell off bottom — detach and drop
          player.climbing = false;
          player.climbRope = null;
          player.reattachLockRopeKey = rope.key ?? null;
          player.reattachLockUntil = nowMs + 200;
          player.climbCooldownUntil = nowMs + 400;
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

    const slope = currentFoothold && !fhIsWall(currentFoothold)
      ? fhSlope(currentFoothold)
      : 0;

    if (player.onGround) {
      const hforceTick = effectiveMove * playerWalkforce();
      let hspeedTick = player.vx / PHYS_TPS;

      hspeedTick = applyGroundPhysics(hspeedTick, hforceTick, slope, numTicks);

      player.vx = hspeedTick * PHYS_TPS;
      player.vy = 0;

      if (jumpRequested) {
        const footholdGround =
          currentFoothold && !fhIsWall(currentFoothold)
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
          fn.playSfx("Game", "Jump");
        } else if (!downJumpRequested) {
          player.vy = -playerJumpforce() * PHYS_TPS;
          player.onGround = false;
          player.downJumpIgnoreFootholdId = null;
          player.downJumpIgnoreUntil = 0;
          player.downJumpControlLock = false;
          player.downJumpTargetFootholdId = null;
          player.footholdId = null;
          fn.playSfx("Game", "Jump");
        }
      }
    }

    if (!player.onGround) {
      let hspeedTick = player.vx / PHYS_TPS;
      let vspeedTick = player.vy / PHYS_TPS;

      if (map.swim && !player.climbing) {
        // ── Water environment physics ──
        // Based on C++ move_swimming with tuned constants:
        // - Higher horizontal friction (SWIM_HFRICTION=0.14) for sluggish side movement
        // - Reduced horizontal force (SWIM_HFORCE=0.12) vs normal flyforce
        // - SWIMGRAVFORCE=0.03 gently pulls player down
        // - Space/UP = discrete swim-jump impulse (55% of normal jump force)
        //   Player can jump repeatedly to bob upward against gravity
        player.swimming = true;

        // Swim-jump: fires continuously while Space is held — player can
        // jump upward as many times as they want.
        // Skip if player is in a down-jump (don't override the drop velocity).
        if (jumpRequested && !player.downJumpControlLock) {
          vspeedTick = -playerJumpforce() * PHYS_SWIM_JUMP_MULT;
        }

        // Horizontal and vertical directional force (reduced for water)
        let hforce = 0;
        let vforce = 0;
        if (runtime.input.left && !runtime.input.right) hforce = -PHYS_SWIM_HFORCE;
        else if (runtime.input.right && !runtime.input.left) hforce = PHYS_SWIM_HFORCE;
        if (runtime.input.up && !runtime.input.down) vforce = -PHYS_FLYFORCE;
        else if (runtime.input.down && !runtime.input.up) vforce = PHYS_SWIM_HFORCE;

        // Per-tick integration: friction + gravity + directional force
        for (let t = 0; t < numTicks; t++) {
          let hacc = hforce;
          let vacc = vforce;
          hacc -= PHYS_SWIM_HFRICTION * hspeedTick;
          vacc -= PHYS_SWIMFRICTION * vspeedTick;
          vacc += PHYS_SWIMGRAVFORCE;
          hspeedTick += hacc;
          vspeedTick += vacc;
        }

        // Deadzone: zero speed when no force and speed near zero
        if (hforce === 0 && Math.abs(hspeedTick) < 0.1) hspeedTick = 0;
        if (vforce === 0 && Math.abs(vspeedTick) < 0.1) vspeedTick = 0;

        player.vx = hspeedTick * PHYS_TPS;
        player.vy = vspeedTick * PHYS_TPS;
      } else {
        // ── Normal airborne: C++ move_normal (not on ground) ──
        // Original pre-swim physics restored exactly.
        player.swimming = false;

        vspeedTick += PHYS_GRAVFORCE * numTicks;

        if (effectiveMove < 0 && hspeedTick > 0) {
          hspeedTick -= PHYS_FALL_BRAKE * numTicks;
        } else if (effectiveMove > 0 && hspeedTick < 0) {
          hspeedTick += PHYS_FALL_BRAKE * numTicks;
        }

        player.vx = hspeedTick * PHYS_TPS;
        player.vy = Math.min(vspeedTick * PHYS_TPS, PHYS_FALL_SPEED_CAP);
      }
    } else {
      player.swimming = false;
    }

    let horizontalApplied = false;

    if (player.onGround && (!currentFoothold || fhIsWall(currentFoothold))) {
      player.onGround = false;
      player.footholdId = null;
    }

    if (player.onGround && currentFoothold && !fhIsWall(currentFoothold)) {
      const oldX = player.x;
      let nextX = oldX + player.vx * dt;
      nextX = resolveWallCollision(oldX, nextX, player.y, map, currentFoothold.id);
      horizontalApplied = true;

      const footholdResolution = resolveFootholdForX(map, currentFoothold, nextX);
      const nextFoothold = footholdResolution?.foothold ?? null;
      const resolvedX = footholdResolution?.x ?? nextX;

      if (nextFoothold && !fhIsWall(nextFoothold)) {
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

        // Fall damage: if fell more than threshold, apply % HP damage + full knockback
        const fallDist = player.y - player.fallStartY;
        if (fallDist > FALL_DAMAGE_THRESHOLD) {
          const ticks = Math.floor((fallDist - FALL_DAMAGE_THRESHOLD) / FALL_DAMAGE_THRESHOLD) + 1;
          const damage = Math.max(1, Math.round(player.maxHp * FALL_DAMAGE_PERCENT * ticks));
          player.hp = Math.max(1, player.hp - damage);
          player.fallStartY = player.y; // reset so bounce landing doesn't re-trigger
          // Full knockback + blink + damage number (same as mob/trap hit)
          const nowMs = performance.now();
          const hitFromX = player.x + player.facing * 10;
          fn.triggerPlayerHitVisuals(nowMs);
          spawnDamageNumber(player.x - 10, player.y, damage, false);
          player.trapInvincibleUntil = nowMs + TRAP_HIT_INVINCIBILITY_MS;
          player.lastTrapHitAt = nowMs;
          player.lastTrapHitDamage = damage;
          // C++ knockback: hspeed = ±1.5, vforce -= 3.5
          const hitFromLeft = hitFromX > player.x;
          player.vx = (hitFromLeft ? -PLAYER_KB_HSPEED : PLAYER_KB_HSPEED) * PHYS_TPS;
          player.vy = -PLAYER_KB_VFORCE * PHYS_TPS;
          player.onGround = false;
          player.footholdId = null;
          player.knockbackClimbLockUntil = nowMs + 600;
        }
      } else {
        player.onGround = false;
        player.footholdId = null;
      }
    }
  }

  // Track fall start for fall damage — use the highest point (lowest Y)
  // during the current airborne period as the reference
  if (player.onGround || player.climbing) {
    player.fallStartY = player.y;
  } else {
    player.fallStartY = Math.min(player.fallStartY, player.y);
  }

  const unclampedX = player.x;
  player.x = clampXToSideWalls(player.x, map);
  if (player.x !== unclampedX) {
    if (player.x < unclampedX && player.vx > 0) player.vx = 0;
    if (player.x > unclampedX && player.vx < 0) player.vx = 0;
  }

  player.x = Math.max(map.bounds.minX - 40, Math.min(map.bounds.maxX + 40, player.x));
  if (player.y > map.bounds.maxY + 400) {
    const spawn = map.portalEntries.find((portal) => portal.type === 0) ?? map.portalEntries[0];
    player.x = spawn ? spawn.x : 0;
    player.y = spawn ? spawn.y : 0;
    player.prevX = player.x;
    player.prevY = player.y;
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
    player.trapInvincibleUntil = 0;
    player.fallStartY = player.y;
  }

  const crouchActive =
    runtime.input.down &&
    player.onGround &&
    !player.climbing;

  const crouchAction = fn.getCharacterActionFrames("prone").length > 0 ? "prone" : "sit";

  let climbAction = "ladder";
  if (player.climbRope && !player.climbRope.ladder && fn.getCharacterActionFrames("rope").length > 0) {
    climbAction = "rope";
  }

  // Update attack animation (handles its own timer + termination)
  updatePlayerAttack(dt);

  // Attack stance overrides normal action — character must finish attack animation
  if (player.attacking && player.attackStance) {
    const attackAction = player.attackStance;
    if (player.action !== attackAction) {
      player.action = attackAction;
    }
    player.frameIndex = player.attackFrameIndex;
  } else if (!player.chairId) {
    const nextAction = player.climbing
      ? climbAction
      : crouchActive
        ? crouchAction
        : player.swimming
          ? "fly"
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
  }

  if (!player.attacking) {
    const frameData = fn.getCharacterFrameData(player.action, player.frameIndex);
    const delayMs = frameData?.delay ?? 180;
    const freezeClimbFrame = player.climbing && climbDir === 0;

    if (!freezeClimbFrame) {
      player.frameTimer += dt * 1000;
      if (player.frameTimer >= delayMs) {
        player.frameTimer = 0;
        const adjustedAction = fn.adjustStanceForWeapon(player.action);
        const frames = fn.getCharacterActionFrames(adjustedAction);
        if (frames.length > 0) {
          player.frameIndex = (player.frameIndex + 1) % frames.length;
        }
      }
    }
  }
}

export function updateCamera(dt) {
  if (!runtime.map) return;

  if (runtime.portalScroll.active) {
    const scroll = runtime.portalScroll;
    scroll.elapsedMs += dt * 1000;

    // Update target to player's current position (player may settle during scroll)
    scroll.targetX = clampCameraXToMapBounds(runtime.map, runtime.player.x);
    scroll.targetY = clampCameraYToMapBounds(runtime.map, runtime.player.y - cameraHeightBias());

    const duration = Math.max(1, scroll.durationMs);
    const t = Math.max(0, Math.min(1, scroll.elapsedMs / duration));
    const easedT = portalMomentumEase(t);

    runtime.camera.x = scroll.startX + (scroll.targetX - scroll.startX) * easedT;
    runtime.camera.y = scroll.startY + (scroll.targetY - scroll.startY) * easedT;
    runtime.camera.x = clampCameraXToMapBounds(runtime.map, runtime.camera.x);
    runtime.camera.y = clampCameraYToMapBounds(runtime.map, runtime.camera.y);

    if (t >= 1) {
      // Snap to player's current position (may have shifted during scroll)
      runtime.camera.x = clampCameraXToMapBounds(runtime.map, runtime.player.x);
      runtime.camera.y = clampCameraYToMapBounds(runtime.map, runtime.player.y - cameraHeightBias());
      scroll.active = false;
    }

    return;
  }

  const targetX = runtime.player.x;
  const targetY = runtime.player.y - cameraHeightBias();
  const smoothing = Math.min(1, dt * 8);

  runtime.camera.x += (targetX - runtime.camera.x) * smoothing;
  runtime.camera.y += (targetY - runtime.camera.y) * smoothing;
  runtime.camera.x = clampCameraXToMapBounds(runtime.map, runtime.camera.x);
  runtime.camera.y = clampCameraYToMapBounds(runtime.map, runtime.camera.y);
}
