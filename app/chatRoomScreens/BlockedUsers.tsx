import AvatarPicker from '@/app/components/AvatarPicker';
import { Button, EmptyState, NavBar, useNavBarHeight, useScrollEdge } from '@/app/components/ui';
import { getAuthErrorMessage, getBlockedUsers, unblockUser, type BlockedUserDto } from '@/services/AuthService';
import { makeStyles, useTheme } from '@/src/theme';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Accounts the user has blocked, with Unblock. Opened from Settings. */
const BlockedUsers = ({ navigation }: { navigation: any }) => {
    const s = useStyles();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const navHeight = useNavBarHeight();
    const { scrollY, onScroll } = useScrollEdge();
    const [users, setUsers] = useState<BlockedUserDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [unblockingId, setUnblockingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await getBlockedUsers();
            setUsers(Array.isArray(res?.users) ? res.users : []);
        } catch (err) {
            Alert.alert('Could not load blocked accounts', getAuthErrorMessage(err, 'Please try again.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const unblock = async (user: BlockedUserDto) => {
        if (unblockingId) return;
        setUnblockingId(user.id);
        try {
            await unblockUser(user.id);
            setUsers((prev) => prev.filter((u) => u.id !== user.id));
        } catch (err) {
            Alert.alert('Could not unblock', getAuthErrorMessage(err, 'Please try again.'));
        } finally {
            setUnblockingId(null);
        }
    };

    return (
        <View style={s.screen}>
            {loading ? (
                <View style={[s.center, { paddingTop: navHeight }]}>
                    <ActivityIndicator color={colors.tintText} accessibilityLabel="Loading blocked accounts" />
                </View>
            ) : (
                <Animated.FlatList
                    data={users}
                    keyExtractor={(u) => u.id}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    contentContainerStyle={[
                        { paddingTop: navHeight + 8, paddingBottom: Math.max(insets.bottom, 16) + 24 },
                        users.length === 0 && s.emptyContent,
                    ]}
                    ListHeaderComponent={
                        users.length > 0 ? (
                            <Text style={s.caption}>Blocked people can&apos;t follow or message you.</Text>
                        ) : null
                    }
                    ListEmptyComponent={<EmptyState icon="hand-left-outline" title="You haven't blocked anyone." />}
                    renderItem={({ item, index }) => (
                        <View style={[s.row, index === 0 && s.rowFirst, index === users.length - 1 && s.rowLast]}>
                            <AvatarPicker uri={item.profilePicture} name={item.username} size={44} />
                            <Text style={s.name} numberOfLines={1}>{item.username}</Text>
                            <Button
                                title="Unblock"
                                variant="tinted"
                                size="sm"
                                onPress={() => void unblock(item)}
                                disabled={!!unblockingId && unblockingId !== item.id}
                                loading={unblockingId === item.id}
                                accessibilityLabel={`Unblock ${item.username}`}
                            />
                        </View>
                    )}
                    ItemSeparatorComponent={() => (
                        <View style={s.separatorWrap}>
                            <View style={s.separator} />
                        </View>
                    )}
                />
            )}
            <NavBar title="Blocked accounts" onBack={() => navigation.goBack()} scrollY={scrollY} />
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    screen: { flex: 1, backgroundColor: t.colors.ground },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyContent: { flexGrow: 1, justifyContent: 'center' },
    caption: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
        marginHorizontal: t.space.gutter + t.space.lg,
        marginBottom: t.space.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.md,
        marginHorizontal: t.space.gutter,
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.md,
        backgroundColor: t.colors.surface,
    },
    rowFirst: { borderTopLeftRadius: t.radius.lg, borderTopRightRadius: t.radius.lg },
    rowLast: { borderBottomLeftRadius: t.radius.lg, borderBottomRightRadius: t.radius.lg },
    name: { flex: 1, ...t.type.body, color: t.colors.label },
    separatorWrap: { marginHorizontal: t.space.gutter, backgroundColor: t.colors.surface },
    separator: { height: t.size.hairline, backgroundColor: t.colors.separator, marginLeft: t.space.lg + 44 + t.space.md },
}));

export default BlockedUsers;
