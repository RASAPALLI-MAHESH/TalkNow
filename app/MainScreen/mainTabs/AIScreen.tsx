import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const AIScreen = () => {
    return (
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text>AI</Text>
            </View>
        </SafeAreaView>
    );
};

export default AIScreen;
