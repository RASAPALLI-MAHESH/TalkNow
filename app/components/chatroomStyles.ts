/**
 * chatroomStyles.ts — FINAL PIXEL PERFECT VERSION
 * Eliminates:
 * - Last 1–5px bottom gap
 * - Hidden padding stacking
 * - Layout inconsistencies
 */

import { Platform, StyleSheet } from 'react-native';

/* ── Design Tokens ─────────────────────────────────────── */
const PURPLE_PRIMARY   = '#6733d0';
const PURPLE_DARK      = '#4c1f9e';
const PURPLE_LIGHT     = '#ede6ff';
const PURPLE_XLIGHT    = '#f8f5ff';
const WHITE            = '#ffffff';
const INK              = '#1a1a2e';
const INK_MUTED        = '#7b7b9d';
const BUBBLE_SHADOW    = 'rgba(103,51,208,0.10)';
const SEPARATOR        = 'rgba(103,51,208,0.08)';

const FONT_REGULAR = Platform.select({ ios: 'System', android: 'sans-serif' });
const FONT_MEDIUM  = Platform.select({ ios: 'System', android: 'sans-serif-medium' });

export const styles = StyleSheet.create({

    /* ── Layout ── */

    safe: {
        flex: 1,
        backgroundColor: PURPLE_XLIGHT,
    },

    container: {
        flex: 1,
        backgroundColor: PURPLE_XLIGHT,
    },

    /* ── Header ── */

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 12,
        backgroundColor: WHITE,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SEPARATOR,
        gap: 2,
        ...Platform.select({
            ios: {
                shadowColor: BUBBLE_SHADOW,
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.08,
                shadowRadius: 3,
            },
            android: {
                elevation: 2,
            },
        }),
    },

    headerIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },

    avatarBtn: {
        marginLeft: 2,
        position: 'relative',
    },

    avatarImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: PURPLE_PRIMARY,
    },

    avatarFallback: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: PURPLE_PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
    },

    avatarFallbackText: {
        color: WHITE,
        fontSize: 16,
        fontWeight: '600',
        fontFamily: FONT_MEDIUM,
    },

    headerTitleWrap: {
        flex: 1,
        paddingHorizontal: 4,
        justifyContent: 'center',
    },

    headerTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: INK,
        fontFamily: FONT_MEDIUM,
    },

    headerSubtitle: {
        fontSize: 11,
        color: '#22c55e',
        fontFamily: FONT_REGULAR,
        marginTop: 1,
    },

    pressed: {
        opacity: 0.6,
    },

    /* ── Messages ── */

    messagesContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 0, // 🔥 FIXED (was 8)
        flexGrow: 1,
        justifyContent: 'flex-end',
    },

    bubbleRow: {
        marginBottom: 6,
        maxWidth: '80%',
    },

    bubbleRowMe: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
    },

    bubbleRowOther: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
    },

    bubble: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
        ...Platform.select({
            ios: {
                 shadowColor: BUBBLE_SHADOW,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 1,
                shadowRadius: 4,
            },
            android: {
                elevation: 2,
            },
        }),
    },

    bubbleMe: {
        backgroundColor: PURPLE_PRIMARY,
        borderBottomRightRadius: 4,
    },

    bubbleOther: {
        backgroundColor: WHITE,
    
        borderColor: PURPLE_LIGHT,
        borderBottomLeftRadius: 4,
    },

    bubbleText: {
        fontSize: 15,
        lineHeight: 21,
        fontFamily: FONT_REGULAR,
    },

    bubbleTextMe: {
        color: WHITE,
    },

    bubbleTextOther: {
        color: INK,
    },

    timestamp: {
        fontSize: 10,
        marginTop: 3,
        color: INK_MUTED,
        fontFamily: FONT_REGULAR,
    },

    /* ── Composer ── */

    composerContainer: {
        borderTopColor: SEPARATOR,
        backgroundColor: PURPLE_XLIGHT,
        marginBottom: 0,
    },

    composerOuter: {
        paddingTop: 6,
        paddingHorizontal: 16,
        paddingBottom: 2, // 🔥 FIXED (was 8)
    },

    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    input: {
        flex: 1,
        fontSize: 16,
        lineHeight: 20,
        color: INK,
        fontFamily: FONT_REGULAR,
        paddingHorizontal: 16,
        paddingVertical: 12,
        maxHeight: 120,
        backgroundColor: WHITE,
        borderRadius: 25,
        borderColor: PURPLE_DARK,
        borderWidth: 1.2,
    },

    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: PURPLE_PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...Platform.select({
            ios: {
                shadowColor: PURPLE_DARK,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
            },
            android: {
                elevation: 2,
            },
        }),
    },
});