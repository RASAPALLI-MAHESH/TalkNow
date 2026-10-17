/*
  Two phones, end to end: the app's real E2EE engine (services/e2ee) for Alice and Bob,
  talking to the real backend and MongoDB over HTTP and WebSocket. Only SQLite and
  SecureStore are swapped for Node stand-ins (see register.mjs).

  Usage (from the repo root): TEST_MONGO_URL=mongodb://127.0.0.1:27017 npm run test:engine
*/
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = process.cwd();
process.env.PORT = '18081';
process.env.MONGO_URI = `${String(process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017').replace(/\/$/, '')}/talknow_engine_${Date.now()}`;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.TEST_API_BASE = 'http://127.0.0.1:18081/api';
process.env.TEST_SQLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'talknow-engine-'));
delete process.env.BREVO_API_KEY;
const PASSWORD = `P${crypto.randomBytes(9).toString('base64url')}7`;

// Quiet: keep only this file's output. Capture signup codes from the email fallback log.
const otps: Record<string, string> = {};
const origWrite = process.stdout.write.bind(process.stdout);
(process.stdout as any).write = (chunk: any, ...rest: any[]) => (String(chunk).includes('HTTP/1.1"') ? true : origWrite(chunk, ...rest));
console.log = () => {};
const origWarn = console.warn;
console.warn = (...args: any[]) => {
    const m = String(args[0]).match(/OTP for (\S+): (\d{6})/);
    if (m) otps[m[1]] = m[2];
    else if (!String(args[0]).includes('[otpService]') && !String(args[0]).startsWith('[e2ee]')) origWarn(...args);
};
const origError = console.error;
console.error = (...a: any[]) => {
    if (!String(a[0]).includes('index')) origError(...a);
};

/* eslint-disable @typescript-eslint/no-require-imports */
const WebSocket = require(path.join(ROOT, 'node_modules/ws'));
const mongoose = require(path.join(ROOT, 'node_modules/mongoose'));
require(path.join(ROOT, 'backend/server.js'));
const Connection = require(path.join(ROOT, 'backend/models/connection'));
const Message = require(path.join(ROOT, 'backend/models/message'));
const KeyBundle = require(path.join(ROOT, 'backend/models/keyBundle'));
const { runAs } = require('./mocks/AuthService.js');
/* eslint-enable @typescript-eslint/no-require-imports */

import { E2EEEngine, IdentityChangedError } from '../../../services/e2ee/engine';
import { LocalStore } from '../../../services/e2ee/localStore';

const API = 'http://127.0.0.1:18081/api/auth';
const WS_URL = 'ws://127.0.0.1:18081/ws';

let passed = 0;
let failed = 0;
const check = (name: string, cond: unknown, extra?: unknown) => {
    if (cond) {
        passed++;
        origWrite(`  PASS ${name}\n`);
    } else {
        failed++;
        origWrite(`  FAIL ${name} ${extra !== undefined ? JSON.stringify(extra) : ''}\n`);
    }
};
const section = (name: string) => origWrite(`\n${name}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitUntil = async (pred: () => Promise<boolean> | boolean, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await pred()) return true;
        await sleep(50);
    }
    return false;
};

let ipCounter = 1;
const api = async (method: string, route: string, body?: unknown) => {
    const res = await fetch(API + route, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.0.${ipCounter++ % 250}` },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as any };
};

const signup = async (email: string, username: string) => {
    await api('POST', '/send-signup-otp', { email });
    const r = await api('POST', '/signup', { Firstname: 'T', email, username, password: PASSWORD, otp: otps[email] });
    return { id: String(r.data.user.id), token: String(r.data.token) };
};

type Phone = {
    id: string;
    engine: E2EEEngine;
    connected: boolean;
    run: <T>(fn: () => T) => T;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    markRead: (peerId: string) => void;
    messages: (peerId: string) => Promise<Awaited<ReturnType<E2EEEngine['getMessages']>>>;
    failures: string[];
};

