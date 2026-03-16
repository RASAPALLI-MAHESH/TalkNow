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
import { authStyles } from './authStyles';

const OtpVerification = ({ route, navigation } : { route: any, navigation : any }) => {
    const { verifySignupOtp } = useAuth();
    const [otp , setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    
    const email = route?.params?.email || "";
    const Firstname = route?.params?.Firstname || "";

    const normalizedOtp = otp.replace(/\D/g, '').slice(0, 6);
    const otpFilled = normalizedOtp.length === 6;

    const handleVerifyOtp = async () => {
        try {
            setLoading(true);
            await verifySignupOtp(email, normalizedOtp);
            // Passed correctly: now navigate to user creation to setup username & password!
            navigation.navigate("userCreation", { Firstname, email, otp: normalizedOtp });
        } catch (error: any) {
            Alert.alert("Error", getAuthErrorMessage(error, "Invalid OTP. Please try again."));
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
                    <Text style={authStyles.title}>OTP Verification</Text>
                    <Text style={authStyles.subtitle}>Enter the 6-digit code sent to {email}</Text>

                    <Text style={authStyles.label}>OTP</Text>
                    <TextInput
                        placeholder="000000"
                        style={authStyles.input}
                        value={otp}
                        onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 6))}
                        keyboardType="numeric"
                        maxLength={6}
                        returnKeyType="done"
                        onSubmitEditing={() => {
                            if (!loading && otpFilled) void handleVerifyOtp();
                        }}
                    />

                    <Pressable
                        style={[authStyles.button, (!otpFilled || loading) && authStyles.buttonDisabled]}
                        onPress={handleVerifyOtp}
                        disabled={!otpFilled || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={authStyles.buttonText}>Verify OTP</Text>
                        )}
                    </Pressable>

                    <View style={{ marginTop: 14 }}>
                        <Text>
                            Wrong email?{' '}
                            <Text style={authStyles.link} onPress={() => navigation.navigate('SignUp')}>Go back</Text>
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
    )
}
export default OtpVerification;