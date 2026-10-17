/**
 * Chatroom.tsx: one conversation.
 *
 *  - Glass navigation bar (contact, encryption state, safety number) and a glass
 *    composer float over the message list; messages scroll beneath both.
 *  - Messages from the same person within a few minutes are grouped; day
 *    separators mark each new day.
 *  - Only messages that arrive while the chat is open animate in.
 *  - Keyboard: KeyboardAvoidingView on both platforms (padding on iOS, height on Android).
 */

import AvatarPicker from '@/app/components/AvatarPicker';
import MessageBubble from '@/app/components/messageComponent';
import { GlassSurface, IconButton, NavBar, PressableScale, haptics, useNavBarHeight } from '@/app/components/ui';
import { useUnread } from '@/Context/UnreadContext';
import { useSocketEvents, useWebSocketClient } from '@/services/WebSocketClient';
import { IdentityChangedError } from '@/services/e2ee/engine';
import { useConversation, useE2EE, useE2EEEvents } from '@/services/e2ee/E2EEProvider';
import { LocalMessage } from '@/services/e2ee/localStore';
import { spring, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
    type LayoutChangeEvent,
} from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChatroomStyles as useStyles } from './chatroomStyles';

/* ─────────────────────── Notices ─────────────────────── */

// What to show for messages that aren't plain text bubbles.
const noticeFor = (m: LocalMessage, peerName: string): { icon: keyof typeof Ionicons.glyphMap; text: string; warn?: boolean } | null => {
    switch (m.kind) {
        case 'identity_changed':
            return { icon: 'shield-half-outline', text: `Your security code with ${peerName} changed. Tap to verify.`, warn: true };
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

/* ─────────────────────── Grouping ─────────────────────── */

const GROUP_GAP_MS = 5 * 60 * 1000;

const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

const dayLabel = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};

// Two messages belong to one visual group: same sender, both bubbles, same day, close in time.
const joins = (a: LocalMessage | undefined, b: LocalMessage | undefined) => {
    if (!a || !b) return false;
    if (a.kind !== 'text' || b.kind !== 'text') return false;
    if (a.direction !== b.direction) return false;
    if (dayKey(a.createdAt) !== dayKey(b.createdAt)) return false;
    return Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) < GROUP_GAP_MS;
};

const useKeyboardVisible = () => {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvent, () => setVisible(true));
        const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
        return () => {
            show.remove();
            hide.remove();
        };
    }, []);
    return visible;
};

/* ─────────────────────── Send button ─────────────────────── */

const SendButton = ({ enabled, onPress }: { enabled: boolean; onPress: () => void }) => {
    const s = useStyles();
    const { colors } = useTheme();
    const on = useSharedValue(enabled ? 1 : 0);
    useEffect(() => {
        on.value = withSpring(enabled ? 1 : 0, spring.snappy);
    }, [enabled, on]);
    const style = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(on.value, [0, 1], [colors.fillStrong, colors.tint]),
        transform: [{ scale: 0.9 + on.value * 0.1 }],
    }));
    return (
        <PressableScale
            onPress={onPress}
            disabled={!enabled}
            hitSlop={6}
            scaleTo={0.88}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !enabled }}
            ripple="rgba(255,255,255,0.3)"
            borderlessRipple
            testID="chat-send"
        >
            <Animated.View style={[s.sendBtn, style]}>
                <Ionicons name="arrow-up" size={20} color={enabled ? colors.onTint : colors.tertiaryLabel} />
            </Animated.View>
        </PressableScale>
    );
};

/* ─────────────────────── Main Screen ─────────────────────── */

interface ChatroomProps {
    navigation: any;
    route: any;
}

