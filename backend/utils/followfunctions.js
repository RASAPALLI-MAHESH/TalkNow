const mongoose = require('mongoose');
const User = require('../models/user');
const Notification = require('../models/notification');
const Connection = require('../models/connection');
const Block = require('../models/block');
const { emitNotification } = require('../services/websocketServer');
const { notifyUser } = require('../services/pushService');
const { isBlockedEitherWay } = require('./safetyFunctions');
const { getActorUserId, isValidObjectId } = require('./identityUtils');

// Helper to normalize the input which can be in various formats
const getTargetUserIdFromBody = (body) => {
    const raw = body?.targetUserId ?? body?.TargetUserId ?? body?.userId ?? body?.UserId;
    return String(raw ?? '').trim();
};

const validateIds = (actorUserId, targetUserId) => {
    if (!actorUserId || !isValidObjectId(actorUserId)) return { ok: false, status: 401, message: 'Unauthorized' };
    if (!targetUserId || !isValidObjectId(targetUserId)) return { ok: false, status: 400, message: 'Invalid targetUserId' };
    if (String(actorUserId) === String(targetUserId)) return { ok: false, status: 400, message: 'You cannot follow yourself' };
    return { ok: true };
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
        participants: [
            { userId: new mongoose.Types.ObjectId(ids[0]), unreadCount: 0, lastReadAt: null },
            { userId: new mongoose.Types.ObjectId(ids[1]), unreadCount: 0, lastReadAt: null }
        ],
    };
};

/**
 * How `meId` relates to each user in `otherIds`:
 * 'self', 'connected', 'requested' (I sent a request), 'incoming' (they sent me one), 'none',
 * 'blocked' (I blocked them) or 'unavailable' (they blocked me; treat as not found).
 */
const getRelationshipMap = async (meId, otherIds) => {
    const map = new Map();
    const me = String(meId || '').trim();
    const ids = [...new Set(otherIds.map((id) => String(id || '').trim()))].filter(isValidObjectId);
    if (!isValidObjectId(me) || ids.length === 0) return map;

    const pairKeyToOther = new Map();
    for (const id of ids) {
        if (id === me) {
            map.set(id, 'self');
            continue;
        }
        pairKeyToOther.set(normalizePair(me, id).pairKey, id);
        map.set(id, 'none');
    }

    const connections = await Connection.find({ pairKey: { $in: [...pairKeyToOther.keys()] } })
        .select('pairKey status requestedBy')
        .lean();
    for (const c of connections) {
        const otherId = pairKeyToOther.get(c.pairKey);
        if (!otherId) continue;
        if (c.status === 'accepted') map.set(otherId, 'connected');
        else if (c.status === 'pending') map.set(otherId, String(c.requestedBy) === me ? 'requested' : 'incoming');
    }

    const others = [...pairKeyToOther.values()];
    const blocks = await Block.find({
        $or: [
            { blockerId: me, blockedId: { $in: others } },
            { blockedId: me, blockerId: { $in: others } },
        ],
    })
        .select('blockerId blockedId')
        .lean();
    // "They blocked me" first, so "I blocked them" wins when both apply (I can still unblock).
    for (const b of blocks) if (String(b.blockedId) === me) map.set(String(b.blockerId), 'unavailable');
    for (const b of blocks) if (String(b.blockerId) === me) map.set(String(b.blockedId), 'blocked');
    return map;
};

