const WebSocket = require('ws');
/**
 * Attaches a WebSocket server to an existing HTTP server.
 * Render only exposes a single port, so WS must share the same server.
 */
const attachWebSocketServer = (httpServer) => {
    const users = new Map();

    const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

    wss.on('connection', (ws) => {
        ws.on('message', (raw) => {
            let data;
            try {
                data = JSON.parse(raw.toString());
            } catch {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
                return;
            }

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
                const content = String(data.content || '');
                const date = data.date || data.Date || new Date().toISOString();

                const payload = { type: 'new_message', to, from, content, date };

                const recipient = users.get(to);
                if (recipient && recipient.readyState === WebSocket.OPEN) {
                    recipient.send(JSON.stringify(payload));
                }

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'sent', ...payload }));
                }
                return;
            }

            ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        });

        ws.on('close', () => {
            const userId = ws.userId;
            if (userId) users.delete(userId);
        });
    });

    return wss;
};

module.exports = { attachWebSocketServer };
