import {
    Button,
    EmptyState,
    NavBar,
    PressableScale,
    SearchField,
    SegmentedControl,
    useNavBarHeight,
} from '@/app/components/ui';
import { makeStyles, useTheme } from '@/src/theme';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useSocketEvents } from '../../services/WebSocketClient';
import AvatarPicker from './AvatarPicker';
import FollowRequestComponent from './followRequestComponent';
import FollowRequestNotification from './followrequestNotification';

const TAB_TITLES = ['Notifications', 'Follow requests', 'All connections'] as const;

const LAST_SEEN_KEY = 'notificationsLastSeenAt';
const CONTROLS_HEIGHT = 52;

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

// "now", "5m", "3h", "2d", then a short date.
const relativeTime = (iso?: string) => {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const mins = Math.floor((Date.now() - t) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const Notifications = ({ navigation }: { navigation: any }) => {
    const s = useStyles();
    const { colors } = useTheme();
    const { user } = useAuth();
    const currentUserId = typeof user?.id === 'string' ? user.id : user?.id ? String(user.id) : '';
    const insets = useSafeAreaInsets();
    const navHeight = useNavBarHeight();

    const pagerRef = useRef<Animated.ScrollView | null>(null);
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const [followActionPendingById, setFollowActionPendingById] = useState<Record<string, boolean>>({});
    const [connections, setConnections] = useState<MutualConnectionItem[]>([]);
    const [connectionsLoading, setConnectionsLoading] = useState(false);
    const [connectionsQuery, setConnectionsQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const { width } = useWindowDimensions();

    // Pager position in pages, so the segmented lens follows the swipe.
    const pageProgress = useSharedValue(0);
    const onPagerScroll = useAnimatedScrollHandler((e) => {
        pageProgress.value = e.contentOffset.x / Math.max(width, 1);
    });

    const followRequestItems = useMemo(() => {
        return items.filter((item) => {
            const type = String(item.type || '').toLowerCase();
            return type === 'follow_request';
        });
    }, [items]);

    const filteredConnections = useMemo(() => {
        const q = connectionsQuery.trim().toLowerCase();
        if (!q) return connections;
        return connections.filter((item) => {
            const username = String(item.username || '').toLowerCase();
            const message = String(item.message || '').toLowerCase();
            return username.includes(q) || message.includes(q);
        });
    }, [connectionsQuery, connections]);

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
            console.log('notification fetch error:', err?.message ?? String(err));
        } finally {
            setLoading(false);
        }
    }, [currentUserId]);

    useEffect(() => {
        void loadNotifications();
    }, [loadNotifications]);

    useSocketEvents((lastMessage) => {
        const type = String((lastMessage as any)?.type ?? '');
        // After a (re)connect, catch up on anything missed while offline.
        if (type === 'registered') {
            void loadNotifications();
            return;
        }
        if (type !== 'new_notification') return;

        const payload = lastMessage as any;
        const normalized: NotificationItem = {
            id: String(payload?.id ?? `${Date.now()}`),
            username: String(payload?.username ?? 'User'),
            profilePicture: typeof payload?.profilePicture === 'string' ? payload.profilePicture : '',
            message: String(payload?.message ?? ''),
            createdAt: typeof payload?.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
            type: typeof payload?.notificationType === 'string'
                ? payload.notificationType
                : (typeof payload?.type === 'string' && payload.type !== 'new_notification' ? payload.type : undefined),
            fromUserId: typeof payload?.fromUserId === 'string' ? payload.fromUserId : undefined,
        };

        setItems((prev) => mergeByIdNewestFirst([normalized], prev));
        void SecureStore.setItemAsync(LAST_SEEN_KEY, new Date().toISOString());
    });

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
            console.log('notification dismiss error:', err?.message ?? String(err));
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
            console.log('connections fetch error:', err?.message ?? String(err));
        } finally {
            setConnectionsLoading(false);
        }
    }, [currentUserId]);

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
                await loadConnections();
            } else {
                console.log('follow request accept error:', err?.message ?? String(err), status);
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
                console.log('follow request reject error:', err?.message ?? String(err), status);
                if (snapshot) setItems(snapshot);
            }
        } finally {
            setFollowActionPendingById((prev) => ({ ...prev, [id]: false }));
        }
    };

    useEffect(() => {
        void loadConnections();
    }, [loadConnections]);

    const openChat = (item: MutualConnectionItem) =>
        navigation.navigate('Chatroom', { peerId: item.id, peerUsername: item.username, peerAvatar: item.profilePicture });
    const openProfile = (item: MutualConnectionItem) =>
        navigation.navigate('FullProfile', { peerId: item.id, peerUsername: item.username, peerAvatar: item.profilePicture });

    const listTop = navHeight + CONTROLS_HEIGHT + 8;
    const listBottom = Math.max(insets.bottom, 16) + 24;
    const refresh = (
        <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handlePullToRefresh()}
            tintColor={colors.secondaryLabel}
            colors={[colors.tint]}
            progressViewOffset={listTop}
        />
    );

    const Separator = () => (
        <View style={s.separatorWrap}>
            <View style={s.separator} />
        </View>
    );

    // Rows sit in one rounded group: round the first and last.
    const groupCorners = (index: number, count: number) => [
        s.groupRow,
        index === 0 && s.groupFirst,
        index === count - 1 && s.groupLast,
    ];

    return (
        <View style={s.screen}>
            <Animated.ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onPagerScroll}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(event) => {
                    const nextTab = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
                    setActiveTab(nextTab);
                }}
            >
                {/* ── Activity ── */}
                <View style={{ width }}>
                    <FlatList
                        data={items}
                        keyExtractor={(item) => item.id}
                        refreshControl={refresh}
                        initialNumToRender={8}
                        maxToRenderPerBatch={8}
                        windowSize={7}
                        removeClippedSubviews={Platform.OS === 'android'}
                        renderItem={({ item, index }) => (
                            <View style={groupCorners(index, items.length)}>
                                <FollowRequestNotification
                                    username={item.username}
                                    profilePicture={item.profilePicture}
                                    message={item.message}
                                    time={relativeTime(item.createdAt)}
                                    onClose={() => {
                                        void dismissNotification(item.id);
                                    }}
                                />
                            </View>
                        )}
                        ItemSeparatorComponent={Separator}
                        contentContainerStyle={[
                            { paddingTop: listTop, paddingBottom: listBottom },
                            items.length === 0 && s.listEmpty,
                        ]}
                        ListEmptyComponent={
                            loading ? (
                                <View style={s.loading}>
                                    <ActivityIndicator size="small" color={colors.tintText} />
                                    <Text style={s.loadingText}>Loading notifications…</Text>
                                </View>
                            ) : (
                                <EmptyState
                                    icon="notifications-outline"
                                    title="No notifications yet"
                                    message="Follow/unfollow activity will show up here."
                                />
                            )
                        }
                        showsVerticalScrollIndicator={false}
                    />
                </View>

                {/* ── Follow requests ── */}
                <View style={{ width }}>
                    <FlatList
                        data={followRequestItems}
                        keyExtractor={(item) => item.id}
                        refreshControl={refresh}
                        initialNumToRender={8}
                        maxToRenderPerBatch={8}
                        windowSize={7}
                        removeClippedSubviews={Platform.OS === 'android'}
                        renderItem={({ item, index }) => (
                            <View style={groupCorners(index, followRequestItems.length)}>
                                <FollowRequestComponent
                                    username={item.username}
                                    profilePicture={item.profilePicture}
                                    message={item.message}
                                    busy={!!followActionPendingById[item.id]}
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
                            </View>
                        )}
                        ItemSeparatorComponent={Separator}
                        contentContainerStyle={[
                            { paddingTop: listTop, paddingBottom: listBottom },
                            followRequestItems.length === 0 && s.listEmpty,
                        ]}
                        ListEmptyComponent={
                            <EmptyState
                                icon="person-add-outline"
                                title="No follow requests yet"
                                message="When someone sends a follow request, it will appear here instantly."
                            />
                        }
                        showsVerticalScrollIndicator={false}
                    />
                </View>

                {/* ── All connections ── */}
                <View style={{ width }}>
                    <FlatList
                        data={filteredConnections}
                        keyExtractor={(item) => item.id}
                        refreshControl={refresh}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={7}
                        removeClippedSubviews={Platform.OS === 'android'}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        ListHeaderComponent={
                            <SearchField
                                value={connectionsQuery}
                                onChangeText={setConnectionsQuery}
                                onClear={() => setConnectionsQuery('')}
                                placeholder="Search connections"
                                style={s.connectionsSearch}
                            />
                        }
                        renderItem={({ item, index }) => (
                            <PressableScale
                                onPress={() => openProfile(item)}
                                scaleTo={1}
                                style={[s.connectionRow, ...groupCorners(index, filteredConnections.length)]}
                                pressedStyle={s.rowPressed}
                                accessibilityRole="button"
                                accessibilityLabel={`${item.username}, ${item.message}. Open profile`}
                            >
                                <AvatarPicker uri={item.profilePicture} name={item.username} size={44} previewEnabled={false} />
                                <View style={s.connectionText}>
                                    <Text style={s.connectionName} numberOfLines={1}>
                                        {item.username}
                                    </Text>
                                    <Text style={s.connectionMessage} numberOfLines={1}>
                                        {item.message}
                                    </Text>
                                </View>
                                <Button
                                    title="Message"
                                    size="sm"
                                    variant="tinted"
                                    onPress={() => openChat(item)}
                                    accessibilityLabel={`Message ${item.username}`}
                                />
                            </PressableScale>
                        )}
                        ItemSeparatorComponent={Separator}
                        contentContainerStyle={[
                            { paddingTop: listTop, paddingBottom: listBottom },
                            filteredConnections.length === 0 && s.listEmpty,
                        ]}
                        ListEmptyComponent={
                            connectionsLoading ? (
                                <View style={s.loading}>
                                    <ActivityIndicator size="small" color={colors.tintText} />
                                    <Text style={s.loadingText}>Loading connections…</Text>
                                </View>
                            ) : connectionsQuery.trim() ? (
                                <EmptyState icon="search" title="No connections found" message="Try a different search term." />
                            ) : (
                                <EmptyState
                                    icon="people-outline"
                                    title="No accepted connections yet"
                                    message="When follow requests are accepted, people will appear here."
                                />
                            )
                        }
                        showsVerticalScrollIndicator={false}
                    />
                </View>
            </Animated.ScrollView>

            <NavBar
                alwaysGlass
                title="Notifications"
                onBack={() => navigation.goBack()}
                style={s.navWithControls}
            />
            <View style={[s.controls, { top: navHeight }]} pointerEvents="box-none">
                <SegmentedControl
                    segments={TAB_TITLES}
                    selectedIndex={activeTab}
                    onChange={goToTab}
                    progress={pageProgress}
                    testID="notifications-tabs"
                />
            </View>
        </View>
    );
}

