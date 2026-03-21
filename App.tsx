import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthProvider from "./Context/AuthProvider";
import { UnreadProvider } from "./Context/UnreadContext";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
    return (
        <SafeAreaProvider>
            <NavigationContainer>
                <AuthProvider>
                    <UnreadProvider>
                        <RootNavigator />
                    </UnreadProvider>
                </AuthProvider>
            </NavigationContainer>
        </SafeAreaProvider>
    );
}
