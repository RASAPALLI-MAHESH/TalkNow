/*
  The message pipeline on the phone. Every encrypted envelope, live or queued while
  offline, is decrypted here exactly once, saved with its session update in one
  transaction, then acknowledged so the server deletes the ciphertext. Screens read
  messages from the local store and listen for change events; they never see envelopes.
*/
import axios from 'axios';
import {
    E2EEError,
    KeyedMutex,
    SafetyNumber,
    SessionRecord,
    TrustedIdentity,
    archiveActiveSession,
    computeSafetyNumber,
    decryptMessage,
    emptyRecord,
    encryptMessage,
    identityId,
    parsePreKeyBundle,
    publicIdentityOf,
    startSession,
} from '../crypto';
import {
    PendingMessageDto,
    SessionResetDto,
    acknowledgeMessages,
    getConversationMessages,
    getPendingMessages,
    getPreKeyBundle,
} from '../AuthService';
import { ensureKeysPublished, topUpPreKeys } from './keyManager';
import { LocalMessage, LocalStore } from './localStore';

export type EngineState = { status: 'starting' | 'ready' | 'error'; error?: string };

export type E2EEEvent =
    | { type: 'messages'; peerId: string }
    | { type: 'trust'; peerId: string }
    | { type: 'state'; state: EngineState }
    | { type: 'send_failed'; peerId: string; message: string };

export type Transport = {
    send: (payload: Record<string, unknown>) => boolean;
    isConnected: () => boolean;
};

/** Sending is held until the user acknowledges that a verified contact's security code changed. */
export class IdentityChangedError extends Error {
    constructor(readonly peerId: string) {
        super('Security code changed');
        this.name = 'IdentityChangedError';
    }
}

export class SendError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SendError';
    }
}

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const ACK_DELAY_MS = 250;
const RESET_DELAY_MS = 2000;
const OUTBOX_GIVE_UP_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_RETRY_MS = 5 * 60 * 1000;
const LEGACY_PAGES = 20;

