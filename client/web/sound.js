/**
 * sound.js — Audio system: BGM, SFX, UI sounds, mob sounds, pools, unlock.
 */
import {
  fn, runtime,
  dlog, rlog, soundDataUriCache, soundDataPromiseCache,
  BGM_FADE_DURATION_MS, BGM_TARGET_VOLUME, SFX_POOL_SIZE,
  DEFAULT_MOB_HIT_SOUND, DEFAULT_MOB_DIE_SOUND,
} from "./state.js";
import { fetchJson, childByName, soundPathFromName } from "./util.js";
import { lifeAnimations } from "./life.js";

// ── UI Sounds ──
export let _uiSoundsPreloaded = false;
const _uiSoundCache = {};

export async function preloadUISounds() {
  if (_uiSoundsPreloaded) return;
  _uiSoundsPreloaded = true;
  try {
    const uiSoundJson = await fetchJson("/resourcesv2/Sound.wz/UI.img.json");
    for (const name of ["BtMouseClick", "BtMouseOver", "MenuUp", "MenuDown", "DragStart", "DragEnd"]) {
      const node = uiSoundJson?.$$?.find(c => (c.$imgdir ?? c.$canvas ?? c.$sound) === name);
      if (node?.basedata) {
        _uiSoundCache[name] = `data:audio/mp3;base64,${node.basedata}`;
      }
    }
    // Also preload game sounds
    const gameSoundJson = await fetchJson("/resourcesv2/Sound.wz/Game.img.json");
    for (const name of ["PickUpItem", "DropItem"]) {
      const node = gameSoundJson?.$$?.find(c => (c.$imgdir ?? c.$canvas ?? c.$sound) === name);
      if (node?.basedata) {
        _uiSoundCache[name] = `data:audio/mp3;base64,${node.basedata}`;
      }
    }
    // Preload reactor hit/break sounds (Reactor.img > 2000 = reactor 0002000)
    try {
      const reactorSoundJson = await fetchJson("/resourcesv2/Sound.wz/Reactor.img.json");
      const r2000 = reactorSoundJson?.$$?.find(c => c.$imgdir === "2000");
      if (r2000) {
        // State 0 hit sound (normal hit)
        const s0 = r2000.$$?.find(c => c.$imgdir === "0");
        const hitNode = s0?.$$?.find(c => c.$sound === "Hit");
        if (hitNode?.basedata) _uiSoundCache["ReactorHit"] = `data:audio/mp3;base64,${hitNode.basedata}`;
        // State 3 hit sound (break/destroy)
        const s3 = r2000.$$?.find(c => c.$imgdir === "3");
        const breakNode = s3?.$$?.find(c => c.$sound === "Hit");
        if (breakNode?.basedata) _uiSoundCache["ReactorBreak"] = `data:audio/mp3;base64,${breakNode.basedata}`;
      }
    } catch (e) { /* reactor sounds optional */ }
  } catch (e) {
    dlog("warn", "[ui] Failed to preload UI sounds: " + (e.message || e));
  }
}

const _lastUISoundTime = {};
export function playUISound(name) {
  if (!runtime.settings.sfxEnabled) return;
  const uri = _uiSoundCache[name];
  if (!uri) return;
  // Debounce: skip if the same sound played less than 100ms ago
  const now = performance.now();
  if (now - (_lastUISoundTime[name] || 0) < 100) return;
  _lastUISoundTime[name] = now;
  const audio = getSfxFromPool(uri);
  if (audio) {
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }
}


