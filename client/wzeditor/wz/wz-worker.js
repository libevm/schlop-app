/**
 * Web Worker for heavy WZ parsing.
 * Receives commands from the main thread, parses WZ data, sends results back.
 *
 * Messages:
 *   { cmd: 'parseWzFile', buffer: ArrayBuffer, fileName: string, mapleVersion: string, gameVersion: number }
 *   { cmd: 'parseImage', buffer: ArrayBuffer, offset: number, length: number, ivType: string, hash: number, fStart: number }
 */

import { parseWzFile } from './wz-file.js';
import { WzBinaryReader } from './wz-binary-reader.js';
import { generateWzKey } from './wz-crypto.js';
import { getIvByMapleVersion } from './wz-constants.js';
import { parseImageFromReader } from './wz-image.js';

self.onmessage = function(e) {
    const { cmd, id } = e.data;

    try {
        switch (cmd) {
            case 'parseWzFile': {
                const { buffer, fileName, mapleVersion, gameVersion } = e.data;
                const result = parseWzFile(buffer, fileName, mapleVersion, gameVersion, (msg) => {
                    self.postMessage({ id, type: 'progress', message: msg });
                });
                // Serialize the tree for transfer (can't send class instances)
                const serialized = serializeNode(result.root);
                self.postMessage({
                    id,
                    type: 'result',
                    root: serialized,
                    version: result.version,
                    is64Bit: result.is64Bit,
                });
                break;
            }
            case 'parseImage': {
                const { buffer, offset, length, mapleVersion, hash, fStart } = e.data;
                const wzIv = getIvByMapleVersion(mapleVersion);
                const wzKey = generateWzKey(wzIv);
                const reader = new WzBinaryReader(buffer, wzKey, offset);
                reader.hash = hash;
                reader.header = { fStart, fSize: 0, ident: 'PKG1', copyright: '' };

                const children = parseImageFromReader(reader, offset);
                const serialized = children.map(c => serializeNode(c));
                self.postMessage({ id, type: 'result', children: serialized });
                break;
            }
            default:
                self.postMessage({ id, type: 'error', message: `Unknown command: ${cmd}` });
        }
    } catch (err) {
        self.postMessage({ id, type: 'error', message: err.message, stack: err.stack });
    }
};

/**
 * Serialize a WzNode tree to a plain object for postMessage transfer.
 */
function serializeNode(node) {
    const obj = {
        id: node.id,
        name: node.name,
        type: node.type,
        value: node.value,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        basedata: node.basedata,
        basehead: node.basehead,
        soundLength: node.soundLength,
        parsed: node.parsed,
        children: node.children.map(c => serializeNode(c)),
    };
    // Binary source info for lazy loading
    if (node._binarySource) {
        obj._binarySource = {
            offset: node._binarySource.offset,
            length: node._binarySource.length,
            hash: node._binarySource.hash,
            headerFStart: node._binarySource.headerFStart,
        };
    }
    if (node._pngInfo) {
        obj._pngInfo = { ...node._pngInfo };
    }
    if (node._soundInfo) {
        obj._soundInfo = { ...node._soundInfo };
    }
    return obj;
}
