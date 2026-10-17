import { Platform, type TextStyle } from 'react-native';
import { palette as p } from './palette';

/**
 * Semantic colour roles. Every screen reads these; none reads hex values.
 * Light keeps the shipped brand values. Dark derives from the same purples.
 */
const light = {
    // Grounds and surfaces
    ground: p.lavender50, // every screen's background
    surface: p.white, // grouped rows, fields, other-person bubbles
    surfaceRaised: p.white, // sheets and dialogs
    fill: 'rgba(103,51,208,0.07)', // search field, segmented track, quiet buttons
    fillStrong: 'rgba(103,51,208,0.13)',
    separator: 'rgba(53,13,129,0.12)',

    // Text
    label: p.ink,
    secondaryLabel: p.inkSecondary,
    tertiaryLabel: p.inkMuted, // icons, chevrons, decoration (3.78:1, non-text only)
    placeholder: p.inkPlaceholder,

    // Brand
    tint: p.purple600, // filled controls
    tintPressed: p.purple700,
    tintText: p.purple600, // text and icons drawn in the tint
    onTint: p.white,
    tintSoft: p.lavender100,
    tintSoftText: p.purple600,
    wordmark: p.plum700,
    avatarFill: p.lavender150,
    avatarInitial: p.purple900,

    // Chat
    bubbleMe: p.purple600,
    bubbleMeText: p.white,
    bubbleOther: p.white,
    bubbleOtherText: p.ink,
    bubbleOtherBorder: 'rgba(53,13,129,0.08)',

    // Status
    danger: p.red600,
    dangerSoft: 'rgba(220,38,38,0.09)',
    success: p.green700,
    successSoft: p.greenWash,
    warning: p.amber700,
    warningSoft: p.amberWash,
    warningLine: p.amberLine,
    unread: p.purple600,

    // States
    disabledFill: '#e6def8',
    disabledLabel: '#8a84a8',
    pressedOverlay: 'rgba(103,51,208,0.08)',
    ripple: 'rgba(103,51,208,0.16)',
    scrim: 'rgba(15,12,25,0.42)',

    // Glass material
    glassSolid: 'rgba(248,245,255,0.97)', // Android and Reduce Transparency
    glassOverlay: 'rgba(248,245,255,0.42)', // tint laid over the system blur
    glassHairline: 'rgba(53,13,129,0.10)',
    glassHighlight: 'rgba(255,255,255,0.85)',
    glassLens: 'rgba(103,51,208,0.13)', // selected tab / segment
    shadow: '#2a1460',
} as const;

export type Colors = { [K in keyof typeof light]: string };

const dark: Colors = {
    ground: p.night950,
    surface: p.night900,
    surfaceRaised: p.night850,
    fill: 'rgba(157,123,221,0.13)',
    fillStrong: 'rgba(157,123,221,0.22)',
    separator: 'rgba(196,180,255,0.14)',

    label: p.mist100,
    secondaryLabel: p.mist300,
    tertiaryLabel: '#6f6a8c',
    placeholder: p.mist400,

    tint: p.purple600, // white on #6733d0 is 7.09:1
    tintPressed: p.purple700,
    tintText: p.lilac400, // #6733d0 is 2.72:1 on the dark ground; lilac is 5.81:1
    onTint: p.white,
    tintSoft: 'rgba(157,123,221,0.18)',
    tintSoftText: p.lilac300,
    wordmark: p.lilac300,
    avatarFill: p.night800,
    avatarInitial: p.lilac300,

    bubbleMe: p.purple600,
    bubbleMeText: p.white,
    bubbleOther: p.night850,
    bubbleOtherText: p.mist100,
    bubbleOtherBorder: 'rgba(196,180,255,0.08)',

    danger: p.red400,
    dangerSoft: 'rgba(248,113,113,0.14)',
    success: p.green400,
    successSoft: 'rgba(74,222,128,0.14)',
    warning: p.amber400,
    warningSoft: 'rgba(251,146,60,0.12)',
    warningLine: 'rgba(251,146,60,0.30)',
    unread: p.purple600,

    disabledFill: '#2a2540',
    disabledLabel: '#6f6990',
    pressedOverlay: 'rgba(157,123,221,0.12)',
    ripple: 'rgba(157,123,221,0.22)',
    scrim: 'rgba(0,0,0,0.6)',

    glassSolid: 'rgba(22,18,34,0.97)',
    glassOverlay: 'rgba(15,12,25,0.40)',
    glassHairline: 'rgba(255,255,255,0.10)',
    glassHighlight: 'rgba(255,255,255,0.10)',
    glassLens: 'rgba(157,123,221,0.26)',
    shadow: '#000000',
};

export const colors = { light, dark } as const;

/* Spacing: a 4 pt grid. Screen gutters are 16, auth forms 24. */
export const space = {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 40,
    gutter: 16,
} as const;

/* Shape: capsules for controls, 14 for fields, 16 for grouped sections, 28 for sheets. */
export const radius = {
    xs: 6, // bubble tail corner
    sm: 10,
    md: 14, // text fields
    lg: 16, // grouped sections, cards
    xl: 20, // bubbles, hero card inner
    xxl: 28, // sheets, hero card
    pill: 999,
} as const;

/* Sizes */
export const size = {
    touch: Platform.OS === 'android' ? 48 : 44, // minimum target
    navBar: 52,
    tabBar: 62,
    control: 50, // primary buttons and fields
    controlSm: 36,
    avatarRow: 52,
    avatarHeader: 36,
    hairline: Platform.OS === 'web' ? 1 : 0.5,
} as const;

/* Type: the iOS text-style scale. Sizes follow the system font size setting. */
type TypeRole = Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing'>;
export const type = {
    largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
    title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.36 },
    title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35 },
    title3: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: 0.38 },
    headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
    body: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.41 },
    callout: { fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.32 },
    subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.24 },
    footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.08 },
    caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0 },
    caption2: { fontSize: 11, lineHeight: 13, fontWeight: '500', letterSpacing: 0.07 },
} satisfies Record<string, TypeRole>;

export type TypeRoleName = keyof typeof type;

/* Chrome text (bars, tabs, segmented controls) stops growing at this multiplier. */
export const CHROME_MAX_FONT_SCALE = 1.35;
