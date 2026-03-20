/**
 * Chatroom.tsx — Production-grade chat UI
 *
 * Key improvements over original:
 *  - Unified KeyboardAvoidingView (no iOS/Android code duplication)
 *  - Per-message slide-in + fade animation
 *  - Send button icon with scale + opacity micro-animation
 *  - Input bar animated border on focus
 *  - Auto-scroll to latest message
 *  - Timestamp rendering
 *  - LayoutAnimation on Android for smooth composer resize
 *  - Proper safe-area / bottom-inset handling across every device
 *  - Memoised renderItem so FlatList never re-renders unchanged bubbles
 */

import AvatarPicker from '@/app/components/AvatarPicker';
import MessageBubble from '@/app/components/messageComponent';
import useAuth from '@/hooks/useAuth';
import { getConversationMessages } from '@/services/AuthService';
import { useWebSocketClient } from '@/services/WebSocketClient';
import { Ionicons } from '@expo/vector-icons';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import {
    Animated,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    LayoutAnimation,
    Platform,
    Pressable,
    StatusBar,
    Text,
    TextInput,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from './chatroomStyles';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ─────────────────────── Types ─────────────────────── */

export type ChatMessage = {
    id: string;
    text: string;
    sender: 'me' | 'other';
    createdAt: string;
    status?: 'sending' | 'sent' | 'delivered' | 'read';
};

type ConversationCacheItem = {
    messages: ChatMessage[];
    fetchedAt: number;
};

const CONVERSATION_CACHE_TTL_MS = 2 * 60 * 1000;
const conversationCache = new Map<string, ConversationCacheItem>();

/* ─────────────────────── Main Screen ─────────────────────── */

interface ChatroomProps {
    navigation: any;
    route: any;
}

const Chatroom = ({ navigation, route }: ChatroomProps) => {
    const { user } = useAuth();
    const { lastMessage, sendMessage, markRead } = useWebSocketClient();
    const insets = useSafeAreaInsets();

    const peerId = String(route?.params?.peerId ?? '').trim();
    const peerUsername = String(route?.params?.peerUsername ?? 'Chat').trim() || 'Chat';
    const peerAvatar =
        typeof route?.params?.peerAvatar === 'string' && route.params.peerAvatar.trim().length > 0
            ? route.params.peerAvatar.trim()
            : '';

    const [draft, setDraft] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const listRef = useRef<FlatList<ChatMessage>>(null);

    /* Send-button state */
    const sendOpacity = useRef(new Animated.Value(0.35)).current;

    /* Input border animation */
    const borderAnim = useRef(new Animated.Value(0)).current;

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loadingMore, setLoadingMore] = useState(false);
    const [oldestMessageDate, setOldestMessageDate] = useState<string | null>(null);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);

    const writeConversationCache = useCallback((id: string, nextMessages: ChatMessage[]) => {
        if (!id) return;
        conversationCache.set(id, {
            messages: nextMessages,
            fetchedAt: Date.now(),
        });
    }, []);

    useEffect(() => {
        let mounted = true;
        shouldAutoScroll.current = true;

        const hydrateConversation = async () => {
            if (!peerId) return;
            try {
                // Instant open: hydrate from recent in-memory cache first.
                const cached = conversationCache.get(peerId);
                const cacheIsFresh =
                    !!cached && Date.now() - cached.fetchedAt <= CONVERSATION_CACHE_TTL_MS;

                if (cacheIsFresh && cached.messages.length > 0) {
                    setMessages(cached.messages);
                    setOldestMessageDate(cached.messages[0]?.createdAt ?? null);
                    setHasMoreMessages(cached.messages.length >= 50);
                } else {
                    setOldestMessageDate(null);
                    setHasMoreMessages(true);
                }
                
                const res = await getConversationMessages(peerId, undefined);
                if (!mounted) return;

                const incoming = Array.isArray((res as any)?.messages) ? (res as any).messages : [];
                const normalized: ChatMessage[] = incoming.map((m: any) => ({
                    id: String(m?.id ?? Date.now()),
                    text: String(m?.text ?? ''),
                    sender: m?.sender === 'me' ? 'me' : 'other',
                    createdAt: String(m?.createdAt ?? new Date().toISOString()),
                    status:
                        m?.status === 'read' || m?.status === 'delivered' || m?.status === 'sent' || m?.status === 'sending'
                            ? m.status
                            : undefined,
                }));
                
                setMessages(normalized);
                writeConversationCache(peerId, normalized);
                
                // Track oldest message for pagination
                if (normalized.length > 0) {
                    const oldestMsg = normalized[0];
                    setOldestMessageDate(oldestMsg.createdAt);
                    setHasMoreMessages(normalized.length >= 50);
                } else {
                    setHasMoreMessages(false);
                }
            } catch (err: any) {
                console.log('conversation hydrate error:', err?.message ?? String(err));
            }
        };

        void hydrateConversation();
        return () => {
            mounted = false;
        };
    }, [peerId, writeConversationCache]);

    useEffect(() => {
        const type = String((lastMessage as any)?.type ?? '');
        if (!type) return;

        const from = String((lastMessage as any)?.from ?? '').trim();
        const to = String((lastMessage as any)?.to ?? '').trim();
        const content = String((lastMessage as any)?.content ?? '').trim();
        const id = String((lastMessage as any)?.id ?? `${Date.now()}_${from}_${to}`);
        const clientId = String((lastMessage as any)?.clientId ?? '').trim();
        const date = String((lastMessage as any)?.date ?? new Date().toISOString());
        const currentUserId = String(user?.id ?? '').trim();

        if (!peerId || !currentUserId) return;

        if (type === 'message_status') {
            const status = String((lastMessage as any)?.status ?? '').trim();
            if (status !== 'sent' && status !== 'delivered' && status !== 'read') return;

            setMessages((prev) => {
                let changed = false;
                const next = prev.map((m) => {
                    const idMatch = m.id === id;
                    const clientMatch = clientId && m.id === clientId;
                    if (!idMatch && !clientMatch) return m;
                    changed = true;
                    return {
                        ...m,
                        id: id || m.id,
                        status: status as ChatMessage['status'],
                    };
                });
                if (!changed) return prev;
                writeConversationCache(peerId, next);
                return next;
            });
            return;
        }

        if (type === 'messages_read') {
            const idsRaw = Array.isArray((lastMessage as any)?.ids) ? (lastMessage as any).ids : [];
            const ids = new Set(idsRaw.map((x: any) => String(x)));
            if (ids.size === 0) return;

            setMessages((prev) => {
                let changed = false;
                const next = prev.map((m) => {
                    if (!ids.has(m.id)) return m;
                    changed = true;
                    return { ...m, status: 'read' as const };
                });
                if (!changed) return prev;
                writeConversationCache(peerId, next);
                return next;
            });
            return;
        }

        if (type !== 'new_message' && type !== 'sent') return;
        if (!content) return;

        const belongsToOpenConversation =
            (from === currentUserId && to === peerId) ||
            (from === peerId && to === currentUserId);
        if (!belongsToOpenConversation) return;

        setMessages((prev) => {
            // If this is an ack for an optimistic message, upgrade it in place.
            if (type === 'sent' && clientId) {
                let changed = false;
                const upgraded = prev.map((m) => {
                    if (m.id !== clientId) return m;
                    changed = true;
                    return { ...m, id, createdAt: date, status: 'sent' as const };
                });
                if (changed) {
                    writeConversationCache(peerId, upgraded);
                    return upgraded;
                }
            }

            if (prev.some((m) => m.id === id)) return prev;
            const appended: ChatMessage = {
                id,
                text: content,
                sender: from === currentUserId ? 'me' : 'other',
                createdAt: date,
                status: from === currentUserId ? 'sent' : undefined,
            };
            const next = [...prev, appended];
            writeConversationCache(peerId, next);
            return next;
        });

        if (type === 'new_message' && from === peerId && to === currentUserId) {
            markRead(peerId, date);
        }
    }, [lastMessage, markRead, peerId, user?.id, writeConversationCache]);

    useEffect(() => {
        if (!peerId || messages.length === 0) return;
        const latest = messages[messages.length - 1];
        if (!latest || latest.sender !== 'other') return;
        markRead(peerId, latest.createdAt);
    }, [markRead, messages, peerId]);

    const initials = useMemo(() => {
        const name = String(user?.username ?? '').trim();
        return name ? name.slice(0, 1).toUpperCase() : '?';
    }, [user?.username]);

    const canSend = draft.trim().length > 0;

    /* Keep send button visually in sync with canSend */
    useEffect(() => {
        Animated.timing(sendOpacity, {
            toValue: canSend ? 1 : 0.35,
            duration: 160,
            useNativeDriver: true,
        }).start();
    }, [canSend]);

    /* Animate input border on focus */
    useEffect(() => {
        Animated.timing(borderAnim, {
            toValue: isFocused ? 1 : 0,
            duration: 200,
            useNativeDriver: false,
        }).start();
    }, [isFocused]);

    /* Header elements animation */
    const headerScale = useRef(new Animated.Value(1)).current;
    
    const animatedBorderColor = borderAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(103,51,208,0.18)', 'rgba(103,51,208,0.85)'],
    });

    const animateHeaderElement = useCallback((anim: Animated.Value) => {
        Animated.sequence([
            Animated.spring(anim, { toValue: 0.92, useNativeDriver: true, speed: 60 }),
            Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }),
        ]).start();
    }, []);

    /* Scroll to end on initial load or new messages */
    const shouldAutoScroll = useRef(true);
    useEffect(() => {
        if (shouldAutoScroll.current && messages.length > 0) {
            const timer = setTimeout(() => {
                listRef.current?.scrollToEnd({ animated: false });
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [messages.length]);

    /* Load older messages when user scrolls to top */
    const handleLoadMore = useCallback(async () => {
        if (loadingMore || !hasMoreMessages || !oldestMessageDate || !peerId) return;
        
        setLoadingMore(true);
        try {
            const res = await getConversationMessages(peerId, oldestMessageDate);
            const incoming = Array.isArray((res as any)?.messages) ? (res as any).messages : [];
            
            if (incoming.length === 0) {
                setHasMoreMessages(false);
                return;
            }
            
            const normalized: ChatMessage[] = incoming.map((m: any) => ({
                id: String(m?.id ?? Date.now()),
                text: String(m?.text ?? ''),
                sender: m?.sender === 'me' ? 'me' : 'other',
                createdAt: String(m?.createdAt ?? new Date().toISOString()),
            }));
            
            setMessages((prev) => {
                const next = [...normalized, ...prev];
                writeConversationCache(peerId, next);
                return next;
            });
            
            if (normalized.length > 0) {
                setOldestMessageDate(normalized[0].createdAt);
            }
            
            if (normalized.length < 50) {
                setHasMoreMessages(false);
            }
            
            shouldAutoScroll.current = false;
        } catch (err: any) {
            console.log('load more error:', err?.message ?? String(err));
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore, hasMoreMessages, oldestMessageDate, peerId]);

    const handleBack = useCallback(() => {
        Keyboard.dismiss();
        navigation.goBack();
    }, [navigation]);

    const handleSend = useCallback(() => {
        if (!canSend || !peerId) return;
        const text = draft.trim();
        setDraft('');
        const clientId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        setMessages((prev) => {
            const optimistic: ChatMessage = {
                id: clientId,
                text,
                sender: 'me',
                createdAt: new Date().toISOString(),
                status: 'sending',
            };
            const next = [...prev, optimistic];
            writeConversationCache(peerId, next);
            return next;
        });

        /* Trigger LayoutAnimation on Android so the composer height change is smooth */
        if (Platform.OS === 'android') {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }

        /* Quick send confirm */
        // Send immediately, no animation needed

        const ok = sendMessage(peerId, text, clientId);
        if (!ok) {
            setDraft(text);
            setMessages((prev) => {
                const next = prev.map((m) =>
                    m.id === clientId ? { ...m, status: 'sending' as const } : m
                );
                writeConversationCache(peerId, next);
                return next;
            });
        }
    }, [canSend, draft, peerId, sendMessage, writeConversationCache]);

    const renderItem = useCallback(
        ({ item }: { item: ChatMessage }) => (
            <MessageBubble
                id={item.id}
                text={item.text}
                sender={item.sender}
                createdAt={item.createdAt}
                status={item.status || 'sent'}
            />
        ),
        [],
    );

    const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

    /* ── Shared Header ── */
    const Header = (
        <View style={styles.header}>
            <Pressable
                onPress={handleBack}
                hitSlop={12}
                style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
                android_ripple={{ color: 'rgba(103,51,208,0.18)', borderless: true }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
            >
                <Ionicons name="arrow-back" size={22} color="#1a1a2e" />
            </Pressable>

            <Pressable
                onPress={() => {}}
                hitSlop={8}
                style={({ pressed }) => [styles.avatarBtn, pressed && styles.pressed]}
                android_ripple={{ color: 'rgba(103,51,208,0.18)', borderless: true }}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
            >
                <AvatarPicker
                    uri={peerAvatar}
                    name={peerUsername}
                    size={40}
                    style={styles.avatarImage}
                    fallbackStyle={styles.avatarFallback}
                    textStyle={styles.avatarFallbackText}
                    previewEnabled
                />
                {/* Online dot */}
                {/* <View style={styles.onlineDot} /> */}
            </Pressable>

            <Pressable
                onPress={() => {}}
                style={({ pressed }) => [styles.headerTitleWrap, pressed && styles.pressed]}
                hitSlop={8}
                android_ripple={{ color: 'rgba(103,51,208,0.12)', borderless: false }}
                accessibilityRole="button"
                accessibilityLabel="Open chat details"
            >
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {peerUsername}
                </Text>
                <Text style={styles.headerSubtitle}>Online</Text>
            </Pressable>



            <Pressable
                onPress={() => {}}
                hitSlop={12}
                style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
                android_ripple={{ color: 'rgba(103,51,208,0.18)', borderless: true }}
                accessibilityRole="button"
                accessibilityLabel="More options"
            >
                <Ionicons name="ellipsis-vertical" size={20} color="#1a1a2e" />
            </Pressable>
        </View>
    );

    /* ── Shared Composer ── */
    const Composer = (
        <View
            style={[
                styles.composerContainer,
                { paddingBottom: Math.max(insets.bottom, 4) },
            ]}
        >
            <View style={styles.composerOuter}>
                <Animated.View style={[styles.inputBar, { borderColor: animatedBorderColor }]}>


                <TextInput
                    placeholder="Message…"
                    style={styles.input}
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    maxLength={4000}
                    placeholderTextColor="rgba(103,51,208,0.4)"
                    returnKeyType="default"
                    textAlignVertical="center"
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                />

                {/* Emoji icon */}
                {/* <Pressable
                    onPress={() => {}}
                    hitSlop={8}
                    style={({ pressed }) => [styles.emojiBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Emoji"
                >
                    <Ionicons name="happy-outline" size={22} color="#9b7bde" />
                </Pressable> */}

                {/* Send button */}
                <Pressable
                    onPress={handleSend}
                    disabled={!canSend}
                    style={[styles.sendBtn, { opacity: canSend ? 1 : 0.35 }]}
                    android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: false }}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Send message"
                >
                    <Ionicons name="send" size={18} color="#fff" />
                </Pressable>
                </Animated.View>
            </View>
        </View>
    );

    const MainContent = (
        <View style={styles.container}>
            {Header}

            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="none"
                scrollEnabled={true}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={Platform.OS === 'android'}
                initialNumToRender={20}
                maxToRenderPerBatch={10}
                windowSize={15}
                updateCellsBatchingPeriod={30}
                onStartReached={handleLoadMore}
                onStartReachedThreshold={0.5}
            />

            {Composer}
        </View>
    );

    /* ── Render ── */
    return (
        <>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
                {Platform.OS === 'ios' ? (
                    <KeyboardAvoidingView
                        style={styles.safe}
                        behavior="padding"
                        keyboardVerticalOffset={0}
                        enabled
                    >
                        {MainContent}
                    </KeyboardAvoidingView>
                ) : (
                    MainContent
                )}
            </SafeAreaView>
        </>
    );
};

export default Chatroom;