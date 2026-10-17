/*
  Keeps this install's public keys on the server: first-launch generation and upload,
  one-time prekey top-ups and signed prekey rotation. TalkNow is single-device: if
  another install of this account published keys since, signing in here takes over.
*/
import {
    OneTimePreKey,
    generateIdentity,
    generateOneTimePreKeys,
    generateRegistrationId,
    generateSignedPreKey,
    MAX_KEY_ID,
    toB64,
} from '../crypto';
import { KeyUploadDto, addOneTimePreKeys, getOwnKeyStatus, rotateSignedPreKey, uploadKeys } from '../AuthService';
import { LocalStore } from './localStore';

const PREKEY_BATCH = 100;
const PREKEY_LOW = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNED_PREKEY_MAX_AGE_MS = 30 * DAY_MS;
// Old private keys are kept a while so messages already on their way can still be read.
const OLD_SIGNED_PREKEY_KEEP_MS = 30 * DAY_MS;
const OLD_ONE_TIME_PREKEY_KEEP_MS = 30 * DAY_MS;

const nextId = (n: number) => (n % MAX_KEY_ID) + 1;
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Pure-JS key generation is slow on Hermes: make keys in small batches so the UI keeps moving.
const makeOneTimePreKeys = async (startId: number, count: number): Promise<OneTimePreKey[]> => {
    const keys: OneTimePreKey[] = [];
    let id = startId;
    while (keys.length < count) {
        const chunk = generateOneTimePreKeys(id, Math.min(10, count - keys.length));
        keys.push(...chunk);
        id = nextId(chunk[chunk.length - 1].keyId);
        await yieldToUi();
    }
    return keys;
};

const publicPreKeys = (keys: OneTimePreKey[]) => keys.map((k) => ({ keyId: k.keyId, publicKey: toB64(k.keyPair.publicKey) }));

const allocatePreKeys = async (store: LocalStore, count: number) => {
    const start = Number((await store.getMeta('next_prekey_id')) ?? '1');
    const keys = await makeOneTimePreKeys(start, count);
    const next = nextId(keys[keys.length - 1].keyId);
    await store.write(async (w) => {
        await w.saveOneTimePreKeys(keys);
        await w.setMeta('next_prekey_id', String(next));
    });
    return keys;
};

const createInstall = async (store: LocalStore) => {
    const identity = generateIdentity();
    const registrationId = generateRegistrationId();
    const signedPreKey = generateSignedPreKey(identity, 1);
    await store.createIdentity(identity, registrationId, async (w) => {
        await w.saveSignedPreKey(signedPreKey);
        await w.setMeta('next_signed_prekey_id', '2');
        await w.setMeta('next_prekey_id', '1');
    });
};

const publishFullBundle = async (store: LocalStore) => {
    const identity = await store.getIdentity();
    const registrationId = await store.getRegistrationId();
    const signedPreKey = await store.getCurrentSignedPreKey();
    if (!signedPreKey) throw new Error('No signed prekey');
    // Fresh one-time prekeys: ones published before may already have been handed out.
    const startedAt = Date.now();
    const preKeys = await allocatePreKeys(store, PREKEY_BATCH);
    const bundle: KeyUploadDto = {
        registrationId,
        identityKey: toB64(identity.signing.publicKey),
        identityDhKey: toB64(identity.dh.publicKey),
        identityDhSignature: toB64(identity.dhSignature),
        signedPreKey: { keyId: signedPreKey.keyId, publicKey: toB64(signedPreKey.keyPair.publicKey), signature: toB64(signedPreKey.signature) },
        oneTimePreKeys: publicPreKeys(preKeys),
    };
    await uploadKeys(bundle);
    // Every one-time prekey created before this upload is no longer on the server.
    await store.write((w) => w.setMeta('full_publish_at', String(startedAt)));
};

const rotateIfOld = async (store: LocalStore, now: number) => {
    const current = await store.getCurrentSignedPreKey();
    if (current && now - current.createdAt < SIGNED_PREKEY_MAX_AGE_MS) return;
    const identity = await store.getIdentity();
    const keyId = Number((await store.getMeta('next_signed_prekey_id')) ?? '2');
    const fresh = generateSignedPreKey(identity, keyId, now);
    await store.write(async (w) => {
        await w.saveSignedPreKey(fresh);
        await w.setMeta('next_signed_prekey_id', String(nextId(keyId)));
    });
    await rotateSignedPreKey(await store.getRegistrationId(), {
        keyId: fresh.keyId,
        publicKey: toB64(fresh.keyPair.publicKey),
        signature: toB64(fresh.signature),
    });
    await store.write((w) => w.deleteSignedPreKeysBefore(now - OLD_SIGNED_PREKEY_KEEP_MS, fresh.keyId));
};

/** Makes sure the server has this install's keys and enough one-time prekeys. Safe to call often. */
export const ensureKeysPublished = async (store: LocalStore, now = Date.now()) => {
    if (!store.hasIdentity()) await createInstall(store);

    const identity = await store.getIdentity();
    const status = await getOwnKeyStatus();
    const isThisInstall =
        !!status &&
        status.registrationId === (await store.getRegistrationId()) &&
        status.identityKey === toB64(identity.signing.publicKey) &&
        status.identityDhKey === toB64(identity.dh.publicKey);

    if (!isThisInstall) {
        await publishFullBundle(store);
        return;
    }
    await rotateIfOld(store, now);
    if (status.oneTimePreKeyCount < PREKEY_LOW) await topUpPreKeys(store, PREKEY_BATCH - status.oneTimePreKeyCount);

    // Prekeys replaced by the last full upload can only be in messages sent before it; drop them after a while.
    const publishedAt = Number((await store.getMeta('full_publish_at')) ?? '0');
    if (publishedAt && now - publishedAt > OLD_ONE_TIME_PREKEY_KEEP_MS) {
        await store.write((w) => w.deleteOneTimePreKeysBefore(publishedAt));
    }
};

export const topUpPreKeys = async (store: LocalStore, count = PREKEY_BATCH) => {
    if (count <= 0) return;
    const keys = await allocatePreKeys(store, count);
    await addOneTimePreKeys(await store.getRegistrationId(), publicPreKeys(keys));
};
