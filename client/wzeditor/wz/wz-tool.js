/**
 * WZ utility functions.
 * Ported from MapleLib/WzLib/Util/WzTool.cs
 */

export const WZ_HEADER_MAGIC = 0x31474B50; // "PKG1" as uint32 LE

/**
 * Compute the version hash from a patch version number.
 * Ported from WzFile.CheckAndGetVersionHash()
 *
 * @param {number} wzVersionHeader - version header from .wz file (uint16)
 * @param {number} maplestoryPatchVersion - version to test
 * @returns {number} versionHash, or 0 if invalid
 */
export function checkAndGetVersionHash(wzVersionHeader, maplestoryPatchVersion) {
    const WZ_VERSION_HEADER_64BIT_START = 770;
    let versionHash = 0;
    const vstr = String(maplestoryPatchVersion);
    for (let i = 0; i < vstr.length; i++) {
        versionHash = ((versionHash * 32) + vstr.charCodeAt(i) + 1) >>> 0;
    }

    if (wzVersionHeader === WZ_VERSION_HEADER_64BIT_START) {
        return versionHash;
    }

    const decryptedVersionNumber = (~(
        ((versionHash >> 24) & 0xFF) ^
        ((versionHash >> 16) & 0xFF) ^
        ((versionHash >> 8) & 0xFF) ^
        (versionHash & 0xFF)
    )) & 0xFF;

    if (wzVersionHeader === decryptedVersionNumber) {
        return versionHash;
    }
    return 0; // invalid
}

/**
 * Detect if a WZ file is 64-bit format (no encVer header).
 * Since KMST1132 / GMSv230 (~2022/02/09), encVer was removed from offset 0x3C.
 *
 * Ported from WzFile.Check64BitClient()
 *
 * @param {import('./wz-binary-reader.js').WzBinaryReader} reader
 * @param {{ fStart: number, fSize: number }} header
 * @returns {boolean} true if 64-bit (no encVer header)
 */
export function check64BitClient(reader, header) {
    if (header.fSize >= 2) {
        const saved = reader.pos;
        reader.pos = header.fStart;

        const encver = reader.readUInt16();
        reader.pos = saved;

        if (encver > 0xFF) {
            return true; // 64-bit
        }
        if (encver === 0x80) {
            // Edge case: might be a compressed int property count
            if (header.fSize >= 5) {
                reader.pos = header.fStart;
                const propCount = reader.readInt32();
                reader.pos = saved;
                if (propCount > 0 && (propCount & 0xFF) === 0 && propCount <= 0xFFFF) {
                    return true; // 64-bit
                }
            }
        }
        reader.pos = header.fStart;
        return false; // old format with encVer
    }
    return true; // data part too small → must be 64-bit
}
