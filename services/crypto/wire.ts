/*
  Byte layouts of what travels inside an envelope's base64 body.

  whisper: version(1) | header(40) | ciphertext
  prekey:  version(1) | identity signing key(32) | identity DH key(32) | identity DH signature(64)
           | base key(32) | signed prekey id(u32) | one-time prekey id(u32, 0 = none) | whisper bytes

  Tampering with any prekey field changes the X3DH secret, so the inner message fails to open.
*/
import { concatBytes, readU32, u32, utf8Decode, utf8Encode } from './encoding';
import { E2EEError } from './errors';
import { PublicIdentity } from './identity';
import { KEY_LENGTH, SIGNATURE_LENGTH } from './primitives';
import { HEADER_LENGTH } from './ratchet';

export const WIRE_VERSION = 1;
const TAG_LENGTH = 16;
const PREKEY_FIXED_LENGTH = 1 + KEY_LENGTH * 2 + SIGNATURE_LENGTH + KEY_LENGTH + 8;

export type WhisperMessage = { header: Uint8Array; ciphertext: Uint8Array };

export type PreKeyMessage = {
    identity: PublicIdentity;
    baseKey: Uint8Array;
    signedPreKeyId: number;
    oneTimePreKeyId: number | null;
    message: WhisperMessage;
};

const invalid = () => new E2EEError('invalid_message', 'Malformed encrypted message');

export const encodeWhisper = (m: WhisperMessage): Uint8Array => concatBytes(new Uint8Array([WIRE_VERSION]), m.header, m.ciphertext);

export const decodeWhisper = (bytes: Uint8Array): WhisperMessage => {
    if (bytes.length < 1 + HEADER_LENGTH + TAG_LENGTH || bytes[0] !== WIRE_VERSION) throw invalid();
    return { header: bytes.slice(1, 1 + HEADER_LENGTH), ciphertext: bytes.slice(1 + HEADER_LENGTH) };
};

export const encodePreKey = (m: PreKeyMessage): Uint8Array =>
    concatBytes(
        new Uint8Array([WIRE_VERSION]),
        m.identity.signingKey,
        m.identity.dhKey,
        m.identity.dhSignature,
        m.baseKey,
        u32(m.signedPreKeyId),
        u32(m.oneTimePreKeyId ?? 0),
        encodeWhisper(m.message)
    );

export const decodePreKey = (bytes: Uint8Array): PreKeyMessage => {
    if (bytes.length < PREKEY_FIXED_LENGTH + 1 || bytes[0] !== WIRE_VERSION) throw invalid();
    let o = 1;
    const take = (n: number) => {
        const part = bytes.slice(o, o + n);
        o += n;
        return part;
    };
    const signingKey = take(KEY_LENGTH);
    const dhKey = take(KEY_LENGTH);
    const dhSignature = take(SIGNATURE_LENGTH);
    const baseKey = take(KEY_LENGTH);
    const signedPreKeyId = readU32(bytes, o);
    const oneTimePreKeyId = readU32(bytes, o + 4);
    o += 8;
    if (signedPreKeyId === 0) throw invalid();
    return {
        identity: { signingKey, dhKey, dhSignature },
        baseKey,
        signedPreKeyId,
        oneTimePreKeyId: oneTimePreKeyId === 0 ? null : oneTimePreKeyId,
        message: decodeWhisper(bytes.slice(o)),
    };
};

/*
  What is encrypted: a small JSON object, padded to a multiple of 64 bytes so the
  ciphertext length only roughly reveals the message length.
*/
export type MessagePayload = { v: 1; type: 'text'; text: string; resendOf?: string };

const PAD_BLOCK = 64;

export const encodePayload = (payload: MessagePayload): Uint8Array => {
    const body = utf8Encode(JSON.stringify(payload));
    const padded = new Uint8Array(Math.ceil((body.length + 1) / PAD_BLOCK) * PAD_BLOCK);
    padded.set(body);
    padded[body.length] = 0x80;
    return padded;
};

export const decodePayload = (bytes: Uint8Array): MessagePayload => {
    let end = bytes.length - 1;
    while (end >= 0 && bytes[end] === 0) end--;
    if (end < 0 || bytes[end] !== 0x80) throw invalid();
    let parsed: any;
    try {
        parsed = JSON.parse(utf8Decode(bytes.slice(0, end)));
    } catch {
        throw invalid();
    }
    if (parsed?.v !== 1) throw invalid();
    if (parsed.type === 'text' && typeof parsed.text === 'string') {
        const out: MessagePayload = { v: 1, type: 'text', text: parsed.text };
        if (typeof parsed.resendOf === 'string' && /^[a-f\d]{24}$/i.test(parsed.resendOf)) out.resendOf = parsed.resendOf;
        return out;
    }
    throw invalid();
};
