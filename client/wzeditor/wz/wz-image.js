/**
 * Parse a WzImage's property list from binary data.
 * Ported from WzImage.ParseImage() + WzImageProperty.ParsePropertyList() +
 * WzImageProperty.ParseExtendedProp() + WzImageProperty.ExtractMore()
 */

import { WzNode } from './wz-node.js';

const HEADER_BYTE_WITHOUT_OFFSET = 0x73;
const HEADER_BYTE_WITH_OFFSET = 0x1B;

/**
 * Parse image properties from a WzBinaryReader positioned at the image offset.
 * Returns an array of WzNode children.
 *
 * @param {import('./wz-binary-reader.js').WzBinaryReader} reader
 * @param {number} offset - the base offset for string block references
 * @returns {WzNode[]}
 */
export function parseImageFromReader(reader, offset) {
    const b = reader.readByte();
    if (b === 1) {
        // Lua image — skip for now
        return [];
    }
    if (b !== HEADER_BYTE_WITHOUT_OFFSET) {
        throw new Error(`Unknown WzImage header byte: 0x${b.toString(16)}`);
    }
    const prop = reader.readWzString();
    const val = reader.readUInt16();
    if (prop !== 'Property' || val !== 0) {
        throw new Error(`Invalid WzImage header: prop="${prop}" val=${val}`);
    }
    return parsePropertyList(reader, offset);
}

/**
 * Parse a property list (count + entries)
 * @param {import('./wz-binary-reader.js').WzBinaryReader} reader
 * @param {number} offset
 * @returns {WzNode[]}
 */
function parsePropertyList(reader, offset) {
    const count = reader.readCompressedInt();
    const nodes = [];
    for (let i = 0; i < count; i++) {
        const name = reader.readWzStringBlock(offset);
        const ptype = reader.readByte();
        switch (ptype) {
            case 0: { // Null
                nodes.push(new WzNode(name, 'null'));
                break;
            }
            case 2:   // Short (alt)
            case 11: { // Short
                const node = new WzNode(name, 'short');
                node.value = reader.readInt16();
                nodes.push(node);
                break;
            }
            case 3:   // Int
            case 19: { // Int (alt)
                const node = new WzNode(name, 'int');
                node.value = reader.readCompressedInt();
                nodes.push(node);
                break;
            }
            case 20: { // Long
                const node = new WzNode(name, 'long');
                node.value = reader.readCompressedLong();
                nodes.push(node);
                break;
            }
            case 4: { // Float
                const ftype = reader.readByte();
                const node = new WzNode(name, 'float');
                node.value = ftype === 0x80 ? reader.readFloat() : 0;
                nodes.push(node);
                break;
            }
            case 5: { // Double
                const node = new WzNode(name, 'double');
                node.value = reader.readDouble();
                nodes.push(node);
                break;
            }
            case 8: { // String
                const node = new WzNode(name, 'string');
                node.value = reader.readWzStringBlock(offset);
                nodes.push(node);
                break;
            }
            case 9: { // Extended (Canvas, Vector, Convex, Sound, UOL, Sub)
                const eob = reader.readUInt32() + reader.pos;
                const exNode = parseExtendedProp(reader, offset, eob, name);
                if (exNode) nodes.push(exNode);
                if (reader.pos !== eob) reader.pos = eob;
                break;
            }
            default:
                throw new Error(`Unknown property type ${ptype} at pos ${reader.pos}`);
        }
    }
    return nodes;
}

/**
 * Parse an extended property
 */
function parseExtendedProp(reader, offset, endOfBlock, name) {
    const b = reader.readByte();
    let iname;
    switch (b) {
        case 0x01:
        case HEADER_BYTE_WITH_OFFSET:
            iname = reader.readWzStringAtOffset(offset + reader.readInt32());
            break;
        case 0x00:
        case HEADER_BYTE_WITHOUT_OFFSET:
            iname = reader.readWzString();
            break;
        default:
            throw new Error(`Invalid byte ${b} at ParseExtendedProp`);
    }
    return extractMore(reader, offset, endOfBlock, name, iname);
}

