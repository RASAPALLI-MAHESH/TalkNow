const WebSocket = require('ws');
const mongoose = require('mongoose');
const Message = require('../models/message');
const Connection = require('../models/connection');
const User = require('../models/user');
const KeyBundle = require('../models/keyBundle');
const { resolveAuthToken } = require('../middleware/authMiddleware');
const { notifyUser } = require('./pushService');
const {
    validateEnvelope,
    acknowledgeMessages,
    createSessionReset,
    acknowledgeResets,
    isObjectIdString,
} = require('./e2eeMessaging');

const AUTH_TIMEOUT_MS = 10 * 1000;
const CLOSE_UNAUTHORIZED = 4001;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

// userId -> Set of authenticated sockets (a user can have several screens/devices open).
const users = new Map();

const addSocket = (userId, ws) => {
    const set = users.get(userId);
    if (set) set.add(ws);
    else users.set(userId, new Set([ws]));
};

const removeSocket = (ws) => {
    const set = ws.userId ? users.get(ws.userId) : null;
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) users.delete(ws.userId);
};

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
    const sockets = users.get(cleanId);
    if (!sockets) return false;

    const message = JSON.stringify(payload);
    let delivered = false;
    for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(message);
            delivered = true;
        }
    }
    return delivered;
};

/**
 * Closes open sockets after their session is revoked: one session (logout)
 * or every session of a user (password reset).
 */
