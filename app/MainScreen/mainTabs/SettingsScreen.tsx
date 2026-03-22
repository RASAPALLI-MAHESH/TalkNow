import FullProfile from '@/app/chatRoomScreens/fullProfile';
import React from 'react';

const SettingsScreen = ({ navigation, route }: any) => {
    return <FullProfile navigation={navigation} route={route} isSettingsTab={true} />;
};

export default SettingsScreen;
