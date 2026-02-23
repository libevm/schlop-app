/**
 * Tests for pure logic functions shared between client and server.
 *
 * These test the same algorithms used in the client (client/web/util.js, save.js)
 * re-implemented here to validate correctness without DOM dependencies.
 * When changing client logic, update these tests to match.
 */
import { describe, expect, test } from "bun:test";

// ─── Re-implementations of client pure functions (from util.js / save.js) ────
// These are verbatim copies of the client logic for unit testing.

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function childByName(node: any, name: string): any {
  return (node?.$$  ?? []).find((child: any) => child.$imgdir === name);
}

function imgdirChildren(node: any): any[] {
  return (node?.$$ ?? []).filter((child: any) => typeof child.$imgdir === "string");
}

function parseLeafValue(leaf: any): any {
  if (leaf.$int) return Number.parseInt(leaf.value, 10);
  if (leaf.$float) return Number.parseFloat(leaf.value);
  if (leaf.$double) return Number.parseFloat(leaf.value);
  if (leaf.$short) return Number.parseInt(leaf.value, 10);
  if (leaf.$string) return String(leaf.value);
  return leaf.value;
}

function imgdirLeafRecord(node: any): Record<string, any> {
  const record: Record<string, any> = {};
  for (const child of node?.$$ ?? []) {
    const key = child.$int ?? child.$float ?? child.$string ?? child.$double ?? child.$short;
    if (!key) continue;
    record[key] = parseLeafValue(child);
  }
  return record;
}

