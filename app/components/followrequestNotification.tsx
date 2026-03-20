import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AvatarPicker from './AvatarPicker';

type FollowRequestNotificationProps = {
    username: string;
    profilePicture?: string;
    message: string;
    onPress?: () => void;
    onClose?: () => void;
};

const FollowRequestNotification = ({
    username,
    profilePicture,
    message,
    onPress,
    onClose,
}: FollowRequestNotificationProps) => {
    const initial = String(username || '?').slice(0, 1).toUpperCase();

    return (
        <View style={styles.cardWrap}>
            <Pressable
                onPress={onPress}
                disabled={!onPress}
                style={({ pressed }) => [styles.card, pressed && onPress && styles.cardPressed]}
                accessibilityRole={onPress ? 'button' : undefined}
                accessibilityLabel={onPress ? `Notification from ${username}` : undefined}
            >
            <AvatarPicker
                uri={profilePicture}
                name={username}
                size={48}
                style={styles.avatarImage}
                fallbackStyle={styles.avatar}
                textStyle={styles.avatarText}
                previewEnabled
            />

            <View style={styles.content}>
                <Text style={styles.username} numberOfLines={1}>
                    {username}
                </Text>
                <Text style={styles.message} numberOfLines={2}>
                    {message}
                </Text>
            </View>

                <Pressable
                    onPress={onClose}
                    disabled={!onClose}
                    hitSlop={10}
                    style={({ pressed }) => [styles.closeButton, pressed && onClose && styles.closeButtonPressed]}
                    accessibilityRole={onClose ? 'button' : undefined}
                    accessibilityLabel={onClose ? 'Dismiss notification' : undefined}
                >
                    <Ionicons name="close" size={18} color="#6733d0" />
                </Pressable>
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    cardWrap: {
        width: '100%',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    card: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#eee',
        // "Floating" feel
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
    },
    cardPressed: {
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
    avatarImage: {
        width: 48,
        height: 48,
        borderRadius: 24,
        marginRight: 12,
        backgroundColor: '#e9e2ff',
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
    closeButton: {
        marginLeft: 10,
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(103,51,208,0.10)',
        flexShrink: 0,
    },
    closeButtonPressed: {
        opacity: 0.75,
    },
});

export default FollowRequestNotification;