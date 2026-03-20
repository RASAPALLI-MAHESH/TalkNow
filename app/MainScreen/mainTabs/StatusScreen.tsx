import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const StatusScreen = () => {
    return (
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text>Status Screen</Text>
                <Pressable>
                     <Text>This Screen is under Development </Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
};

export default StatusScreen;
