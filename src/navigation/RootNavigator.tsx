import BlockedUsers from '@/app/chatRoomScreens/BlockedUsers';
import ChatProfile from '@/app/chatRoomScreens/chatprofile';
import FullProfile from '@/app/chatRoomScreens/fullProfile';
import HeroCanvas from '@/app/chatRoomScreens/HeroCanvas';
import SafetyNumber from '@/app/chatRoomScreens/SafetyNumber';
import UpdateRequired, { useUpdateRequired } from '@/app/components/UpdateRequired';
import Chatroom from '@/app/components/chatroom';
import Notifications from '@/app/components/notifications';
import { useTheme } from '@/src/theme';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import HomePage from '../../app/MainScreen/tabs';
import useAuth from '../../hooks/useAuth';
import { usePushNotifications } from '../../services/pushNotifications';
import AuthNavigator from './AuthNavigator';

// Native stack: system push and pop, the iOS edge-swipe back gesture, and Android's Back.
const Stack = createNativeStackNavigator();

const MainNavigator = () => {
    const { colors } = useTheme();
    return (
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
            <Stack.Screen name="HomePage" component={HomePage} />
            <Stack.Screen name="Chatroom" component={Chatroom} />
            <Stack.Screen name="Notifications" component={Notifications} />
            <Stack.Screen name="ChatProfile" component={ChatProfile} />
            <Stack.Screen name="FullProfile" component={FullProfile} />
            {/* An editor with its own Cancel and Done: presented, not pushed. */}
            <Stack.Screen name="HeroCanvas" component={HeroCanvas} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="BlockedUsers" component={BlockedUsers} />
            <Stack.Screen name="SafetyNumber" component={SafetyNumber} />
        </Stack.Navigator>
    );
};

const RootNavigator = () => {
    const { user, loading } = useAuth();
    const { colors } = useTheme();
    usePushNotifications(!!user);
    const update = useUpdateRequired();

    // The server stopped accepting this version (e.g. it can't encrypt messages).
    if (update.required) return <UpdateRequired onRetry={update.check} />;

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.ground }}>
                <ActivityIndicator size="large" color={colors.tintText} />
            </View>
        );
    }

    // Automatically switch stacks based on authentication status
    return user ? <MainNavigator /> : <AuthNavigator />;
};

export default RootNavigator;
