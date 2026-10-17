import { deleteAccount, getAuthErrorMessage } from '@/services/AuthService';
import { useE2EE } from '@/services/e2ee/E2EEProvider';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

const RED = '#ef4444';
const INK = '#1a1a2e';
const MUTED = '#6b7280';

/** Asks for the password, then permanently deletes the account and calls `onDeleted`. */
const DeleteAccountModal = ({
    visible,
    onClose,
    onDeleted,
}: {
    visible: boolean;
    onClose: () => void;
    onDeleted: () => void;
}) => {
    const [password, setPassword] = useState('');
    const [deleting, setDeleting] = useState(false);
    const { engine } = useE2EE();

    const close = () => {
        if (deleting) return;
        setPassword('');
        onClose();
    };

    const confirm = async () => {
        if (!password || deleting) return;
        setDeleting(true);
        try {
            await deleteAccount(password);
            // The decrypted messages and keys on this phone go too.
            await engine?.wipe().catch(() => undefined);
            setPassword('');
            onDeleted();
        } catch (err) {
            Alert.alert('Could not delete account', getAuthErrorMessage(err, 'Please try again.'));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
            <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.card}>
                    <Text style={styles.title}>Delete account?</Text>
                    <Text style={styles.body}>
                        This permanently deletes your profile, photos, connections and all your messages,
                        including your messages in other people&apos;s chats. This can&apos;t be undone.
                    </Text>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Enter your password to confirm"
                        placeholderTextColor={MUTED}
                        secureTextEntry
                        autoCapitalize="none"
                        editable={!deleting}
                    />
                    <View style={styles.buttons}>
                        <Pressable onPress={close} style={[styles.button, styles.cancel]} accessibilityRole="button">
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => void confirm()}
                            disabled={!password || deleting}
                            style={[styles.button, styles.delete, (!password || deleting) && styles.disabled]}
                            accessibilityRole="button"
                        >
                            {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteText}>Delete</Text>}
                        </Pressable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.45)' },
    card: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
    title: { fontSize: 18, fontWeight: '700', color: INK },
    body: { fontSize: 14, color: MUTED, marginTop: 8, lineHeight: 20 },
    input: {
        height: 48,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        paddingHorizontal: 12,
        marginTop: 16,
        fontSize: 15,
        color: INK,
    },
    buttons: { flexDirection: 'row', marginTop: 16, gap: 12 },
    button: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cancel: { backgroundColor: '#f3f4f6' },
    cancelText: { fontSize: 15, fontWeight: '600', color: INK },
    delete: { backgroundColor: RED },
    deleteText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    disabled: { opacity: 0.5 },
});

export default DeleteAccountModal;