const newClientId = () => `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const systemRow = (peerId: string, kind: LocalMessage['kind'], createdAt: string, key: string): LocalMessage => ({
    id: `sys_${key}_${kind}`,
    clientId: null,
    peerId,
    direction: 'system',
    kind,
    text: '',
    status: null,
    createdAt,
    legacy: false,
});

const errorMessage = (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err)) {
        const m = (err.response?.data as any)?.message;
        if (typeof m === 'string' && m.trim()) return m;
        if (!err.response) return 'No connection. Your message will be sent when you are back online.';
    }
    if (err instanceof SendError || err instanceof E2EEError) return err.message;
    return fallback;
};

export class E2EEEngine {
    private peerLock = new KeyedMutex();
    private keyLock = new KeyedMutex();
    private listeners = new Set<(e: E2EEEvent) => void>();
    private pendingAcks = new Set<string>();
    private pendingResetAcks = new Set<string>();
    private ackTimer: ReturnType<typeof setTimeout> | null = null;
    private resetRequests = new Map<string, Set<string>>();
    private resetTimer: ReturnType<typeof setTimeout> | null = null;
    private keyRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private keyRetryDelay = 5000;
    private keysPublished = false;
    private draining = false;
    private drainAgain = false;
    private reconciling = false;
    // Sends refused with recipient_keys_changed that were already retried once with fresh keys.
    private retriedAfterKeyChange = new Set<string>();
    private safetyCache = new Map<string, SafetyNumber>();
    private stopped = false;
    state: EngineState = { status: 'starting' };

    constructor(
        readonly store: LocalStore,
        readonly userId: string,
        private transport: Transport
    ) {}

    /* Lifecycle */

    start() {
        void this.ensureKeys();
    }

    async stop() {
        this.stopped = true;
        for (const t of [this.ackTimer, this.resetTimer, this.keyRetryTimer]) if (t) clearTimeout(t);
        await this.flushAcks().catch(() => undefined);
        this.listeners.clear();
        await this.store.close().catch(() => undefined);
    }

    subscribe(listener: (e: E2EEEvent) => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(event: E2EEEvent) {
        for (const l of this.listeners) {
            try {
                l(event);
            } catch (err) {
                console.error('[e2ee] listener error', err);
            }
        }
    }

    private setState(state: EngineState) {
        this.state = state;
        this.emit({ type: 'state', state });
    }

    /** Creates this install's keys if needed and publishes them; retries with backoff while offline. */
    private ensureKeys(): Promise<void> {
        return this.keyLock.run('keys', async () => {
            if (this.stopped || this.keysPublished) return;
            try {
                await ensureKeysPublished(this.store);
                this.keysPublished = true;
                this.keyRetryDelay = 5000;
                this.setState({ status: 'ready' });
            } catch (err) {
                console.warn('[e2ee] key setup failed', err);
                // Local keys may exist even when publishing failed: sending and receiving still work.
                this.setState({ status: this.store.hasIdentity() ? 'ready' : 'error', error: errorMessage(err, 'Could not set up encryption') });
                if (!this.keyRetryTimer && !this.stopped) {
                    this.keyRetryTimer = setTimeout(() => {
                        this.keyRetryTimer = null;
                        void this.ensureKeys();
                    }, this.keyRetryDelay);
                    this.keyRetryDelay = Math.min(this.keyRetryDelay * 2, MAX_KEY_RETRY_MS);
                }
            }
        });
    }

    /** The socket (re)connected: publish keys if needed, fetch what arrived meanwhile, finish interrupted sends. */
    onRegistered() {
        void (async () => {
            await this.ensureKeys();
            if (!this.store.hasIdentity()) return;
            await this.drainPending();
            this.flushResetRequests();
            await this.reconcileOutbox();
        })().catch((err) => console.warn('[e2ee] sync after connect failed', err));
    }

    onSocketMessage(msg: { type: string; [key: string]: unknown }) {
        if (this.stopped) return;
        const run = (task: Promise<unknown>) => void task.catch((err) => console.warn(`[e2ee] ${msg.type} failed`, err));
        switch (msg.type) {
            case 'registered':
                this.onRegistered();
                return;
            case 'new_message':
                if (msg.envelope) run(this.processIncoming(msg as unknown as PendingMessageDto).then(() => this.scheduleAckFlush()));
                return;
            case 'sent':
                run(this.onSent(String(msg.clientId ?? ''), String(msg.id ?? ''), String(msg.date ?? ''), String(msg.to ?? '')));
                return;
            case 'message_status':
                if (msg.status === 'delivered' || msg.status === 'read' || msg.status === 'sent') {
                    run(this.updateStatus([String(msg.id ?? '')], msg.status));
                }
                return;
            case 'messages_read':
                if (Array.isArray(msg.ids)) run(this.updateStatus(msg.ids.map(String), 'read', String(msg.by ?? '')));
                return;
            case 'error':
                if (msg.clientId) run(this.onSendRejected(String(msg.clientId), String(msg.code ?? ''), String(msg.message ?? '')));
                return;
            case 'session_reset':
                run(this.processReset(msg as unknown as SessionResetDto).then(() => this.scheduleAckFlush()));
                return;
            case 'identity_changed':
                if (typeof msg.userId === 'string') run(this.onIdentityChanged(msg.userId));
                return;
            case 'prekeys_low':
                run(this.keyLock.run('keys', () => topUpPreKeys(this.store)));
                return;
            default:
        }
    }

    /* Receiving */

    private async processIncoming(m: PendingMessageDto) {
        const peerId = String(m.from ?? '');
        if (!OBJECT_ID_RE.test(peerId) || !OBJECT_ID_RE.test(String(m.id ?? ''))) return;
        const createdAt = m.date || new Date().toISOString();

        await this.peerLock.run(peerId, async () => {
            if (await this.store.getMessage(m.id)) {
                this.pendingAcks.add(m.id);
                return;
            }
            const myRegistrationId = await this.store.getRegistrationId();
            const base = { id: m.id, clientId: null, peerId, direction: 'in' as const, status: null, createdAt, legacy: false };

            if (m.envelope?.recipientRegistrationId !== myRegistrationId) {
                // Encrypted for an earlier install of this account (before a reinstall or phone change).
                await this.store.write((w) => w.insertMessage({ ...base, kind: 'other_device', text: '' }));
                this.pendingAcks.add(m.id);
                this.emit({ type: 'messages', peerId });
                return;
            }

            let result;
            try {
                result = await decryptMessage(this.store, peerId, m.envelope);
            } catch (err) {
                // Anything else (e.g. a database error) is transient: not acknowledged, so it comes back.
                if (!(err instanceof E2EEError) || err.code === 'not_ready') throw err;
                if (err.code === 'duplicate_message') {
                    this.pendingAcks.add(m.id);
                    return;
                }
                await this.store.write((w) => w.insertMessage({ ...base, kind: 'undecryptable', text: '' }));
                this.requestReset(peerId, m.id);
                this.pendingAcks.add(m.id);
                this.emit({ type: 'messages', peerId });
                return;
            }

            const { payload, identityStatus } = result;
            await this.store.write(async (w) => {
                await w.applyCommit(result.commit);
                if (identityStatus.changed) await w.insertMessage(systemRow(peerId, 'identity_changed', createdAt, m.id));

                if (payload?.resendOf) {
                    const original = await this.store.getMessage(payload.resendOf);
                    if (original && original.peerId === peerId && original.kind === 'undecryptable') {
                        // The re-send replaces the placeholder, in its original place in the chat.
                        await w.deleteMessage(original.id);
                        await w.insertMessage({ ...base, kind: 'text', text: payload.text, createdAt: original.createdAt });
                        return;
                    }
                    if (original && original.kind === 'text') return; // we already had it
                }
                await w.insertMessage({ ...base, kind: payload ? 'text' : 'unsupported', text: payload?.text ?? '' });
            });
            this.pendingAcks.add(m.id);
            this.emit({ type: 'messages', peerId });
            if (identityStatus.changed) {
                this.safetyCache.delete(peerId);
                this.emit({ type: 'trust', peerId });
            }
        });
    }

    /** Fetches and processes everything the server queued for this phone. */
    private async drainPending() {
        if (this.draining) {
            this.drainAgain = true;
            return;
        }
        this.draining = true;
        try {
            do {
                this.drainAgain = false;
                for (let page = 0; page < 50 && !this.stopped; page++) {
                    const batch = await getPendingMessages(100);
                    let handled = 0;
                    for (const m of batch.messages) {
                        try {
                            await this.processIncoming(m);
                            handled += 1;
                        } catch (err) {
                            console.warn('[e2ee] could not process a queued message', err);
                        }
                    }
                    for (const r of batch.resets) await this.processReset(r).catch((err) => console.warn('[e2ee] reset failed', err));
                    await this.flushAcks();
                    // Stop if nothing could be handled: the same page would come back.
                    if (!batch.hasMore || handled === 0) break;
                }
            } while (this.drainAgain && !this.stopped);
        } finally {
            this.draining = false;
        }
    }

    private scheduleAckFlush() {
        if (this.ackTimer || this.stopped) return;
        this.ackTimer = setTimeout(() => {
            this.ackTimer = null;
            void this.flushAcks().catch(() => undefined);
        }, ACK_DELAY_MS);
    }

    private async flushAcks() {
        const ids = [...this.pendingAcks].slice(0, 200);
        const resetIds = [...this.pendingResetAcks].slice(0, 200);
        if (ids.length === 0 && resetIds.length === 0) return;
        for (const id of ids) this.pendingAcks.delete(id);
        for (const id of resetIds) this.pendingResetAcks.delete(id);
        // A lost ack only means the server offers the message again; the local copy dedupes it.
        if (this.transport.isConnected() && this.transport.send({ type: 'ack', ids, resetIds })) return;
        try {
            await acknowledgeMessages(ids, resetIds);
        } catch (err) {
            for (const id of ids) this.pendingAcks.add(id);
            for (const id of resetIds) this.pendingResetAcks.add(id);
            throw err;
        }
    }

    /* Session repair */

    // Asks the sender (batched) to start a new session and re-send what we couldn't read.
    private requestReset(peerId: string, messageId: string) {
        const ids = this.resetRequests.get(peerId) ?? new Set<string>();
        ids.add(messageId);
        this.resetRequests.set(peerId, ids);
        if (!this.resetTimer) {
            this.resetTimer = setTimeout(() => {
                this.resetTimer = null;
                this.flushResetRequests();
            }, RESET_DELAY_MS);
        }
    }

    private flushResetRequests() {
        if (!this.transport.isConnected()) return; // retried after the next connect
        for (const [peerId, ids] of [...this.resetRequests]) {
            if (this.transport.send({ type: 'session_reset', to: peerId, messageIds: [...ids].slice(0, 50) })) {
                this.resetRequests.delete(peerId);
            }
        }
    }

    // The peer couldn't decrypt some of our messages: start over with fresh keys and re-send them.
    private async processReset(r: SessionResetDto) {
        const peerId = String(r.from ?? '');
        if (!OBJECT_ID_RE.test(peerId)) return;
        await this.archiveSession(peerId);
        for (const id of (r.messageIds || []).slice(0, 50)) {
            const original = await this.store.getMessage(id);
            if (!original || original.peerId !== peerId || original.direction !== 'out' || original.kind !== 'text') continue;
            await this.peerLock
                .run(peerId, () => this.transmit(peerId, original.text, newClientId(), id))
                .catch((err) => console.warn('[e2ee] re-send failed', err));
        }
        this.pendingResetAcks.add(r.id);
    }

    private async archiveSession(peerId: string) {
        await this.peerLock.run(peerId, async () => {
            const record = await this.store.getSessionRecord(peerId);
            if (record?.active) await this.store.write((w) => w.saveSessionRecord(peerId, archiveActiveSession(record)));
        });
    }

    // A contact published new keys (reinstall or new phone): the next message starts a new session.
    private async onIdentityChanged(peerId: string) {
        if (!OBJECT_ID_RE.test(peerId)) return;
        await this.archiveSession(peerId);
    }

    /* Sending */

    /** Returns a session for the peer, fetching their bundle and starting one if needed. Call under the peer lock. */
    private async prepareSession(peerId: string): Promise<SessionRecord> {
        const trust = await this.store.getTrustedIdentity(peerId);
        if (trust?.needsAck) throw new IdentityChangedError(peerId);
        const existing = (await this.store.getSessionRecord(peerId)) ?? emptyRecord();
        if (existing.active) return existing;

        let bundleJson: unknown;
        try {
            bundleJson = await getPreKeyBundle(peerId);
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
                throw new SendError(errorMessage(err, 'You can only message your connections.'));
            }
            throw err;
        }
        const started = await startSession(this.store, peerId, parsePreKeyBundle(bundleJson as any));

        if (started.identityStatus.changed) {
            const now = new Date().toISOString();
            await this.store.write(async (w) => {
                await w.trustIdentity(peerId, started.remoteIdentity);
                await w.insertMessage(systemRow(peerId, 'identity_changed', now, `${Date.now()}`));
            });
            this.safetyCache.delete(peerId);
            this.emit({ type: 'trust', peerId });
            this.emit({ type: 'messages', peerId });
            if (started.identityStatus.wasVerified) throw new IdentityChangedError(peerId);
        }
        await this.store.write((w) => w.applyCommit({ peerId, record: started.record, remoteIdentity: started.remoteIdentity }));
        return started.record;
    }

    /** Encrypts and sends one message. Call under the peer lock. Returns false if the socket was down. */
    private async transmit(peerId: string, text: string, clientId: string, resendOf?: string): Promise<boolean> {
        const record = await this.prepareSession(peerId);
        const { envelope, commit } = await encryptMessage(this.store, peerId, record, { v: 1, type: 'text', text, ...(resendOf ? { resendOf } : {}) });
        await this.store.write((w) => w.applyCommit(commit));
        return this.transport.send({ type: 'send_message', to: peerId, envelope, clientId, ...(resendOf ? { resendOf } : {}) });
    }

    /**
     * Encrypts `text` for the peer, saves it locally and sends it. Throws IdentityChangedError
     * when the user must first acknowledge a security code change, or SendError with a reason.
     * Offline sends stay "sending" and go out after reconnecting.
     */
    async sendText(peerId: string, text: string): Promise<LocalMessage> {
        if (!this.store.hasIdentity()) {
            await this.ensureKeys();
            if (!this.store.hasIdentity()) throw new SendError(this.state.error || 'Encryption is still being set up. Please try again.');
        }
        const clientId = newClientId();
        const local: LocalMessage = {
            id: clientId,
            clientId,
            peerId,
            direction: 'out',
            kind: 'text',
            text,
            status: 'sending',
            createdAt: new Date().toISOString(),
            legacy: false,
        };
        await this.peerLock.run(peerId, async () => {
            // Saved before anything can fail on the network, so the text is never lost.
            const record = await this.prepareSessionOrNull(peerId);
            if (!record) {
                await this.store.write((w) => w.insertMessage(local));
                this.emit({ type: 'messages', peerId });
                return;
            }
            const { envelope, commit } = await encryptMessage(this.store, peerId, record, { v: 1, type: 'text', text });
            await this.store.write(async (w) => {
                await w.applyCommit(commit);
                await w.insertMessage(local);
            });
            this.emit({ type: 'messages', peerId });
            this.transport.send({ type: 'send_message', to: peerId, envelope, clientId });
        });
        return local;
    }

    // Like prepareSession, but returns null instead of throwing when the network is down.
    private async prepareSessionOrNull(peerId: string): Promise<SessionRecord | null> {
        try {
            return await this.prepareSession(peerId);
        } catch (err) {
            if (axios.isAxiosError(err) && !err.response) return null;
            throw err;
        }
    }

    /** Sends a failed message again. */
    async retryMessage(id: string) {
        const m = await this.store.getMessage(id);
        if (!m || m.direction !== 'out' || m.status !== 'failed') return;
        const clientId = m.clientId ?? newClientId();
        await this.store.write((w) => w.updateMessage(id, { status: 'sending', clientId }));
        this.emit({ type: 'messages', peerId: m.peerId });
        await this.peerLock.run(m.peerId, () => this.transmit(m.peerId, m.text, clientId)).catch(async (err) => {
            if (axios.isAxiosError(err) && !err.response) return; // stays "sending" until reconnect
            await this.markFailed(m.peerId, clientId, errorMessage(err, 'Message not sent.'));
            throw err;
        });
    }

    async deleteMessage(id: string) {
        const m = await this.store.getMessage(id);
        if (!m) return;
        await this.store.write((w) => w.deleteMessage(id));
        this.emit({ type: 'messages', peerId: m.peerId });
    }

    private async markFailed(peerId: string, idOrClientId: string, message: string) {
        const m = (await this.store.getMessageByClientId(idOrClientId)) ?? (await this.store.getMessage(idOrClientId));
        if (m && m.status !== 'failed') {
            await this.store.write((w) => w.updateMessage(m.id, { status: 'failed' }));
            this.emit({ type: 'messages', peerId });
        }
        this.emit({ type: 'send_failed', peerId, message });
    }

    private async onSent(clientId: string, serverId: string, date: string, to: string) {
        if (!clientId || !OBJECT_ID_RE.test(serverId)) return;
        const m = await this.store.getMessageByClientId(clientId);
        if (!m) return; // a re-send: no local row of its own
        await this.store.write((w) => w.confirmSent(clientId, serverId, date || new Date().toISOString()));
        this.retriedAfterKeyChange.delete(clientId);
        this.emit({ type: 'messages', peerId: m.peerId || to });
    }

    private async updateStatus(ids: string[], status: 'sent' | 'delivered' | 'read', peerHint?: string) {
        const valid = ids.filter(Boolean).slice(0, 500);
        if (valid.length === 0) return;
        const peers = new Set<string>();
        await this.store.write(async (w) => {
            for (const id of valid) await w.advanceStatus(id, status);
        });
        if (peerHint) peers.add(peerHint);
        else {
            for (const id of valid) {
                const m = (await this.store.getMessage(id)) ?? (await this.store.getMessageByClientId(id));
                if (m) peers.add(m.peerId);
            }
        }
        for (const peerId of peers) this.emit({ type: 'messages', peerId });
    }

    private async onSendRejected(clientId: string, code: string, message: string) {
        const m = await this.store.getMessageByClientId(clientId);
        if (!m) return;
        if (code === 'recipient_keys_changed' && !this.retriedAfterKeyChange.has(clientId)) {
            // The contact reinstalled since our session started: fetch their new keys and send again.
            this.retriedAfterKeyChange.add(clientId);
            await this.archiveSession(m.peerId);
            await this.peerLock.run(m.peerId, () => this.transmit(m.peerId, m.text, clientId)).catch((err) =>
                this.markFailed(m.peerId, clientId, err instanceof IdentityChangedError ? 'Security code changed. Review it before sending.' : errorMessage(err, message))
            );
            return;
        }
        await this.markFailed(m.peerId, clientId, message || 'Message not sent.');
    }

    /**
     * Messages still "sending" after a reconnect: if the server has them (the ack was lost),
     * take its id; otherwise encrypt and send them again.
     */
    private async reconcileOutbox() {
        if (this.reconciling) return;
        this.reconciling = true;
        try {
            const outbox = await this.store.getMessagesByStatus('sending');
            const byPeer = new Map<string, LocalMessage[]>();
            for (const m of outbox) byPeer.set(m.peerId, [...(byPeer.get(m.peerId) ?? []), m]);

            for (const [peerId, messages] of byPeer) {
                let serverRows: Awaited<ReturnType<typeof getConversationMessages>>['messages'] = [];
                try {
                    serverRows = (await getConversationMessages(peerId)).messages ?? [];
                } catch {
                    continue;
                }
                for (const m of messages) {
                    const onServer = m.clientId ? serverRows.find((r) => r.sender === 'me' && r.clientId === m.clientId) : undefined;
                    if (onServer) {
                        await this.store.write(async (w) => {
                            await w.confirmSent(m.clientId!, onServer.id, onServer.createdAt);
                            if (onServer.status === 'delivered' || onServer.status === 'read') await w.advanceStatus(onServer.id, onServer.status);
                        });
                    } else if (Date.now() - Date.parse(m.createdAt) > OUTBOX_GIVE_UP_MS) {
                        await this.store.write((w) => w.updateMessage(m.id, { status: 'failed' }));
                    } else {
                        await this.peerLock
                            .run(peerId, () => this.transmit(peerId, m.text, m.clientId ?? newClientId()))
                            .catch((err) => {
                                if (axios.isAxiosError(err) && !err.response) return;
                                return this.markFailed(peerId, m.clientId ?? m.id, errorMessage(err, 'Message not sent.'));
                            });
                    }
                }
                this.emit({ type: 'messages', peerId });
            }
        } finally {
            this.reconciling = false;
        }
    }

    /* Conversation sync (opening a chat) */

    /**
     * Brings in read/delivered states the phone missed and, once per contact, the plain-text
     * messages saved by app versions before encryption.
     */
    async syncConversation(peerId: string) {
        if (!OBJECT_ID_RE.test(peerId)) return;
        const legacyKey = `legacy_imported:${peerId}`;
        const legacyDone = (await this.store.getMeta(legacyKey)) === '1';
        let before: string | undefined;
        for (let page = 0; page < (legacyDone ? 1 : LEGACY_PAGES); page++) {
            const rows = (await getConversationMessages(peerId, before)).messages ?? [];
            await this.store.write(async (w) => {
                for (const r of rows) {
                    const status = r.status === 'read' || r.status === 'delivered' || r.status === 'sent' ? r.status : undefined;
                    if (!r.encrypted && typeof r.text === 'string' && r.text) {
                        await w.insertMessage({
                            id: r.id,
                            clientId: null,
                            peerId,
                            direction: r.sender === 'me' ? 'out' : 'in',
                            kind: 'text',
                            text: r.text,
                            status: r.sender === 'me' ? status ?? 'sent' : null,
                            createdAt: r.createdAt,
                            legacy: true,
                        });
                    }
                    if (r.sender === 'me' && status) await w.advanceStatus(r.id, status);
                }
            });
            if (rows.length < 50) break;
            before = rows[rows.length - 1].createdAt;
        }
        if (!legacyDone) await this.store.write((w) => w.setMeta(legacyKey, '1'));
        this.emit({ type: 'messages', peerId });
    }

    /* Queries for screens */

    getMessages(peerId: string, limit: number) {
        return this.store.getMessages(peerId, limit);
    }

    getLatestPerPeer() {
        return this.store.getLatestPerPeer();
    }

    getTrust(peerId: string): Promise<TrustedIdentity | null> {
        return this.store.getTrustedIdentity(peerId);
    }

    /** Null until a message has been exchanged with this contact (their key isn't known yet). */
    async getSafetyNumber(peerId: string): Promise<SafetyNumber | null> {
        const trust = await this.store.getTrustedIdentity(peerId);
        if (!trust || !this.store.hasIdentity()) return null;
        const cached = this.safetyCache.get(peerId);
        if (cached) return cached;
        const local = identityId(publicIdentityOf(await this.store.getIdentity()));
        const sn = computeSafetyNumber(this.userId, local, peerId, trust.identity);
        this.safetyCache.set(peerId, sn);
        return sn;
    }

    async setVerified(peerId: string, verified: boolean) {
        await this.store.write((w) => w.setVerified(peerId, verified));
        this.emit({ type: 'trust', peerId });
    }

    async acknowledgeIdentityChange(peerId: string) {
        await this.store.write((w) => w.acknowledgeIdentity(peerId));
        this.emit({ type: 'trust', peerId });
    }

    /** Account deletion: closes and erases this account's encrypted database and keys. */
    async wipe() {
        await this.stop();
        await LocalStore.wipe(this.userId);
    }
}
