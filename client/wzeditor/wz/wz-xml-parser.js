/**
 * Parse Harepacker-exported XML into WzNode trees.
 * Supports all three XML layouts:
 *   Format A — Classic XML directory (multiple .xml files, one per image)
 *   Format B — Single .xml file with <imgdir> root
 *   Format C — Combined <xmldump> with <wzdir> and <wzimg> children
 *
 * Ported from MapleLib/WzLib/Serializer/WzXmlDeserializer.cs
 */

import { WzNode } from './wz-node.js';

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a single XML string into a WzNode tree.
 * Auto-detects Format B vs Format C.
 *
 * @param {string} xmlText
 * @param {string} [sourceName='unknown.xml']
 * @returns {WzNode}
 */
export function parseXmlString(xmlText, sourceName = 'unknown.xml') {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const root = doc.documentElement;

    // Check for parse error
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error(`XML parse error in ${sourceName}: ${parseError.textContent}`);
    }

    if (root.tagName === 'imgdir') {
        // Format B: single image
        return parseImgdirElement(root);
    }

    if (root.tagName === 'xmldump') {
        // Format C: combined dump
        return parseXmlDump(root, sourceName);
    }

    throw new Error(`Unknown XML root element: <${root.tagName}> in ${sourceName}`);
}

/**
 * Parse a directory of XML files (Format A) from a flat file list.
 * Used with <input type="file" webkitdirectory> or showDirectoryPicker().
 *
 * @param {Array<{path: string, getText: () => Promise<string>}>} files
 *   Each entry has a relative path (e.g. "Map/Map0/100000000.img.xml") and a getText() function.
 * @param {string} rootName - name for the root node (e.g. "Map.wz")
 * @param {function} [onProgress] - optional callback(current, total)
 * @returns {Promise<WzNode>}
 */
export async function parseXmlDirectory(files, rootName, onProgress) {
    const root = new WzNode(rootName, 'file');
    root.parsed = true;

    // Sort files by path for consistent ordering
    files.sort((a, b) => a.path.localeCompare(b.path));

    const xmlFiles = files.filter(f => f.path.endsWith('.xml'));
    let done = 0;

    for (const file of xmlFiles) {
        // Build directory structure from path
        const parts = file.path.split('/').filter(Boolean);
        const xmlFileName = parts.pop(); // e.g. "100000000.img.xml"

        // Navigate/create directory nodes
        let current = root;
        for (const dirName of parts) {
            let dirNode = current.getChild(dirName);
            if (!dirNode) {
                dirNode = new WzNode(dirName, 'dir');
                dirNode.parsed = true;
                current.addChild(dirNode);
            }
            current = dirNode;
        }

        // Create image node (lazy — store file handle for later parsing)
        // Remove the ".xml" suffix to get the image name
        const imgName = xmlFileName.replace(/\.xml$/, '');
        const imgNode = new WzNode(imgName, 'image');
        imgNode._xmlGetText = file.getText; // function to read the XML later
        imgNode._xmlFileHandle = file.handle || null; // for quick-save
        current.addChild(imgNode);

        done++;
        if (onProgress) onProgress(done, xmlFiles.length);
    }

    return root;
}

/**
 * Parse an image node's XML content on-demand (lazy load).
 * Call this when user expands an unparsed image.
 *
 * @param {WzNode} imageNode - image node with _xmlGetText set
 * @returns {Promise<void>}
 */
export async function parseXmlImageLazy(imageNode) {
    if (imageNode.parsed) return;
    if (!imageNode._xmlGetText) {
        throw new Error(`Image node "${imageNode.name}" has no XML source`);
    }

    const xmlText = await imageNode._xmlGetText();
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const root = doc.documentElement;

    if (root.tagName !== 'imgdir') {
        throw new Error(`Expected <imgdir> root for image "${imageNode.name}", got <${root.tagName}>`);
    }

    // Parse children from the <imgdir> element
    for (const child of root.children) {
        const node = parsePropertyElement(child);
        if (node) imageNode.addChild(node);
    }

    imageNode.parsed = true;
}

// ─── Internal Parsing ────────────────────────────────────────────────────────

/**
 * Parse a <imgdir> element into a WzNode of type 'image' (top-level) or 'sub' (nested).
 * @param {Element} elem
 * @param {boolean} [isTopLevel=true]
 * @returns {WzNode}
 */
