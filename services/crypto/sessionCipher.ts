/*
  Encrypts to and decrypts from one peer on top of X3DH and the Double Ratchet.
  Nothing is written here: each call returns a SessionCommit that the caller stores in
  the same transaction as the message itself, so a crash can't leave the two out of step.
  Calls for the same peer must be serialized (see KeyedMutex).
*/
import { fromB64, toB64 } from './encoding';
import { E2EEError } from './errors';
import { PreKeyBundle, identityId, isValidPublicIdentity, publicIdentityOf } from './identity';
import { initRatchetAsInitiator, initRatchetAsResponder, ratchetDecrypt, ratchetEncrypt } from './ratchet';
import { MAX_ARCHIVED_SESSIONS, SessionCommit, SessionRecord, SessionState, SignalStore, emptyRecord } from './store';
import { MessagePayload, decodePayload, decodePreKey, decodeWhisper, encodePayload, encodePreKey, encodeWhisper } from './wire';
import { initiateX3DH, respondX3DH } from './x3dh';

export type EnvelopeType = 'prekey' | 'whisper';

export type Envelope = {
    type: EnvelopeType;
    body: string; // base64
    registrationId: number; // sender's install
    recipientRegistrationId: number; // the install it was encrypted for
};

export type IdentityStatus = { firstSeen: boolean; changed: boolean; wasVerified: boolean };

// Base64 of the largest body accepted (a 4000-character message is well under this).
export const MAX_ENVELOPE_BODY_CHARS = 48 * 1024;

const ENVELOPE_TYPES: EnvelopeType[] = ['prekey', 'whisper'];

export const isEnvelope = (value: unknown): value is Envelope => {
    const e = value as Envelope;
    return (
        !!e &&
        typeof e === 'object' &&
        ENVELOPE_TYPES.includes(e.type) &&
        typeof e.body === 'string' &&
        e.body.length > 0 &&
        e.body.length <= MAX_ENVELOPE_BODY_CHARS &&
        Number.isInteger(e.registrationId) &&
        e.registrationId > 0 &&
        Number.isInteger(e.recipientRegistrationId) &&
        e.recipientRegistrationId > 0
    );
};

const withActive = (record: SessionRecord, session: SessionState): SessionRecord => {
    const others = [record.active, ...record.archived].filter(
        (s): s is SessionState => !!s && s.baseKey !== session.baseKey
    );
    return { active: session, archived: others.slice(0, MAX_ARCHIVED_SESSIONS) };
};

/** Moves the active session to the archive, so the next send starts a fresh one. */
export const archiveActiveSession = (record: SessionRecord): SessionRecord =>
    record.active
        ? { active: null, archived: [record.active, ...record.archived].slice(0, MAX_ARCHIVED_SESSIONS) }
        : record;

export const checkIdentity = async (store: SignalStore, peerId: string, identity: string): Promise<IdentityStatus> => {
    const trusted = await store.getTrustedIdentity(peerId);
    return {
        firstSeen: !trusted,
        changed: !!trusted && trusted.identity !== identity,
        wasVerified: !!trusted?.verified,
    };
};

/** Starts a session from a verified bundle (X3DH as initiator). */
export const startSession = async (
    store: SignalStore,
    peerId: string,
    bundle: PreKeyBundle,
    now = Date.now()
): Promise<{ record: SessionRecord; remoteIdentity: string; identityStatus: IdentityStatus }> => {
    const local = await store.getIdentity();
    const x3dh = initiateX3DH(local, bundle);
    const remoteIdentity = identityId(bundle.identity);
    const session: SessionState = {
        v: 1,
        baseKey: toB64(x3dh.baseKey),
        remoteIdentity,
        remoteRegistrationId: bundle.registrationId,
        ad: toB64(x3dh.associatedData),
        ratchet: initRatchetAsInitiator(x3dh.sharedKey, bundle.signedPreKey.publicKey),
        pendingPreKey: { signedPreKeyId: x3dh.signedPreKeyId, oneTimePreKeyId: x3dh.oneTimePreKeyId },
        createdAt: now,
        usedAt: now,
    };
    const record = (await store.getSessionRecord(peerId)) ?? emptyRecord();
    return { record: withActive(record, session), remoteIdentity, identityStatus: await checkIdentity(store, peerId, remoteIdentity) };
};

export const encryptMessage = async (
    store: SignalStore,
    peerId: string,
    record: SessionRecord,
    payload: MessagePayload,
    now = Date.now()
): Promise<{ envelope: Envelope; commit: SessionCommit }> => {
    const session = record.active;
    if (!session) throw new E2EEError('no_session');

    const { state, header, ciphertext } = ratchetEncrypt(session.ratchet, encodePayload(payload), fromB64(session.ad));
    const whisper = { header, ciphertext };
    let type: EnvelopeType = 'whisper';
    let body = encodeWhisper(whisper);

    if (session.pendingPreKey) {
        const local = await store.getIdentity();
        type = 'prekey';
        body = encodePreKey({
            identity: publicIdentityOf(local),
            baseKey: fromB64(session.baseKey),
            signedPreKeyId: session.pendingPreKey.signedPreKeyId,
            oneTimePreKeyId: session.pendingPreKey.oneTimePreKeyId,
            message: whisper,
        });
    }

    const updated: SessionState = { ...session, ratchet: state, usedAt: now };
    return {
        envelope: {
            type,
            body: toB64(body),
            registrationId: await store.getRegistrationId(),
            recipientRegistrationId: session.remoteRegistrationId,
        },
        commit: { peerId, record: { ...record, active: updated } },
    };
};

