/**
 * util.js — Pure utility functions for WZ node navigation and helpers.
 * Extracted from monolithic app.js — must stay in sync with original implementations.
 */
import {
  rlog, dlog, ctx, runtime, canvasEl,
  metaCache, metaPromiseCache, imageCache, imagePromiseCache, jsonCache, cachedFetch,
  gameViewWidth, gameViewHeight,
} from './state.js';
import { xmlToJsonNode } from './wz-xml-adapter.js';

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Safe JSON load from localStorage. Returns null on any failure. */
export function loadJsonFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Safe JSON save to localStorage. Silently ignores failures. */
export function saveJsonToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function childByName(node, name) {
  return (node?.$$ ?? []).find((child) => child.$imgdir === name);
}

export function imgdirChildren(node) {
  return (node?.$$ ?? []).filter((child) => typeof child.$imgdir === "string");
}

export function parseLeafValue(leaf) {
  if (leaf.$int) return Number.parseInt(leaf.value, 10);
  if (leaf.$float) return Number.parseFloat(leaf.value);
  if (leaf.$double) return Number.parseFloat(leaf.value);
  if (leaf.$short) return Number.parseInt(leaf.value, 10);
  if (leaf.$string) return String(leaf.value);
  return leaf.value;
}

export function imgdirLeafRecord(node) {
  const record = {};
  for (const child of node?.$$ ?? []) {
    const key = child.$int ?? child.$float ?? child.$string ?? child.$double ?? child.$short;
    if (!key) continue;
    record[key] = parseLeafValue(child);
  }
  return record;
}

export function vectorRecord(node) {
  const vectors = {};

  for (const child of node?.$$ ?? []) {
    if (child.$vector) {
      vectors[child.$vector] = {
        x: safeNumber(child.x, 0),
        y: safeNumber(child.y, 0),
      };
    }

    if (child.$imgdir === "map") {
      for (const mapVector of child.$$ ?? []) {
        if (!mapVector.$vector) continue;
        vectors[mapVector.$vector] = {
          x: safeNumber(mapVector.x, 0),
          y: safeNumber(mapVector.y, 0),
        };
      }
    }
  }

  return vectors;
}

export function pickCanvasNode(node, preferredIndex = "0") {
  if (!node) return null;
  if (node.$canvas) return node;

  const children = node.$$ ?? [];
  const directCanvas =
    children.find((child) => child.$canvas === preferredIndex) ??
    children.find((child) => typeof child.$canvas === "string");
  if (directCanvas) return directCanvas;

  const numericFrame =
    children.find((child) => child.$imgdir === preferredIndex) ??
    children.find((child) => /^\d+$/.test(child.$imgdir ?? ""));
  if (numericFrame) return pickCanvasNode(numericFrame, "0");

  return null;
}

export function canvasMetaFromNode(canvasNode) {
  if (!canvasNode?.basedata) return null;

  const leaf = imgdirLeafRecord(canvasNode);
  const hasA0 = Object.prototype.hasOwnProperty.call(leaf, "a0");
  const hasA1 = Object.prototype.hasOwnProperty.call(leaf, "a1");

  let opacityStart = 255;
  let opacityEnd = 255;
  if (hasA0 && hasA1) {
    opacityStart = safeNumber(leaf.a0, 255);
    opacityEnd = safeNumber(leaf.a1, 255);
  } else if (hasA0) {
    opacityStart = safeNumber(leaf.a0, 255);
    opacityEnd = 255 - opacityStart;
  } else if (hasA1) {
    opacityEnd = safeNumber(leaf.a1, 255);
    opacityStart = 255 - opacityEnd;
  }

  return {
    basedata: canvasNode.basedata,
    width: safeNumber(canvasNode.width, 0),
    height: safeNumber(canvasNode.height, 0),
    vectors: vectorRecord(canvasNode),
    zName: String(leaf.z ?? ""),
    moveType: safeNumber(leaf.moveType, 0),
    moveW: safeNumber(leaf.moveW, 0),
    moveH: safeNumber(leaf.moveH, 0),
    moveP: safeNumber(leaf.moveP, Math.PI * 2 * 1000),
    moveR: safeNumber(leaf.moveR, 0),
    opacityStart,
    opacityEnd,
  };
}