/** A phone install: its own encrypted store, engine and socket. */
const makePhone = async (user: { id: string; token: string }): Promise<Phone> => {
    const ctx = { token: user.token };
    const run = <T,>(fn: () => T): T => runAs(ctx, fn);
    let ws: any = null;
    const phone: Phone = {
        id: user.id,
        engine: null as unknown as E2EEEngine,
        connected: false,
        run,
        failures: [],
        connect: () =>
            new Promise<void>((resolve, reject) => {
                ws = new WebSocket(WS_URL);
                ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: user.token })));
                ws.on('message', (raw: Buffer) => {
                    const msg = JSON.parse(String(raw));
                    if (msg.type === 'registered') {
                        phone.connected = true;
                        resolve();
                    }
                    run(() => phone.engine.onSocketMessage(msg));
                });
                ws.on('close', () => {
                    phone.connected = false;
                });
                ws.on('error', reject);
            }),
        disconnect: async () => {
            phone.connected = false;
            ws?.close();
            await sleep(100);
        },
        markRead: (peerId) => ws.send(JSON.stringify({ type: 'mark_read', peerId, upTo: new Date(Date.now() + 1000).toISOString() })),
        messages: (peerId) => run(() => phone.engine.getMessages(peerId, 200)),
    };
    const store = await run(() => LocalStore.open(user.id));
    phone.engine = new E2EEEngine(store, user.id, {
        send: (payload) => {
            if (!phone.connected || ws?.readyState !== WebSocket.OPEN) return false;
            ws.send(JSON.stringify(payload));
            return true;
        },
        isConnected: () => phone.connected,
    });
    phone.engine.subscribe((e) => {
        if (e.type === 'send_failed') phone.failures.push(e.message);
    });
    run(() => phone.engine.start());
    return phone;
};

const texts = (rows: { kind: string; text: string }[]) => rows.filter((m) => m.kind === 'text').map((m) => m.text).reverse();