function parseImgdirElement(elem, isTopLevel = true) {
    const name = elem.getAttribute('name') || '';
    const node = new WzNode(name, isTopLevel ? 'image' : 'sub');

    for (const child of elem.children) {
        const childNode = parsePropertyElement(child);
        if (childNode) node.addChild(childNode);
    }

    node.parsed = true;
    return node;
}

/**
 * Parse a single property XML element into a WzNode.
 * Ported from WzXmlDeserializer.ParsePropertyFromXMLElement()
 *
 * @param {Element} elem
 * @returns {WzNode|null}
 */
function parsePropertyElement(elem) {
    const tag = elem.tagName;
    const name = elem.getAttribute('name') || '';

    switch (tag) {
        case 'imgdir': {
            return parseImgdirElement(elem, false);
        }
        case 'int': {
            const node = new WzNode(name, 'int');
            node.value = parseInt(elem.getAttribute('value') || '0', 10);
            return node;
        }
        case 'short': {
            const node = new WzNode(name, 'short');
            node.value = parseInt(elem.getAttribute('value') || '0', 10);
            return node;
        }
        case 'long': {
            const node = new WzNode(name, 'long');
            node.value = parseInt(elem.getAttribute('value') || '0', 10);
            return node;
        }
        case 'float': {
            const node = new WzNode(name, 'float');
            node.value = parseFloat(elem.getAttribute('value') || '0');
            return node;
        }
        case 'double': {
            const node = new WzNode(name, 'double');
            node.value = parseFloat(elem.getAttribute('value') || '0');
            return node;
        }
        case 'string': {
            const node = new WzNode(name, 'string');
            node.value = elem.getAttribute('value') || '';
            return node;
        }
        case 'null': {
            return new WzNode(name, 'null');
        }
        case 'canvas': {
            const node = new WzNode(name, 'canvas');
            node.width = parseInt(elem.getAttribute('width') || '0', 10);
            node.height = parseInt(elem.getAttribute('height') || '0', 10);
            node.basedata = elem.getAttribute('basedata') || null;
            // Canvas can have child properties (e.g. origin vector)
            for (const child of elem.children) {
                const childNode = parsePropertyElement(child);
                if (childNode) node.addChild(childNode);
            }
            node.parsed = true;
            return node;
        }
        case 'vector': {
            const node = new WzNode(name, 'vector');
            node.x = parseInt(elem.getAttribute('x') || '0', 10);
            node.y = parseInt(elem.getAttribute('y') || '0', 10);
            return node;
        }
        case 'uol': {
            const node = new WzNode(name, 'uol');
            node.value = elem.getAttribute('value') || '';
            return node;
        }
        case 'sound': {
            const node = new WzNode(name, 'sound');
            node.soundLength = parseInt(elem.getAttribute('length') || '0', 10);
            node.basehead = elem.getAttribute('basehead') || null;
            node.basedata = elem.getAttribute('basedata') || null;
            return node;
        }
        case 'extended': {
            const node = new WzNode(name, 'convex');
            for (const child of elem.children) {
                const childNode = parsePropertyElement(child);
                if (childNode) node.addChild(childNode);
            }
            node.parsed = true;
            return node;
        }
        default:
            console.warn(`Unknown XML property element: <${tag} name="${name}">`);
            return null;
    }
}

/**
 * Parse Format C: <xmldump> with <wzdir> and <wzimg> children
 */
function parseXmlDump(root, sourceName) {
    const fileNode = new WzNode(sourceName, 'file');
    fileNode.parsed = true;

    for (const child of root.children) {
        if (child.tagName === 'wzdir') {
            const dirNode = parseWzDir(child);
            if (dirNode) fileNode.addChild(dirNode);
        } else if (child.tagName === 'wzimg') {
            const imgNode = parseWzImg(child);
            if (imgNode) fileNode.addChild(imgNode);
        }
    }

    return fileNode;
}

function parseWzDir(elem) {
    const name = elem.getAttribute('name') || '';
    const node = new WzNode(name, 'dir');
    node.parsed = true;

    for (const child of elem.children) {
        if (child.tagName === 'wzdir') {
            const dirNode = parseWzDir(child);
            if (dirNode) node.addChild(dirNode);
        } else if (child.tagName === 'wzimg') {
            const imgNode = parseWzImg(child);
            if (imgNode) node.addChild(imgNode);
        }
    }
    return node;
}

function parseWzImg(elem) {
    const name = elem.getAttribute('name') || '';
    const node = new WzNode(name, 'image');
    node.parsed = true;

    for (const child of elem.children) {
        const childNode = parsePropertyElement(child);
        if (childNode) node.addChild(childNode);
    }
    return node;
}
