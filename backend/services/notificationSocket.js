const { Server } = require('socket.io');

let io;
const OnlineUsers = new Map();

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
            OnlineUsers.set(normalized, socket.id);
            console.log(`User ${normalized} registered with socket ID ${socket.id}`);

            if (typeof ack === 'function') {
                ack({ ok: true, userId: normalized, socketId: socket.id });
            }
        });

        socket.on('disconnect', () => {
            for (const [userId, socketId] of OnlineUsers.entries()) {
                if (socketId === socket.id) {
                    OnlineUsers.delete(userId);
                    console.log(`User ${userId} disconnected and removed from online users.`);
                    break;
                }
            }
        });
    });
};

const getIo = () => io;

module.exports = { initializeNotificationSocket, getIo, OnlineUsers };
