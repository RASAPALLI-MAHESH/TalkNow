import AuthService from '@/services/AuthService';
import React, { useEffect, useMemo, useState } from 'react';
import { AuthContext, AuthUser } from './AuthContext';

const AuthProvider = ({children} : {children : React.ReactNode}) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(()  => {
        let isMounted = true;

        const checkUser = async () => {
            try {
                const currentUser = await AuthService.getCurrentUser();
                if (isMounted) {
                    setUser(currentUser);
                }
            } catch {
                if (isMounted) {
                    setUser(null);
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }
        checkUser();
        return () => {
            isMounted = false;
        };
    }, []);
    const Login = async (username: string, password: string) => {
        const data = await AuthService.login(username, password);
        setUser((data.user as AuthUser | undefined) ?? null);
    };

    const Logout = async () => {
        await AuthService.logout();
        setUser(null);
    };

    const sendSignupOtp = async (email: string) => {
        await AuthService.sendSignupOtp(email);
    };

    const verifySignupOtp = async (email: string, otp: string) => {
        await AuthService.verifySignupOtp(email, otp);
    };

    const signUp = async (Firstname: string, email: string, username: string, password: string, otp: string, profilePicture?: string) => {
        const data = await AuthService.signUp(Firstname, email, username, password, otp, profilePicture);
        setUser((data.user as AuthUser | undefined) ?? null);
    };

    const forgotPassword = async (email: string) => {
        await AuthService.forgotPassword(email);
    };

    const resetPassword = async (email: string, otp: string, newPassword: string) => {
        await AuthService.resetPassword(email, otp, newPassword);
    };

    const value = useMemo(
        () => ({
            user,
            loading,
            Login,
            Logout,
            sendSignupOtp,
            verifySignupOtp,
            signUp,
            forgotPassword,
            resetPassword,
        }),
        [user, loading]
    );

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;
