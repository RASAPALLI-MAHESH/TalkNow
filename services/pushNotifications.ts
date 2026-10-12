import { navigationRef } from '@/src/navigation/navigationRef';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { registerPushToken } from './AuthService';

// While the app is open, chats and badges update live, so don't also show a banner.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
    }),
});

/**
 * Asks for permission and sends this device's Expo push token to the server.
 * Does nothing on simulators, when permission is denied, or without an EAS project id.
 * On Android it needs FCM credentials configured in EAS.
 */
const registerForPushNotifications = async () => {
    if (!Device.isDevice) return;

    if (Platform.OS === 'android') {
        // The server sends to this channel id.
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Messages',
            importance: Notifications.AndroidImportance.HIGH,
        });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token);
};

// The notification that opened the app is reported again on later calls; open it once.
let lastHandledResponseId: string | null = null;

const openFromNotification = (response: Notifications.NotificationResponse, attempt = 0) => {
    const id = response.notification.request.identifier;
    if (id === lastHandledResponseId) return;
    if (!navigationRef.isReady()) {
        if (attempt < 10) setTimeout(() => openFromNotification(response, attempt + 1), 300);
        return;
    }
    lastHandledResponseId = id;

    const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
    if (data.type === 'message' && typeof data.peerId === 'string') {
        navigationRef.navigate('Chatroom', {
            peerId: data.peerId,
            peerUsername: typeof data.peerUsername === 'string' ? data.peerUsername : 'Chat',
            peerAvatar: typeof data.peerAvatar === 'string' ? data.peerAvatar : '',
        });
    } else if (data.type === 'notifications') {
        navigationRef.navigate('Notifications');
    }
};

/** While signed in: register for push and open the right screen when a notification is tapped. */
export const usePushNotifications = (signedIn: boolean) => {
    useEffect(() => {
        if (!signedIn) return;
        registerForPushNotifications().catch((err) => console.log('push registration failed:', err?.message ?? err));
    }, [signedIn]);

    useEffect(() => {
        if (!signedIn) return;
        const subscription = Notifications.addNotificationResponseReceivedListener((r) => openFromNotification(r));
        Notifications.getLastNotificationResponseAsync()
            .then((r) => {
                if (r) openFromNotification(r);
            })
            .catch(() => {});
        return () => subscription.remove();
    }, [signedIn]);
};
