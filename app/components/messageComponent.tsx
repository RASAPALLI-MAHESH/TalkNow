/**
 * MessageBubble.tsx — Reusable chat message component
 *
 * Displays individual messages with:
 * - Sender identification (me/other)
 * - Message content with text wrapping
 * - Timestamp display
 * - Status indicators (extensible for read receipts, reactions)
 *
 * Designed for easy scaling with:
 * - Props for future media/attachments
 * - Status indicators (sent/delivered/read)
 * - Reaction support
 * - Context menu actions
 */

import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

/* ─────────────────────── Types ─────────────────────── */

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface MessageBubbleProps {
    /**
     * Unique message identifier (ObjectId or timestamp-based)
     */
    id: string;

    /**
     * Message text content
     */
    text: string;

    /**
     * Sender perspective: 'me' for current user, 'other' for peer
     */
    sender: 'me' | 'other';

    /**
     * ISO timestamp when message was created
     */
    createdAt: string;

    /**
     * Optional: Message delivery/read status
     * @default 'sent'
     */
    status?: MessageStatus;

    /**
     * Optional: Username of sender (for group chats, future feature)
     */
    senderName?: string;

    /**
     * Optional: Callback when message is pressed (for context menu, future)
     */
    onPress?: () => void;

    /**
     * Optional: Callback for long press (reactions, forwarding, etc.)
     */
    onLongPress?: () => void;

    /**
     * Optional: Custom styles override
     */
    containerStyle?: ViewStyle;
    bubbleStyle?: ViewStyle;
    textStyle?: TextStyle;
}

/* ─────────────────────── Helpers ─────────────────────── */

/**
 * Format ISO timestamp to 12-hour time with AM/PM
 * @example "2:45 PM"
 */
function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Get status indicator symbol
 * - ✓ = sent
 * - ✓✓ = delivered
 * - ✓✓ (blue) = read
 */
function getStatusIcon(status?: MessageStatus): string {
    switch (status) {
        case 'read':
            return '✓✓';
        case 'delivered':
            return '✓✓';
        case 'sent':
        case 'sending':
        default:
            return '✓';
    }
}

/* ─────────────────────── Component ─────────────────────── */

/**
 * MessageBubble — Scalable message display component
 *
 * Usage:
 * ```
 * <MessageBubble
 *   id="msg123"
 *   text="Hello!"
 *   sender="me"
 *   createdAt={new Date().toISOString()}
 *   status="read"
 *   onLongPress={() => showContextMenu()}
 * />
 * ```
 */
const MessageBubble = memo<MessageBubbleProps>(
    ({
        id,
        text,
        sender,
        createdAt,
        status = 'sent',
        senderName,
        onPress,
        onLongPress,
        containerStyle,
        bubbleStyle,
        textStyle,
    }) => {
        const isMe = sender === 'me';

        return (
            <View
                style={[
                    styles.bubbleRow,
                    isMe ? styles.bubbleRowMe : styles.bubbleRowOther,
                    containerStyle,
                ]}
                accessibilityRole="text"
                accessibilityLabel={`Message from ${isMe ? 'you' : senderName || 'contact'}: ${text}`}
            >
                {/* Sender name for group chats (future feature) */}
                {senderName && !isMe && (
                    <Text style={styles.senderName} numberOfLines={1}>
                        {senderName}
                    </Text>
                )}

                {/* Message bubble */}
                <Pressable
                    style={[
                        styles.bubble,
                        isMe ? styles.bubbleMe : styles.bubbleOther,
                        bubbleStyle,
                    ]}
                    onPress={onPress}
                    onLongPress={onLongPress}
                >
                    <Text
                        style={[
                            styles.bubbleText,
                            isMe ? styles.bubbleTextMe : styles.bubbleTextOther,
                            textStyle,
                        ]}
                    >
                        {text}
                    </Text>
                </Pressable>

                {/* Timestamp + Status */}
                <View style={[styles.bottomRow, isMe ? styles.bottomRowMe : styles.bottomRowOther]}>
                    <Text style={styles.timestamp}>
                        {formatTime(createdAt)}
                    </Text>

                    {/* Status indicator (visible for sent messages) */}
                    {isMe && (
                        <Text
                            style={[
                                styles.statusIcon,
                                status === 'read' && styles.statusIconRead,
                            ]}
                        >
                            {getStatusIcon(status)}
                        </Text>
                    )}
                </View>
            </View>
        );
    }
);

MessageBubble.displayName = 'MessageBubble';

/* ─────────────────────── Styles ─────────────────────── */

const styles = StyleSheet.create({
    /* Layout */
    bubbleRow: {
        marginBottom: 8,
        maxWidth: '85%',
    },

    bubbleRowMe: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
    },

    bubbleRowOther: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
    },

    /* Bubble container */
    bubble: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
        minHeight: 40,
        justifyContent: 'center',
    },

    bubbleMe: {
        backgroundColor: '#6733d0',
        borderBottomRightRadius: 4, // WhatsApp-style notch
    },

    bubbleOther: {
        backgroundColor: '#fff',
        borderWidth: 0.5,
        borderColor: '#ede6ff',
        borderBottomLeftRadius: 4, // tail on left
    },

    /* Text styling */
    bubbleText: {
        fontSize: 15,
        lineHeight: 21,
        fontFamily: 'System',
    },

    bubbleTextMe: {
        color: '#fff',
    },

    bubbleTextOther: {
        color: '#1a1a2e',
    },

    /* Group chat sender name */
    senderName: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6733d0',
        marginBottom: 4,
        marginLeft: 4,
        maxWidth: '90%',
    },

    /* Timestamp + Status row */
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 3,
    },

    bottomRowMe: {
        justifyContent: 'flex-end',
        marginRight: 4,
    },

    bottomRowOther: {
        justifyContent: 'flex-start',
        marginLeft: 4,
    },

    /* Timestamp */
    timestamp: {
        fontSize: 10,
        color: '#7b7b9d',
        fontFamily: 'System',
    },

    /* Status indicator */
    statusIcon: {
        fontSize: 10,
        color: '#999',
        marginLeft: 2,
        fontWeight: '600',
    },

    statusIconRead: {
        color: '#6733d0', // Blue check for read
    },
});

export default MessageBubble;
