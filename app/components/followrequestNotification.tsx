import { IconButton, PressableScale } from '@/app/components/ui';
import { makeStyles, useTheme } from '@/src/theme';
import React from 'react';
import { Text, View } from 'react-native';
import AvatarPicker from './AvatarPicker';

type FollowRequestNotificationProps = {
    username: string;
    profilePicture?: string;
    message: string;
    /** Relative time, e.g. "2h". */
    time?: string;
    onPress?: () => void;
    onClose?: () => void;
};

/** One activity notification row with a dismiss control. */
const FollowRequestNotification = ({
    username,
    profilePicture,
    message,
    time,
    onPress,
    onClose,
}: FollowRequestNotificationProps) => {
    const s = useStyles();
    const { colors } = useTheme();

    const body = (
        <>
            <AvatarPicker uri={profilePicture} name={username} size={44} previewEnabled />
            <View style={s.content}>
                <Text style={s.text} numberOfLines={3}>
                    <Text style={s.username}>{username}</Text> {message}
                </Text>
                {!!time && <Text style={s.time}>{time}</Text>}
            </View>
            {onClose && (
                <IconButton
                    name="close"
                    iconSize={18}
                    color={colors.tertiaryLabel}
                    onPress={onClose}
                    accessibilityLabel={`Dismiss notification from ${username}`}
                />
            )}
        </>
    );

    if (!onPress) return <View style={s.row}>{body}</View>;

    return (
        <PressableScale
            onPress={onPress}
            scaleTo={1}
            style={s.row}
            pressedStyle={s.rowPressed}
            accessibilityRole="button"
            accessibilityLabel={`${username} ${message}`}
        >
            {body}
        </PressableScale>
    );
};

const useStyles = makeStyles((t) => ({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        paddingLeft: t.space.lg,
        paddingRight: t.space.xs,
        paddingVertical: t.space.sm,
        minHeight: 64,
        backgroundColor: t.colors.surface,
    },
    rowPressed: {
        backgroundColor: t.colors.pressedOverlay,
    },
    content: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    text: {
        ...t.type.subhead,
        color: t.colors.secondaryLabel,
    },
    username: {
        fontWeight: '600',
        color: t.colors.label,
    },
    time: {
        ...t.type.caption1,
        color: t.colors.secondaryLabel,
    },
}));

export default FollowRequestNotification;
