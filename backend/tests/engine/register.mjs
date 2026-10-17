// Swaps the phone-only modules for Node stand-ins so the real E2EE engine can run in tests.
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mock = (file) => ({ url: pathToFileURL(path.join(here, 'mocks', file)).href, shortCircuit: true });

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === 'expo-sqlite') return mock('expo-sqlite.js');
        if (specifier === 'expo-secure-store') return mock('expo-secure-store.js');
        // The engine's API calls, with a per-phone access token instead of the app's single stored one.
        if (/(^|\/)AuthService$/.test(specifier) && String(context.parentURL || '').includes('/services/e2ee/')) return mock('AuthService.js');
        return nextResolve(specifier, context);
    },
});
