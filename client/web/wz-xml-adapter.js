/**
 * wz-xml-adapter.js — Convert Harepacker Classic XML DOM to the JSON node format
 * used by all existing client code.
 *
 * This is the transparent adapter layer for the resourcesv2 → resourcesv3 migration.
 * XML is fetched as text, parsed with DOMParser, converted to JSON nodes, and fed
 * into the existing pipeline. Zero changes needed in any consumer module.
 */

/**
 * Parse XML text and convert root element to JSON node.
 * @param {string} xmlText
 * @returns {object} JSON node in the $imgdir/$int/$canvas/etc. format
 */
export function xmlToJsonNode(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error(`XML parse error: ${err.textContent.slice(0, 200)}`);
  return convertElement(doc.documentElement);
}

/**
 * Recursively convert a single XML element to a JSON node.
 * @param {Element} el
 * @returns {object}
 */
function convertElement(el) {
  const tag = el.tagName;
  const name = el.getAttribute("name") ?? "";

  switch (tag) {
    case "imgdir": {
      const node = { $imgdir: name };
      const children = convertChildren(el);
      if (children.length > 0) node.$$ = children;
      return node;
    }
    case "int":
      return { $int: name, value: el.getAttribute("value") ?? "0" };
    case "short":
      return { $short: name, value: el.getAttribute("value") ?? "0" };
    case "long":
      return { $long: name, value: el.getAttribute("value") ?? "0" };
    case "float":
      return { $float: name, value: el.getAttribute("value") ?? "0" };
    case "double":
      return { $double: name, value: el.getAttribute("value") ?? "0" };
    case "string":
      return { $string: name, value: el.getAttribute("value") ?? "" };
    case "null":
      return { $null: name };
    case "vector":
      return {
        $vector: name,
        x: el.getAttribute("x") ?? "0",
        y: el.getAttribute("y") ?? "0",
      };
    case "uol":
      return { $uol: name, value: el.getAttribute("value") ?? "" };
    case "canvas": {
      const node = {
        $canvas: name,
        width: el.getAttribute("width") ?? "0",
        height: el.getAttribute("height") ?? "0",
      };
      const bd = el.getAttribute("basedata");
      if (bd) node.basedata = bd;
      const children = convertChildren(el);
      if (children.length > 0) node.$$ = children;
      return node;
    }
    case "sound": {
      const node = { $sound: name };
      const len = el.getAttribute("length");
      if (len) node.length = len;
      const bh = el.getAttribute("basehead");
      if (bh) node.basehead = bh;
      const bd = el.getAttribute("basedata");
      if (bd) node.basedata = bd;
      return node;
    }
    case "extended": {
      // Convex/extended — in JSON format these use $imgdir (treated as sub-property)
      const node = { $imgdir: name };
      const children = convertChildren(el);
      if (children.length > 0) node.$$ = children;
      return node;
    }
    default:
      // Unknown tag — treat as imgdir container
      console.warn(`[wz-xml-adapter] Unknown XML tag: <${tag} name="${name}">`);
      const node = { $imgdir: name };
      const children = convertChildren(el);
      if (children.length > 0) node.$$ = children;
      return node;
  }
}

/**
 * Convert all child elements of a parent element.
 * @param {Element} parent
 * @returns {object[]}
 */
function convertChildren(parent) {
  const result = [];
  for (const child of parent.children) {
    result.push(convertElement(child));
  }
  return result;
}
