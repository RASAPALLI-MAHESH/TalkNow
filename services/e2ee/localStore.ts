/*
  The phone's encrypted database (SQLCipher via expo-sqlite): keys, ratchet sessions,
  trusted identities and the decrypted messages, which live nowhere else.

  - One database per account. Its 256-bit key is random, created on first use and kept
    in SecureStore (iOS Keychain / Android Keystore), never leaving this device.
  - The identity private keys are kept in SecureStore too.
  - All writes go through one queue, each in a single transaction, so a session update
    and the message it produced are saved together or not at all.
*/
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import {
    E2EEError,
    IdentityKeys,
    KeyedMutex,
    OneTimePreKey,
    SessionCommit,
    SessionRecord,
    SignalStore,
    SignedPreKey,
    TrustedIdentity,
    fromB64,
    toB64,
} from '../crypto';
import { KeyPair, randomBytes } from '../crypto/primitives';

export type LocalMessageKind = 'text' | 'undecryptable' | 'identity_changed' | 'unsupported' | 'other_device';
export type LocalMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type LocalMessage = {
    id: string; // the server id, or the client id until the server acknowledges the send
    clientId: string | null;
    peerId: string;
    direction: 'in' | 'out' | 'system';
    kind: LocalMessageKind;
    text: string;
    status: LocalMessageStatus | null;
    createdAt: string; // ISO, UTC
    legacy: boolean; // plain text from before encryption, imported from the server
};

type MessageRow = {
    id: string;
    client_id: string | null;
    peer_id: string;
    direction: LocalMessage['direction'];
    kind: LocalMessageKind;
    body: string;
    status: LocalMessageStatus | null;
    created_at: string;
    legacy: number;
};

