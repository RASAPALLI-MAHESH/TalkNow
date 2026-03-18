const { Server } = require('socket.io');

let io;
// userId -> Set(socketId)
const OnlineUsers = new Map();

const getUserRoom = (userId) => `user:${String(userId || '').trim()}`;

const initializeNotificationSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket) => {
        console.log('A user connected to the notification socket:', socket.id);

        socket.on('register', (userId, ack) => {
            const normalized = String(userId || '').trim();
            if (!normalized) {
                if (typeof ack === 'function') ack({ ok: false, message: 'Missing userId' });
                return;
            }

            // Track reverse mapping for cleanup.
            socket.data.userId = normalized;

            // Allow multiple sockets per user.
            const existing = OnlineUsers.get(normalized);
            if (existing) {
                existing.add(socket.id);
            } else {
                OnlineUsers.set(normalized, new Set([socket.id]));
            }

            // Join a stable room so emits don't rely on one socket id.
            socket.join(getUserRoom(normalized));

            console.log(`User ${normalized} registered with socket ID ${socket.id}`);

            if (typeof ack === 'function') {
                ack({ ok: true, userId: normalized, socketId: socket.id });
            }
        });

        socket.on('disconnect', () => {
            const userId = socket.data?.userId;
            if (userId) {
                const set = OnlineUsers.get(userId);
                if (set) {
                    set.delete(socket.id);
                    if (set.size === 0) {
                        OnlineUsers.delete(userId);
                    }
                }
                console.log(`User ${userId} disconnected (socket ${socket.id}).`);
            }
        });
    });
};

const getIo = () => io;

module.exports = { initializeNotificationSocket, getIo, OnlineUsers, getUserRoom };
