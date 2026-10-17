import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

/**
 * One motion grammar for the app. Springs for anything the finger moves or
 * selects; short ease-out timings for fades. Every config defers to the
 * system Reduce Motion setting.
 */
export const duration = {
    fast: 160,
    base: 220,
    slow: 320,
} as const;

export const easing = {
    // Ease-out with a long tail: content arrives quickly and settles.
    out: Easing.bezier(0.2, 0, 0, 1),
    // For things leaving the screen.
    in: Easing.bezier(0.3, 0, 1, 1),
} as const;

export const spring = {
    // Selection lenses, toggles, the send button.
    snappy: { damping: 22, stiffness: 320, mass: 0.8, reduceMotion: ReduceMotion.System },
    // Sheets and larger surfaces.
    smooth: { damping: 28, stiffness: 240, mass: 1, reduceMotion: ReduceMotion.System },
    // Press feedback.
    press: { damping: 26, stiffness: 520, mass: 0.6, reduceMotion: ReduceMotion.System },
} satisfies Record<string, WithSpringConfig>;

export const timing = (ms: number = duration.base): WithTimingConfig => ({
    duration: ms,
    easing: easing.out,
    reduceMotion: ReduceMotion.System,
});

/* How far a pressed control shrinks. */
export const PRESS_SCALE = 0.97;
