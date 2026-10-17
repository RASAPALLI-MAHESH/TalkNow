/**
 * MessageBubble.tsx: one chat message.
 *
 * Consecutive messages from the same person within a few minutes form a group:
 * they sit closer together, only the last one carries the tail corner, and only
 * the last one shows the time and delivery status. Failed messages always show
 * their status so the retry is never hidden.
 */

import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

/* ─────────────────────── Types ─────────────────────── */

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageBubbleProps {
    /** Unique message identifier */
    id: string;
    /** Message text content */
    text: string;
    /** Sender perspective: 'me' for current user, 'other' for peer */
    sender: 'me' | 'other';
    /** ISO timestamp when message was created */
    createdAt: string;
    /** Delivery/read status (outgoing messages) */
    status?: MessageStatus;
    /** Username of sender (for group chats, future feature) */
    senderName?: string;
    /** First message of a run from the same sender (visually the top one). */
    isFirstInGroup?: boolean;
    /** Last message of a run (visually the bottom one): gets the tail and the time. */
    isLastInGroup?: boolean;
    /** Animate in: true only for messages that arrive while the chat is open. */
    animateIn?: boolean;
    onPress?: () => void;
    onLongPress?: () => void;
    containerStyle?: ViewStyle;
    bubbleStyle?: ViewStyle;
    textStyle?: TextStyle;
}

/* ─────────────────────── Helpers ─────────────────────── */

/** "2:45 PM" */
function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const STATUS_LABEL: Record<MessageStatus, string> = {
    sending: 'Sending',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
    failed: 'Not sent',
};

// Messages rise into place from just below. The list is inverted, so the
// visual "from below" is FadeInDown inside the flipped cell.
const ENTER = FadeInDown.duration(220)
    .withInitialValues({ opacity: 0, transform: [{ translateY: -8 }] })
    .reduceMotion(ReduceMotion.System);

/* ─────────────────────── Component ─────────────────────── */

const MessageBubble = memo<MessageBubbleProps>(
    ({
        text,
        sender,
        createdAt,
        status = 'sent',
        senderName,
        isFirstInGroup = true,
        isLastInGroup = true,
        animateIn = false,
        onPress,
        onLongPress,
        containerStyle,
        bubbleStyle,
        textStyle,
    }) => {
        const s = useStyles();
        const { colors } = useTheme();
        const isMe = sender === 'me';
        const failed = isMe && status === 'failed';
        const showMeta = isLastInGroup || failed;

        const statusIcon: keyof typeof Ionicons.glyphMap | null = !isMe
            ? null
            : status === 'failed'
                ? 'alert-circle'
                : status === 'read' || status === 'delivered'
                    ? 'checkmark-done'
                    : status === 'sending'
                        ? 'time-outline'
                        : 'checkmark';

        return (
            <Animated.View entering={animateIn ? ENTER : undefined} style={[s.row, isLastInGroup ? s.rowGroupEnd : s.rowGrouped]}>
                <View style={[s.column, isMe ? s.columnMe : s.columnOther, containerStyle]}>
                    {/* Sender name for group chats (future feature) */}
                    {senderName && !isMe && isFirstInGroup && (
                        <Text style={s.senderName} numberOfLines={1}>
                            {senderName}
                        </Text>
                    )}

                    <Pressable
                        onPress={onPress}
                        onLongPress={onLongPress}
                        accessibilityRole={onPress ? 'button' : 'text'}
                        accessibilityLabel={`${isMe ? 'You' : senderName || 'Contact'}: ${text}. ${formatTime(createdAt)}${isMe ? `, ${STATUS_LABEL[status]}` : ''}`}
                        accessibilityHint={failed ? 'Double tap to retry or delete' : undefined}
                        style={[
                            s.bubble,
                            isMe ? s.bubbleMe : s.bubbleOther,
                            isLastInGroup && (isMe ? s.tailMe : s.tailOther),
                            failed && s.bubbleFailed,
                            bubbleStyle,
                        ]}
                    >
                        <Text style={[s.text, isMe ? s.textMe : s.textOther, textStyle]} selectable>
                            {text}
                        </Text>
                    </Pressable>

                    {showMeta && (
                        <View
                            style={[s.meta, isMe ? s.metaMe : s.metaOther]}
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                        >
                            <Text style={[s.time, failed && s.failedText]}>
                                {failed ? 'Not sent · tap to retry' : formatTime(createdAt)}
                            </Text>
                            {statusIcon && !failed && (
                                <Ionicons
                                    name={statusIcon}
                                    size={14}
                                    color={status === 'read' ? colors.tintText : colors.secondaryLabel}
                                />
                            )}
                            {failed && <Ionicons name="alert-circle" size={14} color={colors.danger} />}
                        </View>
                    )}
                </View>
            </Animated.View>
        );
    }
);

MessageBubble.displayName = 'MessageBubble';

/* ─────────────────────── Styles ─────────────────────── */

const useStyles = makeStyles((t) => ({
    row: {
        width: '100%',
    },
    rowGrouped: {
        marginTop: 2,
    },
    rowGroupEnd: {
        marginTop: 2,
        marginBottom: t.space.sm,
    },
    column: {
        maxWidth: '80%',
    },
    columnMe: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
    },
    columnOther: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
    },
    bubble: {
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: t.radius.xl,
        minHeight: 38,
        justifyContent: 'center',
    },
    bubbleMe: {
        backgroundColor: t.colors.bubbleMe,
    },
    bubbleOther: {
        backgroundColor: t.colors.bubbleOther,
        borderWidth: t.size.hairline,
        borderColor: t.colors.bubbleOtherBorder,
    },
    tailMe: {
        borderBottomRightRadius: t.radius.xs,
    },
    tailOther: {
        borderBottomLeftRadius: t.radius.xs,
    },
    bubbleFailed: {
        opacity: 0.75,
    },
    text: {
        ...t.type.callout,
        lineHeight: 22,
    },
    textMe: {
        color: t.colors.bubbleMeText,
    },
    textOther: {
        color: t.colors.bubbleOtherText,
    },
    senderName: {
        ...t.type.caption1,
        fontWeight: '600',
        color: t.colors.tintText,
        marginBottom: t.space.xs,
        marginLeft: t.space.md,
        maxWidth: '90%',
    },
    meta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        marginTop: 3,
    },
    metaMe: {
        justifyContent: 'flex-end',
        marginRight: t.space.xs,
    },
    metaOther: {
        justifyContent: 'flex-start',
        marginLeft: t.space.xs,
    },
    time: {
        ...t.type.caption2,
        fontWeight: '400',
        color: t.colors.secondaryLabel,
        fontVariant: ['tabular-nums'],
    },
    failedText: {
        color: t.colors.danger,
        fontWeight: '600',
    },
}));

export default MessageBubble;
