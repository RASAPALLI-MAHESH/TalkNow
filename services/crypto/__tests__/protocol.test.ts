/* Run with: npm run test:crypto */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fromB64, toB64, utf8Decode, utf8Encode } from '../encoding';
import { E2EEError } from '../errors';
import {
    PreKeyBundleJson,
    generateIdentity,
    generateOneTimePreKeys,
    generateRegistrationId,
    generateSignedPreKey,
    identityId,
    parsePreKeyBundle,
    publicIdentityOf,
} from '../identity';
import { MemorySignalStore } from '../memoryStore';
import { KeyedMutex } from '../mutex';
import { compareScannedSafetyNumber, computeSafetyNumber } from '../safetyNumber';
import { Envelope, archiveActiveSession, decryptMessage, encryptMessage, startSession } from '../sessionCipher';
import { emptyRecord } from '../store';

type Party = { id: string; store: MemorySignalStore; nextOpk: number };

const makeParty = (id: string, opkCount = 5): Party => {
    const identity = generateIdentity();
    const store = new MemorySignalStore(identity, generateRegistrationId());
    const spk = generateSignedPreKey(identity, 1);
    store.signedPreKeys.set(spk.keyId, spk);
    for (const k of generateOneTimePreKeys(1, opkCount)) store.oneTimePreKeys.set(k.keyId, k);
    return { id, store, nextOpk: 1 };
};

// What the server would return: the newest signed prekey and one one-time prekey, removed on hand-out.
const bundleJson = (p: Party, withOpk = true): PreKeyBundleJson => {
    const identity = p.store.identity;
    const spk = [...p.store.signedPreKeys.values()].at(-1)!;
    let oneTimePreKey = null;
    if (withOpk) {
        while (p.nextOpk <= 100 && !p.store.oneTimePreKeys.has(p.nextOpk)) p.nextOpk++;
        const opk = p.store.oneTimePreKeys.get(p.nextOpk);
        if (opk) oneTimePreKey = { keyId: opk.keyId, publicKey: toB64(opk.keyPair.publicKey) };
        p.nextOpk++;
    }
    return {
        registrationId: p.store.registrationId,
        identityKey: toB64(identity.signing.publicKey),
        identityDhKey: toB64(identity.dh.publicKey),
        identityDhSignature: toB64(identity.dhSignature),
        signedPreKey: { keyId: spk.keyId, publicKey: toB64(spk.keyPair.publicKey), signature: toB64(spk.signature) },
        oneTimePreKey,
    };
};

const send = async (from: Party, to: Party, text: string, { withOpk = true } = {}): Promise<Envelope> => {
    let record = (await from.store.getSessionRecord(to.id)) ?? emptyRecord();
    if (!record.active) {
        const started = await startSession(from.store, to.id, parsePreKeyBundle(bundleJson(to, withOpk)));
        record = started.record;
        await from.store.commit({ peerId: to.id, record, remoteIdentity: started.remoteIdentity });
    }
    const { envelope, commit } = await encryptMessage(from.store, to.id, record, { v: 1, type: 'text', text });
    await from.store.commit(commit);
    return envelope;
};

const receive = async (to: Party, from: Party, envelope: Envelope) => {
    const result = await decryptMessage(to.store, from.id, envelope);
    await to.store.commit(result.commit);
    assert.equal(result.payload?.type, 'text');
    return { text: result.payload!.text, result };
};

const expectCode = async (promise: Promise<unknown>, code: string) => {
    await assert.rejects(promise, (err: unknown) => err instanceof E2EEError && err.code === code);
};

describe('encoding', () => {
    test('UTF-8 round-trips emoji, CJK and combining marks', () => {
        const text = 'héllo 👋🏽 世界 é ok\n\t"quotes"';
        assert.equal(utf8Decode(utf8Encode(text)), text);
        assert.deepEqual([...utf8Encode('€')], [0xe2, 0x82, 0xac]);
    });

    test('UTF-8 decoder rejects overlong and truncated input', () => {
        assert.throws(() => utf8Decode(new Uint8Array([0xc0, 0xaf])));
        assert.throws(() => utf8Decode(new Uint8Array([0xe2, 0x82])));
        assert.throws(() => utf8Decode(new Uint8Array([0xed, 0xa0, 0x80])));
    });

    test('lone surrogates become U+FFFD instead of corrupting the output', () => {
        assert.equal(utf8Decode(utf8Encode('a\ud800b')), 'a�b');
    });
});

