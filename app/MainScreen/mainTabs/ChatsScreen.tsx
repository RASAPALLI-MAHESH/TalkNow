import AvatarPicker from '@/app/components/AvatarPicker';
import ChatBar, { type ChatListItem, type GlobalChatListItem } from '@/app/components/chatbar';
import useAuth from '@/hooks/useAuth';
import {
    followUser,
    getAuthErrorMessage,
    getChatInbox,
    getUnreadNotificationCount,
    unfollowUser,
    type ChatInboxDto,
} from '@/services/AuthService';
import { useWebSocketClient } from '@/services/WebSocketClient';
import { useUnread } from '@/Context/UnreadContext';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    FlatList,
    Keyboard,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
    type GestureResponderEvent,
    type LayoutChangeEvent
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

const MODE_TOGGLE_WIDTH = 104;
const MODE_TOGGLE_PADDING = 2;
const MODE_TOGGLE_PILL_WIDTH = (MODE_TOGGLE_WIDTH - MODE_TOGGLE_PADDING * 2) / 2;

const NOTIFICATIONS_LAST_SEEN_KEY = 'notificationsLastSeenAt';

const CHAT_HEADER_ICON_XML = `
<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#6733d0">
    <path d="M80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"/>
</svg>
`;

const formatChatTime = (raw?: string) => {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

type GlobalUserSearchResult = {
    id?: string;
    _id?: unknown;
    username?: string;
    profilePicture?: string;
};

const MONGO_OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const extractMongoObjectId = (raw: unknown): string => {
    if (typeof raw === 'string') return raw.trim();
    if (raw && typeof raw === 'object') {
        const anyRaw = raw as any;
        if (typeof anyRaw.$oid === 'string') return anyRaw.$oid.trim();
        if (typeof anyRaw._id === 'string') return anyRaw._id.trim();
        if (typeof anyRaw.id === 'string') return anyRaw.id.trim();
    }
    return '';
};

const pickValidUserId = (userLike: any): string => {
    const candidate = userLike?.id ?? userLike?._id ?? userLike?.userId;
    const id = extractMongoObjectId(candidate);
    return MONGO_OBJECT_ID_RE.test(id) ? id : '';
};

const mergeChatsById = (incoming: ChatListItem[], existing: ChatListItem[]) => {
    const byId = new Map<string, ChatListItem>();
    for (const item of existing) byId.set(String(item.id), item);

    for (const next of incoming) {
        const id = String(next.id);
        const prev = byId.get(id);
        if (!prev) {
            byId.set(id, next);
            continue;
        }

        byId.set(id, {
            ...prev,
            ...next,
            // Never lose the latest message preview/date if the incoming connection row is generic.
            lastMessage: next.lastMessage && next.lastMessage !== 'Connected' ? next.lastMessage : prev.lastMessage,
            Date: next.Date ? next.Date : prev.Date,
            profilePicture:
                typeof next.profilePicture === 'string' && next.profilePicture.trim().length > 0
                    ? next.profilePicture
                    : prev.profilePicture,
        });
    }

    const merged = Array.from(byId.values());
    merged.sort((a, b) => {
        const ta = a.Date ? Date.parse(a.Date) : 0;
        const tb = b.Date ? Date.parse(b.Date) : 0;
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
    const withoutAuth = trimmed.replace(/\/?api\/?auth\/?$/i, '').replace(/\/?api\/?$/i, '');
    return withoutAuth.replace(/\/$/, '');
};

type ChatRowAction = {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'ghost';
    loading?: boolean;
};

const ChatRow = ({
    item,
    onPress,
}: {
    item: ChatListItem;
    onPress: () => void;
}) => {
    const [layout, setLayout] = useState({ width: 0, height: 0 });
    const [inkX, setInkX] = useState(0);

    const longPressFiredRef = useRef(false);
    const touchXRef = useRef(0);

    // WhatsApp-like long-press ink: expands horizontally from touch point.
    const inkScaleLeft = useRef(new Animated.Value(0)).current;
    const inkScaleRight = useRef(new Animated.Value(0)).current;
    const inkOpacity = useRef(new Animated.Value(0)).current;

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setLayout({ width, height });    };

    const primeInk = (e: GestureResponderEvent) => {
        if (!layout.width) return;
        const x = Math.max(0, Math.min(layout.width, e.nativeEvent.locationX));
        touchXRef.current = x;
        setInkX(x);

        inkOpacity.stopAnimation();
        inkScaleLeft.stopAnimation();
        inkScaleRight.stopAnimation();

        inkOpacity.setValue(0);
        inkScaleLeft.setValue(0);
        inkScaleRight.setValue(0);
    };

    const startLongPressInk = () => {
        if (!layout.width) return;
        const x = Math.max(0, Math.min(layout.width, touchXRef.current));
        setInkX(x);

        inkOpacity.setValue(0);
        inkScaleLeft.setValue(0);
        inkScaleRight.setValue(0);

        Animated.parallel([
            Animated.timing(inkOpacity, {
                toValue: 1,
                duration: 90,
                useNativeDriver: true,
            }),
            Animated.timing(inkScaleLeft, {
                toValue: 1,
                duration: 220,
                useNativeDriver: true,
            }),
            Animated.timing(inkScaleRight, {
                toValue: 1,
                duration: 220,
                useNativeDriver: true,
            }),
        ]).start();
    };

    return (
        <Pressable
            onLayout={onLayout}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            delayLongPress={240}
            onPressIn={(e) => {
                primeInk(e);
            }}
            onLongPress={() => {
                longPressFiredRef.current = true;
                startLongPressInk();
            }}
            onPress={() => {
                if (longPressFiredRef.current) {
                    longPressFiredRef.current = false;
                    return;
                }
                onPress();
            }}
            onPressOut={() => {
                longPressFiredRef.current = false;
                Animated.timing(inkOpacity, {
                    toValue: 0,
                    duration: 140,
                    useNativeDriver: true,
                }).start();
            }}
            accessibilityRole="button"
        >
            <View pointerEvents="none" style={styles.rippleLayer}>
                {/* Left side: expands from touch point to the left */}
                <Animated.View
                    style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: inkX,
                        backgroundColor: 'rgba(233,226,255,0.55)',
                        opacity: inkOpacity,
                        transform: [
                            { translateX: inkX / 2 },
                            { scaleX: inkScaleLeft },
                            { translateX: -inkX / 2 },
                        ],
                    }}
                />

                {/* Right side: expands from touch point to the right */}
                <Animated.View
                    style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: inkX,
                        right: 0,
                        backgroundColor: 'rgba(233,226,255,0.55)',
                        opacity: inkOpacity,
                        transform: [
                            { translateX: -(Math.max(0, layout.width - inkX) / 2) },
                            { scaleX: inkScaleRight },
                            { translateX: Math.max(0, layout.width - inkX) / 2 },
                        ],
                    }}
                />
            </View>

            <AvatarPicker
                uri={item.profilePicture}
                name={item.name}
                size={48}
                style={styles.avatarImage}
                fallbackStyle={styles.avatar}
                textStyle={styles.avatarText}
                previewEnabled
            />

            <View style={styles.rowContent}>
                <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.time} numberOfLines={1}>{formatChatTime(item.Date)}</Text>
                </View>
                <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
            </View>
        </Pressable>
    );
};

