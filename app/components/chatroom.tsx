import styles from '@/app/components/chatroomStyles';
import useAuth from '@/hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type ChatMessage = {
    id: string;
    text: string;
    sender: 'me' | 'other';
    createdAt: string;
};

const Chatroom = ({ navigation }: { navigation: any }) => {
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
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

    const composerPaddingBottom = Math.max(10, insets.bottom);

    const handleBack = () => {
        Keyboard.dismiss();
        navigation.goBack();
    };

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
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <View style={styles.container}>
                        <View style={styles.header}>
                            <Pressable
                                onPress={handleBack}
                                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
                                android_ripple={
                                    Platform.OS === 'android'
                                        ? { color: 'rgba(255,255,255,0.22)', foreground: true }
                                        : undefined
                                }
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Go back"
                            >
                                <Ionicons name="arrow-back" size={22} color="#fff" />
                            </Pressable>

                            <Pressable
                                onPress={() => {}}
                                style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
                                android_ripple={
                                    Platform.OS === 'android'
                                        ? { color: 'rgba(255,255,255,0.22)', foreground: true }
                                        : undefined
                                }
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Open profile"
                            >
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
                            </Pressable>

                            <Pressable
                                onPress={() => {}}
                                style={({ pressed }) => [styles.headerTitleWrap, pressed && styles.pressed]}
                                android_ripple={
                                    Platform.OS === 'android'
                                        ? { color: 'rgba(255,255,255,0.22)', foreground: true }
                                        : undefined
                                }
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="Open chat details"
                            >
                                <Text style={styles.headerTitle} numberOfLines={1}>
                                    {user?.username ?? 'Chat'}
                                </Text>
                            </Pressable>

                            <Pressable
                                onPress={() => {}}
                                style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
                                android_ripple={
                                    Platform.OS === 'android'
                                        ? { color: 'rgba(255,255,255,0.22)', foreground: true }
                                        : undefined
                                }
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel="More options"
                            >
                                <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                            </Pressable>
                        </View>

                        <FlatList
                            data={messages}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.messagesContent}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
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

                        <View style={[styles.composer, { paddingBottom: composerPaddingBottom }]}>
                            <View style={styles.inputBar}>
                                <TextInput
                                    placeholder="Type a message…"
                                    style={styles.input}
                                    value={draft}
                                    onChangeText={setDraft}
                                    multiline
                                    placeholderTextColor="#6733d0"
                                    returnKeyType="send"
                                    textAlignVertical="center"
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
                                    android_ripple={Platform.OS === 'android' ? { color: '#e9e2ff' } : undefined}
                                    hitSlop={10}
                                    accessibilityRole="button"
                                    accessibilityLabel="Send message"
                                >
                                    <Text style={styles.sendText}>Send</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};
export default Chatroom;