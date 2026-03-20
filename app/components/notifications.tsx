import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import useAuth from '../../hooks/useAuth';
import {
    acceptFollowRequest as acceptFollowRequestApi,
    deleteNotification,
    getMutualConnections,
    getNotifications,
    rejectFollowRequest as rejectFollowRequestApi,
    type MutualConnectionDto,
    type NotificationDto,
} from '../../services/AuthService';
import AvatarPicker from './AvatarPicker';
import FollowRequestComponent from './followRequestComponent';
import FollowRequestNotification from './followrequestNotification';
const HEADER_HEIGHT = 56;
const TAB_TITLES = ['Notifications', 'Follow requests', 'All collections'] as const;

const LAST_SEEN_KEY = 'notificationsLastSeenAt';

type NotificationItem = {
    id: string;
    username: string;
    profilePicture?: string;
    message: string;
    createdAt?: string;
    type?: string;
    fromUserId?: string;
};

type MutualConnectionItem = {
    id: string;
    username: string;
    profilePicture?: string;
    message: string;
};

const mergeByIdNewestFirst = (incoming: NotificationItem[], existing: NotificationItem[]) => {
    const map = new Map<string, NotificationItem>();
    for (const item of existing) map.set(item.id, item);
    for (const item of incoming) map.set(item.id, item);
    const merged = Array.from(map.values());
    merged.sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
    });
    return merged;
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
    const pagerRef = useRef<ScrollView | null>(null);
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const [followActionPendingById, setFollowActionPendingById] = useState<Record<string, boolean>>({});
    const [connections, setConnections] = useState<MutualConnectionItem[]>([]);
    const [connectionsLoading, setConnectionsLoading] = useState(false);
    const [collectionsQuery, setCollectionsQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const { width } = useWindowDimensions();

    const followRequestItems = useMemo(() => {
        return items.filter((item) => {
            const type = String(item.type || '').toLowerCase();
            return type === 'follow_request';
        });
    }, [items]);

    const filteredConnections = useMemo(() => {
        const q = collectionsQuery.trim().toLowerCase();
        if (!q) return connections;
        return connections.filter((item) => {
            const username = String(item.username || '').toLowerCase();
            const message = String(item.message || '').toLowerCase();
            return username.includes(q) || message.includes(q);
        });
    }, [collectionsQuery, connections]);

    const goToTab = (index: number) => {
        setActiveTab(index);
        pagerRef.current?.scrollTo({ x: width * index, y: 0, animated: true });
    };

    const loadNotifications = useCallback(async () => {
        if (!currentUserId) return;
        try {
            setLoading(true);
            const res = await getNotifications();
            const list = Array.isArray((res as any)?.notifications) ? ((res as any).notifications as NotificationDto[]) : [];
            const normalized: NotificationItem[] = list.map((n) => ({
                id: String(n.id),
                username: String(n.username ?? 'User'),
                profilePicture: typeof n.profilePicture === 'string' ? n.profilePicture : '',
                message: String(n.message ?? ''),
                createdAt: typeof n.createdAt === 'string' ? n.createdAt : undefined,
                type: typeof n.type === 'string' ? n.type : undefined,
                fromUserId: typeof n.fromUserId === 'string' ? n.fromUserId : undefined,
            }));

            setItems((prev) => mergeByIdNewestFirst(normalized, prev));

            // Mark as seen after a successful fetch.
            await SecureStore.setItemAsync(LAST_SEEN_KEY, new Date().toISOString());
        } catch (err: any) {
            // Keep UI usable even if API is temporarily unreachable.
            console.log('notification fetch error:', { apiOrigin, message: err?.message ?? String(err) });
        } finally {
            setLoading(false);
        }
    }, [apiOrigin, currentUserId]);

    useEffect(() => {
        void loadNotifications();
    }, [loadNotifications]);

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
                profilePicture: typeof notification?.profilePicture === 'string' ? notification.profilePicture : '',
                message: String(notification?.message ?? ''),
                createdAt: typeof notification?.createdAt === 'string' ? notification.createdAt : undefined,
                type: typeof notification?.type === 'string' ? notification.type : undefined,
                fromUserId: typeof notification?.fromUserId === 'string' ? notification.fromUserId : undefined,
            };

            console.log('notification received:', { apiOrigin, normalized });

            setItems((prev) => [normalized, ...prev]);

            // If you're already on this screen, treat it as seen.
            void SecureStore.setItemAsync(LAST_SEEN_KEY, new Date().toISOString());
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

    const dismissNotification = async (id: string) => {
        const trimmed = String(id || '').trim();
        if (!trimmed) return;

        let snapshot: NotificationItem[] | null = null;
        setItems((prev) => {
            snapshot = prev;
            return prev.filter((n) => n.id !== trimmed);
        });
        try {
            await deleteNotification(trimmed);
        } catch (err: any) {
            console.log('notification dismiss error:', { apiOrigin, message: err?.message ?? String(err) });
            // Rollback so user doesn't lose it if delete failed.
            if (snapshot) setItems(snapshot);
        }
    };

    const loadConnections = useCallback(async () => {
        if (!currentUserId) return;
        try {
            setConnectionsLoading(true);
            const res = await getMutualConnections();
            const list = Array.isArray((res as any)?.connections)
                ? ((res as any).connections as MutualConnectionDto[])
                : [];

            const normalized = list.map((item) => ({
                id: String(item.id),
                username: String(item.username ?? 'User'),
                profilePicture: typeof item.profilePicture === 'string' ? item.profilePicture : '',
                message: String(item.message ?? 'Connected'),
            }));

            setConnections(normalized);
        } catch (err: any) {
            console.log('connections fetch error:', { apiOrigin, message: err?.message ?? String(err) });
        } finally {
            setConnectionsLoading(false);
        }
    }, [apiOrigin, currentUserId]);

    const handlePullToRefresh = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await Promise.all([loadNotifications(), loadConnections()]);
        } finally {
            setRefreshing(false);
        }
    }, [loadConnections, loadNotifications, refreshing]);

    const handleAcceptFollowRequest = async (id: string) => {
        const request = items.find((item) => item.id === id);
        if (!request) return;
        if (followActionPendingById[id]) return;

        let snapshot: NotificationItem[] | null = null;
        setFollowActionPendingById((prev) => ({ ...prev, [id]: true }));
        setItems((prev) => {
            snapshot = prev;
            return prev.filter((item) => item.id !== id);
        });

        try {
            await acceptFollowRequestApi(id, request.fromUserId);
            await loadConnections();
        } catch (err: any) {
            const status = Number(err?.response?.status);
            if (status === 404) {
                // Already handled on backend or stale client state; treat as processed.
                await loadConnections();
            } else {
                console.log('follow request accept error:', { apiOrigin, message: err?.message ?? String(err), status });
                if (snapshot) setItems(snapshot);
            }
        } finally {
            setFollowActionPendingById((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handleRejectFollowRequest = async (id: string) => {
        const request = items.find((item) => item.id === id);
        if (!request) return;
        if (followActionPendingById[id]) return;

        let snapshot: NotificationItem[] | null = null;
        setFollowActionPendingById((prev) => ({ ...prev, [id]: true }));
        setItems((prev) => {
            snapshot = prev;
            return prev.filter((item) => item.id !== id);
        });

        try {
            await rejectFollowRequestApi(id, request.fromUserId);
        } catch (err: any) {
            const status = Number(err?.response?.status);
            if (status !== 404) {
                console.log('follow request reject error:', { apiOrigin, message: err?.message ?? String(err), status });
                if (snapshot) setItems(snapshot);
            }
        } finally {
            setFollowActionPendingById((prev) => ({ ...prev, [id]: false }));
        }
    };

    useEffect(() => {
        void loadConnections();
    }, [loadConnections]);

    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;
        if (!currentUserId) return;

        const doRegister = () => {
            if (!socket.connected) return;
            try {
                socket.timeout(5000).emit('register', currentUserId, (err: any, res: any) => {
                    if (err) {
                        console.log('notification socket register timeout/error:', { apiOrigin, err });
                        return;
                    }
                    console.log('notification socket registered:', { apiOrigin, res });
                });
            } catch (err: any) {
                console.log('notification socket register exception:', { apiOrigin, message: err?.message ?? String(err) });
            }
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

            <View style={styles.tabsRow}>
                {TAB_TITLES.map((title, index) => {
                    const selected = activeTab === index;
                    return (
                        <Pressable
                            key={title}
                            style={({ pressed }) => [
                                styles.tabButton,
                                selected && styles.tabButtonActive,
                                pressed && styles.tabButtonPressed,
                            ]}
                            onPress={() => goToTab(index)}
                            accessibilityRole="button"
                            accessibilityLabel={title}
                        >
                            <Text style={[styles.tabText, selected && styles.tabTextActive]} numberOfLines={1}>
                                {title}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                    const nextTab = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
                    setActiveTab(nextTab);
                }}
            >
                <View style={[styles.page, { width }]}>
                    <View style={styles.body}>
                        <FlatList
                            data={items}
                            keyExtractor={(item) => item.id}
                            refreshing={refreshing}
                            onRefresh={() => {
                                void handlePullToRefresh();
                            }}
                            initialNumToRender={8}
                            maxToRenderPerBatch={8}
                            windowSize={7}
                            removeClippedSubviews={Platform.OS === 'android'}
                            renderItem={({ item }) => (
                                <FollowRequestNotification
                                    username={item.username}
                                    profilePicture={item.profilePicture}
                                    message={item.message}
                                    onClose={() => {
                                        void dismissNotification(item.id);
                                    }}
                                />
                            )}
                            style={styles.list}
                            contentContainerStyle={[
                                styles.listContent,
                                items.length === 0 && styles.listContentEmpty,
                            ]}
                            ListEmptyComponent={
                                <View style={styles.emptyWrap}>
                                    {loading ? (
                                        <>
                                            <ActivityIndicator size="small" color="#6733d0" />
                                            <Text style={[styles.emptySubtitle, { marginTop: 10 }]}>Loading notifications…</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.emptyTitle}>No notifications yet</Text>
                                            <Text style={styles.emptySubtitle}>Follow/unfollow activity will show up here.</Text>
                                        </>
                                    )}
                                </View>
                            }
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        />
                    </View>
                </View>

                <View style={[styles.page, { width }]}>
                    <View style={styles.body}>
                        <FlatList
                            data={followRequestItems}
                            keyExtractor={(item) => item.id}
                            refreshing={refreshing}
                            onRefresh={() => {
                                void handlePullToRefresh();
                            }}
                            initialNumToRender={8}
                            maxToRenderPerBatch={8}
                            windowSize={7}
                            removeClippedSubviews={Platform.OS === 'android'}
                            renderItem={({ item }) => (
                                <FollowRequestComponent
                                    username={item.username}
                                    profilePicture={item.profilePicture}
                                    message={item.message}
                                    onAccept={() => {
                                        if (!followActionPendingById[item.id]) {
                                            void handleAcceptFollowRequest(item.id);
                                        }
                                    }}
                                    onReject={() => {
                                        if (!followActionPendingById[item.id]) {
                                            void handleRejectFollowRequest(item.id);
                                        }
                                    }}
                                />
                            )}
                            style={styles.list}
                            contentContainerStyle={[
                                styles.listContent,
                                followRequestItems.length === 0 && styles.listContentEmpty,
                            ]}
                            ListEmptyComponent={
                                <View style={styles.emptyWrap}>
                                    <Text style={styles.emptyTitle}>No follow requests yet</Text>
                                    <Text style={styles.emptySubtitle}>When someone sends a follow request, it will appear here instantly.</Text>
                                </View>
                            }
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        />
                    </View>
                </View>

                <View style={[styles.page, { width }]}>
                    <View style={styles.body}>
                        <View style={styles.collectionsSearchWrap}>
                            <View style={styles.collectionsSearchBar}>
                                <Ionicons name="search" size={18} color="#6733d0" />
                                <TextInput
                                    value={collectionsQuery}
                                    onChangeText={setCollectionsQuery}
                                    placeholder="Search collections"
                                    placeholderTextColor="#8b79b7"
                                    style={styles.collectionsSearchInput}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                        </View>

                        <FlatList
                            data={filteredConnections}
                            keyExtractor={(item) => item.id}
                            refreshing={refreshing}
                            onRefresh={() => {
                                void handlePullToRefresh();
                            }}
                            initialNumToRender={10}
                            maxToRenderPerBatch={10}
                            windowSize={7}
                            removeClippedSubviews={Platform.OS === 'android'}
                            renderItem={({ item }) => (
                                <View style={styles.collectionRowWrap}>
                                    <Pressable style={({ pressed }) => [styles.collectionRow, pressed && styles.collectionRowPressed]}>
                                        <AvatarPicker
                                            uri={item.profilePicture}
                                            name={item.username}
                                            size={44}
                                            style={styles.collectionAvatarImage}
                                            fallbackStyle={styles.collectionAvatar}
                                            textStyle={styles.collectionAvatarText}
                                            previewEnabled
                                        />

                                        <View style={styles.collectionRowContent}>
                                            <Text style={styles.collectionName} numberOfLines={1}>
                                                {item.username}
                                            </Text>
                                        </View>

                                        <Text style={styles.collectionMessage} numberOfLines={1}>
                                            {item.message}
                                        </Text>

                                        <Pressable
                                            style={({ pressed }) => [styles.collectionActionButton, pressed && styles.collectionActionButtonPressed]}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Message ${item.username}`}
                                            onPress={() => {
                                                navigation.navigate('Chatroom', {
                                                    peerId: item.id,
                                                    peerUsername: item.username,
                                                    peerAvatar: item.profilePicture,
                                                });
                                            }}
                                        >
                                            <Text style={styles.collectionActionButtonText}>Message</Text>
                                        </Pressable>
                                    </Pressable>
                                </View>
                            )}
                            style={styles.list}
                            contentContainerStyle={[
                                styles.listContent,
                                filteredConnections.length === 0 && styles.listContentEmpty,
                            ]}
                            ListEmptyComponent={
                                <View style={styles.emptyWrap}>
                                    {connectionsLoading ? (
                                        <>
                                            <ActivityIndicator size="small" color="#6733d0" />
                                            <Text style={[styles.emptySubtitle, { marginTop: 10 }]}>Loading collections...</Text>
                                        </>
                                    ) : (
                                        <>
                                            <Text style={styles.emptyTitle}>No accepted connections yet</Text>
                                            <Text style={styles.emptySubtitle}>When follow requests are accepted, people will appear here.</Text>
                                        </>
                                    )}
                                </View>
                            }
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        />
                    </View>
                </View>
            </ScrollView>
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
    tabsRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fff',
    },
    tabButton: {
        flex: 1,
        minHeight: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        backgroundColor: '#fafafa',
        paddingHorizontal: 8,
    },
    tabButtonActive: {
        borderColor: '#6733d0',
        backgroundColor: 'rgba(103,51,208,0.12)',
    },
    tabButtonPressed: {
        opacity: 0.8,
    },
    tabText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#555',
    },
    tabTextActive: {
        color: '#1a1073',
    },
    page: {
        flex: 1,
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
    placeholderWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
    },
    placeholderTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
        textAlign: 'center',
        marginBottom: 8,
    },
    placeholderSubtitle: {
        fontSize: 13,
        color: '#666',
        textAlign: 'center',
    },
    collectionsSearchWrap: {
        paddingHorizontal: 12,
        paddingBottom: 6,
    },
    collectionsSearchBar: {
        width: '100%',
        minHeight: 42,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#ddd',
        backgroundColor: '#fafafa',
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    collectionsSearchInput: {
        flex: 1,
        fontSize: 14,
        color: '#111',
        paddingVertical: 0,
    },
    collectionRowWrap: {
        width: '100%',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    collectionRow: {
        width: '100%',
        minHeight: 64,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#eee',
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 1,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
    },
    collectionRowPressed: {
        backgroundColor: 'rgba(233,226,255,0.40)',
    },
    collectionAvatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: '#e9e2ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    collectionAvatarImage: {
        width: 42,
        height: 42,
        borderRadius: 21,
        marginRight: 10,
        backgroundColor: '#e9e2ff',
    },
    collectionAvatarText: {
        color: '#350d81',
        fontSize: 15,
        fontWeight: '700',
    },
    collectionRowContent: {
        flex: 1,
        minWidth: 0,
        marginRight: 8,
    },
    collectionName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111',
    },
    collectionMessage: {
        fontSize: 12,
        color: '#666',
        marginRight: 10,
    },
    collectionActionButton: {
        minHeight: 32,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: '#6733d0',
        backgroundColor: 'rgba(103,51,208,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
    },
    collectionActionButtonPressed: {
        opacity: 0.8,
    },
    collectionActionButtonText: {
        fontSize: 12,
        color: '#1a1073',
        fontWeight: '700',
    },

})
export default Notifications;