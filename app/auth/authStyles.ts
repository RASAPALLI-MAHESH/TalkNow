import { StyleSheet } from 'react-native';

// Reuse only colors already present in existing screens.
export const AUTH_COLORS = {
    primary: '#0d4d47',
    primaryBorder: '#0F766E',
    background: '#F8FAFC',
    border: 'gray',
    white: '#fff',
} as const;

export const authStyles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: AUTH_COLORS.background,
    },
    content: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        marginBottom: 10,
        textAlign: 'center',
    },
    label: {
        width: '80%',
        marginBottom: 6,
    },
    input: {
        width: '80%',
        height: 44,
        borderColor: AUTH_COLORS.border,
        borderWidth: 1,
        marginBottom: 12,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: AUTH_COLORS.white,
    },
    rowBetween: {
        width: '80%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    link: {
        color: AUTH_COLORS.primary,
        fontWeight: 'bold',
    },
    button: {
        width: '80%',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: AUTH_COLORS.primary,
        borderWidth: 1,
        borderColor: AUTH_COLORS.primaryBorder,
    },
    buttonDisabled: {
        opacity: 0.55,
    },
    buttonText: {
        color: AUTH_COLORS.white,
        fontSize: 16,
        fontWeight: '700',
    },
});
