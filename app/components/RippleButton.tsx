/**
 * RippleButton.tsx — Cross-platform ripple-from-touch-point button
 *
 * Android: TouchableNativeFeedback with Ripple (exact touch-point origin)
 * iOS:     TouchableOpacity with opacity pulse (native feel)
 *
 * Usage:
 *   <RippleButton onPress={...} style={...}>
 *     <Text>Tap me</Text>
 *   </RippleButton>
 */

import React, { memo } from 'react';
import {
    Platform,
    TouchableNativeFeedback,
    TouchableOpacity,
    View,
    type StyleProp,
    type ViewStyle,
    type GestureResponderEvent,
} from 'react-native';

type RippleButtonProps = {
    children: React.ReactNode;
    onPress?: (event: GestureResponderEvent) => void;
    onLongPress?: (event: GestureResponderEvent) => void;
    style?: StyleProp<ViewStyle>;
    /** Ripple colour (Android). Defaults to purple tint. */
    rippleColor?: string;
    /** If true the ripple has no bounding circle (for icon buttons). */
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
    rippleColor = 'rgba(103,51,208,0.22)',
    borderless = false,
    disabled = false,
    hitSlop,
    accessibilityLabel,
    accessibilityRole = 'button',
}: RippleButtonProps) => {
    if (Platform.OS === 'android') {
        return (
            <TouchableNativeFeedback
                onPress={disabled ? undefined : onPress}
                onLongPress={disabled ? undefined : onLongPress}
                background={TouchableNativeFeedback.Ripple(rippleColor, borderless)}
                useForeground
                disabled={disabled}
                hitSlop={hitSlop as any}
                accessible
                accessibilityLabel={accessibilityLabel}
                accessibilityRole={accessibilityRole}
            >
                {/* TouchableNativeFeedback requires exactly one View child */}
                <View style={style}>{children}</View>
            </TouchableNativeFeedback>
        );
    }

    // iOS — opacity feedback
    return (
        <TouchableOpacity
            onPress={disabled ? undefined : onPress}
            onLongPress={disabled ? undefined : onLongPress}
            activeOpacity={0.62}
            style={style}
            disabled={disabled}
            hitSlop={hitSlop as any}
            accessible
            accessibilityLabel={accessibilityLabel}
            accessibilityRole={accessibilityRole}
        >
            {children}
        </TouchableOpacity>
    );
};

export default memo(RippleButton);
