import { BottomSheet, Button, Notice, TextField } from '@/app/components/ui';
import { deleteAccount, getAuthErrorMessage } from '@/services/AuthService';
import { useE2EE } from '@/services/e2ee/E2EEProvider';
import { makeStyles } from '@/src/theme';
import React, { useState } from 'react';
import { Alert, View } from 'react-native';

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
    const s = useStyles();
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
        <BottomSheet visible={visible} onClose={close} dismissible={!deleting} title="Delete account?">
            <View style={s.body}>
                <Notice tone="danger" icon="warning-outline">
                    This permanently deletes your profile, photos, connections and all your messages, including your
                    messages in other people&apos;s chats. This can&apos;t be undone.
                </Notice>
                <TextField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password to confirm"
                    secureToggle
                    autoCapitalize="none"
                    autoComplete="current-password"
                    textContentType="password"
                    editable={!deleting}
                    returnKeyType="done"
                    onSubmitEditing={() => void confirm()}
                />
                <View style={s.buttons}>
                    <Button title="Cancel" variant="gray" onPress={close} disabled={deleting} style={s.flex1} />
                    <Button title="Delete" variant="destructive" onPress={() => void confirm()} disabled={!password} loading={deleting} style={s.flex1} />
                </View>
            </View>
        </BottomSheet>
    );
};

const useStyles = makeStyles((t) => ({
    body: {
        gap: t.space.lg,
    },
    buttons: {
        flexDirection: 'row',
        gap: t.space.md,
    },
    flex1: { flex: 1 },
}));

export default DeleteAccountModal;