/**
 * Build a WzNode from an extended property type name
 */
function extractMore(reader, offset, eob, name, iname) {
    switch (iname) {
        case 'Property': {
            const node = new WzNode(name, 'sub');
            reader.pos += 2; // reserved
            const children = parsePropertyList(reader, offset);
            for (const child of children) node.addChild(child);
            node.parsed = true;
            return node;
        }
        case 'Canvas': {
            const node = new WzNode(name, 'canvas');
            reader.readByte(); // unknown
            if (reader.readByte() === 1) {
                reader.pos += 2; // reserved
                const children = parsePropertyList(reader, offset);
                for (const child of children) node.addChild(child);
            }
            // Parse PNG property header (width, height, format, data offset)
            // We store enough info to decode later
            const pngWidth = reader.readCompressedInt();
            const pngHeight = reader.readCompressedInt();
            const pngFormat1 = reader.readCompressedInt();
            const pngFormat2 = reader.readCompressedInt();
            // Reconstruct format: format1 + (format2 << 8)
            const pngFormat = pngFormat1 + (pngFormat2 << 8);
            reader.pos += 4; // reserved
            const pngDataLen = reader.readInt32() - 1;
            reader.readByte(); // zlib header indicator

            node.width = pngWidth;
            node.height = pngHeight;
            // Store binary reference for lazy PNG decode
            node._pngInfo = {
                format: pngFormat,
                dataOffset: reader.pos,
                dataLength: pngDataLen,
            };
            reader.pos += pngDataLen;
            node.parsed = true;
            return node;
        }
        case 'Shape2D#Vector2D': {
            const node = new WzNode(name, 'vector');
            node.x = reader.readCompressedInt();
            node.y = reader.readCompressedInt();
            return node;
        }
        case 'Shape2D#Convex2D': {
            const node = new WzNode(name, 'convex');
            const convexCount = reader.readCompressedInt();
            for (let i = 0; i < convexCount; i++) {
                const child = parseExtendedProp(reader, offset, 0, String(i));
                if (child) node.addChild(child);
            }
            node.parsed = true;
            return node;
        }
        case 'Sound_DX8': {
            const node = new WzNode(name, 'sound');
            reader.readByte(); // unknown byte

            // soundDataLen does NOT include the length of the header
            const soundDataLen = reader.readCompressedInt();
            const soundDuration = reader.readCompressedInt();
            node.soundLength = soundDuration;

            // Read header: 51 bytes base (GUIDs), then 1 byte wavFormatLen, then wavFormatLen bytes
            const headerStart = reader.pos;
            const SOUND_HEADER_BASE = 51;
            reader.pos += SOUND_HEADER_BASE; // skip GUIDs
            const wavFormatLen = reader.readByte();
            reader.pos = headerStart; // go back
            const headerLength = SOUND_HEADER_BASE + 1 + wavFormatLen;
            reader.pos += headerLength; // skip entire header

            // Now at actual sound data
            const soundDataOffset = reader.pos;

            node._soundInfo = {
                headerOffset: headerStart,
                headerLength,
                dataOffset: soundDataOffset,
                dataLength: soundDataLen,
            };

            reader.pos += soundDataLen;
            return node;
        }
        case 'UOL': {
            reader.readByte(); // unknown
            const b = reader.readByte();
            let uolValue;
            if (b === 0) {
                uolValue = reader.readWzString();
            } else if (b === 1) {
                uolValue = reader.readWzStringAtOffset(offset + reader.readInt32());
            } else {
                uolValue = '';
            }
            const node = new WzNode(name, 'uol');
            node.value = uolValue;
            return node;
        }
        default:
            // Unknown extended type — skip to end of block
            console.warn(`Unknown extended type: "${iname}" at pos ${reader.pos}`);
            return null;
    }
}
