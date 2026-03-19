import useAuth from '@/hooks/useAuth';
import { getAuthErrorMessage } from '@/services/AuthService';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Params = {
    Firstname: string;
    email: string;
    otp: string;
    username: string;
    avatarUri?: string;
};

const PasswordSetup = ({ route, navigation }: { route: { params?: Params }; navigation: any }) => {
    const { signUp } = useAuth();

    const Firstname = String(route?.params?.Firstname ?? '').trim();
    const email = String(route?.params?.email ?? '').trim();
    const otp = String(route?.params?.otp ?? '').trim();
    const username = String(route?.params?.username ?? '').trim();
    const avatarUri = String(route?.params?.avatarUri ?? '').trim();

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
            await signUp(Firstname, email, username, password, otp, avatarUri);
            // Auth state updates in context and RootNavigator takes user to MainTabs.
        } catch (error: any) {
            Alert.alert('Signup failed', getAuthErrorMessage(error, 'Could not create account. Try again.'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <StatusBar barStyle="dark-content" backgroundColor="#f7f9fe" />
            <SafeAreaView style={styles.safe}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                    <KeyboardAvoidingView
                        style={styles.safe}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <ScrollView
                            contentContainerStyle={styles.content}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            <LinearGradient
                                colors={['#eef8ff', '#f7f9fe']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.hero}
                            >
                                <Text style={styles.title}>Secure your account</Text>
                                <Text style={styles.subtitle}>Create a strong password for @{username}</Text>
                            </LinearGradient>

                            <View style={styles.card}>
                                <Text style={styles.label}>Password</Text>
                                <TextInput
                                    style={styles.input}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    placeholder="Enter password"
                                    placeholderTextColor="#96a0b1"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="next"
                                />

                                <Text style={styles.label}>Confirm password</Text>
                                <TextInput
                                    style={styles.input}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry
                                    placeholder="Re-enter password"
                                    placeholderTextColor="#96a0b1"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="done"
                                    onSubmitEditing={() => {
                                        if (!loading && formValid) {
                                            void onSubmit();
                                        }
                                    }}
                                />

                                <View style={styles.ruleList}>
                                    <Text style={[styles.rule, rules.hasMinLength && styles.ruleOk]}>- At least 6 characters</Text>
                                    <Text style={[styles.rule, rules.hasUpper && styles.ruleOk]}>- One uppercase letter</Text>
                                    <Text style={[styles.rule, rules.hasNumber && styles.ruleOk]}>- One number</Text>
                                    <Text style={[styles.rule, rules.matches && styles.ruleOk]}>- Passwords must match</Text>
                                </View>
                            </View>

                            <View style={styles.footerButtons}>
                                <Pressable
                                    onPress={() => navigation.goBack()}
                                    style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
                                >
                                    <Text style={styles.backText}>Back</Text>
                                </Pressable>

                                <Pressable
                                    onPress={onSubmit}
                                    disabled={!formValid || loading}
                                    style={({ pressed }) => [
                                        styles.continueButton,
                                        (!formValid || loading) && styles.continueButtonDisabled,
                                        pressed && styles.pressed,
                                    ]}
                                >
                                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.continueText}>Create Account</Text>}
                                </Pressable>
                            </View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </TouchableWithoutFeedback>
            </SafeAreaView>
        </>
    );
};

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#f7f9fe',
    },
    content: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 36,
    },
    hero: {
        borderRadius: 20,
        paddingHorizontal: 18,
        paddingVertical: 18,
        borderWidth: 1,
        borderColor: '#e6edf9',
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1b1f2a',
        letterSpacing: -0.3,
    },
    subtitle: {
        marginTop: 8,
        color: '#5b6473',
        fontSize: 15,
    },
    card: {
        marginTop: 22,
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e6ef',
        padding: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: '#2b3240',
        marginBottom: 8,
    },
    input: {
        height: 52,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#d8dde8',
        backgroundColor: '#f9fbff',
        paddingHorizontal: 14,
        fontSize: 16,
        color: '#1f2430',
        marginBottom: 14,
    },
    ruleList: {
        marginTop: 2,
        backgroundColor: '#f6f8fc',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5eaf2',
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 4,
    },
    rule: {
        color: '#7a8598',
        fontSize: 12,
        fontWeight: '600',
    },
    ruleOk: {
        color: '#0d7f4d',
    },
    footerButtons: {
        marginTop: 'auto',
        flexDirection: 'row',
        gap: 12,
    },
    backButton: {
        flex: 1,
        height: 52,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#edf0f5',
    },
    continueButton: {
        flex: 2,
        height: 52,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0d4d47',
    },
    continueButtonDisabled: {
        backgroundColor: '#90aaa7',
    },
    backText: {
        color: '#4f596a',
        fontSize: 16,
        fontWeight: '700',
    },
    continueText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    pressed: {
        opacity: 0.85,
    },
});

export default PasswordSetup;
