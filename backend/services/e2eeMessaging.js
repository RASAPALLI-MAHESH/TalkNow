const mongoose = require('mongoose');
const Message = require('../models/message');
const SessionReset = require('../models/sessionReset');

const { MAX_ENVELOPE_BODY_CHARS } = Message;
const MAX_IDS_PER_CALL = 200;
const MAX_RESET_MESSAGE_IDS = 50;
const MAX_PENDING_RESETS_PER_PAIR = 20;
const MAX_REGISTRATION_ID = 0x7fffffff;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));
const isObjectIdString = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

const toObjectIds = (raw, max) => {
    if (!Array.isArray(raw)) return [];
    const unique = [...new Set(raw.filter(isObjectIdString).map((s) => s.toLowerCase()))];
    return unique.slice(0, max).map(toObjectId);
};

const isRegistrationId = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_REGISTRATION_ID;

/**
 * Checks the shape and size of an encrypted envelope. The server can't read it and doesn't try.
 * Returns a clean copy, or null.
 */
const validateEnvelope = (envelope) => {
    if (!envelope || typeof envelope !== 'object') return null;
    const { type, body, registrationId, recipientRegistrationId } = envelope;
    if (type !== 'prekey' && type !== 'whisper') return null;
    if (typeof body !== 'string' || body.length === 0 || body.length > MAX_ENVELOPE_BODY_CHARS) return null;
    if (body.length % 4 !== 0 || !BASE64_RE.test(body)) return null;
    if (!isRegistrationId(registrationId) || !isRegistrationId(recipientRegistrationId)) return null;
    return { type, body, registrationId, recipientRegistrationId };
};

const toWireMessage = (m) => ({
    id: String(m._id),
    from: String(m.senderId),
    to: String(m.receiverId),
    envelope: m.envelope,
    resendOf: m.resendOf ? String(m.resendOf) : undefined,
    date: (m.createdAt ? new Date(m.createdAt) : new Date()).toISOString(),
});

const toWireReset = (r) => ({
    id: String(r._id),
    from: String(r.requesterId),
    messageIds: (r.messageIds || []).map(String),
    date: (r.createdAt ? new Date(r.createdAt) : new Date()).toISOString(),
});

/**
 * The recipient's phone confirms it stored these messages: the ciphertext is deleted and
 * they count as delivered. Returns the newly delivered ones so senders can be told.
 */
const acknowledgeMessages = async (userId, rawIds) => {
    const ids = toObjectIds(rawIds, MAX_IDS_PER_CALL);
    if (ids.length === 0) return [];

    const docs = await Message.find({ _id: { $in: ids }, receiverId: toObjectId(userId), ackedAt: null })
        .select('_id senderId deliveredAt')
        .lean();
    if (docs.length === 0) return [];

    const now = new Date();
    await Message.updateMany(
        { _id: { $in: docs.map((d) => d._id) }, ackedAt: null },
        { $set: { ackedAt: now }, $unset: { envelope: 1 } }
    );
    const undelivered = docs.filter((d) => !d.deliveredAt);
    if (undelivered.length > 0) {
        await Message.updateMany({ _id: { $in: undelivered.map((d) => d._id) }, deliveredAt: null }, { $set: { deliveredAt: now } });
    }
    return undelivered.map((d) => ({ id: String(d._id), senderId: String(d.senderId), date: now.toISOString() }));
};

/** Envelopes and reset requests waiting for this user's phone, oldest first. */
const listPending = async (userId, limit) => {
    const me = toObjectId(userId);
    const [messages, resets] = await Promise.all([
        Message.find({ receiverId: me, encrypted: true, ackedAt: null })
            .sort({ createdAt: 1, _id: 1 })
            .limit(limit + 1)
            .select('_id senderId receiverId envelope resendOf createdAt')
            .lean(),
        SessionReset.find({ targetId: me }).sort({ createdAt: 1 }).limit(MAX_IDS_PER_CALL).lean(),
    ]);
    return {
        messages: messages.slice(0, limit).map(toWireMessage),
        resets: resets.map(toWireReset),
        hasMore: messages.length > limit,
    };
};

/**
 * `requesterId` couldn't decrypt some of `targetId`'s messages. Only ids of messages that
 * really went from target to requester are kept. Returns the stored request, or null.
 */
const createSessionReset = async (requesterId, targetId, rawMessageIds) => {
    const requester = toObjectId(requesterId);
    const target = toObjectId(targetId);
    const candidates = toObjectIds(rawMessageIds, MAX_RESET_MESSAGE_IDS);
    const owned = candidates.length
        ? await Message.find({ _id: { $in: candidates }, senderId: target, receiverId: requester }).select('_id').lean()
        : [];
    if ((await SessionReset.countDocuments({ requesterId: requester, targetId: target })) >= MAX_PENDING_RESETS_PER_PAIR) return null;
    const doc = await SessionReset.create({ requesterId: requester, targetId: target, messageIds: owned.map((m) => m._id) });
    return toWireReset(doc);
};

const acknowledgeResets = async (userId, rawIds) => {
    const ids = toObjectIds(rawIds, MAX_IDS_PER_CALL);
    if (ids.length === 0) return 0;
    const result = await SessionReset.deleteMany({ _id: { $in: ids }, targetId: toObjectId(userId) });
    return result.deletedCount || 0;
};

module.exports = {
    validateEnvelope,
    toWireMessage,
    acknowledgeMessages,
    listPending,
    createSessionReset,
    acknowledgeResets,
    isObjectIdString,
};