const Chatroom = ({ navigation, route }: ChatroomProps) => {
    const s = useStyles();
    const { colors } = useTheme();
    const { connected, markRead } = useWebSocketClient();
    const { engine, state: e2eeState } = useE2EE();
    const { refreshUnreadCount } = useUnread();
    const insets = useSafeAreaInsets();
    const navHeight = useNavBarHeight();
    const keyboardVisible = useKeyboardVisible();

    const peerId = String(route?.params?.peerId ?? '').trim();
    const peerUsername = String(route?.params?.peerUsername ?? 'Chat').trim() || 'Chat';
    const peerAvatar =
        typeof route?.params?.peerAvatar === 'string' && route.params.peerAvatar.trim().length > 0
            ? route.params.peerAvatar.trim()
            : '';

    const [draft, setDraft] = useState('');
    const [composerHeight, setComposerHeight] = useState(64);
    const [bannerHeight, setBannerHeight] = useState(0);
    const listRef = useRef<FlatList<LocalMessage>>(null);

    // Messages created after this moment arrived while the chat was open: only those animate.
    const openedAtRef = useRef(new Date().toISOString());

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
        if (e.type === 'send_failed' && e.peerId === peerId) {
            haptics.warning();
            Alert.alert('Message not sent', e.message);
        }
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

    const canSend = draft.trim().length > 0;

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

    const openProfile = useCallback(() => {
        navigation.navigate('ChatProfile', { peerId, peerUsername, peerAvatar });
    }, [navigation, peerId, peerUsername, peerAvatar]);

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
        haptics.light();

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
        ({ item, index }: { item: LocalMessage; index: number }) => {
            const newer = messages[index - 1];
            const older = messages[index + 1];
            // The oldest loaded message only gets a day label once nothing older is left to load.
            const showDay = older ? dayKey(older.createdAt) !== dayKey(item.createdAt) : !hasMore;

            const dayChip = showDay ? (
                <View style={s.dayRow} accessibilityRole="header">
                    <Text style={s.dayText}>{dayLabel(item.createdAt)}</Text>
                </View>
            ) : null;

            const notice = noticeFor(item, peerUsername);
            if (notice) {
                return (
                    <View>
                        {dayChip}
                        <Pressable
                            style={[s.notice, notice.warn && s.noticeWarn]}
                            onPress={() => handleMessagePress(item)}
                            accessibilityRole={item.kind === 'identity_changed' ? 'button' : 'text'}
                        >
                            <Ionicons name={notice.icon} size={14} color={notice.warn ? colors.warning : colors.secondaryLabel} />
                            <Text style={s.noticeText}>{notice.text}</Text>
                        </Pressable>
                    </View>
                );
            }
            return (
                <View>
                    {dayChip}
                    <MessageBubble
                        id={item.id}
                        text={item.text}
                        sender={item.direction === 'out' ? 'me' : 'other'}
                        createdAt={item.createdAt}
                        status={item.status || 'sent'}
                        isFirstInGroup={showDay || !joins(item, older)}
                        isLastInGroup={!joins(item, newer)}
                        animateIn={index < 3 && item.createdAt > openedAtRef.current}
                        onPress={item.status === 'failed' ? () => handleMessagePress(item) : undefined}
                    />
                </View>
            );
        },
        [messages, hasMore, peerUsername, handleMessagePress, s, colors]
    );

    const keyExtractor = useCallback((item: LocalMessage) => item.id, []);

    const topInset = navHeight + (identityNeedsAck ? bannerHeight + 8 : 0);

    /* ── Header: contact and encryption state ── */
    const HeaderCenter = (
        <Pressable
            onPress={openProfile}
            style={s.headerIdentity}
            accessibilityRole="button"
            accessibilityLabel={`${peerUsername}, ${verified ? 'verified' : 'end-to-end encrypted'}. Open chat details`}
            testID="chat-header-profile"
        >
            <AvatarPicker uri={peerAvatar} name={peerUsername} size={36} previewEnabled={false} />
            <View style={s.headerText}>
                <Text style={s.headerTitle} numberOfLines={1}>
                    {peerUsername}
                </Text>
                <View style={s.headerSubRow}>
                    <Ionicons
                        name={verified ? 'shield-checkmark' : 'lock-closed'}
                        size={11}
                        color={verified ? colors.success : colors.secondaryLabel}
                    />
                    <Text style={[s.headerSubtitle, verified && { color: colors.success }]} numberOfLines={1}>
                        {verified ? 'Verified' : 'End-to-end encrypted'}
                    </Text>
                </View>
            </View>
        </Pressable>
    );

    const EncryptedHint = (
        <Pressable style={s.encryptedHint} onPress={openSafetyNumber} accessibilityRole="button">
            <Ionicons name="lock-closed" size={12} color={colors.secondaryLabel} />
            <Text style={s.encryptedHintText}>Messages are end-to-end encrypted. Only you and {peerUsername} can read them.</Text>
        </Pressable>
    );

    /* ── Composer ── */
    const Composer = (
        <View
            style={s.composerDock}
            onLayout={(e: LayoutChangeEvent) => setComposerHeight(e.nativeEvent.layout.height)}
        >
            <GlassSurface variant="bar" style={[s.composer, { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8) }]}>
                <View style={s.composerHairline} />
                <View style={s.inputBar}>
                    <TextInput
                        placeholder="Message…"
                        style={s.input}
                        value={draft}
                        onChangeText={setDraft}
                        multiline
                        maxLength={4000}
                        placeholderTextColor={colors.placeholder}
                        selectionColor={colors.tintText}
                        cursorColor={colors.tintText}
                        returnKeyType="default"
                        textAlignVertical="center"
                        accessibilityLabel={`Message ${peerUsername}`}
                        testID="chat-input"
                    />
                    <SendButton enabled={canSend} onPress={() => void handleSend()} />
                </View>
            </GlassSurface>
        </View>
    );

    /* ── Render ── */
    return (
        <View style={s.screen}>
            <KeyboardAvoidingView
                style={s.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
                enabled
            >
                <View style={s.flex}>
                    <FlatList
                        ref={listRef}
                        data={messages}
                        keyExtractor={keyExtractor}
                        renderItem={renderItem}
                        contentContainerStyle={s.messagesContent}
                        keyboardShouldPersistTaps="always"
                        keyboardDismissMode="interactive"
                        showsVerticalScrollIndicator={false}
                        removeClippedSubviews={Platform.OS === 'android'}
                        initialNumToRender={20}
                        maxToRenderPerBatch={10}
                        windowSize={15}
                        updateCellsBatchingPeriod={30}
                        onEndReached={handleLoadMore}
                        onEndReachedThreshold={0.5}
                        inverted
                        // Inverted list: the header sits at the bottom (room for the composer),
                        // the footer at the top (encryption note, room for the bar).
                        ListHeaderComponent={<View style={{ height: composerHeight + 4 }} />}
                        ListFooterComponent={
                            <View style={{ paddingTop: topInset + 8 }}>{hasMore ? null : EncryptedHint}</View>
                        }
                    />
                    {Composer}
                </View>
            </KeyboardAvoidingView>

            <NavBar
                alwaysGlass
                onBack={handleBack}
                center={HeaderCenter}
                trailing={
                    <IconButton
                        name={verified ? 'shield-checkmark' : 'lock-closed-outline'}
                        color={verified ? colors.success : colors.tintText}
                        iconSize={21}
                        onPress={openSafetyNumber}
                        accessibilityLabel={verified ? 'Encrypted and verified. View safety number' : 'End-to-end encrypted. View safety number'}
                        testID="chat-safety"
                    />
                }
            />

            {identityNeedsAck && (
                <View
                    style={[s.bannerDock, { top: navHeight + 8 }]}
                    onLayout={(e: LayoutChangeEvent) => setBannerHeight(e.nativeEvent.layout.height)}
                >
                    <View style={s.banner} accessibilityLiveRegion="polite">
                        <Ionicons name="shield-half-outline" size={18} color={colors.warning} />
                        <Text style={s.bannerText}>Your security code with {peerUsername} changed.</Text>
                        <Pressable onPress={openSafetyNumber} style={s.bannerButton} accessibilityRole="button">
                            <Text style={s.bannerButtonText}>Verify</Text>
                        </Pressable>
                        <Pressable onPress={acknowledgeIdentityChange} style={s.bannerButton} accessibilityRole="button">
                            <Text style={s.bannerButtonText}>OK</Text>
                        </Pressable>
                    </View>
                </View>
            )}
        </View>
    );
};

export default Chatroom;
