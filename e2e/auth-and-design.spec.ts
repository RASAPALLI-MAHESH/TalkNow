import { expect, test, type Page } from '@playwright/test';

/* The only console noise allowed on web: the version check is refused by the API's CORS policy. */
const collectErrors = (page: Page) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (/CORS policy|ERR_FAILED|Failed to load resource/i.test(text)) return;
        errors.push(text);
    });
    return errors;
};

const openApp = async (page: Page, hash = '') => {
    await page.goto(`/${hash}`, { waitUntil: 'networkidle' });
};

test.describe('sign-in flow', () => {
    test('login renders once, with its button disabled until both fields are filled', async ({ page }) => {
        const errors = collectErrors(page);
        await openApp(page);

        // One heading: the old native header title ("Login") is gone, and the bar's inline copy is hidden from assistive tech.
        await expect(page.getByRole('heading')).toHaveCount(1);
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        const login = page.getByTestId('login-submit');
        await expect(login).toHaveAttribute('aria-disabled', 'true');

        await page.getByTestId('login-username').fill('someone');
        await page.getByTestId('login-password').fill('secret');
        await expect(login).not.toHaveAttribute('aria-disabled', 'true');

        expect(errors).toEqual([]);
    });

    test('password visibility can be toggled', async ({ page }) => {
        await openApp(page);
        const password = page.getByTestId('login-password');
        await password.fill('secret');
        await expect(password).toHaveAttribute('type', 'password');
        await page.getByRole('button', { name: 'Show password' }).click();
        await expect(password).not.toHaveAttribute('type', 'password');
    });

    test('sign up shows step 1 of 4, validates email, and goes back', async ({ page }) => {
        const errors = collectErrors(page);
        await openApp(page);
        await page.getByRole('link', { name: 'Sign Up' }).click();

        await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
        await expect(page.getByRole('progressbar', { name: 'Step 1 of 4' })).toBeVisible();

        await page.getByTestId('signup-name').fill('Aarav');
        await page.getByTestId('signup-email').fill('not-an-email');
        await page.getByTestId('signup-name').click(); // blur the email field
        await expect(page.getByText('Enter a valid email address.')).toBeVisible();
        await expect(page.getByTestId('signup-submit')).toHaveAttribute('aria-disabled', 'true');

        await page.getByTestId('signup-email').fill('aarav@example.com');
        await expect(page.getByTestId('signup-submit')).not.toHaveAttribute('aria-disabled', 'true');

        await page.getByTestId('nav-back').click();
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        expect(errors).toEqual([]);
    });

    test('forgot password opens and validates', async ({ page }) => {
        await openApp(page);
        await page.getByRole('link', { name: 'Forgot Password?' }).click();
        await expect(page.getByRole('heading', { name: 'Forgot Password' })).toBeVisible();
        await expect(page.getByTestId('forgot-submit')).toHaveAttribute('aria-disabled', 'true');
        await page.getByTestId('forgot-email').fill('me@example.com');
        await expect(page.getByTestId('forgot-submit')).not.toHaveAttribute('aria-disabled', 'true');
    });

    test('the ground follows the system appearance', async ({ page }, testInfo) => {
        await openApp(page);
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        const dark = testInfo.project.use.colorScheme === 'dark';
        // A full-screen view with the theme ground: #f8f5ff light, #0f0c19 dark.
        const grounds = await page.evaluate(() =>
            Array.from(document.querySelectorAll('div'))
                .filter((d) => d.getBoundingClientRect().width >= window.innerWidth && d.getBoundingClientRect().height >= window.innerHeight)
                .map((d) => getComputedStyle(d).backgroundColor)
        );
        expect(grounds).toContain(dark ? 'rgb(15, 12, 25)' : 'rgb(248, 245, 255)');
    });
});

test.describe('design gallery (dev only)', () => {
    for (const scene of ['chats', 'chat', 'settings', 'controls']) {
        test(`${scene} scene renders without runtime errors`, async ({ page }) => {
            const errors = collectErrors(page);
            await openApp(page, `#gallery-${scene}`);
            await page.waitForTimeout(800);
            await expect(page.locator('body')).not.toBeEmpty();
            expect(errors).toEqual([]);
        });
    }

    test('segmented control switches the chats list', async ({ page }) => {
        await openApp(page, '#gallery-chats');
        await expect(page.getByText('Aarav')).toBeVisible();
        await page.getByRole('tab', { name: 'Users' }).click();
        await expect(page.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByText('Ananya')).toBeVisible();
    });
});
