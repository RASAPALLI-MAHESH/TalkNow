import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Button from './Button';

/* Small shared pieces: count badges, empty states, step progress, notices. */

export const Badge = ({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) => {
    const s = useStyles();
    if (count <= 0) return null;
    return (
        <View style={[s.badge, style]} accessibilityLabel={`${count} unread`}>
            <Text style={s.badgeText} maxFontSizeMultiplier={1.2}>
                {count > 99 ? '99+' : count}
            </Text>
        </View>
    );
};

export const EmptyState = ({
    icon,
    title,
    message,
    actionTitle,
    onAction,
    busy = false,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    message?: string;
    actionTitle?: string;
    onAction?: () => void;
    busy?: boolean;
}) => {
    const s = useStyles();
    const { colors } = useTheme();
    return (
        <View style={s.empty} accessibilityLiveRegion="polite">
            <View style={s.emptyIcon}>
                <Ionicons name={icon} size={28} color={colors.tintText} />
            </View>
            <Text style={s.emptyTitle}>{title}</Text>
            {!!message && <Text style={s.emptyMessage}>{message}</Text>}
            {!!actionTitle && onAction && (
                <Button title={actionTitle} onPress={onAction} variant="tinted" size="md" loading={busy} style={s.emptyAction} />
            )}
        </View>
    );
};

/** Thin segmented progress for multi-step flows (signup). */
export const StepProgress = ({ step, of }: { step: number; of: number }) => {
    const s = useStyles();
    return (
        <View
            style={s.steps}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Step ${step} of ${of}`}
            accessibilityValue={{ min: 1, max: of, now: step }}
        >
            {Array.from({ length: of }, (_, i) => (
                <View key={i} style={[s.step, i < step && s.stepDone]} />
            ))}
        </View>
    );
};

export type NoticeTone = 'neutral' | 'warning' | 'success' | 'danger';

/** Inline status line: an icon and a sentence on a soft fill. */
export const Notice = ({
    tone = 'neutral',
    icon,
    children,
    action,
    style,
}: {
    tone?: NoticeTone;
    icon: keyof typeof Ionicons.glyphMap;
    children: React.ReactNode;
    action?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}) => {
    const s = useStyles();
    const { colors } = useTheme();
    const fg =
        tone === 'warning'
            ? colors.warning
            : tone === 'success'
                ? colors.success
                : tone === 'danger'
                    ? colors.danger
                    : colors.secondaryLabel;
    const bg =
        tone === 'warning'
            ? colors.warningSoft
            : tone === 'success'
                ? colors.successSoft
                : tone === 'danger'
                    ? colors.dangerSoft
                    : colors.fill;
    return (
        <View style={[s.notice, { backgroundColor: bg }, style]}>
            <Ionicons name={icon} size={16} color={fg} />
            <Text style={[s.noticeText, tone !== 'neutral' && { color: colors.label }]}>{children}</Text>
            {action}
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    badge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 6,
        backgroundColor: t.colors.unread,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: {
        ...t.type.caption2,
        fontWeight: '700',
        color: t.colors.onTint,
        fontVariant: ['tabular-nums'],
    },
    empty: {
        alignItems: 'center',
        paddingHorizontal: t.space.xxxl,
        paddingVertical: t.space.huge,
        gap: t.space.sm,
    },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: t.colors.tintSoft,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: t.space.sm,
    },
    emptyTitle: {
        ...t.type.headline,
        color: t.colors.label,
        textAlign: 'center',
    },
    emptyMessage: {
        ...t.type.subhead,
        color: t.colors.secondaryLabel,
        textAlign: 'center',
        maxWidth: 300,
    },
    emptyAction: {
        marginTop: t.space.md,
    },
    steps: {
        flexDirection: 'row',
        gap: 6,
        width: '100%',
    },
    step: {
        flex: 1,
        height: 4,
        borderRadius: 2,
        backgroundColor: t.colors.fillStrong,
    },
    stepDone: {
        backgroundColor: t.colors.tint,
    },
    notice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.sm,
        borderRadius: t.radius.md,
        paddingVertical: t.space.sm,
        paddingHorizontal: t.space.md,
    },
    noticeText: {
        flex: 1,
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
    },
}));
