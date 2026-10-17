import { Button, TextField } from "@/app/components/ui";
import useAuth from "@/hooks/useAuth";
import { getAuthErrorMessage } from "@/services/AuthService";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/services/config";
import { makeStyles } from "@/src/theme";
import { useRef, useState } from "react";
import { Alert, Linking, Text, TextInput } from "react-native";
import AuthScaffold, { AuthFooterLink } from "./AuthScaffold";

const SignUpScreen = ({navigation} : {navigation : any}) => {
    const s = useStyles();
    const { sendSignupOtp } = useAuth();
    const [name, setname] = useState("");
    const [email, setemail] = useState("");
    const [loading, setLoading] = useState(false);
    const [emailTouched, setEmailTouched] = useState(false);
    const emailRef = useRef<TextInput>(null);

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
        <AuthScaffold
            icon="person-add-outline"
            title="Create an account"
            subtitle="Get started by filling out your details below."
            onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
            step={{ step: 1, of: 4 }}
            footer={
                <>
                    {/* The app stores require users to accept the terms before using a chat app. */}
                    <Text style={s.legal}>
                        By continuing, you agree to TalkNow&apos;s{' '}
                        <Text style={s.link} accessibilityRole="link" onPress={() => TERMS_URL && Linking.openURL(TERMS_URL).catch(() => {})}>Terms of Use</Text>
                        {' '}and{' '}
                        <Text style={s.link} accessibilityRole="link" onPress={() => PRIVACY_POLICY_URL && Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}>Privacy Policy</Text>
                        . There is no tolerance for abusive content or users.
                    </Text>
                    <AuthFooterLink prompt="Already have an account?" action="Login" onPress={() => navigation.navigate('Login')} />
                </>
            }
        >
            <TextField
                label="First Name"
                placeholder="Enter your first name"
                value={name}
                onChangeText={setname}
                autoComplete="given-name"
                textContentType="givenName"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                testID="signup-name"
            />
            <TextField
                ref={emailRef}
                label="Email"
                placeholder="talknow@example.com"
                value={email}
                onChangeText={setemail}
                onBlur={() => setEmailTouched(true)}
                error={emailTouched && trimmedEmail.length > 0 && !isValidEmail ? "Enter a valid email address." : undefined}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={() => {
                    if (!loading && isFormValid) void handleVerify();
                }}
                testID="signup-email"
            />
            <Button title="Verify Email" onPress={handleVerify} loading={loading} disabled={!isFormValid} style={s.submit} testID="signup-submit" />
        </AuthScaffold>
    );
};

const useStyles = makeStyles((t) => ({
    submit: {
        marginTop: t.space.sm,
    },
    legal: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
        textAlign: 'center',
    },
    link: {
        color: t.colors.tintText,
        fontWeight: '600',
    },
}));

export default SignUpScreen;
