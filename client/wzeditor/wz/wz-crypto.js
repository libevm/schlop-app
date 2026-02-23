/**
 * Pure-JS AES-256-ECB for WZ key generation.
 * Web Crypto API doesn't support ECB mode, so we need a minimal AES core.
 *
 * Ported from MapleLib/WzLib/Util/WzMutableKey.cs + WzKeyGenerator.cs
 *
 * The WZ encryption scheme:
 *   1. Build a 16-byte IV block by repeating the 4-byte WzIv
 *   2. AES-256-ECB encrypt that block with the 32-byte trimmed UserKey → first 16 bytes of key
 *   3. Feed the output back as input to get the next 16 bytes, and so on
 *   4. The resulting byte stream is XOR'd with WZ strings for decryption
 *
 * We generate keys in 4096-byte batches (matching C# WzMutableKey.BatchSize).
 */

import { getTrimmedUserKey, MAPLESTORY_USERKEY_DEFAULT, WZ_BMSIV } from './wz-constants.js';

// ─── AES-256 Core (ECB mode, encrypt only) ─────────────────────────────────

// AES S-box
const SBOX = new Uint8Array([
    0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
    0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
    0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
    0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
    0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
    0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
    0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
    0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
    0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
    0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
    0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
    0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
    0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
    0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
    0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
    0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
]);

// Round constants
const RCON = new Uint8Array([
    0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36,
]);

// Galois field multiply (used in MixColumns)
function gmul(a, b) {
    let p = 0;
    for (let i = 0; i < 8; i++) {
        if (b & 1) p ^= a;
        const hi = a & 0x80;
        a = (a << 1) & 0xFF;
        if (hi) a ^= 0x1B;
        b >>= 1;
    }
    return p;
}

/**
 * Expand a 32-byte AES-256 key into 60 x 4-byte round key words (240 bytes)
 */
function expandKey256(key) {
    const Nk = 8;  // 256-bit key = 8 words
    const Nr = 14; // 14 rounds for AES-256
    const W = new Uint32Array(4 * (Nr + 1)); // 60 words

    // Copy key into first Nk words
    for (let i = 0; i < Nk; i++) {
        W[i] = (key[4 * i] << 24) | (key[4 * i + 1] << 16) | (key[4 * i + 2] << 8) | key[4 * i + 3];
    }

    for (let i = Nk; i < W.length; i++) {
        let temp = W[i - 1];
        if (i % Nk === 0) {
            // RotWord + SubWord + Rcon
            temp = ((SBOX[(temp >> 16) & 0xFF] << 24) |
                    (SBOX[(temp >> 8) & 0xFF] << 16) |
                    (SBOX[temp & 0xFF] << 8) |
                    SBOX[(temp >> 24) & 0xFF]) ^ (RCON[(i / Nk | 0) - 1] << 24);
        } else if (i % Nk === 4) {
            // SubWord only
            temp = (SBOX[(temp >> 24) & 0xFF] << 24) |
                   (SBOX[(temp >> 16) & 0xFF] << 16) |
                   (SBOX[(temp >> 8) & 0xFF] << 8) |
                   SBOX[temp & 0xFF];
        }
        W[i] = W[i - Nk] ^ temp;
    }
    return W;
}

/**
 * AES-256 encrypt a single 16-byte block (ECB mode).
 * @param {Uint8Array} block - 16-byte input (mutated in-place)
 * @param {Uint32Array} W - expanded key (60 words)
 */