describe('bundles', () => {
    test('a valid bundle parses', () => {
        const bob = makeParty('bob');
        const bundle = parsePreKeyBundle(bundleJson(bob));
        assert.equal(bundle.registrationId, bob.store.registrationId);
        assert.ok(bundle.oneTimePreKey);
    });

    test('a signed prekey signed by someone else is rejected', () => {
        const bob = makeParty('bob');
        const mallory = makeParty('mallory');
        const forged = { ...bundleJson(bob), signedPreKey: bundleJson(mallory).signedPreKey };
        assert.throws(() => parsePreKeyBundle(forged), (e: unknown) => e instanceof E2EEError && e.code === 'invalid_bundle');
    });

    test("swapping in another identity's DH key is rejected", () => {
        const bob = makeParty('bob');
        const mallory = makeParty('mallory');
        const forged = { ...bundleJson(bob), identityDhKey: toB64(mallory.store.identity.dh.publicKey) };
        assert.throws(() => parsePreKeyBundle(forged));
    });

    test('garbage fields are rejected, not thrown as raw errors', () => {
        const bob = makeParty('bob');
        assert.throws(() => parsePreKeyBundle({ ...bundleJson(bob), identityKey: '!!!' }), E2EEError);
        assert.throws(() => parsePreKeyBundle({ ...bundleJson(bob), registrationId: 0 }), E2EEError);
    });
});

