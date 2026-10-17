/*
  End-to-end security and behaviour checks against the real backend.

  Usage (from the repo root, with a MongoDB you can throw data into):
    TEST_MONGO_URL=mongodb://127.0.0.1:27017 npm run test:e2e

  Boots the server in-process on port 18080 with a fresh database (dropped at the end),
  stubs Expo's push API and email sending, and exits non-zero if any check fails.
  Messages are encrypted and decrypted with the app's own crypto code (services/crypto).
  Set TEST_FERRETDB=1 when running against FerretDB, which lacks arrayFilters.
*/
process.env.PORT = '18080';
process.env.MONGO_URI = `${String(process.env.TEST_MONGO_URL || 'mongodb://127.0.0.1:27017').replace(/\/$/, '')}/talknow_test_${Date.now()}`;
process.env.NODE_ENV = 'test';
// Credentials are generated per run, so this file contains no fixed passwords or secrets.
const testCrypto = require('crypto');
const randomPart = () => testCrypto.randomBytes(9).toString('base64url');
const JWT_TEST_SECRET = testCrypto.randomBytes(32).toString('hex');
const PASSWORD = `P${randomPart()}7`; // meets the rule: an uppercase letter and a digit
const NEW_PASSWORD = `N${randomPart()}8`;
const WRONG_PASSWORD = `W${randomPart()}9`;
const WEAK_PASSWORD = randomPart().slice(0, 4).toLowerCase(); // too short, no uppercase or digit
process.env.JWT_SECRET = JWT_TEST_SECRET;
delete process.env.BREVO_API_KEY;

const path = require('path');
const ROOT = process.cwd();
const WebSocket = require(path.join(ROOT, 'node_modules/ws'));
const jwt = require(path.join(ROOT, 'node_modules/jsonwebtoken'));
const mongoose = require(path.join(ROOT, 'node_modules/mongoose'));

process.env.REPORTS_EMAIL = 'moderator@example.com';

// Capture OTPs and other emails from the dev fallback log lines.
const otps = {};
const emailLog = [];
const origWarn = console.warn;
console.warn = (...args) => {
    const line = String(args[0]);
    const m = line.match(/OTP for (\S+): (\d{6})/);
    if (m) otps[m[1]] = m[2];
    else if (line.includes('[otpService]') && !line.includes('not set')) emailLog.push(line);
    else if (!line.includes('[otpService]')) origWarn(...args);
};

// Stub Expo's push API and record what would be sent.
const pushes = [];
let pushTicketsFor = () => null;
const realFetch = global.fetch;
global.fetch = async (url, init) => {
    if (String(url).startsWith('https://exp.host/')) {
        const messages = JSON.parse(init.body);
        pushes.push(...messages);
        return new Response(JSON.stringify({ data: messages.map((m) => pushTicketsFor(m) || { status: 'ok', id: 'x' }) }), { status: 200 });
    }
    return realFetch(url, init);
};
console.log = () => {}; // silence morgan / startup
const origError = console.error;
console.error = (...a) => { if (!String(a[0]).includes('index')) origError(...a); };

require(path.join(ROOT, 'backend/server.js'));
const User = require(path.join(ROOT, 'backend/models/user'));
const Connection = require(path.join(ROOT, 'backend/models/connection'));

// FerretDB lacks arrayFilters; when testing on it, drop only the unread-counter fields.
const origUpdateOne = Connection.updateOne.bind(Connection);
if (process.env.TEST_FERRETDB === '1') Connection.updateOne = (filter, update, options) => {
    if (options?.arrayFilters) {
        for (const op of ['$inc', '$set']) {
            for (const key of Object.keys(update[op] || {})) if (key.includes('$[')) delete update[op][key];
            if (update[op] && !Object.keys(update[op]).length) delete update[op];
        }
        options = { ...options };
        delete options.arrayFilters;
    }
    return origUpdateOne(filter, update, options);
};

const BASE = 'http://127.0.0.1:18080/api/auth';
const KEYS = 'http://127.0.0.1:18080/api/keys';
const WS_URL = 'ws://127.0.0.1:18080/ws';
let ipCounter = 1;
const freshIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

const request = async (base, method, route, body, { token, ip } = {}) => {
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': ip || freshIp() };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
};
const api = (...args) => request(BASE, ...args);
const keysApi = (...args) => request(KEYS, ...args);

// The phone's crypto, loaded from TypeScript.
require(require.resolve('tsx/cjs/api', { paths: [ROOT] })).register();
const E2E = require(path.join(ROOT, 'services/crypto/index.ts'));
const { MemorySignalStore } = require(path.join(ROOT, 'services/crypto/memoryStore.ts'));
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

// A phone install: keys kept in memory, public parts ready for PUT /api/keys.
const makeDevice = (opkCount = 40) => {
    const identity = E2E.generateIdentity();
    const store = new MemorySignalStore(identity, E2E.generateRegistrationId());
    const spk = E2E.generateSignedPreKey(identity, 1);
    store.signedPreKeys.set(spk.keyId, spk);
    const opks = E2E.generateOneTimePreKeys(1, opkCount);
    for (const k of opks) store.oneTimePreKeys.set(k.keyId, k);
    return {
        store,
        upload: {
            registrationId: store.registrationId,
            identityKey: b64(identity.signing.publicKey),
            identityDhKey: b64(identity.dh.publicKey),
            identityDhSignature: b64(identity.dhSignature),
            signedPreKey: { keyId: spk.keyId, publicKey: b64(spk.keyPair.publicKey), signature: b64(spk.signature) },
            oneTimePreKeys: opks.map((k) => ({ keyId: k.keyId, publicKey: b64(k.keyPair.publicKey) })),
        },
    };
};
const publishKeys = async (device, token) => keysApi('PUT', '', device.upload, { token });

