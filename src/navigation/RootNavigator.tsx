import Chatroom from '@/app/components/chatroom';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import HomePage from '../../app/MainScreen/tabs';
import useAuth from '../../hooks/useAuth';
import AuthNavigator from './AuthNavigator';
const Stack = createNativeStackNavigator();

const MainNavigator = () => {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="HomePage" component={HomePage} />
            <Stack.Screen name="Chatroom" component={Chatroom} />
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