import { NavigationContainer } from "@react-navigation/native";
import AuthProvider from "./Context/AuthProvider";
import RootNavigator from "./src/navigation/RootNavigator";

export default function App() {
    return (
        <NavigationContainer>
            <AuthProvider>
                 <RootNavigator />
            </AuthProvider>
        </NavigationContainer>
    );
}
