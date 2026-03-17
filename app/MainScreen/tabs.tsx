import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import AIScreen from './mainTabs/AIScreen';
import ChatsScreen from './mainTabs/ChatsScreen';
import SettingsScreen from './mainTabs/SettingsScreen';
import StatusScreen from './mainTabs/StatusScreen';

export type MainTabParamList = {
    Chats: undefined;
    Status: undefined;
    AI: undefined;
    Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabs = () => {
    return (
        <Tab.Navigator screenOptions={{ headerShown: false }}>
            <Tab.Screen name="Chats" component={ChatsScreen}/>
            <Tab.Screen name="Status" component={StatusScreen} />
            <Tab.Screen name="AI" component={AIScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
    );
};

export default MainTabs;
