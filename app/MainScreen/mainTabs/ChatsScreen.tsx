import ChatBar, { type ChatListItem, type GlobalChatListItem } from '@/app/components/chatbar';
import useAuth from '@/hooks/useAuth';
import { followUser, getAuthErrorMessage, unfollowUser } from '@/services/AuthService';
import { useWebSocketClient } from '@/services/WebSocketClient';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    FlatList,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    type GestureResponderEvent,
    type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const MODE_TOGGLE_WIDTH = 104;
const MODE_TOGGLE_PADDING = 2;
const MODE_TOGGLE_PILL_WIDTH = (MODE_TOGGLE_WIDTH - MODE_TOGGLE_PADDING * 2) / 2;

const formatChatTime = (raw?: string) => {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

type GlobalUserSearchResult = {
    id?: string;
    _id?: string;
    username?: string;
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

            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{String(item.name || '?').slice(0, 1).toUpperCase()}</Text>
            </View>

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
    return (
        <View style={styles.row}>
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{String(item.name || '?').slice(0, 1).toUpperCase()}</Text>
            </View>

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
                <Text
                    style={[
                        styles.followButtonText,
                        variant === 'primary' ? styles.followButtonTextPrimary : styles.followButtonTextGhost,
                        action.disabled && styles.followButtonTextDisabled,
                    ]}
                >
                    {action.label}
                </Text>
            </Pressable>
        </View>
    );
};

const ChatsScreen = ({ navigation }: { navigation: any }) => {
    useWebSocketClient();

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

    const searchInputRef = useRef<TextInput | null>(null);
    const focusAnim = useRef(new Animated.Value(0)).current;
    const modeAnim = useRef(new Animated.Value(0)).current; // 0 = local, 1 = global
    const spinAnim = useRef(new Animated.Value(0)).current;
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const apiOrigin = useMemo(() => normalizeApiOrigin(getDefaultApiUrl()), []);

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

    const runGlobalSearch = async (raw: string) => {
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
                id: u.id,
                _id: u._id,
                username: u.username,
            }));
            setGlobalResults(sanitized);
        } catch (err: any) {
            setGlobalResults([]);
            setGlobalError(typeof err?.message === 'string' ? err.message : 'Search failed.');
        } finally {
            setGlobalSearching(false);
        }
    };

    useEffect(() => {
        if (searchMode !== 'global') return;

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            void runGlobalSearch(query);
        }, 320);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [query, searchMode]);

    const filteredChats: ChatListItem[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return ChatBar;
        return ChatBar.filter((item) => {
            const haystack = `${String(item.name ?? '')} ${String(item.lastMessage ?? '')}`.toLowerCase();
            return haystack.includes(q);
        });
    }, [query]);

    const globalAsChatRows: GlobalChatListItem[] = useMemo(() => {
        return globalResults.map((u, index) => {
            const id = String(u.id ?? u._id ?? index);
            const username = String(u.username ?? '').trim();
            return {
                id,
                name: username || 'User',
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
                await followUser(targetUserId, currentUserId);
            } else {
                await unfollowUser(targetUserId, currentUserId);
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
                        : 'Start a conversation to see it here.'}
            </Text>
        </View>
    );


    const renderChatItem = ({ item }: { item: ChatListItem }) => (
        <ChatRow
            item={item}
            onPress={() => navigation.navigate('Chatroom')}
        />
    );

    const renderGlobalItem = ({ item }: { item: GlobalChatListItem }) => {
        const targetUserId = String(item.id ?? '').trim();
        const pending = targetUserId ? isPending(targetUserId) : false;
        const following = targetUserId ? isFollowing(targetUserId) : false;

        const action: ChatRowAction = {
            label: pending ? '...' : following ? 'Following' : 'Follow',
            onPress: () => {
                void toggleFollow(targetUserId);
            },
            disabled: pending || !targetUserId || !currentUserId || targetUserId === currentUserId,
            variant: following ? 'ghost' : 'primary',
        };

        return <GlobalChatRow item={item} action={action} />;
    };
    return (  
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={[styles.header, { paddingHorizontal: horizontalSafePad }]}>
                <Text style={styles.headerTitle}>TalkNow</Text>
                <Pressable
                    style={({ pressed }) => [
                        styles.notification,
                        pressed && styles.notificationPressed,
                    ]}
                    onPress={() => navigation.navigate('Notifications')}
                    hitSlop={10}
                    android_ripple={Platform.OS === 'android' ? { color: 'rgba(103,51,208,0.18)' } : undefined}
                    accessibilityRole="button"
                    accessibilityLabel="Notifications"
                >
                    <Ionicons name="notifications" size={22} color="#1a1073" />
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
{/* global search logic */}
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
            </View>
            {showingGlobal ? (
                <FlatList
                    data={globalAsChatRows}
                    keyExtractor={(item, index) => String(item.id ?? index)}
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
        marginLeft: 4,
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
        borderColor: '#350d81',
        borderRadius: 30,
        paddingLeft: 10,
        paddingRight: 6,
        backgroundColor: '#fff',
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
        borderColor: '#6733d0',
    },
    modeToggle: {
        height: 32,
        width: MODE_TOGGLE_WIDTH,
        borderRadius: 16,
        backgroundColor: '#e9e2ff',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
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
        color: '#350d81',
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
    avatarText: {
        color: '#350d81',
        fontSize: 18,
        fontWeight: '700',
    },
    rowContent: {
        flex: 1,
        minWidth: 0,
    },
    followButton: {
        paddingHorizontal: 12,
        height: 30,
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
        backgroundColor: 'rgba(103,51,208,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    }
    ,
    notificationPressed: {
        opacity: 0.75,
    }
});





export default ChatsScreen;

