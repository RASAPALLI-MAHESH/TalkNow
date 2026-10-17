import { DarkTheme, DefaultTheme, type Theme as NavTheme } from '@react-navigation/native';
import { colors } from './tokens';
import type { Scheme } from './ThemeProvider';

/** React Navigation theme, so native screens, headers and transitions share the ground colour. */
export const navigationTheme = (scheme: Scheme): NavTheme => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    const c = colors[scheme];
    return {
        ...base,
        colors: {
            ...base.colors,
            primary: c.tintText,
            background: c.ground,
            card: c.ground,
            text: c.label,
            border: c.separator,
            notification: c.unread,
        },
    };
};
