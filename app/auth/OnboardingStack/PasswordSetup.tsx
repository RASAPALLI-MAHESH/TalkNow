import { Button, TextField } from '@/app/components/ui';
import useAuth from '@/hooks/useAuth';
import { getAuthErrorMessage } from '@/services/AuthService';
import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import AuthScaffold from '../AuthScaffold';

type Params = {
    Firstname: string;
    email: string;
    otp: string;
    username: string;
    avatarUri?: string;
    profilePicture?: string;
};

const Rule = ({ ok, label }: { ok: boolean; label: string }) => {
    const s = useStyles();
    const { colors } = useTheme();
    return (
        <View style={s.rule} accessible accessibilityLabel={`${label}, ${ok ? 'done' : 'not yet'}`}>
            <Ionicons
                name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={ok ? colors.success : colors.tertiaryLabel}
            />
            <Text style={[s.ruleText, ok && s.ruleTextOk]}>{label}</Text>
        </View>
    );
};

const PasswordSetup = ({ route, navigation }: { route: { params?: Params }; navigation: any }) => {
    const s = useStyles();
    const { signUp } = useAuth();
    const confirmRef = useRef<TextInput>(null);

    const Firstname = String(route?.params?.Firstname ?? '').trim();
    const email = String(route?.params?.email ?? '').trim();
    const otp = String(route?.params?.otp ?? '').trim();
    const username = String(route?.params?.username ?? '').trim();
    const avatarUri = String(route?.params?.avatarUri ?? '').trim();
    const profilePicture = String(route?.params?.profilePicture ?? avatarUri).trim();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const rules = useMemo(() => {
        const hasMinLength = password.length >= 6;
        const hasUpper = /[A-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        const matches = password.length > 0 && password === confirmPassword;
        return { hasMinLength, hasUpper, hasNumber, matches };
    }, [password, confirmPassword]);

    const formValid =
        username.length >= 3 &&
        otp.length === 6 &&
        rules.hasMinLength &&
        rules.hasUpper &&
        rules.hasNumber &&
        rules.matches;

    const onSubmit = async () => {
        if (!Firstname || !email || !username || otp.length !== 6) {
            Alert.alert('Session expired', 'Please restart signup from email verification.');
            navigation.navigate('SignUp');
            return;
        }

        if (!formValid) {
            Alert.alert('Check details', 'Please satisfy all password rules before continuing.');
            return;
        }

        try {
            setLoading(true);
            await signUp(Firstname, email, username, password, otp, profilePicture);
            // Auth state updates in context and RootNavigator takes user to MainTabs.
        } catch (error: any) {
            Alert.alert('Signup failed', getAuthErrorMessage(error, 'Could not create account. Try again.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthScaffold
            icon="shield-checkmark-outline"
            title="Secure your account"
            subtitle={<>Create a strong password for <Text style={s.handle}>@{username}</Text></>}
            onBack={() => navigation.goBack()}
            step={{ step: 4, of: 4 }}
        >
            <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureToggle
                placeholder="Enter password"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                testID="onboarding-password"
            />
            <TextField
                ref={confirmRef}
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureToggle
                placeholder="Re-enter password"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={() => {
                    if (!loading && formValid) {
                        void onSubmit();
                    }
                }}
            />

            <View style={s.rules}>
                <Rule ok={rules.hasMinLength} label="At least 6 characters" />
                <Rule ok={rules.hasUpper} label="One uppercase letter" />
                <Rule ok={rules.hasNumber} label="One number" />
                <Rule ok={rules.matches} label="Passwords must match" />
            </View>

            <View style={s.footerButtons}>
                <Button title="Back" variant="gray" onPress={() => navigation.goBack()} style={s.back} />
                <Button title="Create Account" onPress={() => void onSubmit()} loading={loading} disabled={!formValid} style={s.next} />
            </View>
        </AuthScaffold>
    );
};

const useStyles = makeStyles((t) => ({
    handle: {
        color: t.colors.label,
        fontWeight: '600',
    },
    rules: {
        borderRadius: t.radius.lg,
        backgroundColor: t.colors.surface,
        paddingHorizontal: t.space.lg,
        paddingVertical: t.space.md,
        gap: t.space.sm,
    },
    rule: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.sm,
    },
    ruleText: {
        ...t.type.subhead,
        color: t.colors.secondaryLabel,
    },
    ruleTextOk: {
        color: t.colors.label,
    },
    footerButtons: {
        marginTop: t.space.sm,
        flexDirection: 'row',
        gap: t.space.md,
    },
    back: {
        flex: 1,
    },
    next: {
        flex: 2,
    },
}));

export default PasswordSetup;
