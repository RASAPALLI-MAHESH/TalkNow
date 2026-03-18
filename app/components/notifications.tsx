import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import useAuth from '../../hooks/useAuth';
import FollowRequestNotification from './followrequestNotification';
const HEADER_HEIGHT = 56;

type NotificationItem = {
    id: string;
    username: string;
    message: string;
    createdAt?: string;
    type?: string;
    fromUserId?: string;
};

const inferDevServerBaseUrl = (): string | null => {
    const hostUri = (Constants as any)?.expoConfig?.hostUri as string | undefined;
    if (!hostUri || typeof hostUri !== 'string') return null;

    const host = hostUri.split(':')[0]?.trim();
    if (!host || host === 'localhost' || host === '127.0.0.1') return null;
    return `http://${host}:8080`;
};

const getDefaultApiUrl = (): string => {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (typeof envUrl === 'string' && envUrl.trim().length > 0) return envUrl.trim();

    const inferred = inferDevServerBaseUrl();
    if (inferred) return inferred;

    if (Platform.OS === 'android') return 'http://10.0.2.2:8080';
    return 'http://localhost:8080';
};

const normalizeApiOrigin = (rawUrl: string) => {
    const trimmed = rawUrl.trim().replace(/\/$/, '');
    const withScheme = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : (() => {
            const looksLocal =
                /^localhost\b/i.test(trimmed) ||
                /^127\.0\.0\.1\b/.test(trimmed) ||
                /^\d{1,3}(?:\.\d{1,3}){3}\b/.test(trimmed);
            return `${looksLocal ? 'http' : 'https'}://${trimmed}`;
        })();

    const withoutAuth = withScheme.replace(/\/?api\/?auth\/?$/i, '').replace(/\/?api\/?$/i, '');
    const base = withoutAuth.replace(/\/$/, '');

    // Common deployment mistake: using https with :8080. Render serves 443 externally.
    // Strip :8080 for non-local https URLs.
    const stripped8080 = base.replace(/^(https:\/\/[^/]+):8080(\/|$)/i, '$1$2');

    // If you're pointing at Render with an http URL, Socket.IO polling can fail
    // due to redirects. Upgrade to https for non-local hosts with no explicit port.
    if (
        stripped8080.startsWith('http://') &&
        !stripped8080.includes('localhost') &&
        !stripped8080.includes('127.0.0.1') &&
        !/:\d+$/.test(stripped8080)
    ) {
        return `https://${stripped8080.slice('http://'.length)}`;
    }
    return stripped8080;
};

const Notifications = ({ navigation }: { navigation: any }) => {
    const { user } = useAuth();
    const currentUserId = typeof user?.id === 'string' ? user.id : user?.id ? String(user.id) : '';

    const apiOrigin = useMemo(() => normalizeApiOrigin(getDefaultApiUrl()), []);
    const socketRef = useRef<ReturnType<typeof io> | null>(null);
    const [items, setItems] = useState<NotificationItem[]>([]);

    useEffect(() => {
        // Create socket once per apiOrigin. Do NOT depend on currentUserId here,
        // otherwise effect re-runs will disconnect the socket immediately.
        const socket = io(apiOrigin, {
            // Render/proxies often fail websocket upgrades from mobile clients.
            // Polling is the most reliable transport here.
            transports: ['polling'],
            upgrade: false,
            path: '/socket.io',
            reconnection: true,
            timeout: 20000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('notification socket connected:', { apiOrigin, socketId: socket.id });
        });

        socket.on('disconnect', (reason: any) => {
            console.log('notification socket disconnected:', { apiOrigin, reason });
        });

        socket.on('connect_error', (err: any) => {
            console.log('notification socket connect_error:', {
                apiOrigin,
                message: err?.message ?? String(err),
                description: err?.description,
                type: err?.type,
            });
        });
// the notifiction socket receives new_notification events with the following payload:
        socket.on('new_notification', (notification: any) => {
            const normalized: NotificationItem = {
                id: String(notification?.id ?? `${Date.now()}`),
                username: String(notification?.username ?? 'User'),
                message: String(notification?.message ?? ''),
                createdAt: typeof notification?.createdAt === 'string' ? notification.createdAt : undefined,
                type: typeof notification?.type === 'string' ? notification.type : undefined,
                fromUserId: typeof notification?.fromUserId === 'string' ? notification.fromUserId : undefined,
            };

            console.log('notification received:', { apiOrigin, normalized });

            setItems((prev) => [normalized, ...prev]);
        });

        return () => {
            socket.off('connect_error');
            socket.off('new_notification');
            socket.off('connect');
            socket.off('disconnect');
            socket.disconnect();
            socketRef.current = null;
        };
    }, [apiOrigin]);

    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;
        if (!currentUserId) return;

        const doRegister = () => {
            socket.timeout(5000).emit('register', currentUserId, (err: any, res: any) => {
                if (err) {
                    console.log('notification socket register timeout/error:', { apiOrigin, err });
                    return;
                }
                console.log('notification socket registered:', { apiOrigin, res });
            });
        };

        // Register immediately if connected; otherwise on next connect.
        if (socket.connected) doRegister();
        socket.on('connect', doRegister);

        return () => {
            socket.off('connect', doRegister);
        };
    }, [apiOrigin, currentUserId]);

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Pressable
                    style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
                    onPress={() => navigation.goBack()}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                >
                    <Ionicons name="arrow-back" size={22} color="#1a1073" />
                </Pressable>

                <Text style={styles.headerText} numberOfLines={1}>
                    Notifications
                </Text>

                {/* Right spacer keeps title perfectly centered */}
                <View style={styles.headerRightSpacer} />
            </View>

            <View style={styles.body}>
                <FlatList
                    data={items}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <FollowRequestNotification username={item.username} message={item.message} />
                    )}
                    style={styles.list}
                    contentContainerStyle={[
                        styles.listContent,
                        items.length === 0 && styles.listContentEmpty,
                    ]}
                    ListEmptyComponent={
                        <View style={styles.emptyWrap}>
                            <Text style={styles.emptyTitle}>No notifications yet</Text>
                            <Text style={styles.emptySubtitle}>Follow requests will show up here.</Text>
                        </View>
                    }
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                />
            </View>
        </SafeAreaView>
    );
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        width: '100%',
        height: HEADER_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    headerButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(103,51,208,0.12)',
    },
    headerButtonPressed: {
        opacity: 0.75,
    },
    headerRightSpacer: {
        width: 36,
        height: 36,
    },
    headerText: {
        flex: 1,
        marginHorizontal: 12,
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
        textAlign: 'center',
    },
    body: {
        flex: 1,
        paddingTop: 8,
    },

    list: {
        flex: 1,
        width: '100%',
    },
    listContent: {
        paddingTop: 8,
        paddingBottom: 14,
    },
    listContentEmpty: {
        flexGrow: 1,
        justifyContent: 'center',
    },

    emptyWrap: {
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 6,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 13,
        color: '#666',
        textAlign: 'center',
    },

})
export default Notifications;