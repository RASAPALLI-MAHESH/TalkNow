import { Button } from '@/app/components/ui';
import { getMinAppVersion } from '@/services/AuthService';
import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

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

const UpdateRequired = ({ onRetry }: { onRetry: () => void }) => {
    const s = useStyles();
    const { colors } = useTheme();
    return (
        <View style={s.container}>
            <View style={s.iconTile}>
                <Ionicons name="cloud-download-outline" size={36} color={colors.tintText} />
            </View>
            <Text style={s.title} accessibilityRole="header">Update TalkNow</Text>
            <Text style={s.body}>
                This version of TalkNow is no longer supported. Install the latest version from the App Store or Google Play
                to keep chatting. Your messages are end-to-end encrypted in the new version.
            </Text>
            <Button title="I've updated" onPress={onRetry} style={s.button} />
            <Text style={s.version}>Installed version {APP_VERSION}</Text>
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.space.xxxl,
        gap: t.space.lg,
        backgroundColor: t.colors.ground,
    },
    iconTile: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: t.colors.tintSoft,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: t.space.sm,
    },
    title: { ...t.type.title2, color: t.colors.label },
    body: { ...t.type.subhead, lineHeight: 22, color: t.colors.secondaryLabel, textAlign: 'center', maxWidth: 360 },
    button: { marginTop: t.space.sm, alignSelf: 'stretch', maxWidth: 360, width: '100%' },
    version: { ...t.type.caption1, color: t.colors.secondaryLabel },
}));

export default UpdateRequired;
