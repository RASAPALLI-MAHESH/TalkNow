const mongoose = require('mongoose');
const User = require('../models/user');
const Notification = require('../models/notification');
const Connection = require('../models/connection');
const { getIo, getUserRoom } = require('../services/notificationSocket');

// These handlers are meant to be mounted from backend/routes/authRoutes.js
// with authMiddleware so req.user.id is available.

const getTargetUserIdFromBody = (body) => {
    const raw = body?.targetUserId ?? body?.TargetUserId ?? body?.userId ?? body?.UserId;
    return String(raw ?? '').trim();
};

const getActorUserId = (req) => {
    // Prefer JWT identity.
    const fromToken = req?.user?.id;
    if (fromToken) {
        if (typeof fromToken === 'string') return fromToken.trim();

        // Handle cases where token payload might contain an ObjectId-like object.
        if (fromToken && typeof fromToken === 'object') {
            const anyId = fromToken;

            if (typeof anyId.$oid === 'string') return anyId.$oid.trim();
            if (typeof anyId._id === 'string') return anyId._id.trim();
            if (typeof anyId.id === 'string') return anyId.id.trim();

            // Common decoded ObjectId shapes:
            // - { _bsontype: 'ObjectId', id: { type: 'Buffer', data: [...] } }
            // - { id: { type: 'Buffer', data: [...] } }
            // - { type: 'Buffer', data: [...] }
            const bufferCandidate = anyId?.id ?? anyId;
            const data = bufferCandidate?.data;
            if (bufferCandidate && typeof bufferCandidate === 'object' && bufferCandidate.type === 'Buffer' && Array.isArray(data)) {
                try {
                    return Buffer.from(data).toString('hex');
                } catch {
                    // ignore
                }
            }

            // If the id is a raw byte array.
            if (Array.isArray(anyId?.id) && anyId.id.every((n) => Number.isInteger(n))) {
                try {
                    return Buffer.from(anyId.id).toString('hex');
                } catch {
                    // ignore
                }
            }
        }

        return String(fromToken).trim();
    }
    // Fallback (not recommended) if you ever call without authMiddleware.
    const fromBody = req?.body?.userId;
    return fromBody ? String(fromBody).trim() : '';
};

const validateIds = (actorUserId, targetUserId) => {
    if (!actorUserId) return { ok: false, status: 401, message: 'Unauthorized' };
    if (!mongoose.Types.ObjectId.isValid(String(actorUserId))) return { ok: false, status: 401, message: 'Unauthorized' };
    if (!targetUserId) return { ok: false, status: 400, message: 'targetUserId is required' };
    if (!mongoose.Types.ObjectId.isValid(targetUserId)) return { ok: false, status: 400, message: 'Invalid targetUserId' };
    if (String(actorUserId) === String(targetUserId)) return { ok: false, status: 400, message: 'You cannot follow yourself' };
    return { ok: true };
};

const emitNotification = async (toUserId, payload) => {
    const io = getIo();
    if (!io) return;

    const room = getUserRoom(toUserId);
    io.to(room).emit('new_notification', payload);
};

const toSafeUsername = (value) => {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : 'User';
};

const isDuplicateKeyError = (err) => Number(err?.code) === 11000;

const escapeRegex = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parsePositiveInt = (raw, fallback, min, max) => {
    const n = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
};

const normalizePair = (leftId, rightId) => {
    const ids = [String(leftId || '').trim(), String(rightId || '').trim()].sort();
    return {
        pairKey: `${ids[0]}:${ids[1]}`,
        participants: [new mongoose.Types.ObjectId(ids[0]), new mongoose.Types.ObjectId(ids[1])],
    };
};

