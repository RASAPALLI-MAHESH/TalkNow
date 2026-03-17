import ChatBar from '@/app/components/chatbar';
import useAuth from '@/hooks/useAuth';
import { useWebSocketClient } from '@/services/WebSocketClient';
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
const ChatsScreen = () => {
    const { user } = useAuth();
    useWebSocketClient();

    const renderItem = ({ item }: { item: (typeof ChatBar)[number] }) => (
        <Pressable style={styles.row}>
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{String(item.name || '?').slice(0, 1).toUpperCase()}</Text>
            </View>

            <View style={styles.rowContent}>
                <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.time} numberOfLines={1}>{String(item.Date ?? '').slice(0, 10)}</Text>
                </View>
                <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
            </View>
        </Pressable>
    );

    return (  
        <View style= {styles.container}>
            <View style = {styles.header}>
                <Text style={styles.headerTitle}>TalkNow</Text>
                <Text style={styles.headerSubtitle}>{user?.username ?? ''}</Text>
                <Pressable>
                    {/* menu button placeholder */}
                </Pressable>
            </View>

            <View style={styles.searchWrap}>
                <TextInput placeholder='Search' style={styles.searchbar} />
            </View>

            <FlatList
                data={ChatBar}
                keyExtractor={(item, index) => String(item.id ?? index)}
                renderItem={renderItem}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
            />

        </View>

    );
};
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        width: '100%',
        height: 60,
        backgroundColor: '#6733d0',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
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
    },
    searchbar: {
        width: '100%',
        maxWidth: 420,
        height: 40,
        borderColor: '#350d81',
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 15,
        marginTop: 10,
    }
    ,
    list: {
        flex: 1,
        width: '100%',
    },
    listContent: {
        paddingTop: 20,
        paddingBottom: 10,
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

});





export default ChatsScreen;
