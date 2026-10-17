import { IdentityKeys } from './identity';
import { KeyPair } from './primitives';
import { RatchetState } from './ratchet';

export type SessionState = {
    v: 1;
    // The initiator's X3DH ephemeral key: names the session on both sides.
    baseKey: string;
    remoteIdentity: string; // identityId() of the peer
    remoteRegistrationId: number;
    ad: string;
    ratchet: RatchetState;
    // Set on the initiator until the peer answers, so every message can start the session.
    pendingPreKey: { signedPreKeyId: number; oneTimePreKeyId: number | null } | null;
    createdAt: number;
    usedAt: number;
};

// The active session plus a few older ones that may still receive in-flight messages.
export type SessionRecord = { active: SessionState | null; archived: SessionState[] };

export const MAX_ARCHIVED_SESSIONS = 5;

export const emptyRecord = (): SessionRecord => ({ active: null, archived: [] });

/** Everything a decrypt or encrypt changes, written in one transaction by the store. */
export type SessionCommit = {
    peerId: string;
    record: SessionRecord;
    consumedOneTimePreKeyId?: number;
    // The peer's identity as seen in this exchange; the store records it as trusted.
    remoteIdentity?: string;
};

export type TrustedIdentity = {
    identity: string;
    verified: boolean;
    // Set when the identity changed after the contact was verified, until the user acknowledges it.
    needsAck: boolean;
    changedAt: number | null;
};

/** Read side of the key store. The app backs it with SQLCipher; tests use memory. */
export interface SignalStore {
    getIdentity(): Promise<IdentityKeys>;
    getRegistrationId(): Promise<number>;
    getSignedPreKey(keyId: number): Promise<KeyPair | null>;
    getOneTimePreKey(keyId: number): Promise<KeyPair | null>;
    getSessionRecord(peerId: string): Promise<SessionRecord | null>;
    getTrustedIdentity(peerId: string): Promise<TrustedIdentity | null>;
}
