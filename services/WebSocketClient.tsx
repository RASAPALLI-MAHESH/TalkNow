import useAuth from '@/hooks/useAuth';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { WS_URL } from './config';

type WsIncomingMessage = {
    type: string;
    [key: string]: unknown;
};

// deriveWsUrl is now handled in config.ts via WS_URL

export const useWebSocketClient = () => {
    const { user } = useAuth();
    const wsRef = useRef<WebSocket | null>(null);
    // True once the server has accepted our token; it rejects anything sent before that.
    const authedRef = useRef(false);
    const [connected, setConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WsIncomingMessage | null>(null);

    const wsUrl = WS_URL;

    useEffect(() => {
        const userId = user?.id;
        if (!userId) return;

        const socket = new WebSocket(wsUrl);
        wsRef.current = socket;
        authedRef.current = false;

        socket.onopen = async () => {
            // The server identifies us from the token, so it must be the first message.
            const token = await SecureStore.getItemAsync('userToken');
            if (!token || socket.readyState !== WebSocket.OPEN) {
                socket.close();
                return;
            }
            socket.send(JSON.stringify({ type: 'auth', token }));
        };

        socket.onclose = () => {
            authedRef.current = false;
            setConnected(false);
        };

        socket.onerror = () => {
            setConnected(false);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(String(event.data)) as WsIncomingMessage;
                if (data.type === 'registered') {
                    authedRef.current = true;
                    setConnected(true);
                }
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
        if (!from || !socket || socket.readyState !== WebSocket.OPEN || !authedRef.current) return false;

        socket.send(JSON.stringify({
            type: 'send_message',
            to,
            content,
            clientId,
            date: new Date().toISOString(),
        }));
        return true;
    };

    const markRead = (peerId: string, upTo?: string) => {
        const from = user?.id;
        const socket = wsRef.current;
        if (!from || !socket || socket.readyState !== WebSocket.OPEN || !authedRef.current) return false;

        socket.send(JSON.stringify({
            type: 'mark_read',
            peerId,
            upTo,
        }));
        return true;
    };

    return { connected, lastMessage, sendMessage, markRead, wsUrl };
};
