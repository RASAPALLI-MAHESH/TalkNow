import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

type FollowRequestComponentProps = {
    username: string;
    profilePicture?: string;
    message?: string;
    onAccept?: () => void;
    onReject?: () => void;
};

const FollowRequestComponent = ({
    username,
    profilePicture,
    message = 'sent you a follow request',
    onAccept,
    onReject,
}: FollowRequestComponentProps) => {
    const initial = String(username || '?').slice(0, 1).toUpperCase();

    return (
        <View style={styles.wrap}>
            <View style={styles.card}>
                <View style={styles.topRow}>
                    {typeof profilePicture === 'string' && profilePicture.trim().length > 0 ? (
                        <Image source={{ uri: profilePicture.trim() }} style={styles.avatarImage} />
                    ) : (
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{initial}</Text>
                        </View>
                    )}

                    <View style={styles.content}>
                        <Text style={styles.username} numberOfLines={1}>
                            {username}
                        </Text>
                        <Text style={styles.message} numberOfLines={2}>
                            {message}
                        </Text>
                    </View>
                </View>

                <View style={styles.actionsRow}>
                    <Pressable
                        onPress={onReject}
                        disabled={!onReject}
                        style={({ pressed }) => [
                            styles.actionButton,
                            styles.rejectButton,
                            pressed && onReject && styles.buttonPressed,
                        ]}
                        accessibilityRole={onReject ? 'button' : undefined}
                        accessibilityLabel={onReject ? `Reject follow request from ${username}` : undefined}
                    >
                        <Text style={styles.rejectText}>Reject</Text>
                    </Pressable>

                    <Pressable
                        onPress={onAccept}
                        disabled={!onAccept}
                        style={({ pressed }) => [
                            styles.actionButton,
                            styles.acceptButton,
                            pressed && onAccept && styles.buttonPressed,
                        ]}
                        accessibilityRole={onAccept ? 'button' : undefined}
                        accessibilityLabel={onAccept ? `Accept follow request from ${username}` : undefined}
                    >
                        <Text style={styles.acceptText}>Accept</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        width: '100%',
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    card: {
        width: '100%',
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#eee',
        paddingHorizontal: 12,
        paddingVertical: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#e9e2ff',
        marginRight: 12,
    },
    avatarImage: {
        width: 46,
        height: 46,
        borderRadius: 23,
        marginRight: 12,
        backgroundColor: '#e9e2ff',
    },
    avatarText: {
        color: '#350d81',
        fontSize: 17,
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
    actionsRow: {
        marginTop: 10,
        flexDirection: 'row',
        gap: 10,
    },
    actionButton: {
        flex: 1,
        minHeight: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    rejectButton: {
        borderColor: '#e8c4cc',
        backgroundColor: '#fff6f7',
    },
    acceptButton: {
        borderColor: '#c8e7d1',
        backgroundColor: '#f1fbf4',
    },
    rejectText: {
        color: '#a53b4f',
        fontSize: 13,
        fontWeight: '700',
    },
    acceptText: {
        color: '#1f7a3f',
        fontSize: 13,
        fontWeight: '700',
    },
    buttonPressed: {
        opacity: 0.8,
    },
});

export default FollowRequestComponent;
