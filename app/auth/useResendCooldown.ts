import { useCallback, useEffect, useState } from 'react';

/** Seconds left before a code can be sent again; starts counting at mount. */
export const useResendCooldown = (seconds = 30) => {
    const [left, setLeft] = useState(seconds);

    useEffect(() => {
        if (left <= 0) return;
        const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
        return () => clearTimeout(timer);
    }, [left]);

    const restart = useCallback(() => setLeft(seconds), [seconds]);
    return { left, ready: left <= 0, restart };
};
