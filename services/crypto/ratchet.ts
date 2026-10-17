/*
  Double Ratchet, as specified at https://signal.org/docs/specifications/doubleratchet/
  KDF_RK: HKDF-SHA256. KDF_CK: HMAC-SHA256 with constants 0x01 / 0x02.
  ENCRYPT: ChaCha20-Poly1305 with key and nonce derived from the one-use message key,
  associated data = session AD || header.

  State is plain JSON (base64 keys) so it can be stored as-is. Functions never mutate
  their input: decryption works on a copy and the caller keeps it only on success.
*/
import { concatBytes, equalBytes, fromB64, readU32, toB64, u32 } from './encoding';
import { E2EEError } from './errors';
import { KEY_LENGTH, KeyPair, aeadDecrypt, aeadEncrypt, dh, generateDhKeyPair, hkdfSha256, hmacSha256 } from './primitives';

// Most message keys skipped in one chain (messages lost or reordered) before giving up.
export const MAX_SKIP = 2000;
// Most skipped keys kept per session; the oldest are dropped first.
export const MAX_SKIPPED_KEYS = 2000;
export const HEADER_LENGTH = KEY_LENGTH + 8;

export type RatchetState = {
    dhs: { pub: string; priv: string };
    dhr: string | null;
    rk: string;
    cks: string | null;
    ckr: string | null;
    ns: number;
    nr: number;
    pn: number;
    skipped: { dh: string; n: number; mk: string }[];
};

export type Header = { dh: Uint8Array; pn: number; n: number };

const RK_INFO = 'TalkNow-Ratchet-v1';
const MK_INFO = 'TalkNow-MessageKeys-v1';
const ZERO_SALT = new Uint8Array(32);
const CK_MESSAGE = new Uint8Array([0x01]);
const CK_CHAIN = new Uint8Array([0x02]);

const kdfRk = (rk: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] => {
    const out = hkdfSha256(dhOut, rk, RK_INFO, 64);
    return [out.slice(0, 32), out.slice(32, 64)];
};

const kdfCk = (ck: Uint8Array): [Uint8Array, Uint8Array] => [hmacSha256(ck, CK_CHAIN), hmacSha256(ck, CK_MESSAGE)];

const messageKeys = (mk: Uint8Array) => {
    const out = hkdfSha256(mk, ZERO_SALT, MK_INFO, 44);
    return { key: out.slice(0, 32), nonce: out.slice(32, 44) };
};

const pairToJson = (kp: KeyPair) => ({ pub: toB64(kp.publicKey), priv: toB64(kp.privateKey) });

export const encodeHeader = (h: Header): Uint8Array => concatBytes(h.dh, u32(h.pn), u32(h.n));

export const decodeHeader = (bytes: Uint8Array): Header => {
    if (bytes.length !== HEADER_LENGTH) throw new E2EEError('invalid_message');
    return { dh: bytes.slice(0, KEY_LENGTH), pn: readU32(bytes, KEY_LENGTH), n: readU32(bytes, KEY_LENGTH + 4) };
};

const clone = (s: RatchetState): RatchetState => ({ ...s, dhs: { ...s.dhs }, skipped: s.skipped.map((k) => ({ ...k })) });

/** Alice, right after X3DH: she can send immediately. */
export const initRatchetAsInitiator = (sharedKey: Uint8Array, remoteRatchetKey: Uint8Array): RatchetState => {
    const dhs = generateDhKeyPair();
    const [rk, cks] = kdfRk(sharedKey, dh(dhs.privateKey, remoteRatchetKey));
    return { dhs: pairToJson(dhs), dhr: toB64(remoteRatchetKey), rk: toB64(rk), cks: toB64(cks), ckr: null, ns: 0, nr: 0, pn: 0, skipped: [] };
};

/** Bob, from his signed prekey: he can send once he has received. */
export const initRatchetAsResponder = (sharedKey: Uint8Array, signedPreKey: KeyPair): RatchetState => ({
    dhs: pairToJson(signedPreKey),
    dhr: null,
    rk: toB64(sharedKey),
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    skipped: [],
});

