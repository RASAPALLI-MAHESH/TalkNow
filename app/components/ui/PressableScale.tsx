/**
 * PressableScale: the base of every tappable control.
 * A short spring scale on press (iOS-style), the native ripple on Android,
 * and an optional pressed style. Respects Reduce Motion through the spring config.
 */
import { PRESS_SCALE, spring, useTheme } from '@/src/theme';
import React, { useState } from 'react';
import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
    style?: StyleProp<ViewStyle>;
    pressedStyle?: StyleProp<ViewStyle>;
    /** Scale while pressed; 1 disables it (e.g. full-width list rows). */
    scaleTo?: number;
    /** Android ripple colour; false turns the ripple off. */
    ripple?: string | false;
    borderlessRipple?: boolean;
    children?: React.ReactNode;
};

const PressableScale = ({
    style,
    pressedStyle,
    scaleTo = PRESS_SCALE,
    ripple,
    borderlessRipple = false,
    onPressIn,
    onPressOut,
    disabled,
    children,
    ...rest
}: PressableScaleProps) => {
    const { colors } = useTheme();
    const scale = useSharedValue(1);
    const [pressed, setPressed] = useState(false);

    const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const androidRipple =
        Platform.OS === 'android' && ripple !== false
            ? { color: ripple ?? colors.ripple, borderless: borderlessRipple, foreground: true }
            : undefined;

    return (
        <AnimatedPressable
            {...rest}
            disabled={disabled}
            android_ripple={androidRipple}
            onPressIn={(e) => {
                if (scaleTo !== 1) scale.value = withSpring(scaleTo, spring.press);
                setPressed(true);
                onPressIn?.(e);
            }}
            onPressOut={(e) => {
                if (scaleTo !== 1) scale.value = withSpring(1, spring.press);
                setPressed(false);
                onPressOut?.(e);
            }}
            style={[style, pressed && !disabled && pressedStyle, animated]}
        >
            {children}
        </AnimatedPressable>
    );
};

export default PressableScale;
