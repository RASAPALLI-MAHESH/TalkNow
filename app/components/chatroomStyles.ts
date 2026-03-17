import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: '#fff',
    },
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        width: '100%',
        height: 56,
        backgroundColor: '#6733d0',
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
        color: '#fff',
        fontSize: 14,
        fontWeight: '800',
    },
    pressed: {
        opacity: 0.7,
    },
    avatarButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
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
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    avatarImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#e9e2ff',
    },
    avatarFallback: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#e9e2ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarFallbackText: {
        color: '#350d81',
        fontWeight: '800',
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
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 12,
        paddingTop: 10,
        backgroundColor: 'transparent',
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderWidth: 1,
        borderColor: '#6733d0',
        borderRadius: 26,
        paddingLeft: 14,
        paddingRight: 8,
        paddingVertical: 8,
        backgroundColor: 'transparent',
    },
    input: {
        flex: 1,
        maxHeight: 120,
        paddingVertical: 8,
        fontSize: 14,
        color: '#111',
        backgroundColor: 'transparent',
    },
    sendButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
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
