# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## Auth + backend setup

This repo includes an Express + MongoDB backend in `backend/`.

### Required environment variables

- `MONGO_URI` (optional; defaults to `mongodb://localhost:27017/productiv`)
- `JWT_SECRET` (required in production; used to sign/verify auth tokens)
- `BREVO_API_KEY` (required to send OTP emails)
- `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` (optional)
- `PUBLIC_BASE_URL` (optional; public origin used in image URLs, defaults to the request's host)
- `REPORTS_EMAIL` (recommended; user reports are emailed here so they can be reviewed quickly)
- `EXPO_ACCESS_TOKEN` (optional; only if push security is enabled for the Expo project)
- `CORS_ORIGINS` (optional; comma-separated browser origins allowed in production; the mobile app doesn't need it)
- `MIN_APP_VERSION` (optional, default `1.1.0`; older apps send plain text, which the server refuses, and are shown an "update TalkNow" screen)

### App build settings

Set these in `eas.json` (`build.<profile>.env`):

- `EXPO_PUBLIC_API_URL`: the API origin, e.g. `https://talknow-nd2i.onrender.com`
- `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL`: public `https://` pages for the privacy policy and terms of use. The app stores require both; they are linked from signup and Settings.

Push notifications need, once per project: an Apple Push key (EAS sets it up during `eas build` for iOS) and FCM V1 credentials for Android (`eas credentials`, plus `google-services.json` referenced from `android.googleServicesFile` in `app.json`). Without them the app works but no pushes arrive.

### End-to-end encryption

Messages are end-to-end encrypted with the Signal protocol design: X3DH to start a session and the Double Ratchet for every message after that, so a phone's current keys can't decrypt earlier messages (forward secrecy). Only the two phones in a chat can read it. The server, its database, backups, logs and push providers only ever see ciphertext. Metadata is not hidden: who talks to whom, when, roughly how long a message is, and IP addresses.

- **Crypto code** (`services/crypto/`): X3DH and the Double Ratchet, written to Signal's published specifications on the audited `@noble` libraries (X25519, Ed25519, HKDF-SHA256, HMAC-SHA256, ChaCha20-Poly1305). It is pure TypeScript, so the same code runs on Hermes and in Node tests. The protocol code itself has not had an independent audit: get one before advertising the encryption publicly.
- **Keys:** each install has an identity key pair, a signed prekey (rotated every 30 days) and 100 one-time prekeys (topped up below 20). Private keys never leave the phone. Public parts are published through `/api/keys`. Each one-time prekey is handed out once, in an atomic operation, and only to accepted connections.
- **On the phone** (`services/e2ee/`): decrypted messages, sessions and keys are kept in an encrypted SQLite database (SQLCipher via `expo-sqlite`). Its random key, and the identity private keys, are kept in SecureStore (Keychain / Keystore, this device only). Android backups are turned off for the same reason. SQLCipher needs a development or production build (`eas build`); Expo Go can't run it.
- **On the server:** a message is stored as an opaque envelope until the recipient's phone acknowledges it; then the ciphertext is deleted and only metadata (delivered/read times) remains. Phones drain `GET /api/auth/messages/pending` after each reconnect.
- **Safety numbers:** the lock icon in a chat opens a 60-digit safety number and a QR code. Comparing them, or scanning the contact's code, marks the contact verified. If a verified contact's key changes (reinstall or new phone), sending pauses until the user acknowledges the change.
- **Repair:** a message that can't be decrypted shows a notice. Its sender is asked to start a fresh session and send it again, and the re-send replaces the notice.
- **Single device:** an account's messages are encrypted to its most recent install. Signing in on another phone publishes new keys, and contacts see a security code change.
- **Transition:** messages saved as plain text by older versions are imported into the phone's encrypted store when a chat is opened. Once everyone is on 1.1.0 or later, delete them from the server with `npm run purge:plaintext` (a dry run; add `-- --confirm` to delete).

Apple export compliance: `ios.config.usesNonExemptEncryption` is now `true`, so App Store Connect asks export questions on upload. A messaging app using standard algorithms usually qualifies for the mass-market exemption, but check the current US export (EAR) rules, including any annual self-classification report. The privacy policy should say that message content is end-to-end encrypted and metadata is not.

### Images

Avatars and hero backgrounds are stored in the `media` collection and served from `GET /api/media/:id`; profiles store only the URL. To move images saved inside user documents by older versions, run once:

```bash
PUBLIC_BASE_URL=https://<your-api-host> MONGO_URI=<uri> npm run migrate:images
```

### Pointing the app to the API

Set `EXPO_PUBLIC_API_URL` to either:

- a server base URL (recommended): `http://<host>:8080` (the app will call `/api/auth/...`), or
- the full auth base: `http://<host>:8080/api/auth`

For a deployed backend (e.g. Render), use HTTPS, for example:

- `https://<your-service>.onrender.com`
- `https://<your-service>.onrender.com/api/auth`

### WebSocket (optional)

The backend also exposes a WebSocket endpoint at `/ws` (same domain/port as HTTP).

- If you set `EXPO_PUBLIC_WS_URL`, the app will use it directly (example: `wss://<your-service>.onrender.com/ws`).
- Otherwise the app derives it automatically from `EXPO_PUBLIC_API_URL`.

### Running the backend

From the repo root:

```bash
npm run backend
```

Or equivalently:

```bash
node server.js
```

### Tests

- `npm run test:crypto`: protocol tests for the encryption code (no database needed).
- `npm run test:engine`: two phones running the app's real encryption engine against the real backend: live and offline delivery, receipts, session repair, reinstall and safety numbers. Needs `TEST_MONGO_URL` like the test below.

`npm run test:e2e` boots the backend against a throwaway database and checks auth, sessions, refresh tokens, the WebSocket, encrypted messaging and key bundles, images, block/report, push payloads, account deletion and rate limits. Point `TEST_MONGO_URL` at a MongoDB you can write to (default `mongodb://127.0.0.1:27017`); the test database is dropped at the end.

### Testing password reset locally

If you want to test the forgot/reset password flow without waiting for email delivery, you can run:

```bash
node test-password-reset.js <email> <newPassword> [apiBase]
```

This calls the HTTP endpoints and asks for the code. Codes are stored hashed, so take it from the email, or from the backend log when `BREVO_API_KEY` is not set.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses React Navigation.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
