import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import GlassSurface from './GlassSurface';
import PressableScale from './PressableScale';

type Props = {
    name: keyof typeof Ionicons.glyphMap;
    onPress?: () => void;
    accessibilityLabel: string;
    /** plain: icon only. glass: floats over content. tinted: soft brand fill. */
    variant?: 'plain' | 'glass' | 'tinted';
    color?: string;
    iconSize?: number;
    /** Shows a small tint dot (unread notifications). */
    dot?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    hitSlop?: number;
    testID?: string;
};

/** A 44 pt (48 dp on Android) round icon control. */
const IconButton = ({
    name,
    onPress,
    accessibilityLabel,
    variant = 'plain',
    color,
    iconSize = 22,
    dot = false,
    disabled = false,
    style,
    hitSlop = 6,
    testID,
}: Props) => {
    const s = useStyles();
    const { colors } = useTheme();
    const tint = color ?? (variant === 'tinted' ? colors.tintSoftText : colors.label);

    const icon = (
        <View style={s.iconWrap}>
            <Ionicons name={name} size={iconSize} color={disabled ? colors.disabledLabel : tint} />
            {dot && <View style={s.dot} accessibilityElementsHidden />}
        </View>
    );

    return (
        <PressableScale
            onPress={onPress}
            disabled={disabled}
            hitSlop={hitSlop}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ disabled }}
            testID={testID}
            scaleTo={0.9}
            borderlessRipple
            style={[s.base, variant === 'tinted' && s.tinted, style]}
        >
            {variant === 'glass' ? (
                <GlassSurface variant="floating" interactive style={s.glass}>
                    {icon}
                </GlassSurface>
            ) : (
                icon
            )}
        </PressableScale>
    );
};

const useStyles = makeStyles((t) => ({
    base: {
        width: t.size.touch,
        height: t.size.touch,
        borderRadius: t.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tinted: {
        backgroundColor: t.colors.tintSoft,
    },
    glass: {
        width: t.size.touch,
        height: t.size.touch,
        borderRadius: t.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    dot: {
        position: 'absolute',
        top: -1,
        right: -2,
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: t.colors.unread,
        borderWidth: 1.5,
        borderColor: t.colors.ground,
    },
}));

export default IconButton;
