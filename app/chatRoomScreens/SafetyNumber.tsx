import { Button, IconButton, NavBar, Notice, haptics, useNavBarHeight, useScrollEdge } from '@/app/components/ui';
import { SafetyNumber as SafetyNumberData, compareScannedSafetyNumber } from '@/services/crypto';
import { useE2EE, useE2EEEvents } from '@/services/e2ee/E2EEProvider';
import { makeStyles, useTheme } from '@/src/theme';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, Modal, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Shows the safety number for one contact. Matching numbers (compared in person, or by
 * scanning each other's QR code) prove nobody is sitting between the two phones.
 */
const SafetyNumber = ({ navigation, route }: { navigation: any; route: any }) => {
    const s = useStyles();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const navHeight = useNavBarHeight();
    const { scrollY, onScroll } = useScrollEdge();
    const peerId = String(route?.params?.peerId ?? '').trim();
    const peerUsername = String(route?.params?.peerUsername ?? 'this contact').trim() || 'this contact';
    const { engine } = useE2EE();

    const [number, setNumber] = useState<SafetyNumberData | null>(null);
    const [loading, setLoading] = useState(true);
    const [verified, setVerified] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const handledScan = useRef(false);

    const load = useCallback(async () => {
        if (!engine || !peerId) return;
        const [sn, trust] = await Promise.all([engine.getSafetyNumber(peerId), engine.getTrust(peerId)]);
        setNumber(sn);
        setVerified(!!trust?.verified);
        setLoading(false);
    }, [engine, peerId]);

    useEffect(() => {
        // Hashing takes a moment on slower phones: let the screen transition finish first.
        const task = InteractionManager.runAfterInteractions(() => {
            void load().catch(() => setLoading(false));
        });
        return () => task.cancel();
    }, [load]);

    useE2EEEvents((e) => {
        if (e.type === 'trust' && e.peerId === peerId) void load().catch(() => undefined);
    });

    const markVerified = useCallback(
        async (value: boolean) => {
            if (!engine) return;
            await engine.setVerified(peerId, value);
            setVerified(value);
        },
        [engine, peerId]
    );

    const startScan = useCallback(async () => {
        const granted = permission?.granted || (await requestPermission()).granted;
        if (!granted) {
            Alert.alert('Camera needed', 'Allow camera access in Settings to scan the code, or compare the numbers instead.');
            return;
        }
        handledScan.current = false;
        setScanning(true);
    }, [permission, requestPermission]);

    const onScanned = useCallback(
        ({ data }: { data: string }) => {
            if (handledScan.current || !number) return;
            handledScan.current = true;
            setScanning(false);
            const result = compareScannedSafetyNumber(number, data);
            if (result === 'match') {
                void markVerified(true);
                haptics.success();
                Alert.alert('Verified', `Your messages with ${peerUsername} are end-to-end encrypted and the codes match.`);
            } else if (result === 'mismatch') {
                haptics.warning();
                Alert.alert(
                    "Codes don't match",
                    `Make sure you scanned ${peerUsername}'s code for this chat. If it still doesn't match, someone may be intercepting your messages, or one of you reinstalled TalkNow.`
                );
            } else {
                Alert.alert('Not a TalkNow code', 'Scan the QR code shown on the Safety number screen of your contact.');
            }
        },
        [number, markVerified, peerUsername]
    );

    return (
        <View style={s.screen}>
            <Animated.ScrollView
                onScroll={onScroll}
                scrollEventThrottle={16}
                contentContainerStyle={[s.content, { paddingTop: navHeight + 16, paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
            >
                {loading ? (
                    <ActivityIndicator color={colors.tintText} style={{ marginTop: 48 }} accessibilityLabel="Loading safety number" />
                ) : !number ? (
                    <Notice icon="lock-closed-outline" style={s.waiting}>
                        Send or receive a message with {peerUsername} first. Their security code appears here once your
                        phones have exchanged keys.
                    </Notice>
                ) : (
                    <>
                        <Notice
                            tone={verified ? 'success' : 'neutral'}
                            icon={verified ? 'shield-checkmark' : 'lock-closed'}
                            style={s.status}
                        >
                            {verified ? `You verified ${peerUsername}` : 'End-to-end encrypted'}
                        </Notice>

                        <View style={s.card}>
                            <View style={s.qrWrap}>
                                <QRCode value={number.qrPayload} size={196} color="#1a1a2e" backgroundColor="#ffffff" />
                            </View>
                            <View style={s.digits} accessible accessibilityLabel={`Safety number: ${number.groups.join(' ')}`}>
                                {number.groups.map((group, i) => (
                                    <Text key={i} style={s.group}>
                                        {group}
                                    </Text>
                                ))}
                            </View>
                        </View>

                        <Text style={s.body}>
                            To check that your chat with {peerUsername} is private, compare these numbers with the ones on
                            their phone, or scan their code. If they match, nobody can read your messages but the two of you.
                        </Text>

                        <View style={s.actions}>
                            <Button icon="qr-code-outline" title={`Scan ${peerUsername}'s code`} onPress={() => void startScan()} />
                            <Button
                                variant="plain"
                                title={verified ? 'Clear verification' : 'Mark as verified'}
                                onPress={() => void markVerified(!verified)}
                            />
                        </View>
                    </>
                )}
            </Animated.ScrollView>

            <NavBar title="Safety number" onBack={() => navigation.goBack()} scrollY={scrollY} />

            <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)} statusBarTranslucent>
                <View style={s.scanner}>
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={onScanned}
                    />
                    <View style={s.scanFrame} pointerEvents="none" />
                    <IconButton
                        name="close"
                        variant="glass"
                        color="#ffffff"
                        onPress={() => setScanning(false)}
                        accessibilityLabel="Close scanner"
                        style={[s.scanClose, { top: insets.top + 8 }]}
                    />
                    <Text style={[s.scanHint, { bottom: insets.bottom + 48 }]}>Point at the code on {peerUsername}&apos;s phone</Text>
                </View>
            </Modal>
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    screen: { flex: 1, backgroundColor: t.colors.ground },
    content: { paddingHorizontal: t.space.xl, alignItems: 'center', gap: t.space.xl },
    waiting: { marginTop: t.space.xxl, alignSelf: 'stretch' },
    status: { alignSelf: 'center' },
    card: {
        alignItems: 'center',
        gap: t.space.xl,
        padding: t.space.xl,
        borderRadius: t.radius.xxl,
        backgroundColor: t.colors.surface,
        alignSelf: 'stretch',
    },
    // The code stays dark on white in both appearances so any camera can read it.
    qrWrap: { padding: t.space.md, backgroundColor: '#ffffff', borderRadius: t.radius.lg },
    digits: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 288, rowGap: t.space.sm },
    group: {
        width: 72,
        textAlign: 'center',
        ...t.type.title3,
        fontWeight: '500',
        letterSpacing: 1,
        color: t.colors.label,
        fontVariant: ['tabular-nums'],
    },
    body: { ...t.type.subhead, lineHeight: 21, color: t.colors.secondaryLabel, textAlign: 'center' },
    actions: { alignSelf: 'stretch', gap: t.space.xs },
    scanner: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    scanFrame: { width: 240, height: 240, borderWidth: 3, borderColor: '#fff', borderRadius: t.radius.xxl },
    scanClose: { position: 'absolute', right: t.space.lg },
    scanHint: { position: 'absolute', ...t.type.subhead, color: '#fff', textAlign: 'center', paddingHorizontal: t.space.xxl },
}));

export default SafetyNumber;