(async () => {
    await new Promise((r) => (mongoose.connection.readyState === 1 ? r(null) : mongoose.connection.once('connected', r)));

    const aliceUser = await signup('alice@example.com', 'alice');
    const bobUser = await signup('bob@example.com', 'bob');
    await Connection.create({
        pairKey: [aliceUser.id, bobUser.id].sort().join(':'),
        participants: [{ userId: aliceUser.id }, { userId: bobUser.id }],
        requestedBy: aliceUser.id,
        requestedTo: bobUser.id,
        status: 'accepted',
    });

    section('Setup');
    const alice = await makePhone(aliceUser);
    let bob = await makePhone(bobUser);
    await alice.connect();
    await bob.connect();
    check('both phones publish their keys', await waitUntil(async () => (await KeyBundle.countDocuments({})) === 2));
    const aliceBundle = await KeyBundle.findOne({ userId: aliceUser.id }).lean();
    check('a full batch of one-time prekeys is uploaded', aliceBundle?.oneTimePreKeys?.length === 100, aliceBundle?.oneTimePreKeys?.length);

    section('Live messages');
    await alice.run(() => alice.engine.sendText(bobUser.id, 'hello bob 👋'));
    check('recipient decrypts and stores the message', await waitUntil(async () => texts(await bob.messages(aliceUser.id)).includes('hello bob 👋')));
    check(
        "sender's copy goes sending → sent → delivered",
        await waitUntil(async () => (await alice.messages(bobUser.id))[0]?.status === 'delivered'),
        await alice.messages(bobUser.id)
    );
    const sentRow = (await alice.messages(bobUser.id))[0];
    check('local row switched to the server id', /^[a-f\d]{24}$/.test(sentRow.id), sentRow);
    const serverDoc = await Message.findById(sentRow.id).lean();
    check('server dropped the ciphertext after the ack', serverDoc && !serverDoc.envelope && serverDoc.ackedAt, serverDoc);

    await bob.run(() => bob.engine.sendText(aliceUser.id, 'hi alice'));
    check('reply arrives', await waitUntil(async () => texts(await alice.messages(bobUser.id)).includes('hi alice')));
    bob.markRead(aliceUser.id);
    check('read receipt reaches the sender', await waitUntil(async () => (await alice.messages(bobUser.id)).find((m) => m.text === 'hello bob 👋')?.status === 'read'));

    section('Offline delivery');
    await bob.disconnect();
    for (const t of ['while you were away 1', 'while you were away 2', 'while you were away 3']) {
        await alice.run(() => alice.engine.sendText(bobUser.id, t));
    }
    check('queued on the server while the recipient is offline', await waitUntil(async () => (await Message.countDocuments({ receiverId: bobUser.id, ackedAt: null, encrypted: true })) === 3));
    await bob.connect();
    check(
        'offline messages decrypted in order after reconnect',
        await waitUntil(async () => texts(await bob.messages(aliceUser.id)).slice(-3).join('|') === 'while you were away 1|while you were away 2|while you were away 3'),
        texts(await bob.messages(aliceUser.id))
    );
    check('pending queue drained and acknowledged', await waitUntil(async () => (await Message.countDocuments({ receiverId: bobUser.id, ackedAt: null })) === 0));

    await alice.disconnect();
    await alice.run(() => alice.engine.sendText(bobUser.id, 'sent while offline'));
    check('a send without a connection waits as "sending"', (await alice.messages(bobUser.id))[0]?.status === 'sending', (await alice.messages(bobUser.id))[0]);
    await alice.connect();
    check('it goes out after reconnecting', await waitUntil(async () => texts(await bob.messages(aliceUser.id)).includes('sent while offline')));
    check('and is confirmed on the sender', await waitUntil(async () => ['sent', 'delivered'].includes(String((await alice.messages(bobUser.id)).find((m) => m.text === 'sent while offline')?.status))));

    section('Repairing a broken session');
    // Bob loses his session (e.g. a restore gone wrong): Alice's next message can't be decrypted.
    await bob.run(() => bob.engine.store.write((w) => w.saveSessionRecord(aliceUser.id, { active: null, archived: [] })));
    await alice.run(() => alice.engine.sendText(bobUser.id, 'can you read this?'));
    check(
        'the undecryptable message is re-sent on a fresh session and replaces the placeholder',
        await waitUntil(async () => {
            const rows = await bob.messages(aliceUser.id);
            return rows.some((m) => m.text === 'can you read this?') && !rows.some((m) => m.kind === 'undecryptable');
        }, 8000),
        (await bob.messages(aliceUser.id)).slice(0, 3)
    );
    await bob.run(() => bob.engine.sendText(aliceUser.id, 'yes, all good'));
    check('conversation continues both ways afterwards', await waitUntil(async () => texts(await alice.messages(bobUser.id)).includes('yes, all good')));

    section('Reinstall and security codes');
    const before = await alice.run(() => alice.engine.getSafetyNumber(bobUser.id));
    const bobsView = await bob.run(() => bob.engine.getSafetyNumber(aliceUser.id));
    check('both phones compute the same safety number', !!before && before.digits === bobsView?.digits, [before?.digits, bobsView?.digits]);
    await alice.run(() => alice.engine.setVerified(bobUser.id, true));

    // Bob reinstalls: the app's data is gone and a new install publishes new keys.
    await bob.disconnect();
    await bob.engine.stop();
    await LocalStore.wipe(bobUser.id);
    bob = await makePhone(bobUser);
    await bob.connect();
    check('new install replaces the published keys', await waitUntil(async () => (await KeyBundle.findOne({ userId: bobUser.id }).lean())?.registrationId === (await bob.engine.store.getRegistrationId())));
    await sleep(300); // identity_changed reaches Alice
    let blocked: unknown = null;
    try {
        await alice.run(() => alice.engine.sendText(bobUser.id, 'are you still you?'));
    } catch (err) {
        blocked = err;
    }
    check('sending to a verified contact with a new key waits for acknowledgement', blocked instanceof IdentityChangedError, String(blocked));
    const trust = await alice.run(() => alice.engine.getTrust(bobUser.id));
    check('verification cleared and change flagged', trust && !trust.verified && trust.needsAck, trust);
    check('a security-code notice is shown in the chat', (await alice.messages(bobUser.id)).some((m) => m.kind === 'identity_changed'));
    await alice.run(() => alice.engine.acknowledgeIdentityChange(bobUser.id));
    await alice.run(() => alice.engine.sendText(bobUser.id, 'are you still you?'));
    check('after acknowledging, the new install receives messages', await waitUntil(async () => texts(await bob.messages(aliceUser.id)).includes('are you still you?')));
    const after = await alice.run(() => alice.engine.getSafetyNumber(bobUser.id));
    check('the safety number changed', !!after && after.digits !== before?.digits);

    section('Messages from before encryption');
    await Message.create({
        conversationId: (await Connection.findOne({}).lean())._id,
        conversationKey: [aliceUser.id, bobUser.id].sort().join(':'),
        participants: [aliceUser.id, bobUser.id],
        senderId: bobUser.id,
        receiverId: aliceUser.id,
        content: 'an old plain-text message',
        createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    await alice.run(() => alice.engine.syncConversation(bobUser.id));
    const legacy = (await alice.messages(bobUser.id)).find((m) => m.text === 'an old plain-text message');
    check('legacy plain-text history is imported into the encrypted store', legacy && legacy.legacy, legacy);

    section('Server never sees content');
    const dump = JSON.stringify(await mongoose.connection.db.collection('messages').find({ encrypted: true }).toArray());
    const leaked = ['hello bob', 'hi alice', 'while you were away', 'sent while offline', 'can you read this', 'all good', 'still you'].filter((t) => dump.includes(t));
    check('no encrypted message text in the database', leaked.length === 0, leaked);
    // Acks go out in small batches, so give the last one a moment.
    check('no envelope left once everything was delivered', await waitUntil(async () => !(await Message.exists({ envelope: { $exists: true } }))));
    check('no send failures reported along the way', alice.failures.length === 0 && bob.failures.length === 0, [alice.failures, bob.failures]);

    origWrite(`\n${passed} passed, ${failed} failed\n`);
    await alice.engine.stop();
    await bob.engine.stop();
    await mongoose.connection.db.dropDatabase();
    fs.rmSync(String(process.env.TEST_SQLITE_DIR), { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
})().catch((e) => {
    origError(e);
    process.exit(1);
});
