/**
 * WZ PNG pixel format decoder.
 * Converts raw WZ pixel data to RGBA8888 ImageData, then to PNG via OffscreenCanvas.
 *
 * Ported from MapleLib/WzLib/WzProperties/WzPngProperty.cs + PngUtility.cs
 *
 * Supported formats:
 *   1    = BGRA4444 (16bpp)
 *   2    = BGRA8888 (32bpp)
 *   3    = DXT3 grayscale (compressed)
 *   257  = ARGB1555 (16bpp)  [rare]
 *   513  = RGB565 (16bpp)
 *   517  = RGB565 16x16 block (special)
 *   1026 = DXT3 (compressed)
 *   2050 = DXT5 (compressed)
 */

/**
 * Decompress raw WZ pixel data → RGBA8888 Uint8ClampedArray
 *
 * @param {Uint8Array} raw - decompressed pixel data (after zlib inflate)
 * @param {number} width
 * @param {number} height
 * @param {number} format - WZ PNG format ID
 * @returns {Uint8ClampedArray} RGBA8888 pixel data
 */
export function decodePixels(raw, width, height, format) {
    switch (format) {
        case 1: return decodeBGRA4444(raw, width, height);
        case 2: return decodeBGRA8888(raw, width, height);
        case 3:
        case 1026: return decodeDXT3(raw, width, height);
        case 257: return decodeARGB1555(raw, width, height);
        case 513: return decodeRGB565(raw, width, height);
        case 517: return decodeRGB565_Block(raw, width, height);
        case 2050: return decodeDXT5(raw, width, height);
        default:
            console.warn(`Unknown PNG format ${format}, treating as BGRA8888`);
            return decodeBGRA8888(raw, width, height);
    }
}

/**
 * Get the expected decompressed buffer size for a format
 */
export function getDecompressedSize(width, height, format) {
    switch (format) {
        case 1: return width * height * 2;
        case 2: return width * height * 4;
        case 3: return width * height * 4;
        case 257: return width * height * 2;
        case 513: return width * height * 2;
        case 517: return Math.ceil(width * height / 128);
        case 1026: return width * height * 4;
        case 2050: return width * height;
        default: return width * height * 4;
    }
}

// ─── Format 1: BGRA4444 ─────────────────────────────────────────────────────

function decodeBGRA4444(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    const size = width * height * 2;
    for (let i = 0; i < size; i += 2) {
        const lo = raw[i];
        const hi = raw[i + 1];
        const b = lo & 0x0F; const g = (lo >> 4) & 0x0F;
        const r = hi & 0x0F; const a = (hi >> 4) & 0x0F;
        const j = i * 2;
        out[j]     = r | (r << 4);
        out[j + 1] = g | (g << 4);
        out[j + 2] = b | (b << 4);
        out[j + 3] = a | (a << 4);
    }
    return out;
}

// ─── Format 2: BGRA8888 ─────────────────────────────────────────────────────

function decodeBGRA8888(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const j = i * 4;
        out[j]     = raw[j + 2]; // R (from B position in BGRA)
        out[j + 1] = raw[j + 1]; // G
        out[j + 2] = raw[j];     // B (from R position in BGRA)
        out[j + 3] = raw[j + 3]; // A
    }
    return out;
}

// ─── Format 257: ARGB1555 ────────────────────────────────────────────────────

function decodeARGB1555(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const v = raw[i * 2] | (raw[i * 2 + 1] << 8);
        const a = ((v >> 15) & 1) * 255;
        const r = ((v >> 10) & 0x1F) * 255 / 31;
        const g = ((v >> 5) & 0x1F) * 255 / 31;
        const b = (v & 0x1F) * 255 / 31;
        const j = i * 4;
        out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = a;
    }
    return out;
}

// ─── Format 513: RGB565 ─────────────────────────────────────────────────────

function decodeRGB565(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const v = raw[i * 2] | (raw[i * 2 + 1] << 8);
        const r = ((v >> 11) & 0x1F) * 255 / 31;
        const g = ((v >> 5) & 0x3F) * 255 / 63;
        const b = (v & 0x1F) * 255 / 31;
        const j = i * 4;
        out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = 255;
    }
    return out;
}

// ─── Format 517: RGB565 16x16 block ──────────────────────────────────────────

