import useAuth from '@/hooks/useAuth';
import React, { useMemo, useState } from 'react';
import {
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ChatMessage = {
    id: string;
    text: string;
    sender: 'me' | 'other';
    createdAt: string;
};

const Chatroom = ({ navigation }: { navigation: any }) => {
    const { user } = useAuth();
    const [draft, setDraft] = useState('');

    // Placeholder messages. Replace with real messages later.
    const [messages, setMessages] = useState<ChatMessage[]>(() => [
        { id: '1', text: 'Hi 👋', sender: 'other', createdAt: new Date().toISOString() },
        { id: '2', text: 'Hello! How can I help?', sender: 'me', createdAt: new Date().toISOString() },
    ]);

    const initials = useMemo(() => {
        const name = String(user?.username ?? '').trim();
        if (!name) return '?';
        return name.slice(0, 1).toUpperCase();
    }, [user?.username]);

    const canSend = draft.trim().length > 0;

    const handleSend = () => {
        if (!canSend) return;
        const text = draft.trim();
        setDraft('');

        setMessages((prev) => [
            ...prev,
            {
                id: String(Date.now()),
                text,
                sender: 'me',
                createdAt: new Date().toISOString(),
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <KeyboardAvoidingView
                style={styles.safe}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <View style={styles.container}>
                        <View style={styles.header}>
                            <Pressable
                                onPress={() => navigation.goBack()}
                                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
                                hitSlop={10}
                            >
                                <Text style={styles.backText}>Back</Text>
                            </Pressable>

                            <View style={styles.headerCenter}>
                                <Text style={styles.headerTitle} numberOfLines={1}>
                                    {user?.username ?? 'Chat'}
                                </Text>
                            </View>

                            <View style={styles.headerRight}>
                                {typeof user?.profilePicture === 'string' && user.profilePicture.trim() ? (
                                    <Image
                                        source={{ uri: user.profilePicture.trim() }}
                                        style={styles.avatarImage}
                                    />
                                ) : (
                                    <View style={styles.avatarFallback}>
                                        <Text style={styles.avatarFallbackText}>{initials}</Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        <FlatList
                            data={messages}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.messagesContent}
                            renderItem={({ item }) => (
                                <View
                                    style={[
                                        styles.bubble,
                                        item.sender === 'me' ? styles.bubbleMe : styles.bubbleOther,
                                    ]}
                                >
                                    <Text style={styles.bubbleText}>{item.text}</Text>
                                </View>
                            )}
                        />

                        <View style={styles.composer}>
                            <TextInput
                                placeholder="Type a message..."
                                style={styles.input}
                                value={draft}
                                onChangeText={setDraft}
                                multiline
                                placeholderTextColor="#999"
                                returnKeyType="send"
                                onSubmitEditing={() => {
                                    if (Platform.OS === 'ios') return;
                                    handleSend();
                                }}
                            />
                            <Pressable
                                onPress={handleSend}
                                disabled={!canSend}
                                style={({ pressed }) => [
                                    styles.sendButton,
                                    (!canSend || pressed) && styles.sendButtonPressed,
                                ]}
                                hitSlop={10}
                            >
                                <Text style={styles.sendText}>Send</Text>
                            </Pressable>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};
const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#fff',
    },
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        width: '100%',
        height: 56,
        backgroundColor: '#6733d0',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    backButton: {
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 8,
    },
    backText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    pressed: {
        opacity: 0.7,
    },
    headerCenter: {
        flex: 1,
        paddingHorizontal: 10,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    headerRight: {
        width: 36,
        alignItems: 'flex-end',
    },
    avatarImage: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#e9e2ff',
    },
    avatarFallback: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#e9e2ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarFallbackText: {
        color: '#350d81',
        fontWeight: '800',
    },
    messagesContent: {
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    bubble: {
        maxWidth: '80%',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        marginBottom: 8,
    },
    bubbleMe: {
        alignSelf: 'flex-end',
        backgroundColor: '#e9e2ff',
    },
    bubbleOther: {
        alignSelf: 'flex-start',
        backgroundColor: '#f2f2f2',
    },
    bubbleText: {
        color: '#111',
        fontSize: 14,
    },
    composer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        backgroundColor: '#fff',
    },
    input: {
        flex: 1,
        maxHeight: 120,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 14,
        marginRight: 10,
        color: '#111',
    },
    sendButton: {
        backgroundColor: '#6733d0',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
    },
    sendButtonPressed: {
        opacity: 0.7,
    },
    sendText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
});
export default Chatroom;