export function objectMetaExtrasFromNode(node) {
  const leaf = imgdirLeafRecord(node);
  return {
    obstacle: safeNumber(leaf.obstacle, 0),
    damage: safeNumber(leaf.damage, 0),
    hazardDir: safeNumber(leaf.dir, 0),
  };
}

export function applyObjectMetaExtras(meta, extras) {
  if (!meta) return null;
  return {
    ...meta,
    ...extras,
  };
}

export function mapPathFromId(mapId) {
  const id = String(mapId).trim();
  if (!/^\d{9}$/.test(id)) {
    throw new Error("Map ID must be 9 digits");
  }

  const prefix = id[0];
  return `/resourcesv3/Map.wz/Map/Map${prefix}/${id}.img.xml`;
}

export function soundPathFromName(soundFile) {
  const normalized = soundFile.endsWith(".img") ? soundFile : `${soundFile}.img`;
  return `/resourcesv3/Sound.wz/${normalized}.xml`;
}

// ─── World Coordinate Helpers ────────────────────────────────────────────────

export function worldToScreen(worldX, worldY) {
  return {
    x: Math.round(worldX - runtime.camera.x + gameViewWidth() / 2),
    y: Math.round(worldY - runtime.camera.y + gameViewHeight() / 2),
  };
}

export function isWorldRectVisible(worldX, worldY, width, height, margin = 96) {
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;
  const left = runtime.camera.x - halfW - margin;
  const right = runtime.camera.x + halfW + margin;
  const top = runtime.camera.y - halfH - margin;
  const bottom = runtime.camera.y + halfH + margin;

  return worldX + width >= left && worldX <= right && worldY + height >= top && worldY <= bottom;
}

export function drawWorldImage(image, worldX, worldY, opts = {}) {
  const screen = worldToScreen(worldX, worldY);
  const flipped = !!opts.flipped;

  if (!flipped) {
    ctx.drawImage(image, screen.x, screen.y);
    runtime.perf.drawCalls += 1;
    return;
  }

  ctx.save();
  ctx.translate(screen.x + image.width, screen.y);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0);
  runtime.perf.drawCalls += 1;
  ctx.restore();
}

export function drawScreenImage(image, x, y, flipped) {
  const drawX = Math.round(x);
  const drawY = Math.round(y);

  if (!flipped) {
    ctx.drawImage(image, drawX, drawY);
    runtime.perf.drawCalls += 1;
    return;
  }

  ctx.save();
  ctx.translate(drawX + image.width, drawY);
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0);
  runtime.perf.drawCalls += 1;
  ctx.restore();
}

export function localPoint(meta, image, vectorName, flipped) {
  const origin = meta?.vectors?.origin ?? { x: 0, y: image.height };
  const vector = vectorName ? meta?.vectors?.[vectorName] ?? { x: 0, y: 0 } : { x: 0, y: 0 };

  const baseX = origin.x + vector.x;
  const x = flipped ? image.width - baseX : baseX;
  const y = origin.y + vector.y;

  return { x, y };
}

export function topLeftFromAnchor(meta, image, anchorWorld, anchorName, flipped) {
  const anchorLocal = localPoint(meta, image, anchorName, flipped);

  return {
    x: anchorWorld.x - anchorLocal.x,
    y: anchorWorld.y - anchorLocal.y,
  };
}

export function worldPointFromTopLeft(meta, image, topLeft, vectorName, flipped) {
  const pointLocal = localPoint(meta, image, vectorName, flipped);
  return {
    x: topLeft.x + pointLocal.x,
    y: topLeft.y + pointLocal.y,
  };
}

// ─── Asset Cache Functions ───────────────────────────────────────────────────

export async function fetchJson(path) {
  if (!jsonCache.has(path)) {
    jsonCache.set(
      path,
      (async () => {
        const response = await cachedFetch(path);
        if (!response.ok) {
          const msg = `Failed to load ${path} (${response.status})`;
          console.error(`[fetchJson] FAIL: ${msg}`);
          rlog(`fetchJson FAIL: ${msg}`);
          throw new Error(msg);
        }
        if (path.endsWith(".xml")) {
          const text = await response.text();
          return xmlToJsonNode(text);
        }
        return response.json();
      })(),
    );
  }

  return jsonCache.get(path);
}