// ── Core Audio System ──
export function findSoundNodeByName(root, soundName) {
  if (!root) return null;

  // Support path-style names like "0120100/Damage" — walk $imgdir segments
  const parts = soundName.split("/");
  let current = root;

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i];
    const isLast = i === parts.length - 1;
    let found = null;

    for (const child of current.$$ ?? []) {
      if (child.$imgdir === segment) {
        found = child;
        break;
      }
      if (isLast && child.$sound === segment && child.basedata) {
        return child;
      }
    }

    if (!found) {
      // Fallback: recursive search for flat $sound match (BGM etc.)
      if (i === 0) {
        for (const child of current.$$ ?? []) {
          if (child.$sound === soundName && child.basedata) return child;
          const result = findSoundNodeByName(child, soundName);
          if (result) return result;
        }
      }
      return null;
    }

    // Resolve UOL references (e.g. "../0100100/Damage")
    if (found.$uol && found.value) {
      const uolPath = found.value;
      // Resolve "../" relative paths by navigating from root
      // UOL like "../0100100/Damage" means: go up one level, then into 0100100/Damage
      // Since we track path segments, resolve against root with cleaned path
      const currentPath = parts.slice(0, i);
      const uolParts = uolPath.split("/");
      const resolved = [...currentPath];
      for (const p of uolParts) {
        if (p === "..") resolved.pop();
        else if (p !== ".") resolved.push(p);
      }
      // Recurse with the resolved absolute path
      return findSoundNodeByName(root, resolved.join("/"));
    }

    if (isLast && found.basedata) return found;
    current = found;
  }

  return null;
}

export function requestSoundDataUri(soundFile, soundName) {
  const key = `sound:${soundFile}:${soundName}`;

  if (soundDataUriCache.has(key)) {
    return Promise.resolve(soundDataUriCache.get(key));
  }

  if (!soundDataPromiseCache.has(key)) {
    soundDataPromiseCache.set(
      key,
      (async () => {
        const json = await fetchJson(soundPathFromName(soundFile));
        const soundNode = findSoundNodeByName(json, soundName);
        if (!soundNode?.basedata) {
          throw new Error(`Sound not found: ${soundFile}/${soundName}`);
        }

        const dataUri = `data:audio/mp3;base64,${soundNode.basedata}`;
        soundDataUriCache.set(key, dataUri);
        soundDataPromiseCache.delete(key);
        return dataUri;
      })(),
    );
  }

  return soundDataPromiseCache.get(key);
}

export function unlockAudio() {
  if (runtime.audioUnlocked) return;
  runtime.audioUnlocked = true;

  // Retry pending BGM after user gesture unlocks audio
  if (runtime.settings.bgmEnabled && runtime.currentBgmPath && !runtime.bgmAudio) {
    playBgmPath(runtime.currentBgmPath);
  }
}


export function fadeOutAudio(audio, durationMs) {
  if (!audio) return;
  const startVol = audio.volume;
  const startTime = performance.now();
  const tick = () => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / durationMs, 1);
    audio.volume = startVol * (1 - t);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      audio.pause();
      audio.volume = 0;
    }
  };
  requestAnimationFrame(tick);
}

export async function playBgmPath(bgmPath) {
  if (!bgmPath) return;

  runtime.currentBgmPath = bgmPath;
  runtime.audioDebug.lastBgm = bgmPath;
  if (!runtime.settings.bgmEnabled) return;

  const [soundFile, soundName] = bgmPath.split("/");
  if (!soundFile || !soundName) return;

  try {
    const dataUri = await requestSoundDataUri(soundFile, soundName);

    if (runtime.currentBgmPath !== bgmPath) {
      return;
    }

    // Fade out previous BGM instead of hard stop
    if (runtime.bgmAudio) {
      fadeOutAudio(runtime.bgmAudio, BGM_FADE_DURATION_MS);
      runtime.bgmAudio = null;
    }

    const audio = new Audio(dataUri);
    audio.loop = true;
    audio.volume = BGM_TARGET_VOLUME;
    runtime.bgmAudio = audio;

    await audio.play();
    runtime.audioUnlocked = true;
  } catch (error) {
    if (error.name === "NotAllowedError") {
      // Browser autoplay blocked — clear bgmAudio so unlockAudio() can retry
      runtime.bgmAudio = null;
      dlog("warn", "[audio] BGM blocked by autoplay policy, will retry on user gesture");
    } else {
      dlog("warn", `[audio] bgm failed: ${error}`);
    }
  }
}

