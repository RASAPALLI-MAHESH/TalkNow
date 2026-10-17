// This file talks to the backend to handle authentication related tasks such as login, logout, and registration.
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_URL } from './config';

// API_URL is now imported from ./config

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

const ACCESS_TOKEN_KEY = 'userToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const setTokens = async (token?: string, refreshToken?: string) => {
    if (token) await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
    if (refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
};

// A small copy of the signed-in user, so the app can open without a network.
const CACHED_USER_KEY = 'cachedUser';

const cacheUser = async (user: unknown) => {
    const u = (user ?? {}) as Record<string, unknown>;
    if (!u.id) return;
    const picture = typeof u.profilePicture === 'string' ? u.profilePicture : '';
    const small = {
        id: String(u.id),
        username: typeof u.username === 'string' ? u.username : undefined,
        Firstname: typeof u.Firstname === 'string' ? u.Firstname : undefined,
        // SecureStore values should stay under 2 KB: keep URLs, never inline image data.
        profilePicture: picture.length < 500 ? picture : '',
    };
    try {
        await SecureStore.setItemAsync(CACHED_USER_KEY, JSON.stringify(small));
    } catch {
        // Caching is best-effort.
    }
};

const readCachedUser = async (): Promise<AuthUser | null> => {
    try {
        const raw = await SecureStore.getItemAsync(CACHED_USER_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed?.id ? parsed : null;
    } catch {
        return null;
    }
};

const clearToken = async () => {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(CACHED_USER_KEY);
};

// Set by AuthProvider so a dead session also signs the user out of the UI.
let onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
    onUnauthorized = handler;
};

const signOutLocally = async () => {
    await clearToken();
    onUnauthorized?.();
};

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Swaps the refresh token for a new access token (the server also rotates the refresh token).
 * Concurrent callers share one request: the server treats a reused refresh token as stolen.
 * Resolves null and signs out when the session is gone; throws on network errors so an
 * offline device keeps its tokens.
 */
export const refreshAccessToken = (): Promise<string | null> => {
    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
            if (!refreshToken) {
                await signOutLocally();
                return null;
            }
            try {
                // Plain axios, not `client`, so this request never goes through the interceptors below.
                const response = await axios.post(`${client.defaults.baseURL}/refresh`, { refreshToken }, { timeout: 10000 });
                await setTokens(response.data?.token, response.data?.refreshToken);
                return typeof response.data?.token === 'string' ? response.data.token : null;
            } catch (error) {
                if (axios.isAxiosError(error) && error.response?.status === 401) {
                    await signOutLocally();
                    return null;
                }
                throw error;
            }
        })().finally(() => {
            refreshInFlight = null;
        });
    }
    return refreshInFlight;
};

const ACCESS_TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

const accessTokenExpiresSoon = (token: string) => {
    try {
        const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
        return typeof payload?.exp === 'number' && payload.exp * 1000 - Date.now() < ACCESS_TOKEN_REFRESH_MARGIN_MS;
    } catch {
        return false;
    }
};

/** The stored access token, refreshed first if it is about to expire. Null when signed out. */
export const getFreshAccessToken = async (): Promise<string | null> => {
    const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    if (!token) return null;
    if (!accessTokenExpiresSoon(token)) return token;
    try {
        return await refreshAccessToken();
    } catch {
        // Offline: send the current token and let the server decide.
        return token;
    }
};

// Request interceptor to attach JWT token to headers securely
client.interceptors.request.use(async (config) => {
    const token = await getFreshAccessToken();
    if (token) {
        // Axios v1 types may represent headers as AxiosHeaders; mutate in-place.
        (config.headers as any) = config.headers ?? {};
        (config.headers as any).Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

// Response interceptor: on a rejected access token, refresh once and retry; sign out if the session is gone.
client.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error?.response?.status;
        const config = error?.config;
        const hadToken = !!config?.headers?.Authorization;
        if (status !== 401 || !hadToken) return Promise.reject(error);

        if (config._retriedAfterRefresh) {
            await signOutLocally();
            return Promise.reject(error);
        }
        config._retriedAfterRefresh = true;

        let token: string | null;
        try {
            token = await refreshAccessToken();
        } catch {
            return Promise.reject(error);
        }
        if (!token) return Promise.reject(error);
        return client(config);
    }
);

export const login = async (username: string, password: string): Promise<AuthResponse> => {
    const response = await client.post('/login', { username, password });
    await setTokens(response.data.token, response.data.refreshToken);
    await cacheUser(response.data.user);
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
    await setTokens(response.data.token, response.data.refreshToken);
    await cacheUser(response.data.user);
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
        const user = response.data?.user ?? response.data ?? null;
        await cacheUser(user);
        return user;
    } catch (err: any) {
        if (err?.response?.status === 401) {
            await clearToken();
        }
        // Offline or server unreachable: open with the cached user and let requests retry.
        if (!err?.response) {
            const cached = await readCachedUser();
            if (cached) return cached;
        }
        throw err;
    }
};

export const getUserProfile = async (userId: string): Promise<any> => {
    const response = await client.get(`/profile/${encodeURIComponent(userId)}`);
    return response.data;
};

export const updateProfile = async (data: any): Promise<any> => {
    const response = await client.put('/updateProfile', data);
    return response.data;
};

