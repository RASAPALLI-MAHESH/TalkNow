/*
  Safety numbers, following Signal's NumericFingerprintGenerator: 60 digits that both
  people see in the same order, plus a QR payload.

  Signal iterates SHA-512 5200 times; pure-JS hashing on Hermes (no JIT) makes that take
  many seconds, so this uses 256 rounds. The rounds are only extra margin: forging a key
  that matches a 30-digit half already takes about 2^100 hash evaluations.
*/
import { concatBytes, equalBytes, fromB64, toB64, utf8Encode } from './encoding';
import { sha512Hash } from './primitives';

const ITERATIONS = 256;
const FINGERPRINT_VERSION = new Uint8Array([0, 0]);
const QR_PREFIX = 'talknow-sn:1:';

const fingerprint = (identityKey: Uint8Array, stableId: string): Uint8Array => {
    let hash = sha512Hash(concatBytes(FINGERPRINT_VERSION, identityKey, utf8Encode(stableId)));
    for (let i = 0; i < ITERATIONS; i++) hash = sha512Hash(concatBytes(hash, identityKey));
    return hash.slice(0, 32);
};

// 30 digits: six 5-byte chunks, each read as a big-endian number mod 100000.
const digits = (fp: Uint8Array): string => {
    let out = '';
    for (let i = 0; i < 30; i += 5) {
        let chunk = 0;
        for (let j = 0; j < 5; j++) chunk = chunk * 256 + fp[i + j];
        out += String(chunk % 100000).padStart(5, '0');
    }
    return out;
};

export type SafetyNumber = {
    digits: string; // 60 digits
    groups: string[]; // 12 groups of 5
    qrPayload: string;
    local: Uint8Array;
    remote: Uint8Array;
};

/** identity arguments are identityId() strings (base64 of the 64-byte identity). */
export const computeSafetyNumber = (
    localUserId: string,
    localIdentity: string,
    remoteUserId: string,
    remoteIdentity: string
): SafetyNumber => {
    const local = fingerprint(fromB64(localIdentity), localUserId);
    const remote = fingerprint(fromB64(remoteIdentity), remoteUserId);
    const localDigits = digits(local);
    const remoteDigits = digits(remote);
    const all = localDigits < remoteDigits ? localDigits + remoteDigits : remoteDigits + localDigits;
    return {
        digits: all,
        groups: all.match(/.{5}/g) ?? [],
        qrPayload: `${QR_PREFIX}${toB64(local)}:${toB64(remote)}`,
        local,
        remote,
    };
};

export type ScanResult = 'match' | 'mismatch' | 'invalid';

/** Checks a QR code scanned from the contact's phone: their "local" must be our "remote" and vice versa. */
export const compareScannedSafetyNumber = (mine: SafetyNumber, scanned: string): ScanResult => {
    if (typeof scanned !== 'string' || !scanned.startsWith(QR_PREFIX)) return 'invalid';
    const parts = scanned.slice(QR_PREFIX.length).split(':');
    if (parts.length !== 2) return 'invalid';
    let theirLocal: Uint8Array;
    let theirRemote: Uint8Array;
    try {
        theirLocal = fromB64(parts[0]);
        theirRemote = fromB64(parts[1]);
    } catch {
        return 'invalid';
    }
    if (theirLocal.length !== 32 || theirRemote.length !== 32) return 'invalid';
    return equalBytes(theirLocal, mine.remote) && equalBytes(theirRemote, mine.local) ? 'match' : 'mismatch';
};
