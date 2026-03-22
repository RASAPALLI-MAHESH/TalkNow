import useAuth from '@/hooks/useAuth';
import { getAuthErrorMessage } from '@/services/AuthService';
import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authStyles, AUTH_COLORS } from './authStyles';

const ForgotPasswordScreen = ({navigation}: {navigation: any}) => {
    const { forgotPassword } = useAuth();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    
    // Check if the input resembles an email
    const trimmedEmail = email.trim();
    const isValidEmail = /^\S+@\S+\.\S+$/.test(trimmedEmail);

    const handleSendOTP = async () => {
        try {
            setLoading(true);
            await forgotPassword(trimmedEmail); // Passed as email to trigger API
            Alert.alert("Success", "OTP sent to your email.");
            // We pass the email to next screen so the user can use it alongside OTP
            navigation.navigate("changePassword", { email: trimmedEmail });
        } catch (error: any) {
            Alert.alert("Error", getAuthErrorMessage(error, "Failed to send OTP. Please try again."));
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
                        <Ionicons name="key-outline" size={26} color="#710b8d" />
                    </View>
                    <Text style={authStyles.title}>Forgot Password</Text>
                    <Text style={authStyles.subtitle}>Enter your email to receive a reset code.</Text>

                    <Text style={authStyles.label}>Email</Text>
                    <TextInput
                        placeholder="talknow@example.com"
                        placeholderTextColor={AUTH_COLORS.placeholder}
                        style={authStyles.input}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={() => {
                            if (!loading && isValidEmail) void handleSendOTP();
                        }}
                    />

                    <Pressable
                        style={({ pressed }) => [
                            authStyles.button,
                            pressed && authStyles.buttonPressed,
                            (!isValidEmail || loading) && authStyles.buttonDisabled
                        ]}
                        onPress={handleSendOTP}
                        disabled={!isValidEmail || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={authStyles.buttonText}>Send OTP</Text>
                        )}
                    </Pressable>

                    <View style={authStyles.bottomTextContainer}>
                        <Text style={authStyles.bottomText}>
                            Remembered it?{' '}
                            <Text style={authStyles.link} onPress={() => navigation.navigate('Login')}>Back to Login</Text>
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
    )
};
export default ForgotPasswordScreen;