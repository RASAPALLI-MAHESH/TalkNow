import useAuth from '@/hooks/useAuth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getFreshAccessToken, refreshAccessToken } from './AuthService';
import { WS_URL } from './config';

export type WsIncomingMessage = {
    type: string;
    [key: string]: unknown;
};

type Listener = (message: WsIncomingMessage) => void;

type WebSocketContextValue = {
    connected: boolean;
    subscribe: (listener: Listener) => () => void;
    sendMessage: (to: string, content: string, clientId?: string) => boolean;
    markRead: (peerId: string, upTo?: string) => boolean;
};

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

// Server close code for a rejected or ended session.
const CLOSE_UNAUTHORIZED = 4001;
const MAX_RECONNECT_DELAY_MS = 30 * 1000;

/**
 * One WebSocket for the whole app while a user is signed in. It authenticates with the
 * access token, reconnects with backoff, and fans every message out to subscribed screens.
 */
export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const userId = typeof user?.id === 'string' ? user.id : user?.id ? String(user.id) : '';

    const wsRef = useRef<WebSocket | null>(null);
    // True once the server has accepted our token; it rejects anything sent before that.
    const authedRef = useRef(false);
    const listenersRef = useRef(new Set<Listener>());
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (!userId) return;

        let stopped = false;
        let socket: WebSocket | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let attempt = 0;

        const scheduleReconnect = () => {
            if (stopped || retryTimer) return;
            const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** attempt) * (0.5 + Math.random() / 2);
            attempt += 1;
            retryTimer = setTimeout(() => {
                retryTimer = null;
                connect();
            }, delay);
        };

        const connect = () => {
            if (stopped) return;
            const ws = new WebSocket(WS_URL);
            socket = ws;
            wsRef.current = ws;
            authedRef.current = false;

            ws.onopen = async () => {
                // The server identifies us from the token, so it must be the first message.
                let token: string | null = null;
                try {
                    token = await getFreshAccessToken();
                } catch {
                    token = null;
                }
                if (stopped || ws !== socket) return;
                if (!token) {
                    ws.close();
                    return;
                }
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'auth', token }));
            };

            ws.onmessage = (event) => {
                let data: WsIncomingMessage;
                try {
                    data = JSON.parse(String(event.data)) as WsIncomingMessage;
                } catch {
                    return; // ignore non-JSON
                }
                if (data.type === 'registered') {
                    authedRef.current = true;
                    attempt = 0;
                    setConnected(true);
                }
                for (const listener of listenersRef.current) {
                    try {
                        listener(data);
                    } catch (err) {
                        console.error('WebSocket listener error', err);
                    }
                }
            };

            ws.onclose = (event) => {
                if (ws !== socket) return;
                authedRef.current = false;
                setConnected(false);
                if (stopped) return;

                if (event.code === CLOSE_UNAUTHORIZED) {
                    // Token rejected: refresh it first. If the session is gone this signs the user out.
                    refreshAccessToken()
                        .then((token) => {
                            if (token) scheduleReconnect();
                        })
                        .catch(scheduleReconnect);
                    return;
                }
                scheduleReconnect();
            };
        };

        connect();

        // Reconnect straight away when the app comes back to the foreground.
        const appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active' || stopped) return;
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
            if (retryTimer) {
                clearTimeout(retryTimer);
                retryTimer = null;
            }
            attempt = 0;
            connect();
        });

        return () => {
            stopped = true;
            appStateSubscription.remove();
            if (retryTimer) clearTimeout(retryTimer);
            socket?.close();
            wsRef.current = null;
            authedRef.current = false;
            setConnected(false);
        };
    }, [userId]);

    const subscribe = useCallback((listener: Listener) => {
        listenersRef.current.add(listener);
        return () => {
            listenersRef.current.delete(listener);
        };
    }, []);

    const send = useCallback((payload: Record<string, unknown>) => {
        const socket = wsRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN || !authedRef.current) return false;
        socket.send(JSON.stringify(payload));
        return true;
    }, []);

    const sendMessage = useCallback(
        (to: string, content: string, clientId?: string) =>
            send({ type: 'send_message', to, content, clientId, date: new Date().toISOString() }),
        [send]
    );

    const markRead = useCallback(
        (peerId: string, upTo?: string) => send({ type: 'mark_read', peerId, upTo }),
        [send]
    );

    const value = useMemo(
        () => ({ connected, subscribe, sendMessage, markRead }),
        [connected, subscribe, sendMessage, markRead]
    );

    return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};

export const useWebSocketClient = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocketClient must be used within a WebSocketProvider');
    }
    return context;
};

/**
 * Calls `handler` for every message on the shared socket. The latest handler is always
 * used, so it can read current props and state without re-subscribing.
 */
export const useSocketEvents = (handler: Listener) => {
    const { subscribe } = useWebSocketClient();
    const handlerRef = useRef(handler);

    useEffect(() => {
        handlerRef.current = handler;
    });

    useEffect(() => subscribe((message) => handlerRef.current(message)), [subscribe]);
};
