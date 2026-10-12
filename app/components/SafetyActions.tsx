import { blockUser, getAuthErrorMessage, reportUser, unblockUser, type ReportReason } from '@/services/AuthService';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

const PURPLE = '#6733d0';
const INK = '#1a1a2e';
const MUTED = '#6b7280';

const REASONS: { value: ReportReason; label: string }[] = [
    { value: 'spam', label: 'Spam' },
    { value: 'harassment', label: 'Harassment or bullying' },
    { value: 'inappropriate', label: 'Inappropriate content' },
    { value: 'impersonation', label: 'Pretending to be someone else' },
    { value: 'other', label: 'Something else' },
];

type Options = {
    userId: string;
    username: string;
    blocked: boolean;
    onBlockedChange?: (blocked: boolean) => void;
};

/**
 * Report and block for another user. `openSafetyMenu` shows the choices; render
 * `safetySheet` once in the screen for the report form.
 */
export const useSafetyActions = ({ userId, username, blocked, onBlockedChange }: Options) => {
    const [reportVisible, setReportVisible] = useState(false);

    const block = useCallback(() => {
        Alert.alert(
            `Block ${username}?`,
            "They won't be able to follow or message you, and your connection will be removed. They won't be told.",
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Block',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await blockUser(userId);
                            onBlockedChange?.(true);
                        } catch (err) {
                            Alert.alert('Could not block', getAuthErrorMessage(err, 'Please try again.'));
                        }
                    },
                },
            ]
        );
    }, [onBlockedChange, userId, username]);

    const unblock = useCallback(async () => {
        try {
            await unblockUser(userId);
            onBlockedChange?.(false);
        } catch (err) {
            Alert.alert('Could not unblock', getAuthErrorMessage(err, 'Please try again.'));
        }
    }, [onBlockedChange, userId]);

    const openSafetyMenu = useCallback(() => {
        Alert.alert(username, undefined, [
            { text: 'Report', onPress: () => setReportVisible(true) },
            blocked
                ? { text: 'Unblock', onPress: () => void unblock() }
                : { text: 'Block', style: 'destructive', onPress: block },
            { text: 'Cancel', style: 'cancel' },
        ]);
    }, [block, blocked, unblock, username]);

    const safetySheet = (
        <ReportSheet
            visible={reportVisible}
            userId={userId}
            username={username}
            alreadyBlocked={blocked}
            onClose={() => setReportVisible(false)}
            onBlockRequested={block}
        />
    );

    return { openSafetyMenu, openReport: () => setReportVisible(true), block, unblock, safetySheet };
};

const ReportSheet = ({
    visible,
    userId,
    username,
    alreadyBlocked,
    onClose,
    onBlockRequested,
}: {
    visible: boolean;
    userId: string;
    username: string;
    alreadyBlocked: boolean;
    onClose: () => void;
    onBlockRequested: () => void;
}) => {
    const [reason, setReason] = useState<ReportReason | null>(null);
    const [details, setDetails] = useState('');
    const [sending, setSending] = useState(false);

    const close = () => {
        setReason(null);
        setDetails('');
        onClose();
    };

    const submit = async () => {
        if (!reason || sending) return;
        setSending(true);
        try {
            await reportUser(userId, reason, details.trim());
            close();
            Alert.alert(
                'Report sent',
                "Thanks for letting us know. We'll review it.",
                alreadyBlocked
                    ? [{ text: 'Done' }]
                    : [
                          { text: 'Done', style: 'cancel' },
                          { text: `Block ${username}`, style: 'destructive', onPress: onBlockRequested },
                      ]
            );
        } catch (err) {
            Alert.alert('Could not send report', getAuthErrorMessage(err, 'Please try again.'));
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
            <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Pressable style={StyleSheet.absoluteFill} onPress={close} />
                <View style={styles.sheet}>
                    <Text style={styles.title}>Report {username}</Text>
                    <Text style={styles.subtitle}>Why are you reporting this account?</Text>

                    {REASONS.map((r) => (
                        <Pressable
                            key={r.value}
                            onPress={() => setReason(r.value)}
                            style={({ pressed }) => [styles.reason, pressed && styles.pressed]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: reason === r.value }}
                        >
                            <View style={[styles.radio, reason === r.value && styles.radioOn]} />
                            <Text style={styles.reasonText}>{r.label}</Text>
                        </Pressable>
                    ))}

                    <TextInput
                        style={styles.details}
                        value={details}
                        onChangeText={setDetails}
                        placeholder="Add details (optional)"
                        placeholderTextColor={MUTED}
                        multiline
                        maxLength={1000}
                    />

                    <View style={styles.buttons}>
                        <Pressable onPress={close} style={[styles.button, styles.cancel]} accessibilityRole="button">
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => void submit()}
                            disabled={!reason || sending}
                            style={[styles.button, styles.submit, (!reason || sending) && styles.disabled]}
                            accessibilityRole="button"
                        >
                            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send report</Text>}
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 32,
    },
    title: { fontSize: 18, fontWeight: '700', color: INK },
    subtitle: { fontSize: 14, color: MUTED, marginTop: 4, marginBottom: 12 },
    reason: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    pressed: { opacity: 0.6 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#d1d5db', marginRight: 12 },
    radioOn: { borderColor: PURPLE, backgroundColor: PURPLE },
    reasonText: { fontSize: 15, color: INK },
    details: {
        minHeight: 72,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
        fontSize: 15,
        color: INK,
        textAlignVertical: 'top',
    },
    buttons: { flexDirection: 'row', marginTop: 16, gap: 12 },
    button: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cancel: { backgroundColor: '#f3f4f6' },
    cancelText: { fontSize: 15, fontWeight: '600', color: INK },
    submit: { backgroundColor: PURPLE },
    submitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    disabled: { opacity: 0.5 },
});
