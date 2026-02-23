/**
 * WZ Sound extraction.
 * Ported from MapleLib/WzLib/WzProperties/WzBinaryProperty.cs
 *
 * WZ stores sound as: [header bytes (GUID + waveformat)] [raw sound data (typically MP3)]
 * The sound header contains GUIDs identifying the format, followed by WAVEFORMATEX-like data.
 */

// Standard sound header length (GUIDs + format tag)
const SOUND_HEADER_BASE_LENGTH = 51; // 0x33 bytes: 1 + 16 + 16 + 1 + 1 + 16

/**
 * Extract sound data from a WZ binary reader positioned at the sound property.
 * Returns raw MP3/WAV bytes that can be played directly.
 *
 * @param {import('./wz-binary-reader.js').WzBinaryReader} reader
 * @param {number} dataOffset - offset where sound header starts
 * @param {number} totalLength - soundDataLen from the property header
 * @returns {{ header: Uint8Array, data: Uint8Array, headerLength: number }}
 */
export function extractSoundData(reader, dataOffset, totalLength) {
    const savedPos = reader.pos;
    reader.pos = dataOffset;

    // Read standard header
    const headerBase = reader.readBytes(SOUND_HEADER_BASE_LENGTH);

    // The byte at offset 51 tells us the wave format extension length
    const wavFormatLen = reader.readByte();

    // Read the wave format bytes
    const wavFormatBytes = reader.readBytes(wavFormatLen);

    // Total header = base + 1 (wavFormatLen byte) + wavFormatBytes
    const headerLength = SOUND_HEADER_BASE_LENGTH + 1 + wavFormatLen;

    // The actual sound data follows
    const soundData = reader.readBytes(totalLength);

    reader.pos = savedPos;

    return {
        header: new Uint8Array([...headerBase, wavFormatLen, ...wavFormatBytes]),
        data: soundData,
        headerLength,
    };
}

/**
 * Create a playable Blob URL from raw sound data.
 * Most WZ sounds are MP3, so we try audio/mpeg first.
 *
 * @param {Uint8Array} soundData - raw sound bytes
 * @returns {string} blob URL
 */
export function createSoundBlobUrl(soundData) {
    // Detect format by checking for MP3 sync bytes (0xFF 0xFB or 0xFF 0xFA, etc.)
    // or ID3 header
    let mimeType = 'audio/mpeg'; // default to MP3

    if (soundData.length >= 4) {
        // Check for RIFF/WAV header
        if (soundData[0] === 0x52 && soundData[1] === 0x49 &&
            soundData[2] === 0x46 && soundData[3] === 0x46) {
            mimeType = 'audio/wav';
        }
        // Check for OGG header
        if (soundData[0] === 0x4F && soundData[1] === 0x67 &&
            soundData[2] === 0x67 && soundData[3] === 0x53) {
            mimeType = 'audio/ogg';
        }
    }

    const blob = new Blob([soundData], { type: mimeType });
    return URL.createObjectURL(blob);
}

/**
 * Convert sound data to base64 string for XML serialization.
 *
 * @param {Uint8Array} data
 * @returns {string}
 */
export function soundToBase64(data) {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
        binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
}

/**
 * Convert sound header to base64 string for XML serialization.
 *
 * @param {Uint8Array} header
 * @returns {string}
 */
export function soundHeaderToBase64(header) {
    return soundToBase64(header);
}
