/**
 * BottomSheet: one sheet for every focused sub-task (report, link editing,
 * delete account). Rises with a spring, dims the screen, closes by tapping
 * outside, by Cancel, by the Android back button, or by dragging it down.
 */
import { duration, makeStyles, spring, timing } from '@/src/theme';
import React, { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlassSurface from './GlassSurface';

type Props = {
    visible: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    /** Block dismissal while work is in flight (e.g. deleting). */
    dismissible?: boolean;
    children: React.ReactNode;
};

const BottomSheet = ({ visible, onClose, title, subtitle, dismissible = true, children }: Props) => {
    const s = useStyles();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();
    const [mounted, setMounted] = useState(visible);
    const offset = useSharedValue(height);
    const scrim = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            offset.value = height;
            offset.value = withSpring(0, spring.smooth);
            scrim.value = withTiming(1, timing(duration.base));
        } else if (mounted) {
            scrim.value = withTiming(0, timing(duration.fast));
            offset.value = withTiming(height, timing(duration.base), (done) => {
                if (done) runOnJS(setMounted)(false);
            });
        }
        // `mounted` is read, not tracked: the close animation runs once per hide.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, height]);

    const requestClose = () => {
        if (dismissible) onClose();
    };

    const drag = Gesture.Pan()
        .enabled(dismissible)
        .activeOffsetY(8)
        .onUpdate((e) => {
            offset.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
            if (e.translationY > 120 || e.velocityY > 900) {
                runOnJS(onClose)();
            } else {
                offset.value = withSpring(0, spring.smooth);
            }
        });

    const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
    const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

    if (!mounted) return null;

    return (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
            <GestureHandlerRootView style={s.root}>
                <Animated.View style={[StyleSheet.absoluteFill, s.scrim, scrimStyle]}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={requestClose}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                    />
                </Animated.View>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.avoider} pointerEvents="box-none">
                    <Animated.View style={[s.sheetWrap, sheetStyle]}>
                        <GlassSurface variant="sheet" style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
                            <GestureDetector gesture={drag}>
                                <View style={s.dragZone} accessibilityElementsHidden>
                                    <View style={s.grabber} />
                                </View>
                            </GestureDetector>
                            {(!!title || !!subtitle) && (
                                <View style={s.header}>
                                    {!!title && (
                                        <Text style={s.title} accessibilityRole="header">
                                            {title}
                                        </Text>
                                    )}
                                    {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
                                </View>
                            )}
                            {children}
                        </GlassSurface>
                    </Animated.View>
                </KeyboardAvoidingView>
            </GestureHandlerRootView>
        </Modal>
    );
};

const useStyles = makeStyles((t) => ({
    root: {
        flex: 1,
    },
    scrim: {
        backgroundColor: t.colors.scrim,
    },
    avoider: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheetWrap: {
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
    },
    sheet: {
        borderTopLeftRadius: t.radius.xxl,
        borderTopRightRadius: t.radius.xxl,
        paddingHorizontal: t.space.xl,
    },
    dragZone: {
        alignItems: 'center',
        paddingTop: t.space.sm,
        paddingBottom: t.space.md,
    },
    grabber: {
        width: 36,
        height: 5,
        borderRadius: 3,
        backgroundColor: t.colors.fillStrong,
    },
    header: {
        gap: t.space.xs,
        marginBottom: t.space.lg,
    },
    title: {
        ...t.type.title3,
        color: t.colors.label,
    },
    subtitle: {
        ...t.type.subhead,
        color: t.colors.secondaryLabel,
    },
}));

export default BottomSheet;
