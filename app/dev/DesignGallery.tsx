/**
 * DesignGallery: a development-only page for checking the design system on web.
 *
 * The signed-in screens need the encrypted store (SQLCipher), which has no web
 * build, so they can't be opened in a browser. This page renders the real
 * shared components and rows with sample data instead, in whatever appearance
 * the browser asks for. Open the web build with #gallery-chats, #gallery-chat,
 * #gallery-settings or #gallery-controls. It is never reachable in production.
 *
 * All names and messages below are sample data.
 */
import { HeroCard } from '@/app/chatRoomScreens/fullProfile';
import { ChatRow, GlobalChatRow } from '@/app/MainScreen/mainTabs/ChatsScreen';
import MessageBubble from '@/app/components/messageComponent';
import {
    BottomSheet,
    Button,
    EmptyState,
    GlassSurface,
    GlassTabBar,
    IconButton,
    ListRow,
    ListSection,
    NavBar,
    Notice,
    SearchField,
    SegmentedControl,
    TextField,
    useNavBarHeight,
    useScrollEdge,
    useTabBarClearance,
} from '@/app/components/ui';
import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const SAMPLE_CHATS = [
    { id: '1', name: 'Aarav', lastMessage: 'Sounds good, see you at 7 then!', Date: minutesAgo(3), unreadCount: 2 },
    { id: '2', name: 'Meera', lastMessage: 'I verified your safety number 🔒', Date: minutesAgo(48), unreadCount: 0 },
    { id: '3', name: 'Kabir', lastMessage: 'Can you send me the link to that article you mentioned yesterday?', Date: minutesAgo(60 * 20), unreadCount: 12 },
    { id: '4', name: 'Ishita', lastMessage: 'Haha yes', Date: minutesAgo(60 * 30), unreadCount: 0 },
    { id: '5', name: 'Rohan', lastMessage: 'New message', Date: minutesAgo(60 * 24 * 4), unreadCount: 0 },
    { id: '6', name: 'Zoya', lastMessage: "Message couldn't be decrypted", Date: minutesAgo(60 * 24 * 12), unreadCount: 0 },
];

const fakeTabProps = (index: number) =>
    ({
        state: { index, routes: [{ key: 'Chats', name: 'Chats' }, { key: 'Settings', name: 'Settings' }] },
        descriptors: { Chats: { options: {} }, Settings: { options: {} } },
        navigation: { emit: () => ({ defaultPrevented: false }), navigate: () => undefined },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
    }) as any;

const TAB_ICONS = {
    Chats: { on: 'chatbubble-ellipses', off: 'chatbubble-ellipses-outline' },
    Settings: { on: 'settings', off: 'settings-outline' },
} as const;

const ChatsScene = () => {
    const s = useStyles();
    const { colors } = useTheme();
    const navHeight = useNavBarHeight();
    const clearance = useTabBarClearance();
    const { scrollY, onScroll } = useScrollEdge();
    const [mode, setMode] = useState(0);
    return (
        <View style={s.screen}>
            <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingTop: navHeight - 8, paddingBottom: clearance }}>
                <View style={s.header}>
                    <Text style={s.largeTitle}>TalkNow</Text>
                    <SearchField placeholder="Search chats" value="" onChangeText={() => undefined} />
                    <SegmentedControl segments={['Chats', 'Users']} selectedIndex={mode} onChange={setMode} style={{ width: 176 }} />
                </View>
                {mode === 0
                    ? SAMPLE_CHATS.map((c, i) => (
                          <View key={c.id}>
                              {i > 0 && <View style={s.separator} />}
                              <ChatRow item={c} onPress={() => undefined} />
                          </View>
                      ))
                    : ['Ananya', 'Arjun', 'Diya'].map((n, i) => (
                          <GlobalChatRow
                              key={n}
                              item={{ id: String(i), name: n }}
                              action={{ label: ['Follow', 'Requested', 'Connected'][i], variant: i === 0 ? 'primary' : 'ghost', onPress: () => undefined, loading: false }}
                          />
                      ))}
            </Animated.ScrollView>
            <NavBar
                title="TalkNow"
                scrollY={scrollY}
                titleRevealAt={48}
                trailing={<IconButton name="notifications" dot color={colors.tintText} accessibilityLabel="Notifications" />}
            />
            <GlassTabBar {...fakeTabProps(0)} icons={TAB_ICONS} badges={{ Chats: 14 }} />
        </View>
    );
};