// Encrypts like the app: fetches the contact's bundle the first time, then uses the ratchet.
const encryptFor = async (device, token, peerId, text, extra = {}) => {
    let record = (await device.store.getSessionRecord(peerId)) ?? E2E.emptyRecord();
    if (!record.active) {
        const r = await keysApi('GET', '/' + peerId, null, { token });
        if (r.status !== 200) throw new Error(`bundle fetch failed: ${r.status} ${JSON.stringify(r.data)}`);
        const started = await E2E.startSession(device.store, peerId, E2E.parsePreKeyBundle(r.data));
        record = started.record;
        await device.store.commit({ peerId, record, remoteIdentity: started.remoteIdentity });
    }
    const { envelope, commit } = await E2E.encryptMessage(device.store, peerId, record, { v: 1, type: 'text', text, ...extra });
    await device.store.commit(commit);
    return envelope;
};
const decryptFrom = async (device, peerId, envelope) => {
    const result = await E2E.decryptMessage(device.store, peerId, envelope);
    await device.store.commit(result.commit);
    return { text: result.payload?.text, identityStatus: result.identityStatus };
};
// Shape-valid ciphertext the server can't tell apart from a real one.
const dummyEnvelope = (recipientRegistrationId) => ({ type: 'whisper', body: b64(testCrypto.randomBytes(96)), registrationId: 7, recipientRegistrationId });

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
    if (cond) { passed++; process.stdout.write(`  PASS ${name}\n`); }
    else { failed++; process.stdout.write(`  FAIL ${name} ${extra !== undefined ? JSON.stringify(extra) : ''}\n`); }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const openSocket = () => new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.inbox = [];
    ws.closeCode = null;
    ws.on('message', (raw) => ws.inbox.push(JSON.parse(String(raw))));
    ws.on('close', (code) => { ws.closeCode = code; });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
});
const waitFor = async (ws, pred, ms = 2000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const hit = ws.inbox.find(pred);
        if (hit) return hit;
        await sleep(25);
    }
    return null;
};
const authSocket = async (token) => {
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: 'auth', token }));
    const ok = await waitFor(ws, (m) => m.type === 'registered');
    return { ws, ok };
};

const signupUser = async (email, username) => {
    await api('POST', '/send-signup-otp', { email });
    const otp = otps[email];
    const r = await api('POST', '/signup', { Firstname: 'T', email, username, password: PASSWORD, otp });
    return r.data?.token ? { token: r.data.token, id: String(r.data.user.id) } : null;
};

