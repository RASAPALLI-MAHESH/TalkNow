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
                <ScrollView contentContainerStyle={authStyles.content} keyboardShouldPersistTaps="handled">
                    <Text style={authStyles.title}>{"Welcome! Let's get started."}</Text>
                    <Text style={authStyles.subtitle}>Verify your email to create an account.</Text>

                    <Text style={authStyles.label}>First Name</Text>
                    <TextInput
                        placeholder="Enter your first name"
                        style={authStyles.input}
                        value={name}
                        onChangeText={setname}
                        returnKeyType="next"
                    />

                    <Text style={authStyles.label}>Email</Text>
                    <TextInput
                        placeholder="talknow@example.com"
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
                        style={[authStyles.button, (!isFormValid || loading) && authStyles.buttonDisabled]}
                        onPress={handleVerify}
                        disabled={!isFormValid || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={authStyles.buttonText}>Verify Email</Text>
                        )}
                    </Pressable>

                    <View style={{ marginTop: 14 }}>
                        <Text>
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
