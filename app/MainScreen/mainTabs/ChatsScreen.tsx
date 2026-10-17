import AvatarPicker from '@/app/components/AvatarPicker';
import ChatBar, { type ChatListItem, type GlobalChatListItem } from '@/app/components/chatbar';
import {
    Badge,
    Button,
    EmptyState,
    IconButton,
    NavBar,
    Notice,
    PressableScale,
    SearchField,
    SegmentedControl,
    useNavBarHeight,
    useScrollEdge,
    useTabBarClearance,
} from '@/app/components/ui';
import useAuth from '@/hooks/useAuth';
import {
    getAuthErrorMessage,
    getChatInbox,
    getFreshAccessToken,
    getUnreadNotificationCount,
    type ChatInboxDto,
} from '@/services/AuthService';
import {
    isPrimaryRelationshipAction,
    performRelationshipAction,
    relationshipLabel,
    toRelationship,
    type Relationship,
} from '@/services/relationships';
import { useSocketEvents } from '@/services/WebSocketClient';
import { useE2EE, useE2EEEvents } from '@/services/e2ee/E2EEProvider';
import { type LocalMessage } from '@/services/e2ee/localStore';
import { useUnread } from '@/Context/UnreadContext';
import { API_ORIGIN } from '@/services/config';
import { makeStyles, useTheme } from '@/src/theme';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

const NOTIFICATIONS_LAST_SEEN_KEY = 'notificationsLastSeenAt';

const chatGlyph = (fill: string) => `
<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="${fill}">
    <path d="M80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"/>
</svg>
`;

