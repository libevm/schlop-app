#!/usr/bin/env bun
/**
 * Convert resourcesv2 JSON (.img.json) → resourcesv3 XML (.img.xml)
 * Produces Harepacker-compatible Classic XML format.
 *
 * Usage: bun run tools/convert-json-to-xml.mjs
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname, relative } from "path";

const SRC = "resourcesv2";
const DST = "resourcesv3";
const CONCURRENCY = 32;

// ─── XML special char escaping (matches Harepacker's XmlUtil.SanitizeText) ───

function esc(text) {
  if (!text) return "";
  let r = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    switch (ch) {
      case '"':  r += "&quot;"; break;
      case "'":  r += "&apos;"; break;
      case "&":  r += "&amp;";  break;
      case "<":  r += "&lt;";   break;
      case ">":  r += "&gt;";   break;
      default:   r += ch;
    }
  }
  return r;
}

// ─── JSON node → XML string ─────────────────────────────────────────────────

function nodeToXml(node, depth) {
  const pad = "  ".repeat(depth);

  // Canvas node
  if (node.$canvas !== undefined) {
    const name = esc(String(node.$canvas));
    const w = node.width ?? 0;
    const h = node.height ?? 0;
    const bd = node.basedata ? ` basedata="${node.basedata}"` : "";
    const children = node.$$ ?? [];
    if (children.length > 0) {
      let xml = `${pad}<canvas name="${name}" width="${w}" height="${h}"${bd}>\n`;
      for (const child of children) {
        xml += nodeToXml(child, depth + 1);
      }
      xml += `${pad}</canvas>\n`;
      return xml;
    }
    return `${pad}<canvas name="${name}" width="${w}" height="${h}"${bd}/>\n`;
  }

  // Vector node
  if (node.$vector !== undefined) {
    return `${pad}<vector name="${esc(String(node.$vector))}" x="${node.x}" y="${node.y}"/>\n`;
  }

  // Sound node
  if (node.$sound !== undefined) {
    const name = esc(String(node.$sound));
    const parts = [`name="${name}"`];
    if (node.length !== undefined) parts.push(`length="${node.length}"`);
    if (node.basehead) parts.push(`basehead="${node.basehead}"`);
    if (node.basedata) parts.push(`basedata="${node.basedata}"`);
    return `${pad}<sound ${parts.join(" ")}/>\n`;
  }

  // UOL node
  if (node.$uol !== undefined) {
    return `${pad}<uol name="${esc(String(node.$uol))}" value="${esc(String(node.value ?? ""))}"/>\n`;
  }

  // Null node
  if (node.$null !== undefined) {
    return `${pad}<null name="${esc(String(node.$null))}"/>\n`;
  }

  // Int node
  if (node.$int !== undefined) {
    return `${pad}<int name="${esc(String(node.$int))}" value="${node.value}"/>\n`;
  }

  // Short node
  if (node.$short !== undefined) {
    return `${pad}<short name="${esc(String(node.$short))}" value="${node.value}"/>\n`;
  }

  // Long node
  if (node.$long !== undefined) {
    return `${pad}<long name="${esc(String(node.$long))}" value="${node.value}"/>\n`;
  }

  // Float node
  if (node.$float !== undefined) {
    let v = String(node.value);
    if (!v.includes(".")) v += ".0";
    return `${pad}<float name="${esc(String(node.$float))}" value="${v}"/>\n`;
  }

  // Double node
  if (node.$double !== undefined) {
    let v = String(node.value);
    if (!v.includes(".")) v += ".0";
    return `${pad}<double name="${esc(String(node.$double))}" value="${v}"/>\n`;
  }

  // String node
  if (node.$string !== undefined) {
    return `${pad}<string name="${esc(String(node.$string))}" value="${esc(String(node.value ?? ""))}"/>\n`;
  }

  // Extended (convex) node — Harepacker uses <extended> tag
  if (node.$extended !== undefined) {
    const name = esc(String(node.$extended));
    const children = node.$$ ?? [];
    if (children.length > 0) {
      let xml = `${pad}<extended name="${name}">\n`;
      for (const child of children) {
        xml += nodeToXml(child, depth + 1);
      }
      xml += `${pad}</extended>\n`;
      return xml;
    }
    return `${pad}<extended name="${name}"/>\n`;
  }

  // Imgdir (directory/sub-property) — must be last since it's the fallback container
  if (node.$imgdir !== undefined) {
    const name = esc(String(node.$imgdir));
    const children = node.$$ ?? [];
    if (children.length > 0) {
      let xml = `${pad}<imgdir name="${name}">\n`;
      for (const child of children) {
        xml += nodeToXml(child, depth + 1);
      }
      xml += `${pad}</imgdir>\n`;
      return xml;
    }
    return `${pad}<imgdir name="${name}"/>\n`;
  }

  // Unknown node type — skip with warning
  const keys = Object.keys(node).filter(k => k.startsWith("$"));
  if (keys.length > 0) {
    console.warn(`Unknown node type: ${keys.join(", ")}`);
  }
  return "";
}

function jsonToXml(root) {
  // Root is always an imgdir (the .img file)
  const name = esc(String(root.$imgdir ?? ""));
  const children = root.$$ ?? [];

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  xml += `<imgdir name="${name}">\n`;
  for (const child of children) {
    xml += nodeToXml(child, 1);
  }
  xml += `</imgdir>\n`;
  return xml;
}

// ─── File discovery ─────────────────────────────────────────────────────────

async function findJsonFiles(dir) {
  const results = [];

  async function walk(d) {
    const entries = await readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".img.json")) {
        results.push(full);
      }
    }
  }

  await walk(dir);
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Finding .img.json files...");
  const files = await findJsonFiles(SRC);
  console.log(`Found ${files.length} files to convert`);

  let done = 0;
  let errors = 0;
  const startTime = Date.now();

  // Worker pool
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= files.length) return;

      const srcPath = files[idx];
      const relPath = relative(SRC, srcPath);
      // .img.json → .img.xml
      const dstRel = relPath.replace(/\.img\.json$/, ".img.xml");
      const dstPath = join(DST, dstRel);

      try {
        const raw = await readFile(srcPath, "utf-8");
        const json = JSON.parse(raw);
        const xml = jsonToXml(json);

        await mkdir(dirname(dstPath), { recursive: true });
        await writeFile(dstPath, xml);

        done++;
        if (done % 500 === 0 || done === files.length) {
          const pct = ((done / files.length) * 100).toFixed(1);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  ${done}/${files.length} (${pct}%) — ${elapsed}s`);
        }
      } catch (err) {
        errors++;
        console.error(`ERROR: ${srcPath}: ${err.message}`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone: ${done} converted, ${errors} errors in ${elapsed}s`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
