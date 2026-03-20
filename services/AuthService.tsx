// This file talks to the backend to handle authentication related tasks such as login, logout, and registration.
import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const inferDevServerBaseUrl = (): string | null => {
    // In Expo dev, hostUri often looks like: "192.168.1.10:8082".
    // Using this IP helps physical devices reach your backend on the same machine.
    const hostUri = (Constants as any)?.expoConfig?.hostUri as string | undefined;
    if (!hostUri || typeof hostUri !== 'string') return null;

    const host = hostUri.split(':')[0]?.trim();
    if (!host || host === 'localhost' || host === '127.0.0.1') return null;

    return `http://${host}:8080`;
};

const getDefaultApiUrl = (): string => {
    // Prefer explicit configuration.
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (typeof envUrl === 'string' && envUrl.trim().length > 0) return envUrl.trim();

    // Expo dev: infer from host URI.
    const inferred = inferDevServerBaseUrl();
    if (inferred) return inferred;

    // Emulator defaults.
    if (Platform.OS === 'android') return 'http://10.0.2.2:8080';
    return 'http://localhost:8080';
};

const API_URL = getDefaultApiUrl();

export type AuthUser = {
    id?: string;
    username?: string;
    email?: string;
    [key: string]: unknown;
};

export type AuthResponse = {
    user?: AuthUser;
    token?: string;
    message?: string;
    [key: string]: unknown;
};

export const getAuthErrorMessage = (error: unknown, fallbackMessage: string) => {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as any;
        const serverMessage = typeof data?.message === 'string' ? data.message : '';

        // Some endpoints return a generic `message` with a more specific `error`.
        // Prefer the specific error so users get actionable feedback.
        const detailedError = typeof data?.error === 'string' ? data.error : '';
        const genericServerMessage = serverMessage.trim().toLowerCase();
        if (
            detailedError.trim().length > 0 &&
            (genericServerMessage === 'server error' || genericServerMessage === 'internal server error')
        ) {
            return detailedError;
        }

        if (serverMessage.trim().length > 0) return serverMessage;

        // No response usually means network / DNS / CORS / wrong API URL.
        if (!error.response) {
            if ((error as any)?.code === 'ECONNABORTED') {
                return 'Request timed out. Check your connection and try again.';
            }
            const base = typeof client?.defaults?.baseURL === 'string' ? client.defaults.baseURL : '';
            const suffix = base ? ` (using ${base})` : '';
            return `Unable to reach the server${suffix}. Check your internet connection and API URL.`;
        }

        if (status === 429) return 'Too many attempts. Please wait and try again.';
        if (status && status >= 500) return 'Server error. Please try again in a moment.';
    }

    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return fallbackMessage;
};

const client = axios.create({
    baseURL: '',
    timeout: 10000,
});

const withHttpScheme = (raw: string) => {
    const trimmed = raw.trim().replace(/\/$/, '');
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    const looksLocal =
        /^localhost\b/i.test(trimmed) ||
        /^127\.0\.0\.1\b/.test(trimmed) ||
        /^\d{1,3}(?:\.\d{1,3}){3}\b/.test(trimmed);
    return `${looksLocal ? 'http' : 'https'}://${trimmed}`;
};

const upgradeHttpToHttpsForRemote = (url: string) => {
    if (
        url.startsWith('http://') &&
        !url.includes('localhost') &&
        !url.includes('127.0.0.1') &&
        !/:\d+$/.test(url)
    ) {
        return `https://${url.slice('http://'.length)}`;
    }
    return url;
};

const stripRemoteHttpsPort8080 = (url: string) => {
    // Render serves HTTPS on 443 externally; including :8080 breaks clients.
    return url.replace(/^(https:\/\/[^/]+):8080(\/|$)/i, '$1$2');
};

const normalizeAuthBaseUrl = (rawUrl: string) => {
    const base = stripRemoteHttpsPort8080(upgradeHttpToHttpsForRemote(withHttpScheme(rawUrl)));
    const trimmed = base.replace(/\/$/, '');
    if (trimmed.endsWith('/api/auth')) return trimmed;
    if (trimmed.endsWith('/api')) return `${trimmed}/auth`;
    return `${trimmed}/api/auth`;
};

client.defaults.baseURL = normalizeAuthBaseUrl(API_URL);

