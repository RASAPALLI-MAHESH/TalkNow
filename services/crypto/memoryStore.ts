import { IdentityKeys, OneTimePreKey, SignedPreKey } from './identity';
import { KeyPair } from './primitives';
import { SessionCommit, SessionRecord, SignalStore, TrustedIdentity } from './store';

/** In-memory SignalStore for tests and tools. Records are deep-copied like a real database would. */
export class MemorySignalStore implements SignalStore {
    signedPreKeys = new Map<number, SignedPreKey>();
    oneTimePreKeys = new Map<number, OneTimePreKey>();
    sessions = new Map<string, string>();
    trusted = new Map<string, TrustedIdentity>();

    constructor(
        public identity: IdentityKeys,
        public registrationId: number
    ) {}

    async getIdentity() {
        return this.identity;
    }

    async getRegistrationId() {
        return this.registrationId;
    }

    async getSignedPreKey(keyId: number): Promise<KeyPair | null> {
        return this.signedPreKeys.get(keyId)?.keyPair ?? null;
    }

    async getOneTimePreKey(keyId: number): Promise<KeyPair | null> {
        return this.oneTimePreKeys.get(keyId)?.keyPair ?? null;
    }

    async getSessionRecord(peerId: string): Promise<SessionRecord | null> {
        const raw = this.sessions.get(peerId);
        return raw ? (JSON.parse(raw) as SessionRecord) : null;
    }

    async getTrustedIdentity(peerId: string) {
        const t = this.trusted.get(peerId);
        return t ? { ...t } : null;
    }

    async commit(c: SessionCommit) {
        this.sessions.set(c.peerId, JSON.stringify(c.record));
        if (c.consumedOneTimePreKeyId !== undefined) this.oneTimePreKeys.delete(c.consumedOneTimePreKeyId);
        if (c.remoteIdentity) {
            const prev = this.trusted.get(c.peerId);
            if (!prev || prev.identity !== c.remoteIdentity) {
                this.trusted.set(c.peerId, {
                    identity: c.remoteIdentity,
                    verified: false,
                    needsAck: !!prev?.verified,
                    changedAt: prev ? Date.now() : null,
                });
            }
        }
    }
}
