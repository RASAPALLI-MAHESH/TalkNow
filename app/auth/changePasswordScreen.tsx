import useAuth from '@/hooks/useAuth';
import { getAuthErrorMessage } from '@/services/AuthService';
import { useState } from 'react';
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

const ChangePasswordScreen = ({ route, navigation }: {route: any, navigation: any}) => {
    const { resetPassword } = useAuth();
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);

    // Retrieve email passed from forgotPassword Screen
    const email = route?.params?.email || "";

    const normalizedOtp = otp.replace(/\D/g, '');
    const isFormValid = normalizedOtp.length === 6 && newPassword.length >= 6 && newPassword === confirmPassword && email.length > 0;

    const handleResetPassword = async () => {
        try {
            setLoading(true);
            await resetPassword(email, normalizedOtp, newPassword);
            Alert.alert("Success", "Password updated successfully. Please login.");
            navigation.navigate("Login");
        } catch (error: any) {
            Alert.alert("Error", getAuthErrorMessage(error, "Failed to reset password. Check OTP and try again."));
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
                    <Text style={authStyles.title}>Reset Password</Text>
                    <Text style={authStyles.subtitle}>Enter the 6-digit code sent to your email.</Text>

                    <Text style={authStyles.label}>OTP</Text>
                    <TextInput
                        placeholder="123456"
                        style={authStyles.input}
                        value={otp}
                        onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 6))}
                        keyboardType="numeric"
                        maxLength={6}
                        returnKeyType="next"
                    />

                    <Text style={authStyles.label}>New Password</Text>
                    <TextInput
                        placeholder="At least 6 characters"
                        style={authStyles.input}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry
                        returnKeyType="next"
                    />

                    <Text style={authStyles.label}>Confirm Password</Text>
                    <TextInput
                        placeholder="Re-enter new password"
                        style={authStyles.input}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                        returnKeyType="done"
                        onSubmitEditing={() => {
                            if (!loading && isFormValid) void handleResetPassword();
                        }}
                    />

                    <Pressable
                        style={[authStyles.button, (!isFormValid || loading) && authStyles.buttonDisabled]}
                        onPress={handleResetPassword}
                        disabled={!isFormValid || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={authStyles.buttonText}>Change Password</Text>
                        )}
                    </Pressable>

                    <View style={{ marginTop: 14 }}>
                        <Text>
                            <Text style={authStyles.link} onPress={() => navigation.navigate('Login')}>Back to Login</Text>
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
    );
}
export default ChangePasswordScreen;
