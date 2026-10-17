import RippleButton from '@/app/components/RippleButton';
import { SafetyNumber as SafetyNumberData, compareScannedSafetyNumber } from '@/services/crypto';
import { useE2EE, useE2EEEvents } from '@/services/e2ee/E2EEProvider';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, InteractionManager, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

const PURPLE = '#6733d0';
const INK = '#1a1a2e';
const MUTED = '#7b7b9d';
const BG = '#f8f5ff';
const GREEN = '#16a34a';

/**
 * Shows the safety number for one contact. Matching numbers (compared in person, or by
 * scanning each other's QR code) prove nobody is sitting between the two phones.
 */
const SafetyNumber = ({ navigation, route }: { navigation: any; route: any }) => {
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
                Alert.alert('Verified', `Your messages with ${peerUsername} are end-to-end encrypted and the codes match.`);
            } else if (result === 'mismatch') {
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
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            <View style={styles.header}>
                <RippleButton onPress={() => navigation.goBack()} hitSlop={12} borderless style={styles.headerIcon} accessibilityLabel="Go back">
                    <Ionicons name="arrow-back" size={22} color={INK} />
                </RippleButton>
                <Text style={styles.headerTitle}>Safety number</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {loading ? (
                    <ActivityIndicator color={PURPLE} style={{ marginTop: 48 }} />
                ) : !number ? (
                    <View style={styles.card}>
                        <Ionicons name="lock-closed-outline" size={28} color={PURPLE} />
                        <Text style={styles.body}>
                            Send or receive a message with {peerUsername} first. Their security code appears here once your
                            phones have exchanged keys.
                        </Text>
                    </View>
                ) : (
                    <>
                        <View style={[styles.status, verified && styles.statusVerified]}>
                            <Ionicons name={verified ? 'shield-checkmark' : 'lock-closed'} size={16} color={verified ? GREEN : PURPLE} />
                            <Text style={[styles.statusText, verified && { color: GREEN }]}>
                                {verified ? `You verified ${peerUsername}` : 'End-to-end encrypted'}
                            </Text>
                        </View>

                        <View style={styles.qrWrap}>
                            <QRCode value={number.qrPayload} size={200} color={INK} backgroundColor="#ffffff" />
                        </View>

                        <View style={styles.digits} accessible accessibilityLabel={`Safety number: ${number.groups.join(' ')}`}>
                            {number.groups.map((group, i) => (
                                <Text key={i} style={styles.group}>
                                    {group}
                                </Text>
                            ))}
                        </View>

                        <Text style={styles.body}>
                            To check that your chat with {peerUsername} is private, compare these numbers with the ones on
                            their phone, or scan their code. If they match, nobody can read your messages but the two of you.
                        </Text>

                        <Pressable style={styles.primary} onPress={() => void startScan()} accessibilityRole="button">
                            <Ionicons name="qr-code-outline" size={18} color="#fff" />
                            <Text style={styles.primaryText}>Scan {peerUsername}&apos;s code</Text>
                        </Pressable>
                        <Pressable style={styles.secondary} onPress={() => void markVerified(!verified)} accessibilityRole="button">
                            <Text style={styles.secondaryText}>{verified ? 'Clear verification' : 'Mark as verified'}</Text>
                        </Pressable>
                    </>
                )}
            </ScrollView>

            <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
                <View style={styles.scanner}>
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={onScanned}
                    />
                    <View style={styles.scanFrame} pointerEvents="none" />
                    <Pressable style={styles.scanClose} onPress={() => setScanning(false)} accessibilityRole="button" accessibilityLabel="Close scanner">
                        <Ionicons name="close" size={28} color="#fff" />
                    </Pressable>
                    <Text style={styles.scanHint}>Point at the code on {peerUsername}&apos;s phone</Text>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, gap: 8 },
    headerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '600', color: INK },
    content: { padding: 20, alignItems: 'center', gap: 18 },
    card: { alignItems: 'center', gap: 12, padding: 24, backgroundColor: '#fff', borderRadius: 16, marginTop: 24 },
    status: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#ede6ff' },
    statusVerified: { backgroundColor: '#dcfce7' },
    statusText: { fontSize: 13, fontWeight: '600', color: PURPLE },
    qrWrap: { padding: 16, backgroundColor: '#fff', borderRadius: 16 },
    digits: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: 280, rowGap: 6 },
    group: { width: 70, textAlign: 'center', fontSize: 18, letterSpacing: 1, color: INK, fontVariant: ['tabular-nums'] },
    body: { fontSize: 14, lineHeight: 20, color: MUTED, textAlign: 'center' },
    primary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PURPLE, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    secondary: { paddingHorizontal: 16, paddingVertical: 10 },
    secondaryText: { color: PURPLE, fontSize: 15, fontWeight: '600' },
    scanner: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
    scanFrame: { width: 240, height: 240, borderWidth: 3, borderColor: '#fff', borderRadius: 20 },
    scanClose: { position: 'absolute', top: 56, right: 20, padding: 8 },
    scanHint: { position: 'absolute', bottom: 80, color: '#fff', fontSize: 15 },
});

export default SafetyNumber;
