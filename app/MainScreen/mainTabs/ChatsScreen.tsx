import ChatBar, { type ChatListItem } from '@/app/components/chatbar';
import { useWebSocketClient } from '@/services/WebSocketClient';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const formatChatTime = (raw?: string) => {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const ChatsScreen = ({ navigation }: { navigation: any }) => {
    useWebSocketClient();

    const [query, setQuery] = useState('');
    const [searchMode, setSearchMode] = useState<'local' | 'global'>('local');
    const [searchWidth, setSearchWidth] = useState(0);

    const iconPulse = useRef(new Animated.Value(0)).current;
    const scanAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(iconPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
                Animated.timing(iconPulse, { toValue: 0, duration: 650, useNativeDriver: true }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [iconPulse]);

    useEffect(() => {
        if (searchMode !== 'global' || searchWidth <= 0) {
            scanAnim.stopAnimation();
            scanAnim.setValue(0);
            return;
        }

        const scan = Animated.loop(
            Animated.timing(scanAnim, { toValue: 1, duration: 1100, useNativeDriver: true })
        );
        scan.start();
        return () => scan.stop();
    }, [scanAnim, searchMode, searchWidth]);

    const scanLineWidth = 90;
    const scanTranslateTop = useMemo(() => {
        return scanAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [-scanLineWidth, searchWidth + scanLineWidth],
        });
    }, [scanAnim, searchWidth]);

    const scanTranslateBottom = useMemo(() => {
        return scanAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [searchWidth + scanLineWidth, -scanLineWidth],
        });
    }, [scanAnim, searchWidth]);

    const filteredChats = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return ChatBar;
        return ChatBar.filter((c) => {
            const name = String(c.name ?? '').toLowerCase();
            const lastMessage = String(c.lastMessage ?? '').toLowerCase();
            if (searchMode === 'global') return name.includes(q) || lastMessage.includes(q);
            return name.includes(q);
        });
    }, [query, searchMode]);

    const showNoMatches = query.trim().length > 0 && filteredChats.length === 0;

    const ListEmpty = () => (
        <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>{showNoMatches ? 'No matches' : 'No chats yet'}</Text>
            <Text style={styles.emptySubtitle}>
                {showNoMatches ? 'Try a different search term.' : 'Start a conversation to see it here.'}
            </Text>
        </View>
    );

    const renderItem = ({ item }: { item: ChatListItem }) => (
        <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            android_ripple={Platform.OS === 'android' ? { color: '#e9e2ff' } : undefined}
            onPress={() => navigation.navigate('Chatroom')}
            accessibilityRole="button"
        >
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{String(item.name || '?').slice(0, 1).toUpperCase()}</Text>
            </View>

            <View style={styles.rowContent}>
                <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.time} numberOfLines={1}>{formatChatTime(item.Date)}</Text>
                </View>
                <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
            </View>
        </Pressable>
    );

    return (  
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style = {styles.header}>
                <Text style={styles.headerTitle}>TalkNow</Text>
                <Pressable>
                    {/* menu button placeholder */}
                </Pressable>
            </View>

            <View style={styles.searchWrap}>
                <View
                    style={[
                        styles.searchbar,
                        searchMode === 'global' ? styles.searchbarGlobal : styles.searchbarLocal,
                    ]}
                    onLayout={(e) => setSearchWidth(e.nativeEvent.layout.width)}
                >
                    {searchMode === 'global' && searchWidth > 0 ? (
                        <View pointerEvents="none" style={styles.searchScanWrap}>
                            <Animated.View
                                style={[
                                    styles.searchScanLineTop,
                                    { width: scanLineWidth, transform: [{ translateX: scanTranslateTop }] },
                                ]}
                            />
                            <Animated.View
                                style={[
                                    styles.searchScanLineBottom,
                                    { width: scanLineWidth, transform: [{ translateX: scanTranslateBottom }] },
                                ]}
                            />
                        </View>
                    ) : null}

                    <TextInput
                        placeholder={searchMode === 'global' ? 'Search globally' : 'Search'}
                        placeholderTextColor="#666"
                        style={styles.searchInput}
                        value={query}
                        onChangeText={setQuery}
                        onFocus={() => setSearchMode('local')}
                        autoCorrect={false}
                        autoCapitalize="none"
                        clearButtonMode="while-editing"
                        returnKeyType="search"
                    />

                    <Pressable
                        onPress={() => setSearchMode((m) => (m === 'global' ? 'local' : 'global'))}
                        style={({ pressed }) => [styles.searchIconButton, pressed && styles.rowPressed]}
                        android_ripple={Platform.OS === 'android' ? { color: '#e9e2ff' } : undefined}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={searchMode === 'global' ? 'Switch to local search' : 'Switch to global search'}
                    >
                        <Animated.View
                            style={{
                                opacity: iconPulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
                                transform: [
                                    {
                                        scale: iconPulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.05] }),
                                    },
                                ],
                            }}
                        >
                            <Ionicons name="search" size={20} color="#6733d0" />
                        </Animated.View>
                    </Pressable>
                </View>
            </View>

            <FlatList

                data={filteredChats}
                keyExtractor={(item, index) => String(item.id ?? index)}
                renderItem={renderItem}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                ListEmptyComponent={ListEmpty}
                showsVerticalScrollIndicator={false}
            />

        </SafeAreaView>

    );
};
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        width: '100%',
        height: 56,
        backgroundColor: '#6733d0',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    headerSubtitle: {
        color: '#fff',
        fontSize: 12,
        opacity: 0.9,
    },
    searchWrap: {
        width: '100%',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 6,
    },
    searchbar: {
        width: '100%',
        maxWidth: 420,
        minHeight: 40,
        borderWidth: 1,
        borderRadius: 30,
        paddingLeft: 15,
        paddingRight: 6,
        backgroundColor: '#fff',
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'hidden',
    }
    ,
    searchbarLocal: {
        borderColor: '#350d81',
    },
    searchbarGlobal: {
        borderColor: '#6733d0',
        borderWidth: 2,
    },
    searchInput: {
        flex: 1,
        height: 40,
        paddingVertical: 0,
        paddingRight: 10,
        color: '#111',
    },
    searchIconButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
        overflow: 'hidden',
    },
    searchScanWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
    },
    searchScanLineTop: {
        position: 'absolute',
        top: 0,
        height: 2,
        borderRadius: 1,
        backgroundColor: '#6733d0',
        opacity: 0.9,
    },
    searchScanLineBottom: {
        position: 'absolute',
        bottom: 0,
        height: 2,
        borderRadius: 1,
        backgroundColor: '#6733d0',
        opacity: 0.55,
    },
    list: {
        flex: 1,
        width: '100%',
    },
    listContent: {
        paddingTop: 8,
        paddingBottom: 14,
        alignItems: 'center',
    },
    row: {
        width: '100%',
        maxWidth: 420,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    rowPressed: {
        opacity: 0.75,
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
    rowContent: {
        flex: 1,
        minWidth: 0,
    },
    rowTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    name: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        marginRight: 8,
    },
    time: {
        fontSize: 12,
        color: '#666',
    },
    lastMessage: {
        fontSize: 13,
        color: '#666',
    },

    emptyWrap: {
        width: '100%',
        maxWidth: 420,
        paddingHorizontal: 16,
        paddingTop: 28,
        alignItems: 'center',
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 6,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 13,
        color: '#666',
        textAlign: 'center',
    },

});





export default ChatsScreen;
