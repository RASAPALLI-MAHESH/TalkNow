import { CHROME_MAX_FONT_SCALE, makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import PressableScale from './PressableScale';

export type ButtonVariant = 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive';
export type ButtonSize = 'lg' | 'md' | 'sm';

type Props = {
    title: string;
    onPress?: () => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: keyof typeof Ionicons.glyphMap;
    loading?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
    testID?: string;
};

/** Capsule button. One filled button per view; everything else is tinted, gray or plain. */
const Button = ({
    title,
    onPress,
    variant = 'filled',
    size = 'lg',
    icon,
    loading = false,
    disabled = false,
    style,
    accessibilityLabel,
    testID,
}: Props) => {
    const s = useStyles();
    const { colors, dark } = useTheme();
    const inactive = disabled || loading;
    const labelStyle = size === 'lg' ? s.lgLabel : size === 'md' ? s.mdLabel : s.smLabel;

    const fg = (() => {
        if (disabled) return colors.disabledLabel;
        switch (variant) {
            case 'filled':
                return colors.onTint;
            case 'destructive':
                return dark ? colors.danger : colors.onTint;
            case 'tinted':
                return colors.tintSoftText;
            case 'gray':
                return colors.label;
            case 'plain':
                return colors.tintText;
        }
    })();

    return (
        <PressableScale
            onPress={onPress}
            disabled={inactive}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? title}
            accessibilityState={{ disabled: inactive, busy: loading }}
            testID={testID}
            style={[s.base, s[size], s[variant], disabled && variant !== 'plain' && s.disabled, style]}
            pressedStyle={variant === 'filled' ? s.filledPressed : variant === 'destructive' ? s.destructivePressed : s.softPressed}
            ripple={variant === 'filled' || variant === 'destructive' ? 'rgba(255,255,255,0.22)' : undefined}
        >
            {loading ? (
                <ActivityIndicator color={fg} />
            ) : (
                <View style={s.content}>
                    {icon && <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={fg} />}
                    <Text
                        style={[s.label, labelStyle, { color: fg }]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                    >
                        {title}
                    </Text>
                </View>
            )}
        </PressableScale>
    );
};

const useStyles = makeStyles((t) => ({
    base: {
        borderRadius: t.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.sm,
    },
    lg: { minHeight: t.size.control, paddingHorizontal: t.space.xxl },
    md: { minHeight: 40, paddingHorizontal: t.space.lg },
    sm: { minHeight: 32, paddingHorizontal: t.space.md },
    label: { textAlign: 'center' },
    lgLabel: { ...t.type.headline },
    mdLabel: { ...t.type.subhead, fontWeight: '600' },
    smLabel: { ...t.type.footnote, fontWeight: '600' },
    filled: { backgroundColor: t.colors.tint },
    destructive: { backgroundColor: t.dark ? t.colors.dangerSoft : t.colors.danger },
    tinted: { backgroundColor: t.colors.tintSoft },
    gray: { backgroundColor: t.colors.fill },
    plain: { backgroundColor: 'transparent' },
    disabled: { backgroundColor: t.colors.disabledFill },
    filledPressed: { backgroundColor: t.colors.tintPressed },
    destructivePressed: { opacity: 0.85 },
    softPressed: { opacity: 0.7 },
}));

export default Button;
