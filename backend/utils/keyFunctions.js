const crypto = require('crypto');
const KeyBundle = require('../models/keyBundle');
const Connection = require('../models/connection');
const { emitToUser } = require('../services/websocketServer');
const { isBlockedEitherWay } = require('./safetyFunctions');
const { getActorUserId, isValidObjectId } = require('./identityUtils');

const MAX_KEY_ID = 0x7fffffff;
const MAX_ONE_TIME_PREKEYS = 200;
const MAX_PREKEYS_PER_UPLOAD = 100;
// Below this many one-time prekeys the phone is asked to upload more.
const LOW_PREKEY_THRESHOLD = 20;

// Must match services/crypto/identity.ts on the phone.
const IDENTITY_DH_CONTEXT = Buffer.from('TalkNow-IdentityDH-v1', 'utf8');
const SIGNED_PREKEY_CONTEXT = Buffer.from('TalkNow-SignedPreKey-v1', 'utf8');

const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');
const isKeyId = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_KEY_ID;
const isRegistrationId = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_KEY_ID;

// Canonical base64 of exactly `length` bytes, or null.
const decodeKey = (value, length) => {
    if (typeof value !== 'string' || value.length > 128) return null;
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length !== length || bytes.toString('base64') !== value) return null;
    return bytes;
};

const u32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
};

const verifyEd25519 = (publicKey, message, signature) => {
    try {
        const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey.toString('base64url') }, format: 'jwk' });
        return crypto.verify(null, message, key, signature);
    } catch {
        return false;
    }
};

const parseSignedPreKey = (spk, identityKey) => {
    if (!spk || typeof spk !== 'object' || !isKeyId(spk.keyId)) return null;
    const publicKey = decodeKey(spk.publicKey, 32);
    const signature = decodeKey(spk.signature, 64);
    if (!publicKey || !signature) return null;
    if (!verifyEd25519(identityKey, Buffer.concat([SIGNED_PREKEY_CONTEXT, u32(spk.keyId), publicKey]), signature)) return null;
    return { keyId: spk.keyId, publicKey: spk.publicKey, signature: spk.signature, createdAt: new Date() };
};

const parseOneTimePreKeys = (list) => {
    if (list === undefined) return [];
    if (!Array.isArray(list) || list.length > MAX_PREKEYS_PER_UPLOAD) return null;
    const seen = new Set();
    const out = [];
    for (const k of list) {
        if (!k || !isKeyId(k.keyId) || seen.has(k.keyId) || !decodeKey(k.publicKey, 32)) return null;
        seen.add(k.keyId);
        out.push({ keyId: k.keyId, publicKey: k.publicKey });
    }
    return out;
};

const notifyConnections = async (userId, payload) => {
    const connections = await Connection.find({ 'participants.userId': userId, status: 'accepted' }).select('participants').lean();
    for (const c of connections) {
        for (const p of c.participants || []) {
            if (String(p.userId) !== String(userId)) emitToUser(String(p.userId), payload);
        }
    }
};

const unauthorized = (res) => res.status(401).json({ message: 'Unauthorized' });
const invalid = (res, message) => res.status(400).json({ message });

/**
 * PUT /api/keys: publishes this install's keys, replacing any earlier bundle. A different
 * identity means a new install (reinstall or new phone): connections are told at once.
 */