export function getMetaByKey(key) {
  return metaCache.get(key) ?? null;
}

export function requestMeta(key, loader) {
  if (metaCache.has(key)) {
    return metaCache.get(key);
  }

  if (!metaPromiseCache.has(key)) {
    metaPromiseCache.set(
      key,
      (async () => {
        try {
          const meta = await loader();
          if (meta) {
            metaCache.set(key, meta);
            return meta;
          }
        } catch (error) {
          dlog("warn", `[asset-meta] failed ${key}: ${error}`);
        } finally {
          metaPromiseCache.delete(key);
        }

        return null;
      })(),
    );
  }

  return metaPromiseCache.get(key);
}

export function requestImageByKey(key) {
  if (imageCache.has(key)) {
    return imageCache.get(key);
  }

  if (imagePromiseCache.has(key)) {
    return imagePromiseCache.get(key);
  }

  const meta = metaCache.get(key);
  if (!meta) {
    return null;
  }

  if (!meta.basedata || typeof meta.basedata !== "string" || meta.basedata.length < 8) {
    rlog(`BAD BASEDATA key=${key} type=${typeof meta.basedata} len=${meta.basedata?.length ?? 0}`);
    return null;
  }

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      imageCache.set(key, image);
      imagePromiseCache.delete(key);
      resolve(image);
    };
    image.onerror = () => {
      rlog(`IMG DECODE FAIL key=${key} basedataLen=${meta.basedata?.length ?? "N/A"}`);
      imagePromiseCache.delete(key);
      resolve(null);
    };
    image.src = `data:image/png;base64,${meta.basedata}`;
  });

  imagePromiseCache.set(key, promise);
  return promise;
}

export function getImageByKey(key) {
  const cached = imageCache.get(key);
  if (cached) return cached;
  requestImageByKey(key);
  return null;
}

// ─── WZ Node Navigation ─────────────────────────────────────────────────────

export function findNodeByPath(root, names) {
  let current = root;
  for (const name of names) {
    current = childByName(current, name);
    if (!current) return null;
  }
  return current;
}

export function resolveNodeByUol(root, basePath, uolValue) {
  if (!uolValue || typeof uolValue !== "string") {
    return null;
  }

  const targetPath = uolValue.startsWith("/") ? [] : [...basePath];
  const tokens = uolValue.split("/").filter((token) => token.length > 0);

  for (const token of tokens) {
    if (token === ".") continue;
    if (token === "..") {
      targetPath.pop();
      continue;
    }
    targetPath.push(token);
  }

  if (targetPath.length === 0) {
    return null;
  }

  let current = root;
  for (const segment of targetPath) {
    current = (current?.$$ ?? []).find(
      (child) =>
        child.$imgdir === segment ||
        child.$canvas === segment ||
        child.$vector === segment ||
        child.$sound === segment,
    );

    if (!current) {
      return null;
    }
  }

  return current;
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

// ─── Text Drawing Helpers ────────────────────────────────────────────────────

export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  // Split on explicit newlines first, then word-wrap each paragraph
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) { lines.push(""); continue; }
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  if (lines.length === 0) lines.push("");
  return lines;
}

export function roundRect(ctx, x, y, w, h, r, topOnly = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  if (topOnly) {
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
  } else {
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  }
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Text wrapping (moved from render.js) ────────────────────────────────────

export function splitWordByWidth(word, maxWidth) {
  if (ctx.measureText(word).width <= maxWidth) {
    return [word];
  }

  const chunks = [];
  let current = "";

  for (const char of word) {
    const candidate = current + char;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [word];
}

export function wrapBubbleTextToWidth(text, maxWidth) {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return [""];

  const words = normalized.split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const chunks = splitWordByWidth(word, maxWidth);

    for (const chunk of chunks) {
      if (!line) {
        line = chunk;
        continue;
      }

      const candidate = `${line} ${chunk}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = chunk;
      }
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}