(async () => {
    await new Promise((r) => mongoose.connection.readyState === 1 ? r() : mongoose.connection.once('connected', r));

    console.info('\nSignup one-time codes');
    const emailA = 'alice@example.com';
    let r = await api('POST', '/send-signup-otp', { email: emailA });
    check('send code', r.status === 200 && /^\d{6}$/.test(otps[emailA]), r);
    const userDoc = await mongoose.connection.db.collection('otps').findOne({ email: emailA });
    check('code stored hashed, not plain', userDoc && !userDoc.otp && userDoc.otpHash && userDoc.otpHash !== otps[emailA], userDoc);
    r = await api('POST', '/send-signup-otp', { email: emailA });
    check('resend within 60s blocked', r.status === 429, r);

    const emailB = 'bob@example.com';
    await api('POST', '/send-signup-otp', { email: emailB });
    const realB = otps[emailB];
    const wrong = realB === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await api('POST', '/verify-signup-otp', { email: emailB, otp: wrong });
    r = await api('POST', '/verify-signup-otp', { email: emailB, otp: realB });
    check('correct code rejected after 5 wrong guesses', r.status === 400, r);

    // Parallel guessing must not get past the limit.
    const emailP = 'par@example.com';
    await api('POST', '/send-signup-otp', { email: emailP });
    const realP = otps[emailP];
    const guesses = Array.from({ length: 30 }, (_, i) => String(100000 + i)).filter((g) => g !== realP);
    await Promise.all(guesses.map((g) => api('POST', '/verify-signup-otp', { email: emailP, otp: g })));
    r = await api('POST', '/verify-signup-otp', { email: emailP, otp: realP });
    check('30 parallel guesses still exhaust the code', r.status === 400, r);

    r = await api('POST', '/verify-signup-otp', { email: emailA, otp: otps[emailA] });
    check('correct code verifies', r.status === 200, r);
    r = await api('POST', '/signup', { Firstname: 'A', email: emailA, username: 'alice', password: WEAK_PASSWORD, otp: otps[emailA] });
    check('weak password rejected at signup', r.status === 400, r);
    r = await api('POST', '/signup', { Firstname: 'A', email: emailA, username: 'alice', password: PASSWORD, otp: otps[emailA], profilePicture: 'file:///data/user/0/x.jpg' });
    check('file:// avatar rejected', r.status === 400, r);
    r = await api('POST', '/signup', { Firstname: 'A', email: emailA, username: 'alice', password: PASSWORD, otp: otps[emailA] });
    check('signup succeeds', r.status === 201 && r.data.token, r);
    const alice = { token: r.data.token, id: String(r.data.user.id) };

    console.info('\nLogin');
    const unknown = await api('POST', '/login', { username: 'nobody', password: PASSWORD });
    const badPw = await api('POST', '/login', { username: 'alice', password: WRONG_PASSWORD });
    check('unknown user and wrong password look identical', unknown.status === 401 && badPw.status === 401 && unknown.data.message === badPw.data.message, [unknown, badPw]);
    r = await api('POST', '/login', { username: { $ne: null }, password: PASSWORD });
    check('query-operator injection in username fails', r.status === 401, r);
    r = await api('POST', '/login', { username: 'alice', password: PASSWORD });
    check('login succeeds', r.status === 200 && r.data.token, r);
    const aliceToken2 = r.data.token;

    console.info('\nTokens and sessions');
    r = await api('GET', '/profile', null, { token: alice.token });
    check('valid token accepted', r.status === 200, r);
    const forged = jwt.sign({ id: alice.id }, JWT_TEST_SECRET, { expiresIn: '1d' });
    r = await api('GET', '/profile', null, { token: forged });
    check('token without a session rejected', r.status === 401, r);
    const forged2 = jwt.sign({ id: alice.id, sid: new mongoose.Types.ObjectId().toString() }, JWT_TEST_SECRET);
    r = await api('GET', '/profile', null, { token: forged2 });
    check('token with unknown session rejected', r.status === 401, r);

    console.info('\nRefresh tokens');
    const Session = require(path.join(ROOT, 'backend/models/session'));
    r = await api('POST', '/login', { username: 'alice', password: PASSWORD });
    const rt1 = r.data.refreshToken;
    check('login returns a refresh token', typeof rt1 === 'string' && rt1.split('.').length === 2, r.data);
    const claims = jwt.decode(r.data.token);
    check('access token lives 15 minutes', claims.exp - claims.iat === 900, claims);
    const expired = jwt.sign({ id: claims.id, sid: claims.sid }, JWT_TEST_SECRET, { expiresIn: -10 });
    r = await api('GET', '/profile', null, { token: expired });
    check('expired access token rejected', r.status === 401, r);
    const storedSession = await Session.findById(claims.sid).lean();
    check('refresh token stored hashed', storedSession.refreshTokenHash && !storedSession.refreshTokenHash.includes(rt1.split('.')[1]), storedSession);
    r = await api('POST', '/refresh', { refreshToken: rt1 });
    check('refresh returns new tokens', r.status === 200 && r.data.token && r.data.refreshToken && r.data.refreshToken !== rt1, r);
    const rt2 = r.data.refreshToken;
    r = await api('GET', '/profile', null, { token: r.data.token });
    check('refreshed access token works', r.status === 200, r);
    r = await api('POST', '/refresh', { refreshToken: rt1 });
    check('just-replaced token accepted once within grace period', r.status === 200, r);
    const rt3 = r.data.refreshToken;
    const parallel = await Promise.all([1, 2, 3, 4, 5].map(() => api('POST', '/refresh', { refreshToken: rt3 })));
    check('parallel refreshes with one token all succeed', parallel.every((x) => x.status === 200), parallel.map((x) => x.status));
    // A phone that loses two refresh responses in a row retries with the same old token.
    r = await api('POST', '/login', { username: 'alice', password: PASSWORD });
    const lostT = r.data.refreshToken;
    await api('POST', '/refresh', { refreshToken: lostT });
    await api('POST', '/refresh', { refreshToken: lostT });
    r = await api('POST', '/refresh', { refreshToken: lostT });
    check('repeated retries with a lost-response token work within grace', r.status === 200, r);
    await Session.updateOne({ _id: claims.sid }, { $set: { rotatedAt: new Date(Date.now() - 5 * 60 * 1000) } });
    const victimSocket = await authSocket(parallel[4].data.token);
    r = await api('POST', '/refresh', { refreshToken: rt2 });
    check('reused old refresh token rejected', r.status === 401, r);
    check('reuse ends the whole session', !(await Session.exists({ _id: claims.sid })));
    r = await api('POST', '/refresh', { refreshToken: parallel[4].data.refreshToken });
    check('latest token also dead after theft detected', r.status === 401, r);
    await sleep(200);
    check('session sockets closed after theft detected', victimSocket.ws.closeCode === 4001, victimSocket.ws.closeCode);
    r = await api('POST', '/refresh', { refreshToken: 'garbage' });
    check('garbage refresh token rejected', r.status === 401, r);

    console.info('\nWebSocket');
    const carol = await signupUser('carol@example.com', 'carol');
    check('second user created', !!carol);
    await Connection.create({
        pairKey: [alice.id, carol.id].sort().join(':'),
        participants: [{ userId: alice.id }, { userId: carol.id }],
        requestedBy: alice.id, requestedTo: carol.id, status: 'accepted',
    });

    const aliceDevice = makeDevice();
    const carolDevice = makeDevice();
    r = await publishKeys(aliceDevice, alice.token);
    check('keys published', r.status === 200 && r.data.oneTimePreKeyCount === 40, r);
    r = await publishKeys(carolDevice, carol.token);

    const anon = await openSocket();
    anon.send(JSON.stringify({ type: 'register', userId: carol.id }));
    anon.send(JSON.stringify({ type: 'send_message', from: carol.id, to: alice.id, envelope: dummyEnvelope(aliceDevice.store.registrationId) }));
    await sleep(300);
    check('old register-by-userId no longer works', anon.inbox.every((m) => m.type === 'error') && !anon.inbox.some((m) => m.type === 'registered'), anon.inbox);
    anon.close();

    const bad = await openSocket();
    bad.send(JSON.stringify({ type: 'auth', token: forged }));
    await sleep(300);
    check('bad token closes socket with 4001', bad.closeCode === 4001, bad.closeCode);

    const a1 = await authSocket(alice.token);
    const a2 = await authSocket(aliceToken2);
    const c1 = await authSocket(carol.token);
    check('valid tokens authenticate', a1.ok && a2.ok && c1.ok);

    a1.ws.send(JSON.stringify({ type: 'send_message', from: carol.id, to: carol.id, envelope: await encryptFor(aliceDevice, alice.token, carol.id, 'hi'), clientId: 'x1' }));
    const got = await waitFor(c1.ws, (m) => m.type === 'new_message');
    check('sender comes from token, not the "from" field', got && got.from === alice.id, got);
    check('recipient decrypts the first (prekey) message', got && got.envelope.type === 'prekey' && (await decryptFrom(carolDevice, alice.id, got.envelope)).text === 'hi', got);

    const toBoth = await encryptFor(carolDevice, carol.token, alice.id, 'to both');
    c1.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, envelope: toBoth }));
    const g1 = await waitFor(a1.ws, (m) => m.type === 'new_message');
    const g2 = await waitFor(a2.ws, (m) => m.type === 'new_message');
    check('all of a user\'s sockets receive messages', g1 && g2 && g1.id === g2.id && g1.envelope.body === toBoth.body);
    check('reply decrypts', g1 && (await decryptFrom(aliceDevice, carol.id, g1.envelope)).text === 'to both');
    a1.ws.close();
    await sleep(200);
    c1.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, envelope: await encryptFor(carolDevice, carol.token, alice.id, 'after close') }));
    const afterClose = await waitFor(a2.ws, (m) => m.type === 'new_message' && m.id !== g2.id);
    check('closing one socket does not orphan the others', afterClose && (await decryptFrom(aliceDevice, carol.id, afterClose.envelope)).text === 'after close');
    // Like the app: acknowledge what was stored so the server drops the ciphertext.
    a2.ws.send(JSON.stringify({ type: 'ack', ids: [g2.id, afterClose.id] }));
    c1.ws.send(JSON.stringify({ type: 'ack', ids: [got.id] }));

    c1.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, envelope: { ...dummyEnvelope(aliceDevice.store.registrationId), body: 'A'.repeat(48 * 1024 + 4) }, clientId: 'big' }));
    check('oversized message rejected', await waitFor(c1.ws, (m) => m.type === 'error' && m.code === 'invalid_envelope' && m.clientId === 'big'));

    console.info('\nLogout');
    r = await api('POST', '/logout', null, { token: aliceToken2 });
    check('logout ok', r.status === 200, r);
    r = await api('GET', '/profile', null, { token: aliceToken2 });
    check('logged-out token rejected', r.status === 401, r);
    await sleep(200);
    check('logged-out session socket closed', a2.ws.closeCode === 4001, a2.ws.closeCode);
    r = await api('GET', '/profile', null, { token: alice.token });
    check('other session unaffected', r.status === 200, r);

    console.info('\nEnd-to-end encryption');
    const KeyBundle = require(path.join(ROOT, 'backend/models/keyBundle'));
    const MessageModel = require(path.join(ROOT, 'backend/models/message'));
    const health = await (await fetch('http://127.0.0.1:18080/api/health')).json();
    check('health reports the minimum app version', /^\d+\.\d+\.\d+$/.test(health.minAppVersion), health);

    const forgedSpk = makeDevice();
    forgedSpk.upload.signedPreKey.signature = makeDevice().upload.signedPreKey.signature;
    r = await keysApi('PUT', '', forgedSpk.upload, { token: alice.token });
    check('signed prekey with a bad signature rejected', r.status === 400, r);
    const forgedDh = makeDevice();
    forgedDh.upload.identityDhKey = makeDevice().upload.identityDhKey;
    r = await keysApi('PUT', '', forgedDh.upload, { token: alice.token });
    check("identity DH key not signed by the identity rejected", r.status === 400, r);
    const sloppy = makeDevice();
    sloppy.upload.identityKey = sloppy.upload.identityKey.replace(/=$/, '');
    r = await keysApi('PUT', '', sloppy.upload, { token: alice.token });
    check('non-canonical base64 rejected', r.status === 400, r);
    r = await keysApi('PUT', '', aliceDevice.upload, {});
    check('key upload needs a session', r.status === 401, r);
    r = await keysApi('GET', '/me', null, { token: alice.token });
    check('own key status reflects this install', r.status === 200 && r.data.registrationId === aliceDevice.store.registrationId, r);

    const frank = await signupUser('frank@example.com', 'frank');
    await publishKeys(makeDevice(), frank.token);
    r = await keysApi('GET', '/' + frank.id, null, { token: alice.token });
    check("strangers can't fetch each other's keys", r.status === 404, r);
    r = await keysApi('GET', '/' + carol.id, null, { token: alice.token });
    let parsedOk = true;
    try { E2E.parsePreKeyBundle(r.data); } catch { parsedOk = false; }
    check('bundle for a connection verifies on the phone', r.status === 200 && parsedOk && r.data.oneTimePreKey, r);
    const before = (await KeyBundle.findOne({ userId: carol.id }).lean()).oneTimePreKeys.length;
    const parallelBundles = await Promise.all(Array.from({ length: 20 }, () => keysApi('GET', '/' + carol.id, null, { token: alice.token })));
    const handedOut = parallelBundles.map((x) => x.data?.oneTimePreKey?.keyId);
    const after = (await KeyBundle.findOne({ userId: carol.id }).lean()).oneTimePreKeys.length;
    check('one-time prekeys never handed out twice under parallel requests', new Set(handedOut).size === 20 && !handedOut.includes(undefined) && before - after === 20, { handedOut, before, after });
    const c2 = await authSocket(carol.token);
    await KeyBundle.updateOne({ userId: carol.id }, { $set: { oneTimePreKeys: [] } });
    r = await keysApi('GET', '/' + carol.id, null, { token: alice.token });
    check('an empty prekey list still gives a usable bundle', r.status === 200 && r.data.oneTimePreKey === null && r.data.signedPreKey, r.data);
    check('owner told when prekeys run low', await waitFor(c2.ws, (m) => m.type === 'prekeys_low' && m.count === 0));
    const topUp = E2E.generateOneTimePreKeys(41, 30).map((k) => ({ keyId: k.keyId, publicKey: b64(k.keyPair.publicKey) }));
    r = await keysApi('POST', '/prekeys', { registrationId: carolDevice.store.registrationId, oneTimePreKeys: topUp }, { token: carol.token });
    check('prekeys topped up', r.status === 200 && r.data.oneTimePreKeyCount === 30, r);
    r = await keysApi('POST', '/prekeys', { registrationId: 12345, oneTimePreKeys: topUp }, { token: carol.token });
    check('top-up from a replaced install refused', r.status === 409, r);
    const carolIdentity = carolDevice.store.identity;
    const spk2 = E2E.generateSignedPreKey(carolIdentity, 2);
    r = await keysApi('PUT', '/signed-prekey', { registrationId: carolDevice.store.registrationId, signedPreKey: { keyId: 2, publicKey: b64(spk2.keyPair.publicKey), signature: b64(spk2.signature) } }, { token: carol.token });
    check('signed prekey rotated', r.status === 200, r);
    carolDevice.store.signedPreKeys.set(2, spk2);
    const notCarols = E2E.generateSignedPreKey(E2E.generateIdentity(), 3);
    r = await keysApi('PUT', '/signed-prekey', { registrationId: carolDevice.store.registrationId, signedPreKey: { keyId: 3, publicKey: b64(notCarols.keyPair.publicKey), signature: b64(notCarols.signature) } }, { token: carol.token });
    check('signed prekey signed by another identity refused', r.status === 400, r);

    c2.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, content: 'plain words', clientId: 'p1' }));
    const plainErr = await waitFor(c2.ws, (m) => m.type === 'error' && m.clientId === 'p1');
    check('plain-text messages refused with update_required', plainErr?.code === 'update_required', plainErr);
    check('refused plain text not stored', !(await MessageModel.exists({ content: 'plain words' })));
    c2.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, envelope: dummyEnvelope(999), clientId: 'stale' }));
    const staleErr = await waitFor(c2.ws, (m) => m.type === 'error' && m.clientId === 'stale');
    check('message for a replaced install refused', staleErr?.code === 'recipient_keys_changed', staleErr);

    // Alice is offline (both sockets closed): messages wait as ciphertext.
    const secrets = ['secret one', 'secret two', 'secret three'];
    const sentIds = [];
    for (const [i, text] of secrets.entries()) {
        c2.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, envelope: await encryptFor(carolDevice, carol.token, alice.id, text), clientId: `s${i}` }));
        const ack = await waitFor(c2.ws, (m) => m.type === 'sent' && m.clientId === `s${i}`);
        sentIds.push(ack?.id);
    }
    check('sender gets server ids for queued messages', sentIds.every(Boolean), sentIds);
    const sentAck = c2.ws.inbox.find((m) => m.type === 'sent' && m.clientId === 's0');
    check('send ack echoes no content', sentAck && sentAck.envelope === undefined && sentAck.content === undefined, sentAck);
    const dump = JSON.stringify(await mongoose.connection.db.collection('messages').find({}).toArray());
    check('database holds no message text', !secrets.some((t) => dump.includes(t)) && !dump.includes('to both'));
    const connDump = JSON.stringify(await mongoose.connection.db.collection('connections').find({}).toArray());
    check('conversations store no preview', !connDump.includes('lastMessagePreview') && !connDump.includes('secret'));
    const queued = await MessageModel.findById(sentIds[0]).lean();
    check('stored as an encrypted envelope', queued.encrypted === true && queued.envelope?.body && queued.content === undefined, queued);

    r = await api('GET', '/messages/pending', null, { token: alice.token });
    const pendingIds = (r.data?.messages || []).map((m) => m.id);
    check('pending queue returns the envelopes oldest first', r.status === 200 && JSON.stringify(pendingIds) === JSON.stringify(sentIds), { pendingIds, sentIds });
    const opened = [];
    for (const m of r.data.messages) opened.push((await decryptFrom(aliceDevice, carol.id, m.envelope)).text);
    check('offline messages decrypt in order', JSON.stringify(opened) === JSON.stringify(secrets), opened);
    r = await api('GET', '/messages/with/' + carol.id, null, { token: alice.token });
    const historyRow = r.data?.messages?.find((m) => m.id === sentIds[0]);
    check('history endpoint returns metadata only', historyRow && historyRow.encrypted === true && historyRow.text === undefined && historyRow.envelope === undefined && historyRow.clientId === undefined, historyRow);
    r = await api('GET', '/messages/with/' + alice.id, null, { token: carol.token });
    check("sender's history carries its client id (to match lost acks)", r.data?.messages?.find((m) => m.id === sentIds[0])?.clientId === 's0', r.data?.messages?.[0]);
    r = await api('POST', '/messages/ack', { ids: sentIds }, { token: carol.token });
    check("can't acknowledge someone else's messages", r.status === 200 && r.data.acknowledged === 0 && (await MessageModel.findById(sentIds[0]).lean()).envelope, r);
    r = await api('POST', '/messages/ack', { ids: sentIds }, { token: alice.token });
    check('ack accepted', r.status === 200 && r.data.acknowledged === 3, r);
    const deliveredIds = new Set();
    for (const id of sentIds) if (await waitFor(c2.ws, (m) => m.type === 'message_status' && m.status === 'delivered' && m.id === id)) deliveredIds.add(id);
    check('sender told each message was delivered', deliveredIds.size === 3, [...deliveredIds]);
    const ackedDoc = await MessageModel.findById(sentIds[0]).lean();
    check('ciphertext deleted from the server after ack', !ackedDoc.envelope && ackedDoc.ackedAt && ackedDoc.deliveredAt, ackedDoc);
    r = await api('GET', '/messages/pending', null, { token: alice.token });
    check('pending queue empty after ack', r.data?.messages?.length === 0, r.data);

    const aLive = await authSocket(alice.token);
    c2.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, envelope: await encryptFor(carolDevice, carol.token, alice.id, 'live one') }));
    const live = await waitFor(aLive.ws, (m) => m.type === 'new_message');
    check('live message decrypts', live && (await decryptFrom(aliceDevice, carol.id, live.envelope)).text === 'live one');
    aLive.ws.send(JSON.stringify({ type: 'ack', ids: [live.id] }));
    check('ack over the socket marks delivered', await waitFor(c2.ws, (m) => m.type === 'message_status' && m.status === 'delivered' && m.id === live.id));
    await sleep(100);
    check('socket ack deletes the ciphertext', !(await MessageModel.findById(live.id).lean()).envelope);

    const pairAC = [alice.id, carol.id].sort().join(':');
    const unreadOf = async (uid) => (await Connection.findOne({ pairKey: pairAC }).lean()).participants.find((p) => String(p.userId) === uid).unreadCount;
    const unreadBefore = await unreadOf(alice.id);
    c2.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, resendOf: sentIds[1], envelope: await encryptFor(carolDevice, carol.token, alice.id, 'secret two', { resendOf: sentIds[1] }) }));
    const resent = await waitFor(aLive.ws, (m) => m.type === 'new_message' && m.resendOf === sentIds[1]);
    check('re-sent message carries what it replaces', !!resent, resent);
    check("a re-send doesn't count as a new unread message", (await unreadOf(alice.id)) === unreadBefore, { before: unreadBefore, after: await unreadOf(alice.id) });
    await decryptFrom(aliceDevice, carol.id, resent.envelope);

    aLive.ws.send(JSON.stringify({ type: 'session_reset', to: carol.id, messageIds: [sentIds[2], live.id, frank.id] }));
    const resetMsg = await waitFor(c2.ws, (m) => m.type === 'session_reset');
    check('session reset reaches the sender with only their message ids', resetMsg && resetMsg.from === alice.id && JSON.stringify(resetMsg.messageIds.sort()) === JSON.stringify([sentIds[2], live.id].sort()), resetMsg);
    r = await api('GET', '/messages/pending', null, { token: carol.token });
    check('reset request also waits in the pending queue', r.data?.resets?.some((x) => x.id === resetMsg?.id), r.data);
    r = await api('POST', '/messages/ack', { resetIds: [resetMsg.id] }, { token: carol.token });
    r = await api('GET', '/messages/pending', null, { token: carol.token });
    check('handled reset removed', r.data?.resets?.length === 0, r.data);

    // Alice reinstalls: new keys. Carol is told, and old-install messages are refused until she refreshes.
    const aliceNewPhone = makeDevice();
    r = await publishKeys(aliceNewPhone, alice.token);
    check('new install replaces the bundle and reports the change', r.status === 200 && r.data.identityChanged === true, r);
    check('connections told about the new keys', await waitFor(c2.ws, (m) => m.type === 'identity_changed' && m.userId === alice.id));
    c2.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, envelope: await encryptFor(carolDevice, carol.token, alice.id, 'to old phone'), clientId: 'old' }));
    check('message to the old install refused', (await waitFor(c2.ws, (m) => m.type === 'error' && m.clientId === 'old'))?.code === 'recipient_keys_changed');
    const rec = await carolDevice.store.getSessionRecord(alice.id);
    await carolDevice.store.commit({ peerId: alice.id, record: E2E.archiveActiveSession(rec) });
    c2.ws.send(JSON.stringify({ type: 'send_message', to: alice.id, envelope: await encryptFor(carolDevice, carol.token, alice.id, 'to new phone'), clientId: 'new' }));
    const toNew = await waitFor(aLive.ws, (m) => m.type === 'new_message' && m.envelope?.recipientRegistrationId === aliceNewPhone.store.registrationId);
    const openedNew = toNew && (await decryptFrom(aliceNewPhone, carol.id, toNew.envelope));
    check('new install decrypts after the sender refreshes keys', openedNew?.text === 'to new phone', openedNew);
    check("new phone sees the contact's key as first seen", openedNew?.identityStatus?.firstSeen === true, openedNew);
    aLive.ws.close();
    c2.ws.close();

    console.info('\nProfile validation');
    r = await api('PUT', '/updateProfile', { socialUrls: { instagram: 'javascript:alert(1)' } }, { token: alice.token });
    check('javascript: link rejected', r.status === 400, r);
    r = await api('PUT', '/updateProfile', { customLinks: [{ id: 'l1', label: 'x', url: 'intent://evil' }] }, { token: alice.token });
    check('intent: custom link rejected', r.status === 400, r);
    r = await api('PUT', '/updateProfile', { profilePicture: 'file:///sdcard/a.jpg' }, { token: alice.token });
    check('file:// profile picture rejected', r.status === 400, r);
    r = await api('PUT', '/updateProfile', { socialUrls: { instagram: 'instagram.com/alice', extra: 'x' }, bio: 'hello', heroData: { text: 'hi', themeId: 't2', customImageUri: '' } }, { token: alice.token });
    check('valid update accepted', r.status === 200 && r.data.user.socialUrls.instagram === 'https://instagram.com/alice' && r.data.user.socialUrls.extra === undefined, r);
    r = await api('GET', '/profile/' + alice.id, null, { token: carol.token });
    check('public profile hides email', r.status === 200 && r.data.email === undefined, r);

    console.info('\nImages');
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString('base64');
    const MEDIA_RE = /^http:\/\/127\.0\.0\.1:18080\/api\/media\/[a-f0-9]{32}$/;

    await api('POST', '/send-signup-otp', { email: 'dave@example.com' });
    r = await api('POST', '/signup', { Firstname: 'D', email: 'dave@example.com', username: 'dave', password: PASSWORD, otp: otps['dave@example.com'], profilePicture: `data:image/png;base64,${PNG}` });
    check('signup stores avatar as a media URL', r.status === 201 && MEDIA_RE.test(r.data.user.profilePicture), r.data?.user);
    const dave = { token: r.data.token, id: String(r.data.user.id), avatar: r.data.user.profilePicture };
    let img = await fetch(dave.avatar);
    const imgBytes = Buffer.from(await img.arrayBuffer());
    check('media URL serves the exact image', img.status === 200 && img.headers.get('content-type') === 'image/png' && imgBytes.equals(Buffer.from(PNG, 'base64')), img.status);
    check('media is cacheable forever', /immutable/.test(img.headers.get('cache-control') || ''));
    check('nosniff header set', img.headers.get('x-content-type-options') === 'nosniff');
    const daveDoc = await User.findById(dave.id).lean();
    check('user document holds a URL, not image data', daveDoc.profilePicture.length < 100, daveDoc.profilePicture.length);

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64');
    r = await api('PUT', '/updateProfile', { profilePicture: `data:image/png;base64,${svg}` }, { token: dave.token });
    check('SVG disguised as PNG rejected', r.status === 400, r);
    const html = Buffer.from('<html><script>alert(1)</script></html>').toString('base64');
    r = await api('PUT', '/updateProfile', { heroData: { text: '', themeId: 't1', customImageUri: `data:image/jpeg;base64,${html}` } }, { token: dave.token });
    check('HTML disguised as JPEG rejected', r.status === 400, r);
    r = await api('PUT', '/updateProfile', { profilePicture: 'https://tracker.example.com/pixel.png' }, { token: dave.token });
    check('third-party image URL rejected', r.status === 400, r);
    r = await api('PUT', '/updateProfile', { profilePicture: dave.avatar }, { token: carol.token });
    check("another user's image can't be reused", r.status === 400, r);
    r = await api('PUT', '/updateProfile', { profilePicture: 'data:image/png;base64,' + Buffer.alloc(6 * 1024 * 1024, 1).toString('base64').slice(0, 100) + '!!' }, { token: dave.token });
    check('malformed image data rejected', r.status === 400, r);

    r = await api('PUT', '/updateProfile', { bio: 'ok', profilePicture: `data:image/jpeg;base64,${JPEG}`, socialUrls: { twitter: 'javascript:x' } }, { token: dave.token });
    const mediaCount = await mongoose.connection.db.collection('media').countDocuments({});
    check('rejected update stores no image', r.status === 400 && mediaCount === 1, { status: r.status, mediaCount });

    r = await api('PUT', '/updateProfile', { profilePicture: `data:image/jpeg;base64,${JPEG}` }, { token: dave.token });
    const newAvatar = r.data?.user?.profilePicture;
    check('avatar update returns a new media URL', r.status === 200 && MEDIA_RE.test(newAvatar) && newAvatar !== dave.avatar, r.data?.user);
    img = await fetch(dave.avatar);
    check('replaced avatar deleted', img.status === 404, img.status);
    img = await fetch(newAvatar);
    check('new avatar served as JPEG', img.status === 200 && img.headers.get('content-type') === 'image/jpeg', img.status);

    r = await api('PUT', '/updateProfile', { heroData: { text: 'hi', themeId: 't1', customImageUri: `data:image/png;base64,${PNG}` } }, { token: dave.token });
    const heroUrl = r.data?.user?.heroData?.customImageUri;
    check('hero image stored as media', r.status === 200 && MEDIA_RE.test(heroUrl), r.data?.user?.heroData);
    r = await api('PUT', '/updateProfile', { heroData: { text: 'edited', themeId: 't2', customImageUri: heroUrl } }, { token: dave.token });
    check('re-saving hero with its own URL keeps the image', r.status === 200 && r.data.user.heroData.customImageUri === heroUrl, r.data?.user?.heroData);

    r = await api('POST', '/follow', { targetUserId: carol.id }, { token: dave.token });
    r = await api('GET', '/notifications', null, { token: carol.token });
    const followNote = r.data?.notifications?.find((n) => n.fromUserId === dave.id);
    check('notifications carry the avatar URL, not image data', followNote && followNote.profilePicture === newAvatar, followNote);

    img = await fetch('http://127.0.0.1:18080/api/media/' + 'a'.repeat(32));
    const img2 = await fetch('http://127.0.0.1:18080/api/media/..%2f..%2fetc');
    check('unknown or malformed media ids give 404', img.status === 404 && img2.status === 404, [img.status, img2.status]);

    // Migration of images stored inline by older versions.
    const legacy = await User.create({ username: 'legacy', email: 'legacy@example.com', password: 'x', profilePicture: `data:image/png;base64,${PNG}`, heroData: { text: '', themeId: 't1', customImageUri: 'file:///data/user/0/img.jpg' } });
    await mongoose.connection.db.collection('notifications').insertOne({ toUserId: new mongoose.Types.ObjectId(carol.id), fromUserId: legacy._id, type: 'follow_request', message: 'm', fromProfilePicture: `data:image/png;base64,${PNG}`, createdAt: new Date() });
    require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'backend/scripts/migrate-images-to-media.js')], {
        env: { ...process.env, PUBLIC_BASE_URL: 'https://api.example.com' }, stdio: 'pipe',
    });
    const migrated = await User.findById(legacy._id).lean();
    check('migration moves inline avatar to media', /^https:\/\/api\.example\.com\/api\/media\/[a-f0-9]{32}$/.test(migrated.profilePicture), migrated.profilePicture);
    check('migration clears file:// hero image', migrated.heroData.customImageUri === '', migrated.heroData);
    const migratedNote = await mongoose.connection.db.collection('notifications').findOne({ fromUserId: legacy._id });
    check('migration updates copied avatars in notifications', migratedNote.fromProfilePicture === migrated.profilePicture, migratedNote.fromProfilePicture);

    console.info('\nUnread badge and relationships');
    await Connection.updateOne(
        { pairKey: [alice.id, carol.id].sort().join(':') },
        { $set: { hasMessages: true, participants: [{ userId: new mongoose.Types.ObjectId(alice.id), unreadCount: 3 }, { userId: new mongoose.Types.ObjectId(carol.id), unreadCount: 0 }] } }
    );
    r = await api('GET', '/messages/unread-count', null, { token: alice.token });
    check('tab badge count reflects unread messages', r.status === 200 && r.data.totalUnread === 3, r);
    r = await api('GET', '/profile/' + carol.id, null, { token: alice.token });
    check('profile reports connected', r.data?.relationship === 'connected', r.data?.relationship);
    r = await api('GET', '/profile/' + alice.id, null, { token: alice.token });
    check('own profile reports self', r.data?.relationship === 'self', r.data?.relationship);
    r = await api('GET', '/profile/' + carol.id, null, { token: dave.token });
    check('sent request reports requested', r.data?.relationship === 'requested', r.data?.relationship);
    r = await api('GET', '/profile/' + dave.id, null, { token: carol.token });
    check('received request reports incoming', r.data?.relationship === 'incoming', r.data?.relationship);
    r = await api('POST', '/follow', { targetUserId: dave.id }, { token: carol.token });
    const conn = await Connection.findOne({ pairKey: [carol.id, dave.id].sort().join(':') }).lean();
    check("following back doesn't overwrite their request", r.data?.relationship === 'incoming' && String(conn.requestedBy) === dave.id, { body: r.data, requestedBy: String(conn.requestedBy) });
    r = await api('GET', '/search-users?query=' + 'ca', null, { token: dave.token });
    const carolRow = r.data?.users?.find((u) => u.id === carol.id);
    check('search results include relationship', carolRow?.relationship === 'requested', carolRow);
    r = await api('GET', '/search-users?query=' + 'dav', null, { token: dave.token });
    check('search marks yourself', r.data?.users?.find((u) => u.id === dave.id)?.relationship === 'self', r.data);

    console.info('\nSignup privacy');
    const newcomer = await api('POST', '/send-signup-otp', { email: 'newcomer@example.com' });
    const taken = await api('POST', '/send-signup-otp', { email: emailA });
    check('same response for new and registered emails', newcomer.status === 200 && taken.status === 200 && newcomer.data.message === taken.data.message, [newcomer.data, taken.data]);
    check('registered email gets a notice, not a code', emailLog.some((l) => l.includes(`Account-exists notice for ${emailA}`)));
    r = await api('POST', '/send-signup-otp', { email: emailA });
    check('cooldown applies to registered emails too', r.status === 429, r);

    console.info('\nBlock');
    const Block = require(path.join(ROOT, 'backend/models/block'));
    r = await api('POST', '/users/block', { targetUserId: alice.id }, { token: carol.token });
    check('block succeeds', r.status === 200 && r.data.relationship === 'blocked', r);
    check('block removes the connection', !(await Connection.exists({ pairKey: [alice.id, carol.id].sort().join(':') })));
    // (The inbox lists accepted connections only; FerretDB can't run its $lookup, so it isn't called here.)
    r = await keysApi('GET', '/' + carol.id, null, { token: alice.token });
    check("blocked user can't fetch the blocker's keys", r.status === 404, r);
    const aliceWs = await authSocket(alice.token);
    aliceWs.ws.send(JSON.stringify({ type: 'send_message', to: carol.id, envelope: dummyEnvelope(carolDevice.store.registrationId), clientId: 'tmp_1' }));
    const sendErr = await waitFor(aliceWs.ws, (m) => m.type === 'error');
    check('message to blocker fails with its client id', sendErr && sendErr.clientId === 'tmp_1', sendErr);
    r = await api('GET', '/profile/' + carol.id, null, { token: alice.token });
    check("blocked user can't see blocker's profile", r.status === 404, r.status);
    r = await api('GET', '/profile/' + alice.id, null, { token: carol.token });
    check('blocker sees relationship blocked', r.data?.relationship === 'blocked', r.data?.relationship);
    r = await api('GET', '/search-users?query=carol', null, { token: alice.token });
    check("blocker hidden from blocked user's search", !r.data.users.some((u) => u.id === carol.id), r.data);
    r = await api('GET', '/search-users?query=alice', null, { token: carol.token });
    check('blocked user visible to blocker as blocked', r.data.users.find((u) => u.id === alice.id)?.relationship === 'blocked', r.data);
    r = await api('POST', '/follow', { targetUserId: carol.id }, { token: alice.token });
    check("blocked user can't send a follow request", r.status === 403, r);
    r = await api('GET', '/users/blocked', null, { token: carol.token });
    check('blocked list shows the user', r.data?.users?.length === 1 && r.data.users[0].id === alice.id, r.data);
    r = await api('POST', '/users/unblock', { targetUserId: alice.id }, { token: carol.token });
    check('unblock succeeds', r.status === 200 && !(await Block.exists({ blockerId: carol.id })), r);

    console.info('\nReports');
    r = await api('POST', '/reports', { targetUserId: carol.id, reason: 'harassment', details: '<b>rude</b>' }, { token: alice.token });
    check('report stored', r.status === 201, r);
    check('moderator emailed', emailLog.some((l) => l.includes('moderator@example.com') && l.includes('harassment')), emailLog.slice(-2));
    r = await api('POST', '/reports', { targetUserId: carol.id, reason: 'nope' }, { token: alice.token });
    check('invalid reason rejected', r.status === 400, r);
    r = await api('POST', '/reports', { targetUserId: alice.id, reason: 'spam' }, { token: alice.token });
    check("can't report yourself", r.status === 400, r);
    for (let i = 0; i < 19; i++) await api('POST', '/reports', { targetUserId: carol.id, reason: 'spam' }, { token: alice.token });
    r = await api('POST', '/reports', { targetUserId: carol.id, reason: 'spam' }, { token: alice.token });
    check('21st report in a day rejected', r.status === 429, r);

    console.info('\nPush notifications');
    r = await api('POST', '/push-token', { token: 'not-a-token' }, { token: carol.token });
    check('invalid push token rejected', r.status === 400, r);
    r = await api('POST', '/push-token', { token: 'ExponentPushToken[carolphone]' }, { token: carol.token });
    check('push token registered', r.status === 200, r);
    pushes.length = 0;
    await api('POST', '/follow', { targetUserId: carol.id }, { token: alice.token });
    await sleep(300);
    check('follow request pushed', pushes.some((p) => p.to === 'ExponentPushToken[carolphone]' && /alice/.test(p.body) && p.data.type === 'notifications'), pushes);
    await Connection.updateOne(
        { pairKey: [alice.id, carol.id].sort().join(':') },
        { $set: { status: 'accepted', participants: [{ userId: new mongoose.Types.ObjectId(alice.id) }, { userId: new mongoose.Types.ObjectId(carol.id) }] } }
    );
    pushes.length = 0;
    aliceWs.ws.send(JSON.stringify({ type: 'send_message', to: carol.id, envelope: await encryptFor(aliceNewPhone, alice.token, carol.id, 'top secret plan'), clientId: 'tmp_2' }));
    await waitFor(aliceWs.ws, (m) => m.type === 'sent');
    await sleep(300);
    const msgPush = pushes.find((p) => p.to === 'ExponentPushToken[carolphone]');
    check('new message pushed', msgPush && msgPush.title === 'alice' && msgPush.data.peerId === alice.id, pushes);
    check('push never contains message text', pushes.length > 0 && !JSON.stringify(pushes).includes('top secret'), pushes);
    r = await api('POST', '/push-token', { token: 'ExponentPushToken[carolphone]' }, { token: dave.token });
    check('token moves to the account now signed in on the device', !(await Session.exists({ userId: carol.id, pushToken: 'ExponentPushToken[carolphone]' })));
    pushTicketsFor = (m) => (m.to === 'ExponentPushToken[carolphone]' ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : null);
    await api('POST', '/follow', { targetUserId: dave.id }, { token: alice.token });
    await sleep(300);
    check('uninstalled device token cleared', !(await Session.exists({ pushToken: 'ExponentPushToken[carolphone]' })));
    pushTicketsFor = () => null;

    console.info('\nAccount deletion');
    await api('POST', '/send-signup-otp', { email: 'erin@example.com' });
    r = await api('POST', '/signup', { Firstname: 'E', email: 'erin@example.com', username: 'erin', password: PASSWORD, otp: otps['erin@example.com'], profilePicture: `data:image/png;base64,${PNG}` });
    const erin = { token: r.data.token, id: String(r.data.user.id), avatar: r.data.user.profilePicture };
    await Connection.create({ pairKey: [erin.id, carol.id].sort().join(':'), participants: [{ userId: erin.id }, { userId: carol.id }], requestedBy: erin.id, requestedTo: carol.id, status: 'accepted' });
    const erinDevice = makeDevice();
    await publishKeys(erinDevice, erin.token);
    const erinWs = await authSocket(erin.token);
    erinWs.ws.send(JSON.stringify({ type: 'send_message', to: carol.id, envelope: await encryptFor(erinDevice, erin.token, carol.id, 'bye'), clientId: 'e1' }));
    await waitFor(erinWs.ws, (m) => m.type === 'sent');
    await api('POST', '/follow', { targetUserId: dave.id }, { token: erin.token });
    r = await api('DELETE', '/account', { password: WRONG_PASSWORD }, { token: erin.token });
    check('wrong password refused with 403 (not 401)', r.status === 403, r);
    r = await api('DELETE', '/account', { password: PASSWORD }, { token: erin.token });
    check('account deleted', r.status === 200, r);
    const NotificationModel = require(path.join(ROOT, 'backend/models/notification'));
    const leftovers = {
        user: await User.exists({ _id: erin.id }),
        sessions: await Session.exists({ userId: erin.id }),
        messages: await MessageModel.exists({ participants: erin.id }),
        connections: await Connection.exists({ 'participants.userId': erin.id }),
        notifications: await NotificationModel.exists({ $or: [{ toUserId: erin.id }, { fromUserId: erin.id }] }),
        media: await mongoose.connection.db.collection('media').countDocuments({ ownerId: new mongoose.Types.ObjectId(erin.id) }),
        keys: await KeyBundle.exists({ userId: erin.id }),
    };
    check('all of the account data is gone', Object.values(leftovers).every((v) => !v), leftovers);
    img = await fetch(erin.avatar);
    check('deleted account avatar no longer served', img.status === 404, img.status);
    r = await api('GET', '/profile', null, { token: erin.token });
    check('deleted account token rejected', r.status === 401, r);
    await sleep(200);
    check('deleted account sockets closed', erinWs.ws.closeCode === 4001, erinWs.ws.closeCode);
    r = await api('POST', '/login', { username: 'erin', password: PASSWORD });
    check("deleted account can't log in", r.status === 401, r);

    console.info('\nErrors');
    const badJson = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': freshIp() }, body: '{oops' });
    check('invalid JSON gets a JSON 400', badJson.status === 400 && (await badJson.json()).message === 'Invalid JSON', badJson.status);
    r = await api('POST', '/messages/send', { toUserId: carol.id, content: 'x' }, { token: alice.token });
    check('removed REST send route is gone (JSON 404)', r.status === 404 && r.data?.message === 'Not found', r);

    console.info('\nPassword reset');
    r = await api('POST', '/forgot-password', { email: 'ghost@example.com' });
    const known = await api('POST', '/forgot-password', { email: emailA });
    check('same response for unknown and known email', r.status === 200 && known.status === 200 && r.data.message === known.data.message, [r, known]);
    const resetCode = otps[emailA];
    const stored = await User.findOne({ email: emailA }).lean();
    check('reset code stored hashed', stored.resetOtpHash && stored.resetOtpHash !== resetCode && stored.resetOtp === undefined, stored.resetOtpHash);
    r = await api('POST', '/reset-password', { email: emailA, otp: resetCode, newPassword: WEAK_PASSWORD });
    check('weak new password rejected', r.status === 400, r);
    const wrongR = resetCode === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) await api('POST', '/reset-password', { email: emailA, otp: wrongR, newPassword: NEW_PASSWORD });
    r = await api('POST', '/reset-password', { email: emailA, otp: resetCode, newPassword: NEW_PASSWORD });
    check('reset code dead after 5 wrong guesses', r.status === 400, r);

    await User.updateOne({ email: emailA }, { $set: { resetOtpSentAt: new Date(0) } }); // skip the 60s cooldown
    const a3 = await authSocket(alice.token);
    await api('POST', '/forgot-password', { email: emailA });
    r = await api('POST', '/reset-password', { email: emailA, otp: otps[emailA], newPassword: NEW_PASSWORD });
    check('reset succeeds with fresh code', r.status === 200, r);
    r = await api('GET', '/profile', null, { token: alice.token });
    check('all old sessions revoked after reset', r.status === 401, r);
    await sleep(200);
    check('old sockets closed after reset', a3.ws.closeCode === 4001, a3.ws.closeCode);
    r = await api('POST', '/login', { username: 'alice', password: NEW_PASSWORD });
    check('login with new password', r.status === 200, r);

    console.info('\nRate limit');
    const ip = '203.0.113.9';
    let last;
    for (let i = 0; i < 31; i++) last = await api('POST', '/login', { username: 'alice', password: WRONG_PASSWORD }, { ip });
    check('31st credential request from one IP gets 429', last.status === 429, last.status);

    console.info(`\n${passed} passed, ${failed} failed`);
    c1.ws.close();
    await mongoose.connection.db.dropDatabase();
    process.exit(failed ? 1 : 0);
})().catch((e) => { origError(e); process.exit(1); });
