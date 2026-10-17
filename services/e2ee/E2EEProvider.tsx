import useAuth from '@/hooks/useAuth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useWebSocketClient } from '../WebSocketClient';
import { E2EEEngine, E2EEEvent, EngineState } from './engine';
import { LocalMessage, LocalStore } from './localStore';

type E2EEContextValue = { engine: E2EEEngine | null; state: EngineState };

const E2EEContext = createContext<E2EEContextValue>({ engine: null, state: { status: 'starting' } });

/** Runs the end-to-end encryption engine for the signed-in account. Must sit inside WebSocketProvider. */
export const E2EEProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const userId = typeof user?.id === 'string' ? user.id : user?.id ? String(user.id) : '';
    const { connected, subscribe, send } = useWebSocketClient();
    const [engine, setEngine] = useState<E2EEEngine | null>(null);
    const [state, setState] = useState<EngineState>({ status: 'starting' });

    const connectedRef = useRef(connected);
    const sendRef = useRef(send);
    useEffect(() => {
        connectedRef.current = connected;
        sendRef.current = send;
    });

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        let created: E2EEEngine | null = null;
        setState({ status: 'starting' });

        LocalStore.open(userId)
            .then((store) => {
                if (cancelled) {
                    void store.close();
                    return;
                }
                created = new E2EEEngine(store, userId, {
                    send: (payload) => sendRef.current(payload),
                    isConnected: () => connectedRef.current,
                });
                created.subscribe((e) => {
                    if (e.type === 'state') setState(e.state);
                });
                setEngine(created);
                created.start();
                // The socket may have connected before the database was open.
                if (connectedRef.current) created.onRegistered();
            })
            .catch((err) => {
                console.error('[e2ee] could not open the encrypted store', err);
                if (!cancelled) setState({ status: 'error', error: 'Could not open encrypted storage on this phone.' });
            });

        return () => {
            cancelled = true;
            setEngine(null);
            void created?.stop();
        };
    }, [userId]);

    useEffect(() => (engine ? subscribe((message) => engine.onSocketMessage(message)) : undefined), [engine, subscribe]);

    const value = useMemo(() => ({ engine, state }), [engine, state]);
    return <E2EEContext.Provider value={value}>{children}</E2EEContext.Provider>;
};

export const useE2EE = () => useContext(E2EEContext);

/** Calls `handler` for every engine event, always with the latest handler. */
export const useE2EEEvents = (handler: (e: E2EEEvent) => void) => {
    const { engine } = useE2EE();
    const handlerRef = useRef(handler);
    useEffect(() => {
        handlerRef.current = handler;
    });
    useEffect(() => (engine ? engine.subscribe((e) => handlerRef.current(e)) : undefined), [engine]);
};

const PAGE_SIZE = 50;

/** The decrypted messages of one conversation, newest first, kept in sync with the local store. */
export const useConversation = (peerId: string) => {
    const { engine } = useE2EE();
    const [messages, setMessages] = useState<LocalMessage[]>([]);
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [loaded, setLoaded] = useState(false);
    const latestRequest = useRef(0);

    const reload = useCallback(async () => {
        if (!engine || !peerId) return;
        const request = ++latestRequest.current;
        const rows = await engine.getMessages(peerId, limit);
        if (request !== latestRequest.current) return; // a newer reload is on its way
        setMessages(rows);
        setLoaded(true);
    }, [engine, peerId, limit]);

    useEffect(() => {
        void reload().catch((err) => console.warn('[e2ee] could not read messages', err));
    }, [reload]);

    useE2EEEvents((e) => {
        if (e.type === 'messages' && e.peerId === peerId) void reload().catch(() => undefined);
    });

    const hasMore = messages.length >= limit;
    const loadMore = useCallback(() => {
        if (hasMore) setLimit((l) => l + PAGE_SIZE);
    }, [hasMore]);

    return { messages, loaded, hasMore, loadMore };
};
