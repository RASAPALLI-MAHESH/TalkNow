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
    const withoutAuth = trimmed.replace(/\/?api\/?auth\/?$/i, '').replace(/\/?api\/?$/i, '');
    return withoutAuth.replace(/\/$/, '');
};

const Notifications = ({ navigation }: { navigation: any }) => {
    const { user } = useAuth();
    const currentUserId = typeof user?.id === 'string' ? user.id : user?.id ? String(user.id) : '';

    const apiOrigin = useMemo(() => normalizeApiOrigin(getDefaultApiUrl()), []);
    const socketRef = useRef<ReturnType<typeof io> | null>(null);
    const [items, setItems] = useState<NotificationItem[]>([]);

    useEffect(() => {
        const socket = io(apiOrigin, {
            // Render/proxies may require polling fallback; allow both.
            transports: ['websocket', 'polling'],
            reconnection: true,
            timeout: 10000,
        });
        socketRef.current = socket;

        const register = () => {
            if (currentUserId) {
                socket.emit('register', currentUserId);
            }
        };
//connect and reconnect events are emitted by the socket when a connection is established or re-established, respectively. We listen for these events to register the user with the server whenever a connection is made.
        socket.on('connect', register);
        socket.on('reconnect', register);

        socket.on('connect_error', (err: any) => {
            console.log('notification socket connect_error:', err?.message ?? err);
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

            setItems((prev) => [normalized, ...prev]);
        });

        return () => {
            socket.off('connect', register);
            socket.off('reconnect', register);
            socket.off('connect_error');
            socket.off('new_notification');
            socket.disconnect();
            socketRef.current = null;
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
                    ListEmptyComponent={
                        <Text style={styles.bodyText}>
                            No notifications yet.
                        </Text>
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
    bodyText: {
        fontSize: 14,
        color: '#666',
        paddingHorizontal: 16,
        paddingTop: 16,
    },

})
export default Notifications;