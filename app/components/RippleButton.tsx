/**
 * RippleButton.tsx: kept for existing call sites; now a thin wrapper over the
 * design system's PressableScale.
 *
 * Android: native ripple from the touch point.
 * iOS:     a short spring scale (no opacity flash).
 */

import React, { memo } from 'react';
import { type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import PressableScale from './ui/PressableScale';

type RippleButtonProps = {
    children: React.ReactNode;
    onPress?: (event: GestureResponderEvent) => void;
    onLongPress?: (event: GestureResponderEvent) => void;
    style?: StyleProp<ViewStyle>;
    /** Ripple colour (Android). Defaults to the theme's ripple. */
    rippleColor?: string;
    /** If true the ripple has no bounding box (for icon buttons). */
    borderless?: boolean;
    disabled?: boolean;
    hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
    accessibilityLabel?: string;
    accessibilityRole?: 'button' | 'link' | 'none';
};

const RippleButton = ({
    children,
    onPress,
    onLongPress,
    style,
    rippleColor,
    borderless = false,
    disabled = false,
    hitSlop,
    accessibilityLabel,
    accessibilityRole = 'button',
}: RippleButtonProps) => (
    <PressableScale
        onPress={disabled ? undefined : onPress}
        onLongPress={disabled ? undefined : onLongPress}
        disabled={disabled}
        hitSlop={hitSlop}
        ripple={rippleColor}
        borderlessRipple={borderless}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ disabled }}
        style={style}
    >
        {children}
    </PressableScale>
);

export default memo(RippleButton);
