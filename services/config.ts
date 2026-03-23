import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * In Expo development, hostUri often looks like: "192.168.1.10:8082".
 * Using this IP helps physical devices reach your backend on the same machine.
 */
const inferDevServerBaseUrl = (): string | null => {
    const hostUri = (Constants as any)?.expoConfig?.hostUri as string | undefined;
    if (!hostUri || typeof hostUri !== 'string') return null;

    const host = hostUri.split(':')[0]?.trim();
    if (!host || host === 'localhost' || host === '127.0.0.1') return null;

    return `https://talknow-nd2i.onrender.com`;
};

/**
 * Determines the base API URL based on environment.
 * Prioritizes:
 * 1. EXPO_PUBLIC_API_URL environment variable
 * 2. Inferred dev server IP (if in __DEV__)
 * 3. Emulator loopback (if in __DEV__)
 * 4. Production fallback
 */
export const getDefaultApiUrl = (): string => {
    // 1. Explicit environment variable (highest priority)
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
        return envUrl.trim();
    }

    // 2. Fallbacks for development mode
    if (__DEV__) {
        const inferred = inferDevServerBaseUrl();
        if (inferred) return inferred;

        // Android emulator loopback to host machine
        if (Platform.OS === 'android') return 'https://talknow-nd2i.onrender.com';
        return 'https://talknow-nd2i.onrender.com';
    }

    // 3. Final Production Fallback
    // This ensures that even if environment variables are missing in a release build,
    // we don't try to call localhost or emulator loopbacks.
    return 'https://talknow-nd2i.onrender.com';
};

/**
 * Normalizes the API URL to be the root origin (without /api/auth or trailing slashes).
 */
export const normalizeApiOrigin = (rawUrl: string): string => {
    const trimmed = rawUrl.trim().replace(/\/$/, '');
    const withoutAuth = trimmed.replace(/\/?api\/?auth\/?$/i, '').replace(/\/?api\/?$/i, '');
    return withoutAuth.replace(/\/$/, '');
};

/**
 * Derives the WebSocket URL from the API URL.
 */
export const deriveWsUrl = (): string => {
    const explicit = process.env.EXPO_PUBLIC_WS_URL;
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

    const api = getDefaultApiUrl();
    const origin = normalizeApiOrigin(api);

    const wsOrigin = origin.startsWith('https://')
        ? origin.replace(/^https:\/\//i, 'wss://')
        : origin.startsWith('http://')
            ? origin.replace(/^http:\/\//i, 'ws://')
            : origin;

    return `${wsOrigin}/ws`;
};

export const API_URL = getDefaultApiUrl();
export const API_ORIGIN = normalizeApiOrigin(API_URL);
export const WS_URL = deriveWsUrl();
