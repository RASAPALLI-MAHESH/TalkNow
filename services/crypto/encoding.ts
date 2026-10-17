import { base64 } from '@scure/base';

export const toB64 = (bytes: Uint8Array): string => base64.encode(bytes);

// Throws on anything that is not canonical base64.
export const fromB64 = (text: string): Uint8Array => base64.decode(text);

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
    let length = 0;
    for (const p of parts) length += p.length;
    const out = new Uint8Array(length);
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
};

export const u32 = (n: number): Uint8Array => {
    if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new RangeError('u32 out of range');
    return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
};

export const readU32 = (bytes: Uint8Array, offset: number): number => {
    if (offset + 4 > bytes.length) throw new RangeError('u32 read past end');
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
};

// Constant-time for equal lengths.
export const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
};

/*
  UTF-8 by hand: Hermes builds differ in TextEncoder/TextDecoder support, and message
  text must round-trip exactly on every phone. Lone surrogates become U+FFFD.
*/
export const utf8Encode = (text: string): Uint8Array => {
    const out: number[] = [];
    for (let i = 0; i < text.length; i++) {
        let code = text.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
            if (next >= 0xdc00 && next <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                i++;
            } else {
                code = 0xfffd;
            }
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            code = 0xfffd;
        }

        if (code < 0x80) out.push(code);
        else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
    return Uint8Array.from(out);
};

// Strict: rejects overlong forms, surrogates and truncated sequences.
export const utf8Decode = (bytes: Uint8Array): string => {
    let out = '';
    let i = 0;
    const fail = () => {
        throw new Error('Invalid UTF-8');
    };
    const cont = (k: number) => {
        const b = bytes[k];
        if (b === undefined || (b & 0xc0) !== 0x80) fail();
        return b & 0x3f;
    };
    while (i < bytes.length) {
        const b0 = bytes[i];
        let code: number;
        if (b0 < 0x80) {
            code = b0;
            i += 1;
        } else if (b0 >= 0xc2 && b0 <= 0xdf) {
            code = ((b0 & 0x1f) << 6) | cont(i + 1);
            i += 2;
        } else if (b0 >= 0xe0 && b0 <= 0xef) {
            code = ((b0 & 0x0f) << 12) | (cont(i + 1) << 6) | cont(i + 2);
            if (code < 0x800 || (code >= 0xd800 && code <= 0xdfff)) fail();
            i += 3;
        } else if (b0 >= 0xf0 && b0 <= 0xf4) {
            code = ((b0 & 0x07) << 18) | (cont(i + 1) << 12) | (cont(i + 2) << 6) | cont(i + 3);
            if (code < 0x10000 || code > 0x10ffff) fail();
            i += 4;
        } else {
            return fail();
        }
        if (code > 0xffff) {
            code -= 0x10000;
            out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
        } else {
            out += String.fromCharCode(code);
        }
    }
    return out;
};
