/**
 * TalkNow brand palette: the exact values the app shipped with, kept as the
 * single source of truth. Screens never use these directly; they read the
 * semantic tokens in `tokens.ts`, which map these values onto roles for
 * light and dark appearance.
 *
 * Where a value was added (dark-mode surfaces, AA-safe status colours), the
 * comment says why. See docs/design/talknow-liquid-glass-design-system.md.
 */
export const palette = {
    // Brand purples (all pre-existing)
    purple600: '#6733d0', // primary tint: buttons, links, selection, my bubbles
    purple700: '#5126a6', // primary pressed / border (auth buttons)
    purple800: '#4c1f9e', // deep purple: hero theme, initials on light tints
    purple900: '#350d81', // avatar initials
    indigo900: '#1a1073', // notification icon ink
    plum700: '#710b8d', // wordmark and brand headlines
    lilac400: '#9d7bdd', // search border; dark-mode tint for text and icons (5.2:1+)
    lilac300: '#b29fd6', // auth input border; dark-mode wordmark
    lavender150: '#e9e2ff', // avatar fallback, soft fills
    lavender100: '#ede6ff', // soft tint, notices
    lavender50: '#f8f5ff', // tinted ground
    lavender25: '#fcfbfe', // input ground
    ink: '#1a1a2e', // primary text
    inkMuted: '#7b7b9d', // legacy secondary text: fails AA on the ground (3.78:1), kept for decoration only
    white: '#ffffff',
    black: '#000000',

    // Added for AA contrast on light grounds (see audit)
    inkSecondary: '#5e5a7a', // 6.06:1 on lavender50, replaces inkMuted for text
    inkPlaceholder: '#76728f', // 4.59:1 on white input fields

    // Dark appearance, derived from ink #1a1a2e toward the purple hue
    night950: '#0f0c19', // ground
    night900: '#1c1829', // grouped surface
    night850: '#262136', // raised surface, other-person bubbles
    night800: '#2f2943', // controls on raised surfaces
    mist100: '#f3f0fa', // primary text
    mist300: '#aca6c6', // secondary text (8.3:1 on ground)
    mist400: '#8d87ab', // placeholder (5.1:1 on surface)

    // Status (light values are AA on white; dark values are AA on night900)
    red600: '#dc2626', // was #ef4444 (3.76:1 on white)
    red400: '#f87171',
    green700: '#15803d', // was #16a34a (3.30:1 on white)
    green400: '#4ade80',
    greenWash: '#dcfce7',
    amber700: '#c2410c', // identity-change warning (pre-existing)
    amber400: '#fb923c',
    amberWash: '#fff7ed',
    amberLine: '#fed7aa',
} as const;

export type PaletteKey = keyof typeof palette;
