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

import useAuth from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import React, {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Animated,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    LayoutAnimation,
    Platform,
    Pressable,
    StatusBar,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    UIManager,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
};

/* ─────────────────────── Helpers ─────────────────────── */

function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ─────────────────────── Animated Bubble ─────────────────────── */

interface BubbleProps {
    item: ChatMessage;
}

const AnimatedBubble = memo(({ item }: BubbleProps) => {
    const translateY = useRef(new Animated.Value(18)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                tension: 80,
                friction: 10,
            }),
            Animated.timing(opacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();
    }, []); // run once on mount

    const isMe = item.sender === 'me';

    return (
        <Animated.View
            style={[
                styles.bubbleRow,
                isMe ? styles.bubbleRowMe : styles.bubbleRowOther,
                { opacity, transform: [{ translateY }] },
            ]}
        >
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextOther]}>
                    {item.text}
                </Text>
            </View>
            <Text style={[styles.timestamp, isMe ? styles.timestampMe : styles.timestampOther]}>
                {formatTime(item.createdAt)}
            </Text>
        </Animated.View>
    );
});

/* ─────────────────────── Main Screen ─────────────────────── */

interface ChatroomProps {
    navigation: any;
}

const Chatroom = ({ navigation }: ChatroomProps) => {
    const { user } = useAuth();
    const [draft, setDraft] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const listRef = useRef<FlatList<ChatMessage>>(null);

    /* Send-button animation */
    const sendScale = useRef(new Animated.Value(1)).current;
    const sendOpacity = useRef(new Animated.Value(0.35)).current;

    /* Input border animation */
    const borderAnim = useRef(new Animated.Value(0)).current;

    const [messages, setMessages] = useState<ChatMessage[]>([
        { id: '1', text: 'Hi 👋', sender: 'other', createdAt: new Date().toISOString() },
        { id: '2', text: 'Hello! How can I help?', sender: 'me', createdAt: new Date().toISOString() },
    ]);

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

    /* Scroll to end when messages change */
    useEffect(() => {
        const timer = setTimeout(() => {
            listRef.current?.scrollToEnd({ animated: true });
        }, 80);
        return () => clearTimeout(timer);
    }, [messages.length]);

    const handleBack = useCallback(() => {
        Keyboard.dismiss();
        navigation.goBack();
    }, [navigation]);

    const handleSend = useCallback(() => {
        if (!canSend) return;
        const text = draft.trim();
        setDraft('');

        /* Trigger LayoutAnimation on Android so the composer height change is smooth */
        if (Platform.OS === 'android') {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }

        /* Send button spring press */
        Animated.sequence([
            Animated.spring(sendScale, { toValue: 0.82, useNativeDriver: true, speed: 50 }),
            Animated.spring(sendScale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 12 }),
        ]).start();

        setMessages((prev) => [
            ...prev,
            {
                id: String(Date.now()),
                text,
                sender: 'me',
                createdAt: new Date().toISOString(),
            },
        ]);
    }, [canSend, draft]);

    const renderItem = useCallback(
        ({ item }: { item: ChatMessage }) => <AnimatedBubble item={item} />,
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
                {typeof user?.profilePicture === 'string' && user.profilePicture.trim() ? (
                    <Image source={{ uri: user.profilePicture.trim() }} style={styles.avatarImage} />
                ) : (
                    <View style={styles.avatarFallback}>
                        <Text style={styles.avatarFallbackText}>{initials}</Text>
                    </View>
                )}
                {/* Online dot */}
                <View style={styles.onlineDot} />
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
                    {user?.username ?? 'Chat'}
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
        <SafeAreaView edges={['bottom']} style={styles.composerContainer}>
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
                <Animated.View style={{ transform: [{ scale: sendScale }], opacity: sendOpacity }}>
                    <Pressable
                        onPress={handleSend}
                        disabled={!canSend}
                        style={styles.sendBtn}
                        android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: false }}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="Send message"
                    >
                        <Ionicons name="send" size={18} color="#fff" />
                    </Pressable>
                </Animated.View>
                </Animated.View>
            </View>
        </SafeAreaView>
    );

    /* ── Render ── */
    return (
        <>
            <StatusBar barStyle="dark-content" backgroundColor="#f8f5ff" />
            <SafeAreaView style={styles.safe} edges={['top']}>
                <KeyboardAvoidingView
                    style={styles.safe}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                >
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                        <View style={styles.container}>
                            {Header}

                            <FlatList
                                ref={listRef}
                                data={messages}
                                keyExtractor={keyExtractor}
                                renderItem={renderItem}
                                contentContainerStyle={styles.messagesContent}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="interactive"
                                scrollEnabled={true}
                                nestedScrollEnabled={true}
                                showsVerticalScrollIndicator={false}
                                maintainVisibleContentPosition={{
                                    minIndexForVisible: 0,
                                    autoscrollToTopThreshold: 100,
                                }}
                                onContentSizeChange={() =>
                                    listRef.current?.scrollToEnd({ animated: false })
                                }
                                /* Performance tuning for million-message scale */
                                removeClippedSubviews={Platform.OS === 'android'}
                                initialNumToRender={20}
                                maxToRenderPerBatch={10}
                                windowSize={15}
                                updateCellsBatchingPeriod={30}
                            />

                            {Composer}
                        </View>
                    </TouchableWithoutFeedback>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </>
    );
};

export default Chatroom;