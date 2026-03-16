import useAuth from "@/hooks/useAuth";
import { getAuthErrorMessage } from "@/services/AuthService";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { authStyles } from "./authStyles";

const LoginScreen = ({navigation} : {navigation : any}) => {
    const { Login } = useAuth();
    const [UserName, setUserName] = useState("");
    const [password , setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const isFormValid = UserName.trim().length > 0 && password.trim().length > 0;

    const handleLogin = async () => {
        try {
            setLoading(true);
            const username = UserName.trim();
            const pwd = password;
            await Login(username, pwd);
            // On success, AuthProvider will automatically re-render and main app navigator will switch to protected route
        } catch (error: any) {
            Alert.alert("Login Failed", getAuthErrorMessage(error, "Please check your credentials and try again."));
        } finally {
            setLoading(false);
        }
    };

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <KeyboardAvoidingView
                style={authStyles.screen}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={authStyles.content} keyboardShouldPersistTaps="handled">
                    <Text style={authStyles.title}>Login</Text>

                    <Text style={authStyles.label}>Username</Text>
                    <TextInput
                        placeholder="Enter username"
                        style={authStyles.input}
                        value={UserName}
                        onChangeText={setUserName}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="next"
                    />

                    <Text style={authStyles.label}>Password</Text>
                    <TextInput
                        placeholder="Enter password"
                        style={authStyles.input}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        returnKeyType="done"
                        onSubmitEditing={() => {
                            if (!loading && isFormValid) void handleLogin();
                        }}
                    />

                    <View style={authStyles.rowBetween}>
                        <Text> </Text>
                        <Text style={authStyles.link} onPress={() => navigation.navigate("forgotPassword")}>Forgot Password?</Text>
                    </View>

                    <Pressable
                        style={[authStyles.button, (!isFormValid || loading) && authStyles.buttonDisabled]}
                        onPress={handleLogin}
                        disabled={!isFormValid || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={authStyles.buttonText}>Login</Text>
                        )}
                    </Pressable>

                    <View style={{ marginTop: 14 }}>
                        <Text>
                            {"Don't have an account? "}
                            <Text style={authStyles.link} onPress={() => navigation.navigate("SignUp")}>Sign Up</Text>
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
    );
}
export default LoginScreen;