describe('sessions', () => {
    test('two people exchange messages in both directions', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');

        const first = await send(alice, bob, 'hi bob');
        assert.equal(first.type, 'prekey');
        assert.equal(first.recipientRegistrationId, bob.store.registrationId);
        assert.equal((await receive(bob, alice, first)).text, 'hi bob');

        const reply = await send(bob, alice, 'hi alice');
        assert.equal(reply.type, 'whisper');
        assert.equal((await receive(alice, bob, reply)).text, 'hi alice');

        // Alice saw a reply, so she stops attaching the X3DH header.
        const next = await send(alice, bob, 'how are you?');
        assert.equal(next.type, 'whisper');
        assert.equal((await receive(bob, alice, next)).text, 'how are you?');

        for (let i = 0; i < 20; i++) {
            const [from, to] = i % 3 === 0 ? [bob, alice] : [alice, bob];
            const env = await send(from, to, `msg ${i}`);
            assert.equal((await receive(to, from, env)).text, `msg ${i}`);
        }
    });

    test('the used one-time prekey is deleted on the receiving phone', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        const env = await send(alice, bob, 'x');
        const { result } = await receive(bob, alice, env);
        assert.equal(result.commit.consumedOneTimePreKeyId, 1);
        assert.equal(bob.store.oneTimePreKeys.has(1), false);
    });

    test('works without a one-time prekey (the server ran out)', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob', 0);
        const env = await send(alice, bob, 'no opk', { withOpk: false });
        assert.equal((await receive(bob, alice, env)).text, 'no opk');
        const back = await send(bob, alice, 'still fine');
        assert.equal((await receive(alice, bob, back)).text, 'still fine');
    });

    test('ciphertext contains no plain text and hides the exact length', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        await receive(bob, alice, await send(alice, bob, 'warm up'));
        await receive(alice, bob, await send(bob, alice, 'ok'));
        const secret = 'the launch code is 0000';
        const env = await send(alice, bob, secret);
        const raw = fromB64(env.body);
        assert.equal(Buffer.from(raw).includes(Buffer.from(secret)), false);
        assert.equal(env.body.includes(secret), false);
        const short = fromB64((await send(alice, bob, 'a')).body).length;
        const longer = fromB64((await send(alice, bob, 'abcdefghij')).body).length;
        assert.equal(short, longer);
    });

    test('messages arriving out of order, across ratchet steps, all decrypt', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        await receive(bob, alice, await send(alice, bob, 'start'));

        const batch1 = [await send(bob, alice, 'b1'), await send(bob, alice, 'b2'), await send(bob, alice, 'b3')];
        assert.equal((await receive(alice, bob, batch1[2])).text, 'b3');
        const a1 = await send(alice, bob, 'a1');
        assert.equal((await receive(bob, alice, a1)).text, 'a1');
        const batch2 = [await send(bob, alice, 'c1'), await send(bob, alice, 'c2')];
        assert.equal((await receive(alice, bob, batch2[1])).text, 'c2');
        // The late ones from the previous chain still open from stored skipped keys.
        assert.equal((await receive(alice, bob, batch1[0])).text, 'b1');
        assert.equal((await receive(alice, bob, batch2[0])).text, 'c1');
        assert.equal((await receive(alice, bob, batch1[1])).text, 'b2');
        const record = await alice.store.getSessionRecord('bob');
        assert.equal(record!.active!.ratchet.skipped.length, 0, 'used skipped keys are deleted');
    });

    test('a replayed message is refused and does not break the session', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        await receive(bob, alice, await send(alice, bob, 'start'));
        const env = await send(bob, alice, 'once');
        await receive(alice, bob, env);
        await expectCode(decryptMessage(alice.store, 'bob', env), 'duplicate_message');
        assert.equal((await receive(alice, bob, await send(bob, alice, 'after'))).text, 'after');
    });

    test('a replayed first message is refused after its one-time prekey is gone', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        const first = await send(alice, bob, 'first');
        await receive(bob, alice, first);
        await expectCode(decryptMessage(bob.store, 'alice', first), 'duplicate_message');
        // Replayed on a fresh install of Bob's that never saw it: the one-time key is unknown.
        bob.store.sessions.clear();
        await expectCode(decryptMessage(bob.store, 'alice', first), 'unknown_one_time_prekey');
    });

    test('tampered messages fail and leave the session usable', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        await receive(bob, alice, await send(alice, bob, 'start'));
        const env = await send(bob, alice, 'real');
        const bytes = fromB64(env.body);

        for (const index of [1, 20, 40, bytes.length - 1]) {
            const t = bytes.slice();
            t[index] ^= 0x01;
            await assert.rejects(decryptMessage(alice.store, 'bob', { ...env, body: toB64(t) }), E2EEError);
        }
        assert.equal((await receive(alice, bob, env)).text, 'real');
    });

    test('a tampered prekey message (identity or base key) fails', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        const mallory = makeParty('mallory');
        const env = await send(alice, bob, 'hello');
        const bytes = fromB64(env.body);

        const swappedBase = bytes.slice();
        swappedBase[1 + 128 + 3] ^= 0xff;
        await assert.rejects(decryptMessage(bob.store, 'alice', { ...env, body: toB64(swappedBase) }), E2EEError);

        // Mallory's (validly bound) identity in Alice's message: X3DH gives a different key.
        const id = publicIdentityOf(mallory.store.identity);
        const swappedId = bytes.slice();
        swappedId.set(id.signingKey, 1);
        swappedId.set(id.dhKey, 33);
        swappedId.set(id.dhSignature, 65);
        await assert.rejects(decryptMessage(bob.store, 'alice', { ...env, body: toB64(swappedId) }), E2EEError);

        assert.equal((await receive(bob, alice, env)).text, 'hello', 'the real message still opens');
    });

    test('lost first messages: a later prekey message still starts the session', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        await send(alice, bob, 'lost 1');
        await send(alice, bob, 'lost 2');
        const third = await send(alice, bob, 'arrives');
        assert.equal(third.type, 'prekey');
        assert.equal((await receive(bob, alice, third)).text, 'arrives');
    });

    test('later prekey messages of the same session reuse it instead of starting another', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        const one = await send(alice, bob, 'one');
        const two = await send(alice, bob, 'two');
        await receive(bob, alice, one);
        assert.equal((await receive(bob, alice, two)).text, 'two');
        const record = await bob.store.getSessionRecord('alice');
        assert.equal(record!.archived.length, 0);
    });

    test('both people starting at once ends with one working conversation', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        const fromAlice = await send(alice, bob, 'hi from alice');
        const fromBob = await send(bob, alice, 'hi from bob');
        assert.equal((await receive(bob, alice, fromAlice)).text, 'hi from alice');
        assert.equal((await receive(alice, bob, fromBob)).text, 'hi from bob');
        for (let i = 0; i < 6; i++) {
            const [from, to] = i % 2 ? [bob, alice] : [alice, bob];
            assert.equal((await receive(to, from, await send(from, to, `after ${i}`))).text, `after ${i}`);
        }
    });

    test('a gap larger than the limit is refused', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        await receive(bob, alice, await send(alice, bob, 'start'));
        const record = (await bob.store.getSessionRecord('alice'))!;
        const env = await send(bob, alice, 'x');
        const bytes = fromB64(env.body);
        // Rewrite the header counter to 5000; the tag check would fail anyway, but the skip check comes first.
        new DataView(bytes.buffer).setUint32(1 + 32 + 4, 5000);
        await expectCode(decryptMessage(alice.store, 'bob', { ...env, body: toB64(bytes) }), 'too_many_skipped');
        assert.ok(record);
    });

    test('whisper without any session gives no_session', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        await receive(bob, alice, await send(alice, bob, 'start'));
        const env = await send(bob, alice, 'x');
        alice.store.sessions.clear();
        await expectCode(decryptMessage(alice.store, 'bob', env), 'no_session');
    });

    test('after archiving, the next message starts a new session and late ones still open', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        await receive(bob, alice, await send(alice, bob, 'start'));
        await receive(alice, bob, await send(bob, alice, 'ok'));
        const late = await send(bob, alice, 'late');

        const rec = (await alice.store.getSessionRecord('bob'))!;
        await alice.store.commit({ peerId: 'bob', record: archiveActiveSession(rec) });
        const fresh = await send(alice, bob, 'fresh session');
        assert.equal(fresh.type, 'prekey');
        assert.equal((await receive(bob, alice, fresh)).text, 'fresh session');
        assert.equal((await receive(alice, bob, late)).text, 'late');
    });

    test('a contact reinstalling is reported as an identity change', async () => {
        const alice = makeParty('alice');
        let bob = makeParty('bob');
        await receive(bob, alice, await send(alice, bob, 'start'));
        const { result } = await receive(alice, bob, await send(bob, alice, 'ok'));
        assert.equal(result.identityStatus.changed, false);

        // Alice verified Bob's safety number, then Bob reinstalls (new keys) and writes first.
        alice.store.trusted.set('bob', { ...alice.store.trusted.get('bob')!, verified: true });
        bob = makeParty('bob');
        const env = await send(bob, alice, 'new phone');
        const r2 = await receive(alice, bob, env);
        assert.equal(r2.text, 'new phone');
        assert.deepEqual(r2.result.identityStatus, { firstSeen: false, changed: true, wasVerified: true });
        const trust = alice.store.trusted.get('bob')!;
        assert.equal(trust.identity, identityId(publicIdentityOf(bob.store.identity)));
        assert.equal(trust.verified, false);
        assert.equal(trust.needsAck, true);
    });

    test('startSession reports a changed identity before anything is sent', async () => {
        const alice = makeParty('alice');
        let bob = makeParty('bob');
        await receive(bob, alice, await send(alice, bob, 'start'));
        bob = makeParty('bob');
        const started = await startSession(alice.store, 'bob', parsePreKeyBundle(bundleJson(bob)));
        assert.equal(started.identityStatus.changed, true);
    });

    test('a message for another install fails to decrypt', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        const otherBob = makeParty('bob');
        const env = await send(alice, bob, 'for the first phone');
        await assert.rejects(decryptMessage(otherBob.store, 'alice', env), E2EEError);
        assert.notEqual(env.recipientRegistrationId, otherBob.store.registrationId);
    });

    test('long messages round-trip', async () => {
        const alice = makeParty('alice');
        const bob = makeParty('bob');
        const text = '🙂'.repeat(4000);
        assert.equal((await receive(bob, alice, await send(alice, bob, text))).text, text);
    });
});