const STATUS_RANK: Record<'sent' | 'delivered' | 'read', number> = { sent: 2, delivered: 3, read: 4 };

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const SCHEMA_VERSION = 1;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS signed_prekeys (
    key_id INTEGER PRIMARY KEY NOT NULL,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS one_time_prekeys (
    key_id INTEGER PRIMARY KEY NOT NULL,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (peer_id TEXT PRIMARY KEY NOT NULL, record TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS trusted_identities (
    peer_id TEXT PRIMARY KEY NOT NULL,
    identity TEXT NOT NULL,
    verified INTEGER NOT NULL DEFAULT 0,
    needs_ack INTEGER NOT NULL DEFAULT 0,
    changed_at INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT,
    peer_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'text',
    body TEXT NOT NULL,
    status TEXT,
    created_at TEXT NOT NULL,
    legacy INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS messages_by_peer ON messages (peer_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS messages_by_client_id ON messages (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_by_status ON messages (status) WHERE status = 'sending';
`;

const dbName = (userId: string) => `talknow-e2ee-${userId}.db`;
const dbKeyName = (userId: string) => `e2ee.dbkey.${userId}`;
const identityKeyName = (userId: string) => `e2ee.identity.${userId}`;

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const pairFromRow = (row: { public_key: string; private_key: string }): KeyPair => ({
    publicKey: fromB64(row.public_key),
    privateKey: fromB64(row.private_key),
});

const toLocalMessage = (r: MessageRow): LocalMessage => ({
    id: r.id,
    clientId: r.client_id,
    peerId: r.peer_id,
    direction: r.direction,
    kind: r.kind,
    text: r.body,
    status: r.status,
    createdAt: r.created_at,
    legacy: r.legacy === 1,
});

type StoredIdentity = { sPub: string; sPriv: string; dPub: string; dPriv: string; dSig: string; reg: number };

/** Writes inside one transaction. Only reachable through LocalStore.write(). */
export class StoreWriter {
    constructor(private db: SQLite.SQLiteDatabase) {}

    async applyCommit(c: SessionCommit) {
        await this.db.runAsync(
            'INSERT INTO sessions (peer_id, record, updated_at) VALUES (?, ?, ?) ON CONFLICT(peer_id) DO UPDATE SET record = excluded.record, updated_at = excluded.updated_at',
            c.peerId,
            JSON.stringify(c.record),
            Date.now()
        );
        if (c.consumedOneTimePreKeyId !== undefined) {
            await this.db.runAsync('DELETE FROM one_time_prekeys WHERE key_id = ?', c.consumedOneTimePreKeyId);
        }
        if (c.remoteIdentity) await this.trustIdentity(c.peerId, c.remoteIdentity);
    }

    async saveSessionRecord(peerId: string, record: SessionRecord) {
        await this.applyCommit({ peerId, record });
    }

    /** Records the identity seen for a peer. A change clears "verified"; if it was verified, it must be acknowledged. */
    async trustIdentity(peerId: string, identity: string) {
        const prev = await this.db.getFirstAsync<{ identity: string; verified: number }>(
            'SELECT identity, verified FROM trusted_identities WHERE peer_id = ?',
            peerId
        );
        if (!prev) {
            await this.db.runAsync('INSERT INTO trusted_identities (peer_id, identity) VALUES (?, ?)', peerId, identity);
        } else if (prev.identity !== identity) {
            await this.db.runAsync(
                'UPDATE trusted_identities SET identity = ?, verified = 0, needs_ack = ?, changed_at = ? WHERE peer_id = ?',
                identity,
                prev.verified ? 1 : 0,
                Date.now(),
                peerId
            );
        }
    }

    async setVerified(peerId: string, verified: boolean) {
        await this.db.runAsync('UPDATE trusted_identities SET verified = ?, needs_ack = 0 WHERE peer_id = ?', verified ? 1 : 0, peerId);
    }

    async acknowledgeIdentity(peerId: string) {
        await this.db.runAsync('UPDATE trusted_identities SET needs_ack = 0 WHERE peer_id = ?', peerId);
    }

    async insertMessage(m: LocalMessage) {
        await this.db.runAsync(
            'INSERT OR IGNORE INTO messages (id, client_id, peer_id, direction, kind, body, status, created_at, legacy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            m.id,
            m.clientId,
            m.peerId,
            m.direction,
            m.kind,
            m.text,
            m.status,
            m.createdAt,
            m.legacy ? 1 : 0
        );
    }

    async updateMessage(id: string, fields: Partial<Pick<LocalMessage, 'id' | 'kind' | 'text' | 'status' | 'createdAt' | 'clientId'>>) {
        const sets: string[] = [];
        const values: (string | null)[] = [];
        const columns: Record<string, string> = { id: 'id', kind: 'kind', text: 'body', status: 'status', createdAt: 'created_at', clientId: 'client_id' };
        for (const [key, column] of Object.entries(columns)) {
            if (key in fields) {
                sets.push(`${column} = ?`);
                values.push((fields as any)[key] ?? null);
            }
        }
        if (sets.length === 0) return;
        await this.db.runAsync(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`, ...values, id);
    }

    /** Moves an outgoing message forward (sending → sent → delivered → read), never back. */
    async advanceStatus(idOrClientId: string, status: Exclude<LocalMessageStatus, 'failed' | 'sending'>) {
        await this.db.runAsync(
            `UPDATE messages SET status = ? WHERE (id = ? OR client_id = ?) AND direction = 'out'
             AND (CASE IFNULL(status, 'sending') WHEN 'failed' THEN 0 WHEN 'sending' THEN 1 WHEN 'sent' THEN 2 WHEN 'delivered' THEN 3 ELSE 4 END) < ?`,
            status,
            idOrClientId,
            idOrClientId,
            STATUS_RANK[status]
        );
    }

    /** The server stored our message: switch to its id and time. */
    async confirmSent(clientId: string, serverId: string, createdAt: string) {
        await this.db.runAsync(
            `UPDATE messages SET id = ?, created_at = ?, status = CASE WHEN status IN ('sending', 'failed') THEN 'sent' ELSE status END
             WHERE client_id = ? AND id = client_id`,
            serverId,
            createdAt,
            clientId
        );
    }

    async deleteMessage(id: string) {
        await this.db.runAsync('DELETE FROM messages WHERE id = ?', id);
    }

    async saveSignedPreKey(spk: SignedPreKey) {
        await this.db.runAsync(
            'INSERT OR REPLACE INTO signed_prekeys (key_id, public_key, private_key, signature, created_at) VALUES (?, ?, ?, ?, ?)',
            spk.keyId,
            toB64(spk.keyPair.publicKey),
            toB64(spk.keyPair.privateKey),
            toB64(spk.signature),
            spk.createdAt
        );
    }

    async deleteSignedPreKeysBefore(createdBefore: number, keepKeyId: number) {
        await this.db.runAsync('DELETE FROM signed_prekeys WHERE created_at < ? AND key_id != ?', createdBefore, keepKeyId);
    }

    async saveOneTimePreKeys(keys: OneTimePreKey[], now = Date.now()) {
        for (const k of keys) {
            await this.db.runAsync(
                'INSERT OR REPLACE INTO one_time_prekeys (key_id, public_key, private_key, created_at) VALUES (?, ?, ?, ?)',
                k.keyId,
                toB64(k.keyPair.publicKey),
                toB64(k.keyPair.privateKey),
                now
            );
        }
    }

    async deleteOneTimePreKeysBefore(createdBefore: number) {
        await this.db.runAsync('DELETE FROM one_time_prekeys WHERE created_at < ?', createdBefore);
    }

    async setMeta(key: string, value: string) {
        await this.db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
    }
}

export class LocalStore implements SignalStore {
    private queue = new KeyedMutex();
    private writer: StoreWriter;

    private constructor(
        private db: SQLite.SQLiteDatabase,
        readonly userId: string,
        private identity: IdentityKeys | null,
        private registrationId: number | null
    ) {
        this.writer = new StoreWriter(db);
    }

    /** Opens (or creates) this account's encrypted database. */
    static async open(userId: string): Promise<LocalStore> {
        let key = await SecureStore.getItemAsync(dbKeyName(userId), SECURE_OPTIONS);
        if (!key) {
            // No key means any existing file can never be read again (e.g. restored from a backup).
            await SQLite.deleteDatabaseAsync(dbName(userId)).catch(() => undefined);
            key = hex(randomBytes(32));
            await SecureStore.setItemAsync(dbKeyName(userId), key, SECURE_OPTIONS);
        }

        let db: SQLite.SQLiteDatabase;
        try {
            db = await LocalStore.openWithKey(userId, key);
        } catch (err) {
            // Only a file this key can't decrypt is unrecoverable; other errors (e.g. a full disk) must not wipe history.
            if (!/not a database|file is encrypted|SQLITE_NOTADB/i.test(String((err as Error)?.message ?? err))) throw err;
            await SQLite.deleteDatabaseAsync(dbName(userId)).catch(() => undefined);
            db = await LocalStore.openWithKey(userId, key);
        }

        const meta = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'registration_id'");
        let identity: IdentityKeys | null = null;
        let registrationId: number | null = null;
        if (meta) {
            const raw = await SecureStore.getItemAsync(identityKeyName(userId), SECURE_OPTIONS);
            const stored = raw ? (JSON.parse(raw) as StoredIdentity) : null;
            if (stored && stored.reg === Number(meta.value)) {
                identity = {
                    signing: { publicKey: fromB64(stored.sPub), privateKey: fromB64(stored.sPriv) },
                    dh: { publicKey: fromB64(stored.dPub), privateKey: fromB64(stored.dPriv) },
                    dhSignature: fromB64(stored.dSig),
                };
                registrationId = stored.reg;
            }
        }
        // A database without its identity (or the reverse, as after an iOS reinstall) is a new install.
        if (!identity) {
            await db.execAsync('DELETE FROM signed_prekeys; DELETE FROM one_time_prekeys; DELETE FROM sessions; DELETE FROM meta;');
        }
        return new LocalStore(db, userId, identity, registrationId);
    }

    private static async openWithKey(userId: string, key: string) {
        const db = await SQLite.openDatabaseAsync(dbName(userId));
        try {
            await db.execAsync(`PRAGMA key = "x'${key}'";`);
            const cipher = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version;');
            if (!cipher?.cipher_version) {
                // A build without SQLCipher (e.g. Expo Go) would write everything in plain text.
                if (!__DEV__) throw new Error('Encrypted storage is not available in this build');
                console.warn('[e2ee] SQLCipher is not enabled in this build: the local database is NOT encrypted (development only).');
            }
            await db.execAsync('SELECT count(*) FROM sqlite_master;'); // fails here if the key is wrong
            await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
            const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'))?.user_version ?? 0;
            if (version < SCHEMA_VERSION) {
                await db.execAsync(SCHEMA);
                await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
            }
            return db;
        } catch (err) {
            await db.closeAsync().catch(() => undefined);
            throw err;
        }
    }

    /** Deletes this account's database and keys from the phone (account deletion). */
    static async wipe(userId: string) {
        await SQLite.deleteDatabaseAsync(dbName(userId)).catch(() => undefined);
        await SecureStore.deleteItemAsync(dbKeyName(userId), SECURE_OPTIONS).catch(() => undefined);
        await SecureStore.deleteItemAsync(identityKeyName(userId), SECURE_OPTIONS).catch(() => undefined);
    }

    async close() {
        await this.queue.run('write', () => this.db.closeAsync());
    }

    hasIdentity() {
        return !!this.identity && !!this.registrationId;
    }

    /** Saves a new install's identity: private keys in SecureStore, the rest in the database. */
    async createIdentity(identity: IdentityKeys, registrationId: number, setup: (w: StoreWriter) => Promise<void>) {
        const stored: StoredIdentity = {
            sPub: toB64(identity.signing.publicKey),
            sPriv: toB64(identity.signing.privateKey),
            dPub: toB64(identity.dh.publicKey),
            dPriv: toB64(identity.dh.privateKey),
            dSig: toB64(identity.dhSignature),
            reg: registrationId,
        };
        await SecureStore.setItemAsync(identityKeyName(this.userId), JSON.stringify(stored), SECURE_OPTIONS);
        await this.write(async (w) => {
            await setup(w);
            await w.setMeta('registration_id', String(registrationId));
        });
        this.identity = identity;
        this.registrationId = registrationId;
    }

    /** Runs `task` alone, inside one transaction. */
    write<T>(task: (w: StoreWriter) => Promise<T>): Promise<T> {
        return this.queue.run('write', async () => {
            let result: T;
            await this.db.withTransactionAsync(async () => {
                result = await task(this.writer);
            });
            return result!;
        });
    }

    /* SignalStore */

    async getIdentity(): Promise<IdentityKeys> {
        if (!this.identity) throw new E2EEError('not_ready');
        return this.identity;
    }

    async getRegistrationId(): Promise<number> {
        if (!this.registrationId) throw new E2EEError('not_ready');
        return this.registrationId;
    }

    async getSignedPreKey(keyId: number) {
        const row = await this.db.getFirstAsync<{ public_key: string; private_key: string }>(
            'SELECT public_key, private_key FROM signed_prekeys WHERE key_id = ?',
            keyId
        );
        return row ? pairFromRow(row) : null;
    }

    async getOneTimePreKey(keyId: number) {
        const row = await this.db.getFirstAsync<{ public_key: string; private_key: string }>(
            'SELECT public_key, private_key FROM one_time_prekeys WHERE key_id = ?',
            keyId
        );
        return row ? pairFromRow(row) : null;
    }

    async getSessionRecord(peerId: string): Promise<SessionRecord | null> {
        const row = await this.db.getFirstAsync<{ record: string }>('SELECT record FROM sessions WHERE peer_id = ?', peerId);
        return row ? (JSON.parse(row.record) as SessionRecord) : null;
    }

    async getTrustedIdentity(peerId: string): Promise<TrustedIdentity | null> {
        const row = await this.db.getFirstAsync<{ identity: string; verified: number; needs_ack: number; changed_at: number | null }>(
            'SELECT identity, verified, needs_ack, changed_at FROM trusted_identities WHERE peer_id = ?',
            peerId
        );
        return row ? { identity: row.identity, verified: row.verified === 1, needsAck: row.needs_ack === 1, changedAt: row.changed_at } : null;
    }

    /* Keys */

    async getCurrentSignedPreKey(): Promise<SignedPreKey | null> {
        const row = await this.db.getFirstAsync<{ key_id: number; public_key: string; private_key: string; signature: string; created_at: number }>(
            'SELECT * FROM signed_prekeys ORDER BY created_at DESC, key_id DESC LIMIT 1'
        );
        return row ? { keyId: row.key_id, keyPair: pairFromRow(row), signature: fromB64(row.signature), createdAt: row.created_at } : null;
    }

    async getMeta(key: string): Promise<string | null> {
        const row = await this.db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
        return row ? row.value : null;
    }

    /* Messages */

    async getMessages(peerId: string, limit: number): Promise<LocalMessage[]> {
        const rows = await this.db.getAllAsync<MessageRow>(
            'SELECT * FROM messages WHERE peer_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
            peerId,
            limit
        );
        return rows.map(toLocalMessage);
    }

    async getMessage(id: string): Promise<LocalMessage | null> {
        const row = await this.db.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id = ?', id);
        return row ? toLocalMessage(row) : null;
    }

    async getMessageByClientId(clientId: string): Promise<LocalMessage | null> {
        const row = await this.db.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE client_id = ?', clientId);
        return row ? toLocalMessage(row) : null;
    }

    async getMessagesByStatus(status: LocalMessageStatus): Promise<LocalMessage[]> {
        const rows = await this.db.getAllAsync<MessageRow>('SELECT * FROM messages WHERE status = ? ORDER BY created_at', status);
        return rows.map(toLocalMessage);
    }

    /** The newest real message per conversation, for the chat list. */
    async getLatestPerPeer(): Promise<LocalMessage[]> {
        const rows = await this.db.getAllAsync<MessageRow>(
            `SELECT * FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY peer_id ORDER BY created_at DESC, rowid DESC) AS rn
                FROM messages WHERE direction != 'system'
            ) WHERE rn = 1`
        );
        return rows.map(toLocalMessage);
    }
}
