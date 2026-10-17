import { isLiquidGlassAvailable } from 'expo-glass-effect';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, useColorScheme } from 'react-native';
import { colors, radius, size, space, type, type Colors } from './tokens';

export type Scheme = 'light' | 'dark';

/**
 * How glass is drawn on this device:
 * - liquid: Apple Liquid Glass (iOS 26+), through expo-glass-effect
 * - blur:   system material blur (older iOS, web)
 * - solid:  near-opaque tinted fill (Android, and whenever Reduce Transparency is on)
 */
export type GlassMode = 'liquid' | 'blur' | 'solid';

export type StyleTheme = {
    scheme: Scheme;
    dark: boolean;
    colors: Colors;
    type: typeof type;
    space: typeof space;
    radius: typeof radius;
    size: typeof size;
};

export type Theme = StyleTheme & { glass: GlassMode };

const styleThemes: Record<Scheme, StyleTheme> = {
    light: { scheme: 'light', dark: false, colors: colors.light, type, space, radius, size },
    dark: { scheme: 'dark', dark: true, colors: colors.dark, type, space, radius, size },
};

const LIQUID = Platform.OS === 'ios' && isLiquidGlassAvailable();

const glassModeFor = (reduceTransparency: boolean): GlassMode => {
    if (reduceTransparency) return 'solid';
    if (LIQUID) return 'liquid';
    if (Platform.OS === 'ios' || Platform.OS === 'web') return 'blur';
    return 'solid';
};

const ThemeContext = createContext<Theme>({ ...styleThemes.light, glass: glassModeFor(false) });

/** Follows the system appearance and the Reduce Transparency setting. */
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const scheme: Scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
    const [reduceTransparency, setReduceTransparency] = useState(false);

    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        let mounted = true;
        AccessibilityInfo.isReduceTransparencyEnabled()
            .then((on) => mounted && setReduceTransparency(on))
            .catch(() => undefined);
        const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
        return () => {
            mounted = false;
            sub.remove();
        };
    }, []);

    const value = useMemo<Theme>(
        () => ({ ...styleThemes[scheme], glass: glassModeFor(reduceTransparency) }),
        [scheme, reduceTransparency]
    );
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

/**
 * Builds a themed StyleSheet hook. The factory runs once per appearance and
 * the result is cached, so components pay nothing on re-render.
 *
 *   const useStyles = makeStyles((t) => ({ title: { color: t.colors.label } }));
 *   const s = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: StyleTheme) => T) {
    const cache: Partial<Record<Scheme, T>> = {};
    return function useStyles(): T {
        const { scheme } = useTheme();
        let styles = cache[scheme];
        if (!styles) {
            styles = StyleSheet.create(factory(styleThemes[scheme]));
            cache[scheme] = styles;
        }
        return styles;
    };
}
