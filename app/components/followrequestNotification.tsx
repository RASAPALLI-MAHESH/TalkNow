import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type FollowRequestNotificationProps = {
    username: string;
    message: string;
    onPress?: () => void;
};

const FollowRequestNotification = ({
    username,
    message,
    onPress,
}: FollowRequestNotificationProps) => {
    const initial = String(username || '?').slice(0, 1).toUpperCase();

    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={onPress ? `Notification from ${username}` : undefined}
        >
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
            </View>

            <View style={styles.content}>
                <Text style={styles.username} numberOfLines={1}>
                    {username}
                </Text>
                <Text style={styles.message} numberOfLines={2}>
                    {message}
                </Text>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    row: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#fff',
    },
    rowPressed: {
        backgroundColor: 'rgba(233,226,255,0.42)',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#e9e2ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    avatarText: {
        color: '#350d81',
        fontSize: 18,
        fontWeight: '700',
    },
    content: {
        flex: 1,
        minWidth: 0,
    },
    username: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 2,
    },
    message: {
        fontSize: 13,
        color: '#666',
    },
});

export default FollowRequestNotification;