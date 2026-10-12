const mongoose = require('mongoose');
const Message = require('../models/message');
const Connection = require('../models/connection');
const { getActorUserId, isValidObjectId } = require('./identityUtils');

const toSafeUsername = (value) => {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : 'User';
};

const normalizePair = (leftId, rightId) => {
    const a = String(leftId || '').trim();
    const b = String(rightId || '').trim();
    if (!isValidObjectId(a) || !isValidObjectId(b)) return null;
    const ids = [a, b].sort();
    return {
        pairKey: `${ids[0]}:${ids[1]}`,
        participantObjectIds: [new mongoose.Types.ObjectId(ids[0]), new mongoose.Types.ObjectId(ids[1])],
    };
};

const getInbox = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!isValidObjectId(userId)) return res.status(401).json({ message: 'Unauthorized' });

        const limitRaw = Number.parseInt(String(req.query?.limit ?? ''), 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

        const me = new mongoose.Types.ObjectId(userId);

        const rows = await Connection.aggregate([
            {
                $match: {
                    "participants.userId": me,
                    status: 'accepted',
                    hasMessages: true,
                    lastMessageAt: { $ne: null },
                },
            },
            { $sort: { lastMessageAt: -1 } },
            { $limit: limit },
            {
                $addFields: {
                    me: {
                        $first: {
                            $filter: {
                                input: "$participants",
                                as: "p",
                                cond: { $eq: ["$$p.userId", me] }
                            }
                        }
                    },
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
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "peerId",
                    foreignField: "_id",
                    as: "peerDocs",
                    pipeline: [{ $project: { _id: 1, username: 1, profilePicture: 1 } }],
                }
            },
            {
                $project: {
                    pairKey: 1,
                    lastMessageAt: 1,
                    lastMessagePreview: 1,
                    unreadCount: "$me.unreadCount",
                    peer: { $arrayElemAt: ['$peerDocs', 0] },
                },
            },
        ]);

        const chats = rows
            .filter((row) => row?.peer?._id)
            .map((row) => ({
                id: String(row.peer._id),
                username: toSafeUsername(row.peer.username),
                profilePicture: typeof row.peer.profilePicture === 'string' ? row.peer.profilePicture : '',
                lastMessage: typeof row.lastMessagePreview === 'string' && row.lastMessagePreview.trim()
                    ? row.lastMessagePreview
                    : 'New message',
                date: row.lastMessageAt ? new Date(row.lastMessageAt).toISOString() : '',
                conversationKey: String(row.pairKey || ''),
                unreadCount: row.unreadCount || 0,
            }));

        return res.status(200).json({ chats });
    } catch (err) {
        console.error('Error fetching inbox:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getConversationMessages = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!isValidObjectId(userId)) return res.status(401).json({ message: 'Unauthorized' });

        const peerId = String(req.params?.peerId ?? '').trim();
        if (!isValidObjectId(peerId)) return res.status(400).json({ message: 'Invalid peerId' });
        if (peerId === userId) return res.status(400).json({ message: 'Invalid peerId' });

        const pair = normalizePair(userId, peerId);
        if (!pair) return res.status(400).json({ message: 'Invalid participants' });

        const limitRaw = Number.parseInt(String(req.query?.limit ?? ''), 10);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

        const beforeRaw = String(req.query?.before ?? '').trim();
        const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
        const beforeFilter = beforeDate && !Number.isNaN(beforeDate.getTime()) ? { createdAt: { $lt: beforeDate } } : {};

        const docs = await Message.find({
            conversationKey: pair.pairKey,
            ...beforeFilter,
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const messages = docs
            .map((m) => ({
                id: String(m._id),
                text: String(m.content ?? ''),
                sender: String(m.senderId) === userId ? 'me' : 'other',
                status:
                    String(m.senderId) === userId
                        ? (m.readAt ? 'read' : (m.deliveredAt ? 'delivered' : 'sent'))
                        : undefined,
                from: String(m.senderId),
                to: String(m.receiverId),
                createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
            }));

        return res.status(200).json({ messages });
    } catch (err) {
        console.error('Error fetching conversation messages:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

const getConnectionCounters = async (req, res) => {
    try {
        const userId = getActorUserId(req);
        if (!isValidObjectId(userId)) return res.status(401).json({ message: 'Unauthorized' });

        const me = new mongoose.Types.ObjectId(userId);

        const [counts] = await Connection.aggregate([
            { $match: { "participants.userId": me } },
            {
                $group: {
                    _id: null,
                    mutual: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0],
                        },
                    },
                    pending: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'pending'] },
                                        { $eq: ['$requestedTo', me] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                    chatActive: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'accepted'] },
                                        { $eq: ['$hasMessages', true] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]);

        return res.status(200).json({
            counters: {
                mutual: Number(counts?.mutual ?? 0),
                pending: Number(counts?.pending ?? 0),
                chatActive: Number(counts?.chatActive ?? 0),
            },
        });
    } catch (err) {
        console.error('Error fetching connection counters:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports = {
    getInbox,
    getConversationMessages,
    getConnectionCounters,
};