const ChatScene = () => {
    const s = useStyles();
    const { colors } = useTheme();
    const navHeight = useNavBarHeight();
    const msgs = [
        { id: 'a', text: 'Hey! Are we still on for tonight?', me: false, at: minutesAgo(62), first: true, last: false },
        { id: 'b', text: 'Thought we could try the new place near the station.', me: false, at: minutesAgo(61), first: false, last: true },
        { id: 'c', text: 'Yes! 7 works for me', me: true, at: minutesAgo(30), first: true, last: false, status: 'read' as const },
        { id: 'd', text: 'I verified your safety number by the way, the codes matched.', me: true, at: minutesAgo(29), first: false, last: true, status: 'read' as const },
        { id: 'e', text: 'Sounds good, see you at 7 then!', me: false, at: minutesAgo(3), first: true, last: true },
        { id: 'f', text: 'This one did not go through', me: true, at: minutesAgo(1), first: true, last: true, status: 'failed' as const },
    ];
    return (
        <View style={s.screen}>
            <ScrollView contentContainerStyle={{ paddingTop: navHeight + 12, paddingHorizontal: 12, paddingBottom: 96 }}>
                <View style={s.hint}>
                    <Ionicons name="lock-closed" size={12} color={colors.secondaryLabel} />
                    <Text style={s.hintText}>Messages are end-to-end encrypted. Only you and Aarav can read them.</Text>
                </View>
                <Text style={s.day}>Today</Text>
                {msgs.map((m) => (
                    <MessageBubble
                        key={m.id}
                        id={m.id}
                        text={m.text}
                        sender={m.me ? 'me' : 'other'}
                        createdAt={m.at}
                        status={m.status}
                        isFirstInGroup={m.first}
                        isLastInGroup={m.last}
                        onPress={m.status === 'failed' ? () => undefined : undefined}
                    />
                ))}
                <View style={s.notice}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.secondaryLabel} />
                    <Text style={s.hintText}>This message couldn&apos;t be decrypted. Aarav has been asked to send it again.</Text>
                </View>
            </ScrollView>
            <NavBar
                alwaysGlass
                onBack={() => undefined}
                center={
                    <View style={s.identity}>
                        <View style={s.avatar}><Text style={s.avatarText}>A</Text></View>
                        <View>
                            <Text style={s.idName}>Aarav</Text>
                            <Text style={s.idSub}>End-to-end encrypted</Text>
                        </View>
                    </View>
                }
                trailing={<IconButton name="lock-closed-outline" color={colors.tintText} accessibilityLabel="Safety number" />}
            />
            <View style={s.composerDock}>
                <GlassSurface variant="bar" style={s.composer}>
                    <View style={s.input}><Text style={s.placeholder}>Message…</Text></View>
                    <View style={s.send}><Ionicons name="arrow-up" size={20} color={colors.onTint} /></View>
                </GlassSurface>
            </View>
        </View>
    );
};

const SettingsScene = () => {
    const s = useStyles();
    const navHeight = useNavBarHeight();
    const clearance = useTabBarClearance();
    return (
        <View style={s.screen}>
            <ScrollView contentContainerStyle={{ paddingTop: navHeight - 8, paddingBottom: clearance, gap: 24 }}>
                <Text style={[s.largeTitle, { paddingHorizontal: 16, color: undefined }, s.labelColor]}>My Profile</Text>
                <HeroCard heroData={{ text: 'Building TalkNow. Ask me about encryption, chai, and long walks.', themeId: 't2' }} isSelf onEdit={() => undefined} />
                <HeroCard heroData={null} isSelf onEdit={() => undefined} />
                <ListSection title="Account">
                    <ListRow icon="hand-left-outline" title="Blocked accounts" onPress={() => undefined} />
                    <ListRow icon="shield-checkmark-outline" title="Privacy policy" accessory="external" onPress={() => undefined} />
                    <ListRow icon="log-out-outline" title="Log out" accessory="none" onPress={() => undefined} />
                    <ListRow icon="trash-outline" title="Delete account" destructive accessory="none" onPress={() => undefined} />
                </ListSection>
            </ScrollView>
            <NavBar title="My Profile" />
            <GlassTabBar {...fakeTabProps(1)} icons={TAB_ICONS} badges={{ Chats: 3 }} />
        </View>
    );
};

