/**
 * Parse a .wz file from an ArrayBuffer.
 * Ported from MapleLib/WzLib/WzFile.cs + WzDirectory.cs
 *
 * Returns a WzNode tree with the directory structure.
 * Image contents are NOT parsed — they remain lazy (parsed on demand).
 */

import { WzNode } from './wz-node.js';
import { WzBinaryReader } from './wz-binary-reader.js';
import { generateWzKey } from './wz-crypto.js';
import { getIvByMapleVersion, WzMapleVersion, WzDirectoryType } from './wz-constants.js';
import { checkAndGetVersionHash, check64BitClient } from './wz-tool.js';

/**
 * Parse a .wz file.
 *
 * @param {ArrayBuffer} buffer - the entire .wz file
 * @param {string} fileName - display name (e.g. "Map.wz")
 * @param {string} [mapleVersion='AUTO'] - WzMapleVersion key or 'AUTO' to try all
 * @param {number} [gameVersion=-1] - game patch version (-1 = auto-detect)
 * @param {function} [onProgress] - optional progress callback(message)
 * @returns {{ root: WzNode, version: number, is64Bit: boolean, mapleVersion: string }}
 */
export function parseWzFile(buffer, fileName, mapleVersion = 'AUTO', gameVersion = -1, onProgress) {
    if (onProgress) onProgress('Reading header...');

    // ─── Parse Header (encryption-independent) ───────────────────────
    const tempReader = new WzBinaryReader(buffer, generateWzKey(getIvByMapleVersion('BMS')));
    const ident = tempReader.readFixedString(4);
    if (ident !== 'PKG1') {
        throw new Error(`Invalid WZ file header: "${ident}" (expected "PKG1")`);
    }
    const fSize = tempReader.readUInt64();
    const fStart = tempReader.readUInt32();
    const copyright = tempReader.readNullTerminatedString();
    const header = { ident, fSize, fStart, copyright };

    // ─── Detect 64-bit client ────────────────────────────────────────
    tempReader.header = header;
    const is64Bit = check64BitClient(tempReader, header);

    const WZ_VERSION_HEADER_64BIT_START = 770;
    tempReader.pos = fStart;
    let wzVersionHeader;
    if (is64Bit) {
        wzVersionHeader = WZ_VERSION_HEADER_64BIT_START;
    } else {
        wzVersionHeader = tempReader.readUInt16();
    }

    if (onProgress) onProgress(`Header: ${is64Bit ? '64-bit' : 'classic'}, encVer=${wzVersionHeader}`);

    // ─── Determine encryption types to try ───────────────────────────
    const encryptionTypes = mapleVersion === 'AUTO'
        ? ['GMS', 'EMS', 'BMS']
        : [mapleVersion];

    // ─── Version + Encryption Detection ──────────────────────────────
    let detectedVersion = gameVersion;
    let versionHash = 0;
    let detectedMapleVersion = mapleVersion === 'AUTO' ? null : mapleVersion;
    let detectedWzKey = null;
    let detectedReader = null;

    if (gameVersion === -1) {
        // Build version candidates
        const candidates = [];
        if (is64Bit) {
            for (let v = WZ_VERSION_HEADER_64BIT_START; v < WZ_VERSION_HEADER_64BIT_START + 10; v++) {
                candidates.push(v);
            }
        }
        candidates.push(83); // popular private server version
        for (let v = 1; v <= 500; v++) {
            if (v !== 83) candidates.push(v);
        }

        // Try each encryption type × version combination
        outer:
        for (const encType of encryptionTypes) {
            const wzIv = getIvByMapleVersion(encType);
            const wzKey = generateWzKey(wzIv);
            const reader = new WzBinaryReader(buffer, wzKey);
            reader.header = header;

            for (const v of candidates) {
                const h = checkAndGetVersionHash(wzVersionHeader, v);
                if (h === 0) continue;

                reader.hash = h;
                reader.pos = fStart + (is64Bit ? 0 : 2);

                try {
                    const testResult = tryParseDirectory(reader, header.fStart);
                    if (testResult) {
                        // Verify: check first image has valid header byte
                        const firstImage = findFirstImage(testResult);
                        if (firstImage) {
                            const imgByte = reader.bytes[firstImage.offset];
                            if (imgByte === 0x73 || imgByte === 0x1B) {
                                detectedVersion = v;
                                versionHash = h;
                                detectedMapleVersion = encType;
                                detectedWzKey = wzKey;
                                detectedReader = reader;
                                break outer;
                            }
                        } else {
                            // No images but directory parsed — accept it
                            detectedVersion = v;
                            versionHash = h;
                            detectedMapleVersion = encType;
                            detectedWzKey = wzKey;
                            detectedReader = reader;
                            break outer;
                        }
                    }
                } catch {
                    // failed — try next
                }
            }
        }

        if (detectedVersion === -1 || !detectedMapleVersion) {
            throw new Error('Could not detect WZ version/encryption. Try specifying manually.');
        }
    } else {
        // Version specified — just detect encryption
        versionHash = checkAndGetVersionHash(wzVersionHeader, gameVersion);
        if (versionHash === 0) {
            throw new Error(`Invalid version hash for version ${gameVersion}`);
        }
        detectedVersion = gameVersion;
        if (!detectedMapleVersion) detectedMapleVersion = encryptionTypes[0];
        const wzIv = getIvByMapleVersion(detectedMapleVersion);
        detectedWzKey = generateWzKey(wzIv);
        detectedReader = new WzBinaryReader(buffer, detectedWzKey);
        detectedReader.header = header;
    }

    detectedReader.hash = versionHash;

    if (onProgress) onProgress(`Detected: v${detectedVersion}, ${detectedMapleVersion}`);

    // ─── Parse Directory Tree ────────────────────────────────────────
    detectedReader.pos = fStart + (is64Bit ? 0 : 2);

    const root = new WzNode(fileName, 'file');
    root.parsed = true;

    if (onProgress) onProgress('Parsing directory tree...');
    parseDirectory(detectedReader, root, header.fStart, detectedWzKey, versionHash);

    const imageCount = root.countImages();
    if (onProgress) onProgress(`Done. ${imageCount} images found.`);

    return {
        root,
        version: detectedVersion,
        is64Bit,
        mapleVersion: detectedMapleVersion,
        reader: detectedReader,
    };
}

