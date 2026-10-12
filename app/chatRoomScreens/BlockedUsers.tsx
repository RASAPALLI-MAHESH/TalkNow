import AvatarPicker from '@/app/components/AvatarPicker';
import { getAuthErrorMessage, getBlockedUsers, unblockUser, type BlockedUserDto } from '@/services/AuthService';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PURPLE = '#6733d0';
const INK = '#1a1a2e';
const MUTED = '#6b7280';

/** Accounts the user has blocked, with Unblock. Opened from Settings. */
const BlockedUsers = ({ navigation }: { navigation: any }) => {
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
        <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
                    <Ionicons name="arrow-back" size={22} color={INK} />
                </Pressable>
                <Text style={styles.title}>Blocked accounts</Text>
                <View style={{ width: 22 }} />
            </View>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 32 }} color={PURPLE} />
            ) : (
                <FlatList
                    data={users}
                    keyExtractor={(u) => u.id}
                    contentContainerStyle={users.length === 0 ? styles.emptyContent : undefined}
                    ListEmptyComponent={
                        <Text style={styles.empty}>You haven&apos;t blocked anyone.</Text>
                    }
                    renderItem={({ item }) => (
                        <View style={styles.row}>
                            <AvatarPicker uri={item.profilePicture} name={item.username} size={44} />
                            <Text style={styles.name} numberOfLines={1}>{item.username}</Text>
                            <Pressable
                                onPress={() => void unblock(item)}
                                disabled={!!unblockingId}
                                style={({ pressed }) => [styles.unblock, pressed && { opacity: 0.7 }]}
                                accessibilityRole="button"
                                accessibilityLabel={`Unblock ${item.username}`}
                            >
                                {unblockingId === item.id ? (
                                    <ActivityIndicator size="small" color={PURPLE} />
                                ) : (
                                    <Text style={styles.unblockText}>Unblock</Text>
                                )}
                            </Pressable>
                        </View>
                    )}
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: '#fff' },
    header: {
        height: 56,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: '#f3f4f6',
    },
    title: { fontSize: 18, fontWeight: '700', color: INK },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
    name: { flex: 1, fontSize: 16, color: INK },
    unblock: {
        minWidth: 88,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: PURPLE,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    unblockText: { color: PURPLE, fontWeight: '600' },
    emptyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { color: MUTED, fontSize: 15 },
});

export default BlockedUsers;