const followUser = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        const targetUserId = getTargetUserIdFromBody(req.body);

        const v = validateIds(userId, targetUserId);
        if (!v.ok) return res.status(v.status).json({ message: v.message });

        const target = await User.findById(targetUserId).select('_id');
        if (!target) return res.status(404).json({ message: 'Target user not found' });
        if (await isBlockedEitherWay(userId, targetUserId)) {
            return res.status(403).json({ message: "You can't follow this user" });
        }

        const pair = normalizePair(userId, targetUserId);
        const existingConnection = await Connection.findOne({ pairKey: pair.pairKey })
            .select('status requestedBy')
            .lean();

        if (existingConnection?.status === 'accepted') {
            return res.status(200).json({ message: 'Already connected', relationship: 'connected' });
        }

        if (existingConnection?.status === 'pending') {
            // Their pending request must be accepted, not overwritten by a request in the other direction.
            const theyRequested = String(existingConnection?.requestedBy || '') !== String(userId);
            return res.status(200).json(
                theyRequested
                    ? { message: 'This user already sent you a request', relationship: 'incoming' }
                    : { message: 'Follow request already sent', relationship: 'requested' }
            );
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
                relationship: 'requested',
            });
        }

        const actor = await User.findById(userId).select('_id username profilePicture').lean();
        const message = 'started following you';

        let doc;
        try {
            await Connection.updateOne(
                { pairKey: pair.pairKey },
                {
                    $set: {
                        pairKey: pair.pairKey,
                        requestedBy: new mongoose.Types.ObjectId(userId),
                        requestedTo: new mongoose.Types.ObjectId(targetUserId),
                        status: 'pending',
                        requestedAt: new Date(),
                        respondedAt: null,
                        acceptedAt: null,
                    },
                    $setOnInsert: {
                        participants: pair.participants,
                        hasMessages: false,
                        lastMessageAt: null,
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
                relationship: 'requested',
            });
        }

        const payload = {
            type: 'follow_request',
            id: String(doc._id),
            username: toSafeUsername(actor?.username),
            profilePicture: actor?.profilePicture ? String(actor.profilePicture) : '',
            message,
            fromUserId: String(userId),
            createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
        };

        // Emit through primary WS server
        emitNotification(targetUserId, payload);
        notifyUser(targetUserId, {
            title: 'New follow request',
            body: `${payload.username} wants to connect`,
            data: { type: 'notifications' },
        });

        return res.status(200).json({
            message: 'Follow request sent',
            requestId: String(doc._id),
            relationship: 'requested',
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
            const msg = v.message === 'You cannot follow yourself' ? 'You cannot unfollow yourself' : v.message;
            return res.status(v.status).json({ message: msg });
        }

        const session = await mongoose.startSession();
        let actor;
        let doc;
        let wasConnected = false;
        const message = 'removed connection';

        try {
            await session.withTransaction(async () => {
                // The callback can be retried, so reset what it sets.
                actor = undefined;
                doc = undefined;
                const existing = await Connection.findOne({ pairKey: normalizePair(userId, targetUserId).pairKey })
                    .select('status')
                    .session(session)
                    .lean();
                wasConnected = existing?.status === 'accepted';

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

                // Only an actual removed connection is announced; cancelling a request
                // (or calling this with no relationship at all) notifies no one.
                if (!wasConnected) return;

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

        if (doc) {
            emitNotification(targetUserId, {
                type: 'unfollow',
                id: String(doc._id),
                username: toSafeUsername(actor?.username),
                profilePicture: actor?.profilePicture ? String(actor.profilePicture) : '',
                message,
                fromUserId: String(userId),
                createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
            });
        }

        return res.status(200).json({
            message: wasConnected ? 'Connection removed' : 'Follow request cancelled',
            relationship: 'none',
        });
    } catch (err) {
        console.error('Error unfollowing user:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const acceptFollowRequest = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!isValidObjectId(userId)) {
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
                    if (!isValidObjectId(notificationId)) {
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
                        if (requesterUserId && isValidObjectId(requesterUserId)) {
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

                if (!isValidObjectId(requesterUserId)) {
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
                            requestedBy: new mongoose.Types.ObjectId(requesterUserId),
                            requestedTo: new mongoose.Types.ObjectId(userId),
                            status: 'accepted',
                            respondedAt: new Date(),
                            acceptedAt: new Date(),
                        },
                        $setOnInsert: {
                            participants: pair.participants,
                            hasMessages: false,
                            lastMessageAt: null,
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
            type: 'follow_accept',
            id: String(doc._id),
            username: toSafeUsername(currentUser?.username),
            profilePicture: currentUser?.profilePicture ? String(currentUser.profilePicture) : '',
            message: acceptedMessage,
            fromUserId: String(userId),
            createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
        };

        emitNotification(requesterUserId, payload);
        notifyUser(requesterUserId, {
            title: 'Request accepted',
            body: `${payload.username} accepted your follow request`,
            data: { type: 'message', peerId: String(userId), peerUsername: payload.username, peerAvatar: payload.profilePicture },
        });

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
        if (!isValidObjectId(userId)) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const notificationId = String(req.body?.notificationId ?? '').trim();
        const requesterUserIdFromBody = String(req.body?.requesterUserId ?? req.body?.fromUserId ?? '').trim();

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                if (notificationId) {
                    if (!isValidObjectId(notificationId)) {
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
                        if (requesterUserIdFromBody && isValidObjectId(requesterUserIdFromBody)) {
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

                    if (requesterUserIdFromBody && isValidObjectId(requesterUserIdFromBody)) {
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

                if (!isValidObjectId(requesterUserIdFromBody)) {
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
        if (!isValidObjectId(userId)) {
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
                    "participants.userId": me,
                    status: 'accepted',
                },
            },
            {
                $project: {
                    peerId: {
                        $first: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$participants",
                                        as: "p",
                                        cond: { $ne: ["$$p.userId", me] }
                                    }
                                },
                                as: "peer",
                                in: "$$peer.userId"
                            }
                        }
                    }
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'peerId',
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
    getRelationshipMap,
};