describe('safety numbers', () => {
    const idA = identityId(publicIdentityOf(generateIdentity()));
    const idB = identityId(publicIdentityOf(generateIdentity()));

    test('both people see the same 60 digits', () => {
        const a = computeSafetyNumber('userA', idA, 'userB', idB);
        const b = computeSafetyNumber('userB', idB, 'userA', idA);
        assert.equal(a.digits, b.digits);
        assert.match(a.digits, /^\d{60}$/);
        assert.equal(a.groups.length, 12);
    });

    test('a different key gives a different number', () => {
        const idC = identityId(publicIdentityOf(generateIdentity()));
        assert.notEqual(computeSafetyNumber('userA', idA, 'userB', idB).digits, computeSafetyNumber('userA', idA, 'userB', idC).digits);
    });

    test("scanning the contact's QR matches; a swapped key does not", () => {
        const a = computeSafetyNumber('userA', idA, 'userB', idB);
        const b = computeSafetyNumber('userB', idB, 'userA', idA);
        assert.equal(compareScannedSafetyNumber(a, b.qrPayload), 'match');
        const idC = identityId(publicIdentityOf(generateIdentity()));
        const mitm = computeSafetyNumber('userB', idC, 'userA', idA);
        assert.equal(compareScannedSafetyNumber(a, mitm.qrPayload), 'mismatch');
        assert.equal(compareScannedSafetyNumber(a, 'https://example.com'), 'invalid');
        assert.equal(compareScannedSafetyNumber(a, a.qrPayload), 'mismatch', "scanning your own code isn't a match");
    });
});

describe('KeyedMutex', () => {
    test('runs same-key tasks one at a time and keeps going after a failure', async () => {
        const mutex = new KeyedMutex();
        const order: string[] = [];
        const slow = (name: string, ms: number, fail = false) => () =>
            new Promise<string>((resolve, reject) =>
                setTimeout(() => {
                    order.push(name);
                    if (fail) reject(new Error(name));
                    else resolve(name);
                }, ms)
            );
        const results = await Promise.allSettled([
            mutex.run('peer', slow('a', 30)),
            mutex.run('peer', slow('b', 1, true)),
            mutex.run('peer', slow('c', 1)),
            mutex.run('other', slow('x', 5)),
        ]);
        assert.deepEqual(order, ['x', 'a', 'b', 'c']);
        assert.equal(results[1].status, 'rejected');
        assert.equal(results[2].status, 'fulfilled');
    });
});
