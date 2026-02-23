/**
 * wz-xml.ts — Lightweight WZ XML parser for server-side use.
 * Converts Harepacker Classic XML (.img.xml) to the same JSON node format
 * used by the client ($imgdir, $$, $int, $canvas, etc.).
 *
 * This is a minimal parser that handles only the WZ XML subset:
 * - Self-closing tags: <int name="x" value="1"/>
 * - Container tags: <imgdir name="x">...</imgdir>
 * - Attributes: name, value, x, y, width, height, basedata, basehead, length
 * - XML entities: &amp; &lt; &gt; &apos; &quot;
 *
 * No external dependencies.
 */

// ─── XML entity decoding ─────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

// ─── Attribute parser ─────────────────────────────────────────────────────────

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = decodeEntities(m[2]);
  }
  return attrs;
}

// ─── Tag tokenizer ───────────────────────────────────────────────────────────

interface Tag {
  type: "open" | "close" | "selfclose";
  name: string;
  attrs: Record<string, string>;
}

/**
 * Tokenize XML into tags. Skips <?xml?> declarations and text nodes.
 * This is NOT a general XML parser — it's optimized for WZ XML.
 */
function tokenize(xml: string): Tag[] {
  const tags: Tag[] = [];
  const re = /<(\/?)([\w]+)((?:\s+\w+="[^"]*")*)(\s*\/)?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const isClose = m[1] === "/";
    const tagName = m[2];
    const attrStr = m[3];
    const selfClose = m[4] !== undefined;

    if (isClose) {
      tags.push({ type: "close", name: tagName, attrs: {} });
    } else if (selfClose) {
      tags.push({ type: "selfclose", name: tagName, attrs: parseAttrs(attrStr) });
    } else {
      tags.push({ type: "open", name: tagName, attrs: parseAttrs(attrStr) });
    }
  }
  return tags;
}

// ─── Convert tags to JSON nodes ──────────────────────────────────────────────

function tagToNode(tag: Tag): any {
  const a = tag.attrs;
  const name = a.name ?? "";
  switch (tag.name) {
    case "imgdir":
      return { $imgdir: name, $$: [] };
    case "int":
      return { $int: name, value: a.value ?? "0" };
    case "short":
      return { $short: name, value: a.value ?? "0" };
    case "long":
      return { $long: name, value: a.value ?? "0" };
    case "float":
      return { $float: name, value: a.value ?? "0" };
    case "double":
      return { $double: name, value: a.value ?? "0" };
    case "string":
      return { $string: name, value: a.value ?? "" };
    case "null":
      return { $null: name };
    case "vector":
      return { $vector: name, x: a.x ?? "0", y: a.y ?? "0" };
    case "uol":
      return { $uol: name, value: a.value ?? "" };
    case "canvas": {
      const node: any = {
        $canvas: name,
        width: a.width ?? "0",
        height: a.height ?? "0",
      };
      if (a.basedata) node.basedata = a.basedata;
      node.$$ = [];
      return node;
    }
    case "sound": {
      const node: any = { $sound: name };
      if (a.length) node.length = a.length;
      if (a.basehead) node.basehead = a.basehead;
      if (a.basedata) node.basedata = a.basedata;
      return node;
    }
    case "extended":
      // Convex — treated as imgdir in JSON format
      return { $imgdir: name, $$: [] };
    default:
      return { $imgdir: name, $$: [] };
  }
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse WZ XML text into a JSON node tree.
 * @param xmlText - Complete .img.xml file content
 * @returns JSON node in the $imgdir/$$/etc. format
 */
export function parseWzXml(xmlText: string): any {
  const tags = tokenize(xmlText);
  const stack: any[] = [];
  let root: any = null;

  for (const tag of tags) {
    if (tag.type === "open") {
      const node = tagToNode(tag);
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (!parent.$$) parent.$$ = [];
        parent.$$.push(node);
      }
      stack.push(node);
      if (!root) root = node;
    } else if (tag.type === "selfclose") {
      const node = tagToNode(tag);
      // Clean up empty $$ arrays on leaf nodes
      if (node.$$ && node.$$.length === 0) delete node.$$;
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (!parent.$$) parent.$$ = [];
        parent.$$.push(node);
      } else if (!root) {
        root = node;
      }
    } else if (tag.type === "close") {
      const node = stack.pop();
      // Clean up empty $$ arrays
      if (node && node.$$ && node.$$.length === 0) delete node.$$;
      if (stack.length === 0 && !root) root = node;
    }
  }

  return root;
}

/**
 * Read and parse a WZ XML file from disk.
 * @param filePath - Path to .img.xml file
 * @returns Parsed JSON node tree
 */
export function readWzXmlFile(filePath: string): any {
  const fs = require("fs");
  const text = fs.readFileSync(filePath, "utf8");
  return parseWzXml(text);
}