function decodeRGB565_Block(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    let lineIndex = 0;
    for (let j0 = 0; j0 < height / 16; j0++) {
        let dstIndex = lineIndex;
        for (let i0 = 0; i0 < width / 16; i0++) {
            const idx = (j0 * (width / 16) + i0) * 2;
            const pixel = raw[idx] | (raw[idx + 1] << 8);
            const r = ((pixel >> 11) & 0x1F) * 255 / 31;
            const g = ((pixel >> 5) & 0x3F) * 255 / 63;
            const b = (pixel & 0x1F) * 255 / 31;
            for (let j1 = 0; j1 < 16; j1++) {
                for (let i1 = 0; i1 < 16; i1++) {
                    const px = i0 * 16 + i1;
                    const py = j0 * 16 + j1;
                    if (px < width && py < height) {
                        const k = (py * width + px) * 4;
                        out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = 255;
                    }
                }
            }
            dstIndex += 16 * 4;
        }
        lineIndex += width * 16 * 4;
    }
    return out;
}

// ─── Format 3/1026: DXT3 ─────────────────────────────────────────────────────

function decodeDXT3(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    const blockCountX = (width + 3) >> 2;
    const blockCountY = (height + 3) >> 2;

    for (let by = 0; by < blockCountY; by++) {
        for (let bx = 0; bx < blockCountX; bx++) {
            const blockIdx = (by * blockCountX + bx) * 16;
            // 8 bytes alpha, 2 bytes color0, 2 bytes color1, 4 bytes indices
            const alphas = extractDXT3Alpha(raw, blockIdx);
            const c0 = raw[blockIdx + 8] | (raw[blockIdx + 9] << 8);
            const c1 = raw[blockIdx + 10] | (raw[blockIdx + 11] << 8);
            const colors = expandColorTable565(c0, c1);
            const indices = extractColorIndices(raw, blockIdx + 12);

            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < 4; i++) {
                    const px = bx * 4 + i;
                    const py = by * 4 + j;
                    if (px >= width || py >= height) continue;
                    const ci = indices[j * 4 + i];
                    const c = colors[ci];
                    const k = (py * width + px) * 4;
                    out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2];
                    out[k + 3] = alphas[j * 4 + i];
                }
            }
        }
    }
    return out;
}

function extractDXT3Alpha(raw, off) {
    const a = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
        const b = raw[off + i];
        a[i * 2]     = ((b & 0x0F) * 17) | 0; // expand 4-bit to 8-bit
        a[i * 2 + 1] = (((b >> 4) & 0x0F) * 17) | 0;
    }
    return a;
}

// ─── Format 2050: DXT5 ───────────────────────────────────────────────────────

function decodeDXT5(raw, width, height) {
    const out = new Uint8ClampedArray(width * height * 4);
    const blockCountX = (width + 3) >> 2;
    const blockCountY = (height + 3) >> 2;

    for (let by = 0; by < blockCountY; by++) {
        for (let bx = 0; bx < blockCountX; bx++) {
            const blockIdx = (by * blockCountX + bx) * 16;
            const alphas = extractDXT5Alpha(raw, blockIdx);
            const c0 = raw[blockIdx + 8] | (raw[blockIdx + 9] << 8);
            const c1 = raw[blockIdx + 10] | (raw[blockIdx + 11] << 8);
            const colors = expandColorTable565(c0, c1);
            const indices = extractColorIndices(raw, blockIdx + 12);

            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < 4; i++) {
                    const px = bx * 4 + i;
                    const py = by * 4 + j;
                    if (px >= width || py >= height) continue;
                    const ci = indices[j * 4 + i];
                    const c = colors[ci];
                    const k = (py * width + px) * 4;
                    out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2];
                    out[k + 3] = alphas[j * 4 + i];
                }
            }
        }
    }
    return out;
}

function extractDXT5Alpha(raw, off) {
    const a0 = raw[off];
    const a1 = raw[off + 1];
    const aTable = new Uint8Array(8);
    aTable[0] = a0;
    aTable[1] = a1;
    if (a0 > a1) {
        for (let i = 1; i <= 6; i++) aTable[i + 1] = ((7 - i) * a0 + i * a1 + 3) / 7 | 0;
    } else {
        for (let i = 1; i <= 4; i++) aTable[i + 1] = ((5 - i) * a0 + i * a1 + 2) / 5 | 0;
        aTable[6] = 0;
        aTable[7] = 255;
    }

    // 6 bytes of 3-bit indices = 16 values
    const alphaIndices = new Uint8Array(16);
    // Read 48 bits (6 bytes) starting at off+2
    let bits = 0n;
    for (let i = 0; i < 6; i++) {
        bits |= BigInt(raw[off + 2 + i]) << BigInt(i * 8);
    }
    for (let i = 0; i < 16; i++) {
        alphaIndices[i] = Number((bits >> BigInt(i * 3)) & 7n);
    }

    const result = new Uint8Array(16);
    for (let i = 0; i < 16; i++) result[i] = aTable[alphaIndices[i]];
    return result;
}

