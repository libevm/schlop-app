/**
 * DataView-based binary reader for WZ files.
 * Ported from MapleLib/WzLib/Util/WzBinaryReader.cs
 *
 * Wraps an ArrayBuffer with a movable cursor, providing methods for
 * reading WZ-specific data types (compressed ints, encrypted strings, offsets).
 */

import { WZ_OFFSET_CONSTANT } from './wz-constants.js';

export class WzBinaryReader {
    /**
     * @param {ArrayBuffer} buffer
     * @param {import('./wz-crypto.js').WzMutableKey} wzKey
     * @param {number} [startOffset=0] - base offset (for sub-readers)
     */
    constructor(buffer, wzKey, startOffset = 0) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.bytes = new Uint8Array(buffer);
        this.wzKey = wzKey;
        this.pos = 0;
        this.startOffset = startOffset;

        /** @type {{ ident: string, fSize: number, fStart: number, copyright: string }|null} */
        this.header = null;
        /** @type {number} */
        this.hash = 0;
    }

    get length() { return this.buffer.byteLength; }
    get available() { return this.buffer.byteLength - this.pos; }

    // ─── Primitive reads ─────────────────────────────────────────────────

    readByte() {
        return this.view.getUint8(this.pos++);
    }

    readSByte() {
        return this.view.getInt8(this.pos++);
    }

    readUInt16() {
        const v = this.view.getUint16(this.pos, true);
        this.pos += 2;
        return v;
    }

    readInt16() {
        const v = this.view.getInt16(this.pos, true);
        this.pos += 2;
        return v;
    }

    readUInt32() {
        const v = this.view.getUint32(this.pos, true);
        this.pos += 4;
        return v;
    }

    readInt32() {
        const v = this.view.getInt32(this.pos, true);
        this.pos += 4;
        return v;
    }

    readInt64() {
        // Read as two 32-bit values (little-endian). For WZ, 64-bit values fit in Number range.
        const lo = this.view.getUint32(this.pos, true);
        const hi = this.view.getInt32(this.pos + 4, true);
        this.pos += 8;
        return hi * 0x100000000 + lo;
    }

    readUInt64() {
        const lo = this.view.getUint32(this.pos, true);
        const hi = this.view.getUint32(this.pos + 4, true);
        this.pos += 8;
        return hi * 0x100000000 + lo;
    }

    readFloat() {
        const v = this.view.getFloat32(this.pos, true);
        this.pos += 4;
        return v;
    }

    readDouble() {
        const v = this.view.getFloat64(this.pos, true);
        this.pos += 8;
        return v;
    }

    readBytes(count) {
        const result = new Uint8Array(this.buffer, this.pos, count);
        this.pos += count;
        return result.slice(); // return a copy
    }

    // ─── String reads ────────────────────────────────────────────────────

    /**
     * Read a fixed-length ASCII string (no decryption)
     */
    readFixedString(length) {
        const bytes = this.readBytes(length);
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return s;
    }

    /**
     * Read a null-terminated string
     */
    readNullTerminatedString() {
        let s = '';
        while (this.pos < this.length) {
            const b = this.readByte();
            if (b === 0) break;
            s += String.fromCharCode(b);
        }
        return s;
    }

    // ─── WZ Compressed Int ───────────────────────────────────────────────

    /**
     * Read a WZ compressed int (sbyte, or int32 if sbyte == -128)
     */
    readCompressedInt() {
        const sb = this.readSByte();
        if (sb === -128) return this.readInt32();
        return sb;
    }

    /**
     * Read a WZ compressed long (sbyte, or int64 if sbyte == -128)
     */
    readCompressedLong() {
        const sb = this.readSByte();
        if (sb === -128) return this.readInt64();
        return sb;
    }

    // ─── WZ Encrypted String ────────────────────────────────────────────

    /**
     * Read an encrypted WZ string (the main string reader)
     * Ported from WzBinaryReader.ReadString()
     */
    readWzString() {
        const smallLength = this.readSByte();
        if (smallLength === 0) return '';

        let length;
        if (smallLength > 0) {
            // Unicode
            length = smallLength === 127 ? this.readInt32() : smallLength;
            if (length <= 0) return '';
            return this._decodeUnicode(length);
        } else {
            // ASCII
            length = smallLength === -128 ? this.readInt32() : -smallLength;
            if (length <= 0) return '';
            return this._decodeAscii(length);
        }
    }

    _decodeUnicode(length) {
        this.wzKey.ensureKeySize(length * 2);
        const chars = new Array(length);
        let mask = 0xAAAA;
        for (let i = 0; i < length; i++) {
            let enc = this.readUInt16();
            enc ^= mask;
            enc ^= ((this.wzKey.at(i * 2 + 1) << 8) | this.wzKey.at(i * 2));
            chars[i] = String.fromCharCode(enc & 0xFFFF);
            mask = (mask + 1) & 0xFFFF;
        }
        return chars.join('');
    }

    _decodeAscii(length) {
        this.wzKey.ensureKeySize(length);
        const chars = new Array(length);
        let mask = 0xAA;
        for (let i = 0; i < length; i++) {
            let enc = this.readByte();
            enc ^= mask;
            enc ^= this.wzKey.at(i);
            chars[i] = String.fromCharCode(enc & 0xFF);
            mask = (mask + 1) & 0xFF;
        }
        return chars.join('');
    }

    /**
     * Read a string at a given offset, then return to current position
     */
    readWzStringAtOffset(offset, readByte = false) {
        const saved = this.pos;
        this.pos = offset - this.startOffset;
        if (readByte) this.readByte();
        const str = this.readWzString();
        this.pos = saved;
        return str;
    }

    /**
     * Read a WZ "string block" — either inline or offset-referenced
     * Ported from WzBinaryReader.ReadStringBlock()
     */
    readWzStringBlock(offset) {
        const b = this.readByte();
        switch (b) {
            case 0x00:
            case 0x73:
                return this.readWzString();
            case 0x01:
            case 0x1B:
                return this.readWzStringAtOffset(offset + this.readInt32());
            default:
                return '';
        }
    }

    // ─── WZ Offset ───────────────────────────────────────────────────────

    /**
     * Read and decrypt a WZ offset
     * Ported from WzBinaryReader.ReadOffset()
     */
    readWzOffset() {
        let offset = this.pos;
        offset = ((offset - this.header.fStart) ^ 0xFFFFFFFF) >>> 0;
        offset = Math.imul(offset, this.hash) >>> 0;
        offset = (offset - WZ_OFFSET_CONSTANT) >>> 0;
        offset = rotateLeft(offset, offset & 0x1F);
        const encryptedOffset = this.readUInt32();
        offset = (offset ^ encryptedOffset) >>> 0;
        offset = (offset + this.header.fStart * 2) >>> 0;
        return offset + this.startOffset;
    }

    // ─── Utility ─────────────────────────────────────────────────────────

    /**
     * Create a sub-reader for a section of the buffer
     */
    createSubReader(start, length) {
        const slice = this.buffer.slice(start, start + length);
        const sub = new WzBinaryReader(slice, this.wzKey, start);
        sub.hash = this.hash;
        sub.header = this.header;
        return sub;
    }
}

function rotateLeft(x, n) {
    n &= 31;
    return ((x << n) | (x >>> (32 - n))) >>> 0;
}
