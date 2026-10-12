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

### App build settings

Set these in `eas.json` (`build.<profile>.env`):

- `EXPO_PUBLIC_API_URL`: the API origin, e.g. `https://talknow-nd2i.onrender.com`
- `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL`: public `https://` pages for the privacy policy and terms of use. The app stores require both; they are linked from signup and Settings.

Push notifications need, once per project: an Apple Push key (EAS sets it up during `eas build` for iOS) and FCM V1 credentials for Android (`eas credentials`, plus `google-services.json` referenced from `android.googleServicesFile` in `app.json`). Without them the app works but no pushes arrive.

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

### End-to-end tests

`npm run test:e2e` boots the backend against a throwaway database and checks auth, sessions, refresh tokens, the WebSocket, images, block/report, push payloads, account deletion and rate limits. Point `TEST_MONGO_URL` at a MongoDB you can write to (default `mongodb://127.0.0.1:27017`); the test database is dropped at the end.

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