const GlobalChatRow = ({
    item,
    action,
}: {
    item: GlobalChatListItem;
    action: ChatRowAction;
}) => {
    const variant = action.variant ?? 'ghost';
    const spinnerColor = variant === 'primary' ? '#fff' : '#6733d0';
    return (
        <View style={styles.row}>
            <AvatarPicker
                uri={item.profilePicture}
                name={item.name}
                size={48}
                style={styles.avatarImage}
                fallbackStyle={styles.avatar}
                textStyle={styles.avatarText}
                previewEnabled
            />

            <View style={styles.rowContent}>
                <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                </View>
            </View>

            <Pressable
                onPress={action.onPress}
                disabled={action.disabled}
                style={({ pressed }) => [
                    styles.followButton,
                    variant === 'primary' ? styles.followButtonPrimary : styles.followButtonGhost,
                    action.disabled && styles.followButtonDisabled,
                    pressed && !action.disabled && (variant === 'primary' ? styles.followButtonPressedPrimary : styles.followButtonPressed),
                ]}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                hitSlop={10}
            >
                {action.loading ? (
                    <ActivityIndicator size="small" color={spinnerColor} />
                ) : (
                    <Text
                        style={[
                            styles.followButtonText,
                            variant === 'primary' ? styles.followButtonTextPrimary : styles.followButtonTextGhost,
                            action.disabled && styles.followButtonTextDisabled,
                        ]}
                        numberOfLines={1}
                    >
                        {action.label}
                    </Text>
                )}
            </Pressable>
        </View>
    );
};

