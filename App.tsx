import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthProvider from "./Context/AuthProvider";
import { UnreadProvider } from "./Context/UnreadContext";
import { WebSocketProvider } from "./services/WebSocketClient";
import RootNavigator from "./src/navigation/RootNavigator";
import { navigationRef } from "./src/navigation/navigationRef";

export default function App() {
    return (
        <SafeAreaProvider>
            <NavigationContainer ref={navigationRef}>
                <AuthProvider>
                    <WebSocketProvider>
                        <UnreadProvider>
                            <RootNavigator />
                        </UnreadProvider>
                    </WebSocketProvider>
                </AuthProvider>
            </NavigationContainer>
        </SafeAreaProvider>
    );
}
