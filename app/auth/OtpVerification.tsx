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
            navigation.navigate("AvatarandAge", { Firstname, email, otp: normalizedOtp });
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
                <ScrollView contentContainerStyle={authStyles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <View style={authStyles.iconWrap}>
                        <Ionicons name="mail-open-outline" size={26} color="#710b8d" />
                    </View>
                    <Text style={authStyles.title}>OTP Verification</Text>
                    <Text style={authStyles.subtitle}>Enter the 6-digit code sent to {email}</Text>

                    <Text style={authStyles.label}>OTP Code</Text>
                    <TextInput
                        placeholder="000000"
                        placeholderTextColor={AUTH_COLORS.placeholder}
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
                        style={({ pressed }) => [
                            authStyles.button,
                            pressed && authStyles.buttonPressed,
                            (!otpFilled || loading) && authStyles.buttonDisabled
                        ]}
                        onPress={handleVerifyOtp}
                        disabled={!otpFilled || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={authStyles.buttonText}>Verify OTP</Text>
                        )}
                    </Pressable>

                    <View style={authStyles.bottomTextContainer}>
                        <Text style={authStyles.bottomText}>
                            Wrong email?{' '}
                            <Text style={authStyles.link} onPress={() => navigation.navigate('SignUp')}>Go back</Text>
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
    )
};
export default OtpVerification;