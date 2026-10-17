import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/* Haptics for moments that change state. Never on scroll, never decorative. */
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
    /** A selection moved: tab, segment, theme swatch. */
    selection: () => {
        if (enabled) Haptics.selectionAsync().catch(() => undefined);
    },
    /** A light confirmation: a message left the composer. */
    light: () => {
        if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    },
    /** Something succeeded that the user waited for: verified, saved. */
    success: () => {
        if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
    /** Something failed or needs attention. */
    warning: () => {
        if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    },
};
