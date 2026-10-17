import { defineConfig, devices } from '@playwright/test';

/**
 * Web smoke tests for the screens that can run in a browser (sign-in flow and
 * the dev design gallery). The signed-in app needs SQLCipher and a backend, so
 * it is verified on device builds, not here.
 *
 *   npx playwright test            starts `expo start --web` on 8099 if needed
 */
const PORT = 8099;

export default defineConfig({
    testDir: './e2e',
    timeout: 90_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: `http://localhost:${PORT}`,
        deviceScaleFactor: 2,
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'iphone-light', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, colorScheme: 'light' } },
        { name: 'android-dark', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, colorScheme: 'dark' } },
    ],
    webServer: {
        command: `npx expo start --web --port ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 240_000,
        env: { CI: '1', BROWSER: 'none' },
    },
});