function aesEncryptBlock(block, W) {
    const Nr = 14;
    // state is a 4x4 column-major matrix stored in block[16]
    // AddRoundKey(0)
    for (let c = 0; c < 4; c++) {
        const w = W[c];
        block[4 * c] ^= (w >>> 24) & 0xFF;
        block[4 * c + 1] ^= (w >>> 16) & 0xFF;
        block[4 * c + 2] ^= (w >>> 8) & 0xFF;
        block[4 * c + 3] ^= w & 0xFF;
    }

    for (let round = 1; round <= Nr; round++) {
        // SubBytes
        for (let i = 0; i < 16; i++) block[i] = SBOX[block[i]];

        // ShiftRows
        // Row 0: no shift
        // Row 1: shift left 1
        let t = block[1];
        block[1] = block[5]; block[5] = block[9]; block[9] = block[13]; block[13] = t;
        // Row 2: shift left 2
        t = block[2]; block[2] = block[10]; block[10] = t;
        t = block[6]; block[6] = block[14]; block[14] = t;
        // Row 3: shift left 3
        t = block[15];
        block[15] = block[11]; block[11] = block[7]; block[7] = block[3]; block[3] = t;

        // MixColumns (skip on last round)
        if (round < Nr) {
            for (let c = 0; c < 4; c++) {
                const s0 = block[4 * c], s1 = block[4 * c + 1], s2 = block[4 * c + 2], s3 = block[4 * c + 3];
                block[4 * c]     = gmul(s0, 2) ^ gmul(s1, 3) ^ s2 ^ s3;
                block[4 * c + 1] = s0 ^ gmul(s1, 2) ^ gmul(s2, 3) ^ s3;
                block[4 * c + 2] = s0 ^ s1 ^ gmul(s2, 2) ^ gmul(s3, 3);
                block[4 * c + 3] = gmul(s0, 3) ^ s1 ^ s2 ^ gmul(s3, 2);
            }
        }

        // AddRoundKey
        for (let c = 0; c < 4; c++) {
            const w = W[round * 4 + c];
            block[4 * c] ^= (w >>> 24) & 0xFF;
            block[4 * c + 1] ^= (w >>> 16) & 0xFF;
            block[4 * c + 2] ^= (w >>> 8) & 0xFF;
            block[4 * c + 3] ^= w & 0xFF;
        }
    }
}

// ─── WZ Key Generation ──────────────────────────────────────────────────────

const BATCH_SIZE = 4096;

/**
 * WzMutableKey equivalent — generates the XOR key stream used for WZ string decryption.
 * Keys are generated lazily in 4096-byte batches using AES-256-ECB.
 */
export class WzMutableKey {
    constructor(wzIv, aesUserKey) {
        this._iv = wzIv;
        this._aesKey = aesUserKey;
        this._keys = null;
        this._expandedKey = null;
    }

    /**
     * Get key byte at index, expanding if needed
     */
    at(index) {
        this.ensureKeySize(index + 1);
        return this._keys[index];
    }

    /**
     * Ensure at least `size` bytes are generated
     */
    ensureKeySize(size) {
        if (this._keys !== null && this._keys.length >= size) return;

        size = Math.ceil(size / BATCH_SIZE) * BATCH_SIZE;
        const newKeys = new Uint8Array(size);

        // BMS / all-zero IV → all-zero keys (no encryption)
        if (this._iv[0] === 0 && this._iv[1] === 0 && this._iv[2] === 0 && this._iv[3] === 0) {
            this._keys = newKeys;
            return;
        }

        let startIndex = 0;
        if (this._keys !== null) {
            newKeys.set(this._keys);
            startIndex = this._keys.length;
        }

        // Lazy expand key
        if (!this._expandedKey) {
            this._expandedKey = expandKey256(this._aesKey);
        }

        for (let i = startIndex; i < size; i += 16) {
            const block = new Uint8Array(16);
            if (i === 0) {
                // First block: IV repeated to fill 16 bytes
                for (let j = 0; j < 16; j++) block[j] = this._iv[j % 4];
            } else {
                // Subsequent blocks: encrypt the previous output
                block.set(newKeys.subarray(i - 16, i));
            }
            aesEncryptBlock(block, this._expandedKey);
            newKeys.set(block, i);
        }

        this._keys = newKeys;
    }

    /**
     * Get the full key buffer (for bulk operations)
     */
    getKeys() {
        return this._keys ? this._keys.slice() : new Uint8Array(0);
    }
}

/**
 * Generate a WzMutableKey from a 4-byte IV.
 * Uses the default MapleStory UserKey.
 */
export function generateWzKey(wzIv) {
    const trimmedKey = getTrimmedUserKey(MAPLESTORY_USERKEY_DEFAULT);
    return new WzMutableKey(wzIv, trimmedKey);
}
