const mongoose = require('mongoose');

// One row per signed-in device. An access token is only accepted while its session row
// exists, so logout and password reset revoke tokens before they expire.
const sessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        // SHA-256 of the current refresh token. Each refresh replaces it (rotation).
        refreshTokenHash: {
            type: String,
            required: true,
        },
        // The token it replaced, accepted only for a short grace period in case the
        // client never received the rotated one. Any other old token means theft.
        previousRefreshTokenHash: {
            type: String,
            default: null,
        },
        rotatedAt: {
            type: Date,
            default: null,
        },
        // Pushed forward on each refresh: a device that stays away this long is signed out.
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

// MongoDB removes expired sessions on its own.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
