import { makeStyles, timing, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type Props = Omit<TextInputProps, 'style'> & {
    label?: string;
    /** Shown under the field; replaced by `error` when present. */
    helper?: string;
    error?: string;
    /** Success message in place of the helper (e.g. "Username is available"). */
    success?: string;
    icon?: keyof typeof Ionicons.glyphMap;
    /** Fixed text before the value, e.g. "@". */
    prefix?: string;
    /** Adds a show/hide control for passwords. */
    secureToggle?: boolean;
    trailing?: React.ReactNode;
    containerStyle?: StyleProp<ViewStyle>;
};

/** Labelled text field. Border tints on focus; errors are spoken by screen readers. */
const TextField = forwardRef<TextInput, Props>(function TextField(
    {
        label,
        helper,
        error,
        success,
        icon,
        prefix,
        secureToggle = false,
        secureTextEntry,
        trailing,
        containerStyle,
        onFocus,
        onBlur,
        editable = true,
        ...input
    },
    ref
) {
    const s = useStyles();
    const { colors } = useTheme();
    const [hidden, setHidden] = useState(!!secureTextEntry || secureToggle);
    const focus = useSharedValue(0);
    const invalid = useSharedValue(error ? 1 : 0);

    useEffect(() => {
        invalid.value = withTiming(error ? 1 : 0, timing());
    }, [error, invalid]);

    const frame = useAnimatedStyle(() => ({
        borderColor:
            invalid.value > 0.5
                ? colors.danger
                : interpolateColor(focus.value, [0, 1], [colors.separator, colors.tintText]),
    }));

    const message = error || success || helper;

    return (
        <View style={[s.wrap, containerStyle]}>
            {!!label && (
                <Text style={s.label} nativeID={input.nativeID ? `${input.nativeID}-label` : undefined}>
                    {label}
                </Text>
            )}
            <Animated.View style={[s.field, !editable && s.fieldDisabled, frame]}>
                {icon && <Ionicons name={icon} size={18} color={error ? colors.danger : colors.tertiaryLabel} style={s.icon} />}
                {!!prefix && <Text style={s.prefix}>{prefix}</Text>}
                <TextInput
                    ref={ref}
                    {...input}
                    editable={editable}
                    secureTextEntry={secureToggle ? hidden : secureTextEntry}
                    placeholderTextColor={colors.placeholder}
                    selectionColor={colors.tintText}
                    cursorColor={colors.tintText}
                    accessibilityLabel={input.accessibilityLabel ?? label}
                    accessibilityHint={error || helper}
                    onFocus={(e) => {
                        focus.value = withTiming(1, timing(160));
                        onFocus?.(e);
                    }}
                    onBlur={(e) => {
                        focus.value = withTiming(0, timing(160));
                        onBlur?.(e);
                    }}
                    style={s.input}
                />
                {secureToggle && (
                    <Pressable
                        onPress={() => setHidden((h) => !h)}
                        hitSlop={10}
                        style={s.toggle}
                        accessibilityRole="button"
                        accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
                    >
                        <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.secondaryLabel} />
                    </Pressable>
                )}
                {trailing}
            </Animated.View>
            {!!message && (
                <Text
                    style={[s.message, error ? s.error : success ? s.success : null]}
                    accessibilityLiveRegion={error ? 'polite' : 'none'}
                >
                    {message}
                </Text>
            )}
        </View>
    );
});

const useStyles = makeStyles((t) => ({
    wrap: {
        width: '100%',
    },
    label: {
        ...t.type.footnote,
        fontWeight: '600',
        color: t.colors.secondaryLabel,
        marginBottom: t.space.sm,
        marginLeft: t.space.xs,
    },
    field: {
        minHeight: t.size.control,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: t.radius.md,
        borderWidth: 1.5,
        backgroundColor: t.colors.surface,
        paddingHorizontal: t.space.lg,
    },
    fieldDisabled: {
        opacity: 0.6,
    },
    icon: {
        marginRight: t.space.sm,
    },
    prefix: {
        ...t.type.body,
        color: t.colors.secondaryLabel,
        marginRight: 1,
    },
    input: {
        flex: 1,
        ...t.type.body,
        color: t.colors.label,
        paddingVertical: t.space.md,
        minHeight: t.size.control - 3,
    },
    toggle: {
        marginLeft: t.space.sm,
        padding: t.space.xs,
    },
    message: {
        ...t.type.footnote,
        color: t.colors.secondaryLabel,
        marginTop: t.space.sm,
        marginLeft: t.space.xs,
    },
    error: {
        color: t.colors.danger,
    },
    success: {
        color: t.colors.success,
    },
}));

export default TextField;
