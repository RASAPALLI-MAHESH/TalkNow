//imports
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import changePasswordScreen from "../../app/auth/changePasswordScreen";
import forgotPasswordScreen from "../../app/auth/forgotPasswordScreen";
import LoginScreen from "../../app/auth/loginScreen";
import otpVerificationScreen from "../../app/auth/OtpVerification";
import SignUpScreen from "../../app/auth/signUpScreen";
import userCreationScreen from "../../app/auth/UserCreation";
type AuthStackParamList = {
    Login: undefined;
    SignUp: undefined;
    changePassword: { email: string };
    forgotPassword: undefined;
    userCreation : { Firstname: string; email: string; otp: string };
    OtpVerification : { email: string; Firstname: string };
}
const Stack = createNativeStackNavigator<AuthStackParamList>();
const AuthNavigator = () =>
{
    return(
        <Stack.Navigator screenOptions={{headerTitleAlign : "center"}}>
            <Stack.Screen name="Login" component={LoginScreen} options={{title : "Login"}} />
            <Stack.Screen name="SignUp" component={SignUpScreen} options={{title : "Sign Up"}} />
            <Stack.Screen name="changePassword" component={changePasswordScreen} options={{title : "Change Password"}} />
            <Stack.Screen name="forgotPassword" component={forgotPasswordScreen} options={{title : "Forgot Password"}} />
            <Stack.Screen name="userCreation" component={userCreationScreen} options={{title : "User Creation"}} />
            <Stack.Screen name="OtpVerification" component={otpVerificationScreen} options={{title : "OTP Verification"}} />
        </Stack.Navigator>
    )
}
export default AuthNavigator;