import useAuth from '@/hooks/useAuth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WS_URL } from './config';

type WsIncomingMessage = {
    type: string;
    [key: string]: unknown;
};

// deriveWsUrl is now handled in config.ts via WS_URL

export const useWebSocketClient = () => {
    const { user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WsIncomingMessage | null>(null);

    const wsUrl = WS_URL;

    useEffect(() => {
        const userId = user?.id;
        if (!userId) return;

        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
            setConnected(true);
            socket.send(JSON.stringify({ type: 'register', userId }));
        };

        socket.onclose = () => {
            setConnected(false);
        };

        socket.onerror = () => {
            setConnected(false);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(String(event.data)) as WsIncomingMessage;
                setLastMessage(data);
            } catch {
                // ignore non-JSON
            }
        };

        return () => {
            try {
                socket.close();
            } finally {
                wsRef.current = null;
            }
        };
    }, [user?.id, wsUrl]);

    const sendMessage = (to: string, content: string, clientId?: string) => {
        const from = user?.id;
        const socket = wsRef.current;
        if (!from || !socket || socket.readyState !== WebSocket.OPEN) return false;

        socket.send(JSON.stringify({
            type: 'send_message',
            to,
            from,
            content,
            clientId,
            date: new Date().toISOString(),
        }));
        return true;
    };

    const markRead = (peerId: string, upTo?: string) => {
        const from = user?.id;
        const socket = wsRef.current;
        if (!from || !socket || socket.readyState !== WebSocket.OPEN) return false;

        socket.send(JSON.stringify({
            type: 'mark_read',
            peerId,
            upTo,
        }));
        return true;
    };

    return { connected, lastMessage, sendMessage, markRead, wsUrl };
};
