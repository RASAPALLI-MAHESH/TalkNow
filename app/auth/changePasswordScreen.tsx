import { Button, TextField } from '@/app/components/ui';
import useAuth from '@/hooks/useAuth';
import { getAuthErrorMessage } from '@/services/AuthService';
import { makeStyles } from '@/src/theme';
import { useRef, useState } from 'react';
import { Alert, Text, TextInput } from 'react-native';
import AuthScaffold, { AuthFooterLink } from './AuthScaffold';
import OtpCodeField from './OtpCodeField';
import { useResendCooldown } from './useResendCooldown';

const ChangePasswordScreen = ({ route, navigation }: {route: any, navigation: any}) => {
    const s = useStyles();
    const { resetPassword, forgotPassword } = useAuth();
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const cooldown = useResendCooldown();
    const newRef = useRef<TextInput>(null);
    const confirmRef = useRef<TextInput>(null);

    // Retrieve email passed from forgotPassword Screen
    const email = route?.params?.email || "";

    const normalizedOtp = otp.replace(/\D/g, '');
    const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
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

    const handleResend = async () => {
        if (!cooldown.ready || resending || !email) return;
        try {
            setResending(true);
            await forgotPassword(email);
            cooldown.restart();
            setOtp("");
        } catch (error: any) {
            Alert.alert("Couldn't resend", getAuthErrorMessage(error, "Please try again in a moment."));
        } finally {
            setResending(false);
        }
    };

    return (
        <AuthScaffold
            icon="lock-closed-outline"
            title="Reset Password"
            subtitle="Enter the 6-digit code sent to your email."
            onBack={() => navigation.goBack()}
            footer={<AuthFooterLink action="Back to Login" onPress={() => navigation.navigate('Login')} />}
        >
            <OtpCodeField value={otp} onChange={setOtp} onComplete={() => newRef.current?.focus()} testID="reset-otp" />
            <Text style={s.resend} accessibilityLiveRegion="polite">
                {cooldown.ready ? (
                    <Text style={s.link} onPress={() => void handleResend()} accessibilityRole="button">
                        {resending ? 'Sending…' : 'Send a new code'}
                    </Text>
                ) : (
                    `You can request a new code in ${cooldown.left}s`
                )}
            </Text>
            <TextField
                ref={newRef}
                label="New Password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChangeText={setNewPassword}
                secureToggle
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                helper={newPassword.length > 0 && newPassword.length < 6 ? "Use at least 6 characters." : undefined}
            />
            <TextField
                ref={confirmRef}
                label="Confirm Password"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureToggle
                autoComplete="new-password"
                textContentType="newPassword"
                error={mismatch ? "Passwords don't match." : undefined}
                returnKeyType="done"
                onSubmitEditing={() => {
                    if (!loading && isFormValid) void handleResetPassword();
                }}
            />
            <Button title="Change Password" onPress={handleResetPassword} loading={loading} disabled={!isFormValid} />
        </AuthScaffold>
    );
};

const useStyles = makeStyles((t) => ({
    resend: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
        textAlign: 'center',
    },
    link: {
        color: t.colors.tintText,
        fontWeight: '600',
    },
}));

export default ChangePasswordScreen;