const useStyles = makeStyles((t) => ({
    screen: {
        flex: 1,
        backgroundColor: t.colors.ground,
    },
    // The glass bar extends down behind the segmented control.
    navWithControls: {
        paddingBottom: CONTROLS_HEIGHT,
    },
    controls: {
        position: 'absolute',
        left: t.space.gutter,
        right: t.space.gutter,
        height: CONTROLS_HEIGHT,
        justifyContent: 'center',
        zIndex: 11,
    },
    listEmpty: {
        flexGrow: 1,
        justifyContent: 'center',
    },
    loading: {
        alignItems: 'center',
        gap: t.space.sm,
    },
    loadingText: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
    },
    groupRow: {
        marginHorizontal: t.space.gutter,
        overflow: 'hidden',
    },
    groupFirst: {
        borderTopLeftRadius: t.radius.lg,
        borderTopRightRadius: t.radius.lg,
    },
    groupLast: {
        borderBottomLeftRadius: t.radius.lg,
        borderBottomRightRadius: t.radius.lg,
    },
    separatorWrap: {
        marginHorizontal: t.space.gutter,
        backgroundColor: t.colors.surface,
    },
    separator: {
        height: t.size.hairline,
        backgroundColor: t.colors.separator,
        marginLeft: t.space.lg + 44 + t.space.md,
    },
    connectionsSearch: {
        marginHorizontal: t.space.gutter,
        marginBottom: t.space.md,
    },
    connectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.md,
        backgroundColor: t.colors.surface,
    },
    rowPressed: {
        backgroundColor: t.colors.pressedOverlay,
    },
    connectionText: {
        flex: 1,
        minWidth: 0,
        gap: 1,
    },
    connectionName: {
        ...t.type.headline,
        color: t.colors.label,
    },
    connectionMessage: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
    },
}));

export default Notifications;