// Request interceptor to attach JWT token to headers securely
client.interceptors.request.use(async (config) => {
    const token = await SecureStore.getItemAsync('userToken');
    if (token) {
        // Axios v1 types may represent headers as AxiosHeaders; mutate in-place.
        (config.headers as any) = config.headers ?? {};
        (config.headers as any).Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

const setToken = async (token?: string) => {
    if (token) {
        await SecureStore.setItemAsync('userToken', token);
    }
};

const clearToken = async () => {
    await SecureStore.deleteItemAsync('userToken');
};

// Response interceptor: if a token is rejected, clear it so the app can recover cleanly.
client.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error?.response?.status;
        if (status === 401) {
            await clearToken();
        }
        return Promise.reject(error);
    }
);

export const login = async (username: string, password: string): Promise<AuthResponse> => {
    const response = await client.post('/login', { username, password });
    await setToken(response.data.token);
    return response.data;
};

export const sendSignupOtp = async (email: string): Promise<AuthResponse> => {
    const response = await client.post('/send-signup-otp', { email });
    return response.data;
};

export const verifySignupOtp = async (email: string, otp: string): Promise<AuthResponse> => {
    const response = await client.post('/verify-signup-otp', { email, otp });
    return response.data;
};

export const checkUsernameAvailability = async (username: string): Promise<{ available: boolean; message?: string }> => {
    try {
        const response = await client.get('/check-username', {
            params: { username: username.trim() },
        });
        return response.data;
    } catch (error: any) {
        // Backward compatibility: if server is not yet updated with this endpoint,
        // don't block onboarding. Validation still runs on final /signup.
        if (Number(error?.response?.status) === 404) {
            return { available: true, message: 'Username check endpoint unavailable; continuing with signup validation.' };
        }
        throw error;
    }
};

export const signUp = async (
    Firstname: string,
    email: string,
    username: string,
    password: string,
    otp: string,
    profilePicture?: string
): Promise<AuthResponse> => {
    const response = await client.post('/signup', {
        Firstname,
        email,
        username,
        password,
        otp,
        profilePicture,
    });
    await setToken(response.data.token);
    return response.data;
};

export const forgotPassword = async (email: string): Promise<AuthResponse> => {
    const response = await client.post('/forgot-password', { email });
    return response.data;
};

export const resetPassword = async (email: string, otp: string, newPassword: string): Promise<AuthResponse> => {
    const response = await client.post('/reset-password', { email, otp, newPassword });
    return response.data;
};

export const getCurrentUser = async (): Promise<AuthUser | null> => {
    const token = await SecureStore.getItemAsync('userToken');
    if (!token) return null;
    
    // Calls the newly protected /profile endpoint
    try {
        const response = await client.get('/profile');
        return response.data?.user ?? response.data ?? null;
    } catch (err: any) {
        if (err?.response?.status === 401) {
            await clearToken();
        }
        throw err;
    }
};

export const logout = async (): Promise<void> => {
    await clearToken();
    try {
        await client.post('/logout');
    } catch (e) {
        // Safe to ignore if server unreachable
    }
};

export const followUser = async (targetUserId: string): Promise<AuthResponse> => {
    const response = await client.post('/follow', { targetUserId });
    return response.data;
};

export const unfollowUser = async (targetUserId: string): Promise<AuthResponse> => {
    const response = await client.post('/unfollow', { targetUserId });
    return response.data;
};

export const acceptFollowRequest = async (
    notificationId?: string,
    requesterUserId?: string
): Promise<AuthResponse> => {
    const response = await client.post('/follow/accept', {
        notificationId,
        requesterUserId,
    });
    return response.data;
};

export const rejectFollowRequest = async (
    notificationId?: string,
    requesterUserId?: string
): Promise<AuthResponse> => {
    const response = await client.post('/follow/reject', {
        notificationId,
        requesterUserId,
    });
    return response.data;
};

export type MutualConnectionDto = {
    id: string;
    username: string;
    profilePicture?: string;
    message?: string;
};

export type ChatInboxDto = {
    id: string;
    username: string;
    profilePicture?: string;
    lastMessage: string;
    date?: string;
    conversationKey?: string;
};

export type ConversationMessageDto = {
    id: string;
    text: string;
    sender: 'me' | 'other';
    from?: string;
    to?: string;
    createdAt: string;
};

export const getMutualConnections = async (q?: string): Promise<{ connections: MutualConnectionDto[] }> => {
    const response = await client.get('/connections/mutual', {
        params: q && q.trim().length > 0 ? { q: q.trim() } : undefined,
    });
    return response.data;
};

export const getConnectionCounters = async (): Promise<{ counters: { mutual: number; pending: number; chatActive: number } }> => {
    const response = await client.get('/connections/counters');
    return response.data;
};

export const getChatInbox = async (): Promise<{ chats: ChatInboxDto[] }> => {
    const response = await client.get('/chats/inbox');
    return response.data;
};

export const getConversationMessages = async (
    peerId: string,
    before?: string
): Promise<{ messages: ConversationMessageDto[] }> => {
    const response = await client.get(`/messages/with/${encodeURIComponent(peerId)}`, {
        params: before ? { before } : undefined,
    });
    return response.data;
};

export const sendMessageToUser = async (
    toUserId: string,
    content: string
): Promise<{ message: unknown }> => {
    const response = await client.post('/messages/send', { toUserId, content });
    return response.data;
};

export type NotificationDto = {
    id: string;
    username: string;
    profilePicture?: string;
    message: string;
    createdAt?: string;
    type?: string;
    fromUserId?: string;
};

export const getNotifications = async (): Promise<{ notifications: NotificationDto[] }> => {
    const response = await client.get('/notifications');
    return response.data;
};

export const getUnreadNotificationCount = async (sinceIso: string): Promise<{ unread: number }> => {
    const response = await client.get('/notifications/unread-count', { params: { since: sinceIso } });
    return response.data;
};

export const deleteNotification = async (notificationId: string): Promise<{ ok: boolean }> => {
    const response = await client.delete(`/notifications/${encodeURIComponent(notificationId)}`);
    return response.data;
};

const AuthService = {
    login,
    signUp,
    forgotPassword,
    resetPassword,
    getCurrentUser,
    logout,
    sendSignupOtp,
    verifySignupOtp,
    checkUsernameAvailability,
    followUser,
    unfollowUser,
    acceptFollowRequest,
    rejectFollowRequest,
    getMutualConnections,
    getConnectionCounters,
    getChatInbox,
    getConversationMessages,
    sendMessageToUser,
    getNotifications,
    getUnreadNotificationCount,
    deleteNotification,
};

export default AuthService;