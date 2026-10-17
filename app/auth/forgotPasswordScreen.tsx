import { Button, TextField } from '@/app/components/ui';
import useAuth from '@/hooks/useAuth';
import { getAuthErrorMessage } from '@/services/AuthService';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import AuthScaffold, { AuthFooterLink } from './AuthScaffold';

const ForgotPasswordScreen = ({navigation}: {navigation: any}) => {
    const { forgotPassword } = useAuth();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState(false);

    // Check if the input resembles an email
    const trimmedEmail = email.trim();
    const isValidEmail = /^\S+@\S+\.\S+$/.test(trimmedEmail);

    const handleSendOTP = async () => {
        try {
            setLoading(true);
            await forgotPassword(trimmedEmail); // Passed as email to trigger API
            Alert.alert("Check your email", "If an account exists for this email, we've sent a code.");
            // We pass the email to next screen so the user can use it alongside OTP
            navigation.navigate("changePassword", { email: trimmedEmail });
        } catch (error: any) {
            Alert.alert("Error", getAuthErrorMessage(error, "Failed to send OTP. Please try again."));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthScaffold
            icon="key-outline"
            title="Forgot Password"
            subtitle="Enter your email to receive a reset code."
            onBack={() => navigation.goBack()}
            footer={<AuthFooterLink prompt="Remembered it?" action="Back to Login" onPress={() => navigation.navigate('Login')} />}
        >
            <TextField
                label="Email"
                placeholder="talknow@example.com"
                value={email}
                onChangeText={setEmail}
                onBlur={() => setTouched(true)}
                error={touched && trimmedEmail.length > 0 && !isValidEmail ? "Enter a valid email address." : undefined}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="done"
                onSubmitEditing={() => {
                    if (!loading && isValidEmail) void handleSendOTP();
                }}
                testID="forgot-email"
            />
            <Button title="Send OTP" onPress={handleSendOTP} loading={loading} disabled={!isValidEmail} testID="forgot-submit" />
        </AuthScaffold>
    )
};
export default ForgotPasswordScreen;
