import { GlassTabBar } from '@/app/components/ui';
import { useTheme } from '@/src/theme';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import ChatsScreen from './mainTabs/ChatsScreen';
import SettingsScreen from './mainTabs/SettingsScreen';

import { useUnread } from '@/Context/UnreadContext';

export type MainTabParamList = {
    Chats: undefined;
    Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS = {
    Chats: { on: 'chatbubble-ellipses', off: 'chatbubble-ellipses-outline' },
    Settings: { on: 'settings', off: 'settings-outline' },
} as const;

const MainTabs = () => {
    const { totalUnread } = useUnread();
    const { colors } = useTheme();
    return (
        <Tab.Navigator
            // Screens scroll beneath the floating glass capsule.
            tabBar={(props) => <GlassTabBar {...props} icons={TAB_ICONS} badges={{ Chats: totalUnread }} />}
            screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: colors.ground },
                animation: 'fade',
            }}
        >
            <Tab.Screen name="Chats" component={ChatsScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
    );
};

export default MainTabs;
