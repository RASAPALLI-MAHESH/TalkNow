// Must run first: crypto.getRandomValues for the end-to-end encryption code.
import 'react-native-get-random-values';
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthProvider from "./Context/AuthProvider";
import { UnreadProvider } from "./Context/UnreadContext";
import { WebSocketProvider } from "./services/WebSocketClient";
import { E2EEProvider } from "./services/e2ee/E2EEProvider";
import RootNavigator from "./src/navigation/RootNavigator";
import { navigationRef } from "./src/navigation/navigationRef";

export default function App() {
    return (
        <SafeAreaProvider>
            <NavigationContainer ref={navigationRef}>
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
        </SafeAreaProvider>
    );
}
