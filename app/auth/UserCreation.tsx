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

const UserCreation = ({ route, navigation }: {route: any, navigation: any}) => {
    const { signUp } = useAuth();
    const [username , setUserName] = useState("");
    const [password , setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    // Retrieve verified data passed down the stack
    const Firstname = route?.params?.Firstname || "";
    const email = route?.params?.email || "";
    const otp = route?.params?.otp || "";

    const trimmedUsername = username.trim();
    const isFormValid = trimmedUsername.length > 0 && password.trim().length >= 6 && email.length > 0 && otp.length === 6;

    const handleCreateAccount = async () => {
        try {
            setLoading(true);
            // This finally hits `/api/auth/signup` and sets the user into global context (triggering Home Screen)
            await signUp(Firstname, email, trimmedUsername, password, otp);
        } catch (error: any) {
            Alert.alert("Error Creating Account", getAuthErrorMessage(error, "Couldn't create your account. Please try again."));
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
                    <Text style={authStyles.title}>Final Step</Text>
                    <Text style={authStyles.subtitle}>Pick a username and password to finish.</Text>

                    <Text style={authStyles.label}>Username</Text>
                    <TextInput
                        placeholder="e.g. tech_guru99"
                        style={authStyles.input}
                        value={username}
                        onChangeText={setUserName}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="next"
                    />

                    <Text style={authStyles.label}>Password</Text>
                    <TextInput
                        placeholder="At least 6 characters"
                        style={authStyles.input}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        returnKeyType="done"
                        onSubmitEditing={() => {
                            if (!loading && isFormValid) void handleCreateAccount();
                        }}
                    />

                    <Pressable
                        style={[authStyles.button, (!isFormValid || loading) && authStyles.buttonDisabled]}
                        onPress={handleCreateAccount}
                        disabled={!isFormValid || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={authStyles.buttonText}>Complete Account</Text>
                        )}
                    </Pressable>

                    <View style={{ marginTop: 14 }}>
                        <Text>
                            Need to change email?{' '}
                            <Text style={authStyles.link} onPress={() => navigation.navigate('SignUp')}>Go back</Text>
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
    )
}
export default UserCreation;