const followUser = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        const targetUserId = getTargetUserIdFromBody(req.body);

        const v = validateIds(userId, targetUserId);
        if (!v.ok) return res.status(v.status).json({ message: v.message });

        const target = await User.findById(targetUserId).select('_id');
        if (!target) return res.status(404).json({ message: 'Target user not found' });

        const pair = normalizePair(userId, targetUserId);
        const existingConnection = await Connection.findOne({ pairKey: pair.pairKey })
            .select('status requestedBy')
            .lean();

        if (existingConnection?.status === 'accepted') {
            return res.status(200).json({ message: 'Already connected' });
        }

        if (
            existingConnection?.status === 'pending' &&
            String(existingConnection?.requestedBy || '') === String(userId)
        ) {
            return res.status(200).json({ message: 'Follow request already sent' });
        }

        // Follow flow is request-based. Persist/emit only a follow_request notification.
        const existingPending = await Notification.findOne({
            toUserId: targetUserId,
            fromUserId: userId,
            type: 'follow_request',
        })
            .select('_id createdAt')
            .lean();

        if (existingPending?._id) {
            return res.status(200).json({
                message: 'Follow request already sent',
                requestId: String(existingPending._id),
            });
        }

        const actor = await User.findById(userId).select('_id username profilePicture').lean();
        const message = 'sent you a follow request';

        let doc;
        try {
            await Connection.updateOne(
                { pairKey: pair.pairKey },
                {
                    $set: {
                        pairKey: pair.pairKey,
                        participants: pair.participants,
                        requestedBy: new mongoose.Types.ObjectId(userId),
                        requestedTo: new mongoose.Types.ObjectId(targetUserId),
                        status: 'pending',
                        requestedAt: new Date(),
                        respondedAt: null,
                        acceptedAt: null,
                    },
                    $setOnInsert: {
                        hasMessages: false,
                        lastMessageAt: null,
                        lastMessagePreview: '',
                    },
                },
                { upsert: true }
            );

            doc = await Notification.create({
                toUserId: targetUserId,
                fromUserId: userId,
                fromUsername: actor?.username ? String(actor.username) : undefined,
                fromProfilePicture: actor?.profilePicture ? String(actor.profilePicture) : '',
                type: 'follow_request',
                message,
            });
        } catch (err) {
            if (!isDuplicateKeyError(err)) throw err;

            const existing = await Notification.findOne({
                toUserId: targetUserId,
                fromUserId: userId,
                type: 'follow_request',
            })
                .select('_id')
                .lean();

            return res.status(200).json({
                message: 'Follow request already sent',
                requestId: existing?._id ? String(existing._id) : undefined,
            });
        }

        const payload = {
            id: String(doc._id),
            type: 'follow_request',
            username: toSafeUsername(actor?.username),
            profilePicture: actor?.profilePicture ? String(actor.profilePicture) : '',
            message,
            fromUserId: String(userId),
            createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
        };

        await emitNotification(targetUserId, payload);

        return res.status(200).json({
            message: 'Follow request sent',
            requestId: String(doc._id),
        });
    } catch (err) {
        console.error('Error following user:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const unfollowUser = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        const targetUserId = getTargetUserIdFromBody(req.body);

        const v = validateIds(userId, targetUserId);
        if (!v.ok) {
            // Customize message for unfollow.
            const msg = v.message === 'You cannot follow yourself' ? 'You cannot unfollow yourself' : v.message;
            return res.status(v.status).json({ message: msg });
        }

        const session = await mongoose.startSession();
        let actor;
        let doc;
        const message = 'removed connection';

        try {
            await session.withTransaction(async () => {
                await User.findByIdAndUpdate(userId, { $pull: { following: targetUserId } }, { session });
                await User.findByIdAndUpdate(targetUserId, { $pull: { followers: userId } }, { session });
                await User.findByIdAndUpdate(userId, { $pull: { followers: targetUserId } }, { session });
                await User.findByIdAndUpdate(targetUserId, { $pull: { following: userId } }, { session });

                const pair = normalizePair(userId, targetUserId);
                await Connection.deleteOne({ pairKey: pair.pairKey }).session(session);

                await Notification.deleteMany(
                    {
                        $or: [
                            { toUserId: targetUserId, fromUserId: userId, type: 'follow_request' },
                            { toUserId: userId, fromUserId: targetUserId, type: 'follow_request' },
                        ],
                    },
                    { session }
                );

                actor = await User.findById(userId).select('_id username profilePicture').session(session).lean();
                const created = await Notification.create(
                    [
                        {
                            toUserId: targetUserId,
                            fromUserId: userId,
                            fromUsername: actor?.username ? String(actor.username) : undefined,
                            fromProfilePicture: actor?.profilePicture ? String(actor.profilePicture) : '',
                            type: 'unfollow',
                            message,
                        },
                    ],
                    { session }
                );
                doc = created[0];
            });
        } finally {
            await session.endSession();
        }

        const payload = {
            id: String(doc._id),
            type: 'unfollow',
            username: toSafeUsername(actor?.username),
            profilePicture: actor?.profilePicture ? String(actor.profilePicture) : '',
            message,
            fromUserId: String(userId),
            createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
        };

        await emitNotification(targetUserId, payload);

        return res.status(200).json({ message: 'Connection removed' });
    } catch (err) {
        console.error('Error unfollowing user:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const acceptFollowRequest = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const notificationId = String(req.body?.notificationId ?? '').trim();
        const requesterUserIdFromBody = String(req.body?.requesterUserId ?? req.body?.fromUserId ?? '').trim();

        let requesterUserId = requesterUserIdFromBody;
        let requester = null;
        let currentUser = null;
        let doc;
        const acceptedMessage = 'accepted your follow request';

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                if (notificationId) {
                    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
                        throw Object.assign(new Error('Invalid notificationId'), { statusCode: 400 });
                    }

                    const requestDoc = await Notification.findOne({
                        _id: notificationId,
                        toUserId: userId,
                        type: 'follow_request',
                    })
                        .select('_id fromUserId')
                        .session(session)
                        .lean();

                    if (!requestDoc?._id) {
                        if (requesterUserId && mongoose.Types.ObjectId.isValid(requesterUserId)) {
                            const connected = await User.findOne({
                                _id: userId,
                                following: requesterUserId,
                                followers: requesterUserId,
                            })
                                .select('_id')
                                .session(session)
                                .lean();

                            if (connected?._id) {
                                throw Object.assign(new Error('Follow request already accepted'), { statusCode: 200 });
                            }
                        }

                        throw Object.assign(new Error('Follow request not found'), { statusCode: 404 });
                    }

                    requesterUserId = String(requestDoc.fromUserId);
                }

                if (!requesterUserId || !mongoose.Types.ObjectId.isValid(requesterUserId)) {
                    throw Object.assign(new Error('requesterUserId is required'), { statusCode: 400 });
                }
                if (String(requesterUserId) === String(userId)) {
                    throw Object.assign(new Error('Invalid requesterUserId'), { statusCode: 400 });
                }

                requester = await User.findById(requesterUserId).select('_id username profilePicture').session(session).lean();
                if (!requester?._id) {
                    throw Object.assign(new Error('Requester user not found'), { statusCode: 404 });
                }

                currentUser = await User.findById(userId).select('_id username profilePicture').session(session).lean();
                if (!currentUser?._id) {
                    throw Object.assign(new Error('Current user not found'), { statusCode: 404 });
                }

                await User.findByIdAndUpdate(
                    userId,
                    {
                        $addToSet: {
                            following: requesterUserId,
                            followers: requesterUserId,
                        },
                    },
                    { session }
                );

                await User.findByIdAndUpdate(
                    requesterUserId,
                    {
                        $addToSet: {
                            following: userId,
                            followers: userId,
                        },
                    },
                    { session }
                );

                await Notification.deleteMany(
                    {
                        toUserId: userId,
                        fromUserId: requesterUserId,
                        type: 'follow_request',
                    },
                    { session }
                );

                const pair = normalizePair(userId, requesterUserId);
                await Connection.updateOne(
                    { pairKey: pair.pairKey },
                    {
                        $set: {
                            pairKey: pair.pairKey,
                            participants: pair.participants,
                            requestedBy: new mongoose.Types.ObjectId(requesterUserId),
                            requestedTo: new mongoose.Types.ObjectId(userId),
                            status: 'accepted',
                            respondedAt: new Date(),
                            acceptedAt: new Date(),
                        },
                        $setOnInsert: {
                            hasMessages: false,
                            lastMessageAt: null,
                            lastMessagePreview: '',
                        },
                    },
                    { upsert: true, session }
                );

                const created = await Notification.create(
                    [
                        {
                            toUserId: requesterUserId,
                            fromUserId: userId,
                            fromUsername: currentUser?.username ? String(currentUser.username) : undefined,
                            fromProfilePicture: currentUser?.profilePicture ? String(currentUser.profilePicture) : '',
                            type: 'follow_accept',
                            message: acceptedMessage,
                        },
                    ],
                    { session }
                );
                doc = created[0];
            });
        } catch (err) {
            const statusCode = Number(err?.statusCode);
            if (statusCode === 200) {
                return res.status(200).json({ message: err.message, alreadyAccepted: true });
            }
            if (statusCode >= 400 && statusCode < 500) {
                return res.status(statusCode).json({ message: err.message });
            }
            throw err;
        } finally {
            await session.endSession();
        }

        const payload = {
            id: String(doc._id),
            type: 'follow_accept',
            username: toSafeUsername(currentUser?.username),
            profilePicture: currentUser?.profilePicture ? String(currentUser.profilePicture) : '',
            message: acceptedMessage,
            fromUserId: String(userId),
            createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
        };

        await emitNotification(requesterUserId, payload);

        return res.status(200).json({
            message: 'Follow request accepted',
            connectedUser: {
                id: String(requester._id),
                username: toSafeUsername(requester.username),
                profilePicture: requester?.profilePicture ? String(requester.profilePicture) : '',
            },
        });
    } catch (err) {
        console.error('Error accepting follow request:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const rejectFollowRequest = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const notificationId = String(req.body?.notificationId ?? '').trim();
        const requesterUserIdFromBody = String(req.body?.requesterUserId ?? req.body?.fromUserId ?? '').trim();

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                if (notificationId) {
                    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
                        throw Object.assign(new Error('Invalid notificationId'), { statusCode: 400 });
                    }

                    const result = await Notification.deleteOne(
                        {
                            _id: notificationId,
                            toUserId: userId,
                            type: 'follow_request',
                        },
                        { session }
                    );

                    if (!result?.deletedCount) {
                        if (requesterUserIdFromBody && mongoose.Types.ObjectId.isValid(requesterUserIdFromBody)) {
                            const connected = await User.findOne({
                                _id: userId,
                                following: requesterUserIdFromBody,
                                followers: requesterUserIdFromBody,
                            })
                                .select('_id')
                                .session(session)
                                .lean();

                            if (connected?._id) {
                                throw Object.assign(new Error('Follow request already processed'), { statusCode: 200 });
                            }
                        }

                        throw Object.assign(new Error('Follow request not found'), { statusCode: 404 });
                    }

                    if (requesterUserIdFromBody && mongoose.Types.ObjectId.isValid(requesterUserIdFromBody)) {
                        const pair = normalizePair(userId, requesterUserIdFromBody);
                        await Connection.updateOne(
                            { pairKey: pair.pairKey },
                            {
                                $set: {
                                    status: 'rejected',
                                    respondedAt: new Date(),
                                },
                            },
                            { session }
                        );
                    }

                    return;
                }

                if (!requesterUserIdFromBody || !mongoose.Types.ObjectId.isValid(requesterUserIdFromBody)) {
                    throw Object.assign(new Error('requesterUserId is required'), { statusCode: 400 });
                }

                await Notification.deleteMany(
                    {
                        toUserId: userId,
                        fromUserId: requesterUserIdFromBody,
                        type: 'follow_request',
                    },
                    { session }
                );

                const pair = normalizePair(userId, requesterUserIdFromBody);
                await Connection.updateOne(
                    { pairKey: pair.pairKey },
                    {
                        $set: {
                            status: 'rejected',
                            respondedAt: new Date(),
                        },
                    },
                    { session }
                );
            });
        } catch (err) {
            const statusCode = Number(err?.statusCode);
            if (statusCode === 200) {
                return res.status(200).json({ message: err.message, alreadyProcessed: true });
            }
            if (statusCode >= 400 && statusCode < 500) {
                return res.status(statusCode).json({ message: err.message });
            }
            throw err;
        } finally {
            await session.endSession();
        }

        return res.status(200).json({ message: 'Follow request rejected' });
    } catch (err) {
        console.error('Error rejecting follow request:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getMutualConnections = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const q = String(req.query?.q ?? '').trim().toLowerCase();
        const limit = parsePositiveInt(req.query?.limit, 50, 1, 100);
        const offset = parsePositiveInt(req.query?.offset, 0, 0, 1000000);
        const escapedQuery = q ? escapeRegex(q) : '';

        const me = new mongoose.Types.ObjectId(String(userId));

        const rawConnections = await Connection.aggregate([
            {
                $match: {
                    participants: me,
                    status: 'accepted',
                },
            },
            {
                $project: {
                    peerIds: {
                        $filter: {
                            input: '$participants',
                            as: 'id',
                            cond: { $ne: ['$$id', me] },
                        },
                    },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'peerIds',
                    foreignField: '_id',
                    as: 'peerDocs',
                    pipeline: [
                        { $project: { _id: 1, username: 1, profilePicture: 1 } },
                        ...(escapedQuery
                            ? [{ $match: { username: { $regex: escapedQuery, $options: 'i' } } }]
                            : []),
                    ],
                },
            },
            { $unwind: '$peerDocs' },
            { $replaceRoot: { newRoot: '$peerDocs' } },
            { $sort: { username: 1 } },
            { $skip: offset },
            { $limit: limit },
        ]);

        const connections = rawConnections.map((u) => ({
            id: String(u._id),
            username: toSafeUsername(u.username),
            profilePicture: typeof u.profilePicture === 'string' ? u.profilePicture : '',
            message: 'Connected',
        }));

        return res.status(200).json({ connections });
    } catch (err) {
        console.error('Error fetching mutual connections:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    followUser,
    unfollowUser,
    acceptFollowRequest,
    rejectFollowRequest,
    getMutualConnections,
};
