import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import HomePage from '../../app/MainScreen/tabs';
import useAuth from '../../hooks/useAuth';
import AuthNavigator from './AuthNavigator';

const Stack = createNativeStackNavigator();

const MainNavigator = () => {
    return (
        <Stack.Navigator screenOptions={{ headerTitleAlign: 'center', headerTintColor: '#fff', headerStyle: { backgroundColor: '#0d4d47' } }}>
            <Stack.Screen name="HomePage" component={HomePage} options={{ title: 'TalkNow' }} />
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