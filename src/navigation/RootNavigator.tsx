import Chatroom from '@/app/components/chatroom';
import Notifications from '@/app/components/notifications';
import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import HomePage from '../../app/MainScreen/tabs';
import useAuth from '../../hooks/useAuth';
import AuthNavigator from './AuthNavigator';
const Stack = createStackNavigator();

const MainNavigator = () => {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="HomePage" component={HomePage} />
            <Stack.Screen
                name="Chatroom"
                component={Chatroom}
                // options={{
                //     gestureEnabled: true,
                //     gestureDirection: 'horizontal',
                //     cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
                //     cardStyle: { backgroundColor: '#fff' },
                //     transitionSpec: {
                //         open: {
                //             animation: 'timing',
                //             config: {
                //                 duration: 100,
                //                 easing: Easing.out(Easing.poly(4)),
                //             },
                //         },
                //         close: {
                //             animation: 'timing',
                //             config: {
                //                 duration: 100,
                //                 easing: Easing.out(Easing.poly(4)),
                //             },
                //         },
                //     },
                // }}
            />
            <Stack.Screen name="Notifications" component={Notifications} />
        </Stack.Navigator>
    );
};

const RootNavigator = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0d4d47" />
            </View>
        );
    }

    // Automatically switch stacks based on authentication status
    return user ? <MainNavigator /> : <AuthNavigator />;
};

export default RootNavigator;