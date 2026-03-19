/**
 * chatroomStyles.ts — Design system for Chatroom
 *
 * Design language: "Refined Violet" — deep purple accents on a near-white
 * base, warm shadows, soft bubble shapes, crisp typography.
 *
 * All sizing uses a 4-pt grid for perfect pixel alignment across
 * all screen densities (mdpi → xxxhdpi on Android, 2x/3x on iOS).
 */

import { Platform, StyleSheet } from 'react-native';

/* ── Design Tokens ─────────────────────────────────────── */
const PURPLE_PRIMARY   = '#6733d0'; // main brand
const PURPLE_DARK      = '#4c1f9e'; // pressed / dark variant
const PURPLE_LIGHT     = '#ede6ff'; // incoming bubble bg
const PURPLE_XLIGHT    = '#f8f5ff'; // screen / safe-area bg
const WHITE            = '#ffffff';
const INK              = '#1a1a2e'; // primary text
const INK_MUTED        = '#7b7b9d'; // secondary text / timestamps
const BUBBLE_SHADOW    = 'rgba(103,51,208,0.10)';
const SEPARATOR        = 'rgba(103,51,208,0.08)';

const FONT_REGULAR = Platform.select({ ios: 'System', android: 'sans-serif' });
const FONT_MEDIUM  = Platform.select({ ios: 'System', android: 'sans-serif-medium' });

/* ── Stylesheet ────────────────────────────────────────── */

export const styles = StyleSheet.create({

    /* ── Layout shells ── */

    safe: {
        flex: 1,
        backgroundColor: '#fafafc',
    },

    container: {
        flex: 1,
        backgroundColor: '#fafafc',
    },

    /* ── Header ── */

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 12,
        backgroundColor: WHITE,
        borderBottomWidth: 0.5,
        borderBottomColor: SEPARATOR,
        gap: 2,
        // Elevation
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

    onlineDot: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#22c55e', // green online indicator
        borderWidth: 2,
        borderColor: WHITE,
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
        letterSpacing: -0.2,
    },

    headerSubtitle: {
        fontSize: 11,
        color: '#22c55e',
        fontFamily: FONT_REGULAR,
        marginTop: 1,
        fontWeight: '500',
    },

    pressed: {
        opacity: 0.6,
    },

    /* ── Message list ── */

    messagesContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        flexGrow: 1,
        justifyContent: 'flex-end',
    },

    /* ── Bubble rows (alignment) ── */

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

    /* ── Bubbles ── */

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
        borderBottomRightRadius: 4, // WhatsApp-style tail notch
    },

    bubbleOther: {
        backgroundColor: WHITE,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: PURPLE_LIGHT,
        borderBottomLeftRadius: 4,  // tail on left
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

    /* ── Timestamps ── */

    timestamp: {
        fontSize: 10,
        fontFamily: FONT_REGULAR,
        marginTop: 3,
        color: INK_MUTED,
    },

    timestampMe: {
        marginRight: 4,
    },

    timestampOther: {
        marginLeft: 4,
    },

    /* ── Composer ── */

    composerContainer: {
        backgroundColor: 'transparent',
    },

    composerOuter: {
        backgroundColor: 'transparent',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: SEPARATOR,
        paddingTop: 12,
        paddingHorizontal: 16,
        paddingBottom: 12,
        ...Platform.select({
            ios: {
                shadowColor: BUBBLE_SHADOW,
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
            },
            android: {
                elevation: 0,
            },
        }),
    },

    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'transparent',
        paddingHorizontal: 0,
        paddingVertical: 0,
        gap: 12,
    },

    emojiBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 2,
        marginBottom: Platform.OS === 'ios' ? 0 : 2,
    },

    input: {
        flex: 1,
        fontSize: 16,
        lineHeight: 20,
        color: INK,
        fontFamily: FONT_REGULAR,
        paddingHorizontal: 16,
        paddingVertical: 12,
        maxHeight: 120, // cap multiline growth at ~5 lines
        backgroundColor: WHITE,
        borderRadius: 24,
        textAlign: 'left',
        textAlignVertical: 'center',
        borderColor: PURPLE_DARK,
        borderWidth: StyleSheet.hairlineWidth,
    },

    sendBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor:  PURPLE_PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginBottom: 0,
        // inner glow
        ...Platform.select({
            ios: {
                shadowColor: PURPLE_DARK,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
            },
            android: {
                elevation: 0,
            },
        }),
    },
});