const disconnectSessions = ({ userId, sessionId }) => {
    const sockets = users.get(toSafeId(userId));
    if (!sockets) return;
    for (const socket of [...sockets]) {
        if (!sessionId || socket.sessionId === String(sessionId)) {
            socket.close(CLOSE_UNAUTHORIZED, 'Session ended');
        }
    }
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

/** Tells senders that the recipient's phone now has their messages. */
const emitDeliveryStatuses = (delivered) => {
    for (const d of delivered) {
        emitToUser(d.senderId, { type: 'message_status', id: d.id, status: 'delivered', date: d.date });
    }
};

/**
 * Attaches a WebSocket server to an existing HTTP server.
 * Render only exposes a single port, so WS must share the same server.
 */
const attachWebSocketServer = (httpServer) => {
    const wss = new WebSocket.Server({ server: httpServer, path: '/ws', maxPayload: 64 * 1024 });

    // Ping every socket; one that didn't answer the previous ping is dead (e.g. phone lost signal).
    const heartbeat = setInterval(() => {
        for (const ws of wss.clients) {
            if (ws.isAlive === false) {
                ws.terminate();
                continue;
            }
            ws.isAlive = false;
            ws.ping();
        }
    }, HEARTBEAT_INTERVAL_MS);
    wss.on('close', () => clearInterval(heartbeat));

    wss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        // The first message must be { type: 'auth', token }. Unauthenticated sockets are dropped.
        const authTimer = setTimeout(() => {
            if (!ws.userId) ws.close(CLOSE_UNAUTHORIZED, 'Authentication required');
        }, AUTH_TIMEOUT_MS);

        // One message at a time per socket, so a burst of sends is stored in the order it was sent.
        let queue = Promise.resolve();
        ws.on('message', (raw) => {
            queue = queue.then(() => handleMessage(raw));
        });

        const handleMessage = async (raw) => {
            let data;
            try {
                data = JSON.parse(raw.toString());
            } catch {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
                return;
            }

            try {
                if (data?.type === 'auth') {
                    if (ws.userId) return;

                    // Identity comes only from a valid, unrevoked token, never from the client's claims.
                    const auth = await resolveAuthToken(String(data.token ?? ''));
                    if (!auth) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }));
                        ws.close(CLOSE_UNAUTHORIZED, 'Invalid token');
                        return;
                    }
                    if (ws.readyState !== WebSocket.OPEN) return;

                    const userId = auth.id;
                    clearTimeout(authTimer);
                    ws.userId = userId;
                    ws.sessionId = auth.sid;
                    addSocket(userId, ws);
                    // The phone then fetches GET /messages/pending; messages count as delivered once it acks them.
                    ws.send(JSON.stringify({ type: 'registered', userId }));
                    return;
                }

                if (!ws.userId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
                    return;
                }

                if (data?.type === 'send_message') {
                    const to = toSafeId(data.to);
                    const from = ws.userId;
                    const clientId = data?.clientId ? String(data.clientId).slice(0, 64) : undefined;
                    // Errors carry the client's temporary id so the app knows which message failed.
                    const sendError = (message, code) => ws.send(JSON.stringify({ type: 'error', message, code, clientId }));

                    if (!isValidObjectId(to) || !isValidObjectId(from)) {
                        sendError('Invalid sender/recipient id');
                        return;
                    }

                    if (to === from) {
                        sendError('Cannot message yourself');
                        return;
                    }

                    // Plain text is never accepted: only end-to-end encrypted envelopes.
                    if (data.envelope === undefined && data.content !== undefined) {
                        sendError('Please update TalkNow to keep chatting.', 'update_required');
                        return;
                    }

                    const envelope = validateEnvelope(data.envelope);
                    if (!envelope) {
                        sendError('Invalid encrypted message', 'invalid_envelope');
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
                        sendError('You can only message your connections');
                        return;
                    }

                    // Encrypted for an install the recipient has since replaced: the sender fetches new keys and retries.
                    const recipientKeys = await KeyBundle.findOne({ userId: to }).select('registrationId').lean();
                    if (!recipientKeys) {
                        sendError('This contact needs to update TalkNow before you can message them.', 'recipient_no_keys');
                        return;
                    }
                    if (recipientKeys.registrationId !== envelope.recipientRegistrationId) {
                        sendError('Contact changed phones', 'recipient_keys_changed');
                        return;
                    }

                    // A re-send of a message the recipient couldn't decrypt: not a new message for counters or pushes.
                    let resendOf = null;
                    if (isObjectIdString(data.resendOf)) {
                        const original = await Message.exists({ _id: data.resendOf, senderId: toObjectId(from), receiverId: toObjectId(to) });
                        if (original) resendOf = original._id;
                    }

                    const doc = await Message.create({
                        conversationId: acceptedConnection._id,
                        conversationKey: pair.pairKey,
                        participants: pair.participantObjectIds,
                        senderId: new mongoose.Types.ObjectId(from),
                        receiverId: new mongoose.Types.ObjectId(to),
                        encrypted: true,
                        envelope,
                        resendOf,
                        clientId,
                    });

                    const connectionUpdate = {
                        $set: {
                            hasMessages: true,
                            lastMessageAt: doc.createdAt || new Date(),
                        },
                    };
                    if (!resendOf) connectionUpdate.$inc = { "participants.$[recipient].unreadCount": 1 };
                    await Connection.updateOne(
                        { pairKey: pair.pairKey },
                        connectionUpdate,
                        resendOf ? {} : { arrayFilters: [{ "recipient.userId": new mongoose.Types.ObjectId(to) }] }
                    );

                    emitToUser(to, {
                        type: 'badge_update',
                        connectionId: String(acceptedConnection._id),
                    });

                    const senderObj = await User.findById(from).select('username profilePicture').lean();
                    const date = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString();

                    emitToUser(to, {
                        type: 'new_message',
                        id: String(doc._id),
                        conversationKey: pair.pairKey,
                        to,
                        from,
                        senderName: senderObj?.username,
                        senderAvatar: senderObj?.profilePicture,
                        envelope,
                        resendOf: resendOf ? String(resendOf) : undefined,
                        date,
                    });
                    if (!resendOf) {
                        // Never the message text: the server doesn't have it.
                        notifyUser(to, {
                            title: senderObj?.username || 'TalkNow',
                            body: 'New message',
                            data: { type: 'message', peerId: from, peerUsername: senderObj?.username, peerAvatar: senderObj?.profilePicture },
                        });
                    }

                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'sent',
                            id: String(doc._id),
                            clientId,
                            conversationKey: pair.pairKey,
                            to,
                            from,
                            date,
                        }));
                        ws.send(JSON.stringify({
                            type: 'message_status',
                            id: String(doc._id),
                            clientId,
                            status: 'sent',
                        }));
                    }
                    return;
                }

                // The phone stored these messages (decrypted or not): drop the ciphertext, mark delivered.
                if (data?.type === 'ack') {
                    const delivered = await acknowledgeMessages(ws.userId, data.ids);
                    emitDeliveryStatuses(delivered);
                    if (Array.isArray(data.resetIds) && data.resetIds.length > 0) await acknowledgeResets(ws.userId, data.resetIds);
                    return;
                }

                // We couldn't decrypt some of `to`'s messages: ask them for a fresh session and a re-send.
                if (data?.type === 'session_reset') {
                    const to = toSafeId(data.to);
                    if (!isValidObjectId(to) || to === ws.userId) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid session reset' }));
                        return;
                    }
                    const pair = normalizePair(ws.userId, to);
                    if (!(await Connection.exists({ pairKey: pair.pairKey, status: 'accepted' }))) return;
                    const reset = await createSessionReset(ws.userId, to, data.messageIds);
                    if (reset) emitToUser(to, { type: 'session_reset', ...reset });
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
        };

        ws.on('close', () => {
            clearTimeout(authTimer);
            removeSocket(ws);
        });
    });

    return wss;
};


module.exports = { attachWebSocketServer, emitToUser, emitNotification, disconnectSessions, emitDeliveryStatuses };