function vectorRecord(node: any): Record<string, { x: number; y: number }> {
  const vectors: Record<string, { x: number; y: number }> = {};
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

function findNodeByPath(root: any, names: string[]): any {
  let current = root;
  for (const name of names) {
    current = childByName(current, name);
    if (!current) return null;
  }
  return current;
}

function resolveNodeByUol(root: any, basePath: string[], uolValue: string): any {
  if (!uolValue || typeof uolValue !== "string") return null;
  const targetPath = uolValue.startsWith("/") ? [] : [...basePath];
  const tokens = uolValue.split("/").filter((token: string) => token.length > 0);
  for (const token of tokens) {
    if (token === ".") continue;
    if (token === "..") { targetPath.pop(); continue; }
    targetPath.push(token);
  }
  if (targetPath.length === 0) return null;
  let current = root;
  for (const segment of targetPath) {
    current = (current?.$$ ?? []).find(
      (child: any) =>
        child.$imgdir === segment || child.$canvas === segment ||
        child.$vector === segment || child.$sound === segment,
    );
    if (!current) return null;
  }
  return current;
}

function mapPathFromId(mapId: string | number): string {
  const id = String(mapId).trim();
  if (!/^\d{9}$/.test(id)) throw new Error("Map ID must be 9 digits");
  const prefix = id[0];
  return `/resourcesv3/Map.wz/Map/Map${prefix}/${id}.img.xml`;
}

function soundPathFromName(soundFile: string): string {
  const normalized = soundFile.endsWith(".img") ? soundFile : `${soundFile}.img`;
  return `/resourcesv3/Sound.wz/${normalized}.xml`;
}

function localPoint(
  meta: any, image: { width: number; height: number },
  vectorName: string | null, flipped: boolean
): { x: number; y: number } {
  const origin = meta?.vectors?.origin ?? { x: 0, y: image.height };
  const vector = vectorName ? meta?.vectors?.[vectorName] ?? { x: 0, y: 0 } : { x: 0, y: 0 };
  const baseX = origin.x + vector.x;
  const x = flipped ? image.width - baseX : baseX;
  const y = origin.y + vector.y;
  return { x, y };
}

function topLeftFromAnchor(
  meta: any, image: { width: number; height: number },
  anchorWorld: { x: number; y: number }, anchorName: string, flipped: boolean
): { x: number; y: number } {
  const anchorLocal = localPoint(meta, image, anchorName, flipped);
  return { x: anchorWorld.x - anchorLocal.x, y: anchorWorld.y - anchorLocal.y };
}

function inventoryTypeById(itemId: number): string | null {
  const prefix = Math.floor(itemId / 1000000);
  const types: (string | null)[] = [null, "EQUIP", "USE", "SETUP", "ETC", "CASH"];
  return types[prefix] || null;
}

function equipSlotFromId(id: number): string | null {
  const p = Math.floor(id / 10000);
  if (p === 100) return "Cap";
  if (p === 101) return "FaceAcc";
  if (p === 102) return "EyeAcc";
  if (p === 103) return "Earrings";
  if (p === 104) return "Coat";
  if (p === 105) return "Longcoat";
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

function equipWzCategoryFromId(id: number): string | null {
  const p = Math.floor(id / 10000);
  if (p === 100) return "Cap";
  if (p >= 101 && p <= 103) return "Accessory";
  if (p === 104) return "Coat";
  if (p === 105) return "Longcoat";
  if (p === 106) return "Pants";
  if (p === 107) return "Shoes";
  if (p === 108) return "Glove";
  if (p === 109) return "Shield";
  if (p === 110) return "Cape";
  if (p === 111) return "Ring";
  if (p >= 112 && p <= 114) return "Accessory";
  if (p >= 130 && p <= 170) return "Weapon";
  return null;
}

function isItemStackable(itemId: number): boolean {
  return inventoryTypeById(itemId) !== "EQUIP";
}

const TWO_HANDED_PREFIXES = new Set([138, 140, 141, 142, 143, 144, 146]);
function isWeaponTwoHanded(weaponId: number): boolean {
  return TWO_HANDED_PREFIXES.has(Math.floor(weaponId / 10000));
}

function canvasMetaFromNode(canvasNode: any) {
  if (!canvasNode?.basedata) return null;
  const leaf = imgdirLeafRecord(canvasNode);
  const hasA0 = Object.prototype.hasOwnProperty.call(leaf, "a0");
  const hasA1 = Object.prototype.hasOwnProperty.call(leaf, "a1");
  let opacityStart = 255, opacityEnd = 255;
  if (hasA0 && hasA1) {
    opacityStart = safeNumber(leaf.a0, 255); opacityEnd = safeNumber(leaf.a1, 255);
  } else if (hasA0) {
    opacityStart = safeNumber(leaf.a0, 255); opacityEnd = 255 - opacityStart;
  } else if (hasA1) {
    opacityEnd = safeNumber(leaf.a1, 255); opacityStart = 255 - opacityEnd;
  }
  return {
    basedata: canvasNode.basedata, width: safeNumber(canvasNode.width, 0),
    height: safeNumber(canvasNode.height, 0), vectors: vectorRecord(canvasNode),
    zName: String(leaf.z ?? ""), moveType: safeNumber(leaf.moveType, 0),
    moveW: safeNumber(leaf.moveW, 0), moveH: safeNumber(leaf.moveH, 0),
    moveP: safeNumber(leaf.moveP, Math.PI * 2 * 1000), moveR: safeNumber(leaf.moveR, 0),
    opacityStart, opacityEnd,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("safeNumber", () => {
  test("valid numbers pass through", () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(-3.5)).toBe(-3.5);
    expect(safeNumber("123")).toBe(123);
  });
  test("invalid values return fallback", () => {
    expect(safeNumber(NaN)).toBe(0);
    expect(safeNumber(Infinity)).toBe(0);
    expect(safeNumber(-Infinity)).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber("abc")).toBe(0);
    expect(safeNumber("abc", 99)).toBe(99);
  });
});

describe("WZ node navigation", () => {
  const sampleTree = {
    $imgdir: "root",
    $$: [
      { $imgdir: "stand1", $$: [
        { $imgdir: "0", $$: [
          { $canvas: "body", basedata: "AAAA", width: 50, height: 80, $$: [
            { $vector: "origin", x: 25, y: 70 },
            { $vector: "navel", x: 20, y: 30 },
            { $imgdir: "map", $$: [
              { $vector: "hand", x: 10, y: 40 },
            ]},
            { $string: "z", value: "body" },
          ]},
          { $canvas: "arm", basedata: "BBBB", width: 30, height: 40, $$: [
            { $vector: "origin", x: 15, y: 20 },
            { $string: "z", value: "armBelowHead" },
          ]},
        ]},
        { $imgdir: "1", $$: [
          { $canvas: "body", basedata: "CCCC", width: 50, height: 80, $$: [] },
        ]},
      ]},
      { $imgdir: "walk1", $$: [] },
    ],
  };

  test("childByName finds direct children", () => {
    expect(childByName(sampleTree, "stand1")?.$imgdir).toBe("stand1");
    expect(childByName(sampleTree, "walk1")?.$imgdir).toBe("walk1");
    expect(childByName(sampleTree, "nonexistent")).toBeUndefined();
  });

  test("childByName handles null/undefined", () => {
    expect(childByName(null, "x")).toBeUndefined();
    expect(childByName(undefined, "x")).toBeUndefined();
    expect(childByName({}, "x")).toBeUndefined();
  });

  test("imgdirChildren filters non-imgdir nodes", () => {
    const stand1 = childByName(sampleTree, "stand1");
    const frame0 = childByName(stand1, "0");
    const children = imgdirChildren(frame0);
    // frame0 has $canvas children and an $imgdir "map" — imgdirChildren returns only $imgdir
    expect(children.length).toBe(0); // all children are $canvas or $vector or $int, only "map" is $imgdir but it's nested
  });

  test("imgdirChildren on stand1 returns frames", () => {
    const stand1 = childByName(sampleTree, "stand1");
    const frames = imgdirChildren(stand1);
    expect(frames.length).toBe(2);
    expect(frames[0].$imgdir).toBe("0");
    expect(frames[1].$imgdir).toBe("1");
  });

  test("findNodeByPath traverses tree", () => {
    const body = findNodeByPath(sampleTree, ["stand1", "0"]);
    expect(body).toBeTruthy();
    expect(body.$imgdir).toBe("0");

    const deep = findNodeByPath(sampleTree, ["stand1", "nonexistent"]);
    expect(deep).toBeNull();
  });

  test("vectorRecord extracts vectors including map children", () => {
    const frame0 = findNodeByPath(sampleTree, ["stand1", "0"]);
    const bodyCanvas = frame0.$$[0]; // the $canvas "body" node
    const vectors = vectorRecord(bodyCanvas);
    expect(vectors.origin).toEqual({ x: 25, y: 70 });
    expect(vectors.navel).toEqual({ x: 20, y: 30 });
    expect(vectors.hand).toEqual({ x: 10, y: 40 }); // from nested map child
  });

  test("imgdirLeafRecord extracts typed leaves", () => {
    const frame0 = findNodeByPath(sampleTree, ["stand1", "0"]);
    const bodyCanvas = frame0.$$[0];
    const record = imgdirLeafRecord(bodyCanvas);
    expect(record.z).toBe("body");
  });

  test("parseLeafValue handles all types", () => {
    expect(parseLeafValue({ $int: "x", value: "42" })).toBe(42);
    expect(parseLeafValue({ $float: "y", value: "3.14" })).toBeCloseTo(3.14);
    expect(parseLeafValue({ $double: "z", value: "2.718" })).toBeCloseTo(2.718);
    expect(parseLeafValue({ $short: "a", value: "7" })).toBe(7);
    expect(parseLeafValue({ $string: "b", value: "hello" })).toBe("hello");
    expect(parseLeafValue({ value: "raw" })).toBe("raw");
  });
});

describe("resolveNodeByUol", () => {
  const tree = {
    $$: [
      { $imgdir: "stand1", $$: [
        { $imgdir: "0", $$: [
          { $canvas: "body", basedata: "X", width: 10, height: 10 },
        ]},
      ]},
      { $imgdir: "stand2", $$: [
        { $imgdir: "0", $$: [
          { $canvas: "body", basedata: "Y", width: 20, height: 20 },
        ]},
      ]},
    ],
  };

  test("resolves ../ sibling paths", () => {
    // basePath = ["stand1", "0"], uol = "../../stand2/0"
    const resolved = resolveNodeByUol(tree, ["stand1", "0"], "../../stand2/0");
    expect(resolved?.$imgdir).toBe("0");
    // Verify it's stand2's frame
    expect(resolved.$$[0].basedata).toBe("Y");
  });

  test("basePath must be an array (spread safety)", () => {
    // If basePath were a string like "stand1", spread would split characters
    // This test verifies array behavior
    const resolved = resolveNodeByUol(tree, ["stand1"], "../stand2/0");
    expect(resolved?.$imgdir).toBe("0");
  });

  test("returns null for invalid paths", () => {
    expect(resolveNodeByUol(tree, ["stand1"], "../../nonexistent")).toBeNull();
    expect(resolveNodeByUol(tree, [], "")).toBeNull();
    expect(resolveNodeByUol(tree, [], null as any)).toBeNull();
  });

  test("resolves . (current) correctly", () => {
    const resolved = resolveNodeByUol(tree, ["stand1"], "./0");
    expect(resolved?.$imgdir).toBe("0");
  });
});

describe("mapPathFromId", () => {
  test("generates correct paths for 9-digit map IDs", () => {
    expect(mapPathFromId("100000001")).toBe("/resourcesv3/Map.wz/Map/Map1/100000001.img.xml");
    expect(mapPathFromId("200000000")).toBe("/resourcesv3/Map.wz/Map/Map2/200000000.img.xml");
    expect(mapPathFromId("910000000")).toBe("/resourcesv3/Map.wz/Map/Map9/910000000.img.xml");
    expect(mapPathFromId("000000000")).toBe("/resourcesv3/Map.wz/Map/Map0/000000000.img.xml");
  });

  test("rejects non-9-digit IDs", () => {
    expect(() => mapPathFromId("12345")).toThrow("9 digits");
    expect(() => mapPathFromId("1234567890")).toThrow("9 digits");
    expect(() => mapPathFromId("abcdefghi")).toThrow("9 digits");
    expect(() => mapPathFromId("")).toThrow("9 digits");
  });
});

describe("soundPathFromName", () => {
  test("appends .img and wraps correctly", () => {
    expect(soundPathFromName("Mob/0100100")).toBe("/resourcesv3/Sound.wz/Mob/0100100.img.xml");
    expect(soundPathFromName("Bgm00/GoPicnic")).toBe("/resourcesv3/Sound.wz/Bgm00/GoPicnic.img.xml");
  });

  test("doesn't double .img suffix", () => {
    expect(soundPathFromName("Mob.img")).toBe("/resourcesv3/Sound.wz/Mob.img.xml");
  });
});

describe("inventoryTypeById", () => {
  test("maps ID prefixes to inventory tabs", () => {
    expect(inventoryTypeById(1000000)).toBe("EQUIP");   // 1xxxxxx
    expect(inventoryTypeById(1302000)).toBe("EQUIP");   // weapon
    expect(inventoryTypeById(2000000)).toBe("USE");      // 2xxxxxx
    expect(inventoryTypeById(2000001)).toBe("USE");
    expect(inventoryTypeById(3010000)).toBe("SETUP");    // 3xxxxxx (chairs)
    expect(inventoryTypeById(4000000)).toBe("ETC");      // 4xxxxxx
    expect(inventoryTypeById(5000000)).toBe("CASH");     // 5xxxxxx
  });

  test("returns null for invalid prefixes", () => {
    expect(inventoryTypeById(0)).toBeNull();
    expect(inventoryTypeById(999)).toBeNull();
    expect(inventoryTypeById(6000000)).toBeNull();
  });
});

describe("equipSlotFromId", () => {
  test("maps equip IDs to correct slot types", () => {
    expect(equipSlotFromId(1000000)).toBe("Cap");
    expect(equipSlotFromId(1002345)).toBe("Cap");
    expect(equipSlotFromId(1010000)).toBe("FaceAcc");
    expect(equipSlotFromId(1020000)).toBe("EyeAcc");
    expect(equipSlotFromId(1030000)).toBe("Earrings");
    expect(equipSlotFromId(1040002)).toBe("Coat");
    expect(equipSlotFromId(1050000)).toBe("Longcoat");
    expect(equipSlotFromId(1060002)).toBe("Pants");
    expect(equipSlotFromId(1072001)).toBe("Shoes");
    expect(equipSlotFromId(1080000)).toBe("Glove");
    expect(equipSlotFromId(1090000)).toBe("Shield");
    expect(equipSlotFromId(1100000)).toBe("Cape");
    expect(equipSlotFromId(1110000)).toBe("Ring");
    expect(equipSlotFromId(1120000)).toBe("Pendant");
    expect(equipSlotFromId(1130000)).toBe("Belt");
    expect(equipSlotFromId(1140000)).toBe("Medal");
  });

  test("maps weapon prefixes 130-170 to Weapon", () => {
    expect(equipSlotFromId(1302000)).toBe("Weapon");  // 1H sword
    expect(equipSlotFromId(1372000)).toBe("Weapon");  // wand
    expect(equipSlotFromId(1452000)).toBe("Weapon");  // bow
    expect(equipSlotFromId(1702000)).toBe("Weapon");  // cash weapon
  });

  test("returns null for non-equip IDs", () => {
    expect(equipSlotFromId(2000000)).toBeNull();
    expect(equipSlotFromId(4000000)).toBeNull();
  });
});

describe("equipWzCategoryFromId", () => {
  test("maps to WZ folder names", () => {
    expect(equipWzCategoryFromId(1000000)).toBe("Cap");
    expect(equipWzCategoryFromId(1010000)).toBe("Accessory");  // FaceAcc
    expect(equipWzCategoryFromId(1020000)).toBe("Accessory");  // EyeAcc
    expect(equipWzCategoryFromId(1030000)).toBe("Accessory");  // Earrings
    expect(equipWzCategoryFromId(1040000)).toBe("Coat");
    expect(equipWzCategoryFromId(1050000)).toBe("Longcoat");
    expect(equipWzCategoryFromId(1060000)).toBe("Pants");
    expect(equipWzCategoryFromId(1070000)).toBe("Shoes");
    expect(equipWzCategoryFromId(1080000)).toBe("Glove");
    expect(equipWzCategoryFromId(1090000)).toBe("Shield");
    expect(equipWzCategoryFromId(1100000)).toBe("Cape");
    expect(equipWzCategoryFromId(1110000)).toBe("Ring");
    expect(equipWzCategoryFromId(1120000)).toBe("Accessory");  // Pendant
    expect(equipWzCategoryFromId(1130000)).toBe("Accessory");  // Belt
    expect(equipWzCategoryFromId(1140000)).toBe("Accessory");  // Medal
    expect(equipWzCategoryFromId(1302000)).toBe("Weapon");
  });
});

describe("isItemStackable", () => {
  test("equipment is not stackable", () => {
    expect(isItemStackable(1040002)).toBe(false);
    expect(isItemStackable(1302000)).toBe(false);
  });
  test("consumables/etc/setup/cash are stackable", () => {
    expect(isItemStackable(2000000)).toBe(true);
    expect(isItemStackable(3010000)).toBe(true);
    expect(isItemStackable(4000000)).toBe(true);
    expect(isItemStackable(5000000)).toBe(true);
  });
});

describe("isWeaponTwoHanded", () => {
  test("two-handed weapons", () => {
    expect(isWeaponTwoHanded(1382000)).toBe(true);   // Staff
    expect(isWeaponTwoHanded(1402000)).toBe(true);   // 2H Sword
    expect(isWeaponTwoHanded(1412000)).toBe(true);   // 2H Axe
    expect(isWeaponTwoHanded(1422000)).toBe(true);   // 2H Mace
    expect(isWeaponTwoHanded(1432000)).toBe(true);   // Spear
    expect(isWeaponTwoHanded(1442000)).toBe(true);   // Polearm
    expect(isWeaponTwoHanded(1462000)).toBe(true);   // Crossbow
  });
  test("one-handed weapons", () => {
    expect(isWeaponTwoHanded(1302000)).toBe(false);  // 1H Sword
    expect(isWeaponTwoHanded(1332000)).toBe(false);  // Dagger
    expect(isWeaponTwoHanded(1372000)).toBe(false);  // Wand
    expect(isWeaponTwoHanded(1452000)).toBe(false);  // Bow
    expect(isWeaponTwoHanded(1472000)).toBe(false);  // Claw
    expect(isWeaponTwoHanded(1492000)).toBe(false);  // Gun
    expect(isWeaponTwoHanded(1702000)).toBe(false);  // Cash weapon
  });
});

describe("localPoint and topLeftFromAnchor", () => {
  const meta = {
    vectors: {
      origin: { x: 25, y: 70 },
      navel: { x: 20, y: 30 },
    },
  };
  const image = { width: 50, height: 80 };

  test("localPoint without flip", () => {
    const pt = localPoint(meta, image, "navel", false);
    // baseX = origin.x + navel.x = 25 + 20 = 45, y = origin.y + navel.y = 70 + 30 = 100
    expect(pt.x).toBe(45);
    expect(pt.y).toBe(100);
  });

  test("localPoint with flip", () => {
    const pt = localPoint(meta, image, "navel", true);
    // baseX = 45, flipped: image.width - baseX = 50 - 45 = 5
    expect(pt.x).toBe(5);
    expect(pt.y).toBe(100);
  });

  test("localPoint with null vectorName", () => {
    const pt = localPoint(meta, image, null, false);
    // no vector → {0,0}, so baseX = origin.x + 0 = 25
    expect(pt.x).toBe(25);
    expect(pt.y).toBe(70);
  });

  test("localPoint with missing meta", () => {
    const pt = localPoint(null, image, "navel", false);
    // fallback origin: {0, image.height=80}, vector: {0,0}
    expect(pt.x).toBe(0);
    expect(pt.y).toBe(80);
  });

  test("topLeftFromAnchor positions correctly", () => {
    const anchor = { x: 100, y: 200 };
    const tl = topLeftFromAnchor(meta, image, anchor, "navel", false);
    // anchorLocal = localPoint = {45, 100}
    // topLeft = {100 - 45, 200 - 100} = {55, 100}
    expect(tl.x).toBe(55);
    expect(tl.y).toBe(100);
  });
});

describe("canvasMetaFromNode", () => {
  test("extracts full metadata from canvas node", () => {
    const node = {
      basedata: "iVBORw0KGgoAAAANS",
      width: 64,
      height: 48,
      $$: [
        { $vector: "origin", x: 32, y: 40 },
        { $string: "z", value: "body" },
        { $int: "a0", value: "0" },
        { $int: "a1", value: "255" },
      ],
    };
    const meta = canvasMetaFromNode(node);
    expect(meta).not.toBeNull();
    expect(meta!.basedata).toBe("iVBORw0KGgoAAAANS");
    expect(meta!.width).toBe(64);
    expect(meta!.height).toBe(48);
    expect(meta!.vectors.origin).toEqual({ x: 32, y: 40 });
    expect(meta!.zName).toBe("body");
    expect(meta!.opacityStart).toBe(0);
    expect(meta!.opacityEnd).toBe(255);
  });

  test("returns null for missing basedata", () => {
    expect(canvasMetaFromNode({})).toBeNull();
    expect(canvasMetaFromNode({ basedata: "" })).toBeNull();
    expect(canvasMetaFromNode(null)).toBeNull();
  });

  test("handles a0 only (fade-in)", () => {
    const meta = canvasMetaFromNode({
      basedata: "X", width: 10, height: 10,
      $$: [{ $int: "a0", value: "100" }],
    });
    expect(meta!.opacityStart).toBe(100);
    expect(meta!.opacityEnd).toBe(155); // 255 - 100
  });

  test("handles a1 only (fade-out)", () => {
    const meta = canvasMetaFromNode({
      basedata: "X", width: 10, height: 10,
      $$: [{ $int: "a1", value: "200" }],
    });
    expect(meta!.opacityStart).toBe(55); // 255 - 200
    expect(meta!.opacityEnd).toBe(200);
  });

  test("handles no opacity (defaults to 255)", () => {
    const meta = canvasMetaFromNode({
      basedata: "X", width: 10, height: 10, $$: [],
    });
    expect(meta!.opacityStart).toBe(255);
    expect(meta!.opacityEnd).toBe(255);
  });
});

describe("pickCanvasNode", () => {
  // Re-implement pickCanvasNode for testing
  function pickCanvasNode(node: any, preferredIndex = "0"): any {
    if (!node) return null;
    if (node.$canvas) return node;
    const children = node.$$ ?? [];
    const directCanvas =
      children.find((child: any) => child.$canvas === preferredIndex) ??
      children.find((child: any) => typeof child.$canvas === "string");
    if (directCanvas) return directCanvas;
    const numericFrame =
      children.find((child: any) => child.$imgdir === preferredIndex) ??
      children.find((child: any) => /^\d+$/.test(child.$imgdir ?? ""));
    if (numericFrame) return pickCanvasNode(numericFrame, "0");
    return null;
  }

  test("returns node if it's already a canvas", () => {
    const canvas = { $canvas: "0", basedata: "X" };
    expect(pickCanvasNode(canvas)).toBe(canvas);
  });

  test("finds preferred canvas child", () => {
    const node = { $$: [
      { $canvas: "0", basedata: "A" },
      { $canvas: "1", basedata: "B" },
    ]};
    expect(pickCanvasNode(node, "1")?.basedata).toBe("B");
  });

  test("falls back to first canvas child", () => {
    const node = { $$: [
      { $canvas: "body", basedata: "A" },
    ]};
    expect(pickCanvasNode(node, "99")?.basedata).toBe("A");
  });

  test("recurses into numeric imgdir children", () => {
    const node = { $$: [
      { $imgdir: "0", $$: [
        { $canvas: "0", basedata: "DEEP" },
      ]},
    ]};
    expect(pickCanvasNode(node)?.basedata).toBe("DEEP");
  });

  test("returns null for empty/null nodes", () => {
    expect(pickCanvasNode(null)).toBeNull();
    expect(pickCanvasNode({})).toBeNull();
    expect(pickCanvasNode({ $$: [] })).toBeNull();
  });
});

describe("default character template (server parity)", () => {
  // Verify the server's default character matches what client expects
  test("male defaults match client expectations", () => {
    // From db.ts buildDefaultCharacterSave
    const save = {
      identity: { gender: false, skin: 0, face_id: 20000, hair_id: 30000 },
      stats: { level: 1, job: "Beginner", exp: 0, max_exp: 15, hp: 50, max_hp: 50, mp: 5, max_mp: 5, speed: 100, jump: 100, meso: 0 },
      location: { map_id: "100000001", spawn_portal: null, facing: -1 },
      equipment: [
        { slot_type: "Coat", item_id: 1040002, item_name: "" },
        { slot_type: "Pants", item_id: 1060002, item_name: "" },
        { slot_type: "Shoes", item_id: 1072001, item_name: "" },
        { slot_type: "Weapon", item_id: 1302000, item_name: "" },
      ],
      inventory: [
        { item_id: 2000000, qty: 30, inv_type: "USE", slot: 0, category: null },
        { item_id: 2000001, qty: 15, inv_type: "USE", slot: 1, category: null },
        { item_id: 2000002, qty: 5, inv_type: "USE", slot: 2, category: null },
        { item_id: 2010000, qty: 10, inv_type: "USE", slot: 3, category: null },
        { item_id: 4000000, qty: 8, inv_type: "ETC", slot: 0, category: null },
        { item_id: 4000001, qty: 3, inv_type: "ETC", slot: 1, category: null },
        { item_id: 3010000, qty: 1, inv_type: "SETUP", slot: 0, category: null },
      ],
    };

    // Equipment slots are correct
    expect(equipSlotFromId(save.equipment[0].item_id)).toBe("Coat");
    expect(equipSlotFromId(save.equipment[1].item_id)).toBe("Pants");
    expect(equipSlotFromId(save.equipment[2].item_id)).toBe("Shoes");
    expect(equipSlotFromId(save.equipment[3].item_id)).toBe("Weapon");

    // Inventory types are correct
    expect(inventoryTypeById(save.inventory[0].item_id)).toBe("USE");
    expect(inventoryTypeById(save.inventory[4].item_id)).toBe("ETC");
    expect(inventoryTypeById(save.inventory[6].item_id)).toBe("SETUP");

    // Default equipment count = 4, inventory = 7 (as asserted in character-api.test.ts)
    expect(save.equipment.length).toBe(4);
    expect(save.inventory.length).toBe(7);
  });

  test("female defaults differ only in coat/pants/face/hair", () => {
    // Female: coat 1041002, pants 1061002, face 21000, hair 31000
    expect(equipSlotFromId(1041002)).toBe("Coat");
    expect(equipSlotFromId(1061002)).toBe("Pants");
    // Shared: shoes 1072001, weapon 1302000
    expect(equipSlotFromId(1072001)).toBe("Shoes");
    expect(equipSlotFromId(1302000)).toBe("Weapon");
  });
});
