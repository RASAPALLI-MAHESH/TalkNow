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

### Testing password reset locally

If you want to test the forgot/reset password flow without waiting for email delivery, you can run:

```bash
node test-password-reset.js <email> <newPassword> [apiBase]
```

This calls the HTTP endpoints and reads the generated OTP from MongoDB for local testing.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses React Navigation.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
