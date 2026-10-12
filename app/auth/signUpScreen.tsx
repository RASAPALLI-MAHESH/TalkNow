import useAuth from "@/hooks/useAuth";
import { getAuthErrorMessage } from "@/services/AuthService";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/services/config";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
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

const SignUpScreen = ({navigation} : {navigation : any}) => {
    const { sendSignupOtp } = useAuth();
    const [name, setname] = useState("");
    const [email, setemail] = useState("");
    const [loading, setLoading] = useState(false);
    
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const isValidEmail = /^\S+@\S+\.\S+$/.test(trimmedEmail);
    const isFormValid = trimmedName !== "" && isValidEmail;

    const handleVerify = async () => {
        try {
            setLoading(true);
            await sendSignupOtp(trimmedEmail);
            navigation.navigate("OtpVerification", { email: trimmedEmail, Firstname: trimmedName });
        }
        catch(error: any) {
            Alert.alert("Sign Up Error", getAuthErrorMessage(error, "Couldn't send OTP. Please try again."));
        } finally {
            setLoading(false);
        }
    }
    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <KeyboardAvoidingView
                style={authStyles.screen}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={authStyles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <View style={authStyles.iconWrap}>
                        <Ionicons name="person-add-outline" size={26} color="#710b8d" />
                    </View>
                    <Text style={authStyles.title}>{"Create an account"}</Text>
                    <Text style={authStyles.subtitle}>Get started by filling out your details below.</Text>

                    <Text style={authStyles.label}>First Name</Text>
                    <TextInput
                        placeholder="Enter your first name"
                        placeholderTextColor={AUTH_COLORS.placeholder}
                        style={authStyles.input}
                        value={name}
                        onChangeText={setname}
                        returnKeyType="next"
                    />

                    <Text style={authStyles.label}>Email</Text>
                    <TextInput
                        placeholder="talknow@example.com"
                        placeholderTextColor={AUTH_COLORS.placeholder}
                        style={authStyles.input}
                        value={email}
                        onChangeText={setemail}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        returnKeyType="done"
                        onSubmitEditing={() => {
                            if (!loading && isFormValid) void handleVerify();
                        }}
                    />

                    <Pressable
                        style={({ pressed }) => [
                            authStyles.button,
                            pressed && authStyles.buttonPressed,
                            (!isFormValid || loading) && authStyles.buttonDisabled
                        ]}
                        onPress={handleVerify}
                        disabled={!isFormValid || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={authStyles.buttonText}>Verify Email</Text>
                        )}
                    </Pressable>

                    {/* The app stores require users to accept the terms before using a chat app. */}
                    <Text style={[authStyles.bottomText, { marginTop: 16, textAlign: 'center' }]}>
                        By continuing, you agree to TalkNow&apos;s{' '}
                        <Text style={authStyles.link} onPress={() => TERMS_URL && Linking.openURL(TERMS_URL).catch(() => {})}>Terms of Use</Text>
                        {' '}and{' '}
                        <Text style={authStyles.link} onPress={() => PRIVACY_POLICY_URL && Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}>Privacy Policy</Text>
                        . There is no tolerance for abusive content or users.
                    </Text>

                    <View style={authStyles.bottomTextContainer}>
                        <Text style={authStyles.bottomText}>
                            Already have an account?{' '}
                            <Text style={authStyles.link} onPress={() => navigation.navigate('Login')}>Login</Text>
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
    );
};
export default SignUpScreen;