// ─── Shared DXT helpers ──────────────────────────────────────────────────────

function expandColorTable565(c0, c1) {
    const r0 = (c0 >> 11) & 0x1F, g0 = (c0 >> 5) & 0x3F, b0 = c0 & 0x1F;
    const r1 = (c1 >> 11) & 0x1F, g1 = (c1 >> 5) & 0x3F, b1 = c1 & 0x1F;
    const toRGB = (r, g, b) => [r * 255 / 31 | 0, g * 255 / 63 | 0, b * 255 / 31 | 0];
    const colors = [
        toRGB(r0, g0, b0),
        toRGB(r1, g1, b1),
    ];
    if (c0 > c1) {
        colors[2] = [(2 * colors[0][0] + colors[1][0] + 1) / 3 | 0,
                     (2 * colors[0][1] + colors[1][1] + 1) / 3 | 0,
                     (2 * colors[0][2] + colors[1][2] + 1) / 3 | 0];
        colors[3] = [(colors[0][0] + 2 * colors[1][0] + 1) / 3 | 0,
                     (colors[0][1] + 2 * colors[1][1] + 1) / 3 | 0,
                     (colors[0][2] + 2 * colors[1][2] + 1) / 3 | 0];
    } else {
        colors[2] = [(colors[0][0] + colors[1][0]) / 2 | 0,
                     (colors[0][1] + colors[1][1]) / 2 | 0,
                     (colors[0][2] + colors[1][2]) / 2 | 0];
        colors[3] = [0, 0, 0];
    }
    return colors;
}

function extractColorIndices(raw, off) {
    const indices = new Uint8Array(16);
    for (let i = 0; i < 4; i++) {
        const b = raw[off + i];
        indices[i * 4]     = b & 3;
        indices[i * 4 + 1] = (b >> 2) & 3;
        indices[i * 4 + 2] = (b >> 4) & 3;
        indices[i * 4 + 3] = (b >> 6) & 3;
    }
    return indices;
}

// ─── Convert RGBA pixels to PNG data URL ─────────────────────────────────────

/**
 * Convert RGBA8888 pixel data to a PNG data URL using OffscreenCanvas.
 *
 * @param {Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 * @returns {Promise<string>} data:image/png;base64,...
 */
export async function rgbaToPngDataUrl(rgba, width, height) {
    if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(rgba, width, height);
        ctx.putImageData(imgData, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } else {
        // Fallback: regular canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imgData = new ImageData(rgba, width, height);
        ctx.putImageData(imgData, 0, 0);
        return canvas.toDataURL('image/png');
    }
}

/**
 * Convert RGBA to base64 PNG string (without data URL prefix)
 */
export async function rgbaToPngBase64(rgba, width, height) {
    const dataUrl = await rgbaToPngDataUrl(rgba, width, height);
    return dataUrl.split(',')[1];
}

// ─── Inflate helper ──────────────────────────────────────────────────────────

/**
 * Inflate (decompress) zlib/deflate data.
 * WZ compressed data is often truncated (no proper zlib checksum/terminator),
 * so we read until we get expectedSize bytes or the stream errors out.
 *
 * @param {Uint8Array} compressed - raw deflate data (no zlib header — caller strips it)
 * @param {number} expectedSize - expected decompressed size
 * @returns {Promise<Uint8Array>}
 */
export async function inflate(compressed, expectedSize) {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream not available in this browser');
    }

    // Use deflate-raw since the caller already stripped the 2-byte zlib header
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();

    // Write data and close — don't await close() because truncated streams may error
    writer.write(compressed).catch(() => {});
    writer.close().catch(() => {});

    const reader = ds.readable.getReader();
    const result = new Uint8Array(expectedSize);
    let totalRead = 0;

    try {
        while (totalRead < expectedSize) {
            const { done, value } = await reader.read();
            if (done) break;
            const remaining = expectedSize - totalRead;
            const toCopy = Math.min(value.length, remaining);
            result.set(value.subarray(0, toCopy), totalRead);
            totalRead += toCopy;
        }
    } catch {
        // WZ data is often truncated — the decompressor may error after
        // producing all the bytes we need. That's OK.
    }

    // Cancel the reader to clean up
    try { reader.cancel().catch(() => {}); } catch {}

    if (totalRead < expectedSize) {
        // Return what we got — partial decode is better than nothing
        console.warn(`inflate: got ${totalRead}/${expectedSize} bytes`);
    }
    return result;
}
