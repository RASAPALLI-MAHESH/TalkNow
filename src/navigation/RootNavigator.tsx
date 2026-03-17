import Chatroom from '@/app/components/chatroom';
import { CardStyleInterpolators, createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { ActivityIndicator, Easing, View } from 'react-native';
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
                options={{
                    gestureEnabled: true,
                    gestureDirection: 'horizontal',
                    cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
                    cardStyle: { backgroundColor: '#fff' },
                    transitionSpec: {
                        open: {
                            animation: 'timing',
                            config: {
                                duration: 220,
                                easing: Easing.out(Easing.poly(4)),
                            },
                        },
                        close: {
                            animation: 'timing',
                            config: {
                                duration: 200,
                                easing: Easing.out(Easing.poly(4)),
                            },
                        },
                    },
                }}
            />
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