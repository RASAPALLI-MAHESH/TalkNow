/**
 * GlassSurface: the one material for TalkNow's navigation layer.
 *
 * Used only for chrome that floats over content: navigation bars, the tab
 * capsule, the composer, sheets and floating controls. Never for list rows,
 * message bubbles or text containers.
 *
 * Rendering follows the device (see GlassMode in the theme):
 *   liquid  Apple Liquid Glass via expo-glass-effect (iOS 26+)
 *   blur    system material via expo-blur plus a thin brand-tinted overlay
 *   solid   near-opaque tinted fill (Android, Reduce Transparency)
 *
 * `revealed` (0..1) lets a bar stay clear at rest and gather material as
 * content scrolls beneath it.
 */
import { makeStyles, useTheme } from '@/src/theme';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import React, { useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedProps,
    useAnimatedReaction,
    useAnimatedStyle,
    type SharedValue,
} from 'react-native-reanimated';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export type GlassVariant = 'bar' | 'floating' | 'sheet';

type Props = ViewProps & {
    variant?: GlassVariant;
    /** 0 = clear, 1 = full material. Omit for always-on glass. */
    revealed?: SharedValue<number>;
    /** Liquid Glass reacts to touch (buttons, the tab capsule). */
    interactive?: boolean;
    /** Optional tint for Liquid Glass, e.g. a selected control. */
    tintColor?: string;
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
};

const BLUR_INTENSITY: Record<GlassVariant, number> = { bar: 70, floating: 60, sheet: 90 };

const GlassSurface = ({ variant = 'bar', revealed, interactive, tintColor, style, children, ...rest }: Props) => {
    const theme = useTheme();
    const s = useStyles();
    const { glass, dark, colors } = theme;

    // Liquid Glass animates its own appearance; it only needs to know on or off.
    const [liquidOn, setLiquidOn] = useState(!revealed);
    useAnimatedReaction(
        () => (revealed ? revealed.value > 0.5 : true),
        (on, prev) => {
            if (glass === 'liquid' && on !== prev) runOnJS(setLiquidOn)(on);
        },
        [glass]
    );

    const materialStyle = useAnimatedStyle(() => ({ opacity: revealed ? revealed.value : 1 }));
    const blurProps = useAnimatedProps(() => ({
        intensity: (revealed ? revealed.value : 1) * BLUR_INTENSITY[variant],
    }));

    const edged = variant !== 'bar';
    const shape = [edged && s.edge, style];

    if (glass === 'liquid') {
        return (
            <GlassView
                {...rest}
                glassEffectStyle={{ style: liquidOn ? 'regular' : 'none', animate: true, animationDuration: 0.25 }}
                isInteractive={interactive}
                tintColor={tintColor}
                colorScheme={dark ? 'dark' : 'light'}
                style={style}
            >
                {children}
            </GlassView>
        );
    }

    const blurTint =
        Platform.OS === 'ios'
            ? dark
                ? 'systemChromeMaterialDark'
                : 'systemChromeMaterialLight'
            : dark
                ? 'dark'
                : 'light';

    return (
        <View {...rest} style={[s.clip, shape]}>
            {glass === 'blur' ? (
                <>
                    <AnimatedBlurView
                        tint={blurTint}
                        animatedProps={blurProps}
                        style={StyleSheet.absoluteFill}
                    />
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            StyleSheet.absoluteFill,
                            // Sheets hold forms and long text: keep them nearly opaque for legibility.
                            { backgroundColor: variant === 'sheet' ? colors.glassSolid : colors.glassOverlay },
                            materialStyle,
                        ]}
                    />
                </>
            ) : (
                <Animated.View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: variant === 'sheet' ? colors.surfaceRaised : colors.glassSolid },
                        materialStyle,
                    ]}
                />
            )}
            {edged && <View pointerEvents="none" style={s.highlight} />}
            {children}
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    clip: {
        overflow: 'hidden',
    },
    edge: {
        borderWidth: t.size.hairline,
        borderColor: t.colors.glassHairline,
    },
    // A one-point specular line along the top edge: reads as a material, not a box.
    highlight: {
        position: 'absolute',
        top: 0,
        left: 12,
        right: 12,
        height: 1,
        backgroundColor: t.colors.glassHighlight,
        opacity: t.dark ? 0.6 : 1,
    },
}));

export default GlassSurface;