const sfxPool = new Map(); // key -> Audio[]

export function getSfxFromPool(dataUri) {
  let pool = sfxPool.get(dataUri);
  if (!pool) {
    pool = [];
    sfxPool.set(dataUri, pool);
  }

  // Find an idle audio element
  for (const audio of pool) {
    if (audio.paused || audio.ended) {
      audio.currentTime = 0;
      return audio;
    }
  }

  // Create a new one if pool isn't full
  if (pool.length < SFX_POOL_SIZE) {
    const audio = new Audio(dataUri);
    audio.volume = 0.45;
    pool.push(audio);
    return audio;
  }

  // All busy — skip this SFX
  return null;
}

export async function playSfx(soundFile, soundName) {
  runtime.audioDebug.lastSfx = `${soundFile}/${soundName}`;
  runtime.audioDebug.lastSfxAtMs = performance.now();
  runtime.audioDebug.sfxPlayCount += 1;

  if (!runtime.settings.sfxEnabled) return;

  try {
    const dataUri = await requestSoundDataUri(soundFile, soundName);
    const audio = getSfxFromPool(dataUri);
    if (audio) {
      audio.volume = 0.45;
      audio.play().catch(() => {});
    }
  } catch (error) {
    dlog("warn", `[audio] sfx failed: ${soundFile} ${soundName} ${error}`);
  }
}

/** Play a sound effect with a fallback if the primary doesn't exist. */
export async function playSfxWithFallback(soundFile, soundName, fallbackSoundName) {
  try {
    const dataUri = await requestSoundDataUri(soundFile, soundName);
    if (dataUri) {
      runtime.audioDebug.lastSfx = `${soundFile}/${soundName}`;
      runtime.audioDebug.lastSfxAtMs = performance.now();
      runtime.audioDebug.sfxPlayCount += 1;
      if (!runtime.settings.sfxEnabled) return;
      const audio = getSfxFromPool(dataUri);
      if (audio) { audio.volume = 0.45; audio.play().catch(() => {}); }
      return;
    }
  } catch (_) { /* primary not found, try fallback */ }
  playSfx(soundFile, fallbackSoundName);
}

// Default mob sounds (Snail — 0100100, the most common base mob)

/**
 * Play a mob sound effect with fallback to default (Snail) if not found.
 * C++ loads hitsound/diesound from Sound["Mob.img"][strid]; if the node is
 * empty the Sound stays id=0 and play() is a no-op. We improve on this by
 * falling back to the most common mob sound.
 */
export async function playMobSfx(mobId, soundType) {
  const paddedId = mobId.replace(/^0+/, "").padStart(7, "0");
  const soundName = `${paddedId}/${soundType}`;
  const fallbackName = soundType === "Die" ? DEFAULT_MOB_DIE_SOUND : DEFAULT_MOB_HIT_SOUND;

  runtime.audioDebug.lastSfx = `Mob.img/${soundName}`;
  runtime.audioDebug.lastSfxAtMs = performance.now();
  runtime.audioDebug.sfxPlayCount += 1;

  if (!runtime.settings.sfxEnabled) return;

  try {
    const dataUri = await requestSoundDataUri("Mob.img", soundName);
    const audio = getSfxFromPool(dataUri);
    if (audio) { audio.volume = 0.45; audio.play().catch(() => {}); }
  } catch (_) {
    // Mob-specific sound not found — try default
    try {
      const dataUri = await requestSoundDataUri("Mob.img", fallbackName);
      const audio = getSfxFromPool(dataUri);
      if (audio) { audio.volume = 0.45; audio.play().catch(() => {}); }
    } catch (e2) {
      dlog("warn", `[audio] mob sfx fallback failed: ${soundName} ${e2}`);
    }
  }
}
