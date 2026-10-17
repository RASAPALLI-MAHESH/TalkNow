import { CHROME_MAX_FONT_SCALE, makeStyles, spring } from '@/src/theme';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { haptics } from './haptics';

type Props = {
    segments: readonly string[];
    selectedIndex: number;
    onChange: (index: number) => void;
    /**
     * Continuous position (0..segments-1), e.g. from a horizontal pager, so the
     * lens follows the finger. Without it the lens springs to `selectedIndex`.
     */
    progress?: SharedValue<number>;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

const PAD = 2;

/** Segmented control: a raised lens slides over a quiet track. */
const SegmentedControl = ({ segments, selectedIndex, onChange, progress, style, testID }: Props) => {
    const s = useStyles();
    const [width, setWidth] = useState(0);
    const position = useSharedValue(selectedIndex);

    useEffect(() => {
        if (!progress) position.value = withSpring(selectedIndex, spring.snappy);
    }, [selectedIndex, progress, position]);

    const segmentWidth = width > 0 ? (width - PAD * 2) / segments.length : 0;

    const lens = useAnimatedStyle(() => {
        const at = progress ? progress.value : position.value;
        return { width: segmentWidth, transform: [{ translateX: at * segmentWidth }] };
    });

    return (
        <View
            style={[s.track, style]}
            onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
            accessibilityRole="tablist"
            testID={testID}
        >
            {width > 0 && <Animated.View pointerEvents="none" style={[s.lens, lens]} />}
            {segments.map((label, index) => {
                const selected = index === selectedIndex;
                return (
                    <Pressable
                        key={label}
                        style={s.segment}
                        onPress={() => {
                            if (index === selectedIndex) return;
                            haptics.selection();
                            onChange(index);
                        }}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        accessibilityLabel={label}
                    >
                        <Text
                            style={[s.label, selected && s.labelSelected]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.85}
                            maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                        >
                            {label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    track: {
        flexDirection: 'row',
        height: 36,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.fill,
        padding: PAD,
    },
    lens: {
        position: 'absolute',
        top: PAD,
        bottom: PAD,
        left: PAD,
        borderRadius: t.radius.pill,
        backgroundColor: t.dark ? t.colors.fillStrong : t.colors.surface,
        shadowColor: t.colors.shadow,
        shadowOpacity: t.dark ? 0 : 0.1,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: t.dark ? 0 : 1,
    },
    segment: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: t.space.sm,
    },
    label: {
        ...t.type.footnote,
        fontWeight: '500',
        color: t.colors.secondaryLabel,
    },
    labelSelected: {
        fontWeight: '600',
        color: t.colors.label,
    },
}));

export default SegmentedControl;