const ControlsScene = () => {
    const s = useStyles();
    const navHeight = useNavBarHeight();
    const [sheet, setSheet] = useState(false);
    return (
        <View style={s.screen}>
            <ScrollView contentContainerStyle={{ paddingTop: navHeight + 8, paddingHorizontal: 16, paddingBottom: 48, gap: 16 }}>
                <Button title="Filled" />
                <Button title="Tinted" variant="tinted" />
                <Button title="Gray" variant="gray" />
                <Button title="Disabled" disabled />
                <Button title="Loading" loading />
                <Button title="Delete" variant="destructive" />
                <Button title="Open sheet" variant="plain" onPress={() => setSheet(true)} />
                <TextField label="Username" placeholder="Enter username" />
                <TextField label="Email" value="not-an-email" error="Enter a valid email address." />
                <TextField label="Username" prefix="@" value="aarav_k" success="Great choice. This username is available." />
                <Notice icon="lock-closed">End-to-end encrypted</Notice>
                <Notice tone="success" icon="shield-checkmark">You verified Aarav</Notice>
                <Notice tone="warning" icon="shield-half-outline">Your security code with Aarav changed.</Notice>
                <EmptyState icon="chatbubbles-outline" title="No chats yet" message="Users you message will appear here in realtime." actionTitle="Find people" onAction={() => undefined} />
            </ScrollView>
            <NavBar title="Controls" alwaysGlass onBack={() => undefined} />
            <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="Report Aarav" subtitle="Why are you reporting this account?">
                <TextField placeholder="Add details (optional)" />
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                    <Button title="Cancel" variant="gray" style={{ flex: 1 }} onPress={() => setSheet(false)} />
                    <Button title="Send report" style={{ flex: 1 }} />
                </View>
            </BottomSheet>
        </View>
    );
};

const DesignGallery = ({ scene }: { scene: string }) => {
    switch (scene) {
        case 'chat':
            return <ChatScene />;
        case 'settings':
            return <SettingsScene />;
        case 'controls':
            return <ControlsScene />;
        default:
            return <ChatsScene />;
    }
};

const useStyles = makeStyles((t) => ({
    screen: { flex: 1, backgroundColor: t.colors.ground },
    header: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
    largeTitle: { ...t.type.largeTitle, color: t.colors.wordmark, height: 52, textAlignVertical: 'center', paddingTop: 6 },
    labelColor: { color: t.colors.label },
    separator: { height: t.size.hairline, backgroundColor: t.colors.separator, marginLeft: 16 + 52 + 12 },
    hint: { alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: t.colors.fill, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 320 },
    notice: { alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: t.colors.fill, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, marginVertical: 8, maxWidth: '88%' },
    hintText: { ...t.type.caption1, color: t.colors.secondaryLabel, flexShrink: 1, textAlign: 'center' },
    day: { ...t.type.caption1, fontWeight: '600', color: t.colors.secondaryLabel, textAlign: 'center', marginTop: 16, marginBottom: 8 },
    identity: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', flex: 1 },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.avatarFill, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: t.colors.avatarInitial, fontWeight: '700', fontSize: 15 },
    idName: { ...t.type.headline, color: t.colors.label },
    idSub: { ...t.type.caption1, color: t.colors.secondaryLabel },
    composerDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16, borderTopWidth: t.size.hairline, borderTopColor: t.colors.separator },
    input: { flex: 1, minHeight: 42, borderRadius: 21, backgroundColor: t.colors.surface, borderWidth: t.size.hairline, borderColor: t.colors.separator, justifyContent: 'center', paddingHorizontal: 16 },
    placeholder: { ...t.type.callout, color: t.colors.placeholder },
    send: { width: 38, height: 38, borderRadius: 19, backgroundColor: t.colors.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
}));

export default DesignGallery;
