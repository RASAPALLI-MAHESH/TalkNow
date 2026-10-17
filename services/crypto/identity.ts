import { concatBytes, equalBytes, fromB64, toB64, u32, utf8Encode } from './encoding';
import { E2EEError } from './errors';
import {
    KEY_LENGTH,
    KeyPair,
    SIGNATURE_LENGTH,
    generateDhKeyPair,
    generateSigningKeyPair,
    randomBytes,
    sign,
    verify,
} from './primitives';

/*
  An install's identity is an Ed25519 signing key plus an X25519 key for X3DH, bound
  together by a signature, so no key is used for both signing and key agreement.
*/
export type IdentityKeys = {
    signing: KeyPair;
    dh: KeyPair;
    dhSignature: Uint8Array;
};

export type PublicIdentity = {
    signingKey: Uint8Array;
    dhKey: Uint8Array;
    dhSignature: Uint8Array;
};

export type SignedPreKey = {
    keyId: number;
    keyPair: KeyPair;
    signature: Uint8Array;
    createdAt: number;
};

export type OneTimePreKey = {
    keyId: number;
    keyPair: KeyPair;
};

// What the server hands out for one user, decoded.
export type PreKeyBundle = {
    registrationId: number;
    identity: PublicIdentity;
    signedPreKey: { keyId: number; publicKey: Uint8Array; signature: Uint8Array };
    oneTimePreKey: { keyId: number; publicKey: Uint8Array } | null;
};

// The JSON shape of a bundle on the wire (base64 fields).
export type PreKeyBundleJson = {
    registrationId: number;
    identityKey: string;
    identityDhKey: string;
    identityDhSignature: string;
    signedPreKey: { keyId: number; publicKey: string; signature: string };
    oneTimePreKey?: { keyId: number; publicKey: string } | null;
};

const IDENTITY_DH_CONTEXT = utf8Encode('TalkNow-IdentityDH-v1');
const SIGNED_PREKEY_CONTEXT = utf8Encode('TalkNow-SignedPreKey-v1');
export const MAX_KEY_ID = 0x7fffffff;

export const generateIdentity = (): IdentityKeys => {
    const signing = generateSigningKeyPair();
    const dh = generateDhKeyPair();
    return { signing, dh, dhSignature: sign(signing.privateKey, concatBytes(IDENTITY_DH_CONTEXT, dh.publicKey)) };
};

export const publicIdentityOf = (identity: IdentityKeys): PublicIdentity => ({
    signingKey: identity.signing.publicKey,
    dhKey: identity.dh.publicKey,
    dhSignature: identity.dhSignature,
});

export const isValidPublicIdentity = (identity: PublicIdentity): boolean =>
    identity.signingKey.length === KEY_LENGTH &&
    identity.dhKey.length === KEY_LENGTH &&
    identity.dhSignature.length === SIGNATURE_LENGTH &&
    verify(identity.signingKey, concatBytes(IDENTITY_DH_CONTEXT, identity.dhKey), identity.dhSignature);

// 64 bytes that name an identity: used for trust checks, X3DH associated data and safety numbers.
export const identityBytes = (identity: PublicIdentity): Uint8Array => concatBytes(identity.signingKey, identity.dhKey);

export const identityId = (identity: PublicIdentity): string => toB64(identityBytes(identity));

export const sameIdentity = (a: PublicIdentity, b: PublicIdentity): boolean => equalBytes(identityBytes(a), identityBytes(b));

// Random 31-bit id for an install, never 0.
export const generateRegistrationId = (): number => {
    const b = randomBytes(4);
    const n = (((b[0] & 0x7f) << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    return n === 0 ? 1 : n;
};

const signedPreKeyMessage = (keyId: number, publicKey: Uint8Array) => concatBytes(SIGNED_PREKEY_CONTEXT, u32(keyId), publicKey);

export const generateSignedPreKey = (identity: IdentityKeys, keyId: number, now = Date.now()): SignedPreKey => {
    const keyPair = generateDhKeyPair();
    return {
        keyId,
        keyPair,
        signature: sign(identity.signing.privateKey, signedPreKeyMessage(keyId, keyPair.publicKey)),
        createdAt: now,
    };
};

export const generateOneTimePreKeys = (startId: number, count: number): OneTimePreKey[] => {
    const keys: OneTimePreKey[] = [];
    for (let i = 0; i < count; i++) {
        // Ids wrap around inside 1..MAX_KEY_ID; 0 means "no one-time prekey" on the wire.
        const keyId = ((startId - 1 + i) % MAX_KEY_ID) + 1;
        keys.push({ keyId, keyPair: generateDhKeyPair() });
    }
    return keys;
};

export const verifySignedPreKey = (identity: PublicIdentity, keyId: number, publicKey: Uint8Array, signature: Uint8Array) =>
    publicKey.length === KEY_LENGTH && verify(identity.signingKey, signedPreKeyMessage(keyId, publicKey), signature);

const isKeyId = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_KEY_ID;

/** Decodes and fully verifies a bundle from the server. Throws E2EEError('invalid_bundle') on anything off. */
export const parsePreKeyBundle = (json: PreKeyBundleJson): PreKeyBundle => {
    try {
        const identity: PublicIdentity = {
            signingKey: fromB64(json.identityKey),
            dhKey: fromB64(json.identityDhKey),
            dhSignature: fromB64(json.identityDhSignature),
        };
        const spk = json.signedPreKey;
        const signedPreKey = { keyId: spk.keyId, publicKey: fromB64(spk.publicKey), signature: fromB64(spk.signature) };
        const opk = json.oneTimePreKey ? { keyId: json.oneTimePreKey.keyId, publicKey: fromB64(json.oneTimePreKey.publicKey) } : null;

        const ok =
            Number.isInteger(json.registrationId) &&
            json.registrationId > 0 &&
            isValidPublicIdentity(identity) &&
            isKeyId(signedPreKey.keyId) &&
            verifySignedPreKey(identity, signedPreKey.keyId, signedPreKey.publicKey, signedPreKey.signature) &&
            (!opk || (isKeyId(opk.keyId) && opk.publicKey.length === KEY_LENGTH));
        if (!ok) throw new Error('verification failed');
        return { registrationId: json.registrationId, identity, signedPreKey, oneTimePreKey: opk };
    } catch {
        throw new E2EEError('invalid_bundle', "This contact's security keys could not be verified.");
    }
};
