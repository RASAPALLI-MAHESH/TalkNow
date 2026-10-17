/*
  The only file that touches cryptographic primitives. Everything comes from the audited
  noble libraries; nothing here is home-made. Randomness is crypto.getRandomValues, which
  react-native-get-random-values provides on phones.
*/
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes as nobleRandomBytes } from '@noble/ciphers/utils.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { utf8Encode } from './encoding';

export type KeyPair = { publicKey: Uint8Array; privateKey: Uint8Array };

export const KEY_LENGTH = 32;
export const SIGNATURE_LENGTH = 64;

export const randomBytes = (length: number): Uint8Array => nobleRandomBytes(length);

export const generateDhKeyPair = (): KeyPair => {
    const privateKey = x25519.utils.randomSecretKey();
    return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
};

// Throws for low-order or malformed public keys (an all-zero shared secret).
export const dh = (privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array => {
    if (publicKey.length !== KEY_LENGTH) throw new Error('Invalid public key length');
    return x25519.getSharedSecret(privateKey, publicKey);
};

export const generateSigningKeyPair = (): KeyPair => {
    const { secretKey, publicKey } = ed25519.keygen();
    return { privateKey: secretKey, publicKey };
};

export const sign = (privateKey: Uint8Array, message: Uint8Array): Uint8Array => ed25519.sign(message, privateKey);

export const verify = (publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean => {
    if (publicKey.length !== KEY_LENGTH || signature.length !== SIGNATURE_LENGTH) return false;
    try {
        return ed25519.verify(signature, message, publicKey);
    } catch {
        return false;
    }
};

export const hkdfSha256 = (ikm: Uint8Array, salt: Uint8Array, info: string, length: number): Uint8Array =>
    hkdf(sha256, ikm, salt, utf8Encode(info), length);

export const hmacSha256 = (key: Uint8Array, data: Uint8Array): Uint8Array => hmac(sha256, key, data);

export const sha512Hash = (data: Uint8Array): Uint8Array => sha512(data);

export const aeadEncrypt = (key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array =>
    chacha20poly1305(key, nonce, aad).encrypt(plaintext);

// Throws when the tag does not verify.
export const aeadDecrypt = (key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array =>
    chacha20poly1305(key, nonce, aad).decrypt(ciphertext);
