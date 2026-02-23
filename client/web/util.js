/**
 * util.js — Pure utility functions for WZ node navigation and helpers.
 * No external dependencies beyond state.js.
 */
import { rlog, ctx, metaCache, imageCache, imagePromiseCache, jsonCache, cachedFetch, dlog } from './state.js';

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadJsonFromStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

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
      vectors[child.$vector] = { x: safeNumber(child.x, 0), y: safeNumber(child.y, 0) };
    }
    if (child.$imgdir === "map") {
      for (const mapVector of child.$$ ?? []) {
        if (!mapVector.$vector) continue;
        vectors[mapVector.$vector] = { x: safeNumber(mapVector.x, 0), y: safeNumber(mapVector.y, 0) };
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
  const vectors = vectorRecord(canvasNode);
  const leafRec = imgdirLeafRecord(canvasNode);
  return {
    basedata: canvasNode.basedata,
    width: safeNumber(canvasNode.width, 0),
    height: safeNumber(canvasNode.height, 0),
    vectors,
    zName: leafRec.z ?? null,
    delay: leafRec.delay ?? null,
    a0: leafRec.a0 ?? null,
    a1: leafRec.a1 ?? null,
  };
}

export function objectMetaExtrasFromNode(node) {
  const rec = imgdirLeafRecord(node);
  return {
    obstacle: rec.obstacle ?? 0,
    damage: rec.damage ?? 0,
    dir: rec.dir ?? 0,
  };
}

export function applyObjectMetaExtras(meta, extras) {
  if (extras.obstacle) meta.obstacle = extras.obstacle;
  if (extras.damage) meta.damage = extras.damage;
  if (extras.dir) meta.dir = extras.dir;
}

export function findNodeByPath(root, names) {
  let node = root;
  for (const name of names) {
    if (!node) return null;
    const children = node.$$ ?? [];
    node = children.find((c) => c.$imgdir === name || c.$canvas === name);
  }
  return node;
}

export function resolveNodeByUol(root, basePath, uolValue) {
  const baseSegments = basePath.split("/");
  const uolSegments = uolValue.split("/");
  const resolved = [...baseSegments];
  for (const seg of uolSegments) {
    if (seg === "..") resolved.pop();
    else resolved.push(seg);
  }
  let node = root;
  for (const seg of resolved) {
    if (!node) return null;
    const children = node.$$ ?? [];
    const match =
      children.find((c) => c.$imgdir === seg) ??
      children.find((c) => c.$canvas === seg);
    if (match) {
      if (match.$uol) {
        const resolvedPath = resolved.slice(0, resolved.indexOf(seg)).join("/");
        return resolveNodeByUol(root, resolvedPath, match.$uol);
      }
      node = match;
    } else {
      return null;
    }
  }
  return node;
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

// ─── Map / Sound Path Helpers ────────────────────────────────────────────────
export function mapPathFromId(mapId) {
  const padded = String(mapId).padStart(9, "0");
  const first = padded[0];
  return `/resourcesv2/Map.wz/Map/Map${first}/${padded}.img.json`;
}

export function soundPathFromName(soundFile) {
  return `/resourcesv2/Sound.wz/${soundFile}.img.json`;
}

// ─── Asset Cache Functions ───────────────────────────────────────────────────
const fetchJsonPromises = new Map();

export async function fetchJson(path) {
  if (jsonCache.has(path)) return jsonCache.get(path);
  if (fetchJsonPromises.has(path)) return fetchJsonPromises.get(path);
  const promise = (async () => {
    try {
      const resp = await cachedFetch(path);
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        if (text.startsWith("version https://git-lfs.github.com/spec/v1")) {
          dlog("error", `Git LFS pointer detected (not real asset data): ${path}`);
          throw new Error(`Git LFS pointer (not real data): ${path}`);
        }
        throw new Error(`fetchJson ${resp.status}: ${path}`);
      }
      const json = await resp.json();
      jsonCache.set(path, json);
      return json;
    } finally {
      fetchJsonPromises.delete(path);
    }
  })();
  fetchJsonPromises.set(path, promise);
  return promise;
}

export function getMetaByKey(key) {
  return metaCache.get(key) ?? null;
}

const metaPromiseCache2 = new Map();
export function requestMeta(key, loader) {
  if (metaCache.has(key)) return metaCache.get(key);
  if (metaPromiseCache2.has(key)) return metaPromiseCache2.get(key);
  const promise = (async () => {
    try {
      const meta = await loader();
      if (meta) metaCache.set(key, meta);
      return meta;
    } finally {
      metaPromiseCache2.delete(key);
    }
  })();
  metaPromiseCache2.set(key, promise);
  return promise;
}

export function requestImageByKey(key) {
  if (imageCache.has(key)) return imageCache.get(key);
  if (imagePromiseCache.has(key)) return imagePromiseCache.get(key);
  const meta = metaCache.get(key);
  if (!meta?.basedata || typeof meta.basedata !== "string" || meta.basedata.length < 8) {
    if (meta && !meta.basedata) rlog(`BAD BASEDATA for ${key}`);
    return Promise.resolve(null);
  }
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { imageCache.set(key, img); imagePromiseCache.delete(key); resolve(img); };
    img.onerror = () => { rlog(`IMG DECODE FAIL: ${key}`); imagePromiseCache.delete(key); resolve(null); };
    img.src = `data:image/png;base64,${meta.basedata}`;
  });
  imagePromiseCache.set(key, promise);
  return promise;
}