export const ratchetEncrypt = (
    state: RatchetState,
    plaintext: Uint8Array,
    ad: Uint8Array
): { state: RatchetState; header: Uint8Array; ciphertext: Uint8Array } => {
    if (!state.cks) throw new E2EEError('no_session', 'Session cannot send yet');
    const next = clone(state);
    const [cks, mk] = kdfCk(fromB64(state.cks));
    const header = encodeHeader({ dh: fromB64(state.dhs.pub), pn: state.pn, n: state.ns });
    next.cks = toB64(cks);
    next.ns = state.ns + 1;
    const { key, nonce } = messageKeys(mk);
    return { state: next, header, ciphertext: aeadEncrypt(key, nonce, plaintext, concatBytes(ad, header)) };
};

const skipMessageKeys = (s: RatchetState, until: number) => {
    if (until - s.nr > MAX_SKIP) throw new E2EEError('too_many_skipped');
    if (!s.ckr || !s.dhr) return;
    let ck = fromB64(s.ckr);
    while (s.nr < until) {
        const [nextCk, mk] = kdfCk(ck);
        s.skipped.push({ dh: s.dhr, n: s.nr, mk: toB64(mk) });
        ck = nextCk;
        s.nr += 1;
    }
    s.ckr = toB64(ck);
    if (s.skipped.length > MAX_SKIPPED_KEYS) s.skipped.splice(0, s.skipped.length - MAX_SKIPPED_KEYS);
};

const dhRatchet = (s: RatchetState, header: Header) => {
    s.pn = s.ns;
    s.ns = 0;
    s.nr = 0;
    s.dhr = toB64(header.dh);
    const [rk1, ckr] = kdfRk(fromB64(s.rk), dh(fromB64(s.dhs.priv), header.dh));
    const dhs = generateDhKeyPair();
    const [rk2, cks] = kdfRk(rk1, dh(dhs.privateKey, header.dh));
    s.ckr = toB64(ckr);
    s.dhs = pairToJson(dhs);
    s.rk = toB64(rk2);
    s.cks = toB64(cks);
};

const open = (mk: Uint8Array, ciphertext: Uint8Array, ad: Uint8Array, headerBytes: Uint8Array) => {
    const { key, nonce } = messageKeys(mk);
    try {
        return aeadDecrypt(key, nonce, ciphertext, concatBytes(ad, headerBytes));
    } catch {
        throw new E2EEError('decrypt_failed');
    }
};

/** Returns the new state only when the message authenticates; the input state is never changed. */
export const ratchetDecrypt = (
    state: RatchetState,
    headerBytes: Uint8Array,
    ciphertext: Uint8Array,
    ad: Uint8Array
): { state: RatchetState; plaintext: Uint8Array } => {
    const header = decodeHeader(headerBytes);
    const s = clone(state);
    const dhB64 = toB64(header.dh);

    const skippedIndex = s.skipped.findIndex((k) => k.dh === dhB64 && k.n === header.n);
    if (skippedIndex >= 0) {
        const plaintext = open(fromB64(s.skipped[skippedIndex].mk), ciphertext, ad, headerBytes);
        s.skipped.splice(skippedIndex, 1);
        return { state: s, plaintext };
    }

    const isNewChain = !s.dhr || !equalBytes(fromB64(s.dhr), header.dh);
    if (isNewChain) {
        skipMessageKeys(s, header.pn);
        dhRatchet(s, header);
    } else if (header.n < s.nr) {
        // Already used and deleted: a replay or a duplicate delivery.
        throw new E2EEError('duplicate_message');
    }
    skipMessageKeys(s, header.n);
    const [ckr, mk] = kdfCk(fromB64(s.ckr as string));
    s.ckr = toB64(ckr);
    s.nr += 1;
    return { state: s, plaintext: open(mk, ciphertext, ad, headerBytes) };
};
