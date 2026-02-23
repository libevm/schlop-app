/**
 * Serialize WzNode trees to Harepacker-compatible Classic XML.
 * Ported from WzClassicXmlSerializer + WzSerializer.WritePropertyToXML()
 *
 * Produces output byte-for-byte compatible with Harepacker's export.
 */

// ─── XML Text Sanitization ─────────────────────────────────────────────────

const SPECIAL_CHARS = ['"', "'", '&', '<', '>'];
const REPLACEMENTS  = ['&quot;', '&apos;', '&amp;', '&lt;', '&gt;'];

/**
 * Escape XML special characters in attribute values.
 * Ported from XmlUtil.SanitizeText()
 */
export function sanitizeXml(text) {
    if (!text) return '';
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const idx = SPECIAL_CHARS.indexOf(ch);
        if (idx !== -1) {
            result += REPLACEMENTS[idx];
        } else {
            result += ch;
        }
    }
    return result;
}

/**
 * Strip characters illegal in file/directory names.
 * Ported from ProgressingWzSerializer.EscapeInvalidFilePathNames()
 */
export function escapeFileName(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
}

// ─── Serialization ──────────────────────────────────────────────────────────

/**
 * Serialize an image node to a complete XML string (with XML header).
 *
 * @param {import('./wz-node.js').WzNode} imageNode
 * @param {object} [options]
 * @param {boolean} [options.includeBase64=true] - Include basedata for canvas/sound
 * @param {string} [options.indent='  '] - Indentation string per level
 * @returns {string}
 */
export function serializeImage(imageNode, options = {}) {
    const { includeBase64 = true, indent = '  ' } = options;
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    xml += `<imgdir name="${sanitizeXml(imageNode.name)}">\n`;
    for (const child of imageNode.children) {
        xml += serializeProperty(child, indent, 1, includeBase64);
    }
    xml += '</imgdir>\n';
    return xml;
}

/**
 * Serialize a single property node to XML.
 *
 * @param {import('./wz-node.js').WzNode} node
 * @param {string} indent
 * @param {number} level
 * @param {boolean} includeBase64
 * @returns {string}
 */
function serializeProperty(node, indent, level, includeBase64) {
    const pad = indent.repeat(level);
    const eName = sanitizeXml(node.name);

    switch (node.type) {
        case 'sub': {
            let xml = `${pad}<imgdir name="${eName}">\n`;
            for (const child of node.children) {
                xml += serializeProperty(child, indent, level + 1, includeBase64);
            }
            xml += `${pad}</imgdir>\n`;
            return xml;
        }
        case 'int':
            return `${pad}<int name="${eName}" value="${node.value}"/>\n`;
        case 'short':
            return `${pad}<short name="${eName}" value="${node.value}"/>\n`;
        case 'long':
            return `${pad}<long name="${eName}" value="${node.value}"/>\n`;
        case 'float': {
            // Harepacker always includes a decimal point
            let v = String(node.value);
            if (!v.includes('.')) v += '.0';
            return `${pad}<float name="${eName}" value="${v}"/>\n`;
        }
        case 'double': {
            let v = String(node.value);
            if (!v.includes('.')) v += '.0';
            return `${pad}<double name="${eName}" value="${v}"/>\n`;
        }
        case 'string':
            return `${pad}<string name="${eName}" value="${sanitizeXml(String(node.value))}"/>\n`;
        case 'null':
            return `${pad}<null name="${eName}"/>\n`;
        case 'vector':
            return `${pad}<vector name="${eName}" x="${node.x}" y="${node.y}"/>\n`;
        case 'uol':
            return `${pad}<uol name="${eName}" value="${sanitizeXml(String(node.value))}"/>\n`;
        case 'canvas': {
            const attrs = `name="${eName}" width="${node.width}" height="${node.height}"`;
            const base = (includeBase64 && node.basedata) ? ` basedata="${node.basedata}"` : '';
            if (node.children.length > 0) {
                let xml = `${pad}<canvas ${attrs}${base}>\n`;
                for (const child of node.children) {
                    xml += serializeProperty(child, indent, level + 1, includeBase64);
                }
                xml += `${pad}</canvas>\n`;
                return xml;
            }
            return `${pad}<canvas ${attrs}${base}/>\n`;
        }
        case 'sound': {
            const parts = [`name="${eName}"`];
            parts.push(`length="${node.soundLength}"`);
            if (includeBase64 && node.basehead) parts.push(`basehead="${node.basehead}"`);
            if (includeBase64 && node.basedata) parts.push(`basedata="${node.basedata}"`);
            return `${pad}<sound ${parts.join(' ')}/>\n`;
        }
        case 'convex': {
            if (node.children.length > 0) {
                let xml = `${pad}<extended name="${eName}">\n`;
                for (const child of node.children) {
                    xml += serializeProperty(child, indent, level + 1, includeBase64);
                }
                xml += `${pad}</extended>\n`;
                return xml;
            }
            return `${pad}<extended name="${eName}"/>\n`;
        }
        case 'lua':
            // Not part of standard Harepacker XML, but serialize what we can
            return `${pad}<string name="${eName}" value="${sanitizeXml(String(node.value || ''))}"/>\n`;
        default:
            console.warn(`Unknown node type for serialization: ${node.type}`);
            return '';
    }
}

