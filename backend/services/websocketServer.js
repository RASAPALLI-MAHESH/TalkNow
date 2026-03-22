const WebSocket = require('ws');
const mongoose = require('mongoose');
const Message = require('../models/message');
const Connection = require('../models/connection');
const User = require('../models/user');

const users = new Map();

const toSafeId = (value) => {
    if (value && typeof value === 'object') {
        if (value._id) return String(value._id).trim();
        if (value.id) return String(value.id).trim();
    }
    return String(value || '').trim();
};
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(toSafeId(value));

const normalizePair = (leftId, rightId) => {
    const ids = [toSafeId(leftId), toSafeId(rightId)].sort();
    return {
        pairKey: `${ids[0]}:${ids[1]}`,
        participantObjectIds: [new mongoose.Types.ObjectId(ids[0]), new mongoose.Types.ObjectId(ids[1])],
    };
};

const emitToUser = (userId, payload) => {
    const cleanId = toSafeId(userId);
    const recipient = users.get(cleanId);
    if (recipient && recipient.readyState === WebSocket.OPEN) {
        recipient.send(JSON.stringify(payload));
        return true;
    }
    return false;
};

/**
 * Sends a notification payload to a specific user.
 * Alias for emitToUser for semantic clarity in notification flows.
 */
const emitNotification = (toUserId, payload) => {
    // Destructure the notification's own `type` (e.g. 'follow_request') so it
    // doesn't collide with the WebSocket envelope `type: 'new_notification'`.
    const { type: notificationType, ...rest } = payload;
    return emitToUser(toUserId, {
        type: 'new_notification',
        notificationType: notificationType || undefined,
        ...rest,
    });
};

const toObjectId = (value) => new mongoose.Types.ObjectId(toSafeId(value));

/**
 * Attaches a WebSocket server to an existing HTTP server.
 * Render only exposes a single port, so WS must share the same server.
 */
