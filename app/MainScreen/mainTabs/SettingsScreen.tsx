import useAuth from '@/hooks/useAuth';
import React from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
const SettingsScreen = () => {
    const { user, Logout } = useAuth();
    const [loggingOut, setLoggingOut] = React.useState(false);

    const handleLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            await Logout();
        } finally {
            setLoggingOut(false);
        }
    };
    return (
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text>Settings</Text>
                {user?.username ? <Text style={{ marginTop: 6, opacity: 0.75 }}>{String(user.username)}</Text> : null}
                <View style={{ height: 14 }} />
                {loggingOut ? (
                    <ActivityIndicator />
                ) : (
                    <Button title="Logout" onPress={handleLogout} />
                )}
            </View>
        </SafeAreaView>
    );
};

export default SettingsScreen;
