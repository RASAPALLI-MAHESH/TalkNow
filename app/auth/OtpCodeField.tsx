/**
 * OtpCodeField: six digit cells over one hidden input. The system keyboard,
 * paste and SMS/email one-time-code autofill all go through the real input.
 */
import { makeStyles, spring } from '@/src/theme';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const LENGTH = 6;

const Cell = ({ char, active }: { char: string; active: boolean }) => {
    const s = useStyles();
    const pop = useSharedValue(1);
    useEffect(() => {
        if (char) {
            pop.value = 0.92;
            pop.value = withSpring(1, spring.snappy);
        }
    }, [char, pop]);
    const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
    return (
        <Animated.View style={[s.cell, active && s.cellActive, !!char && s.cellFilled, style]}>
            <Text style={s.digit}>{char}</Text>
            {active && !char && <View style={s.caret} />}
        </Animated.View>
    );
};

type Props = {
    value: string;
    onChange: (digits: string) => void;
    onComplete?: (digits: string) => void;
    autoFocus?: boolean;
    testID?: string;
};

const OtpCodeField = ({ value, onChange, onComplete, autoFocus = true, testID }: Props) => {
    const s = useStyles();
    const inputRef = useRef<TextInput>(null);
    const [focused, setFocused] = useState(false);

    return (
        <Pressable
            onPress={() => inputRef.current?.focus()}
            accessible={false}
            style={s.wrap}
        >
            <View style={s.row} pointerEvents="none" importantForAccessibility="no-hide-descendants">
                {Array.from({ length: LENGTH }, (_, i) => (
                    <Cell key={i} char={value[i] ?? ''} active={focused && i === Math.min(value.length, LENGTH - 1)} />
                ))}
            </View>
            <TextInput
                ref={inputRef}
                value={value}
                onChangeText={(text) => {
                    const digits = text.replace(/\D/g, '').slice(0, LENGTH);
                    onChange(digits);
                    if (digits.length === LENGTH) onComplete?.(digits);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={LENGTH}
                autoFocus={autoFocus}
                caretHidden
                style={s.hiddenInput}
                accessibilityLabel={`Verification code, ${value.length} of ${LENGTH} digits entered`}
                testID={testID}
            />
        </Pressable>
    );
};

const useStyles = makeStyles((t) => ({
    wrap: {
        width: '100%',
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: t.space.sm,
    },
    cell: {
        flex: 1,
        maxWidth: 54,
        aspectRatio: 0.84,
        borderRadius: t.radius.md,
        borderWidth: 1.5,
        borderColor: t.colors.separator,
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cellActive: {
        borderColor: t.colors.tintText,
    },
    cellFilled: {
        borderColor: t.colors.fillStrong,
    },
    digit: {
        ...t.type.title2,
        color: t.colors.label,
        fontVariant: ['tabular-nums'],
    },
    caret: {
        position: 'absolute',
        width: 2,
        height: 24,
        borderRadius: 1,
        backgroundColor: t.colors.tintText,
    },
    // Kept in layout (not display: none) so focus and autofill work everywhere.
    hiddenInput: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.011,
        color: 'transparent',
    },
}));

export default OtpCodeField;