const attachWebSocketServer = (httpServer) => {
    const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

    wss.on('connection', (ws) => {
        ws.on('message', async (raw) => {
            let data;
            try {
                data = JSON.parse(raw.toString());
            } catch {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
                return;
            }

            try {
                if (data?.type === 'register') {
                    const userId = toSafeId(data.userId);
                    if (!userId) {
                        ws.send(JSON.stringify({ type: 'error', message: 'userId is required for register' }));
                        return;
                    }
                    if (!isValidObjectId(userId)) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid userId for register' }));
                        return;
                    }
                    ws.userId = userId;
                    users.set(userId, ws);
                    ws.send(JSON.stringify({ type: 'registered', userId }));

                    // Mark previously queued messages as delivered when receiver comes online.
                    const undelivered = await Message.find({
                        receiverId: toObjectId(userId),
                        deliveredAt: null,
                    })
                        .select('_id senderId')
                        .lean();

                    if (undelivered.length > 0) {
                        const ids = undelivered.map((m) => m._id);
                        const deliveredAt = new Date();
                        await Message.updateMany(
                            { _id: { $in: ids }, deliveredAt: null },
                            { $set: { deliveredAt } }
                        );

                        const deliveredIso = deliveredAt.toISOString();
                        for (const m of undelivered) {
                            emitToUser(String(m.senderId), {
                                type: 'message_status',
                                id: String(m._id),
                                status: 'delivered',
                                date: deliveredIso,
                            });
                        }
                    }
                    return;
                }

                if (data?.type === 'send_message') {
                    const to = toSafeId(data.to);
                    const from = toSafeId(data.from);
                    const content = String(data.content || '').trim();

                    if (!isValidObjectId(to) || !isValidObjectId(from)) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid sender/recipient id' }));
                        return;
                    }

                    if (to === from) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Cannot message yourself' }));
                        return;
                    }

                    if (!content) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Message content is required' }));
                        return;
                    }

                    const pair = normalizePair(from, to);

                    const acceptedConnection = await Connection.findOne({
                        pairKey: pair.pairKey,
                        status: 'accepted',
                    })
                        .select('_id')
                        .lean();

                    if (!acceptedConnection?._id) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Only accepted connections can exchange messages' }));
                        return;
                    }

                    const doc = await Message.create({
                        conversationId: acceptedConnection._id,
                        conversationKey: pair.pairKey,
                        participants: pair.participantObjectIds,
                        senderId: new mongoose.Types.ObjectId(from),
                        receiverId: new mongoose.Types.ObjectId(to),
                        content,
                    });

                    const previewText = content.length > 500 ? content.slice(0, 497) + '...' : content;

                    await Connection.updateOne(
                        { pairKey: pair.pairKey },
                        {
                            $set: {
                                hasMessages: true,
                                lastMessageAt: doc.createdAt || new Date(),
                                lastMessagePreview: previewText,
                            },
                            $inc: {
                                "participants.$[recipient].unreadCount": 1
                            }
                        },
                        {
                            arrayFilters: [{ "recipient.userId": new mongoose.Types.ObjectId(to) }]
                        }
                    );

                    // Add badge update emission to satisfy Stage 4 requirement
                    emitToUser(to, {
                        type: 'badge_update',
                        connectionId: String(acceptedConnection._id),
                    });

                    const senderObj = await User.findById(from).select('username profilePicture').lean();

                    const payload = {
                        type: 'new_message',
                        id: String(doc._id),
                        conversationKey: pair.pairKey,
                        to,
                        from,
                        senderName: senderObj?.username,
                        senderAvatar: senderObj?.profilePicture,
                        content,
                        clientId: data?.clientId ? String(data.clientId) : undefined,
                        date: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
                    };

                    const deliveredNow = emitToUser(to, payload);

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'sent', ...payload }));
                        ws.send(JSON.stringify({
                            type: 'message_status',
                            id: String(doc._id),
                            clientId: data?.clientId ? String(data.clientId) : undefined,
                            status: 'sent',
                        }));
                    }

                    if (deliveredNow) {
                        const deliveredAt = new Date();
                        await Message.updateOne(
                            { _id: doc._id, deliveredAt: null },
                            { $set: { deliveredAt } }
                        );

                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'message_status',
                                id: String(doc._id),
                                clientId: data?.clientId ? String(data.clientId) : undefined,
                                status: 'delivered',
                                date: deliveredAt.toISOString(),
                            }));
                        }
                    }
                    return;
                }

                if (data?.type === 'mark_read') {
                    const readerId = toSafeId(ws.userId);
                    const peerId = toSafeId(data.peerId);
                    const upTo = String(data.upTo || '').trim();

                    if (!isValidObjectId(readerId) || !isValidObjectId(peerId)) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid peerId/readerId for mark_read' }));
                        return;
                    }

                    const pair = normalizePair(readerId, peerId);
                    const readAt = new Date();
                    const query = {
                        conversationKey: pair.pairKey,
                        senderId: toObjectId(peerId),
                        receiverId: toObjectId(readerId),
                        readAt: null,
                    };

                    if (upTo) {
                        const d = new Date(upTo);
                        if (!Number.isNaN(d.getTime())) {
                            query.createdAt = { $lte: d };
                        }
                    }

                    const unread = await Message.find(query)
                        .select('_id')
                        .lean();

                    const ids = unread.map((m) => m._id);

                    if (ids.length > 0) {
                        await Message.updateMany(
                            { _id: { $in: ids }, readAt: null },
                            { $set: { readAt, deliveredAt: readAt } }
                        );
                    }

                    await Connection.updateOne(
                        { pairKey: pair.pairKey },
                        {
                            $set: {
                                "participants.$[reader].unreadCount": 0,
                                "participants.$[reader].lastReadAt": readAt
                            }
                        },
                        {
                            arrayFilters: [{ "reader.userId": new mongoose.Types.ObjectId(readerId) }]
                        }
                    );

                    emitToUser(peerId, {
                        type: 'messages_read',
                        ids: ids.map((id) => String(id)),
                        readAt: readAt.toISOString(),
                        by: readerId,
                    });
                    
                    // Tell the reader to update their own notification badging
                    emitToUser(readerId, {
                        type: 'badge_update',
                        connectionId: String(pair.pairKey),
                    });
                    return;
                }

                ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
            } catch (err) {
                console.error('WebSocket message handling error:', err);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
                }
            }
        });

        ws.on('close', () => {
            const userId = ws.userId;
            if (userId) users.delete(userId);
        });
    });

    return wss;
};


module.exports = { attachWebSocketServer, emitToUser, emitNotification };
