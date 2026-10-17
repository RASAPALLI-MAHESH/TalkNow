import { Button } from '@/app/components/ui';
import { makeStyles } from '@/src/theme';
import React from 'react';
import { Text, View } from 'react-native';
import AvatarPicker from './AvatarPicker';

type FollowRequestComponentProps = {
    username: string;
    profilePicture?: string;
    message?: string;
    onAccept?: () => void;
    onReject?: () => void;
    busy?: boolean;
};

/** A follow request with Accept (primary) and Reject. */
const FollowRequestComponent = ({
    username,
    profilePicture,
    message = 'sent you a follow request',
    onAccept,
    onReject,
    busy = false,
}: FollowRequestComponentProps) => {
    const s = useStyles();
    return (
        <View style={s.row}>
            <AvatarPicker uri={profilePicture} name={username} size={48} previewEnabled />
            <View style={s.content}>
                <Text style={s.username} numberOfLines={1}>
                    {username}
                </Text>
                <Text style={s.message} numberOfLines={2}>
                    {message}
                </Text>
                <View style={s.actionsRow}>
                    <Button
                        title="Accept"
                        size="sm"
                        onPress={onAccept}
                        disabled={!onAccept || busy}
                        style={s.action}
                        accessibilityLabel={`Accept follow request from ${username}`}
                    />
                    <Button
                        title="Reject"
                        size="sm"
                        variant="gray"
                        onPress={onReject}
                        disabled={!onReject || busy}
                        style={s.action}
                        accessibilityLabel={`Reject follow request from ${username}`}
                    />
                </View>
            </View>
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    row: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: t.space.md,
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.md,
        backgroundColor: t.colors.surface,
    },
    content: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    username: {
        ...t.type.headline,
        color: t.colors.label,
    },
    message: {
        ...t.type.subhead,
        color: t.colors.secondaryLabel,
    },
    actionsRow: {
        marginTop: t.space.sm,
        flexDirection: 'row',
        gap: t.space.sm,
    },
    action: {
        flex: 1,
        minHeight: 36,
    },
}));

export default FollowRequestComponent;
