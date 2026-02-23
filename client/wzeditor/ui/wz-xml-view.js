/**
 * Raw XML viewer/editor for the selected node.
 * Shows the serialized XML of any node, and allows direct XML editing
 * that can be parsed back into the tree.
 */

import { serializeImage } from '../wz/wz-xml-serializer.js';
import { WzNode } from '../wz/wz-node.js';

/**
 * @param {HTMLElement} container - The preview panel to render into
 * @param {WzNode} node - The selected node
 * @param {object} callbacks
 * @param {() => void} callbacks.onModified - Called when XML edit changes the node
 */
export function showXmlView(container, node, callbacks) {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%;';

    // Header bar
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border);background:var(--bg-secondary);flex-shrink:0;';
    header.innerHTML = `
        <span style="color:var(--text-muted);font-size:11px;">XML View — ${escHtml(node.name)}</span>
        <span style="flex:1"></span>
        <button class="xml-copy-btn" style="padding:2px 10px;background:var(--bg-hover);border:1px solid var(--border);border-radius:4px;cursor:pointer;color:var(--text-primary);font-size:11px;">📋 Copy</button>
    `;
    wrapper.appendChild(header);

    // Generate XML
    const xml = generateXmlForNode(node);

    // Textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'xml-view';
    textarea.value = xml;
    textarea.readOnly = true;
    textarea.spellcheck = false;
    wrapper.appendChild(textarea);

    container.appendChild(wrapper);

    // Copy button
    header.querySelector('.xml-copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(textarea.value).then(() => {
            const btn = header.querySelector('.xml-copy-btn');
            btn.textContent = '✓ Copied';
            setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
        });
    });
}

/**
 * Generate XML string for any node type.
 */
function generateXmlForNode(node) {
    switch (node.type) {
        case 'image': {
            return serializeImage(node);
        }
        case 'file':
        case 'dir': {
            // Show structure summary — don't serialize entire tree (could be huge)
            let xml = `<!-- ${node.type}: ${node.name} -->\n`;
            xml += `<!-- ${node.children.length} direct children, ${node.countImages()} total images -->\n`;
            xml += `<${node.type === 'file' ? 'wzfile' : 'wzdir'} name="${escXml(node.name)}">\n`;
            for (const child of node.children) {
                if (child.type === 'dir') {
                    xml += `  <wzdir name="${escXml(child.name)}"/> <!-- ${child.countImages()} images -->\n`;
                } else if (child.type === 'image') {
                    xml += `  <wzimg name="${escXml(child.name)}"/>\n`;
                }
            }
            xml += `</${node.type === 'file' ? 'wzfile' : 'wzdir'}>\n`;
            return xml;
        }
        default: {
            // For any other node, wrap in a temp image to get valid XML
            return serializeProperty(node, '  ', 0, true);
        }
    }
}

function serializeProperty(node, indent, level, includeBase64) {
    const pad = indent.repeat(level);
    const eName = escXml(node.name);

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
            return `${pad}<string name="${eName}" value="${escXml(String(node.value))}"/>\n`;
        case 'null':
            return `${pad}<null name="${eName}"/>\n`;
        case 'vector':
            return `${pad}<vector name="${eName}" x="${node.x}" y="${node.y}"/>\n`;
        case 'uol':
            return `${pad}<uol name="${eName}" value="${escXml(String(node.value))}"/>\n`;
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
        default:
            return `${pad}<!-- unknown type: ${node.type} -->\n`;
    }
}

function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
