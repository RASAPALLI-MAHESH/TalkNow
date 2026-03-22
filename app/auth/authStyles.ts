import { StyleSheet, Platform } from 'react-native';

export const AUTH_COLORS = {
    primary: '#6733d0',
    primaryBorder: '#5126a6',
    background: '#fff',
    border: '#b29fd6',
    white: '#fff',
    text: '#111',
    subtitle: '#666',
    inputBg: '#fcfbfe',
    placeholder: '#8c8c8c'
} as const;

export const authStyles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: AUTH_COLORS.background,
    },
    content: {
        flexGrow: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingHorizontal: 28,
        paddingTop: Platform.OS === 'ios' ? 80 : 60,
        paddingBottom: 40,
    },
    iconWrap: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#e9e2ff',
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
        marginBottom: 20,
    },
    title: {
        fontSize: 30,
        fontWeight: '700',
        color: '#710b8d',
        marginBottom: 8,
        alignSelf: 'flex-start',
        textAlign: 'left',
    },
    subtitle: {
        fontSize: 16,
        color: AUTH_COLORS.subtitle,
        marginBottom: 36,
        alignSelf: 'flex-start',
        textAlign: 'left',
        lineHeight: 24,
    },
    label: {
        width: '100%',
        fontSize: 14,
        fontWeight: '600',
        color: AUTH_COLORS.text,
        marginBottom: 8,
        alignSelf: 'flex-start',
    },
    input: {
        width: '100%',
        height: 54,
        borderColor: AUTH_COLORS.border,
        borderWidth: 1.5,
        marginBottom: 24,
        paddingHorizontal: 16,
        borderRadius: 16,
        backgroundColor: AUTH_COLORS.inputBg,
        fontSize: 16,
        color: AUTH_COLORS.text,
    },
    rowBetween: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 28,
        marginTop: -8,
    },
    link: {
        color: AUTH_COLORS.primary,
        fontWeight: '700',
        fontSize: 14,
    },
    button: {
        width: '100%',
        height: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: AUTH_COLORS.primary,
        shadowColor: AUTH_COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
        marginTop: 12,
    },
    buttonDisabled: {
        opacity: 0.55,
        elevation: 0,
        shadowOpacity: 0,
    },
    buttonPressed: {
        opacity: 0.88,
        transform: [{ scale: 0.98 }],
    },
    buttonText: {
        color: AUTH_COLORS.white,
        fontSize: 16,
        fontWeight: '700',
    },
    bottomTextContainer: {
        marginTop: 32,
        alignItems: 'center',
    },
    bottomText: {
        fontSize: 15,
        color: AUTH_COLORS.subtitle,
    }
});