/**
 * Parse a WZ directory's entries into a WzNode's children.
 * Ported from WzDirectory.ParseDirectory()
 */
function parseDirectory(reader, parentNode, fStart, wzKey, versionHash) {
    if (reader.available <= 0) return;

    const entryCount = reader.readCompressedInt();
    if (entryCount < 0 || entryCount > 100000) {
        throw new Error(`Invalid entry count: ${entryCount}`);
    }

    const entries = [];

    for (let i = 0; i < entryCount; i++) {
        const type = reader.readByte();
        let fname = null;
        let fsize, checksum;
        let offset;
        let rememberPos = 0;

        switch (type) {
            case WzDirectoryType.UnknownType_1: {
                reader.readInt32();
                reader.readInt16();
                reader.readWzOffset();
                continue;
            }
            case WzDirectoryType.RetrieveStringFromOffset_2: {
                const stringOffset = reader.readInt32();
                rememberPos = reader.pos;
                reader.pos = fStart + stringOffset;
                const innerType = reader.readByte();
                fname = reader.readWzString();
                break;
            }
            case WzDirectoryType.WzDirectory_3:
            case WzDirectoryType.WzImage_4: {
                fname = reader.readWzString();
                rememberPos = reader.pos;
                break;
            }
            default:
                throw new Error(`Unknown directory entry type: ${type}`);
        }

        reader.pos = rememberPos;
        fsize = reader.readCompressedInt();
        checksum = reader.readCompressedInt();
        offset = reader.readWzOffset();

        if (type === WzDirectoryType.WzDirectory_3 ||
            (type === WzDirectoryType.RetrieveStringFromOffset_2 && !fname.endsWith('.img'))) {
            const dirNode = new WzNode(fname, 'dir');
            dirNode._binaryOffset = offset;
            dirNode._binarySize = fsize;
            entries.push({ node: dirNode, isDir: true, offset });
            parentNode.addChild(dirNode);
        } else {
            const imgNode = new WzNode(fname, 'image');
            imgNode._binaryOffset = offset;
            imgNode._binarySize = fsize;
            imgNode._binarySource = {
                buffer: reader.buffer,
                offset: offset,
                length: fsize,
                wzKey: wzKey,
                hash: versionHash,
                headerFStart: fStart,
            };
            parentNode.addChild(imgNode);
        }
    }

    // Recurse into subdirectories
    for (const entry of entries) {
        if (entry.isDir) {
            reader.pos = entry.offset;
            parseDirectory(reader, entry.node, fStart, wzKey, versionHash);
            entry.node.parsed = true;
        }
    }
}

/**
 * Try parsing a directory for version detection (returns entries or null)
 */
function tryParseDirectory(reader, fStart) {
    if (reader.available <= 0) return null;

    const entryCount = reader.readCompressedInt();
    if (entryCount < 0 || entryCount > 100000) return null;

    const entries = [];
    for (let i = 0; i < entryCount; i++) {
        const type = reader.readByte();
        let fname = null;
        let rememberPos = 0;

        switch (type) {
            case WzDirectoryType.UnknownType_1:
                reader.readInt32();
                reader.readInt16();
                reader.readWzOffset();
                continue;
            case WzDirectoryType.RetrieveStringFromOffset_2: {
                const stringOffset = reader.readInt32();
                rememberPos = reader.pos;
                reader.pos = fStart + stringOffset;
                reader.readByte();
                fname = reader.readWzString();
                break;
            }
            case WzDirectoryType.WzDirectory_3:
            case WzDirectoryType.WzImage_4:
                fname = reader.readWzString();
                rememberPos = reader.pos;
                break;
            default:
                return null; // invalid
        }

        reader.pos = rememberPos;
        const fsize = reader.readCompressedInt();
        const checksum = reader.readCompressedInt();
        const offset = reader.readWzOffset();

        // Validate: name should have recognizable characters
        if (fname && fname.length > 0) {
            let valid = 0;
            for (let c = 0; c < fname.length; c++) {
                const ch = fname.charCodeAt(c);
                if (ch >= 0x20 && ch <= 0x7E) valid++;
            }
            if (valid < fname.length * 0.5) return null;
        }

        entries.push({ type, fname, fsize, offset });
    }

    return entries.length > 0 ? entries : null;
}

function findFirstImage(entries) {
    for (const e of entries) {
        if (e.type === WzDirectoryType.WzImage_4 ||
            (e.fname && e.fname.endsWith('.img'))) {
            return e;
        }
    }
    return null;
}
