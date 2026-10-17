import { Button, TextField } from "@/app/components/ui";
import useAuth from "@/hooks/useAuth";
import { getAuthErrorMessage } from "@/services/AuthService";
import { makeStyles } from "@/src/theme";
import { useRef, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import AuthScaffold, { AuthFooterLink } from "./AuthScaffold";

const LoginScreen = ({navigation} : {navigation : any}) => {
    const s = useStyles();
    const { Login } = useAuth();
    const [UserName, setUserName] = useState("");
    const [password , setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const passwordRef = useRef<TextInput>(null);

    const isFormValid = UserName.trim().length > 0 && password.trim().length > 0;

    const handleLogin = async () => {
        try {
            setLoading(true);
            const username = UserName.trim();
            const pwd = password;
            await Login(username, pwd);
        } catch (error: any) {
            Alert.alert("Login Failed", getAuthErrorMessage(error, "Please check your credentials and try again."));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthScaffold
            icon="log-in-outline"
            title="Welcome back"
            subtitle="Enter your details to sign in to your account."
            footer={<AuthFooterLink prompt="Don't have an account?" action="Sign Up" onPress={() => navigation.navigate("SignUp")} />}
        >
            <TextField
                label="Username"
                placeholder="Enter username"
                value={UserName}
                onChangeText={setUserName}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                testID="login-username"
            />
            <TextField
                ref={passwordRef}
                label="Password"
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
                secureToggle
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={() => {
                    if (!loading && isFormValid) void handleLogin();
                }}
                testID="login-password"
            />
            <View style={s.forgotRow}>
                <Text style={s.link} onPress={() => navigation.navigate("forgotPassword")} accessibilityRole="link">
                    Forgot Password?
                </Text>
            </View>
            <Button title="Login" onPress={handleLogin} loading={loading} disabled={!isFormValid} testID="login-submit" />
        </AuthScaffold>
    );
};

const useStyles = makeStyles((t) => ({
    forgotRow: {
        alignItems: 'flex-end',
        marginTop: -t.space.xs,
        marginBottom: t.space.sm,
    },
    link: {
        ...t.type.subhead,
        fontWeight: '600',
        color: t.colors.tintText,
        paddingVertical: t.space.xs,
    },
}));

export default LoginScreen;