const uploadKeys = async (req, res) => {
    try {
        const me = getActorUserId(req);
        if (!isValidObjectId(me)) return unauthorized(res);
        const body = req.body || {};

        const identityKey = decodeKey(body.identityKey, 32);
        const identityDhKey = decodeKey(body.identityDhKey, 32);
        const identityDhSignature = decodeKey(body.identityDhSignature, 64);
        if (!isRegistrationId(body.registrationId) || !identityKey || !identityDhKey || !identityDhSignature) {
            return invalid(res, 'Invalid identity keys');
        }
        if (!verifyEd25519(identityKey, Buffer.concat([IDENTITY_DH_CONTEXT, identityDhKey]), identityDhSignature)) {
            return invalid(res, 'Invalid identity signature');
        }
        const signedPreKey = parseSignedPreKey(body.signedPreKey, identityKey);
        if (!signedPreKey) return invalid(res, 'Invalid signed prekey');
        const oneTimePreKeys = parseOneTimePreKeys(body.oneTimePreKeys);
        if (!oneTimePreKeys) return invalid(res, 'Invalid one-time prekeys');

        const previous = await KeyBundle.findOneAndUpdate(
            { userId: me },
            {
                $set: {
                    userId: me,
                    deviceId: 1,
                    registrationId: body.registrationId,
                    identityKey: body.identityKey,
                    identityDhKey: body.identityDhKey,
                    identityDhSignature: body.identityDhSignature,
                    signedPreKey,
                    oneTimePreKeys,
                },
            },
            { upsert: true, returnDocument: 'before', projection: { identityKey: 1, identityDhKey: 1, registrationId: 1 } }
        ).lean();

        const identityChanged =
            !!previous &&
            (previous.identityKey !== body.identityKey ||
                previous.identityDhKey !== body.identityDhKey ||
                previous.registrationId !== body.registrationId);
        if (identityChanged) await notifyConnections(me, { type: 'identity_changed', userId: me });

        return res.status(200).json({ oneTimePreKeyCount: oneTimePreKeys.length, identityChanged });
    } catch (err) {
        console.error('Error uploading keys:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

// Top-ups and rotations name the install they are for, so a replaced install can't modify the new bundle.
const loadOwnBundle = async (req, res) => {
    const me = getActorUserId(req);
    if (!isValidObjectId(me)) {
        unauthorized(res);
        return null;
    }
    const bundle = await KeyBundle.findOne({ userId: me }).select('registrationId identityKey oneTimePreKeys.keyId').lean();
    if (!bundle) {
        res.status(404).json({ message: 'No keys uploaded', code: 'no_keys' });
        return null;
    }
    if (bundle.registrationId !== req.body?.registrationId) {
        res.status(409).json({ message: 'Keys were replaced by another install', code: 'keys_replaced' });
        return null;
    }
    return { me, bundle };
};

/** POST /api/keys/prekeys: adds one-time prekeys (ids already on the server are skipped). */
const addOneTimePreKeys = async (req, res) => {
    try {
        const own = await loadOwnBundle(req, res);
        if (!own) return;
        const keys = parseOneTimePreKeys(req.body?.oneTimePreKeys);
        if (!keys || keys.length === 0) return invalid(res, 'Invalid one-time prekeys');

        const existing = new Set((own.bundle.oneTimePreKeys || []).map((k) => k.keyId));
        const room = Math.max(0, MAX_ONE_TIME_PREKEYS - existing.size);
        const fresh = keys.filter((k) => !existing.has(k.keyId)).slice(0, room);
        if (fresh.length > 0) {
            await KeyBundle.updateOne(
                { userId: own.me, registrationId: own.bundle.registrationId },
                { $push: { oneTimePreKeys: { $each: fresh } } }
            );
        }
        return res.status(200).json({ added: fresh.length, oneTimePreKeyCount: existing.size + fresh.length });
    } catch (err) {
        console.error('Error adding prekeys:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/** PUT /api/keys/signed-prekey: replaces the signed prekey after checking it against the stored identity. */
const rotateSignedPreKey = async (req, res) => {
    try {
        const own = await loadOwnBundle(req, res);
        if (!own) return;
        const signedPreKey = parseSignedPreKey(req.body?.signedPreKey, Buffer.from(own.bundle.identityKey, 'base64'));
        if (!signedPreKey) return invalid(res, 'Invalid signed prekey');
        await KeyBundle.updateOne({ userId: own.me, registrationId: own.bundle.registrationId }, { $set: { signedPreKey } });
        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Error rotating signed prekey:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/** GET /api/keys/me: what the server has for this user, so the phone can tell if it is still the active install. */
const getOwnKeyStatus = async (req, res) => {
    try {
        const me = getActorUserId(req);
        if (!isValidObjectId(me)) return unauthorized(res);
        const bundle = await KeyBundle.findOne({ userId: me }).lean();
        if (!bundle) return res.status(404).json({ message: 'No keys uploaded', code: 'no_keys' });
        return res.status(200).json({
            registrationId: bundle.registrationId,
            identityKey: bundle.identityKey,
            identityDhKey: bundle.identityDhKey,
            signedPreKey: { keyId: bundle.signedPreKey.keyId, createdAt: bundle.signedPreKey.createdAt },
            oneTimePreKeyCount: (bundle.oneTimePreKeys || []).length,
        });
    } catch (err) {
        console.error('Error reading key status:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /api/keys/:userId: a contact's bundle with one one-time prekey, which is removed in
 * the same atomic operation so two senders never get the same one. Only for accepted
 * connections, never across a block.
 */
const getPreKeyBundle = async (req, res) => {
    try {
        const me = getActorUserId(req);
        if (!isValidObjectId(me)) return unauthorized(res);
        const target = String(req.params?.userId ?? '').trim();
        if (!isValidObjectId(target) || target === me) return invalid(res, 'Invalid userId');

        const connected = await Connection.exists({ pairKey: pairKeyOf(me, target), status: 'accepted' });
        if (!connected || (await isBlockedEitherWay(me, target))) {
            return res.status(404).json({ message: 'Not found' });
        }

        const bundle = await KeyBundle.findOneAndUpdate(
            { userId: target },
            { $pop: { oneTimePreKeys: -1 } },
            { returnDocument: 'before' }
        ).lean();
        if (!bundle) {
            return res.status(404).json({ message: 'This contact needs to update TalkNow before you can message them.', code: 'no_keys' });
        }

        const prekeys = bundle.oneTimePreKeys || [];
        const oneTimePreKey = prekeys[0] ? { keyId: prekeys[0].keyId, publicKey: prekeys[0].publicKey } : null;
        const remaining = Math.max(0, prekeys.length - 1);
        if (remaining < LOW_PREKEY_THRESHOLD) emitToUser(target, { type: 'prekeys_low', count: remaining });

        return res.status(200).json({
            userId: target,
            registrationId: bundle.registrationId,
            identityKey: bundle.identityKey,
            identityDhKey: bundle.identityDhKey,
            identityDhSignature: bundle.identityDhSignature,
            signedPreKey: {
                keyId: bundle.signedPreKey.keyId,
                publicKey: bundle.signedPreKey.publicKey,
                signature: bundle.signedPreKey.signature,
            },
            oneTimePreKey,
        });
    } catch (err) {
        console.error('Error fetching prekey bundle:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    uploadKeys,
    addOneTimePreKeys,
    rotateSignedPreKey,
    getOwnKeyStatus,
    getPreKeyBundle,
    LOW_PREKEY_THRESHOLD,
};
