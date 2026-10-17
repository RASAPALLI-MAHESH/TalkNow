/**
 * chatroomStyles.ts: themed styles for the conversation screen.
 * Colours come from the theme tokens (src/theme), so light and dark both work.
 */

import { makeStyles } from '@/src/theme';

export const useChatroomStyles = makeStyles((t) => ({
    /* ── Layout ── */

    screen: {
        flex: 1,
        backgroundColor: t.colors.ground,
    },

    flex: {
        flex: 1,
    },

    /* ── Header ── */

    headerIdentity: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.sm + 2,
        alignSelf: 'stretch',
    },

    headerText: {
        flex: 1,
        minWidth: 0,
    },

    headerTitle: {
        ...t.type.headline,
        color: t.colors.label,
    },

    headerSubRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },

    headerSubtitle: {
        ...t.type.caption1,
        color: t.colors.secondaryLabel,
    },

    /* ── Messages ── */

    messagesContent: {
        paddingHorizontal: t.space.md,
        flexGrow: 1,
        justifyContent: 'flex-end',
    },

    dayRow: {
        alignItems: 'center',
        marginTop: t.space.lg,
        marginBottom: t.space.sm,
    },

    dayText: {
        ...t.type.caption1,
        fontWeight: '600',
        color: t.colors.secondaryLabel,
    },

    /* ── Composer ── */

    composerDock: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
    },

    composer: {
        paddingTop: t.space.sm,
        paddingHorizontal: t.space.md,
    },

    composerHairline: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: t.size.hairline,
        backgroundColor: t.colors.separator,
    },

    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: t.space.sm,
    },

    input: {
        flex: 1,
        ...t.type.callout,
        lineHeight: 21,
        color: t.colors.label,
        paddingHorizontal: t.space.lg,
        paddingTop: 10,
        paddingBottom: 10,
        minHeight: 42,
        maxHeight: 132,
        backgroundColor: t.colors.surface,
        borderRadius: 21,
        borderWidth: t.size.hairline,
        borderColor: t.colors.separator,
    },

    sendBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },

    /* ── Encryption notices ── */

    notice: {
        alignSelf: 'center',
        maxWidth: '88%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: t.colors.fill,
        borderRadius: t.radius.md,
        paddingVertical: 7,
        paddingHorizontal: t.space.md,
        marginVertical: t.space.sm,
    },

    noticeWarn: {
        backgroundColor: t.colors.warningSoft,
    },

    noticeText: {
        flexShrink: 1,
        ...t.type.caption1,
        color: t.colors.secondaryLabel,
        textAlign: 'center',
    },

    bannerDock: {
        position: 'absolute',
        left: t.space.md,
        right: t.space.md,
        zIndex: 11,
    },

    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space.sm,
        paddingLeft: t.space.md,
        paddingRight: t.space.sm,
        paddingVertical: t.space.sm,
        borderRadius: t.radius.lg,
        backgroundColor: t.dark ? t.colors.surfaceRaised : t.colors.warningSoft,
        borderWidth: t.size.hairline,
        borderColor: t.colors.warningLine,
        shadowColor: t.colors.shadow,
        shadowOpacity: t.dark ? 0.4 : 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },

    bannerText: {
        flex: 1,
        ...t.type.footnote,
        color: t.colors.label,
    },

    bannerButton: {
        minHeight: 32,
        paddingHorizontal: t.space.md,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },

    bannerButtonText: {
        ...t.type.footnote,
        fontWeight: '600',
        color: t.colors.tintText,
    },

    encryptedHint: {
        alignSelf: 'center',
        maxWidth: 320,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: t.space.sm,
        paddingHorizontal: t.space.md,
        marginBottom: t.space.md,
        borderRadius: t.radius.md,
        backgroundColor: t.colors.fill,
    },

    encryptedHintText: {
        flexShrink: 1,
        ...t.type.caption1,
        color: t.colors.secondaryLabel,
        textAlign: 'center',
    },
}));
