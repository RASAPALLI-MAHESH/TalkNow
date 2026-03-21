import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import AIScreen from './mainTabs/AIScreen';
import ChatsScreen from './mainTabs/ChatsScreen';
import SettingsScreen from './mainTabs/SettingsScreen';
import StatusScreen from './mainTabs/StatusScreen';

import { useUnread } from '@/Context/UnreadContext';

export type MainTabParamList = {
    Chats: undefined;
    Status: undefined;
    AI: undefined;
    Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabs = () => {
    const { totalUnread } = useUnread();
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: '#6733d0',
                tabBarInactiveTintColor: '#666',
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap;

                    switch (route.name) {
                        case 'Chats':
                            iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
                            break;
                        case 'Status':
                            iconName = focused ? 'pulse' : 'pulse-outline';
                            break;
                        case 'AI':
                            iconName = focused ? 'sparkles' : 'sparkles-outline';
                            break;
                        case 'Settings':
                            iconName = focused ? 'settings' : 'settings-outline';
                            break;
                        default:
                            iconName = 'ellipse';
                    }

                    return <Ionicons name={iconName} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen 
                name="Chats" 
                component={ChatsScreen}
                options={{ tabBarBadge: totalUnread > 0 ? totalUnread : undefined }}
            />
            <Tab.Screen name="Status" component={StatusScreen} />
            <Tab.Screen name="AI" component={AIScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
    );
};

export default MainTabs;
