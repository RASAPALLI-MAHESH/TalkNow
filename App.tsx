// Must run first: crypto.getRandomValues for the end-to-end encryption code.
import 'react-native-get-random-values';
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthProvider from "./Context/AuthProvider";
import { UnreadProvider } from "./Context/UnreadContext";
import { WebSocketProvider } from "./services/WebSocketClient";
import { E2EEProvider } from "./services/e2ee/E2EEProvider";
import RootNavigator from "./src/navigation/RootNavigator";
import { navigationRef } from "./src/navigation/navigationRef";
import { navigationTheme, ThemeProvider, useTheme } from "./src/theme";

// The navigation theme follows the system appearance, so it lives inside ThemeProvider.
const ThemedNavigation = () => {
    const { scheme } = useTheme();
    return (
        <NavigationContainer ref={navigationRef} theme={navigationTheme(scheme)}>
            <StatusBar style="auto" />
            <AuthProvider>
                <WebSocketProvider>
                    <E2EEProvider>
                        <UnreadProvider>
                            <RootNavigator />
                        </UnreadProvider>
                    </E2EEProvider>
                </WebSocketProvider>
            </AuthProvider>
        </NavigationContainer>
    );
};

// Development-only design gallery on web (#gallery-chats, #gallery-chat, ...); see app/dev/DesignGallery.tsx.
const galleryScene =
    __DEV__ && Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash.startsWith('#gallery')
        ? window.location.hash.replace('#gallery-', '').replace('#gallery', '')
        : null;

export default function App() {
    if (galleryScene !== null) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only in the web dev gallery
        const DesignGallery = require('./app/dev/DesignGallery').default;
        return (
            <GestureHandlerRootView style={{ flex: 1 }}>
                <SafeAreaProvider>
                    <ThemeProvider>
                        <StatusBar style="auto" />
                        <DesignGallery scene={galleryScene} />
                    </ThemeProvider>
                </SafeAreaProvider>
            </GestureHandlerRootView>
        );
    }
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <ThemeProvider>
                    <ThemedNavigation />
                </ThemeProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
