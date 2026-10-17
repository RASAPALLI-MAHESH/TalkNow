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
import RippleButton from '@/app/components/RippleButton';
import { useUnread } from '@/Context/UnreadContext';
import useAuth from '@/hooks/useAuth';
import { useSocketEvents, useWebSocketClient } from '@/services/WebSocketClient';
import { IdentityChangedError } from '@/services/e2ee/engine';
import { useConversation, useE2EE, useE2EEEvents } from '@/services/e2ee/E2EEProvider';
import { LocalMessage } from '@/services/e2ee/localStore';
import { Ionicons } from '@expo/vector-icons';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import {
    Alert,
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

/* ─────────────────────── Notices ─────────────────────── */

// What to show for messages that aren't plain text bubbles.
const noticeFor = (m: LocalMessage, peerName: string): { icon: keyof typeof Ionicons.glyphMap; text: string } | null => {
    switch (m.kind) {
        case 'identity_changed':
            return { icon: 'shield-half-outline', text: `Your security code with ${peerName} changed. Tap to verify.` };
        case 'undecryptable':
            return { icon: 'alert-circle-outline', text: `This message couldn't be decrypted. ${peerName} has been asked to send it again.` };
        case 'other_device':
            return { icon: 'phone-portrait-outline', text: 'This message was sent to your previous install and can\'t be read here.' };
        case 'unsupported':
            return { icon: 'cloud-download-outline', text: 'This message needs a newer version of TalkNow.' };
        default:
            return null;
    }
};

/* ─────────────────────── Main Screen ─────────────────────── */

interface ChatroomProps {
    navigation: any;
    route: any;
}

const Chatroom = ({ navigation, route }: ChatroomProps) => {
    const { user } = useAuth();
    const { connected, markRead } = useWebSocketClient();
    const { engine, state: e2eeState } = useE2EE();
    const { refreshUnreadCount } = useUnread();
    const insets = useSafeAreaInsets();

    const peerId = String(route?.params?.peerId ?? '').trim();
    const peerUsername = String(route?.params?.peerUsername ?? 'Chat').trim() || 'Chat';
    const peerAvatar =
        typeof route?.params?.peerAvatar === 'string' && route.params.peerAvatar.trim().length > 0
            ? route.params.peerAvatar.trim()
            : '';

    const [draft, setDraft] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const listRef = useRef<FlatList<LocalMessage>>(null);

    /* Send-button state */
    const sendOpacity = useRef(new Animated.Value(0.35)).current;

    /* Input border animation */
    const borderAnim = useRef(new Animated.Value(0)).current;

    // Decrypted messages come from the phone's encrypted store, newest first (the list is inverted).
    const { messages, hasMore, loadMore } = useConversation(peerId);

    // Set while a verified contact's security code changed and the user hasn't acknowledged it.
    const [identityNeedsAck, setIdentityNeedsAck] = useState(false);
    const [verified, setVerified] = useState(false);

    const refreshTrust = useCallback(async () => {
        if (!engine || !peerId) return;
        const trust = await engine.getTrust(peerId);
        setIdentityNeedsAck(!!trust?.needsAck);
        setVerified(!!trust?.verified);
    }, [engine, peerId]);

    useEffect(() => {
        void refreshTrust().catch(() => undefined);
    }, [refreshTrust]);

    // Pull read receipts missed while away (and, once, pre-encryption history) when the chat opens.
    useEffect(() => {
        if (!engine || !peerId) return;
        engine.syncConversation(peerId).catch((err) => console.log('conversation sync error:', err?.message ?? String(err)));
    }, [engine, peerId]);

    useSocketEvents((event) => {
        if (event.type === 'registered' && engine && peerId) {
            engine.syncConversation(peerId).catch(() => undefined);
        }
    });

    useE2EEEvents((e) => {
        if (e.type === 'trust' && e.peerId === peerId) void refreshTrust().catch(() => undefined);
        if (e.type === 'send_failed' && e.peerId === peerId) Alert.alert('Message not sent', e.message);
    });

    // Mark read only when a new incoming message shows up, not on every list change.
    const lastMarkedReadIdRef = useRef<string | null>(null);
    const latestOther = messages.find((m) => m.direction === 'in'); // messages[0] is newest
    useEffect(() => {
        if (!peerId || !latestOther || lastMarkedReadIdRef.current === latestOther.id) return;
        if (!markRead(peerId, latestOther.createdAt)) return; // not connected yet; retried once `connected` flips
        lastMarkedReadIdRef.current = latestOther.id;

        // Allow backend to process the markRead before fetching the new count
        const timer = setTimeout(() => {
            refreshUnreadCount();
        }, 800);
        return () => clearTimeout(timer);
    }, [connected, markRead, latestOther, peerId, refreshUnreadCount]);

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

    /* Scroll is automatically handled by inverted={true} */

    /* Load older messages when user scrolls to top */
    const handleLoadMore = useCallback(() => {
        if (hasMore) loadMore();
    }, [hasMore, loadMore]);

    const handleBack = useCallback(() => {
        Keyboard.dismiss();
        navigation.goBack();
    }, [navigation]);

    const openSafetyNumber = useCallback(() => {
        navigation.navigate('SafetyNumber', { peerId, peerUsername });
    }, [navigation, peerId, peerUsername]);

    const acknowledgeIdentityChange = useCallback(() => {
        if (!engine) return;
        void engine.acknowledgeIdentityChange(peerId).catch(() => undefined);
    }, [engine, peerId]);

    const handleSend = useCallback(async () => {
        if (!canSend || !peerId) return;
        if (!engine) {
            Alert.alert('Encryption unavailable', e2eeState.error || 'Encryption is still starting. Please try again in a moment.');
            return;
        }
        const text = draft.trim();
        setDraft('');

        /* Trigger LayoutAnimation on Android so the composer height change is smooth */
        if (Platform.OS === 'android') {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }

        try {
            // Encrypted on this phone; offline sends wait and go out after reconnecting.
            await engine.sendText(peerId, text);
        } catch (err: any) {
            // Nothing was saved: give the text back unless the user already started typing something else.
            setDraft((current) => (current.trim() ? current : text));
            if (err instanceof IdentityChangedError) {
                Alert.alert(
                    'Security code changed',
                    `${peerUsername}'s security code changed, maybe because they reinstalled TalkNow or got a new phone. Verify it, or tap OK to keep chatting.`,
                    [
                        { text: 'Verify', onPress: openSafetyNumber },
                        { text: 'OK', onPress: acknowledgeIdentityChange },
                    ]
                );
                return;
            }
            Alert.alert('Message not sent', String(err?.message || 'Please try again.'));
        }
    }, [canSend, draft, peerId, engine, e2eeState.error, peerUsername, openSafetyNumber, acknowledgeIdentityChange]);

    const handleMessagePress = useCallback(
        (m: LocalMessage) => {
            if (!engine) return;
            if (m.kind === 'identity_changed') {
                openSafetyNumber();
                return;
            }
            if (m.direction === 'out' && m.status === 'failed') {
                Alert.alert('Message not sent', 'Send it again?', [
                    { text: 'Delete', style: 'destructive', onPress: () => void engine.deleteMessage(m.id) },
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Retry', onPress: () => void engine.retryMessage(m.id).catch(() => undefined) },
                ]);
            }
        },
        [engine, openSafetyNumber]
    );

    const renderItem = useCallback(
        ({ item }: { item: LocalMessage }) => {
            const notice = noticeFor(item, peerUsername);
            if (notice) {
                return (
                    <Pressable style={styles.notice} onPress={() => handleMessagePress(item)} accessibilityRole="text">
                        <Ionicons name={notice.icon} size={14} color="#7b7b9d" />
                        <Text style={styles.noticeText}>{notice.text}</Text>
                    </Pressable>
                );
            }
            return (
                <MessageBubble
                    id={item.id}
                    text={item.text}
                    sender={item.direction === 'out' ? 'me' : 'other'}
                    createdAt={item.createdAt}
                    status={item.status || 'sent'}
                    onPress={item.status === 'failed' ? () => handleMessagePress(item) : undefined}
                />
            );
        },
        [peerUsername, handleMessagePress],
    );

    const keyExtractor = useCallback((item: LocalMessage) => item.id, []);

    /* ── Shared Header ── */
    const Header = (
        <View style={styles.header}>
            {/* Back button — ripple from touch point */}
            <RippleButton
                onPress={handleBack}
                hitSlop={12}
                borderless
                style={styles.headerIcon}
                rippleColor="rgba(103,51,208,0.22)"
                accessibilityLabel="Go back"
            >
                <Ionicons name="arrow-back" size={22} color="#1a1a2e" />
            </RippleButton>

            {/* Avatar — ripple, opens image preview */}
            <RippleButton
                onPress={() => navigation.navigate('ChatProfile', { peerId, peerUsername, peerAvatar })}
                hitSlop={8}
                borderless
                style={styles.avatarBtn}
                rippleColor="rgba(103,51,208,0.22)"
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
            </RippleButton>

            {/* Name / status — ripple, opens ChatProfile */}
            <RippleButton
                onPress={() => navigation.navigate('ChatProfile', { peerId, peerUsername, peerAvatar })}
                hitSlop={8}
                style={styles.headerTitleWrap}
                rippleColor="rgba(103,51,208,0.12)"
                accessibilityLabel="Open chat details"
            >
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {peerUsername}
                </Text>
            </RippleButton>

            {/* End-to-end encryption: safety number */}
            <RippleButton
                onPress={openSafetyNumber}
                hitSlop={8}
                borderless
                style={styles.headerLock}
                rippleColor="rgba(103,51,208,0.22)"
                accessibilityLabel={verified ? 'Encrypted and verified. View safety number' : 'End-to-end encrypted. View safety number'}
            >
                <Ionicons name={verified ? 'shield-checkmark' : 'lock-closed-outline'} size={20} color="#6733d0" />
            </RippleButton>
        </View>
    );

    const IdentityBanner = identityNeedsAck ? (
        <View style={styles.banner}>
            <Ionicons name="shield-half-outline" size={18} color="#c2410c" />
            <Text style={styles.bannerText}>Your security code with {peerUsername} changed.</Text>
            <Pressable onPress={openSafetyNumber} style={styles.bannerButton} accessibilityRole="button">
                <Text style={styles.bannerButtonText}>Verify</Text>
            </Pressable>
            <Pressable onPress={acknowledgeIdentityChange} style={styles.bannerButton} accessibilityRole="button">
                <Text style={styles.bannerButtonText}>OK</Text>
            </Pressable>
        </View>
    ) : null;

    const EncryptedHint = (
        <Pressable style={styles.encryptedHint} onPress={openSafetyNumber} accessibilityRole="button">
            <Ionicons name="lock-closed" size={12} color="#7b7b9d" />
            <Text style={styles.noticeText}>Messages are end-to-end encrypted. Only you and {peerUsername} can read them.</Text>
        </Pressable>
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
                        onPress={() => void handleSend()}
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
            {IdentityBanner}

            <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={styles.messagesContent}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="interactive"
                scrollEnabled={true}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={Platform.OS === 'android'}
                initialNumToRender={20}
                maxToRenderPerBatch={10}
                windowSize={15}
                updateCellsBatchingPeriod={30}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                inverted={true}
                // Inverted list: the footer sits above the oldest message.
                ListFooterComponent={hasMore ? null : EncryptedHint}
            />

            {Composer}
        </View>
    );

    /* ── Render ── */
    return (
        <>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
                <KeyboardAvoidingView
                    style={styles.safe}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={0}
                    enabled
                >
                    {MainContent}
                </KeyboardAvoidingView>
            </SafeAreaView>
        </>
    );
};

export default Chatroom;