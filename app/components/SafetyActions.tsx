import { BottomSheet, Button, PressableScale, haptics } from '@/app/components/ui';
import { blockUser, getAuthErrorMessage, reportUser, unblockUser, type ReportReason } from '@/services/AuthService';
import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

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
    const s = useStyles();
    const { colors } = useTheme();
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
            haptics.success();
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
        <BottomSheet
            visible={visible}
            onClose={close}
            dismissible={!sending}
            title={`Report ${username}`}
            subtitle="Why are you reporting this account?"
        >
            <View style={s.reasons} accessibilityRole="radiogroup">
                {REASONS.map((r, i) => {
                    const on = reason === r.value;
                    return (
                        <PressableScale
                            key={r.value}
                            onPress={() => {
                                haptics.selection();
                                setReason(r.value);
                            }}
                            scaleTo={1}
                            style={[s.reason, i > 0 && s.reasonDivider]}
                            pressedStyle={s.reasonPressed}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on, checked: on }}
                            accessibilityLabel={r.label}
                        >
                            <Text style={s.reasonText}>{r.label}</Text>
                            <Ionicons
                                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                                size={22}
                                color={on ? colors.tintText : colors.tertiaryLabel}
                            />
                        </PressableScale>
                    );
                })}
            </View>

            <TextInput
                style={s.details}
                value={details}
                onChangeText={setDetails}
                placeholder="Add details (optional)"
                placeholderTextColor={colors.placeholder}
                selectionColor={colors.tintText}
                multiline
                maxLength={1000}
                accessibilityLabel="Details"
            />

            <View style={s.buttons}>
                <Button title="Cancel" variant="gray" onPress={close} disabled={sending} style={s.flex1} />
                <Button title="Send report" onPress={() => void submit()} disabled={!reason} loading={sending} style={s.flex1} />
            </View>
        </BottomSheet>
    );
};

const useStyles = makeStyles((t) => ({
    reasons: {
        borderRadius: t.radius.lg,
        backgroundColor: t.dark ? t.colors.surface : t.colors.ground,
        overflow: 'hidden',
    },
    reason: {
        minHeight: 50,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: t.space.lg,
    },
    reasonDivider: {
        borderTopWidth: t.size.hairline,
        borderTopColor: t.colors.separator,
    },
    reasonPressed: {
        backgroundColor: t.colors.pressedOverlay,
    },
    reasonText: {
        ...t.type.body,
        color: t.colors.label,
    },
    details: {
        minHeight: 80,
        borderWidth: 1.5,
        borderColor: t.colors.separator,
        borderRadius: t.radius.md,
        padding: t.space.md,
        marginTop: t.space.lg,
        ...t.type.callout,
        color: t.colors.label,
        backgroundColor: t.colors.surface,
        textAlignVertical: 'top',
    },
    buttons: {
        flexDirection: 'row',
        marginTop: t.space.lg,
        gap: t.space.md,
    },
    flex1: { flex: 1 },
}));
