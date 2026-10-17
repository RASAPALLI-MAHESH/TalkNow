/**
 * AuthScaffold: the shared frame for sign-in, sign-up, verification and
 * password screens. A soft brand aura sits behind a scroll-edge glass bar;
 * the screen's title, form and footer follow in one column.
 */
import { NavBar, StepProgress, useNavBarHeight, useScrollEdge } from '@/app/components/ui';
import { makeStyles, useTheme } from '@/src/theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: React.ReactNode;
    /** Back control; omit on the first screen of the stack. */
    onBack?: () => void;
    /** Signup progress, e.g. { step: 2, of: 4 }. */
    step?: { step: number; of: number };
    /** Centre content between the hero and the footer (e.g. an avatar picker). */
    children: React.ReactNode;
    footer?: React.ReactNode;
};

const AuthScaffold = ({ icon, title, subtitle, onBack, step, children, footer }: Props) => {
    const s = useStyles();
    const { colors, dark } = useTheme();
    const insets = useSafeAreaInsets();
    const navHeight = useNavBarHeight();
    const { scrollY, onScroll } = useScrollEdge();

    return (
        <View style={s.screen}>
            <LinearGradient
                pointerEvents="none"
                colors={dark ? ['rgba(103,51,208,0.30)', 'rgba(103,51,208,0)'] : ['rgba(103,51,208,0.13)', 'rgba(103,51,208,0)']}
                style={s.aura}
            />
            <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <Animated.ScrollView
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[
                        s.content,
                        { paddingTop: navHeight + 8, paddingBottom: Math.max(insets.bottom, 16) + 24 },
                    ]}
                >
                    <View style={s.column}>
                        {step && (
                            <View style={s.progress}>
                                <StepProgress step={step.step} of={step.of} />
                            </View>
                        )}
                        <View style={s.mark}>
                            <Ionicons name={icon} size={26} color={colors.wordmark} />
                        </View>
                        <Text style={s.title} accessibilityRole="header">
                            {title}
                        </Text>
                        {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
                        <View style={s.body}>{children}</View>
                        {footer && <View style={s.footer}>{footer}</View>}
                    </View>
                </Animated.ScrollView>
            </KeyboardAvoidingView>
            <NavBar onBack={onBack} scrollY={scrollY} title={title} titleRevealAt={130} />
        </View>
    );
};

/** Inline row: "Don't have an account? Sign Up". */
export const AuthFooterLink = ({ prompt, action, onPress }: { prompt?: string; action: string; onPress: () => void }) => {
    const s = useStyles();
    return (
        <Text style={s.footerText}>
            {prompt ? `${prompt} ` : ''}
            <Text style={s.link} onPress={onPress} accessibilityRole="link">
                {action}
            </Text>
        </Text>
    );
};

const useStyles = makeStyles((t) => ({
    screen: {
        flex: 1,
        backgroundColor: t.colors.ground,
    },
    flex: {
        flex: 1,
    },
    aura: {
        ...StyleSheet.absoluteFillObject,
        bottom: undefined,
        height: 360,
    },
    content: {
        flexGrow: 1,
        paddingHorizontal: t.space.xxl,
    },
    column: {
        flexGrow: 1,
        width: '100%',
        maxWidth: 460,
        alignSelf: 'center',
    },
    progress: {
        marginBottom: t.space.xxl,
    },
    mark: {
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: t.colors.surface,
        borderWidth: t.size.hairline,
        borderColor: t.colors.glassHairline,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: t.space.lg,
        marginBottom: t.space.xl,
        shadowColor: t.colors.shadow,
        shadowOpacity: t.dark ? 0 : 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: t.dark ? 0 : 2,
    },
    title: {
        ...t.type.title1,
        color: t.colors.wordmark,
    },
    subtitle: {
        ...t.type.callout,
        color: t.colors.secondaryLabel,
        marginTop: t.space.sm,
    },
    body: {
        marginTop: t.space.xxxl,
        gap: t.space.lg,
    },
    footer: {
        marginTop: t.space.xxxl,
        alignItems: 'center',
        gap: t.space.lg,
    },
    footerText: {
        ...t.type.subhead,
        color: t.colors.secondaryLabel,
        textAlign: 'center',
    },
    link: {
        color: t.colors.tintText,
        fontWeight: '600',
    },
}));

export default AuthScaffold;