export const logout = async (): Promise<void> => {
    try {
        // Must run before the token is cleared so the server can revoke this session.
        await client.post('/logout');
    } catch (e) {
        // Safe to ignore if server unreachable
    }
    await clearToken();
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
    unreadCount?: number;
};

// History rows are metadata: only legacy (pre-encryption) messages carry text.
export type ConversationMessageDto = {
    id: string;
    encrypted?: boolean;
    text?: string;
    sender: 'me' | 'other';
    status?: 'sending' | 'sent' | 'delivered' | 'read';
    clientId?: string;
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

/* End-to-end encryption: key bundles and the pending envelope queue. */

const keysUrl = (path: string) => `${String(client.defaults.baseURL).replace(/\/auth$/, '/keys')}${path}`;

export type EnvelopeDto = {
    type: 'prekey' | 'whisper';
    body: string;
    registrationId: number;
    recipientRegistrationId: number;
};

export type PendingMessageDto = { id: string; from: string; to: string; envelope: EnvelopeDto; resendOf?: string; date: string };
export type SessionResetDto = { id: string; from: string; messageIds: string[]; date: string };

export type KeyUploadDto = {
    registrationId: number;
    identityKey: string;
    identityDhKey: string;
    identityDhSignature: string;
    signedPreKey: { keyId: number; publicKey: string; signature: string };
    oneTimePreKeys: { keyId: number; publicKey: string }[];
};

export type OwnKeyStatusDto = {
    registrationId: number;
    identityKey: string;
    identityDhKey: string;
    signedPreKey: { keyId: number; createdAt: string };
    oneTimePreKeyCount: number;
};

/** Null when this account has no keys on the server yet. */
export const getOwnKeyStatus = async (): Promise<OwnKeyStatusDto | null> => {
    try {
        return (await client.get(keysUrl('/me'))).data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
    }
};

export const uploadKeys = async (bundle: KeyUploadDto): Promise<{ oneTimePreKeyCount: number; identityChanged: boolean }> =>
    (await client.put(keysUrl(''), bundle)).data;

export const addOneTimePreKeys = async (
    registrationId: number,
    oneTimePreKeys: KeyUploadDto['oneTimePreKeys']
): Promise<{ added: number; oneTimePreKeyCount: number }> =>
    (await client.post(keysUrl('/prekeys'), { registrationId, oneTimePreKeys })).data;

export const rotateSignedPreKey = async (registrationId: number, signedPreKey: KeyUploadDto['signedPreKey']): Promise<void> => {
    await client.put(keysUrl('/signed-prekey'), { registrationId, signedPreKey });
};

/** A contact's bundle (one one-time prekey is used up per call). */
export const getPreKeyBundle = async (userId: string): Promise<any> =>
    (await client.get(keysUrl(`/${encodeURIComponent(userId)}`))).data;

export const getPendingMessages = async (
    limit = 100
): Promise<{ messages: PendingMessageDto[]; resets: SessionResetDto[]; hasMore: boolean }> =>
    (await client.get('/messages/pending', { params: { limit } })).data;

export const acknowledgeMessages = async (ids: string[], resetIds: string[] = []): Promise<void> => {
    await client.post('/messages/ack', { ids, resetIds });
};

/** The oldest app version the server still accepts. No sign-in needed. */
export const getMinAppVersion = async (): Promise<string | null> => {
    const url = String(client.defaults.baseURL).replace(/\/auth$/, '/health');
    const response = await axios.get(url, { timeout: 10000 });
    return typeof response.data?.minAppVersion === 'string' ? response.data.minAppVersion : null;
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

export const getUnreadMessageCount = async (): Promise<{ totalUnread: number }> => {
    const response = await client.get('/messages/unread-count');
    return response.data;
};

export const deleteNotification = async (notificationId: string): Promise<{ ok: boolean }> => {
    const response = await client.delete(`/notifications/${encodeURIComponent(notificationId)}`);
    return response.data;
};

export type BlockedUserDto = { id: string; username: string; profilePicture?: string };

export const blockUser = async (targetUserId: string): Promise<AuthResponse> => {
    const response = await client.post('/users/block', { targetUserId });
    return response.data;
};

export const unblockUser = async (targetUserId: string): Promise<AuthResponse> => {
    const response = await client.post('/users/unblock', { targetUserId });
    return response.data;
};

export const getBlockedUsers = async (): Promise<{ users: BlockedUserDto[] }> => {
    const response = await client.get('/users/blocked');
    return response.data;
};

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'impersonation' | 'other';

export const reportUser = async (targetUserId: string, reason: ReportReason, details: string): Promise<AuthResponse> => {
    const response = await client.post('/reports', { targetUserId, reason, details });
    return response.data;
};

export const registerPushToken = async (token: string): Promise<void> => {
    await client.post('/push-token', { token });
};

/** Permanently deletes the account, then clears this device's tokens. */
export const deleteAccount = async (password: string): Promise<void> => {
    await client.delete('/account', { data: { password } });
    await clearToken();
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
    getNotifications,
    getUnreadNotificationCount,
    getUnreadMessageCount,
    deleteNotification,
    getUserProfile,
    updateProfile,
    blockUser,
    unblockUser,
    getBlockedUsers,
    reportUser,
    registerPushToken,
    deleteAccount,
};

export default AuthService;