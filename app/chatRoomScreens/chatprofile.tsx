/**
 * chatprofile.tsx: Contact Info for the person in a chat.
 *
 *  - Large avatar (tap to view the photo) and name
 *  - Quick actions: back to the conversation, full profile, safety number
 *  - Safety: report and block
 *
 * TalkNow has no presence system, so this screen shows no online status.
 */

import { useSafetyActions } from '@/app/components/SafetyActions';
import { ListRow, ListSection, NavBar, PressableScale, useNavBarHeight, useScrollEdge } from '@/app/components/ui';
import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AvatarPicker from '@/app/components/AvatarPicker';

interface ChatProfileProps {
    navigation: any;
    route: any;
}

const QuickAction = ({
    icon,
    label,
    onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
}) => {
    const s = useStyles();
    const { colors } = useTheme();
    return (
        <PressableScale onPress={onPress} style={s.quickAction} pressedStyle={s.quickActionPressed} accessibilityRole="button" accessibilityLabel={label}>
            <Ionicons name={icon} size={22} color={colors.tintText} />
            <Text style={s.quickLabel} numberOfLines={1}>
                {label}
            </Text>
        </PressableScale>
    );
};

const ChatProfile = ({ navigation, route }: ChatProfileProps) => {
    const s = useStyles();
    const insets = useSafeAreaInsets();
    const navHeight = useNavBarHeight();
    const { scrollY, onScroll } = useScrollEdge();

    /* Route params (passed from Chatroom) */
    const peerId       = String(route?.params?.peerId ?? '').trim();
    const peerUsername = String(route?.params?.peerUsername ?? 'Unknown').trim() || 'Unknown';
    const peerAvatar   = typeof route?.params?.peerAvatar === 'string' && route.params.peerAvatar.trim().length > 0
        ? route.params.peerAvatar.trim()
        : '';

    // Blocking ends the connection, so there is no chat to go back to.
    const { openReport, block, safetySheet } = useSafetyActions({
        userId: peerId,
        username: peerUsername,
        blocked: false,
        onBlockedChange: (blocked) => {
            if (blocked) navigation.popToTop();
        },
    });

    const openFullProfile = () => navigation.navigate('FullProfile', { peerId, peerUsername, peerAvatar });
    const openSafetyNumber = () => navigation.navigate('SafetyNumber', { peerId, peerUsername });

    return (
        <View style={s.screen}>
            <Animated.ScrollView
                onScroll={onScroll}
                scrollEventThrottle={16}
                contentContainerStyle={[s.content, { paddingTop: navHeight + 8, paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Identity ── */}
                <View style={s.identity}>
                    <AvatarPicker uri={peerAvatar} name={peerUsername} size={104} previewEnabled />
                    <Text style={s.name} numberOfLines={2} accessibilityRole="header">
                        {peerUsername}
                    </Text>
                </View>

                {/* ── Quick actions ── */}
                <View style={s.quickRow}>
                    <QuickAction icon="chatbubble-ellipses" label="Message" onPress={() => navigation.goBack()} />
                    <QuickAction icon="person" label="Profile" onPress={openFullProfile} />
                    <QuickAction icon="shield-checkmark" label="Safety" onPress={openSafetyNumber} />
                </View>

                <ListSection title="Encryption" footer="Your messages with this contact are end-to-end encrypted. Compare safety numbers to make sure nobody is in between.">
                    <ListRow icon="lock-closed-outline" title="Safety number" subtitle="Verify end-to-end encryption" onPress={openSafetyNumber} />
                </ListSection>

                <ListSection title="Safety">
                    <ListRow icon="flag-outline" title="Report" subtitle="Report this account" destructive onPress={openReport} />
                    <ListRow icon="hand-left-outline" title="Block" subtitle={`Block ${peerUsername}`} destructive onPress={block} />
                </ListSection>
            </Animated.ScrollView>

            <NavBar title="Contact Info" onBack={() => navigation.goBack()} scrollY={scrollY} titleRevealAt={150} />
            {safetySheet}
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    screen: {
        flex: 1,
        backgroundColor: t.colors.ground,
    },
    content: {
        gap: t.space.xxl,
    },
    identity: {
        alignItems: 'center',
        gap: t.space.md,
        paddingHorizontal: t.space.gutter,
        marginTop: t.space.sm,
    },
    name: {
        ...t.type.title1,
        color: t.colors.label,
        textAlign: 'center',
    },
    quickRow: {
        flexDirection: 'row',
        gap: t.space.sm,
        marginHorizontal: t.space.gutter,
    },
    quickAction: {
        flex: 1,
        minHeight: 64,
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space.xs,
        paddingVertical: t.space.md,
        overflow: 'hidden',
    },
    quickActionPressed: {
        backgroundColor: t.colors.pressedOverlay,
    },
    quickLabel: {
        ...t.type.caption1,
        fontWeight: '600',
        color: t.colors.tintText,
    },
}));

export default ChatProfile;
