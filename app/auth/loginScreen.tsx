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
import { Ionicons } from "@expo/vector-icons";
import { authStyles, AUTH_COLORS } from "./authStyles";

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
                <ScrollView contentContainerStyle={authStyles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <View style={authStyles.iconWrap}>
                        <Ionicons name="log-in-outline" size={28} color="#710b8d" />
                    </View>
                    <Text style={authStyles.title}>Welcome back</Text>
                    <Text style={authStyles.subtitle}>Enter your details to sign in to your account.</Text>

                    <Text style={authStyles.label}>Username</Text>
                    <TextInput
                        placeholder="Enter username"
                        placeholderTextColor={AUTH_COLORS.placeholder}
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
                        placeholderTextColor={AUTH_COLORS.placeholder}
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
                        style={({ pressed }) => [
                            authStyles.button,
                            pressed && authStyles.buttonPressed,
                            (!isFormValid || loading) && authStyles.buttonDisabled
                        ]}
                        onPress={handleLogin}
                        disabled={!isFormValid || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={authStyles.buttonText}>Login</Text>
                        )}
                    </Pressable>

                    <View style={authStyles.bottomTextContainer}>
                        <Text style={authStyles.bottomText}>
                            {"Don't have an account? "}
                            <Text style={authStyles.link} onPress={() => navigation.navigate("SignUp")}>Sign Up</Text>
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
    );
};
export default LoginScreen;