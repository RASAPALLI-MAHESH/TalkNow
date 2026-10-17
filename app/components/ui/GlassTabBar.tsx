/**
 * GlassTabBar: the floating glass capsule for the two top-level sections.
 * A selection lens springs between tabs. The capsule steps aside while the
 * keyboard is open on Android, where the window resizes under it.
 */
import { CHROME_MAX_FONT_SCALE, makeStyles, size, spring, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge } from './Feedback';
import GlassSurface from './GlassSurface';
import { haptics } from './haptics';

const CAPSULE_PAD = 6;
const TAB_GAP_BOTTOM = 10;

/** Space a scrolling screen leaves at its bottom so content clears the capsule. */
export const useTabBarClearance = () => {
    const insets = useSafeAreaInsets();
    return size.tabBar + Math.max(insets.bottom, 12) + TAB_GAP_BOTTOM + 8;
};

type TabIcon = { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap };

const GlassTabBar = ({
    state,
    descriptors,
    navigation,
    icons,
    badges,
}: BottomTabBarProps & { icons: Record<string, TabIcon>; badges?: Record<string, number> }) => {
    const s = useStyles();
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const [width, setWidth] = useState(0);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const index = useSharedValue(state.index);

    useEffect(() => {
        index.value = withSpring(state.index, spring.snappy);
    }, [state.index, index]);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
        return () => {
            show.remove();
            hide.remove();
        };
    }, []);

    const tabWidth = width > 0 ? (width - CAPSULE_PAD * 2) / state.routes.length : 0;
    const lens = useAnimatedStyle(() => ({
        width: tabWidth,
        transform: [{ translateX: index.value * tabWidth }],
    }));

    if (keyboardOpen) return null;

    return (
        <View
            pointerEvents="box-none"
            style={[s.dock, { paddingBottom: Math.max(insets.bottom, 12) + TAB_GAP_BOTTOM - 6 }]}
        >
            <View style={s.shadow}>
                <GlassSurface variant="floating" interactive style={s.capsule}>
                    <View
                        style={s.row}
                        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
                        accessibilityRole="tablist"
                    >
                        {width > 0 && <Animated.View pointerEvents="none" style={[s.lens, lens]} />}
                        {state.routes.map((route, i) => {
                            const focused = state.index === i;
                            const { options } = descriptors[route.key];
                            const label = typeof options.title === 'string' ? options.title : route.name;
                            const icon = icons[route.name];
                            const badge = badges?.[route.name] ?? 0;

                            const onPress = () => {
                                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                                if (!focused && !event.defaultPrevented) {
                                    haptics.selection();
                                    navigation.navigate(route.name, route.params);
                                }
                            };

                            return (
                                <Pressable
                                    key={route.key}
                                    onPress={onPress}
                                    onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                                    style={s.tab}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: focused }}
                                    accessibilityLabel={badge > 0 ? `${label}, ${badge} unread` : label}
                                    testID={`tab-${route.name}`}
                                >
                                    <View>
                                        <Ionicons
                                            name={icon ? (focused ? icon.on : icon.off) : 'ellipse'}
                                            size={24}
                                            color={focused ? colors.tintText : colors.secondaryLabel}
                                        />
                                        {badge > 0 && <Badge count={badge} style={s.badge} />}
                                    </View>
                                    <Text
                                        style={[s.label, focused && s.labelOn]}
                                        numberOfLines={1}
                                        maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                                    >
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </GlassSurface>
            </View>
        </View>
    );
};

const useStyles = makeStyles((t) => ({
    dock: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
    },
    shadow: {
        borderRadius: t.radius.pill,
        shadowColor: t.colors.shadow,
        shadowOpacity: t.dark ? 0.5 : 0.14,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
        // Android draws elevation only under an opaque background.
        backgroundColor: Platform.OS === 'android' ? t.colors.glassSolid : 'transparent',
    },
    capsule: {
        borderRadius: t.radius.pill,
        width: 236,
        height: t.size.tabBar,
    },
    row: {
        flex: 1,
        flexDirection: 'row',
        padding: CAPSULE_PAD,
    },
    lens: {
        position: 'absolute',
        top: CAPSULE_PAD,
        bottom: CAPSULE_PAD,
        left: CAPSULE_PAD,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.glassLens,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    label: {
        ...t.type.caption2,
        color: t.colors.secondaryLabel,
    },
    labelOn: {
        color: t.colors.tintText,
        fontWeight: '600',
    },
    badge: {
        position: 'absolute',
        top: -6,
        left: 14,
        borderWidth: 2,
        borderColor: t.dark ? t.colors.surface : t.colors.ground,
    },
}));

export default GlassTabBar;