const ChatsScreen = ({ navigation }: { navigation: any }) => {
    const { lastMessage } = useWebSocketClient();
    const { refreshUnreadCount } = useUnread();

    const { user } = useAuth();
    const currentUserId = typeof user?.id === 'string' ? user.id : user?.id ? String(user.id) : '';

    const insets = useSafeAreaInsets();
    const horizontalSafePad = 12 + Math.max(insets.left, insets.right);

    const [query, setQuery] = useState('');
    const [searchMode, setSearchMode] = useState<'local' | 'global'>('local');

    const [globalSearching, setGlobalSearching] = useState(false);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [globalResults, setGlobalResults] = useState<GlobalUserSearchResult[]>([]);
    const [showingGlobal, setShowingGlobal] = useState(false);

    const [followingById, setFollowingById] = useState<Record<string, boolean>>({});
    const [followPendingById, setFollowPendingById] = useState<Record<string, boolean>>({});
    const [chatRows, setChatRows] = useState<ChatListItem[]>(ChatBar);

    const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

    const searchInputRef = useRef<TextInput | null>(null);
    const focusAnim = useRef(new Animated.Value(0)).current;
    const modeAnim = useRef(new Animated.Value(0)).current; // 0 = local, 1 = global
    const spinAnim = useRef(new Animated.Value(0)).current;
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const apiOrigin = useMemo(() => normalizeApiOrigin(getDefaultApiUrl()), []);

    const loadChatsFromInbox = useCallback(async () => {
        if (!currentUserId) {
            setChatRows([]);
            return;
        }

        try {
            const res = await getChatInbox();
            const list = Array.isArray((res as any)?.chats) ? ((res as any).chats as ChatInboxDto[]) : [];

            const incoming: ChatListItem[] = list.map((u) => ({
                id: String(u.id),
                name: String(u.username ?? 'User'),
                profilePicture: typeof u.profilePicture === 'string' ? u.profilePicture : '',
                lastMessage: typeof u.lastMessage === 'string' && u.lastMessage.trim() ? u.lastMessage : 'New message',
                Date: typeof u.date === 'string' ? u.date : '',
            }));

            setChatRows((prev) => mergeChatsById(incoming, prev));
        } catch (err: any) {
            console.log('chat inbox hydrate error:', err?.message ?? String(err));
        }
    }, [currentUserId]);

    const checkUnreadNotifications = useCallback(async () => {
        if (!currentUserId) {
            setHasUnreadNotifications(false);
            return;
        }

        try {
            const since =
                (await SecureStore.getItemAsync(NOTIFICATIONS_LAST_SEEN_KEY)) ?? new Date(0).toISOString();
            const res = await getUnreadNotificationCount(since);
            const unread = typeof (res as any)?.unread === 'number' ? (res as any).unread : 0;
            setHasUnreadNotifications(unread > 0);
        } catch {
            // If endpoint fails, don't show a false dot.
            setHasUnreadNotifications(false);
        }
    }, [currentUserId]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;

        const start = () => {
            void checkUnreadNotifications();
            void loadChatsFromInbox();
            refreshUnreadCount();
            if (interval) clearInterval(interval);
            interval = setInterval(() => {
                void checkUnreadNotifications();
                void loadChatsFromInbox();
                refreshUnreadCount();
            }, 20000);
        };

        const stop = () => {
            if (interval) clearInterval(interval);
            interval = null;
        };

        const unsubFocus = navigation?.addListener?.('focus', start);
        const unsubBlur = navigation?.addListener?.('blur', stop);

        // Initial run (Chats is usually the first screen).
        start();

        return () => {
            stop();
            if (typeof unsubFocus === 'function') unsubFocus();
            if (typeof unsubBlur === 'function') unsubBlur();
        };
    }, [navigation, checkUnreadNotifications, loadChatsFromInbox, refreshUnreadCount]);

    useEffect(() => {
        const type = String((lastMessage as any)?.type ?? '');
        if (type !== 'new_message' && type !== 'sent') return;
        
        if (type === 'new_message') refreshUnreadCount();

        const from = String((lastMessage as any)?.from ?? '').trim();
        const to = String((lastMessage as any)?.to ?? '').trim();
        const content = String((lastMessage as any)?.content ?? '').trim();
        const date = String((lastMessage as any)?.date ?? new Date().toISOString());

        if (!from || !to || !currentUserId) return;

        const peerId = from === currentUserId ? to : from;
        if (!peerId) return;

        setChatRows((prev) => {
            const idx = prev.findIndex((row) => String(row.id) === peerId);
            if (idx === -1) {
                const created: ChatListItem = {
                    id: peerId,
                    name: 'User',
                    profilePicture: '',
                    lastMessage: content || 'New message',
                    Date: date,
                };
                return mergeChatsById([created], prev);
            }

            const updated = [...prev];
            updated[idx] = {
                ...updated[idx],
                lastMessage: content || 'New message',
                Date: date,
            };
            return mergeChatsById([], updated);
        });
    }, [lastMessage, currentUserId]);

    useEffect(() => {
        Animated.timing(modeAnim, {
            toValue: searchMode === 'global' ? 1 : 0,
            duration: 180,
            useNativeDriver: true,
        }).start();
    }, [modeAnim, searchMode]);

    useEffect(() => {
        if (!globalSearching) {
            spinAnim.stopAnimation();
            spinAnim.setValue(0);
            return;
        }

        const loop = Animated.loop(
            Animated.timing(spinAnim, {
                toValue: 1,
                duration: 900,
                useNativeDriver: true,
            })
        );
        loop.start();
        return () => loop.stop();
    }, [globalSearching, spinAnim]);

    const runGlobalSearch = useCallback(async (raw: string) => {
        const q = raw.trim();
        if (!q) {
            setShowingGlobal(false);
            setGlobalResults([]);
            setGlobalError(null);
            setGlobalSearching(false);
            return;
        }

        setShowingGlobal(true);
        setGlobalSearching(true);
        setGlobalError(null);

        try {
            const token = await SecureStore.getItemAsync('userToken');
            const url = `${apiOrigin}/api/auth/search-users?query=${encodeURIComponent(q)}`;

            const headers: Record<string, string> = {
                Accept: 'application/json',
            };
            if (token) headers.Authorization = `Bearer ${token}`;

            const res = await fetch(url, {
                method: 'GET',
                headers,
            });

            if (!res.ok) {
                const contentType = res.headers.get('content-type') || '';
                let message = `Search failed (HTTP ${res.status}).`;
                try {
                    if (contentType.includes('application/json')) {
                        const errJson = await res.json();
                        if (typeof errJson?.message === 'string' && errJson.message.trim()) {
                            message = errJson.message;
                        }
                    } else {
                        const errText = await res.text();
                        if (typeof errText === 'string' && errText.trim()) {
                            message = `Search failed (HTTP ${res.status}).`;
                        }
                    }
                } catch {
                    // ignore parse errors
                }
                setGlobalResults([]);
                setGlobalError(message);
                return;
            }

            const data = await res.json();
            const users: GlobalUserSearchResult[] = Array.isArray(data)
                ? data
                : Array.isArray(data?.users)
                    ? data.users
                    : [];
            const sanitized = users.map((u) => ({
                id: pickValidUserId(u),
                username: typeof u?.username === 'string' ? u.username.trim() : String(u?.username ?? '').trim(),
                profilePicture:
                    typeof u?.profilePicture === 'string' && u.profilePicture.trim().length > 0
                        ? u.profilePicture.trim()
                        : '',
            }));
            setGlobalResults(sanitized);
        } catch (err: any) {
            setGlobalResults([]);
            setGlobalError(typeof err?.message === 'string' ? err.message : 'Search failed.');
        } finally {
            setGlobalSearching(false);
        }
    }, [apiOrigin]);

    useEffect(() => {
        if (searchMode !== 'global') return;

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            void runGlobalSearch(query);
        }, 320);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [query, runGlobalSearch, searchMode]);

    const filteredChats: ChatListItem[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return chatRows;
        return chatRows.filter((item) => {
            const haystack = `${String(item.name ?? '')} ${String(item.lastMessage ?? '')}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [query, chatRows]);

    const globalAsChatRows: GlobalChatListItem[] = useMemo(() => {
        return globalResults.map((u, index) => {
            const id = typeof u.id === 'string' ? u.id.trim() : '';
            const username = String(u.username ?? '').trim();
            return {
                id,
                name: username || 'User',
                profilePicture:
                    typeof u.profilePicture === 'string' && u.profilePicture.trim().length > 0
                        ? u.profilePicture.trim()
                        : '',
            };
        });
    }, [globalResults]);

    const isFollowing = (targetUserId: string) => !!followingById[targetUserId];
    const isPending = (targetUserId: string) => !!followPendingById[targetUserId];

    const toggleFollow = async (targetUserId: string) => {
        if (!targetUserId) return;
        if (!currentUserId) {
            setGlobalError('Please login to follow users.');
            return;
        }
        if (targetUserId === currentUserId) return;
        if (isPending(targetUserId)) return;

        const nextFollowing = !isFollowing(targetUserId);

        setFollowPendingById((prev) => ({ ...prev, [targetUserId]: true }));
        setFollowingById((prev) => ({ ...prev, [targetUserId]: nextFollowing }));

        try {
            if (nextFollowing) {
                await followUser(targetUserId);

            } else {
                await unfollowUser(targetUserId);
            }
        } catch (err) {
            setFollowingById((prev) => ({ ...prev, [targetUserId]: !nextFollowing }));
            setGlobalError(getAuthErrorMessage(err, 'Failed to update follow status.'));
        } finally {
            setFollowPendingById((prev) => ({ ...prev, [targetUserId]: false }));
        }
    };

    const ListEmpty = () => (
        <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>
                {showingGlobal
                    ? globalSearching
                        ? 'Searching…'
                        : globalError
                            ? 'Search failed'
                            : 'No users found'
                    : query.trim()
                        ? 'No chats found'
                        : 'No chats yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
                {showingGlobal
                    ? globalError
                        ? globalError
                        : globalSearching
                            ? 'Looking for users…'
                            : 'Try a different search term.'
                    : query.trim()
                        ? 'Try a different search term.'
                        : 'Users you message will appear here in realtime.'}
            </Text>
        </View>
    );


    const renderChatItem = ({ item }: { item: ChatListItem }) => (
        <ChatRow
            item={item}
            onPress={() =>
                navigation.navigate('Chatroom', {
                    peerId: item.id,
                    peerUsername: item.name,
                    peerAvatar: item.profilePicture,
                })
            }
        />
    );

    const renderGlobalItem = ({ item }: { item: GlobalChatListItem }) => {
        const targetUserId = String(item.id ?? '').trim();
        const pending = targetUserId ? isPending(targetUserId) : false;
        const following = targetUserId ? isFollowing(targetUserId) : false;

        const action: ChatRowAction = {
            label: following ? 'Following' : 'Follow',
            onPress: () => {
                void toggleFollow(targetUserId);
            },
            disabled: pending || !targetUserId || !currentUserId || targetUserId === currentUserId,
            variant: following ? 'ghost' : 'primary',
            loading: false,
        };

        return <GlobalChatRow item={item} action={action} />;
    };

    const blurSearch = useCallback(() => {
        searchInputRef.current?.blur();
        Keyboard.dismiss();
    }, []);

    return (  
        <SafeAreaView style={styles.container} edges={['top']}>
            <TouchableWithoutFeedback onPress={blurSearch} accessible={false}>
            <View style={styles.container}>
            <View style={[styles.header, { paddingHorizontal: horizontalSafePad }]}>
                <View style={styles.headerTitleWrapRow}>
                    <SvgXml xml={CHAT_HEADER_ICON_XML} width={22} height={22} />
                    <Text style={styles.headerTitle}>TalkNow</Text>
                </View>
                <Pressable
                    style={({ pressed }) => [
                        styles.notification,
                        pressed && styles.notificationPressed,
                    ]}
                    onPress={() => {
                        setHasUnreadNotifications(false);
                        navigation.navigate('Notifications');
                    }}
                    hitSlop={10}
                    android_ripple={Platform.OS === 'android' ? { color: 'rgba(103,51,208,0.18)' } : undefined}
                    accessibilityRole="button"
                    accessibilityLabel="Notifications"
                >
                    <View style={styles.notificationIconWrap}>
                        <Ionicons name="notifications" size={22} color="#1a1073" />
                        {hasUnreadNotifications && <View style={styles.notificationDot} />}
                    </View>
                </Pressable>
            </View>

            <View style={[styles.searchWrap, { paddingHorizontal: horizontalSafePad }]}>
                <Animated.View
                    style={[
                        styles.searchbar,
                        {
                            transform: [
                                {
                                    scale: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.01] }),
                                },
                            ],
                        },
                    ]}
                >
                    <View pointerEvents="none" style={styles.searchbarRingWrap}>
                        <Animated.View
                            style={[
                                styles.searchbarRing,
                                {
                                    opacity: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                                    transform: [
                                        {
                                            scale: focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }),
                                        },
                                    ],
                                },
                            ]}
                        />
                    </View>

                    <TextInput
                        ref={(node) => {
                            searchInputRef.current = node;
                        }}
                        placeholder={searchMode === 'global' ? 'Search users' : 'Search chats'}
                        placeholderTextColor="#666"
                        style={styles.searchInput}
                        value={query}
                        onChangeText={(text) => {
                            setQuery(text);
                            if (searchMode === 'local') {
                                setShowingGlobal(false);
                                setGlobalResults([]);
                                setGlobalError(null);
                            }
                        }}
                        onFocus={() => {
                            Animated.timing(focusAnim, {
                                toValue: 1,
                                duration: 160,
                                useNativeDriver: true,
                            }).start();
                        }}
                        onBlur={() => {
                            Animated.timing(focusAnim, {
                                toValue: 0,
                                duration: 160,
                                useNativeDriver: true,
                            }).start();
                        }}
                        autoCorrect={false}
                        autoCapitalize="none"
                        clearButtonMode="while-editing"
                        returnKeyType="search"
                        onSubmitEditing={() => {
                            if (searchMode === 'global') {
                                void runGlobalSearch(query);
                            }
                        }}
                    />
{/* searching query logic frontend */}
                    {query.trim().length > 0 ? (
                        <Pressable
                            onPress={() => {
                                setQuery('');
                                setShowingGlobal(false);
                                setGlobalResults([]);
                                setGlobalError(null);
                                setGlobalSearching(false);
                                searchInputRef.current?.focus();
                            }}
                            style={({ pressed }) => [styles.clearButton, pressed && styles.rowPressed]}
                            android_ripple={Platform.OS === 'android' ? { color: '#e9e2ff' } : undefined}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel="Clear search"
                        >
                            <Ionicons name="close" size={18} color="#6733d0" />
                        </Pressable>
                    ) : null}
{/* Global search logic */}
                    <Pressable
                        onPress={() => {
                            if (searchMode === 'global') {
                                void runGlobalSearch(query);
                            } else {
                                searchInputRef.current?.focus();
                            }
                        }}
                        style={({ pressed }) => [styles.searchIconButton, pressed && styles.rowPressed]}
                        android_ripple={Platform.OS === 'android' ? { color: '#e9e2ff' } : undefined}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Search"
                    >
                        <Animated.View
                            style={{
                                transform: [
                                    {
                                        rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                                    },
                                ],
                                opacity:
                                    searchMode === 'global'
                                        ? globalSearching
                                            ? 0.9
                                            : 1
                                        : 0.85,
                            }}
                        >
                            <Ionicons name="search" size={20} color="#6733d0" />
                        </Animated.View>
                    </Pressable>
                </Animated.View>

                <View style={styles.modeToggleRow}>
                    <View style={styles.modeToggle}>
                        <Animated.View
                            pointerEvents="none"
                            style={[
                                styles.modeTogglePill,
                                {
                                    transform: [
                                        {
                                            translateX: modeAnim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0, MODE_TOGGLE_PILL_WIDTH],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        />

                        <Pressable
                            onPress={() => {
                                setSearchMode('local');
                                setShowingGlobal(false);
                                setGlobalResults([]);
                                setGlobalError(null);
                                searchInputRef.current?.focus();
                            }}
                            style={styles.modeToggleButton}
                            accessibilityRole="button"
                            accessibilityLabel="Search chats"
                        >
                            <Animated.Text
                                style={[
                                    styles.modeToggleText,
                                    {
                                        opacity: modeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }),
                                    },
                                ]}
                            >
                                Chats
                            </Animated.Text>
                        </Pressable>

                        <Pressable
                            onPress={() => {
                                setSearchMode('global');
                                setGlobalError(null);
                                setShowingGlobal(true);
                                void runGlobalSearch(query);
                                searchInputRef.current?.focus();
                            }}
                            style={styles.modeToggleButton}
                            accessibilityRole="button"
                            accessibilityLabel="Search users"
                        >
                            <Animated.Text
                                style={[
                                    styles.modeToggleText,
                                    {
                                        opacity: modeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
                                    },
                                ]}
                            >
                                Users
                            </Animated.Text>
                        </Pressable>
                    </View>
                </View>
            </View>

            {showingGlobal && globalError ? (
                <View style={[styles.globalErrorWrap, { paddingHorizontal: horizontalSafePad }]}>
                    <View style={styles.globalErrorInner}>
                        <Text style={styles.globalErrorText} numberOfLines={2}>
                            {globalError}
                        </Text>
                    </View>
                </View>
            ) : null}

            {showingGlobal ? (
                <FlatList
                    data={globalAsChatRows}
                    keyExtractor={(item, index) => (item.id ? String(item.id) : `missing-id-${index}`)}
                    renderItem={renderGlobalItem}
                    extraData={{ followingById, followPendingById, currentUserId }}
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    ListEmptyComponent={ListEmpty}
                    showsVerticalScrollIndicator={false}
                />
            ) : (
                <FlatList
                    data={filteredChats}
                    keyExtractor={(item, index) => String(item.id ?? index)}
                    renderItem={renderChatItem}
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    ListEmptyComponent={ListEmpty}
                    showsVerticalScrollIndicator={false}
                />
            )}
            </View>
            </TouchableWithoutFeedback>
        </SafeAreaView>
    );
};
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        width: '100%',
        height: 56,
        backgroundColor: '#fff',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
    },
    headerTitle: {
        color: '#710b8d',
        fontSize: 26,
        fontWeight: '600',
        marginLeft: 8,
    },
    headerTitleWrapRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    rowPressed: {
        backgroundColor: 'rgba(233,226,255,0.42)',
    },
    headerSubtitle: {
        color: '#710b8d',
        fontSize: 12,
        opacity: 0.9,
    },
    searchWrap: {
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 6,
    },
    searchbar: {
        width: '100%',
        maxWidth: 420,
        minHeight: 44,
        borderWidth: 1,
        borderColor: '#9d7bdd',
        borderRadius: 30,
        paddingLeft: 10,
        paddingRight: 6,
        backgroundColor: '#e1ade6fff',
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
    },
    searchbarRingWrap: {
        ...StyleSheet.absoluteFillObject,
        padding: 0,
        alignItems: 'stretch',
        justifyContent: 'center',
        pointerEvents: 'none',
    },
    searchbarRing: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 30,
        borderWidth: 2,
        borderColor: '#b29fd6',
    },
    modeToggleRow: {
        width: '100%',
        maxWidth: 420,
        marginTop: 8,
        alignItems: 'flex-start',
    },
    modeToggle: {
        height: 32,
        width: MODE_TOGGLE_WIDTH,
        borderRadius: 16,
        backgroundColor: '#e9e2ff',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: MODE_TOGGLE_PADDING,
        position: 'relative',
    },
    modeTogglePill: {
        position: 'absolute',
        top: MODE_TOGGLE_PADDING,
        left: MODE_TOGGLE_PADDING,
        width: MODE_TOGGLE_PILL_WIDTH,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: 'rgba(53,13,129,0.18)',
    },
    modeToggleButton: {
        flex: 1,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    modeToggleText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#000000',
        textAlign: 'center',
        includeFontPadding: false,
    },
    searchInput: {
        flex: 1,
        height: 44,
        paddingVertical: 0,
        paddingRight: 10,
        color: '#111',
    },
    clearButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        overflow: 'hidden',
        marginRight: 2,
    },
    searchIconButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
        overflow: 'hidden',
    },
    globalErrorWrap: {
        width: '100%',
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 4,
    },
    globalErrorInner: {
        width: '100%',
        maxWidth: 420,
    },
    globalErrorText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#b00020',
    },
    list: {
        flex: 1,
        width: '100%',
    },
    listContent: {
        paddingTop: 8,
        paddingBottom: 14,
    },
    row: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        position: 'relative',
        overflow: 'hidden',
    },
    rippleLayer: {
        ...StyleSheet.absoluteFillObject,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#e9e2ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarImage: {
        width: 48,
        height: 48,
        borderRadius: 24,
        marginRight: 12,
        backgroundColor: '#e9e2ff',
    },
    avatarText: {
        color: '#350d81',
        fontSize: 18,
        fontWeight: '700',
    },
    rowContent: {
        flex: 1,
        minWidth: 0,
        paddingVertical: 4,
    },
    followButton: {
        minWidth: 104,
        paddingHorizontal: 14,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        marginLeft: 10,
    },
    followButtonPrimary: {
        backgroundColor: '#6733d0',
        borderColor: '#6733d0',
    },
    followButtonGhost: {
        backgroundColor: '#fff',
        borderColor: '#6733d0',
    },
    followButtonPressed: {
        backgroundColor: 'rgba(233,226,255,0.42)',
    },
    followButtonPressedPrimary: {
        opacity: 0.88,
    },
    followButtonDisabled: {
        opacity: 0.6,
    },
    followButtonText: {
        fontSize: 12,
        fontWeight: '800',
        textAlign: 'center',
        includeFontPadding: false,
    },
    followButtonTextPrimary: {
        color: '#fff',
    },
    followButtonTextGhost: {
        color: '#6733d0',
    },
    followButtonTextDisabled: {
        // Keep same color; opacity is handled by the container.
    },
    rowTop: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
        minWidth: 0,
    },
    name: {
        flex: 1,
        flexShrink: 1,
        fontSize: 16,
        fontWeight: '600',
        marginRight: 8,
    },
    time: {
        fontSize: 12,
        color: '#666',
        flexShrink: 0,
        textAlign: 'right',
    },
    lastMessage: {
        fontSize: 13,
        color: '#666',
        flexShrink: 1,
    },

    emptyWrap: {
        width: '100%',
        maxWidth: 520,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingTop: 28,
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
    notification: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    }
    ,
    notificationIconWrap: {
        width: 22,
        height: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notificationDot: {
        position: 'absolute',
        top: -1,
        right: -1,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#6733d0',
        borderWidth: 1,
        borderColor: '#fff',
    },
    notificationPressed: {
        opacity: 0.75,
    }
});





export default ChatsScreen;

