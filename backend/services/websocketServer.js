const WebSocket = require('ws');
const mongoose = require('mongoose');
const Message = require('../models/message');
const Connection = require('../models/connection');

const users = new Map();

const toSafeId = (value) => String(value || '').trim();
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(toSafeId(value));

const normalizePair = (leftId, rightId) => {
    const ids = [toSafeId(leftId), toSafeId(rightId)].sort();
    return {
        pairKey: `${ids[0]}:${ids[1]}`,
        participantObjectIds: [new mongoose.Types.ObjectId(ids[0]), new mongoose.Types.ObjectId(ids[1])],
    };
};

const emitToUser = (userId, payload) => {
    const recipient = users.get(String(userId || '').trim());
    if (recipient && recipient.readyState === WebSocket.OPEN) {
        recipient.send(JSON.stringify(payload));
        return true;
    }
    return false;
};

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value).trim());

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
                    const userId = String(data.userId || '').trim();
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
                    const to = String(data.to || '').trim();
                    const from = String(data.from || '').trim();
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

                    const payload = {
                        type: 'new_message',
                        id: String(doc._id),
                        conversationKey: pair.pairKey,
                        to,
                        from,
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
                    const readerId = String(ws.userId || '').trim();
                    const peerId = String(data.peerId || '').trim();
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

                    if (unread.length === 0) {
                        return;
                    }

                    const ids = unread.map((m) => m._id);

                    await Message.updateMany(
                        { _id: { $in: ids }, readAt: null },
                        { $set: { readAt, deliveredAt: readAt } }
                    );

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


module.exports = { attachWebSocketServer, emitToUser };