export type DecryptResult = {
    // null when the message authenticated but its content is from a newer app version.
    payload: MessagePayload | null;
    commit: SessionCommit;
    remoteIdentity: string;
    identityStatus: IdentityStatus;
};

const parsePayload = (bytes: Uint8Array): MessagePayload | null => {
    try {
        return decodePayload(bytes);
    } catch {
        return null;
    }
};

// Tries the given sessions in order; the one that opens the message becomes active.
const decryptWithSessions = (
    record: SessionRecord,
    candidates: SessionState[],
    header: Uint8Array,
    ciphertext: Uint8Array,
    now: number
): { record: SessionRecord; session: SessionState; plaintext: Uint8Array } => {
    if (candidates.length === 0) throw new E2EEError('no_session');
    let firstError: unknown = null;
    for (const session of candidates) {
        try {
            const { state, plaintext } = ratchetDecrypt(session.ratchet, header, ciphertext, fromB64(session.ad));
            // A reply proves the peer has the session, so stop sending prekey messages.
            const updated: SessionState = { ...session, ratchet: state, pendingPreKey: null, usedAt: now };
            return { record: withActive(record, updated), session: updated, plaintext };
        } catch (err) {
            if (!firstError || (err instanceof E2EEError && err.code === 'duplicate_message')) firstError = err;
        }
    }
    if (firstError instanceof E2EEError && firstError.code !== 'decrypt_failed') throw firstError;
    throw new E2EEError('decrypt_failed');
};

export const decryptMessage = async (
    store: SignalStore,
    peerId: string,
    envelope: Envelope,
    now = Date.now()
): Promise<DecryptResult> => {
    if (!isEnvelope(envelope)) throw new E2EEError('invalid_message');
    let bytes: Uint8Array;
    try {
        bytes = fromB64(envelope.body);
    } catch {
        throw new E2EEError('invalid_message');
    }
    const record = (await store.getSessionRecord(peerId)) ?? emptyRecord();
    const all = [record.active, ...record.archived].filter((s): s is SessionState => !!s);

    if (envelope.type === 'whisper') {
        const { header, ciphertext } = decodeWhisper(bytes);
        const result = decryptWithSessions(record, all, header, ciphertext, now);
        return {
            payload: parsePayload(result.plaintext),
            commit: { peerId, record: result.record },
            remoteIdentity: result.session.remoteIdentity,
            identityStatus: { firstSeen: false, changed: false, wasVerified: false },
        };
    }

    const pm = decodePreKey(bytes);
    if (!isValidPublicIdentity(pm.identity)) throw new E2EEError('invalid_message');
    const remoteIdentity = identityId(pm.identity);
    const baseKey = toB64(pm.baseKey);
    const identityStatus = await checkIdentity(store, peerId, remoteIdentity);

    // A later prekey message of a session we already built (the peer hasn't seen our reply yet).
    const existing = all.find((s) => s.baseKey === baseKey && s.remoteIdentity === remoteIdentity);
    if (existing) {
        const result = decryptWithSessions(record, [existing], pm.message.header, pm.message.ciphertext, now);
        return { payload: parsePayload(result.plaintext), commit: { peerId, record: result.record, remoteIdentity }, remoteIdentity, identityStatus };
    }

    const local = await store.getIdentity();
    const signedPreKey = await store.getSignedPreKey(pm.signedPreKeyId);
    if (!signedPreKey) throw new E2EEError('unknown_signed_prekey');
    let oneTimePreKey = null;
    if (pm.oneTimePreKeyId !== null) {
        oneTimePreKey = await store.getOneTimePreKey(pm.oneTimePreKeyId);
        // Already used: a replayed first message, or one sent to keys we have since replaced.
        if (!oneTimePreKey) throw new E2EEError('unknown_one_time_prekey');
    }

    const x3dh = respondX3DH(local, signedPreKey, oneTimePreKey, pm.identity, pm.baseKey);
    const fresh: SessionState = {
        v: 1,
        baseKey,
        remoteIdentity,
        remoteRegistrationId: envelope.registrationId,
        ad: toB64(x3dh.associatedData),
        ratchet: initRatchetAsResponder(x3dh.sharedKey, signedPreKey),
        pendingPreKey: null,
        createdAt: now,
        usedAt: now,
    };
    const result = decryptWithSessions(record, [fresh], pm.message.header, pm.message.ciphertext, now);
    return {
        payload: parsePayload(result.plaintext),
        commit: {
            peerId,
            record: result.record,
            consumedOneTimePreKeyId: pm.oneTimePreKeyId ?? undefined,
            remoteIdentity,
        },
        remoteIdentity,
        identityStatus,
    };
};
