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
                    ws.userId = userId;
                    users.set(userId, ws);
                    ws.send(JSON.stringify({ type: 'registered', userId }));
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

                    await Connection.updateOne(
                        { pairKey: pair.pairKey },
                        {
                            $set: {
                                hasMessages: true,
                                lastMessageAt: doc.createdAt || new Date(),
                                lastMessagePreview: content.slice(0, 500),
                            },
                        }
                    );

                    const payload = {
                        type: 'new_message',
                        id: String(doc._id),
                        conversationKey: pair.pairKey,
                        to,
                        from,
                        content,
                        date: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
                    };

                    emitToUser(to, payload);

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'sent', ...payload }));
                    }
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