// Today: time. Yesterday: "Yesterday". This week: weekday. Older: short date.
const formatChatTime = (raw?: string) => {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const t = date.getTime();
    if (t >= startOfToday) return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (t >= startOfToday - dayMs) return 'Yesterday';
    if (t >= startOfToday - 6 * dayMs) return date.toLocaleDateString(undefined, { weekday: 'short' });
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

type GlobalUserSearchResult = {
    id?: string;
    _id?: unknown;
    username?: string;
    profilePicture?: string;
    relationship?: string;
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
            // Prefer incoming unreadCount (from API); keep existing if incoming doesn't specify.
            unreadCount: typeof next.unreadCount === 'number' ? next.unreadCount : (prev.unreadCount ?? 0),
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

type ChatRowAction = {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'ghost';
    loading?: boolean;
};

export const ChatRow = ({ item, onPress }: { item: ChatListItem; onPress: () => void }) => {
    const s = useStyles();
    const unread = item.unreadCount ?? 0;
    const time = formatChatTime(item.Date);
    return (
        <PressableScale
            onPress={onPress}
            scaleTo={1}
            style={s.row}
            pressedStyle={s.rowPressed}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}${unread > 0 ? `, ${unread} unread` : ''}, ${item.lastMessage}${time ? `, ${time}` : ''}`}
        >
            <AvatarPicker uri={item.profilePicture} name={item.name} size={52} previewEnabled={false} />
            <View style={s.rowContent}>
                <View style={s.rowTop}>
                    <Text style={[s.name, unread > 0 && s.nameUnread]} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <Text style={[s.time, unread > 0 && s.timeUnread]} numberOfLines={1}>
                        {time}
                    </Text>
                </View>
                <View style={s.rowBottom}>
                    <Text style={[s.lastMessage, unread > 0 && s.lastMessageUnread]} numberOfLines={2}>
                        {item.lastMessage}
                    </Text>
                    <Badge count={unread} style={s.badge} />
                </View>
            </View>
        </PressableScale>
    );
};

export const GlobalChatRow = ({ item, action }: { item: GlobalChatListItem; action: ChatRowAction }) => {
    const s = useStyles();
    return (
        <View style={s.row}>
            <AvatarPicker uri={item.profilePicture} name={item.name} size={52} previewEnabled />
            <View style={s.rowContent}>
                <Text style={s.name} numberOfLines={1}>
                    {item.name}
                </Text>
            </View>
            <Button
                title={action.label}
                onPress={action.onPress}
                disabled={action.disabled && !action.loading}
                loading={action.loading}
                variant={action.variant === 'primary' ? 'filled' : 'tinted'}
                size="sm"
                style={s.followButton}
                accessibilityLabel={`${action.label} ${item.name}`}
            />
        </View>
    );
};

// Chat list preview from the phone's own store: the server never has message text.
const previewOf = (m: LocalMessage): string => {
    switch (m.kind) {
        case 'text':
            return m.text;
        case 'undecryptable':
            return "Message couldn't be decrypted";
        case 'other_device':
            return 'Message sent to your previous install';
        default:
            return 'New message';
    }
};

type ListRow = { kind: 'chat'; chat: ChatListItem } | { kind: 'user'; user: GlobalChatListItem };

const LARGE_TITLE_HEIGHT = 52;

const ChatsScreen = ({ navigation }: { navigation: any }) => {
    const s = useStyles();
    const { colors } = useTheme();
    const { refreshUnreadCount } = useUnread();

    const { user } = useAuth();
    const currentUserId = typeof user?.id === 'string' ? user.id : user?.id ? String(user.id) : '';
    const { engine } = useE2EE();

    const navHeight = useNavBarHeight();
    const bottomClearance = useTabBarClearance();
    const { scrollY, onScroll } = useScrollEdge();

    const [query, setQuery] = useState('');
    const [searchMode, setSearchMode] = useState<'local' | 'global'>('local');

    const [globalSearching, setGlobalSearching] = useState(false);
    const [globalError, setGlobalError] = useState<string | null>(null);
    const [globalResults, setGlobalResults] = useState<GlobalUserSearchResult[]>([]);
    const [showingGlobal, setShowingGlobal] = useState(false);

    const [relationshipById, setRelationshipById] = useState<Record<string, Relationship>>({});
    const [followPendingById, setFollowPendingById] = useState<Record<string, boolean>>({});
    const [chatRows, setChatRows] = useState<ChatListItem[]>(ChatBar);

    const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);

    const searchInputRef = useRef<TextInput | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const apiOrigin = API_ORIGIN;

    // Latest decrypted message per contact, from the local encrypted store.
    const applyLocalPreviews = useCallback(async (rows: ChatListItem[]) => {
        if (!engine || rows.length === 0) return rows;
        const latest = new Map((await engine.getLatestPerPeer()).map((m) => [m.peerId, m]));
        return rows.map((row) => {
            const m = latest.get(String(row.id));
            if (!m) return row;
            const localNewer = !row.Date || m.createdAt > String(row.Date);
            return { ...row, lastMessage: previewOf(m), Date: localNewer ? m.createdAt : row.Date };
        });
    }, [engine]);

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
                lastMessage: 'New message',
                Date: typeof u.date === 'string' ? u.date : '',
                unreadCount: typeof u.unreadCount === 'number' ? u.unreadCount : 0,
            }));

            // The server's inbox is the full list: chats that were removed or blocked drop out.
            setChatRows(mergeChatsById(await applyLocalPreviews(incoming), []));
        } catch (err: any) {
            console.log('chat inbox hydrate error:', err?.message ?? String(err));
        }
    }, [currentUserId, applyLocalPreviews]);

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

    useSocketEvents((lastMessage) => {
        const type = String((lastMessage as any)?.type ?? '');
        // After a (re)connect, catch up on anything missed while offline.
        if (type === 'badge_update' || type === 'registered') {
            refreshUnreadCount();
            void loadChatsFromInbox();
            return;
        }
        if (type === 'new_message') refreshUnreadCount();
    });

    // A message was decrypted, sent or changed: refresh that chat's preview, or the list if the chat is new.
    useE2EEEvents((event) => {
        if (event.type !== 'messages') return;
        const known = chatRows.some((row) => String(row.id) === event.peerId);
        if (!known) {
            void loadChatsFromInbox();
            return;
        }
        void applyLocalPreviews(chatRows.filter((row) => String(row.id) === event.peerId)).then(([updated]) => {
            if (!updated) return;
            setChatRows((prev) => mergeChatsById([updated], prev));
        });
    });

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
            const token = await getFreshAccessToken();
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
            // Start each row from the server's view of the relationship.
            setRelationshipById((prev) => {
                const next = { ...prev };
                for (const u of users) {
                    const id = pickValidUserId(u);
                    if (id) next[id] = toRelationship(u?.relationship);
                }
                return next;
            });
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
        return globalResults.map((u) => {
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

    const rows: ListRow[] = useMemo(
        () =>
            showingGlobal
                ? globalAsChatRows.map((u) => ({ kind: 'user' as const, user: u }))
                : filteredChats.map((c) => ({ kind: 'chat' as const, chat: c })),
        [showingGlobal, globalAsChatRows, filteredChats]
    );

    const relationshipOf = (targetUserId: string): Relationship => relationshipById[targetUserId] ?? 'none';
    const isPending = (targetUserId: string) => !!followPendingById[targetUserId];

    const runRelationshipAction = async (targetUserId: string, username: string) => {
        if (!targetUserId) return;
        if (!currentUserId) {
            setGlobalError('Please login to follow users.');
            return;
        }
        if (targetUserId === currentUserId) return;
        if (isPending(targetUserId)) return;

        setFollowPendingById((prev) => ({ ...prev, [targetUserId]: true }));
        try {
            const next = await performRelationshipAction(targetUserId, username, relationshipOf(targetUserId));
            setRelationshipById((prev) => ({ ...prev, [targetUserId]: next }));
            if (next === 'connected') void loadChatsFromInbox();
        } catch (err) {
            setGlobalError(getAuthErrorMessage(err, 'Failed to update follow status.'));
        } finally {
            setFollowPendingById((prev) => ({ ...prev, [targetUserId]: false }));
        }
    };

    const switchMode = (index: number) => {
        if (index === 0) {
            setSearchMode('local');
            setShowingGlobal(false);
            setGlobalResults([]);
            setGlobalError(null);
        } else {
            setSearchMode('global');
            setGlobalError(null);
            setShowingGlobal(true);
            void runGlobalSearch(query);
        }
        searchInputRef.current?.focus();
    };

    const openChat = (item: ChatListItem) => {
        // Clear unread badge for this chat immediately
        setChatRows((prev) => prev.map((row) => (row.id === item.id ? { ...row, unreadCount: 0 } : row)));
        navigation.navigate('Chatroom', {
            peerId: item.id,
            peerUsername: item.name,
            peerAvatar: item.profilePicture,
        });
    };

    const renderItem = ({ item }: { item: ListRow }) => {
        if (item.kind === 'chat') return <ChatRow item={item.chat} onPress={() => openChat(item.chat)} />;

        const targetUserId = String(item.user.id ?? '').trim();
        const pending = targetUserId ? isPending(targetUserId) : false;
        const relationship = targetUserId ? relationshipOf(targetUserId) : 'none';
        const action: ChatRowAction = {
            label: relationshipLabel[relationship],
            onPress: () => {
                void runRelationshipAction(targetUserId, item.user.name);
            },
            disabled: pending || !targetUserId || !currentUserId || targetUserId === currentUserId,
            variant: isPrimaryRelationshipAction(relationship) ? 'primary' : 'ghost',
            loading: pending,
        };
        return <GlobalChatRow item={item.user} action={action} />;
    };

    const listEmpty = (() => {
        if (showingGlobal) {
            if (globalSearching) return <EmptyState icon="search" title="Searching…" message="Looking for users…" />;
            if (globalError) return <EmptyState icon="cloud-offline-outline" title="Search failed" message={globalError} actionTitle="Try again" onAction={() => void runGlobalSearch(query)} />;
            return <EmptyState icon="person-outline" title="No users found" message="Try a different search term." />;
        }
        if (query.trim()) return <EmptyState icon="search" title="No chats found" message="Try a different search term." />;
        return (
            <EmptyState
                icon="chatbubbles-outline"
                title="No chats yet"
                message="Users you message will appear here in realtime."
                actionTitle="Find people"
                onAction={() => switchMode(1)}
            />
        );
    })();

    const header = (
        <View style={s.header}>
            <View style={s.largeTitleRow}>
                <SvgXml xml={chatGlyph(colors.wordmark)} width={26} height={26} />
                <Text style={s.largeTitle} accessibilityRole="header">
                    TalkNow
                </Text>
            </View>
            <SearchField
                ref={searchInputRef}
                placeholder={searchMode === 'global' ? 'Search users' : 'Search chats'}
                value={query}
                searching={showingGlobal && globalSearching}
                onChangeText={(text) => {
                    setQuery(text);
                    if (searchMode === 'local') {
                        setShowingGlobal(false);
                        setGlobalResults([]);
                        setGlobalError(null);
                    }
                }}
                onClear={() => {
                    setQuery('');
                    setShowingGlobal(false);
                    setGlobalResults([]);
                    setGlobalError(null);
                    setGlobalSearching(false);
                    searchInputRef.current?.focus();
                }}
                onSubmitEditing={() => {
                    if (searchMode === 'global') void runGlobalSearch(query);
                }}
                testID="chats-search"
            />
            <SegmentedControl
                segments={['Chats', 'Users']}
                selectedIndex={searchMode === 'global' ? 1 : 0}
                onChange={switchMode}
                style={s.segmented}
                testID="chats-mode"
            />
            {showingGlobal && globalError && rows.length > 0 ? (
                <Notice tone="danger" icon="alert-circle-outline" style={s.inlineError}>
                    {globalError}
                </Notice>
            ) : null}
        </View>
    );

    return (
        <View style={s.screen}>
            <Animated.FlatList
                data={rows}
                keyExtractor={(row, index) =>
                    row.kind === 'chat' ? `c-${String(row.chat.id ?? index)}` : row.user.id ? `u-${row.user.id}` : `missing-id-${index}`
                }
                renderItem={renderItem}
                extraData={{ relationshipById, followPendingById, currentUserId }}
                ItemSeparatorComponent={() => <View style={s.separator} />}
                ListHeaderComponent={header}
                ListEmptyComponent={listEmpty}
                onScroll={onScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: navHeight - 8, paddingBottom: bottomClearance }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
            />
            <NavBar
                title="TalkNow"
                scrollY={scrollY}
                titleRevealAt={LARGE_TITLE_HEIGHT - 4}
                trailing={
                    <IconButton
                        name={hasUnreadNotifications ? 'notifications' : 'notifications-outline'}
                        dot={hasUnreadNotifications}
                        color={colors.tintText}
                        onPress={() => {
                            setHasUnreadNotifications(false);
                            navigation.navigate('Notifications');
                        }}
                        accessibilityLabel={hasUnreadNotifications ? 'Notifications, new activity' : 'Notifications'}
                        testID="chats-notifications"
                    />
                }
            />
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    screen: {
        flex: 1,
        backgroundColor: t.colors.ground,
    },
    header: {
        paddingHorizontal: t.space.gutter,
        paddingBottom: t.space.sm,
        gap: t.space.md,
    },
    largeTitleRow: {
        height: LARGE_TITLE_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.sm,
    },
    largeTitle: {
        ...t.type.largeTitle,
        color: t.colors.wordmark,
    },
    segmented: {
        alignSelf: 'flex-start',
        width: 176,
    },
    inlineError: {
        marginTop: t.space.xs,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        paddingHorizontal: t.space.gutter,
        paddingVertical: t.space.md,
        minHeight: 76,
    },
    rowPressed: {
        backgroundColor: t.colors.pressedOverlay,
    },
    separator: {
        height: t.size.hairline,
        backgroundColor: t.colors.separator,
        marginLeft: t.space.gutter + 52 + t.space.md,
    },
    rowContent: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    rowTop: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: t.space.sm,
    },
    name: {
        flex: 1,
        ...t.type.headline,
        color: t.colors.label,
    },
    nameUnread: {
        fontWeight: '700',
    },
    time: {
        ...t.type.subhead,
        color: t.colors.secondaryLabel,
        fontVariant: ['tabular-nums'],
    },
    timeUnread: {
        color: t.colors.tintText,
        fontWeight: '600',
    },
    rowBottom: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.space.sm,
    },
    lastMessage: {
        flex: 1,
        ...t.type.subhead,
        color: t.colors.secondaryLabel,
    },
    lastMessageUnread: {
        color: t.colors.label,
    },
    badge: {
        marginTop: 1,
    },
    followButton: {
        minWidth: 92,
    },
}));

export default ChatsScreen;
