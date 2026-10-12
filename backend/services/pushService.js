const Session = require('../models/session');

// Push notifications through Expo's push service (it forwards to APNs and FCM).
// Pushes never include message text: Apple and Google relay them, and once messages are
// end-to-end encrypted the server can't read them anyway.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[\w-]+\]$/;

const isExpoPushToken = (value) => typeof value === 'string' && EXPO_TOKEN_RE.test(value);

const sendToExpo = async (messages) => {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

    const response = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
    if (!response.ok) throw new Error(`Expo push failed with HTTP ${response.status}`);
    const body = await response.json();
    return Array.isArray(body?.data) ? body.data : [];
};

/**
 * Sends a notification to every device the user is signed in on.
 * `data.type` tells the app where to go when it is tapped.
 */
const pushToUser = async (userId, { title, body, data }) => {
    const sessions = await Session.find({ userId, pushToken: { $ne: null }, expiresAt: { $gt: new Date() } })
        .select('pushToken')
        .lean();
    const tokens = [...new Set(sessions.map((s) => s.pushToken).filter(isExpoPushToken))];
    if (tokens.length === 0) return;

    const tickets = await sendToExpo(
        tokens.map((to) => ({ to, title, body, data, sound: 'default', channelId: 'default', priority: 'high' }))
    );

    // Forget tokens of uninstalled apps.
    const dead = tokens.filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered');
    if (dead.length > 0) {
        await Session.updateMany({ pushToken: { $in: dead } }, { $set: { pushToken: null } });
    }
};

// Fire-and-forget: a failed push must never fail the request that triggered it.
const notifyUser = (userId, notification) => {
    pushToUser(userId, notification).catch((err) => console.error('Push failed:', err.message));
};

module.exports = { isExpoPushToken, pushToUser, notifyUser };
