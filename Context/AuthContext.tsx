import { createContext } from "react";

export type AuthUser = {
    id?: string;
    username?: string;
    email?: string;
    [key: string]: unknown;
};

interface AuthContextType {
    user: AuthUser | null;
    loading: boolean;
    sendSignupOtp: (email: string) => Promise<void>;
    verifySignupOtp: (email: string, otp: string) => Promise<void>;
    signUp: (Firstname: string, email: string, username: string, password: string, otp: string, profilePicture?: string) => Promise<void>;
    Login: (username: string, password: string) => Promise<void>;
    Logout: () => Promise<void>;
    forgotPassword: (email: string) => Promise<void>;
    resetPassword: (email: string, otp: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);