/**
 * NavBar: the floating navigation bar for stack screens.
 *
 * It sits over the content. With a `scrollY` it is clear at rest and gathers
 * glass and a hairline as content scrolls beneath it (iOS scroll-edge
 * appearance). With `titleRevealAt` the inline title fades in once a large
 * title has scrolled under the bar.
 */
import { CHROME_MAX_FONT_SCALE, makeStyles, useTheme } from '@/src/theme';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
    Extrapolation,
    interpolate,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useDerivedValue,
    useSharedValue,
    type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassSurface from './GlassSurface';
import IconButton from './IconButton';

export const NAV_BAR_CONTENT_HEIGHT = 52;

/** Total height of the bar including the status-bar inset. */
export const useNavBarHeight = () => useSafeAreaInsets().top + NAV_BAR_CONTENT_HEIGHT;

/** Scroll offset for a screen's scroll view, to drive the bar's material. */
export const useScrollEdge = () => {
    const scrollY = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler((e) => {
        scrollY.value = e.contentOffset.y;
    });
    return { scrollY, onScroll };
};

type Props = {
    title?: string;
    onBack?: () => void;
    backLabel?: string;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    /** Custom centre content (replaces the title). */
    center?: React.ReactNode;
    scrollY?: SharedValue<number>;
    /** Scroll offset at which the inline title appears (screens with a large title). */
    titleRevealAt?: number;
    /** Always show the material, e.g. over a chat. */
    alwaysGlass?: boolean;
    style?: StyleProp<ViewStyle>;
};

const NavBar = ({
    title,
    onBack,
    backLabel = 'Back',
    leading,
    trailing,
    center,
    scrollY,
    titleRevealAt,
    alwaysGlass = false,
    style,
}: Props) => {
    const s = useStyles();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const largeTitleOwnsHeading = titleRevealAt !== undefined;

    const revealed = useDerivedValue(() => {
        if (alwaysGlass || !scrollY) return alwaysGlass ? 1 : 0;
        return interpolate(scrollY.value, [0, 14], [0, 1], Extrapolation.CLAMP);
    });

    const hairline = useAnimatedStyle(() => ({ opacity: revealed.value }));
    const titleStyle = useAnimatedStyle(() => {
        if (titleRevealAt === undefined || !scrollY) return { opacity: 1 };
        return {
            opacity: interpolate(scrollY.value, [titleRevealAt - 12, titleRevealAt + 8], [0, 1], Extrapolation.CLAMP),
        };
    });

    return (
        <View style={[s.wrap, { paddingTop: insets.top }, style]} pointerEvents="box-none">
            <GlassSurface variant="bar" revealed={revealed} style={StyleSheet.absoluteFill} />
            <Animated.View pointerEvents="none" style={[s.hairline, hairline]} />
            <View style={s.bar} pointerEvents="box-none">
                <View style={s.side}>
                    {onBack ? (
                        <IconButton
                            name="chevron-back"
                            iconSize={26}
                            color={colors.tintText}
                            onPress={onBack}
                            accessibilityLabel={backLabel}
                            testID="nav-back"
                        />
                    ) : (
                        leading
                    )}
                </View>
                <Animated.View style={[s.center, titleStyle]} pointerEvents="box-none">
                    {center ??
                        (!!title && (
                            <Text
                                style={s.title}
                                numberOfLines={1}
                                // With a large title on screen, that title is the heading; this copy is visual only.
                                accessibilityRole={largeTitleOwnsHeading ? undefined : 'header'}
                                accessibilityElementsHidden={largeTitleOwnsHeading}
                                importantForAccessibility={largeTitleOwnsHeading ? 'no-hide-descendants' : 'auto'}
                                maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                            >
                                {title}
                            </Text>
                        ))}
                </Animated.View>
                <View style={[s.side, s.sideEnd]}>{trailing}</View>
            </View>
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    wrap: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
    },
    hairline: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: t.size.hairline,
        backgroundColor: t.colors.separator,
    },
    bar: {
        height: NAV_BAR_CONTENT_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: t.space.xs,
    },
    side: {
        minWidth: t.size.touch + t.space.sm,
        flexDirection: 'row',
        alignItems: 'center',
    },
    sideEnd: {
        justifyContent: 'flex-end',
        gap: t.space.xxs,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: t.space.xs,
    },
    title: {
        ...t.type.headline,
        color: t.colors.label,
    },
}));

export default NavBar;
