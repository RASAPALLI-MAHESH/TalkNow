import { CHROME_MAX_FONT_SCALE, makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef } from 'react';
import { ActivityIndicator, Pressable, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

type Props = Omit<TextInputProps, 'style'> & {
    searching?: boolean;
    onClear?: () => void;
    style?: StyleProp<ViewStyle>;
};

/** Capsule search field on the quiet fill. Clear button appears with text. */
const SearchField = forwardRef<TextInput, Props>(function SearchField(
    { value, searching = false, onClear, style, ...input },
    ref
) {
    const s = useStyles();
    const { colors } = useTheme();
    const hasText = !!value && value.length > 0;

    return (
        <View style={[s.field, style]}>
            <Ionicons name="search" size={17} color={colors.secondaryLabel} />
            <TextInput
                ref={ref}
                value={value}
                {...input}
                style={s.input}
                placeholderTextColor={colors.secondaryLabel}
                selectionColor={colors.tintText}
                cursorColor={colors.tintText}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="never"
                maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                accessibilityRole="search"
            />
            {searching ? (
                <ActivityIndicator size="small" color={colors.secondaryLabel} style={s.trailing} />
            ) : hasText ? (
                <Pressable
                    onPress={onClear}
                    hitSlop={12}
                    style={s.trailing}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                >
                    <Ionicons name="close-circle" size={18} color={colors.tertiaryLabel} />
                </Pressable>
            ) : null}
        </View>
    );
});

const useStyles = makeStyles((t) => ({
    field: {
        height: 40,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.sm,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.fill,
        paddingHorizontal: t.space.md,
    },
    input: {
        flex: 1,
        ...t.type.body,
        color: t.colors.label,
        paddingVertical: 0,
        height: 40,
    },
    trailing: {
        marginLeft: t.space.xs,
    },
}));

export default SearchField;
