import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#fff',
    },
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    header: {
        width: '100%',
        height: 56,
        backgroundColor: '#a0a0a0',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    headerButton: {
        minWidth: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        overflow: 'hidden',
    },
    headerButtonText: {
        color: '#351a48',
        fontSize: 14,
        fontWeight: '800',
    },
    pressed: {
        opacity: 0.7,
    },
    avatarButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        overflow: 'hidden',
        marginLeft: 8,
        marginRight: 10,
    },
    headerTitleWrap: {
        flex: 1,
        height: 40,
        justifyContent: 'center',
        borderRadius: 10,
        overflow: 'hidden',
        paddingHorizontal: 8,
    },
    headerTitle: {
        color: '#6e4576',
        fontSize: 16,
        fontWeight: '700',
    },
    avatarImage: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#e9e2ff',
    },
    avatarFallback: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#e9e2ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarFallbackText: {
        color: '#350d81',
        fontWeight: '800',
        fontSize: 13,
    },
    messagesContent: {
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    bubble: {
        maxWidth: '80%',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        marginBottom: 8,
    },
    bubbleMe: {
        alignSelf: 'flex-end',
        backgroundColor: '#e9e2ff',
    },
    bubbleOther: {
        alignSelf: 'flex-start',
        backgroundColor: '#f2f2f2',
    },
    bubbleText: {
        color: '#111',
        fontSize: 14,
    },
    composer: {
        paddingHorizontal: 12,
        paddingTop: 6,
        backgroundColor: 'transparent',
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#6733d0',
        borderRadius: 22,
        minHeight: 40,
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 2,
        backgroundColor: 'transparent',
    },
    input: {
        flex: 1,
        maxHeight: 120,
        paddingVertical: 6,
        fontSize: 14,
        lineHeight: 18,
        color: '#111',
        backgroundColor: 'transparent',
    },
    sendButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#6733d0',
        overflow: 'hidden',
        backgroundColor: 'transparent',
    },
    sendButtonPressed: {
        opacity: 0.7,
    },
    sendText: {
        color: '#6733d0',
        fontWeight: '700',
        fontSize: 14,
    },
});

export default styles;
