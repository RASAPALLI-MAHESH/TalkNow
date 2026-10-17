import { getMinAppVersion } from '@/services/AuthService';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const APP_VERSION = String(Constants.expoConfig?.version ?? '0.0.0');

// True when `version` is older than `min` (numeric x.y.z comparison).
export const isOlderVersion = (version: string, min: string) => {
    const a = version.split('.').map((n) => Number.parseInt(n, 10) || 0);
    const b = min.split('.').map((n) => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
    }
    return false;
};

/** Asks the server for the oldest supported version once per launch. Errors never block the app. */
export const useUpdateRequired = () => {
    const [required, setRequired] = useState(false);
    const check = useCallback(async () => {
        try {
            const min = await getMinAppVersion();
            setRequired(!!min && isOlderVersion(APP_VERSION, min));
        } catch {
            // Offline or server down: let the app run.
        }
    }, []);
    useEffect(() => {
        void check();
    }, [check]);
    return { required, check };
};

const UpdateRequired = ({ onRetry }: { onRetry: () => void }) => (
    <View style={styles.container}>
        <Ionicons name="cloud-download-outline" size={48} color="#6733d0" />
        <Text style={styles.title}>Update TalkNow</Text>
        <Text style={styles.body}>
            This version of TalkNow is no longer supported. Install the latest version from the App Store or Google Play
            to keep chatting. Your messages are end-to-end encrypted in the new version.
        </Text>
        <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.buttonText}>I&apos;ve updated</Text>
        </Pressable>
        <Text style={styles.version}>Installed version {APP_VERSION}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, backgroundColor: '#f8f5ff' },
    title: { fontSize: 22, fontWeight: '700', color: '#1a1a2e' },
    body: { fontSize: 15, lineHeight: 22, color: '#7b7b9d', textAlign: 'center' },
    button: { backgroundColor: '#6733d0', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
    buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    version: { fontSize: 12, color: '#7b7b9d' },
});

export default UpdateRequired;