// ─── Directory Export (Format A) ────────────────────────────────────────────

/**
 * Export an entire file/directory as Classic XML directory using File System Access API.
 *
 * @param {import('./wz-node.js').WzNode} sourceNode - file or dir node to export
 * @param {FileSystemDirectoryHandle} dirHandle - target directory
 * @param {object} [options]
 * @param {boolean} [options.includeBase64=true]
 * @param {function} [options.onProgress] - callback(current, total, imageName)
 * @returns {Promise<number>} number of images exported
 */
export async function exportClassicXmlDirectory(sourceNode, dirHandle, options = {}) {
    const { includeBase64 = true, onProgress, concurrency = 16 } = options;

    // Count total images for progress
    const totalImages = sourceNode.countImages();
    let exported = 0;

    // Phase 1: create all directories (must be sequential — parent before child)
    // Collect all (imageNode, dirHandle) pairs for parallel write
    const writeQueue = [];

    async function collectDir(node, handle) {
        // Create subdirectories first (sequential to ensure parent exists)
        const dirChildren = [];
        for (const child of node.children) {
            if (child.type === 'dir') {
                const subHandle = await handle.getDirectoryHandle(
                    escapeFileName(child.name), { create: true }
                );
                dirChildren.push({ node: child, handle: subHandle });
            } else if (child.type === 'image') {
                writeQueue.push({ imageNode: child, parentHandle: handle });
            }
        }
        // Recurse into subdirectories
        for (const { node: dirNode, handle: dirH } of dirChildren) {
            await collectDir(dirNode, dirH);
        }
    }

    // Build root handle
    let rootHandle;
    if (sourceNode.type === 'file') {
        rootHandle = await dirHandle.getDirectoryHandle(
            escapeFileName(sourceNode.name), { create: true }
        );
    } else {
        rootHandle = dirHandle;
    }
    await collectDir(sourceNode, rootHandle);

    // Phase 2: write all images in parallel with bounded concurrency
    let cursor = 0;
    const total = writeQueue.length;

    async function worker() {
        while (true) {
            const idx = cursor++;
            if (idx >= total) return;
            const { imageNode, parentHandle } = writeQueue[idx];
            const fileName = escapeFileName(imageNode.name) + '.xml';
            const xml = serializeImage(imageNode, { includeBase64 });
            const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(xml);
            await writable.close();
            exported++;
            if (onProgress) onProgress(exported, totalImages, imageNode.name);
        }
    }

    // Launch worker pool
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, total); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    return exported;
}