export function getImageByKey(key) {
  const img = imageCache.get(key);
  if (img) return img;
  if (!imagePromiseCache.has(key)) requestImageByKey(key);
  return null;
}

// ─── Text Drawing Helpers ────────────────────────────────────────────────────
export function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
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
  return lines;
}

export function roundRect(ctx, x, y, w, h, r, topOnly = false) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  if (topOnly) {
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
  } else {
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
  }
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ─── World Coordinate Helpers ────────────────────────────────────────────────
import { runtime, canvasEl, ctx as ctxRef, gameViewWidth, gameViewHeight } from './state.js';

export function worldToScreen(worldX, worldY) {
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;
  return {
    x: Math.round(worldX - runtime.camera.x + halfW),
    y: Math.round(worldY - runtime.camera.y + halfH),
  };
}

export function isWorldRectVisible(worldX, worldY, width, height, margin = 96) {
  const halfW = gameViewWidth() / 2;
  const halfH = gameViewHeight() / 2;
  const screenX = worldX - runtime.camera.x + halfW;
  const screenY = worldY - runtime.camera.y + halfH;
  return (
    screenX + width + margin > 0 &&
    screenX - margin < gameViewWidth() &&
    screenY + height + margin > 0 &&
    screenY - margin < gameViewHeight()
  );
}

export function drawWorldImage(image, worldX, worldY, opts = {}) {
  if (!image) return;
  const { x, y } = worldToScreen(worldX, worldY);
  const c = ctxRef;
  runtime.perf.drawCalls++;
  if (opts.flipped) {
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.scale(-1, 1);
    c.drawImage(image, -image.width, 0);
    c.restore();
  } else {
    c.drawImage(image, Math.round(x), Math.round(y));
  }
}

export function drawScreenImage(image, x, y, flipped) {
  if (!image) return;
  const c = ctxRef;
  runtime.perf.drawCalls++;
  if (flipped) {
    c.save();
    c.translate(Math.round(x), Math.round(y));
    c.scale(-1, 1);
    c.drawImage(image, -image.width, 0);
    c.restore();
  } else {
    c.drawImage(image, Math.round(x), Math.round(y));
  }
}

export function localPoint(meta, image, vectorName, flipped) {
  const v = meta?.vectors?.[vectorName];
  if (!v) return null;
  const x = flipped ? (image ? image.width - v.x : -v.x) : v.x;
  return { x, y: v.y };
}

export function topLeftFromAnchor(meta, image, anchorWorld, anchorName, flipped) {
  const local = localPoint(meta, image, anchorName, flipped);
  if (!local || !anchorWorld) return null;
  return { x: anchorWorld.x - local.x, y: anchorWorld.y - local.y };
}

export function worldPointFromTopLeft(meta, image, topLeft, vectorName, flipped) {
  const local = localPoint(meta, image, vectorName, flipped);
  if (!local || !topLeft) return null;
  return { x: topLeft.x + local.x, y: topLeft.y + local.y };
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
