import { Button } from '@/app/components/ui';
import useAuth from '@/hooks/useAuth';
import { getAuthErrorMessage } from '@/services/AuthService';
import { makeStyles } from '@/src/theme';
import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import AuthScaffold, { AuthFooterLink } from './AuthScaffold';
import OtpCodeField from './OtpCodeField';
import { useResendCooldown } from './useResendCooldown';

const OtpVerification = ({ route, navigation } : { route: any, navigation : any }) => {
    const s = useStyles();
    const { verifySignupOtp, sendSignupOtp } = useAuth();
    const [otp , setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const cooldown = useResendCooldown();

    const email = route?.params?.email || "";
    const Firstname = route?.params?.Firstname || "";

    const normalizedOtp = otp.replace(/\D/g, '').slice(0, 6);
    const otpFilled = normalizedOtp.length === 6;

    const handleVerifyOtp = async (code = normalizedOtp) => {
        if (loading || code.length !== 6) return;
        try {
            setLoading(true);
            await verifySignupOtp(email, code);
            navigation.navigate("AvatarandAge", { Firstname, email, otp: code });
        } catch (error: any) {
            Alert.alert("Error", getAuthErrorMessage(error, "Invalid OTP. Please try again."));
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (!cooldown.ready || resending || !email) return;
        try {
            setResending(true);
            await sendSignupOtp(email);
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
            icon="mail-open-outline"
            title="OTP Verification"
            subtitle={<>Enter the 6-digit code sent to <Text style={s.email}>{email}</Text></>}
            onBack={() => navigation.goBack()}
            step={{ step: 2, of: 4 }}
            footer={<AuthFooterLink prompt="Wrong email?" action="Go back" onPress={() => navigation.navigate('SignUp')} />}
        >
            <OtpCodeField value={otp} onChange={setOtp} onComplete={(code) => void handleVerifyOtp(code)} testID="otp-input" />
            <Text style={s.resend} accessibilityLiveRegion="polite">
                {cooldown.ready ? (
                    <Text style={s.link} onPress={() => void handleResend()} accessibilityRole="button">
                        {resending ? 'Sending…' : 'Send a new code'}
                    </Text>
                ) : (
                    `You can request a new code in ${cooldown.left}s`
                )}
            </Text>
            <Button title="Verify OTP" onPress={() => void handleVerifyOtp()} loading={loading} disabled={!otpFilled} testID="otp-submit" />
        </AuthScaffold>
    )
};

const useStyles = makeStyles((t) => ({
    email: {
        color: t.colors.label,
        fontWeight: '600',
    },
    resend: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
        textAlign: 'center',
        marginBottom: t.space.sm,
    },
    link: {
        color: t.colors.tintText,
        fontWeight: '600',
    },
}));

export default OtpVerification;
